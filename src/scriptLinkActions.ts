import * as vscode from 'vscode';
import { ParsedProject } from './analysis/ParsedProject';
import { getProjectContext } from './analysis/context';
import { DomainGroupViewer } from './domainViewer/DomainGroupViewer';
import { Category } from './domainViewer/createFolderStructure';
import { ProjectParser } from './analysis/ProjectParser';

export default function registerScriptLinkCommands(context: vscode.ExtensionContext, treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: DomainGroupViewer) {
	context.subscriptions.push(
		linkScript(),
		openLinkedIdentifier(treeView, treeDataProvider),
	);
}

function getParsedProject(): ParsedProject | undefined {
	const projectContext = getProjectContext();
	if (projectContext === undefined) {
		return undefined;
	}
	const parser = new ProjectParser(projectContext.resourcePackDir, projectContext.behaviorPackDir, projectContext.workspaceRoot)
	const parsedProject = parser.parseAll()
	return parsedProject || undefined;
}

// All entity + item identifiers a script can legitimately link to.
function knownIdentifierPicks(parsedProject: ParsedProject): vscode.QuickPickItem[] {
	const picks: vscode.QuickPickItem[] = [];
	const seen = new Set<string>();
	const add = (id: string, category: string) => {
		if (seen.has(id+category)) {
			return;
		}
		seen.add(id+category);
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
	for (const id of parsedProject.bp_blocks.keys()) {
		add(id, "block");
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
			placeHolder: "Link this code to entities/items/blocks",
		});
		if (chosen === undefined || chosen.length === 0) {
			return;
		}

		const entities = chosen.filter(c => c.description === "entity").map(c => c.label);
		const items = chosen.filter(c => c.description === "item").map(c => c.label);
		const blocks = chosen.filter(c => c.description === "block").map(c => c.label);

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
		if (blocks.length > 0) {
			annotationLines.push(`${indent}// @lantern-links-blocks ${JSON.stringify(blocks)}`);
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
function openLinkedIdentifier(treeView: vscode.TreeView<vscode.TreeItem>, treeDataProvider: DomainGroupViewer) {
	return vscode.commands.registerCommand("bedrockLantern.openLinkedIdentifier", async (identifier: string, category: Category) => {
		const parsedProject = getParsedProject();
		if (parsedProject === undefined) {
			return;
		}
		const target =
			parsedProject.bp_entity[identifier]?.path ??
			parsedProject.rp_entity[identifier]?.path ??
			parsedProject.bp_items[identifier]?.path ??
			parsedProject.bp_blocks.find(([id]) => identifier === id)[0][1]?.path;
		if (target === undefined) {
			vscode.window.showWarningMessage(`Lantern: no file found for ${identifier}.`);
			return;
		}

		treeDataProvider.openNode(category, identifier, treeView)
	});
}