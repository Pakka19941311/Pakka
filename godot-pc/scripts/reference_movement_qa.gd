extends SceneTree

# The golden rows were produced by executing the user-approved browser source,
# independently of this native controller. See scripts/reference-gameplay-contract.mjs.
const Movement = preload("res://scripts/player_movement.gd")
const STEP: float = 1.0 / 60
const POSITION_TOLERANCE: float = .0001 # Godot Vector2 uses float32.
const ANGLE_TOLERANCE: float = .0001

static func fixture(speed: float) -> Movement:
	var result: Movement = Movement.new()
	result.collision = VarendorCollision.new()
	result.collision.setup([])
	result.reconcile(snapshot(1000, speed))
	return result

static func snapshot(time: float, speed: float, position: Vector2 = Vector2.ZERO) -> Dictionary:
	return {"time":time,"character":{"id":"reference:movement","generation":1,"x":position.x,"z":position.y,"yOffset":0.0,"yaw":0.0,"grounded":true,"dead":false,"lastInputSequence":0,"stats":{"speed":speed},"destination":null,"target":null}}

static func run() -> Dictionary:
	var golden: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-control-traces.json"))
	var checks: Dictionary = {}
	var maximum_position_error: float = 0
	var maximum_height_error: float = 0
	var maximum_yaw_error: float = 0
	var compared_ticks: int = 0
	var compared_frames: int = 0
	for profile: Dictionary in golden.movement.class_traces:
		var speed: float = 0
		for definition: Dictionary in golden.classes:
			if definition.id == profile.class_id:
				speed = float(definition.speed)
		var positions_match: bool = true
		var heights_match: bool = true
		var states_match: bool = true
		var yaw_matches: bool = true
		var requests_match: bool = true
		for trace: Dictionary in profile.traces:
			var value: Movement = fixture(speed)
			var tick: int = 0
			for segment: Dictionary in trace.segments:
				value.submit({"type":"direction","x":segment.direction.x,"z":segment.direction.z})
				for local_tick: int in range(int(segment.ticks)):
					for request: Dictionary in trace.requests:
						# JSON numbers arrive as float; Array.has(int) is type-strict.
						if int(request.tick) == tick:
							requests_match = value.request_jump() == bool(request.accepted) and requests_match
					var before: Vector2 = value.position_value
					value.physics_step(STEP)
					var expected: Array = trace.rows[tick]
					var position_error: float = value.position_value.distance_to(Vector2(expected[1],expected[2]))
					var delta_error: float = (value.position_value-before).distance_to(Vector2(expected[4],expected[5]))
					var height_error: float = absf(value.height-float(expected[3]))
					var yaw_error: float = absf(angle_difference(value.yaw,float(expected[8])))
					maximum_position_error = maxf(maximum_position_error,maxf(position_error,delta_error))
					maximum_height_error = maxf(maximum_height_error,height_error)
					maximum_yaw_error = maxf(maximum_yaw_error,yaw_error)
					positions_match = positions_match and position_error < POSITION_TOLERANCE and delta_error < POSITION_TOLERANCE
					heights_match = heights_match and height_error < POSITION_TOLERANCE
					states_match = states_match and value.grounded == bool(expected[6])
					yaw_matches = yaw_matches and yaw_error < ANGLE_TOLERANCE
					tick += 1
					compared_ticks += 1
		checks["reference_"+str(profile.class_id)+"_native_position_and_displacement_every_tick"] = positions_match
		checks["reference_"+str(profile.class_id)+"_native_jump_height_and_grounded_every_tick"] = heights_match and states_match and requests_match
		checks["reference_"+str(profile.class_id)+"_native_facing_through_reversal_and_strafe"] = yaw_matches
	for profile: Dictionary in golden.render_fps.class_traces:
		var speed: float = 0
		for definition: Dictionary in golden.classes:
			if definition.id == profile.class_id:
				speed = float(definition.speed)
		var render_matches: bool = true
		for trace: Dictionary in profile.traces:
			var value: Movement = fixture(speed)
			value.submit({"type":"direction","x":1,"z":1})
			for row: Array in trace.rows:
				# Use the reference scheduler's recorded tick count and alpha. This
				# tests native presentation without inventing a second scheduler.
				for tick: int in range(int(row[1])):
					value.physics_step(STEP)
				var pose: Dictionary = value.render_pose(float(row[3]))
				var error: float = Vector2(pose.x,pose.z).distance_to(Vector2(row[4],row[5]))
				maximum_position_error = maxf(maximum_position_error,error)
				render_matches = render_matches and error < POSITION_TOLERANCE
				compared_frames += 1
			render_matches = render_matches and value.position_value.distance_to(Vector2(trace.authoritative_final[0],trace.authoritative_final[1])) < POSITION_TOLERANCE
		checks["reference_"+str(profile.class_id)+"_native_render_pose_matches_30_60_144_fps"] = render_matches
	var jumper: Movement = fixture(float(golden.classes[0].speed))
	var repeated_match: bool = true
	var jump_count: int = 0
	for expected: Dictionary in golden.movement.repeated_jumps:
		# The native authoritative ACK clears the previous request latch; it
		# does not move this grounded fixture or change the next impulse.
		jumper.reconcile(snapshot(jumper.clock_ms,jumper.speed))
		repeated_match = jumper.request_jump() and repeated_match
		var ticks: int = 0
		var peak: float = 0
		while not jumper.grounded and ticks < 90:
			var velocity_before: float = jumper.vertical_velocity
			repeated_match = not jumper.request_jump() and is_equal_approx(velocity_before,jumper.vertical_velocity) and repeated_match
			jumper.physics_step(STEP)
			peak = maxf(peak,jumper.height)
			ticks += 1
		repeated_match = repeated_match and ticks == int(expected.ticks) and absf(peak-float(expected.peak)) < POSITION_TOLERANCE and jumper.grounded and is_zero_approx(jumper.height)
		jump_count += 1
	checks["reference_twenty_native_jumps_match_44_tick_flight_and_peak"] = repeated_match and jump_count == 20
	checks["reference_native_movement_compared_physics_ticks"] = compared_ticks
	checks["reference_native_movement_compared_render_frames"] = compared_frames
	checks["reference_native_movement_maximum_position_error_meters"] = maximum_position_error
	checks["reference_native_movement_maximum_height_error_meters"] = maximum_height_error
	checks["reference_native_movement_maximum_yaw_error_radians"] = maximum_yaw_error
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	var failed: Array[String] = []
	for key: String in checks:
		if checks[key] is bool and not checks[key]:
			failed.append(key)
	print("VARENDOR_REFERENCE_MOVEMENT_QA "+JSON.stringify({"checks":checks,"failed":failed}))
	quit(0 if failed.is_empty() else 2)
