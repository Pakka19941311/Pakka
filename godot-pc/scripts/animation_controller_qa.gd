extends SceneTree

# Focused runtime regressions using the shipped imported rigs. Run:
# godot --headless --path godot-pc --script res://scripts/animation_controller_qa.gd
const Controller = preload("res://scripts/animation_controller.gd")
var checks: Dictionary = {}
var bodies: Array[Node3D] = []

func _initialize() -> void:
	call_deferred("run")

func fixture(model: String, height: float = 2.05) -> Controller:
	var body: Node3D = Node3D.new()
	root.add_child(body)
	bodies.append(body)
	var path: String = "res://generated/actors/" + model + (".gltf" if model in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk"] else ".glb")
	var scene: PackedScene = load(path)
	var visual: Node3D = scene.instantiate()
	body.add_child(visual)
	body.set_meta("visual", visual)
	body.set_meta("base_visual", visual.transform)
	body.set_meta("model", model)
	body.set_meta("pick_size", Vector3(height, height, height))
	var players: Array[Node] = visual.find_children("*", "AnimationPlayer", true, false)
	body.set_meta("player", players[0] if not players.is_empty() else null)
	var controller: Controller = Controller.new()
	controller.bind(body)
	return controller

func run() -> void:
	var ranger: Controller = fixture("Ranger")
	var other: Controller = fixture("Ranger")
	var draw: String = ranger.find_clip(["bow_draw"])
	checks["ranger_has_real_bow_draw_and_shoot"] = not draw.is_empty() and not ranger.find_clip(["bow_shoot"]).is_empty()
	checks["instances_own_animation_resources"] = ranger.player.get_animation(draw) != other.player.get_animation(draw)
	rangers(ranger, other)
	var warrior: Controller = fixture("Warrior")
	warrior.on_event({"kind":"attack", "at":1000, "impactAt":1400, "endsAt":1800}, 1000)
	warrior.update({"grounded":true, "action":"attack", "actionStartedAt":1000, "actionEndsAt":1800}, Vector3.ZERO, 1400, .016)
	var phase: float = warrior.player.current_animation_position / warrior.clip_length(warrior.current_clip)
	checks["melee_contact_matches_server_impact_clock"] = absf(phase - .5) < .001 and "sword_attack" in warrior.current_clip.to_lower()
	checks["animation_never_moves_authoritative_body"] = warrior.actor.position.is_zero_approx() and warrior.actor.rotation.is_zero_approx()
	var skeleton: Skeleton3D = warrior.visual.find_children("*", "Skeleton3D", true, false)[0]
	var impact_pose: Array[Quaternion] = []
	for index: int in range(skeleton.get_bone_count()):
		impact_pose.append(skeleton.get_bone_pose_rotation(index))
	warrior.update({"grounded":true, "combatState":"recovery", "action":"attack", "actionStartedAt":1000, "actionEndsAt":1800, "hitAt":1400}, Vector3.ZERO, 1700, .3)
	var changed_bones: int = 0
	for index: int in range(skeleton.get_bone_count()):
		if impact_pose[index].angle_to(skeleton.get_bone_pose_rotation(index)) > .001:
			changed_bones += 1
	checks["manual_timeline_really_advances_imported_bone_poses"] = changed_bones > 2
	checks["outgoing_contact_timestamp_is_not_incoming_hit_reaction"] = warrior.hit_until < 1700
	warrior.update({"grounded":true, "combatState":"idle", "action":"walk", "actionStartedAt":1701}, Vector3(3, 0, 0), 1701, .001)
	checks["manual_movement_cancels_animation_attack_lock"] = warrior.state == "run" and warrior.attack_ends_at < 0
	warrior.on_event({"kind":"attack", "at":1000, "impactAt":1400, "endsAt":1800}, 1702)
	warrior.update({"grounded":true, "combatState":"idle", "action":"attack", "actionStartedAt":1000, "actionEndsAt":1800}, Vector3.ZERO, 1702, .001)
	checks["cancelled_attack_cannot_restart_from_stale_event_or_snapshot"] = warrior.state == "idle" and warrior.attack_ends_at < 0
	warrior.on_event({"kind":"attack", "at":1900, "impactAt":2300, "endsAt":2700}, 1900)
	warrior.on_event({"kind":"cancel", "at":2100}, 2100)
	warrior.update({"grounded":true, "combatState":"windup", "action":"attack", "actionStartedAt":1900, "actionEndsAt":2700}, Vector3.ZERO, 2100, .016)
	checks["authoritative_cancel_event_stops_attack_before_next_snapshot"] = warrior.state == "idle" and warrior.attack_ends_at < 0
	var fox: Controller = fixture("Fox", 1.25)
	fox_fallback(fox)
	movement(warrior)
	jump_states(other)
	for model: String in ["Wizard", "Rogue", "Monk", "Skeleton", "Slime", "Dragon", "Bat"]:
		var actor: Controller = fixture(model)
		actor.on_event({"kind":"attack", "at":1000, "impactAt":1400, "endsAt":1800}, 1000)
		actor.update({"grounded":true}, Vector3.ZERO, 1300, .016)
		checks[model.to_lower() + "_attack_resolves_real_non_idle_clip"] = not actor.current_clip.is_empty() and not "idle" in actor.current_clip.to_lower()
		actor.on_event({"kind":"death", "at":1900, "corpseUntil":4900}, 1900)
		actor.update({"alive":false, "hp":0}, Vector3.ZERO, 2300, .4)
		checks[model.to_lower() + "_death_resolves_real_clip"] = "death" in actor.current_clip.to_lower() and actor.state == "death"
	var failed: Array = []
	for key: String in checks:
		if checks[key] != true:
			failed.append(key)
	print("VARENDOR_ANIMATION_QA " + JSON.stringify({"checks":checks, "failed":failed, "runtime":DisplayServer.get_name()}))
	for body: Node3D in bodies:
		body.queue_free()
	await process_frame
	quit(0 if failed.is_empty() else 1)

func rangers(ranger: Controller, other: Controller) -> void:
	var motion: Dictionary = {"grounded":true, "action":"attack", "actionStartedAt":1000, "actionEndsAt":1800}
	ranger.on_event({"kind":"attack", "at":1000, "impactAt":1300, "endsAt":1800}, 1000)
	ranger.update(motion, Vector3.ZERO, 1150, .016)
	checks["ranger_windup_uses_bow_draw_not_idle"] = "bow_draw" in ranger.current_clip.to_lower() and ranger.state == "attack"
	var start_count: int = ranger.starts
	ranger.update(motion, Vector3.ZERO, 1250, .1)
	checks["repeated_snapshot_does_not_restart_attack"] = ranger.starts == start_count and ranger.attack_started_at == 1000
	ranger.on_event({"kind":"release", "at":1300}, 1300)
	ranger.update(motion, Vector3.ZERO, 1300, .016)
	checks["ranger_release_uses_shoot_at_contact_pose"] = "bow_shoot" in ranger.current_clip.to_lower() and absf(ranger.player.current_animation_position / ranger.clip_length(ranger.current_clip) - .48) < .001
	start_count = ranger.starts
	ranger.on_event({"kind":"hit", "at":1320, "hitUntil":1500}, 1320)
	ranger.update(motion, Vector3.ZERO, 1400, .08)
	checks["hit_does_not_restart_or_cancel_active_attack"] = ranger.state == "attack" and ranger.starts == start_count and "bow_shoot" in ranger.current_clip.to_lower()
	ranger.update(motion, Vector3.ZERO, 1801, .016)
	checks["attack_completes_even_when_snapshot_action_is_stale"] = ranger.state == "idle"
	var idle: String = ranger.find_clip(["idle_weapon", "idle", "survey", "flying"])
	other.update({"grounded":false, "verticalVelocity":8.2}, Vector3.ZERO, 1900, .016)
	checks["one_shot_fallback_does_not_mutate_other_actor_idle_loop"] = ranger.player.get_animation(idle).loop_mode == Animation.LOOP_LINEAR and other.player.get_animation(idle).loop_mode == Animation.LOOP_NONE

func fox_fallback(fox: Controller) -> void:
	checks["fox_missing_attack_and_death_clips_are_detected"] = fox.find_clip(["attack", "death"]).is_empty()
	fox.on_event({"kind":"attack", "at":1000, "impactAt":1400, "endsAt":1800}, 1000)
	fox.update({"grounded":true}, Vector3.ZERO, 1200, .016)
	var windup_offset: float = fox.visual.position.z
	fox.update({"grounded":true}, Vector3.ZERO, 1400, .2)
	var impact_offset: float = fox.visual.position.z
	fox.update({"grounded":true}, Vector3.ZERO, 1600, .2)
	checks["fox_lunge_peaks_at_authoritative_impact"] = impact_offset > windup_offset and impact_offset > fox.visual.position.z and absf(impact_offset - fox.height * .13) < .001
	fox.on_event({"kind":"death", "at":1700, "corpseUntil":4700}, 1700)
	checks["death_immediately_cancels_attack_state"] = fox.state == "death" and fox.attack_ends_at == -1
	fox.update({"hp":0, "alive":false}, Vector3(10, 0, 0), 2150, .45)
	var angle: float = fox.visual.basis.y.normalized().angle_to(fox.base_visual.basis.y.normalized())
	checks["fox_fallback_falls_continuously_to_corpse"] = angle > 1.4 and fox.visual.visible and fox.actor.position.is_zero_approx()
	fox.on_event({"kind":"attack", "at":2200, "impactAt":2500, "endsAt":2900}, 2200)
	fox.update({"hp":0, "alive":false}, Vector3.ZERO, 3000, .1)
	checks["dead_actor_ignores_late_attack_event"] = fox.state == "death" and fox.attack_ends_at == -1
	fox.update({"hp":0, "alive":false}, Vector3.ZERO, 4699, .016)
	checks["corpse_remains_until_authoritative_expiry"] = fox.visual.visible and not fox.corpse_complete
	fox.update({"hp":0, "alive":false}, Vector3.ZERO, 4700, .001)
	checks["corpse_hidden_at_authoritative_expiry"] = not fox.visual.visible and fox.corpse_complete
	fox.reset_alive()
	fox.update({"grounded":true, "hp":100, "alive":true}, Vector3.ZERO, 5000, .016)
	checks["respawn_restores_pose_and_clears_death"] = fox.death_at < 0 and fox.visual.visible and fox.visual.transform.is_equal_approx(fox.base_visual)

func movement(actor: Controller) -> void:
	actor.reset_alive()
	actor.update({"action":"walk", "grounded":true}, Vector3.ZERO, 2000, .016)
	checks["blocked_body_does_not_run_from_stale_walk_action"] = actor.state == "idle"
	actor.update({"action":"idle", "grounded":true}, Vector3(6.2, 0, 0), 2016, .016)
	checks["actual_movement_drives_running_despite_stale_idle_action"] = actor.state == "run" and "run" in actor.current_clip.to_lower()
	checks["gait_rate_matches_shipped_rig_and_real_speed"] = absf(actor.playback_rate - 6.2 / 3.297988) < .001
	var slow: Controller = fixture("Warrior")
	var fast: Controller = fixture("Warrior")
	for frame: int in range(30):
		slow.update({"grounded":true}, Vector3(3, 0, 0), float(frame) * 1000 / 30, 1.0 / 30)
	for frame: int in range(144):
		fast.update({"grounded":true}, Vector3(3, 0, 0), float(frame) * 1000 / 144, 1.0 / 144)
	checks["distance_driven_gait_independent_of_render_fps"] = absf(slow.gait_phase - fast.gait_phase) < .0001

func jump_states(actor: Controller) -> void:
	actor.reset_alive()
	var visited: Array[String] = []
	for step: Dictionary in [
		{"time":1000, "grounded":true, "verticalVelocity":0},
		{"time":1016, "grounded":false, "verticalVelocity":8.2},
		{"time":1200, "grounded":false, "verticalVelocity":4},
		{"time":1500, "grounded":false, "verticalVelocity":-3},
		{"time":1800, "grounded":true, "verticalVelocity":0},
		{"time":2000, "grounded":true, "verticalVelocity":0},
	]:
		actor.update(step, Vector3.ZERO, float(step.time), .016)
		visited.append(actor.state)
	checks["jump_fall_land_state_sequence"] = visited == ["idle", "jump_start", "airborne", "fall", "land", "idle"]
	checks["jump_animation_does_not_apply_body_vertical_motion"] = actor.actor.position.is_zero_approx()
