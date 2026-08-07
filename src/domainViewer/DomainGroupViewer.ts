import * as vscode from 'vscode';
import { file_type_names, AddonFileTypes } from '../AddonFileTypes';
import { getProjectContext } from '../analysis/context';
import { Node, isFolder, parseEntitiesInFolder, parseItemsInFolder, Root, NodeInfo, Folder, Category, parseBlocksInFolder, ProjectFile, FileFolder } from './createFolderStructure';
import path from 'path';
import { ParsedProject, ScriptLink } from '../analysis/ParsedProject';

export class DomainGroupViewer implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	context: vscode.ExtensionContext;

	getParsedProject: () => ParsedProject

	constructor(context: vscode.ExtensionContext, getParsedProject: () => ParsedProject, private workspaceRoot?: string) {
		this.context = context;
		this.getParsedProject = getParsedProject
	}

	refresh(node?: vscode.TreeItem) {
		this._onDidChangeTreeData.fire(node ?? null);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(parent?: vscode.TreeItem): vscode.TreeItem[] {
		if (!this.workspaceRoot) {
			return [];
		}

		const projectContext = getProjectContext();
		if (projectContext === undefined) {
			console.log("err");
			return [];
		}

		if (parent) {
			const meta = (parent as any).__meta as (Node) | undefined;
			// console.log(meta)
			if (meta === undefined) {
				return [];
			} else if (isFolder(meta)) {
				return this.folderChildrenToTreeItems(parent, meta);
			} else if (meta.type === "element") {
				return this.entityToTreeItems(parent, meta);
			} else if (meta.type === "fileFolder") {
				return this.expandFileFolder(parent, meta);
			} else if (meta.type === "root") {
				// TODO: do this globally; This is currenly parsing the project three times per refresh
				const projectContext = getProjectContext();
				if (projectContext === undefined) {
					return [];
				}
				const { resourcePackDir, behaviorPackDir } = projectContext;

				const parsedProject = this.getParsedProject()

				if (meta.rootType === "entities") {
					const entities = parseEntitiesInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
					if (entities === undefined) {
						return [];
					}
					return this.folderChildrenToTreeItems(parent, entities, true);
				} else if (meta.rootType === "items") {
					const items = parseItemsInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
					if (items === undefined) {
						return [];
					}
					return this.folderChildrenToTreeItems(parent, items, true);
				} else if (meta.rootType === "blocks") {
					const items = parseBlocksInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
					if (items === undefined) {
						return [];
					}
					return this.folderChildrenToTreeItems(parent, items, true);
				}
			}
			return [];
		} else {
			return this.getRootChildren();
		}
	}

	// The "root" folders: `entities`, `items`, `blocks` etc.
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


		const blocks = new vscode.TreeItem(
			`blocks`,
			vscode.TreeItemCollapsibleState.Collapsed
		);
		blocks.contextValue = 'folder_blocks';
		(blocks as any).__meta = {
			type: "root",
			rootType: "blocks"
		} as Root;

		return [entities, items, blocks];
	}

	// The contents of a node e.g. an entity, item node
	private entityToTreeItems(parent: vscode.TreeItem, entity: NodeInfo): vscode.TreeItem[] {
		const children: vscode.TreeItem[] = []

		// Show BP files
		for (const file of entity.files) {
			if (file.path.rootType === "bp") {
				children.push(
					this.fileToTreeItem(parent, file)
				)
			}
		}

		// Show Scripts
		for (const link of entity.scriptLinks) {
			children.push(
				this.scriptLinkToTreeItem(parent, link)
			)
		}

		// Show RP files
		for (const file of entity.files) {
			if (file.path.rootType === "rp") {
				children.push(
					this.fileToTreeItem(parent, file)
				)
			}
		}

		// Show assets
		if (entity.assets.length > 0) {
			const icon = {
				dark: vscode.Uri.joinPath(this.context.extensionUri, 'icons', "folder.svg"),
				light: vscode.Uri.joinPath(this.context.extensionUri, 'icons', "folder.svg"),
			};

			children.push(this.createFileFolder(
				parent, "assets", entity.assets,

				{
					dark: vscode.Uri.joinPath(this.context.extensionUri, 'icons', "rp/folder.svg"),
					light: vscode.Uri.joinPath(this.context.extensionUri, 'icons', "rp/folder.svg"),
				}
			))
		}

		return children
	}

	private expandFileFolder(parent: vscode.TreeItem, fileFolder: FileFolder): vscode.TreeItem[] {
		const children: vscode.TreeItem[] = []
		for (const file of fileFolder.files) {
			children.push(
				this.fileToTreeItem(parent, file)
			)
		}

		return children
	}

	// A folder that holds project file nodes. Used for the "asset" folders
	private createFileFolder(parent: vscode.TreeItem, label: string | vscode.TreeItemLabel, files: ProjectFile[], icon?: vscode.TreeItem["iconPath"]) {
		const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
		if (icon) {
			item.iconPath = icon
		} else {
			item.iconPath = vscode.ThemeIcon.Folder;
		}

		const meta: FileFolder = {
			type: "fileFolder",
			files,
		};

		(item as any).__meta = meta;
		// item.contextValue = 'folder_';
		(item as any).__parent = parent;
		return item;
	}

	private fileToTreeItem(parent: vscode.TreeItem, file: ProjectFile): vscode.TreeItem {
		const fileTypeName = file_type_names[file.fileType];
		if (!file.path) {
			throw new Error("missing file path for file " + file.fileType)
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
		const icons: Record<AddonFileTypes, string> = {
			[AddonFileTypes.bp_entity]: "bp/entity.svg",
			[AddonFileTypes.rp_entity]: "rp/entity.svg",
			[AddonFileTypes.rp_animation]: "rp/animation.svg",
			[AddonFileTypes.bp_animation]: "bp/animation.svg",
			[AddonFileTypes.rp_animation_controllers]: "rp/animation_controller.svg",
			[AddonFileTypes.bp_animation_controllers]: "bp/animation_controller.svg",
			[AddonFileTypes.rp_render_controllers]: "rp/render_controller.svg",
			[AddonFileTypes.bp_items]: "bp/item.svg",
			[AddonFileTypes.rp_attachable]: "rp/attachable.svg",
			[AddonFileTypes.bp_block]: "bp/block.svg",
			[AddonFileTypes.rp_block_culling_rule]: "rp/block.svg",
			[AddonFileTypes.rp_model]: "rp/model.svg",
			[AddonFileTypes.rp_texture]: "rp/image.svg",
		};

		const icon = icons[file.fileType];

		item.iconPath = {
			dark: vscode.Uri.joinPath(this.context.extensionUri, 'icons', icon),
			light: vscode.Uri.joinPath(this.context.extensionUri, 'icons', icon),
		};
		(item as any).__parent = parent;

		return item;
	}

	private scriptLinkToTreeItem(parent: vscode.TreeItem, link: ScriptLink): vscode.TreeItem {
		const fileName = path.basename(link.scriptPath)

		const item = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.None);

		item.description = `${link.relativePath}:${link.line + 1}`
		item.tooltip = `${link.relativePath}:${link.line + 1}`;

		// remove folders above scripts folder if it is included within the path
		let splitPath = path.normalize(link.relativePath).split(path.sep)
		if (splitPath.includes("scripts")) {
			const i = splitPath.findIndex((v) => v === "scripts")
			if (i !== -1) {
				item.description = splitPath.slice(i + 1).join("/")
			}
		}


		// Open the script scrolled to the line the annotation sits on.
		const uri = vscode.Uri.file(link.scriptPath);
		const selection = new vscode.Range(link.line, 0, link.line, 0);
		item.command = { command: "vscode.open", title: "Open script", arguments: [uri, { selection }] };

		item.contextValue = 'node_entity_script';
		item.resourceUri = uri;
		(item as any).__parent = parent;

		return item;
	}

	private folderChildrenToTreeItems(parent: vscode.TreeItem, folder: Folder, isRoot = false): vscode.TreeItem[] {
		return folder.children.map(child => {
			switch (child.type) {
				case "folder": {
					const item = new vscode.TreeItem(child.name, vscode.TreeItemCollapsibleState.Collapsed);
					if (isRoot && folder.children.length === 1) {
						item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
					}
					item.iconPath = vscode.ThemeIcon.Folder;
					(item as any).__meta = child;
					item.contextValue = 'folder_' + child.category;
					(item as any).__parent = parent;
					return item;
				}
				case "element": {
					const item = new vscode.TreeItem(child.identifier, vscode.TreeItemCollapsibleState.Collapsed);

					item.iconPath = {
						dark: vscode.Uri.joinPath(this.context.extensionUri, 'icons', "product/file_coloured.svg"),
						light: vscode.Uri.joinPath(this.context.extensionUri, 'icons', "product/file_coloured.svg"),
					};
					item.label = {
						label: child.identifier,
					};

					item.contextValue = 'node_' + child.category;
					item.tooltip = child.identifier;
					(item as any).__parent = parent;

					(item as any).__meta = child;
					return item;
				}
			}
		})
	}

	public getParent(node?: vscode.TreeItem): (vscode.TreeItem | null) {
		if (node === undefined) {
			return null
		}

		const parent = (node as any).__parent;

		return parent
	}

	public openNode(root: Category, identifier: string, treeView: vscode.TreeView<vscode.TreeItem>) {
		const projectContext = getProjectContext();
		if (projectContext === undefined) {
			return;
		}
		const { resourcePackDir, behaviorPackDir, workspaceRoot } = projectContext;
		const parsedProject = this.getParsedProject()

		if (parsedProject === void 0) {
			vscode.window.showErrorMessage("Unexpected Error");
			return;
		}

		let folderStructure: Folder
		let currentTail: vscode.TreeItem
		switch (root) {
			case 'entities':
				folderStructure = parseEntitiesInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
				currentTail = this.getChildren()[0]
				break
			case 'items':
				folderStructure = parseItemsInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
				currentTail = this.getChildren()[1]
				break
			case 'blocks':
				folderStructure = parseBlocksInFolder("/", parsedProject, behaviorPackDir, resourcePackDir, true);
				currentTail = this.getChildren()[2]
				break
		}
		const route = findIdentifierInFolder(folderStructure, identifier)
		route.pop()
		for (const i of route) {
			treeView.reveal(currentTail, {
				expand: true
			})
			const children = this.getChildren(currentTail)
			if (children.length === 0) {
				break
			} else {
				currentTail = children[i]
			}
		}
		treeView.reveal(currentTail, {
			expand: true
		})
	}
}

// returns a list of indexes to follow. always ends in a 0.
function findIdentifierInFolder(folder: Node, identifier: string): number[] {
	if (folder.type === "element") {
		if (folder.identifier === identifier) {
			return [0]
		}
	} else if (folder.type === "folder") {
		for (const childIndex in folder.children) {
			const child = folder.children[childIndex]
			const s = findIdentifierInFolder(child, identifier)
			if (s.length > 0) {
				return [Number(childIndex), ...s]
			}
		}
		return []
	} else {
		throw Error("not intended to work with type " + folder.type)
	}
	return []
}
