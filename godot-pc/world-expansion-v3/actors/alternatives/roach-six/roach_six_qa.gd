extends Node

const ADAPTER = preload("res://world-expansion-v3/actors/profile_adapter.gd")
var output: String = "user://p2-actors"
var report: Dictionary = {"ok": true, "models": {}, "native_factory": "VarendorWorld.make_actor", "native_controller": "VarendorAnimationController subclass", "live_server_tested": false}
var world: VarendorWorld
var camera: Camera3D
var event_ledger: Array = []
var sequence: int = 0
var native_render: bool
var captures_enabled: bool = true

func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--p2-output="):
			output = argument.trim_prefix("--p2-output=")
	captures_enabled = not OS.get_cmdline_user_args().has("--p2-no-captures")
	DirAccess.make_dir_recursive_absolute(output)
	call_deferred("run")

func check(result: Dictionary, name: String, value: bool) -> void:
	result.checks[name] = value
	if not value:
		result.ok = false
		report.ok = false
		push_error("P2 check failed: " + name)

func capture(name: String) -> void:
	if not native_render or not captures_enabled:
		return
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_tree().root.get_texture().get_image().save_png(output.path_join(name + ".png"))

func bones(actor: Node3D) -> String:
	var values: Array = []
	for skeleton: Skeleton3D in actor.find_children("*", "Skeleton3D", true, false):
		for index: int in range(skeleton.get_bone_count()):
			values.append(str(skeleton.get_bone_pose(index)))
	return str(values).sha256_text()

func skinned_bounds(actor: Node3D) -> AABB:
	var result := AABB()
	var first := true
	for mesh: MeshInstance3D in actor.find_children("*", "MeshInstance3D", true, false):
		var skeleton := mesh.get_node_or_null(mesh.skeleton) as Skeleton3D
		if skeleton == null or mesh.skin == null or mesh.mesh == null:
			continue
		skeleton.force_update_all_bone_transforms()
		var transforms: Array[Transform3D] = []
		for bind: int in range(mesh.skin.get_bind_count()):
			var index: int = mesh.skin.get_bind_bone(bind)
			if index < 0:
				index = skeleton.find_bone(mesh.skin.get_bind_name(bind))
			transforms.append(skeleton.global_transform * skeleton.get_bone_global_pose(index) * mesh.skin.get_bind_pose(bind))
		for surface: int in range(mesh.mesh.get_surface_count()):
			var arrays: Array = mesh.mesh.surface_get_arrays(surface)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var joints: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
			var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
			var influences: int = joints.size() / vertices.size()
			for vertex: int in range(vertices.size()):
				var point := Vector3.ZERO
				for influence: int in range(influences):
					var cursor: int = vertex * influences + influence
					point += (transforms[joints[cursor]] * vertices[vertex]) * weights[cursor]
				result = AABB(point, Vector3.ZERO) if first else result.expand(point)
				first = false
	return result

func event(value: Dictionary) -> void:
	sequence += 1
	value["sequence"] = sequence
	world.current_snapshot = {"time": value.at}
	world.present_event(value)

func run() -> void:
	native_render = DisplayServer.get_name() != "headless"
	report["native_render"] = native_render
	report["godot"] = Engine.get_version_info()
	get_tree().root.size = Vector2i(1280, 900)
	world = VarendorWorld.new()
	add_child(world)
	# This isolated scene skips build_world, which normally parents the camera Node.
	# Parent it here so SceneTree owns its teardown; do not suppress engine errors.
	world.add_child(world.camera_controller)
	world.set_process(false)
	world.set_physics_process(false)
	world.data = {"items": {}}
	world.combat_volume = 0.0
	world.labels_layer = Control.new()
	world.add_child(world.labels_layer)
	world.event_presented.connect(func(value: Dictionary): event_ledger.append(value.duplicate(true)))
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("273039")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("b4c3d4")
	environment.environment.ambient_light_energy = .55
	world.add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45, -35, 0)
	sun.light_energy = 1.5
	sun.shadow_enabled = true
	world.add_child(sun)
	var floor := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(40, 40)
	floor.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("484b4c")
	material.roughness = .95
	floor.material_override = material
	floor.position.y = -.002
	world.add_child(floor)
	camera = Camera3D.new()
	world.add_child(camera)
	camera.current = true
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	world.camera = camera
	var title := Label.new()
	title.position = Vector2(28, 22)
	title.add_theme_font_size_override("font_size", 25)
	world.labels_layer.add_child(title)
	var profiles: Dictionary = {"MOB-05":ADAPTER.profiles()["MOB-05"]}
	for mob: String in profiles:
		var profile: Dictionary = profiles[mob]
		var result: Dictionary = {"ok": true, "checks": {}, "clips": {}, "profile": profile, "captures": []}
		var id: String = "p2:" + mob
		var actor: Node3D = ADAPTER.create_actor(world, id, mob)
		var controller: VarendorP2AnimationController = actor.get_meta("animation_controller")
		check(result, "created_through_native_factory", world.actors.get(id) == actor and actor.has_meta("screen_label") and actor.has_meta("base_visual"))
		check(result, "controller_is_native_subclass", controller is VarendorAnimationController)
		var direction_ok: bool = true
		for yaw: float in [0.0, PI * .5, PI, PI * 1.5]:
			actor.rotation.y = -yaw + PI
			var drawn_forward: Vector3 = (actor.basis * (actor.get_meta("visual") as Node3D).basis * Vector3.FORWARD).normalized()
			direction_ok = direction_ok and drawn_forward.dot(Vector3(sin(yaw), 0, -cos(yaw))) > .99999
		check(result, "four_server_yaws_face_correctly", direction_ok)
		actor.rotation.y = PI
		var radius: float = ADAPTER.body_radius(actor)
		check(result, "authoritative_radius_wins", is_equal_approx(ADAPTER.body_radius(actor, {"bodyRadius": 1.615}), 1.615))
		var combined: float = radius + .46
		var from := Vector2(-combined - .3, 0)
		var displacement: Vector2 = VarendorActorSpacing.slide(from, Vector2(2 * combined + .6, 0), Vector2.ZERO, combined)
		check(result, "native_spacing_does_not_cross_body", (from + displacement).length() >= combined - .001)
		var point: Vector3 = ADAPTER.hit_point(actor)
		check(result, "hit_point_inside_actor_height", point.y > 0 and point.y < float(profile.height))
		check(result, "server_damage_destination_preserved", ADAPTER.event_visual_destination(actor, {"destination": {"x": 1, "y": 2, "z": 3}}).is_equal_approx(Vector3(1, 2, -3)))
		var size: float = maxf(float(profile.pick_size[0]), maxf(float(profile.pick_size[1]), float(profile.pick_size[2])))
		camera.size = size * 1.6
		var center := Vector3(0, float(profile.height) * .5, 0)
		camera.position = center + Vector3(1.2, .8, -1.8) * size
		camera.look_at(center, Vector3.UP)
		await get_tree().process_frame
		check(result, "native_ray_picker_selects_actor", world.targeting.pick(camera.unproject_position(point)) == id)
		for clip: String in ["idle", "walk", "run", "attack", "hit", "death"]:
			var resolved: String = controller.find_clip([clip])
			check(result, clip + "_exists", not resolved.is_empty())
			var signatures: Array = []
			for phase: float in [0.0, .5, .95]:
				controller.sample(resolved, phase, false, .12)
				await get_tree().process_frame
				signatures.append(bones(actor))
			result.clips[clip] = {"length": controller.clip_length(resolved), "poses_change": signatures[0] != signatures[1] or signatures[1] != signatures[2]}
			check(result, clip + "_changes_pose", result.clips[clip].poses_change)
		var skeleton: Skeleton3D = actor.find_children("*", "Skeleton3D", true, false)[0]
		var weighted := {}
		for skin_mesh: MeshInstance3D in actor.find_children("*", "MeshInstance3D", true, false):
			if skin_mesh.mesh == null or skin_mesh.skin == null: continue
			for surface: int in range(skin_mesh.mesh.get_surface_count()):
				var arrays: Array = skin_mesh.mesh.surface_get_arrays(surface)
				var bind_indices: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
				var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
				for i: int in range(weights.size()):
					if weights[i] < .05: continue
					var bind: int = bind_indices[i]
					var bone_index: int = skin_mesh.skin.get_bind_bone(bind)
					if bone_index < 0: bone_index = skeleton.find_bone(skin_mesh.skin.get_bind_name(bind))
					var bone_name: String = skeleton.get_bone_name(bone_index)
					weighted[bone_name] = int(weighted.get(bone_name, 0)) + 1
		for bone_name: String in ["MiddleUpperL", "MiddleLowerL", "MiddleClawL", "MiddleUpperR", "MiddleLowerR", "MiddleClawR"]:
			check(result, bone_name + "_has_real_skin_weights", int(weighted.get(bone_name, 0)) >= 10)
		var middle_samples := []
		var floor_ok := true
		# The prior loop ends in a death pose. Finish the native crossfade before
		# comparing settled clip contact coordinates to the Blender samples.
		controller.sample(controller.find_clip(["run"]), 0.0, false, .5)
		await get_tree().process_frame
		for phase: float in [0.0, .125, .25, .375, .5, .625, .75, .875, 1.0]:
			controller.sample(controller.find_clip(["run"]), phase, false, .01)
			await get_tree().process_frame
			var frame := {}
			for bone_name: String in ["MiddleContactL", "MiddleContactR"]:
				var point_world: Vector3 = skeleton.global_transform * skeleton.get_bone_global_pose(skeleton.find_bone(bone_name)).origin
				floor_ok = floor_ok and point_world.y >= -.003 and point_world.y <= .085
				frame[bone_name] = [point_world.x, point_world.y, point_world.z]
			middle_samples.append(frame)
		check(result, "middle_feet_lift_without_floor_penetration", floor_ok)
		for bone_name: String in ["MiddleContactL", "MiddleContactR"]:
			var heights: Array = middle_samples.map(func(f: Dictionary): return f[bone_name][1])
			var forward: Array = middle_samples.map(func(f: Dictionary): return f[bone_name][2])
			check(result, bone_name + "_articulated_stroke_and_lift", float(heights.max()) - float(heights.min()) > .05 and float(forward.max()) - float(forward.min()) > .25)
		result["middle_contact_samples"] = middle_samples
		result["middle_joint_weight_counts"] = weighted
		for jaw_name: String in ["JawL", "JawR"]:
			var rotations: Array[Quaternion] = []
			for phase: float in [0.0, .42, .95]:
				controller.sample(controller.find_clip(["attack"]), phase, false, .01)
				await get_tree().process_frame
				var relative_basis: Basis = skeleton.get_bone_global_pose(skeleton.find_bone("Head")).basis.inverse() * skeleton.get_bone_global_pose(skeleton.find_bone(jaw_name)).basis
				rotations.append(relative_basis.orthonormalized().get_rotation_quaternion())
			check(result, jaw_name + "_animates_mandible", rotations[0].angle_to(rotations[1]) > .02 or rotations[1].angle_to(rotations[2]) > .02)
		var alive := {"alive": true, "hp": 100, "action": "idle", "combatState": "idle", "actionStartedAt": 0}
		actor.set_meta("motion", alive)
		controller.reset_alive()
		for clock: float in range(800, 1001, 16):
			controller.update(alive, Vector3.ZERO, clock, .016)
		var idle_bounds: AABB = skinned_bounds(actor)
		result["idle_skinned_bounds"] = str(idle_bounds)
		check(result, "native_idle_feet_on_floor", idle_bounds.position.y >= -.003 and idle_bounds.position.y <= .02)
		title.text = mob + " — " + str(profile.title) + " · idle · P2 visual candidate"
		await capture(mob + "_idle")
		result.captures.append(mob + "_idle.png")
		controller.prefer_run = true
		var transition_contacts: Array = []
		for frame: int in range(36):
			controller.update(alive, Vector3(0,0,-1.6), 1100+frame*1000.0/60.0, 1.0/60.0)
			skeleton.force_update_all_bone_transforms()
			var contact_frame: Dictionary = {"frame":frame}
			for bone_name: String in ["MiddleContactL", "MiddleContactR"]:
				var contact_world: Vector3 = skeleton.global_transform * skeleton.get_bone_global_pose(skeleton.find_bone(bone_name)).origin
				contact_frame[bone_name] = [contact_world.x, contact_world.y, contact_world.z]
			transition_contacts.append(contact_frame)
			if frame in [0, 6, 12, 18, 24, 30]:
				title.text = "MOB-05 · Roach six legs · pursuit1.6m/s · phase " + str(frame)
				await capture("MOB-05_run_"+str(frame))
		check(result, "proposed_pursuit1_6_rate_supported", not bool(actor.get_meta("p2_gait_contract_violation",true)))
		result["proposed_pursuit_contract"] = actor.get_meta("p2_gait_contract")
		result["idle_to_run_contact_samples"] = transition_contacts
		controller.prefer_run = false
		for gait: String in ["walk", "run"]:
			var velocity := Vector3(0, 0, -float(profile.gait[gait]))
			controller.prefer_run = gait == "run"
			controller.update(alive, velocity, 1500, .1)
			check(result, gait + "_rate_bounded", controller.playback_rate <= float(profile.maximum_gait_rate) + .001)
			controller.update(alive, Vector3.ZERO, 1600, .016)
			check(result, gait + "_stops_immediately", controller.state == "idle")
		controller.prefer_run = false
		var duration: float = float(profile.qa_attack_duration_ms)
		var impact: float = 2000 + duration * .5
		event({"kind": "attack", "actor": id, "target": "qa:receiver", "at": 2000, "actionStartedAt": 2000, "impactAt": impact, "endsAt": 2000 + duration})
		var attack := {"alive": true, "hp": 100, "action": "attack", "combatState": "windup", "actionStartedAt": 2000, "actionEndsAt": 2000 + duration, "hitAt": impact}
		actor.set_meta("motion", attack)
		for clock: float in range(2000, int(impact), 16):
			controller.update(attack, Vector3.ZERO, clock, .016)
		controller.update(attack, Vector3.ZERO, impact, .016)
		result["attack_skinned_bounds"] = str(skinned_bounds(actor))
		check(result, "contact_matches_authoritative_impact", absf(float(actor.get_meta("p2_sampled_attack_phase")) - float(profile.attack_contact)) < .00001)
		check(result, "native_attack_duration_within_rate_cap", not bool(actor.get_meta("p2_attack_contract_violation", true)))
		title.text = mob + " — " + str(profile.title) + " · attack contact · P2 visual candidate"
		await capture(mob + "_attack")
		result.captures.append(mob + "_attack.png")
		var before_hits: int = event_ledger.filter(func(value: Dictionary): return value.get("kind") == "hit").size()
		event({"kind": "hit", "actor": id, "target": "qa:receiver", "at": impact, "amount": 10})
		for index: int in range(5):
			controller.update(attack, Vector3.ZERO, impact + index * 10, .01)
		var after_hits: int = event_ledger.filter(func(value: Dictionary): return value.get("kind") == "hit").size()
		check(result, "one_server_hit_no_renderer_damage", after_hits == before_hits + 1)
		controller.update(alive, Vector3.ZERO, 3500, .016)
		controller.on_event({"kind": "hit", "at": 3500, "hitUntil": 3680}, 3500)
		controller.update(alive, Vector3.ZERO, 3550, .016)
		check(result, "hit_uses_source_duration", controller.hit_pose_until - controller.hit_at >= controller.clip_length(controller.find_clip(["hit"])) * 1000 - .01)
		var dead := {"alive": false, "hp": 0, "deathAt": 4000, "corpseUntil": 8000}
		actor.set_meta("motion", dead)
		event({"kind": "death", "actor": id, "at": 4000, "deathAt": 4000, "corpseUntil": 8000})
		var death_length: float = maxf(.65, controller.clip_length(controller.find_clip(["death"])))
		for clock: float in range(4000, int(4000 + death_length * 1000 + 50), 16):
			controller.update(dead, Vector3.ZERO, clock, .016)
		controller.update(dead, Vector3.ZERO, 4000 + death_length * 1000 + 50, .016)
		var corpse_bounds: AABB = skinned_bounds(actor)
		result["death_skinned_bounds"] = str(corpse_bounds)
		check(result, "native_corpse_settles_on_floor", corpse_bounds.position.y >= -.003 and corpse_bounds.position.y <= .02)
		var corpse_center: Vector3 = corpse_bounds.get_center()
		check(result, "corpse_stays_near_authoritative_root", Vector2(corpse_center.x, corpse_center.z).length() <= float(profile.pick_size[2]) * .8)
		title.text = mob + " — " + str(profile.title) + " · held death · P2 visual candidate"
		await capture(mob + "_death")
		result.captures.append(mob + "_death.png")
		var held: String = bones(actor)
		controller.update(dead, Vector3.ZERO, 4000 + death_length * 1000 + 300, .016)
		check(result, "death_pose_holds", held == bones(actor))
		check(result, "dead_actor_not_pickable", not bool(actor.get_meta("pickable")))
		controller.update(dead, Vector3.ZERO, 8001, .016)
		check(result, "corpse_expires_on_server_clock", controller.corpse_complete and not controller.visual.visible)
		report.models[mob] = result
		world.actors.erase(id)
		actor.set_meta("animation_controller", null)
		controller.actor = null
		controller.visual = null
		controller.player = null
		actor.queue_free()
		await get_tree().process_frame
	report["event_ledger"] = event_ledger
	var file := FileAccess.open(output.path_join("ROACH_SIX_NATIVE_QA.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "  "))
	file.close()
	print("P2_NATIVE_QA_RESULT ", JSON.stringify({"ok": report.ok, "models": report.models.size(), "native_render": native_render}))
	world.templates.clear()
	world.queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if report.ok else 1)
