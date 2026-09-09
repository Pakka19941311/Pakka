extends SceneTree

# Focused check of the integrated presentation controller and real knight GLB.
# No game services, combat calculations, input or camera state are changed.
const Controller = preload("res://scripts/animation_controller.gd")
var checks: Dictionary = {}
var measurements: Dictionary = {}
var bodies: Array[Node3D] = []
var asset_path := "res://assets/knight/Knight_Modular.glb"

func _initialize() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--asset="):
			asset_path = arg.trim_prefix("--asset=")
	call_deferred("run")

func fixture() -> Controller:
	var body := Node3D.new()
	root.add_child(body)
	bodies.append(body)
	var scene: PackedScene = load(asset_path)
	var visual: Node3D = scene.instantiate()
	body.add_child(visual)
	body.set_meta("visual", visual)
	body.set_meta("model", "ForgottenKnight")
	body.set_meta("base_visual", visual.transform)
	body.set_meta("pick_size", Vector3.ONE * 1.84)
	body.set_meta("player", visual.find_children("*", "AnimationPlayer", true, false)[0])
	body.set_meta("knight_weapon_equipped", false)
	body.set_meta("knight_autoattack_active", true)
	body.set_meta("knight_autoattack_target", "qa:dummy")
	var controller := Controller.new()
	controller.bind(body)
	controller.prefer_run = true
	return controller

func basic(controller: Controller, at: float, duration: float = 1000) -> Dictionary:
	var event := {"kind":"attack", "at":at, "impactAt":at+duration*.5, "endsAt":at+duration, "skill":null, "target":"qa:dummy"}
	controller.on_event(event, at)
	return event

func clip_name(controller: Controller) -> String:
	return controller.normalized_name(controller.current_clip)

func pose(controller: Controller) -> Array[Quaternion]:
	var result: Array[Quaternion] = []
	for index: int in controller.knight_rig.get_bone_count():
		result.append(controller.knight_rig.get_bone_pose_rotation(index))
	return result

func distance(left: Array[Quaternion], right: Array[Quaternion]) -> float:
	var result := 0.0
	for index: int in left.size():
		result = maxf(result, left[index].angle_to(right[index]))
	return result

func run() -> void:
	var actor := fixture()
	checks["real_knight_has_56_bones_and_29_clips"] = actor.knight_rig.get_bone_count() == 56 and actor.clips.size() == 29
	actor.update({"grounded":true}, Vector3.ZERO, 0, .016)
	checks["starter_uses_unarmed_idle"] = clip_name(actor) == "idle"
	actor.update({"grounded":true}, Vector3(3.35, 0, 0), 100, .1)
	checks["starter_uses_real_run"] = clip_name(actor) == "run" and actor.state == "run"
	actor.actor.set_meta("knight_weapon_equipped", true)
	actor.update({"grounded":true}, Vector3(3.35, 0, 0), 200, .1)
	checks["equipped_uses_accepted_weapon_run"] = clip_name(actor) == "run_weapon"
	actor.update({"grounded":true}, Vector3.ZERO, 216, .016)
	checks["stopping_body_immediately_selects_idle"] = actor.state == "idle" and clip_name(actor) == "idle_weapon"
	var planar_root := Vector2(actor.knight_rig.get_bone_pose_position(actor.knight_hips).x, actor.knight_rig.get_bone_pose_position(actor.knight_hips).z)
	var root_drift := 0.0
	for frame: int in 120:
		actor.update({"grounded":true}, Vector3.ZERO, 216+frame*1000.0/60, 1.0/60)
		var p := actor.knight_rig.get_bone_pose_position(actor.knight_hips)
		root_drift = maxf(root_drift, planar_root.distance_to(Vector2(p.x,p.z)))
	measurements["idle_planar_root_drift_m"] = root_drift
	checks["idle_hips_do_not_reintroduce_stop_slide"] = root_drift < .000001
	checks["animation_does_not_move_gameplay_root"] = actor.actor.transform == Transform3D.IDENTITY

	# The new run's cadence is derived from planted feet, not the old model.
	var feet: Array[int] = []
	for index: int in actor.knight_rig.get_bone_count():
		if str(actor.knight_rig.get_bone_name(index)).ends_with("ToeBase"):
			feet.append(index)
	var previous: Array[Vector3] = []
	var stance_distance := 0.0
	var stance_time := 0.0
	var run_clip: String = actor.find_clip(["run"])
	var sample_dt: float = actor.clip_length(run_clip) / 28
	for frame: int in 29:
		actor.sample(run_clip, frame/28.0, false, 1)
		actor.knight_rig.force_update_all_bone_transforms()
		var positions: Array[Vector3] = []
		for foot: int in feet:
			positions.append(actor.knight_rig.get_bone_global_pose(foot).origin)
		if not previous.is_empty():
			for foot: int in feet.size():
				if positions[foot].y < .12 and previous[foot].y < .12:
					stance_distance += absf(positions[foot].z-previous[foot].z)
					stance_time += sample_dt
		previous = positions
	var stance_speed: float = stance_distance / maxf(.0001, stance_time)
	measurements["authored_run_planted_toe_speed_mps"] = stance_speed
	checks["run_cadence_matches_actual_planted_feet"] = stance_time > .1 and absf(stance_speed-float(Controller.GAITS.ForgottenKnight.run)) < .1

	actor.reset_alive()
	var sequence: Array[String] = []
	var duplicates_ok := true
	for index: int in 6:
		var at: float = 3000+index*1100
		var event := basic(actor, at)
		actor.update({"grounded":true}, Vector3.ZERO, at+500, .016)
		sequence.append(clip_name(actor))
		var next: int = actor.knight_next_combo
		actor.on_event(event, at+500)
		actor.update({"grounded":true,"action":"attack","actionStartedAt":at,"actionEndsAt":at+1000}, Vector3.ZERO, at+500, .016)
		duplicates_ok = duplicates_ok and next == actor.knight_next_combo
		actor.update({"grounded":true,"autoAttack":true}, Vector3.ZERO, at+1030, .016)
		checks["combo_gap_holds_authored_boundary_%d" % index] = actor.state == "combo_hold" and actor.player.current_animation_position > .99
	measurements["authorized_basic_attack_clips"] = sequence
	checks["one_authorized_attack_one_clip_five_step_wrap"] = sequence == ["combo_01","combo_02","combo_03","combo_04","combo_05","combo_01"]
	checks["duplicate_events_and_snapshots_never_advance_combo"] = duplicates_ok
	actor.actor.set_meta("knight_autoattack_active", false)
	basic(actor, 10000)
	actor.update({"grounded":true}, Vector3.ZERO, 10500, .016)
	checks["single_click_has_one_strike"] = clip_name(actor) == "combo_01"
	actor.update({"grounded":true}, Vector3.ZERO, 11100, .016)
	checks["single_strike_returns_idle_without_scheduling_next"] = actor.state == "idle"

	actor.reset_alive()
	actor.actor.set_meta("knight_autoattack_active", true)
	actor.actor.remove_meta("knight_autoattack_target")
	actor.begin_attack(11500,12000,12500)
	actor.on_event({"kind":"attack","at":11500,"impactAt":12000,"endsAt":12500,"skill":null,"target":"late:target"},11500)
	checks["late_event_recovers_real_target_without_second_combo_step"] = actor.knight_combo_target == "late:target" and actor.knight_next_combo == 1

	actor.reset_alive()
	var phases: Array[float] = []
	for fps: int in [30,60,120]:
		actor.reset_alive()
		basic(actor, 12000, 800)
		for frame: int in int(fps*.4):
			actor.update({"grounded":true}, Vector3.ZERO, 12000+frame*1000.0/fps, 1.0/fps)
		actor.update({"grounded":true}, Vector3.ZERO, 12400, 1.0/fps)
		phases.append(actor.player.current_animation_position / actor.clip_length(actor.current_clip))
	checks["server_impact_is_contact_at_30_60_120fps"] = absf(phases[0]-.5)<.000001 and absf(phases[1]-.5)<.000001 and absf(phases[2]-.5)<.000001
	measurements["impact_phases_30_60_120fps"] = phases
	actor.update({"grounded":true}, Vector3.ZERO, 12600, .2)
	var bones_a := pose(actor)
	actor.update({"grounded":true}, Vector3.ZERO, 12750, .15)
	checks["real_combo_bones_move"] = distance(bones_a, pose(actor)) > .1
	actor.on_event({"kind":"cancel","at":12760},12760)
	actor.update({"grounded":true},Vector3(3.35,0,0),12760,.01)
	checks["manual_cancel_resumes_run_immediately"] = actor.state == "run"

	actor.reset_alive()
	actor.update({"grounded":true,"action":"attack","combatState":"windup","actionStartedAt":13000,"actionEndsAt":13180,"hitAt":13001,"animationSkill":3},Vector3.ZERO,13020,.016)
	checks["predicted_motion_skill_context_uses_magic_without_basic_step"] = actor.knight_skill == 3 and clip_name(actor) == "cast_release" and actor.knight_next_combo == 0

	actor.reset_alive()
	actor.begin_attack(14000, 14001, 14180)
	actor.on_event({"kind":"attack","at":14000,"impactAt":14000,"endsAt":14180,"skill":2},14000)
	actor.update({"grounded":true},Vector3.ZERO,14020,.016)
	checks["late_skill_event_corrects_snapshot_without_consuming_combo"] = actor.knight_skill == 2 and actor.knight_next_combo == 0 and clip_name(actor) == "sword_attack"
	var martial: Array[String] = []
	for index: int in 3:
		actor.begin_attack(15000+index*1000,15001+index*1000,15180+index*1000,{"skill":index})
		actor.update({"grounded":true},Vector3.ZERO,15020+index*1000,.016)
		martial.append(clip_name(actor))
	checks["martial_skills_are_not_magic_casts"] = martial == ["sword_attack_heavy","block","sword_attack"]
	actor.on_event({"kind":"buff","at":18000,"skill":3},18000)
	actor.update({"grounded":true},Vector3.ZERO,18001,.001)
	checks["guard_magic_releases_immediately"] = clip_name(actor) == "cast_release" and actor.knight_skill == 3
	actor.update({"grounded":true},Vector3.ZERO,18160,.159)
	checks["guard_magic_has_exit_pose"] = clip_name(actor) == "cast_exit"
	checks["skills_never_advance_basic_combo"] = actor.knight_next_combo == 0

	actor.reset_alive()
	actor.update({"grounded":false,"verticalVelocity":8.2},Vector3.ZERO,19000,.016)
	checks["jump_uses_real_start_clip"] = clip_name(actor) == "jump_start"
	actor.update({"grounded":false,"verticalVelocity":-2.0},Vector3.ZERO,19300,.3)
	checks["airborne_uses_real_air_clip"] = clip_name(actor) == "jump_air"
	actor.update({"grounded":true},Vector3.ZERO,19500,.2)
	checks["stationary_landing_uses_real_land_clip"] = clip_name(actor) == "jump_land"
	actor.update({"grounded":true},Vector3.ZERO,19700,.2)
	actor.on_event({"kind":"hit","at":19700},19700)
	actor.update({"grounded":true},Vector3.ZERO,19790,.09)
	checks["idle_damage_uses_real_hit_clip"] = clip_name(actor) == "hit"
	actor.begin_death(20000,23000)
	actor.update({"dead":true},Vector3.ZERO,20650,.65)
	checks["existing_death_fall_fallback_is_retained"] = actor.state == "death" and actor.pose_rotation.z > 1.4 and actor.actor.transform == Transform3D.IDENTITY

	var failed: Array[String] = []
	for key: String in checks:
		if not checks[key]:
			failed.append(key)
	print("VARENDOR_KNIGHT_ANIMATION_QA " + JSON.stringify({"checks":checks,"failed":failed,"measurements":measurements,"runtime":DisplayServer.get_name()}))
	for body: Node3D in bodies:
		body.queue_free()
	await process_frame
	quit(0 if failed.is_empty() else 1)
