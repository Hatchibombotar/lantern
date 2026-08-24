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
import { registerGoToCommand } from './commands/goTo';

export default class ExtensionRoot {
	parsedProject: ParsedProject | undefined
	extensionContext: vscode.ExtensionContext

	treeView: vscode.TreeView<vscode.TreeItem | undefined>
	domainGroupViewer: DomainGroupViewer

	refreshProjectParseDiagnostics: () => any

	constructor(extensionContext: vscode.ExtensionContext) {
		this.extensionContext = extensionContext

		const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

		this.domainGroupViewer = new DomainGroupViewer(
			extensionContext,
			this,
			root,
		)

		this.treeView = vscode.window.createTreeView('bedrockLantern', {
			treeDataProvider: this.domainGroupViewer
		})
		extensionContext.subscriptions.push(this.treeView)

		this.refreshProjectParseDiagnostics = registerProjectParseDiagnostics(extensionContext, this)

		this.refresh()

		// Debounce: the watcher fires per file on bulk operations (builds, git ops),
		// and a refresh re-runs the full project parse, so batch them.
		let refreshTimer: NodeJS.Timeout | undefined
		const scheduleRefresh = () => {
			if (refreshTimer) {
				clearTimeout(refreshTimer)
			}
			refreshTimer = setTimeout(() => this.refresh(), 300)
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
		registerScriptLinkCommands(extensionContext, this.treeView as vscode.TreeView<vscode.TreeItem>, this.domainGroupViewer)
		registerSnippetSourceCommands(extensionContext)
		registerScriptLinkDiagnostics(extensionContext)

		registerGoToCommand(extensionContext, this)
	}

	private refresh() {
		const parsedProject = this.parseProject()
		if (parsedProject === undefined) {
			this.treeView.message = "Unable to parse project. Does config.json exist in the project root?"
		} else {
			this.treeView.message = undefined
		}
		this.parsedProject = parsedProject
		this.domainGroupViewer.refresh()
		if (parsedProject !== undefined) {
			this.refreshProjectParseDiagnostics()
		}
	}

	public getParsedProject(): ParsedProject | undefined {
		return this.parsedProject
	}

	private parseProject(): ParsedProject | undefined {
		const projectContext = getProjectContext();
		if (projectContext === undefined) {
			console.error("Project context not found.")
			return undefined
		}
		const { resourcePackDir, behaviorPackDir, workspaceRoot } = projectContext;

		const parser = new ProjectParser(
			resourcePackDir, behaviorPackDir, workspaceRoot
		)
		parser.parseAll()

		return parser.parseAll()
	}
}
