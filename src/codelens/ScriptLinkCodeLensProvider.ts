import * as vscode from 'vscode';
import { parseScriptAnnotations } from '../analysis/scriptLinks';

// Shows a clickable "🔗 namespace:id" lens above each `// @lantern` /
// `// @lantern:region` marker. Lenses derive purely from document text, so
// VSCode re-requests them on every edit — no manual invalidation needed.
export class ScriptLinkCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		const annotations = parseScriptAnnotations(document.getText());
		const lenses: vscode.CodeLens[] = [];

		for (const annotation of annotations) {
			const range = new vscode.Range(annotation.markerLine, 0, annotation.markerLine, 0);
			for (const identifier of annotation.identifiers) {
				lenses.push(new vscode.CodeLens(range, {
					title: `🔗 ${identifier}`,
					tooltip: `Open ${identifier} in Lantern`,
					command: "bedrockLantern.openLinkedIdentifier",
					arguments: [identifier]
				}));
			}
		}

		return lenses;
	}
}
