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
var stat_values: Dictionary = {}
var target_panel: PanelContainer
var target_hp: ProgressBar
var target_state: Label
var diagnostics: Label
var tooltip_panel: PanelContainer
var tooltip_timer: float = 0
var tooltip_anchor: Control
var frame_intervals: Array[float] = []
var frame_previous: int = 0
var diagnostic_elapsed: float = 0
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
var qa_interaction: bool = false
var qa_times: Array = []
var qa_last_frame_usec: int = 0
var player_input: VarendorPlayerInput = VarendorPlayerInput.new()
var mouse_orbit: bool:
	get: return world.camera_controller.captured if world != null else false
var mouse_sensitivity: float = 1.0
var invert_camera_y: bool = false
var chosen_equipment: String = ""
var inventory_footer: Label
var inventory_drag: bool = false
var inventory_drag_offset: Vector2
var game_settings: Dictionary = {}
const DEFAULT_BINDINGS: Dictionary = {"move_forward":KEY_W,"move_back":KEY_S,"move_left":KEY_A,"move_right":KEY_D,"orbit_left":KEY_Q,"orbit_right":KEY_E,"jump":KEY_SPACE,"interact":KEY_F}
const BINDING_NAMES: Dictionary = {"move_forward":"Вперёд","move_back":"Назад","move_left":"Влево","move_right":"Вправо","orbit_left":"Камера влево","orbit_right":"Камера вправо","jump":"Прыжок","interact":"Взаимодействие"}
var rebinding_action: String = ""
var binding_message: Label
var display_before: Dictionary = {}
var display_remaining: float = 0.0
var display_countdown: Label
var quick_panel_node: PanelContainer

func _ready() -> void:
	if "--world-samples" in OS.get_cmdline_user_args():
		get_tree().call_deferred("change_scene_to_file", "res://scenes/art_review.tscn")
		return
	get_tree().auto_accept_quit = false
	get_viewport().gui_embed_subwindows = true
	configure_input()
	data = JSON.parse_string(FileAccess.get_file_as_string("res://generated/game.json"))
	quick = data.quickDefaults.duplicate(true)
	net = VarendorNetwork.new()
	add_child(net)
	net.expected_content = str(data.get("contentVersion", ""))
	net.expected_map = str(data.get("mapVersion", ""))
	net.snapshot_received.connect(snapshot_received)
	net.notice.connect(notice)
	world = VarendorWorld.new()
	add_child(world)
	player_input.setup(world,net)
	world.snapshot_presented.connect(present_snapshot)
	build_ui()
	login.hide()
	notice("Загрузка мира…")
	await get_tree().process_frame
	if not await world.setup(data):
		notice("Не удалось загрузить мир. Полностью распакуйте свежий пакет игры.")
		return
	world.picked.connect(picked)
	net.intent_reserved.connect(world.record_intent)
	net.intent_submitted.connect(world.submit_intent)
	net.intent_rejected.connect(world.reject_intent)
	world.loot_received.connect(notice)
	net.receipt_received.connect(func(_receipt: Dictionary):
		selected_scroll = {}
		selected_item = {}
		refresh_inventory())
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

func bar_style(color: Color) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(2)
	return style

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
	get_viewport().size_changed.connect(keep_inventory_visible)
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
	var hero_panel: PanelContainer = place_panel(Control.PRESET_BOTTOM_LEFT, Vector2(18, -110), Vector2(290, 92))
	var hero_box: VBoxContainer = VBoxContainer.new()
	hero_box.add_theme_constant_override("separation", 3)
	hero_panel.add_child(hero_box)
	heading = label("VARENDOR", 14, Color("ddc79c"))
	hero_box.add_child(heading)
	hp = ProgressBar.new()
	hp.show_percentage = false
	hp.custom_minimum_size = Vector2(266, 13)
	hp.add_theme_stylebox_override("fill", bar_style(Color("923c36")))
	hp.add_theme_stylebox_override("background", bar_style(Color("24292b")))
	hero_box.add_child(hp)
	mp = ProgressBar.new()
	mp.show_percentage = false
	mp.custom_minimum_size.y = 10
	mp.add_theme_stylebox_override("fill", bar_style(Color("375879")))
	mp.add_theme_stylebox_override("background", bar_style(Color("24292b")))
	hero_box.add_child(mp)
	health_text = label("", 11)
	hero_box.add_child(health_text)
	xp = ProgressBar.new()
	xp.show_percentage = false
	xp.custom_minimum_size.y = 5
	xp.add_theme_stylebox_override("fill", bar_style(Color("a28d53")))
	xp.add_theme_stylebox_override("background", bar_style(Color("24292b")))
	hero_box.add_child(xp)
	target_panel = place_panel(Control.PRESET_CENTER_TOP, Vector2(-150, 20), Vector2(300, 78))
	var target_box: VBoxContainer = VBoxContainer.new()
	target_panel.add_child(target_box)
	target_text = label("", 15, Color("e3caa1"))
	target_box.add_child(target_text)
	target_hp = ProgressBar.new()
	target_hp.custom_minimum_size = Vector2(274, 14)
	target_hp.show_percentage = false
	target_hp.add_theme_stylebox_override("fill", bar_style(Color("8d443f")))
	target_hp.add_theme_stylebox_override("background", bar_style(Color("24292b")))
	target_box.add_child(target_hp)
	target_state = label("", 12)
	target_box.add_child(target_state)
	target_panel.hide()
	var minimap: Control = preload("res://scripts/minimap.gd").new()
	minimap.world = world
	ui.add_child(minimap)
	minimap.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	minimap.position += Vector2(-184, 18)
	minimap.size = Vector2(166, 154)
	minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var menu: VBoxContainer = VBoxContainer.new()
	ui.add_child(menu)
	menu.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	menu.position += Vector2(-162, -110)
	menu.add_child(button("Сумка · TAB", toggle_inventory))
	menu.add_child(button("Меню · Esc", system_menu))
	var quick_panel: PanelContainer = place_panel(Control.PRESET_CENTER_BOTTOM, Vector2(-230, -112), Vector2(460, 94))
	quick_panel_node = quick_panel
	var quick_row: HBoxContainer = HBoxContainer.new()
	quick_panel.add_child(quick_row)
	quick_grid = GridContainer.new()
	quick_grid.columns = 8
	quick_grid.add_theme_constant_override("h_separation", 3)
	quick_grid.add_theme_constant_override("v_separation", 3)
	quick_row.add_child(quick_grid)
	for index: int in range(32):
		var slot: VarendorQuickSlot = VarendorQuickSlot.new()
		slot.focus_mode = Control.FOCUS_NONE
		slot.pressed.connect(func(): activate(quick[index].action))
		slot.custom_minimum_size = Vector2(48, 40)
		slot.gui_input.connect(func(event: InputEvent):
			if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
				assign_dialog(index))
		quick_grid.add_child(slot)
		quick_buttons.append(slot)
	quick_row.add_child(button("+", func():
		full_quick = not full_quick
		refresh_quick()
		save_preferences()))
	refresh_quick()
	var log_panel: PanelContainer = place_panel(Control.PRESET_BOTTOM_LEFT, Vector2(18, -274), Vector2(290, 150))
	log_panel.add_theme_stylebox_override("panel", panel_style(Color(.06, .08, .08, .64), Color("514c3b")))
	var log_box: VBoxContainer = VBoxContainer.new()
	log_panel.add_child(log_box)
	log_box.add_child(label("Журнал", 12, Color("b7a580")))
	log_text = RichTextLabel.new()
	log_text.custom_minimum_size = Vector2(262, 108)
	log_text.add_theme_font_size_override("normal_font_size", 12)
	log_text.scroll_following = true
	log_box.add_child(log_text)
	status = label("", 12, Color("c9bb9b"))
	ui.add_child(status)
	status.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	status.position += Vector2(-184, 179)
	diagnostics = label("", 12)
	ui.add_child(diagnostics)
	diagnostics.position = Vector2(18, 18)
	diagnostics.hide()
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
	inventory_panel = place_panel(Control.PRESET_TOP_RIGHT, Vector2(-404, 180), Vector2(384, 530))
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	inventory_panel.add_child(box)
	var top: HBoxContainer = HBoxContainer.new()
	box.add_child(top)
	inventory_title = label("ПЕРСОНАЖ", 16, Color("dfc591"))
	inventory_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inventory_title.mouse_filter = Control.MOUSE_FILTER_STOP
	inventory_title.gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
			inventory_drag = event.pressed
			inventory_drag_offset = get_viewport().get_mouse_position() - inventory_panel.position
			if not event.pressed:
				save_preferences()
		elif event is InputEventMouseMotion and inventory_drag:
			inventory_panel.position = (get_viewport().get_mouse_position() - inventory_drag_offset).clamp(Vector2.ZERO, (ui.size - inventory_panel.size).max(Vector2.ZERO)))
	top.add_child(inventory_title)
	top.add_child(button("×", toggle_inventory))
	var character_area: HBoxContainer = HBoxContainer.new()
	character_area.add_theme_constant_override("separation", 8)
	box.add_child(character_area)
	var stat_panel: PanelContainer = PanelContainer.new()
	stat_panel.custom_minimum_size = Vector2(154, 235)
	stat_panel.add_theme_stylebox_override("panel", panel_style(Color("181e20"), Color("454a42")))
	character_area.add_child(stat_panel)
	stats_text = label("", 12)
	stats_text.clip_text = true
	stats_text.hide()
	stat_panel.add_child(stats_text)
	var stat_grid: VBoxContainer = VBoxContainer.new()
	stat_grid.add_theme_constant_override("separation", 1)
	stat_panel.add_child(stat_grid)
	for entry: Array in [["level","Уровень"],["hp","ОЗ"],["mp","Ресурс"],["str","Сила"],["dex","Ловкость"],["int","Интеллект"],["vit","Выносливость"],["spi","Дух"],["attack","Атака"],["matk","Маг. атака"],["def","Защита"],["mdef","Маг. защита"]]:
		var row: HBoxContainer = HBoxContainer.new()
		stat_grid.add_child(row)
		var caption: Label = label(str(entry[1]), 11, Color("b8b3a3"))
		caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(caption)
		var value: Label = label("", 11, Color("ece0c4"))
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(value)
		stat_values[str(entry[0])] = value
		var line: HSeparator = HSeparator.new()
		line.custom_minimum_size.y = 1
		var rule: StyleBoxLine = StyleBoxLine.new()
		rule.color = Color("454a42")
		rule.thickness = 1
		line.add_theme_stylebox_override("separator", rule)
		stat_grid.add_child(line)
	var equipment: GridContainer = GridContainer.new()
	equipment.columns = 3
	equipment.add_theme_constant_override("h_separation", 3)
	equipment.add_theme_constant_override("v_separation", 4)
	character_area.add_child(equipment)
	# Twelve established slots, positioned like the reference character paper doll.
	for slot_name: String in ["neck", "head", "ear1", "weapon", "chest", "ear2", "offhand", "gloves", "ring1", "belt", "boots", "ring2"]:
		var slot: VarendorItemSlot = VarendorItemSlot.new()
		slot.owner_ui = self
		slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = Vector2(54, 54)
		slot.payload = {"kind":"equipment","slot":slot_name,"item":{}}
		slot.tooltip_text = data.slotNames[slot_name]
		equipment.add_child(slot)
		equipment_slots[slot_name] = slot
	var tabs: HBoxContainer = HBoxContainer.new()
	box.add_child(tabs)
	var bag_tab: Label = label("Инвентарь", 13, Color("dfc591"))
	bag_tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tabs.add_child(bag_tab)
	tabs.add_child(button("Комплект", func():
		var details: VBoxContainer = dialog("Бонусы комплекта", Vector2i(390, 180))
		details.add_child(label("В текущих предметах бонусы комплектов\nне заданы. Характеристики экипировки\nучитываются в окне персонажа.", 15))))
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(358, 165)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_ALWAYS
	box.add_child(scroll)
	var bag: GridContainer = GridContainer.new()
	bag.columns = 6
	bag.add_theme_constant_override("h_separation", 3)
	bag.add_theme_constant_override("v_separation", 3)
	scroll.add_child(bag)
	for index: int in range(42):
		var slot: VarendorItemSlot = VarendorItemSlot.new()
		slot.owner_ui = self
		slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = Vector2(53, 53)
		slot.payload = {"kind":"bag","index":index,"item":{}}
		bag.add_child(slot)
		bag_slots.append(slot)
	inventory_footer = label("Золото: 0      Ячейки: 0 / 42", 12)
	box.add_child(inventory_footer)
	var commands: HBoxContainer = HBoxContainer.new()
	box.add_child(commands)
	commands.add_child(button("Использовать", use_selected))
	commands.add_child(button("Продать", sell_selected))
	commands.add_child(button("Добыча", func(): net.command({"type":"collect"})))

	inventory_panel.hide()

func snapshot_received(snapshot: Dictionary) -> void:
	world.receive_snapshot(snapshot)

func present_snapshot(snapshot: Dictionary) -> void:
	var hero: Dictionary = snapshot.character
	if login != null:
		login.hide()
	if preference_hero != str(hero.id):
		load_preferences(str(hero.id))
	heading.text = hero.name + " · " + data.classes[hero.classId].name + " · " + str(int(hero.level))
	hp.max_value = hero.maxHp
	hp.value = hero.hp
	mp.max_value = hero.maxMp
	mp.value = hero.mp
	xp.max_value = data.xpNeeded[clampi(int(hero.level), 0, data.xpNeeded.size() - 1)]
	xp.value = hero.xp
	xp.tooltip_text = "Опыт: %d / %d · Задание: %d · Побед: %d" % [hero.xp, xp.max_value, hero.quest, hero.kills]
	health_text.text = "ОЗ %d / %d    %s %d / %d" % [hero.hp, hero.maxHp, data.classes[hero.classId].resource, hero.mp, hero.maxMp]
	var region: String = ""
	var nearest: float = INF
	for location: Dictionary in data.locations:
		var distance: float = Vector2(location.x - hero.x, location.z - hero.z).length_squared()
		if distance < nearest:
			nearest = distance
			region = location.name
	status.text = region
	respawn.visible = hero.dead
	inventory_title.text = str(hero.name) + " · Персонаж"
	inventory_footer.text = "Золото: %d      Ячейки: %d / 42" % [hero.gold, hero.inventory.size()]
	stats_text.text = "%s\n\nУровень        %d\nОЗ            %d / %d\n%s       %d / %d\n\nСила           %d\nЛовкость       %d\nИнтеллект      %d\nВыносливость   %d\nДух            %d\n\nАтака          %d–%d\nМаг. атака      %d\nЗащита         %d\nМаг. защита     %d" % [hero.name, hero.level, hero.hp, hero.maxHp, data.classes[hero.classId].resource, hero.mp, hero.maxMp, hero.stats.get("str", 0), hero.stats.get("dex", 0), hero.stats.get("int", 0), hero.stats.get("vit", 0), hero.stats.get("spi", 0), hero.stats.get("atkMin", 0), hero.stats.get("atkMax", 0), hero.stats.get("matk", 0), hero.stats.get("def", 0), hero.stats.get("mdef", 0)]
	for key: String in stat_values:
		var value: String = str(int(hero.stats.get(key, 0)))
		if key == "level": value = str(int(hero.level))
		elif key == "hp": value = "%d/%d" % [hero.hp, hero.maxHp]
		elif key == "mp": value = "%d/%d" % [hero.mp, hero.maxMp]
		elif key == "attack": value = "%d–%d" % [hero.stats.atkMin, hero.stats.atkMax]
		stat_values[key].text = value
	var fingerprint: String = JSON.stringify([hero.inventory, hero.equipment, hero.stats, selected_scroll])
	if fingerprint != inventory_fingerprint:
		inventory_fingerprint = fingerprint
		refresh_inventory()
	refresh_quick()
	target_text.text = ""
	target_panel.hide()
	if not world.target_id.is_empty():
		for monster: Dictionary in snapshot.get("monsters", []):
			if str(monster.uid) == world.target_id:
				target_panel.show()
				target_text.text = data.monsters[monster.id].name + " · %d ур." % int(data.monsters[monster.id].level)
				target_hp.max_value = float(data.monsters[monster.id].hp)
				target_hp.value = maxf(0, float(monster.hp))
				target_state.text = "%d / %d ОЗ · " % [monster.hp, target_hp.max_value] + ("Побеждён" if not monster.alive else "Атака" if hero.action == "attack" else "Подход" if hero.action == "walk" else "Цель выбрана")
				break

func item_name(item: Dictionary) -> String:
	if item.is_empty():
		return ""
	return str(data.items.get(item.id, {}).get("name", "Неизвестный предмет: " + str(item.id))) + (" +" + str(int(item.plus)) if item.plus > 0 else "")

func item_tip(item: Dictionary) -> String:
	if item.is_empty():
		return "Свободная ячейка"
	var def: Dictionary = data.items.get(item.id, {})
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
			var item_slot: String = str(def.get("slot", ""))
			var compared: Array = ["ring1", "ring2"] if item_slot == "ring" else ["ear1", "ear2"] if item_slot in ["ear", "earring"] else [resolve_slot(item_slot)]
			for slot: String in compared:
				var equipped = net.hero.equipment.get(slot)
				if equipped is Dictionary and equipped.uid != item.uid and data.items.get(equipped.id, {}).get("slot", "") == def.get("slot", "-"):
					lines.append("\n" + ("Замена: " if slot == resolve_slot(item_slot) else "Вторая ячейка: ") + item_name(equipped))
					var other: Dictionary = data.itemStats[equipped.id][clampi(int(equipped.plus), 0, 15)].total
					var keys: Dictionary = other.duplicate()
					keys.merge(stats.total, true)
					for key: String in keys:
						var difference: float = float(stats.total.get(key, 0)) - float(other.get(key, 0))
						if difference != 0:
							lines.append("%s: %+.2f" % [names.get(key, key), difference])
	if data.scrolls.has(item.id):
		lines.append("Дважды нажмите свиток, затем предмет для заточки.")
	if not selected_scroll.is_empty() and def.has("slot") and int(item.plus) < 15:
		var scroll: Dictionary = data.scrolls[selected_scroll.id]
		var category: String = "weapon" if def.slot == "weapon" else "armor"
		if scroll.category == category:
			var chance: float = float(data.chances[category + "_" + scroll.quality][int(item.plus)])
			lines.append("\nЗаточка: +%d → +%d · Шанс %s%%" % [item.plus, item.plus + 1, chance])
			lines.append("Безопасная попытка." if chance >= 100 else "При неудаче предмет уничтожается.\nУлучшенный свиток не страхует.")
	lines.append("Количество: %d · Продажа: %d золота" % [item.count, floorf(float(def.get("value", 0)) * .48) * item.count])
	return "\n".join(lines)

func resolve_slot(item_slot: String) -> String:
	# Same selection order as the existing core/inventory-commands.ts resolver.
	var slots: Array = ["ring1", "ring2"] if item_slot == "ring" else ["ear1", "ear2"] if item_slot in ["ear", "earring"] else [item_slot]
	if chosen_equipment in slots:
		return chosen_equipment
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
		slot.update_item(item)
		slot.tooltip_text = ""
	for slot_name: String in equipment_slots:
		var item = net.hero.equipment.get(slot_name)
		var slot: VarendorItemSlot = equipment_slots[slot_name]
		slot.payload.item = item.duplicate() if item is Dictionary else {}
		slot.update_item(item if item is Dictionary else {})
		slot.tooltip_text = "" if item is Dictionary else str(data.slotNames[slot_name])

func action_name(action: String) -> String:
	if action.begins_with("skill:"):
		var class_id: String = str(net.hero.get("classId", "knight"))
		return data.classes[class_id].skills[int(action.trim_prefix("skill:"))].name
	return {"":"—","attack":"Атака","potion":"Здоровье","ether":"Ресурс","teleport":"Возврат"}.get(action, action)

func refresh_quick() -> void:
	if quick_panel_node != null:
		quick_panel_node.position.y = ui.size.y - (202 if full_quick else 112)
		quick_panel_node.size.y = 184 if full_quick else 94
	for index: int in range(quick_buttons.size()):
		var slot: VarendorQuickSlot = quick_buttons[index]
		var action: String = quick[index].action
		var key: String = quick[index].key.replace("Shift+", "S+").replace("Digit", "").replace("Key", "")
		var title: String = action_name(action)
		var artwork_id: String = action if data.items.has(action) else str(data.classes[net.hero.get("classId", "knight")].weapon)
		slot.artwork = load("res://assets/icons/" + artwork_id + ".svg") if not action.is_empty() else null
		slot.remaining = 0
		slot.quantity = 0
		slot.usable = not net.hero.get("dead", false)
		if action in ["potion", "ether", "teleport"] and not net.hero.is_empty():
			for item: Dictionary in net.hero.inventory:
				if item.id == action:
					slot.quantity += int(item.count)
			slot.usable = slot.usable and slot.quantity > 0
		var icon: String = {"":"·","attack":"⚔","potion":"ОЗ","ether":"MP","teleport":"⌂"}.get(action, str(index % 8 + 1))
		if action.begins_with("skill:"):
			var skill_index: int = int(action.trim_prefix("skill:"))
			slot.artwork = load("res://assets/icons/%s_skill_%d.svg" % [net.hero.get("classId", "knight"), skill_index])
			var skill: Dictionary = data.classes[net.hero.get("classId", "knight")].skills[skill_index]
			icon = str(skill.icon)
			if not net.hero.is_empty():
				var left: float = maxf(0, (net.hero.cooldowns[skill_index] - float(world.current_snapshot.get("time", net.last_time))) / 1000.0)
				slot.remaining = left
				slot.cooldown = float(skill.cd)
				slot.usable = slot.usable and net.hero.mp >= skill.cost and left <= 0
				if left > 0:
					icon = "%.1f" % left
			title += "\nЦена: %s · Перезарядка: %s с" % [skill.cost, skill.cd]
		slot.text = ""
		slot.key_label = key
		slot.queue_redraw()
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
	world.camera_distance = clampf(float(preferences.get("camera_distance", 21)), 9, 30)
	game_settings = preferences.get("settings", {})
	configure_input()
	full_quick = bool(preferences.get("full_quick", false))
	if preferences.get("inventory_position") is Array and preferences.inventory_position.size() == 2:
		inventory_panel.position = Vector2(preferences.inventory_position[0], preferences.inventory_position[1]).clamp(Vector2.ZERO, (ui.size - inventory_panel.size).max(Vector2.ZERO))
	apply_settings()
	quick_panel_node.position.y = ui.size.y - (202 if full_quick else 112)
	quick_panel_node.size.y = 184 if full_quick else 94
	refresh_quick()

func save_preferences() -> void:
	if preference_path.is_empty():
		return
	preferences["quickbar"] = quick
	preferences["camera_distance"] = world.camera_distance
	preferences["schema"] = 2
	preferences["full_quick"] = full_quick
	preferences["inventory_position"] = [inventory_panel.position.x, inventory_panel.position.y]
	preferences["settings"] = game_settings
	if not net.save_private_json(preference_path, preferences):
		notice("Не удалось сохранить назначения клавиш")

func dialog(title: String, size: Vector2i = Vector2i(480, 270)) -> VBoxContainer:
	# Embedded exclusive windows receive their own input events. Return the
	# cursor before transferring focus so RMB release cannot become stranded.
	world.camera_controller.release_for_modal()
	if is_instance_valid(active_dialog):
		close_dialog()
	active_dialog = Window.new()
	active_dialog.title = title
	active_dialog.size = size + Vector2i(0, 36)
	active_dialog.transient = true
	active_dialog.exclusive = true
	active_dialog.theme = ui.theme
	add_child(active_dialog)
	active_dialog.close_requested.connect(func():
		rebinding_action = ""
		if not display_before.is_empty():
			revert_display()
		close_dialog())
	active_dialog.window_input.connect(func(event: InputEvent):
		if not rebinding_action.is_empty() and event is InputEventKey and event.pressed and not event.echo and event.physical_keycode != KEY_ESCAPE:
			active_dialog.set_input_as_handled()
			assign_movement_binding(event)
			return
		if event is InputEventKey and event.pressed and event.physical_keycode in [KEY_ESCAPE, KEY_TAB]:
			if not display_before.is_empty():
				revert_display()
			rebinding_action = ""
			active_dialog.set_input_as_handled()
			close_dialog())
	var panel: PanelContainer = PanelContainer.new()
	active_dialog.add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var box: VBoxContainer = VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)
	var title_bar: HBoxContainer = HBoxContainer.new()
	box.add_child(title_bar)
	var heading_label: Label = label(title, 16, Color("dfc591"))
	heading_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_bar.add_child(heading_label)
	title_bar.add_child(button("×", close_dialog))
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
		close_dialog()))

func controls_dialog() -> void:
	var box: VBoxContainer = dialog("Настройки", Vector2i(590, 520))
	var tabs: TabContainer = TabContainer.new()
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(tabs)
	for title: String in ["Игра", "Графика", "Управление", "Дисплей"]:
		var page: VBoxContainer = VBoxContainer.new()
		page.name = title
		page.add_theme_constant_override("separation", 12)
		tabs.add_child(page)
		match title:
			"Игра":
				setting_toggle(page, "Имена над персонажами", "names", true)
				setting_choice(page, "Масштаб интерфейса", "ui_scale", ["80%", "100%", "125%", "150%"], 1)
				setting_choice(page, "Громкость боя", "combat_volume", ["Выкл.", "25%", "50%", "75%", "100%"], 3)
				setting_choice(page, "Звуки окружения", "ambient_volume", ["Выкл.", "25%", "50%", "75%", "100%"], 2)
				page.add_child(label("Tab — инвентарь и персонаж.\nEsc — закрыть окно / отменить действие / меню.", 15))
			"Графика":
				setting_choice(page, "Профиль", "quality", ["Низкий", "Средний", "Высокий"], 2)
				setting_choice(page, "Сглаживание MSAA", "msaa", ["Выкл.", "2×", "4×", "8×"], 2)
				setting_toggle(page, "Тени", "shadows", true)
				setting_toggle(page, "Атмосферный туман", "fog", true)
				setting_choice(page, "Дальность мира", "distance", ["150 м", "240 м", "360 м"], 2)
				setting_choice(page, "Декоративная растительность", "vegetation", ["24 м", "45 м", "80 м"], 2)
				setting_choice(page, "Разрешение 3D", "render_scale", ["50%", "75%", "100%"], 2)
			"Управление":
				page.add_child(label("ЛКМ по земле — движение. ЛКМ по врагу — атака.\nЗажатая ПКМ — вращение камеры. Колесо — масштаб.\nWASD — движение, Q / E — камера, Пробел — прыжок.\nПКМ по быстрой ячейке — действие и клавиша.", 15))
				setting_toggle(page, "Инвертировать камеру по вертикали", "invert_y", false)
				page.add_child(label("Чувствительность мыши"))
				var slider: HSlider = HSlider.new()
				slider.min_value = .25
				slider.max_value = 2.5
				slider.step = .05
				slider.value = float(game_settings.get("sensitivity", 1.0))
				page.add_child(slider)
				slider.value_changed.connect(func(value: float): game_settings["sensitivity"] = value; apply_settings(); save_preferences())
				var keys: GridContainer = GridContainer.new()
				keys.columns = 2
				page.add_child(keys)
				for action: String in DEFAULT_BINDINGS:
					var code: int = int(game_settings.get("bindings", {}).get(action, DEFAULT_BINDINGS[action]))
					keys.add_child(button(str(BINDING_NAMES[action]) + " · " + OS.get_keycode_string(code), func():
						var prompt: VBoxContainer = dialog("Клавиша: " + str(BINDING_NAMES[action]), Vector2i(500, 190))
						rebinding_action = action
						binding_message = label("Нажмите одну клавишу. Esc — отмена.", 15)
						prompt.add_child(binding_message)))
			"Дисплей":
				setting_choice(page, "Режим экрана", "display", ["Оконный", "Без рамки", "Полный экран"], 0)
				var names: Array = []
				for resolution: Vector2i in window_resolutions():
					names.append("%d × %d" % [resolution.x, resolution.y])
				setting_choice(page, "Размер окна (полный экран — размер монитора)", "resolution", names, 1)
				var actual: Vector2i = DisplayServer.window_get_size()
				var internal: Vector2i = Vector2i(Vector2(actual) * get_viewport().scaling_3d_scale)
				page.add_child(label("Вывод: %d × %d · Рендер 3D: %d × %d" % [actual.x, actual.y, internal.x, internal.y], 13))
				setting_toggle(page, "Вертикальная синхронизация", "vsync", true)
				setting_choice(page, "Ограничение кадров", "fps", ["30", "60", "120", "Без ограничения"], 1)
	box.add_child(button("Вернуться в игру", func(): save_preferences(); close_dialog()))

func setting_toggle(parent: Control, title: String, key: String, fallback: bool) -> void:
	var check: CheckButton = CheckButton.new()
	check.text = title
	check.button_pressed = bool(game_settings.get(key, fallback))
	parent.add_child(check)
	check.toggled.connect(func(value: bool): game_settings[key] = value; apply_settings(); save_preferences())

func setting_choice(parent: Control, title: String, key: String, choices: Array, fallback: int) -> void:
	parent.add_child(label(title))
	var choice: OptionButton = OptionButton.new()
	for value: String in choices:
		choice.add_item(value)
	choice.selected = clampi(int(game_settings.get(key, fallback)), 0, choices.size() - 1)
	parent.add_child(choice)
	choice.item_selected.connect(func(value: int):
		var previous: Dictionary = {"display":game_settings.get("display", 0),"resolution":game_settings.get("resolution", 1)}
		game_settings[key] = value
		if key in ["display", "resolution"]:
			confirm_display(previous)
			return
		if key == "quality":
			game_settings["msaa"] = [0, 1, 2][value]
			game_settings["shadows"] = value > 0
		apply_settings()
		save_preferences())

func apply_settings() -> void:
	mouse_sensitivity = clampf(float(game_settings.get("sensitivity", 1.0)), .25, 2.5)
	invert_camera_y = bool(game_settings.get("invert_y", false))
	world.camera_controller.sensitivity = mouse_sensitivity
	world.camera_controller.invert_y = invert_camera_y
	world.show_names = bool(game_settings.get("names", true))
	world.combat_volume = clampf(float(game_settings.get("combat_volume", 3)) / 4.0, 0, 1)
	if world.ambient_player != null:
		world.ambient_player.volume_linear = clampf(float(game_settings.get("ambient_volume", 2)) / 4.0, 0, 1) * .55
	if world.sun_light != null:
		world.sun_light.shadow_enabled = bool(game_settings.get("shadows", true))
		world.sun_light.directional_shadow_max_distance = [35.0, 60.0, 90.0][clampi(int(game_settings.get("quality", 2)), 0, 2)]
		world.world_environment.fog_enabled = bool(game_settings.get("fog", true))
	if world.camera != null:
		world.camera.far = [150.0, 240.0, 360.0][clampi(int(game_settings.get("distance", 2)), 0, 2)]
		for mesh: GeometryInstance3D in world.decorations:
			mesh.visibility_range_end = [24.0, 45.0, 80.0][clampi(int(game_settings.get("vegetation", 2)), 0, 2)]
	get_viewport().scaling_3d_scale = [.5, .75, 1.0][clampi(int(game_settings.get("render_scale", 2)), 0, 2)]
	get_window().content_scale_factor = [.8, 1.0, 1.25, 1.5][clampi(int(game_settings.get("ui_scale", 1)), 0, 3)]
	get_viewport().msaa_3d = clampi(int(game_settings.get("msaa", 2)), 0, 3) as Viewport.MSAA
	if qa_interaction and DisplayServer.get_name() != "headless":
		# Functional mouse/network tests under CPU-only Mesa use the actual low
		# quality profile. The final screenshot/metrics restore the high profile.
		get_viewport().scaling_3d_scale = .5
		get_viewport().msaa_3d = Viewport.MSAA_DISABLED
		if world.sun_light != null:
			world.sun_light.shadow_enabled = false
	Engine.max_fps = [30, 60, 120, 0][clampi(int(game_settings.get("fps", 1)), 0, 3)]
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if game_settings.get("vsync", true) else DisplayServer.VSYNC_DISABLED)
		var mode: int = clampi(int(game_settings.get("display", 0)), 0, 2)
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if mode == 2 else DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, mode == 1)
		if mode == 0:
			var resolutions: Array = window_resolutions()
			var requested: Vector2i = resolutions[clampi(int(game_settings.get("resolution", 1)), 0, resolutions.size() - 1)]
			if DisplayServer.window_get_size() != requested:
				DisplayServer.window_set_size(requested)
	call_deferred("keep_inventory_visible")

func configure_input() -> void:
	for action: String in DEFAULT_BINDINGS:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		InputMap.action_erase_events(action)
		var event: InputEventKey = InputEventKey.new()
		event.physical_keycode = int(game_settings.get("bindings", {}).get(action, DEFAULT_BINDINGS[action]))
		InputMap.action_add_event(action, event)

func assign_movement_binding(event: InputEventKey) -> void:
	var key: int = event.physical_keycode
	if event.shift_pressed or event.ctrl_pressed or event.alt_pressed or event.meta_pressed or key in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_I, KEY_C, KEY_TAB] or (key >= KEY_1 and key <= KEY_8):
		binding_message.text = "Выберите одну клавишу без модификаторов.\nI / C / Tab и 1–8 заняты интерфейсом."
		return
	var bindings: Dictionary = game_settings.get("bindings", {}).duplicate()
	for action: String in DEFAULT_BINDINGS:
		if action != rebinding_action and int(bindings.get(action, DEFAULT_BINDINGS[action])) == key:
			binding_message.text = "Клавиша занята: " + str(BINDING_NAMES[action]) + ".\nВыберите другую."
			return
	bindings[rebinding_action] = key
	game_settings["bindings"] = bindings
	rebinding_action = ""
	configure_input()
	save_preferences()
	close_dialog()

func window_resolutions() -> Array:
	var monitor: Vector2i = DisplayServer.screen_get_size()
	var values: Array = []
	for resolution: Vector2i in [Vector2i(1280, 720), Vector2i(1440, 810), Vector2i(1600, 900), Vector2i(1920, 1080), Vector2i(2560, 1440), Vector2i(3840, 2160)]:
		if DisplayServer.get_name() == "headless" or (resolution.x <= monitor.x and resolution.y <= monitor.y):
			values.append(resolution)
	if monitor.x > 0 and monitor.y > 0 and monitor not in values:
		values.append(monitor)
	return values if not values.is_empty() else [Vector2i(1280, 720)]

func keep_inventory_visible() -> void:
	if inventory_panel != null:
		inventory_panel.position = inventory_panel.position.clamp(Vector2.ZERO, (ui.size - inventory_panel.size).max(Vector2.ZERO))

func confirm_display(previous: Dictionary) -> void:
	close_dialog()
	display_before = previous
	display_remaining = 15.0
	apply_settings()
	var box: VBoxContainer = dialog("Сохранить видеорежим?", Vector2i(450, 190))
	display_countdown = label("Возврат прежнего режима через 15 с")
	box.add_child(display_countdown)
	box.add_child(button("Сохранить", func():
		display_before = {}
		save_preferences()
		close_dialog()))
	box.add_child(button("Вернуть прежний", func(): revert_display(); close_dialog()))

func revert_display() -> void:
	game_settings.merge(display_before, true)
	display_before = {}
	apply_settings()
	save_preferences()

func picked(id: String) -> void:
	if id.begins_with("npc:"):
		target_text.text = {"npc:shop":"Торговка Эльза · F","npc:elder":"Староста Роэн · F","npc:smith":"Кузнец Бран · F","npc:teleport":"Проводник Каэль · F"}.get(id, "")
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
	elif world.target_id == "npc:smith":
		inventory_panel.show()
		notice("Бран: дважды нажмите свиток, затем один раз — предмет. Свитки добываются с монстров.")
	elif world.target_id == "npc:teleport":
		var box: VBoxContainer = dialog("Хранитель портала", Vector2i(480, 320))
		box.add_child(label("Для перемещения подойдите к хранителю."))
		for destination: String in ["Астерхолд", "Гринфолл", "Чёрный лес", "Вход в шахту"]:
			box.add_child(button(destination, func():
				net.command({"type":"teleport","destination":destination})
				close_dialog()))

func activate(action: String) -> void:
	if net.hero.is_empty() or net.hero.dead or not net.connected:
		return
	if action in ["potion", "ether", "teleport"]:
		for item: Dictionary in net.hero.inventory:
			if item.id == action:
				net.command({"type":"use","item":item.duplicate()})
				return
		notice("Нет подходящего предмета в сумке")
	elif action == "attack" or action.begins_with("skill:"):
		var index: int = int(action.trim_prefix("skill:")) if action.begins_with("skill:") else -1
		var skill: Dictionary = data.classes[net.hero.classId].skills[index] if index >= 0 else {}
		var self_cast: bool = skill.has("buff") or bool(skill.get("summon", false))
		if not self_cast and (world.target_id.is_empty() or world.target_id.begins_with("npc:")):
			notice("Выберите противника щелчком мыши")
			return
		net.intent({"type":"attack","entityId":"@self" if self_cast else world.target_id,"skill":index if index >= 0 else null})

func item_clicked(payload: Dictionary, double_click: bool) -> void:
	if net.command_busy or net.hero.get("dead", true):
		return
	selected_item = payload.duplicate(true)
	if payload.get("kind") == "equipment":
		chosen_equipment = str(payload.slot)
	var item: Dictionary = payload.get("item", {})
	if item.is_empty():
		return
	if not selected_scroll.is_empty() and item.uid != selected_scroll.uid:
		if can_enhance(item):
			net.command({"type":"enhance","item":item.duplicate(),"scroll":selected_scroll.duplicate()})
		else:
			notice("Этот свиток не подходит к выбранному предмету")
		return
	if double_click:
		use_selected()

func use_selected() -> void:
	var item: Dictionary = selected_item.get("item", {})
	if item.is_empty():
		return
	if not data.items.has(item.id):
		notice("Этот предмет сохранён, но пока не поддерживается клиентом")
		return
	if data.scrolls.has(item.id):
		selected_scroll = item.duplicate()
		refresh_inventory()
		notice("Выберите предмет для заточки: " + item_name(item) + ". Esc — отмена.")
	elif selected_item.kind == "equipment":
		net.command({"type":"unequip","item":item.duplicate(),"slot":selected_item.slot})
	elif data.items.get(item.id, {}).has("slot"):
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
		close_dialog()))

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
	if not qa_path.is_empty():
		print("VARENDOR_QA_NOTICE " + message)
	var translations: Dictionary = {"shop-unavailable":"Подойдите ближе к торговцу", "teleport-unavailable":"Подойдите ближе к хранителю портала", "elder-unavailable":"Подойдите ближе к старейшине", "insufficient-gold":"Недостаточно золота", "level-required":"Недостаточный уровень", "cannot-use":"Этот предмет сейчас нельзя использовать", "bag-full":"Сумка заполнена", "stale-item":"Предмет уже изменился. Выберите его заново", "class-restricted":"Предмет не подходит вашему классу", "invalid-name":"Недопустимое имя персонажа", "missing-target":"Цель уже недоступна", "cooldown":"Умение восстанавливается", "insufficient-resource":"Недостаточно ресурса", "airborne":"Дождитесь приземления", "attack-in-progress":"Текущее действие ещё выполняется", "no-free-path":"До этой точки нет свободного пути", "dead":"Действие недоступно после гибели", "no-free-arrival":"Точка прибытия занята"}
	if log_text != null:
		log_text.append_text(str(translations.get(message, message)) + "\n")
		if log_text.get_paragraph_count() > 200:
			log_text.remove_paragraph(0)
	else:
		print(message)

func text_focused() -> bool:
	return get_viewport().gui_get_focus_owner() is LineEdit or is_instance_valid(active_dialog) or (login != null and login.visible)

func _process(delta: float) -> void:
	if world == null or net == null:
		return
	if not display_before.is_empty():
		display_remaining -= delta
		if is_instance_valid(display_countdown):
			display_countdown.text = "Возврат прежнего режима через %d с" % ceili(display_remaining)
		if display_remaining <= 0:
			revert_display()
			if is_instance_valid(active_dialog):
				close_dialog()
	var frame_now: int = Time.get_ticks_usec()
	if frame_previous > 0:
		frame_intervals.append(float(frame_now - frame_previous) / 1000.0)
		if frame_intervals.size() > 180: frame_intervals.pop_front()
	frame_previous = frame_now
	diagnostic_elapsed += delta
	if diagnostic_elapsed >= .5 and diagnostics.visible:
		diagnostic_elapsed = 0
		var sorted: Array = frame_intervals.duplicate()
		sorted.sort()
		diagnostics.text = "FPS %d · frame %.1f ms · p95 %.1f ms\nprocess %.1f ms · physics %.1f ms\nМобы %d · draw calls %d · F3 — скрыть" % [Engine.get_frames_per_second(), frame_intervals.back() if not frame_intervals.is_empty() else 0, sorted[int(sorted.size() * .95)] if not sorted.is_empty() else 0, Performance.get_monitor(Performance.TIME_PROCESS) * 1000, Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000, world.current_snapshot.get("monsters", []).filter(func(m: Dictionary): return m.alive).size(), Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)]
	if is_instance_valid(tooltip_panel):
		var hovering_item: bool = is_instance_valid(tooltip_anchor) and tooltip_anchor.is_visible_in_tree() and tooltip_anchor.get_global_rect().has_point(ui.get_global_mouse_position())
		if not hovering_item and not tooltip_panel.get_global_rect().has_point(ui.get_global_mouse_position()):
			tooltip_timer -= delta
			if tooltip_timer <= 0: tooltip_panel.queue_free()
	if qa_started:
		var now_usec: int = Time.get_ticks_usec()
		if qa_last_frame_usec > 0:
			qa_times.append(float(now_usec - qa_last_frame_usec) / 1000.0)
		qa_last_frame_usec = now_usec
	player_input.poll(delta,not text_focused() and net.connected and not net.hero.is_empty() and not net.hero.dead)
	if status != null and not net.connected and not net.hero.is_empty():
		status.text = "Соединение потеряно · переподключение…"

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_F3:
			diagnostics.visible = not diagnostics.visible
			return
		if event.physical_keycode == KEY_ESCAPE:
			if is_instance_valid(active_dialog):
				close_dialog()
				return
			if not selected_scroll.is_empty():
				selected_scroll = {}
				refresh_inventory()
				return
			if inventory_panel.visible:
				inventory_panel.hide()
				return
			if world.target_id.is_empty() and world.click_goal == null:
				system_menu()
				return
			world.target_id = ""
			target_text.text = ""
			net.intent({"type":"cancel"})
			if is_instance_valid(active_dialog):
				close_dialog()
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
			KEY_I, KEY_C, KEY_TAB: toggle_inventory()
		if event.is_action_pressed("jump"):
			net.intent({"type":"jump"})
		elif event.is_action_pressed("interact"):
			interact()
	if text_focused():
		return
	if player_input.mouse(event):
		get_viewport().set_input_as_handled()
		if event is InputEventMouseButton and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]: save_preferences()

func _input(event: InputEvent) -> void:
	if world != null and world.camera_controller.handle_captured_input(event): get_viewport().set_input_as_handled()

func release_orbit(restore: bool = true) -> void:
	world.camera_controller.release_capture(restore)

func can_enhance(item: Dictionary) -> bool:
	if selected_scroll.is_empty() or item.is_empty() or int(item.get("plus", 0)) >= 15:
		return false
	var slot: String = str(data.items.get(item.id, {}).get("slot", ""))
	return not slot.is_empty() and data.scrolls[selected_scroll.id].category == ("weapon" if slot == "weapon" else "armor")

func switch_profile() -> void:
	release_orbit(false)
	save_preferences()
	var previous_token: String = net.token
	net.end_session()
	if not previous_token.is_empty():
		net.request("/api/disconnect", {}, previous_token)
	inventory_panel.hide()
	selected_scroll = {}
	selected_item = {}
	world.targeting.clear()
	world.timeline.reset()
	world.player_motion.cancel_planar()
	world.player_motion.identity = ""
	login.queue_free()
	build_login()
	login.show()

func quit_game() -> void:
	save_preferences()
	world.stop_audio()
	net.set_process(false)
	if net.connected:
		await net.request("/api/disconnect", {})
	get_tree().quit()

func _notification(what: int) -> void:
	if world != null and what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		player_input.focus_changed(false)
	elif world != null and what == NOTIFICATION_APPLICATION_FOCUS_IN:
		player_input.focus_changed(true)
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		quit_game()

func run_qa() -> void:
	# Exercises this native client against a private fixture server, never a player DB.
	qa_interaction = true
	apply_settings()
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
	# Exercise actual native mouse projection and the callback used by LMB.
	var ground_goal: Vector2 = world.collision.nearest_free(Vector2(net.hero.x - 3, net.hero.z - 1))
	var clicked: Array = []
	var on_move: Callable = func(value: Vector2): clicked.append(value)
	world.moved_to.connect(on_move)
	world.click(world.camera.unproject_position(world.point(ground_goal.x, ground_goal.y)))
	await get_tree().create_timer(1.2).timeout
	world.moved_to.disconnect(on_move)
	checks["mouse_ground_destination"] = not clicked.is_empty() and Vector2(net.hero.x, net.hero.z).distance_to(ground_goal) < 1.0
	await net.intent({"type":"cancel"})
	# A model-sized ray pick must work well away from the old 55-pixel centre.
	var probe: Node3D = world.make_actor("qa:pick", "Fox", 2.8, "", Color.WHITE)
	probe.position = world.hero_position + Vector3(0, 0, -3)
	probe.set_meta("pickable", true)
	var old_collision: VarendorCollision = world.collision
	world.collision = VarendorCollision.new()
	var selected_probe: String = world.pick_entity(world.camera.unproject_position(probe.position + Vector3(0, 1.6, 0)))
	checks["mouse_model_picking"] = selected_probe == "qa:pick"
	probe.set_meta("pickable", false)
	checks["dead_target_not_pickable"] = world.pick_entity(world.camera.unproject_position(probe.position + Vector3(0, 1.6, 0))) != "qa:pick"
	world.collision = old_collision
	probe.queue_free()
	world.actors.erase("qa:pick")
	world.target_id = ""
	activate("skill:3")
	var skill_wait: int = Time.get_ticks_msec() + 4000
	while float(net.hero.buffs.guard) <= float(world.current_snapshot.time) and Time.get_ticks_msec() < skill_wait:
		await get_tree().process_frame
	checks["self_skill_without_enemy"] = float(net.hero.buffs.guard) > float(world.current_snapshot.time)
	inventory_panel.show()
	var input_sequence: int = net.sequence
	var escape: InputEventKey = InputEventKey.new()
	escape.physical_keycode = KEY_ESCAPE
	escape.pressed = true
	_unhandled_input(escape)
	checks["escape_closes_only_bag"] = not inventory_panel.visible and net.sequence == input_sequence
	game_settings["sensitivity"] = 1.25
	game_settings["invert_y"] = true
	save_preferences()
	load_preferences(uid_before)
	checks["settings_persist"] = is_equal_approx(mouse_sensitivity, 1.25) and invert_camera_y
	game_settings["bindings"] = {"move_forward":KEY_UP}
	configure_input()
	save_preferences()
	load_preferences(uid_before)
	var forward_key: InputEventKey = InputEventKey.new()
	forward_key.physical_keycode = KEY_UP
	forward_key.pressed = true
	var former_key: InputEventKey = InputEventKey.new()
	former_key.physical_keycode = KEY_W
	former_key.pressed = true
	checks["movement_binding_persist"] = InputMap.event_is_action(forward_key, "move_forward") and not InputMap.event_is_action(former_key, "move_forward")
	game_settings["bindings"] = {}
	configure_input()
	var prior_display: Dictionary = {"display":game_settings.get("display", 0),"resolution":game_settings.get("resolution", 1)}
	game_settings["resolution"] = 0
	confirm_display(prior_display)
	display_remaining = .1
	await get_tree().create_timer(.4).timeout
	checks["display_timeout_rolls_back"] = display_before.is_empty() and game_settings["resolution"] == prior_display.resolution
	var hp_before_reconnect: float = net.hero.hp
	net.stream_failed()
	await get_tree().create_timer(2.0).timeout
	checks["stream_reconnect_same_hero"] = net.connected and str(net.hero.id) == uid_before and net.hero.hp <= hp_before_reconnect
	checks["stream_active"] = net.stream_requested and net.stream.get_status() == HTTPClient.STATUS_BODY
	checks.merge(await preload("res://scripts/network_qa.gd").run(get_tree(), world.current_snapshot, qa_path.get_base_dir()))
	checks.merge(await preload("res://scripts/core_acceptance.gd").run(self))
	# Same actual-map collision vectors are resolved independently by TypeScript.
	var cases = JSON.parse_string(FileAccess.get_file_as_string("res://generated/collision-qa.json")) if FileAccess.file_exists("res://generated/collision-qa.json") else []
	checks["shared_collision_vectors"] = not cases.is_empty()
	for sample: Dictionary in cases:
		var resolved: Vector2 = world.collision.resolve(Vector2(sample.x, sample.z), Vector2(sample.dx, sample.dz))
		if resolved.distance_to(Vector2(sample.expected.x, sample.expected.z)) > .003:
			checks["shared_collision_vectors"] = false
			break

	inventory_panel.show()
	qa_interaction = false
	apply_settings()
	qa_started = true
	await get_tree().create_timer(5.0).timeout
	qa_started = false
	checks["native_render"] = DisplayServer.get_name() != "headless"
	if checks.native_render:
		await RenderingServer.frame_post_draw
		var capture: Image = get_viewport().get_texture().get_image()
		capture.save_png(qa_path.get_basename() + ".png")
		print("VARENDOR_REVIEW_JPG " + Marshalls.raw_to_base64(capture.save_jpg_to_buffer(.85)))
	var success: bool = true
	for key: String in checks:
		if checks[key] is bool and key != "native_render" and not checks[key]:
			success = false
	qa_times.sort()
	var report: Dictionary = {"ok":success,"checks":checks,"display":DisplayServer.get_name(),"godot":Engine.get_version_info().string,"frame_ms_median":qa_times[qa_times.size() / 2] if not qa_times.is_empty() else 0,"frame_ms_p95":qa_times[int(qa_times.size() * .95)] if not qa_times.is_empty() else 0,"render_objects":Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),"render_draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"functional_render_profile":"low under software Mesa; high profile restored for screenshot and frame metrics","notes":"Synthetic fixture. Headless is not graphical or Windows GPU verification; software renderer is not target-PC performance."}
	net.save_private_json(qa_path, report)
	print("VARENDOR_NATIVE_QA " + JSON.stringify(report))
	net.set_process(false)
	world.stop_audio()
	await net.request("/api/disconnect", {})
	await get_tree().process_frame
	get_tree().quit(0 if success else 2)

func close_dialog() -> void:
	var closing: Window = active_dialog
	active_dialog = null
	rebinding_action = ""
	if not display_before.is_empty(): revert_display()
	if is_instance_valid(closing):
		closing.hide()
		closing.exclusive = false
		closing.queue_free()

func system_menu() -> void:
	if is_instance_valid(active_dialog):
		close_dialog()
		return
	var box: VBoxContainer = dialog("Меню", Vector2i(320, 245))
	box.add_child(button("Вернуться в игру", close_dialog))
	box.add_child(button("Настройки", controls_dialog))
	box.add_child(button("Сменить персонажа", func(): close_dialog(); switch_profile()))
	box.add_child(button("Выйти из игры", quit_game))

func show_item_tip(item: Dictionary, anchor: Control) -> void:
	if is_instance_valid(tooltip_panel): tooltip_panel.queue_free()
	tooltip_anchor = anchor
	if item.is_empty(): return
	tooltip_panel = PanelContainer.new()
	tooltip_panel.add_theme_stylebox_override("panel", panel_style(Color("141b1d"), Color("ba9b63")))
	ui.add_child(tooltip_panel)
	var content: RichTextLabel = RichTextLabel.new()
	var text_value: String = item_tip(item)
	content.text = text_value
	content.add_theme_font_size_override("normal_font_size", 14)
	content.custom_minimum_size = Vector2(310, minf(450, text_value.split("\n").size() * 20 + 12))
	content.scroll_active = true
	tooltip_panel.add_child(content)
	var pos: Vector2 = anchor.global_position + Vector2(-340, 0)
	tooltip_panel.position = pos.clamp(Vector2.ZERO, (ui.size - Vector2(336, content.custom_minimum_size.y + 20)).max(Vector2.ZERO))
	tooltip_timer = 30

func leave_item_tip() -> void:
	tooltip_timer = .2
