import { Symbol, SymbolType } from "../analysis/symbols"

export function renameSymbolFromIdentifier(symbol: Symbol, oldIdentifier: string, newIdentifier: string) {
    const originalName = oldIdentifier.split(":")[1]
    const newNamespace = newIdentifier.split(":")[0]
    const newName = newIdentifier.split(":")[1]

    switch (symbol.type) {
        case SymbolType.BPAnimation:
        case SymbolType.RPAnimation: {
            const splitName = symbol.value.split(".")
            if (splitName[1] === originalName) {
                const newSymbolValue = [splitName[0], newNamespace, newName, ...splitName.slice(2)].join(".")
                return newSymbolValue
            }
            break
        }
        case SymbolType.RPRenderController:
        case SymbolType.BPAnimationController:
        case SymbolType.RPAnimationController: {
            const splitName = symbol.value.split(".")
            if (splitName[2] === originalName) {
                const newSymbolValue = [splitName[0], splitName[1], newNamespace, newName, ...splitName.slice(3)].join(".")
                return newSymbolValue
            }
            break
        }
    }

    return symbol.value
}