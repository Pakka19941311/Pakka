class_name VarendorPlayerInput
extends RefCounted

# Gameplay input only. UI shortcuts remain with the UI; captured camera events
# go directly to CameraController and cannot also become movement clicks.
var world: VarendorWorld
var network: VarendorNetwork
var last_direction: Vector2 = Vector2.ZERO
var elapsed: float = 0.0
var focused: bool = true

func setup(value: VarendorWorld, connection: VarendorNetwork) -> void:
	world = value
	network = connection

func poll(delta: float, enabled: bool) -> void:
	# Neutralizing local input cannot depend on an HTTP connection: intent()
	# deliberately ignores disconnected traffic before emitting prediction.
	if not enabled or not focused or not network.connected:
		stop_manual_prediction()
	var direction: Vector2 = Vector2.ZERO
	if enabled and focused and network.connected:
		direction = Input.get_vector("move_left", "move_right", "move_back", "move_forward").limit_length(1).rotated(world.camera_yaw)
		if not Input.is_physical_key_pressed(KEY_SHIFT):
			world.camera_controller.rotate_keyboard((float(Input.is_action_pressed("orbit_right")) - float(Input.is_action_pressed("orbit_left"))) * delta * 1.8)
	elapsed += delta
	if direction != last_direction or (not direction.is_zero_approx() and elapsed > .1):
		last_direction = direction
		elapsed = 0
		network.intent({"type":"direction","x":direction.x,"z":direction.y})

func mouse(event: InputEvent) -> bool:
	if not focused or event is not InputEventMouseButton or not event.pressed: return false
	if event.button_index == MOUSE_BUTTON_RIGHT:
		return world.camera_controller.begin_capture()
	if event.button_index == MOUSE_BUTTON_LEFT and not world.camera_controller.captured:
		world.click(event.position)
		return true
	if event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		world.camera_controller.zoom(-1 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1)
		return true
	return false

func stop_manual_prediction() -> void:
	if world.player_motion.input_mode == "manual":
		world.player_motion.cancel_planar()
		# Old attack snapshots must not restore a lock while neutral input awaits ACK.
		world.player_motion.manual_cancel_pending = true

func focus_changed(value: bool) -> void:
	focused = value
	if not value:
		stop_manual_prediction()
		world.camera_controller.release_capture(false)
		last_direction = Vector2.ZERO
		network.intent({"type":"direction","x":0,"z":0})
