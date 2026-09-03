import { changeFilePathBase, FilePathData, filePathsEqual, getDetailedPathInfo } from '../FilePathData';
import { ParsedProject } from '../analysis/ParsedProject';
import { getProjectContext, ProjectContext } from '../analysis/context';
import { Symbol, symbolsEqual, SymbolType, SymbolValue } from "../analysis/symbols";
import * as fs from 'fs/promises';
import * as path from 'path';
import * as JSONC from "jsonc-parser"
import { getDataAtObjectPath, jsoncModifyandEditWithInitialisedParents } from "../utils";
import { existsSync } from "fs";
import { ProjectParser } from '../analysis/ProjectParser';
import { assert } from 'console';

export class Importer {
    sourceProjectParser: ProjectParser
    sourceProject: ParsedProject
    destinationProjectContext: ProjectContext

    renamedSymbols: [Symbol, SymbolValue][]
    renamedFiles: [FilePathData, string][]

    // Stores the original paths to files that have been imported.
    importedFiles: FilePathData[]

    constructor(
        sourceProjectParser: ProjectParser,
        renamedSymbols: [Symbol, SymbolValue][],
        renamedFiles: [FilePathData, string][],
        // importedProject?: ParsedProject,
    ) {
        this.renamedSymbols = renamedSymbols
        this.renamedFiles = renamedFiles
        this.importedFiles = []

        this.sourceProjectParser = sourceProjectParser
        this.sourceProject = sourceProjectParser.parseAll()

        const projectContext = getProjectContext()
        if (!projectContext) {
            throw Error("No project context provided")
        }

        this.destinationProjectContext = projectContext

        this.fileWriteQueue = []
    }

    async importSymbolsFromProject(symbolsToImport: Symbol[]) {
        // sort symbols by SymbolType
        const symbolsToImportByType: Partial<Record<SymbolType, Symbol[]>> = {}
        for (const symbol of symbolsToImport) {
            if (symbolsToImportByType[symbol.type] === undefined) {
                symbolsToImportByType[symbol.type] = []
            }

            symbolsToImportByType[symbol.type]?.push(symbol)
        }

        if (symbolsToImportByType[SymbolType.EntityIdentifier]) {
            for (const symbol of symbolsToImportByType[SymbolType.EntityIdentifier]) {
                await this.importBPEntity(symbol)
                await this.importRPEntityOrAttachable(symbol)
            }
        }

        if (symbolsToImportByType[SymbolType.RPAnimation]) {
            const animationFilesToImport: [FilePathData, Symbol[]][] = this.groupSymbolsByFile(
                "rp_anims",
                symbolsToImportByType[SymbolType.RPAnimation]
            )

            for (const [filePath, symbols] of animationFilesToImport) {
                await this.importDefinitionFilesFromFilePath(filePath, symbols, "animations")
            }
        }

        if (symbolsToImportByType[SymbolType.RPAnimationController]) {
            const animationFilesToImport: [FilePathData, Symbol[]][] = this.groupSymbolsByFile(
                "rp_animation_controllers",
                symbolsToImportByType[SymbolType.RPAnimationController]
            )

            for (const [filePath, symbols] of animationFilesToImport) {
                await this.importDefinitionFilesFromFilePath(filePath, symbols, "animation_controllers")
            }
        }
        if (symbolsToImportByType[SymbolType.RPRenderController]) {
            const animationFilesToImport: [FilePathData, Symbol[]][] = this.groupSymbolsByFile(
                "rp_render_controllers",
                symbolsToImportByType[SymbolType.RPRenderController]
            )

            for (const [filePath, symbols] of animationFilesToImport) {
                await this.importDefinitionFilesFromFilePath(filePath, symbols, "render_controllers")
            }
        }

        if (symbolsToImportByType[SymbolType.BPAnimation]) {
            const animationFilesToImport: [FilePathData, Symbol[]][] = this.groupSymbolsByFile(
                "bp_anims",
                symbolsToImportByType[SymbolType.BPAnimation]
            )

            for (const [filePath, symbols] of animationFilesToImport) {
                await this.importDefinitionFilesFromFilePath(filePath, symbols, "animations")
            }
        }

        if (symbolsToImportByType[SymbolType.BPAnimationController]) {
            const animationFilesToImport: [FilePathData, Symbol[]][] = this.groupSymbolsByFile(
                "bp_animation_controllers",
                symbolsToImportByType[SymbolType.BPAnimationController]
            )

            for (const [filePath, symbols] of animationFilesToImport) {
                await this.importDefinitionFilesFromFilePath(filePath, symbols, "animation_controllers")
            }
        }

        if (symbolsToImportByType[SymbolType.BlockIdentifier]) {
            for (const symbol of symbolsToImportByType[SymbolType.BlockIdentifier]) {
                await this.importBlock(symbol)
                await this.importRPEntityOrAttachable(symbol)
            }
            await this.importBlocksDotJson(
                symbolsToImportByType[SymbolType.BlockIdentifier]
            )
        }

        if (symbolsToImportByType[SymbolType.CullingRule]) {
            for (const symbol of symbolsToImportByType[SymbolType.CullingRule]) {
                await this.importBlockCullingRule(symbol)
            }
        }

        if (symbolsToImportByType[SymbolType.Geometry]) {
            const modelFiles = this.groupSymbolsByFile(
                "rp_models",
                symbolsToImportByType[SymbolType.Geometry]
            )

            for (const [filePath, _symbols] of modelFiles) {
                await this.importModelFile(filePath)
            }
        }
        if (symbolsToImportByType[SymbolType.BlockTextureShortname]) {
            await this.importTerrainTextureAtlas(
                symbolsToImportByType[SymbolType.BlockTextureShortname]
            )
        }
        if (symbolsToImportByType[SymbolType.TexturePath]) {
            await this.importTextures(
                symbolsToImportByType[SymbolType.TexturePath]
            )
        }

        if (symbolsToImportByType[SymbolType.ItemIdentifier]) {
            for (const symbol of symbolsToImportByType[SymbolType.ItemIdentifier]) {
                await this.importItem(symbol)
                await this.importRPEntityOrAttachable(symbol)
            }
        }

        if (symbolsToImportByType[SymbolType.ItemTextureShortname]) {
            await this.importItemTextureAtlas(
                symbolsToImportByType[SymbolType.ItemTextureShortname]
            )
        }
    }

    // Groups symbols defined in the same file
    // ParsedProject[parsedProjectKey]
    // Note: this will only work if the value is exactly the FilePathData.
    // TODO: This is a bit dodgy. Fix if possible.
    groupSymbolsByFile(parsedProjectKey: keyof ParsedProject, symbols: Symbol[]): [FilePathData, Symbol[]][] {
        if (this.sourceProject[parsedProjectKey] === undefined) {
            throw Error("Key does not exist within this.parsedProject.")
        }
        const filesToImport: [FilePathData, Symbol[]][] = []
        for (const symbol of symbols) {

            const file = (this.sourceProject[parsedProjectKey] as any)[symbol.value]
            if (file === undefined) {
                console.error("File does not exist for symbol " + symbol.value)
                continue
            }
            const data = filesToImport.find(([x]) => filePathsEqual(file, x) || filePathsEqual(file.path, x))

            if (data) {
                data[1].push(symbol)
            } else {
                filesToImport.push(
                    [
                        file, [symbol]
                    ]
                )
            }
        }

        return filesToImport
    }

    async importBPEntity(
        symbol: Symbol,
    ) {
        if (this.sourceProject.bp_entity[symbol.value] === undefined) {
            console.error("BP Entity not defined for entity: " + symbol.value)
            return
        }

        const newSymbolValue = this.getRenamedSymbolValue(symbol)

        const bp_entity = this.sourceProject.bp_entity[symbol.value]
        const file = (await fs.readFile(bp_entity.path.exactPath)).toString()

        // let errors: JSONC.ParseError[] = [];
        // const parsedFile = JSONC.parse(file, errors)

        // if (errors.length > 0) {
        //     throw Error(errors.toString())
        // }

        let result = jsoncModifyandEditWithInitialisedParents(
            file,
            ["minecraft:entity", "description", "identifier"],
            newSymbolValue
        )

        const destinationFilePath = this.getDestinationFilePath(bp_entity.path)
        await this.writeFileInProject(destinationFilePath, result, bp_entity.path)

        // TODO: rename BP animations and animation controllers.

    }

    async importRPEntityOrAttachable(
        symbol: Symbol,
    ) {
        let rp_entity: ParsedProject.ClientEntity
        let rootObject: string

        if (symbol.type === SymbolType.EntityIdentifier) {
            if (this.sourceProject.rp_entity[symbol.value] === undefined) {
                console.warn("RP Entity not defined for entity: " + symbol.value)
                return
            } else {
                rp_entity = this.sourceProject.rp_entity[symbol.value]
                rootObject = "minecraft:client_entity"
            }
        } else if (symbol.type === SymbolType.ItemIdentifier || symbol.type === SymbolType.BlockIdentifier) {
            if (this.sourceProject.rp_attachables[symbol.value] === undefined) {
                console.warn("Attachable not defined for symbol: " + symbol.value)
                return
            } else {
                rp_entity = this.sourceProject.rp_attachables[symbol.value]
                rootObject = "minecraft:attachable"
            }
        } else {
            throw Error(`Unexpected symbol ${symbol.type}: ${symbol.value}`)
        }

        const newSymbolValue = this.getRenamedSymbolValue(symbol)

        const file = (await fs.readFile(rp_entity.path.exactPath)).toString()

        let errors: JSONC.ParseError[] = [];
        const parsedFile = JSONC.parse(file, errors)

        if (errors.length > 0) {
            throw Error(errors.toString())
        }

        let result = jsoncModifyandEditWithInitialisedParents(
            file,
            [rootObject, "description", "identifier"],
            newSymbolValue
        )

        const animations = parsedFile[rootObject]["description"]["animations"] as Record<string, string>

        for (const [shortname, animation] of Object.entries(animations)) {
            const renamedAnimation = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPAnimation, value: animation }))

            if (renamedAnimation) {
                result = jsoncModifyandEditWithInitialisedParents(
                    result,
                    [rootObject, "description", "animations", shortname],
                    renamedAnimation[1]
                )
            }
        }


        for (const [shortname, animation] of Object.entries(animations)) {
            const renamedAnimation = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPAnimationController, value: animation }))

            if (renamedAnimation) {
                result = jsoncModifyandEditWithInitialisedParents(
                    result,
                    [rootObject, "description", "animations", shortname],
                    renamedAnimation[1]
                )
            }
        }

        const seperately_referenced_animation_controllers = parsedFile[rootObject]["description"]["animation_controllers"] as Record<string, string>[]
        if (seperately_referenced_animation_controllers) {
            for (const [index, acs] of seperately_referenced_animation_controllers.entries()) {

                for (const [shortname, animationController] of Object.entries(acs)) {
                    const renamedAnimationController = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPAnimationController, value: animationController }))

                    if (renamedAnimationController) {
                        result = jsoncModifyandEditWithInitialisedParents(
                            result,
                            [rootObject, "description", "animation_controllers", index, shortname],
                            renamedAnimationController[1]
                        )
                    }
                }
            }
        }

        const render_controllers = parsedFile[rootObject]["description"]["render_controllers"] as string[]

        for (const [index, renderController] of render_controllers.entries()) {
            const renamedRenderController = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPRenderController, value: renderController }))

            if (renamedRenderController) {
                result = jsoncModifyandEditWithInitialisedParents(
                    result,
                    [rootObject, "description", "render_controllers", index],
                    renamedRenderController[1]
                )
            }
        }

        const destinationFilePath = this.getDestinationFilePath(rp_entity.path)
        await this.writeFileInProject(destinationFilePath, result, rp_entity.path)
    }

    async importBlock(
        symbol: Symbol,
    ) {
        const newSymbolValue = this.getRenamedSymbolValue(symbol)

        if (this.sourceProject.bp_blocks[symbol.value] !== undefined) {
            const bp_block = this.sourceProject.bp_blocks[symbol.value]
            const file = (await fs.readFile(bp_block.path.exactPath)).toString()

            let errors: JSONC.ParseError[] = [];
            const parsedFile = JSONC.parse(file, errors)

            if (errors.length > 0) {
                throw Error(errors.toString())
            }

            let result = jsoncModifyandEditWithInitialisedParents(
                file,
                ["minecraft:block", "description", "identifier"],
                newSymbolValue
            )

            const geometryComponentInstances = this.getComponentInstances("minecraft:geometry", "minecraft:block", file)
            for (const pathToComponent of geometryComponentInstances) {
                const component = getDataAtObjectPath(parsedFile, pathToComponent)
                if (typeof component === "string") {
                    result = jsoncModifyandEditWithInitialisedParents(
                        result,
                        pathToComponent,
                        this.getRenamedSymbolValue({
                            type: SymbolType.Geometry,
                            value: component
                        })
                    )
                } else if (component?.identifier) {
                    result = jsoncModifyandEditWithInitialisedParents(
                        result,
                        [...pathToComponent, "identifier"],
                        this.getRenamedSymbolValue({
                            type: SymbolType.Geometry,
                            value: component.identifier
                        })
                    )
                }
            }

            const materialInstanceComponents = this.getComponentInstances("minecraft:material_instances", "minecraft:block", file)
            for (const pathToComponent of materialInstanceComponents) {
                const component = getDataAtObjectPath(parsedFile, pathToComponent)
                for (const [partKey, partValue] of Object.entries<any>(component)) {
                    if (partValue["texture"]) {
                        result = jsoncModifyandEditWithInitialisedParents(
                            result,
                            [...pathToComponent, partKey, "texture"],
                            this.getRenamedSymbolValue({
                                type: SymbolType.BlockTextureShortname,
                                value: partValue["texture"]
                            })
                        )
                    }
                }
            }


            const destinationFilePath = this.getDestinationFilePath(bp_block.path)
            await this.writeFileInProject(destinationFilePath, result, bp_block.path)
        }
    }

    async importBlockCullingRule(
        symbol: Symbol,
    ) {
        const newSymbolValue = this.getRenamedSymbolValue(symbol)

        if (this.sourceProject.rp_block_culling_rules[symbol.value] !== undefined) {
            const culling = this.sourceProject.rp_block_culling_rules[symbol.value]
            const file = (await fs.readFile(culling.exactPath)).toString()

            let result = jsoncModifyandEditWithInitialisedParents(
                file,
                ["minecraft:block_culling_rules", "description", "identifier"],
                newSymbolValue
            )

            const destinationFilePath = this.getDestinationFilePath(culling)
            await this.writeFileInProject(destinationFilePath, result, culling)
        }
    }

    async importItem(
        symbol: Symbol,
    ) {
        const newSymbolValue = this.getRenamedSymbolValue(symbol)

        if (this.sourceProject.bp_items[symbol.value] !== undefined) {
            const bp_item = this.sourceProject.bp_items[symbol.value]
            const file = (await fs.readFile(bp_item.path.exactPath)).toString()

            let errors: JSONC.ParseError[] = [];
            const parsedFile = JSONC.parse(file, errors)

            if (errors.length > 0) {
                throw Error(errors.toString())
            }

            let result = jsoncModifyandEditWithInitialisedParents(
                file,
                ["minecraft:item", "description", "identifier"],
                newSymbolValue
            )

            const iconComponentInstances = this.getComponentInstances("minecraft:icon", "minecraft:item", file)
            for (const pathToComponent of iconComponentInstances) {
                const component = getDataAtObjectPath(parsedFile, pathToComponent)
                if (typeof component === "string") {
                    result = jsoncModifyandEditWithInitialisedParents(
                        result,
                        pathToComponent,
                        this.getRenamedSymbolValue({
                            type: SymbolType.ItemTextureShortname,
                            value: component
                        })
                    )
                } else if (component?.texture !== undefined) {
                    result = jsoncModifyandEditWithInitialisedParents(
                        result,
                        [...pathToComponent, "texture"],
                        this.getRenamedSymbolValue({
                            type: SymbolType.ItemTextureShortname,
                            value: component.texture
                        })
                    )
                } else if (component?.textures !== undefined) {
                    for (const [textureType, textureShortname] of Object.entries<any>(component.textures)) {
                        result = jsoncModifyandEditWithInitialisedParents(
                            result,
                            [...pathToComponent, "textures", textureType],
                            this.getRenamedSymbolValue({
                                type: SymbolType.ItemTextureShortname,
                                value: textureShortname
                            })
                        )
                    }
                }
            }

            const destinationFilePath = this.getDestinationFilePath(bp_item.path)
            await this.writeFileInProject(destinationFilePath, result, bp_item.path)
        }
    }

    getComponentInstances(componentName: string, rootObject: string, file: string): JSONC.JSONPath[] {
        const paths: JSONC.JSONPath[] = []

        let errors: JSONC.ParseError[] = [];
        const parsedFile = JSONC.parse(file, errors)

        if (errors.length > 0) {
            throw Error(errors.toString())
        }

        if (parsedFile[rootObject]["components"][componentName] !== undefined) {
            paths.push(
                [rootObject, "components", componentName]
            )
        }

        if (parsedFile[rootObject]["permutations"] !== undefined) {
            for (const [index, permutation] of Object.entries<any>(parsedFile[rootObject]["permutations"]) ?? []) {
                if (permutation["components"][componentName] !== undefined) {
                    paths.push(
                        [rootObject, "permutations", Number(index), "components", componentName]
                    )
                }
            }
        }

        return paths
    }

    // TODO: Add symbolsToInclude parameter so unused models can be removed.
    async importModelFile(sourceFilePath: FilePathData) {
        const file = (await fs.readFile(sourceFilePath.exactPath)).toString()

        let errors: JSONC.ParseError[] = [];
        const parsedFile = JSONC.parse(file, errors)

        if (errors.length > 0) {
            throw Error(errors.toString())
        }

        let result = file

        for (const [index, model] of Object.entries<any>(parsedFile["minecraft:geometry"])) {
            const oldIdentifier = model["description"]["identifier"]

            if (!oldIdentifier) continue
            result = jsoncModifyandEditWithInitialisedParents(
                result,
                ["minecraft:geometry", Number(index), "description", "identifier"],
                this.getRenamedSymbolValue({
                    type: SymbolType.Geometry,
                    value: oldIdentifier
                })
            )
        }

        const destinationFilePath = this.getDestinationFilePath(sourceFilePath)
        await this.writeFileInProject(destinationFilePath, result, sourceFilePath)
    }

    // Imports a multiple defintion type file e.g. animations, animation_controllers
    // root should be the root of the file e.g. "animations"
    async importDefinitionFilesFromFilePath(sourceFilePath: FilePathData, symbols: Symbol[], root: string) {
        const file = (await fs.readFile(sourceFilePath.exactPath)).toString()

        let errors: JSONC.ParseError[] = [];
        const parsedFile = JSONC.parse(file, errors)

        if (errors.length > 0) {
            throw Error(errors.toString())
        }

        let result = file

        // Remove unused keys in animation file
        for (const key in parsedFile[root]) {
            if (symbols.find(x => x.value === key)) {
                continue
            }

            result = jsoncModifyandEditWithInitialisedParents(
                result,
                [root, key],
                undefined
            )
        }

        for (const symbol of symbols) {
            const newSymbolValue = this.getRenamedSymbolValue(symbol)

            // Remove the old key and add the new one
            // NOTE: this does not currently retain comments. TODO: fix this!
            result = jsoncModifyandEditWithInitialisedParents(
                result, [root, symbol.value], undefined
            )
            result = jsoncModifyandEditWithInitialisedParents(
                result, [root, newSymbolValue], parsedFile[root][symbol.value]
            )
        }


        const destinationFilePath = this.getDestinationFilePath(sourceFilePath)
        await this.writeFileInProject(destinationFilePath, result, sourceFilePath)

    }

    private async importTerrainTextureAtlas(symbols: Symbol[]) {
        const sourceTerrainTexture = this.sourceProjectParser.parseTerrainTextureData()
        if (!sourceTerrainTexture) return

        const destinationFilePath = getDetailedPathInfo(
            this.destinationProjectContext.resourcePackDir,
            this.destinationProjectContext.behaviorPackDir,
            path.join(this.destinationProjectContext.resourcePackDir, "./textures/terrain_texture.json"),
        )

        let file!: string

        if (existsSync(destinationFilePath.exactPath)) {
            file = (await fs.readFile(destinationFilePath.exactPath)).toString()
        } else {
            file = terrainTextureBase
        }

        for (const shortname of symbols) {
            assert(shortname.type === SymbolType.BlockTextureShortname)

            const textureData = sourceTerrainTexture["texture_data"][shortname.value]
            if (textureData === undefined) {
                console.log(`Texture data is undefined for ${shortname?.value}`)
                continue
            }

            if (Array.isArray(textureData.textures)) {
                for (const [i, texture] of textureData.textures.entries()) {
                    if (typeof texture === "string") {
                        textureData.textures[i] = this.getRenamedSymbolValue({
                            type: SymbolType.TexturePath,
                            value: texture
                        })
                    } else if (texture.path) {
                        texture.path = this.getRenamedSymbolValue({
                            type: SymbolType.TexturePath,
                            value: texture.path
                        })
                    }
                }
            } else {
                if (typeof textureData.textures === "string") {
                    textureData.textures = this.getRenamedSymbolValue({
                        type: SymbolType.TexturePath,
                        value: textureData.textures
                    })
                } else if (textureData.textures.path) {
                    textureData.textures.path = this.getRenamedSymbolValue({
                        type: SymbolType.TexturePath,
                        value: textureData.textures.path
                    })
                }
            }

            const newShortnameValue = this.getRenamedSymbolValue(shortname)

            file = jsoncModifyandEditWithInitialisedParents(
                file,
                ["texture_data", newShortnameValue],
                textureData
            )
        }

        await this.overwriteFileInProject(
            destinationFilePath,
            file,
            getDetailedPathInfo(
                this.sourceProjectParser.resourcePackDir,
                this.sourceProjectParser.behaviorPackDir,
                path.join(this.sourceProjectParser.resourcePackDir, "./textures/terrain_texture.json"),
            )
        )
    }
    private async importItemTextureAtlas(symbols: Symbol[]) {
        const sourceItemTexture = this.sourceProjectParser.parseItemTextureData()
        if (!sourceItemTexture) return

        const destinationFilePath = getDetailedPathInfo(
            this.destinationProjectContext.resourcePackDir,
            this.destinationProjectContext.behaviorPackDir,
            path.join(this.destinationProjectContext.resourcePackDir, "./textures/item_texture.json"),
        )

        let file!: string

        if (existsSync(destinationFilePath.exactPath)) {
            file = (await fs.readFile(destinationFilePath.exactPath)).toString()
        } else {
            file = itemTextureBase
        }

        for (const shortname of symbols) {
            assert(shortname.type === SymbolType.ItemTextureShortname)

            const textureData = sourceItemTexture["texture_data"][shortname.value]

            if (Array.isArray(textureData.textures)) {
                for (const [i, texture] of textureData.textures.entries()) {
                    if (typeof texture === "string") {
                        textureData.textures[i] = this.getRenamedSymbolValue({
                            type: SymbolType.TexturePath,
                            value: texture
                        })
                    }
                }
            } else {
                if (typeof textureData.textures === "string") {
                    textureData.textures = this.getRenamedSymbolValue({
                        type: SymbolType.TexturePath,
                        value: textureData.textures
                    })
                }
            }

            const newShortnameValue = this.getRenamedSymbolValue(shortname)

            file = jsoncModifyandEditWithInitialisedParents(
                file,
                ["texture_data", newShortnameValue],
                textureData
            )
        }

        await this.overwriteFileInProject(
            destinationFilePath,
            file,
            getDetailedPathInfo(
                this.sourceProjectParser.resourcePackDir,
                this.sourceProjectParser.behaviorPackDir,
                path.join(this.sourceProjectParser.resourcePackDir, "./textures/item_texture.json"),
            )
        )
    }


    private async importBlocksDotJson(symbols: Symbol[]) {
        const sourceBlocksDotJson = this.sourceProjectParser.parseBlocksDotJSONData()
        if (!sourceBlocksDotJson) return

        const destinationFilePath = getDetailedPathInfo(
            this.destinationProjectContext.resourcePackDir,
            this.destinationProjectContext.behaviorPackDir,
            path.join(this.destinationProjectContext.resourcePackDir, "./blocks.json"),
        )

        let file!: string

        if (existsSync(destinationFilePath.exactPath)) {
            file = (await fs.readFile(destinationFilePath.exactPath)).toString()
        } else {
            file = blocksJsonBase
        }

        for (const identifier of symbols) {
            assert(identifier.type === SymbolType.BlockIdentifier)

            const blockData = sourceBlocksDotJson[identifier.value]
            if (!blockData) continue

            if (typeof blockData.textures === "string") {
                blockData.textures = this.getRenamedSymbolValue({
                    type: SymbolType.BlockTextureShortname,
                    value: blockData.textures
                })
            } else if (blockData.textures) {
                for (const [part, texture] of Object.entries(blockData.textures)) {
                    assert(typeof texture === "string")
                    blockData.textures[part] = this.getRenamedSymbolValue({
                        type: SymbolType.BlockTextureShortname,
                        value: texture
                    })
                }
            }

            if (typeof blockData.carried_textures === "string") {
                blockData.carried_textures = this.getRenamedSymbolValue({
                    type: SymbolType.BlockTextureShortname,
                    value: blockData.carried_textures
                })
            } else if (blockData.carried_textures) {
                for (const [part, texture] of Object.entries(blockData.carried_textures)) {
                    assert(typeof texture === "string")
                    blockData.carried_textures[part] = this.getRenamedSymbolValue({
                        type: SymbolType.BlockTextureShortname,
                        value: texture
                    })
                }
            }

            const newIdentifier = this.getRenamedSymbolValue(identifier)

            file = jsoncModifyandEditWithInitialisedParents(
                file,
                [newIdentifier],
                blockData
            )
        }

        await this.overwriteFileInProject(
            destinationFilePath,
            file,
            getDetailedPathInfo(
                this.sourceProjectParser.resourcePackDir,
                this.sourceProjectParser.behaviorPackDir,
                path.join(this.sourceProjectParser.resourcePackDir, "./blocks.json"),
            )
        )
    }


    private async importTextures(symbols: Symbol[]) {
        for (const texture of symbols) {
            assert(texture.type === SymbolType.TexturePath)

            const textureData = this.sourceProject["rp_textures"][texture.value]
            if (textureData === undefined) {
                throw Error(`Texture ${texture.value} not parsed.`)
            }

            const renamedTexture = this.getRenamedSymbolValue(texture)

            for (const textureFile of textureData.files) {
                const fileExtension = path.extname(textureFile.exactPath)

                const textureFilePath = renamedTexture + fileExtension
                const newPath: FilePathData = {
                    rootType: "rp",
                    relativePath: textureFilePath,
                    exactPath: path.join(this.destinationProjectContext.resourcePackDir, textureFilePath)
                }

                await this.copyFileToProject(
                    newPath,
                    textureFile.exactPath,
                    textureFile
                )
            }
        }
    }

    // TODO: Automatically import source entry point from destination entry point if both exist.
    public async importScripts(resultDirToCopyTo: string) {
        const scriptFiles = this.sourceProject.script_files

        const newScriptFile = "scripts/" + resultDirToCopyTo + "/"

        for (const scriptFile of scriptFiles) {
            const relativeScriptPath = path.relative("scripts", scriptFile.relativePath)

            const newRelativePath = path.join(newScriptFile, relativeScriptPath)

            const resultPath: FilePathData = {
                rootType: "bp",
                relativePath: newRelativePath,
                exactPath: path.join(this.destinationProjectContext.behaviorPackDir, newRelativePath)
            }

            await this.copyFileToProject(resultPath, scriptFile.exactPath, scriptFile)
        }
    }

    private getRenamedSymbolValue(
        symbol: Symbol
    ): string {
        const renamedSymbol = this.renamedSymbols.find(([otherSymbol]) => symbolsEqual(otherSymbol, symbol))
        const newSymbolValue = renamedSymbol?.[1] ?? symbol.value

        return newSymbolValue
    }

    private getDestinationFilePath(sourcePath: FilePathData): FilePathData {
        let destinationFilePath = { ...sourcePath }

        const renamedFilePath = this.renamedFiles.find(
            ([filepath]) => filePathsEqual(filepath, sourcePath)
        )

        if (renamedFilePath) {
            destinationFilePath.relativePath = renamedFilePath[1]
        }

        destinationFilePath = changeFilePathBase(
            destinationFilePath,
            this.destinationProjectContext.resourcePackDir,
            this.destinationProjectContext.behaviorPackDir
        )

        return destinationFilePath
    }

    fileWriteQueue: (() => Promise<void>)[]

    /**
     * Saves a file in the new project. (Does not allow overwriting)
     * @param sourceFilePath The original path of a file imported from the source project,
     */
    private async writeFileInProject(filePath: FilePathData, content: string, sourceFilePath?: FilePathData) {
        // console.log("---SAVING---")
        // console.log(filePath.exactPath)
        // console.log(content)
        // return;
        const { resourcePackDir, behaviorPackDir } = this.destinationProjectContext
        if (existsSync(filePath.exactPath)) {
            throw Error("File already exists. Path: " + filePath.exactPath)
        }
        const directoryPath = path.dirname(filePath.exactPath)
        if (!existsSync(directoryPath)) {
            await fs.mkdir(directoryPath, { recursive: true })
        }

        const validPath = (filePath.rootType === "rp" && filePath.exactPath.startsWith(resourcePackDir)) || (filePath.rootType === "bp" && filePath.exactPath.startsWith(behaviorPackDir))
        if (!validPath) {
            throw Error("File is not contained within project. Path: " + filePath.exactPath)
        }

        this.fileWriteQueue.push(
            async () => await fs.writeFile(filePath.exactPath, content)
        )

        if (sourceFilePath) {
            this.importedFiles.push(sourceFilePath)
        }
    }

    private async overwriteFileInProject(filePath: FilePathData, content: string, sourceFilePath?: FilePathData) {
        const { resourcePackDir, behaviorPackDir } = this.destinationProjectContext

        const directoryPath = path.dirname(filePath.exactPath)
        if (!existsSync(directoryPath)) {
            await fs.mkdir(directoryPath, { recursive: true })
        }

        const validPath = (filePath.rootType === "rp" && filePath.exactPath.startsWith(resourcePackDir)) || (filePath.rootType === "bp" && filePath.exactPath.startsWith(behaviorPackDir))
        if (!validPath) {
            throw Error("File is not contained within project. Path: " + filePath.exactPath)
        }

        this.fileWriteQueue.push(
            async () => await fs.writeFile(filePath.exactPath, content)
        )

        if (sourceFilePath) {
            this.importedFiles.push(sourceFilePath)
        }
    }

    public async importFile(sourceFilePath: FilePathData) {
        const destinationPath = this.getDestinationFilePath(sourceFilePath)

        this.copyFileToProject(destinationPath, sourceFilePath.exactPath, sourceFilePath)
    }

    private async copyFileToProject(destinationPath: FilePathData, sourcePath: string, sourceFilePath?: FilePathData) {
        const { resourcePackDir, behaviorPackDir } = this.destinationProjectContext
        if (existsSync(destinationPath.exactPath)) {
            throw Error("File already exists. Path: " + destinationPath.exactPath)
        }
        const directoryPath = path.dirname(destinationPath.exactPath)
        if (!existsSync(directoryPath)) {
            await fs.mkdir(directoryPath, { recursive: true })
        }

        const validPath = (destinationPath.rootType === "rp" && destinationPath.exactPath.startsWith(resourcePackDir)) || (destinationPath.rootType === "bp" && destinationPath.exactPath.startsWith(behaviorPackDir))
        if (!validPath) {
            throw Error("File is not contained within project. Path: " + destinationPath.exactPath)
        }

        this.fileWriteQueue.push(
            async () => await fs.copyFile(sourcePath, destinationPath.exactPath)
        )

        if (sourceFilePath) {
            this.importedFiles.push(sourceFilePath)
        }
    }

    public async applyFileChanges() { 
        for (const fileWrite of this.fileWriteQueue) {
            await fileWrite()
        }
    }

}

const terrainTextureBase = `{
  "resource_pack_name": "lantern",
  "texture_name": "atlas.terrain",
  "padding": 8,
  "num_mip_levels": 4,
  "texture_data": {
  }
}`
const itemTextureBase = `{
  "resource_pack_name": "lantern",
  "texture_name": "atlas.items",
  "texture_data": {
  }
}`
const blocksJsonBase = `{
   "format_version" : "1.21.40"
}`