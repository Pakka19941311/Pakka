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
	probe.setup(camera, collision, func(_x: float, _z: float) -> float: return 0.0)
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	var initial_position: Vector3 = camera.position
	probe.yaw = .6
	probe.pitch = .85
	probe.distance = 12.0
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_orbit_and_zoom_do_not_snap_to_goal"] = probe.smoothed_yaw > 0 and probe.smoothed_yaw < .6 and probe.smoothed_pitch > .72 and probe.smoothed_pitch < .85 and probe.smoothed_distance > 12 and probe.smoothed_distance < 21
	checks["camera_rotation_changes_pose"] = camera.position.distance_to(initial_position) > .05
	for frame: int in range(90):
		probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_short_smoothing_settles"] = absf(probe.smoothed_yaw - .6) < .001 and absf(probe.smoothed_distance - 12.0) < .001
	probe.zoom(-100)
	checks["camera_minimum_zoom_bound"] = is_equal_approx(probe.distance, CameraController.MIN_ZOOM)
	probe.zoom(100)
	checks["camera_maximum_zoom_bound"] = is_equal_approx(probe.distance, CameraController.MAX_ZOOM)
	probe.pitch = -100
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_pitch_lower_bound"] = is_equal_approx(probe.pitch, CameraController.MIN_PITCH)
	probe.pitch = 100
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_pitch_upper_bound"] = is_equal_approx(probe.pitch, CameraController.MAX_PITCH)
	probe.pitch = .72
	probe.yaw = 0
	probe.distance = 12
	probe.reset_follow()
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	var simulated_time: float = 0.0
	for frame: int in range(60):
		simulated_time += 1.0 / 60.0
		probe.update_pose(1.0 / 60.0, Vector3(simulated_time * 6.2, 0, 0))
	checks["camera_follow_latency_below_200mm_at_run_speed"] = absf(probe.follow_position.x - 6.2) < .2
	checks["camera_zoom_keeps_outside_hero"] = camera.position.distance_to(Vector3(6.2, 1.4, 0)) >= CameraController.MIN_ZOOM - .01

	# A wall behind the character must shorten the arm without forcing its
	# minimum distance through the surface; close walls seek an upper orbit.
	collision.setup([{"kind":"box", "x":0.0, "z":-4.0, "halfX":5.0, "halfZ":.3, "rotation":0.0, "bottom":0.0, "top":8.0}])
	probe.reset_follow()
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	var ray_length: float = probe.follow_position.distance_to(camera.position)
	checks["camera_wall_sweep_respects_clearance"] = probe.collision_limited and collision.ray_distance(probe.follow_position, camera.position, CameraController.CAMERA_RADIUS) >= ray_length - .001
	checks["camera_wall_does_not_put_camera_inside_hero"] = ray_length >= CameraController.BODY_CLEARANCE
	collision.setup([{"kind":"box", "x":0.0, "z":-1.8, "halfX":5.0, "halfZ":.25, "rotation":0.0, "bottom":0.0, "top":3.0}])
	probe.reset_follow()
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	ray_length = probe.follow_position.distance_to(camera.position)
	checks["camera_close_wall_uses_clear_upper_orbit"] = not probe.confined_space and probe.resolved_pitch > probe.smoothed_pitch and ray_length >= CameraController.BODY_CLEARANCE and collision.ray_distance(probe.follow_position, camera.position, CameraController.CAMERA_RADIUS) >= ray_length - .001

	collision.setup([])
	probe.setup(camera, collision, func(_x: float, z: float) -> float: return 4.0 if z < -4.0 and z > -6.0 else 0.0)
	probe.pitch = .25
	probe.reset_follow()
	probe.update_pose(1.0 / 60.0, Vector3.ZERO)
	checks["camera_sweeps_terrain_between_pivot_and_endpoint"] = probe.collision_limited and camera.position.z < 4.0
	parent.queue_free()
	return checks
