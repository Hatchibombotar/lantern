import { changeFilePathBase, FilePathData, filePathsEqual } from './analysis/FilePathData';
import { ParsedProject } from './analysis/ParsedProject';
import { getProjectData, ProjectData } from './analysis/projectData';
import { Symbol, symbolsEqual, SymbolType, SymbolValue } from "./analysis/symbols";
import * as fs from 'fs/promises';
import * as path from 'path';
import * as JSONC from "jsonc-parser"
import { jsoncModifyandEditWithInitialisedParents } from "./utils";
import { existsSync } from "fs";

export class Importer {
    importedProject: ParsedProject
    symbolsToImport: Symbol[]
    renamedSymbols: [Symbol, SymbolValue][]
    renamedFiles: [FilePathData, string][]
    projectData: ProjectData

    constructor(
        importedProject: ParsedProject,
        symbolsToImport: Symbol[],
        renamedSymbols: [Symbol, SymbolValue][],
        renamedFiles: [FilePathData, string][],
    ) {
        this.importedProject = importedProject
        this.symbolsToImport = symbolsToImport
        this.renamedSymbols = renamedSymbols
        this.renamedFiles = renamedFiles
        
        const projectData = getProjectData()
        if (!projectData) {
            throw Error("")
        }

        this.projectData = projectData
    }


    async importSymbolsFromProject() {
        // sort symbols by SymbolType
        const symbolsToImportByType: Partial<Record<SymbolType, Symbol[]>> = {}
        for (const symbol of this.symbolsToImport) {
            if (symbolsToImportByType[symbol.type] === undefined) {
                symbolsToImportByType[symbol.type] = []
            }

            symbolsToImportByType[symbol.type]?.push(symbol)
        }

        if (symbolsToImportByType[SymbolType.EntityIdentifer]) {
            for (const symbol of symbolsToImportByType[SymbolType.EntityIdentifer]) {
                await this.importEntity(symbol)
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
    }

    // ParsedProject[parsedProjectKey]
    // Note: this will only work if the value is exactly the FilePathData.
    groupSymbolsByFile(parsedProjectKey: keyof ParsedProject, symbols: Symbol[]): [FilePathData, Symbol[]][] {
        if (this.importedProject[parsedProjectKey] === undefined) {
            throw Error("Key does not exist within this.parsedProject.")
        }
        const animationFilesToImport: [FilePathData, Symbol[]][] = []
        for (const symbol of symbols) {
            
            const file = (this.importedProject[parsedProjectKey] as any)[symbol.value] as FilePathData
            const data = animationFilesToImport.find(([x]) => filePathsEqual(file, x))

            if (data) {
                data[1].push(symbol)
            } else {
                animationFilesToImport.push(
                    [
                        file, [symbol]
                    ]
                )
            }
        }

        return animationFilesToImport
    }

    async importEntity(
        symbol: Symbol,
    ) {
        const newSymbolValue = this.getRenamedSymbolValue(symbol)

        if (this.importedProject.bp_entity[symbol.value] !== undefined) {
            const bp_entity = this.importedProject.bp_entity[symbol.value]
            const file = (await fs.readFile(bp_entity.path.exactPath)).toString()

            let errors: JSONC.ParseError[] = [];
            // const parsedFile = JSONC.parse(file, errors)

            if (errors.length > 0) {
                throw Error(errors.toString())
            }

            let result = jsoncModifyandEditWithInitialisedParents(
                file,
                ["minecraft:entity", "description", "identifier"],
                newSymbolValue
            )

            const destinationFilePath = this.getDestinationFilePath(bp_entity.path)
            await writeFileInProject(this.projectData, destinationFilePath, result)

            // TODO: rename BP animations and animation controllers.
        }

        if (this.importedProject.rp_entity[symbol.value] !== undefined) {
            const rp_entity = this.importedProject.rp_entity[symbol.value]
            const file = (await fs.readFile(rp_entity.path.exactPath)).toString()

            let errors: JSONC.ParseError[] = [];
            const parsedFile = JSONC.parse(file, errors)

            if (errors.length > 0) {
                throw Error(errors.toString())
            }

            let result = jsoncModifyandEditWithInitialisedParents(
                file,
                ["minecraft:client_entity", "description", "identifier"],
                newSymbolValue
            )

            const animations = parsedFile["minecraft:client_entity"]["description"]["animations"] as Record<string, string>

            for (const [shortname, animation] of Object.entries(animations)) {
                const renamedAnimation = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPAnimation, value: animation }))

                if (renamedAnimation) {
                    result = jsoncModifyandEditWithInitialisedParents(
                        result,
                        ["minecraft:client_entity", "description", "animations", shortname],
                        renamedAnimation[1]
                    )
                }
            }

            
            for (const [shortname, animation] of Object.entries(animations)) {
                const renamedAnimation = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPAnimationController, value: animation }))

                if (renamedAnimation) {
                    result = jsoncModifyandEditWithInitialisedParents(
                        result,
                        ["minecraft:client_entity", "description", "animations", shortname],
                        renamedAnimation[1]
                    )
                }
            }

            const seperately_referenced_animation_controllers = parsedFile["minecraft:client_entity"]["description"]["animation_controllers"] as Record<string, string>[]
            if (seperately_referenced_animation_controllers) {
                for (const [index, acs] of seperately_referenced_animation_controllers.entries()) {

                    for (const [shortname, animationController] of Object.entries(acs)) {
                        const renamedAnimationController = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPAnimationController, value: animationController }))

                        if (renamedAnimationController) {
                            result = jsoncModifyandEditWithInitialisedParents(
                                result,
                                ["minecraft:client_entity", "description", "animation_controllers", index, shortname],
                                renamedAnimationController[1]
                            )
                        }
                    }
                }
            }

            const render_controllers = parsedFile["minecraft:client_entity"]["description"]["render_controllers"] as string[]

            for (const [index, renderController] of render_controllers.entries()) {
                const renamedRenderController = this.renamedSymbols.find(([x, _]) => symbolsEqual(x, { type: SymbolType.RPRenderController, value: renderController }))

                if (renamedRenderController) {
                    result = jsoncModifyandEditWithInitialisedParents(
                        result,
                        ["minecraft:client_entity", "description", "render_controllers", index],
                        renamedRenderController[1]
                    )
                }
            }

            const destinationFilePath = this.getDestinationFilePath(rp_entity.path)
            await writeFileInProject(this.projectData, destinationFilePath, result)
        }
    }

    // Imports a multiple defintion type file e.g. animations, animation_controllers
    // root should be the root of the file e.g. "animations"
    async importDefinitionFilesFromFilePath(filePath: FilePathData, symbols: Symbol[], root: string) {
        const file = (await fs.readFile(filePath.exactPath)).toString()

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

        
        const destinationFilePath = this.getDestinationFilePath(filePath)
        await writeFileInProject(this.projectData, destinationFilePath, result)
        
    }

    private getRenamedSymbolValue(
        symbol: Symbol
    ): string {
        const renamedSymbol = this.renamedSymbols.find(([otherSymbol]) => symbolsEqual(otherSymbol, symbol))
        const newSymbolValue = renamedSymbol?.[1] ?? symbol.value

        return newSymbolValue
    }

    
    private getDestinationFilePath(sourcePath: FilePathData) {
        let destinationFilePath = { ...sourcePath }

        const renamedFilePath = this.renamedFiles.find(
            ([filepath]) => filePathsEqual(filepath, sourcePath)
        )

        if (renamedFilePath) {
            destinationFilePath.relativePath = renamedFilePath[1]
        }

        destinationFilePath = changeFilePathBase(
            destinationFilePath,
            this.projectData.resourcePackDir,
            this.projectData.behaviorPackDir
        )

        return destinationFilePath
    }
}

async function writeFileInProject(projectData: ProjectData, filePath: FilePathData, content: string) {
    // console.log("---SAVING---")
    // console.log(filePath.exactPath)
    // console.log(content)
    // return;
    const { resourcePackDir, behaviorPackDir } = projectData
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

    await fs.writeFile(filePath.exactPath, content)
}
