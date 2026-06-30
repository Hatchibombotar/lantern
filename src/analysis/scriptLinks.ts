import * as JSONC from "jsonc-parser"
import { Category } from "../domainViewer/createFolderStructure"


// One identifier a script links to, via a `// @lantern-links-entities [...]` or
// `// @lantern-links-items [...]` comment. `line` is the 0-based line the
// annotation sits on, so the tree can jump to it. One annotation comment listing
// N identifiers produces N of these.
export type ScriptAnnotation = {
	category: Category,
	identifier: string,
	line: number,
}

const ENTITIES_RE = /^\s*\/\/\s*@lantern-links-entities\s+(\[[\s\S]*?\])\s*$/
const ITEMS_RE = /^\s*\/\/\s*@lantern-links-items\s+(\[[\s\S]*?\])\s*$/

// Parse the bracketed payload (a JSON/JSONC array of identifier strings) into a
// clean string list. Tolerant: malformed payloads yield an empty list.
function parsePayload(payload: string): string[] {
	const errors: JSONC.ParseError[] = []
	const value = JSONC.parse(payload, errors, { allowTrailingComma: true })
	if (!Array.isArray(value)) {
		return []
	}
	return value.filter((v): v is string => typeof v === "string" && v.length > 0)
}

// Extract every `@lantern-links-*` annotation from a script's text, one entry
// per identifier. Pure (no fs / no known-identifier validation) so the project
// scan, CodeLens provider, and diagnostics can all share it.
export function parseScriptAnnotations(content: string): ScriptAnnotation[] {
	const lines = content.split(/\r?\n/)
	const annotations: ScriptAnnotation[] = []

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]

		const collect = (regex: RegExp, category: Category) => {
			const match = regex.exec(line)
			if (match === null) {
				return
			}
			for (const identifier of parsePayload(match[1])) {
				annotations.push({ category, identifier, line: i })
			}
		}

		collect(ENTITIES_RE, "entities")
		collect(ITEMS_RE, "items")
	}

	return annotations
}
