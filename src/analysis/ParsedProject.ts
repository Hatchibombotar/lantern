import { FilePathData } from './FilePathData';
import { ScriptAnnotation } from './scriptLinks';
import { SymbolValue } from './symbols';

// identifier: string
// TODO: consider making all values arrays to account for duplicates

export type ParsedProject = {
	resourcePackDir: string;
	behaviorPackDir: string;

	// RP
	"rp_entity": Record<SymbolValue, {
		path: FilePathData;
		animations: string[];
		seperately_referenced_animation_controllers: string[]; // used for the 1.8.0 client entity format version as they are not referenced within the animations key.

		// TODO: make stored location of animation controllers consistent.
		render_controllers: string[];

		models: SymbolValue[];
		textures: string[];
	}>;
	"rp_attachables": Record<SymbolValue, {
		path: FilePathData;
		animations: string[];
		render_controllers: string[];
	}>;
	"rp_anims": Record<SymbolValue, FilePathData>;
	"rp_animation_controllers": Record<SymbolValue, FilePathData>;
	"rp_render_controllers": Record<SymbolValue, FilePathData>;

	"rp_block_culling_rules": Record<SymbolValue, FilePathData>;

	"rp_models": Record<SymbolValue, FilePathData>;

	// The key is the path used in game e.g. textures/entity/creeper/creeper
	// The files are all files that match the path e.g. png, tga, texture set files
	"rp_textures": Record<string, {
		files: FilePathData[];
	}>;

	// BP
	"bp_entity": Record<SymbolValue, {
		path: FilePathData;
		animations: string[];
	}>;
	"bp_anims": Record<SymbolValue, FilePathData>;
	"bp_animation_controllers": Record<SymbolValue, FilePathData>;


	"bp_items": Record<SymbolValue, {
		path: FilePathData;

		textureShortnames: SymbolValue[];
		textures: string[];
	}>;

	"bp_blocks": Record<SymbolValue, {
		path: FilePathData;
		cullingRules: string[];
		models: SymbolValue[];

		textureShortnames: SymbolValue[];
		textures: string[];
	}>;

	"script_links": ScriptLink[];
};

export type ScriptLink = ScriptAnnotation & {
	scriptPath: string,
	relativePath: string,
}