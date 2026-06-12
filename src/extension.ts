import * as vscode from 'vscode';
import registerAllCommands from './actions';
import registerVanillaDataCommands from './vanillaDataActions';
import { DomainGroupViewer } from './domainViewer/DomainGroupViewer';

export function activate(context: vscode.ExtensionContext) {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	const domainGroupViewer = new DomainGroupViewer(
		context,
		root,
	)
	context.subscriptions.push(
		vscode.window.createTreeView('bedrockLantern', {
			treeDataProvider: domainGroupViewer
		})
	)
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root || '', '**/*'))
	watcher.onDidCreate(() => domainGroupViewer.refresh())
	watcher.onDidChange(() => domainGroupViewer.refresh())
	watcher.onDidDelete(() => domainGroupViewer.refresh())
	context.subscriptions.push(watcher)

	registerAllCommands(context)
	registerVanillaDataCommands(context)
}
