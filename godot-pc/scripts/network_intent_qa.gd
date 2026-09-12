extends RefCounted

const Movement = preload("res://scripts/player_movement.gd")

# A controllable transport drives the production queue and signals. No HTTP,
# timers, saved profiles, or live SceneTree are used by these regressions.
class HeldNetwork extends VarendorNetwork:
	var requests: Array[Dictionary] = []
	var responded: int = 0
	func dispatch_input(entry: Dictionary) -> void:
		requests.append({"path":"/api/input", "payload":entry.payload.duplicate(true), "entry":entry.duplicate(true)})
	func respond() -> void:
		var next: Dictionary = requests[responded]
		responded += 1
		input_completed(next.entry, {"sequence":next.payload.sequence})

static func snapshot(time: int, acknowledged: int, target: Variant = null) -> Dictionary:
	return {"protocol":1, "time":time, "revision":time, "events":[], "heroes":[], "monsters":[], "character":{"id":"qa:queued-input", "generation":1, "x":0.0, "z":0.0, "yOffset":0.0, "grounded":true, "yaw":0.0, "verticalVelocity":0.0, "lastInputSequence":acknowledged, "dead":false, "stats":{"speed":6.2}, "combatState":"idle", "action":"idle", "actionStartedAt":time, "destination":null, "target":target}}

static func attach_prediction(client: HeldNetwork) -> Movement:
	var motor: Movement = Movement.new()
	motor.collision = VarendorCollision.new()
	motor.collision.setup([])
	client.intent_reserved.connect(motor.sent)
	client.intent_submitted.connect(motor.submit)
	client.snapshot_received.connect(motor.reconcile)
	return motor

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var client: HeldNetwork = HeldNetwork.new()
	var motor: Movement = attach_prediction(client)
	client.accept(snapshot(1000,40))
	client.intent({"type":"direction", "x":0.0, "z":0.0})
	client.intent({"type":"destination", "x":7.0, "z":0.0})
	checks["network_queued_prediction_reserves_sequence_before_dispatch"] = client.requests.size() == 2 and client.requests[0].payload.sequence == 41 and client.input_queue.size() == 2 and client.input_queue[1].sequence == 42 and motor.last_sent_sequence == 42
	client.accept(snapshot(1050,41))
	var before: Vector2 = motor.position_value
	motor.physics_step(1.0 / 60.0)
	checks["network_old_ack_cannot_cancel_newer_queued_destination"] = motor.intent_pending and motor.input_mode == "destination" and motor.destination == Vector2(7,0) and motor.position_value.x > before.x
	client.respond()
	checks["network_dispatch_preserves_reserved_prediction_sequence"] = client.requests.size() == 2 and client.requests[1].payload.sequence == 42 and motor.last_sent_sequence == 42 and client.sequence == 42
	client.respond()
	client.accept(snapshot(1100,42))
	checks["network_current_ack_retires_prediction_and_stops_finished_route"] = not motor.intent_pending and motor.input_mode == "idle" and motor.destination == null and client.input_queue.is_empty() and not client.input_busy
	client.free()

	client = HeldNetwork.new()
	motor = attach_prediction(client)
	client.accept(snapshot(1000,0))
	client.intent({"type":"attack", "entityId":"fox", "skill":null})
	client.intent({"type":"direction", "x":1.0, "z":0.0})
	var attacking: Dictionary = snapshot(1050,1,"fox")
	attacking.character.combatState = "windup"
	attacking.character.action = "attack"
	attacking.character.actionEndsAt = 1800
	client.accept(attacking)
	motor.physics_step(1.0 / 60.0)
	checks["network_queued_wasd_overrides_old_server_attack_state"] = motor.manual_cancel_pending and motor.input_mode == "manual" and motor.position_value.x > 0 and motor.last_sent_sequence == 2
	client.respond()
	client.respond()
	client.free()

	client = HeldNetwork.new()
	client.accept(snapshot(1000,0))
	var reserved: Array[int] = []
	var reservation_was_first: Array[bool] = []
	client.intent_reserved.connect(func(_value: Dictionary, sequence: int): reserved.append(sequence))
	client.intent_submitted.connect(func(_value: Dictionary): reservation_was_first.append(not reserved.is_empty() and reserved[-1] == client.sequence))
	client.intent({"type":"direction", "x":1.0, "z":0.0})
	client.intent({"type":"direction", "x":0.0, "z":1.0})
	client.intent({"type":"direction", "x":0.0, "z":1.0})
	var changed_after_submit: Dictionary = {"type":"direction", "x":-1.0, "z":0.0}
	client.intent(changed_after_submit)
	changed_after_submit.x = 999
	client.intent({"type":"jump"})
	client.intent({"type":"direction", "x":1.0, "z":0.0})
	client.intent({"type":"direction", "x":1.0, "z":0.0})
	client.intent({"type":"direction", "x":0.0, "z":-1.0})
	client.intent({"type":"direction", "x":0.0, "z":0.0})
	client.intent({"type":"direction", "x":0.0, "z":0.0})
	client.intent({"type":"attack", "entityId":"fox", "skill":null})
	var queued_sequences: Array[int] = []
	for entry: Dictionary in client.input_queue: queued_sequences.append(int(entry.sequence))
	checks["network_reservation_preserves_prediction_for_turns_heartbeats_and_neutral"] = queued_sequences == [1,2,3,4,5,6,7,8,9,10,11] and client.input_queue[1].value.z == 1 and client.input_queue[3].value.x == -1 and client.input_queue[7].value.z == -1 and client.input_queue[9].value == {"type":"direction","x":0.0,"z":0.0}
	checks["network_each_prediction_receives_unique_reserved_id_first"] = reserved == [1,2,3,4,5,6,7,8,9,10,11] and not reservation_was_first.has(false)
	for reply: int in range(11): client.respond()
	var sent_sequences: Array[int] = []
	for request: Dictionary in client.requests: sent_sequences.append(int(request.payload.sequence))
	checks["network_uncoalesced_test_transport_keeps_reserved_action_order"] = sent_sequences == [1,2,3,4,5,6,7,8,9,10,11] and not client.input_busy and client.input_queue.is_empty()
	checks["network_queued_intents_are_copied_from_mutable_caller_data"] = client.requests[3].payload.intent.x == -1.0
	client.end_session()
	client.intent({"type":"jump"})
	checks["network_disconnected_input_neither_predicts_nor_reserves_id"] = client.sequence == 0 and reserved.size() == 11 and client.input_queue.is_empty() and client.requests.size() == 11
	client.free()

	client = HeldNetwork.new()
	client.accept(snapshot(1000,0))
	var rejected: Array = []
	client.intent_rejected.connect(func(value: Dictionary, seq: int, error: String): rejected.append([value,seq,error]))
	client.intent({"type":"direction", "x":1.0, "z":0.0})
	var old_entry: Dictionary = client.requests[0].entry
	client.end_session()
	client.accept(snapshot(2000,0))
	client.intent({"type":"direction", "x":0.0, "z":1.0})
	client.input_completed(old_entry,{"error":"old-profile"})
	checks["network_old_profile_result_cannot_clear_new_queue_or_emit_error"] = client.input_busy and client.input_queue.size() == 1 and rejected.is_empty()
	old_entry = client.requests[-1].entry
	var teleported: Dictionary = snapshot(2100,1)
	teleported.character.generation = 2
	client.accept(teleported)
	client.intent({"type":"direction", "x":-1.0, "z":0.0})
	client.input_completed(old_entry,{"error":"old-generation"})
	checks["network_teleport_cancels_old_input_and_fences_deferred_errors"] = client.input_busy and client.input_queue.size() == 1 and client.input_queue[0].payload.generation == 2 and rejected.is_empty()
	var current_entry: Dictionary = client.requests[-1].entry
	client.input_completed(current_entry,{"error":"current-input"})
	checks["network_current_input_error_retires_queue_and_reports_reserved_id"] = not client.input_busy and client.input_queue.is_empty() and rejected.size() == 1 and rejected[0][1] == current_entry.sequence
	client.input_completed(current_entry,{"error":"duplicate"})
	checks["network_duplicate_response_does_not_repeat_error"] = rejected.size() == 1
	client.intent({"type":"direction", "x":1.0, "z":0.0})
	old_entry = client.requests[-1].entry
	client.stream_failed()
	checks["network_stream_loss_cancels_pending_input_fifo"] = not client.connected and not client.input_busy and client.input_queue.is_empty()
	client.accept(teleported)
	client.intent({"type":"direction", "x":0.0, "z":0.0})
	client.input_completed(old_entry,{"error":"old-stream"})
	checks["network_same_session_reconnect_ignores_cancelled_worker_result"] = client.input_busy and client.input_queue.size() == 1 and rejected.size() == 1
	current_entry = client.requests[-1].entry
	client.intent({"type":"direction", "x":0.0, "z":1.0})
	client.input_completed(current_entry,{"error":"lost-input-connection","transport_error":true})
	checks["network_transport_failure_cancels_remaining_input_and_reconnects"] = not client.connected and not client.input_busy and client.input_queue.is_empty() and rejected.size() == 2
	client.accept(teleported)
	client.intent({"type":"direction", "x":0.0, "z":1.0})
	client.accept({"protocol":999})
	checks["network_incompatible_server_cancels_input_fifo"] = client.incompatible and not client.connected and not client.input_busy and client.input_queue.is_empty()
	client.free()
	return checks
