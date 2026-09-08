extends SceneTree

const STEP: float = 1.0 / 60.0
const Pending = preload("res://scripts/player_pending_qa.gd")

static func fixture(stopped: bool = true) -> VarendorPlayerMovement:
	var value: VarendorPlayerMovement = VarendorPlayerMovement.new()
	value.collision = VarendorCollision.new()
	value.reconcile(Pending.snapshot(1000,Vector2.ZERO,0))
	if stopped:
		value.sent({"type":"direction"},1)
		value.submit({"type":"direction","x":0,"z":1})
		for tick: int in range(60): value.physics_step(STEP)
		value.sent({"type":"direction"},2)
		value.submit({"type":"direction","x":0,"z":0})
		value.physics_step(STEP)
	return value

static func shown(value: VarendorPlayerMovement) -> Vector2:
	var pose: Dictionary = value.render_pose(.5)
	return Vector2(pose.x,pose.z)

static func correction(value: VarendorPlayerMovement, offset: Vector2) -> Dictionary:
	var packet: Dictionary = Pending.snapshot(value.clock_ms,value.position_value+offset,value.last_sent_sequence)
	value.reconcile(packet)
	return packet

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var all_stationary: bool = true
	var physics_authoritative: bool = true
	var repeated_bounded: bool = true
	var maximum_offset: float = 0
	for direction: Vector2 in [Vector2.RIGHT,Vector2.DOWN,Vector2.LEFT,Vector2.UP,Vector2(1,1).normalized(),Vector2(-1,1).normalized(),Vector2(1,-1).normalized(),Vector2(-1,-1).normalized()]:
		var value: VarendorPlayerMovement = fixture()
		var anchor: Vector2 = shown(value)
		var old_physics: Vector2 = value.position_value
		var one_tick: Vector2 = direction * value.speed * STEP
		var packet: Dictionary = correction(value,one_tick)
		physics_authoritative = physics_authoritative and value.position_value.distance_to(old_physics+one_tick) < .00001 and value.history.back().position.distance_to(value.position_value) < .00001
		for tick: int in range(3600):
			value.physics_step(STEP)
			all_stationary = all_stationary and shown(value).distance_to(anchor) < .00001
			maximum_offset = maxf(maximum_offset,value.visual_correction.length())
			if tick % 30 == 0:
				packet.time = value.clock_ms
				value.reconcile(packet)
				repeated_bounded = repeated_bounded and value.visual_correction.length() <= value.rest_correction_budget()
	checks["stop_anchor_one_tick_in_eight_directions_keeps_feet_fixed_for_sixty_seconds"] = all_stationary
	checks["stop_anchor_updates_authoritative_physics_and_history_immediately"] = physics_authoritative
	checks["stop_anchor_duplicate_packets_cannot_accumulate_or_reset_budget"] = repeated_bounded
	checks["stop_anchor_maximum_held_offset_m"] = maximum_offset

	var growing: VarendorPlayerMovement = fixture()
	var growth_start: Vector2 = shown(growing)
	correction(growing,Vector2(.12,0))
	growing.physics_step(STEP)
	correction(growing,Vector2(.12,0))
	var escaped_budget: bool = not growing.rest_anchor_active and growing.correction_must_settle
	for tick: int in range(60): growing.physics_step(STEP)
	checks["stop_anchor_budget_is_total_and_larger_correction_fully_converges"] = escaped_budget and shown(growing).distance_to(growth_start) > .239 and growing.visual_correction.is_zero_approx()
	var turned: VarendorPlayerMovement = fixture()
	var turned_start: Vector2 = shown(turned)
	# Actual independent two-motor phase counterexample is recorded by
	# tests/player-stop-phase.test.mjs: forward .733 s -> strafe 1.237 s,
	# lattice offset 2/16 of one tick, with zero network latency.
	var measured_phase_error: Vector2 = Vector2(-.098166666662,.098166666662)
	correction(turned,measured_phase_error)
	for tick: int in range(60): turned.physics_step(STEP)
	checks["stop_anchor_measured_two_axis_phase_error_keeps_feet_fixed"] = measured_phase_error.length() > turned.speed*STEP and measured_phase_error.length() <= turned.rest_correction_budget() and shown(turned).distance_to(turned_start) < .00001
	var fast: VarendorPlayerMovement = fixture()
	fast.speed = 100
	checks["stop_anchor_policy_cannot_exceed_half_the_physical_body_radius"] = fast.rest_correction_budget() <= fast.radius*.5+.000011
	var large: VarendorPlayerMovement = fixture()
	var large_start: Vector2 = shown(large)
	correction(large,Vector2(.58,0))
	for tick: int in range(60): large.physics_step(STEP)
	checks["stop_anchor_does_not_hide_real_58cm_authoritative_correction"] = not large.rest_anchor_active and large.visual_correction.is_zero_approx() and absf(shown(large).x-large_start.x-.58) < .00001
	var spawn: VarendorPlayerMovement = fixture(false)
	correction(spawn,Vector2(.08,0))
	for tick: int in range(60): spawn.physics_step(STEP)
	checks["stop_anchor_arbitrary_spawn_idle_correction_is_not_classified_as_stop_noise"] = not spawn.rest_anchor_active and spawn.visual_correction.is_zero_approx() and absf(shown(spawn).x-.08) < .00001
	var running_error: VarendorPlayerMovement = fixture(false)
	running_error.submit({"type":"direction","x":0,"z":1})
	for tick: int in range(60): running_error.physics_step(STEP)
	correction(running_error,Vector2(.30,0))
	for tick: int in range(4): running_error.physics_step(STEP)
	running_error.submit({"type":"direction","x":0,"z":0})
	running_error.physics_step(STEP)
	var newly_stopped: Vector2 = shown(running_error)
	var holds_new_stop: bool = running_error.rest_anchor_active and running_error.visual_correction.length() <= running_error.rest_correction_budget()
	for tick: int in range(60):
		running_error.physics_step(STEP)
		holds_new_stop = holds_new_stop and shown(running_error).distance_to(newly_stopped) < .00001
	checks["stop_anchor_new_real_stop_can_hold_small_remainder_of_correction_applied_while_running"] = holds_new_stop

	var starts_forward: bool = true
	var consumes: bool = true
	for intent: String in ["manual","destination","combat"]:
		var moving: VarendorPlayerMovement = fixture()
		correction(moving,Vector2(.08,0))
		moving.physics_step(STEP)
		var previous: Vector2 = shown(moving)
		# Restart LEFT, opposed by the correction's rightward discharge. Its
		# contribution may never reverse the first physical movement step.
		if intent == "manual": moving.submit({"type":"direction","x":-1,"z":0})
		elif intent == "destination": moving.submit({"type":"destination","x":-8,"z":moving.position_value.y})
		else:
			moving.bodies = [{"uid":"stop:target","x":-10.0,"z":moving.position_value.y,"alive":true,"bodyRadius":.46}]
			moving.submit({"type":"attack","entityId":"stop:target"})
		for tick: int in range(60):
			moving.physics_step(STEP)
			var next: Vector2 = shown(moving)
			starts_forward = starts_forward and next.x <= previous.x + .00001
			previous = next
		consumes = consumes and moving.visual_correction.is_zero_approx()
	checks["stop_anchor_manual_click_and_combat_restart_never_step_backwards"] = starts_forward
	checks["stop_anchor_residual_is_consumed_during_real_planar_motion"] = consumes

	var blocked: VarendorPlayerMovement = fixture()
	correction(blocked,Vector2(.08,0))
	blocked.physics_step(STEP)
	# Place a wall at the authoritative body's exact right boundary. The held
	# visual feet are still in free space and must remain there while blocked.
	blocked.collision.setup([{"kind":"box","x":blocked.position_value.x+.96001,"z":blocked.position_value.y,"halfX":.5,"halfZ":5.0,"rotation":0.0}])
	var blocked_start: Vector2 = shown(blocked)
	blocked.submit({"type":"direction","x":1,"z":0})
	for tick: int in range(60): blocked.physics_step(STEP)
	checks["stop_anchor_held_direction_against_wall_cannot_discharge_stationary_feet"] = shown(blocked).distance_to(blocked_start) < .0001 and not blocked.collision.blocked(shown(blocked))

	var jumping: VarendorPlayerMovement = fixture()
	correction(jumping,Vector2(.08,0))
	jumping.physics_step(STEP)
	var jump_start: Vector2 = shown(jumping)
	jumping.request_jump()
	var stationary_jump: bool = true
	var peak: float = 0
	for tick: int in range(60):
		jumping.physics_step(STEP)
		peak = maxf(peak,jumping.height)
		stationary_jump = stationary_jump and shown(jumping).distance_to(jump_start) < .00001
	checks["stop_anchor_vertical_only_jump_keeps_xz_fixed_and_preserves_gravity"] = stationary_jump and peak > 1.4 and jumping.grounded and jumping.height == 0
	var death: Dictionary = Pending.snapshot(jumping.clock_ms,jumping.position_value,jumping.last_sent_sequence)
	death.character.dead = true
	jumping.reconcile(death)
	for tick: int in range(60): jumping.physics_step(STEP)
	checks["stop_anchor_death_clears_hold_and_converges_to_authoritative_pose"] = not jumping.rest_anchor_active and jumping.visual_correction.is_zero_approx()
	var reset: VarendorPlayerMovement = fixture()
	correction(reset,Vector2(.08,0))
	var teleport: Dictionary = Pending.snapshot(reset.clock_ms,Vector2(20,20),reset.last_sent_sequence)
	teleport.character.generation = 2
	reset.reconcile(teleport)
	reset.physics_step(STEP)
	checks["stop_anchor_generation_and_teleport_clear_all_presentation_residual"] = not reset.rest_anchor_active and not reset.rest_offset_releasing and not reset.correction_must_settle and reset.visual_correction.is_zero_approx() and shown(reset) == Vector2(20,20)
	var reconnect: VarendorPlayerMovement = fixture()
	correction(reconnect,Vector2(.08,0))
	reconnect.identity = ""
	reconnect.reconcile(Pending.snapshot(reconnect.clock_ms,reconnect.position_value,reconnect.last_sent_sequence))
	reconnect.physics_step(STEP)
	checks["stop_anchor_reconnect_discards_old_anchor_without_replaying_movement"] = not reconnect.rest_anchor_active and reconnect.visual_correction.is_zero_approx() and reconnect.actual_velocity.is_zero_approx()
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	print("VARENDOR_STOP_ANCHOR_QA "+JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return not value is bool or value) else 2)
