import * as vscode from 'vscode';
import registerCreateFileActions from './commands/createFileActions';
import registerVanillaDataCommands from './commands/importFromVanilla';
import registerScriptLinkCommands from './commands/scriptLinkActions';
import { DomainGroupViewer } from './domainViewer/DomainGroupViewer';
import { ScriptLinkCodeLensProvider } from './codelens/ScriptLinkCodeLensProvider';
import { registerScriptLinkDiagnostics } from './diagnostics/scriptLinkDiagnostics';
import { getProjectContext } from './analysis/context';
import { ProjectParser } from './analysis/ProjectParser';
import { ParsedProject } from './analysis/ParsedProject';
import { registerProjectParseDiagnostics } from './diagnostics/projectParseDiagnostics';
import registerSnippetSourceCommands from './commands/importFromRepo';
import registerEditActions from './commands/editActions';

let parsedProject: ParsedProject

function refreshParsedProject(): boolean {
	const projectContext = getProjectContext();
	if (projectContext === undefined) {
		console.error("Project context not found.")
		return false
	}
	const { resourcePackDir, behaviorPackDir, workspaceRoot } = projectContext;

	const parser = new ProjectParser(
		resourcePackDir, behaviorPackDir, workspaceRoot
	)
	parsedProject = parser.parseAll()

	return true
}

export function activate(extensionContext: vscode.ExtensionContext) {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

	const parseSuccess = refreshParsedProject()

	const domainGroupViewer = new DomainGroupViewer(
		extensionContext,
		() => parsedProject,
		root,
	)

	const treeView = vscode.window.createTreeView('bedrockLantern', {
		treeDataProvider: domainGroupViewer
	})
	extensionContext.subscriptions.push(
		treeView
	)
	
	if (!parseSuccess) {
		treeView.message = "Unable to parse project. Does config.json exist in the project root?"
	}

	const refreshProjectParseDiagnostics = registerProjectParseDiagnostics(extensionContext)

	// Debounce: the watcher fires per file on bulk operations (builds, git ops),
	// and a refresh re-runs the full project parse, so batch them.
	let refreshTimer: NodeJS.Timeout | undefined
	const scheduleRefresh = () => {
		if (refreshTimer) {
			clearTimeout(refreshTimer)
		}
		refreshTimer = setTimeout(() => {
			const parseSuccess = refreshParsedProject()
			if (parseSuccess) {
				treeView.message = undefined
			} else {
				treeView.message = "Unable to parse project. Does config.json exist in the project root?"
			}
			domainGroupViewer.refresh()
			refreshProjectParseDiagnostics(parsedProject)
		}, 300)
	}
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root || '', '**/*'))
	watcher.onDidCreate(scheduleRefresh)
	watcher.onDidChange(scheduleRefresh)
	watcher.onDidDelete(scheduleRefresh)
	extensionContext.subscriptions.push(watcher)

	extensionContext.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			[{ language: 'typescript' }, { language: 'javascript' }],
			new ScriptLinkCodeLensProvider()
		)
	)

	registerCreateFileActions(extensionContext)
	registerEditActions(extensionContext)
	registerVanillaDataCommands(extensionContext)
	registerScriptLinkCommands(extensionContext, treeView as vscode.TreeView<vscode.TreeItem>, domainGroupViewer)
	registerSnippetSourceCommands(extensionContext)

	registerScriptLinkDiagnostics(extensionContext)
}
