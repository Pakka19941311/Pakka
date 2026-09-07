class_name VarendorCameraController
extends Node

# One owner for the mouse capture lease and camera pose. Input routing is
# explicit: main._input forwards captured events; main._unhandled_input starts
# a lease only after GUI controls have had the chance to consume the click.
const MIN_PITCH: float = .25
const MAX_PITCH: float = 1.20
const MIN_ZOOM: float = 9.0
const MAX_ZOOM: float = 28.0
const BODY_CLEARANCE: float = 2.4
const CAMERA_RADIUS: float = .32
const SURFACE_GAP: float = .08
const FOLLOW_RESPONSE: float = 35.0
const ORBIT_RESPONSE: float = 38.0
const ZOOM_RESPONSE: float = 16.0

var yaw: float = 0.0
var pitch: float = .72
var distance: float = 21.0
var sensitivity: float = 1.0
var invert_y: bool = false
var captured: bool = false
var smoothed_yaw: float = 0.0
var smoothed_pitch: float = .72
var smoothed_distance: float = 21.0
var actual_distance: float = 21.0
var resolved_pitch: float = .72
var follow_position: Vector3 = Vector3.ZERO
var collision_limited: bool = false
var confined_space: bool = false

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
			yaw -= motion.x * .0045 * sensitivity
			pitch = clampf(pitch + motion.y * .0038 * sensitivity * (-1 if invert_y else 1), MIN_PITCH, MAX_PITCH)
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

func rotate_keyboard(amount: float) -> void:
	yaw += amount

func zoom(steps: float) -> void:
	distance = clampf(distance + steps * 1.5, MIN_ZOOM, MAX_ZOOM)

func reset_follow() -> void:
	# Explicit lifecycle reset for spawn/teleport only, never for snapshots.
	_pose_initialized = false

func update_pose(delta: float, hero_position: Vector3, jump_offset: float = 0.0) -> void:
	if not is_instance_valid(_camera) or not _height_at.is_valid() or delta <= 0:
		return
	pitch = clampf(pitch, MIN_PITCH, MAX_PITCH)
	distance = clampf(distance, MIN_ZOOM, MAX_ZOOM)
	var dt: float = minf(delta, .25)
	# Follow the already-rendered character exactly once. The short filter is
	# independent of server snapshots; jump influences the pivot by 45 percent.
	var target_pivot: Vector3 = hero_position + Vector3(0, 1.40 - jump_offset * .55, 0)
	var first_pose: bool = not _pose_initialized
	if first_pose:
		follow_position = target_pivot
		smoothed_yaw = yaw
		smoothed_pitch = pitch
		smoothed_distance = distance
		actual_distance = distance
		_pose_initialized = true
	else:
		follow_position = follow_position.lerp(target_pivot, 1.0 - exp(-FOLLOW_RESPONSE * dt))
		smoothed_yaw = lerp_angle(smoothed_yaw, yaw, 1.0 - exp(-ORBIT_RESPONSE * dt))
		smoothed_pitch = lerpf(smoothed_pitch, pitch, 1.0 - exp(-ORBIT_RESPONSE * dt))
		smoothed_distance = lerpf(smoothed_distance, distance, 1.0 - exp(-ZOOM_RESPONSE * dt))
	# Filtering across a convex corner must not put the arm origin inside it.
	var pivot_error: Vector3 = follow_position - target_pivot
	if pivot_error.length() > .001 and _collision != null:
		var pivot_clear: float = _collision.ray_distance(target_pivot, follow_position, CAMERA_RADIUS)
		if pivot_clear < pivot_error.length():
			follow_position = target_pivot + pivot_error.normalized() * maxf(0.0, pivot_clear - SURFACE_GAP)
	var ray: Vector3 = _orbit_direction(smoothed_yaw, smoothed_pitch)
	var permitted: float = _clear_distance(follow_position, ray, smoothed_distance)
	resolved_pitch = smoothed_pitch
	confined_space = false
	# Never force a minimum distance THROUGH a wall. If a close wall would put
	# the camera inside the hero, first seek a clear higher orbit above the head.
	if permitted < BODY_CLEARANCE:
		for index: int in range(1, 9):
			var candidate_pitch: float = lerpf(smoothed_pitch, 1.48, float(index) / 8.0)
			var candidate_ray: Vector3 = _orbit_direction(smoothed_yaw, candidate_pitch)
			var candidate_distance: float = _clear_distance(follow_position, candidate_ray, smoothed_distance)
			if candidate_distance >= BODY_CLEARANCE:
				ray = candidate_ray
				permitted = candidate_distance
				resolved_pitch = candidate_pitch
				break
		confined_space = permitted < BODY_CLEARANCE
	collision_limited = permitted < smoothed_distance - .01
	# Immediate obstruction contraction keeps the camera out of walls. Only the
	# return to its requested zoom is smoothed; smoothing both directions clips.
	actual_distance = permitted if permitted < actual_distance else lerpf(actual_distance, permitted, 1.0 - exp(-12.0 * dt))
	var desired: Vector3 = follow_position + ray * actual_distance
	# Clip the actual camera's frame-to-frame path too: orbit endpoints can both
	# be free while their chord cuts the corner of a wall or the side of a hill.
	if not first_pose and not confined_space and _camera.position.distance_to(desired) < 10.0:
		var displacement: Vector3 = desired - _camera.position
		if displacement.length() > .0001:
			var segment_clear: float = _clear_distance(_camera.position, displacement.normalized(), displacement.length())
			if segment_clear < displacement.length() - .001:
				var clipped: Vector3 = _camera.position + displacement.normalized() * segment_clear
				if clipped.distance_to(hero_position + Vector3(0, 1.0, 0)) >= 1.2:
					desired = clipped
	_camera.position = desired
	if _camera.position.distance_squared_to(target_pivot) > .0001:
		_camera.look_at(target_pivot)

func _orbit_direction(yaw_value: float, pitch_value: float) -> Vector3:
	return Vector3(sin(yaw_value) * cos(pitch_value), sin(pitch_value), cos(yaw_value) * cos(pitch_value))

func _clear_distance(origin: Vector3, direction: Vector3, length_value: float) -> float:
	var obstacle_distance: float = length_value
	if _collision != null:
		obstacle_distance = _collision.ray_distance(origin, origin + direction * length_value, CAMERA_RADIUS)
	var permitted: float = maxf(0.0, obstacle_distance - (SURFACE_GAP if obstacle_distance < length_value else 0.0))
	# Ground is part of the complete sweep, not an endpoint-only Y clamp that
	# could push the camera through a wall after the obstruction test.
	var count: int = maxi(1, ceili(permitted / .25))
	for index: int in range(1, count + 1):
		var sample_distance: float = permitted * float(index) / count
		var location: Vector3 = origin + direction * sample_distance
		var floor_height: float = float(_height_at.call(location.x, -location.z))
		if location.y - CAMERA_RADIUS < floor_height:
			return maxf(0.0, permitted * float(index - 1) / count - SURFACE_GAP)
	return permitted
