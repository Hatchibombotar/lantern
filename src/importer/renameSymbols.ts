import { Symbol, SymbolType } from "../analysis/symbols"

export function renameSymbolFromIdentifier(symbol: Symbol, oldIdentifier: string, newIdentifier: string) {
    const oldNamespace = oldIdentifier.split(":")[0]
    const oldName = oldIdentifier.split(":")[1]
    const newNamespace = newIdentifier.split(":")[0]
    const newName = newIdentifier.split(":")[1]

    switch (symbol.type) {
        case SymbolType.BPAnimation:
        case SymbolType.RPAnimation: {
            const splitName = symbol.value.split(".")
            if (splitName[1] === oldName) {
                const newSymbolValue = [splitName[0], newNamespace, newName, ...splitName.slice(2)].join(".")
                return newSymbolValue
            }
            break
        }
        case SymbolType.RPRenderController:
        case SymbolType.BPAnimationController:
        case SymbolType.RPAnimationController: {
            const splitName = symbol.value.split(".")
            if (splitName[2] === oldName) {
                const newSymbolValue = [splitName[0], splitName[1], newNamespace, newName, ...splitName.slice(3)].join(".")
                return newSymbolValue
            }
            break
        }
        case SymbolType.CullingRule:
        case SymbolType.Geometry:
        case SymbolType.ItemTextureShortname:
        case SymbolType.BlockTextureShortname: {
            if (symbol.value.includes(":")) {
                const [symbolNamespace, ...symbolName] = symbol.value.split(":")
                let newSymbolNamespace = symbolNamespace
                if (symbolNamespace === oldNamespace) {
                    newSymbolNamespace = newSymbolNamespace
                }
                const newSymbolName = symbolName.join(":").replaceAll(oldName, newName)

                return `${newSymbolName}:${newSymbolNamespace}`
            } else {
                return symbol.value.replaceAll(oldName, newName)
            }
        }
        case SymbolType.TexturePath: {
            const parts = symbol.value.split("/")
            const newParts = []
            for (const part of parts) {
                if (part === oldNamespace) {
                    newParts.push(newNamespace)
                } else {
                    newParts.push(part.replaceAll(oldName, newName))
                }
            }
            return newParts.join("/")
        }

    }

    return symbol.value
}