import * as JSONC from "jsonc-parser"

// A parsed `@lantern` annotation found in a script file. Line numbers are 0-based.
export type ScriptAnnotation = {
	identifiers: string[],
	source: "file" | "region",
	markerLine: number,                       // line the `// @lantern` comment sits on
	range?: { startLine: number, endLine: number }, // region span (markerLine -> endregion), region source only
	unterminated?: boolean,                   // region with no matching `// @lantern:endregion`
}

const FILE_RE = /^\s*\/\/\s*@lantern\s+(\[[\s\S]*?\])\s*$/
const REGION_RE = /^\s*\/\/\s*@lantern:region\s+(\[[\s\S]*?\])\s*$/
const ENDREGION_RE = /^\s*\/\/\s*@lantern:endregion\b/

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

// Extract every `@lantern` annotation from a script's text. Pure (no fs / no
// known-identifier validation) so the project scan, CodeLens provider, and
// diagnostics can all share it.
export function parseScriptAnnotations(content: string): ScriptAnnotation[] {
	const lines = content.split(/\r?\n/)
	const annotations: ScriptAnnotation[] = []

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]

		const regionMatch = REGION_RE.exec(line)
		if (regionMatch) {
			const identifiers = parsePayload(regionMatch[1])
			let endLine = -1
			for (let j = i + 1; j < lines.length; j++) {
				if (ENDREGION_RE.test(lines[j])) {
					endLine = j
					break
				}
			}
			const unterminated = endLine === -1
			annotations.push({
				identifiers,
				source: "region",
				markerLine: i,
				range: { startLine: i, endLine: unterminated ? lines.length - 1 : endLine },
				unterminated,
			})
			continue
		}

		const fileMatch = FILE_RE.exec(line)
		if (fileMatch) {
			annotations.push({
				identifiers: parsePayload(fileMatch[1]),
				source: "file",
				markerLine: i,
			})
		}
	}

	return annotations
}
