extends RefCounted
const ROOT: String="res://world-final/materials/"
static func terrain() -> ShaderMaterial:
	var material: ShaderMaterial=ShaderMaterial.new();material.shader=load(ROOT+"terrain_surface.gdshader")
	material.set_shader_parameter("biomes",load(ROOT+"biomes-D10.png"))
	material.set_shader_parameter("forest_mask",load("res://world-final/nature/ground-world-D08.png"))
	for name: String in ["cliff_diff","cliff_normal","cliff_arm","snow_diff","snow_normal","snow_rough"]:
		material.set_shader_parameter(name,load(ROOT+name+".jpg"))
	for name: String in ["forest_diff","forest_normal","soil_diff","soil_normal"]:
		material.set_shader_parameter(name,load("res://world-final/nature/textures/"+name.replace("soil_","trail_")+".jpg"))
	return material
