extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func run(app: Node) -> void:
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(1600,900))
	app.qa_interaction = true
	var checks: Dictionary = {}
	checks.connected = await Wait.until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	app.login.hide(); app.close_dialog(); app.inventory_panel.hide(); app.player_input.focus_changed(true)
	var block: String = "all"
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--block="): block = arg.trim_prefix("--block=")
	if block in ["all","sale"]: await sale(app,checks)
	if block in ["all","potions"]: await potions(app,checks)
	var ok: bool = checks.values().all(func(v): return v == true)
	app.net.save_private_json(app.qa_path,{"ok":ok,"checks":checks,"adapter":RenderingServer.get_video_adapter_name()})
	app.get_tree().quit(0 if ok else 2)

static func sale(app: Node, checks: Dictionary) -> void:
	var item: Dictionary = app.net.hero.inventory.filter(func(i): return i.id == "potion")[0].duplicate(true)
	var before_gold: int = int(app.net.hero.gold)
	var before: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	app.selected_item = {"kind":"bag","item":item}; app.sell_selected()
	await Keys.wait_ms(app.get_tree(),160)
	var field: LineEdit = app.active_dialog.find_child("SaleQuantity",true,false)
	var confirm: Button = app.active_dialog.find_child("SaleConfirm",true,false)
	checks.sale_default_one = field.text == "1"
	checks.sale_invalid_input = true
	for value: String in ["0","-1","1.5","abc","11"]:
		field.text = value; field.text_changed.emit(value)
		checks.sale_invalid_input = checks.sale_invalid_input and confirm.disabled
	field.text = "3"; field.text_changed.emit("3")
	checks.sale_price = confirm.text == "Продать 3 за 45 золота"
	await Wait.capture(app,"sale-quantity")
	Mouse.mouse(app,confirm.get_global_rect().get_center()); Mouse.mouse(app,confirm.get_global_rect().get_center())
	checks.sale_partial = await Wait.until(app,func(): return app.net.hero.inventory.any(func(i): return i.uid == item.uid and int(i.count) == 7),5000)
	checks.sale_gold_once = int(app.net.hero.gold) == before_gold+45
	checks.sale_ui_consumes_click = before.distance_to(Vector2(app.net.hero.x,app.net.hero.z)) < .02
	item = app.net.hero.inventory.filter(func(i): return i.uid == item.uid)[0].duplicate(true)
	app.selected_item = {"kind":"bag","item":item}; app.sell_selected(); app.close_dialog()
	await Keys.wait_ms(app.get_tree(),150)
	checks.sale_cancel = int(app.net.hero.gold) == before_gold+45 and app.net.hero.inventory.any(func(i): return i.uid == item.uid and int(i.count) == 7)
	app.sell_selected(); await Keys.wait_ms(app.get_tree(),100)
	var all: Button = app.active_dialog.find_child("SaleAll",true,false)
	Mouse.mouse(app,all.get_global_rect().get_center()); await Keys.wait_ms(app.get_tree(),80)
	confirm = app.active_dialog.find_child("SaleConfirm",true,false)
	Mouse.mouse(app,confirm.get_global_rect().get_center())
	checks.sale_all = await Wait.until(app,func(): return not app.net.hero.inventory.any(func(i): return i.uid == item.uid),5000)
	checks.sale_full_gold = int(app.net.hero.gold) == before_gold+150
	app.close_dialog()

static func potions(app: Node, checks: Dictionary) -> void:
	for id: String in ["potion_large","haste"]:
		app.open_npc_service("npc:shop"); await Keys.wait_ms(app.get_tree(),200)
		var buttons: Array = app.active_dialog.find_children("*","Button",true,false).filter(func(b): return b.get_meta("npc_action","") == "buy:"+id)
		checks["elza_offers_"+id] = buttons.size() == 1
		if buttons.is_empty(): continue
		var scroll: ScrollContainer = app.active_dialog.find_child("DialogScroll",true,false); scroll.ensure_control_visible(buttons[0])
		await Keys.wait_ms(app.get_tree(),120); Mouse.mouse(app,buttons[0].get_global_rect().get_center())
		checks["elza_buys_"+id] = await Wait.until(app,func(): return app.net.hero.inventory.any(func(i): return i.id == id),4000)
	app.close_dialog()
	checks.healing_descriptions = "37 HP" in str(app.data.items.potion.desc) and "70 HP" in str(app.data.items.potion_large.desc)
	var before: float = float(app.net.hero.hp)
	app.activate("potion_large")
	checks.large_quick_use = await Wait.until(app,func(): return not app.net.hero.inventory.any(func(i): return i.id == "potion_large"),4000) and float(app.net.hero.hp) > before
	app.activate("haste")
	checks.haste_quick_use = await Wait.until(app,func(): return float(app.net.hero.get("buffs",{}).get("haste",0)) > float(app.net.last_time),4000)
	app.open_npc_service("npc:shop"); await Keys.wait_ms(app.get_tree(),200); await Wait.capture(app,"elza-potions"); app.close_dialog()
