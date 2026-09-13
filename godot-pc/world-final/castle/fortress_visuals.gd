extends Node3D
## One-time surface setup. No processing, collision mutation or actor handling.
const GROUND = preload("res://world-final/castle/fortress_ground.gdshader")

func apply(castle: Node3D) -> void:
	var ground := ShaderMaterial.new()
	ground.shader=GROUND
	ground.set_shader_parameter("road_diff",load("res://generated/world_cobblestone_floor_001_albedo.jpg"))
	ground.set_shader_parameter("road_normal",load("res://generated/world_cobblestone_floor_001_normal.jpg"))
	ground.set_shader_parameter("road_rough",load("res://generated/world_cobblestone_floor_001_roughness.png"))
	ground.set_shader_parameter("earth_diff",load("res://world-final/nature/textures/trail_diff.jpg"))
	ground.set_shader_parameter("earth_normal",load("res://world-final/nature/textures/trail_normal.jpg"))
	var paving := ground.duplicate() as ShaderMaterial
	paving.set_shader_parameter("solid_road",true)
	for item: MeshInstance3D in castle.find_children("*","MeshInstance3D",true,false):
		var label := str(item.name)
		if label.begins_with("F3_ground_"):
			item.material_override=ground
			# Separate the paving skin from the unchanged terrain depth surface.
			item.position.y += .04
		if label=="F3_citadel_road":item.material_override=paving
		if label.begins_with("F3_") and not label.begins_with("F3_ground_") and label!="F3_citadel_road":
			var source: StandardMaterial3D = item.mesh.surface_get_material(0) as StandardMaterial3D
			if source != null:
				var material: StandardMaterial3D = source.duplicate()
				material.uv1_triplanar = true
				material.uv1_world_triplanar = true
				material.uv1_scale = Vector3.ONE * .45
				material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
				material.vertex_color_use_as_albedo = false
				material.normal_enabled = false
				material.roughness = .9
				material.metallic = 0
				item.material_override = material
		if label.begins_with("F3_citadel_") or label.begins_with("F3_defense_"):
			item.visibility_range_end=900
			item.visibility_range_end_margin=30
