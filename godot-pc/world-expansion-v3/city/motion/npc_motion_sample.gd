extends Node

const NPC = preload("res://world-expansion-v3/city/motion/npc_motion_adapter.gd")
var world: VarendorWorld
var camera: Camera3D
var actors: Dictionary = {}
var rigs: Dictionary = {}
var output: String = ""
var clock: float = 0.0
var captures: Dictionary = {}
var previous: Dictionary = {}
var turns: Dictionary = {"guard":[],"resident":[]}
var report: Dictionary = {"status":"isolated visual candidate","live_world_modified":false,"checks":{},"samples":{},"captures":[]}
var saving: bool = false

func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--npc-output="): output = arg.trim_prefix("--npc-output=")
	world = VarendorWorld.new()
	add_child(world)
	world.set_process(false)
	world.set_physics_process(false)
	world.data = {"items":{}}
	world.labels_layer = Control.new()
	world.add_child(world.labels_layer)
	var environment := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color("aeb8ba")
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("c5ced7")
	settings.ambient_light_energy = .55
	environment.environment = settings
	world.add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45,-32,0)
	sun.light_energy = 1.05
	sun.shadow_enabled = true
	world.add_child(sun)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(30,30)
	ground.mesh = plane
	var stone := StandardMaterial3D.new()
	stone.albedo_texture = load("res://world-final/castle/courtyard_world_cobblestone_floor_001_albedo.jpg")
	stone.uv1_scale = Vector3(12,12,1)
	stone.albedo_color = Color(.5,.5,.5)
	ground.material_override = stone
	ground.position.y = -.007
	world.add_child(ground)
	for role: String in ["guard","resident"]:
		var actor: Node3D = NPC.create_actor(world,"npc-motion:"+role,role)
		actor.position.x = -1.0 if role == "guard" else 1.0
		actors[role] = actor
		var visual: Node3D = actor.get_meta("visual")
		var skeleton: Skeleton3D = visual.find_children("*","Skeleton3D",true,false)[0]
		rigs[role] = skeleton
		report.checks[role+"_53_bones"] = skeleton.get_bone_count() == 53
		var player: AnimationPlayer = actor.get_meta("player")
		report.checks[role+"_five_clips"] = player.get_animation_list().size() >= 5
		report.samples[role] = []
		NPC.pose_at(actor,"idle",0)
	camera = Camera3D.new()
	camera.position = Vector3(4,2.4,7)
	camera.fov = 44
	world.add_child(camera)
	camera.look_at(Vector3(0,1,1.5))
	camera.current = true
	world.camera = camera
	var layer := CanvasLayer.new()
	add_child(layer)
	var label := Label.new()
	label.text = "Гринфолл · походка, стойка и разговор NPC · отдельная проверка"
	label.position = Vector2(20,18)
	label.add_theme_font_size_override("font_size",20)
	label.add_theme_color_override("font_outline_color",Color.BLACK)
	label.add_theme_constant_override("outline_size",4)
	layer.add_child(label)

func _process(delta: float) -> void:
	if actors.is_empty() or saving:return
	clock += delta
	for role: String in actors:
		var actor: Node3D = actors[role]
		var profile: Dictionary = NPC.PROFILES[role]
		var walk_seconds: float = float(profile.walk_seconds)*3
		var state: String = "idle"
		var phase: float = fposmod(clock/4,1)
		if clock >= 2 and clock < 2+walk_seconds:
			state = "walk"
			phase = fposmod((clock-2)/float(profile.walk_seconds),1)
			actor.position.z = (clock-2)*float(profile.walk_mps)
		elif clock >= 3+walk_seconds and clock < 4.2+walk_seconds:
			state = "turn_left"
			phase = (clock-3-walk_seconds)/1.2
			actor.rotation.y = NPC.turn_yaw(phase)
		elif clock >= 5.2+walk_seconds and clock < 8.4+walk_seconds:
			state = "talk"
			phase = (clock-5.2-walk_seconds)/3.2
		NPC.pose_at(actor,state,phase)
		var rig: Skeleton3D = rigs[role]
		var foot: Vector3 = rig.global_transform * rig.get_bone_global_pose(rig.find_bone("foot_l")).origin
		var right: Vector3 = rig.global_transform * rig.get_bone_global_pose(rig.find_bone("foot_r")).origin
		var hand: Vector3 = rig.global_transform * rig.get_bone_global_pose(rig.find_bone("hand_l")).origin
		if state == "walk" and phase > .05 and phase < .45 and previous.has(role):
			var prior: Dictionary = previous[role]
			if prior.state == state and float(prior.phase) < phase and float(prior.phase) > .05:
				report.samples[role].append({"at":clock,"phase":phase,"dt":delta,"root_speed":actor.position.distance_to(prior.position)/delta,"foot_slip_m":Vector2(foot.x,foot.z).distance_to(Vector2(prior.foot.x,prior.foot.z)),"foot_y":foot.y})
		if state == "turn_left" and previous.has(role):
			var prior: Dictionary = previous[role]
			if prior.state == state and floorf(float(prior.phase)*2) == floorf(phase*2):
				var planted: Vector3 = right if phase < .5 else foot
				var old_foot: Vector3 = prior.right if phase < .5 else prior.foot
				turns[role].append(planted.distance_to(old_foot))
		previous[role] = {"state":state,"phase":phase,"position":actor.position,"foot":foot,"right":right,"hand":hand}
		if not output.is_empty():
			var key: String = role+"-"+state
			if not captures.has(key) and phase > .2 and phase < .45:
				captures[key] = true
				capture(key,actor)
	var center: Vector3 = (actors.guard.position + actors.resident.position)*.5 + Vector3(0,1,0)
	camera.position = center + Vector3(3.7,1.1,6.2)
	camera.look_at(center)
	if clock > 14 and not output.is_empty():
		saving = true
		finish.call_deferred()

func capture(key: String, actor: Node3D) -> void:
	await RenderingServer.frame_post_draw
	var filename: String = key+".png"
	get_viewport().get_texture().get_image().save_png(output.path_join(filename))
	report.captures.append({"file":filename,"at":clock,"position":[actor.position.x,actor.position.y,actor.position.z]})

func finish() -> void:
	for role: String in actors:
		var samples: Array = report.samples[role]
		var maximum: float = 0
		var speed_error: float = 0
		for sample: Dictionary in samples:
			maximum = maxf(maximum,float(sample.foot_slip_m))
			speed_error = maxf(speed_error,absf(float(sample.root_speed)-float(NPC.PROFILES[role].walk_mps)))
		report.checks[role+"_planted_foot_samples"] = samples.size() >= 15
		report.checks[role+"_root_speed"] = speed_error < .01
		report.checks[role+"_no_stance_slide"] = maximum < .002
		report[role+"_max_stance_slip_m"] = maximum
		var turn_slip: float = turns[role].max() if not turns[role].is_empty() else INF
		report.checks[role+"_turn_planted_foot"] = turns[role].size() >= 15 and turn_slip < .003
		report[role+"_max_turn_stance_slip_m"] = turn_slip
	var file := FileAccess.open(output.path_join("NPC_MOTION_QA.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "))
	file.close()
	# This isolated scene does not run World.build(), which normally parents
	# its camera controller. Free that unparented Node before scene shutdown.
	if world.camera_controller.get_parent() == null:world.camera_controller.free()
	get_tree().quit(0 if report.checks.values().all(func(value: Variant) -> bool:return bool(value)) else 1)
