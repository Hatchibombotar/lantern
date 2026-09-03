import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { simpleGit, SimpleGitProgressEvent } from 'simple-git';
import { createGlobalStorageDirectory } from '../utils';
import { existsSync } from 'fs';
import { AddonFileTypes } from '../analysis/AddonFileTypes';
import { getDefinitionFilesForSymbol, Node } from '../domainViewer/createFolderStructure';
import { ProjectFile } from '../analysis/AddonFileTypes';
import { getSymbolsLinkedByIdentifier, Symbol, symbolsEqual, SymbolType, SymbolValue } from '../analysis/symbols';
import { showRenameSymbolsUI } from '../quickPickUtils';
import { Importer } from '../importer/Importer';
import { ProjectParser } from '../analysis/ProjectParser';
import { showRenameFilesUI } from '../quickPickUtils';
import { renameSymbolFromIdentifier } from '../importer/renameSymbols';
import { renamePathFromIdentifier } from '../importer/renamePaths';

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

        const parser = new ProjectParser(
            path.join(samplesFolderPath, "resource_pack"),
            path.join(samplesFolderPath, "behavior_pack"),
        )
        // const parsedProject = parser.parseAll()
        // if (parsedProject === undefined) {
        //     vscode.window.showErrorMessage("Unexpected Error")
        //     return []
        // }

        await importEntityFromProject(
            parser,
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
async function importEntityFromProject(projectParser: ProjectParser, folderPath?: string) {
    const sourceProject = projectParser.parseAll()

    // 1. Select entity
    const entityId = await vscode.window.showQuickPick(Object.keys(sourceProject.bp_entity), {
        title: "What would you like to import into your project?"
    })
    if (entityId === undefined) return

    const identifier = { type: SymbolType.EntityIdentifier, value: entityId }

    // 2. Rename identifier
    const newIdentifiers = await showRenameSymbolsUI(
        [ identifier ],
        {
            title: "Rename identifiers"
        }
    )
    if (newIdentifiers === undefined) return

    const newIdentifier = newIdentifiers.find(([k]) => symbolsEqual(k, identifier))?.[1] ?? identifier.value

    const symbols = getSymbolsLinkedByIdentifier(sourceProject, identifier)
    if (symbols === undefined) return

    // 3. Rename symbols
    const initialRenamedSymbols: [Symbol, SymbolValue][] = [
        [identifier, newIdentifier]
    ]

    for (const symbol of symbols) {
        const newSymbolValue = renameSymbolFromIdentifier(symbol, identifier.value, newIdentifier)
        initialRenamedSymbols.push(
            [symbol, newSymbolValue]
        )
    }

    const renamedSymbols = await showRenameSymbolsUI(symbols, {}, initialRenamedSymbols)
    if (renamedSymbols === undefined) return

    // 4. Rename files
    const files = getDefinitionFilesForSymbol(sourceProject, identifier)
    const initialRenamedFiles: [ProjectFile, string][] = []

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

    }

    const renamedFiles = await showRenameFilesUI(
        files,
        initialRenamedFiles
    )
    if (renamedFiles === undefined) return

    const importer = new Importer(
        projectParser,
        renamedSymbols,
        renamedFiles.map(([file, newPath]) => [file.path, newPath]),
    )
    try {
        await importer.importSymbolsFromProject(symbols)
        await importer.applyFileChanges()
    } catch (err) {
        vscode.window.showErrorMessage(new Error(err as any).message)
        vscode.window.showErrorMessage("An error occured when trying to import.")
        console.error(err)
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