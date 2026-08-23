import * as path from 'path';
import * as fs from 'fs';

import * as JSONC from "jsonc-parser"
import { ItemTextureAtlas, ParsedProject, ScriptLink, TerrainTextureAtlas } from './ParsedProject';
import { ProjectParseError } from "./ParsedProject";
import { FilePathData, getDetailedPathInfo } from '../FilePathData';
import { SymbolValue } from './symbols';
import { parseScriptAnnotations } from './scriptLinks';

export class ProjectParser {
    resourcePackDir: string
    behaviorPackDir: string
    scanRoot?: string

    errors: ProjectParseError[]

    constructor(resourcePackDir: string, behaviorPackDir: string, scanRoot?: string) {
        this.resourcePackDir = resourcePackDir
        this.behaviorPackDir = behaviorPackDir
        this.scanRoot = scanRoot
        this.errors = []
    }

    public parseAll() {
        const rpEntities = this.parseRPEntities()
        const bpEntities = this.parseBPEntities()
        const bpItems = this.parseBPItems()
        const bpBlocks = this.parseBPBlocks()

        const parsedProject: ParsedProject = {
            resourcePackDir: this.resourcePackDir,
            behaviorPackDir: this.behaviorPackDir,
            rp_entity: rpEntities,
            rp_attachables: this.parseRPAttachables(),
            rp_anims: this.parseRPAnimations(),
            rp_animation_controllers: this.parseRPAnimationControllers(),
            rp_render_controllers: this.parseRPRenderControllers(),
            rp_block_culling_rules: this.parseRPCullingRules(),
            rp_models: this.parseRPModels(),
            rp_textures: this.parseRPTextures(),
            bp_entity: bpEntities,
            bp_anims: this.parseBPAnimations(),
            bp_animation_controllers: this.parseBPAnimationControllers(),
            bp_items: bpItems,
            bp_blocks: bpBlocks,
            script_links: this.parseScriptLinks(rpEntities, bpEntities, bpItems, bpBlocks),
            errors: [],
        }

        parsedProject.errors = this.errors

        return parsedProject
    }

    private addError(message: string, path: string) {
        this.errors.push(
            { message, path }
        )
    }
    private addJSONParseErrors(errors: JSONC.ParseError[], path: string) {
        for (const e of errors) {
            this.errors.push({
                message: "Invalid JSON" + JSONC.printParseErrorCode(e.error) + e.offset,
                path
            })
        }
    }

    public getAllFiles(): FilePathData[] {
        const files: FilePathData[] = []
        const rpfiles = fs.globSync("**/*.*", { cwd: this.resourcePackDir })
        const bpfiles = fs.globSync("**/*.*", { cwd: this.behaviorPackDir })

        for (const file of rpfiles) {
            files.push({
                exactPath: path.join(this.resourcePackDir, file),
                relativePath: file,
                rootType: "rp"
            })
        }
        for (const file of bpfiles) {
            files.push({
                exactPath: path.join(this.behaviorPackDir, file),
                relativePath: file,
                rootType: "bp"
            })
        }

        return files
    }

    private parseRPEntities(): ParsedProject["rp_entity"] {
        const rp_entities: ParsedProject["rp_entity"] = {}
        const rp_entity_files = fs.globSync(path.join(this.resourcePackDir, "./entity/**/*.json"))
        for (const path of rp_entity_files) {
            const fileString = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(fileString, errors)
            this.addJSONParseErrors(errors, path)

            const identifier = parsedFile["minecraft:client_entity"]?.description?.identifier

            if (typeof identifier !== "string") {
                this.addError("Unable to parse identifier", path)
                continue
            }

            const render_controllers: string[] = []
            if (parsedFile["minecraft:client_entity"]?.description?.render_controllers) {
                for (const rc of parsedFile["minecraft:client_entity"].description.render_controllers) {
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

            const animations = parsedFile["minecraft:client_entity"]?.description?.animations ? Object.values(parsedFile["minecraft:client_entity"]?.description?.animations) : []

            // FINISH
            const seperately_referenced_animation_controllers =
                parsedFile["minecraft:client_entity"]?.description?.animation_controllers ?
                    parsedFile["minecraft:client_entity"]?.description?.animation_controllers.map((x: { [ac: string]: string }) => Object.values(x)).flat() : []


            const models = Object.values(parsedFile["minecraft:client_entity"]?.description?.geometry ?? {})
            const textures = Object.values(parsedFile["minecraft:client_entity"]?.description?.textures ?? {})

            if (rp_entities[identifier] !== undefined) {
                this.addError("Multiple RP entity files have the same identifier.", path)
                this.addError("Multiple RP entity files have the same identifier.", rp_entities[identifier].path.exactPath)
            }

            rp_entities[identifier] = {
                path: getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path),
                animations: animations as string[],
                seperately_referenced_animation_controllers: seperately_referenced_animation_controllers as string[],

                models: models as string[],
                textures: textures as string[],

                render_controllers
            }
        }

        return rp_entities
    }

    private parseRPAttachables(): ParsedProject["rp_attachables"] {
        const rp_attachables: ParsedProject["rp_attachables"] = {}
        const rp_attachable_files = fs.globSync(path.join(this.resourcePackDir, "./attachables/**/*.json"))
        for (const entity_path of rp_attachable_files) {

            const fileString = fs.readFileSync(entity_path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(fileString, errors)
            this.addJSONParseErrors(errors, entity_path)

            const identifier = parsedFile["minecraft:attachable"].description.identifier

            if (typeof identifier !== "string") {
                this.addError("Unable to parse identifier", entity_path)
                continue
            }

            const render_controllers: string[] = []
            if (parsedFile["minecraft:attachable"]?.description?.render_controllers) {
                for (const rc of parsedFile["minecraft:attachable"].description.render_controllers) {
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
                path: getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, entity_path),
                animations: Object.values(parsedFile["minecraft:attachable"].description.animations ?? {}),
                render_controllers
            }
        }

        return rp_attachables
    }

    private parseRPAnimations(): ParsedProject["rp_anims"] {
        const rp_anims: ParsedProject["rp_anims"] = {}
        const rp_anim_files = fs.globSync(path.join(this.resourcePackDir, "./animations/**/*.json"))
        for (const path of rp_anim_files) {
            const file = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const animations = JSONC.parse(file)
            this.addJSONParseErrors(errors, path)

            for (const anim in animations.animations) {
                rp_anims[anim] = getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path)
            }
        }

        return rp_anims
    }

    private parseBPAnimations(): ParsedProject["bp_anims"] {
        const bp_anims: ParsedProject["bp_anims"] = {}
        const bp_anim_files = fs.globSync(path.join(this.behaviorPackDir, "./animations/**/*.json"))
        for (const path of bp_anim_files) {
            const file = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const animations = JSONC.parse(file)
            this.addJSONParseErrors(errors, path)

            for (const anim in animations.animations) {
                bp_anims[anim] = getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path)
            }
        }

        return bp_anims
    }

    private parseRPAnimationControllers(): ParsedProject["rp_animation_controllers"] {
        const animation_controllers: ParsedProject["rp_animation_controllers"] = {}
        const files = fs.globSync(path.join(this.resourcePackDir, "./animation_controllers/**/*.json"))
        for (const path of files) {
            const fileString = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(fileString, errors)
            this.addJSONParseErrors(errors, path)

            if (typeof parsedFile.animation_controllers !== "object") {
                this.addError(
                    "Unable to parse animation controller", path
                )
                continue
            }

            for (const anim in parsedFile.animation_controllers) {
                animation_controllers[anim] = getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path)
            }
        }

        return animation_controllers
    }

    private parseBPAnimationControllers(): ParsedProject["bp_animation_controllers"] {
        const animation_controllers: ParsedProject["bp_animation_controllers"] = {}
        const files = fs.globSync(path.join(this.behaviorPackDir, "./animation_controllers/**/*.json"))
        for (const path of files) {
            const fileString = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(fileString, errors)
            this.addJSONParseErrors(errors, path)

            if (typeof parsedFile.animation_controllers !== "object") {
                this.addError(
                    "Unable to parse animation controller", path
                )
                continue
            }

            for (const anim in parsedFile.animation_controllers) {
                animation_controllers[anim] = getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path)
            }
        }

        return animation_controllers
    }

    private parseRPRenderControllers(): ParsedProject["rp_render_controllers"] {
        const render_controllers: ParsedProject["rp_render_controllers"] = {}

        const files = fs.globSync(path.join(this.resourcePackDir, "./render_controllers/**/*.json"))
        for (const path of files) {
            const fileString = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const rc = JSONC.parse(fileString, errors)
            this.addJSONParseErrors(errors, path)

            if (typeof rc.render_controllers !== "object") {
                continue
            }

            const pathInfo = getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path)
            for (const anim in rc.render_controllers) {
                render_controllers[anim] = pathInfo
            }
        }

        return render_controllers
    }

    private parseBPEntities(): ParsedProject["bp_entity"] {
        const bp_entities: ParsedProject["bp_entity"] = {}
        const bp_entity_files = fs.globSync(path.join(this.behaviorPackDir, "./entities/**/*.json"))
        for (const path of bp_entity_files) {
            const fileString = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(fileString, errors)
            this.addJSONParseErrors(errors, path)

            const identifier = parsedFile["minecraft:entity"]?.description?.identifier

            if (typeof identifier !== "string") {
                this.addError("Unable to parse identifier", path)
                continue
            }

            if (bp_entities[identifier] !== undefined) {
                this.addError("Multiple BP entity files have the same identifier.", path)
                this.addError("Multiple BP entity files have the same identifier.", bp_entities[identifier].path.exactPath)
            }

            bp_entities[identifier] = {
                path: getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path),
                animations: Object.values(parsedFile["minecraft:entity"]?.description?.animations ?? {}),
            }
        }
        return bp_entities
    }

    private parseBPItems() {
        const itemTextureData = this.parseItemTextureJSON()
        const bp_items: ParsedProject["bp_items"] = {}
        const bp_item_files = fs.globSync(path.join(this.behaviorPackDir, "./items/**/*.json"))
        for (const path of bp_item_files) {
            const fileString = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(fileString, errors)
            this.addJSONParseErrors(errors, path)

            const identifier = parsedFile["minecraft:item"]?.description?.identifier

            if (typeof identifier !== "string") {
                this.addError("Unable to parse identifier", path)
                continue
            }

            const iconComponents = getAllInstancesOfComponentInJSON(parsedFile, "minecraft:item", "minecraft:icon")
            const textureShortnames: SymbolValue[] = []
            for (const component of iconComponents) {
                if (typeof component === "string") {
                    textureShortnames.push(component)
                } else if (component.texture !== undefined) {
                    textureShortnames.push(component.texture)
                } else if (component.textures !== undefined) {
                    for (const texture of Object.values<any>(component.textures)) {
                        if (!textureShortnames.includes(texture)) {
                            textureShortnames.push(texture)
                        }
                    }
                }
            }

            const textures: string[] = []
            if (itemTextureData) {
                for (const shortname of textureShortnames) {
                    const textureData = itemTextureData[shortname]?.textures
                    if (typeof textureData === "object" && Array.isArray(textureData)) {
                        textures.push(...textureData.map((x: any) => {
                            if (typeof x === "string") {
                                return x
                            } else {
                                return x.path
                            }
                        }))
                    } else if (typeof textureData === "string") {
                        textures.push(textureData)
                    } else {
                        this.addError("Unexpected item_texture.json texture data type", path)
                    }
                }
            }

            if (bp_items[identifier] !== undefined) {
                this.addError("Multiple BP item files have the same identifier.", path)
                this.addError("Multiple BP item files have the same identifier.", bp_items[identifier].path.exactPath)
            }

            bp_items[identifier] = {
                path: getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path),
                textureShortnames,
                textures,
            }
        }

        return bp_items
    }

    private parseRPCullingRules(): ParsedProject["rp_block_culling_rules"] {
        const rp_block_culling_rules: ParsedProject["rp_block_culling_rules"] = {}
        const culling_rule_files = fs.globSync(path.join(this.resourcePackDir, "./block_culling/**/*.json"))
        for (const path of culling_rule_files) {
            const file = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(file)
            this.addJSONParseErrors(errors, path)

            const identifier = parsedFile["minecraft:block_culling_rules"]?.description?.identifier

            if (typeof identifier !== "string") {
                this.addError(
                    "Unable to parse identifier", path
                )
                continue
            }

            rp_block_culling_rules[identifier] = getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path)
        }

        return rp_block_culling_rules
    }

    private parseBPBlocks(): ParsedProject["bp_blocks"] {
        const blocksJsonData = this.parseBlocksJsonData()
        const terrainTextureData = this.parseTerrainTextureData()

        const bp_blocks: ParsedProject["bp_blocks"] = {}
        const bp_block_files = fs.globSync(path.join(this.behaviorPackDir, "./blocks/**/*.json"))
        for (const path of bp_block_files) {
            const file = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(file)
            this.addJSONParseErrors(errors, path)

            const identifier: unknown = parsedFile["minecraft:block"]?.description?.identifier

            if (typeof identifier !== "string") {
                this.errors.push(
                    { message: "Identifier invalid or not found in block.", path }
                )
                continue
            }

            const geometryComponents = getAllInstancesOfComponentInJSON(parsedFile, "minecraft:block", "minecraft:geometry")

            const cullingIdentifiers: SymbolValue[] = []
            const models: SymbolValue[] = []
            for (const geo of geometryComponents) {
                let identifier;
                if (typeof geo === "string") {
                    identifier = geo
                } else {
                    identifier = geo.identifier
                }
                if (identifier && !models.includes(identifier)) {
                    models.push(identifier)
                }
                if (geo?.culling && !cullingIdentifiers.includes(geo.culling)) {
                    cullingIdentifiers.push(geo.culling)
                }
            }

            const materialInstanceComponents = getAllInstancesOfComponentInJSON(parsedFile, "minecraft:block", "minecraft:material_instances")
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
                    textureShortnames.push(...Object.values(blocksJsonData[identifier]?.textures ?? {}) as any)
                }
            }

            const textures: string[] = []
            if (terrainTextureData) {
                for (const shortname of textureShortnames) {
                    const textureData = terrainTextureData["texture_data"][shortname]?.textures
                    if (typeof textureData === "object" && Array.isArray(textureData)) {
                        textures.push(...textureData.map((x: any) => {
                            if (typeof x === "string") {
                                return x
                            } else {
                                return x.path
                            }
                        }))
                    } else if (typeof textureData === "string") {
                        textures.push(textureData)
                    } else {
                        this.addError("Unexpected terrain_texture.json texture data type", path)
                    }
                }
            }

            if (bp_blocks[identifier] !== undefined) {
                this.addError("Multiple BP block files have the same identifier.", path)
                this.addError("Multiple BP block files have the same identifier.", bp_blocks[identifier].path.exactPath)
            }

            bp_blocks[identifier] = {
                path: getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path),
                cullingRules: cullingIdentifiers,
                models,
                textureShortnames,
                textures,
            }
        }

        return bp_blocks
    }

    private parseRPModels() {
        const rp_models: ParsedProject["rp_models"] = {}
        const rp_model_files = fs.globSync(path.join(this.resourcePackDir, "./models/**/*.json"))
        for (const path of rp_model_files) {
            const file = fs.readFileSync(path).toString()

            const errors: JSONC.ParseError[] = []
            const parsedFile = JSONC.parse(file)
            this.addJSONParseErrors(errors, path)

            if (typeof parsedFile["minecraft:geometry"] !== "object") {
                this.addError(
                    "Unable to parse geometry file", path
                )
                continue
            }

            for (const model of parsedFile["minecraft:geometry"]) {
                const identifier = model?.description?.identifier
                if (typeof identifier !== "string") {
                    this.addError(
                        "Unable to parse identifier in geometry file. Expected: string", path
                    )
                    continue
                }

                rp_models[identifier] = getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, path)
            }
        }

        return rp_models
    }

    private parseRPTextures(): ParsedProject["rp_textures"] {
        const files = fs.globSync(path.join(this.resourcePackDir, "./textures/**/*.{json,tga,png,jpg,jpeg}"))
        const rp_textures: ParsedProject["rp_textures"] = {}
        for (const file of files) {
            const parsedPath = path.parse(file)

            const inGameTexturePath = path.relative(
                this.resourcePackDir,
                path.join(parsedPath.dir, parsedPath.name)
            ).replaceAll("\\", "/")

            if (rp_textures[inGameTexturePath] === undefined) {
                rp_textures[inGameTexturePath] = {
                    files: []
                }
            }
            rp_textures[inGameTexturePath].files.push(
                getDetailedPathInfo(this.resourcePackDir, this.behaviorPackDir, file)
            )
        }

        return rp_textures
    }

    private parseItemTextureJSON() {
        const itemTexturePath = path.join(this.resourcePackDir, "textures/item_texture.json")
        let itemTextureData;
        if (fs.existsSync(itemTexturePath)) {
            const itemTextureFile = fs.readFileSync(itemTexturePath).toString()
            const itemTexture = JSONC.parse(itemTextureFile)

            itemTextureData = itemTexture["texture_data"]
        }
        return itemTextureData
    }

    private parseBlocksJsonData() {
        const blocksJsonPath = path.join(this.resourcePackDir, "blocks.json")
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
        }
        return blocksJsonData
    }

    // TODO: validate when parsing e.g. using zod.
    parseTerrainTextureData(): TerrainTextureAtlas | null {
        const terrainTexturePath = path.join(this.resourcePackDir, "textures/terrain_texture.json")
        
        if (fs.existsSync(terrainTexturePath)) {
            const terrainTextureFile = fs.readFileSync(terrainTexturePath).toString()
            const terrainTexture = JSONC.parse(terrainTextureFile)

            return terrainTexture
        } else {
            return null
        }
    }
    parseItemTextureData(): ItemTextureAtlas | null {
        const itemTexturePath = path.join(this.resourcePackDir, "textures/item_texture.json")
        
        if (fs.existsSync(itemTexturePath)) {
            const file = fs.readFileSync(itemTexturePath).toString()
            const parsedFile = JSONC.parse(file)

            return parsedFile
        } else {
            return null
        }
    }

    private parseScriptLinks(rp_entities: ParsedProject["rp_entity"], bp_entities: ParsedProject["bp_entity"], bp_items: ParsedProject["bp_items"], bp_blocks: ParsedProject["bp_blocks"]) {
        const script_links: ScriptLink[] = []
        if (this.scanRoot && fs.existsSync(this.scanRoot)) {
            // Identifiers we can legitimately link to, by category. Matching against
            // these lets us drop typos / renamed ids (surfaced as diagnostics).
            const knownEntities = new Set<string>([...Object.keys(rp_entities), ...Object.keys(bp_entities)])
            const knownItems = new Set<string>(Object.keys(bp_items))
            const knownBlocks = new Set<string>(Object.keys(bp_blocks))

            for (const scriptFile of findScriptFiles(this.scanRoot)) {
                const content = fs.readFileSync(scriptFile).toString()
                const annotations = parseScriptAnnotations(content)
                if (annotations.length === 0) {
                    continue
                }
                const relativePath = path.relative(this.scanRoot, scriptFile)
                for (const annotation of annotations) {
                    let known: Set<string>
                    switch (annotation.category) {
                        case "blocks":
                            known = knownBlocks
                            break
                        case "entities":
                            known = knownEntities
                            break
                        case "items":
                            known = knownItems
                            break
                    }
                    if (!known.has(annotation.identifier)) {
                        continue
                    }
                    script_links.push({ ...annotation, scriptPath: scriptFile, relativePath })
                }
            }
        }
        return script_links
    }
}

// A `@lantern-links-*` annotation resolved to the file it was found in. Lives
// anywhere in the workspace, so it carries a plain absolute path rather than
// FilePathData. `relativePath` is workspace-relative, for display.

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