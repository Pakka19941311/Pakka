extends RefCounted

const Shots = preload("res://scripts/territory_acceptance.gd")

static func key(code: int, down: bool = true) -> InputEventKey:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = code; event.keycode = code; event.pressed = down
	return event

static func mouse(code: int, down: bool, point: Vector2) -> InputEventMouseButton:
	var event: InputEventMouseButton = InputEventMouseButton.new()
	event.button_index = code; event.pressed = down; event.position = point
	return event

static func run(app: Node) -> void:
	var tree: SceneTree = app.get_tree()
	app.qa_interaction = true; app.apply_settings()
	await tree.create_timer(.8).timeout
	var checks: Dictionary = {"connected":app.net.connected,"classes":app.data.classes.size(),"item_definitions":app.data.items.size(),"quick_slots":app.quick.size(),"bag_slots":app.bag_slots.size(),"equipment_slots":app.equipment_slots.size(),"native_render":DisplayServer.get_name()!="headless"}
	var license: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join("godot-license.txt"),FileAccess.WRITE)
	license.store_string(Engine.get_license_text()+"\n\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n\n"+JSON.stringify(Engine.get_license_info(),"  ")); license.close()
	var original_size: Vector2i = DisplayServer.window_get_size()
	app.load_preferences(str(app.net.hero.id))
	await tree.process_frame
	checks["profile_does_not_resize_window"] = DisplayServer.window_get_size() == original_size
	checks["startup_defaults_to_screen"] = int(ProjectSettings.get_setting("display/window/size/mode")) == 3 and int(app.polish.startup_display.display) == 1
	checks["twelve_services_survive_snapshots"] = VarendorNpcInteraction.SERVICES.size()==12 and VarendorNpcInteraction.SERVICES.keys().all(func(id): return app.world.actors.has(id))
	var mini: Control = app.reference_hud.minimap.get_parent()
	checks["minimap_and_quest_top_right"] = mini.position.x>app.ui.size.x*.7 and absf(app.reference_hud.region_panel.size.x-mini.size.x)<.1 and absf(app.reference_hud.region_panel.position.y-mini.get_rect().end.y-3)<.1
	# Native K and M keys, while the same live server continues moving the hero.
	app._unhandled_input(key(KEY_K))
	app._unhandled_input(key(KEY_M))
	await tree.create_timer(.18).timeout
	var before: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	await tree.create_timer(.4).timeout
	checks["autorun_continues_with_m_map"] = app.player_input.autorun and is_instance_valid(app.polish.atlas) and not app.text_focused() and Vector2(app.net.hero.x,app.net.hero.z).distance_to(before)>.3
	checks["map_bottom_clock_and_sliders"] = app.polish.atlas_clock.text.contains("Сервер") and app.polish.atlas.find_children("*","HSlider",true,false).size()==2
	app._unhandled_input(key(KEY_K))
	await tree.create_timer(.15).timeout
	await Shots.capture(app,"polish-map")
	app._input(key(KEY_M)); await tree.process_frame
	checks["map_closes_on_m"] = not is_instance_valid(app.polish.atlas)
	# Test both-button release latching at the native input boundary. The server
	# attack/damage/resume semantics are covered by polish-server.test.mjs.
	var reserved: Array = []
	var listener: Callable = func(value: Dictionary,_sequence: int): reserved.append(value.duplicate(true))
	app.net.intent_reserved.connect(listener)
	app.world.target_id = str(app.world.current_snapshot.monsters.filter(func(m): return m.alive and app.world.actors.has(str(m.uid)))[0].uid)
	app.player_input.left_down = true
	app.player_input.mouse(mouse(MOUSE_BUTTON_RIGHT,true,Vector2(-10000,-10000)))
	app.player_input.release_buttons(mouse(MOUSE_BUTTON_LEFT,false,Vector2.ZERO))
	var held: bool = reserved.is_empty()
	app.player_input.release_buttons(mouse(MOUSE_BUTTON_RIGHT,false,Vector2.ZERO))
	checks["chord_latches_only_after_both_released"] = held and reserved.size()==1 and reserved[0].get("mode")=="auto" and not app.world.camera_controller.captured
	app.net.intent_reserved.disconnect(listener)
	app.net.intent({"type":"cancel"}); app.world.target_id = ""
	await tree.create_timer(.3).timeout
	checks["storage_npc_reachable"] = await Shots.walk(app,Vector2(-7,-12),20)
	# Every type of item/action cell is measured after the containers lay out.
	app.polish.open_storage()
	await tree.create_timer(.25).timeout
	var deposited: Dictionary = app.net.hero.inventory[0].duplicate()
	app.drop_item({"kind":"bag","item":deposited},{"kind":"storage","index":499})
	await tree.create_timer(.5).timeout
	checks["native_storage_transfer_keeps_uid"] = app.net.hero.storage.size()==500 and app.net.hero.storage[499] is Dictionary and app.net.hero.storage[499].uid==deposited.uid and not app.net.hero.inventory.any(func(item): return item.uid==deposited.uid)
	var cells: Array = app.bag_slots.duplicate()
	cells.append_array(app.equipment_slots.values()); cells.append_array(app.quick_buttons.slice(0,16)); cells.append_array(app.polish.storage_slots.slice(0,16)); cells.append_array(app.reference_hud.potion_buttons.values())
	checks["uniform_44_square_cells"] = cells.all(func(cell): return cell.size.is_equal_approx(VarendorInterfacePolish.CELL))
	checks["warehouse_500_slots"] = app.polish.storage_slots.size()==500
	checks["compact_inventory_fits"] = app.inventory_panel.size.is_equal_approx(VarendorReferenceHud.WINDOW_SIZE) and Rect2(Vector2.ZERO,app.ui.size).encloses(app.inventory_panel.get_rect())
	var action_before: String = app.quick[0].action
	app.polish.drop_quick({"kind":"catalog","action":"haste"},1)
	app.polish.drop_quick({"kind":"quick","index":1,"action":"haste"},0)
	checks["quick_actions_drag_swap"] = app.quick[0].action=="haste" and app.quick[1].action==action_before
	var item: Dictionary = app.net.hero.inventory[0].duplicate()
	var count_before: int = app.net.hero.inventory.size()
	app.polish.drop_quick({"kind":"bag","item":item},2)
	app.polish.drag_cancelled = false
	# A pointer outside the dock clears the binding only; never sends item loss.
	var old_position: Vector2 = app.quick_panel_node.position
	app.quick_panel_node.position = Vector2(4000,4000)
	app.polish.finish_quick_drag(2,false)
	app.quick_panel_node.position = old_position
	checks["drag_out_clears_shortcut_only"] = app.quick[2].action=="" and app.net.hero.inventory.size()==count_before
	app.quick[31] = {"action":"potion","key":"Shift+KeyG"}; app.save_preferences()
	await Shots.capture(app,"polish-inventory-storage")
	app.polish.storage_panel.queue_free(); app.polish.storage_panel = null; app.inventory_panel.hide()
	app.controls_dialog()
	await tree.create_timer(.2).timeout
	var tabs: TabContainer = app.active_dialog.find_children("*","TabContainer",true,false)[0]
	tabs.current_tab = 1
	await tree.create_timer(.2).timeout
	var scroll: ScrollContainer = app.active_dialog.find_child("DialogScroll",true,false)
	checks["settings_fit_and_scroll"] = Rect2(Vector2.ZERO,app.ui.size).encloses(app.active_dialog.get_rect()) and scroll.get_v_scroll_bar().max_value>scroll.size.y
	scroll.scroll_vertical = 1000
	await tree.create_timer(.15).timeout
	checks["settings_last_options_reachable"] = scroll.scroll_vertical>0
	await Shots.capture(app,"polish-settings")
	app.close_dialog()
	app.polish.chat_channel = "world"; app.reference_hud.chat.text = "Проверка мирового чата"; app.polish.send_chat()
	await tree.create_timer(.5).timeout
	checks["chat_message_round_trip"] = app.polish.chat_messages.any(func(entry): return str(entry.text)=="Проверка мирового чата" and str(entry.senderId)==str(app.net.hero.id))
	app.polish.layout_data.chat = {"position":[18,260],"size":[350,230],"opacity":.55,"locked":true}
	app.polish.save_layout(); app.load_preferences(str(app.net.hero.id)); await tree.process_frame
	checks["chat_layout_opacity_lock_persist"] = app.polish.layout_data.chat.locked and absf(app.polish.chat_opacity.value-.55)<.01 and app.polish.chat_box.size.is_equal_approx(Vector2(350,230))
	# Isolated visual fixtures exercise the actual exported rigs, fade materials
	# and sky shader. World cycle/spawn/loot assertions use server time tests.
	app.world.set_process(false)
	var camera: Camera3D = app.world.camera
	camera.position = app.world.point(-12,-12,3.4)
	camera.look_at(app.world.point(70,28,38))
	app.world.weather.qa_override = {"hour":8,"daylight":1,"night":false,"weather":"sun","clouds":.2,"fullMoon":false}
	app.world.weather.daylight = 1
	await tree.create_timer(.3).timeout
	checks["sky_shader_active"] = app.world.world_environment.sky.sky_material==app.world.weather.sky_material
	await Shots.capture(app,"polish-day")
	app.world.weather.qa_override.weather = "rain"; app.world.weather.qa_override.clouds = .9
	await tree.create_timer(1).timeout
	checks["day_rain_emitting"] = app.world.weather.rain.emitting
	await Shots.capture(app,"polish-rain")
	app.world.weather.qa_override = {"hour":20,"daylight":0,"night":true,"weather":"clouds","clouds":.2,"fullMoon":true}
	camera.position = app.world.point(-12,-22,3.4)
	camera.look_at(app.world.point(70,-62,38))
	app.world.weather.daylight = 0
	await tree.create_timer(.3).timeout
	checks["moon_night_light"] = app.world.weather.current.fullMoon and app.world.sun_light.light_energy<.4 and not app.world.weather.rain.emitting
	await Shots.capture(app,"polish-night")
	var fox: Node3D = app.world.make_actor("qa:fox","Fox",2.05,"",Color.WHITE)
	var animator: VarendorAnimationController = fox.get_meta("animation_controller")
	animator.prefer_run = true
	animator.update({"alive":true,"hp":10,"action":"walk"},Vector3(3.6,0,0),1000,.1)
	checks["fox_uses_running_clip_at_movement_speed"] = animator.state=="run" and animator.playback_rate>1.2
	animator.begin_death(1000,4000)
	app.world.update_corpse_fade(fox,animator,2500)
	checks["corpse_half_alpha_at_1_5_seconds"] = fox.has_meta("fade_materials") and not fox.get_meta("fade_materials").is_empty() and fox.get_meta("fade_materials").all(func(entry): return absf(entry.material.albedo_color.a-float(entry.alpha)*.5)<.01)
	fox.queue_free(); app.world.actors.erase("qa:fox")
	if checks.native_render:
		await RenderingServer.frame_post_draw
		app.get_viewport().get_texture().get_image().save_png(app.qa_path.get_basename()+".png")
	var success: bool = true
	for name: String in checks:
		if checks[name] is bool and name!="native_render" and not checks[name]: success = false
	var report: Dictionary = {"ok":success,"scope":"pc-polish-19","checks":checks,"display":DisplayServer.get_name(),"godot":Engine.get_version_info().string,"notes":"Only the agreed gameplay/UI/world follow-up. Live native HTTP/SSE and exported controls; weather/rig visual fixtures are explicit. Server clock, combat, loot and persistence have separate targeted tests. Linux Mesa graphics; Windows headless does not test Windows GPU."}
	app.net.save_private_json(app.qa_path,report); print("VARENDOR_NATIVE_QA "+JSON.stringify(report))
	app.net.set_process(false); app.world.stop_audio()
	await app.net.request("/api/disconnect",{})
	app.net.stop_input_transport(); await tree.process_frame
	tree.quit(0 if success else 2)
