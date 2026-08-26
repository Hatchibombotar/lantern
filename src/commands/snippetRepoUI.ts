import * as vscode from 'vscode';
import { readSnippetSources, writeSnippetSources, deleteSnippetSourceRepo, addSnippetSource, updateSnippetSourceRepo } from './snippetRepoManage';
import { importSnippetUI } from './snippetRepoImportUI';

export default function register(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand("bedrockLantern.showSnippetRepoUI", () => showSnippetRepoUI(context))
}

async function showSnippetRepoUI(context: vscode.ExtensionContext) {
    let snippetSources = await readSnippetSources(context);

    const qp = vscode.window.createQuickPick();

    async function refreshItems() {
        snippetSources = await readSnippetSources(context);
        qp.items = snippetSources.snippetSourceRepos.map((x) => ({
            buttons: [
                {
                    iconPath: {
                        id: "refresh",
                    },
                    tooltip: "Update"
                },
                {
                    iconPath: {
                        id: "trash",
                    },
                    tooltip: "Delete"
                }
            ],
            label: x.url,
            uuid: x.uuid,
            repo: x,
        }));
    }
    await refreshItems();

    qp.title = "Import Snippet from Repository";
    qp.buttons = [
        {
            iconPath: {
                id: "add",
            },
            tooltip: "Add"
        }
    ];

    qp.show();

    qp.onDidAccept((e) => {
        const selectedItems = qp.selectedItems[0] as any;

        const uuid = selectedItems.uuid;

        importSnippetUI(context, uuid)
    });

    qp.onDidTriggerItemButton(async (e) => {
        const item = e.item as any;
        if (e.button.tooltip === "Update") {
            qp.busy = true;
            await updateSnippetSourceRepo(context, item.uuid, item.item)
            await refreshItems();
            qp.busy = false;
        } else if (e.button.tooltip === "Delete") {
            qp.busy = true;
            await deleteSnippetSourceRepo(context, item.uuid);
            await refreshItems();
            qp.busy = false;
        }
    });

    qp.onDidTriggerButton(async (e) => {
        if (e.tooltip === "Add") {
            qp.hide();
            await addSnippetSource(context);
            await refreshItems();
            qp.show();
        }
    });
}
