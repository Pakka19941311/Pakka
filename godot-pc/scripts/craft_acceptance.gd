extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func key_j(app: Node) -> void:
	var event: InputEventKey = InputEventKey.new(); event.physical_keycode = KEY_J; event.pressed = true
	app.get_viewport().push_input(event,true)
	event = event.duplicate(); event.pressed = false; app.get_viewport().push_input(event,true)

static func palette_item(app: Node, id: String) -> Control:
	for slot: Node in app.crafting.palette.get_children():
		if slot.payload.item.id == id: return slot
	return null

static func click_visible(app: Node, control: Control) -> void:
	var scroll: ScrollContainer = app.active_dialog.find_child("DialogScroll",true,false)
	scroll.ensure_control_visible(control); await Keys.wait_ms(app.get_tree(),120)
	Mouse.mouse(app,control.get_global_rect().get_center()); await Keys.wait_ms(app.get_tree(),120)

static func drag_to(app: Node, source: Control, target: Control) -> void:
	var origin: Vector2 = source.get_global_rect().get_center()
	var destination: Vector2 = target.get_global_rect().get_center()
	var button: InputEventMouseButton = InputEventMouseButton.new()
	button.position = origin; button.button_index = MOUSE_BUTTON_LEFT; button.pressed = true
	app.get_viewport().push_input(button,true)
	var motion: InputEventMouseMotion = InputEventMouseMotion.new()
	motion.position = origin+Vector2(25,0); motion.relative = Vector2(25,0); motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	app.get_viewport().push_input(motion,true); await Keys.wait_ms(app.get_tree(),100)
	motion = motion.duplicate(); motion.position = destination; motion.relative = destination-origin
	app.get_viewport().push_input(motion,true)
	button = button.duplicate(); button.position = destination; button.pressed = false
	app.get_viewport().push_input(button,true); await Keys.wait_ms(app.get_tree(),120)

static func run(app: Node, checks: Dictionary) -> void:
	checks.craft_completed = false
	app.close_dialog(); app.inventory_panel.hide()
	await Mouse.fixture(app,"craft-v3")
	var original: String = JSON.stringify(app.net.hero.inventory)
	var gold: int = int(app.net.hero.gold)
	var typing: LineEdit = LineEdit.new(); app.ui.add_child(typing); typing.grab_focus()
	key_j(app); checks.craft_typing_ignored = not app.crafting.active()
	typing.release_focus(); typing.queue_free()
	key_j(app); await Keys.wait_ms(app.get_tree(),200)
	checks.craft_physical_j = app.crafting.active()
	if not checks.craft_physical_j: return
	checks.craft_four_equal_slots = app.crafting.sockets.size() == 4 and app.crafting.sockets.all(func(s): return s.size.is_equal_approx(VarendorInterfacePolish.CELL))
	checks.craft_initial_disabled = app.crafting.confirm.disabled
	# Real GUI click assignment followed by closing: nothing has left the bag.
	await click_visible(app,palette_item(app,"ring_blank"))
	app.close_dialog(); await Keys.wait_ms(app.get_tree(),120)
	checks.craft_cancel_unchanged = JSON.stringify(app.net.hero.inventory) == original and int(app.net.hero.gold) == gold
	key_j(app); await Keys.wait_ms(app.get_tree(),180)
	await drag_to(app,palette_item(app,"ring_blank"),app.crafting.sockets[0])
	checks.craft_drag_reference = app.crafting.inputs[0].get("id","") == "ring_blank" and JSON.stringify(app.net.hero.inventory) == original
	for index: int in range(4):
		await click_visible(app,app.crafting.sockets[index])
		await click_visible(app,palette_item(app,app.crafting.expected(index)))
	checks.craft_populated_enabled = not app.crafting.confirm.disabled
	await Wait.capture(app,"craft-four-inputs")
	var scroll: ScrollContainer = app.active_dialog.find_child("DialogScroll",true,false)
	scroll.ensure_control_visible(app.crafting.confirm); await Keys.wait_ms(app.get_tree(),120)
	var point: Vector2 = app.crafting.confirm.get_global_rect().get_center()
	Mouse.mouse(app,point); Mouse.mouse(app,point)
	checks.craft_result_once = await Wait.until(app,func(): return app.net.hero.inventory.filter(func(i): return i.id == "ring_str_g1").size() == 1,5000)
	checks.craft_cost_once = int(app.net.hero.gold) == gold-150
	checks.craft_inputs_consumed = app.net.hero.inventory.size() == 1 and app.net.hero.inventory[0].id == "ring_str_g1"
	checks.craft_no_ghost_inputs = app.crafting.inputs.all(func(i): return i.is_empty()) and app.crafting.confirm.disabled
	checks.craft_reserved_ear_visible = not app.net.hero.migrationReserve.is_empty()
	var reserved: String = str(app.net.hero.migrationReserve[0].uid)
	await Wait.until(app,func(): return not app.crafting.local_busy and not app.net.command_busy,3000)
	await Keys.wait_ms(app.get_tree(),120)
	var buttons: Array = app.crafting.reserve_box.find_children("*","Button",true,false)
	if buttons.is_empty(): return
	await click_visible(app,buttons[0])
	checks.craft_reserved_ear_claimed = await Wait.until(app,func(): return app.net.hero.migrationReserve.is_empty() and app.net.hero.inventory.any(func(i): return i.uid == reserved),5000)
	app.close_dialog(); app.refresh_inventory(); app.inventory_panel.show()
	checks.cloak_slot_replaces_right_ear = app.equipment_slots.has("cloak") and app.equipment_slots.has("ear1") and not app.equipment_slots.has("ear2")
	await Keys.wait_ms(app.get_tree(),180); await Wait.capture(app,"cloak-slot-and-crafted-ring")
	app.inventory_panel.hide()
	await Wait.until(app,func(): return not app.net.command_busy,3000)
	await app.open_npc_service("npc:smith"); await Keys.wait_ms(app.get_tree(),180)
	for id: String in ["ring_blank","cloak_defense"]:
		var buy: Array = app.active_dialog.find_children("*","Button",true,false).filter(func(b): return b.get_meta("npc_action","") == "buy:"+id)
		checks["smith_offers_"+id] = buy.size() == 1
		if buy.is_empty(): return
		await click_visible(app,buy[0])
		checks["smith_buys_"+id] = await Wait.until(app,func(): return app.net.hero.inventory.any(func(i): return i.id == id),4000)
		await Wait.until(app,func(): return not app.net.command_busy,3000)
		await Keys.wait_ms(app.get_tree(),120)
	checks.smith_prices = int(app.net.hero.gold) == gold-150-50-350
	app.close_dialog()
	checks.craft_completed = true
