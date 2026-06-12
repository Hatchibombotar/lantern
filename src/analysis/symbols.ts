import * as vscode from 'vscode';
import { ParsedProject } from "./parseProject";

export enum SymbolType {
    EntityIdentifer,
    BPAnimation,
    BPAnimationController,
    RPAnimation,
    RPAnimationController,
    RPRenderController,
}

const symbolTypeReadableName: Record<SymbolType, string> = {
    [SymbolType.EntityIdentifer]: "Entity Identifier",
    [SymbolType.BPAnimation]: "BP Animation",
    [SymbolType.BPAnimationController]: "BP Animation Controller",
    [SymbolType.RPAnimation]: "RP Animation",
    [SymbolType.RPAnimationController]: "RP Animation Controller",
    [SymbolType.RPRenderController]: "RP Render Controller",
}

export type SymbolValue = string

export type Symbol = {
    type: SymbolType,
    value: SymbolValue,
}

export function symbolsEqual(x: Symbol, y:Symbol) {
    return x.type === y.type && x.value === y.value
}

export function getReferencedEntitySymbols(project: ParsedProject, entityId: string) {
    const bp_entity = project.bp_entity[entityId]
    const rp_entity = project.rp_entity[entityId]
    const symbols: Symbol[] = []

    if (bp_entity || rp_entity) {
        symbols.push({
            type: SymbolType.EntityIdentifer,
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
    }

    return symbols
}


/** Show a VSCODE quick picker that allows a user to rename symbols.
Returns an array where each item is a tuple containing the original symbol and a renamed value. */
export async function selectRenamedSymbols(symbols: Symbol[], initialRenamed?: [Symbol, SymbolValue | null][]): Promise<undefined | [Symbol, SymbolValue][]> {
    interface QuickPickItem extends vscode.QuickPickItem {
        data?: Symbol
        index?: number
    }
    const renames: [Symbol, SymbolValue | null][] = symbols.map(x => {
        const alreadyRenamedSymbol = initialRenamed?.find((([y]) => symbolsEqual(x, y)))

        if (alreadyRenamedSymbol !== undefined) {
            return [x, alreadyRenamedSymbol[1]]
        }
        return [x, null]
    })

    while (true) {
        const options: QuickPickItem[] = [
            { label: "Continue" },
            { label: "symbols", kind: vscode.QuickPickItemKind.Separator },
        ]
        for (const [symbolIndex, symbol] of symbols.entries()) {
            const option: QuickPickItem = {
                label: renames[symbolIndex][1] ?? symbol.value,
                data: symbol,
                index: symbolIndex,
                description: "",
                detail: symbolTypeReadableName[symbol.type]
            }

            if (renames[symbolIndex][1] === null) {
                option.description = "Unchanged"
            } else {
                option.description = `(${symbol.value})`
            }
            options.push(option)
        }
        const result = await vscode.window.showQuickPick(options, {
            title: "Rename symbols",
            ignoreFocusOut: true,
        })
        
        if (result === undefined) {
            return undefined
        }
        
        if (result.data === undefined) {
            break
        }
        if (result.index === undefined) {
            break
        }

        const currentName = renames[result.index][1] ?? result.data.value
        
        const newSymbol = await vscode.window.showInputBox({
            placeHolder: currentName,
            value: currentName,
            prompt: `Rename ${result.data.value}`,
            ignoreFocusOut: true,
            // TODO: add validation; make sure the names are valid.
        })

        if (newSymbol !== undefined) {
            renames[result.index][1] = newSymbol
        }
    }

    return renames.filter(rename => rename[1] !== null && rename[0].value !== rename[1]) as [Symbol, SymbolValue][]
}