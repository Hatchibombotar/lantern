import * as vscode from 'vscode';
import { Node } from '../domainViewer/createFolderStructure';
import { ProjectFile } from '../analysis/AddonFileTypes';
import path from 'path';
import fs from "fs/promises"


export default function registerEditActions(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        copyIdentifier(),
        deleteFromNode(),
    )
}

function copyIdentifier() {
    return vscode.commands.registerCommand("bedrockLantern.copyIdentifier", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type === "element") {
            vscode.env.clipboard.writeText(meta.identifier);
            vscode.window.showInformationMessage(`Copied identifier ${meta.identifier} to clipboard.`);
        }
    });
}

function deleteFromNode() {
    return vscode.commands.registerCommand("bedrockLantern.deleteFromNode", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "element") return

        const files: ProjectFile[] = [...meta.files, ...meta.assets]
        
        const filesToDelete = await vscode.window.showQuickPick(
            files.map(file => ({
                label: file.path.rootType + path.sep + file.path.relativePath,
                picked: true,
                file
            })),
            {
                canPickMany: true,
                title: "Delete Files"
            }
        )

        if (filesToDelete === undefined) return

        for (const file of filesToDelete) {
            const filePath = file.file.path.exactPath
            fs.rm(filePath, {})
        }

        vscode.window.showInformationMessage(`Deleted ${meta.identifier}.`);
    })
}

