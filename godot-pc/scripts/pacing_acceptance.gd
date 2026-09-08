extends RefCounted

# Only the affected snapshot/input/presentation boundary. Performance A/B uses
# a separate instrumented copy; no capture/ablation hook enters normal gameplay.
static func run(app: Node) -> void:
	var tree: SceneTree = app.get_tree()
	app.qa_interaction = true
	app.apply_settings()
	await tree.create_timer(.8).timeout
	var checks: Dictionary = {"connected":app.net.connected,"classes":app.data.classes.size(),"item_definitions":app.data.items.size(),"quick_slots":app.quick.size(),"bag_slots":app.bag_slots.size(),"equipment_slots":app.equipment_slots.size(),"native_render":DisplayServer.get_name()!="headless"}
	var license: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join("godot-license.txt"),FileAccess.WRITE)
	license.store_string(Engine.get_license_text()+"\n\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n\n"+JSON.stringify(Engine.get_license_info(),"  ")); license.close()
	checks.merge(await preload("res://scripts/network_qa.gd").run(tree,app.world.current_snapshot,app.qa_path.get_base_dir()))
	checks.merge(preload("res://scripts/player_input_qa.gd").run())
	checks.merge(preload("res://scripts/player_stop_qa.gd").run())
	checks.merge(preload("res://scripts/stop_anchor_qa.gd").run())
	checks.merge(preload("res://scripts/input_boundary_qa.gd").run(app))
	app.refresh_quick()
	var ids: Array = app.quick_buttons.map(func(slot): return slot.artwork.get_instance_id() if slot.artwork != null else 0)
	for i: int in 120: app.refresh_quick()
	checks["snapshot_refresh_keeps_icon_resource_identity"] = ids == app.quick_buttons.map(func(slot): return slot.artwork.get_instance_id() if slot.artwork != null else 0)
	var saved: Dictionary = app.quick[0].duplicate()
	app.quick[0].action = "skill:0"; app.refresh_quick()
	var skill_texture: Texture2D = app.quick_buttons[0].artwork
	app.quick[0].action = "attack"; app.refresh_quick()
	var changed: bool = app.quick_buttons[0].artwork != skill_texture
	app.quick[0].action = "skill:0"; app.refresh_quick()
	checks["reassigned_action_updates_and_reuses_correct_icon"] = changed and app.quick_buttons[0].artwork == skill_texture
	app.quick[0] = saved; app.refresh_quick()
	checks["twelve_npc_actors_survive_snapshot_refresh"] = VarendorNpcInteraction.SERVICES.keys().all(func(id): return app.world.actors.has(id))
	# Existing live stop checks include diagonal WASD, running with RMB rotation,
	# and click-to-move arrival, then observe the rendered pose after release.
	checks.merge(await preload("res://scripts/stopping_runtime_qa.gd").run(app))
	var camera: VarendorCameraController = app.world.camera_controller
	var distance_before: float = camera.distance
	var wheel: InputEventMouseButton = InputEventMouseButton.new()
	wheel.button_index = MOUSE_BUTTON_WHEEL_UP; wheel.pressed = true
	app.player_input.mouse(wheel)
	checks["zoom_changes_distance"] = camera.distance < distance_before
	camera.distance = distance_before
	var tab: InputEventKey = InputEventKey.new()
	tab.physical_keycode = KEY_TAB; tab.keycode = KEY_TAB; tab.pressed = true
	app.inventory_panel.hide(); app._unhandled_input(tab)
	checks["tab_inventory_opens"] = app.inventory_panel.visible
	app._unhandled_input(tab)
	checks["tab_inventory_closes"] = not app.inventory_panel.visible
	var monsters: Array = app.world.current_snapshot.monsters.filter(func(m): return m.alive and app.world.actors.has(str(m.uid)))
	var reserved: Array = []
	var listener: Callable = func(value: Dictionary,_sequence: int): reserved.append(value.duplicate(true))
	app.net.intent_reserved.connect(listener)
	app.world.target_id = str(monsters[0].uid)
	app.player_input.left_down = true
	var press: InputEventMouseButton = InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_RIGHT; press.pressed = true; press.position = Vector2(-10000,-10000)
	app.player_input.mouse(press)
	var release: InputEventMouseButton = InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT; release.pressed = false
	app.player_input.release_buttons(release)
	release.button_index = MOUSE_BUTTON_RIGHT
	app.player_input.release_buttons(release)
	checks["autoattack_target_latches"] = reserved.size()==1 and reserved[0].get("mode")=="auto" and reserved[0].get("entityId")==app.world.target_id
	app.net.intent_reserved.disconnect(listener)
	app.net.intent({"type":"cancel"}); app.world.target_id = ""
	app.world.weather.qa_override = {"hour":10.0,"daylight":1.0,"night":false,"fullMoon":false,"weather":"rain","clouds":.72}
	app.world.weather.daylight = 1.0
	app.qa_interaction = false; app.apply_settings()
	await tree.create_timer(.5).timeout
	checks["rain_active_and_visible"] = app.world.weather.rain.visible and app.world.weather.rain.emitting
	checks["camera_tracks_gameplay_root"] = app.world.camera.get_parent() == app.world
	checks["hud_present"] = app.hp.visible and app.quick_panel_node.visible
	var recorder = preload("res://scripts/frame_pacing_recorder.gd").new()
	recorder.app = app; recorder.directory = app.qa_path.get_base_dir().path_join("pacing-recorder")
	recorder.duration_seconds = .1; app.add_child(recorder); recorder.start_recording()
	await tree.create_timer(.35).timeout
	checks["owner_pc_capture_writes_frame_statistics"] = recorder.started == 0 and int(recorder.metadata.get("frames",0)) > 0
	recorder.queue_free()
	if checks.native_render:
		await RenderingServer.frame_post_draw
		app.get_viewport().get_texture().get_image().save_png(app.qa_path.get_basename()+".png")
	var success: bool = true
	for name: String in checks:
		if checks[name] is bool and name!="native_render" and not checks[name]: success = false
	var report: Dictionary = {"ok":success,"scope":"p0-frame-pacing","checks":checks,"display":DisplayServer.get_name(),"godot":Engine.get_version_info().string,"notes":"Snapshot framing/event ordering, cached artwork identity, live input/stop/target/HUD/rain regression only. Separate paired performance evidence; Linux software graphics and Windows headless do not establish the owner's Windows GPU frame pacing."}
	app.net.save_private_json(app.qa_path,report); print("VARENDOR_NATIVE_QA "+JSON.stringify(report))
	app.net.set_process(false); app.world.stop_audio()
	await app.net.request("/api/disconnect",{})
	app.net.stop_input_transport()
	preload("res://scripts/stopping_runtime_qa.gd").save_captures(app)
	await tree.process_frame
	tree.call_deferred("quit",0 if success else 2)
