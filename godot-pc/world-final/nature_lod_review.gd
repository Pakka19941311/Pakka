extends Node3D
## Full mesh and calibrated distant representation under identical lighting.
func _ready() -> void:
	call_deferred("review")

func review() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	var output: String=""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--lod-output="):output=arg.trim_prefix("--lod-output=")
	assert(not output.is_empty());DirAccess.make_dir_recursive_absolute(output)
	get_window().size=Vector2i(1600,900)
	var descriptor: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/impostors/far-trees-D07.json"))
	var calibrated: Dictionary=descriptor
	assert(calibrated.rgb_encoding=="shader_native")
	var environment: WorldEnvironment=WorldEnvironment.new();var settings: Environment=Environment.new()
	settings.background_mode=Environment.BG_COLOR;settings.background_color=Color("697d88");settings.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color=Color("d6deec");settings.ambient_light_energy=.3;settings.tonemap_mode=Environment.TONE_MAPPER_FILMIC;environment.environment=settings;add_child(environment)
	var light: DirectionalLight3D=DirectionalLight3D.new();light.rotation_degrees=Vector3(-51,-33,0);light.light_energy=.85;light.light_color=Color("ffe7ce");add_child(light)
	var camera: Camera3D=Camera3D.new();camera.fov=47;camera.far=800;camera.current=true;add_child(camera)
	var canvas: CanvasLayer=CanvasLayer.new();add_child(canvas);var label: Label=Label.new();label.position=Vector2(20,20);label.add_theme_font_size_override("font_size",20);canvas.add_child(label)
	var report: Dictionary={"headless":false,"calibration":calibrated.linear_half_probe_rgba,"source":"D03 native trees","billboard_triangles":2,"views":[]}
	for variant: int in range(3):
		var entry: Dictionary=descriptor.assets["pine_tree_01_%d"%variant]
		var packed: PackedScene=load("res://world-final/nature/"+str(entry.source_glb))
		var full: Node3D=packed.instantiate();full.position=Vector3(-7,0,0);add_child(full)
		var far: MeshInstance3D=MeshInstance3D.new();var quad: QuadMesh=QuadMesh.new();quad.size=Vector2.ONE*entry.size_m;far.mesh=quad
		far.position=Vector3(7+entry.center[0],entry.center[1],entry.center[2]);far.extra_cull_margin=entry.size_m
		var material: ShaderMaterial=ShaderMaterial.new();material.shader=load("res://world-final/nature/far_tree.gdshader")
		material.set_shader_parameter("atlas",load(entry.texture));material.set_shader_parameter("vectors",load(entry.vectors));far.material_override=material;add_child(far)
		for distance: int in [90,160,260]:
			camera.position=Vector3(0,entry.center[1]+3,distance);camera.look_at(Vector3(0,entry.center[1],0))
			label.text="VARENDOR · D07 · %d м\nСлева — исходная геометрия; справа — дальний вид той же сосны"%distance
			for i: int in range(10):await get_tree().process_frame
			await RenderingServer.frame_post_draw
			var name: String="pine-%d-distance-%d.png"%[variant,distance]
			get_viewport().get_texture().get_image().save_png(output.path_join(name));report.views.append(name)
		full.queue_free();far.queue_free();await get_tree().process_frame
	var file: FileAccess=FileAccess.open(output.path_join("lod-review.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	get_tree().call_deferred("quit",0)
