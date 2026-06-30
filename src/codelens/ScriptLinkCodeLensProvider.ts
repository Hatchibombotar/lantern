import * as vscode from 'vscode';
import { parseScriptAnnotations } from '../analysis/scriptLinks';

// Shows a clickable "🔗 namespace:id" lens above each `// @lantern-links-*`
// annotation. Lenses derive purely from document text, so VSCode re-requests
// them on every edit — no manual invalidation needed.
export class ScriptLinkCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		return parseScriptAnnotations(document.getText()).map(annotation => new vscode.CodeLens(
			new vscode.Range(annotation.line, 0, annotation.line, 0),
			{
				title: `🔗 ${annotation.identifier}`,
				tooltip: `Open ${annotation.identifier} in Lantern`,
				command: "bedrockLantern.openLinkedIdentifier",
				arguments: [annotation.identifier, annotation.category]
			}
		));
	}
}
