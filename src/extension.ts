import * as vscode from 'vscode';
import { entity_file_type_names, EntityInfo, Folder, getProjectInfo, isFolder, Node, parseEntitiesInFolder, parseItemsInFolder, parseProject, Root } from './parseProject';
import path from 'path';

export function activate(context: vscode.ExtensionContext) {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const entityJsonTreeDataProvider = new EntityJsonTreeDataProvider(
		root
	);
	context.subscriptions.push(
		vscode.window.createTreeView('domainCollator', {
			treeDataProvider: entityJsonTreeDataProvider
		})
	);
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root || '', '**/*'));
	watcher.onDidCreate(() => entityJsonTreeDataProvider.refresh());
	watcher.onDidChange(() => entityJsonTreeDataProvider.refresh());
	watcher.onDidDelete(() => entityJsonTreeDataProvider.refresh());
	context.subscriptions.push(watcher);
}

class EntityJsonTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot?: string) { }

	refresh(node?: vscode.TreeItem) {
		this._onDidChangeTreeData.fire(node ?? null);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		if (!this.workspaceRoot) {
			return [];
		}

		if (element) {
			const meta = (element as any).__meta as (Node) | undefined;
			// console.log(meta)
			if (meta === undefined) {
				return []
			} else if (isFolder(meta)) {
				return this.folderChildrenToTreeItems(meta)
			} else if (meta.type === "entity") {
				return this.entityToTreeItems(meta)
			} else if (meta.type === "root") {
				if (meta.rootType === "entities") {
					const projectData = parseProject()
					if (projectData === void 0) {
						vscode.window.showErrorMessage("Unexpected Error")
						return []
					}
					const [resourcePackDir, behaviorPackDir] = getProjectInfo() ?? []
					const entities = parseEntitiesInFolder("/", projectData, behaviorPackDir, resourcePackDir, true)
					if (entities === undefined) {
						return []
					}
					return this.folderChildrenToTreeItems(entities, true)
				} else if (meta.rootType === "items") {
					const projectData = parseProject()
					if (projectData === void 0) {
						vscode.window.showErrorMessage("Unexpected Error")
						return []
					}
					const [_, behaviorPackDir] = getProjectInfo() ?? []
					const entities = parseItemsInFolder(path.join(behaviorPackDir, "./items/"), projectData, true)
					if (entities === undefined) {
						return []
					}
					return this.folderChildrenToTreeItems(entities, true)
				}
			}
			return []
		} else {
			return this.getRootChildren()
		}
	}

	private getRootChildren(): vscode.TreeItem[] {
		const entities = new vscode.TreeItem(
			`entities`,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		(entities as any).__meta = {
			type: "root",
			rootType: "entities"
		} as Root;

		const items = new vscode.TreeItem(
			`items`,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		(items as any).__meta = {
			type: "root",
			rootType: "items"
		} as Root;

		return [entities, items]
	}

	private entityToTreeItems(entity: EntityInfo): vscode.TreeItem[] {
		return entity.files.map(file => {
			const fileTypeName = entity_file_type_names[file.fileType]
			if (!file.path) {
				console.error("missing file path" + file.fileType + JSON.stringify(entity))
				return null
			}
			const item = new vscode.TreeItem(
				`${fileTypeName}`,
				vscode.TreeItemCollapsibleState.None
			);
			item.description = file.path.split("\\").at(-1)
			const fileUri = vscode.Uri.file(file.path);
			item.command = {
				command: "vscode.open",
				title: "Open " + fileTypeName,
				arguments: [fileUri]
			}
			item.resourceUri = fileUri
			return item
		}).filter(x => x !== null)
	}

	private folderChildrenToTreeItems(folder: Folder, isRoot = false): vscode.TreeItem[] {
		return folder.children.map(child => {
			if (isFolder(child)) {
				const item = new vscode.TreeItem(child.name, vscode.TreeItemCollapsibleState.Collapsed);
				if (isRoot && folder.children.length === 1) {
					item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
				}
				item.iconPath = vscode.ThemeIcon.Folder;
				(item as any).__meta = child;
				return item;
			} else {
				const item = new vscode.TreeItem(child.identifier, vscode.TreeItemCollapsibleState.Collapsed);
				if (child.files[0]) {
					item.resourceUri = vscode.Uri.file(child.files[0].path);
				}

				item.contextValue = 'entityItem';
				item.tooltip = child.identifier;
				item.iconPath = vscode.ThemeIcon.File;
				(item as any).__meta = child;
				return item;
			}
		});
	}
}
