import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import * as JSONC from "jsonc-parser"

export type Node = Root | Folder | NodeInfo

export type Folder = {
	type: "folder"
	name: string
	path: string
	children: (NodeInfo | Folder)[],
	category: Category
}
export type NodeInfo = {
	type: "entity",
	identifier: string,
	path: string
	files: ProjectFile[],
	category: Category
}

export type ProjectFile = { fileType: FileTypes, path: string }

type Category = "entities" | "items"
export type Root = {
	type: "root",
	rootType: Category
}

// identifier: string
// TODO: make all values arrays to account for duplicates
type ParsedProject = {
	// RP
	"rp_entity": Record<string, {
		path: string
		animations: string[],
		render_controllers: string[],
	}>
	"rp_attachables": Record<string, {
		path: string
		animations: string[],
		render_controllers: string[],
	}>
	"rp_anims": Record<string, string>,
	"rp_animation_controllers": Record<string, string>,
	"rp_render_controllers": Record<string, string>,

	// BP
	"bp_entity": Record<string, {
		path: string
		animations: string[],
	}>
	"bp_anims": Record<string, string>,
	"bp_animation_controllers": Record<string, string>,
	"bp_items": Record<string, string>,
}

export enum FileTypes {
	bp_entity,
	rp_entity,
	rp_animation,
	bp_animation,
	rp_animation_controllers,
	bp_animation_controllers,
	rp_render_controllers,
	bp_items,
	rp_attachable,
}

export const file_type_names: Record<FileTypes, string> = {
	[FileTypes.bp_entity]: "bp/entities",
	[FileTypes.rp_entity]: "rp/entity",
	[FileTypes.rp_animation]: "rp/animations",
	[FileTypes.bp_animation]: "bp/animations",
	[FileTypes.rp_animation_controllers]: "rp/animation_controllers",
	[FileTypes.bp_animation_controllers]: "bp/animation_controllers",
	[FileTypes.rp_render_controllers]: "rp/render_controllers",
	[FileTypes.bp_items]: "bp/items",
	[FileTypes.rp_attachable]: "rp/attachables",
}

export function getProjectData() {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	if (rootPath === undefined) {
		return
	}
	const configPath = rootPath + "/config.json"
	if (!fs.existsSync(configPath)) {
		vscode.window.showErrorMessage("Unable to find config.json")
		return
	}
	const config = JSONC.parse(fs.readFileSync(configPath).toString())

	const behaviorPackDir = path.join(rootPath, config.packs.behaviorPack)
	const resourcePackDir = path.join(rootPath, config.packs.resourcePack)
	if (!fs.existsSync(behaviorPackDir)) {
		vscode.window.showErrorMessage("Unable to find BP")
		return
	}
	if (!fs.existsSync(resourcePackDir)) {
		vscode.window.showErrorMessage("Unable to find RP")
		return
	}

	const minEngineVersion = [1,26,0]
	const defaultFormatVersion = minEngineVersion.join(".")

	return {resourcePackDir, behaviorPackDir, minEngineVersion, defaultFormatVersion}
}

export function parseProject(): (ParsedProject | void) {
	const projectData = getProjectData()
	if (projectData === undefined) {
		return
	}
	const {resourcePackDir, behaviorPackDir} = projectData

	const rp_entities: ParsedProject["rp_entity"] = {}
	const rp_entity_files = fs.globSync(path.join(resourcePackDir, "./entity/**/*.json"))
	for (const entity_path of rp_entity_files) {
		const entity_file = fs.readFileSync(entity_path).toString()
		const rp_entity = JSONC.parse(entity_file)
		const identifier = rp_entity["minecraft:client_entity"].description.identifier

		const render_controllers: string[] = []
		if (rp_entity["minecraft:client_entity"].description.render_controllers) {
			for (const rc of rp_entity["minecraft:client_entity"].description.render_controllers) {
				if (typeof rc === "string") {
					render_controllers.push(rc)
				} else if (typeof rc === "object") {
					for (const key of Object.keys(rc)) {
						render_controllers.push(key)
					}
				} else {
					console.error("unexpected typeof rc")
				}
			}
		}

		rp_entities[identifier] = {
			path: entity_path,
			animations: rp_entity["minecraft:client_entity"].description.animations ? Object.values(rp_entity["minecraft:client_entity"].description.animations) : [],
			render_controllers
		}
	}

	const rp_attachables: ParsedProject["rp_attachables"] = {}
	const rp_attachable_files = fs.globSync(path.join(resourcePackDir, "./attachables/**/*.json"))
	for (const entity_path of rp_attachable_files) {
		const entity_file = fs.readFileSync(entity_path).toString()
		const rp_entity = JSONC.parse(entity_file)
		const identifier = rp_entity["minecraft:attachable"].description.identifier

		const render_controllers: string[] = []
		if (rp_entity["minecraft:attachable"].description.render_controllers) {
			for (const rc of rp_entity["minecraft:attachable"].description.render_controllers) {
				if (typeof rc === "string") {
					render_controllers.push(rc)
				} else if (typeof rc === "object") {
					for (const key of Object.keys(rc)) {
						render_controllers.push(key)
					}
				} else {
					console.error("unexpected typeof rc")
				}
			}
		}

		rp_attachables[identifier] = {
			path: entity_path,
			animations: rp_entity["minecraft:attachable"].description.animations ? Object.values(rp_entity["minecraft:attachable"].description.animations) : [],
			render_controllers
		}
	}

	const rp_anims: ParsedProject["rp_anims"] = {}
	const rp_anim_files = fs.globSync(path.join(resourcePackDir, "./animations/**/*.json"))
	for (const path of rp_anim_files) {
		const file = fs.readFileSync(path).toString()
		const animations = JSONC.parse(file)
		for (const anim in animations.animations) {
			rp_anims[anim] = path
		}
	}

	const bp_anims: ParsedProject["bp_anims"] = {}
	const bp_anim_files = fs.globSync(path.join(behaviorPackDir, "./animations/**/*.json"))
	for (const path of bp_anim_files) {
		const file = fs.readFileSync(path).toString()
		const animations = JSONC.parse(file)
		for (const anim in animations.animations) {
			bp_anims[anim] = path
		}
	}

	const rp_animation_controllers: ParsedProject["rp_animation_controllers"] = {}
	const rp_animation_controller_files = fs.globSync(path.join(resourcePackDir, "./animation_controllers/**/*.json"))
	for (const path of rp_animation_controller_files) {
		const file = fs.readFileSync(path).toString()
		const animations = JSONC.parse(file)
		for (const anim in animations.animation_controllers) {
			rp_animation_controllers[anim] = path
		}
	}

	const bp_animation_controllers: ParsedProject["bp_animation_controllers"] = {}
	const bp_animation_controller_files = fs.globSync(path.join(behaviorPackDir, "./animation_controllers/**/*.json"))
	for (const path of bp_animation_controller_files) {
		const file = fs.readFileSync(path).toString()
		const animations = JSONC.parse(file)
		for (const anim in animations.animation_controllers) {
			bp_animation_controllers[anim] = path
		}
	}

	const rp_render_controllers: ParsedProject["rp_render_controllers"] = {}
	const rp_rc_files = fs.globSync(path.join(resourcePackDir, "./render_controllers/**/*.json"))
	for (const path of rp_rc_files) {
		const file = fs.readFileSync(path).toString()
		const rc = JSONC.parse(file)
		for (const anim in rc.render_controllers) {
			rp_render_controllers[anim] = path
		}
	}

	const bp_entities: ParsedProject["bp_entity"] = {}
	const bp_entity_files = fs.globSync(path.join(behaviorPackDir, "./entities/**/*.json"))
	for (const entity_path of bp_entity_files) {
		const entity_file = fs.readFileSync(entity_path).toString()
		const entity = JSONC.parse(entity_file)
		const identifier = entity["minecraft:entity"].description.identifier

		bp_entities[identifier] = {
			path: entity_path,
			animations: entity["minecraft:entity"].description.animations ? Object.values(entity["minecraft:entity"].description.animations) : [],
		}
	}

	const bp_items: ParsedProject["bp_items"] = {}
	const bp_item_files = fs.globSync(path.join(behaviorPackDir, "./items/**/*.json"))
	for (const path of bp_item_files) {
		const file = fs.readFileSync(path).toString()
		const item = JSONC.parse(file)
		const identifier = item["minecraft:item"].description.identifier

		bp_items[identifier] = path
	}

	const parsedProject: ParsedProject = {
		rp_entity: rp_entities,
		rp_anims: rp_anims,
		bp_anims: bp_anims,
		bp_animation_controllers,
		rp_animation_controllers,
		rp_render_controllers,
		bp_entity: bp_entities,

		bp_items: bp_items,
		rp_attachables: rp_attachables,
	}
	return parsedProject
	// return parseEntitiesInFolder(path.join(behaviorPackDir, "./entities/"), projectData, true)
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
		const [identifier, bp_entity] = Object.entries(projectData.bp_entity).find(([_, v]) => v.path === BPEntityFile) ?? []

		if (identifier === undefined || bp_entity === undefined) {
			continue
		}
		entityIdentifiers.push(identifier)
	}
	for (const RPEntityFile of RPEntityFiles) {
		const [identifier, rp_entity] = Object.entries(projectData.rp_entity).find(([_, v]) => v.path === RPEntityFile) ?? []

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
		const bp_entity = projectData.bp_entity[identifier]
		const rp_entity = projectData.rp_entity[identifier]

		const entityInfo: NodeInfo = {
			type: "entity",
			identifier: identifier,
			files: [],
			category: "entities",
			path: folderPath
		}
		if (bp_entity) {
			entityInfo.files.push(
				{ fileType: FileTypes.bp_entity, path: bp_entity.path },
			)
			for (const bp_animation of bp_entity.animations) {
				if (projectData.bp_anims[bp_animation] !== undefined) {
					const path = projectData.bp_anims[bp_animation]
					if (entityInfo.files.find((v) => v.path === path)) {
						continue
					}
					entityInfo.files.push(
						{
							fileType: FileTypes.bp_animation,
							path: path
						}
					)
				} else if (projectData.bp_animation_controllers[bp_animation] !== undefined) {
					const path = projectData.bp_animation_controllers[bp_animation]
					if (entityInfo.files.find((v) => v.path === path)) {
						continue
					}
					entityInfo.files.push(
						{
							fileType: FileTypes.bp_animation_controllers,
							path: path
						}
					)
				}
			}
		}
		if (rp_entity) {
			entityInfo.files.push(
				{ fileType: FileTypes.rp_entity, path: rp_entity.path },
			)
			for (const rp_animation of rp_entity.animations) {
				if (projectData.rp_anims[rp_animation] !== undefined) {
					const path = projectData.rp_anims[rp_animation]
					if (entityInfo.files.find((v) => v.path === path)) {
						continue
					}
					entityInfo.files.push(
						{
							fileType: FileTypes.rp_animation,
							path: path
						}
					)
				} else if (projectData.rp_animation_controllers[rp_animation] !== undefined) {
					const path = projectData.rp_animation_controllers[rp_animation]
					if (entityInfo.files.find((v) => v.path === path)) {
						continue
					}
					entityInfo.files.push(
						{
							fileType: FileTypes.rp_animation_controllers,
							path: path
						}
					)
				}
			}
			for (const rp_render_controller of rp_entity.render_controllers) {
				const path = projectData.rp_render_controllers[rp_render_controller]
				if (!path) {
					// rc does not exist in this project
					continue
				}
				if (entityInfo.files.find((v) => v.path === path)) {
					continue
				}
				entityInfo.files.push(
					{
						fileType: FileTypes.rp_render_controllers,
						path: path
					}
				)
			}
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
		const [identifier, bp_item] = Object.entries(projectData.bp_items).find(([_, path]) => path === BPItemFile) ?? []

		if (identifier === undefined || bp_item === undefined) {
			continue
		}

		const attachable = projectData.rp_attachables[identifier]

		const entityInfo: NodeInfo = {
			type: "entity",
			identifier: identifier,
			files: [
				{ fileType: FileTypes.bp_items, path: BPItemFile },
			],
			category: "items",
			path: folderPath
		}
		if (attachable) {
			entityInfo.files.push(
				{ fileType: FileTypes.rp_attachable, path: attachable.path },
			)
			for (const rp_animation of attachable.animations) {
				if (projectData.rp_anims[rp_animation] !== undefined) {
					const path = projectData.rp_anims[rp_animation]
					if (entityInfo.files.find((v) => v.path === path)) {
						continue
					}
					entityInfo.files.push(
						{
							fileType: FileTypes.rp_animation,
							path: path
						}
					)
				} else if (projectData.rp_animation_controllers[rp_animation] !== undefined) {
					const path = projectData.rp_animation_controllers[rp_animation]
					if (entityInfo.files.find((v) => v.path === path)) {
						continue
					}
					entityInfo.files.push(
						{
							fileType: FileTypes.rp_animation_controllers,
							path: path
						}
					)
				}
			}
			for (const rp_render_controller of attachable.render_controllers) {
				const path = projectData.rp_render_controllers[rp_render_controller]
				if (!path) {
					// rc does not exist in this project
					continue
				}
				if (entityInfo.files.find((v) => v.path === path)) {
					continue
				}
				entityInfo.files.push(
					{
						fileType: FileTypes.rp_render_controllers,
						path: path
					}
				)
			}
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

