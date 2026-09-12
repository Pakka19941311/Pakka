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
	if not checks.connected:
		app.net.save_private_json(app.qa_path,{"ok":false,"checks":checks,"reason":"Client did not join the matching test world"})
		app.get_tree().quit(2)
		return
	app.login.hide(); app.close_dialog(); app.inventory_panel.hide(); app.player_input.focus_changed(true)
	var block: String = "all"
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--block="): block = arg.trim_prefix("--block=")
	if block in ["all","sale"]: await sale(app,checks)
	if block in ["all","potions"]: await potions(app,checks)
	if block in ["all","drag","ui-v3"]: await drag(app,checks)
	if block == "ui-v3": await stats_view(app,checks)
	if block == "craft": await preload("res://scripts/craft_acceptance.gd").run(app,checks)
	if block == "starter": await preload("res://scripts/starter_quests_acceptance.gd").run(app,checks)
	if block == "p2" or block.begins_with("p2:"): await preload("res://scripts/p2_population_acceptance.gd").run(app,checks)
	if block == "p2-city": await preload("res://scripts/p2_city_acceptance.gd").run(app,checks)
	if block == "p2-cloak": await preload("res://scripts/p2_cloak_acceptance.gd").run(app,checks)
	if block == "p2-npc": await preload("res://scripts/p2_npc_acceptance.gd").run(app,checks)
	if block == "p2-nature": await preload("res://scripts/p2_nature_acceptance.gd").run(app,checks)
	if block == "p2-line": await preload("res://scripts/p2_line_acceptance.gd").run(app,checks)
	if block == "p2-cpu": await preload("res://scripts/p2_cpu_acceptance.gd").run(app,checks)
	if block == "p2-pursuit" or block.begins_with("p2-pursuit:"): await preload("res://scripts/p2_pursuit_acceptance.gd").run(app,checks)
	if block in ["all","autorun"]: await autorun(app,checks)
	if block in ["all","cave"]: await cave(app,checks)
	var ok: bool = checks.values().all(func(v): return v == true)
	app.net.save_private_json(app.qa_path,{"ok":ok,"checks":checks,"adapter":RenderingServer.get_video_adapter_name()})
	app.get_tree().quit(0 if ok else 2)

static func sale(app: Node, checks: Dictionary) -> void:
	checks.sale_completed = false
	app.close_dialog()
	app.selected_item = {"kind":"bag","item":app.net.hero.inventory.filter(func(i): return i.id == "potion")[0].duplicate(true)}
	app.sell_selected()
	checks.sale_without_merchant_blocked = not is_instance_valid(app.active_dialog)
	await Mouse.fixture(app,"trade-smith")
	await app.open_npc_service("npc:smith")
	checks.sale_city_session = app.trade_session.allowed()
	if not checks.sale_city_session: return
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
	await Wait.until(app,func(): return not app.net.command_busy and app.trade_session.closing_tokens.is_empty(),3000)
	await app.open_npc_service("npc:smith")
	app.selected_item = {"kind":"bag","item":item}; app.sell_selected(); app.close_dialog()
	await Keys.wait_ms(app.get_tree(),150)
	checks.sale_cancel = int(app.net.hero.gold) == before_gold+45 and app.net.hero.inventory.any(func(i): return i.uid == item.uid and int(i.count) == 7)
	app.sell_selected()
	checks.sale_closed_session_not_reused = not is_instance_valid(app.active_dialog)
	await Wait.until(app,func(): return not app.net.command_busy and app.trade_session.closing_tokens.is_empty(),3000)
	await app.open_npc_service("npc:smith")
	app.selected_item = {"kind":"bag","item":item}; app.sell_selected(); await Keys.wait_ms(app.get_tree(),100)
	var all: Button = app.active_dialog.find_child("SaleAll",true,false)
	Mouse.mouse(app,all.get_global_rect().get_center()); await Keys.wait_ms(app.get_tree(),80)
	confirm = app.active_dialog.find_child("SaleConfirm",true,false)
	Mouse.mouse(app,confirm.get_global_rect().get_center())
	checks.sale_all = await Wait.until(app,func(): return not app.net.hero.inventory.any(func(i): return i.uid == item.uid),5000)
	checks.sale_full_gold = int(app.net.hero.gold) == before_gold+150
	app.close_dialog()
	checks.sale_completed = true

static func potions(app: Node, checks: Dictionary) -> void:
	await Mouse.fixture(app,"trade-elza")
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


static func drag_begin(app: Node, source: Control) -> void:
	var point: Vector2 = source.get_global_rect().get_center()
	var down: InputEventMouseButton = InputEventMouseButton.new()
	down.position = point; down.button_index = MOUSE_BUTTON_LEFT; down.pressed = true
	app.get_viewport().push_input(down,true)
	var motion: InputEventMouseMotion = InputEventMouseMotion.new()
	motion.position = point+Vector2(25,0); motion.relative = Vector2(25,0); motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	app.get_viewport().push_input(motion,true)
	await Keys.wait_ms(app.get_tree(),150)

static func drag_end(app: Node, point: Vector2) -> void:
	var motion: InputEventMouseMotion = InputEventMouseMotion.new()
	motion.position = point; motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	app.get_viewport().push_input(motion,true)
	var up: InputEventMouseButton = InputEventMouseButton.new()
	up.position = point; up.button_index = MOUSE_BUTTON_LEFT; up.pressed = false
	app.get_viewport().push_input(up,true)
	await Keys.wait_ms(app.get_tree(),150)

static func drag(app: Node, checks: Dictionary) -> void:
	checks.drag_completed = false
	app.close_dialog()
	await Mouse.fixture(app,"trade-smith")
	await Wait.until(app,func(): return not app.net.command_busy and app.trade_session.closing_tokens.is_empty(),3000)
	await app.open_npc_service("npc:smith")
	var inventory: String = JSON.stringify(app.net.hero.inventory)
	checks.drag_size_and_cancel = true
	for ui_scale: float in [1.0,1.5]:
		app.get_window().content_scale_factor = ui_scale
		app.polish.shop("smith","Оружейник Бран",1)
		await Keys.wait_ms(app.get_tree(),300)
		var slots: Array = app.active_dialog.find_children("*","Button",true,false).filter(func(n): return n is VarendorItemSlot)
		if slots.is_empty(): checks.drag_size_and_cancel = false; continue
		await drag_begin(app,slots[0])
		var preview: Control = app.get_tree().root.find_child("ItemDragPreview",true,false)
		checks.drag_size_and_cancel = checks.drag_size_and_cancel and is_instance_valid(preview) and preview.dimensions.is_equal_approx(VarendorInterfacePolish.ICON) and preview.get_combined_minimum_size() == Vector2.ZERO
		checks.drag_tooltip_hidden = not is_instance_valid(app.tooltip_panel)
		await Wait.capture(app,"drag-scale-"+str(ui_scale))
		await drag_end(app,Vector2(15,15))
		checks.drag_size_and_cancel = checks.drag_size_and_cancel and JSON.stringify(app.net.hero.inventory) == inventory
	app.get_window().content_scale_factor = 1.0
	app.polish.shop("smith","Оружейник Бран",1); await Keys.wait_ms(app.get_tree(),200)
	var slot: Control = app.active_dialog.find_children("*","Button",true,false).filter(func(n): return n is VarendorItemSlot)[0]
	var drop: Control = app.active_dialog.find_child("SaleDrop",true,false)
	var point: Vector2 = drop.get_global_rect().get_center()
	await drag_begin(app,slot); await drag_end(app,point)
	checks.drag_sale_opens_quantity = is_instance_valid(app.active_dialog.find_child("SaleQuantity",true,false))
	checks.drag_sale_no_automatic_sale = JSON.stringify(app.net.hero.inventory) == inventory
	app.close_dialog()
	var previous: String = app.quick[2].action
	app.quick[2].action = "potion"; app.polish.finish_quick_drag(2,false)
	checks.quick_cancel_keeps_reference = app.quick[2].action == "potion"
	app.quick[2].action = previous; app.refresh_quick()
	checks.drag_completed = true

static func stats_view(app: Node, checks: Dictionary) -> void:
	checks.stats_completed = false
	app.close_dialog(); app.inventory_panel.show(); app.refresh_inventory()
	await Keys.wait_ms(app.get_tree(),180)
	checks.stats_primary = true
	for stat: String in ["str","dex","int"]:
		checks.stats_primary = checks.stats_primary and app.stat_values[stat].text == str(int(app.net.hero.stats[stat]))
	checks.stats_accuracy_channels = app.stat_values.physicalAccuracy.text == str(int(app.net.hero.stats.physicalAccuracy)) and app.stat_values.magicAccuracy.text == str(int(app.net.hero.stats.magicAccuracy))
	checks.stats_cadence = app.stat_values.attackRate.text == "%.2f" % (1.0/float(app.net.hero.stats.attackInterval))
	checks.stats_regen = app.stat_values.manaRegen.text == "%.2f" % float(app.net.hero.stats.manaRegen)
	app.reference_hud.stats_scroll.scroll_vertical = 1000
	await Keys.wait_ms(app.get_tree(),180)
	await Wait.capture(app,"class-derived-stats")
	checks.stats_scroll_access = app.stat_values.manaRegen.get_global_rect().intersects(app.reference_hud.stats_scroll.get_global_rect())
	app.inventory_panel.hide()
	checks.stats_completed = true

static func key(app: Node, code: Key, echo: bool = false) -> void:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = code; event.keycode = KEY_UNKNOWN if code == KEY_R else code
	event.pressed = true; event.echo = echo
	app.get_viewport().push_input(event,true)
	event = event.duplicate(); event.pressed = false; event.echo = false
	app.get_viewport().push_input(event,true)

static func autorun(app: Node, checks: Dictionary) -> void:
	app.close_dialog(); app.inventory_panel.hide(); app.player_input.stop_autorun()
	var origin: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	var heading: Vector2 = Vector2(sin(float(app.net.hero.yaw)),cos(float(app.net.hero.yaw)))
	key(app,KEY_R); await Keys.wait_ms(app.get_tree(),400)
	var delta: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)-origin
	checks.autorun_physical_r_heading = app.player_input.autorun and delta.dot(heading)>.3 and app.autorun_indicator.visible
	key(app,KEY_R,true); checks.autorun_no_repeat = app.player_input.autorun
	key(app,KEY_SPACE); await Keys.wait_ms(app.get_tree(),100)
	checks.autorun_jump = app.player_input.autorun and not bool(app.net.hero.grounded)
	key(app,KEY_TAB); await Keys.wait_ms(app.get_tree(),80)
	checks.autorun_inventory = app.player_input.autorun and app.inventory_panel.visible
	key(app,KEY_TAB); await Keys.wait_ms(app.get_tree(),1100)
	checks.autorun_lands = app.player_input.autorun and bool(app.net.hero.grounded)
	key(app,KEY_R); await Keys.wait_ms(app.get_tree(),200)
	origin = Vector2(app.net.hero.x,app.net.hero.z); await Keys.wait_ms(app.get_tree(),300)
	checks.autorun_stops_without_slide = not app.player_input.autorun and origin.distance_to(Vector2(app.net.hero.x,app.net.hero.z))<.03
	key(app,KEY_R); key(app,KEY_W); await Keys.wait_ms(app.get_tree(),100)
	checks.autorun_manual_priority = not app.player_input.autorun
	key(app,KEY_R)
	app.net.intent({"type":"destination","x":app.net.hero.x+1,"z":app.net.hero.z})
	checks.autorun_new_destination = not app.player_input.autorun
	key(app,KEY_R)
	app.net.intent({"type":"attack","entityId":"missing-test-target","skill":null})
	checks.autorun_new_attack = not app.player_input.autorun
	key(app,KEY_R); key(app,KEY_ESCAPE); checks.autorun_escape = not app.player_input.autorun
	app.close_dialog(); key(app,KEY_R); app.open_npc_service("npc:shop")
	checks.autorun_trade = not app.player_input.autorun
	var field: LineEdit = LineEdit.new(); app.active_dialog.add_child(field); field.grab_focus()
	key(app,KEY_R); checks.autorun_typing_ignored = not app.player_input.autorun
	app.close_dialog(); app.player_input.stop_autorun(); app.net.intent({"type":"cancel"})

static func cave(app: Node, checks: Dictionary) -> void:
	const BOSS: String = "wf:great_cave:cave_boss:000"
	app.close_dialog(); app.inventory_panel.hide()
	await Mouse.fixture(app,"cave-entrance")
	checks.cave_visible_entrance = app.world.final_environment.roots.surface.has_node("PortalMarkers/great_cave/PortalLabel")
	await Wait.capture(app,"cave-entrance")
	key(app,KEY_R); await Keys.wait_ms(app.get_tree(),100); key(app,KEY_F)
	checks.cave_enter = await Wait.until(app,func(): return app.net.hero.get("spaceId","") == "great_cave" and not app.world.space_loading,20000)
	await Keys.wait_ms(app.get_tree(),400)
	var entry: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	await Keys.wait_ms(app.get_tree(),300)
	checks.cave_transition_stops_run = not app.player_input.autorun and entry.distance_to(Vector2(app.net.hero.x,app.net.hero.z))<.04
	key(app,KEY_F); await Keys.wait_ms(app.get_tree(),200)
	checks.cave_no_immediate_bounce = app.net.hero.spaceId == "great_cave"
	checks.cave_safe_floor = not app.world.collision.blocked(entry) and app.world.hero_position.y>app.world.height_at(entry.x,entry.y)-.2
	checks.cave_has_monsters_and_one_boss = app.world.current_snapshot.monsters.filter(func(m): return m.uid==BOSS).size()==1 and app.world.current_snapshot.monsters.any(func(m): return m.uid!=BOSS and m.alive)
	await Wait.capture(app,"cave-inside")
	app.net.intent({"type":"destination","x":20,"z":86})
	checks.cave_walk_to_hall = await Wait.until(app,func(): return Vector2(app.net.hero.x,app.net.hero.z).distance_to(Vector2(20,86))<.7,45000)
	var actor: Node3D = app.world.actors.get(BOSS)
	checks.cave_boss_rendered = is_instance_valid(actor) and actor.visible
	if not is_instance_valid(actor): return
	var gold: int = int(app.net.hero.gold)
	var position: Vector2 = app.world.camera.unproject_position(actor.position+Vector3.UP*2.5)
	Mouse.mouse(app,position)
	checks.cave_boss_targetable = await Wait.until(app,func(): return app.world.target_id == BOSS,1500)
	app.activate("attack")
	checks.cave_boss_takes_damage = await Wait.until(app,func(): return app.world.current_snapshot.monsters.any(func(m): return m.uid==BOSS and m.hp<14400),20000)
	checks.cave_boss_aoe = await Wait.until(app,func(): return app.world.current_snapshot.get("groundEffects",[]).any(func(e): return e.owner==BOSS and e.kind=="slam"),8000)
	await Wait.capture(app,"cave-boss-fight")
	await Mouse.fixture(app,"cave-finish")
	app.activate("attack")
	checks.cave_boss_death_loot = await Wait.until(app,func(): return int(app.net.hero.gold)==gold+100000 and app.world.current_snapshot.monsters.any(func(m): return m.uid==BOSS and not m.alive),15000)
	await Wait.capture(app,"cave-boss-loot")
	app.net.intent({"type":"destination","x":0,"z":-6})
	checks.cave_walk_to_exit = await Wait.until(app,func(): return Vector2(app.net.hero.x,app.net.hero.z).distance_to(Vector2(0,-6))<.7,45000)
	app.world.camera_controller.yaw = PI
	app.world.camera_controller.smoothed_yaw = PI
	await Keys.wait_ms(app.get_tree(),300)
	await Wait.capture(app,"cave-exit")
	Mouse.mouse(app,app.world.camera.unproject_position(app.world.point(0,-8,1.3)))
	checks.cave_click_exit = await Wait.until(app,func(): return app.net.hero.spaceId=="surface" and not app.world.space_loading,15000)
	if not checks.cave_click_exit: return
	await Keys.wait_ms(app.get_tree(),250)
	checks.cave_exit_facing_safe = absf(absf(float(app.net.hero.yaw))-PI)<.05 and not app.world.collision.blocked(Vector2(app.net.hero.x,app.net.hero.z))
	app.net.intent({"type":"destination","x":245,"z":278})
	await Wait.until(app,func(): return Vector2(app.net.hero.x,app.net.hero.z).distance_to(Vector2(245,278))<.5,5000)
	key(app,KEY_F)
	checks.cave_reentry = await Wait.until(app,func(): return app.net.hero.spaceId=="great_cave" and not app.world.space_loading,15000)
	await Keys.wait_ms(app.get_tree(),500)
	var bosses: Array = app.world.current_snapshot.monsters.filter(func(m): return m.uid==BOSS)
	checks.cave_no_duplicate_or_instant_respawn = bosses.size()==1 and not bosses[0].alive and int(app.net.hero.gold)==gold+100000
