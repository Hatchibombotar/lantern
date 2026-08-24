import * as vscode from 'vscode';
import * as JSONC from "jsonc-parser"
import nodePath from "path"
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

// // Same as JSONC.modify, but creates all parent objects along the json path
// function jsoncModifyWithInitialisedParents(text: string, path: JSONC.JSONPath, value: any) {
//     return JSONC.modify(text,
//         path,
//         value,
//         {}
//     )
// }

const formatSettings: JSONC.ModificationOptions = {
    formattingOptions: {
        insertSpaces: true,
        tabSize: 4,
        keepLines: true,
    }
}

// Same as JSONC.modify, but creates all parent objects along the json path
export function jsoncModifyandEditWithInitialisedParents(text: string, path: JSONC.JSONPath, value: any, isArrayInsertion: boolean = false) {
    const parsedFile = JSONC.parse(text)

    let currentObject = parsedFile;

    // Iterate over the path to create parents if they don't exist
    for (let i = 0; i < path.length - 1; i++) {
        const currentPath = path.slice(0, i + 1)
        currentObject = currentObject[path[i]]

        if (currentObject === undefined) {
            currentObject = {}
            text = JSONC.applyEdits(text,
                JSONC.modify(text, currentPath, {}, formatSettings)
            )
        }

    }

    // Set the value at the given path
    text = JSONC.applyEdits(text,
        JSONC.modify(text, path, value, { ...formatSettings, isArrayInsertion })
    )

    return text
}
export function objectModifyWithInitialisedParents(object: any, path: JSONC.JSONPath, value: any) {
    let currentObject = object;

    // Iterate over the path to create parents if they don't exist
    for (let i = 0; i < path.length; i++) {
        const key = path[i];

        // Check if it's the last item in the path
        if (i === path.length - 1) {
            currentObject[key] = value; // Set the value at the last key
        } else {
            // If parent doesn't exist, initialize it as an empty object
            if (currentObject[key] === undefined) {
                currentObject[key] = {};
            }
            // Move deeper into the object hierarchy
            currentObject = currentObject[key];
        }
    }

    return object; // Return the modified object
}

export function getDataAtObjectPath(object: any, path: JSONC.JSONPath): any {
    let value = object
    for (const segment of path) {
        if (value === undefined) return undefined
        value = value[segment]
    }

    return value
}

export async function readTemplate(context: vscode.ExtensionContext, template_name: string) {
    const templatePath = nodePath.resolve(context.extensionPath, "template_files", template_name)
    const templateFile = (await fs.readFile(templatePath)).toString()
    const template = JSON.parse(templateFile)

    return template
}

// pack: full path to RP or BP
// folder: minmum location for file to be created e.g. "entities", "animations", etc.
// idealSubfolder: the ideal location for the file to be created
// fileName: the name for the file
export async function findOrCreateDestinationPath(packDir: string, folder: string, idealSubfolder: string, fileName: string, extension: string) {
    const minimumPath = nodePath.resolve(packDir, folder)
    if (!existsSync(minimumPath)) {
        await fs.mkdir(minimumPath)
    }

    const subfolderParts = idealSubfolder.split(nodePath.sep)
    let finalSubfolder = minimumPath
    for (const segment of subfolderParts) {
        const newSubfolder = nodePath.resolve(finalSubfolder, segment)
        if (!existsSync(newSubfolder)) {
            break
        }
        finalSubfolder = newSubfolder
    }

    const finalPath = nodePath.resolve(finalSubfolder, fileName + extension)
    if (existsSync(finalPath)) {
        let i = 1;
        while (true) {
            const finalPath = nodePath.resolve(finalSubfolder, fileName + "_" + i + extension)
            if (!existsSync(finalPath)) {
                return finalPath
            }
            i++
        }
    } else {
        return finalPath
    }

}

export async function createGlobalStorageDirectory(context: vscode.ExtensionContext) {
    const path = vscode.Uri.file(context.globalStorageUri.fsPath).fsPath
    if (!existsSync(path)) {
        await fs.mkdir(path)
    }

    return path
}

export async function showErrorInTextDocument(content: string) {
    const action = await vscode.window.showErrorMessage("An error occured while importing. Please report it!",
        "Report Error"
    )

    if (action === "Report Error") {
        const doc = await vscode.workspace.openTextDocument({
            language: "markdown",
            content: content
        });
        await vscode.window.showTextDocument(doc);
    }
}