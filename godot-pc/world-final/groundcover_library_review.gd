extends Node3D
## Actual Godot rendering of the native D11A exports; no gameplay changes.
var output: String
var camera: Camera3D

func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--library-output="):output=arg.trim_prefix("--library-output=")
	assert(not output.is_empty());DirAccess.make_dir_recursive_absolute(output)
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	get_window().mode=Window.MODE_WINDOWED;get_window().size=Vector2i(1600,900)
	var world: WorldEnvironment=WorldEnvironment.new();world.environment=Environment.new()
	world.environment.background_mode=Environment.BG_COLOR;world.environment.background_color=Color(.20,.24,.25)
	world.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
	world.environment.ambient_light_color=Color(.63,.70,.76);world.environment.ambient_light_energy=.55
	add_child(world)
	var sun: DirectionalLight3D=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-48,-28,0);sun.light_energy=1.7;sun.shadow_enabled=true;add_child(sun)
	camera=Camera3D.new();camera.far=600;camera.current=true;camera.fov=48;add_child(camera)
	var ground: MeshInstance3D=MeshInstance3D.new();var plane: PlaneMesh=PlaneMesh.new();plane.size=Vector2(120,120);ground.mesh=plane
	var material: StandardMaterial3D=StandardMaterial3D.new();material.albedo_color=Color(.17,.18,.13);material.roughness=.95;ground.material_override=material;add_child(ground)
	var library: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/groundcover-library-D11B.json"))
	var group: Node3D=Node3D.new();add_child(group)
	var index: int=0
	for key: String in library.catalog:
		if library.catalog[key].kind=="cliff":continue
		var node: Node3D=load("res://world-final/nature/"+library.catalog[key].lods[0].path).instantiate()
		group.add_child(node);node.position=Vector3(index*1.7-3.4,0,0);index+=1
	# A 1.8 m marker supplies scale; it is review geometry only.
	var marker: MeshInstance3D=MeshInstance3D.new();var box: BoxMesh=BoxMesh.new();box.size=Vector3(.12,1.8,.12);marker.mesh=box;marker.position=Vector3(5, .9, 0);group.add_child(marker)
	camera.position=Vector3(5,4,9);camera.look_at(Vector3(0,.3,0));await capture("groundcover-lineup")
	if "--grass-color-check" in OS.get_cmdline_user_args():
		for node: Node in group.find_children("*","MeshInstance3D",true,false):
			if node==marker:continue
			var grass: ShaderMaterial=ShaderMaterial.new();grass.shader=load("res://world-final/nature/grass_mesh.gdshader");grass.set_shader_parameter("lod_enabled",false);node.material_override=grass
		await capture("groundcover-custom-color")
		var corrected: Shader=Shader.new();corrected.code=FileAccess.get_file_as_string("res://world-final/nature/grass_mesh.gdshader").replace("ALBEDO=COLOR.rgb;","ALBEDO=OUTPUT_IS_SRGB?mix(COLOR.rgb*12.92,1.055*pow(max(COLOR.rgb,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),COLOR.rgb)):COLOR.rgb;")
		for node: Node in group.find_children("*","MeshInstance3D",true,false):
			if node!=marker:node.material_override.shader=corrected
		await capture("groundcover-srgb-color")
		var same_side: Shader=Shader.new();same_side.code=FileAccess.get_file_as_string("res://world-final/nature/grass_mesh.gdshader").replace("ROUGHNESS=.94;","if(!FRONT_FACING){NORMAL=-NORMAL;} ROUGHNESS=.94;")
		for node: Node in group.find_children("*","MeshInstance3D",true,false):
			if node!=marker:node.material_override.shader=same_side
		await capture("groundcover-clump-normals")
		get_tree().call_deferred("quit",0);return
	group.queue_free();await get_tree().process_frame
	for key: String in library.catalog:
		if library.catalog[key].kind!="cliff":continue
		var node: Node3D=load("res://world-final/nature/"+library.catalog[key].lods[0].path).instantiate();add_child(node)
		for direction: int in [-1,1]:
			camera.position=Vector3(26,18,34*direction);camera.look_at(Vector3(0,4,0));await capture(key+"-side"+str(direction))
		node.queue_free();await get_tree().process_frame
	print("GROUNDCOVER_LIBRARY_RENDERED");get_tree().call_deferred("quit",0)

func capture(name: String) -> void:
	for i: int in range(5):await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(output.path_join(name+".png"))
