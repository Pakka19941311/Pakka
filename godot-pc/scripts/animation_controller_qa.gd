extends SceneTree

# Focused runtime regressions using the shipped imported rigs. Run:
# godot --headless --path godot-pc --script res://scripts/animation_controller_qa.gd
const Controller = preload("res://scripts/animation_controller.gd")
var checks: Dictionary = {}
var bodies: Array[Node3D] = []
var measurements: Dictionary = {}

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
	reference_parity(warrior, ranger, fox)
	reference_attack_traces()
	reference_blend()
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
	print("VARENDOR_ANIMATION_QA " + JSON.stringify({"checks":checks, "failed":failed, "measurements":measurements, "runtime":DisplayServer.get_name()}))
	for body: Node3D in bodies:
		body.queue_free()
	await process_frame
	quit(0 if failed.is_empty() else 1)

func rangers(ranger: Controller, other: Controller) -> void:
	var motion: Dictionary = {"grounded":true, "action":"attack", "actionStartedAt":1000, "actionEndsAt":1800}
	ranger.on_event({"kind":"attack", "at":1000, "impactAt":1300, "endsAt":1800}, 1000)
	ranger.update(motion, Vector3.ZERO, 1150, .016)
	checks["reference_ranger_windup_uses_same_bow_shoot_clip"] = "bow_shoot" in ranger.current_clip.to_lower() and ranger.state == "attack" and absf(ranger.player.current_animation_position / ranger.clip_length(ranger.current_clip) - .24) < .001
	var start_count: int = ranger.starts
	ranger.update(motion, Vector3.ZERO, 1250, .1)
	checks["repeated_snapshot_does_not_restart_attack"] = ranger.starts == start_count and ranger.attack_started_at == 1000
	ranger.on_event({"kind":"release", "at":1300}, 1300)
	ranger.update(motion, Vector3.ZERO, 1300, .016)
	checks["ranger_release_uses_shoot_at_contact_pose"] = "bow_shoot" in ranger.current_clip.to_lower() and absf(ranger.player.current_animation_position / ranger.clip_length(ranger.current_clip) - .48) < .001
	checks["reference_bow_release_does_not_switch_or_restart_clip"] = ranger.starts == start_count
	start_count = ranger.starts
	ranger.on_event({"kind":"hit", "at":1320, "hitUntil":1500}, 1320)
	ranger.update(motion, Vector3.ZERO, 1400, .08)
	checks["hit_does_not_restart_or_cancel_active_attack"] = ranger.state == "attack" and ranger.starts == start_count and "bow_shoot" in ranger.current_clip.to_lower()
	ranger.update(motion, Vector3.ZERO, 1801, .016)
	checks["attack_completes_even_when_snapshot_action_is_stale"] = ranger.state == "idle"
	var idle: String = ranger.find_clip(["idle_weapon", "idle", "survey", "flying"])
	other.update({"grounded":false, "verticalVelocity":8.2}, Vector3.ZERO, 1900, .016)
	var run_clip: String = other.find_clip(["run_holding"])
	checks["one_shot_jump_does_not_mutate_other_actor_idle_loop"] = ranger.player.get_animation(idle).loop_mode == Animation.LOOP_LINEAR and other.player.get_animation(run_clip).loop_mode == Animation.LOOP_NONE

func fox_fallback(fox: Controller) -> void:
	checks["fox_missing_attack_and_death_clips_are_detected"] = fox.find_clip(["attack", "death"]).is_empty()
	fox.on_event({"kind":"attack", "at":1000, "impactAt":1400, "endsAt":1800}, 1000)
	fox.update({"grounded":true}, Vector3.ZERO, 1200, .016)
	var windup_offset: float = fox.pose_offset.z
	fox.update({"grounded":true}, Vector3.ZERO, 1400, .2)
	var impact_offset: float = fox.pose_offset.z
	fox.update({"grounded":true}, Vector3.ZERO, 1600, .2)
	checks["reference_fox_fallback_lunge_matches_approved_curve"] = impact_offset > windup_offset and impact_offset > fox.pose_offset.z and absf(impact_offset - fox.height * .15) < .001
	fox.on_event({"kind":"death", "at":1700, "corpseUntil":4700}, 1700)
	checks["death_immediately_cancels_attack_state"] = fox.state == "death" and fox.attack_ends_at == -1
	fox.update({"hp":0, "alive":false}, Vector3(10, 0, 0), 2350, .65)
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

func reference_parity(warrior: Controller, ranger: Controller, fox: Controller) -> void:
	# Values below come from approved 1e94a0d1 actor-animation.ts and the actual
	# source glTF samplers. Exercise the imported Godot rigs, not mock clips.
	checks["reference_shipped_warrior_and_ranger_clip_lengths"] = absf(warrior.clip_length(warrior.find_clip(["sword_attack"])) - 20.0 / 24) < .00001 and absf(ranger.clip_length(ranger.find_clip(["bow_shoot"])) - 15.0 / 24) < .00001
	checks["reference_model_instance_prefix_normalization"] = Controller.normalized_name("town-resident-Warrior|example-Sword_Attack") == "sword_attack"
	warrior.reset_alive()
	warrior.prefer_run = true
	warrior.update({"grounded":true}, Vector3(.12, 0, 0), 6000, 1.0 / 60)
	checks["reference_local_player_uses_run_pose_during_acceleration"] = warrior.state == "run" and "run_weapon" in warrior.current_clip.to_lower()
	warrior.prefer_run = false
	warrior.reset_alive()
	var observed: Array[String] = []
	for speed: float in [1.70, 1.90, 1.70, 1.50]:
		warrior.update({"grounded":true}, Vector3(speed, 0, 0), 6100, .016)
		observed.append(warrior.state)
	checks["reference_npc_gait_hysteresis_avoids_threshold_flicker"] = observed == ["walk", "run", "run", "walk"]
	warrior.update({"grounded":false, "verticalVelocity":7}, Vector3(3, 0, 0), 6200, .016)
	var jump_clip: String = warrior.current_clip
	var jump_pose: Transform3D = warrior.visual.transform
	var phase_rising: float = warrior.player.current_animation_position / warrior.clip_length(jump_clip)
	warrior.update({"grounded":false, "verticalVelocity":-5}, Vector3(3, 0, 0), 6600, .4)
	checks["reference_jump_holds_run_frame_six_percent_rise_and_fall"] = "run_weapon" in jump_clip.to_lower() and warrior.current_clip == jump_clip and absf(phase_rising - .06) < .00001 and absf(warrior.player.current_animation_position / warrior.clip_length(jump_clip) - .06) < .00001
	checks["reference_jump_has_constant_lean_and_preserves_body"] = warrior.visual.transform.is_equal_approx(jump_pose) and absf(warrior.pose_rotation.x + .08) < .00001 and warrior.actor.position.is_zero_approx()
	warrior.update({"grounded":true}, Vector3(3, 0, 0), 6750, .016)
	checks["reference_landing_resumes_gait_without_added_squash_or_pause"] = "run_weapon" in warrior.current_clip.to_lower() and warrior.visual.transform.is_equal_approx(warrior.base_visual)
	warrior.reset_alive()
	warrior.update({"grounded":true}, Vector3.ZERO, 7000, .016)
	warrior.on_event({"kind":"hit", "at":7000}, 7000)
	warrior.update({"grounded":true}, Vector3.ZERO, 7090, .09)
	checks["reference_hit_reaction_is_pitch_not_roll"] = absf(warrior.pose_rotation.x - .07) < .00001 and is_zero_approx(warrior.pose_rotation.z)
	warrior.update({"grounded":true}, Vector3.ZERO, 7150, .06)
	checks["reference_idle_hit_clip_uses_three_tenths_second_duration"] = warrior.state == "hit" and absf(warrior.player.current_animation_position / warrior.clip_length(warrior.current_clip) - .5) < .00001
	fox.reset_alive()
	fox.begin_death(8000, 9070)
	fox.update({"hp":0}, Vector3.ZERO, 8030, .03)
	checks["reference_missing_death_rig_starts_visible_fall_immediately"] = fox.state == "death" and fox.pose_rotation.z > .005 and fox.actor.position.is_zero_approx()
	fox.update({"hp":0}, Vector3.ZERO, 8650, .62)
	var corpse: Transform3D = fox.visual.transform
	fox.update({"hp":0}, Vector3.ZERO, 9069, .419)
	checks["reference_corpse_holds_final_pose_without_added_sink"] = fox.visual.visible and fox.visual.transform.is_equal_approx(corpse) and absf(fox.pose_rotation.z - 1.48) < .00001
	fox.update({"hp":0}, Vector3.ZERO, 9070, .001)
	checks["reference_corpse_expires_after_point_four_two_plus_point_six_five"] = fox.corpse_complete and not fox.visual.visible

func reference_attack_traces() -> void:
	var golden: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-control-traces.json"))
	var models: Dictionary = {"knight":"Warrior", "mage":"Wizard", "assassin":"Rogue", "ranger":"Ranger", "necro":"Monk"}
	var maximum_phase_error: float = 0
	var sampled_frames: int = 0
	var mismatches: Array[String] = []
	for trace: Dictionary in golden.attacks:
		if not models.has(str(trace.class_id)):
			continue
		var controller: Controller = fixture(str(models[trace.class_id]))
		var impact: float = 1000 + float(trace.timings.windup) * 1000
		var finish: float = impact + float(trace.timings.recovery) * 1000
		controller.on_event({"kind":"attack", "at":1000, "impactAt":impact, "endsAt":finish}, 1000)
		for row: Dictionary in trace.rows:
			# Browser main clears the attack when its complete event is consumed;
			# the recorded final actor-only phase is not a visible main-loop frame.
			if "complete" in row.events:
				continue
			var now: float = 1000 + float(row.tick) * 1000 / 60
			controller.update({"grounded":true}, Vector3.ZERO, now, 1.0 / 60)
			var phase: float = controller.player.current_animation_position / controller.clip_length(controller.current_clip)
			maximum_phase_error = maxf(maximum_phase_error, absf(phase - float(row.phase)))
			sampled_frames += 1
			if not controller.current_clip.to_lower().ends_with(str(row.clip).to_lower()):
				mismatches.append(str(trace.class_id) + ":" + str(row.tick))
	measurements["browser_attack_trace_frames"] = sampled_frames
	measurements["browser_attack_trace_maximum_phase_error"] = maximum_phase_error
	measurements["browser_attack_trace_clip_mismatches"] = mismatches
	checks["reference_attack_clip_and_phase_match_executed_browser_traces"] = sampled_frames > 200 and maximum_phase_error < .00001 and mismatches.is_empty()

func bone_pose(controller: Controller) -> Array[Quaternion]:
	var rig: Skeleton3D = controller.visual.find_children("*", "Skeleton3D", true, false)[0]
	var pose: Array[Quaternion] = []
	for index: int in range(rig.get_bone_count()):
		pose.append(rig.get_bone_pose_rotation(index))
	return pose

func bone_distance(left: Array[Quaternion], right: Array[Quaternion]) -> float:
	var result: float = 0
	for index: int in range(left.size()):
		result += left[index].angle_to(right[index])
	return result

func reference_blend() -> void:
	var actor: Controller = fixture("Warrior")
	var target: Controller = fixture("Warrior")
	actor.sample(actor.find_clip(["idle_weapon"]), .3, true, 1)
	var idle_bones: Array[Quaternion] = bone_pose(actor)
	target.sample(target.find_clip(["sword_attack"]), .5, false, 1)
	var target_bones: Array[Quaternion] = bone_pose(target)
	var full_distance: float = bone_distance(idle_bones, target_bones)
	actor.sample(actor.find_clip(["sword_attack"]), .5, false, 0)
	var at_zero: float = bone_distance(idle_bones, bone_pose(actor))
	actor.sample(actor.find_clip(["sword_attack"]), .5, false, .016)
	var at_sixteen: float = bone_distance(idle_bones, bone_pose(actor))
	actor.sample(actor.find_clip(["sword_attack"]), .5, false, .064)
	var at_eighty: float = bone_distance(target_bones, bone_pose(actor))
	checks["reference_eighty_millisecond_blend_advances_real_bones_without_pose_snap"] = full_distance > 1 and at_zero < .01 and absf(at_sixteen / full_distance - .2) < .01 and at_eighty < .01
	measurements["actual_rig_blend_fraction_at_sixteen_ms"] = at_sixteen / full_distance
