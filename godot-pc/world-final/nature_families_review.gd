extends Node3D
## Graphical review of the actual authored families, with the accepted hero.
var animator: VarendorAnimationController=VarendorAnimationController.new()
var actor: Node3D
func _ready() -> void:call_deferred("review")
func review() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	var output: String=""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--family-output="):output=arg.trim_prefix("--family-output=")
	assert(not output.is_empty());DirAccess.make_dir_recursive_absolute(output)
	get_window().size=Vector2i(1600,900)
	var environment: WorldEnvironment=WorldEnvironment.new();var settings: Environment=Environment.new()
	settings.background_mode=Environment.BG_COLOR;settings.background_color=Color("687982");settings.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;settings.ambient_light_color=Color("d6deec");settings.ambient_light_energy=.3
	settings.tonemap_mode=Environment.TONE_MAPPER_FILMIC;environment.environment=settings;add_child(environment)
	var light: DirectionalLight3D=DirectionalLight3D.new();light.rotation_degrees=Vector3(-51,-33,0);light.light_energy=.85;light.light_color=Color("ffe7ce");light.shadow_enabled=true;add_child(light)
	var ground: MeshInstance3D=MeshInstance3D.new();var plane: PlaneMesh=PlaneMesh.new();plane.size=Vector2(100,100);ground.mesh=plane
	var material: StandardMaterial3D=StandardMaterial3D.new();material.albedo_color=Color("565349");material.roughness=1;ground.material_override=material;add_child(ground)
	actor=Node3D.new();add_child(actor);var packed: PackedScene=load(VarendorWorld.KNIGHT_ASSET);var visual: Node3D=packed.instantiate();actor.add_child(visual)
	actor.set_meta("visual",visual);actor.set_meta("base_visual",visual.transform);actor.set_meta("model",VarendorWorld.KNIGHT_MODEL);actor.set_meta("pick_size",Vector3(.82,1.84,.68));actor.set_meta("player",visual.find_children("*","AnimationPlayer",true,false)[0])
	var equipment: VarendorKnightEquipment=VarendorKnightEquipment.new();var game: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://generated/game.json"));equipment.bind(actor,visual,game.items)
	equipment.apply_equipment({"head":"fallen_helm","chest":"militia_plate","gloves":"wolf_gloves","boots":"grave_boots","belt":"ash_belt","weapon":"wardens_blade"});animator.bind(actor)
	actor.position=Vector3(-2,0,1)
	var camera: Camera3D=Camera3D.new();camera.fov=47;camera.current=true;add_child(camera)
	var canvas: CanvasLayer=CanvasLayer.new();add_child(canvas);var label: Label=Label.new();label.position=Vector2(20,20);label.add_theme_font_size_override("font_size",20);canvas.add_child(label)
	var data: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/families-D08B.json"));var report: Dictionary={"headless":false,"accepted_hero":true,"views":[]}
	for key: String in data.catalog:
		var entry: Dictionary=data.catalog[key].lods[0];var resource: PackedScene=load("res://world-final/nature/"+entry.path);var model: Node3D=resource.instantiate();add_child(model)
		model.position.y=-entry.low[1]
		var h: float=entry.high[1]-entry.low[1];var span: float=maxf(h,maxf(entry.high[0]-entry.low[0],entry.high[2]-entry.low[2]))
		camera.position=Vector3(span*.8,maxf(3,span*.45),maxf(9,span*1.6));camera.look_at(Vector3(0,maxf(.7,h*.45),0))
		label.text="VARENDOR · D08B · "+key+"\nРеальная модель в Godot · герой для проверки масштаба"
		for i: int in range(12):await get_tree().process_frame
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(output.path_join(key+".png"));report.views.append({"asset":key,"height_m":h,"triangles":entry.triangles})
		model.queue_free();await get_tree().process_frame
	var file: FileAccess=FileAccess.open(output.path_join("families-review.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close();get_tree().call_deferred("quit",0)
