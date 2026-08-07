import * as vscode from 'vscode';
import { ParsedProject } from '../analysis/ParsedProject';

export function registerProjectParseDiagnostics(context: vscode.ExtensionContext) {
    const collection = vscode.languages.createDiagnosticCollection("lantern-script-links");
    context.subscriptions.push(collection);

    function refresh(parsedProject: ParsedProject) {
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