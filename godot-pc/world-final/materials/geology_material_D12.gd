extends RefCounted

static func terrain(mask_revision: String="D12") -> ShaderMaterial:
	var base: String="res://world-final/materials/"
	var material: ShaderMaterial=ShaderMaterial.new()
	material.shader=load(base+"terrain_geology_D12.gdshader")
	material.set_shader_parameter("biomes",load(base+"biomes-"+mask_revision+".png"))
	material.set_shader_parameter("forest_mask",load("res://world-final/nature/ground-world-D08.png"))
	for name: String in ["rock_diff","rock_normal","rock_rough"]:
		material.set_shader_parameter(name,load(base+name+"-D12.jpg"))
	material.set_shader_parameter("snow_diff",load(base+"snow_diff.jpg"))
	material.set_shader_parameter("forest_diff",load("res://world-final/nature/textures/forest_diff.jpg"))
	material.set_shader_parameter("soil_diff",load("res://world-final/nature/textures/trail_diff.jpg"))
	return material
