extends RefCounted

const Movement = preload("res://scripts/player_movement.gd")
const CameraQA = preload("res://scripts/camera_qa.gd")

# Actual wall-clock observation overlaps the other checks. This is deliberately
# not a simulated 60-second loop: the live SSE/physics/render paths keep running.
class NPCObserver extends Node:
	var world: VarendorWorld
	var started: int = 0
	var anchors: Dictionary = {}
	var previous: Dictionary = {}
	var snapshots: Dictionary = {}
	var stable: bool = true
	var idle: bool = true
	var max_speed: float = 0
	var frames: int = 0
	var ambient_previous: Dictionary = {}
	var ambient_samples: Dictionary = {}
	var ambient_valid: bool = true
	func begin(value: VarendorWorld) -> void:
		world = value
		started = Time.get_ticks_msec()
		for id: String in ["npc:shop", "npc:elder", "npc:smith", "npc:teleport"]:
			if world.actors.has(id):
				anchors[id] = world.actors[id].position
				previous[id] = world.actors[id].position
		stable = anchors.size() == 4
		for resident: Dictionary in world.ambient_residents.residents:
			var id: String = str(resident.id)
			if not world.actors.has(id):
				ambient_valid = false
				continue
			var actor: Node3D = world.actors[id]
			var clock: float = (actor.get_meta("animation_controller") as VarendorAnimationController).last_time
			ambient_previous[id] = {"position":Vector2(actor.position.x,-actor.position.z),"clock":clock}
			ambient_samples[id] = {"speed_limit":float(resident.speed),"distance":0.0,"max_speed":0.0,"max_speed_ratio":0.0,"max_step":0.0,"walk_frames":0,"idle_frames":0,"activity_frames":0,"motion_valid":true,"animation_valid":true}
		ambient_valid = ambient_valid and ambient_samples.size() == 6
	func _process(delta: float) -> void:
		if world == null: return
		frames += 1
		snapshots[str(world.timeline.latest.get("time", 0))] = true
		for id: String in anchors:
			if not world.actors.has(id):
				stable = false
				continue
			var actor: Node3D = world.actors[id]
			var distance: float = actor.position.distance_to(previous[id])
			max_speed = maxf(max_speed, distance / maxf(.00001, delta))
			stable = stable and actor.position.distance_to(anchors[id]) < .001
			idle = idle and str(actor.get_meta("animation_state", "idle")) == "idle"
			previous[id] = actor.position
		for id: String in ambient_samples:
			if not world.actors.has(id):
				ambient_valid = false
				continue
			var actor: Node3D = world.actors[id]
			var controller: VarendorAnimationController = actor.get_meta("animation_controller")
			var point: Vector2 = Vector2(actor.position.x,-actor.position.z)
			var prior: Dictionary = ambient_previous[id]
			var sample: Dictionary = ambient_samples[id]
			# The actor was already interpolated once. Match its actual clock
			# span, including physics catch-up during a slow graphical frame.
			var elapsed: float = maxf(delta,(controller.last_time-float(prior.clock))/1000.0)
			var step: float = point.distance_to(prior.position)
			var speed: float = step / maxf(.00001,elapsed)
			var limit: float = float(sample.speed_limit)
			sample.distance += step
			sample.max_speed = maxf(float(sample.max_speed),speed)
			sample.max_speed_ratio = maxf(float(sample.max_speed_ratio),speed / limit)
			sample.max_step = maxf(float(sample.max_step),step)
			# Quantization allowance is <=two60Hzsteps, never an arbitrary
			# metres-long teleport margin or a reset of the observed baseline.
			sample.motion_valid = bool(sample.motion_valid) and actor.position.is_finite() and speed <= limit * 1.1 + .002 and step <= limit * (elapsed + 2.0/60.0) + .002 and absf(actor.position.y-world.height_at(point.x,point.y)) < .02
			if controller.state == "walk": sample.walk_frames += 1
			elif controller.state == "idle": sample.idle_frames += 1
			elif controller.state == "attack": sample.activity_frames += 1
			# Permit the short approach->work transition in the interpolation
			# interval; sustained walking must always have the walking gait.
			if speed > .1 and str(actor.get_meta("motion",{}).get("action","idle")) == "walk":
				sample.animation_valid = bool(sample.animation_valid) and controller.state == "walk"
			ambient_previous[id] = {"position":point,"clock":controller.last_time}

static func run(main: Node) -> Dictionary:
	var checks: Dictionary = {}
	var tree: SceneTree = main.get_tree()
	var observer: NPCObserver = NPCObserver.new()
	tree.root.add_child(observer)
	observer.begin(main.world)
	checks.merge(await CameraQA.run(main.world.camera_controller, tree))
	checks.merge(await preload("res://scripts/camera_integration_qa.gd").run(main, tree))
	checks.merge(preload("res://scripts/player_movement_qa.gd").run())
	checks.merge(preload("res://scripts/player_pending_qa.gd").run())
	checks.merge(preload("res://scripts/player_stop_qa.gd").run())
	checks.merge(preload("res://scripts/navigation_qa.gd").run())
	checks.merge(preload("res://scripts/ambient_residents_qa.gd").run())
	checks.merge(await preload("res://scripts/reference_world_qa.gd").run(tree))
	checks.merge(preload("res://scripts/player_input_qa.gd").run())
	checks.merge(preload("res://scripts/target_rejection_qa.gd").run())
	checks.merge(preload("res://scripts/snapshot_timeline_qa.gd").run())
	checks.merge(preload("res://scripts/network_intent_qa.gd").run())
	checks.merge(movement_matrix())
	checks.merge(stale_snapshot_integration())
	checks.merge(await twenty_physics_jumps(main.world, tree))
	checks.merge(await world_pipeline(main, tree))
	while Time.get_ticks_msec() - observer.started < 60000:
		await tree.process_frame
	checks["npc_observation_real_seconds"] = float(Time.get_ticks_msec() - observer.started) / 1000
	checks["npc_observation_render_frames"] = observer.frames
	checks["npc_observation_snapshot_updates"] = observer.snapshots.size()
	checks["npc_60_seconds_no_teleport_or_high_speed"] = observer.stable and observer.max_speed < .001 and observer.frames > 60 and observer.snapshots.size() > 50
	checks["npc_60_seconds_animation_matches_stationary_service_role"] = observer.idle
	checks["npc_max_observed_speed_mps"] = observer.max_speed
	var all_ambient_moved: bool = observer.ambient_valid
	var ambient_motion: bool = observer.ambient_valid
	var ambient_animation: bool = observer.ambient_valid
	for sample: Dictionary in observer.ambient_samples.values():
		all_ambient_moved = all_ambient_moved and float(sample.distance) > 3.0 and int(sample.walk_frames) >= 2 and int(sample.idle_frames) >= 2
		ambient_motion = ambient_motion and bool(sample.motion_valid)
		ambient_animation = ambient_animation and bool(sample.animation_valid)
	checks["ambient_npc_60_seconds_all_six_really_walk_and_pause"] = all_ambient_moved
	checks["ambient_npc_60_seconds_no_teleport_or_excess_walking_speed"] = ambient_motion
	checks["ambient_npc_60_seconds_walk_animation_matches_real_movement"] = ambient_animation
	checks["ambient_npc_60_seconds_per_resident_observations"] = observer.ambient_samples
	observer.queue_free()
	checks["acceptance_human_review"] = "MMORPG feel, perceived blends, mouse comfort and target Windows GPU smoothness require the owner to play; automated inputs and imported pose samples do not establish subjective acceptance."
	return checks

static func stale_snapshot_integration() -> Dictionary:
	var checks: Dictionary = {}
	var probe: VarendorWorld = VarendorWorld.new()
	probe.terrain = {"columns":1,"rows":1,"width":400.0,"depth":400.0,"heights":[0.0,0.0,0.0,0.0],"platforms":[]}
	probe.collision.setup([])
	var old: Dictionary = hero_fixture(Vector2(10,10))
	probe.receive_snapshot(old)
	var teleported: Dictionary = hero_fixture(Vector2(-108,-90))
	teleported.time = 1100
	teleported.character.generation = 2
	probe.receive_snapshot(teleported)
	# Mark settled camera/selected target AFTER the legitimate teleport.
	# A rejected old packet must not clear either through lifecycle callbacks.
	probe.camera_controller._pose_initialized = true
	probe.camera_controller.follow_position = Vector3(-108,2,90)
	probe.targeting.selected_id = "qa:new-generation-target"
	var previous_position: Vector2 = probe.player_motion.position_value
	var previous_hero: Vector3 = probe.hero_position
	var previous_server: Vector3 = probe.server_position
	old.time = 1050
	probe.receive_snapshot(old)
	checks["integration_stale_preteleport_packet_cannot_reset_live_prediction"] = probe.player_motion.generation == 2 and probe.player_motion.position_value == previous_position and probe.hero_position == previous_hero and probe.server_position == previous_server
	checks["integration_stale_preteleport_packet_preserves_camera_and_target"] = probe.camera_controller._pose_initialized and probe.camera_controller.follow_position == Vector3(-108,2,90) and probe.target_id == "qa:new-generation-target"
	var projectile: Node3D = Node3D.new()
	probe.add_child(projectile)
	probe.effects.append({"node":projectile, "left":.2, "duration":.28})
	var recovered: Dictionary = teleported.duplicate(true)
	recovered.time = 5100
	recovered.character.x = -70.0
	probe.receive_snapshot(recovered)
	checks["integration_outage_resync_corrects_local_pose_and_clears_old_fx"] = probe.timeline.did_resynchronize and probe.player_motion.position_value == Vector2(-70,-90) and probe.effects.is_empty() and projectile.is_queued_for_deletion() and probe.target_id.is_empty() and not probe.camera_controller._pose_initialized
	probe.camera_controller.free()
	probe.free()
	return checks

static func hero_fixture(position: Vector2 = Vector2.ZERO) -> Dictionary:
	return {"time":1000, "character":{"id":"qa:core:movement", "generation":1, "x":position.x, "z":position.y, "yOffset":0.0, "grounded":true, "yaw":0.0, "verticalVelocity":0.0, "lastInputSequence":0, "dead":false, "stats":{"speed":6.2}, "combatState":"idle", "action":"idle", "actionStartedAt":1000, "destination":null, "target":null}, "monsters":[]}

static func motor(collision: VarendorCollision, position: Vector2 = Vector2.ZERO) -> Movement:
	var value: Movement = Movement.new()
	value.collision = collision
	value.reconcile(hero_fixture(position))
	return value

static func movement_matrix() -> Dictionary:
	var checks: Dictionary = {}
	var collision: VarendorCollision = VarendorCollision.new()
	collision.setup([])
	var distances: Array[float] = []
	var directional: bool = true
	for direction: Vector2 in [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT, Vector2(1,1), Vector2(1,-1), Vector2(-1,1), Vector2(-1,-1)]:
		var value: Movement = motor(collision)
		value.submit({"type":"direction", "x":direction.x, "z":direction.y})
		for tick: int in range(90): value.physics_step(1.0 / 60)
		distances.append(value.position_value.length())
		directional = directional and value.position_value.normalized().dot(direction.normalized()) > .999
	checks["movement_all_eight_directions_follow_input"] = directional
	checks["movement_diagonal_speed_equals_cardinal"] = distances.max() - distances.min() < .0001
	var endpoints: Array[Vector2] = []
	var rates: Array[int] = [30,60,144]
	for fps: int in rates:
		var value: Movement = motor(collision)
		value.submit({"type":"direction", "x":1, "z":0})
		var accumulator: float = 0
		var steps: int = 0
		for frame: int in range(fps * 2):
			accumulator += 1.0 / fps
			while accumulator + .00000001 >= 1.0 / 60:
				value.physics_step(1.0 / 60)
				accumulator -= 1.0 / 60
				steps += 1
			var pose: Dictionary = value.render_pose(accumulator * 60)
			if not Vector2(pose.x,pose.z).is_finite(): directional = false
		endpoints.append(value.position_value)
		checks["physics_steps_at_" + str(fps) + "_render_fps"] = steps
	checks["movement_fixed_physics_independent_of_30_60_144_render_fps"] = endpoints[0].distance_to(endpoints[1]) < .0001 and endpoints[0].distance_to(endpoints[2]) < .0001 and directional
	var value: Movement = motor(collision)
	value.submit({"type":"destination", "x":5.0, "z":0.0})
	for tick: int in range(180): value.physics_step(1.0 / 60)
	var arrival: Vector2 = value.position_value
	var yaw_at_arrival: float = value.yaw
	for tick: int in range(30): value.physics_step(1.0 / 60)
	checks["click_move_settles_inside_reference_arrival_radius_without_spinning"] = value.position_value.distance_to(Vector2(5,0)) < .18 and value.position_value.distance_to(arrival) < .001 and absf(angle_difference(yaw_at_arrival, value.yaw)) < .001
	value.submit({"type":"destination", "x":20, "z":0})
	value.physics_step(1.0 / 60)
	value.submit({"type":"direction", "x":0, "z":-1})
	checks["wasd_immediately_cancels_click_path_and_destination"] = value.input_mode == "manual" and value.destination == null and value.navigation_path.is_empty()
	var safe_changes: bool = true
	for tick: int in range(60):
		var before: Vector2 = value.position_value
		var yaw: float = value.yaw
		value.submit({"type":"direction", "x":-1 if tick % 8 < 4 else 1, "z":0})
		value.physics_step(1.0 / 60)
		safe_changes = safe_changes and before.distance_to(value.position_value) < 6.2 / 60 + .001 and absf(angle_difference(yaw,value.yaw)) < .9
	checks["rapid_direction_changes_have_no_teleport_or_180_snap"] = safe_changes
	value = motor(collision)
	value.bodies = [{"x":3.0, "z":0.0, "bodyRadius":1.3, "alive":true}]
	value.submit({"type":"direction", "x":1, "z":0})
	var separation: bool = true
	for tick: int in range(180):
		value.physics_step(1.0 / 60)
		separation = separation and value.position_value.distance_to(Vector2(3,0)) >= .46 + 1.3 - .0001
	checks["predicted_player_never_enters_living_monster_body"] = separation
	collision.setup([{"kind":"box", "x":3.0, "z":0.0, "halfX":.5, "halfZ":2.0, "rotation":0.0, "bottom":0.0, "top":4.0}])
	value = motor(collision)
	value.submit({"type":"destination", "x":6, "z":0})
	var local_path: bool = not value.navigation_path.is_empty()
	var path_clear: bool = true
	for tick: int in range(180):
		value.physics_step(1.0 / 60)
		path_clear = path_clear and not collision.blocked(value.position_value)
	checks["reference_click_navigation_starts_locally_and_routes_around_wall"] = local_path and path_clear and value.position_value.distance_to(Vector2(6,0)) < .18
	return checks

static func twenty_physics_jumps(live: VarendorWorld, tree: SceneTree) -> Dictionary:
	var checks: Dictionary = {}
	var position: Vector2 = live.collision.nearest_free(Vector2(live.hero_position.x,-live.hero_position.z))
	var value: Movement = motor(live.collision, position)
	var completed: int = 0
	var no_double: bool = true
	var smooth: bool = true
	var landings: bool = true
	var all_states: Dictionary = {}
	var dt: float = 1.0 / Engine.physics_ticks_per_second
	for jump_index: int in range(20):
		var acknowledgement: Dictionary = hero_fixture(position)
		acknowledgement.time = value.clock_ms
		value.reconcile(acknowledgement)
		if not value.request_jump():
			break
		var heights: Array[float] = []
		for tick: int in range(75):
			await tree.physics_frame
			var velocity_before: float = value.vertical_velocity
			if not value.grounded:
				no_double = no_double and not value.request_jump() and is_equal_approx(velocity_before,value.vertical_velocity)
			value.physics_step(dt)
			all_states[value.locomotion_state] = true
			var pose: Dictionary = value.render_pose(.5)
			heights.append(float(pose.yOffset))
			if heights.size() > 1:
				smooth = smooth and absf(heights[-1]-heights[-2]) <= 8.2 * dt + .002 and heights[-1] >= 0
			if value.grounded and value.land_left <= 0:
				break
		landings = landings and value.grounded and is_zero_approx(value.height) and is_zero_approx(value.vertical_velocity) and heights.max() > 1.4 and heights.max() < 1.6
		if value.grounded: completed += 1
	checks["jump_twenty_sequential_actual_physics_cycles"] = completed == 20
	checks["jump_completed_cycles"] = completed
	checks["jump_rejects_repeated_airborne_space"] = no_double
	checks["jump_continuous_interpolated_height_no_underfloor_or_steps"] = smooth
	checks["jump_twenty_grounded_landings_no_hang_or_bounce"] = landings
	checks["jump_runtime_visits_all_physics_states"] = all_states.has_all(["jump_start","airborne","fall","land","ground"])
	return checks

static func world_pipeline(main: Node, tree: SceneTree) -> Dictionary:
	var checks: Dictionary = {}
	var live: VarendorWorld = main.world
	var viewport: SubViewport = SubViewport.new()
	viewport.size = Vector2i(800,450)
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	tree.root.add_child(viewport)
	var probe: VarendorWorld = VarendorWorld.new()
	viewport.add_child(probe)
	probe.set_process(false)
	probe.set_physics_process(false)
	probe.combat_volume = 0
	probe.data = live.data
	probe.templates = live.templates.duplicate()
	probe.terrain = {"columns":1,"rows":1,"width":400.0,"depth":400.0,"heights":[0.0,0.0,0.0,0.0],"platforms":[]}
	probe.collision.setup([])
	probe.labels_layer = Control.new()
	probe.add_child(probe.labels_layer)
	probe.labels_layer.hide()
	probe.camera = Camera3D.new()
	probe.add_child(probe.camera)
	probe.camera.current = true
	probe.add_child(probe.camera_controller)
	probe.camera_controller.setup(probe.camera,probe.collision,func(_x: float,_z: float) -> float: return 0)
	probe.target_ring = MeshInstance3D.new()
	probe.add_child(probe.target_ring)
	probe.arrival_marker = MeshInstance3D.new()
	probe.add_child(probe.arrival_marker)
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40,-35,0)
	probe.add_child(sun)
	var environment: WorldEnvironment = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("222b2d")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("d5dee3")
	env.ambient_light_energy = .8
	environment.environment = env
	probe.add_child(environment)
	# Neutral QA floor is confined to this offscreen scene, not an added map or
	# game asset. It makes foot contact and the fallback corpse pose inspectable.
	var floor_mesh: MeshInstance3D = MeshInstance3D.new()
	var floor_shape: PlaneMesh = PlaneMesh.new()
	floor_shape.size = Vector2(24,16)
	floor_mesh.mesh = floor_shape
	var floor_material: StandardMaterial3D = StandardMaterial3D.new()
	floor_material.albedo_color = Color("48534d")
	floor_material.roughness = 1
	floor_mesh.material_override = floor_material
	probe.add_child(floor_mesh)
	var snapshot: Dictionary = live.current_snapshot.duplicate(true)
	snapshot.time = 1000
	snapshot.character.id = "qa:core:ranger"
	snapshot.character.x = -5.0
	snapshot.character.z = 0.0
	snapshot.character.yaw = PI / 2
	snapshot.character.generation = 1
	snapshot.character.grounded = true
	snapshot.character.yOffset = 0.0
	snapshot.character.dead = false
	snapshot.character.action = "idle"
	snapshot.character.actionStartedAt = 1000
	snapshot.character.combatState = "idle"
	snapshot.character.target = null
	snapshot.character.attackRange = 13.0
	for id: String in probe.data.classes:
		if str(probe.data.classes[id].model) == "Ranger": snapshot.character.classId = id
	var fox_definition: String = ""
	for id: String in probe.data.monsters:
		if str(probe.data.monsters[id].model) == "Fox":
			fox_definition = id
			break
	checks["core_runtime_shipped_ranger_and_fox_available"] = not fox_definition.is_empty()
	if fox_definition.is_empty():
		viewport.queue_free()
		return checks
	snapshot.heroes = []
	snapshot.summons = []
	snapshot.events = []
	snapshot.monsters = [{"uid":"qa:core:fox","id":fox_definition,"generation":1,"x":3.0,"z":0.0,"yaw":-PI / 2,"hp":100,"alive":true,"grounded":true,"action":"idle","actionStartedAt":1000,"combatState":"idle","bodyRadius":.46}]
	probe.receive_snapshot(snapshot)
	probe._process(0)
	var fox: Node3D = probe.actors["qa:core:fox"]
	var ranger: Node3D = probe.actors["qa:core:ranger"]
	probe.camera.position = Vector3(3,4,11)
	probe.camera.look_at(Vector3(-1,1,0))
	await tree.process_frame
	var clicks: Array = []
	probe.picked.connect(func(id: String): clicks.append(id))
	var screen: Vector2 = probe.camera.unproject_position(fox.position + Vector3(0,.7,0))
	probe.click(screen)
	probe.targeting.reconcile(snapshot)
	checks["lmb_real_projection_selects_living_monster"] = clicks == ["qa:core:fox"] and probe.target_id == "qa:core:fox"
	checks["selected_target_exposes_entity_hp_range_and_combat_state"] = probe.targeting.current.has_all(["entity","hp","alive","distance","attackRange","combatState","name"])
	probe.collision.setup([{"kind":"box","x":3.0,"z":-4.0,"halfX":5.0,"halfZ":.4,"rotation":0.0,"bottom":0.0,"top":8.0}])
	checks["lmb_cannot_select_monster_through_wall"] = probe.pick_entity(screen).is_empty()
	probe.collision.setup([])
	var latest: Dictionary = snapshot.duplicate(true)
	latest.time = 1900
	latest.monsters[0].hp = 0
	latest.monsters[0].alive = false
	latest.monsters[0].action = "death"
	latest.monsters[0].deathAt = 1680
	latest.monsters[0].corpseUntil = 4380
	latest.events = [
		{"sequence":10,"kind":"attack","at":1100,"actor":"qa:core:ranger","target":"qa:core:fox","impactAt":1400,"endsAt":1800,"actorGeneration":1},
		{"sequence":11,"kind":"release","at":1400,"actor":"qa:core:ranger","target":"qa:core:fox","effect":"arrow","durationMs":280,"actorGeneration":1},
		{"sequence":12,"kind":"hit","at":1680,"actor":"qa:core:ranger","target":"qa:core:fox","amount":100,"targetHp":0,"targetMaxHp":100,"targetGeneration":1},
		{"sequence":13,"kind":"death","at":1680,"actor":"qa:core:fox","generation":1,"endsAt":4380},
		{"sequence":14,"kind":"loot","at":1680,"actor":"qa:core:ranger","gold":3,"xp":5,"items":[]},
	]
	var loot: Array = []
	probe.loot_received.connect(func(message: String): loot.append(message))
	probe.receive_snapshot(latest)
	var stages: Dictionary = {}
	var images: Array[Image] = []
	var graphical: bool = DisplayServer.get_name() != "headless"
	var no_early_damage: bool = true
	var no_early_loot: bool = true
	var projectile_moves: bool = false
	var last_projectile: Vector3 = Vector3.INF
	var smooth_attack_samples: int = 0
	var prior_phase: float = -1
	var stationary_corpse: bool = true
	var corpse_anchor: Vector3 = fox.position
	for frame: int in range(250):
		if float(probe.timeline.latest.time) - probe.timeline.clock_ms < 200:
			var following: Dictionary = latest.duplicate(true)
			following.time = float(probe.timeline.latest.time) + 100
			following.events = []
			probe.receive_snapshot(following)
		probe._process(1.0 / 60)
		var now: float = probe.timeline.clock_ms
		probe.camera.position = Vector3(3,4,11)
		probe.camera.look_at(Vector3(-1,1,0))
		var animation: VarendorAnimationController = ranger.get_meta("animation_controller")
		if now < 1680:
			no_early_damage = no_early_damage and not fox.get_meta("dead",false) and float(fox.get_meta("motion",{}).get("hp",0)) > 0
			no_early_loot = no_early_loot and loot.is_empty()
		if now >= 1120 and now < 1380:
			var phase: float = animation.player.current_animation_position
			if phase > prior_phase + .001: smooth_attack_samples += 1
			prior_phase = phase
		if now >= 1450 and now < 1650 and not probe.effects.is_empty():
			var effect: Dictionary = probe.effects[0]
			if effect.has("end"):
				projectile_moves = projectile_moves or (last_projectile.is_finite() and effect.node.position.distance_to(last_projectile) > .01)
				last_projectile = effect.node.position
		if now >= 1690 and not stages.has("impact"):
			checks["hp_zero_immediately_enters_dead_and_clears_target"] = fox.get_meta("dead",false) and not fox.get_meta("pickable",true) and probe.target_id.is_empty()
			checks["impact_has_actual_damage_feedback_and_loot"] = not probe.floaters.is_empty() and probe.floaters[0].node.text == "100" and not loot.is_empty()
			stages["impact"] = true
		if now > 1700 and now < 4380: stationary_corpse = stationary_corpse and fox.position.distance_to(corpse_anchor) < .001
		var capture_stage: String = "windup" if now >= 1260 and now < 1400 else "flight" if now >= 1510 and now < 1680 else "impact_visual" if now >= 1740 and now < 1900 else "corpse" if now >= 2200 and now < 2400 else ""
		if not capture_stage.is_empty() and not stages.has(capture_stage):
			stages[capture_stage] = true
			if graphical:
				await RenderingServer.frame_post_draw
				images.append(viewport.get_texture().get_image())
		if now >= 4390 and not stages.has("expired"):
			checks["corpse_visual_hidden_after_server_delay"] = not fox.visible and (fox.get_meta("animation_controller") as VarendorAnimationController).corpse_complete
			stages["expired"] = true
	checks["batched_snapshot_preserves_projectile_before_hp_and_death"] = no_early_damage and no_early_loot and projectile_moves
	checks["attack_pose_advances_between_network_snapshots"] = smooth_attack_samples >= 8
	checks["dead_monster_remains_stationary_and_not_pickable"] = stationary_corpse and probe.pick_entity(screen) != "qa:core:fox"
	checks["runtime_exercised_all_four_combat_stages"] = stages.has_all(["windup","flight","impact_visual","corpse"])
	checks["combat_runtime_four_frames_rendered"] = images.size() == 4 if graphical else "SKIPPED: headless has no rendered evidence"
	if graphical and images.size() == 4:
		var sheet: Image = Image.create(1600,900,false,Image.FORMAT_RGB8)
		for index: int in range(4):
			images[index].convert(Image.FORMAT_RGB8)
			sheet.blit_rect(images[index],Rect2i(0,0,800,450),Vector2i((index % 2) * 800,(index / 2) * 450))
		print("VARENDOR_CORE_JPG " + Marshalls.raw_to_base64(sheet.save_jpg_to_buffer(.87)))
		checks["combat_runtime_contact_sheet"] = "Actual Godot rendered poses: windup, projectile flight, impact/death start, corpse; fixture uses existing models."
	else:
		checks["combat_runtime_contact_sheet"] = "SKIPPED: headless renderer; no visual acceptance claimed"
	viewport.queue_free()
	await tree.process_frame
	return checks
