import fs from 'fs/promises';
import path from 'path';
import * as vscode from 'vscode';
import * as JSONC from 'jsonc-parser';
import { globSync } from 'fs';
import { showErrorInTextDocument } from '../utils';
import { ProjectParser } from '../analysis/ProjectParser';
import { Importer } from '../importer/Importer';
import { getIdentifierSymbols, getSymbolsLinkedByIdentifier, Symbol, symbolsEqual, SymbolValue } from '../analysis/symbols';
import { selectRenamedSymbols as showRenameSymbolsUI, showSelectFiles } from '../quickPickUtils';
import { selectRenameFiles } from '../quickPickUtils';
import { renameSymbolFromIdentifier } from '../importer/renameSymbols';
import { getDefinitionFileForSymbol } from '../domainViewer/createFolderStructure';
import { AddonFileTypes, ProjectFile } from '../analysis/AddonFileTypes';
import { renamePathFromNewSymbolValue } from '../importer/renamePaths';
import { filePathsEqual } from '../FilePathData';
import { getPathForSnippet, SnippetSourceMetaFile } from './snippetRepoManage';

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

        for (const identifier of identifiers) {
            const symbols: Symbol[] = getSymbolsLinkedByIdentifier(sourceProject, identifier)

            const newIdentifier = newIdentifiers.find(([k]) => symbolsEqual(k, identifier))?.[1] ?? identifier.value

            for (const symbol of symbols) {
                const newValue = renameSymbolFromIdentifier(symbol, identifier.value, newIdentifier)
                initialRenamedSymbols.push(
                    [symbol, newValue]
                )
                allSymbols.push(symbol)
            }
        }

        // UI: Rename symbols
        const renamedSymbols = await showRenameSymbolsUI(allSymbols, {}, initialRenamedSymbols)
        if (renamedSymbols === undefined) return

        const initialRenamedFiles: [ProjectFile, string][] = []

        const allKnownFiles: ProjectFile[] = []

        for (const symbol of allSymbols) {
            const files = getDefinitionFileForSymbol(sourceProject, symbol)
            for (const file of files) {
                // We save texture files seperately using the TexturePath symbol
                if (file.fileType === AddonFileTypes.rp_texture) {
                    continue
                }

                const newSymbolValue = renamedSymbols.find(([k]) => symbolsEqual(k, symbol))?.[1] ?? symbol.value
                const renamedPath = renamePathFromNewSymbolValue(file, symbol.type, symbol.value, newSymbolValue)

                initialRenamedFiles.push([
                    file, renamedPath
                ])

                allKnownFiles.push(file)
            }
        }

        // UI: Rename files
        const renamedFiles = await selectRenameFiles(
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

    let scriptFileCopyToDirName = path.dirname(metaPath).split(path.sep)?.at(-1) ?? "imported"
    let shouldImportScriptFiles = true

    const hasScriptFiles = sourceProject.script_files.length > 0

    if (hasScriptFiles) {
        // Decide what to do with script files
        while (true) {
            const result = await vscode.window.showQuickPick([
                { id: "import", label: "Import script files" },
                { id: "doNotImport", label: "Do not import script files" },
                { label: "Options", kind: vscode.QuickPickItemKind.Separator },
                { id: "changeCopyToDir", label: "Change folder to copy to", detail: `current: \`bp/scripts/${scriptFileCopyToDirName}/...\`` },
            ], {
                title: "Script File Import Options",
            })

            if (result === undefined) return

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
                if (newName === undefined) continue

                scriptFileCopyToDirName = newName
            }
        }
    }

    if (hasScriptFiles && shouldImportScriptFiles) {
        await importer.importScripts(scriptFileCopyToDirName)
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
            const additionalFilesToInclude = await showSelectFiles(extraFiles, { title: "Include untracked files" })

            if (additionalFilesToInclude === undefined) {
                return
            }
        }
    }

    await importer.applyFileChanges()
}