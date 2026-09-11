class_name VarendorPlayerInput
extends RefCounted

# Gameplay input only. UI shortcuts remain with the UI; captured camera events
# go directly to CameraController and cannot also become movement clicks.
var world: VarendorWorld
var network: VarendorNetwork
var last_direction: Vector2 = Vector2.ZERO
var last_axes: Vector2 = Vector2.ZERO
var elapsed: float = 0.0
var focused: bool = true
var pressed_keys: Dictionary = {}
var movement_started: bool = false
var autorun: bool = false
var left_down: bool = false
var right_down: bool = false
var chord_active: bool = false
var chord_target: String = ""
var right_origin: Vector2
const STEERING_INTERVAL: float = 1.0 / 60.0
const MOVE_ACTIONS: Array[StringName] = ["move_left", "move_right", "move_back", "move_forward"]

func setup(value: VarendorWorld, connection: VarendorNetwork) -> void:
	world = value
	network = connection

func poll(delta: float, enabled: bool) -> void:
	# Neutralizing local input cannot depend on an HTTP connection: intent()
	# deliberately ignores disconnected traffic before emitting prediction.
	if not enabled or not focused or not network.connected:
		autorun = false
		stop_manual_prediction()
		pressed_keys.clear()
		movement_started = false
	var axes: Vector2 = movement_axes() if enabled and focused and network.connected else Vector2.ZERO
	var axes_changed: bool = axes != last_axes
	last_axes = axes
	var direction: Vector2 = world.camera_controller.movement_direction(axes)
	# Preserve a down/up edge delivered during one slow frame: it must cancel
	# click-to-move/attack even when no direction remains held at the next tick.
	if movement_started and direction.is_zero_approx():
		network.intent({"type":"cancel","preserveAuto":true})
	movement_started = false
	elapsed += delta
	# A high-refresh camera can change its world-space heading hundreds of
	# times per second, although the motor integrates at 60 Hz. Commit steering
	# at most once per motor tick to BOTH prediction and the network. Physical
	# key edges and neutral release always bypass this interval immediately.
	var steering_ready: bool = axes_changed or direction.is_zero_approx() or elapsed >= STEERING_INTERVAL
	if (direction != last_direction and steering_ready) or (not direction.is_zero_approx() and elapsed > .1):
		last_direction = direction
		elapsed = 0
		network.intent({"type":"direction","x":direction.x,"z":direction.y})

func mouse(event: InputEvent) -> bool:
	if not is_instance_valid(world.camera) or world.space_loading or not network.connected: return false
	if not focused or event is not InputEventMouseButton or not event.pressed: return false
	if event.button_index == MOUSE_BUTTON_RIGHT:
		right_down = true
		right_origin = event.position
		if left_down:
			begin_chord(event.position)
			return true
		return world.camera_controller.begin_capture(event.position)
	if event.button_index == MOUSE_BUTTON_LEFT:
		left_down = true
		autorun = false
		if right_down:
			begin_chord(right_origin)
			return true
		if world.camera_controller.captured: return true
		if world.click(event.position):
			# A later valid click supersedes an earlier released key tap in the
			# same frame, matching the reference command-order edge handling.
			movement_started = false
		return true
	if event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		world.camera_controller.zoom((-100.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 100.0) * (event.factor if event.factor > 0 else 1.0))
		return true
	return false

func begin_chord(point: Vector2) -> void:
	chord_active = true
	chord_target = world.targeting.pick(point)
	if chord_target.is_empty() and world.actors.has(world.target_id): chord_target = world.target_id
	if chord_target.begins_with("npc:") or chord_target == world.hero_id: chord_target = ""
	world.camera_controller.release_capture()
	if not chord_target.is_empty(): world.targeting.select(chord_target)

func release_buttons(event: InputEvent) -> bool:
	if event is not InputEventMouseButton or event.pressed: return false
	if event.button_index == MOUSE_BUTTON_LEFT: left_down = false
	elif event.button_index == MOUSE_BUTTON_RIGHT: right_down = false
	else: return false
	if not chord_active: return false
	if not left_down and not right_down:
		chord_active = false
		if not chord_target.is_empty() and network.connected and focused:
			movement_started = false
			network.intent({"type":"attack","entityId":chord_target,"skill":null,"mode":"auto"})
		chord_target = ""
	return true

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
	autorun = false
	if not pressed_keys.has(code): movement_started = true
	pressed_keys[code] = actions

func movement_axes() -> Vector2:
	if autorun: return Vector2(0,1)
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
		autorun = false
		left_down = false
		right_down = false
		chord_active = false
		chord_target = ""
		pressed_keys.clear()
		movement_started = false
		stop_manual_prediction()
		world.camera_controller.release_capture(false)
		last_direction = Vector2.ZERO
		last_axes = Vector2.ZERO
		network.intent({"type":"direction","x":0,"z":0})
