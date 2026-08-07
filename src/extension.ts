import * as vscode from 'vscode';
import registerAllCommands from './actions';
import registerVanillaDataCommands from './vanillaDataActions';
import registerScriptLinkCommands from './scriptLinkActions';
import { DomainGroupViewer } from './domainViewer/DomainGroupViewer';
import { ScriptLinkCodeLensProvider } from './codelens/ScriptLinkCodeLensProvider';
import { registerScriptLinkDiagnostics } from './diagnostics/scriptLinkDiagnostics';
import { getProjectContext } from './analysis/context';
import { ProjectParser } from './analysis/ProjectParser';
import { ParsedProject } from './analysis/ParsedProject';
import { registerProjectParseDiagnostics } from './diagnostics/projectParseDiagnostics';


let parsedProject: ParsedProject
function getParsedProject() {
	return parsedProject
}

function refreshParsedProject() {
	const projectContext = getProjectContext();
	if (projectContext === undefined) {
		throw Error("Project context not found.")
	}
	const { resourcePackDir, behaviorPackDir, workspaceRoot } = projectContext;

	const parser = new ProjectParser(
		resourcePackDir, behaviorPackDir, workspaceRoot
	)
	parsedProject = parser.parseAll()
}

export function activate(context: vscode.ExtensionContext) {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

	refreshParsedProject()

	const domainGroupViewer = new DomainGroupViewer(
		context,
		() => parsedProject,
		root,
	)

	const treeView = vscode.window.createTreeView('bedrockLantern', {
		treeDataProvider: domainGroupViewer
	})
	context.subscriptions.push(
		treeView
	)

	const refreshProjectParseDiagnostics = registerProjectParseDiagnostics(context)

	// Debounce: the watcher fires per file on bulk operations (builds, git ops),
	// and a refresh re-runs the full project parse, so batch them.
	let refreshTimer: NodeJS.Timeout | undefined
	const scheduleRefresh = () => {
		if (refreshTimer) {
			clearTimeout(refreshTimer)
		}
		refreshTimer = setTimeout(() => {
			refreshParsedProject()
			domainGroupViewer.refresh()
			refreshProjectParseDiagnostics(parsedProject)
		}, 300)
	}
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root || '', '**/*'))
	watcher.onDidCreate(scheduleRefresh)
	watcher.onDidChange(scheduleRefresh)
	watcher.onDidDelete(scheduleRefresh)
	context.subscriptions.push(watcher)

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			[{ language: 'typescript' }, { language: 'javascript' }],
			new ScriptLinkCodeLensProvider()
		)
	)

	registerAllCommands(context)
	registerVanillaDataCommands(context)
	registerScriptLinkCommands(context, treeView as vscode.TreeView<vscode.TreeItem>, domainGroupViewer)
	registerScriptLinkDiagnostics(context)
}
