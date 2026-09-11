extends RefCounted
## Drives the actual input pipeline before the world/camera exists. In release
## builds a null native Camera3D call can crash instead of raising a script error.
static func run(app: Node, path: String) -> void:
	var checks: Dictionary = {}
	await app.get_tree().process_frame
	checks["clicked_before_camera_exists"] = not is_instance_valid(app.world.camera)
	checks["loading_screen_visible"] = is_instance_valid(app.loading_layer) and not app.ui.visible
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		app.get_viewport().get_texture().get_image().save_png(path.get_basename()+"-loading.png")
	print("STARTUP_QA before_mouse camera_ready=", is_instance_valid(app.world.camera))
	for button: int in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
		for pressed: bool in [true, false]:
			var event: InputEventMouseButton = InputEventMouseButton.new()
			event.button_index = button
			event.pressed = pressed
			event.position = app.get_viewport().get_visible_rect().size * .5
			Input.parse_input_event(event)
			Input.flush_buffered_events()
	checks["early_mouse_survived"] = true
	for code: int in [KEY_W,KEY_TAB,KEY_ESCAPE]:
		for pressed: bool in [true,false]:
			var key: InputEventKey = InputEventKey.new()
			key.physical_keycode = code
			key.pressed = pressed
			Input.parse_input_event(key)
			Input.flush_buffered_events()
	checks["early_input_did_not_open_game_ui"] = not app.ui.visible and not is_instance_valid(app.active_dialog)
	print("STARTUP_QA after_mouse")
	while not is_instance_valid(app.world.camera) or not app.login.visible:
		await app.get_tree().process_frame
	checks["login_reached"] = true
	checks["game_ui_restored"] = app.ui.visible and app.startup_complete
	checks["service_npcs"] = app.world.actors.keys().filter(func(id: String): return id.begins_with("npc:")).size() == 12
	checks["world_surface_ready"] = app.world.final_environment.active_space == "surface"
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		app.get_viewport().get_texture().get_image().save_png(path.get_basename()+".png")
	var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	file.store_string(JSON.stringify({"ok":not checks.values().has(false),"checks":checks,"window":str(DisplayServer.window_get_size()),"adapter":RenderingServer.get_video_adapter_name()}))
	file.close()
	print("STARTUP_QA ", JSON.stringify(checks))
	app.get_tree().quit(0 if not checks.values().has(false) else 2)
