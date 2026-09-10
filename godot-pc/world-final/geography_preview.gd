extends Node3D
## Stage-B scene in the existing project. Existing avatar, movement, camera and
## animation classes are reused. No combat/economy/save backend is replaced.

const GEO: String = "res://world-final/geography/"
var layout: Dictionary
var terrain: Dictionary
var heights: PackedFloat32Array
var motor: VarendorPlayerMovement = VarendorPlayerMovement.new()
var collision: VarendorCollision = VarendorCollision.new()
var follow: VarendorCameraController = VarendorCameraController.new()
var animator: VarendorAnimationController = VarendorAnimationController.new()
var actor: Node3D
var camera: Camera3D
var status: Label
var loaded: bool = false
var overview: bool = true
var output_dir: String = ""
var automate: bool = false
var elapsed: float = 0

func _ready() -> void:
	layout = JSON.parse_string(FileAccess.get_file_as_string("res://world-final/world_layout.json"))
	terrain = JSON.parse_string(FileAccess.get_file_as_string(GEO + "terrain.json"))
	heights = FileAccess.get_file_as_bytes(GEO + "heightmap.f32").to_float32_array()
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--world-B-output="):
			output_dir = arg.trim_prefix("--world-B-output=")
			automate = true
	if automate:
		get_window().mode = Window.MODE_WINDOWED
		get_window().size = Vector2i(1600,900)
	var environment: WorldEnvironment = WorldEnvironment.new()
	var settings: Environment = Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color("697d88")
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("d6deec")
	settings.ambient_light_energy = .3
	settings.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = settings
	add_child(environment)
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-51,-33,0)
	sun.light_color = Color("ffe7ce")
	sun.light_energy = .85
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 180
	add_child(sun)
	camera = Camera3D.new()
	camera.far = 5000
	camera.current = true
	add_child(camera)
	add_child(follow)
	follow.setup(camera,collision,height_server)
	var canvas: CanvasLayer = CanvasLayer.new()
	add_child(canvas)
	status = Label.new()
	status.position = Vector2(24,22)
	status.add_theme_font_size_override("font_size",18)
	status.add_theme_color_override("font_outline_color",Color.BLACK)
	status.add_theme_constant_override("outline_size",5)
	canvas.add_child(status)
	set_overview()
	for cell: Dictionary in terrain.chunks:
		status.text = "VARENDOR · география B · загрузка %s\nПространственная основа; детализация окружения впереди" % cell.id
		var path: String = GEO + str(cell.glb)
		ResourceLoader.load_threaded_request(path)
		while ResourceLoader.load_threaded_get_status(path) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			await get_tree().process_frame
		if ResourceLoader.load_threaded_get_status(path) != ResourceLoader.THREAD_LOAD_LOADED:
			push_error("Terrain cell failed: " + path)
			get_tree().quit(2)
			return
		var packed: PackedScene = ResourceLoader.load_threaded_get(path)
		add_child(packed.instantiate())
		await get_tree().process_frame
	var landmark_scene: PackedScene = load(GEO + "landmarks.glb")
	add_child(landmark_scene.instantiate())
	create_actor()
	loaded = true
	status.text = "VARENDOR · география B · 1600 × 1400 м\nF1 — обзор · F2 — герой · WASD — движение · ПКМ — камера\nМакеты архитектуры, без финальной природы и населения"
	print("WORLD_B_LOADED chunks=%d, hero=ForgottenKnight, movement=VarendorPlayerMovement" % terrain.chunks.size())
	if automate:
		call_deferred("run_review")

func height_godot(x: float,z: float) -> float:
	var gx: float = clampf((x+800)/2,0,800)
	var gz: float = clampf((z+700)/2,0,700)
	var col: int = mini(799,floori(gx))
	var row: int = mini(699,floori(gz))
	var u: float = gx-col
	var v: float = gz-row
	var index: int = row*801+col
	var a: float = heights[index]
	var b: float = heights[index+1]
	var c: float = heights[index+801]
	var d: float = heights[index+802]
	var value: float = a+u*(b-a)+v*(d-b) if u>=v else a+u*(d-c)+v*(c-a)
	for item: Dictionary in layout.objects:
		if item.kind == "bridge" and absf(x-item.position[0])<=float(item.size[0])/2 and absf(z-item.position[2])<=float(item.size[2])/2:
			value = maxf(value,float(item.position[1]))
	return value

func height_server(x: float,z: float) -> float:
	return height_godot(x,-z)

func create_actor() -> void:
	actor = Node3D.new()
	actor.name = "AcceptedForgottenKnight"
	add_child(actor)
	var packed: PackedScene = load(VarendorWorld.KNIGHT_ASSET)
	var visual: Node3D = packed.instantiate()
	actor.add_child(visual)
	actor.set_meta("visual",visual)
	actor.set_meta("base_visual",visual.transform)
	actor.set_meta("model",VarendorWorld.KNIGHT_MODEL)
	actor.set_meta("pick_size",Vector3(.82,1.84,.68))
	actor.set_meta("player",visual.find_children("*","AnimationPlayer",true,false)[0])
	var equipment: VarendorKnightEquipment = VarendorKnightEquipment.new()
	var game: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://generated/game.json"))
	equipment.bind(actor,visual,game.items)
	equipment.apply_equipment({"head":"fallen_helm","chest":"militia_plate","gloves":"wolf_gloves","boots":"grave_boots","belt":"ash_belt","weapon":"wardens_blade"})
	animator.bind(actor)
	animator.prefer_run = true
	collision.setup([])
	motor.collision = collision
	motor.bounds_min = Vector2(-796,-696)
	motor.bounds_max = Vector2(796,696)
	reset_actor(Vector2(-100,-190))

func reset_actor(server_point: Vector2) -> void:
	motor.identity = ""
	motor.reconcile({"time":0,"monsters":[],"heroes":[],"character":{"id":"world-B-review","generation":1,
		"x":server_point.x,"z":server_point.y,"yOffset":0,"verticalVelocity":0,"grounded":true,"yaw":0,
		"stats":{"speed":6.2},"dead":false,"combatState":"idle"}})
	actor.position = Vector3(server_point.x,height_server(server_point.x,server_point.y),-server_point.y)
	follow.reset_follow()

func set_overview() -> void:
	overview = true
	camera.position = Vector3(0,1450,1490)
	camera.fov = 52
	camera.look_at(Vector3(0,55,-35))

func _unhandled_input(event: InputEvent) -> void:
	if follow.handle_captured_input(event):return
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_F1:set_overview()
		if event.keycode == KEY_F2:
			overview = false
			camera.fov = rad_to_deg(.82)
			follow.reset_follow()
		if event.keycode == KEY_SPACE and loaded:motor.request_jump()
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		if event.pressed:follow.begin_capture(event.position)
		else:follow.release_capture()
	if event is InputEventMouseButton and event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
		follow.zoom(-1 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1)

func _physics_process(dt: float) -> void:
	if not loaded or automate:return
	var axes: Vector2 = Vector2(float(Input.is_physical_key_pressed(KEY_D))-float(Input.is_physical_key_pressed(KEY_A)),float(Input.is_physical_key_pressed(KEY_W))-float(Input.is_physical_key_pressed(KEY_S)))
	motor.input_mode = "manual"
	motor.input_direction = follow.movement_direction(axes)
	motor.physics_step(dt)

func _process(dt: float) -> void:
	if not loaded:return
	elapsed += dt
	var pose: Dictionary = motor.render_pose(Engine.get_physics_interpolation_fraction())
	actor.position = Vector3(pose.x,height_server(pose.x,pose.z)+pose.yOffset,-pose.z)
	actor.rotation.y = float(pose.yaw)+PI
	var motion: Dictionary = {"grounded":motor.grounded,"verticalVelocity":motor.vertical_velocity,"locomotionState":motor.locomotion_state}
	animator.update(motion,Vector3(pose.velocityX,pose.verticalVelocity,-pose.velocityZ),elapsed*1000,dt)
	if not overview:follow.update_pose(dt,actor.position,motor.height)

func capture(name: String) -> void:
	if DisplayServer.get_name() == "headless":return
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image: Image = get_viewport().get_texture().get_image()
	image.save_png(output_dir.path_join(name+".png"))

func run_review() -> void:
	DirAccess.make_dir_recursive_absolute(output_dir)
	await capture("overview-B")
	var result: Dictionary = {"stage":"B","runtime_scene":"res://world-final/geography_preview.tscn",
		"headless":DisplayServer.get_name()=="headless","routes":[],"controller":"VarendorPlayerMovement",
		"architecture_collision_verified":false,"server_integration_verified":false,"full_world_acceptance":false}
	# Numerical traversal uses the accepted fixed-step motor, normal 6.2m/s,
	# accelerated wall time. It is not a claim of visually watching every route.
	for road: Dictionary in layout.roads:
		var points: Array = road.points_xyz
		reset_actor(Vector2(points[0][0],-points[0][2]))
		motor.input_mode = "manual"
		var steps: int = 0
		var worst_step: float = 0
		var passed: bool = true
		for raw: Array in points.slice(1):
			var target: Vector2 = Vector2(raw[0],-raw[2])
			var budget: int = ceili(motor.position_value.distance_to(target)/6.2*60)+300
			while motor.position_value.distance_to(target)>.15 and budget>0:
				var previous: Vector2 = motor.position_value
				motor.input_direction = (target-previous).normalized()
				motor.physics_step(1.0/60.0)
				var change: float = absf(height_server(motor.position_value.x,motor.position_value.y)-height_server(previous.x,previous.y))
				worst_step = maxf(worst_step,change)
				budget -= 1
				steps += 1
				if steps%300 == 0:await get_tree().process_frame
			if budget<=0:passed=false;break
		motor.input_direction = Vector2.ZERO
		motor.physics_step(1.0/60.0)
		var stop: Vector2 = motor.position_value
		for frame: int in range(60):motor.physics_step(1.0/60.0)
		var drift: float = stop.distance_to(motor.position_value)
		result.routes.append({"id":road.id,"arrived":passed,"steps":steps,"stop_drift_m":drift,"max_vertical_support_step_m":worst_step})
	result["all_routes_arrived"] = result.routes.all(func(r: Dictionary):return r.arrived and r.stop_drift_m<.000001)
	result["support_steps_pass"] = result.routes.all(func(r: Dictionary):return r.max_vertical_support_step_m<.08)
	for view: Dictionary in [{"id":"fort-gate","point":Vector2(-100,-245),"yaw":0.0},{"id":"snow-road","point":Vector2(-625,425),"yaw":.8},{"id":"crater-ramp","point":Vector2(463,525),"yaw":-1.2},{"id":"lake-cave","point":Vector2(209,287),"yaw":.0}]:
		reset_actor(view.point)
		overview = false
		camera.fov = rad_to_deg(.82)
		follow.yaw = view.yaw
		follow.reset_follow()
		for frame: int in range(40):await get_tree().process_frame
		await capture(view.id)
	set_overview()
	var file: FileAccess = FileAccess.open(output_dir.path_join("godot-B-review.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(result,"  "))
	file.close()
	print("WORLD_B_REVIEW "+JSON.stringify(result))
	get_tree().quit(0 if result.all_routes_arrived and result.support_steps_pass else 3)
