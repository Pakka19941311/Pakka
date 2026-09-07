extends SceneTree

static func fixture() -> VarendorPlayerMovement:
	var motor: VarendorPlayerMovement = VarendorPlayerMovement.new()
	motor.collision = VarendorCollision.new()
	motor.reconcile({"time":1000,"character":{"id":"qa","generation":1,"x":0,"z":0,"yOffset":0,"yaw":0,"grounded":true,"dead":false,"lastInputSequence":0,"stats":{"speed":6.2}}})
	return motor

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var distances: Array[float] = []
	for hz: int in [20,60,144]:
		var motor: VarendorPlayerMovement = fixture()
		motor.submit({"type":"direction","x":1,"z":0})
		for i: int in range(hz*2): motor.physics_step(1.0/hz)
		distances.append(motor.position_value.x)
	checks["movement_analytic_partition_independent"] = distances.max()-distances.min() < .0001
	var straight: VarendorPlayerMovement = fixture()
	var diagonal: VarendorPlayerMovement = fixture()
	straight.submit({"type":"direction","x":1,"z":0})
	diagonal.submit({"type":"direction","x":1,"z":1})
	for i: int in range(120):
		straight.physics_step(1.0/60)
		diagonal.physics_step(1.0/60)
	checks["diagonal_speed_normalized"] = absf(straight.position_value.length()-diagonal.position_value.length()) < .001
	straight.submit({"type":"direction","x":0,"z":0})
	var stopped: Vector2 = straight.position_value
	for i: int in range(20): straight.physics_step(1.0/60)
	checks["manual_release_stops_without_slide"] = straight.position_value.distance_to(stopped) < .00001
	var jump: VarendorPlayerMovement = fixture()
	jump.submit({"type":"destination","x":5,"z":0})
	jump.request_jump()
	jump.physics_step(.1)
	var y_before: float = jump.height
	var v_before: float = jump.vertical_velocity
	jump.submit({"type":"cancel"})
	checks["cancel_preserves_vertical_physics"] = jump.height == y_before and jump.vertical_velocity == v_before and not jump.grounded
	checks["jump_cancels_auto_path"] = jump.navigation_path.is_empty() and jump.input_mode == "idle"
	checks["air_jump_rejected"] = not jump.request_jump()
	var clicked: VarendorPlayerMovement = fixture()
	clicked.submit({"type":"destination","x":2,"z":0})
	for i: int in range(150): clicked.physics_step(1.0/60)
	checks["click_path_arrives_without_overshoot"] = clicked.position_value.x <= 2.0001 and clicked.position_value.x > 1.85 and clicked.actual_velocity.length() < .01
	clicked.submit({"type":"destination","x":5,"z":0})
	clicked.submit({"type":"direction","x":0,"z":1})
	checks["manual_overrides_click_in_same_input_turn"] = clicked.input_mode == "manual" and clicked.navigation_path.is_empty() and clicked.destination == null
	var predicted: VarendorPlayerMovement = fixture()
	predicted.submit({"type":"direction","x":1,"z":0})
	predicted.sent({"type":"direction"},1)
	for i: int in range(1,121):
		predicted.physics_step(1.0/60)
		if i%6==0:
			var t: float = float(i)/60
			var x: float = 6.2*(t-(1-exp(-19*t))/19)
			predicted.reconcile({"time":1000+t*1000,"character":{"id":"qa","generation":1,"x":x,"z":0,"yOffset":0,"yaw":PI/2,"grounded":true,"dead":false,"lastInputSequence":1,"stats":{"speed":6.2}}})
	checks["snapshot_does_not_apply_movement_twice"] = absf(predicted.position_value.x-distances[1]) < .015
	var sweep: Vector2 = VarendorActorSpacing.slide(Vector2(-3,0),Vector2(6,0),Vector2.ZERO,1)
	checks["body_sweep_cannot_cross_target_center"] = (Vector2(-3,0)+sweep).x <= -1
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	print("VARENDOR_MOVEMENT_QA "+JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return value) else 2)
