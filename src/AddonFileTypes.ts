
export enum AddonFileTypes {
	bp_entity,
	rp_entity,
	rp_animation,
	bp_animation,
	rp_animation_controllers,
	bp_animation_controllers,
	rp_render_controllers,
	bp_items,
	bp_block,
	rp_attachable,
	rp_block_culling_rule,

	rp_model,
	rp_texture
}

export const file_type_names: Record<AddonFileTypes, string> = {
	[AddonFileTypes.bp_entity]: "bp/entities",
	[AddonFileTypes.rp_entity]: "rp/entity",
	[AddonFileTypes.rp_animation]: "rp/animations",
	[AddonFileTypes.bp_animation]: "bp/animations",
	[AddonFileTypes.rp_animation_controllers]: "rp/animation_controllers",
	[AddonFileTypes.bp_animation_controllers]: "bp/animation_controllers",
	[AddonFileTypes.rp_render_controllers]: "rp/render_controllers",
	[AddonFileTypes.bp_items]: "bp/items",
	[AddonFileTypes.rp_attachable]: "rp/attachables",
	[AddonFileTypes.bp_block]: "bp/blocks",
	[AddonFileTypes.rp_block_culling_rule]: "rp/block_culling",
	[AddonFileTypes.rp_model]: "rp/models",
	[AddonFileTypes.rp_texture]: "rp/textures",
};
