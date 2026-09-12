extends RefCounted
const Lease = preload("res://scripts/dialog_lease.gd")

class DelayedCommands extends Node:
	signal finish
	signal receipt_received(receipt: Dictionary)
	var hero: Dictionary = {"id":"qa-dialog","generation":1,"classId":"mage","level":60,"gold":1000,"inventory":[]}
	var session_generation: int = 1
	var command_busy: bool = false
	var connected: bool = true
	var pending: Dictionary = {}
	var progression_quests: Array = [{"giverId":"npc:books","status":"ready","title":"Synthetic book reward","level":50}]
	var submitted: Array[Dictionary] = []
	func command(value: Dictionary) -> void:
		if command_busy: return
		submitted.append(value.duplicate(true)); command_busy = true
		await finish
		command_busy = false

class ClosedTrade extends RefCounted:
	var enabled: bool = false
	func allowed() -> bool: return enabled
	func command_reference() -> Dictionary: return {"npcId":"npc:smith","token":"synthetic"}

class StarterProbe extends "res://scripts/starter_quests.gd":
	var refresh_count: int = 0
	func refresh() -> void: refresh_count += 1

class ProgressionProbe extends "res://scripts/progression_quests.gd":
	var refresh_count: int = 0
	func refresh() -> void: refresh_count += 1

class CraftProbe extends "res://scripts/crafting_dialog.gd":
	var refresh_count: int = 0
	func ready() -> bool: return true
	func refresh_palette() -> void: refresh_count += 1
	func refresh_reserve() -> void: refresh_count += 1
	func refresh() -> void: refresh_count += 1

class App extends Node:
	var net: DelayedCommands = DelayedCommands.new()
	var book_ui: VarendorBookUI = VarendorBookUI.new()
	var polish: VarendorInterfacePolish = VarendorInterfacePolish.new()
	var trade_session: ClosedTrade = ClosedTrade.new()
	var starter_quests: StarterProbe = StarterProbe.new()
	var progression_quests: ProgressionProbe = ProgressionProbe.new()
	var reference_hud: VarendorReferenceHud = VarendorReferenceHud.new()
	var active_dialog: PanelContainer
	var data: Dictionary = {"books":{},"items":{},"classes":{"mage":{"name":"Маг"}}}
	var dialog_count: int = 0
	var buttons: Array[Button] = []
	func dialog(_title: String,_dimensions: Vector2i = Vector2i.ZERO,_preserve_trade: bool = false) -> VBoxContainer:
		close_dialog(); dialog_count += 1; buttons.clear()
		active_dialog = PanelContainer.new(); add_child(active_dialog)
		var body: VBoxContainer = VBoxContainer.new(); active_dialog.add_child(body)
		return body
	func close_dialog(_preserve_trade: bool = false) -> void:
		if is_instance_valid(active_dialog): active_dialog.hide(); active_dialog.queue_free()
		active_dialog = null
	func label(value: String,_size: int = 12) -> Label:
		var node: Label = Label.new(); node.text = value; return node
	func wrapped_label(value: String,size: int = 12) -> Label: return label(value,size)
	func button(value: String,callback: Callable) -> Button:
		var node: Button = Button.new(); node.text = value; node.pressed.connect(callback); buttons.append(node); return node
	func item_tip(_item: Dictionary) -> String: return "Synthetic fixture"
	func item_name(item: Dictionary) -> String: return str(item.id)
	func item_sell_price(_item: Dictionary) -> int: return 7
	func press(caption: String) -> void:
		for node: Button in buttons:
			if node.text == caption: node.pressed.emit(); return
		push_error("Missing test button "+caption)

static func observe_trade(trade: RefCounted, result: Array) -> void:
	result.append(await trade.open("npc:smith"))

static func run(tree: SceneTree) -> Dictionary:
	var checks: Dictionary = {}
	var app: App = App.new(); tree.root.add_child(app); app.add_child(app.net)
	app.book_ui.app = app; app.polish.app = app
	var old_icons: Dictionary = VarendorBookUI.icons.duplicate()
	var icon: ImageTexture = ImageTexture.create_from_image(Image.create(4,4,false,Image.FORMAT_RGBA8))
	for level: int in [10,20,30,40,50,60]:
		var id: String = "book_mage_%d" % level
		app.data.books[id] = {"name":id,"classId":"mage","level":level,"description":"Synthetic","cost":1,"cd":1,"price":100 if level < 50 else 0}
		VarendorBookUI.icons[id+":book"] = icon
	for id: String in ["potion","potion_large","haste","ether","teleport"]:
		app.data.items[id] = {"name":id,"desc":"Synthetic","buyPrice":55}
	VarendorBookUI.icons["haste:book"] = icon
	app.book_ui.catalogue(true,"mage"); app.press("100 золота")
	var before: int = app.dialog_count
	app.net.finish.emit()
	checks["book_purchase_refreshes_same_live_dialog"] = app.dialog_count == before+1
	app.press("100 золота"); app.close_dialog(); before = app.dialog_count
	app.net.finish.emit()
	checks["late_book_purchase_does_not_reopen_closed_dialog"] = app.active_dialog == null and app.dialog_count == before
	app.book_ui.catalogue(true,"mage"); app.press("100 золота")
	app.dialog("Different menu"); var replacement: PanelContainer = app.active_dialog; before = app.dialog_count
	app.net.finish.emit()
	checks["late_book_purchase_does_not_replace_new_menu"] = app.active_dialog == replacement and app.dialog_count == before
	app.book_ui.quest_menu(); app.press("Забрать сохранённую награду")
	app.net.hero.generation = 2; before = app.dialog_count
	app.net.finish.emit()
	checks["late_book_reward_does_not_reopen_after_teleport"] = app.dialog_count == before
	app.polish.shop("shop","Synthetic potion vendor"); app.press("55 ◈")
	app.net.session_generation += 1; before = app.dialog_count
	app.net.finish.emit()
	checks["late_shop_purchase_does_not_refresh_new_session"] = app.dialog_count == before
	var body: VBoxContainer = app.dialog("Teleport dialog")
	var lease: Dictionary = Lease.capture(app,body)
	app.net.hero.generation += 1
	checks["successful_teleport_can_close_only_its_own_dialog"] = not Lease.current(app,lease) and Lease.current(app,lease,true)
	app.dialog("Menu after teleport")
	checks["successful_teleport_cannot_close_replacement_menu"] = not Lease.current(app,lease,true)
	app.net.session_generation += 1
	checks["teleport_generation_exception_never_crosses_session"] = not Lease.current(app,lease,true)
	checks["all_expected_item_requests_were_dispatched_once"] = app.net.submitted.size() == 5
	app.starter_quests.app = app; app.progression_quests.app = app; app.reference_hud.app = app
	app.starter_quests.open(); app.starter_quests.submit("QUEST-101","accept")
	app.close_dialog(); app.starter_quests.open(); before = app.starter_quests.refresh_count
	app.net.finish.emit()
	checks["old_starter_reply_does_not_refresh_reopened_quest_window"] = app.starter_quests.refresh_count == before and not app.starter_quests.local_busy
	app.progression_quests.open(); app.progression_quests.submit("QUEST-115","accept")
	app.close_dialog(); app.progression_quests.open(); before = app.progression_quests.refresh_count
	app.net.finish.emit()
	checks["old_progression_reply_does_not_refresh_reopened_quest_window"] = app.progression_quests.refresh_count == before and not app.progression_quests.local_busy
	var craft: CraftProbe = CraftProbe.new(); craft.app = app
	craft.box = app.dialog("Synthetic craft"); craft.confirm = Button.new(); craft.box.add_child(craft.confirm); craft.recipe = {"id":"synthetic-recipe"}
	craft.submit()
	craft.box = app.dialog("Reopened craft"); craft.local_busy = true
	app.net.finish.emit()
	checks["old_craft_reply_cannot_clear_new_operation_busy_state"] = craft.local_busy and craft.refresh_count == 0
	var sale_item: Dictionary = {"id":"potion","uid":"qa-sale","plus":0,"count":2}
	app.net.hero.inventory = [sale_item.duplicate(true)]; app.net.hero.equipment = {}
	app.trade_session.enabled = true
	var returned: Array = []
	preload("res://scripts/sale_dialog.gd").open(app,sale_item,func(): returned.append(true))
	app.press("Продать 1 за 7 золота")
	app.dialog("Menu after sale"); replacement = app.active_dialog
	app.net.hero.inventory[0].count = 1
	app.net.finish.emit()
	checks["late_sale_reply_does_not_close_or_reopen_replacement_menu"] = returned.is_empty() and app.active_dialog == replacement
	var trade = preload("res://scripts/trade_session.gd").new(); trade.app = app
	var opened: Array = []; observe_trade(trade,opened)
	app.net.session_generation += 1
	app.net.receipt_received.emit({"ok":true,"outcome":{"npcId":"npc:smith","token":"another-session-token"}})
	app.net.finish.emit()
	checks["old_trade_capture_cannot_open_or_close_new_profile_receipt"] = opened == [false] and trade.session.is_empty() and trade.closing_tokens.is_empty()
	trade.session = {"token":"old-token"}; trade.closing_tokens.append("old-closing-token"); trade.clear_session()
	checks["profile_switch_retires_old_trade_close_tokens"] = trade.session.is_empty() and trade.closing_tokens.is_empty()
	app.polish.storage_panel = PanelContainer.new(); app.add_child(app.polish.storage_panel)
	app.polish.storage_slots = [Control.new()]; app.polish.storage_panel.add_child(app.polish.storage_slots[0])
	app.polish.storage_signature = "old-profile-items"
	app.book_ui.loot_panel = PanelContainer.new(); app.add_child(app.book_ui.loot_panel)
	app.book_ui.targeting_book = "book_mage_40"
	var old_loot_generation: int = app.book_ui.loot_generation
	app.polish.close_profile_views(); app.book_ui.clear_session()
	checks["profile_switch_clears_storage_slots_and_signature"] = app.polish.storage_panel == null and app.polish.storage_slots.is_empty() and app.polish.storage_signature.is_empty()
	checks["profile_switch_cancels_book_target_and_old_loot_timer"] = app.book_ui.loot_panel == null and app.book_ui.targeting_book.is_empty() and app.book_ui.loot_generation > old_loot_generation
	var hud: VarendorReferenceHud = VarendorReferenceHud.new(); hud.app = app
	app.net.hero = {}
	checks["item_reference_rejected_safely_while_profile_is_empty"] = not hud.has_item_version({"id":"potion","uid":"qa-item","count":1,"plus":0})
	app.close_dialog(); app.queue_free(); await tree.process_frame
	VarendorBookUI.icons = old_icons
	return checks
