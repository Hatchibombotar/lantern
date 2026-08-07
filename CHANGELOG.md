# Change Log

All notable changes to the extension will be documented in this file.

<!-- Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file. -->
## [0.5.0]
- Added support for blocks in the sidebar! This includes cullingRules, textures, and models!
- Added an assets folders to entities and items. This means your textures and models are easily accessible!
- Hardcoded icons for files, stopping coloured icons from turning white when selected
- The script link `Link to Entity/Item/Block` now allows for items & entities with the same identifier

## [0.4.0], [0.4.1]
- Added script linking to the lantern sidebar, [with contributions from Keyyard](https://github.com/Hatchibombotar/lantern/pull/1).
  - Uses annotations `@lantern-links-entities`, and `@lantern-links-items`
  - It also shows a codelens hint above the annotation in the file which brings you to the selected item/entity in the sidebar.

## [0.3.0]
- Renamed extension to "Lantern for Minecraft Bedrock"
- Added an "import entity from vanilla" context menu action for entities in the sidebar
  - This downloads vanilla packs from the https://github.com/Mojang/bedrock-samples repo.
    It then analyses the packs to find files that link to an entity
    It copies all the files that link to the entity when you import.
- Made animation controllers link to client entities with format versions < 1.8.0
- Added custom icons for each file within in the grouped file panel

## [0.2.0]

- Added right click context actions to items and entities in the sidebar. The following actions are avaliable:
  - Create Entity
  - Create Item
  - Copy Entity Identifier
  - Create BP Entity
  - Create BP Animation
  - Create BP Animation Controller
  - Create RP Entity
  - Create RP Animation
  - Create RP Animation Controller
  - Create RP Render Controller
  - Copy Item Identifier
  - Create BP Item
  - Create Attachable
  - Create Attachable Animation
  - Create Attachable Animation Controller
  - Create Attachable Render Controller

## [0.1.0]

- Added support for entities where there is no BP file, only a RP.

## [0.0.1]

- Initial release for Bedrock Add-On File Grouper
- Has support for:
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