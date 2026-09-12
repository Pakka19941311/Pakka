class_name VarendorCameraController
extends Node

# One owner for the mouse capture lease and camera pose. Input routing is
# explicit: main._input forwards captured events; main._unhandled_input starts
# a lease only after GUI controls have had the chance to consume the click.
# Behavioral port of browser commit 1e94a0d1 third-person-camera.ts.
# Babylon alpha = Godot yaw - PI/2; beta = PI/2 - Godot pitch.
const MIN_PITCH: float = PI / 2.0 - 1.36
const MAX_PITCH: float = PI / 2.0 - .72
const DEFAULT_PITCH: float = PI / 2.0 - 1.06
const MIN_ZOOM: float = 5.5
const MAX_ZOOM: float = 18.0
const DEFAULT_ZOOM: float = 10.5
const OBSTRUCTION_MINIMUM: float = 1.1
const CAMERA_RADIUS: float = .22
const LOOK_AHEAD: float = 2.15
const FOCUS_HEIGHT: float = 1.35
const FOLLOW_RESPONSE: float = 18.0
const ORBIT_RESPONSE: float = 16.0
const ZOOM_RESPONSE: float = 12.0
const OBSTRUCTION_RESPONSE: float = 7.0

var yaw: float = 0.0
var pitch: float = DEFAULT_PITCH
var distance: float = DEFAULT_ZOOM
var sensitivity: float = 1.0
var zoom_sensitivity: float = 1.0
var smoothing: float = 1.0
var invert_y: bool = false
var captured: bool = false
var smoothed_yaw: float = 0.0
var smoothed_pitch: float = DEFAULT_PITCH
var smoothed_distance: float = DEFAULT_ZOOM
var actual_distance: float = DEFAULT_ZOOM
var follow_position: Vector3 = Vector3.ZERO
var collision_limited: bool = false

var _camera: Camera3D
var _collision: VarendorCollision
var _height_at: Callable
var _viewport: Viewport
var _capture_generation: int = 0
var _restore_position: Vector2 = Vector2.ZERO
var _restore_rect: Rect2
var _restore_mode: Input.MouseMode = Input.MOUSE_MODE_VISIBLE
var _restore_valid: bool = false
var _previous_accumulation: bool = true
var _pose_initialized: bool = false

func setup(camera_value: Camera3D, collision_value: VarendorCollision, height_query: Callable) -> void:
	_camera = camera_value
	_collision = collision_value
	_height_at = height_query
	_viewport = camera_value.get_viewport()
	if not _viewport.size_changed.is_connected(_on_viewport_resized):
		_viewport.size_changed.connect(_on_viewport_resized)

func begin_capture(viewport_position: Variant = null) -> bool:
	# A duplicate RMB down must never overwrite the saved position with the
	# captured pointer's centre (or an unavailable desktop pointer at 0,0).
	if captured or not is_instance_valid(_viewport):
		return false
	if Input.mouse_mode in [Input.MOUSE_MODE_CAPTURED, Input.MOUSE_MODE_CONFINED_HIDDEN, Input.MOUSE_MODE_HIDDEN]:
		return false
	var position_value: Vector2 = _viewport.get_mouse_position() if viewport_position == null else Vector2(viewport_position)
	var bounds: Rect2 = _viewport.get_visible_rect()
	if not position_value.is_finite() or not bounds.has_point(position_value):
		return false
	_capture_generation += 1
	_restore_position = position_value
	_restore_rect = bounds
	_restore_mode = Input.mouse_mode
	_restore_valid = true
	_previous_accumulation = Input.use_accumulated_input
	Input.use_accumulated_input = false
	captured = true
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	return true

func handle_captured_input(event: InputEvent) -> bool:
	if not captured:
		return false
	if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		release_capture(false)
		return false
	if event is InputEventMouseMotion:
		# screen_relative is independent of viewport stretch and DPI scaling.
		# Never use captured event.position, which is the window centre.
		var motion: Vector2 = event.screen_relative
		if motion.is_finite():
			orbit(motion)
		return true
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT:
		if not event.pressed:
			release_capture()
		return true
	return false

func release_capture(restore: bool = true) -> void:
	# Releasing an absent lease does not take ownership of another UI's mouse.
	if not captured:
		return
	captured = false
	Input.use_accumulated_input = _previous_accumulation
	if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = _restore_mode
	else:
		restore = false
	if restore and _restore_valid:
		_restore_pointer.call_deferred(_capture_generation, _restore_position, _restore_rect)
	else:
		_capture_generation += 1
		_restore_valid = false

func release_for_modal() -> void:
	# An embedded Window takes viewport focus during popup_centered(). Restore
	# synchronously while the root still owns focus; otherwise its focus-out
	# notification invalidates the deferred release before it restores the point.
	# The ordinary RMB path keeps its deferred, generation-guarded restoration.
	release_capture()
	if _restore_valid and not captured:
		_restore_pointer(_capture_generation, _restore_position, _restore_rect)

func _restore_pointer(generation_value: int, position_value: Vector2, bounds: Rect2) -> void:
	if generation_value != _capture_generation or captured or not _restore_valid:
		return
	_restore_valid = false
	if not is_instance_valid(_viewport) or _viewport.get_visible_rect() != bounds:
		return
	if Input.mouse_mode not in [Input.MOUSE_MODE_VISIBLE, Input.MOUSE_MODE_CONFINED]:
		return
	# Save and restore in the SAME viewport coordinate space. Godot performs
	# window decorations, content scale and display mapping. No desktop-origin
	# subtraction, clamp to (0,0), or invented fallback cursor position.
	if DisplayServer.get_name() != "headless":
		_viewport.warp_mouse(position_value)

func _on_viewport_resized() -> void:
	# The original point has no exact meaning after the viewport has resized.
	# Leave OS focus/cursor management alone instead of warping to another point.
	release_capture(false)
	_capture_generation += 1
	_restore_valid = false

func _notification(what: int) -> void:
	if what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_WM_WINDOW_FOCUS_OUT, NOTIFICATION_EXIT_TREE]:
		release_capture(false)
		_capture_generation += 1
		_restore_valid = false

func configure(options: Dictionary) -> void:
	sensitivity = clampf(float(options.get("mouseSensitivity", sensitivity)), .25, 2.5)
	zoom_sensitivity = clampf(float(options.get("zoomSensitivity", zoom_sensitivity)), .35, 2.2)
	smoothing = clampf(float(options.get("smoothing", smoothing)), .55, 1.8)
	invert_y = bool(options.get("invertY", invert_y))

func orbit(relative_motion: Vector2) -> void:
	if not relative_motion.is_finite(): return
	yaw -= relative_motion.x * .0048 * sensitivity
	pitch = clampf(pitch + relative_motion.y * .0038 * sensitivity * (-1 if invert_y else 1), MIN_PITCH, MAX_PITCH)

func zoom(wheel_delta: float) -> void:
	# Reference DOM wheel delta is +/-100 for a normal wheel notch. Clamp each
	# incoming event, not the accumulated frame, exactly as PlayerInputController.
	if not is_finite(wheel_delta): return
	distance = clampf(distance + clampf(wheel_delta, -240.0, 240.0) * .0065 * zoom_sensitivity, MIN_ZOOM, MAX_ZOOM)

func movement_direction(axes: Vector2) -> Vector2:
	# Movement follows what is visible, not the yet-unrendered mouse target.
	return axes.limit_length(1.0).rotated(smoothed_yaw)

func reset_follow() -> void:
	# Explicit lifecycle reset for spawn/teleport only, never for snapshots.
	_pose_initialized = false

func update_pose(delta: float, hero_position: Vector3, _jump_offset: float = 0.0) -> void:
	if not is_instance_valid(_camera) or not _height_at.is_valid() or delta <= 0:
		return
	pitch = clampf(pitch, MIN_PITCH, MAX_PITCH)
	distance = clampf(distance, MIN_ZOOM, MAX_ZOOM)
	var dt: float = minf(delta, .5)
	var floor_y: float = float(_height_at.call(hero_position.x, -hero_position.z))
	if not _pose_initialized:
		smoothed_yaw = yaw
		smoothed_pitch = pitch
		smoothed_distance = distance
		actual_distance = distance
		follow_position.y = floor_y + FOCUS_HEIGHT
		_pose_initialized = true
	else:
		smoothed_yaw = lerp_angle(smoothed_yaw, yaw, 1.0 - exp(-ORBIT_RESPONSE * smoothing * dt))
		smoothed_pitch = lerpf(smoothed_pitch, pitch, 1.0 - exp(-ORBIT_RESPONSE * smoothing * dt))
		smoothed_distance = lerpf(smoothed_distance, distance, 1.0 - exp(-ZOOM_RESPONSE * smoothing * dt))
		follow_position.y = lerpf(follow_position.y, floor_y + FOCUS_HEIGHT, 1.0 - exp(-FOLLOW_RESPONSE * dt))
	# The reference receives the interpolated player XZ and terrain support Y.
	# No second horizontal filter; jumping does not move the camera pivot.
	var forward: Vector3 = Vector3(-sin(smoothed_yaw), 0, -cos(smoothed_yaw))
	follow_position.x = hero_position.x + forward.x * LOOK_AHEAD
	follow_position.z = hero_position.z + forward.z * LOOK_AHEAD
	var direction: Vector3 = Vector3(sin(smoothed_yaw) * cos(smoothed_pitch), sin(smoothed_pitch), cos(smoothed_yaw) * cos(smoothed_pitch))
	var wanted_camera: Vector3 = follow_position + direction * smoothed_distance
	var permitted: float = _obstruction_distance(hero_position, floor_y, wanted_camera)
	var radius: float = maxf(OBSTRUCTION_MINIMUM, minf(smoothed_distance, permitted))
	collision_limited = radius < smoothed_distance - .01
	actual_distance = radius if radius < actual_distance else lerpf(actual_distance, radius, 1.0 - exp(-OBSTRUCTION_RESPONSE * dt))
	# In a narrow passage the shortened orbit may be smaller than LOOK_AHEAD.
	# Keeping the full forward offset then puts the camera ahead of the hero,
	# facing away from them. Reduce only that offset while obstruction-limited;
	# the normal orbit, sensitivity and shoulder direction remain identical.
	var visible_ahead: float = LOOK_AHEAD*clampf((actual_distance-2.7)/(MIN_ZOOM-2.7),0.0,1.0)
	var focus: Vector3 = follow_position-forward*(LOOK_AHEAD-visible_ahead)
	var camera_position: Vector3 = focus+direction*actual_distance
	var body_focus: Vector3 = Vector3(hero_position.x,floor_y+1.25,hero_position.z)
	if _collision != null and visible_ahead < LOOK_AHEAD:
		var distance_to_camera: float = body_focus.distance_to(camera_position)
		var clearance: float = _collision.ray_distance(body_focus,camera_position,CAMERA_RADIUS,true)
		if clearance < distance_to_camera:
			camera_position = body_focus.lerp(camera_position,maxf(0.0,clearance-.02)/maxf(.001,distance_to_camera))
	_camera.position = camera_position
	_camera.look_at(focus)

func _obstruction_distance(hero_position: Vector3, floor_y: float, wanted_camera: Vector3) -> float:
	# Reference main.ts probes from the body (not the 2.15m look-ahead target)
	# and maps that swept fraction back to the orbit radius. Preserve this to
	# avoid a different zoom response when running next to walls and hills.
	var origin: Vector3 = Vector3(hero_position.x, floor_y + 1.25, hero_position.z)
	var length_value: float = origin.distance_to(wanted_camera)
	var allowed: float = length_value if _collision == null else _collision.ray_distance(origin, wanted_camera, CAMERA_RADIUS, true)
	var sample_distance: float = .5
	while sample_distance <= allowed:
		var location: Vector3 = origin.lerp(wanted_camera, sample_distance / maxf(.001, length_value))
		if location.y < float(_height_at.call(location.x, -location.z)) + .25:
			allowed = maxf(0.0, sample_distance - .5)
			break
		sample_distance += .5
	return follow_position.distance_to(wanted_camera) * allowed / maxf(.001, length_value)
