extends RefCounted

static func until(app: Node, check: Callable, ms: int = 8000) -> bool:
	var end: int = Time.get_ticks_msec()+ms
	while Time.get_ticks_msec()<end:
		await app.get_tree().process_frame
		if check.call(): return true
	return false

static func capture(app: Node, name: String) -> void:
	if DisplayServer.get_name() == "headless": return
	await RenderingServer.frame_post_draw
	app.get_viewport().get_texture().get_image().save_png(app.qa_path.get_base_dir().path_join(name+".png"))

static func click_button(app: Node, caption: String) -> bool:
	if not is_instance_valid(app.active_dialog): return false
	for button: Button in app.active_dialog.find_children("*","Button",true,false):
		if button.text == caption and not button.disabled: button.pressed.emit(); return true
	return false

static func run(app: Node) -> void:
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(1600,900))
	var checks: Dictionary = {"native_render":DisplayServer.get_name() != "headless"}
	checks.connected = await until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	if checks.connected:
		app.login.hide(); app.close_dialog(); app.inventory_panel.hide()
		checks.no_free_skills = app.quick.all(func(slot: Dictionary): return not str(slot.action).begins_with("skill:"))
		checks.all_item_icons = true
		for id: String in app.data.items:
			var texture: Texture2D = app.book_ui.item_icon({"id":id})
			if texture == null or texture.get_width()<32: checks.all_item_icons = false
		checks.all_effect_icons = true
		for id: String in app.data.books:
			if VarendorBookUI.icon(id,true) == null: checks.all_effect_icons = false
		app.book_ui.shop_classes()
		await capture(app,"content-shop-classes")
		checks.class_menu = click_button(app,"Рыцарь")
		for level: int in [10,20,30,40]:
			var id: String = "book_knight_%d" % level
			var price: int = int(app.data.books[id].price)
			checks["buy_%d" % level] = click_button(app,"%d серебра" % price)
			checks["owned_%d" % level] = await until(app,func(): return app.book_ui.owns(id))
			await until(app,func(): return not app.net.command_busy)
		checks.exact_prices = int(app.net.hero.gold) == 28000
		await capture(app,"content-books-owned")
		app.close_dialog()
		for index: int in range(6):
			var id: String = "book_knight_%d" % ((index+1)*10)
			var item: Dictionary = {}
			for value: Dictionary in app.net.hero.inventory:
				if value.id == id: item = value
			app.polish.drop_quick({"kind":"bag","item":item},index)
		checks.bag_to_quickbar = app.quick[0].action == "book_knight_10" and app.quick[5].action == "book_knight_60"
		app.activate("book_knight_20")
		checks.buff_20 = await until(app,func(): return app.net.hero.get("bookCooldowns",{}).has("book_knight_20"))
		checks.ready_for_buff_30 = await until(app,func(): return not app.net.command_busy and float(app.net.hero.get("bookCastReadyAt",0))+50 <= float(app.world.current_snapshot.time))
		app.activate("book_knight_30")
		checks.buff_30 = await until(app,func(): return app.net.hero.get("bookCooldowns",{}).has("book_knight_30"))
		app.activate("haste")
		checks.haste_first = await until(app,func(): return app.book_ui.effect_cells.keys() == ["book_knight_30","book_knight_20","haste"])
		app.inventory_panel.show(); app.refresh_inventory()
		await capture(app,"content-buffs-inventory")
		app.inventory_panel.hide()
		var marker: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join("phase.json"),FileAccess.WRITE)
		marker.store_string('{"stage":"combat"}');marker.close()
		checks.combat_fixture = await until(app,func(): return absf(float(app.net.hero.x)+75)<2 and absf(float(app.net.hero.z)-5)<2,15000)
		var target: String = str(app.world.current_snapshot.monsters[0].uid)
		app.world.target_id = target
		app.activate("attack")
		checks.ready_for_direct_book = await until(app,func(): return not app.net.command_busy and float(app.net.hero.get("bookCastReadyAt",0))+50 <= float(app.world.current_snapshot.time))
		app.activate("book_knight_10")
		checks.direct_book = await until(app,func(): return app.net.hero.get("bookCooldowns",{}).has("book_knight_10"))
		checks.integer_cooldown = await until(app,func():
			app.refresh_quick()
			return app.quick_buttons[0].remaining > 0 and app.quick_buttons[0].remaining <= 5,2000)
		await capture(app,"content-combat-cooldown")
		await app.get_tree().create_timer(6).timeout
		app.refresh_quick(); checks.cooldown_ready = app.quick_buttons[0].remaining <= 0
		await app.net.intent({"type":"cancel"})
		await capture(app,"content-combat-ready")
	var license_file: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join("godot-license.txt"),FileAccess.WRITE)
	license_file.store_string(Engine.get_license_text()+"\n"+JSON.stringify(Engine.get_license_info(),"  "));license_file.close()
	var ok: bool = true
	for key: String in checks:
		if key != "native_render" and not checks[key]: ok = false
	var file: FileAccess = FileAccess.open(app.qa_path,FileAccess.WRITE)
	file.store_string(JSON.stringify({"scope":"content-v3","ok":ok,"checks":checks},"  "));file.close()
	app.net.set_process(false)
	app.world.stop_audio()
	await app.net.request("/api/disconnect",{})
	await app.get_tree().process_frame
	app.get_tree().quit(0 if ok else 1)
