# Bedrock Add-On File Grouper
An extension that adds a new view within the explorer which groups Minecraft Bedrock Add-On Files by identifier.

In the below picture, it shows all files linked to the parrot in the vanilla packs. The group view is in the same panel as the exploere.

![feature X](./images/preview.png)

In the below picture, it shows all files linked to the bat in the vanilla packs. The group view is in the secondary sidebar.
![feature X](./images/preview-2.png)

## Groups
The extension groups by the following files:

- Entities
  - BP Entity
  - BP Animation
  - BP Animation Controller
  - RP Entity
  - RP Animation
  - RP Animation Controller
  - RP Render Controller

- Items
  - BP Item
  - RP Attachable
  - RP Attachable Animation
  - RP Attachable Animation Controller
  - RP Attachable Render Controller

## Requirements

As of now you must have a `config.json` file at the root of the project with the following keys:

```json
{
	"packs": {
		"behaviorPack": "./packs/BP",
		"resourcePack": "./packs/RP"
	}
}
```

This conforms to the Bedrock OSS [Project Config Standard](https://github.com/Bedrock-OSS/project-config-standard/).

If you have opened an existing `regolith`/`bridge`/`dash` project then you will already have this within your project.

<!-- ## Extension Settings -->

## For more information

- [Release Notes](CHANGELOG.md)
- [Repository](#)