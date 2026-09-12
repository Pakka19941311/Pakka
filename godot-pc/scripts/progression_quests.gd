extends RefCounted

var app: Node
var box: VBoxContainer
var cards: VBoxContainer
var buttons: Array[Button] = []
var selections: Dictionary = {}
var giver_id: String = "npc:elder"
var signature: String = ""
var local_busy: bool = false

func active() -> bool:
	return is_instance_valid(box) and is_instance_valid(app.active_dialog) and app.active_dialog.is_ancestor_of(box)

func open(npc_id: String = "npc:elder") -> void:
	if app.net.hero.is_empty(): return
	giver_id = npc_id
	box = app.dialog("Роэн · Дальние поручения" if giver_id == "npc:elder" else "Северин · Знание класса",Vector2i(610,510))
	box.add_child(app.wrapped_label("Опыт указан для каждого поручения. Награда, которой не хватило места в сумке, сохраняется до получения.",13))
	if giver_id == "npc:elder": box.add_child(app.button("Первые поручения Гринфолла",func(): app.starter_quests.open()))
	else: box.add_child(app.button("Купить книги 10–40 уровня",func(): app.book_ui.shop_classes()))
	cards = VBoxContainer.new(); cards.name = "ProgressionQuestCards"; cards.add_theme_constant_override("separation",12); box.add_child(cards)
	signature = ""; refresh()

func reward_name(item: Dictionary) -> String:
	return "%s × %d" % [str(app.data.items.get(str(item.id),{}).get("name",item.id)),int(item.count)]

func direction_hint(objective: Dictionary) -> String:
	var target: Dictionary = objective.get("target",{})
	if target.is_empty(): return ""
	if str(target.get("spaceId","surface")) != str(app.net.hero.get("spaceId","surface")):
		return "Маршрут внутри шахты" if target.get("spaceId") == "mine" else "Маршрут внутри большой пещеры"
	var dx: float = float(target.x)-float(app.net.hero.x)
	var dz: float = float(target.z)-float(app.net.hero.z)
	var distance: float = Vector2(dx,dz).length()
	if distance <= 4: return "Остановитесь у ориентира на секунду"
	var direction: String = ("восток" if dx > 0 else "запад") if absf(dx) > absf(dz) else ("север" if dz > 0 else "юг")
	return "%s · %d м" % [direction,ceili(distance)]

func refresh() -> void:
	if not active(): return
	for child: Node in cards.get_children(): cards.remove_child(child); child.queue_free()
	buttons.clear(); signature = JSON.stringify(app.net.progression_quests)
	if app.net.progression_quests.is_empty():
		cards.add_child(app.wrapped_label("Дождитесь сведений о поручениях от сервера.",13)); return
	for quest: Dictionary in app.net.progression_quests:
		if str(quest.giverId) != giver_id: continue
		var panel: PanelContainer = PanelContainer.new(); panel.name = str(quest.id).replace("-","_"); cards.add_child(panel)
		var body: VBoxContainer = VBoxContainer.new(); body.add_theme_constant_override("separation",6); panel.add_child(body)
		body.add_child(app.wrapped_label("%s · ур. %d" % [str(quest.title),int(quest.level)],15))
		var status: String = str(quest.status)
		if bool(quest.get("legacyCredit",false)): body.add_child(app.wrapped_label("Прежнее задание сохранено. Полученная ранее книга повторно не выдаётся.",12))
		for objective: Dictionary in quest.get("objectives",[]):
			var count: String = " (%d / %d)" % [int(objective.count),int(objective.required)] if objective.has("count") else ""
			body.add_child(app.wrapped_label(("✓ " if objective.complete else "○ ")+str(objective.text)+count,12))
			if not bool(objective.complete) and status == "active" and not direction_hint(objective).is_empty(): body.add_child(app.wrapped_label(direction_hint(objective),12))
		var names: PackedStringArray = []
		for reward: Dictionary in quest.get("rewards",[]): names.append(reward_name(reward))
		body.add_child(app.wrapped_label("Награда: %d опыта%s" % [int(quest.xp),(" · "+", ".join(names)) if not names.is_empty() else ""],13))
		var choices: Array = quest.get("rewardChoices",[])
		if not choices.is_empty():
			body.add_child(app.wrapped_label("Один свиток на выбор:",12))
			var select: OptionButton = OptionButton.new(); select.name = str(quest.id).replace("-","_")+"_Choice"; select.add_item("Выберите награду")
			for reward: Dictionary in choices: select.add_item(reward_name(reward)); select.set_item_metadata(select.item_count-1,str(reward.id))
			var selected_id: String = str(quest.get("rewardChoice",selections.get(str(quest.id),"")))
			for index: int in range(1,select.item_count):
				if str(select.get_item_metadata(index)) == selected_id: select.select(index)
			select.disabled = status in ["pending","claimed"]
			select.item_selected.connect(func(index: int): selections[str(quest.id)] = str(select.get_item_metadata(index)) if index > 0 else ""; update_buttons())
			body.add_child(select)
		if status == "claimed": body.add_child(app.label("Выполнено · награда получена",12)); continue
		if status == "pending": body.add_child(app.wrapped_label("Осталось забрать: %d предм. Опыт уже начислен." % int(quest.pendingItemCount),12))
		var available: bool = bool(quest.get("requirementsAvailable",false))
		if not available and status in ["available","active"]: body.add_child(app.wrapped_label("Эти цели ещё недоступны в текущем мире. Принятое поручение сохранено.",12))
		var caption: String = {"available":"Принять поручение","locked":"Доступно с %d уровня" % int(quest.level),"active":"Поручение выполняется","ready":"Завершить и получить награду","pending":"Забрать награду"}.get(status,"Недоступно")
		if status == "locked" and int(app.net.hero.level) >= int(quest.level): caption = "Сначала сдайте «Знание класса I»"
		var quest_id: String = str(quest.id)
		var action: String = "accept" if status == "available" else "claim"
		var button: Button = app.button(caption,func(): submit(quest_id,action))
		button.name = quest_id.replace("-","_")+"_Action"; button.set_meta("quest_action",status in ["ready","pending"] or status == "available" and available)
		button.set_meta("needs_choice",not choices.is_empty() and status == "ready"); button.set_meta("quest_id",quest_id); button.set_meta("npc_action","progression:"+quest_id)
		body.add_child(button); buttons.append(button)
	update_buttons()

func update_buttons() -> void:
	var busy: bool = local_busy or app.net.command_busy or not app.net.pending.is_empty() or not app.net.connected
	for button: Button in buttons:
		if is_instance_valid(button): button.disabled = busy or not bool(button.get_meta("quest_action",false)) or bool(button.get_meta("needs_choice",false)) and str(selections.get(str(button.get_meta("quest_id")),"")).is_empty()

func submit(quest_id: String, action: String) -> void:
	if local_busy or app.net.command_busy or not app.net.pending.is_empty() or not app.net.connected: return
	var command: Dictionary = {"type":"progressionQuest","questId":quest_id,"action":action}
	if action == "claim" and not str(selections.get(quest_id,"")).is_empty(): command.rewardChoice = str(selections[quest_id])
	local_busy = true; update_buttons(); await app.net.command(command); local_busy = false
	if active(): refresh()

func poll() -> void:
	if not active(): return
	if app.net.hero.is_empty() or bool(app.net.hero.get("dead",false)) or not app.net.connected: app.close_dialog(); return
	if not local_busy and signature != JSON.stringify(app.net.progression_quests): refresh()
	update_buttons()

func tracker_text() -> String:
	var pending: Array = app.net.progression_quests.filter(func(q: Dictionary): return str(q.status) in ["active","ready","pending"])
	if pending.is_empty(): return ""
	var quest: Dictionary = pending[0]
	var lines: PackedStringArray = [str(quest.title)]
	if str(quest.status) == "active":
		for objective: Dictionary in quest.get("objectives",[]):
			if not bool(objective.complete):
				lines.append(str(objective.text))
				if not direction_hint(objective).is_empty(): lines.append(direction_hint(objective))
				break
	else: lines.append("Награда у Роэна" if str(quest.giverId) == "npc:elder" else "Награда у Северина")
	if pending.size() > 1: lines.append("Ещё поручений: %d" % (pending.size()-1))
	return "\n".join(lines)
