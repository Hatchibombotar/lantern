import path from "path"
import { ProjectFile } from '../analysis/AddonFileTypes'
import { SymbolType } from "../analysis/symbols"

export function renamePathFromIdentifier(projectFile: ProjectFile, oldIdentifier: string, newIdentifier: string) {
    const { dir, base } = path.parse(projectFile.path.relativePath)

    const originalName = oldIdentifier.split(":")[1]
    const newName = newIdentifier.split(":")[1]

    const splitBase = base.split(".")
    if (splitBase[0] === originalName) {
        splitBase[0] = newName
    }

    const newFileBase = splitBase.join(".")
    
    const newPath = path.join(dir, newFileBase)
    return newPath

    // switch (projectFile.fileType) {
    //     case AddonFileTypes.bp_entity: {
    //         if (folderPath) {
    //             const newPath = path.join("entities", folderPath, newFileBase)
    //             return newPath
    //         }
    //         break;
    //     }
    //     case AddonFileTypes.rp_entity: {
    //         if (folderPath) {
    //             const newPath = path.join("entity", folderPath, newFileBase)
    //             return newPath
    //         }
    //         break;
    //     }
    //     case AddonFileTypes.rp_animation:
    //     case AddonFileTypes.bp_animation:
    //     case AddonFileTypes.rp_animation_controllers:
    //     case AddonFileTypes.bp_animation_controllers:
    //     case AddonFileTypes.rp_render_controllers: {
    //         const newPath = path.join(dir, newFileBase)
    //         return newPath
    //         break;
    //     }
    //     case AddonFileTypes.bp_items: {
    //         if (folderPath) {
    //             const newPath = path.join("items", folderPath, newFileBase)
    //             return newPath
    //         }
    //         break;
    //     }
    //     case AddonFileTypes.rp_attachable: {
    //         if (folderPath) {
    //             const newPath = path.join("attachables", folderPath, newFileBase)
    //             return newPath
    //         }
    //         break;
    //     }
    // }
}


export function renamePathFromNewSymbolValue(projectFile: ProjectFile, symbolType: SymbolType, oldSymbolValue: string, newSymbolValue: string) {
    const { dir, base } = path.parse(projectFile.path.relativePath)

    const originalName = oldSymbolValue.split(":")[1]
    const newName = newSymbolValue.split(":")[1]

    const splitBase = base.split(".")
    if (splitBase[0] === originalName) {
        splitBase[0] = newName
    }

    const newFileBase = splitBase.join(".")
    
    const newPath = path.join(dir, newFileBase)

    switch (symbolType) {
        case SymbolType.EntityIdentifier:
        case SymbolType.BlockIdentifier:
        case SymbolType.ItemIdentifier:
        case SymbolType.CullingRule:

        case SymbolType.BPAnimation:
        case SymbolType.BPAnimationController:
        case SymbolType.RPAnimation:
        case SymbolType.RPAnimationController:
        case SymbolType.RPRenderController:
            
        case SymbolType.Geometry:
        case SymbolType.BlockTextureShortname:
        case SymbolType.TexturePath:
            
        case SymbolType.ItemTextureShortname:
    }
    return newPath
}