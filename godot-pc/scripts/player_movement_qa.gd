extends SceneTree

static func fixture(speed: float = 6.2) -> VarendorPlayerMovement:
	var motor: VarendorPlayerMovement = VarendorPlayerMovement.new()
	motor.collision = VarendorCollision.new()
	motor.reconcile({"time":1000,"character":{"id":"qa","generation":1,"x":0,"z":0,"yOffset":0,"yaw":0,"grounded":true,"dead":false,"lastInputSequence":0,"stats":{"speed":speed}}})
	return motor

static func run() -> Dictionary:
	var checks: Dictionary = {}
	checks.merge(preload("res://scripts/reference_movement_qa.gd").run())
	var golden: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-control-traces.json"))
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
	var release_stationary: bool = straight.velocity.is_zero_approx() and straight.actual_velocity.is_zero_approx()
	for i: int in range(120):
		straight.physics_step(1.0/60)
		release_stationary = release_stationary and straight.position_value == stopped and straight.actual_velocity.is_zero_approx()
	var reference_rows: Array = golden.movement.traces[0].rows
	checks["manual_release_has_zero_travel_from_input_boundary_through_two_seconds"] = release_stationary
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
	for i: int in range(5): clicked.physics_step(1.0/60)
	clicked.submit({"type":"direction","x":0,"z":0})
	clicked.physics_step(1.0/60)
	checks["neutral_keyboard_heartbeat_preserves_active_click_path"] = clicked.input_mode == "destination" and clicked.destination != null and clicked.actual_velocity.length() > .1
	for i: int in range(150): clicked.physics_step(1.0/60)
	checks["click_path_settles_inside_reference_arrival_radius"] = clicked.position_value.distance_to(Vector2(2,0)) < .18 and clicked.actual_velocity.length() < .01
	clicked.submit({"type":"destination","x":5,"z":0})
	clicked.submit({"type":"direction","x":0,"z":1})
	checks["manual_overrides_click_in_same_input_turn"] = clicked.input_mode == "manual" and clicked.navigation_path.is_empty() and clicked.destination == null
	var predicted: VarendorPlayerMovement = fixture(float(golden.classes[0].speed))
	predicted.submit({"type":"direction","x":0,"z":1})
	predicted.sent({"type":"direction"},1)
	for i: int in range(1,61):
		predicted.physics_step(1.0/60)
		if i%6==0:
			var t: float = float(i)/60
			var z: float = float(reference_rows[i-1][2])
			predicted.reconcile({"time":1000+t*1000,"character":{"id":"qa","generation":1,"x":0,"z":z,"yOffset":0,"yaw":0,"grounded":true,"dead":false,"lastInputSequence":1,"stats":{"speed":golden.classes[0].speed}}})
	checks["snapshot_does_not_apply_movement_twice"] = absf(predicted.position_value.y-float(reference_rows[59][2])) < .0001
	var sweep: Vector2 = VarendorActorSpacing.slide(Vector2(-3,0),Vector2(6,0),Vector2.ZERO,1)
	checks["body_sweep_cannot_cross_target_center"] = (Vector2(-3,0)+sweep).x <= -1
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	print("VARENDOR_MOVEMENT_QA "+JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return not value is bool or value) else 2)
