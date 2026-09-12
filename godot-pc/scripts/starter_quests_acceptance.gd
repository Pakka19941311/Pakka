extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")
const Click = preload("res://scripts/craft_acceptance.gd")

static func state(app: Node, id: String) -> String:
	for quest: Dictionary in app.net.starter_quests:
		if quest.id == id: return str(quest.status)
	return ""

static func action(app: Node, id: String) -> Button:
	return app.active_dialog.find_child(id.replace("-","_")+"_Action",true,false)

static func total_xp(app: Node) -> int:
	var result: int = int(app.net.hero.xp)
	for level: int in range(1,int(app.net.hero.level)): result += int(app.data.xpNeeded[level])
	return result

static func run(app: Node, checks: Dictionary) -> void:
	checks.starter_ui_completed = false
	app.close_dialog(); app.inventory_panel.hide()
	await Mouse.fixture(app,"starter-v3")
	await app.open_npc_service("npc:elder"); await Keys.wait_ms(app.get_tree(),220)
	checks.starter_five_named_quests = app.net.starter_quests.size() == 5 and app.starter_quests.cards.get_child_count() == 5
	checks.starter_level_locks = action(app,"QUEST-102").disabled and action(app,"QUEST-105").disabled and not action(app,"QUEST-101").disabled
	await Wait.capture(app,"starter-roen-level-one")
	app.close_dialog(); await Keys.wait_ms(app.get_tree(),120)
	checks.starter_close_does_not_accept = state(app,"QUEST-101") == "available"
	await app.open_npc_service("npc:elder"); await Keys.wait_ms(app.get_tree(),120)
	var original_position: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	await Click.click_visible(app,action(app,"QUEST-101"))
	checks.starter_accept_actual_command = await Wait.until(app,func(): return state(app,"QUEST-101") == "active",5000)
	checks.starter_quest_click_no_movement = Vector2(app.net.hero.x,app.net.hero.z).distance_to(original_position) < .02
	if not checks.starter_accept_actual_command: return
	checks.starter_active_not_claimable = action(app,"QUEST-101").disabled
	await Mouse.fixture(app,"starter-ready-101")
	await Wait.until(app,func(): return state(app,"QUEST-101") == "ready",5000)
	await Keys.wait_ms(app.get_tree(),180)
	var before_xp: int = total_xp(app)
	await Click.click_visible(app,action(app,"QUEST-101"))
	checks.starter_reward_claimed = await Wait.until(app,func(): return state(app,"QUEST-101") == "claimed",5000)
	checks.starter_class_weapon_once = app.net.hero.inventory.filter(func(i: Dictionary): return i.id == "starter_weapon_knight").size() == 1
	checks.starter_fixed_xp = total_xp(app) == before_xp+120
	await app.net.command({"type":"starterQuest","questId":"QUEST-101","action":"claim"})
	checks.starter_repeat_no_reward = total_xp(app) == before_xp+120 and app.net.hero.inventory.filter(func(i: Dictionary): return i.id == "starter_weapon_knight").size() == 1
	app.close_dialog(); await Mouse.fixture(app,"starter-level-seven")
	await app.open_npc_service("npc:elder"); await Keys.wait_ms(app.get_tree(),160)
	await Click.click_visible(app,action(app,"QUEST-105"))
	checks.starter_later_quest_independent = await Wait.until(app,func(): return state(app,"QUEST-105") == "active",5000)
	await Mouse.fixture(app,"starter-ready-105")
	await Wait.until(app,func(): return state(app,"QUEST-105") == "ready",5000); await Keys.wait_ms(app.get_tree(),160)
	before_xp = total_xp(app)
	await Click.click_visible(app,action(app,"QUEST-105"))
	checks.starter_full_bag_pending = await Wait.until(app,func(): return state(app,"QUEST-105") == "pending",5000)
	checks.starter_partial_two_item_reward = app.net.hero.inventory.size() == 42 and app.net.hero.inventory.filter(func(i: Dictionary): return i.id == "starter_head").size() == 1 and not app.net.hero.inventory.any(func(i: Dictionary): return i.id == "starter_belt")
	checks.starter_pending_xp_once = total_xp(app) == before_xp+2500
	await Keys.wait_ms(app.get_tree(),160)
	var scroll: ScrollContainer = app.active_dialog.find_child("DialogScroll",true,false)
	scroll.ensure_control_visible(action(app,"QUEST-105")); await Keys.wait_ms(app.get_tree(),180)
	await Wait.capture(app,"starter-saved-reward")
	app.close_dialog(); await app.open_npc_service("npc:elder"); await Keys.wait_ms(app.get_tree(),140)
	checks.starter_reopen_preserves_pending = state(app,"QUEST-105") == "pending"
	await Mouse.fixture(app,"starter-free-cell")
	await Click.click_visible(app,action(app,"QUEST-105"))
	checks.starter_recover_pending_item = await Wait.until(app,func(): return state(app,"QUEST-105") == "claimed" and app.net.hero.inventory.any(func(i: Dictionary): return i.id == "starter_belt"),5000)
	checks.starter_pending_no_extra_xp = total_xp(app) == before_xp+2500
	checks.starter_items_unique = app.net.hero.inventory.filter(func(i: Dictionary): return i.id == "starter_head").size() == 1 and app.net.hero.inventory.filter(func(i: Dictionary): return i.id == "starter_belt").size() == 1
	app.close_dialog(); await Wait.until(app,func(): return not app.net.command_busy,3000)
	await Mouse.fixture(app,"trade-smith")
	await app.open_npc_service("npc:smith"); await Keys.wait_ms(app.get_tree(),180)
	var stock: Array = app.active_dialog.find_children("*","Button",true,false).filter(func(b: Button): return str(b.get_meta("npc_action","")).begins_with("buy:starter_"))
	checks.starter_smith_class_stock = stock.size() == 6 and stock.any(func(b: Button): return b.get_meta("npc_action") == "buy:starter_weapon_knight") and not stock.any(func(b: Button): return b.get_meta("npc_action") == "buy:starter_weapon_mage")
	app.close_dialog(); checks.starter_ui_completed = true
