class_name VarendorReferenceHud
extends RefCounted

# Native presentation port of src/hud.css + src/ui/character-inventory.ts at
# 1e94a0d1. This owns layout, formatting and views; authority remains in net.
const GEAR_LAYOUT: Array = [["ear1","Серьга"],["head","Голова"],["cloak","Плащ"],["neck","Ожерелье"],["chest","Нагрудник"],["offhand","Щит / фокус"],["weapon","Оружие"],["belt","Пояс"],["gloves","Перчатки"],["ring1","Кольцо I"],["boots","Обувь"],["ring2","Кольцо II"]]
const STAT_LAYOUT: Array = [["level","Уровень"],["xp","Опыт"],["hp","HP"],["mp","MP"],["str","Сила"],["dex","Ловкость"],["int","Интеллект"],["physicalAttack","Физическая атака"],["matk","Магическая атака"],["physicalAccuracy","Точность физ. атак"],["magicAccuracy","Точность магии"],["def","Общая защита"],["mdef","Магическая защита"],["evasion","Уклонение"],["attackRate","Атак в секунду"],["manaRegen","MP в секунду"]]
const ITEM_STAT_LABELS: Dictionary = {"str":"Сила","dex":"Ловкость","int":"Интеллект","vit":"Выносливость","spi":"Дух","atkMin":"Мин. физ. атака","atkMax":"Макс. физ. атака","matk":"Магическая атака","def":"Физическая защита","mdef":"Магическая защита","hp":"Макс. HP","mp":"Макс. MP","crit":"Критический шанс","accuracy":"Точность","evasion":"Уклонение","speed":"Скорость передвижения"}
const WINDOW_SIZE: Vector2 = Vector2(332,516)
const DOCK_WIDTH: float = 756.0
var app: Node
var dock: Control
var hero_panel: Panel
var hero_class: Label
var health_label: Label
var resource_label: Label
var xp_label: Label
var inventory_name: Label
var inventory_class: Label
var capacity_label: Label
var selection_label: Label
var inventory_status: Label
var inventory_actions: HBoxContainer
var stats_scroll: ScrollContainer
var stats_heading: Label
var enhancement_banner: Label
var log_panel: Panel
var log_entries: Array[Dictionary] = []
var log_filter: String = "all"
var log_filters: Array[Button] = []
var chat: LineEdit
var potion_buttons: Dictionary = {}
var row_toggle: Button
var edit_toggle: Button
var quick_editing: bool = false
var bag_scroll: ScrollContainer
var equipment_grid: GridContainer
var bag_grid: GridContainer
var minimap: Control
var region_panel: Panel
var region_expanded: bool = false
var region_text: Label
var last_actions_signature: String = ""
var dock_height: float = 151.0
var inventory_scale: float = 1.0
var effect_labels: Dictionary = {}
var effect_row: HBoxContainer
var hud_hero: Dictionary = {}

static func frame(background: Color = Color("20242af0"), border: Color = Color("8c7353"), margin: float = 0, radius: int = 0) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.set_content_margin_all(margin)
	return style

func rect(node: Control, parent: Control, position: Vector2, dimensions: Vector2) -> Control:
	parent.add_child(node)
	node.position = position
	node.size = dimensions
	return node

func text(parent: Control, value: String, position: Vector2, dimensions: Vector2, font_size: int = 11, color: Color = Color("dddcd0")) -> Label:
	var result: Label = app.label(value,font_size,color)
	rect(result,parent,position,dimensions)
	result.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return result

func small_button(parent: Control, value: String, position: Vector2, dimensions: Vector2, callback: Callable, font_size: int = 10) -> Button:
	var result: Button = Button.new()
	result.text = value
	result.focus_mode = Control.FOCUS_NONE
	result.add_theme_font_size_override("font_size",font_size)
	result.add_theme_stylebox_override("normal",preload("res://scripts/titan_theme.gd").button("normal",0))
	result.add_theme_stylebox_override("hover",preload("res://scripts/titan_theme.gd").button("hover",0))
	result.add_theme_stylebox_override("pressed",preload("res://scripts/titan_theme.gd").button("pressed",0))
	result.pressed.connect(callback)
	rect(result,parent,position,dimensions)
	return result

func panel(parent: Control, position: Vector2, dimensions: Vector2, background: Color = Color("20242af0"), border: Color = Color("8c7353")) -> Panel:
	var result: Panel = Panel.new()
	# Compact inset panels leave room for their labels; ornate plates frame windows.
	result.add_theme_stylebox_override("panel",frame(background,border))
	rect(result,parent,position,dimensions)
	return result

func control(parent: Control, position: Vector2, dimensions: Vector2) -> Control:
	var result: Control = Control.new()
	result.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return rect(result,parent,position,dimensions)

func setup(owner_ui: Node) -> void:
	app = owner_ui
	var canvas: CanvasLayer = CanvasLayer.new()
	app.add_child(canvas)
	app.ui = Control.new()
	canvas.add_child(app.ui)
	app.ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	app.ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme: Theme = Theme.new()
	theme.default_font_size = 12
	theme.set_stylebox("panel","PanelContainer",app.panel_style())
	theme.set_stylebox("normal","Button",app.panel_style(Color("2c3138"),Color("6a5a44")))
	theme.set_stylebox("hover","Button",app.panel_style(Color("44545a"),Color("c9b78b")))
	theme.set_stylebox("pressed","Button",app.panel_style(Color("67563c"),Color("d5bd88")))
	theme.set_color("font_color","Button",Color("eae4d8"))
	theme.set_font_size("font_size","TooltipLabel",11)
	theme.set_stylebox("panel","TooltipPanel",frame(Color("162028fc"),Color("948363"),10,2))
	preload("res://scripts/titan_theme.gd").install(theme)
	app.ui.theme = theme
	dock = control(app.ui,Vector2.ZERO,Vector2(DOCK_WIDTH,dock_height))
	dock.name = "ReferenceBottomDock"
	hero_panel = panel(dock,Vector2(0,36),Vector2(260,115))
	hero_panel.name = "PlayerFrame"
	app.heading = text(hero_panel,"Странник",Vector2(8,8),Vector2(244,22),12,Color("dac49d"))
	app.heading.clip_text = true
	app.heading.size.x = 90
	hero_class = text(hero_panel,"",Vector2(104,8),Vector2(148,22),10,Color("baaa91"))
	hero_class.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	app.hp = make_bar(hero_panel,Vector2(8,37),Vector2(244,21),Color("b82d3b"))
	health_label = bar_label(app.hp,11)
	app.health_text = health_label
	app.mp = make_bar(hero_panel,Vector2(8,62),Vector2(244,21),Color("287cb7"))
	resource_label = bar_label(app.mp,11)
	app.xp = make_bar(hero_panel,Vector2(8,87),Vector2(244,13),Color("bb9342"))
	xp_label = bar_label(app.xp,9)
	# PanelContainer stays as a compatibility handle; all child geometry is explicit.
	app.quick_panel_node = PanelContainer.new()
	app.quick_panel_node.add_theme_stylebox_override("panel",preload("res://scripts/titan_theme.gd").plate(0))
	rect(app.quick_panel_node,dock,Vector2(268,0),Vector2(382,119))
	var quick_content: Control = Control.new()
	quick_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	app.quick_panel_node.add_child(quick_content)
	text(quick_content,"Быстрые действия",Vector2(17,12),Vector2(166,14),10,Color("bbb5a8"))
	row_toggle = small_button(quick_content,"4 ряда",Vector2(218,3),Vector2(62,18),func():
		app.full_quick = not app.full_quick
		app.refresh_quick()
		app.save_preferences())
	edit_toggle = small_button(quick_content,"Свободно",Vector2(286,3),Vector2(88,18),func():
		var state: Dictionary = app.polish.layout_data.get("dock",{})
		state.locked = not bool(state.get("locked",false))
		app.polish.layout_data.dock = state
		edit_toggle.text = "Закреплено" if state.locked else "Свободно"
		app.polish.save_layout())
	app.quick_grid = GridContainer.new()
	app.quick_grid.columns = 8
	app.quick_grid.add_theme_constant_override("h_separation",3)
	app.quick_grid.add_theme_constant_override("v_separation",3)
	rect(app.quick_grid,quick_content,Vector2(4,27),Vector2(373,89))
	for index: int in range(32):
		var slot: VarendorQuickSlot = VarendorQuickSlot.new()
		slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = VarendorInterfacePolish.CELL
		slot.add_theme_stylebox_override("normal",frame(Color("151a20"),Color("695b46")))
		slot.add_theme_stylebox_override("hover",frame(Color("30363b"),Color("b7ad85")))
		slot.add_theme_stylebox_override("pressed",frame(Color("44545a"),Color("d5bd88")))
		slot.pressed.connect(func():
			if quick_editing: app.assign_dialog(index)
			else: app.activate(app.quick[index].action))
		slot.gui_input.connect(func(event: InputEvent):
			if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
				app.assign_dialog(index)
				slot.accept_event())
		app.quick_grid.add_child(slot)
		app.quick_buttons.append(slot)
	var quick_items: Panel = panel(dock,Vector2(658,24),Vector2(98,95))
	quick_items.name = "QuickConsumables"
	for index: int in range(2):
		var action: String = "potion" if index == 0 else "ether"
		var result: VarendorQuickSlot = VarendorQuickSlot.new()
		result.owner_ui = app; result.custom_action = action
		result.artwork = app.book_ui.item_icon({"id":action})
		result.pressed.connect(func(): app.activate(action))
		rect(result,quick_items,Vector2(4+index*47,24),VarendorInterfacePolish.CELL)
		potion_buttons[action] = result
	var menu: Panel = panel(dock,Vector2(268,124),Vector2(488,27))
	menu.name = "ReferenceMenu"
	for entry: Array in [["C   Герой",app.toggle_inventory],["Tab   Сумка",app.toggle_inventory],["N   Навыки",skills_dialog],["M   Карта",map_dialog],["Esc   Настройки",app.controls_dialog]]:
		var index: int = menu.get_child_count()
		small_button(menu,entry[0],Vector2(4+index*96,3),Vector2(93,20),entry[1],10)
	app.target_panel = app.place_panel(Control.PRESET_CENTER_TOP,Vector2(-150,36),Vector2(300,76))
	app.target_panel.add_theme_stylebox_override("panel",frame(Color("20242af0"),Color("8c7353"),7))
	var target_box: VBoxContainer = VBoxContainer.new()
	target_box.add_theme_constant_override("separation",3)
	app.target_panel.add_child(target_box)
	app.target_text = app.label("",14,Color("f1d6a5"))
	app.target_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	target_box.add_child(app.target_text)
	app.target_hp = make_bar(target_box,Vector2.ZERO,Vector2(280,17),Color("b82d3b"))
	app.target_hp.custom_minimum_size.y = 17
	app.target_state = app.label("",10,Color("a99a83"))
	app.target_state.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	target_box.add_child(app.target_state)
	app.target_panel.hide()
	var map_panel: Panel = panel(app.ui,Vector2(12,12),Vector2(190,160))
	map_panel.name = "ReferenceMinimap"
	minimap = preload("res://scripts/reference_minimap.gd").new()
	minimap.world = app.world
	rect(minimap,map_panel,Vector2(5,5),Vector2(178,128))
	app.status = text(map_panel,"Гринфолл",Vector2(5,134),Vector2(178,23),12,Color("e3c88f"))
	app.status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	app.status.clip_text = true
	region_panel = panel(app.ui,Vector2(12,178),Vector2(190,24))
	small_button(region_panel,"Задание и боссы",Vector2(1,1),Vector2(188,22),func():
		region_expanded = not region_expanded
		region_text.visible = region_expanded
		layout())
	region_text = text(region_panel,"",Vector2(7,28),Vector2(176,150),11,Color("c7bba9"))
	region_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	region_text.hide()
	log_panel = panel(app.ui,Vector2(12,app.ui.size.y-328),Vector2(290,155))
	log_panel.name = "ReferenceLog"
	for entry: Array in [["all","Все"],["combat","Бой"],["loot","Добыча"],["system","Система"]]:
		var index: int = log_filters.size()
		var btn: Button = small_button(log_panel,entry[1],Vector2(7+index*65,7),Vector2(61,20),func(): set_log_filter(entry[0]))
		log_filters.append(btn)
	app.log_text = RichTextLabel.new()
	app.log_text.add_theme_font_size_override("normal_font_size",11)
	app.log_text.bbcode_enabled = true
	app.log_text.scroll_following = true
	rect(app.log_text,log_panel,Vector2(7,32),Vector2(276,87))
	chat = LineEdit.new()
	chat.placeholder_text = "Enter — локальная заметка"
	chat.add_theme_font_size_override("font_size",10)
	chat.add_theme_stylebox_override("normal",frame(Color("20242a"),Color("3b4248"),2))
	rect(chat,log_panel,Vector2(7,125),Vector2(252,23))
	chat.text_submitted.connect(func(_value: String): send_chat())
	small_button(log_panel,"›",Vector2(262,125),Vector2(21,23),send_chat,14)
	effect_row = HBoxContainer.new()
	rect(effect_row,app.ui,Vector2(app.ui.size.x-350,10),Vector2(338,35))
	effect_row.alignment = BoxContainer.ALIGNMENT_END
	effect_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	app.diagnostics = text(app.ui,"",Vector2(316,12),Vector2(360,80),12)
	app.diagnostics.hide()
	build_inventory()
	app.respawn = app.button("Возродиться в Гринфолле",func(): app.net.command({"type":"respawn"}))
	app.ui.add_child(app.respawn)
	app.respawn.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	app.respawn.position += Vector2(-125,-35)
	app.respawn.hide()
	app.build_login()
	app.get_viewport().size_changed.connect(layout)
	app.refresh_quick()
	layout()

func make_bar(parent: Control, position: Vector2, dimensions: Vector2, color: Color) -> ProgressBar:
	var result: ProgressBar = ProgressBar.new()
	result.show_percentage = false
	result.step = 0.01
	result.add_theme_stylebox_override("background",frame(Color("030506"),Color.BLACK))
	result.add_theme_stylebox_override("fill",frame(color,Color("17191b")))
	rect(result,parent,position,dimensions)
	return result

func bar_label(parent: ProgressBar, font_size: int) -> Label:
	var result: Label = text(parent,"",Vector2.ZERO,parent.size,font_size,Color("eee5d7"))
	result.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result.add_theme_color_override("font_shadow_color",Color.BLACK)
	result.add_theme_constant_override("shadow_offset_y",1)
	return result

func build_inventory() -> void:
	app.inventory_panel = app.place_panel(Control.PRESET_TOP_LEFT,Vector2(app.ui.size.x-350,58),WINDOW_SIZE)
	app.inventory_panel.name = "ReferenceCharacterWindow"
	app.inventory_panel.add_theme_stylebox_override("panel",preload("res://scripts/titan_theme.gd").plate(0))
	var content: Control = Control.new()
	content.mouse_filter = Control.MOUSE_FILTER_PASS
	app.inventory_panel.add_child(content)
	var header: Control = control(content,Vector2.ZERO,Vector2(330,36))
	app.inventory_title = text(header,"Персонаж",Vector2(20,6),Vector2(225,26),16,Color("e4dece"))
	preload("res://scripts/titan_theme.gd").heading(app.inventory_title)
	app.inventory_title.mouse_filter = Control.MOUSE_FILTER_STOP
	app.inventory_title.gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
			app.inventory_drag = event.pressed
			app.inventory_drag_offset = app.get_viewport().get_mouse_position()-app.inventory_panel.position
			if not event.pressed: app.save_preferences()
		elif event is InputEventMouseMotion and app.inventory_drag:
			app.inventory_panel.position = app.get_viewport().get_mouse_position()-app.inventory_drag_offset
			clamp_inventory())
	text(header,"Tab",Vector2(251,9),Vector2(31,22),10,Color("a8b0b0"))
	var close: Button = small_button(header,"×",Vector2(288,8),Vector2(24,24),app.toggle_inventory,22)
	close.name = "CloseInventory"
	inventory_name = text(content,"",Vector2(11,32),Vector2(163,30),13,Color("e8dfca"))
	inventory_name.clip_text = true
	inventory_class = text(content,"",Vector2(169,32),Vector2(152,30),11,Color("9dabae"))
	inventory_class.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var stat_panel: Panel = panel(content,Vector2(10,66),Vector2(164,185),Color("10171b"),Color("65717642"))
	stats_heading = text(stat_panel,"Характеристики",Vector2(6,0),Vector2(154,19),10,Color("b6bfbd"))
	stats_scroll = ScrollContainer.new()
	stats_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stats_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	rect(stats_scroll,stat_panel,Vector2(5,20),Vector2(154,164))
	var stats_box: VBoxContainer = VBoxContainer.new()
	stats_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stats_box.add_theme_constant_override("separation",0)
	stats_scroll.add_child(stats_box)
	for entry: Array in STAT_LAYOUT:
		var row: HBoxContainer = HBoxContainer.new()
		# Nine rows share 188 px below the heading. The previous 22 px rows
		# needed 198 px, hiding the final defence stat behind a scrollbar.
		row.custom_minimum_size.y = 18
		row.draw.connect(func(): row.draw_line(Vector2(0,row.size.y-1),Vector2(row.size.x,row.size.y-1),Color("a5b4b30b"),1))
		row.add_theme_constant_override("separation",4)
		stats_box.add_child(row)
		var caption: Label = app.label(entry[1],11,Color("a7b0b2"))
		caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(caption)
		var value: Label = app.label("",11,Color("e5dfcf"))
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(value)
		app.stat_values[entry[0]] = value
	app.stats_text = app.label("",11)
	app.stats_text.hide()
	stat_panel.add_child(app.stats_text)
	enhancement_banner = text(stat_panel,"",Vector2(9,9),Vector2(146,164),12,Color("efd29e"))
	enhancement_banner.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	enhancement_banner.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	enhancement_banner.hide()
	equipment_grid = GridContainer.new()
	equipment_grid.columns = 3
	equipment_grid.add_theme_constant_override("h_separation",3)
	equipment_grid.add_theme_constant_override("v_separation",3)
	rect(equipment_grid,content,Vector2(184,66),Vector2(138,185))
	for entry: Array in GEAR_LAYOUT:
		var slot: VarendorItemSlot = VarendorItemSlot.new()
		slot.owner_ui = app
		slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = VarendorInterfacePolish.CELL
		slot.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		slot.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		slot.payload = {"kind":"equipment","slot":entry[0],"item":{}}
		slot.empty_caption = entry[1]
		slot.tooltip_text = entry[1]
		equipment_grid.add_child(slot)
		app.equipment_slots[entry[0]] = slot
	text(content,"Сумка",Vector2(11,256),Vector2(150,22),11,Color("c3c5b9"))
	var bag_hint: Label = text(content,"Двойной клик — действие",Vector2(134,256),Vector2(188,22),9,Color("829194"))
	bag_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	bag_scroll = ScrollContainer.new()
	bag_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	bag_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_ALWAYS
	rect(bag_scroll,content,Vector2(10,280),Vector2(312,142))
	bag_grid = GridContainer.new()
	bag_grid.columns = 6
	bag_grid.add_theme_constant_override("h_separation",3)
	bag_grid.add_theme_constant_override("v_separation",3)
	bag_grid.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	bag_scroll.add_child(bag_grid)
	for index: int in range(42):
		var slot: VarendorItemSlot = VarendorItemSlot.new()
		slot.owner_ui = app
		slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = VarendorInterfacePolish.CELL
		slot.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		slot.payload = {"kind":"bag","index":index,"item":{}}
		bag_grid.add_child(slot)
		app.bag_slots.append(slot)
	var silver_cell: Panel = panel(content,Vector2(10,424),Vector2(24,22),Color("10171b"),Color("65717642"))
	var silver_icon: TextureRect = TextureRect.new()
	silver_icon.texture = app.book_ui.item_icon({"id":"silver"})
	silver_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	silver_icon.tooltip_text = "Серебро"
	rect(silver_icon,silver_cell,Vector2(1,1),Vector2(22,20))
	app.inventory_footer = text(content,"0",Vector2(40,426),Vector2(162,18),11,Color("d3cdbb"))
	capacity_label = text(content,"0 / 42",Vector2(210,426),Vector2(112,18),11,Color("a6b1b3"))
	capacity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	selection_label = text(content,"Выберите предмет",Vector2(10,447),Vector2(312,15),10,Color("c0c6be"))
	selection_label.clip_text = true
	var action_scroll: ScrollContainer = ScrollContainer.new()
	action_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	action_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	rect(action_scroll,content,Vector2(10,464),Vector2(312,22))
	inventory_actions = HBoxContainer.new()
	inventory_actions.add_theme_constant_override("separation",4)
	action_scroll.add_child(inventory_actions)
	inventory_status = text(content,"Наведение — свойства · двойной клик — действие",Vector2(10,487),Vector2(312,15),9,Color("86979c"))
	inventory_status.clip_text = true
	app.inventory_panel.hide()

func layout() -> void:
	if app == null or app.ui == null or dock == null: return
	dock_height = 245 if app.full_quick else 151
	dock.scale = Vector2.ONE
	dock.size = Vector2(DOCK_WIDTH,dock_height)
	var dock_settings: Dictionary = app.polish.layout_data.get("dock",{})
	if not dock_settings.get("position") is Array: dock.position = Vector2((app.ui.size.x-DOCK_WIDTH)*.5,app.ui.size.y-10-dock_height)
	hero_panel.position.y = dock_height-115
	app.quick_panel_node.size.y = dock_height-32
	dock.get_node("ReferenceMenu").position.y = dock_height-27
	dock.get_node("QuickConsumables").position.y = dock_height-127
	row_toggle.text = "2 ряда" if app.full_quick else "4 ряда"
	if not app.polish.layout_data.get("chat",{}).get("position") is Array: log_panel.position = Vector2(12,maxf(220,app.ui.size.y-dock_height-245))
	var map_panel: Control = minimap.get_parent()
	map_panel.position = Vector2(app.ui.size.x-202,12)
	region_panel.position = Vector2(map_panel.position.x,map_panel.position.y+map_panel.size.y+3)
	region_panel.size.y = 202 if region_expanded else 24
	region_text.size.y = maxf(0,region_panel.size.y-28)
	effect_row.position = Vector2(app.ui.size.x-555,12)
	inventory_scale = 1.0
	if app.inventory_panel != null:
		app.inventory_panel.scale = Vector2.ONE
		clamp_inventory()
	if is_instance_valid(app.active_dialog):
		app.active_dialog.size = app.active_dialog.size.min(app.ui.size-Vector2(24,24))
		app.polish.clamp_panel(app.active_dialog)

func clamp_inventory() -> void:
	if app.inventory_panel == null: return
	app.inventory_panel.position = app.inventory_panel.position.clamp(Vector2(8,8),(app.ui.size-WINDOW_SIZE-Vector2(8,8)).max(Vector2(8,8)))

func refresh(hero: Dictionary) -> void:
	hud_hero = hero.duplicate(true)
	app.heading.text = hero.name
	hero_class.text = "%s · ур. %d" % [app.data.classes[hero.classId].name,int(hero.level)]
	var xp_needed: int = int(app.data.xpNeeded[clampi(int(hero.level),0,app.data.xpNeeded.size()-1)])
	health_label.text = "%d / %d" % [ceili(float(hero.hp)),int(hero.maxHp)]
	resource_label.text = "%d / %d" % [ceili(float(hero.mp)),int(hero.maxMp)]
	xp_label.text = "EXP %s / %s · %d%%" % [number(hero.xp),number(xp_needed),floori(clampf(float(hero.xp)/maxf(1,xp_needed),0,1)*100)]
	inventory_name.text = hero.name
	inventory_class.text = "%s · %d ур." % [app.data.classes[hero.classId].name,int(hero.level)]
	app.inventory_title.text = "Персонаж"
	app.inventory_footer.text = number(hero.gold)
	capacity_label.text = "%d / 42" % hero.inventory.size()
	for key: String in app.stat_values:
		var value: String = str(int(hero.stats.get(key,0)))
		if key == "level": value = str(int(hero.level))
		elif key == "xp": value = "%d / %d" % [int(hero.xp),xp_needed]
		elif key == "hp": value = "%d / %d" % [ceili(float(hero.hp)),int(hero.maxHp)]
		elif key == "mp": value = "%d / %d" % [ceili(float(hero.mp)),int(hero.maxMp)]
		elif key == "physicalAttack": value = "%d–%d" % [int(hero.stats.atkMin),int(hero.stats.atkMax)]
		elif key == "attackRate": value = "%.2f" % (1.0/maxf(.01,float(hero.stats.get("attackInterval",1))))
		elif key == "manaRegen": value = "%.2f" % float(hero.stats.get("manaRegen",0))
		elif key == "evasion": value = stat_number(hero.stats.get(key,0))
		app.stat_values[key].text = value
	var later_quests: String = app.progression_quests.tracker_text()
	region_text.text = app.starter_quests.tracker_text()+("\n\n"+later_quests if not later_quests.is_empty() else "")+"\n\nВладыки региона\n"
	for monster_id: String in ["mini","big","rift_boss"]:
		var definition: Dictionary = app.data.monsters.get(monster_id,{})
		if definition.is_empty(): continue
		var state: String = "—"
		for monster: Dictionary in app.world.current_snapshot.get("monsters",[]):
			if monster.get("id","") != monster_id: continue
			if monster.get("alive",false): state = "жив"
			else:
				var left: float = maxf(0,(float(monster.get("respawnAt",0))-float(app.world.current_snapshot.get("time",0)))/1000)
				state = timer_text(left) if left > 0 else "побеждён"
			break
		region_text.text += str(definition.name)+" · "+state+"\n"
	app.book_ui.refresh_effects(hero,effect_row)
	refresh_inventory_state()
	refresh_consumables()

static func number(value) -> String:
	var raw: String = str(int(value))
	var result: String = ""
	for index: int in range(raw.length()):
		if index > 0 and (raw.length()-index)%3 == 0: result += " "
		result += raw[index]
	return result

func refresh_consumables() -> void:
	for action: String in potion_buttons:
		var quantity: int = 0
		for item: Dictionary in display_hero().get("inventory",[]):
			if item.id == action: quantity += int(item.count)
		var code: int = int(app.game_settings.get("bindings",{}).get(action,KEY_Q if action == "potion" else KEY_E))
		var key: String = OS.get_keycode_string(code)
		potion_buttons[action].key_label = key
		potion_buttons[action].quantity = quantity
		potion_buttons[action].usable = not app.net.hero.get("dead",true) and quantity > 0
		potion_buttons[action].queue_redraw()

func refresh_inventory_state() -> void:
	if app.net.hero.is_empty(): return
	# Versioned refs remain valid across snapshots, but never silently retarget a slot.
	var selected: Dictionary = app.selected_item.get("item",{})
	if not selected.is_empty() and not has_item_version(selected):
		app.selected_item = {}
		selected = {}
	if not app.selected_scroll.is_empty() and (app.net.hero.get("dead",false) or not has_item_version(app.selected_scroll)):
		app.selected_scroll = {}
	selection_label.text = app.item_name(selected) if not selected.is_empty() else "Выберите предмет"
	var enhancing: bool = not app.selected_scroll.is_empty()
	stats_scroll.visible = not enhancing
	stats_heading.visible = not enhancing
	enhancement_banner.visible = enhancing
	if enhancing:
		enhancement_banner.text = app.item_name(app.selected_scroll)+"\nОдин клик по подсвеченной вещи — одна попытка.\nШанс показан при наведении.\nНа рискованной ступени при неудаче предмет уничтожается.\nEsc / ПКМ — отменить."
	inventory_status.text = "Персонаж погиб · только просмотр" if app.net.hero.get("dead",false) else "Наведение — свойства · двойной клик — действие"
	if not app.net.hero.get("migrationReserve",[]).is_empty(): inventory_status.text = "Сохранено: %d предм. · J — забрать" % app.net.hero.migrationReserve.size()
	var actions: Array = []
	var definition: Dictionary = app.data.items.get(selected.get("id",""),{})
	if enhancing: actions.append(["cancel-enhance","Отменить заточку"])
	else:
		if not selected.is_empty():
			if app.selected_item.get("kind") == "storage": actions.append(["use","Забрать в сумку"])
			elif app.selected_item.get("kind") == "equipment": actions.append(["use","Снять"])
			elif definition.has("slot"): actions.append(["use","Надеть"])
			elif definition.get("type") in ["consumable","book"]: actions.append(["use","Использовать"])
			if app.trade_session.allowed() and app.selected_item.get("kind") == "bag" and definition.get("type") != "book": actions.append(["sell","Продать…"])
		var loot: Array = display_hero().get("lootBuffer",[])
		if not loot.is_empty(): actions.append(["collect","Забрать добычу (%d)" % loot.size()])
	var signature: String = JSON.stringify([actions,app.net.hero.get("dead",false),app.net.command_busy])
	if signature != last_actions_signature:
		last_actions_signature = signature
		for node: Node in inventory_actions.get_children():
			inventory_actions.remove_child(node)
			node.queue_free()
		for entry: Array in actions:
			var callback: Callable = app.use_selected if entry[0] == "use" else app.sell_selected if entry[0] == "sell" else func():
				if entry[0] == "cancel-enhance":
					app.selected_scroll = {}
					app.refresh_inventory()
				else: app.net.command({"type":"collect"})
			var action_button: Button = small_button(inventory_actions,entry[1],Vector2.ZERO,Vector2(20,22),callback)
			action_button.custom_minimum_size = Vector2(action_button.get_theme_default_font().get_string_size(entry[1],HORIZONTAL_ALIGNMENT_LEFT,-1,10).x+12,22)
			action_button.disabled = app.net.hero.get("dead",false) or app.net.command_busy
	for slot: VarendorItemSlot in app.bag_slots: slot.queue_redraw()
	for slot: VarendorItemSlot in app.equipment_slots.values(): slot.queue_redraw()

func has_item_version(reference: Dictionary) -> bool:
	if app.net.hero.is_empty() or reference.is_empty(): return false
	for item in app.net.hero.inventory + app.net.hero.equipment.values() + app.net.hero.get("storage",[]):
		if item is Dictionary and str(item.get("uid","")) == str(reference.get("uid","")):
			return item.id == reference.id and item.plus == reference.plus and item.count == reference.count
	return false

func send_chat() -> void:
	app.polish.send_chat()

func set_log_filter(value: String) -> void:
	log_filter = value
	render_log()

func add_log(message: String, kind: String = "system") -> void:
	var now: int = Time.get_ticks_msec()
	if not log_entries.is_empty() and log_entries[-1].message == message and log_entries[-1].kind == kind and now-int(log_entries[-1].at) < 10000:
		log_entries[-1].count += 1
		log_entries[-1].at = now
	else:
		var time: Dictionary = Time.get_datetime_dict_from_system()
		log_entries.append({"message":message,"kind":kind,"at":now,"count":1,"stamp":"[%02d:%02d] " % [time.hour,time.minute]})
	while log_entries.size() > 80: log_entries.pop_front()
	render_log()

func render_log() -> void:
	app.polish.render_chat()

func skills_dialog() -> void:
	app.polish.open_skills()

func map_dialog() -> void:
	app.polish.toggle_map()

func item_breakdown(item: Dictionary) -> Dictionary:
	if item.is_empty() or not app.data.itemStats.has(item.id): return {"total":{},"base":{},"bonus":{}}
	var result: Dictionary = app.data.itemStats[item.id][clampi(int(item.plus),0,15)].duplicate(true)
	for key: String in item.get("legacyRingBonus",{}):
		if not result.total.has(key): continue
		var value: int = int(item.legacyRingBonus[key])
		result.total[key] += value
		result.bonus[key] += value
	return result

func item_rows(item: Dictionary) -> Array:
	var result: Array = []
	if item.is_empty() or not app.data.itemStats.has(item.id): return result
	var breakdown: Dictionary = item_breakdown(item)
	var total: Dictionary = breakdown.total
	var base: Dictionary = breakdown.base
	var bonus: Dictionary = breakdown.bonus
	if float(total.get("atkMax",0)) != 0:
		var base_power: int = roundi((float(base.get("atkMin",0))+float(base.get("atkMax",0)))*.5)
		var gain: int = roundi((float(total.get("atkMin",0))+float(total.get("atkMax",0)))*.5)-base_power
		result.append({"key":"damage","label":"Урон","value":"%d + %d (%d–%d)" % [base_power,gain,total.get("atkMin",0),total.get("atkMax",0)],"detail":"База + заточка; точный диапазон: %d + %d … %d + %d" % [base.get("atkMin",0),bonus.get("atkMin",0),base.get("atkMax",0),bonus.get("atkMax",0)]})
	for key: String in ITEM_STAT_LABELS:
		if key in ["atkMin","atkMax"] or float(total.get(key,0)) == 0: continue
		result.append({"key":key,"label":ITEM_STAT_LABELS[key],"value":stat_number(total[key])+("%" if key in ["crit","speed"] else ""),"detail":"База %s + заточка %s = %s" % [stat_number(base.get(key,0)),stat_number(bonus.get(key,0)),stat_number(total[key])] if float(bonus.get(key,0)) != 0 else ""})
	return result

static func stat_number(value) -> String:
	return ("%.3f" % float(value)).trim_suffix("0").trim_suffix("0").trim_suffix("0").trim_suffix(".").replace(".",",")

func tooltip_model(item: Dictionary, kind: String = "bag") -> Dictionary:
	if item.is_empty(): return {}
	var definition: Dictionary = app.data.items.get(item.id,{})
	var item_slot: String = str(definition.get("slot",""))
	var selected_slot: String = comparison_slot(item_slot)
	var category: String = "Кольцо" if item_slot == "ring" else str(app.data.slotNames.get(item_slot,item_slot)) if not item_slot.is_empty() else "Расходник" if definition.get("type") == "consumable" else "Свиток улучшения" if definition.get("type") == "enhance" else "Материал"
	var result: Dictionary = {"title":app.item_name(item),"subtitle":category+(" · надето" if kind == "equipment" else "")+(" · %d шт." % int(item.count) if int(item.count)>1 else ""),"description":str(definition.get("desc","")),"rows":item_rows(item),"restrictions":[],"actions":[],"comparisons":[]}
	if definition.get("type") == "book":
		result.subtitle = "Книга умения · ур. %d" % int(definition.requiredLevel)
		result.description = app.book_ui.tooltip(item.id)
		result.actions = ["Перетащите книгу на панель быстрого доступа."]
	if app.net.hero.get("classId","") == "assassin" and bool(definition.get("assassinForeign",false)):
		result.restrictions.append("Чужая броня: −2 защита, −2 магзащита, −2 уклонение за эту вещь.")
		var total_penalty: Dictionary = app.data.itemStats[item.id][clampi(int(item.plus),0,15)].total
		for stat: String in ["def","mdef","evasion"]:
			result.rows.append({"key":"penalty_"+stat,"label":ITEM_STAT_LABELS[stat]+" для ассасина","value":stat_number(float(total_penalty.get(stat,0))-2),"delta":-2,"detail":"С учётом фиксированного штрафа этой вещи"})
	if not item_slot.is_empty():
		var exempt: bool = item_slot == "ring" and bool(item.get("legacyRingLevelExempt",false)) and int(definition.get("ringGrade",0)) == 1
		result.restrictions.append("Прежнее кольцо: требование уровня сохранено без ограничений." if exempt else "Требуется уровень %d." % int(definition.requiredLevel) if int(definition.get("requiredLevel",0)) > 1 else "Без требования уровня.")
	if item_slot == "ring": result.restrictions.append("Повышение грейда — только крафт [J]. Свитки не применяются.")
	if not item.get("legacyRingBonus",{}).is_empty(): result.restrictions.append("Прежнее усиление сохранено в характеристиках этого экземпляра.")
	if definition.has("classes"):
		var classes: Array = []
		for class_id: String in definition.classes: classes.append(app.data.classes[class_id].name)
		result.restrictions.append("Классы: "+", ".join(classes))
	if not app.selected_scroll.is_empty() and not item_slot.is_empty():
		var chance: float = 0
		var category_key: String = "weapon" if item_slot == "weapon" else "armor"
		var scroll: Dictionary = app.data.scrolls[app.selected_scroll.id]
		if item_slot != "ring" and scroll.category == category_key and int(item.plus)<15: chance = float(app.data.chances[category_key+"_"+scroll.quality][int(item.plus)])
		result.restrictions = [app.item_name(app.selected_scroll)+": "+("предел +15" if int(item.plus)>=15 else "+%d → +%d" % [int(item.plus),int(item.plus)+1]),"Шанс: %s%%" % stat_number(chance),"Безопасно." if chance == 100 else "При неудаче предмет уничтожается." if chance > 0 else "Этот предмет нельзя усилить выбранным свитком."]
		result.actions = ["Один клик — одна попытка заточки." if chance > 0 else "Выберите подходящий предмет или отмените заточку.","Esc / ПКМ — отменить без расхода свитка."]
	elif app.net.hero.get("dead",false): result.actions = ["После возрождения действия снова будут доступны."]
	elif kind == "equipment": result.actions = ["Двойной клик — снять в сумку."]
	elif not item_slot.is_empty(): result.actions = ["Двойной клик — надеть: "+str(app.data.slotNames.get(selected_slot,selected_slot))+".","Перетащите на нужный слот для точной замены."]
	elif definition.get("type") == "consumable": result.actions = ["Двойной клик — использовать одну единицу."]
	elif app.data.scrolls.has(item.id): result.actions = ["Двойной клик — выбрать предмет для одной попытки заточки."]
	if kind == "bag" and not item_slot.is_empty() and app.data.itemStats.has(item.id):
		var slots: Array = ["ring1","ring2"] if item_slot == "ring" else ["ear1"] if item_slot in ["ear","earring"] else [selected_slot]
		if slots.size() == 2 and (not display_hero().get("equipment",{}).get(slots[0]) or not display_hero().get("equipment",{}).get(slots[1])): slots = [selected_slot]
		var total: Dictionary = item_breakdown(item).total
		for slot: String in slots:
			var other = display_hero().get("equipment",{}).get(slot)
			var equipped: Dictionary = other if other is Dictionary else {}
			var other_stats: Dictionary = item_breakdown(equipped).total
			var rows: Array = []
			for key: String in ITEM_STAT_LABELS:
				var delta: float = float(total.get(key,0))-float(other_stats.get(key,0))
				if app.net.hero.get("classId","")=="assassin" and key in ["def","mdef","evasion"]:
					delta -= 2*(int(bool(definition.get("assassinForeign",false)))-int(bool(app.data.items.get(equipped.get("id",""),{}).get("assassinForeign",false))))
				if not is_zero_approx(delta): rows.append({"key":key,"label":ITEM_STAT_LABELS[key],"value":("+" if delta>0 else "")+stat_number(delta)+("%" if key in ["crit","speed"] else ""),"delta":delta})
			if rows.is_empty(): rows.append({"label":"Характеристики","value":"Без изменений"})
			result.comparisons.append({"title":str(app.data.slotNames.get(slot,slot))+": "+(app.item_name(equipped) if not equipped.is_empty() else "пусто"),"selected":slot==selected_slot,"equipped_rows":item_rows(equipped),"rows":rows})
	return result

func hide_tooltip() -> void:
	if is_instance_valid(app.tooltip_panel): app.tooltip_panel.queue_free()
	app.tooltip_panel = null

func show_tooltip(item: Dictionary, anchor: Control) -> void:
	if app.get_viewport().gui_is_dragging(): return
	if is_instance_valid(app.tooltip_panel):
		app.tooltip_panel.queue_free()
		app.tooltip_panel = null
	app.tooltip_anchor = anchor
	if item.is_empty(): return
	var kind: String = str(anchor.payload.get("kind","bag")) if anchor is VarendorItemSlot else "bag"
	var model: Dictionary = tooltip_model(item,kind)
	var comparisons: int = model.comparisons.size()
	var width: float = minf([292,504,666][clampi(comparisons,0,2)],app.ui.size.x-16)
	app.tooltip_panel = PanelContainer.new()
	app.tooltip_panel.name = "ReferenceItemTooltip"
	app.tooltip_panel.set_meta("model",model)
	app.tooltip_panel.z_index = 30
	app.tooltip_panel.add_theme_stylebox_override("panel",frame(Color("111b22fc"),Color("948363"),10,2))
	app.ui.add_child(app.tooltip_panel)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	app.tooltip_panel.add_child(scroll)
	var columns: HBoxContainer = HBoxContainer.new()
	columns.add_theme_constant_override("separation",12)
	columns.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(columns)
	var column_width: float = (width-22-12*comparisons)/(comparisons+1)
	var main: VBoxContainer = tooltip_column(columns,column_width)
	tooltip_text(main,model.title,12,Color("e5ce99"))
	tooltip_text(main,model.subtitle,10,Color("99adb4"))
	if not str(model.description).is_empty(): tooltip_text(main,model.description,11,Color("b4bebd"))
	append_tooltip_rows(main,model.rows)
	for restriction: String in model.restrictions: tooltip_text(main,restriction,10,Color("d3a098"))
	for action: String in model.actions: tooltip_text(main,action,10,Color("b9c3af"))
	for comparison: Dictionary in model.comparisons:
		var column: VBoxContainer = tooltip_column(columns,column_width)
		tooltip_text(column,"Будет заменено" if comparison.selected else "Другой слот",9,Color("cfb881") if comparison.selected else Color("82979f"))
		tooltip_text(column,comparison.title,12,Color("e5ce99"))
		append_tooltip_rows(column,comparison.equipped_rows)
		tooltip_text(column,"Разница характеристик предметов",10,Color("b5c2bf"))
		append_tooltip_rows(column,comparison.rows)
	# Compute wrapped height from the actual label minima after container layout.
	app.tooltip_panel.size = Vector2(width,100)
	scroll.custom_minimum_size = Vector2(width-22,100)
	app.tooltip_timer = 30
	app.call_deferred("fit_reference_tooltip",anchor)

func tooltip_column(parent: Control, width: float) -> VBoxContainer:
	var result: VBoxContainer = VBoxContainer.new()
	result.custom_minimum_size.x = width
	result.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	result.add_theme_constant_override("separation",6)
	parent.add_child(result)
	return result

func tooltip_text(parent: Control, value: String, font_size: int, color: Color) -> Label:
	var result: Label = app.label(value,font_size,color)
	result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result.custom_minimum_size.x = parent.custom_minimum_size.x
	parent.add_child(result)
	return result

func append_tooltip_rows(parent: Control, rows: Array) -> void:
	for row: Dictionary in rows:
		var line: HBoxContainer = HBoxContainer.new()
		line.add_theme_constant_override("separation",8)
		parent.add_child(line)
		var caption: Label = app.label(row.label,11,Color("aab8bd"))
		caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		line.add_child(caption)
		var delta: float = float(row.get("delta",0))
		var value: Label = app.label(str(row.value),11,Color("93c69f") if delta>0 else Color("d89188") if delta<0 else Color("e0ddd0"))
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		line.add_child(value)
		if not str(row.get("detail","")).is_empty(): tooltip_text(parent,row.detail,10,Color("8e9fa4"))

func fit_tooltip(anchor: Control) -> void:
	if not is_instance_valid(app.tooltip_panel) or not is_instance_valid(anchor): return
	var scroll: ScrollContainer = app.tooltip_panel.get_child(0)
	var columns: HBoxContainer = scroll.get_child(0)
	var height: float = minf(590,minf(app.ui.size.y-16,columns.get_combined_minimum_size().y+22))
	scroll.custom_minimum_size.y = maxf(40,height-22)
	app.tooltip_panel.size.y = height
	var bounds: Rect2 = app.inventory_panel.get_global_rect()
	var x: float = bounds.position.x-app.tooltip_panel.size.x-7
	if x < 8 and bounds.end.x+app.tooltip_panel.size.x+7<=app.ui.size.x-8: x = bounds.end.x+7
	if x < 8: x = anchor.global_position.x-app.tooltip_panel.size.x-7
	app.tooltip_panel.position = Vector2(clampf(x,8,maxf(8,app.ui.size.x-app.tooltip_panel.size.x-8)),clampf(anchor.global_position.y-4,8,maxf(8,app.ui.size.y-height-8)))

static func timer_text(seconds: float) -> String:
	if seconds <= 0: return "жив"
	var hours: int = floori(seconds/3600)
	var minutes: int = floori(fmod(seconds,3600)/60)
	return "%dч %02dм" % [hours,minutes] if hours>0 else "%d:%02d" % [minutes,floori(fmod(seconds,60))]

func combat_event(event: Dictionary) -> void:
	if str(event.get("actor","")) != app.world.hero_id and str(event.get("target","")) != app.world.hero_id: return
	var kind: String = str(event.get("kind",""))
	if kind == "loot" and str(event.actor) == app.world.hero_id: app.book_ui.show_loot(event)
	if kind not in ["hit","miss","death"]: return
	var incoming: bool = str(event.get("target","")) == app.world.hero_id
	var other: String = str(event.get("actor","")) if incoming else str(event.get("target",""))
	var name_value: String = "Противник"
	for monster: Dictionary in app.world.current_snapshot.get("monsters",[]):
		if str(monster.uid) == other:
			name_value = app.data.monsters.get(monster.id,{}).get("name",name_value)
			break
	if kind == "hit": add_log((name_value+" наносит вам " if incoming else "Вы наносите ")+str(int(event.get("amount",0)))+" урона"+("." if incoming else ": "+name_value+"."),"combat")
	elif kind == "miss": add_log((name_value+": промах." if incoming else "Промах: "+name_value+"."),"combat")
	elif str(event.get("actor","")) == app.world.hero_id: add_log("Персонаж погиб.","combat")

func display_hero() -> Dictionary:
	# The world presentation clock owns visible rewards, equipment and cooldowns.
	# Raw net.hero remains authoritative for command/version/death validation.
	if not hud_hero.is_empty() and str(hud_hero.get("id","")) == str(app.net.hero.get("id","")):
		return hud_hero
	return app.net.hero

func comparison_slot(item_slot: String) -> String:
	var slots: Array = ["ring1","ring2"] if item_slot == "ring" else ["ear1"] if item_slot in ["ear","earring"] else [item_slot]
	if app.chosen_equipment in slots: return app.chosen_equipment
	for slot: String in slots:
		if not display_hero().get("equipment",{}).get(slot): return slot
	return str(slots[0])
