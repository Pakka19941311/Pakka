extends RefCounted

class HeldNetwork extends VarendorNetwork:
	signal reply_ready(reply: Dictionary)
	var requests: Array[Dictionary] = []
	func request(_path: String, payload = null, _bearer: String = "") -> Dictionary:
		requests.append(payload.duplicate(true))
		return await reply_ready

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var world: VarendorWorld = VarendorWorld.new()
	var client: HeldNetwork = HeldNetwork.new()
	client.connected = true
	client.intent_reserved.connect(world.record_intent)
	client.intent_submitted.connect(world.submit_intent)
	client.intent_rejected.connect(world.reject_intent)
	var delivered: Array[Dictionary] = []
	client.intent_rejected.connect(func(value: Dictionary, sequence: int, error: String): delivered.append({"value":value,"sequence":sequence,"error":error}))
	var notice_after_rejection: Array[bool] = []
	client.notice.connect(func(_message: String): notice_after_rejection.append(not delivered.is_empty()))
	client.intent({"type":"attack","entityId":"qa:blocked","skill":null})
	world.player_motion.navigation_path = [{"x":2.0,"z":0.0}]
	client.reply_ready.emit({"error":"target-occluded"})
	checks["target_current_occluded_rejection_clears_selection_and_prediction"] = world.target_id.is_empty() and world.player_motion.input_mode == "idle" and world.player_motion.navigation_path.is_empty() and not world.player_motion.intent_pending
	checks["target_rejection_transport_delivers_value_sequence_and_error_before_notice"] = delivered.size() == 1 and delivered[0].sequence == 1 and delivered[0].value.entityId == "qa:blocked" and delivered[0].error == "target-occluded" and notice_after_rejection == [true]
	client.intent({"type":"attack","entityId":"qa:old","skill":null})
	client.intent({"type":"attack","entityId":"qa:new","skill":null})
	client.reply_ready.emit({"error":"missing-target"})
	checks["target_stale_rejection_cannot_clear_newer_selection"] = world.target_id == "qa:new" and world.player_motion.input_mode == "combat" and world.player_motion.last_sent_sequence == 3
	client.reply_ready.emit({})
	client.intent({"type":"attack","entityId":"qa:gone","skill":null})
	client.reply_ready.emit({"error":"missing-target"})
	checks["target_current_despawn_rejection_clears_selected_entity"] = world.target_id.is_empty() and world.player_motion.input_mode == "idle"
	client.intent({"type":"attack","entityId":"qa:live","skill":0})
	client.reply_ready.emit({"error":"skill-cooldown"})
	checks["target_valid_selection_survives_unrelated_skill_rejection"] = world.target_id == "qa:live"
	client.free()
	world.camera_controller.free()
	world.free()
	return checks
