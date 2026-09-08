class_name VarendorPlayerInput
extends RefCounted

# Gameplay input only. UI shortcuts remain with the UI; captured camera events
# go directly to CameraController and cannot also become movement clicks.
var world: VarendorWorld
var network: VarendorNetwork
var last_direction: Vector2 = Vector2.ZERO
var elapsed: float = 0.0
var focused: bool = true
var pressed_keys: Dictionary = {}
var movement_started: bool = false
const MOVE_ACTIONS: Array[StringName] = ["move_left", "move_right", "move_back", "move_forward"]

func setup(value: VarendorWorld, connection: VarendorNetwork) -> void:
	world = value
	network = connection

func poll(delta: float, enabled: bool) -> void:
	# Neutralizing local input cannot depend on an HTTP connection: intent()
	# deliberately ignores disconnected traffic before emitting prediction.
	if not enabled or not focused or not network.connected:
		stop_manual_prediction()
		pressed_keys.clear()
		movement_started = false
	var direction: Vector2 = Vector2.ZERO
	if enabled and focused and network.connected:
		direction = world.camera_controller.movement_direction(movement_axes())
	# Preserve a down/up edge delivered during one slow frame: it must cancel
	# click-to-move/attack even when no direction remains held at the next tick.
	if movement_started and direction.is_zero_approx():
		network.intent({"type":"cancel"})
	movement_started = false
	elapsed += delta
	if direction != last_direction or (not direction.is_zero_approx() and elapsed > .1):
		last_direction = direction
		elapsed = 0
		network.intent({"type":"direction","x":direction.x,"z":direction.y})

func mouse(event: InputEvent) -> bool:
	if not focused or event is not InputEventMouseButton or not event.pressed: return false
	if event.button_index == MOUSE_BUTTON_RIGHT:
		return world.camera_controller.begin_capture(event.position)
	if event.button_index == MOUSE_BUTTON_LEFT and not world.camera_controller.captured:
		if world.click(event.position):
			# A later valid click supersedes an earlier released key tap in the
			# same frame, matching the reference command-order edge handling.
			movement_started = false
		return true
	if event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		world.camera_controller.zoom((-100.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 100.0) * (event.factor if event.factor > 0 else 1.0))
		return true
	return false

func handle_keyboard(event: InputEvent, enabled: bool) -> void:
	if event is not InputEventKey: return
	var code: int = event.physical_keycode if event.physical_keycode != 0 else event.keycode
	if not event.pressed:
		pressed_keys.erase(code)
		return
	if not enabled or not focused or not network.connected: return
	# Like the reference pressed-code set: focus restoration/typing cannot
	# revive a held key via OS key-repeat; release then press is required.
	if event.echo and not pressed_keys.has(code): return
	var actions: Array[StringName] = []
	for action: StringName in MOVE_ACTIONS:
		if event.is_action_pressed(action, true): actions.append(action)
	if actions.is_empty(): return
	if not pressed_keys.has(code): movement_started = true
	pressed_keys[code] = actions

func movement_axes() -> Vector2:
	var held: Dictionary = {}
	for actions: Array in pressed_keys.values():
		for action: StringName in actions: held[action] = true
	return Vector2(float(held.has("move_right")) - float(held.has("move_left")), float(held.has("move_forward")) - float(held.has("move_back"))).limit_length(1.0)

func stop_manual_prediction() -> void:
	if world.player_motion.input_mode == "manual":
		world.player_motion.cancel_planar()
		# Old attack snapshots must not restore a lock while neutral input awaits ACK.
		world.player_motion.manual_cancel_pending = true

func focus_changed(value: bool) -> void:
	focused = value
	if not value:
		pressed_keys.clear()
		movement_started = false
		stop_manual_prediction()
		world.camera_controller.release_capture(false)
		last_direction = Vector2.ZERO
		network.intent({"type":"direction","x":0,"z":0})
