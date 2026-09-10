extends Node
## Bake distant views from the actual D03 meshes; no substitute tree artwork.
const OUT: String="res://world-final/nature/impostors/"

func _ready() -> void:
	call_deferred("bake")

func bake() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	var families: bool="--family-atlases" in OS.get_cmdline_user_args()
	var curved_leaves: bool="--curved-leaves" in OS.get_cmdline_user_args()
	var catalog: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/"+(("families-D08B.json" if curved_leaves else "families-D08A.json") if families else "authored-D03.json")))
	var viewport: SubViewport=SubViewport.new();viewport.size=Vector2i(256,256);viewport.own_world_3d=true;viewport.transparent_bg=true
	viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	var environment: WorldEnvironment=WorldEnvironment.new();var settings: Environment=Environment.new()
	settings.background_mode=Environment.BG_COLOR;settings.background_color=Color(0,0,0,0)
	settings.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;settings.ambient_light_color=Color.WHITE;settings.ambient_light_energy=.85
	environment.environment=settings;viewport.add_child(environment)
	var light: DirectionalLight3D=DirectionalLight3D.new();light.rotation_degrees=Vector3(-40,-30,0);light.light_energy=.25;viewport.add_child(light)
	var camera: Camera3D=Camera3D.new();camera.projection=Camera3D.PROJECTION_ORTHOGONAL;camera.far=250;camera.current=true;viewport.add_child(camera)
	var report: Dictionary={"revision":"D04","renderer":"Godot actual source meshes, 8 azimuths","views":8,"tile_resolution":[256,256],"distant_only":true,"assets":{}}
	var separate_vectors: bool="--albedo-normal" in OS.get_cmdline_user_args()
	var revision: String="D05" if separate_vectors else "D04"
	if "--preserve-vertex-colors" in OS.get_cmdline_user_args():revision="D06"
	if "--source-normal-parity" in OS.get_cmdline_user_args():revision="D07"
	if families:revision="D08"
	if curved_leaves:revision="D09"
	report.revision=revision;report["lighting_baked"]=not separate_vectors
	var calibration_only: bool="--calibrate-only" in OS.get_cmdline_user_args()
	var keys: Array=[]
	for key: String in catalog.catalog:
		if catalog.catalog[key].group=="pine_tree_01" or catalog.catalog[key].get("is_tree",false):keys.append(key)
	if calibration_only:keys=[]
	for key: String in keys:
		var desc: Dictionary=catalog.catalog[key].lods[0]
		var destination: String=OUT+key+"_"+revision+".png" if families else OUT+"pine_%s_%s.png"%[key.get_slice("_",3),revision]
		if FileAccess.file_exists(destination):push_error("Preserve an existing atlas; choose another version");get_tree().quit(5);return
		var packed: PackedScene=load("res://world-final/nature/"+str(desc.path))
		var tree: Node3D=packed.instantiate();viewport.add_child(tree)
		var source_materials: Array[ShaderMaterial]=[]
		if separate_vectors:
			var meshes: Array=tree.find_children("*","MeshInstance3D",true,false)
			if tree is MeshInstance3D:meshes.append(tree)
			for mesh: MeshInstance3D in meshes:
				for surface: int in range(mesh.mesh.get_surface_count()):
					var original: BaseMaterial3D=mesh.get_active_material(surface)
					var material: ShaderMaterial=ShaderMaterial.new();material.shader=load("res://world-final/nature/atlas_source.gdshader")
					material.set_shader_parameter("base",original.albedo_texture);material.set_shader_parameter("tint",original.albedo_color)
					material.set_shader_parameter("use_vertex_color",original.vertex_color_use_as_albedo)
					material.set_shader_parameter("uv_scale",Vector2(original.uv1_scale.x,original.uv1_scale.y));material.set_shader_parameter("uv_offset",Vector2(original.uv1_offset.x,original.uv1_offset.y))
					material.set_shader_parameter("normals",original.normal_texture);material.set_shader_parameter("use_normal",original.normal_enabled);material.set_shader_parameter("strength",original.normal_scale)
					material.set_shader_parameter("use_alpha",original.transparency!=BaseMaterial3D.TRANSPARENCY_DISABLED);material.set_shader_parameter("cutoff",original.alpha_scissor_threshold)
					mesh.set_surface_override_material(surface,material);source_materials.append(material)
		var low: Vector3=Vector3(desc.low[0],desc.low[1],desc.low[2]);var high: Vector3=Vector3(desc.high[0],desc.high[1],desc.high[2])
		var center: Vector3=(low+high)*.5;var size: float=maxf(high.y-low.y,Vector2(high.x-low.x,high.z-low.z).length())*1.08
		camera.size=size
		for pass_index: int in range(2 if separate_vectors else 1):
			for material: ShaderMaterial in source_materials:material.set_shader_parameter("vector_pass",pass_index==1)
			var atlas: Image=Image.create(2048,256,false,Image.FORMAT_RGBA8)
			for view: int in range(8):
				var angle: float=float(view)/8.0*TAU
				camera.position=center+Vector3(sin(angle),0,cos(angle))*80;camera.look_at(center)
				for i: int in range(4):await get_tree().process_frame
				await RenderingServer.frame_post_draw
				var picture: Image=viewport.get_texture().get_image();picture.convert(Image.FORMAT_RGBA8)
				atlas.blit_rect(picture,Rect2i(0,0,256,256),Vector2i(view*256,0))
			atlas.save_png(ProjectSettings.globalize_path(destination.replace(".png","_vectors.png") if pass_index==1 else destination))
		report.assets[key]={"texture":destination,"center":[center.x,center.y,center.z],"size_m":size,"source_glb":desc.path,"source_sha256":desc.sha256,"source_native":catalog.native_source,"source_native_sha256":catalog.native_sha256}
		if separate_vectors:report.assets[key]["vectors"]=destination.replace(".png","_vectors.png")
		tree.queue_free();await get_tree().process_frame
	# Measure the encoding of this actual renderer, instead of assuming the
	# saved SubViewport PNG has the same transfer curve as the main window.
	var probe: MeshInstance3D=MeshInstance3D.new();var quad: QuadMesh=QuadMesh.new();quad.size=Vector2(2,2);probe.mesh=quad
	var probe_material: ShaderMaterial=ShaderMaterial.new();var probe_shader: Shader=Shader.new()
	probe_shader.code="shader_type spatial; render_mode unshaded; void fragment(){ALBEDO=vec3(0.5);}"
	probe_material.shader=probe_shader;probe.material_override=probe_material;viewport.add_child(probe)
	camera.position=Vector3(0,0,4);camera.look_at(Vector3.ZERO);camera.size=3
	for i: int in range(5):await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var probe_color: Color=viewport.get_texture().get_image().get_pixel(128,128)
	report["linear_half_probe_rgba"]=[probe_color.r,probe_color.g,probe_color.b,probe_color.a]
	report["rgb_encoding"]="linear" if absf(probe_color.r-.5)<.01 else ("sRGB" if absf(probe_color.r-.735)<.01 else "unrecognized")
	assert(report.rgb_encoding!="unrecognized","Do not guess atlas transfer curve")
	if revision in ["D07","D08","D09"]:
		report["rgb_encoding"]="shader_native"
		report["encoding_note"]="The half-value probe confirms a shader-output round trip, not a universal linear color space. Compatibility converts shader albedo through its own sRGB pipeline; sample baked data without another transfer transform."
		report["normal_parity_source"]="https://github.com/godotengine/godot/blob/4.6-stable/drivers/gles3/shaders/scene.glsl"
	var file: FileAccess=FileAccess.open(OUT+("bake-calibration-" if calibration_only else "far-trees-")+revision+".json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "));file.close()
	print("FAR_TREES_BAKED "+JSON.stringify(report))
	get_tree().call_deferred("quit",0)
