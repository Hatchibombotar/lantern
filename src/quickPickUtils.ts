import * as vscode from 'vscode';
import { ProjectFile } from './analysis/AddonFileTypes';
import { FilePathData, filePathsEqual } from './FilePathData';
import { Symbol, SymbolValue, symbolsEqual, symbolTypeReadableName } from './analysis/symbols';
import path from 'path';
import { validateSymbol } from './importer/validateSymbol';

// TODO: replace this with selectRenamedSymbols
export async function selectRenameIdentifiers(identifierMap: Record<string, string>): Promise<undefined | Record<string, string>> {
    interface QuickPickItem extends vscode.QuickPickItem {
        identifierToRename?: string;
    }
    while (true) {
        const options: QuickPickItem[] = [
            { label: "Continue" },
            { label: "identifiers", kind: vscode.QuickPickItemKind.Separator },
        ];
        for (const [k, v] of Object.entries(identifierMap)) {
            const option: QuickPickItem = {
                label: v
            };

            if (k === v) {
                option.description = "Unchanged";
            } else {
                option.description = `(${k})`;
            }
            option.identifierToRename = k;
            options.push(option);
        }
        const result = await vscode.window.showQuickPick(options, {
            title: "Rename identifiers",
        });

        if (result === undefined) {
            return undefined;
        }
        if (result.identifierToRename === undefined) {
            return identifierMap;
        }

        const newIdentifier = await vscode.window.showInputBox({
            placeHolder: identifierMap[result.identifierToRename],
            validateInput(value) {
                if (value.split(":").length !== 2) {
                    return "identifier must include a ':' e.g. namespace:entity";
                } else if (value.split(":").some(x => x.length === 0)) {
                    return "identifier must be formatted correctly e.g. namespace:entity";
                } else if (value.includes(" ")) {
                    return "identifier must not include spaces.";
                }
            },
        });

        if (newIdentifier !== undefined) {
            identifierMap[result.identifierToRename] = newIdentifier;
        }
    }
}

// Returns a map from the original path to the new path. (Both relative to their RP/BP folder.)
export async function showRenameFilesUI(files: ProjectFile[], initialRenamed?: [ProjectFile, string][]): Promise<undefined | [ProjectFile, string][]> {
    interface QuickPickItem extends vscode.QuickPickItem {
        data?: ProjectFile;
        index?: number;
    }

    // const renames: [ProjectFile, string][] = files.map(x => [x, x.path.relativePath])
    const renames: [ProjectFile, string][] = files.map(x => {
        const alreadyRenamedFile = initialRenamed?.find((([y]) => filePathsEqual(x.path, y.path) && x.fileType === y.fileType));

        if (alreadyRenamedFile !== undefined) {
            return [x, alreadyRenamedFile[1]];
        }
        return [x, x.path.relativePath];
    });


    while (true) {
        const options: QuickPickItem[] = [
            { label: "Continue" },
            { label: "files", kind: vscode.QuickPickItemKind.Separator },
        ];
        for (const [index, file] of files.entries()) {
            const option: QuickPickItem = {
                description: file.path.rootType + "\\" + file.path.relativePath,
                data: file,
                index,
                label: file.path.rootType + "\\" + renames[index][1]
            };
            options.push(option);
        }
        const result = await vscode.window.showQuickPick(options, {
            title: "Rename files",
            // TODO: add validation; make sure it is located within correct dir.
        });

        if (result === undefined) {
            return undefined;
        }

        if (result.index === undefined) {
            break;
        }

        if (result.data === undefined) {
            break;
        }

        const prefix = result.data.path.rootType + "\\";
        const initialValue = prefix + result.data.path.relativePath;
        const newPath = await vscode.window.showInputBox({
            placeHolder: initialValue,
            value: initialValue,
            prompt: `Rename ${result.data.path.relativePath}`,
            validateInput(value) {
                if (!value.startsWith(prefix)) {
                    return "path must start with " + prefix;
                }

                const newRelativePath = value.slice(prefix.length);
                // TODO: show error if file already exists.
            }
        });

        if (newPath !== undefined) {
            renames[result.index][1] = newPath.slice(prefix.length);
        }
    }
    return renames;
}

export async function showSelectFilesUI(files: FilePathData[], options: vscode.QuickPickOptions = {}): Promise<FilePathData[] | undefined> {
    const result = await vscode.window.showQuickPick(
        files.map(file => ({
            label: file.rootType + path.sep + file.relativePath,
            picked: false,
            file
        })),
        {
            ...options,
            canPickMany: true,
        }
    )

    if (result === undefined) return

    return result?.map(x => x.file)
}


/** Show a VSCODE quick picker that allows a user to rename symbols.
Returns an array where each item is a tuple containing the original symbol and a renamed value. */
export async function showRenameSymbolsUI(symbols: Symbol[], quickPickOptions: vscode.QuickPickOptions = {}, initialRenamed?: [Symbol, SymbolValue | null][]): Promise<undefined | [Symbol, SymbolValue][]> {
    interface QuickPickItem extends vscode.QuickPickItem {
        data?: Symbol;
        index?: number;
    }
    const renames: [Symbol, SymbolValue | null][] = symbols.map(x => {
        const alreadyRenamedSymbol = initialRenamed?.find((([y]) => symbolsEqual(x, y)));

        if (alreadyRenamedSymbol !== undefined) {
            return [x, alreadyRenamedSymbol[1]];
        }
        return [x, null];
    });

    while (true) {
        const options: QuickPickItem[] = [
            { label: "Continue" },
            { label: "symbols", kind: vscode.QuickPickItemKind.Separator },
        ];
        for (const [symbolIndex, symbol] of symbols.entries()) {
            const option: QuickPickItem = {
                label: renames[symbolIndex][1] ?? symbol.value,
                data: symbol,
                index: symbolIndex,
                description: "",
                detail: symbolTypeReadableName[symbol.type]
            };

            if (renames[symbolIndex][1] === null) {
                option.description = "Unchanged";
            } else {
                option.description = `(${symbol.value})`;
            }
            options.push(option);
        }
        const result = await vscode.window.showQuickPick(options, {
            title: "Rename symbols",
            ignoreFocusOut: true,
            ...quickPickOptions,
        });

        if (result === undefined) {
            return undefined;
        }

        if (result.data === undefined) {
            break;
        }
        if (result.index === undefined) {
            break;
        }

        const currentName = renames[result.index][1] ?? result.data.value;

        const newSymbol = await vscode.window.showInputBox({
            placeHolder: currentName,
            value: currentName,
            prompt: `Rename ${result.data.value}`,
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (result.data?.type) {
                    return validateSymbol(result.data.type, value)
                }
            }
        });

        if (newSymbol !== undefined) {
            renames[result.index][1] = newSymbol;
        }
    }

    return renames.filter(rename => rename[1] !== null && rename[0].value !== rename[1]) as [Symbol, SymbolValue][];
}
