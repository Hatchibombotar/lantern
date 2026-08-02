import * as path from 'path';
import * as fs from 'fs';

import * as JSONC from "jsonc-parser"
import { SymbolValue } from './symbols';
import { parseScriptAnnotations, ScriptAnnotation } from './scriptLinks';

// A `@lantern-links-*` annotation resolved to the file it was found in. Lives
// anywhere in the workspace, so it carries a plain absolute path rather than
// FilePathData. `relativePath` is workspace-relative, for display.
export type ScriptLink = ScriptAnnotation & {
	scriptPath: string,
	relativePath: string,
}

export type FilePathData = {
	relativePath: string, // the path relative to the RP/BP directory. e.g. entity\awesome.entity.json
	rootType: "bp" | "rp",
	exactPath: string,
}

export function filePathsEqual(a: FilePathData, b: FilePathData) {
	return a.exactPath === b.exactPath
}

export function changeFilePathBase(filePath: FilePathData, resourcePackDir: string, behaviorPackDir: string) {
	const newFilePath = { ...filePath }
	if (newFilePath.rootType === "bp") {
		newFilePath.exactPath = path.join(behaviorPackDir, newFilePath.relativePath)
	} else {
		newFilePath.exactPath = path.join(resourcePackDir, newFilePath.relativePath)
	}
	return newFilePath
}

// identifier: string
// TODO: consider making all values arrays to account for duplicates
export type ParsedProject = {
	resourcePackDir: string,
	behaviorPackDir: string,

	// RP
	"rp_entity": Record<SymbolValue, {
		path: FilePathData
		animations: string[],
		seperately_referenced_animation_controllers: string[] // used for the 1.8.0 client entity format version as they are not referenced within the animations key.
		// TODO: make stored location of animation controllers consistent.
		render_controllers: string[],

		models: SymbolValue[]
		textures: string[]
	}>
	"rp_attachables": Record<SymbolValue, {
		path: FilePathData
		animations: string[],
		render_controllers: string[],
	}>
	"rp_anims": Record<SymbolValue, FilePathData>,
	"rp_animation_controllers": Record<SymbolValue, FilePathData>,
	"rp_render_controllers": Record<SymbolValue, FilePathData>,

	"rp_block_culling_rules": Record<SymbolValue, FilePathData>

	"rp_models": Record<SymbolValue, FilePathData>

	// The key is the path used in game e.g. textures/entity/creeper/creeper
	// The files are all files that match the path e.g. png, tga, texture set files
	"rp_textures": Record<string, {
		files: FilePathData[]
	}>

	// BP
	"bp_entity": Record<SymbolValue, {
		path: FilePathData
		animations: string[],
	}>
	"bp_anims": Record<SymbolValue, FilePathData>,
	"bp_animation_controllers": Record<SymbolValue, FilePathData>,


	"bp_items": Record<SymbolValue, FilePathData>,

	"bp_blocks": Record<SymbolValue, {
		path: FilePathData,
		cullingRules: string[],
		models: SymbolValue[],

		textureShortnames: SymbolValue[]
		textures: string[]
	}>,

	"script_links": ScriptLink[],
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
	bp_block,
	rp_attachable,
	rp_block_culling_rule,

	rp_model,
	rp_texture,
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
	[FileTypes.bp_block]: "bp/blocks",
	[FileTypes.rp_block_culling_rule]: "rp/block_culling",
	[FileTypes.rp_model]: "rp/models",
	[FileTypes.rp_texture]: "rp/textures",
}

export function getDetailedPathInfo(resourcePackDir: string, behaviorPackDir: string, exactPath: string): FilePathData {
	let rootType: FilePathData['rootType'];
	let relativePath: FilePathData['relativePath'];
	if (exactPath.startsWith(resourcePackDir)) {
		rootType = 'rp'
		relativePath = path.relative(resourcePackDir, exactPath)
	} else if (exactPath.startsWith(behaviorPackDir)) {
		rootType = 'bp'
		relativePath = path.relative(behaviorPackDir, exactPath)
	} else {
		console.log(resourcePackDir, behaviorPackDir, exactPath)
		throw Error("Cannot categorise file.")
	}

	return {
		relativePath: relativePath,
		rootType: rootType,
		exactPath: exactPath
	}

}

// Directories never worth scanning for @lantern annotations.
const EXCLUDED_SCAN_DIRS = new Set(["node_modules", "out", "dist", "build", ".git"])

// Recursively collect .ts/.js files under root, pruning excluded directories so
// we never descend into node_modules etc. (much cheaper than glob + filter).
function findScriptFiles(root: string): string[] {
	const found: string[] = []
	const stack = [root]
	while (stack.length > 0) {
		const dir = stack.pop()!
		let entries: import('fs').Dirent[]
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true })
		} catch {
			continue
		}
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				if (!EXCLUDED_SCAN_DIRS.has(entry.name)) {
					stack.push(fullPath)
				}
			} else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
				found.push(fullPath)
			}
		}
	}
	return found
}

export function parseProject(resourcePackDir: string, behaviorPackDir: string, scanRoot?: string): (ParsedProject | void) {
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

		const animations = rp_entity["minecraft:client_entity"].description.animations ? Object.values(rp_entity["minecraft:client_entity"].description.animations) : []

		// FINISH
		const seperately_referenced_animation_controllers =
			rp_entity["minecraft:client_entity"].description.animation_controllers ?
				rp_entity["minecraft:client_entity"].description.animation_controllers.map((x: { [ac: string]: string }) => Object.values(x)).flat() : []


		const models = Object.values(rp_entity["minecraft:client_entity"].description.geometry)
		const textures = Object.values(rp_entity["minecraft:client_entity"].description.textures)

		rp_entities[identifier] = {
			path: getDetailedPathInfo(resourcePackDir, behaviorPackDir, entity_path),
			animations: animations as string[],
			seperately_referenced_animation_controllers: seperately_referenced_animation_controllers as string[],

			models: models as string[],
			textures: textures as string[],

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
			path: getDetailedPathInfo(resourcePackDir, behaviorPackDir, entity_path),
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
			rp_anims[anim] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
		}
	}

	const bp_anims: ParsedProject["bp_anims"] = {}
	const bp_anim_files = fs.globSync(path.join(behaviorPackDir, "./animations/**/*.json"))
	for (const path of bp_anim_files) {
		const file = fs.readFileSync(path).toString()
		const animations = JSONC.parse(file)
		for (const anim in animations.animations) {
			bp_anims[anim] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
		}
	}

	const rp_animation_controllers: ParsedProject["rp_animation_controllers"] = {}
	const rp_animation_controller_files = fs.globSync(path.join(resourcePackDir, "./animation_controllers/**/*.json"))
	for (const path of rp_animation_controller_files) {
		const file = fs.readFileSync(path).toString()
		const animations = JSONC.parse(file)
		for (const anim in animations.animation_controllers) {
			rp_animation_controllers[anim] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
		}
	}

	const bp_animation_controllers: ParsedProject["bp_animation_controllers"] = {}
	const bp_animation_controller_files = fs.globSync(path.join(behaviorPackDir, "./animation_controllers/**/*.json"))
	for (const path of bp_animation_controller_files) {
		const file = fs.readFileSync(path).toString()
		const animations = JSONC.parse(file)
		for (const anim in animations.animation_controllers) {
			bp_animation_controllers[anim] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
		}
	}

	const rp_render_controllers: ParsedProject["rp_render_controllers"] = {}
	const rp_rc_files = fs.globSync(path.join(resourcePackDir, "./render_controllers/**/*.json"))
	for (const path of rp_rc_files) {
		const file = fs.readFileSync(path).toString()
		const rc = JSONC.parse(file)
		for (const anim in rc.render_controllers) {
			rp_render_controllers[anim] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
		}
	}

	const bp_entities: ParsedProject["bp_entity"] = {}
	const bp_entity_files = fs.globSync(path.join(behaviorPackDir, "./entities/**/*.json"))
	for (const entity_path of bp_entity_files) {
		const entity_file = fs.readFileSync(entity_path).toString()
		const entity = JSONC.parse(entity_file)
		const identifier = entity["minecraft:entity"].description.identifier

		bp_entities[identifier] = {
			path: getDetailedPathInfo(resourcePackDir, behaviorPackDir, entity_path),
			animations: entity["minecraft:entity"].description.animations ? Object.values(entity["minecraft:entity"].description.animations) : [],
		}
	}

	// ITEMS
	const bp_items: ParsedProject["bp_items"] = {}
	const bp_item_files = fs.globSync(path.join(behaviorPackDir, "./items/**/*.json"))
	for (const path of bp_item_files) {
		const file = fs.readFileSync(path).toString()
		const item = JSONC.parse(file)
		const identifier = item["minecraft:item"].description.identifier

		bp_items[identifier] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
	}

	// BLOCKS
	const rp_block_culling_rules: ParsedProject["rp_block_culling_rules"] = {}
	const culling_rule_files = fs.globSync(path.join(resourcePackDir, "./block_culling/**/*.json"))
	for (const path of culling_rule_files) {
		const file = fs.readFileSync(path).toString()
		const item = JSONC.parse(file)
		const identifier = item["minecraft:block_culling_rules"].description.identifier

		rp_block_culling_rules[identifier] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
	}

	const terrainTexturePath = path.join(resourcePackDir, "textures/terrain_texture.json")
	let terrainTextureData;
	if (fs.existsSync(terrainTexturePath)) {
		const terrainTextureFile = fs.readFileSync(terrainTexturePath).toString()
		const terrainTexture = JSONC.parse(terrainTextureFile)

		terrainTextureData = terrainTexture["texture_data"]
	}

	const blocksJsonPath = path.join(resourcePackDir, "blocks.json")
	let blocksJsonData: Record<string, any> | undefined = undefined;
	if (fs.existsSync(blocksJsonPath)) {
		const blocksJsonFile = fs.readFileSync(blocksJsonPath).toString()
		const blocksJson = JSONC.parse(blocksJsonFile)

		blocksJsonData = {}

		for (let [k, v] of Object.entries(blocksJson)) {
			if (!k.includes(":")) {
				k = "minecraft:" + k
			}
			blocksJsonData[k] = v
		}
		blocksJsonData = blocksJson
	}

	const bp_blocks: ParsedProject["bp_blocks"] = {}
	const bp_block_files = fs.globSync(path.join(behaviorPackDir, "./blocks/**/*.json"))
	for (const path of bp_block_files) {
		const file = fs.readFileSync(path).toString()
		const item = JSONC.parse(file)
		const identifier = item["minecraft:block"].description.identifier

		const geometryComponents = getAllInstancesOfComponentInJSON(item, "minecraft:block", "minecraft:geometry")

		const cullingIdentifiers: SymbolValue[] = []
		const models: SymbolValue[] = []
		for (const geo of geometryComponents) {
			if (!models.includes(geo.identifier)) {
				models.push(geo.identifier)
			}
			if (geo.culling && !cullingIdentifiers.includes(geo.culling)) {
				cullingIdentifiers.push(geo.culling)
			}
		}

		const materialInstanceComponents = getAllInstancesOfComponentInJSON(item, "minecraft:block", "minecraft:material_instances")
		const textureShortnames: SymbolValue[] = []
		for (const component of materialInstanceComponents) {
			for (const faceMaterial of Object.values<any>(component)) {
				const texture = faceMaterial.texture
				if (!textureShortnames.includes(texture)) {
					textureShortnames.push(texture)
				}
			}
		}

		if (blocksJsonData && blocksJsonData[identifier]) {
			if (typeof blocksJsonData[identifier].textures === "string") {
				textureShortnames.push(blocksJsonData[identifier].textures)
			} else if (typeof blocksJsonData[identifier] === "object") {
				textureShortnames.push(...Object.values(blocksJsonData[identifier].textures) as any)
			}
		}

		
		const textures: string[] = []
		if (terrainTextureData) {
			for (const shortname of textureShortnames) {
				const textureData = terrainTextureData[shortname]?.textures
				if (typeof textureData === "object" && Array.isArray(textureData)) {
					textures.push(...textureData.map((x: any) => {
						if (typeof x === "string") {
							return x
						} else {
							return x.path
						}
					}))
				} else {
					textures.push(textureData)
				}
			}
		}

		bp_blocks[identifier] = {
			path: getDetailedPathInfo(resourcePackDir, behaviorPackDir, path),
			cullingRules: cullingIdentifiers,
			models,
			textureShortnames,
			textures,
		}
	}


	const rp_models: ParsedProject["rp_models"] = {}
	const rp_model_files = fs.globSync(path.join(resourcePackDir, "./models/**/*.json"))
	for (const path of rp_model_files) {
		const file = fs.readFileSync(path).toString()
		const parsedFile = JSONC.parse(file)

		for (const model of parsedFile["minecraft:geometry"]) {
			const identifier = model.description.identifier

			rp_models[identifier] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
		}
	}

	// SCRIPTS

	const script_links: ScriptLink[] = []
	if (scanRoot && fs.existsSync(scanRoot)) {
		// Identifiers we can legitimately link to, by category. Matching against
		// these lets us drop typos / renamed ids (surfaced as diagnostics).
		const knownEntities = new Set<string>([...Object.keys(rp_entities), ...Object.keys(bp_entities)])
		const knownItems = new Set<string>(Object.keys(bp_items))

		for (const scriptFile of findScriptFiles(scanRoot)) {
			const content = fs.readFileSync(scriptFile).toString()
			const annotations = parseScriptAnnotations(content)
			if (annotations.length === 0) {
				continue
			}
			const relativePath = path.relative(scanRoot, scriptFile)
			for (const annotation of annotations) {
				const known = annotation.category === "entities" ? knownEntities : knownItems
				if (!known.has(annotation.identifier)) {
					continue
				}
				script_links.push({ ...annotation, scriptPath: scriptFile, relativePath })
			}
		}
	}

	const rp_texture_dir_files = fs.globSync(path.join(resourcePackDir, "./textures/**/*.{json,tga,png,jpg,jpeg}"))
	const rp_textures: ParsedProject["rp_textures"] = {}
	for (const file of rp_texture_dir_files) {
		const parsedPath = path.parse(file)

		const inGameTexturePath = path.relative(
			resourcePackDir,
			path.join(parsedPath.dir, parsedPath.name)
		)
		if (rp_textures[inGameTexturePath] === undefined) {
			rp_textures[inGameTexturePath] = {
				files: []
			}
		}
		rp_textures[inGameTexturePath].files.push(
			getDetailedPathInfo(resourcePackDir, behaviorPackDir, file)
		)
	}



	const parsedProject: ParsedProject = {
		resourcePackDir: resourcePackDir,
		behaviorPackDir: behaviorPackDir,

		rp_entity: rp_entities,
		rp_anims: rp_anims,
		bp_anims: bp_anims,
		bp_animation_controllers,
		rp_animation_controllers,
		rp_render_controllers,
		bp_entity: bp_entities,

		rp_models: rp_models,
		rp_textures,

		bp_items: bp_items,
		rp_attachables: rp_attachables,

		bp_blocks: bp_blocks,
		rp_block_culling_rules: rp_block_culling_rules,

		script_links,
	}
	return parsedProject
}

function getAllInstancesOfComponentInJSON(file: any, rootObject: string, componentName: string): any[] {
	const instances: any[] = []
	for (const [componentKey, componentValue] of Object.entries(file[rootObject]?.components ?? {})) {
		if (componentKey === componentName) {
			instances.push(componentValue)
		}
	}

	for (const permutation of file[rootObject]?.permutations ?? []) {
		for (const [componentKey, componentValue] of Object.entries(permutation?.components ?? {})) {
			if (componentKey === componentName) {
				instances.push(componentValue)
			}
		}
	}

	return instances
}