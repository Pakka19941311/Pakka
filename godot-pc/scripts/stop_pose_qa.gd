extends SceneTree

# First-frame stopping regression: actual imported player rigs, production
# motor, manual AnimationPlayer sampling and native camera transforms. This is
# a runtime coordinate check; headless execution does not prove rendered pixels.
const STEP: float = 1.0 / 60.0
const MODELS: Array[String] = ["Warrior", "Wizard", "Ranger", "Rogue", "Monk"]
const FRAME_RATES: Array[int] = [30, 60, 144]

static func fixture(parent: Node, model: String) -> Dictionary:
	var body: Node3D = Node3D.new()
	parent.add_child(body)
	var scene: PackedScene = load("res://generated/actors/" + model + ".gltf")
	var visual: Node3D = scene.instantiate()
	body.add_child(visual)
	var bounds: AABB = AABB()
	var first: bool = true
	for node: Node in visual.find_children("*", "MeshInstance3D", true, false):
		var box: AABB = (visual.global_transform.affine_inverse() * node.global_transform) * node.get_aabb()
		bounds = box if first else bounds.merge(box)
		first = false
	visual.scale = Vector3.ONE * (2.05 / bounds.size.y)
	visual.position.y = -bounds.position.y * visual.scale.y
	body.set_meta("visual", visual)
	body.set_meta("base_visual", visual.transform)
	body.set_meta("model", model)
	body.set_meta("pick_size", Vector3.ONE * 2.05)
	body.set_meta("player", visual.find_children("*", "AnimationPlayer", true, false)[0])
	var controller: VarendorAnimationController = VarendorAnimationController.new()
	controller.bind(body)
	controller.prefer_run = true
	var skeleton: Skeleton3D = visual.find_children("*", "Skeleton3D", true, false)[0]
	var camera: Camera3D = Camera3D.new()
	parent.add_child(camera)
	var camera_controller: VarendorCameraController = VarendorCameraController.new()
	parent.add_child(camera_controller)
	camera_controller.setup(camera, VarendorCollision.new(), func(_x: float, _z: float): return 0.0)
	return {"body":body,"controller":controller,"skeleton":skeleton,"root_bone":skeleton.find_bone("Root"),"camera":camera,"camera_controller":camera_controller}

static func present(rig: Dictionary, motor: VarendorPlayerMovement, alpha: float, now: float, dt: float) -> Dictionary:
	var pose: Dictionary = motor.render_pose(alpha)
	var position: Vector3 = Vector3(pose.x,pose.yOffset,-pose.z)
	rig.body.position = position
	rig.body.rotation.y = -float(pose.yaw) + PI
	var motion: Dictionary = {"grounded":motor.grounded,"combatState":"idle","actionStartedAt":now}
	var velocity: Vector3 = Vector3(motor.actual_velocity.x,motor.vertical_velocity,-motor.actual_velocity.y)
	rig.controller.update(motion,velocity,now,dt)
	rig.camera_controller.update_pose(maxf(.000001,dt),position,0)
	var root_position: Vector3 = rig.skeleton.global_transform * rig.skeleton.get_bone_global_pose(rig.root_bone).origin
	return {"position":position,"root":root_position,"camera":rig.camera.global_transform,"state":rig.controller.state}

static func scenario(parent: Node, model: String, fps: int, initial: Dictionary) -> Dictionary:
	var rig: Dictionary = fixture(parent,model)
	var motor: VarendorPlayerMovement = VarendorPlayerMovement.new()
	motor.collision = VarendorCollision.new()
	motor.reconcile(initial)
	motor.sent({"type":"direction","x":0,"z":1},1)
	motor.submit({"type":"direction","x":0,"z":1})
	var physics_time: float = 0
	var shown: Dictionary = {}
	for frame: int in range(1,fps+1):
		var now: float = float(frame)/fps
		while physics_time + STEP <= now + .000001:
			motor.physics_step(STEP)
			physics_time += STEP
		shown = present(rig,motor,clampf((now-physics_time)/STEP,0,1),now*1000,1.0/fps)
	var release_position: Vector3 = shown.position
	var endpoint: Vector3 = Vector3(motor.position_value.x,0,-motor.position_value.y)
	var previous_speed: float = motor.actual_velocity.length()
	motor.sent({"type":"direction","x":0,"z":0},2)
	motor.submit({"type":"direction","x":0,"z":0})
	var release: Dictionary = present(rig,motor,0,1000,0)
	var release_jump: float = release.position.distance_to(release_position)
	var first_tick_position: Variant = null
	var first_tick_root: Variant = null
	var first_tick_camera: Variant = null
	var excursion: float = 0
	var total_travel: float = 0
	var root_excursion: float = 0
	var camera_excursion: float = 0
	var pending_interpolation: float = 0
	var all_idle: bool = release.state == "idle"
	var previous: Variant = null
	for frame: int in range(1,fps+1):
		var now: float = 1.0 + float(frame)/fps
		while physics_time + STEP <= now + .000001:
			motor.physics_step(STEP)
			physics_time += STEP
		shown = present(rig,motor,clampf((now-physics_time)/STEP,0,1),now*1000,1.0/fps)
		all_idle = all_idle and shown.state == "idle"
		if physics_time < 1.0 + STEP - .000001:
			pending_interpolation = maxf(pending_interpolation,shown.position.distance_to(release_position))
			continue
		if first_tick_position == null:
			first_tick_position = shown.position
			first_tick_root = shown.root
			first_tick_camera = shown.camera
		excursion = maxf(excursion,shown.position.distance_to(endpoint))
		root_excursion = maxf(root_excursion,shown.root.distance_to(first_tick_root))
		camera_excursion = maxf(camera_excursion,shown.camera.origin.distance_to(first_tick_camera.origin))
		if previous != null: total_travel += shown.position.distance_to(previous)
		previous = shown.position
	var result: Dictionary = {
		"model":model,"render_fps":fps,"speed_before_release":previous_speed,
		"release_snap_m":release_jump,"pending_interpolation_m":pending_interpolation,
		"maximum_body_distance_from_stop_m":excursion,"body_travel_after_first_tick_m":total_travel,
		"rig_root_excursion_after_first_tick_m":root_excursion,"camera_excursion_after_first_tick_m":camera_excursion,
		"idle_from_release":all_idle,"root_bone_present":rig.root_bone >= 0,
	}
	rig.camera_controller.free()
	rig.camera.free()
	rig.body.free()
	return result

static func run(parent: Node) -> Dictionary:
	var contract: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/player-stop-traces.json"))
	var checks: Dictionary = {}
	var observations: Array = []
	for model: String in MODELS:
		for fps: int in FRAME_RATES:
			var result: Dictionary = scenario(parent,model,fps,contract.traces[0].initial)
			observations.append(result)
			var name: String = "stop_pose_"+model.to_lower()+"_"+str(fps)+"fps"
			checks[name+"_immediate_idle_without_coast"] = result.speed_before_release > 5 and result.idle_from_release and result.maximum_body_distance_from_stop_m < .00001 and result.body_travel_after_first_tick_m < .00001
			checks[name+"_continuous_release_at_most_one_pending_tick"] = result.release_snap_m < .00001 and result.pending_interpolation_m <= result.speed_before_release*STEP+.00001
			checks[name+"_rig_root_and_camera_do_not_drift"] = result.root_bone_present and result.rig_root_excursion_after_first_tick_m < .00001 and result.camera_excursion_after_first_tick_m < .00001
	checks["stop_pose_observations"] = observations
	return checks

func _initialize() -> void:
	call_deferred("execute")

func execute() -> void:
	var checks: Dictionary = run(root)
	print("VARENDOR_STOP_POSE_QA "+JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return not value is bool or value) else 2)
