import * as vscode from 'vscode';
import ExtensionRoot from '../ExtensionRoot';
import { getIdentifierSymbols, getReferencedBlockSymbols, getReferencedEntitySymbols, getReferencedItemSymbols, Symbol, SymbolType, symbolTypeReadableName } from '../analysis/symbols';

export function registerGoToCommand(context: vscode.ExtensionContext, extensionRoot: ExtensionRoot) {
    return vscode.commands.registerCommand("bedrockLantern.goToSymbol", async (element: vscode.TreeItem) => {
        const sourceProject = extensionRoot.getParsedProject()
        if (sourceProject === undefined) {
            vscode.window.showErrorMessage("Project not parsed yet.")
            return
        }
        const identifiers = getIdentifierSymbols(sourceProject)

        const symbols: Symbol[] = [...identifiers]

        for (const identifier of identifiers) {

            switch (identifier.type) {
                case SymbolType.EntityIdentifier:
                    symbols.push(...getReferencedEntitySymbols(sourceProject, identifier.value))
                    break
                case SymbolType.BlockIdentifier:
                    symbols.push(...getReferencedBlockSymbols(sourceProject, identifier.value))
                    break
                case SymbolType.ItemIdentifier:
                    symbols.push(...getReferencedItemSymbols(sourceProject, identifier.value))
                    break
                default:
                    throw Error("Identifier type not handled correctly: " + identifier)
            }
        }

        const result = await vscode.window.showQuickPick(
            symbols.map((symbol) => ({
                label: symbol.value,
                detail: symbolTypeReadableName[symbol.type]
            })),
            {
                title: "Go To..."
            }
        )

    })
}