import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseScriptAnnotations } from '../analysis/scriptLinks';
import { getProjectData } from '../analysis/projectData';
import { ProjectParser } from '../analysis/ProjectParser';

// Warns about `@lantern` annotations that reference unknown identifiers (typos /
// renames)
export function registerScriptLinkDiagnostics(context: vscode.ExtensionContext) {
	const collection = vscode.languages.createDiagnosticCollection("lantern-script-links");
	context.subscriptions.push(collection);

	let timer: NodeJS.Timeout | undefined;
	const schedule = (document: vscode.TextDocument) => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => refresh(document, collection), 500);
	};

	for (const editor of vscode.window.visibleTextEditors) {
		if (isScript(editor.document)) {
			refresh(editor.document, collection);
		}
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(d => { if (isScript(d)) { refresh(d, collection); } }),
		vscode.workspace.onDidSaveTextDocument(d => { if (isScript(d)) { refresh(d, collection); } }),
		vscode.workspace.onDidChangeTextDocument(e => { if (isScript(e.document)) { schedule(e.document); } }),
		vscode.workspace.onDidCloseTextDocument(d => collection.delete(d.uri)),
	);
}

function isScript(document: vscode.TextDocument): boolean {
	return document.languageId === "typescript" || document.languageId === "javascript";
}

// Silent check so we don't trigger getProjectData's "no config.json" popup for
// TS/JS files in non-Bedrock projects.
function hasConfig(): boolean {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (root === undefined) {
		return false;
	}
	return fs.existsSync(path.join(root, "config.json"));
}

type KnownIdentifiers = { entities: Set<string>, items: Set<string> };

function getKnownIdentifiers(): KnownIdentifiers | undefined {
	if (!hasConfig()) {
		return undefined;
	}
	const projectData = getProjectData();
	if (projectData === undefined) {
		return undefined;
	}
	const parser = new ProjectParser(
		projectData.resourcePackDir, projectData.behaviorPackDir, projectData.workspaceRoot
	)
	const parsedProject = parser.parseAll()
	if (parsedProject === undefined) {
		return undefined;
	}
	return {
		entities: new Set<string>([...Object.keys(parsedProject.bp_entity), ...Object.keys(parsedProject.rp_entity)]),
		items: new Set<string>(Object.keys(parsedProject.bp_items)),
	};
}

function refresh(document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
	const known = getKnownIdentifiers();
	if (known === undefined) {
		collection.delete(document.uri);
		return;
	}

	const diagnostics: vscode.Diagnostic[] = [];
	for (const annotation of parseScriptAnnotations(document.getText())) {
		const set = annotation.category === "entities" ? known.entities : known.items;
		if (set.has(annotation.identifier)) {
			continue;
		}
		const singular = annotation.category === "entities" ? "entity" : "item";
		const line = document.lineAt(annotation.line);
		const index = line.text.indexOf(annotation.identifier);
		const range = index >= 0
			? new vscode.Range(annotation.line, index, annotation.line, index + annotation.identifier.length)
			: line.range;
		diagnostics.push(new vscode.Diagnostic(
			range,
			`Lantern: unknown ${singular} identifier "${annotation.identifier}".`,
			vscode.DiagnosticSeverity.Warning,
		));
	}

	collection.set(document.uri, diagnostics);
}
