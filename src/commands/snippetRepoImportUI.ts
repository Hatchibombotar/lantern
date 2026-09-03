import fs from 'fs/promises';
import path from 'path';
import * as vscode from 'vscode';
import * as JSONC from 'jsonc-parser';
import { globSync } from 'fs';
import { showErrorInTextDocument } from '../utils';
import { ProjectParser } from '../analysis/ProjectParser';
import { Importer } from '../importer/Importer';
import { getIdentifierSymbols, getSymbolsLinkedByIdentifier, Symbol, symbolsEqual, SymbolValue } from '../analysis/symbols';
import { showRenameSymbolsUI, showSelectFilesUI } from '../quickPickUtils';
import { showRenameFilesUI } from '../quickPickUtils';
import { renameSymbolFromIdentifier } from '../importer/renameSymbols';
import { getDefinitionFilesForSymbol } from '../domainViewer/createFolderStructure';
import { AddonFileTypes, ProjectFile } from '../analysis/AddonFileTypes';
import { renamePathFromIdentifier } from '../importer/renamePaths';
import { filePathsEqual } from '../FilePathData';
import { getPathForSnippet, SnippetSourceMetaFile } from './snippetRepoManage';
import { ParsedProject } from '../analysis/ParsedProject';

export async function importSnippetUI(context: vscode.ExtensionContext, selectedRepoUUID: string) {
    const snippetSourcePath = await getPathForSnippet(context, selectedRepoUUID)
    const snippetMetaFiles = globSync("**/meta.json", {
        cwd: snippetSourcePath
    })

    const parsedSnippetFiles: [string, SnippetSourceMetaFile][] = []
    for (const snippetMetaFile of snippetMetaFiles) {
        const file = await fs.readFile(path.join(snippetSourcePath, snippetMetaFile))

        const parsedMetaFile = JSONC.parse(String(file)) as SnippetSourceMetaFile

        parsedSnippetFiles.push([snippetMetaFile, parsedMetaFile])
    }

    // UI: Pick snippet
    const snippet = await vscode.window.showQuickPick(parsedSnippetFiles.map(([metaPath, metaFile]) => ({
        label: metaFile.name,
        description: metaFile.tags.join(", "),
        metaPath, metaFile,
    })))

    if (snippet === undefined) return

    const { metaPath, metaFile } = snippet

    const snippetPath = path.join(snippetSourcePath, path.dirname(metaPath))

    const parser = new ProjectParser(
        path.join(snippetPath, "rp"),
        path.join(snippetPath, "bp"),
    )

    const sourceProject = parser.parseAll()

    const identifiers = getIdentifierSymbols(sourceProject)

    let importer!: Importer;

    if (identifiers.length > 0) {
        // UI: Rename identifiers
        const newIdentifiers = await showRenameSymbolsUI(identifiers, { title: "Rename Identifiers" })
        if (newIdentifiers === undefined) return

        const initialRenamedSymbols: [Symbol, SymbolValue][] = [...newIdentifiers]
        const allSymbols: Symbol[] = [...identifiers]

        const initialRenamedFiles: [ProjectFile, string][] = []
        const allKnownFiles: ProjectFile[] = []

        // Get all symbols and files referenced by the file each identifier is defined in
        for (const identifier of identifiers) {
            const symbols: Symbol[] = getSymbolsLinkedByIdentifier(sourceProject, identifier)

            const newIdentifier = newIdentifiers.find(([k]) => symbolsEqual(k, identifier))?.[1] ?? identifier.value

            for (const symbol of symbols) {
                const newValue = renameSymbolFromIdentifier(symbol, identifier.value, newIdentifier)
                initialRenamedSymbols.push(
                    [symbol, newValue]
                )
                allSymbols.push(symbol)

                const files = getDefinitionFilesForSymbol(sourceProject, symbol)
                for (const file of files) {
                    // We save texture files seperately using the TexturePath symbol
                    if (file.fileType === AddonFileTypes.rp_texture) {
                        continue
                    }

                    // Initially rename files if they include the old identifier value
                    const renamedPath = renamePathFromIdentifier(file, identifier.value, newIdentifier)

                    initialRenamedFiles.push([
                        file, renamedPath
                    ])

                    allKnownFiles.push(file)
                }
            }
        }

        // UI: Rename symbols
        const renamedSymbols = await showRenameSymbolsUI(allSymbols, {}, initialRenamedSymbols)
        if (renamedSymbols === undefined) return

        // UI: Rename files
        const renamedFiles = await showRenameFilesUI(
            allKnownFiles,
            initialRenamedFiles
        )
        if (renamedFiles === undefined) return

        importer = new Importer(
            parser,
            renamedSymbols,
            renamedFiles.map(([file, newPath]) => [file.path, newPath]),
        )

        console.log(allSymbols)

        try {
            await importer.importSymbolsFromProject(allSymbols)
        } catch (err) {
            await showErrorInTextDocument(err)
            return
        }
    } else {
        importer = new Importer(
            parser,
            [],
            []
        )
    }


    const hasScriptFiles = sourceProject.script_files.length > 0
    if (hasScriptFiles) {
        let scriptFileCopyToDirName = path.dirname(metaPath).split(path.sep)?.at(-1) ?? "imported"
        const scriptImportOptions = await getScriptFileImportOptions(sourceProject, scriptFileCopyToDirName)
        if (scriptImportOptions === undefined) return

        if (scriptImportOptions.shouldImport) {
            await importer.importScripts(scriptImportOptions.copyToDirName)
        }
    }

    // If we wanted to include files not caught by the importer
    const allFiles = parser.getAllFiles()

    const importedFiles = importer.importedFiles

    if (importedFiles.length !== allFiles.length) {
        const ignoreFiles: string[] = [
            "manifest.json",
            "pack_icon.png"
        ]

        const extraFiles = []
        for (const file of allFiles) {
            if (!importedFiles.find((knownFile) => filePathsEqual(knownFile, file))) {
                if (!ignoreFiles.includes(file.relativePath)) {
                    extraFiles.push(file)
                }
            }
        }

        if (extraFiles.length > 0) {
            const additionalFilesToInclude = await showSelectFilesUI(extraFiles, { title: "Include untracked files" })

            if (additionalFilesToInclude === undefined) {
                return
            }

            for (const file of additionalFilesToInclude) {
                importer.importFile(file)
            }

        }
    }

    await importer.applyFileChanges()
    vscode.window.showInformationMessage(`Snippet "${metaFile.name}" imported.`)
}

async function getScriptFileImportOptions(
    sourceProject: ParsedProject,
    defaultDirName: string
): Promise<{ shouldImport: boolean; copyToDirName: string } | undefined> {
    if (sourceProject.script_files.length === 0) {
        return { shouldImport: false, copyToDirName: defaultDirName }
    }

    let scriptFileCopyToDirName = defaultDirName
    let shouldImportScriptFiles = true

    while (true) {
        const result = await vscode.window.showQuickPick(
            [
                { id: "import", label: "Import script files" },
                { id: "doNotImport", label: "Do not import script files" },
                { label: "Options", kind: vscode.QuickPickItemKind.Separator },
                {
                    id: "changeCopyToDir",
                    label: "Change folder to copy to",
                    detail: `current: \`bp/scripts/${scriptFileCopyToDirName}/...\``
                }
            ],
            { title: "Script File Import Options" }
        )

        if (result === undefined) return undefined

        if (result.id === "import") {
            shouldImportScriptFiles = true
            break
        } else if (result.id === "doNotImport") {
            shouldImportScriptFiles = false
            break
        } else if (result.id === "changeCopyToDir") {
            const newName = await vscode.window.showInputBox({
                title: "Change script result directory name",
                placeHolder: scriptFileCopyToDirName,
                validateInput: (str) => {
                    if (!str.match(/[a-z\-\_\. ]/)) {
                        return "invalid dirname. Allowed Characters: a-z, -, _"
                    }
                }
            })
            if (newName !== undefined) {
                scriptFileCopyToDirName = newName
            }
        }
    }

    return { shouldImport: shouldImportScriptFiles, copyToDirName: scriptFileCopyToDirName }
}