# Creating snippet repositories
The extension fetches snippet repositories using git. You can see an example of a snippet repository [here](https://github.com/Bedrock-OSS/bedrock-examples/).

A repository should have the following struture:
- resources
  - snippet_one
    - meta.json
    - bp
        - ...
    - rp
      - ...
  - snippet_two
    - meta.json
    - bp
     - ...
    - rp
      - ...


## meta.json structure
A `meta.json` file is structured as followed:

```json
{
    "name": "Custom Item Models",
    "type": "mcaddon",
    "tags": ["items"]
}
```

- `name` - the name for the add-on
- `tags` - optional should include what is included in the add-on e.g. "blocks", "items", "entities"