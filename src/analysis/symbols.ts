import { ParsedProject } from './ParsedProject';

export enum SymbolType {
    EntityIdentifier,
    BPAnimation,
    BPAnimationController,
    RPAnimation,
    RPAnimationController,
    RPRenderController,

    BlockIdentifier,
    Geometry,
    CullingRule,
    BlockTextureShortname,
    TexturePath,

    ItemIdentifier,
    ItemTextureShortname,
}

export const symbolTypeReadableName: Record<SymbolType, string> = {
    [SymbolType.EntityIdentifier]: "Entity Identifier",
    [SymbolType.BPAnimation]: "BP Animation",
    [SymbolType.BPAnimationController]: "BP Animation Controller",
    [SymbolType.RPAnimation]: "RP Animation",
    [SymbolType.RPAnimationController]: "RP Animation Controller",
    [SymbolType.RPRenderController]: "RP Render Controller",

    [SymbolType.BlockIdentifier]: "Block Identifier",
    [SymbolType.Geometry]: "Geometry",
    [SymbolType.CullingRule]: "Block Culling Rule",
    [SymbolType.BlockTextureShortname]: "Block Texture Shortname",
    [SymbolType.TexturePath]: "Texture Path",

    [SymbolType.ItemIdentifier]: "Item Identifier",
    [SymbolType.ItemTextureShortname]: "Item Texture Shortname",
}

export type SymbolValue = string

export type Symbol = {
    type: SymbolType,
    value: SymbolValue,
}

export function symbolsEqual(x: Symbol, y: Symbol) {
    return x.type === y.type && x.value === y.value
}

export function getReferencedEntitySymbols(project: ParsedProject, entityId: string) {
    const bp_entity = project.bp_entity[entityId]
    const rp_entity = project.rp_entity[entityId]
    const symbols: Symbol[] = []

    if (bp_entity || rp_entity) {
        symbols.push({
            type: SymbolType.EntityIdentifier,
            value: entityId,
        })
    }

    if (bp_entity) {
        for (const animation of bp_entity.animations) {
            const fileType = animation.split(".")[0]

            if (fileType === "animation") {
                symbols.push({
                    type: SymbolType.BPAnimation,
                    value: animation,
                })
            } else if (fileType === "animation_controller") {
                symbols.push({
                    type: SymbolType.BPAnimationController,
                    value: animation,
                })
            }
        }
    }

    if (rp_entity) {
        for (const animation of rp_entity.animations) {
            const fileType = animation.split(".")[0]

            if (fileType === "animation") {
                symbols.push({
                    type: SymbolType.RPAnimation,
                    value: animation,
                })
            } else if (fileType === "controller") {
                symbols.push({
                    type: SymbolType.RPAnimationController,
                    value: animation,
                })
            }
        }
        for (const animationController of rp_entity.seperately_referenced_animation_controllers) {
            symbols.push({
                type: SymbolType.RPAnimationController,
                value: animationController,
            })
        }
        for (const rc_name of rp_entity.render_controllers) {
            symbols.push({
                type: SymbolType.RPRenderController,
                value: rc_name,
            })
        }

        for (const model of rp_entity.models) {
            symbols.push({
                type: SymbolType.Geometry,
                value: model,
            })
        }
    }

    return symbols
}

export function getReferencedBlockSymbols(project: ParsedProject, identifier: string) {
    const bp_block = project.bp_blocks[identifier]
    const symbols: Symbol[] = []


    if (bp_block) {
        for (const culling of bp_block.cullingRules) {
            symbols.push({
                type: SymbolType.CullingRule,
                value: culling,
            })
        }

        for (const model of bp_block.models) {
            symbols.push({
                type: SymbolType.Geometry,
                value: model,
            })
        }

        for (const shortname of bp_block.textureShortnames) {
            symbols.push({
                type: SymbolType.BlockTextureShortname,
                value: shortname,
            })
        }

        for (const texture of bp_block.textures) {
            symbols.push({
                type: SymbolType.TexturePath,
                value: texture,
            })
        }
    }

    return symbols
}

export function getReferencedItemSymbols(project: ParsedProject, identifier: string) {
    const bp_item = project.bp_items[identifier]
    const symbols: Symbol[] = []

    if (bp_item) {
        // TODO: do something with attachables

        for (const shortname of bp_item.textureShortnames) {
            symbols.push({
                type: SymbolType.ItemTextureShortname,
                value: shortname,
            })
        }

        for (const texture of bp_item.textures) {
            symbols.push({
                type: SymbolType.TexturePath,
                value: texture,
            })
        }
    }

    return symbols
}

export function getIdentifierSymbols(project: ParsedProject): Symbol[] {
    const symbols: Symbol[] = []

    for (const identifier of Object.keys(project.bp_entity)) {
        symbols.push({
            type: SymbolType.EntityIdentifier,
            value: identifier
        })
    }
    for (const identifier of Object.keys(project.rp_entity)) {
        // Skip identifiers that exist in the bp.
        if (symbols.find((v) => v.type === SymbolType.EntityIdentifier && v.value === identifier)) {
            continue
        }
        symbols.push({
            type: SymbolType.EntityIdentifier,
            value: identifier
        })
    }

    for (const identifier of Object.keys(project.bp_items)) {
        symbols.push({
            type: SymbolType.ItemIdentifier,
            value: identifier
        })
    }
    for (const identifier of Object.keys(project.bp_blocks)) {
        symbols.push({
            type: SymbolType.BlockIdentifier,
            value: identifier
        })
    }

    return symbols
}

export function getSymbolsLinkedByIdentifier(project: ParsedProject, identifier: Symbol) {
    switch (identifier.type) {
        case SymbolType.EntityIdentifier:
            return getReferencedEntitySymbols(project, identifier.value)
            break
        case SymbolType.BlockIdentifier:
            return getReferencedBlockSymbols(project, identifier.value)
            break
        case SymbolType.ItemIdentifier:
            return getReferencedItemSymbols(project, identifier.value)
            break
        default:
            throw Error("Identifier type not handled correctly: " + identifier)
    }
}