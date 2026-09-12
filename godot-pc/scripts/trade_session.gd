extends RefCounted

const SELLERS: Array[String] = ["npc:smith", "npc:asterhold:smith", "npc:alchemist", "npc:asterhold:alchemist"]
var app: Node
var session: Dictionary = {}
var closing_tokens: Array[String] = []
var revision: int = 0

func allowed() -> bool:
	if session.is_empty() or app.net == null or not app.net.connected or app.net.hero.is_empty(): return false
	var hero: Dictionary = app.net.hero
	if bool(hero.get("dead",true)) or str(hero.get("id","")) != str(session.get("heroId","")): return false
	if int(hero.get("generation",-1)) != int(session.get("generation",-2)): return false
	if str(hero.get("spaceId","surface")) != str(session.get("spaceId","surface")): return false
	var id: String = str(session.get("npcId",""))
	return id in SELLERS and app.npc_interaction.ready_for_service(id,Vector2(hero.x,hero.z))

func open(id: String) -> bool:
	if id not in SELLERS or app.net.command_busy or not app.net.pending.is_empty(): return false
	app.close_dialog()
	var opened_revision: int = revision
	var response: Array = []
	var capture: Callable = func(receipt: Dictionary): response.append(receipt)
	app.net.receipt_received.connect(capture)
	await app.net.command({"type":"tradeOpen","npcId":id})
	if app.net.receipt_received.is_connected(capture): app.net.receipt_received.disconnect(capture)
	if response.is_empty() or not bool(response.back().get("ok",false)): return false
	var outcome: Dictionary = response.back().get("outcome",{})
	if str(outcome.get("npcId","")) != id or str(outcome.get("token","")).is_empty(): return false
	if opened_revision != revision:
		closing_tokens.append(str(outcome.token))
		return false
	session = outcome.duplicate(true)
	session.heroId = str(app.net.hero.get("id",""))
	if not allowed(): close(); return false
	return true

func command_reference() -> Dictionary:
	return {"npcId":session.npcId,"token":session.token} if allowed() else {}

func close() -> void:
	revision += 1
	var token: String = str(session.get("token",""))
	if not token.is_empty() and token not in closing_tokens: closing_tokens.append(token)
	session.clear()
	if app != null and is_instance_valid(app.inventory_panel): app.reference_hud.refresh_inventory_state()

func poll() -> void:
	if app.net == null: return
	if not session.is_empty() and not allowed():
		app.close_dialog()
		app.notice("Торговля завершена. Подойдите к оружейнику или алхимику.")
	if app.net.connected and not app.net.command_busy and app.net.pending.is_empty() and not closing_tokens.is_empty():
		app.net.command({"type":"tradeClose","token":closing_tokens.pop_front()})
