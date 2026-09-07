extends RefCounted

# Covers routing through the real main UI; controller-only tests cannot catch
# an exclusive embedded Window swallowing the root's RMB release event.
static func run(main: Node, tree: SceneTree) -> Dictionary:
	if DisplayServer.get_name() == "headless":
		return {"rmb_modal_gui_validation":"SKIPPED: headless has no OS cursor or window focus"}
	var controller: VarendorCameraController = main.world.camera_controller
	var viewport: Viewport = main.get_viewport()
	var original_position: Vector2 = viewport.get_mouse_position()
	var original_mode: Input.MouseMode = Input.mouse_mode
	if is_instance_valid(main.active_dialog):
		main.close_dialog()
	var anchor: Vector2 = viewport.get_visible_rect().size * Vector2(.27, .42)
	viewport.warp_mouse(anchor)
	await tree.process_frame
	await tree.process_frame
	var saved: Vector2 = viewport.get_mouse_position()
	var captured: bool = controller.begin_capture()
	await tree.process_frame
	main.system_menu()
	await tree.process_frame
	await tree.process_frame
	var checks: Dictionary = {
		"rmb_then_modal_releases_capture":captured and is_instance_valid(main.active_dialog) and not controller.captured and Input.mouse_mode == original_mode,
		"rmb_then_modal_restores_viewport_cursor":viewport.get_mouse_position().distance_to(saved) <= 2.0
	}
	main.close_dialog()
	await tree.process_frame
	# The old physical release may arrive after the modal closes. It must not
	# recapture the mouse or overwrite the pointer restored by opening the menu.
	var late_release: InputEventMouseButton = InputEventMouseButton.new()
	late_release.button_index = MOUSE_BUTTON_RIGHT
	late_release.pressed = false
	main._input(late_release)
	await tree.process_frame
	checks["rmb_release_after_modal_does_not_recapture_or_warp"] = not controller.captured and Input.mouse_mode == original_mode and viewport.get_mouse_position().distance_to(saved) <= 2.0
	viewport.warp_mouse(original_position)
	return checks
