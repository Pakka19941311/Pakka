extends Node3D

var data: Dictionary
var net: VarendorNetwork
var world: VarendorWorld
var ui: Control
var login: PanelContainer
var inventory_panel: PanelContainer
var quick_grid: GridContainer
var hp: ProgressBar
var mp: ProgressBar
var xp: ProgressBar
var heading: Label
var health_text: Label
var status: Label
var target_text: Label
var inventory_title: Label
var stats_text: Label
var log_text: RichTextLabel
var respawn: Button
var bag_slots: Array = []
var equipment_slots: Dictionary = {}
var quick_buttons: Array = []
var quick: Array = []
var preferences: Dictionary = {}
var preference_path: String = ""
var preference_hero: String = ""
var full_quick: bool = false
var selected_scroll: Dictionary = {}
var selected_item: Dictionary = {}
var last_direction: Vector2 = Vector2.ZERO
var send_elapsed: float = 0.0
var inventory_fingerprint: String = ""
var active_dialog: Window
var qa_path: String = ""
var qa_started: bool = false
var qa_times: Array = []

func _ready() -> void:
	get_tree().auto_accept_quit = false
	data = JSON.parse_string(FileAccess.get_file_as_string("res://generated/game.json"))
	quick = data.quickDefaults.duplicate(true)
	net = VarendorNetwork.new()
	add_child(net)
	net.snapshot_received.connect(snapshot_received)
	net.notice.connect(notice)
	world = VarendorWorld.new()
	add_child(world)
	build_ui()
	login.hide()
	notice("Загрузка мира…")
	await get_tree().process_frame
	world.setup(data)
	world.picked.connect(picked)
	world.moved_to.connect(func(point: Vector2): net.intent({"type":"destination","x":point.x,"z":point.y}))
	login.show()
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--qa="):
			qa_path = arg.trim_prefix("--qa=")
	if not qa_path.is_empty():
		if not net.bootstrap.get("profiles", []).is_empty():
			await net.connect_profile(net.bootstrap.profiles[0])
		else:
			await net.create_character("PC Test", "knight")
		call_deferred("run_qa")

func panel_style(background: Color = Color("191e20"), border: Color = Color("776544")) -> StyleBoxFlat:
	var box: StyleBoxFlat = StyleBoxFlat.new()
	box.bg_color = background
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(4)
	box.content_margin_left = 12
	box.content_margin_right = 12
	box.content_margin_top = 9
	box.content_margin_bottom = 9
	return box

func label(text_value: String, size: int = 16, color: Color = Color("d8d5c8")) -> Label:
	var node: Label = Label.new()
	node.text = text_value
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", color)
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node

func button(text_value: String, callback: Callable) -> Button:
	var node: Button = Button.new()
	node.text = text_value
	node.focus_mode = Control.FOCUS_NONE
	node.custom_minimum_size.y = 34
	node.pressed.connect(callback)
	return node

func place_panel(anchor: int, position: Vector2, size: Vector2) -> PanelContainer:
	var panel: PanelContainer = PanelContainer.new()
	ui.add_child(panel)
	panel.set_anchors_and_offsets_preset(anchor)
	panel.position += position
	panel.custom_minimum_size = size
	panel.size = size
	return panel

func build_ui() -> void:
	var canvas: CanvasLayer = CanvasLayer.new()
	add_child(canvas)
	ui = Control.new()
	canvas.add_child(ui)
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme: Theme = Theme.new()
	theme.default_font_size = 15
	theme.set_stylebox("panel", "PanelContainer", panel_style())
	theme.set_stylebox("normal", "Button", panel_style(Color("262c2c"), Color("655b44")))
	theme.set_stylebox("hover", "Button", panel_style(Color("3a4038"), Color("c6a66c")))
	theme.set_stylebox("pressed", "Button", panel_style(Color("4c4835"), Color("e0ba76")))
	theme.set_color("font_color", "Button", Color("dfd6c2"))
	theme.set_stylebox("panel", "TooltipPanel", panel_style(Color("121719"), Color("b09964")))
	theme.set_color("font_color", "TooltipLabel", Color("eee3c8"))
	theme.set_font_size("font_size", "TooltipLabel", 16)
	ui.theme = theme
	var hero_panel: PanelContainer = place_panel(Control.PRESET_TOP_LEFT, Vector2(18, 18), Vector2(345, 112))
	var hero_box: VBoxContainer = VBoxContainer.new()
	hero_panel.add_child(hero_box)
	heading = label("VARENDOR", 21, Color("e6c78a"))
	hero_box.add_child(heading)
	hp = ProgressBar.new()
	hp.show_percentage = false
	hp.custom_minimum_size = Vector2(320, 17)
	hp.add_theme_stylebox_override("fill", panel_style(Color("973d36"), Color("a75d44")))
	hero_box.add_child(hp)
	mp = ProgressBar.new()
	mp.show_percentage = false
	mp.custom_minimum_size = Vector2(320, 12)
	mp.add_theme_stylebox_override("fill", panel_style(Color("3f648b"), Color("6183a0")))
	hero_box.add_child(mp)
	health_text = label("", 13)
	hero_box.add_child(health_text)
	xp = ProgressBar.new()
	xp.show_percentage = false
	xp.custom_minimum_size.y = 8
	xp.add_theme_stylebox_override("fill", panel_style(Color("a28d53"), Color("bea770")))
	hero_box.add_child(xp)
	var title: Label = label("V A R E N D O R", 24, Color("edd3a0"))
	ui.add_child(title)
	title.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	title.position += Vector2(-115, 20)
	target_text = label("", 16, Color("edbe81"))
	ui.add_child(target_text)
	target_text.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	target_text.position += Vector2(-165, 60)
	var menu: HBoxContainer = HBoxContainer.new()
	ui.add_child(menu)
	menu.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	menu.position += Vector2(-365, 18)
	menu.add_child(button("Инвентарь · I", toggle_inventory))
	menu.add_child(button("Управление", controls_dialog))
	menu.add_child(button("Выход", quit_game))
	var minimap: Control = preload("res://scripts/minimap.gd").new()
	minimap.world = world
	ui.add_child(minimap)
	minimap.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	minimap.position += Vector2(-184, 66)
	minimap.size = Vector2(166, 154)
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var quick_panel: PanelContainer = place_panel(Control.PRESET_CENTER_BOTTOM, Vector2(-345, -192), Vector2(690, 168))
	var quick_box: VBoxContainer = VBoxContainer.new()
	quick_panel.add_child(quick_box)
	var quick_header: HBoxContainer = HBoxContainer.new()
	quick_box.add_child(quick_header)
	quick_header.add_child(label("УМЕНИЯ И ПРЕДМЕТЫ", 12, Color("c0ad87")))
	var spacer: Control = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quick_header.add_child(spacer)
	quick_header.add_child(button("16 / 32", func():
		full_quick = not full_quick
		quick_panel.position.y = ui.size.y - (326 if full_quick else 192)
		quick_panel.size.y = 302 if full_quick else 168
		refresh_quick()
		save_preferences()))
	quick_grid = GridContainer.new()
	quick_grid.columns = 8
	quick_box.add_child(quick_grid)
	for index: int in range(32):
		var slot: Button = button("", func(): activate(quick[index].action))
		slot.custom_minimum_size = Vector2(79, 55)
		slot.add_theme_font_size_override("font_size", 12)
		slot.gui_input.connect(func(event: InputEvent):
			if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
				assign_dialog(index))
		quick_grid.add_child(slot)
		quick_buttons.append(slot)
	refresh_quick()
	var log_panel: PanelContainer = place_panel(Control.PRESET_BOTTOM_LEFT, Vector2(18, -205), Vector2(385, 184))
	var log_box: VBoxContainer = VBoxContainer.new()
	log_panel.add_child(log_box)
	log_box.add_child(label("СОБЫТИЯ", 12, Color("c0ad87")))
	log_text = RichTextLabel.new()
	log_text.custom_minimum_size = Vector2(357, 121)
	log_text.scroll_following = true
	log_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	log_box.add_child(log_text)
	status = label("", 12)
	log_box.add_child(status)
	build_inventory()
	respawn = button("Возродиться в Гринфолле", func(): net.command({"type":"respawn"}))
	ui.add_child(respawn)
	respawn.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	respawn.position += Vector2(-125, -35)
	respawn.hide()
	build_login()

func build_login() -> void:
	login = place_panel(Control.PRESET_CENTER, Vector2(-240, -220), Vector2(480, 410))
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	login.add_child(box)
	box.add_child(label("ВАРЕНДОР", 30, Color("e6c78a")))
	box.add_child(label("Тестовая версия для ПК", 17))
	var summary: Label = label(str(net.bootstrap.get("save_message", "Запустите игру через RUN_VARENDOR.bat")), 14)
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary.custom_minimum_size.x = 440
	box.add_child(summary)
	var profiles: Array = net.bootstrap.get("profiles", [])
	if not profiles.is_empty():
		var select: OptionButton = OptionButton.new()
		for profile: Dictionary in profiles:
			select.add_item(str(profile.name) + " · " + data.classes[profile.classId].name + " · " + str(profile.level))
		box.add_child(select)
		box.add_child(button("Продолжить", func(): net.connect_profile(profiles[select.selected])))
	box.add_child(label("Новый персонаж", 17, Color("d5be8d")))
	var name_input: LineEdit = LineEdit.new()
	name_input.placeholder_text = "Имя персонажа"
	name_input.max_length = 24
	box.add_child(name_input)
	var class_select: OptionButton = OptionButton.new()
	var ids: Array = data.classes.keys()
	for id: String in ids:
		class_select.add_item(data.classes[id].name + " — " + data.classes[id].title)
	box.add_child(class_select)
	var create: Button = button("Войти в мир", func():
		if name_input.text.strip_edges().length() < 2:
			notice("Введите имя от двух символов")
			return
		net.create_character(name_input.text.strip_edges(), ids[class_select.selected]))
	box.add_child(create)

func build_inventory() -> void:
	inventory_panel = place_panel(Control.PRESET_TOP_RIGHT, Vector2(-426, 72), Vector2(408, 455))
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 7)
	inventory_panel.add_child(box)
	var top: HBoxContainer = HBoxContainer.new()
	box.add_child(top)
	inventory_title = label("ПЕРСОНАЖ", 18, Color("dfc591"))
	inventory_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(inventory_title)
	top.add_child(button("×", toggle_inventory))
	var equipment: GridContainer = GridContainer.new()
	equipment.columns = 4
	box.add_child(equipment)
	for slot_name: String in data.equipSlots:
		var slot: VarendorItemSlot = VarendorItemSlot.new()
		slot.owner_ui = self
		slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = Vector2(92, 49)
		slot.add_theme_font_size_override("font_size", 11)
		slot.payload = {"kind":"equipment","slot":slot_name,"item":{}}
		slot.text = data.slotNames[slot_name]
		equipment.add_child(slot)
		equipment_slots[slot_name] = slot
	stats_text = label("", 12)
	box.add_child(stats_text)
	box.add_child(label("СУМКА · 42 ЯЧЕЙКИ", 13, Color("c7b489")))
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(380, 151)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	var bag: GridContainer = GridContainer.new()
	bag.columns = 6
	scroll.add_child(bag)
	for index: int in range(42):
		var slot: VarendorItemSlot = VarendorItemSlot.new()
		slot.owner_ui = self
		slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = Vector2(58, 45)
		slot.add_theme_font_size_override("font_size", 13)
		slot.add_theme_stylebox_override("normal", panel_style(Color("222a2b"), Color("5d5746")))
		slot.payload = {"kind":"bag","index":index,"item":{}}
		bag.add_child(slot)
		bag_slots.append(slot)
	var commands: HBoxContainer = HBoxContainer.new()
	box.add_child(commands)
	commands.add_child(button("Использовать", use_selected))
	commands.add_child(button("Продать", sell_selected))
	commands.add_child(button("Забрать лут", func(): net.command({"type":"collect"})))
	var hint: Label = label("Двойной щелчок: надеть / использовать\nПеретаскивание: перенести. Свиток → предмет: заточка.", 12)
	box.add_child(hint)
	inventory_panel.hide()

func snapshot_received(snapshot: Dictionary) -> void:
	var hero: Dictionary = snapshot.character
	if login != null:
		login.hide()
	if preference_hero != str(hero.id):
		load_preferences(str(hero.id))
	world.apply_snapshot(snapshot)
	heading.text = hero.name + " · " + data.classes[hero.classId].name + " · " + str(int(hero.level))
	hp.max_value = hero.maxHp
	hp.value = hero.hp
	mp.max_value = hero.maxMp
	mp.value = hero.mp
	xp.max_value = data.xpNeeded[clampi(int(hero.level), 0, data.xpNeeded.size() - 1)]
	xp.value = hero.xp
	xp.tooltip_text = "Опыт: %d / %d · Задание: %d · Побед: %d" % [hero.xp, xp.max_value, hero.quest, hero.kills]
	health_text.text = "ОЗ %d / %d    %s %d / %d" % [hero.hp, hero.maxHp, data.classes[hero.classId].resource, hero.mp, hero.maxMp]
	status.text = "Гринфолл · %d FPS · сервер подключён" % int(Engine.get_frames_per_second())
	respawn.visible = hero.dead
	inventory_title.text = "ПЕРСОНАЖ · %d золота" % hero.gold
	var fingerprint: String = JSON.stringify([hero.inventory, hero.equipment, hero.stats, hero.xp])
	if fingerprint != inventory_fingerprint:
		inventory_fingerprint = fingerprint
		refresh_inventory()
	refresh_quick()
	if not world.target_id.is_empty():
		for monster: Dictionary in snapshot.get("monsters", []):
			if str(monster.uid) == world.target_id:
				target_text.text = data.monsters[monster.id].name + " · " + str(int(monster.hp)) + " ОЗ"
				break

func item_name(item: Dictionary) -> String:
	if item.is_empty():
		return ""
	return str(data.items[item.id].name) + (" +" + str(int(item.plus)) if item.plus > 0 else "")

func item_tip(item: Dictionary) -> String:
	if item.is_empty():
		return "Свободная ячейка"
	var def: Dictionary = data.items[item.id]
	var lines: Array = [item_name(item)]
	if def.has("origin"):
		lines.append(def.origin)
	if def.has("desc"):
		lines.append(def.desc)
	if def.has("classes"):
		var names: Array = []
		for class_id: String in def.classes:
			names.append(data.classes[class_id].name)
		lines.append("Класс: " + ", ".join(names))
	var names: Dictionary = {"atkMin":"Атака (мин.)","atkMax":"Атака (макс.)","matk":"Магическая атака","def":"Защита","mdef":"Магическая защита","hp":"Здоровье","mp":"Ресурс","crit":"Критический шанс","accuracy":"Точность","evasion":"Уклонение","speed":"Скорость"}
	if data.itemStats.has(item.id):
		var stats: Dictionary = data.itemStats[item.id][clampi(int(item.plus), 0, 15)]
		for key: String in stats.total:
			if stats.total[key] != 0:
				lines.append("%s: %s + %s = %s" % [names.get(key, key), stats.base.get(key, 0), stats.bonus.get(key, 0), stats.total[key]])
		if not net.hero.is_empty():
			for slot: String in [resolve_slot(def.get("slot", ""))]:
				var equipped = net.hero.equipment.get(slot)
				if equipped is Dictionary and equipped.uid != item.uid and data.items[equipped.id].get("slot", "") == def.get("slot", "-"):
					lines.append("\nНадето: " + item_name(equipped))
					var other: Dictionary = data.itemStats[equipped.id][clampi(int(equipped.plus), 0, 15)].total
					for key: String in stats.total:
						var difference: float = float(stats.total[key]) - float(other.get(key, 0))
						if difference != 0:
							lines.append("%s: %+.2f" % [names.get(key, key), difference])
	if data.scrolls.has(item.id):
		lines.append("Дважды нажмите свиток, затем предмет для заточки.")
	if not selected_scroll.is_empty() and def.has("slot") and int(item.plus) < 15:
		var scroll: Dictionary = data.scrolls[selected_scroll.id]
		var category: String = "weapon" if def.slot == "weapon" else "armor"
		if scroll.category == category:
			var chance: float = float(data.chances[category + "_" + scroll.quality][int(item.plus)])
			lines.append("\nЗаточка: +%d → +%d · Шанс %s%%\nПри неудаче предмет уничтожается. Улучшенный свиток не страхует." % [item.plus, item.plus + 1, chance])
	lines.append("Количество: %d · Продажа: %d золота" % [item.count, floorf(float(def.get("value", 0)) * .48) * item.count])
	return "\n".join(lines)

func resolve_slot(item_slot: String) -> String:
	# Same selection order as the existing core/inventory-commands.ts resolver.
	var slots: Array = ["ring1", "ring2"] if item_slot == "ring" else ["ear1", "ear2"] if item_slot in ["ear", "earring"] else [item_slot]
	for slot: String in slots:
		if not net.hero.equipment.get(slot):
			return slot
	return str(slots[0])

func refresh_inventory() -> void:
	if net.hero.is_empty():
		return
	for index: int in range(42):
		var item: Dictionary = net.hero.inventory[index] if index < net.hero.inventory.size() else {}
		var slot: VarendorItemSlot = bag_slots[index]
		slot.payload.item = item.duplicate()
		slot.text = str(data.items[item.id].icon) + ("\n+" + str(int(item.plus)) if item.plus > 0 else "\n" + str(int(item.count)) if item.count > 1 else "") if not item.is_empty() else ""
		slot.tooltip_text = item_tip(item)
	for slot_name: String in equipment_slots:
		var item = net.hero.equipment.get(slot_name)
		var slot: VarendorItemSlot = equipment_slots[slot_name]
		slot.payload.item = item.duplicate() if item is Dictionary else {}
		slot.text = data.slotNames[slot_name] + ("\n" + str(data.items[item.id].icon) + (" +" + str(int(item.plus)) if item.plus > 0 else "") if item is Dictionary else "\n—")
		slot.tooltip_text = item_tip(item if item is Dictionary else {})
	var stats: Dictionary = net.hero.stats
	stats_text.text = "Атака %d–%d · Маг. атака %d · Защита %d / %d\nКрит %s · Точность %s · Уклонение %s · Опыт %d" % [stats.get("atkMin", 0), stats.get("atkMax", 0), stats.get("matk", 0), stats.get("def", 0), stats.get("mdef", 0), stats.get("crit", 0), stats.get("accuracy", 0), stats.get("evasion", 0), net.hero.xp]

func action_name(action: String) -> String:
	if action.begins_with("skill:"):
		var class_id: String = str(net.hero.get("classId", "knight"))
		return data.classes[class_id].skills[int(action.trim_prefix("skill:"))].name
	return {"":"—","attack":"Атака","potion":"Здоровье","ether":"Ресурс","teleport":"Возврат"}.get(action, action)

func refresh_quick() -> void:
	for index: int in range(quick_buttons.size()):
		var slot: Button = quick_buttons[index]
		var action: String = quick[index].action
		var key: String = quick[index].key.replace("Shift+", "⇧").replace("Digit", "").replace("Key", "")
		var title: String = action_name(action)
		var icon: String = {"":"·","attack":"⚔","potion":"ОЗ","ether":"MP","teleport":"⌂"}.get(action, str(index % 8 + 1))
		if action.begins_with("skill:"):
			var skill_index: int = int(action.trim_prefix("skill:"))
			var skill: Dictionary = data.classes[net.hero.get("classId", "knight")].skills[skill_index]
			icon = str(skill.icon)
			if not net.hero.is_empty():
				var left: float = maxf(0, (net.hero.cooldowns[skill_index] - world.current_snapshot.time) / 1000.0)
				if left > 0:
					icon = "%.1f" % left
			title += "\nЦена: %s · Перезарядка: %s с" % [skill.cost, skill.cd]
		slot.text = key + "\n" + icon
		slot.tooltip_text = title + "\nПКМ — назначение действия и клавиши"
		slot.visible = index < 16 or full_quick

func load_preferences(id: String) -> void:
	preference_hero = id
	preference_path = net.bootstrap_path.get_base_dir().path_join("native-ui-" + id + ".json")
	preferences = net.read_private_json(preference_path)
	var values = preferences.get("quickbar", data.quickDefaults)
	quick = data.quickDefaults.duplicate(true)
	var used: Array = []
	if values is Array:
		for index: int in range(mini(32, values.size())):
			if values[index] is not Dictionary:
				continue
			var action: String = str(values[index].get("action", ""))
			var key: String = str(values[index].get("key", ""))
			if action in ["", "attack", "potion", "ether", "teleport", "skill:0", "skill:1", "skill:2", "skill:3"]:
				quick[index].action = action
			quick[index].key = key if key in data.quickKeys and key not in used else ""
			if not quick[index].key.is_empty():
				used.append(quick[index].key)
	world.camera_distance = clampf(float(preferences.get("camera_distance", 21)), 9, 40)
	refresh_quick()

func save_preferences() -> void:
	if preference_path.is_empty():
		return
	preferences["quickbar"] = quick
	preferences["camera_distance"] = world.camera_distance
	if not net.save_private_json(preference_path, preferences):
		notice("Не удалось сохранить назначения клавиш")

func dialog(title: String, size: Vector2i = Vector2i(480, 270)) -> VBoxContainer:
	if is_instance_valid(active_dialog):
		active_dialog.queue_free()
	active_dialog = Window.new()
	active_dialog.title = title
	active_dialog.size = size
	active_dialog.transient = true
	active_dialog.exclusive = true
	active_dialog.theme = ui.theme
	add_child(active_dialog)
	active_dialog.close_requested.connect(func(): active_dialog.queue_free())
	var panel: PanelContainer = PanelContainer.new()
	active_dialog.add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)
	active_dialog.popup_centered()
	return box

func assign_dialog(index: int) -> void:
	var box: VBoxContainer = dialog("Назначение ячейки " + str(index + 1))
	var actions: Array = ["", "attack", "potion", "ether", "teleport", "skill:0", "skill:1", "skill:2", "skill:3"]
	var action_select: OptionButton = OptionButton.new()
	for action: String in actions:
		action_select.add_item(action_name(action))
	action_select.selected = actions.find(quick[index].action)
	box.add_child(label("Действие"))
	box.add_child(action_select)
	var key_select: OptionButton = OptionButton.new()
	for key: String in data.quickKeys:
		key_select.add_item("Без клавиши" if key.is_empty() else key.replace("Digit", "").replace("Key", ""))
	key_select.selected = data.quickKeys.find(quick[index].key)
	box.add_child(label("Клавиша (одно назначение на сочетание)"))
	box.add_child(key_select)
	box.add_child(button("Сохранить", func():
		var key: String = data.quickKeys[key_select.selected]
		for entry: Dictionary in quick:
			if not key.is_empty() and entry.key == key:
				entry.key = ""
		quick[index] = {"action":actions[action_select.selected],"key":key}
		save_preferences()
		refresh_quick()
		active_dialog.queue_free()))

func controls_dialog() -> void:
	var box: VBoxContainer = dialog("Управление", Vector2i(540, 350))
	box.add_child(label("WASD — движение · Q / E — поворот камеры\nПКМ + мышь — камера · Колесо — приближение\nЛКМ — идти / выбрать цель и атаковать\nПробел — прыжок · F — действие у NPC\nI / Tab — инвентарь · Esc — отмена\n1–8, Shift + 1–8 — быстрые действия\nПКМ на быстрой ячейке — сменить назначение\nДвойной щелчок по свитку → предмет — заточка", 17))
	box.add_child(button("Закрыть", func(): active_dialog.queue_free()))

func picked(id: String) -> void:
	if id.begins_with("npc:"):
		target_text.text = {"npc:shop":"Торговец · F","npc:elder":"Старейшина · F","npc:teleport":"Хранитель портала · F"}.get(id, "")
		interact()
	else:
		net.intent({"type":"attack","entityId":id,"skill":null})

func interact() -> void:
	if world.target_id == "npc:shop":
		var box: VBoxContainer = dialog("Торговец")
		box.add_child(label("Для покупки подойдите к торговцу.\nПродажа выбранного предмета — в инвентаре."))
		for id: String in ["potion", "ether", "teleport"]:
			box.add_child(button(data.items[id].name + " · " + str({"potion":55,"ether":70,"teleport":130}[id]) + " золота", func(): net.command({"type":"buy","itemId":id})))
	elif world.target_id == "npc:elder":
		net.command({"type":"quest"})
	elif world.target_id == "npc:teleport":
		var box: VBoxContainer = dialog("Хранитель портала", Vector2i(480, 320))
		box.add_child(label("Для перемещения подойдите к хранителю."))
		for destination: String in ["Астерхолд", "Гринфолл", "Чёрный лес", "Вход в шахту"]:
			box.add_child(button(destination, func():
				net.command({"type":"teleport","destination":destination})
				active_dialog.queue_free()))

func activate(action: String) -> void:
	if net.hero.is_empty():
		return
	if action in ["potion", "ether", "teleport"]:
		for item: Dictionary in net.hero.inventory:
			if item.id == action:
				net.command({"type":"use","item":item.duplicate()})
				return
		notice("Нет подходящего предмета в сумке")
	elif action == "attack" or action.begins_with("skill:"):
		if world.target_id.is_empty() or world.target_id.begins_with("npc:"):
			notice("Выберите противника щелчком мыши")
			return
		net.intent({"type":"attack","entityId":world.target_id,"skill":int(action.trim_prefix("skill:")) if action.begins_with("skill:") else null})

func item_clicked(payload: Dictionary, double_click: bool) -> void:
	selected_item = payload.duplicate(true)
	var item: Dictionary = payload.get("item", {})
	if item.is_empty():
		return
	if not selected_scroll.is_empty() and item.uid != selected_scroll.uid:
		net.command({"type":"enhance","item":item.duplicate(),"scroll":selected_scroll.duplicate()})
		selected_scroll = {}
		return
	if double_click:
		use_selected()

func use_selected() -> void:
	var item: Dictionary = selected_item.get("item", {})
	if item.is_empty():
		return
	if data.scrolls.has(item.id):
		selected_scroll = item.duplicate()
		refresh_inventory()
		notice("Выберите предмет для заточки: " + item_name(item) + ". Esc — отмена.")
	elif selected_item.kind == "equipment":
		net.command({"type":"unequip","item":item.duplicate(),"slot":selected_item.slot})
	elif data.items[item.id].has("slot"):
		net.command({"type":"equip","item":item.duplicate(),"slot":resolve_slot(data.items[item.id].slot)})
	else:
		net.command({"type":"use","item":item.duplicate()})

func sell_selected() -> void:
	var item: Dictionary = selected_item.get("item", {})
	if item.is_empty() or selected_item.get("kind") != "bag":
		notice("Выберите предмет в сумке")
		return
	var box: VBoxContainer = dialog("Продать предмет?", Vector2i(500, 180))
	box.add_child(label(item_name(item) + " ×" + str(int(item.count))))
	box.add_child(button("Продать", func():
		net.command({"type":"sell","item":item.duplicate()})
		active_dialog.queue_free()))

func drop_item(source: Dictionary, destination: Dictionary) -> void:
	if destination.kind == "equipment":
		net.command({"type":"equip","item":source.item.duplicate(),"slot":destination.slot})
	elif source.kind == "equipment":
		net.command({"type":"unequip","item":source.item.duplicate(),"slot":source.slot,"index":mini(int(destination.index), net.hero.inventory.size())})
	else:
		net.command({"type":"reorder","item":source.item.duplicate(),"index":mini(int(destination.index), maxi(0, net.hero.inventory.size() - 1))})

func toggle_inventory() -> void:
	inventory_panel.visible = not inventory_panel.visible

func notice(message: String) -> void:
	var translations: Dictionary = {"shop-unavailable":"Подойдите ближе к торговцу", "teleport-unavailable":"Подойдите ближе к хранителю портала", "elder-unavailable":"Подойдите ближе к старейшине", "insufficient-gold":"Недостаточно золота", "level-required":"Недостаточный уровень", "cannot-use":"Этот предмет сейчас нельзя использовать", "bag-full":"Сумка заполнена", "stale-item":"Предмет уже изменился. Выберите его заново", "class-restricted":"Предмет не подходит вашему классу", "invalid-name":"Недопустимое имя персонажа"}
	if log_text != null:
		log_text.append_text(str(translations.get(message, message)) + "\n")
	else:
		print(message)

func text_focused() -> bool:
	return get_viewport().gui_get_focus_owner() is LineEdit or is_instance_valid(active_dialog) or (login != null and login.visible)

func _process(delta: float) -> void:
	if world == null or net == null:
		return
	if qa_started:
		qa_times.append(delta * 1000)
	var direction: Vector2 = Vector2.ZERO
	if not text_focused() and net.connected and not net.hero.is_empty() and not net.hero.dead:
		var local: Vector2 = Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)), float(Input.is_physical_key_pressed(KEY_W)) - float(Input.is_physical_key_pressed(KEY_S)))
		direction = local.normalized().rotated(world.camera_yaw)
		if not Input.is_physical_key_pressed(KEY_SHIFT):
			world.camera_yaw += (float(Input.is_physical_key_pressed(KEY_E)) - float(Input.is_physical_key_pressed(KEY_Q))) * delta * 1.8
	world.movement = direction
	send_elapsed += delta
	if (direction != last_direction or (not direction.is_zero_approx() and send_elapsed > .1)) and net.connected:
		last_direction = direction
		send_elapsed = 0
		net.intent({"type":"direction","x":direction.x,"z":direction.y})
	if status != null and not net.connected and not net.hero.is_empty():
		status.text = "Соединение потеряно · переподключение…"

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_ESCAPE:
			selected_scroll = {}
			world.target_id = ""
			target_text.text = ""
			net.intent({"type":"cancel"})
			if is_instance_valid(active_dialog):
				active_dialog.queue_free()
			return
		if text_focused():
			return
		var key: String = ""
		if event.physical_keycode >= KEY_1 and event.physical_keycode <= KEY_8:
			key = "Digit" + str(event.physical_keycode - KEY_0)
		elif event.physical_keycode in [KEY_Q, KEY_E, KEY_R, KEY_F, KEY_T, KEY_G]:
			key = "Key" + OS.get_keycode_string(event.physical_keycode)
		if event.shift_pressed:
			key = "Shift+" + key
		if not event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed and not key.is_empty():
			for entry: Dictionary in quick:
				if entry.key == key:
					activate(entry.action)
					return
		match event.physical_keycode:
			KEY_I, KEY_TAB: toggle_inventory()
			KEY_SPACE: net.intent({"type":"jump"})
			KEY_F: interact()
	if text_focused():
		return
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		world.camera_yaw -= event.relative.x * .005
		world.camera_pitch = clampf(world.camera_pitch + event.relative.y * .004, .35, 1.35)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			world.click(event.position)
		elif event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			world.camera_distance = clampf(world.camera_distance + (-1.5 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.5), 9, 40)
			save_preferences()

func quit_game() -> void:
	save_preferences()
	net.set_process(false)
	if net.connected:
		await net.request("/api/disconnect", {})
	get_tree().quit()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		quit_game()

func run_qa() -> void:
	# Exercises this native client against a private fixture server, never a player DB.
	await get_tree().create_timer(2.0).timeout
	var checks: Dictionary = {"connected":net.connected,"classes":data.classes.size(),"item_definitions":data.items.size(),"quick_slots":quick.size(),"bag_slots":bag_slots.size(),"equipment_slots":equipment_slots.size(),"world_loaded":world.get_child_count() > 4,"hero_model_loaded":world.actors.has(world.hero_id)}
	var license_file: FileAccess = FileAccess.open(qa_path.get_base_dir().path_join("godot-license.txt"), FileAccess.WRITE)
	if license_file != null:
		license_file.store_string(Engine.get_license_text() + "\n\n" + JSON.stringify(Engine.get_copyright_info(), "  ") + "\n\n" + JSON.stringify(Engine.get_license_info(), "  "))
		license_file.close()
	if net.hero.is_empty():
		net.save_private_json(qa_path, {"ok":false,"checks":checks})
		get_tree().quit(2)
		return
	var uid_before: String = str(net.hero.id)
	quick[31] = {"action":"potion","key":"Shift+KeyG"}
	save_preferences()
	load_preferences(uid_before)
	checks["slot_32_persisted"] = quick[31].action == "potion" and quick[31].key == "Shift+KeyG"
	var before: Vector2 = Vector2(net.hero.x, net.hero.z)
	await net.intent({"type":"direction","x":1,"z":0})
	await get_tree().create_timer(.45).timeout
	await net.intent({"type":"direction","x":0,"z":0})
	await get_tree().create_timer(.35).timeout
	checks["server_movement"] = Vector2(net.hero.x, net.hero.z).distance_to(before) > .1
	checks["hero_uid_stable"] = str(net.hero.id) == uid_before
	var inventory_before: Array = net.hero.inventory.duplicate(true)
	if inventory_before.size() > 1:
		await net.command({"type":"reorder","item":inventory_before[0],"index":inventory_before.size() - 1})
		checks["inventory_command_uid"] = net.hero.inventory[-1].uid == inventory_before[0].uid
	var weapon = net.hero.equipment.get("weapon")
	if weapon is Dictionary:
		await net.command({"type":"unequip","item":weapon.duplicate(),"slot":"weapon"})
		checks["unequip_uid"] = net.hero.inventory.any(func(item: Dictionary): return item.uid == weapon.uid)
		await net.command({"type":"equip","item":weapon.duplicate(),"slot":"weapon"})
		checks["reequip_uid"] = net.hero.equipment.get("weapon", {}).get("uid", "") == weapon.uid
	checks["pending_journal_cleared"] = net.read_private_json(net.pending_path()).is_empty()
	inventory_panel.show()
	qa_started = true
	await get_tree().create_timer(5.0).timeout
	qa_started = false
	checks["native_render"] = DisplayServer.get_name() != "headless"
	if checks.native_render:
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(qa_path.get_basename() + ".png")
	var success: bool = true
	for key: String in checks:
		if checks[key] is bool and key != "native_render" and not checks[key]:
			success = false
	qa_times.sort()
	var report: Dictionary = {"ok":success,"checks":checks,"display":DisplayServer.get_name(),"godot":Engine.get_version_info().string,"frame_ms_median":qa_times[qa_times.size() / 2] if not qa_times.is_empty() else 0,"frame_ms_p95":qa_times[int(qa_times.size() * .95)] if not qa_times.is_empty() else 0,"render_objects":Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),"render_draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"notes":"Synthetic fixture. Headless is not graphical or Windows GPU verification; software renderer is not target-PC performance."}
	net.save_private_json(qa_path, report)
	print("VARENDOR_NATIVE_QA " + JSON.stringify(report))
	net.set_process(false)
	await net.request("/api/disconnect", {})
	get_tree().quit(0 if success else 2)
