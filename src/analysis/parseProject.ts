import * as path from 'path';
import * as fs from 'fs';

import * as JSONC from "jsonc-parser"
import { SymbolValue } from './symbols';
import { parseScriptAnnotations } from './scriptLinks';

// A resolved link between a script file and an entity/item identifier, declared
// via a `// @lantern [...]` (whole-file) or `// @lantern:region [...]` (span)
// annotation. Lives outside RP/BP so it carries a plain absolute path rather
// than FilePathData. Line numbers are 0-based.
export type ScriptLink = {
	scriptPath: string,
	relativePath: string,            // path relative to scriptsDir, for display
	identifier: string,
	source: "file" | "region",
	range?: { startLine: number, endLine: number },
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
	const newFilePath = {...filePath}
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
	}>
	"rp_attachables": Record<SymbolValue, {
		path: FilePathData
		animations: string[],
		render_controllers: string[],
	}>
	"rp_anims": Record<SymbolValue, FilePathData>,
	"rp_animation_controllers": Record<SymbolValue, FilePathData>,
	"rp_render_controllers": Record<SymbolValue, FilePathData>,

	// BP
	"bp_entity": Record<SymbolValue, {
		path: FilePathData
		animations: string[],
	}>
	"bp_anims": Record<SymbolValue, FilePathData>,
	"bp_animation_controllers": Record<SymbolValue, FilePathData>,


	"bp_items": Record<SymbolValue, FilePathData>,

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
		rp_entity["minecraft:client_entity"].description.animation_controllers.map((x: {[ac: string]: string}) => Object.values(x)).flat() : []

		rp_entities[identifier] = {
			path: getDetailedPathInfo(resourcePackDir, behaviorPackDir, entity_path),
			animations: animations as string[],
			seperately_referenced_animation_controllers: seperately_referenced_animation_controllers as string[],
			
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

	const bp_items: ParsedProject["bp_items"] = {}
	const bp_item_files = fs.globSync(path.join(behaviorPackDir, "./items/**/*.json"))
	for (const path of bp_item_files) {
		const file = fs.readFileSync(path).toString()
		const item = JSONC.parse(file)
		const identifier = item["minecraft:item"].description.identifier

		bp_items[identifier] = getDetailedPathInfo(resourcePackDir, behaviorPackDir, path)
	}

	const script_links: ScriptLink[] = []
	if (scanRoot && fs.existsSync(scanRoot)) {
		// Identifiers we can legitimately link to. Matching annotations against
		// this set lets us ignore typos / renamed ids (surfaced as diagnostics).
		const knownIdentifiers = new Set<string>([
			...Object.keys(rp_entities),
			...Object.keys(bp_entities),
			...Object.keys(bp_items),
		])

		for (const scriptFile of findScriptFiles(scanRoot)) {
			const content = fs.readFileSync(scriptFile).toString()
			const annotations = parseScriptAnnotations(content)
			if (annotations.length === 0) {
				continue
			}
			const relativePath = path.relative(scanRoot, scriptFile)
			for (const annotation of annotations) {
				for (const identifier of annotation.identifiers) {
					if (!knownIdentifiers.has(identifier)) {
						continue
					}
					script_links.push({
						scriptPath: scriptFile,
						relativePath,
						identifier,
						source: annotation.source,
						range: annotation.range,
					})
				}
			}
		}
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

		bp_items: bp_items,
		rp_attachables: rp_attachables,

		script_links,
	}
	return parsedProject
}