import * as vscode from 'vscode';
import * as JSONC from "jsonc-parser"
import fs from 'fs/promises';
import nodePath from 'path';

import { AddonFileTypes, getFilesOfType } from '../analysis/AddonFileTypes';
import { getProjectContext } from '../analysis/context';
import { findOrCreateDestinationPath, jsoncModifyandEditWithInitialisedParents as jsoncModify, objectModifyWithInitialisedParents, readTemplate } from '../utils';
import { Node, NodeInfo } from '../domainViewer/createFolderStructure';

export default function registerCreateFileActions(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        createEntity(context),
        createItem(context),
        entityCreateBPEntity(context),
        entityCreateBPAnimation(context),
        entityCreateBPAnimationController(context),
        entityCreateRPEntity(context),
        entityCreateRPAnimation(context),
        entityCreateRPAnimationController(context),
        entityCreateRPRenderController(context),
        itemCreateBPItem(context),
        itemAttachableCreateRPEntity(context),
        itemAttachableCreateRPAnimation(context),
        itemAttachableCreateRPAnimationController(context),
        itemAttachableCreateRPRenderController(context),
    )
}

function createEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.createEntity", async (element: vscode.TreeItem) => {
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
        if (identifier === undefined) return

        const entityName = identifier.trim().split(":")[1]

        const options = ["Full Entity", "Entity (RP Only)", "Entity (BP Only)"]
        const result = await vscode.window.showQuickPick(options, {
            placeHolder: 'Entity Type',
        });

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, behaviorPackDir, defaultFormatVersion } = projectData

        const hasRPFile = result === options[0] || result === options[1]
        const hasBPFile = result === options[0] || result === options[2]

        if (hasBPFile) {
            const bpEntityTemplate = await readTemplate(context, "bp_entity.json")
            bpEntityTemplate["minecraft:entity"].description.identifier = identifier
            bpEntityTemplate.format_version = defaultFormatVersion

            const bpEntityDestinationPath = await findOrCreateDestinationPath(behaviorPackDir, "entities", folderPath, entityName, ".json")

            await fs.writeFile(bpEntityDestinationPath, JSON.stringify(bpEntityTemplate, null, 4))

            vscode.window.showInformationMessage(`Successfully created BP entity.`)
        }

        if (hasRPFile) {
            const rpEntityTemplate = await readTemplate(context, "rp_entity.json")
            rpEntityTemplate["minecraft:client_entity"].description.identifier = identifier
            rpEntityTemplate.format_version = defaultFormatVersion

            const rpEntityDestinationPath = await findOrCreateDestinationPath(resourcePackDir, "entity", folderPath, entityName, ".json")

            await fs.writeFile(rpEntityDestinationPath, JSON.stringify(rpEntityTemplate, null, 4))

            vscode.window.showInformationMessage(`Successfully created RP entity.`)
        }
    })
}

function createItem(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.createItem", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        let folderPath = ""
        if (meta?.type === "folder") {
            folderPath = "." + meta.path
        }

        const identifier = await vscode.window.showInputBox({
            placeHolder: 'e.g. identifier:item_name',
            validateInput: text => {
                text = text.trim()
                const split = text.split(":")
                const isInvalid = split.length !== 2
                return isInvalid ? "Invalid identifier, must be in format 'namespace:item_name'" : null;
            },
        });
        if (identifier === undefined) return

        const entityName = identifier.trim().split(":")[1]

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { behaviorPackDir, defaultFormatVersion } = projectData


        const template = await readTemplate(context, "bp_item.json")
        template["minecraft:item"].description.identifier = identifier
        template.format_version = defaultFormatVersion

        const bpEntityDestinationPath = await findOrCreateDestinationPath(behaviorPackDir, "items", folderPath, entityName, ".json")

        await fs.writeFile(bpEntityDestinationPath, JSON.stringify(template, null, 4))

        vscode.window.showInformationMessage(`Successfully created BP item.`)
    })
}
function entityCreateBPEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.entityCreateBPEntity", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "element" || meta.category !== "entities") throw Error("Unexpected context node.")

        const bpEntityFile = getFilesOfType(AddonFileTypes.bp_entity, meta.files)[0]
        if (bpEntityFile !== undefined) {
            vscode.window.showInformationMessage(`BP entity already exits for entity ${meta.identifier}`)
            return
        }
        const folderPath = "." + meta.path
        const [_, entityName] = meta.identifier.trim().split(":")

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { behaviorPackDir, defaultFormatVersion } = projectData

        const bpEntityTemplate = await readTemplate(context, "bp_entity.json")

        bpEntityTemplate["minecraft:entity"].description.identifier = meta.identifier
        bpEntityTemplate.format_version = defaultFormatVersion

        const bpEntityDestinationPath = await findOrCreateDestinationPath(behaviorPackDir, "entities", folderPath, entityName, ".json")

        await fs.writeFile(bpEntityDestinationPath, JSON.stringify(bpEntityTemplate, null, 4))
        vscode.window.showInformationMessage(`Successfully created BP entity.`)
    })
}
function entityCreateBPAnimation(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.entityCreateBPAnimation", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "entities") throw Error("Unexpected context node.")

        const existingBPAnimations = getFilesOfType(AddonFileTypes.bp_animation, meta.files)
        const bpEntityFile = getFilesOfType(AddonFileTypes.bp_entity, meta.files)[0]

        if (!bpEntityFile) {
            return vscode.window.showInformationMessage(`BP entity does not exist for entity ${meta.identifier}`)
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { behaviorPackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingBPAnimations.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingBPAnimations.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingBPAnimations.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(behaviorPackDir, x.path.exactPath)
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

        const bpEntity = (await fs.readFile(bpEntityFile.path.exactPath)).toString()
        let parsedBPEntity = JSONC.parse(bpEntity)

        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `animation.${namespace}.${entityName}.`

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


        const template = await readTemplate(context, "bp_single_animation.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "bp_animation_root.json")

            rootTemplate.animations[animationIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(behaviorPackDir, "animations", "", animationShortName, ".json")

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path.exactPath)).toString()
            const result = jsoncModify(existingAnimationFile,
                ["animations", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path.exactPath, result)
        }

        const result = jsoncModify(bpEntity,
            ["minecraft:entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(bpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created BP animation.`)
    })
}
function entityCreateBPAnimationController(context: vscode.ExtensionContext) {
    // very similar to entityCreateBPAnimation

    return vscode.commands.registerCommand("bedrockLantern.entityCreateBPAnimationController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "entities") throw Error("Unexpected context node.")

        const existingBPAnimationControllers = getFilesOfType(AddonFileTypes.bp_animation_controllers, meta.files)
        const bpEntityFile = getFilesOfType(AddonFileTypes.bp_entity, meta.files)[0]

        if (!bpEntityFile) {
            vscode.window.showInformationMessage(`BP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { behaviorPackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingBPAnimationControllers.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingBPAnimationControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingBPAnimationControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(behaviorPackDir, x.path.exactPath)
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

        const bpEntity = (await fs.readFile(bpEntityFile.path.exactPath)).toString()
        let parsedBPEntity = JSONC.parse(bpEntity)

        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `controller.animation.${namespace}.${entityName}.`

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


        const template = await readTemplate(context, "bp_animation_controller.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "bp_animation_controller_root.json")

            rootTemplate.animation_controllers[animationIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(behaviorPackDir, "animation_controllers", "", animationShortName, ".json")
      
            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path.exactPath)).toString()
            const result = jsoncModify(existingAnimationFile,
                ["animation_controllers", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path.exactPath, result)
        }

        const result = jsoncModify(bpEntity,
            ["minecraft:entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(bpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created BP animation controller.`)
    })
}
function entityCreateRPEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.entityCreateRPEntity", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "element" || meta.category !== "entities") throw Error("Unexpected context node.")

        for (const file of meta.files) {
            if (file.fileType === AddonFileTypes.rp_entity) {
                vscode.window.showInformationMessage(`RP entity already exits for entity ${meta.identifier}`)
                return
            }
        }
        const folderPath = "." + meta.path
        const [_namespace, entityName] = meta.identifier.trim().split(":")

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        const rpEntityTemplate = await readTemplate(context, "rp_entity.json")

        rpEntityTemplate["minecraft:client_entity"].description.identifier = meta.identifier
        rpEntityTemplate.format_version = defaultFormatVersion

        const rpEntityDestinationPath = await findOrCreateDestinationPath(resourcePackDir, "entity", folderPath, entityName, ".json")

        await fs.writeFile(rpEntityDestinationPath, JSON.stringify(rpEntityTemplate, null, 4))

        vscode.window.showInformationMessage(`Successfully created RP entity.`)
    })
}
function entityCreateRPAnimation(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.entityCreateRPAnimation", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "entities") throw Error("Unexpected context node.")

        const existingRPAnimations = getFilesOfType(AddonFileTypes.rp_animation, meta.files)
        const rpEntityFile = getFilesOfType(AddonFileTypes.rp_entity, meta.files)[0]

        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingRPAnimations.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimations.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimations.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path.exactPath)
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

        const entity = (await fs.readFile(rpEntityFile.path.exactPath)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `animation.${namespace}.${entityName}.`

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


        const template = await readTemplate(context, "rp_single_animation.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "rp_animation_root.json")

            rootTemplate.animations[animationIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(resourcePackDir, "animations", "", animationShortName, ".json")

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path.exactPath)).toString()
            const result = jsoncModify(existingAnimationFile,
                ["animations", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path.exactPath, result)
        }

        const result = jsoncModify(entity,
            ["minecraft:client_entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created RP animation.`)
    })
}
function entityCreateRPAnimationController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.entityCreateRPAnimationController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "entities") throw Error("Unexpected context node.")

        const existingRPAnimationControllers = getFilesOfType(AddonFileTypes.rp_animation_controllers, meta.files)
        const rpEntityFile = getFilesOfType(AddonFileTypes.rp_entity, meta.files)[0]

        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingRPAnimationControllers.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimationControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimationControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path.exactPath)
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

        const entity = (await fs.readFile(rpEntityFile.path.exactPath)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `controller.animation.${namespace}.${entityName}.`

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


        const template = await readTemplate(context, "rp_animation_controller.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "rp_animation_controller_root.json")

            rootTemplate.animation_controllers[animationIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(resourcePackDir, "animation_controllers", "", animationShortName, ".json")

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path.exactPath)).toString()
            const result = jsoncModify(existingAnimationFile,
                ["animation_controllers", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path.exactPath, result)
        }

        const result = jsoncModify(entity,
            ["minecraft:client_entity", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created RP animation controller.`)
    })
}
function entityCreateRPRenderController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.entityCreateRPRenderController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "entities") throw Error("Unexpected context node.")

        const existingRPRenderControllers = getFilesOfType(AddonFileTypes.rp_render_controllers, meta.files)
        const rpEntityFile = getFilesOfType(AddonFileTypes.rp_entity, meta.files)[0]

        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingRPRenderControllers.length === 0
        let hasExistingFile: NodeInfo["files"][0] | undefined;
        if (existingRPRenderControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPRenderControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path.exactPath)
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

        const entity = (await fs.readFile(rpEntityFile.path.exactPath)).toString()
        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialRenderControllerIdentifier = `controller.render.${namespace}.${entityName}.`

        const rcIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. controller.render.namespace.my_entity.thing',
            value: initialRenderControllerIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (rcIdentifier === undefined) {
            return
        }

        const template = await readTemplate(context, "rp_render_controller.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "rp_render_controller_root.json")

            rootTemplate.render_controllers[rcIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(resourcePackDir, "render_controllers", "", `${entityName}.render_controller`, ".json")

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (hasExistingFile === undefined) {
                return
            }
            const existingFile = (await fs.readFile(hasExistingFile.path.exactPath)).toString()
            const result = jsoncModify(existingFile,
                ["render_controllers", rcIdentifier],
                template,
            )
            fs.writeFile(hasExistingFile.path.exactPath, result)
        }

        const result = jsoncModify(entity,
            ["minecraft:client_entity", "description", "render_controllers", -1],
            rcIdentifier,
            true
        )

        await fs.writeFile(rpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created RP render controller.`)
    })
}
function itemCreateBPItem(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.itemCreateBPItem", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "element" || meta.category !== "items") throw Error("Unexpected context node.")

        const bpItem = getFilesOfType(AddonFileTypes.bp_items, meta.files)[0]
        if (bpItem !== undefined) {
            vscode.window.showInformationMessage(`BP item already exits for entity ${meta.identifier}`)
            return
        }

        const folderPath = "." + meta.path
        const [_, entityName] = meta.identifier.trim().split(":")

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { behaviorPackDir, defaultFormatVersion } = projectData

        const template = await readTemplate(context, "bp_item.json")
        template["minecraft:item"].description.identifier = meta.identifier
        template.format_version = defaultFormatVersion

        const destinationPath = await findOrCreateDestinationPath(behaviorPackDir, "items", folderPath, entityName, ".json")

        await fs.writeFile(destinationPath, JSON.stringify(template, null, 4))

        vscode.window.showInformationMessage(`Successfully created BP item.`)
    })
}
function itemAttachableCreateRPEntity(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.itemAttachableCreateRPEntity", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;
        if (meta?.type !== "element" || meta.category !== "items") throw Error("Unexpected context node.")

        for (const file of meta.files) {
            if (file.fileType === AddonFileTypes.rp_entity) {
                vscode.window.showInformationMessage(`Attachable already exits for item ${meta.identifier}`)
                return
            }
        }
        const folderPath = "." + meta.path
        const entityName = meta.identifier.trim().split(":")[1]

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        const rpEntityTemplate = await readTemplate(context, "rp_attachable.json")

        rpEntityTemplate["minecraft:attachable"].description.identifier = meta.identifier
        rpEntityTemplate.format_version = defaultFormatVersion

        const rpEntityDestinationPath = await findOrCreateDestinationPath(resourcePackDir, "attachables", folderPath, entityName, ".json")

        await fs.writeFile(rpEntityDestinationPath, JSON.stringify(rpEntityTemplate, null, 4))

        vscode.window.showInformationMessage(`Successfully created attachable.`)
    })
}
function itemAttachableCreateRPAnimation(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.itemAttachableCreateRPAnimation", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "items") throw Error("Unexpected context node.")

        const existingRPAnimations = getFilesOfType(AddonFileTypes.rp_animation, meta.files)
        const rpEntityFile = getFilesOfType(AddonFileTypes.rp_entity, meta.files)[0]

        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingRPAnimations.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimations.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimations.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path.exactPath)
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

        const entity = (await fs.readFile(rpEntityFile.path.exactPath)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `animation.${namespace}.${entityName}.`

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


        const template = await readTemplate(context, "rp_single_animation.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "rp_animation_root.json")

            rootTemplate.animations[animationIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(resourcePackDir, "animations", "", animationShortName, ".json")

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path.exactPath)).toString()
            const result = jsoncModify(existingAnimationFile,
                ["animations", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path.exactPath, result)
        }

        const result = jsoncModify(entity,
            ["minecraft:attachable", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created RP animation.`)
    })
}
function itemAttachableCreateRPAnimationController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.itemAttachableCreateRPAnimationController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "items") throw Error("Unexpected context node.")

        const existingRPAnimationControllers = getFilesOfType(AddonFileTypes.rp_animation_controllers, meta.files)
        const rpEntityFile = getFilesOfType(AddonFileTypes.rp_entity, meta.files)[0]

        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for item ${meta.identifier}`)
            return
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingRPAnimationControllers.length === 0
        let existingFile: NodeInfo["files"][0] | undefined;
        if (existingRPAnimationControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPAnimationControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path.exactPath)
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

        const entity = (await fs.readFile(rpEntityFile.path.exactPath)).toString()
        let parsedEntity = JSONC.parse(entity)

        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialAnimationIdentifier = `controller.animation.${namespace}.${entityName}.`

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


        const template = await readTemplate(context, "rp_animation_controller.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "rp_animation_controller_root.json")

            rootTemplate.animation_controllers[animationIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(resourcePackDir, "animation_controllers", "", animationShortName, ".json")

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (existingFile === undefined) {
                return
            }
            const existingAnimationFile = (await fs.readFile(existingFile.path.exactPath)).toString()
            const result = jsoncModify(existingAnimationFile,
                ["animation_controllers", animationIdentifier],
                template,
            )
            fs.writeFile(existingFile.path.exactPath, result)
        }

        const result = jsoncModify(entity,
            ["minecraft:attachable", "description", "animations", animationShortName],
            animationIdentifier,
        )

        await fs.writeFile(rpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created RP animation controller.`)
    })
}
function itemAttachableCreateRPRenderController(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand("bedrockLantern.itemAttachableCreateRPRenderController", async (element: vscode.TreeItem) => {
        const meta = (element as any).__meta as (Node) | undefined;

        if (meta?.type !== "element" || meta.category !== "items") throw Error("Unexpected context node.")

        const existingRPRenderControllers = getFilesOfType(AddonFileTypes.rp_render_controllers, meta.files)
        const rpEntityFile = getFilesOfType(AddonFileTypes.rp_entity, meta.files)[0]

        if (!rpEntityFile) {
            vscode.window.showInformationMessage(`RP entity does not exist for entity ${meta.identifier}`)
            return
        }

        const projectData = getProjectContext()
        if (projectData === undefined) return
        const { resourcePackDir, defaultFormatVersion } = projectData

        let shouldCreateFileFromScratch = existingRPRenderControllers.length === 0
        let hasExistingFile: NodeInfo["files"][0] | undefined;
        if (existingRPRenderControllers.length !== 0) {
            const fileDestinationOptions: vscode.QuickPickItem[] = []
            fileDestinationOptions.push(
                ...existingRPRenderControllers.map(x => ({
                    label: `Add to existing`,
                    description: nodePath.relative(resourcePackDir, x.path.exactPath)
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

        const entity = (await fs.readFile(rpEntityFile.path.exactPath)).toString()

        const [namespace, entityName] = meta.identifier.trim().split(":")

        const initialRenderControllerIdentifier = `controller.render.${namespace}.${entityName}.`
        const rcIdentifier = (await vscode.window.showInputBox({
            placeHolder: 'e.g. controller.render.namespace.my_entity.thing',
            value: initialRenderControllerIdentifier,
            valueSelection: [-1, -1]
        }))?.trim();

        if (rcIdentifier === undefined) {
            return
        }

        const template = await readTemplate(context, "rp_render_controller.json")

        if (shouldCreateFileFromScratch) {
            const rootTemplate = await readTemplate(context, "rp_render_controller_root.json")

            rootTemplate.render_controllers[rcIdentifier] = template
            rootTemplate.format_version = defaultFormatVersion

            const destinationPath = await findOrCreateDestinationPath(resourcePackDir, "render_controllers", "", `${entityName}.render_controller`, ".json")

            await fs.writeFile(destinationPath, JSON.stringify(rootTemplate, null, 4))

        } else {
            if (hasExistingFile === undefined) {
                return
            }
            const existingFile = (await fs.readFile(hasExistingFile.path.exactPath)).toString()
            const result = jsoncModify(existingFile,
                ["render_controllers", rcIdentifier],
                template,
            )
            fs.writeFile(hasExistingFile.path.exactPath, result)
        }

        const result = jsoncModify(entity,
            ["minecraft:attachable", "description", "render_controllers", -1],
            rcIdentifier,
            true
        )

        await fs.writeFile(rpEntityFile.path.exactPath, result)
        vscode.window.showInformationMessage(`Successfully created RP render controller.`)
    })
}