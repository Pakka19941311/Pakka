extends Node3D
## Authored Blender placements, grouped spatially; never changes the actor motor.
const ROOT: String = "res://world-final/nature/"
@export var authored_revision: String = "D03"
var data: Dictionary
var prototypes: Dictionary = {}
var batches: Array[MultiMeshInstance3D] = []

func mesh_parts(node: Node, parent_transform: Transform3D = Transform3D.IDENTITY) -> Array:
	var result: Array = []
	var transform: Transform3D = parent_transform
	if node is Node3D: transform *= node.transform
	if node is MeshInstance3D:
		result.append({"mesh":node.mesh,"transform":transform})
	for child: Node in node.get_children(): result.append_array(mesh_parts(child,transform))
	return result

func placement_transform(p: Dictionary) -> Transform3D:
	return Transform3D(Basis(Vector3.UP,float(p.yaw)).scaled(Vector3.ONE*float(p.scale)),Vector3(p.position[0],p.position[1],p.position[2]))

func build() -> void:
	data = JSON.parse_string(FileAccess.get_file_as_string(ROOT+"authored-"+authored_revision+".json"))
	for key: String in data.catalog:
		var variants: Array = []
		for source: Dictionary in data.catalog[key].lods:
			var packed: PackedScene = load(ROOT+str(source.path))
			assert(packed != null,"Missing authored nature asset: "+str(source.path))
			var node: Node = packed.instantiate()
			variants.append(mesh_parts(node));node.free()
		prototypes[key] = variants
	var groups: Dictionary = {}
	for p: Dictionary in data.placements:
		var key: String = str(p.asset)+"/%d/%d" % [floori(p.position[0]/32),floori(p.position[2]/32)]
		if not groups.has(key):groups[key]=[]
		groups[key].append(p)
	for group_key: String in groups:
		var placements: Array = groups[group_key]
		var kind: String = str(placements[0].kind)
		var center: Vector3 = Vector3.ZERO
		for p: Dictionary in placements:center += placement_transform(p).origin
		center /= placements.size()
		for lod: int in range(2):
			for part: Dictionary in prototypes[placements[0].asset][lod]:
				var batch: MultiMeshInstance3D = make_batch(part,placements,center)
				batch.name = group_key.replace("/","_")+"_lod%d" % lod
				var change: float = 65 if kind=="tree" else 32
				batch.visibility_range_begin = change if lod==1 else 0
				batch.visibility_range_end = change if lod==0 else (0 if kind=="tree" else (95 if kind=="fern" else 210))
				# Compatibility has no built-in HLOD fading. Margins stay zero so
				# these two versions cannot be visible simultaneously.
				batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if kind=="fern" else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
				add_child(batch);batches.append(batch)
		await get_tree().process_frame

func make_batch(part: Dictionary, placements: Array, center: Vector3) -> MultiMeshInstance3D:
	var mm: MultiMesh = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = part.mesh
	mm.instance_count = placements.size()
	for index: int in range(placements.size()):
		var transform: Transform3D = placement_transform(placements[index])*part.transform
		transform.origin -= center
		mm.set_instance_transform(index,transform)
	var node: MultiMeshInstance3D = MultiMeshInstance3D.new()
	node.position=center;node.multimesh=mm
	return node

func ground_material() -> ShaderMaterial:
	var material: ShaderMaterial = ShaderMaterial.new()
	material.shader = load(ROOT+"forest_ground.gdshader")
	material.set_shader_parameter("ground_mask",load(ROOT+"ground-sample-D01.png"))
	for name: String in ["forest_diff","forest_normal","trail_diff","trail_normal","rock_diff","rock_normal"]:
		material.set_shader_parameter(name,load(ROOT+"textures/"+name+".jpg"))
	return material

func canopy_mesh(source: Mesh) -> Mesh:
	var mesh: Mesh = source.duplicate()
	for surface: int in range(mesh.get_surface_count()):
		var original: Material = source.surface_get_material(surface)
		var shader: Shader = Shader.new()
		shader.code = "shader_type spatial; render_mode unshaded,cull_disabled; uniform sampler2D silhouette; uniform bool cutout=false; void fragment(){ ALBEDO=vec3(1.0); ALPHA=cutout?texture(silhouette,UV).a:1.0; ALPHA_SCISSOR_THRESHOLD=0.4; }"
		var material: ShaderMaterial = ShaderMaterial.new();material.shader=shader
		if original is BaseMaterial3D and original.albedo_texture != null:
			material.set_shader_parameter("silhouette",original.albedo_texture)
			material.set_shader_parameter("cutout",original.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED)
		mesh.surface_set_material(surface,material)
	return mesh

func measure_canopy(output: String) -> Dictionary:
	var viewport: SubViewport = SubViewport.new()
	viewport.size=Vector2i(1024,1024);viewport.own_world_3d=true
	viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	var environment: WorldEnvironment = WorldEnvironment.new()
	var settings: Environment = Environment.new()
	settings.background_mode=Environment.BG_COLOR;settings.background_color=Color.BLACK
	environment.environment=settings;viewport.add_child(environment)
	var top: Camera3D = Camera3D.new()
	top.projection=Camera3D.PROJECTION_ORTHOGONAL;top.size=170;top.far=600
	viewport.add_child(top);top.position=Vector3(-645,420,-60)
	top.look_at(Vector3(-645,0,-60),Vector3.FORWARD);top.current=true
	for key: String in data.catalog:
		if data.catalog[key].group!="pine_tree_01":continue
		var placements: Array=data.placements.filter(func(p:Dictionary):return p.asset==key)
		for part: Dictionary in prototypes[key][0]:
			var white: Dictionary={"mesh":canopy_mesh(part.mesh),"transform":part.transform}
			viewport.add_child(make_batch(white,placements,Vector3.ZERO))
	for i: int in range(6):await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var picture: Image=viewport.get_texture().get_image()
	picture.save_png(output.path_join("canopy-alpha-mask.png"))
	var eligible: Image=Image.load_from_file(ProjectSettings.globalize_path(ROOT+"sample-canopy-eligible.png"))
	var numerator: int=0;var denominator: int=0
	for y: int in range(picture.get_height()):
		for x: int in range(picture.get_width()):
			if eligible.get_pixel(mini(169,int((x+.5)/1024*170)),mini(169,int((y+.5)/1024*170))).r>.5:
				denominator+=1
				if picture.get_pixel(x,y).r>.5:numerator+=1
	viewport.queue_free()
	return {"method":"Godot orthographic LOD0 silhouette, actual leaf texture alpha, trails and authored clearings excluded","pixels":denominator,"covered_pixels":numerator,"fraction":float(numerator)/maxi(1,denominator),"resolution":[1024,1024]}
