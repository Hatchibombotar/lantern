import * as vscode from 'vscode';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as nodePath from 'path';
import * as JSONC from "jsonc-parser"

import { FileTypes, getMinEngineVersion, getProjectDirectories, isFolder, Node, NodeInfo } from './parseProject';
import { jsoncModifyandEditWithInitialisedParents, objectModifyWithInitialisedParents } from './utils';

export default function registerAllCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        createEntity(context),
        createItem(context),
        entityCopyIdentifier(context),
        entityCreateBPEntity(context),
        entityCreateBPAnimation(context),
        entityCreateBPAnimationController(context),
        entityCreateRPEntity(context),
        entityCreateRPAnimation(context),
        entityCreateRPAnimationController(context),
        entityCreateRPRenderController(context),
        itemCopyIdentifier(),
        itemCreateBPItem(context),
        itemAttachableCreateRPEntity(context),
        itemAttachableCreateRPAnimation(context),
        itemAttachableCreateRPAnimationController(context),
        itemAttachableCreateRPRenderController(context),
    )
}

function createEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.createEntity", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        let folderPath = ""
        if (meta?.type === "folder") {
            folderPath = "." + meta.path
        }

        const identifier = await vscode.window.showInputBox({
            placeHolder: 'e.g. identifier:entity_name',
            validateInput: text => {
                text = text.trim()
                const split = text.split(":")
                const isInvalid = split.length !== 2
                return isInvalid ? "Invalid identifier, must be in format 'namespace:entity_name'" : null;
            },
        });
        if (identifier === undefined) {
            return
        }

        const [_, entity_name] = identifier.trim().split(":")

        const options = ["Full Entity", "Entity (RP Only)", "Entity (BP Only)"]
        const result = await vscode.window.showQuickPick(options, {
            placeHolder: 'Entity Type',
        });

        const [resourcePackDir, behaviorPackDir] = getProjectDirectories() ?? []

        const minEngineVersion = getMinEngineVersion()
        const formatVersionString = minEngineVersion.join(".")

        // fs.writeFile()

        const hasRPFile = result === options[0] || result === options[1]
        const hasBPFile = result === options[0] || result === options[2]

        if (hasBPFile) {
            const bpEntityTemplatePath = nodePath.resolve(context.extensionPath, "template_files/bp_entity.json")
            const bpEntityTemplateFile = (await fs.readFile(bpEntityTemplatePath)).toString()
            const bpEntityTemplate = JSON.parse(bpEntityTemplateFile)

            bpEntityTemplate["minecraft:entity"].description.identifier = identifier
            bpEntityTemplate.format_version = formatVersionString

            const bpEntityDestinationPath = nodePath.resolve(behaviorPackDir, "entities", folderPath, `${entity_name}.json`)

            if (existsSync(bpEntityDestinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + bpEntityDestinationPath);
                return
            }

            await fs.writeFile(bpEntityDestinationPath, JSON.stringify(bpEntityTemplate, null, 4))

            vscode.window.showInformationMessage(`Successfully created BP entity.`)
        }

        if (hasRPFile) {
            const rpEntityTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_entity.json")
            const rpEntityTemplateFile = (await fs.readFile(rpEntityTemplatePath)).toString()
            const rpEntityTemplate = JSON.parse(rpEntityTemplateFile)

            rpEntityTemplate["minecraft:client_entity"].description.identifier = identifier
            rpEntityTemplate.format_version = formatVersionString

            const rpEntityDestinationPath = nodePath.resolve(resourcePackDir, "entity", folderPath, `${entity_name}.json`)

            if (existsSync(rpEntityDestinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + rpEntityDestinationPath);
                return
            }

            await fs.writeFile(rpEntityDestinationPath, JSON.stringify(rpEntityTemplate, null, 4))

            vscode.window.showInformationMessage(`Successfully created RP entity.`)
        }
    })
}

function createItem(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.createItem", async (element: vscode.TreeItem) => {
    })
}
function entityCopyIdentifier(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.entityCopyIdentifier", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type === "entity") {
            vscode.env.clipboard.writeText(meta.identifier)
            vscode.window.showInformationMessage(`Copied identifier ${meta.identifier} to clipboard.`)
        }
    })
}
function entityCreateBPEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.entityCreateBPEntity", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "entity" || meta.category !== "entities") {
            return
        }

        for (const file of meta.files) {
            if (file.fileType === FileTypes.bp_entity) {
                vscode.window.showInformationMessage(`BP entity already exits for entity ${meta.identifier}`)
                return
            }
        }
        const folderPath = "." + meta.path
        const [_namespace, entity_name] = meta.identifier.trim().split(":")

        const [_resourcePackDir, behaviorPackDir] = getProjectDirectories() ?? []

        const minEngineVersion = getMinEngineVersion()
        const formatVersionString = minEngineVersion.join(".")

        const bpEntityTemplatePath = nodePath.resolve(context.extensionPath, "template_files/bp_entity.json")
        const bpEntityTemplateFile = (await fs.readFile(bpEntityTemplatePath)).toString()
        const bpEntityTemplate = JSON.parse(bpEntityTemplateFile)

        bpEntityTemplate["minecraft:entity"].description.identifier = meta.identifier
        bpEntityTemplate.format_version = formatVersionString

        const bpEntityDestinationPath = nodePath.resolve(behaviorPackDir, "entities", folderPath, `${entity_name}.json`)

        if (existsSync(bpEntityDestinationPath)) {
            vscode.window.showErrorMessage("File already exists: " + bpEntityDestinationPath);
            return
        }

        await fs.writeFile(bpEntityDestinationPath, JSON.stringify(bpEntityTemplate, null, 4))

        vscode.window.showInformationMessage(`Successfully created BP entity.`)
    })
}
function entityCreateBPAnimation(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.entityCreateBPAnimation", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "entities") {
            return
        }

        const existingBPAnimations = []
        let bpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.bp_entity) {
                bpEntityFile = file
            } else if (file.fileType === FileTypes.bp_animation) {
                existingBPAnimations.push(file)
            }
        }
        if (!bpEntityFile) {
            vscode.window.showInformationMessage(`BP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const [_resourcePackDir, behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingBPAnimations.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingBPAnimations.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingBPAnimations.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(behaviorPackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                existingFile = existingBPAnimations[finalDestinationOptionIndex]
            }
        }

        const bpEntity = (await fs.readFile(bpEntityFile.path)).toString()
        let parsedBPEntity = JSONC.parse(bpEntity)

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `animation.${namespace}.${entity_name}.`

        const animationIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. animation.namespace.entity.my_anim',
            value: initialAnimationIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (animationIdentifier === undefined) {
            return
        }

        parsedBPEntity = objectModifyWithInitialisedParents(
            parsedBPEntity,
            ["minecraft:entity", "description", "animations"],
            {}
        )
        const animationShortName: string = (() => {
            let shortName: string;
            if (animationIdentifier.startsWith(initialAnimationIdentifier)) {
                shortName = animationIdentifier.slice(initialAnimationIdentifier.length)
            } else {
                shortName = animationIdentifier
            }

            if (parsedBPEntity["minecraft:entity"]["description"]["animations"][shortName] === undefined) {
                return shortName
            } else {
                let i = 1
                let newShortName = shortName
                while (parsedBPEntity["minecraft:entity"]["description"]["animations"][newShortName] !== undefined) {
                    newShortName = shortName + "_" + i
                    i++
                }
                return newShortName
            }
        })()


        const templatePath = nodePath.resolve(context.extensionPath, "template_files/bp_single_animation.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/bp_animation_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.animations[animationIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(behaviorPackDir, "animations", `${animationShortName}.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingAnimationFile,
                ["animations", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(bpEntity,
            ["minecraft:entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(bpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created BP animation.`)
    })
}
function entityCreateBPAnimationController(context: vscode.ExtensionContext) {
    // very similar to entityCreateBPAnimation

    return vscode.commands.registerCommand("extension.entityCreateBPAnimationController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "entities") {
            return
        }

        const existingBPAnimationControllers = []
        let bpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.bp_entity) {
                bpEntityFile = file
            } else if (file.fileType === FileTypes.bp_animation_controllers) {
                existingBPAnimationControllers.push(file)
            }
        }
        if (!bpEntityFile) {
            vscode.window.showInformationMessage(`BP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const [_resourcePackDir, behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingBPAnimationControllers.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingBPAnimationControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingBPAnimationControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(behaviorPackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                existingFile = existingBPAnimationControllers[finalDestinationOptionIndex]
            }
        }

        const bpEntity = (await fs.readFile(bpEntityFile.path)).toString()
        let parsedBPEntity = JSONC.parse(bpEntity)

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `controller.animation.${namespace}.${entity_name}.`

        const animationIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. controller.animation.namespace.entity.my_ac',
            value: initialAnimationIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (animationIdentifier === undefined) {
            return
        }

        parsedBPEntity = objectModifyWithInitialisedParents(
            parsedBPEntity,
            ["minecraft:entity", "description", "animations"],
            {}
        )
        const animationShortName: string = (() => {
            let shortName: string;
            if (animationIdentifier.startsWith(initialAnimationIdentifier)) {
                shortName = animationIdentifier.slice(initialAnimationIdentifier.length)
            } else {
                shortName = animationIdentifier
            }

            if (parsedBPEntity["minecraft:entity"]["description"]["animations"][shortName] === undefined) {
                return shortName
            } else {
                let i = 1
                let newShortName = shortName
                while (parsedBPEntity["minecraft:entity"]["description"]["animations"][newShortName] !== undefined) {
                    newShortName = shortName + "_" + i
                    i++
                }
                return newShortName
            }
        })()


        const templatePath = nodePath.resolve(context.extensionPath, "template_files/bp_animation_controller.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/bp_animation_controller_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.animation_controllers[animationIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(behaviorPackDir, "animation_controllers", `${animationShortName}.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingAnimationFile,
                ["animation_controllers", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(bpEntity,
            ["minecraft:entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(bpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created BP animation controller.`)
    })
}
function entityCreateRPEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.entityCreateRPEntity", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "entity" || meta.category !== "entities") {
            return
        }

        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_entity) {
                vscode.window.showInformationMessage(`RP entity already exits for entity ${meta.identifier}`)
                return
            }
        }
        console.log(meta.path)
        const folderPath = "." + meta.path
        const [_namespace, entity_name] = meta.identifier.trim().split(":")

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        const minEngineVersion = getMinEngineVersion()
        const formatVersionString = minEngineVersion.join(".")

        const rpEntityTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_entity.json")
        const rpEntityTemplateFile = (await fs.readFile(rpEntityTemplatePath)).toString()
        const rpEntityTemplate = JSON.parse(rpEntityTemplateFile)

        rpEntityTemplate["minecraft:client_entity"].description.identifier = meta.identifier
        rpEntityTemplate.format_version = formatVersionString

        const rpEntityDestinationPath = nodePath.resolve(resourcePackDir, "entity", folderPath, `${entity_name}.json`)

        if (existsSync(rpEntityDestinationPath)) {
            vscode.window.showErrorMessage("File already exists: " + rpEntityDestinationPath);
            return
        }

        await fs.writeFile(rpEntityDestinationPath, JSON.stringify(rpEntityTemplate, null, 4))

        vscode.window.showInformationMessage(`Successfully created RP entity.`)
    })
}
function entityCreateRPAnimation(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.entityCreateRPAnimation", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "entities") {
            return
        }

        const existingRPAnimations = []
        let rpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_entity) {
                rpEntityFile = file
            } else if (file.fileType === FileTypes.rp_animation) {
                existingRPAnimations.push(file)
            }
        }
        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingRPAnimations.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimations.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimations.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                existingFile = existingRPAnimations[finalDestinationOptionIndex]
            }
        }

        const entity = (await fs.readFile(rpEntityFile.path)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `animation.${namespace}.${entity_name}.`

        const animationIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. animation.namespace.entity.my_anim',
            value: initialAnimationIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (animationIdentifier === undefined) {
            return
        }

        parsedEntity = objectModifyWithInitialisedParents(
            parsedEntity,
            ["minecraft:client_entity", "description", "animations"],
            {}
        )
        const animationShortName: string = (() => {
            let shortName: string;
            if (animationIdentifier.startsWith(initialAnimationIdentifier)) {
                shortName = animationIdentifier.slice(initialAnimationIdentifier.length)
            } else {
                shortName = animationIdentifier
            }

            if (parsedEntity["minecraft:client_entity"]["description"]["animations"][shortName] === undefined) {
                return shortName
            } else {
                let i = 1
                let newShortName = shortName
                while (parsedEntity["minecraft:client_entity"]["description"]["animations"][newShortName] !== undefined) {
                    newShortName = shortName + "_" + i
                    i++
                }
                return newShortName
            }
        })()


        const templatePath = nodePath.resolve(context.extensionPath, "template_files/rp_single_animation.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_animation_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.animations[animationIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(resourcePackDir, "animations", `${animationShortName}.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingAnimationFile,
                ["animations", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(entity,
            ["minecraft:client_entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created RP animation.`)
    })
}
function entityCreateRPAnimationController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.entityCreateRPAnimationController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "entities") {
            return
        }

        const existingRPAnimationControllers = []
        let rpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_entity) {
                rpEntityFile = file
            } else if (file.fileType === FileTypes.rp_animation_controllers) {
                existingRPAnimationControllers.push(file)
            }
        }
        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingRPAnimationControllers.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimationControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimationControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                existingFile = existingRPAnimationControllers[finalDestinationOptionIndex]
            }
        }

        const entity = (await fs.readFile(rpEntityFile.path)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `controller.animation.${namespace}.${entity_name}.`

        const animationIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. controller.animation.namespace.entity.my_anim',
            value: initialAnimationIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (animationIdentifier === undefined) {
            return
        }

        parsedEntity = objectModifyWithInitialisedParents(
            parsedEntity,
            ["minecraft:client_entity", "description", "animations"],
            {}
        )
        const animationShortName: string = (() => {
            let shortName: string;
            if (animationIdentifier.startsWith(initialAnimationIdentifier)) {
                shortName = animationIdentifier.slice(initialAnimationIdentifier.length)
            } else {
                shortName = animationIdentifier
            }

            if (parsedEntity["minecraft:client_entity"]["description"]["animations"][shortName] === undefined) {
                return shortName
            } else {
                let i = 1
                let newShortName = shortName
                while (parsedEntity["minecraft:client_entity"]["description"]["animations"][newShortName] !== undefined) {
                    newShortName = shortName + "_" + i
                    i++
                }
                return newShortName
            }
        })()


        const templatePath = nodePath.resolve(context.extensionPath, "template_files/rp_animation_controller.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_animation_controller_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.animation_controllers[animationIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(resourcePackDir, "animation_controllers", `${animationShortName}.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingAnimationFile,
                ["animation_controllers", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(entity,
            ["minecraft:client_entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created RP animation controller.`)
    })
}
function entityCreateRPRenderController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.entityCreateRPRenderController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "entities") {
            return
        }

        const existingRPRenderControllers = []
        let rpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_entity) {
                rpEntityFile = file
            } else if (file.fileType === FileTypes.rp_render_controllers) {
                existingRPRenderControllers.push(file)
            }
        }
        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingRPRenderControllers.length === 0
        let hasExistingFile: NodeInfo["files"][0] | undefined;
        if (existingRPRenderControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPRenderControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                hasExistingFile = existingRPRenderControllers[finalDestinationOptionIndex]
            }
        }

        const entity = (await fs.readFile(rpEntityFile.path)).toString()

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialRenderControllerIdentifier = `controller.render.${namespace}.${entity_name}.`

        const rcIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. controller.render.namespace.my_entity.thing',
            value: initialRenderControllerIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (rcIdentifier === undefined) {
            return
        }

        const templatePath = nodePath.resolve(context.extensionPath, "template_files/rp_render_controller.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_render_controller_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.render_controllers[rcIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(resourcePackDir, "render_controllers", `${entity_name}.render_controller.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (hasExistingFile === undefined) {
                return
            }
            const existingFile = (await fs.readFile(hasExistingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingFile,
                ["render_controllers", rcIdentifier],
                template,
            )
            fs.writeFile(hasExistingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(entity,
            ["minecraft:client_entity", "description", "render_controllers", -1],
            rcIdentifier,
            true
        )

        await fs.writeFile(rpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created RP render controller.`)
    })
}
function itemCopyIdentifier() {
    return vscode.commands.registerCommand("extension.itemCopyIdentifier", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type === "entity") {
            vscode.env.clipboard.writeText(meta.identifier)
            vscode.window.showInformationMessage(`Copied identifier ${meta.identifier} to clipboard.`)
        }
    })
}
function itemCreateBPItem(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.itemCreateBPItem", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "entity" || meta.category !== "items") {
            return
        }

        for (const file of meta.files) {
            if (file.fileType === FileTypes.bp_items) {
                vscode.window.showInformationMessage(`BP item already exits for entity ${meta.identifier}`)
                return
            }
        }
        const folderPath = "." + meta.path
        const [_namespace, entity_name] = meta.identifier.trim().split(":")

        const [_resourcePackDir, behaviorPackDir] = getProjectDirectories() ?? []

        const minEngineVersion = getMinEngineVersion()
        const formatVersionString = minEngineVersion.join(".")

        const templatePath = nodePath.resolve(context.extensionPath, "template_files/bp_item.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        template["minecraft:item"].description.identifier = meta.identifier
        template.format_version = formatVersionString

        const destinationPath = nodePath.resolve(behaviorPackDir, "items", folderPath, `${entity_name}.json`)

        if (existsSync(destinationPath)) {
            vscode.window.showErrorMessage("File already exists: " + destinationPath);
            return
        }

        await fs.writeFile(destinationPath, JSON.stringify(template, null, 4))

        vscode.window.showInformationMessage(`Successfully created BP item.`)
    })
}
function itemAttachableCreateRPEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.itemAttachableCreateRPEntity", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "entity" || meta.category !== "items") {
            return
        }

        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_entity) {
                vscode.window.showInformationMessage(`Attachable already exits for item ${meta.identifier}`)
                return
            }
        }
        const folderPath = "." + meta.path
        console.log(meta.path)
        const [_namespace, entity_name] = meta.identifier.trim().split(":")

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        const minEngineVersion = getMinEngineVersion()
        const formatVersionString = minEngineVersion.join(".")

        const rpEntityTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_attachable.json")
        const rpEntityTemplateFile = (await fs.readFile(rpEntityTemplatePath)).toString()
        const rpEntityTemplate = JSON.parse(rpEntityTemplateFile)

        rpEntityTemplate["minecraft:attachable"].description.identifier = meta.identifier
        rpEntityTemplate.format_version = formatVersionString

        const rpEntityDestinationPath = nodePath.resolve(resourcePackDir, "attachables", folderPath, `${entity_name}.json`)

        if (existsSync(rpEntityDestinationPath)) {
            vscode.window.showErrorMessage("File already exists: " + rpEntityDestinationPath);
            return
        }

        await fs.writeFile(rpEntityDestinationPath, JSON.stringify(rpEntityTemplate, null, 4))

        vscode.window.showInformationMessage(`Successfully created attachable.`)
    })
}
function itemAttachableCreateRPAnimation(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.itemAttachableCreateRPAnimation", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "items") {
            return
        }

        const existingRPAnimations = []
        let rpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_attachable) {
                rpEntityFile = file
            } else if (file.fileType === FileTypes.rp_animation) {
                existingRPAnimations.push(file)
            }
        }
        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingRPAnimations.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimations.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimations.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                existingFile = existingRPAnimations[finalDestinationOptionIndex]
            }
        }

        const entity = (await fs.readFile(rpEntityFile.path)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `animation.${namespace}.${entity_name}.`

        const animationIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. animation.namespace.entity.my_anim',
            value: initialAnimationIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (animationIdentifier === undefined) {
            return
        }

        parsedEntity = objectModifyWithInitialisedParents(
            parsedEntity,
            ["minecraft:attachable", "description", "animations"],
            {}
        )
        const animationShortName: string = (() => {
            let shortName: string;
            if (animationIdentifier.startsWith(initialAnimationIdentifier)) {
                shortName = animationIdentifier.slice(initialAnimationIdentifier.length)
            } else {
                shortName = animationIdentifier
            }

            if (parsedEntity["minecraft:attachable"]["description"]["animations"][shortName] === undefined) {
                return shortName
            } else {
                let i = 1
                let newShortName = shortName
                while (parsedEntity["minecraft:attachable"]["description"]["animations"][newShortName] !== undefined) {
                    newShortName = shortName + "_" + i
                    i++
                }
                return newShortName
            }
        })()


        const templatePath = nodePath.resolve(context.extensionPath, "template_files/rp_single_animation.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_animation_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.animations[animationIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(resourcePackDir, "animations", `${animationShortName}.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingAnimationFile,
                ["animations", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(entity,
            ["minecraft:attachable", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created RP animation.`)
    })
}
function itemAttachableCreateRPAnimationController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.itemAttachableCreateRPAnimationController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "items") {
            return
        }

        const existingRPAnimationControllers = []
        let rpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_attachable) {
                rpEntityFile = file
            } else if (file.fileType === FileTypes.rp_animation_controllers) {
                existingRPAnimationControllers.push(file)
            }
        }
        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for item ${meta.identifier}`)
            return
        }

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingRPAnimationControllers.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimationControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimationControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                existingFile = existingRPAnimationControllers[finalDestinationOptionIndex]
            }
        }

        const entity = (await fs.readFile(rpEntityFile.path)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `controller.animation.${namespace}.${entity_name}.`

        const animationIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. controller.animation.namespace.entity.my_anim',
            value: initialAnimationIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (animationIdentifier === undefined) {
            return
        }

        parsedEntity = objectModifyWithInitialisedParents(
            parsedEntity,
            ["minecraft:attachable", "description", "animations"],
            {}
        )
        const animationShortName: string = (() => {
            let shortName: string;
            if (animationIdentifier.startsWith(initialAnimationIdentifier)) {
                shortName = animationIdentifier.slice(initialAnimationIdentifier.length)
            } else {
                shortName = animationIdentifier
            }

            if (parsedEntity["minecraft:attachable"]["description"]["animations"][shortName] === undefined) {
                return shortName
            } else {
                let i = 1
                let newShortName = shortName
                while (parsedEntity["minecraft:attachable"]["description"]["animations"][newShortName] !== undefined) {
                    newShortName = shortName + "_" + i
                    i++
                }
                return newShortName
            }
        })()


        const templatePath = nodePath.resolve(context.extensionPath, "template_files/rp_animation_controller.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_animation_controller_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.animation_controllers[animationIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(resourcePackDir, "animation_controllers", `${animationShortName}.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingAnimationFile,
                ["animation_controllers", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(entity,
            ["minecraft:attachable", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created RP animation controller.`)
    })
}
function itemAttachableCreateRPRenderController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("extension.itemAttachableCreateRPRenderController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "entity" || meta.category !== "items") {
            return
        }

        const existingRPRenderControllers = []
        let rpEntityFile: NodeInfo["files"][0] | undefined;
        for (const file of meta.files) {
            if (file.fileType === FileTypes.rp_attachable) {
                rpEntityFile = file
            } else if (file.fileType === FileTypes.rp_render_controllers) {
                existingRPRenderControllers.push(file)
            }
        }
        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const [resourcePackDir, _behaviorPackDir] = getProjectDirectories() ?? []

        let shouldCreateFileFromScratch = existingRPRenderControllers.length === 0
        let hasExistingFile: NodeInfo["files"][0] | undefined;
        if (existingRPRenderControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPRenderControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path)
                } as vscode.QuickPickItem))
            )


            fileDestinationOptions.push({
                "label": "New File",
            })

            const fileDestinationOption = await vscode.window.showQuickPick(fileDestinationOptions, {
                placeHolder: 'Destination',
            });

            if (fileDestinationOption === undefined) {
                return
            }

            const finalDestinationOptionIndex = fileDestinationOptions.indexOf(fileDestinationOption)
            if (finalDestinationOptionIndex === -1) {
                return
            } else if (finalDestinationOptionIndex === fileDestinationOptions.length - 1) {
                shouldCreateFileFromScratch = true
            } else {
                hasExistingFile = existingRPRenderControllers[finalDestinationOptionIndex]
            }
        }

        const entity = (await fs.readFile(rpEntityFile.path)).toString()

        const [namespace, entity_name] = meta.identifier.trim().split(":")

        const initialRenderControllerIdentifier = `controller.render.${namespace}.${entity_name}.`

        const rcIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. controller.render.namespace.my_entity.thing',
            value: initialRenderControllerIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (rcIdentifier === undefined) {
            return
        }

        const templatePath = nodePath.resolve(context.extensionPath, "template_files/rp_render_controller.json")
        const templateFile = (await fs.readFile(templatePath)).toString()
        const template = JSON.parse(templateFile)

        if (shouldCreateFileFromScratch) {
            const minEngineVersion = getMinEngineVersion()
            const formatVersionString = minEngineVersion.join(".")

            const rootTemplatePath = nodePath.resolve(context.extensionPath, "template_files/rp_render_controller_root.json")
            const rootTemplateFile = (await fs.readFile(rootTemplatePath)).toString()
            const rootTemplate = JSON.parse(rootTemplateFile)

            rootTemplate.render_controllers[rcIdentifier] = template

            rootTemplate.format_version = formatVersionString

            const destinationPath = nodePath.resolve(resourcePackDir, "render_controllers", `${entity_name}.render_controller.json`)

            if (existsSync(destinationPath)) {
                vscode.window.showErrorMessage("File already exists: " + destinationPath);
                return
            }

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (hasExistingFile === undefined) {
                return
            }
            const existingFile = (await fs.readFile(hasExistingFile.path)).toString()
            const result = jsoncModifyandEditWithInitialisedParents(existingFile,
                ["render_controllers", rcIdentifier],
                template,
            )
            fs.writeFile(hasExistingFile.path, result)
        }

        const result = jsoncModifyandEditWithInitialisedParents(entity,
            ["minecraft:attachable", "description", "render_controllers", -1],
            rcIdentifier,
            true
        )

        await fs.writeFile(rpEntityFile.path, result)
        vscode.window.showInformationMessage(`Successfully created RP render controller.`)
    })
}