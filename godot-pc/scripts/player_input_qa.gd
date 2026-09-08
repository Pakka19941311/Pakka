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
	# Real key edges use the same action matching as the main input route.
	var saved_events: Dictionary = {}
	var default_keys: Dictionary = {"move_forward":KEY_W,"move_back":KEY_S,"move_left":KEY_A,"move_right":KEY_D}
	for action: String in default_keys:
		saved_events[action] = InputMap.action_get_events(action)
		InputMap.action_erase_events(action)
		var binding: InputEventKey = InputEventKey.new()
		binding.physical_keycode = default_keys[action]
		InputMap.action_add_event(action,binding)
	var forward: InputEventKey = InputEventKey.new()
	forward.physical_keycode = KEY_W
	forward.pressed = true
	controls.handle_keyboard(forward,true)
	world.camera_controller.yaw = 1.0
	world.camera_controller.smoothed_yaw = .3
	controls.poll(1.0/60,true)
	checks["reference_input_wasd_uses_visible_yaw_not_mouse_goal"] = world.player_motion.input_direction.distance_to(Vector2.DOWN.rotated(.3)) < .00001
	var right: InputEventKey = InputEventKey.new()
	right.physical_keycode = KEY_D
	right.pressed = true
	controls.handle_keyboard(right,true)
	controls.poll(1.0/60,true)
	checks["reference_input_diagonal_is_normalized"] = is_equal_approx(world.player_motion.input_direction.length(),1.0)
	forward.pressed = false
	right.pressed = false
	controls.handle_keyboard(forward,true)
	controls.handle_keyboard(right,true)
	controls.poll(1.0/60,true)
	checks["reference_input_key_release_sends_neutral_intent"] = world.player_motion.input_direction.is_zero_approx()

	world.player_motion.submit({"type":"destination","x":5.0,"z":0.0})
	forward.pressed = true
	controls.handle_keyboard(forward,true)
	forward.pressed = false
	controls.handle_keyboard(forward,true)
	controls.poll(1.0/60,true)
	checks["reference_input_same_frame_tap_cancels_autonomous_movement"] = world.player_motion.input_mode == "idle" and world.player_motion.destination == null and world.player_motion.manual_cancel_pending

	forward.pressed = true
	controls.handle_keyboard(forward,true)
	controls.poll(1.0/60,true)
	controls.focus_changed(false)
	controls.focus_changed(true)
	forward.echo = true
	controls.handle_keyboard(forward,true)
	controls.poll(1.0/60,true)
	checks["reference_input_focus_restore_rejects_old_held_key_repeat"] = controls.movement_axes().is_zero_approx() and world.player_motion.input_direction.is_zero_approx()
	forward.pressed = false
	forward.echo = false
	controls.handle_keyboard(forward,true)
	forward.pressed = true
	controls.handle_keyboard(forward,true)
	controls.poll(1.0/60,true)
	checks["reference_input_release_then_fresh_press_restores_movement"] = not controls.movement_axes().is_zero_approx() and not world.player_motion.input_direction.is_zero_approx()
	controls.poll(1.0/60,false)
	forward.echo = true
	controls.handle_keyboard(forward,true)
	controls.poll(1.0/60,true)
	checks["reference_input_typing_focus_does_not_leak_held_wasd"] = controls.movement_axes().is_zero_approx() and world.player_motion.input_direction.is_zero_approx()
	for action: String in saved_events:
		InputMap.action_erase_events(action)
		for event: InputEvent in saved_events[action]: InputMap.action_add_event(action,event)
	client.free()
	world.camera_controller.free()
	world.free()
	for action: StringName in temporary_actions: InputMap.erase_action(action)
	return checks
