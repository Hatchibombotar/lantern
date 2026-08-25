import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import * as vscode from 'vscode';
import { createGlobalStorageDirectory, showErrorInTextDocument } from '../utils';
import { globSync } from 'fs';
import * as JSONC from 'jsonc-parser';
import { ProjectParser } from '../analysis/ProjectParser';
import { Importer } from '../importer/Importer';
import { getIdentifierSymbols, getReferencedBlockSymbols, getReferencedEntitySymbols, getReferencedItemSymbols, Symbol, symbolsEqual, SymbolType, SymbolValue } from '../analysis/symbols';
import { selectRenamedSymbols, showSelectFiles } from '../quickPickUtils';
import { selectRenameFiles } from '../quickPickUtils';
import { renameSymbolFromIdentifier } from '../importer/renameSymbols';
import { getAssetsForBlock, getAssetsForEntity, getAssetsForItem, getFilesForBlock, getFilesForEntity, getFilesForItem } from '../domainViewer/createFolderStructure';
import { ProjectFile } from '../analysis/AddonFileTypes';
import { renamePathFromIdentifier } from '../importer/renamePaths';
import { AddonFileTypes } from '../analysis/AddonFileTypes';
import { filePathsEqual } from '../FilePathData';

const uuidImport = import("uuid")

type SnippetSourceMetaFile = {
    name: string,
    tags: string[],
} & ({ type: "mcaddon" } |
{ type: "mcpack", archive_root: string, })

export default function registerSnippetSourceCommands(context: vscode.ExtensionContext) {
    async function addSnippetSource() {
        // Text input box
        // Fetch repo
        // If doesn't exist, show input box again
        // If does exist:
        // createGlobalStorageDirectory()
        // Pull into globalStorage/snippetSources/<repoName>
        const snippetSources = await readSnippetSources(context)

        const repoUrl = await vscode.window.showInputBox({
            title: "path",
            placeHolder: "https://github.com/username/repo"
        })

        if (repoUrl === undefined) {
            return
        }

        const uuid = (await uuidImport).v4()

        snippetSources.snippetSourceRepos.push({
            url: repoUrl,
            uuid: uuid,
        })

        try {
            await downloadSnippetSourceRepo(context, uuid, repoUrl)
            await writeSnippetSources(context, snippetSources)

            vscode.window.showInformationMessage(`Successfully downloaded snippet source`)
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to download snippet source`)
            vscode.window.showErrorMessage(String(err))
            console.error(err)

            await deleteSnippetSourceRepo(context, uuid)
        }
    }
    vscode.commands.registerCommand("bedrockLantern.addSnippetSource", addSnippetSource)

    async function deleteSnippetSources() {
        const snippetSources = await readSnippetSources(context)
        if (snippetSources.snippetSourceRepos.length === 0) {
            vscode.window.showInformationMessage("No snippet sources defined.")
            return
        }
        const result = await vscode.window.showQuickPick(snippetSources.snippetSourceRepos.map((x) => ({
            label: x.url,
            uuid: x.uuid,
        })), {
            canPickMany: true,
            title: "Delete snippet sources"
        })

        if (result === undefined) return

        const removeUuids = result.map(x => x.uuid)
        const snippetSourceRepos = []

        for (const x of snippetSources.snippetSourceRepos) {
            if (removeUuids.includes(x.uuid)) {
                await deleteSnippetSourceRepo(context, x.uuid)
                continue
            }
            snippetSourceRepos.push(x)
        }

        snippetSources.snippetSourceRepos = snippetSourceRepos

        vscode.window.showInformationMessage(`Removed ${removeUuids.length} snippet sources.`)
        await writeSnippetSources(context, snippetSources)
    }
    vscode.commands.registerCommand("bedrockLantern.deleteSnippetSources", deleteSnippetSources)

    async function importSnippet() {
        const snippetSources = await readSnippetSources(context)
        if (snippetSources.snippetSourceRepos.length === 0) {
            vscode.window.showInformationMessage("No snippet sources defined.")
            return
        }
        const snippetSourceRepo = await vscode.window.showQuickPick(snippetSources.snippetSourceRepos.map((x) => ({
            label: x.url,
            uuid: x.uuid,
        })), {
            title: "Import from Snippet Repository"
        })

        if (snippetSourceRepo === undefined) return
        const snippetSourceUuid = snippetSourceRepo.uuid
        const snippetSourcePath = await getPathForSnippet(context, snippetSourceUuid)

        const snippetMetaFiles = globSync("**/meta.json", {
            cwd: snippetSourcePath
        })

        const parsedSnippetFiles: [string, SnippetSourceMetaFile][] = []
        for (const snippetMetaFile of snippetMetaFiles) {
            const file = await fs.readFile(path.join(snippetSourcePath, snippetMetaFile))

            const parsedMetaFile = JSONC.parse(String(file)) as SnippetSourceMetaFile

            parsedSnippetFiles.push([snippetMetaFile, parsedMetaFile])
        }

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
            const newIdentifiers = await selectRenamedSymbols(identifiers)
            if (newIdentifiers === undefined) return

            const initialRenamedSymbols: [Symbol, SymbolValue][] = [...newIdentifiers]
            const allSymbols: Symbol[] = [...identifiers]

            for (const identifier of identifiers) {
                let symbols!: Symbol[]

                switch (identifier.type) {
                    case SymbolType.EntityIdentifier:
                        symbols = getReferencedEntitySymbols(sourceProject, identifier.value)
                        break
                    case SymbolType.BlockIdentifier:
                        symbols = getReferencedBlockSymbols(sourceProject, identifier.value)
                        break
                    case SymbolType.ItemIdentifier:
                        symbols = getReferencedItemSymbols(sourceProject, identifier.value)
                        break
                    default:
                        throw Error("Identifier type not handled correctly: " + identifier)
                }

                const newIdentifier = newIdentifiers.find(([k]) => symbolsEqual(k, identifier))?.[1] ?? identifier.value

                for (const symbol of symbols) {
                    const newValue = renameSymbolFromIdentifier(symbol, identifier.value, newIdentifier)
                    initialRenamedSymbols.push(
                        [symbol, newValue]
                    )
                    allSymbols.push(symbol)
                }
            }

            const renamedSymbols = await selectRenamedSymbols(allSymbols, initialRenamedSymbols)
            if (renamedSymbols === undefined) return

            const initialRenamedFiles: [ProjectFile, string][] = []

            const allKnownFiles: ProjectFile[] = []

            for (const identifier of identifiers) {
                let files!: ProjectFile[]
                const newIdentifier = newIdentifiers.find(([k]) => symbolsEqual(k, identifier))?.[1] ?? identifier.value

                switch (identifier.type) {
                    case SymbolType.EntityIdentifier:
                        files = getFilesForEntity(sourceProject, identifier.value)
                        files.push(...getAssetsForEntity(sourceProject, identifier.value).filter(x => x.fileType !== AddonFileTypes.rp_texture))
                        break
                    case SymbolType.BlockIdentifier:
                        files = getFilesForBlock(sourceProject, sourceProject.bp_blocks[identifier.value])
                        files.push(...getAssetsForBlock(sourceProject, sourceProject.bp_blocks[identifier.value]).filter(x => x.fileType !== AddonFileTypes.rp_texture))
                        break
                    case SymbolType.ItemIdentifier:
                        files = getFilesForItem(sourceProject, identifier.value)
                        files.push(...getAssetsForItem(sourceProject, identifier.value).filter(x => x.fileType !== AddonFileTypes.rp_texture))
                        break
                    default:
                        throw Error("Identifier type not handled correctly: " + identifier)
                }

                for (const file of files) {
                    const newPath = renamePathFromIdentifier(file, identifier.value, newIdentifier)
                    initialRenamedFiles.push([
                        file, newPath
                    ])

                    allKnownFiles.push(file)
                }
            }

            // TODO: Show all files using parser.getAllFiles()
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
                console.error(err)

                showErrorInTextDocument(
                    `# Something went wrong!
Please report the error on discord or at https://github.com/Hatchibombotar/lantern/issues

## Error
${String(err)}

## Stack Trace
${String(Error(err as any ?? "Unknown error")?.stack)}
`
                )
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
    }
    vscode.commands.registerCommand("bedrockLantern.importSnippet", importSnippet)
}

async function getPathForSnippet(context: vscode.ExtensionContext, uuid: string) {
    const globalStoragePath = await createGlobalStorageDirectory(context)
    const resultPath = path.join(globalStoragePath, "./snippetSources/" + uuid + "/")

    return resultPath
}

async function deleteSnippetSourceRepo(context: vscode.ExtensionContext, uuid: string) {
    const resultPath = await getPathForSnippet(context, uuid)

    fs.rm(resultPath, {
        recursive: true,
    })
}

async function downloadSnippetSourceRepo(context: vscode.ExtensionContext, uuid: string, url: string) {
    const resultPath = await getPathForSnippet(context, uuid)

    await fs.mkdir(resultPath, {
        recursive: true
    })

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching repository',
            cancellable: false
        },
        async (progress) => {
            progress.report({ increment: 0 });

            const git = simpleGit(resultPath, {
                progress: (data) => {
                    const per = data.processed / data.total
                    progress.report({ increment: per, message: `(${data.stage} ${data.processed}/${data.total})` });
                }
            })
            const branch = "main"
            await git.clone(url, resultPath, ["--depth", "1", "--single-branch", '--branch', branch])

            progress.report({ increment: 100 });
        }
    )
}

type SnippetSourceDefinition = {
    version: 0,
    snippetSourceRepos: {
        url: string,
        uuid: string
    }[]
}

// read/write globalStorage/snippetSources.json
async function readSnippetSources(context: vscode.ExtensionContext): Promise<SnippetSourceDefinition> {
    const uri = vscode.Uri.joinPath(context.globalStorageUri, "snippetSources.json")
    try {
        const content = await vscode.workspace.fs.readFile(uri)
        const parsedContent = JSON.parse(String(content))
        return parsedContent as SnippetSourceDefinition
    } catch (err) {
        console.error(err)
        return {
            version: 0,
            snippetSourceRepos: []
        }
    }
}

async function writeSnippetSources(context: vscode.ExtensionContext, data: SnippetSourceDefinition) {
    const uri = vscode.Uri.joinPath(context.globalStorageUri, "snippetSources.json")
    const content = Buffer.from(JSON.stringify(data), 'utf8')

    await vscode.workspace.fs.writeFile(uri, content)
}
