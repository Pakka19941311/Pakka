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
	# Compare OS positions only with OS positions. Root viewport mouse state may
	# remain stale while an embedded modal owns motion delivery, so record it
	# for diagnostics and assert it after the root regains input ownership.
	var saved_os: Vector2i = DisplayServer.mouse_get_position()
	var captured: bool = controller.begin_capture()
	await tree.process_frame
	main.system_menu()
	await tree.process_frame
	await tree.process_frame
	var modal_os: Vector2i = DisplayServer.mouse_get_position()
	var modal_viewport: Vector2 = viewport.get_mouse_position()
	var checks: Dictionary = {
		"rmb_then_modal_releases_capture":captured and is_instance_valid(main.active_dialog) and not controller.captured and Input.mouse_mode == original_mode,
		"rmb_then_modal_restores_os_cursor":Vector2(modal_os).distance_to(Vector2(saved_os)) <= 2.0,
		"rmb_modal_pointer_coordinates":{"saved_viewport":[saved.x,saved.y],"saved_os":[saved_os.x,saved_os.y],"modal_viewport":[modal_viewport.x,modal_viewport.y],"modal_os":[modal_os.x,modal_os.y]}
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
	var released_os: Vector2i = DisplayServer.mouse_get_position()
	var released_viewport: Vector2 = viewport.get_mouse_position()
	checks.rmb_modal_pointer_coordinates["released_os"] = [released_os.x,released_os.y]
	checks.rmb_modal_pointer_coordinates["released_viewport"] = [released_viewport.x,released_viewport.y]
	checks["rmb_release_after_modal_does_not_recapture_or_warp"] = not controller.captured and Input.mouse_mode == original_mode and Vector2(released_os).distance_to(Vector2(saved_os)) <= 2.0 and released_viewport.distance_to(saved) <= 2.0
	viewport.warp_mouse(original_position)
	return checks
