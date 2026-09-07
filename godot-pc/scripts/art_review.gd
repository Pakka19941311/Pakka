extends Node3D

var camera: Camera3D
var player: Node3D
var collision: VarendorCollision = VarendorCollision.new()
var manifest: Dictionary
var yaw: float = .25
var pitch: float = .6
var distance: float = 15.0
var orbit: bool = false
var focus_point: Vector3 = Vector3(0, 0, 0)
var lods: Array[Node3D] = []
var title: Label
var qa_output: String = ""

func _ready() -> void:
	manifest = JSON.parse_string(FileAccess.get_file_as_string("res://generated/p1-samples.json"))
	collision.setup(manifest.colliders)
	var scene: PackedScene = load("res://generated/p1-samples.glb")
	add_child(scene.instantiate())
	var wind: Shader = load("res://shaders/sample_wind.gdshader")
	for mesh: Node in find_children("*", "MeshInstance3D", true, false):
		if "needles_LOD" in str(mesh.name):
			lods.append(mesh)
			mesh.visibility_range_end = 110
		if "P1_grass" in str(mesh.name):
			mesh.visibility_range_end = 45
		if "needles_LOD" in str(mesh.name) or "P1_grass" in str(mesh.name):
			var material: ShaderMaterial = ShaderMaterial.new()
			material.shader = wind
			material.set_shader_parameter("strength", .11 if "grass" in str(mesh.name) else .08)
			mesh.material_override = material
	var environment: WorldEnvironment = WorldEnvironment.new()
	var settings: Environment = Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color("788788")
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("bdc9dc")
	settings.ambient_light_energy = .62
	settings.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = settings
	add_child(environment)
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, -35, 0)
	sun.light_color = Color("ffe3ba")
	sun.light_energy = 1.65
	sun.shadow_enabled = true
	add_child(sun)
	camera = Camera3D.new()
	camera.fov = 49
	camera.current = true
	add_child(camera)
	get_viewport().msaa_3d = Viewport.MSAA_4X
	player = Node3D.new()
	add_child(player)
	var character: PackedScene = load("res://generated/actors/Warrior.gltf")
	var visual: Node3D = character.instantiate()
	player.add_child(visual)
	var bounds: AABB = AABB()
	var first: bool = true
	for node: Node in visual.find_children("*", "MeshInstance3D", true, false):
		var mesh: MeshInstance3D = node
		var box: AABB = (visual.global_transform.affine_inverse() * mesh.global_transform) * mesh.get_aabb()
		bounds = box if first else bounds.merge(box)
		first = false
	var factor: float = 2.05 / maxf(.001, bounds.size.y)
	visual.scale = Vector3.ONE * factor
	visual.position.y = -bounds.position.y * factor
	player.position = Vector3(0, 0, 9)
	focus_point = player.position
	var canvas: CanvasLayer = CanvasLayer.new()
	add_child(canvas)
	var panel: PanelContainer = PanelContainer.new()
	panel.position = Vector2(18, 18)
	canvas.add_child(panel)
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color("192023")
	style.border_color = Color("9d8557")
	style.set_border_width_all(1)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", style)
	title = Label.new()
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color("ddc797"))
	title.text = "ОБРАЗЦЫ МИРА\n1–6 — образец · WASD — пройти · ПКМ — камера\nКолесо — масштаб · Esc — выход"
	panel.add_child(title)
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--qa-art="):
			qa_output = argument.trim_prefix("--qa-art=")
	if not qa_output.is_empty():
		call_deferred("review_qa")

func select_sample(index: int) -> void:
	var item: Dictionary = manifest.assets[index]
	focus_point = Vector3(item.focus[0], 1.1, -item.focus[1])
	player.position = focus_point + Vector3(0, -1.1, 3)
	distance = 18 if "pine" in item.assetId else 9
	title.text = "ОБРАЗЦЫ МИРА · %s\n1–6 — образец · WASD — пройти · ПКМ — камера\nКолесо — масштаб · Esc — выход" % str(item.assetId).trim_prefix("varendor.p1.")

func _process(delta: float) -> void:
	if camera == null:
		return
	var local: Vector2 = Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)), float(Input.is_physical_key_pressed(KEY_W)) - float(Input.is_physical_key_pressed(KEY_S)))
	if not local.is_zero_approx():
		var move: Vector2 = local.normalized().rotated(yaw) * minf(delta, .05) * 6.2
		var point: Vector2 = collision.resolve(Vector2(player.position.x, -player.position.z), move)
		player.position = Vector3(point.x, 0, -point.y)
		player.rotation.y = -atan2(move.x, move.y) + PI
		focus_point = player.position + Vector3(0, 1.1, 0)
	var direction: Vector3 = Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	camera.position = focus_point + direction * distance
	camera.look_at(focus_point)
	var pine_distance: float = camera.position.distance_to(Vector3(-5, 4, 5))
	var current_lod: int = 0 if pine_distance < 30 else 1 if pine_distance < 55 else 2
	for node: Node3D in lods:
		node.visible = str(node.name).ends_with(str(current_lod))

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_ESCAPE:
			get_tree().quit()
		elif event.physical_keycode >= KEY_1 and event.physical_keycode <= KEY_6:
			select_sample(event.physical_keycode - KEY_1)
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_RIGHT:
			orbit = event.pressed
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if orbit else Input.MOUSE_MODE_VISIBLE
		elif event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			distance = clampf(distance + (-1 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1), 3, 80)
	if orbit and event is InputEventMouseMotion:
		yaw -= event.screen_relative.x * .005
		pitch = clampf(pitch + event.screen_relative.y * .004, .12, 1.4)

func review_qa() -> void:
	DirAccess.make_dir_recursive_absolute(qa_output)
	await get_tree().create_timer(2).timeout
	var checks: Dictionary = {"sample_count":manifest.assets.size(),"gate_passage":not collision.blocked(Vector2(4.3, 4)),"wall_solid":collision.blocked(Vector2(-7.5, 4)),"pine_trunk_solid":collision.blocked(Vector2(-5, -5)),"pine_lods":lods.size(),"graphics":DisplayServer.get_name() != "headless"}
	var frames: Array = []
	var contact: Image = Image.create_empty(1440, 1620, false, Image.FORMAT_RGB8)
	for index: int in range(manifest.assets.size()):
		select_sample(index)
		for angle: int in range(3):
			yaw = .3 + angle * TAU / 3
			await get_tree().create_timer(.3).timeout
			if checks.graphics:
				await RenderingServer.frame_post_draw
				var filename: String = "%02d-%d.png" % [index + 1, angle + 1]
				var capture: Image = get_viewport().get_texture().get_image()
				capture.save_png(qa_output.path_join(filename))
				capture.convert(Image.FORMAT_RGB8)
				capture.resize(480, 270)
				contact.blit_rect(capture, Rect2i(0, 0, 480, 270), Vector2i(angle * 480, index * 270))
				frames.append(filename)
	if checks.graphics:
		contact.save_jpg(qa_output.path_join("contact.jpg"), .88)
		print("VARENDOR_SAMPLES_JPG " + Marshalls.raw_to_base64(contact.save_jpg_to_buffer(.85)))
	var success: bool = checks.sample_count == 6 and checks.gate_passage and checks.wall_solid and checks.pine_trunk_solid and checks.pine_lods == 3
	var file: FileAccess = FileAccess.open(qa_output.path_join("samples-qa.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"ok":success,"checks":checks,"frames":frames,"artAcceptance":"pending owner; screenshots do not constitute acceptance"}, "  "))
	file.close()
	print("VARENDOR_SAMPLE_QA " + JSON.stringify(checks))
	get_tree().quit(0 if success else 2)
