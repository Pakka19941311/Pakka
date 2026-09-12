extends Node

const CITY_ACTOR = preload("res://world-expansion-v3/city/scripts/city_actor_adapter.gd")
var world: VarendorWorld
var camera: Camera3D
var actor_list: Array[Node3D] = []
var time: float = 0.0
var output: String = ""
var capture_mode: bool = false
var report: Dictionary = {"status":"visual candidate; bounded street sample", "live_world_modified":false,"checks":{},"captures":[]}

func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--city-output="):
			output = argument.trim_prefix("--city-output=")
			capture_mode = true
	build()
	if capture_mode: call_deferred("review")

func build() -> void:
	world = VarendorWorld.new()
	add_child(world)
	world.set_process(false)
	world.set_physics_process(false)
	world.data = {"items":{}}
	world.labels_layer = Control.new()
	world.add_child(world.labels_layer)
	var environment := WorldEnvironment.new()
	var setting := Environment.new()
	setting.background_mode = Environment.BG_COLOR
	setting.background_color = Color("aeb9bd")
	setting.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	setting.ambient_light_color = Color("b6c4d1")
	setting.ambient_light_energy = .55
	setting.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	setting.fog_enabled = true
	setting.fog_light_color = Color("9eaead")
	setting.fog_density = .002
	environment.environment = setting
	world.add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-43,-27,0)
	sun.light_energy = 1.05
	sun.light_color = Color("fff0d7")
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90
	world.add_child(sun)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(66,72)
	ground.mesh = plane
	var stone := StandardMaterial3D.new()
	stone.albedo_texture = load("res://world-final/castle/courtyard_world_cobblestone_floor_001_albedo.jpg")
	stone.albedo_color = Color(.48,.49,.47)
	stone.normal_enabled = true
	stone.normal_texture = load("res://world-final/castle/courtyard_world_cobblestone_floor_001_normal.jpg")
	stone.roughness_texture = load("res://world-final/castle/courtyard_world_cobblestone_floor_001_roughness.png")
	stone.uv1_scale = Vector3(22,24,1)
	ground.material_override = stone
	ground.position = Vector3(0,-.02,4)
	world.add_child(ground)
	ground.create_trimesh_collision()
	var gate: Node3D = model("P2_gatehouse",Vector3(0,0,-18),0)
	var house: Node3D = model("P2_housepack",Vector3(-13,0,10),PI/2)
	# Raise the existing separate grilles; the geometry of the arch remains the source model.
	for node: Node in gate.find_children("*", "Node3D", true, false):
		if node.name in ["PortcullisFront","PortcullisBack"]:
			(node as Node3D).position.y += 2.4
	for structure: Node3D in [gate,house]:
		for mesh: MeshInstance3D in structure.find_children("*","MeshInstance3D",true,false):
			mesh.create_trimesh_collision()
			for index: int in mesh.mesh.get_surface_count():
				var material: Material = mesh.get_active_material(index)
				if material is StandardMaterial3D:
					var toned := material.duplicate() as StandardMaterial3D
					toned.albedo_color = Color(.69,.72,.72)
					mesh.set_surface_override_material(index,toned)
	model("P2_crate",Vector3(-6.8,0,9.8),.2)
	model("P2_crate",Vector3(-6.1,0,9.2),-.1)
	var guard := CITY_ACTOR.create_actor(world,"city-sample:guard","guard")
	guard.position = Vector3(2.6,0,-5)
	guard.rotation.y = -.3
	actor_list.append(guard)
	var resident := CITY_ACTOR.create_actor(world,"city-sample:resident","resident")
	resident.position = Vector3(-7.5,0,12.8)
	resident.rotation.y = -.25
	actor_list.append(resident)
	camera = Camera3D.new()
	camera.position = Vector3(22,7,33)
	camera.fov = 62
	world.add_child(camera)
	camera.look_at(Vector3(-3,4,-5))
	camera.current = true
	world.camera = camera
	var layer := CanvasLayer.new()
	add_child(layer)
	var title := Label.new()
	title.text = "Гринфолл · городской образец P2 · исходные CC0 модели"
	title.position = Vector2(24,18)
	title.add_theme_font_size_override("font_size",22)
	title.add_theme_color_override("font_outline_color",Color("10151a"))
	title.add_theme_constant_override("outline_size",5)
	layer.add_child(title)
	report.checks["source_house_loaded"] = house.get_child_count() > 0
	report.checks["source_gate_loaded"] = gate.get_child_count() > 0
	report.checks["two_native_factory_actors"] = actor_list.size() == 2

func model(id: String, at: Vector3, yaw: float) -> Node3D:
	var result: Node3D = (load("res://world-expansion-v3/city/assets/"+id+".glb") as PackedScene).instantiate()
	world.add_child(result)
	result.position = at
	result.rotation.y = yaw
	return result

func _process(delta: float) -> void:
	time += delta
	for actor: Node3D in actor_list:
		var controller: VarendorAnimationController = actor.get_meta("animation_controller")
		controller.sample(controller.find_clip(["idle"]),fmod(time,4.0)/4.0,true,delta)
	if not capture_mode:
		var direction := Vector3.ZERO
		if Input.is_physical_key_pressed(KEY_W): direction.z -= 1
		if Input.is_physical_key_pressed(KEY_S): direction.z += 1
		if Input.is_physical_key_pressed(KEY_A): direction.x -= 1
		if Input.is_physical_key_pressed(KEY_D): direction.x += 1
		if Input.is_physical_key_pressed(KEY_Q): direction.y -= 1
		if Input.is_physical_key_pressed(KEY_E): direction.y += 1
		camera.position += camera.basis * direction * delta * 7

func capture(label: String, at: Vector3, target: Vector3, fov: float = 62.0) -> void:
	camera.position = at
	camera.fov = fov
	camera.look_at(target)
	for frame: int in range(12): await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_tree().root.get_texture().get_image().save_png(output.path_join(label+".png"))
	report.captures.append(label+".png")

func review() -> void:
	DirAccess.make_dir_recursive_absolute(output)
	set_process(false)
	for actor: Node3D in actor_list:
		var controller: VarendorAnimationController = actor.get_meta("animation_controller")
		report.checks[str(actor.get_meta("model"))+"_idle_present"] = not controller.find_clip(["idle"]).is_empty()
		report.checks[str(actor.get_meta("model"))+"_rig_present"] = not actor.find_children("*","Skeleton3D",true,false).is_empty()
		var poses: Array[String] = []
		for phase: float in [.2,.7]:
			controller.sample(controller.find_clip(["idle"]),phase,true,.12)
			await get_tree().process_frame
			var values: Array[String] = []
			for skeleton: Skeleton3D in actor.find_children("*","Skeleton3D",true,false):
				for index: int in skeleton.get_bone_count(): values.append(str(skeleton.get_bone_pose(index)))
			poses.append(str(values).sha256_text())
		report.checks[str(actor.get_meta("model"))+"_idle_changes_bones"] = poses[0] != poses[1]
	set_process(true)
	await capture("01-street-overview",Vector3(13,3.4,22),Vector3(-5,4,-2),72)
	await capture("02-gate-eye-level",Vector3(0,1.8,7),Vector3(0,5,-18),72)
	await capture("03-house-eye-level",Vector3(9,1.8,24),Vector3(-13,5.0,10),67)
	await capture("04-guard",Vector3(4.7,1.35,-1.4),Vector3(2.6,1,-5),42)
	await capture("05-resident",Vector3(-5.5,1.3,16.4),Vector3(-7.5,1,12.8),42)
	report["godot"] = Engine.get_version_info()
	report["native_render"] = DisplayServer.get_name() != "headless"
	report["note"] = "Actors have authored idle only; no completed route, pathfinding, trading or guard combat is claimed. Camera controls are free inspection, not player collision movement."
	FileAccess.open(output.path_join("CITY_SAMPLE_QA.json"),FileAccess.WRITE).store_string(JSON.stringify(report,"\t"))
	print("P2_CITY_SAMPLE_DONE ",JSON.stringify(report.checks))
	set_process(false)
	for actor: Node3D in actor_list:
		var controller: VarendorAnimationController = actor.get_meta("animation_controller")
		controller.actor = null
		controller.visual = null
		controller.player = null
		actor.remove_meta("animation_controller")
	actor_list.clear()
	world.templates.clear()
	world.queue_free()
	await get_tree().process_frame
	get_tree().quit()
