extends SceneTree

# Packets are captured from the real TypeScript WorldSimulation by
# scripts/player-stop-contract.mjs. The native prediction must remain stationary
# from the FIRST stopped physics tick, even when ACKs for earlier motor phases
# arrive much later. No 250/350 ms settling interval may hide residual coast.
const STEP: float = 1.0 / 60.0

static func replay(trace: Dictionary, fields: Array) -> Dictionary:
	var motor: VarendorPlayerMovement = VarendorPlayerMovement.new()
	motor.collision = VarendorCollision.new()
	motor.reconcile(trace.initial)
	var network: VarendorNetwork = VarendorNetwork.new()
	network.snapshot_received.connect(motor.reconcile)
	network.accept(trace.initial)
	var packet_index: int = 0
	var stop_tick: int = -1
	var anchor: Vector2 = Vector2.ZERO
	var moved: bool = false
	var reordered_stable: bool = true
	var maximum_late_excursion: float = 0
	var maximum_correction: float = 0
	var last_packet: Dictionary = trace.initial
	for tick: int in range(int(trace.ticks)):
		for command: Dictionary in trace.commands:
			if int(command.tick) == tick:
				motor.sent(command.intent,int(command.sequence))
				motor.submit(command.intent)
		motor.physics_step(STEP)
		while packet_index < trace.packets.size() and int(trace.packets[packet_index].tick) <= tick:
			var packet: Dictionary = trace.initial.duplicate(true)
			var row: Array = trace.packets[packet_index].row
			for column: int in range(fields.size()):
				if fields[column] == "time": packet.time = row[column]
				else: packet.character[fields[column]] = row[column]
			packet.revision = int(trace.packets[packet_index].revision)
			network.accept(packet)
			var accepted: Vector2 = motor.position_value
			var correction: Vector2 = motor.visual_correction
			# Use production accept() for the late/duplicate SSE/HTTP order.
			network.accept(last_packet)
			network.accept(packet)
			reordered_stable = reordered_stable and motor.position_value == accepted and motor.visual_correction == correction
			last_packet = packet
			packet_index += 1
		var pose: Dictionary = motor.render_pose(.5)
		var point: Vector2 = Vector2(pose.x,pose.z)
		if motor.actual_velocity.length() > .5: moved = true
		if moved and stop_tick < 0 and motor.actual_velocity.length() < .01:
			stop_tick = tick
			anchor = point
		if stop_tick >= 0:
			maximum_late_excursion = maxf(maximum_late_excursion,point.distance_to(anchor))
		maximum_correction = maxf(maximum_correction,motor.visual_correction.length())
	var final: Vector2 = Vector2(trace.final[0],trace.final[1])
	network.free()
	return {"reordered_stable":reordered_stable,"moved_and_stopped":moved and stop_tick >= 0,"late_excursion":maximum_late_excursion,"maximum_correction":maximum_correction,"final_error":motor.position_value.distance_to(final),"stop_tick":stop_tick,"last_ack":last_packet.character.lastInputSequence}


static func authoritative_correction(initial: Dictionary) -> Dictionary:
	var motor: VarendorPlayerMovement = VarendorPlayerMovement.new()
	motor.collision = VarendorCollision.new()
	motor.reconcile(initial)
	motor.sent({"type":"direction"},1)
	motor.submit({"type":"direction","x":1,"z":0})
	for tick: int in range(60): motor.physics_step(STEP)
	motor.sent({"type":"direction"},2)
	motor.submit({"type":"direction","x":0,"z":0})
	var sample: Vector2
	for tick: int in range(30):
		motor.physics_step(STEP)
		if tick == 1: sample = motor.position_value
	var before: Vector2 = motor.position_value
	var discrepancy: Vector2 = Vector2(.12,-.07)
	var packet: Dictionary = initial.duplicate(true)
	packet.time = 2233.33333333
	packet.character.lastInputSequence = 2
	packet.character.lastInputAt = 2200.0
	packet.character.x = sample.x+discrepancy.x
	packet.character.z = sample.y+discrepancy.y
	motor.reconcile(packet)
	var corrects: bool = motor.position_value.distance_to(before+discrepancy) < .00001
	var corrected: Vector2 = motor.position_value
	motor.sent({"type":"direction"},3)
	motor.submit({"type":"direction","x":0,"z":1})
	packet.character.x += 5
	motor.reconcile(packet)
	var protects: bool = motor.position_value == corrected and motor.input_mode == "manual"
	packet.character.generation = 2
	packet.character.x = 10
	packet.character.z = 10
	var resets: bool = motor.reconcile(packet) and motor.sent_inputs.is_empty() and motor.visual_correction.is_zero_approx()
	return {"stop_alignment_preserves_real_authoritative_correction":corrects,"stop_older_ack_cannot_cancel_new_direction":protects,"stop_generation_reset_discards_old_input_timestamps":resets}

static func ahead_server_clock(initial: Dictionary) -> Dictionary:
	# Independent pinned moving positions, not a second copy of reconciliation.
	# An ahead server clock can occur after a stalled local frame. ACK age still
	# describes the same simulated motion; it must not put a hole in local history.
	var golden: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-control-traces.json"))
	var rows: Array = golden.movement.traces[3].rows # Continuous forward running jump; planar motion is unchanged.
	var motor: VarendorPlayerMovement = VarendorPlayerMovement.new()
	motor.collision = VarendorCollision.new()
	motor.reconcile(initial)
	var epoch: float = float(initial.time)
	var origin: Vector2 = motor.position_value
	motor.sent({"type":"direction"},1)
	motor.submit({"type":"direction","x":0,"z":1})
	for tick: int in range(60): motor.physics_step(STEP)
	var packet: Dictionary = initial.duplicate(true)
	packet.character.lastInputSequence = 1
	packet.character.lastInputAt = epoch + 1100.0
	packet.character.x = origin.x
	packet.character.z = origin.y + float(rows[59][2])
	packet.time = epoch + 2100.0
	motor.reconcile(packet)
	for tick: int in range(6): motor.physics_step(STEP)
	packet.time = epoch + 2200.0
	packet.character.z = origin.y + float(rows[65][2])
	motor.reconcile(packet)
	return {
		"stop_ahead_server_clock_does_not_create_local_history_hole":absf(motor.clock_ms - epoch - 1100.0) < .01,
		"stop_ahead_server_clock_does_not_inject_false_render_correction":motor.visual_correction.length() < .0001 and motor.position_value.distance_to(Vector2(packet.character.x,packet.character.z)) < .0001,
		"stop_ahead_server_clock_measurements":{"physics_elapsed_ms":motor.clock_ms-epoch,"correction_m":motor.visual_correction.length()},
	}

static func run() -> Dictionary:
	var contract: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/player-stop-traces.json"))
	var checks: Dictionary = {}
	var measurements: Dictionary = {}
	for trace: Dictionary in contract.traces:
		var result: Dictionary = replay(trace,contract.fields)
		var name: String = str(trace.name)
		checks["stop_"+name+"_no_rendered_travel_from_first_stopped_tick"] = result.moved_and_stopped and result.late_excursion < .001
		checks["stop_"+name+"_does_not_mistake_latency_for_displacement"] = result.maximum_correction < .001
		checks["stop_"+name+"_reordered_and_duplicate_packets_are_stable"] = result.reordered_stable
		checks["stop_"+name+"_converges_to_authoritative_position"] = result.final_error < .016
		measurements[name] = result
	checks.merge(authoritative_correction(contract.traces[0].initial))
	checks.merge(ahead_server_clock(contract.traces[0].initial))
	checks["stop_transport_measurements"] = measurements
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	print("VARENDOR_PLAYER_STOP_QA "+JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return not value is bool or value) else 2)
