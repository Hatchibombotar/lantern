import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import * as vscode from 'vscode';
import { createGlobalStorageDirectory } from '../utils';

const uuidImport = import("uuid")

export type SnippetSourceMetaFile = {
    name: string,
    tags: string[],
} & ({ type: "mcaddon" } |
{ type: "mcpack", archive_root: string, })

export type SnippetSourceDefinition = {
    version: 0,
    snippetSourceRepos: {
        url: string,
        uuid: string
    }[]
}

export async function addSnippetSource(context: vscode.ExtensionContext) {
    const snippetSources = await readSnippetSources(context)

    const repoUrl = await vscode.window.showInputBox({
        title: "Add Snippet Repository",
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

export async function deleteSnippetSourceRepo(context: vscode.ExtensionContext, uuid: string) {
    const resultPath = await getPathForSnippet(context, uuid)

    await fs.rm(resultPath, {
        recursive: true,
    })

    const snippetSources = await readSnippetSources(context)
    if (snippetSources.snippetSourceRepos.length === 0) {
        vscode.window.showInformationMessage("No snippet sources defined.")
        return
    }

    const snippetSourceRepos = []

    for (const x of snippetSources.snippetSourceRepos) {
        if (x.uuid === uuid) continue
        snippetSourceRepos.push(x)
    }

    snippetSources.snippetSourceRepos = snippetSourceRepos

    vscode.window.showInformationMessage(`Removed snippet source.`)
    await writeSnippetSources(context, snippetSources)
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

export async function updateSnippetSourceRepo(
    context: vscode.ExtensionContext,
    uuid: string,
    url: string
) {
    const resultPath = await getPathForSnippet(context, uuid);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Updating repository',
            cancellable: false
        },
        async (progress) => {
            progress.report({ increment: 0 });

            const git = simpleGit(resultPath, {
                progress: (data) => {
                    const per = data.total > 0
                        ? (data.processed / data.total) * 100
                        : 0;

                    progress.report({
                        increment: per,
                        message: `(${data.stage} ${data.processed}/${data.total})`
                    });
                }
            });

            const branch = 'main';

            // Get the commit currently checked out.
            const oldCommit = (await git.revparse(['HEAD'])).trim();

            await git.fetch('origin', branch, ['--depth', '1']);
            await git.reset(['--hard', `origin/${branch}`]);

            // Get the commit after the update.
            const newCommit = (await git.revparse(['HEAD'])).trim();

            progress.report({ increment: 100 });

            vscode.window.showInformationMessage(
                oldCommit === newCommit
                    ? `Repository is already up to date (${newCommit.slice(0, 7)})`
                    : `Repository updated: ${oldCommit.slice(0, 7)} → ${newCommit.slice(0, 7)}`
            );
        }
    );
}

export async function getPathForSnippet(context: vscode.ExtensionContext, uuid: string) {
    const globalStoragePath = await createGlobalStorageDirectory(context)
    const resultPath = path.join(globalStoragePath, "./snippetSources/" + uuid + "/")

    return resultPath
}

// read globalStorage/snippetSources.json
export async function readSnippetSources(context: vscode.ExtensionContext): Promise<SnippetSourceDefinition> {
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

// write globalStorage/snippetSources.json
export async function writeSnippetSources(context: vscode.ExtensionContext, data: SnippetSourceDefinition) {
    const uri = vscode.Uri.joinPath(context.globalStorageUri, "snippetSources.json")
    const content = Buffer.from(JSON.stringify(data), 'utf8')

    await vscode.workspace.fs.writeFile(uri, content)
}
