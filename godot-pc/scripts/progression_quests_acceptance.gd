extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Fixture = preload("res://world-final/gameplay_acceptance.gd")
const Click = preload("res://scripts/craft_acceptance.gd")

static func state(app: Node, id: String) -> String:
	for quest: Dictionary in app.net.progression_quests:
		if str(quest.id) == id: return str(quest.status)
	return ""

static func action(app: Node, id: String) -> Button:
	return app.active_dialog.find_child(id.replace("-","_")+"_Action",true,false)

static func total_xp(app: Node) -> int:
	var result: int = int(app.net.hero.xp)
	for level: int in range(1,int(app.net.hero.level)): result += int(app.data.xpNeeded[level])
	return result

static func run(app: Node) -> void:
	var checks: Dictionary = {}
	checks.connected = await Wait.until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	if checks.connected:
		app.login.hide(); app.close_dialog(); app.inventory_panel.hide()
		await app.open_npc_service("npc:elder"); app.progression_quests.open("npc:elder"); await Keys.wait_ms(app.get_tree(),180)
		checks.ten_server_views = app.net.progression_quests.size() == 10
		checks.eight_roen_cards = app.progression_quests.cards.get_child_count() == 8
		checks.level_locks = not action(app,"QUEST-110").disabled and action(app,"QUEST-125").disabled
		app.close_dialog(); checks.close_no_accept = state(app,"QUEST-110") == "available"
		app.progression_quests.open("npc:elder"); await Click.click_visible(app,action(app,"QUEST-110"))
		checks.accept_http = await Wait.until(app,func(): return state(app,"QUEST-110") == "active")
		checks.no_free_complete = action(app,"QUEST-110").disabled
		await Wait.capture(app,"late-roen-active")
		await Fixture.fixture(app,"late-ready-110"); await Wait.until(app,func(): return state(app,"QUEST-110") == "ready"); await Keys.wait_ms(app.get_tree(),180)
		var xp: int = total_xp(app)
		await Click.click_visible(app,action(app,"QUEST-110")); checks.claim_http = await Wait.until(app,func(): return state(app,"QUEST-110") == "claimed")
		checks.fixed_xp_4030 = total_xp(app) == xp+4030
		checks.potions_three = app.net.hero.inventory.any(func(i: Dictionary): return i.id == "potion" and int(i.count) == 3)
		await app.net.command({"type":"progressionQuest","questId":"QUEST-110","action":"claim"})
		checks.claim_once = total_xp(app) == xp+4030 and app.net.hero.inventory.size() == 1
		await Fixture.fixture(app,"late-level-25"); await Wait.until(app,func(): return int(app.net.hero.level) == 25); await Keys.wait_ms(app.get_tree(),180)
		await Click.click_visible(app,action(app,"QUEST-125")); await Wait.until(app,func(): return state(app,"QUEST-125") == "active")
		await Fixture.fixture(app,"late-ready-125"); await Wait.until(app,func(): return state(app,"QUEST-125") == "ready"); await Keys.wait_ms(app.get_tree(),180)
		checks.choice_required = action(app,"QUEST-125").disabled
		var choice: OptionButton = app.active_dialog.find_child("QUEST_125_Choice",true,false)
		choice.select(2); choice.item_selected.emit(2); xp = total_xp(app)
		await Click.click_visible(app,action(app,"QUEST-125")); checks.full_bag_pending = await Wait.until(app,func(): return state(app,"QUEST-125") == "pending")
		checks.choice_xp_once = total_xp(app) == xp+43385
		app.close_dialog(); app.progression_quests.open("npc:elder"); await Keys.wait_ms(app.get_tree(),180)
		choice = app.active_dialog.find_child("QUEST_125_Choice",true,false); checks.saved_choice_locked = choice.disabled and str(choice.get_item_metadata(choice.selected)) == "armor_scroll"
		var scroll: ScrollContainer = app.active_dialog.find_child("DialogScroll",true,false); scroll.ensure_control_visible(action(app,"QUEST-125")); await Keys.wait_ms(app.get_tree(),120)
		await Wait.capture(app,"late-choice-pending")
		await Fixture.fixture(app,"late-free-cell"); await Click.click_visible(app,action(app,"QUEST-125")); checks.pending_recovered = await Wait.until(app,func(): return state(app,"QUEST-125") == "claimed")
		checks.exact_one_scroll = app.net.hero.inventory.filter(func(i: Dictionary): return i.id == "armor_scroll").size() == 1 and not app.net.hero.inventory.any(func(i: Dictionary): return i.id == "weapon_scroll")
		checks.recover_no_extra_xp = total_xp(app) == xp+43385
		app.close_dialog(); await Fixture.fixture(app,"late-legacy-books"); await Wait.until(app,func(): return state(app,"QUEST-150") == "ready" and state(app,"QUEST-160") == "ready")
		await app.open_npc_service("npc:books"); await Keys.wait_ms(app.get_tree(),180)
		checks.severin_two_cards = app.progression_quests.cards.get_child_count() == 2
		checks.legacy_ready_uses_prior_credit = app.net.progression_quests.filter(func(q: Dictionary): return str(q.giverId) == "npc:books").all(func(q: Dictionary): return q.objectives.size() == 1 and str(q.objectives[0].id) == "legacy-completed" and bool(q.objectives[0].complete))
		await Wait.capture(app,"late-severin-legacy-ready")
		await Click.click_visible(app,action(app,"QUEST-150")); await Wait.until(app,func(): return state(app,"QUEST-150") == "claimed"); await Keys.wait_ms(app.get_tree(),180)
		await Click.click_visible(app,action(app,"QUEST-160")); checks.both_legacy_books = await Wait.until(app,func(): return state(app,"QUEST-160") == "claimed") and app.net.hero.inventory.filter(func(i: Dictionary): return i.id in ["book_knight_50","book_knight_60"]).size() == 2
		await app.net.command({"type":"progressionQuest","questId":"QUEST-160","action":"claim"}); checks.no_duplicate_book = app.net.hero.inventory.filter(func(i: Dictionary): return i.id == "book_knight_60").size() == 1
		app.book_ui.catalogue(true,"knight"); checks.no_zero_price_books = app.active_dialog.find_children("*","Button",true,false).filter(func(b: Button): return b.text.ends_with("золота")).size() == 4
	var ok: bool = checks.values().all(func(value: Variant): return value == true)
	var file: FileAccess = FileAccess.open(app.qa_path,FileAccess.WRITE)
	file.store_string(JSON.stringify({"ok":ok,"checks":checks,"scope":"source native UI and HTTP transactions; quest readiness fixture; no live hunting acceptance"},"  ")); file.close()
	app.get_tree().quit(0 if ok else 1)
