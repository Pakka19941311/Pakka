extends RefCounted

class ImmediateNetwork extends VarendorNetwork:
	var transmitted: Array[Dictionary] = []
	func request(_path: String, payload = null, _bearer: String = "") -> Dictionary:
		transmitted.append(payload.duplicate(true))
		return {}

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var temporary_actions: Array[StringName] = []
	for action: StringName in ["move_left","move_right","move_back","move_forward","orbit_left","orbit_right"]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			temporary_actions.append(action)
	var world: VarendorWorld = VarendorWorld.new()
	var client: ImmediateNetwork = ImmediateNetwork.new()
	var controls: VarendorPlayerInput = VarendorPlayerInput.new()
	world.collision.setup([])
	world.player_motion.reconcile({"time":1000,"character":{"id":"qa:input","generation":1,"x":0.0,"z":0.0,"yOffset":0.0,"yaw":0.0,"grounded":true,"dead":false,"lastInputSequence":0,"stats":{"speed":6.2}}})
	controls.setup(world,client)
	client.connected = true
	client.intent_reserved.connect(world.record_intent)
	client.intent_submitted.connect(world.submit_intent)
	client.intent({"type":"direction","x":1.0,"z":0.0})
	controls.last_direction = Vector2.RIGHT
	for tick: int in range(20): world.player_motion.physics_step(1.0/60)
	var endpoint: Vector2 = world.player_motion.position_value
	client.connected = false
	controls.poll(1.0/60,false)
	for tick: int in range(120):
		world.player_motion.physics_step(1.0/60)
		controls.poll(1.0/60,false)
	checks["input_disconnect_stops_manual_prediction_without_network_ack"] = world.player_motion.position_value == endpoint and world.player_motion.input_mode == "idle" and controls.last_direction == Vector2.ZERO
	client.connected = true
	controls.poll(1.0/60,true)
	for tick: int in range(20): world.player_motion.physics_step(1.0/60)
	checks["input_reconnect_with_released_keys_does_not_resume_old_direction"] = world.player_motion.position_value == endpoint and world.player_motion.input_direction == Vector2.ZERO

	client.intent({"type":"direction","x":0.0,"z":1.0})
	controls.last_direction = Vector2.DOWN
	world.player_motion.request_jump()
	world.player_motion.physics_step(.1)
	var height: float = world.player_motion.height
	var vertical_velocity: float = world.player_motion.vertical_velocity
	endpoint = world.player_motion.position_value
	client.connected = false
	controls.focus_changed(false)
	checks["input_focus_loss_cancels_planar_offline_but_preserves_jump"] = world.player_motion.input_mode == "idle" and world.player_motion.height == height and world.player_motion.vertical_velocity == vertical_velocity and not world.player_motion.grounded
	world.player_motion.physics_step(1.0/60)
	checks["input_focus_loss_continues_ballistic_vertical_physics_only"] = world.player_motion.position_value == endpoint and world.player_motion.height > height
	controls.focus_changed(true)
	client.connected = true
	controls.poll(1.0/60,true)
	checks["input_focus_restore_without_keys_remains_neutral"] = world.player_motion.input_direction == Vector2.ZERO and world.player_motion.input_mode == "idle"

	world.player_motion.submit({"type":"destination","x":5.0,"z":0.0})
	controls.poll(1.0/60,false)
	checks["input_text_focus_does_not_cancel_server_autonomous_destination"] = world.player_motion.input_mode == "destination" and world.player_motion.destination == Vector2(5,0)
	client.free()
	world.camera_controller.free()
	world.free()
	for action: StringName in temporary_actions: InputMap.erase_action(action)
	return checks
