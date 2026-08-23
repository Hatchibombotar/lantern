import * as path from 'path';
import * as fs from 'fs';

import { AddonFileTypes, ProjectFile } from '../analysis/AddonFileTypes';
import { ParsedProject, ScriptLink } from '../analysis/ParsedProject';
import { Symbol, SymbolType } from '../analysis/symbols';

export type Category = "entities" | "items" | "blocks"

export function categoryToSymbol(c: Category): SymbolType {
	switch (c) {
		case 'entities':
			return SymbolType.EntityIdentifier
		case 'items':
			return SymbolType.ItemIdentifier
		case 'blocks':
			return SymbolType.BlockIdentifier
	}
}

export type Root = {
	type: "root",
	rootType: Category
}

export type Node = Root | Folder | NodeInfo | FileFolder

export type Folder = {
	type: "folder"
	name: string
	path: string
	children: (NodeInfo | Folder)[],
	category: Category
}
export type NodeInfo = {
	type: "element",
	identifier: string,
	path: string
	files: ProjectFile[],
	assets: ProjectFile[],
	scriptLinks: ScriptLink[],
	category: Category
}
export type FileFolder = {
	type: "fileFolder",
	files: ProjectFile[],
}
export function parseEntitiesInFolder(folderPath: string, projectData: ParsedProject, behaviorPackDir: string, resourcePackDir: string, isRoot = false): Folder {
	const folder: Folder = {
		type: "folder",
		children: [],
		name: folderPath.split("\\").at(-1) ?? "<folder>",
		category: "entities",
		path: folderPath
	}

	const BPPath = path.join(behaviorPackDir, "./entities/", folderPath)
	const RPPath = path.join(resourcePackDir, "./entity/", folderPath)
	const BPExists = fs.existsSync(BPPath)
	const RPExists = fs.existsSync(RPPath)

	const subfolders = []
	if (BPExists) {
		for (const subfolder of fs.readdirSync(BPPath)) {
			const stat = fs.statSync(path.join(BPPath, subfolder))
			if (stat.isDirectory()) {
				subfolders.push(subfolder)
			}
		}
	}

	if (RPExists) {
		for (const subfolder of fs.readdirSync(RPPath)) {
			const stat = fs.statSync(path.join(RPPath, subfolder))
			if (stat.isDirectory() && !subfolders.includes(subfolder)) {
				subfolders.push(subfolder)
			}
		}
	}

	for (const subfolder of subfolders) {
		const subfolderPath = path.join(folderPath, subfolder)

		const folderData = parseEntitiesInFolder(subfolderPath, projectData, behaviorPackDir, resourcePackDir)
		if (folderData.children.length === 0) {
			continue
		}
		folder.children.push(folderData)
	}


	const RPEntityFiles = RPExists ? fs.globSync(path.join(RPPath, "/*.json")) : []
	const BPEntityFiles = BPExists ? fs.globSync(path.join(BPPath, "/*.json")) : []

	const entityIdentifiers: string[] = []


	for (const BPEntityFile of BPEntityFiles) {
		const [identifier, bp_entity] = Object.entries(projectData.bp_entity).find(([_, v]) => v.path.exactPath === BPEntityFile) ?? []

		if (identifier === undefined || bp_entity === undefined) {
			continue
		}
		entityIdentifiers.push(identifier)
	}
	for (const RPEntityFile of RPEntityFiles) {
		const [identifier, rp_entity] = Object.entries(projectData.rp_entity).find(([_, v]) => v.path.exactPath === RPEntityFile) ?? []

		if (identifier === undefined || rp_entity === undefined || entityIdentifiers.includes(identifier)) {
			continue
		}
		const bp_entity = projectData.bp_entity[identifier]
		if (bp_entity) {
			continue
		}
		entityIdentifiers.push(identifier)
	}

	for (const identifier of entityIdentifiers) {
		const files = getFilesForEntity(projectData, identifier)
		const assets = getAssetsForEntity(projectData, identifier)

		const entityInfo: NodeInfo = {
			type: "element",
			identifier: identifier,
			files,
			assets: assets,
			scriptLinks: getScriptsForIdentifier(projectData, identifier, "entities"),
			category: "entities",
			path: folderPath,
		}

		folder.children.push(entityInfo)
	}

	if (!isRoot && folder.children.length === 1 && isFolder(folder.children[0])) {
		const subfolder = folder.children[0]
		subfolder.name = folder.name + "\\" + subfolder.name
		return subfolder
	}

	return folder
}

export function parseItemsInFolder(folderPath: string, projectData: ParsedProject, behaviorPackDir: string, resourcePackDir: string, isRoot = false): Folder {
	const folder: Folder = {
		type: "folder",
		children: [],
		name: folderPath.split("\\").at(-1) ?? "<folder>",
		category: "items",
		path: folderPath
	}

	const BPPath = path.join(behaviorPackDir, "./items/", folderPath)

	for (const subfolder of fs.readdirSync(BPPath)) {
		const subfolderPath = path.join(folderPath, subfolder)
		const stat = fs.statSync(path.join(BPPath, subfolder))
		if (stat.isDirectory()) {
			folder.children.push(
				parseItemsInFolder(subfolderPath, projectData, behaviorPackDir, resourcePackDir)
			)
		}
	}

	const BPItemFiles = fs.globSync(path.join(BPPath, "/*.json"))
	for (const BPItemFile of BPItemFiles) {
		const [identifier, bp_item] = Object.entries(projectData.bp_items).find(([_, item]) => item.path.exactPath === BPItemFile) ?? []

		if (identifier === undefined || bp_item === undefined) {
			continue
		}

		const files = getFilesForItem(projectData, identifier)
		const assets = getAssetsForItem(projectData, identifier)

		const entityInfo: NodeInfo = {
			type: "element",
			identifier: identifier,
			files,
			assets,
			scriptLinks: getScriptsForIdentifier(projectData, identifier, "items"),
			category: "items",
			path: folderPath,
		}

		folder.children.push(entityInfo)
	}

	if (!isRoot && folder.children.length === 1 && isFolder(folder.children[0])) {
		const subfolder = folder.children[0]
		subfolder.name = folder.name + "\\" + subfolder.name
		return subfolder
	}

	return folder
}

export function parseBlocksInFolder(folderPath: string, projectData: ParsedProject, behaviorPackDir: string, resourcePackDir: string, isRoot = false): Folder {
	const folder: Folder = {
		type: "folder",
		children: [],
		name: folderPath.split("\\").at(-1) ?? "<folder>",
		category: "blocks",
		path: folderPath
	}

	const BPPath = path.join(behaviorPackDir, "./blocks/", folderPath)

	for (const subfolder of fs.readdirSync(BPPath)) {
		const subfolderPath = path.join(folderPath, subfolder)
		const stat = fs.statSync(path.join(BPPath, subfolder))
		if (stat.isDirectory()) {
			folder.children.push(
				parseBlocksInFolder(subfolderPath, projectData, behaviorPackDir, resourcePackDir)
			)
		}
	}

	const BPBlockFiles = fs.globSync(path.join(BPPath, "/*.json"))
	for (const BPBlockFile of BPBlockFiles) {

		const [identifier, bp_block] = Object.entries(projectData.bp_blocks).find(([_, item]) => item.path.exactPath === BPBlockFile) ?? []

		if (identifier === undefined || bp_block === undefined) {
			continue
		}

		const files = getFilesForBlock(projectData, bp_block)
		const assets = getAssetsForBlock(projectData, bp_block)

		const entityInfo: NodeInfo = {
			type: "element",
			identifier: identifier,
			files,
			assets,
			scriptLinks: getScriptsForIdentifier(projectData, identifier, "blocks"),
			category: "blocks",
			path: folderPath,
		}

		folder.children.push(entityInfo)
	}

	if (!isRoot && folder.children.length === 1 && isFolder(folder.children[0])) {
		const subfolder = folder.children[0]
		subfolder.name = folder.name + "\\" + subfolder.name
		return subfolder
	}

	return folder
}

export function isFolder(x: any): x is Folder {
	return x && x.type === "folder"
}

// Scripts linked to a given entity/item identifier, for nesting under its group.
// Deduped per file (first annotation wins, so the tree jumps to its line).
export function getScriptsForIdentifier(parsedProject: ParsedProject, identifier: string, category: Category): ScriptLink[] {
	const seen = new Set<string>()
	const links: ScriptLink[] = []
	for (const link of parsedProject.script_links) {
		if (link.identifier !== identifier || link.category !== category || seen.has(link.scriptPath)) {
			continue
		}
		seen.add(link.scriptPath)
		links.push(link)
	}
	return links
}

export function getFilesForIdentifierSymbol(identifier: Symbol, sourceProject: ParsedProject): ProjectFile[] {
	let files = []
	switch (identifier.type) {
		case SymbolType.EntityIdentifier:
			files = getFilesForEntity(sourceProject, identifier.value)
			files.push(...getAssetsForEntity(sourceProject, identifier.value).filter(x => x.fileType !== AddonFileTypes.rp_texture))
			break
		case SymbolType.BlockIdentifier:
			files = getFilesForBlock(sourceProject, sourceProject.bp_blocks[identifier.value])
			files.push(...getAssetsForBlock(sourceProject, sourceProject.bp_blocks[identifier.value]).filter(x => x.fileType !== AddonFileTypes.rp_texture))
			break
		case SymbolType.ItemIdentifier:
			files = getFilesForItem(sourceProject, identifier.value)
			files.push(...getAssetsForItem(sourceProject, identifier.value).filter(x => x.fileType !== AddonFileTypes.rp_texture))
			break
		default:
			throw Error("Identifier type not handled correctly: " + identifier)
	}
	return files
}

// Functions that get all files that are referenced within 
export function getFilesForEntity(parsedProject: ParsedProject, identifier: string): ProjectFile[] {
	const bp_entity = parsedProject.bp_entity[identifier];
	const rp_entity = parsedProject.rp_entity[identifier];

	const projectFiles: ProjectFile[] = [];
	if (bp_entity) {
		projectFiles.push(
			{ fileType: AddonFileTypes.bp_entity, path: bp_entity.path }
		);
		for (const bp_animation of bp_entity.animations) {
			if (parsedProject.bp_anims[bp_animation] !== undefined) {
				const path = parsedProject.bp_anims[bp_animation];
				if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
					continue;
				}
				projectFiles.push(
					{
						fileType: AddonFileTypes.bp_animation,
						path: path
					}
				);
			} else if (parsedProject.bp_animation_controllers[bp_animation] !== undefined) {
				const path = parsedProject.bp_animation_controllers[bp_animation];
				if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
					continue;
				}
				projectFiles.push(
					{
						fileType: AddonFileTypes.bp_animation_controllers,
						path: path
					}
				);
			}
		}
	}
	if (rp_entity) {
		projectFiles.push(
			{ fileType: AddonFileTypes.rp_entity, path: rp_entity.path }
		);
		for (const rp_animation of rp_entity.animations) {
			if (parsedProject.rp_anims[rp_animation] !== undefined) {
				const path = parsedProject.rp_anims[rp_animation];
				if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
					continue;
				}
				projectFiles.push(
					{
						fileType: AddonFileTypes.rp_animation,
						path: path
					}
				);
			} else if (parsedProject.rp_animation_controllers[rp_animation] !== undefined) {
				const path = parsedProject.rp_animation_controllers[rp_animation];
				if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
					continue;
				}
				projectFiles.push(
					{
						fileType: AddonFileTypes.rp_animation_controllers,
						path: path
					}
				);
			}
		}
		for (const rp_ac of rp_entity.seperately_referenced_animation_controllers) {
			if (parsedProject.rp_animation_controllers[rp_ac] !== undefined) {
				const path = parsedProject.rp_animation_controllers[rp_ac];
				if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
					continue;
				}
				projectFiles.push(
					{
						fileType: AddonFileTypes.rp_animation_controllers,
						path: path
					}
				);
			}
		}
		for (const rp_render_controller of rp_entity.render_controllers) {
			const path = parsedProject.rp_render_controllers[rp_render_controller];
			if (!path) {
				// rc does not exist in this project
				continue;
			}
			if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
				continue;
			}
			projectFiles.push(
				{
					fileType: AddonFileTypes.rp_render_controllers,
					path: path
				}
			);
		}
	}

	return projectFiles;
}
export function getFilesForItem(parsedProject: ParsedProject, identifier: string): ProjectFile[] {
	const bp_item = parsedProject.bp_items[identifier];

	const projectFiles: ProjectFile[] = [];
	if (bp_item) {
		projectFiles.push(
			{ fileType: AddonFileTypes.bp_items, path: bp_item.path }
		);

		const attachable = parsedProject.rp_attachables[identifier]

		if (attachable) {
			projectFiles.push(
				{ fileType: AddonFileTypes.rp_attachable, path: attachable.path },
			)
			for (const rp_animation of attachable.animations) {
				if (parsedProject.rp_anims[rp_animation] !== undefined) {
					const path = parsedProject.rp_anims[rp_animation]
					if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
						continue
					}
					projectFiles.push(
						{
							fileType: AddonFileTypes.rp_animation,
							path: path
						}
					)
				} else if (parsedProject.rp_animation_controllers[rp_animation] !== undefined) {
					const path = parsedProject.rp_animation_controllers[rp_animation]
					if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
						continue
					}
					projectFiles.push(
						{
							fileType: AddonFileTypes.rp_animation_controllers,
							path: path
						}
					)
				}
			}
			for (const rp_render_controller of attachable.render_controllers) {
				const path = parsedProject.rp_render_controllers[rp_render_controller]
				if (!path) {
					// rc does not exist in this project
					continue
				}
				if (projectFiles.find((v) => v.path.exactPath === path.exactPath)) {
					continue
				}
				projectFiles.push(
					{
						fileType: AddonFileTypes.rp_render_controllers,
						path: path
					}
				)
			}
		}
	}

	return projectFiles;
}
// TODO: Make getFilesFor___ functions have consistant parameters
export function getFilesForBlock(parsedProject: ParsedProject, block: ParsedProject.BPBlock): ProjectFile[] {
	const files: ProjectFile[] = []
	if (block) {
		files.push(
			{ fileType: AddonFileTypes.bp_block, path: block.path }
		)
	}

	for (const rule of block.cullingRules) {
		const cullingRule = parsedProject.rp_block_culling_rules[rule]
		if (cullingRule) {
			files.push(
				{ fileType: AddonFileTypes.rp_block_culling_rule, path: cullingRule }
			)
		}
	}

	return files
}

export function getAssetsForEntity(parsedProject: ParsedProject, identifier: string): ProjectFile[] {
	const rp_entity = parsedProject.rp_entity[identifier];

	if (rp_entity === undefined) {
		return []
	}

	const files: ProjectFile[] = []

	for (const modelIdentifier of rp_entity.models) {
		const modelPath = parsedProject["rp_models"][modelIdentifier]
		if (modelPath === undefined) continue
		if (files.find((v) => v.path.exactPath === modelPath.exactPath)) {
			continue;
		}

		files.push({
			fileType: AddonFileTypes.rp_model,
			path: modelPath
		})
	}

	for (const textureIdentifier of rp_entity.textures) {
		const texture = parsedProject.rp_textures[textureIdentifier]
		if (texture === undefined) continue
		for (const textureFile of texture.files) {
			files.push({
				fileType: AddonFileTypes.rp_texture,
				path: textureFile
			})
		}
	}

	return files
}

export function getAssetsForBlock(parsedProject: ParsedProject, bp_block: ParsedProject.BPBlock): ProjectFile[] {
	const files: ProjectFile[] = []

	for (const modelIdentifier of bp_block.models) {
		const modelPath = parsedProject["rp_models"][modelIdentifier]
		if (modelPath === undefined) continue
		if (files.find((v) => v.path.exactPath === modelPath.exactPath)) {
			continue;
		}

		files.push({
			fileType: AddonFileTypes.rp_model,
			path: modelPath
		})
	}

	for (const textureIdentifier of bp_block.textures) {
		// TODO: Show error objects if it doesn't exist
		const texture = parsedProject.rp_textures[textureIdentifier]
		if (texture === undefined) continue
		for (const textureFile of texture.files) {
			files.push({
				fileType: AddonFileTypes.rp_texture,
				path: textureFile
			})
		}
	}

	return files
}

export function getAssetsForItem(parsedProject: ParsedProject, identifier: string): ProjectFile[] {
	const bp_items = parsedProject.bp_items[identifier];

	if (bp_items === undefined) {
		return []
	}

	const files: ProjectFile[] = []

	for (const textureIdentifier of bp_items.textures) {
		// TODO: Show error objects if it doesn't exist
		const texture = parsedProject.rp_textures[textureIdentifier]
		if (texture === undefined) continue
		for (const textureFile of texture.files) {
			files.push({
				fileType: AddonFileTypes.rp_texture,
				path: textureFile
			})
		}
	}

	return files
}