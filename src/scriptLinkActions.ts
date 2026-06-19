import * as vscode from 'vscode';
import { parseProject, ParsedProject } from './analysis/parseProject';
import { parseScriptAnnotations } from './analysis/scriptLinks';
import { getProjectData } from './analysis/projectData';

export default function registerScriptLinkCommands(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		linkScript(),
		openLinkedIdentifier(),
	);
}

function getParsedProject(): ParsedProject | undefined {
	const projectData = getProjectData();
	if (projectData === undefined) {
		return undefined;
	}
	return parseProject(projectData.resourcePackDir, projectData.behaviorPackDir, projectData.workspaceRoot) || undefined;
}

// All entity + item identifiers a script can legitimately link to.
function knownIdentifierPicks(parsedProject: ParsedProject): vscode.QuickPickItem[] {
	const picks: vscode.QuickPickItem[] = [];
	const seen = new Set<string>();
	const add = (id: string, category: string) => {
		if (seen.has(id)) {
			return;
		}
		seen.add(id);
		picks.push({ label: id, description: category });
	};
	for (const id of Object.keys(parsedProject.bp_entity)) {
		add(id, "entity");
	}
	for (const id of Object.keys(parsedProject.rp_entity)) {
		add(id, "entity");
	}
	for (const id of Object.keys(parsedProject.bp_items)) {
		add(id, "item");
	}
	picks.sort((a, b) => a.label.localeCompare(b.label));
	return picks;
}

function leadingWhitespace(line: string): string {
	return line.match(/^\s*/)?.[0] ?? "";
}

// Right-click a script (in the editor or the Lantern tree) to link it to one or
// more entities/items. With a non-empty editor selection the link is a
// `@lantern:region` wrapping the selection; otherwise it's a whole-file
// `@lantern` annotation at the top of the file.
function linkScript() {
	return vscode.commands.registerCommand("bedrockLantern.linkScript", async (arg: any) => {
		const meta = arg?.__meta;

		let uri: vscode.Uri;
		let selection: vscode.Selection | undefined;
		if (meta && meta.type === "script_file") {
			uri = vscode.Uri.file(meta.path);
		} else {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage("Lantern: open a script file to link it.");
				return;
			}
			uri = editor.document.uri;
			if (!editor.selection.isEmpty) {
				selection = editor.selection;
			}
		}

		const parsedProject = getParsedProject();
		if (parsedProject === undefined) {
			return;
		}

		const picks = knownIdentifierPicks(parsedProject);
		if (picks.length === 0) {
			vscode.window.showInformationMessage("Lantern: no entities or items found to link to.");
			return;
		}

		const chosen = await vscode.window.showQuickPick(picks, {
			canPickMany: true,
			placeHolder: selection ? "Link selection to entities/items" : "Link file to entities/items",
		});
		if (chosen === undefined || chosen.length === 0) {
			return;
		}
		const identifiers = chosen.map(c => c.label);

		const document = await vscode.workspace.openTextDocument(uri);
		const edit = new vscode.WorkspaceEdit();

		if (selection) {
			const startLine = selection.start.line;
			const endLine = selection.end.line;
			const indent = leadingWhitespace(document.lineAt(startLine).text);
			edit.insert(uri, new vscode.Position(startLine, 0), `${indent}// @lantern:region ${JSON.stringify(identifiers)}\n`);
			const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
			edit.insert(uri, endPos, `\n${indent}// @lantern:endregion`);
		} else {
			// Merge into an existing whole-file annotation if there is one.
			const existing = parseScriptAnnotations(document.getText()).find(a => a.source === "file");
			if (existing) {
				const merged = [...new Set([...existing.identifiers, ...identifiers])];
				edit.replace(uri, document.lineAt(existing.markerLine).range, `// @lantern ${JSON.stringify(merged)}`);
			} else {
				edit.insert(uri, new vscode.Position(0, 0), `// @lantern ${JSON.stringify(identifiers)}\n`);
			}
		}

		await vscode.workspace.applyEdit(edit);
		await document.save();
		vscode.window.showInformationMessage(`Lantern: linked to ${identifiers.join(", ")}.`);
	});
}

// Invoked from the CodeLens above a `@lantern` marker — opens the linked
// entity/item's definition file.
function openLinkedIdentifier() {
	return vscode.commands.registerCommand("bedrockLantern.openLinkedIdentifier", async (identifier: string) => {
		const parsedProject = getParsedProject();
		if (parsedProject === undefined) {
			return;
		}
		const target =
			parsedProject.bp_entity[identifier]?.path ??
			parsedProject.rp_entity[identifier]?.path ??
			parsedProject.bp_items[identifier];
		if (target === undefined) {
			vscode.window.showWarningMessage(`Lantern: no file found for ${identifier}.`);
			return;
		}
		await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target.exactPath));
	});
}
