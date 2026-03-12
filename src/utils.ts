import * as JSONC from "jsonc-parser"

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
export function jsoncModifyandEditWithInitialisedParents(text: string, path: JSONC.JSONPath, value: any, isArrayInsertion: boolean=false) {
    const parsedFile = JSONC.parse(text)

    let currentObject = parsedFile;

    // Iterate over the path to create parents if they don't exist
    for (let i = 0; i < path.length - 1; i++) {
        const currentPath = path.slice(0, i+1)
        currentObject = currentObject[path[i]]

        if (currentObject === undefined) {
            currentObject = {}
            text = JSONC.applyEdits(text,
                JSONC.modify(text, currentPath, {}, formatSettings)
            )
        }

    }

    text = JSONC.applyEdits(text,
        JSONC.modify(text, path, value, {...formatSettings, isArrayInsertion})
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