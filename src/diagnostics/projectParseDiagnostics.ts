import * as vscode from 'vscode';
import { ParsedProject } from '../analysis/ParsedProject';
import ExtensionRoot from '../ExtensionRoot';

export function registerProjectParseDiagnostics(context: vscode.ExtensionContext, extensionRoot: ExtensionRoot) {
    const collection = vscode.languages.createDiagnosticCollection("lantern-script-links");
    context.subscriptions.push(collection);

    function refresh() {
        const parsedProject = extensionRoot.getParsedProject()
        if (parsedProject === undefined) return
        collection.clear()

        for (const error of parsedProject.errors) {
            const uri = vscode.Uri.file(error.path)

            collection.set(uri, [
                new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    `Lantern: ${error.message}`,
                    vscode.DiagnosticSeverity.Error,
                )
            ])
        }
    }

    return refresh
}