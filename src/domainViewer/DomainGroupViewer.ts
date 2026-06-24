import * as vscode from 'vscode';
import { parseProject, file_type_names, FileTypes, ScriptLink } from '../analysis/parseProject';
import { getProjectData } from '../analysis/projectData';
import { Node, isFolder, parseEntitiesInFolder, parseItemsInFolder, Root, NodeInfo, Folder } from './createFolderStructure';

export class DomainGroupViewer implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext, private workspaceRoot?: string) {
		this.context = context;
	}

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

		const projectData = getProjectData();
		if (projectData === undefined) {
			console.log("err");
			return [];
		}

		if (element) {
			const meta = (element as any).__meta as (Node) | undefined;
			// console.log(meta)
			if (meta === undefined) {
				return [];
			} else if (isFolder(meta)) {
				return this.folderChildrenToTreeItems(meta);
			} else if (meta.type === "entity") {
				return this.entityToTreeItems(meta);
			} else if (meta.type === "root") {
				if (meta.rootType === "entities") {
					const projectData = getProjectData();
					if (projectData === undefined) {
						return [];
					}
					const { resourcePackDir, behaviorPackDir, workspaceRoot } = projectData;

					const parsedProject = parseProject(resourcePackDir, behaviorPackDir, workspaceRoot);
					if (parsedProject === void 0) {
						vscode.window.showErrorMessage("Unexpected Error");
						return [];
					}
					const entities = parseEntitiesInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
					if (entities === undefined) {
						return [];
					}
					return this.folderChildrenToTreeItems(entities, true);
				} else if (meta.rootType === "items") {
					const projectData = getProjectData();
					if (projectData === undefined) {
						return [];
					}
					const { resourcePackDir, behaviorPackDir, workspaceRoot } = projectData;

					const parsedProject = parseProject(resourcePackDir, behaviorPackDir, workspaceRoot);
					if (parsedProject === void 0) {
						vscode.window.showErrorMessage("Unexpected Error");
						return [];
					}
					const items = parseItemsInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
					if (items === undefined) {
						return [];
					}
					return this.folderChildrenToTreeItems(items, true);
				}
			}
			return [];
		} else {
			return this.getRootChildren();
		}
	}

	private getRootChildren(): vscode.TreeItem[] {
		const entities = new vscode.TreeItem(
			`entities`,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		entities.contextValue = 'folder_entities';
		(entities as any).__meta = {
			type: "root",
			rootType: "entities"
		} as Root;

		const items = new vscode.TreeItem(
			`items`,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		items.contextValue = 'folder_items';
		(items as any).__meta = {
			type: "root",
			rootType: "items"
		} as Root;

		return [entities, items];
	}

	private entityToTreeItems(entity: NodeInfo): vscode.TreeItem[] {
		const fileItems = entity.files.map(file => {
			const fileTypeName = file_type_names[file.fileType];
			if (!file.path) {
				console.error("missing file path" + file.fileType + JSON.stringify(entity));
				return null;
			}
			const item = new vscode.TreeItem(
				`${fileTypeName}`,
				vscode.TreeItemCollapsibleState.None
			);
			item.description = file.path.exactPath.split("\\").at(-1);
			const fileUri = vscode.Uri.file(file.path.exactPath);
			item.command = {
				command: "vscode.open",
				title: "Open " + fileTypeName,
				arguments: [fileUri]
			};
			// item.resourceUri = fileUri
			const icons: Record<FileTypes, string> = {
				[FileTypes.bp_entity]: "bp/entity.svg",
				[FileTypes.rp_entity]: "rp/entity.svg",
				[FileTypes.rp_animation]: "rp/animation.svg",
				[FileTypes.bp_animation]: "bp/animation.svg",
				[FileTypes.rp_animation_controllers]: "rp/animation_controller.svg",
				[FileTypes.bp_animation_controllers]: "bp/animation_controller.svg",
				[FileTypes.rp_render_controllers]: "rp/render_controller.svg",
				[FileTypes.bp_items]: "bp/item.svg",
				[FileTypes.rp_attachable]: "rp/attachable.svg",
			};

			const icon = icons[file.fileType];

			item.iconPath = {
				dark: vscode.Uri.joinPath(this.context.extensionUri, 'icons', icon),
				light: vscode.Uri.joinPath(this.context.extensionUri, 'icons', icon),
				color: new vscode.ThemeColor("testing.iconPassed")
			};

			return item;
		}).filter(x => x !== null);

		const scriptItems = entity.scriptLinks.map(link => this.scriptLinkToTreeItem(link));

		return [...fileItems, ...scriptItems];
	}

	private scriptLinkToTreeItem(link: ScriptLink): vscode.TreeItem {
		const item = new vscode.TreeItem("script", vscode.TreeItemCollapsibleState.None);

		item.description = `${link.relativePath}:${link.line + 1}`;
		item.tooltip = `${link.scriptPath}:${link.line + 1}`;

		// Open the script scrolled to the line the annotation sits on.
		const uri = vscode.Uri.file(link.scriptPath);
		const selection = new vscode.Range(link.line, 0, link.line, 0);
		item.command = { command: "vscode.open", title: "Open script", arguments: [uri, { selection }] };

		const icon = "bp/file.svg";
		item.iconPath = {
			dark: vscode.Uri.joinPath(this.context.extensionUri, 'icons', icon),
			light: vscode.Uri.joinPath(this.context.extensionUri, 'icons', icon),
			color: new vscode.ThemeColor("testing.iconPassed")
		};
		item.contextValue = 'node_entity_script';
		return item;
	}

	private folderChildrenToTreeItems(folder: Folder, isRoot = false): vscode.TreeItem[] {
		return folder.children.map(child => {
			if (isFolder(child)) {
				const item = new vscode.TreeItem(child.name, vscode.TreeItemCollapsibleState.Collapsed);
				if (isRoot && folder.children.length === 1) {
					item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
				}
				item.iconPath = vscode.ThemeIcon.Folder;
				(item as any).__meta = child;
				item.contextValue = 'folder_' + child.category;
				return item;
			} else {
				const item = new vscode.TreeItem(child.identifier, vscode.TreeItemCollapsibleState.Collapsed);
				if (child.files[0]) {
					// item.resourceUri = vscode.Uri.file(child.files[0].path.exactPath);
				}

				item.iconPath = new vscode.ThemeIcon('file', new vscode.ThemeColor('bedrockLantern.genericFile'));
				// item.iconPath = vscode.ThemeIcon.File;
				item.label = {
					label: child.identifier,
				};

				item.contextValue = 'node_' + child.category;
				item.tooltip = child.identifier;
				(item as any).__meta = child;
				return item;
			}
		});
	}
}
