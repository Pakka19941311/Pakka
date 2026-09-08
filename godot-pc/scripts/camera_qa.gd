extends RefCounted

const CameraController = preload("res://scripts/camera_controller.gd")

# Runtime validation exercises the actual capture mode and OS cursor whenever
# a graphical display exists. parse_input_event alone cannot prove cursor warp:
# https://docs.godotengine.org/en/4.6/classes/class_input.html
static func run(controller: CameraController, tree: SceneTree) -> Dictionary:
	var checks: Dictionary = {}
	var original_yaw: float = controller.yaw
	var original_pitch: float = controller.pitch
	var original_distance: float = controller.distance
	var original_mode: Input.MouseMode = Input.mouse_mode
	var original_accumulation: bool = Input.use_accumulated_input
	var viewport: Viewport = controller.get_viewport()
	var original_cursor: Vector2 = viewport.get_mouse_position()
	var graphical: bool = DisplayServer.get_name() != "headless"
	checks["camera_gui_backend"] = DisplayServer.get_name()
	if graphical:
		var twenty_restores: bool = true
		var two_axes: bool = true
		var duplicate_press_safe: bool = true
		var bounds: Rect2 = viewport.get_visible_rect()
		for cycle: int in range(20):
			var saved: Vector2 = bounds.position + bounds.size * Vector2(.25 + float(cycle % 5) * .10, .32 + float(cycle % 3) * .12)
			viewport.warp_mouse(saved)
			await tree.process_frame
			await tree.process_frame
			var received: Vector2 = viewport.get_mouse_position()
			twenty_restores = twenty_restores and received.distance_to(saved) <= 2.0
			var yaw_before: float = controller.yaw
			var pitch_before: float = controller.pitch
			var started: bool = controller.begin_capture(received)
			duplicate_press_safe = duplicate_press_safe and not controller.begin_capture(Vector2.ZERO)
			await tree.process_frame
			var motion: InputEventMouseMotion = InputEventMouseMotion.new()
			motion.screen_relative = Vector2(4, 3 if cycle % 2 == 0 else -3)
			var handled: bool = controller.handle_captured_input(motion)
			two_axes = two_axes and started and handled and not is_equal_approx(yaw_before, controller.yaw) and not is_equal_approx(pitch_before, controller.pitch)
			var release: InputEventMouseButton = InputEventMouseButton.new()
			release.button_index = MOUSE_BUTTON_RIGHT
			release.pressed = false
			controller.handle_captured_input(release)
			await tree.process_frame
			await tree.process_frame
			twenty_restores = twenty_restores and not controller.captured and Input.mouse_mode == original_mode and viewport.get_mouse_position().distance_to(received) <= 2.0
		checks["rmb_20_os_cursor_restores"] = twenty_restores
		checks["rmb_20_two_axis_relative_input"] = two_axes
		checks["rmb_duplicate_press_preserves_origin"] = duplicate_press_safe
		checks["rmb_restores_accumulation_mode"] = Input.use_accumulated_input == original_accumulation

		# A deferred release from lease A may not consume lease B's saved cursor.
		var point_a: Vector2 = bounds.size * Vector2(.33, .37)
		var point_b: Vector2 = bounds.size * Vector2(.63, .57)
		controller.begin_capture(point_a)
		controller.release_capture()
		controller.begin_capture(point_b)
		await tree.process_frame
		var recaptured: bool = controller.captured and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
		controller.release_capture()
		await tree.process_frame
		await tree.process_frame
		checks["rmb_deferred_release_cannot_steal_new_lease"] = recaptured and viewport.get_mouse_position().distance_to(point_b) <= 2.0

		controller.begin_capture(viewport.get_mouse_position())
		controller._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
		await tree.process_frame
		checks["rmb_focus_loss_releases_capture"] = not controller.captured and Input.mouse_mode == original_mode
		var position_after_focus: Vector2 = viewport.get_mouse_position()
		controller.release_capture()
		await tree.process_frame
		checks["rmb_stale_release_does_not_warp_after_focus_loss"] = viewport.get_mouse_position().distance_to(position_after_focus) <= 2.0
		viewport.warp_mouse(original_cursor)
	else:
		checks["rmb_gui_validation"] = "SKIPPED: headless has no OS cursor; graphical run required"

	controller.yaw = original_yaw
	controller.pitch = original_pitch
	controller.distance = original_distance
	controller.reset_follow()

	# Deterministic geometry/response validation uses the production controller
	# against isolated obstacle fixtures, without moving the live player/world.
	var parent: Node3D = Node3D.new()
	tree.root.add_child(parent)
	var camera: Camera3D = Camera3D.new()
	parent.add_child(camera)
	camera.current = false
	var collision: VarendorCollision = VarendorCollision.new()
	collision.setup([])
	var probe: CameraController = CameraController.new()
	parent.add_child(probe)
	var terrain: Dictionary = {"height":0.0}
	probe.setup(camera, collision, func(_x: float, _z: float) -> float: return float(terrain.height))
	var reference_positions: bool = true
	var reference_targets: bool = true
	var reference_angles: bool = true
	var reference_radius: bool = true
	var reference_movement: bool = true
	for frame: Dictionary in JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-camera-mixed-trace.json")).frames:
		if frame.has("configure"): probe.configure(frame.configure)
		if frame.has("orbit"): probe.orbit(Vector2(frame.orbit.x, frame.orbit.y))
		if frame.has("wheel"): probe.zoom(float(frame.wheel))
		terrain.height = frame.p.y
		probe.update_pose(float(frame.dt), Vector3(frame.p.x, frame.p.y, -frame.p.z))
		var expected: Dictionary = frame.expected
		var expected_focus: Vector3 = Vector3(expected.focus[0], expected.focus[1], -expected.focus[2])
		var expected_position: Vector3 = Vector3(expected.position[0], expected.position[1], -expected.position[2])
		reference_positions = reference_positions and camera.position.distance_to(expected_position) < .0001
		reference_targets = reference_targets and probe.follow_position.distance_to(expected_focus) < .0001
		reference_angles = reference_angles and absf(angle_difference(probe.smoothed_yaw, float(expected.alpha) + PI / 2.0)) < .00001 and absf(probe.smoothed_pitch - (PI / 2.0 - float(expected.beta))) < .00001
		reference_radius = reference_radius and absf(probe.actual_distance - float(expected.radius)) < .00001
		var expected_forward: Vector2 = Vector2(-cos(float(expected.alpha)), -sin(float(expected.alpha)))
		reference_movement = reference_movement and probe.movement_direction(Vector2.DOWN).distance_to(expected_forward) < .00001
	checks["reference_camera_position_matches_browser_trace"] = reference_positions
	checks["reference_camera_lookahead_and_focus_match_browser_trace"] = reference_targets
	checks["reference_camera_yaw_pitch_match_browser_trace"] = reference_angles
	checks["reference_camera_zoom_and_recovery_match_browser_trace"] = reference_radius
	checks["reference_movement_uses_rendered_camera_angle"] = reference_movement

	probe.configure({"mouseSensitivity":1.0,"zoomSensitivity":1.0,"smoothing":1.0,"invertY":false})
	probe.distance = 10.5
	probe.zoom(-100)
	checks["reference_wheel_notch_changes_desired_zoom_by_065"] = is_equal_approx(probe.distance,9.85)
	probe.zoom(1000)
	checks["reference_wheel_event_is_capped_at_240"] = is_equal_approx(probe.distance,11.41)
	for step: int in range(10): probe.zoom(-240)
	checks["camera_minimum_zoom_bound"] = is_equal_approx(probe.distance,5.5)
	for step: int in range(10): probe.zoom(240)
	checks["camera_maximum_zoom_bound"] = is_equal_approx(probe.distance,18.0)
	probe.pitch = -100
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_pitch_lower_bound"] = is_equal_approx(probe.pitch,PI / 2.0 - 1.36)
	probe.pitch = 100
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_pitch_upper_bound"] = is_equal_approx(probe.pitch,PI / 2.0 - .72)
	probe.pitch = CameraController.DEFAULT_PITCH
	probe.yaw = 0
	probe.distance = 10.5
	terrain.height = 0.0
	probe.reset_follow()
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	var grounded_position: Vector3 = camera.position
	probe.update_pose(1.0 / 60.0, Vector3(0,2.5,0),2.5)
	checks["reference_jump_does_not_pull_camera_vertical_focus"] = camera.position.distance_to(grounded_position) < .00001 and is_equal_approx(probe.follow_position.y,1.35)
	probe.update_pose(1.0 / 60.0, Vector3(6.2,0,0))
	checks["reference_horizontal_follow_has_no_second_filter"] = is_equal_approx(probe.follow_position.x,6.2) and is_equal_approx(probe.follow_position.z,-2.15)
	checks["reference_default_camera_framing_matches_distance_and_pitch"] = is_equal_approx(probe.actual_distance,10.5) and is_equal_approx(probe.smoothed_pitch,PI/2.0 - 1.06)

	collision.setup([{"kind":"box", "x":0.0, "z":-4.0, "halfX":5.0, "halfZ":.3, "rotation":0.0, "bottom":0.0, "top":8.0}])
	probe.reset_follow()
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["reference_camera_body_origin_wall_probe_contracts_immediately"] = probe.collision_limited and probe.actual_distance < 10.5 and camera.position.z < 3.48
	checks["reference_camera_obstruction_does_not_invent_upper_orbit"] = is_equal_approx(probe.smoothed_pitch, CameraController.DEFAULT_PITCH)
	var obstructed_distance: float = probe.actual_distance
	collision.setup([])
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["reference_camera_obstruction_recovery_response_is_7"] = absf(probe.actual_distance - lerpf(obstructed_distance,10.5,1.0-exp(-7.0/60.0))) < .00001

	probe.setup(camera, collision, func(_x: float, z: float) -> float: return 4.0 if z < -4.0 and z > -6.0 else 0.0)
	probe.pitch = CameraController.MIN_PITCH
	probe.reset_follow()
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_sweeps_terrain_between_body_and_endpoint"] = probe.collision_limited and camera.position.z < 4.0
	parent.queue_free()
	return checks
