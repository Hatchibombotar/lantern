import * as vscode from 'vscode';
import { parseProject, ParsedProject } from './analysis/parseProject';
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

// Right-click in a script editor to link the code at the cursor to one or more
// entities/items. Writes `// @lantern-links-entities [...]` / `-items [...]`
// comment(s) just above the current line, so opening the link from the tree
// jumps back to that spot.
function linkScript() {
	return vscode.commands.registerCommand("bedrockLantern.linkScript", async () => {
		const editor = vscode.window.activeTextEditor;
		if (editor === undefined) {
			vscode.window.showErrorMessage("Lantern: open a script file to link it.");
			return;
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
			placeHolder: "Link this code to entities/items",
		});
		if (chosen === undefined || chosen.length === 0) {
			return;
		}

		const entities = chosen.filter(c => c.description === "entity").map(c => c.label);
		const items = chosen.filter(c => c.description === "item").map(c => c.label);

		const uri = editor.document.uri;
		const line = editor.selection.start.line;
		const indent = leadingWhitespace(editor.document.lineAt(line).text);

		const annotationLines: string[] = [];
		if (entities.length > 0) {
			annotationLines.push(`${indent}// @lantern-links-entities ${JSON.stringify(entities)}`);
		}
		if (items.length > 0) {
			annotationLines.push(`${indent}// @lantern-links-items ${JSON.stringify(items)}`);
		}

		const edit = new vscode.WorkspaceEdit();
		edit.insert(uri, new vscode.Position(line, 0), annotationLines.join("\n") + "\n");
		await vscode.workspace.applyEdit(edit);
		await editor.document.save();

		vscode.window.showInformationMessage(`Lantern: linked to ${[...entities, ...items].join(", ")}.`);
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
