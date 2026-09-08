extends SceneTree

# The same actual native UI is checked standalone and against the packaged server.
# Geometry assertions supplement, and never replace, graphical screenshots.
func _initialize() -> void:
	call_deferred("standalone")

func standalone() -> void:
	root.size = Vector2i(1600,900)
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--ui-size="):
			var dimensions: PackedStringArray = argument.trim_prefix("--ui-size=").split("x")
			if dimensions.size() == 2:
				root.size = Vector2i(int(dimensions[0]),int(dimensions[1]))
	var app = Node3D.new()
	root.add_child(app)
	app.set_script(load("res://scripts/main.gd"))
	app.set_process(false)
	app.set_physics_process(false)
	app.set_process_input(false)
	app.set_process_unhandled_input(false)
	app.data = JSON.parse_string(FileAccess.get_file_as_string("res://generated/game.json"))
	app.quick = app.data.quickDefaults.duplicate(true)
	app.net = VarendorNetwork.new()
	app.world = VarendorWorld.new()
	app.world.data = app.data
	app.world.current_snapshot = {"time":1000,"monsters":[]}
	app.net.hero = {"id":"ui-fixture","name":"Странник","classId":"knight","level":8,"hp":642.2,"maxHp":1000,"mp":88.1,"maxMp":120,"xp":1234,"gold":1234567,"stats":{"str":12,"dex":6,"int":2,"def":32,"mdef":18},"inventory":[{"id":"potion","uid":"fixture:potion","plus":0,"count":6},{"id":"wardens_blade","uid":"fixture:blade","plus":4,"count":1},{"id":"weapon_scroll_normal","uid":"fixture:scroll","plus":0,"count":100}],"equipment":{"weapon":{"id":"wardens_blade","uid":"fixture:equipped","plus":1,"count":1}},"dead":false,"cooldowns":[0,0,0,0]}
	# Resolve the real catalog's scroll ID rather than fabricating a definition.
	for id: String in app.data.scrolls:
		if app.data.scrolls[id].category == "weapon" and app.data.scrolls[id].quality == "normal":
			app.net.hero.inventory[2].id = id
			break
	app.build_ui()
	app.login.hide()
	app.refresh_inventory()
	app.reference_hud.refresh(app.net.hero)
	var checks: Dictionary = await run(app)
	var success: bool = true
	for value in checks.values():
		if value is bool and not value: success = false
	print("VARENDOR_REFERENCE_UI_QA "+JSON.stringify({"ok":success,"checks":checks}))
	if DisplayServer.get_name() != "headless":
		app.inventory_panel.show()
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("/tmp/varendor-reference-ui.png")
	app.net.free()
	app.world.camera_controller.free()
	app.world.free()
	app.free()
	quit(0 if success else 1)

static func run(app: Node) -> Dictionary:
	var checks: Dictionary = {}
	# The live world can have every boss on its respawn timer. Render all real
	# catalog categories so string-valued boss flags cannot escape validation.
	var map_world: VarendorWorld = VarendorWorld.new()
	map_world.add_child(map_world.camera_controller)
	map_world.data = app.data
	map_world.current_snapshot = {"monsters":[],"character":{"x":-7,"z":-11}}
	for id: String in app.data.monsters:
		map_world.current_snapshot.monsters.append({"id":id,"alive":true,"x":10,"z":10})
	var map_probe: Control = load("res://scripts/reference_minimap.gd").new()
	map_probe.world = map_world
	map_probe.size = Vector2(214,164)
	app.ui.add_child(map_probe)
	await app.get_tree().process_frame
	await app.get_tree().process_frame
	checks["reference_minimap_renders_every_real_catalog_category"] = map_world.current_snapshot.monsters.size() == app.data.monsters.size()
	map_probe.queue_free()
	await app.get_tree().process_frame
	map_world.free()
	var hud: VarendorReferenceHud = app.reference_hud
	var previous_visible: bool = app.inventory_panel.visible
	var previous_full: bool = app.full_quick
	var previous_position: Vector2 = app.inventory_panel.position
	var previous_selected: Dictionary = app.selected_item.duplicate(true)
	var previous_scroll: Dictionary = app.selected_scroll.duplicate(true)
	var previous_slot: String = app.chosen_equipment
	app.selected_scroll = {}
	app.inventory_panel.show()
	app.full_quick = false
	app.refresh_quick()
	app.refresh_inventory()
	if not app.net.connected: hud.refresh(app.net.hero)
	else: await wait_presented_items(app)
	await app.get_tree().process_frame
	await app.get_tree().process_frame
	checks["reference_window_392x564"] = app.inventory_panel.size.is_equal_approx(Vector2(392,564))
	checks["reference_window_nonmodal_and_close_button"] = app.ui.mouse_filter == Control.MOUSE_FILTER_IGNORE and app.inventory_panel.find_child("CloseInventory",true,false) is Button
	checks["reference_nine_character_stats"] = app.stat_values.keys() == ["level","xp","hp","mp","str","dex","int","def","mdef"]
	var stats_bounds: Rect2 = hud.stats_scroll.get_global_rect()
	checks["reference_all_nine_stats_fit_without_scrolling"] = not hud.stats_scroll.get_v_scroll_bar().visible and hud.stats_scroll.scroll_vertical == 0
	for value: Label in app.stat_values.values():
		var row_bounds: Rect2 = value.get_parent().get_global_rect()
		checks.reference_all_nine_stats_fit_without_scrolling = checks.reference_all_nine_stats_fit_without_scrolling and stats_bounds.encloses(row_bounds) and row_bounds.encloses(value.get_global_rect())
	var expected_equipment: Array = ["ear1","head","ear2","neck","chest","offhand","weapon","belt","gloves","ring1","boots","ring2"]
	checks["reference_equipment_order_and_3x4_grid"] = app.equipment_slots.keys() == expected_equipment and hud.equipment_grid.columns == 3 and hud.equipment_grid.get_child_count() == 12
	checks["reference_bag_6x7_scrollable"] = hud.bag_grid.columns == 6 and hud.bag_grid.get_child_count() == 42 and hud.bag_scroll.size.y == 178 and hud.bag_scroll.get_v_scroll_bar().max_value > hud.bag_scroll.size.y
	checks["reference_hp_mp_ceil_and_fraction_format"] = app.stat_values.hp.text == "%d / %d" % [ceili(float(hud.display_hero().hp)),int(hud.display_hero().maxHp)] and app.stat_values.mp.text == "%d / %d" % [ceili(float(hud.display_hero().mp)),int(hud.display_hero().maxMp)]
	checks["reference_exact_stat_labels"] = hud.STAT_LAYOUT[7][1] == "Общая защита" and hud.STAT_LAYOUT[8][1] == "Магическая защита"
	checks["reference_hp_mp_xp_bar_heights"] = app.hp.size.y == 21 and app.mp.size.y == 21 and app.xp.size.y == 13
	checks["reference_centered_three_column_dock"] = is_equal_approx(hud.dock.position.x,(app.ui.size.x-756*hud.dock.scale.x)*.5) and app.quick_panel_node.position.x == 268 and hud.dock.get_node("QuickConsumables").position.x == 658
	checks["reference_quickbar_16_and_32_slots"] = app.quick_buttons.filter(func(slot: Control): return slot.visible).size() == 16 and app.quick_grid.columns == 8
	checks["reference_quick_slot_44x43"] = app.quick_buttons[0].size.is_equal_approx(Vector2(44,43))
	app.full_quick = true
	app.refresh_quick()
	await app.get_tree().process_frame
	checks["reference_quickbar_16_and_32_slots"] = checks.reference_quickbar_16_and_32_slots and app.quick_buttons.filter(func(slot: Control): return slot.visible).size() == 32
	checks["reference_expanded_dock_reserves_inventory_space"] = app.inventory_panel.get_global_rect().end.y <= hud.dock.position.y-13 and app.inventory_panel.get_global_rect().position.y >= 8
	checks["reference_minimap_left_and_log_width"] = hud.minimap.get_parent().position == Vector2(12,12) and hud.minimap.size == Vector2(178,128) and hud.log_panel.size.x == 290
	checks["reference_item_svg_silhouettes_exist"] = VarendorReferenceIcons.texture("sword") != null and VarendorReferenceIcons.texture("scroll") != null and VarendorReferenceIcons.texture("ear",true) != null
	checks["reference_tooltip_stat_number_format"] = hud.stat_number(0) == "0" and hud.stat_number(12.125) == "12,125" and hud.stat_number(15.5) == "15,5"
	checks["reference_gold_thousands_format"] = hud.number(1234567) == "1 234 567"
	var equipment_item: Dictionary = {}
	var equipment_index: int = -1
	for index: int in range(app.net.hero.inventory.size()):
		var item: Dictionary = app.net.hero.inventory[index]
		if app.data.items.get(item.id,{}).has("slot"):
			equipment_item = item
			equipment_index = index
			break
	if not equipment_item.is_empty():
		var model: Dictionary = hud.tooltip_model(equipment_item)
		checks["reference_hover_has_equipped_comparison"] = not model.comparisons.is_empty() and model.comparisons[0].has("equipped_rows") and model.comparisons[0].has("rows")
		var equipped_model: Dictionary = hud.tooltip_model(equipment_item,"equipment")
		checks["reference_equipped_tooltip_no_self_comparison"] = equipped_model.comparisons.is_empty() and "надето" in equipped_model.subtitle
		var before_sequence: int = app.net.sequence
		app.item_clicked(app.bag_slots[equipment_index].payload,false)
		checks["reference_single_click_selects_without_command"] = app.selected_item.item.uid == equipment_item.uid and app.net.sequence == before_sequence
		hud.show_tooltip(equipment_item,app.bag_slots[equipment_index])
		await app.get_tree().process_frame
		await app.get_tree().process_frame
		hud.fit_tooltip(app.bag_slots[equipment_index])
		checks["reference_tooltip_stays_inside_viewport"] = app.tooltip_panel.position.x >= 7.9 and app.tooltip_panel.position.y >= 7.9 and app.tooltip_panel.get_global_rect().end.x <= app.ui.size.x-7.9 and app.tooltip_panel.get_global_rect().end.y <= app.ui.size.y-7.9
		var before: Dictionary = equipment_item.duplicate(true)
		var stale: Dictionary = before.duplicate(true)
		stale.count += 1
		checks["reference_gestures_reject_changed_item_version"] = hud.has_item_version(before) and not hud.has_item_version(stale)
	var scroll_item: Dictionary = {}
	var scroll_index: int = -1
	for index: int in range(app.net.hero.inventory.size()):
		if app.data.scrolls.has(app.net.hero.inventory[index].id):
			scroll_item = app.net.hero.inventory[index]
			scroll_index = index
			break
	if not scroll_item.is_empty():
		var sequence: int = app.net.sequence
		app.item_clicked(app.bag_slots[scroll_index].payload,true)
		checks["reference_double_click_scroll_enters_target_mode"] = app.selected_scroll.get("uid","") == scroll_item.uid and hud.enhancement_banner.visible and not hud.stats_scroll.visible and app.net.sequence == sequence
		var rmb: InputEventMouseButton = InputEventMouseButton.new()
		rmb.button_index = MOUSE_BUTTON_RIGHT
		rmb.pressed = true
		app.bag_slots[scroll_index]._gui_input(rmb)
		checks["reference_rmb_cancels_enhancement_without_spending"] = app.selected_scroll.is_empty() and hud.stats_scroll.visible and app.net.sequence == sequence
	# In the packaged private fixture, exercise the UI double-click route itself.
	if app.net.connected and not app.net.hero.get("dead",true):
		var weapon = app.net.hero.equipment.get("weapon")
		if weapon is Dictionary:
			var original_uid: String = str(weapon.uid)
			var original_stats: Dictionary = app.net.hero.stats.duplicate(true)
			app.selected_scroll = {}
			app.refresh_inventory()
			double_click(app.equipment_slots.weapon)
			await finish_command(app)
			checks["reference_unequip_waits_for_presented_items"] = await wait_presented_items(app)
			var index: int = -1
			for i: int in range(app.net.hero.inventory.size()):
				if app.net.hero.inventory[i].uid == original_uid: index = i
			checks["reference_double_click_unequips_through_server"] = index >= 0 and not app.net.hero.equipment.get("weapon")
			if index >= 0:
				app.refresh_inventory()
				var unequipped: Dictionary = app.net.hero.inventory[index]
				var preview: Dictionary = hud.tooltip_model(unequipped)
				checks["reference_hover_compares_real_server_equipment"] = not preview.comparisons.is_empty() and preview.comparisons[0].selected
				if DisplayServer.get_name() != "headless":
					hud.show_tooltip(unequipped,app.bag_slots[index])
					await app.get_tree().process_frame
					hud.fit_tooltip(app.bag_slots[index])
					checks["reference_native_unequipped_comparison_png_saved"] = await capture(app,"unequipped-comparison")
				double_click(app.bag_slots[index])
				await finish_command(app)
				checks["reference_reequip_waits_for_presented_items"] = await wait_presented_items(app)
				checks["reference_double_click_reequips_same_uid_and_stats"] = app.net.hero.equipment.get("weapon",{}).get("uid","") == original_uid and app.net.hero.stats == original_stats
	var old_dead: bool = app.net.hero.dead
	app.net.hero.dead = true
	hud.refresh_inventory_state()
	checks["reference_dead_character_inventory_is_readonly"] = "только просмотр" in hud.inventory_status.text and app.selected_scroll.is_empty() and hud.inventory_actions.get_children().all(func(action: Button): return action.disabled)
	app.net.hero.dead = old_dead
	if DisplayServer.get_name() != "headless":
		app.full_quick = false
		app.refresh_quick()
		app.selected_scroll = {}
		app.inventory_panel.show()
		if is_instance_valid(app.tooltip_panel): app.tooltip_panel.hide()
		checks["reference_native_inventory_png_saved"] = await capture(app,"inventory")
		app.inventory_panel.hide()
		checks["reference_native_hud_png_saved"] = await capture(app,"hud")
		app.inventory_panel.show()
		if not equipment_item.is_empty():
			hud.show_tooltip(equipment_item,app.bag_slots[equipment_index])
			await app.get_tree().process_frame
			hud.fit_tooltip(app.bag_slots[equipment_index])
			checks["reference_native_comparison_png_saved"] = await capture(app,"comparison")
		checks["reference_native_ui_graphical_capture"] = true
	else: checks["reference_native_ui_graphical_capture"] = "SKIPPED: headless has no graphical evidence"
	if is_instance_valid(app.tooltip_panel):
		app.tooltip_panel.queue_free()
		app.tooltip_panel = null
	app.full_quick = previous_full
	app.selected_item = previous_selected
	app.selected_scroll = previous_scroll
	app.chosen_equipment = previous_slot
	app.refresh_quick()
	app.refresh_inventory()
	app.inventory_panel.position = previous_position
	app.inventory_panel.visible = previous_visible
	return checks

static func capture(app: Node, name_value: String) -> bool:
	await app.get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image: Image = app.get_viewport().get_texture().get_image()
	var directory: String = app.qa_path.get_base_dir() if not app.qa_path.is_empty() else "/tmp"
	var path: String = directory.path_join("reference-native-"+name_value+".png")
	var saved: bool = image.save_png(path) == OK
	var preview: Image = image.duplicate()
	if preview.get_width() > 1280: preview.resize(1280,roundi(float(preview.get_height())*1280/preview.get_width()),Image.INTERPOLATE_LANCZOS)
	var encoded: String = Marshalls.raw_to_base64(preview.save_jpg_to_buffer(.88))
	var chunks: int = ceili(float(encoded.length())/40000)
	for index: int in range(chunks):
		print("VARENDOR_REFERENCE_UI_JPG_PART %s %d/%d %s" % [name_value,index+1,chunks,encoded.substr(index*40000,40000)])
	return saved

static func double_click(slot: VarendorItemSlot) -> void:
	var event: InputEventMouseButton = InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.double_click = true
	event.position = slot.size*.5
	event.pressed = true
	slot._gui_input(event)
	event.pressed = false
	slot._gui_input(event)

static func finish_command(app: Node) -> void:
	var until: int = Time.get_ticks_msec()+5000
	await app.get_tree().process_frame
	while app.net.command_busy and Time.get_ticks_msec()<until:
		await app.get_tree().process_frame
	await app.get_tree().process_frame

static func wait_presented_items(app: Node) -> bool:
	var until: int = Time.get_ticks_msec()+2000
	while Time.get_ticks_msec()<until:
		var view: Dictionary = app.reference_hud.display_hero()
		if view.get("inventory",[]) == app.net.hero.get("inventory",[]) and view.get("equipment",{}) == app.net.hero.get("equipment",{}):
			app.refresh_inventory()
			return true
		await app.get_tree().process_frame
	return false
