import { SymbolType } from "../analysis/symbols";

// If a string is returned, the valid is not valid. If undefined is returned, it is valid.
export function validateSymbol(symbolType: SymbolType, value: string): string | undefined {
    if (value === "") {
        return "can not be empty"
    } else if (value.includes(" ")) {
        return "can not contain spaces"
    }
    switch (symbolType) {
        case SymbolType.ItemIdentifier:
        case SymbolType.BlockIdentifier:
        case SymbolType.EntityIdentifier:
        case SymbolType.CullingRule:
            if (!value.includes(":")) {
                return "Identifier must include a :"
            }
            break
        case SymbolType.BPAnimation:
        case SymbolType.RPAnimation:
            if (!value.startsWith("animation.")) {
                return "animation must begin with 'animation.'`"
            }
            break
        case SymbolType.BPAnimationController:
        case SymbolType.RPAnimationController:
            if (!value.startsWith("controller.animation")) {
                return "animation controller must begin with 'controller.animation'`"
            }
            break
        case SymbolType.RPRenderController:
            if (!value.startsWith("controller.render")) {
                return "render controller must begin with 'controller.render'`"
            }
            break
        case SymbolType.Geometry:
            if (!value.startsWith("geometry")) {
                return "geometry must begin with 'geometry.'`"
            }
            break
        case SymbolType.TexturePath:
            if (!value.startsWith("textures/")) {
                return "texture files must be contained within 'textures/...'`"
            }
            break
        case SymbolType.BlockTextureShortname:
        case SymbolType.ItemTextureShortname:
    }
    return undefined
}