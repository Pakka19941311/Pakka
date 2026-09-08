extends RefCounted

const Movement = preload("res://scripts/player_movement.gd")

# A controllable transport drives the production queue and signals. No HTTP,
# timers, saved profiles, or live SceneTree are used by these regressions.
class HeldNetwork extends VarendorNetwork:
	signal reply_ready(reply: Dictionary)
	var requests: Array[Dictionary] = []
	func request(path: String, payload = null, _bearer: String = "") -> Dictionary:
		requests.append({"path":path, "payload":payload.duplicate(true)})
		return await reply_ready
	func respond() -> void:
		reply_ready.emit({"sequence":requests[-1].payload.sequence})

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
	checks["network_queued_prediction_reserves_sequence_before_dispatch"] = client.requests.size() == 1 and client.requests[0].payload.sequence == 41 and client.input_queue.size() == 1 and client.input_queue[0].sequence == 42 and motor.last_sent_sequence == 42
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
	checks["network_identical_heartbeats_coalesce_but_turns_and_neutral_survive"] = queued_sequences == [3,4,5,7,8,10,11] and client.input_queue[0].value.z == 1 and client.input_queue[1].value.x == -1 and client.input_queue[4].value.z == -1 and client.input_queue[5].value == {"type":"direction","x":0.0,"z":0.0}
	checks["network_each_prediction_receives_unique_reserved_id_first"] = reserved == [1,2,3,4,5,6,7,8,9,10,11] and not reservation_was_first.has(false)
	for reply: int in range(8): client.respond()
	var sent_sequences: Array[int] = []
	for request: Dictionary in client.requests: sent_sequences.append(int(request.payload.sequence))
	checks["network_coalesced_dispatch_keeps_turn_jump_release_attack_order"] = sent_sequences == [1,3,4,5,7,8,10,11] and not client.input_busy and client.input_queue.is_empty()
	checks["network_queued_intents_are_copied_from_mutable_caller_data"] = client.requests[2].payload.intent.x == -1.0
	client.end_session()
	client.intent({"type":"jump"})
	checks["network_disconnected_input_neither_predicts_nor_reserves_id"] = client.sequence == 0 and reserved.size() == 11 and client.input_queue.is_empty() and client.requests.size() == 8
	client.free()
	return checks
