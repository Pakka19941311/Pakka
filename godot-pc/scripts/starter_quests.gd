extends RefCounted
const DialogLease = preload("res://scripts/dialog_lease.gd")

var app: Node
var box: VBoxContainer
var cards: VBoxContainer
var buttons: Array[Button] = []
var signature: String = ""
var local_busy: bool = false

func active() -> bool:
	return is_instance_valid(box) and is_instance_valid(app.active_dialog) and app.active_dialog.is_ancestor_of(box)

func open() -> void:
	if app.net.hero.is_empty(): return
	local_busy = false
	box = app.dialog("Роэн · Дороги Гринфолла",Vector2i(590,500))
	box.add_child(app.button("Дальние поручения · уровни 10–40",func(): app.progression_quests.open("npc:elder")))
	box.add_child(app.wrapped_label("За стенами каждый участок требует внимания. Выберите поручение по силам. Награда подходит вашему классу; получить её можно здесь, у Роэна.",13))
	cards = VBoxContainer.new(); cards.name = "StarterQuestCards"; cards.add_theme_constant_override("separation",12); box.add_child(cards)
	signature = ""; refresh()

func refresh() -> void:
	if not active(): return
	for child: Node in cards.get_children():
		cards.remove_child(child); child.queue_free()
	buttons.clear()
	signature = JSON.stringify(app.net.starter_quests)
	if app.net.starter_quests.is_empty():
		cards.add_child(app.wrapped_label("Дождитесь сведений о поручениях от сервера.",13)); return
	for quest: Dictionary in app.net.starter_quests:
		var panel: PanelContainer = PanelContainer.new(); panel.name = str(quest.id).replace("-","_"); cards.add_child(panel)
		var body: VBoxContainer = VBoxContainer.new(); body.add_theme_constant_override("separation",6); panel.add_child(body)
		body.add_child(app.wrapped_label("%s · ур. %d" % [str(quest.title),int(quest.level)],15))
		body.add_child(app.wrapped_label(str(quest.description),12))
		var status: String = str(quest.status)
		if status in ["active","ready"]:
			var enemy: String = str(app.data.monsters.get(quest.monsterId,{}).get("name",quest.monsterId))
			body.add_child(app.wrapped_label("%s: %d / %d" % [enemy,int(quest.kills),int(quest.requiredKills)],12))
			for objective: Dictionary in quest.get("objectives",[]):
				body.add_child(app.wrapped_label(("✓ " if objective.complete else "○ ")+str(objective.text),12))
		elif status in ["available","locked"]:
			body.add_child(app.wrapped_label(str(quest.objectiveText),12))
		var reward_row: HBoxContainer = HBoxContainer.new(); reward_row.add_theme_constant_override("separation",8); body.add_child(reward_row)
		for item_id: String in quest.get("rewards",[]):
			var icon: TextureRect = TextureRect.new(); icon.texture = app.book_ui.item_icon({"id":item_id})
			icon.custom_minimum_size = Vector2(44,44); icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			icon.tooltip_text = str(app.data.items.get(item_id,{}).get("name",item_id)); reward_row.add_child(icon)
		var names: PackedStringArray = []
		for item_id: String in quest.get("rewards",[]): names.append(str(app.data.items.get(item_id,{}).get("name",item_id)))
		var reward_text: Label = app.wrapped_label("%d опыта\n%s" % [int(quest.xp),", ".join(names)],12); reward_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL; reward_row.add_child(reward_text)
		if status == "claimed":
			body.add_child(app.label("Выполнено · награда получена",12)); continue
		if status == "pending": body.add_child(app.wrapped_label("Награда сохранена у Роэна: %d предм. Освободите место в сумке и заберите её. Опыт уже начислен." % int(quest.pendingItemCount),12))
		var captions: Dictionary = {"available":"Принять поручение","locked":"Доступно с %d уровня" % int(quest.level),"active":"Поручение выполняется","ready":"Завершить и получить награду","pending":"Забрать награду"}
		var action: String = "accept" if status == "available" else "claim"
		var quest_id: String = str(quest.id)
		var button: Button = app.button(str(captions.get(status,"Недоступно")),func(): submit(quest_id,action))
		button.name = quest_id.replace("-","_")+"_Action"; button.set_meta("quest_action",status in ["available","ready","pending"]); button.set_meta("npc_action","starter:"+quest_id)
		body.add_child(button); buttons.append(button)
	update_buttons()

func update_buttons() -> void:
	var busy: bool = local_busy or app.net.command_busy or not app.net.pending.is_empty() or not app.net.connected
	for button: Button in buttons:
		if is_instance_valid(button): button.disabled = busy or not bool(button.get_meta("quest_action",false))

func submit(quest_id: String, action: String) -> void:
	if local_busy or app.net.command_busy or not app.net.pending.is_empty() or not app.net.connected: return
	var lease: Dictionary = DialogLease.capture(app,box)
	local_busy = true; update_buttons()
	await app.net.command({"type":"starterQuest","questId":quest_id,"action":action})
	if not DialogLease.current(app,lease): return
	local_busy = false
	if active(): refresh()

func poll() -> void:
	if not active(): return
	if app.net.hero.is_empty() or bool(app.net.hero.get("dead",false)) or not app.net.connected:
		app.close_dialog(); return
	if not local_busy and signature != JSON.stringify(app.net.starter_quests): refresh()
	update_buttons()

func tracker_text() -> String:
	var pending: Array = app.net.starter_quests.filter(func(q: Dictionary): return str(q.status) in ["active","ready","pending"])
	if pending.is_empty(): return "Поручения Гринфолла\nПоговорите с Роэном у ворот."
	var quest: Dictionary = pending[0]
	var lines: PackedStringArray = [str(quest.title)]
	if str(quest.status) == "active":
		lines.append("Победы: %d / %d" % [int(quest.kills),int(quest.requiredKills)])
		for objective: Dictionary in quest.get("objectives",[]):
			if not objective.complete:
				lines.append(str(objective.text)); break
	else: lines.append("Награда у Роэна")
	if pending.size() > 1: lines.append("Ещё поручений: %d" % (pending.size()-1))
	return "\n".join(lines)
