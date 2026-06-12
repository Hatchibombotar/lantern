import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { simpleGit, SimpleGitProgressEvent } from 'simple-git';
import { createGlobalStorageDirectory } from './utils';
import { existsSync } from 'fs';
import { filePathsEqual, FileTypes, ParsedProject, parseProject } from './analysis/parseProject';
import { Node, ProjectFile } from './domainViewer/createFolderStructure';
import { getFilesForEntity } from './domainViewer/createFolderStructure';
import { getReferencedEntitySymbols, selectRenamedSymbols, Symbol, SymbolType, SymbolValue } from './analysis/symbols';
import { Importer } from './importer';

// export default function registerVanillaDataCommands(context: vscode.ExtensionContext) {
//     context.subscriptions.push(
//         vscode.commands.registerCommand("bedrockLantern.vanillaDataTest", async (element: vscode.TreeItem) => {

//             const samplesFolderPath = await selectVanillaDataSource(context)
//             if (samplesFolderPath === undefined) {
//                 return []
//             }

//             const parsedProject = parseProject(
//                 path.join(samplesFolderPath, "resource_pack"),
//                 path.join(samplesFolderPath, "behavior_pack"),
//             )
//             if (parsedProject === undefined) {
//                 vscode.window.showErrorMessage("Unexpected Error")
//                 return []
//             }

//             const importType = await vscode.window.showQuickPick(["item", "entity"], {
//                 title: "What would you like to import into your project?"
//             })
//             if (importType === undefined) return
//             if (importType === "entity") {
//                 importEntityFromProject(
//                     parsedProject,
//                     samplesFolderPath,
//                 )

//             } else if (importType === "item") {
//                 const itemId = await vscode.window.showQuickPick(Object.keys(parsedProject.bp_items), {
//                     title: "What would you like to import into your project?"
//                 })
//                 if (itemId === undefined) return
//             }
//         })
//     )
// }

export default function registerImportEntityFromVanillaData(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.importVanillaEntity", async (element: vscode.TreeItem) => {

        const meta = (element as any)?.__meta as (Node) || undefined;

        let folderPath
        if (meta?.type === "folder") {
            folderPath = "." + meta.path
        }


        const samplesFolderPath = await selectVanillaDataSource(context)
        if (samplesFolderPath === undefined) {
            return []
        }

        const parsedProject = parseProject(
            path.join(samplesFolderPath, "resource_pack"),
            path.join(samplesFolderPath, "behavior_pack"),
        )
        if (parsedProject === undefined) {
            vscode.window.showErrorMessage("Unexpected Error")
            return []
        }

        await importEntityFromProject(
            parsedProject,
            folderPath
        )

    })
}

// TODO: reorganise: do we need both selectVanillaDataSource and selectVanillaPacksBranch
async function selectVanillaDataSource(context: vscode.ExtensionContext) {
    const globalStoragePath = await createGlobalStorageDirectory(context)

    const branch = await selectVanillaPacksBranch(globalStoragePath)
    if (branch === undefined) return

    const samplesFolderPath = path.join(globalStoragePath, "bedrock-samples", branch)

    return samplesFolderPath
}

/*
1. Select entity
2. Rename identifier
3. Rename symbols
4. Rename files
*/
async function importEntityFromProject(importProject: ParsedProject, folderPath?: string) {
    // 1. Select entity
    const entityId = await vscode.window.showQuickPick(Object.keys(importProject.bp_entity), {
        title: "What would you like to import into your project?"
    })
    if (entityId === undefined) return

    const identifierMap = Object.fromEntries([
        [entityId, entityId]
    ])

    // 2. Rename identifier
    // TODO: Add automatic namespace taken from the 'namespace' key in project config.
    const newIdentifiers = await selectRenameIdentifiers(identifierMap)
    if (newIdentifiers === undefined) return

    const newIdentifier = newIdentifiers[entityId]

    const symbols = getReferencedEntitySymbols(importProject, entityId)
    if (symbols === undefined) return

    // 3. Rename symbols
    const initialRenamedSymbols: [Symbol, SymbolValue][] = [
        [{ type: SymbolType.EntityIdentifer, value: entityId }, newIdentifier]
    ]

    const originalName = entityId.split(":")[1]
    const newNamespace = newIdentifier.split(":")[0]
    const newName = newIdentifier.split(":")[1]

    for (const symbol of symbols) {
        switch (symbol.type) {
            case SymbolType.BPAnimation:
            case SymbolType.RPAnimation: {
                const splitName = symbol.value.split(".")
                if (splitName[1] === originalName) {
                    const newSymbolValue = [splitName[0], newNamespace, newName, ...splitName.slice(2)].join(".")
                    initialRenamedSymbols.push(
                        [symbol, newSymbolValue]
                    )
                }
                break;
            }
            case SymbolType.RPRenderController:
            case SymbolType.BPAnimationController:
            case SymbolType.RPAnimationController: {
                const splitName = symbol.value.split(".")
                if (splitName[2] === originalName) {
                    const newSymbolValue = [splitName[0], splitName[1], newNamespace, newName, ...splitName.slice(3)].join(".")
                    initialRenamedSymbols.push(
                        [symbol, newSymbolValue]
                    )
                }
                break;
            }
        }
    }

    const renamedSymbols = await selectRenamedSymbols(symbols, initialRenamedSymbols)
    if (renamedSymbols === undefined) return

    const files = getFilesForEntity(importProject, entityId)

    // 4. Rename files
    const initialRenamedFiles: [ProjectFile, string][] = []

    for (const file of files) {
        
        const { dir, base } = path.parse(file.path.relativePath)

        const splitBase = base.split(".")
        if (splitBase[0] === originalName) {
            splitBase[0] = newName
        }

        const newFileBase = splitBase.join(".")

        switch (file.fileType) {
            case FileTypes.bp_entity: {
                if (folderPath) {
                    const newPath = path.join("entities", folderPath, newFileBase)
                    initialRenamedFiles.push(
                        [
                            file,
                            newPath
                        ]
                    )
                }
                break;
            }
            case FileTypes.rp_entity: {
                if (folderPath) {
                    const newPath = path.join("entity", folderPath, newFileBase)
                    initialRenamedFiles.push(
                        [
                            file,
                            newPath
                        ]
                    )
                }
                break;
            }
            case FileTypes.rp_animation:
            case FileTypes.bp_animation:
            case FileTypes.rp_animation_controllers:
            case FileTypes.bp_animation_controllers:
            case FileTypes.rp_render_controllers: {
                const newPath = path.join(dir, newFileBase)
                initialRenamedFiles.push(
                    [
                        file,
                        newPath
                    ]
                )
                break;
            }
            case FileTypes.bp_items: {
                if (folderPath) {
                    const newPath = path.join("items", folderPath, newFileBase)
                    initialRenamedFiles.push(
                        [
                            file,
                            newPath
                        ]
                    )
                }
                break;
            }
            case FileTypes.rp_attachable: {
                if (folderPath) {
                    const newPath = path.join("attachables", folderPath, newFileBase)
                    initialRenamedFiles.push(
                        [
                            file,
                            newPath
                        ]
                    )
                }
                break;
            }
        }
    }

    const renamedFiles = await selectRenameFiles(
        files,
        initialRenamedFiles
    )
    if (renamedFiles === undefined) return

    const importer = new Importer(
        importProject,
        symbols,
        renamedSymbols,
        renamedFiles.map(([file, newPath]) => [file.path, newPath]),
    )
    try {
        await importer.importSymbolsFromProject()
    } catch (err) {
        vscode.window.showErrorMessage(new Error(err as any).message)
        vscode.window.showErrorMessage("An error occured when trying to import.")
        console.error(err)
    }
}

// Returns a map from the original path to the new path. (Both relative to their RP/BP folder.)
async function selectRenameFiles(files: ProjectFile[], initialRenamed?: [ProjectFile, string][]): Promise<undefined | [ProjectFile, string][]> {
    interface QuickPickItem extends vscode.QuickPickItem {
        data?: ProjectFile
        index?: number
    }

    // const renames: [ProjectFile, string][] = files.map(x => [x, x.path.relativePath])

    const renames: [ProjectFile, string][] = files.map(x => {
        const alreadyRenamedFile = initialRenamed?.find((([y]) => filePathsEqual(x.path, y.path) && x.fileType === y.fileType))

        if (alreadyRenamedFile !== undefined) {
            return [x, alreadyRenamedFile[1]]
        }
        return [x, x.path.relativePath]
    })


    while (true) {
        const options: QuickPickItem[] = [
            { label: "Continue" },
            { label: "identifiers", kind: vscode.QuickPickItemKind.Separator },
        ]
        for (const [index, file] of files.entries()) {
            const option: QuickPickItem = {
                description: file.path.rootType + "\\" + file.path.relativePath,
                data: file,
                index,
                label: file.path.rootType + "\\" + renames[index][1]
            }
            options.push(option)
        }
        const result = await vscode.window.showQuickPick(options, {
            title: "Rename files",
            // TODO: add validation; make sure it is located within correct dir.
        })

        if (result === undefined) {
            return undefined
        }

        if (result.index === undefined) {
            break
        }

        if (result.data === undefined) {
            break
        }

        const prefix = result.data.path.rootType + "\\"
        const initialValue = prefix + result.data.path.relativePath
        const newPath = await vscode.window.showInputBox({
            placeHolder: initialValue,
            value: initialValue,
            prompt: `Rename ${result.data.path.relativePath}`,
            validateInput(value) {
                if (!value.startsWith(prefix)) {
                    return "path must start with " + prefix
                }

                const newRelativePath = value.slice(prefix.length)
                // TODO: show error if file already exists.
            }
        })

        if (newPath !== undefined) {
            renames[result.index][1] = newPath.slice(prefix.length)
        }
    }
    return renames
}


async function selectRenameIdentifiers(identifierMap: Record<string, string>): Promise<undefined | Record<string, string>> {
    interface QuickPickItem extends vscode.QuickPickItem {
        identifierToRename?: string
    }
    while (true) {
        const options: QuickPickItem[] = [
            { label: "Continue" },
            { label: "identifiers", kind: vscode.QuickPickItemKind.Separator },
        ]
        for (const [k, v] of Object.entries(identifierMap)) {
            const option: QuickPickItem = {
                label: v
            }

            if (k === v) {
                option.description = "Unchanged"
            } else {
                option.description = `(${k})`
            }
            option.identifierToRename = k
            options.push(option)
        }
        const result = await vscode.window.showQuickPick(options, {
            title: "Rename identifiers",
        })

        if (result === undefined) {
            return undefined
        }
        if (result.identifierToRename === undefined) {
            return identifierMap
        }

        const newIdentifier = await vscode.window.showInputBox({
            placeHolder: identifierMap[result.identifierToRename],
            validateInput(value) {
                if (value.split(":").length !== 2) {
                    return "identifier must include a ':' e.g. namespace:entity"
                } else if (value.split(":").some(x => x.length === 0)) {
                    return "identifier must be formatted correctly e.g. namespace:entity"
                } else if (value.includes(" ")) {
                    return "identifier must not include spaces."
                }
            },
        })

        if (newIdentifier !== undefined) {
            identifierMap[result.identifierToRename] = newIdentifier
        }
    }
}

async function selectVanillaPacksBranch(globalStoragePath: string): Promise<"preview" | "main" | undefined> {
    const options = [
        {
            label: "stable",
            detail: await (async () => {
                const commit = await getLatestCommitsFrom(globalStoragePath, "main")
                if (commit === null) {
                    return undefined
                }
                return `${commit.message} - ${commit.hash.slice(0, 7)}`
            })(),
            value: "stable"
        },
        {
            label: "preview",
            detail: await (async () => {
                const commit = await getLatestCommitsFrom(globalStoragePath, "preview")
                if (commit === null) {
                    return undefined
                }
                return `${commit.message} - ${commit.hash.slice(0, 7)}`
            })(),
            value: "preview"
        },
        {
            label: "Update Vanilla Packs",
            value: "update"
        },
        {
            label: "Remove Vanilla Packs",
            value: "delete"
        }
    ]
    const result = await vscode.window.showQuickPick(options, {
        placeHolder: 'version',
    });
    if (result === undefined) return

    if (result.value === "stable") {
        const exists = await checkForVanillaPack(globalStoragePath, "main")
        if (exists) {
            return "main"
        } else {
            return undefined
        }
    } else if (result.value === "preview") {
        const exists = await checkForVanillaPack(globalStoragePath, "preview")
        if (exists) {
            return "preview"
        } else {
            return undefined
        }
    } else if (result.value === "update") {
        const result = await vscode.window.showQuickPick(["stable", "preview"], {
            placeHolder: 'version',
        });
        if (result === undefined) return
        if (result === "preview" || result === "stable") {
            // await checkForVanillaPack(globalStoragePath, result)

            const branch = result === "stable" ? "main" : "preview"

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Updating repository',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0 });

                    const folderPath = path.join(globalStoragePath, "bedrock-samples", branch)

                    await fetchGithubRepo(
                        vanillaPacksRepo,
                        branch,
                        folderPath,
                        (data) => {
                            const per = data.processed / data.total
                            progress.report({ increment: per, message: `(${data.processed}/${data.total})` });
                        }
                    )
                    progress.report({ increment: 100 });
                }
            )
        }

        return undefined
    } else if (result.value === "delete") {
        const result = await vscode.window.showQuickPick(["stable", "preview"], {
            placeHolder: 'version',
        });
        if (result === undefined) return
        if (result === "preview" || result === "stable") {
            // await checkForVanillaPack(globalStoragePath, result)

            const branch = result === "stable" ? "main" : "preview"

            const folderPath = path.join(globalStoragePath, "bedrock-samples", branch)

            if (existsSync(folderPath)) {
                await fs.rm(folderPath, {
                    recursive: true
                })
                vscode.window.showInformationMessage("Deleted.")
            } else {
                vscode.window.showErrorMessage("Folder you are trying to delete does not exist.")
            }

        }

        return undefined
    }
}

async function getLatestCommitsFrom(globalStoragePath: string, branch: "main" | "preview") {
    const folderPath = path.join(globalStoragePath, "bedrock-samples", branch)
    const git = simpleGit();

    if (!existsSync(folderPath)) {
        return null
    } else {
        const latestCommit = (await git.cwd(folderPath).log({ maxCount: 1 })).latest
        if (latestCommit === null) return null

        return latestCommit
    }
}

// If vanilla pack doesn't exist, show a UI and make it exist
// Returns true if vanilla packs exist, false if it doesn't
async function checkForVanillaPack(globalStoragePath: string, branch: "main" | "preview"): Promise<boolean> {
    const folderPath = path.join(globalStoragePath, "bedrock-samples", branch)

    const git = simpleGit();

    if (existsSync(folderPath)) {
        const latestCommit = (await git.cwd(folderPath).log({ maxCount: 1 })).latest
        vscode.window.showInformationMessage(latestCommit?.message ?? "")
        return true
    } else {
        const result = await vscode.window.showQuickPick(["download", "cancel"], {
            title: "You do not currently have the vanilla packs downloaded. Would you like to download them?"
        })

        if (result !== "download") return false

        await fs.mkdir(folderPath, {
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

                await fetchGithubRepo(
                    vanillaPacksRepo,
                    branch,
                    folderPath,
                    (data) => {
                        const per = data.processed / data.total
                        progress.report({ increment: per, message: `(${data.processed}/${data.total})` });
                    }
                )
                progress.report({ increment: 100 });
            }
        )
        return false
    }
}

const vanillaPacksRepo = "https://github.com/Mojang/bedrock-samples"
async function fetchGithubRepo(repoUrl: string, branch: string = 'main', clonePath: string, progressCallback: ((data: SimpleGitProgressEvent) => void)): Promise<string> {
    const git = simpleGit(undefined, {
        progress: (e) => {
            if (progressCallback !== undefined) {
                progressCallback(e)
            }
        }
    });
    try {
        try {
            await fs.access(clonePath);
            await git.cwd(clonePath).pull('origin', branch)
        } catch {
            await git.clone(repoUrl, clonePath, ["--depth", "1", "--single-branch", '--branch', branch])
        }

        vscode.window.showInformationMessage(`Successfully fetched to ${clonePath}`);
        return clonePath;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to fetch repo: ${errorMessage}`);
        throw error;
    }
}

async function updateGithubRepo(repoUrl: string, branch: string = 'main', clonePath: string, progressCallback: ((data: SimpleGitProgressEvent) => void)): Promise<string> {
    const git = simpleGit(undefined, {
        progress: (e) => {
            if (progressCallback !== undefined) {
                progressCallback(e)
            }
        }
    });
    try {
        await fs.access(clonePath);
        await git.cwd(clonePath).pull('origin', branch)

        vscode.window.showInformationMessage(`Successfully fetched to ${clonePath}`);
        return clonePath;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to fetch repo: ${errorMessage}`);
        vscode.window.showErrorMessage(`Try deleting repo and re-downloading?`);
        throw error;
    }
}