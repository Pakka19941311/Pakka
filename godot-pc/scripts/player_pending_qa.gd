extends SceneTree

static func snapshot(time: float, position: Vector2, sequence: int) -> Dictionary:
	return {"time":time,"character":{"id":"pending-player","generation":1,"x":position.x,"z":position.y,"yOffset":0.0,"yaw":0.0,"grounded":true,"dead":false,"lastInputSequence":sequence,"stats":{"speed":6.2},"destination":null,"target":null},"monsters":[],"heroes":[]}

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var movement: VarendorPlayerMovement = VarendorPlayerMovement.new()
	movement.collision = VarendorCollision.new()
	movement.reconcile(snapshot(1000, Vector2.ZERO, 0))
	movement.sent({"type":"direction"}, 1)
	movement.submit({"type":"direction","x":0,"z":1})
	for tick: int in range(18): movement.physics_step(1.0 / 60)
	movement.sent({"type":"destination"}, 2)
	movement.submit({"type":"destination","x":5,"z":movement.position_value.y})
	for tick: int in range(3): movement.physics_step(1.0 / 60)
	var predicted: Vector2 = movement.position_value
	var prior: Dictionary = snapshot(movement.clock_ms, Vector2(0, predicted.y), 1)
	prior.character.direction = {"x":0,"z":1}
	movement.reconcile(prior)
	checks["pending_click_old_ack_cannot_rewind_physics"] = movement.position_value.distance_to(predicted) < .00001 and movement.input_mode == "destination"
	checks["pending_click_old_ack_cannot_inject_render_correction"] = movement.visual_correction.length() < .00001
	var accepted_position: Vector2 = predicted - Vector2(.05, 0)
	var accepted: Dictionary = snapshot(movement.clock_ms, accepted_position, 2)
	accepted.character.destination = {"x":5,"z":predicted.y}
	movement.reconcile(accepted)
	checks["pending_click_current_ack_applies_real_correction"] = movement.position_value.distance_to(accepted_position) < .00001
	var correction: Vector2 = movement.visual_correction
	movement.reconcile(accepted)
	checks["pending_click_duplicate_ack_does_not_repeat_correction"] = movement.position_value.distance_to(accepted_position) < .00001 and movement.visual_correction.distance_to(correction) < .00001
	movement.sent({"type":"direction"}, 3)
	movement.submit({"type":"direction","x":1,"z":0})
	var dead: Dictionary = snapshot(movement.clock_ms, accepted_position, 2)
	dead.character.dead = true
	movement.reconcile(dead)
	checks["pending_input_does_not_delay_authoritative_death"] = movement.input_mode == "idle" and movement.velocity.is_zero_approx() and movement.grounded and movement.height == 0
	var respawn: Dictionary = snapshot(movement.clock_ms + 100, Vector2(10, 10), 2)
	respawn.character.generation = 2
	checks["pending_input_does_not_delay_generation_reset"] = movement.reconcile(respawn) and movement.position_value == Vector2(10, 10) and movement.visual_correction.is_zero_approx()
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	print("VARENDOR_PLAYER_PENDING_QA " + JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return value) else 2)
