class_name VarendorInterfacePolish
extends RefCounted

const CELL: Vector2 = Vector2(44,44)
const ICON: Vector2 = Vector2(36,36)
var app: Node
var startup_display: Dictionary = {}
var applied_display: String = ""
var atlas: PanelContainer
var atlas_view: Control
var atlas_clock: Label
var storage_panel: PanelContainer
var storage_slots: Array = []
var storage_count: Label
var storage_signature: String = ""
var chat_channel: String = "world"
var chat_messages: Array = []
var chat_signature: String = ""
var layout_data: Dictionary = {}
var chat_box: Panel
var chat_tabs: Array = []
var chat_opacity: HSlider
var chat_resize: Control
var chat_send: Button
var chat_lock: Button
var elapsed: float = 0.0
var dragging_quick: bool = false
var drag_cancelled: bool = false

func configure_startup(value: Node) -> void:
	app = value
	if FileAccess.file_exists("user://display-settings-v2.json"):
		var read = JSON.parse_string(FileAccess.get_file_as_string("user://display-settings-v2.json"))
		if read is Dictionary: startup_display = read
	for key: String in ["display","resolution","ui_scale"]:
		if not startup_display.has(key): startup_display[key] = 1
	app.game_settings = startup_display.duplicate()
	app.get_window().content_scale_factor = [.8,1.0,1.25,1.5][clampi(int(startup_display.ui_scale),0,3)]
	apply_display()

func apply_display() -> void:
	if DisplayServer.get_name() == "headless": return
	if Array(OS.get_cmdline_user_args()).any(func(v: String): return v.begins_with("--qa=")): return
	var mode: int = clampi(int(app.game_settings.get("display",1)),0,2)
	var signature: String = str(mode)+":"+str(app.game_settings.get("resolution",1))
	if applied_display == signature: return
	applied_display = signature
	if mode == 0:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS,false)
		var choices: Array = app.window_resolutions()
		var requested: Vector2i = choices[clampi(int(app.game_settings.get("resolution",1)),0,choices.size()-1)]
		var available: Rect2i = DisplayServer.screen_get_usable_rect(DisplayServer.window_get_current_screen())
		requested = requested.min(available.size-Vector2i(24,48))
		DisplayServer.window_set_size(requested)
		DisplayServer.window_set_position(available.position+(available.size-requested)/2)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN if mode == 2 else DisplayServer.WINDOW_MODE_FULLSCREEN)

func save_display() -> void:
	for key: String in ["display","resolution","ui_scale"]: startup_display[key] = app.game_settings.get(key,1)
	var file: FileAccess = FileAccess.open("user://display-settings-v2.json",FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(startup_display))

func setup(value: Node) -> void:
	app = value
	for index: int in range(app.quick_buttons.size()):
		app.quick_buttons[index].owner_ui = app
		app.quick_buttons[index].slot_index = index
	var title: Control = app.quick_panel_node.get_child(0).get_child(0)
	make_draggable(title,app.reference_hud.dock,"dock")
	configure_chat()

func load_layout() -> void:
	layout_data = app.preferences.get("hud_layout",{}).duplicate(true)
	for key: String in ["chat","dock"]:
		var node: Control = chat_box if key == "chat" else app.reference_hud.dock
		var state: Dictionary = layout_data.get(key,{})
		if state.get("size") is Array and key == "chat": node.size = Vector2(state.size[0],state.size[1]).max(Vector2(330,190))
		if state.get("position") is Array: node.position = Vector2(state.position[0],state.position[1])
		clamp_panel(node)
	chat_opacity.value = float(layout_data.get("chat",{}).get("opacity",.9))
	chat_lock.button_pressed = bool(layout_data.get("chat",{}).get("locked",false))
	app.reference_hud.edit_toggle.text = "Закреплено" if bool(layout_data.get("dock",{}).get("locked",false)) else "Свободно"
	arrange_chat()
	app.reference_hud.layout()

func save_layout() -> void:
	app.preferences["hud_layout"] = layout_data.duplicate(true)
	app.save_preferences()

func clamp_panel(node: Control) -> void:
	node.position = node.position.clamp(Vector2(6,6),(app.ui.size-node.size-Vector2(6,6)).max(Vector2(6,6)))

func make_draggable(handle: Control, node: Control, key: String) -> void:
	handle.mouse_filter = Control.MOUSE_FILTER_STOP
	var state: Dictionary = {"active":false,"offset":Vector2.ZERO}
	handle.gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
			state.active = event.pressed and not bool(layout_data.get(key,{}).get("locked",false))
			state.offset = app.ui.get_global_mouse_position()-node.position
			if not event.pressed:
				var settings: Dictionary = layout_data.get(key,{})
				settings.position = [node.position.x,node.position.y]
				layout_data[key] = settings
				save_layout()
			handle.accept_event()
		elif event is InputEventMouseMotion and state.active:
			node.position = app.ui.get_global_mouse_position()-state.offset
			clamp_panel(node)
			var settings: Dictionary = layout_data.get(key,{})
			settings.position = [node.position.x,node.position.y]
			layout_data[key] = settings
			handle.accept_event())

func floating(title: String, dimensions: Vector2) -> PanelContainer:
	var panel: PanelContainer = PanelContainer.new()
	panel.name = title
	panel.add_theme_stylebox_override("panel",preload("res://scripts/titan_theme.gd").plate(14))
	app.ui.add_child(panel)
	panel.size = dimensions.min(app.ui.size-Vector2(24,24))
	panel.position = (app.ui.size-panel.size)*.5
	return panel

func shell(panel: PanelContainer, title: String, close: Callable, drag_key: String) -> VBoxContainer:
	var body: VBoxContainer = VBoxContainer.new()
	body.add_theme_constant_override("separation",8)
	panel.add_child(body)
	var header: HBoxContainer = HBoxContainer.new()
	body.add_child(header)
	var caption: Label = app.label(title,18,Color("ddc89d"))
	preload("res://scripts/titan_theme.gd").heading(caption)
	caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(caption)
	make_draggable(caption,panel,drag_key)
	var exit_button: Button = app.button("×",close)
	exit_button.custom_minimum_size = Vector2(30,26)
	header.add_child(exit_button)
	body.add_child(HSeparator.new())
	return body

func toggle_map() -> void:
	if is_instance_valid(atlas): atlas.queue_free(); atlas = null; return
	atlas = floating("WorldAtlas",Vector2(1020,690))
	atlas.set_meta("territory_map",true)
	var body: VBoxContainer = shell(atlas,"Карта Варендора",toggle_map,"atlas")
	atlas_view = preload("res://scripts/reference_minimap.gd").new()
	atlas_view.name = "TerritoryAtlas"
	atlas_view.world = app.world
	atlas_view.show_labels = true
	atlas_view.custom_minimum_size = Vector2(200,200)
	atlas_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(atlas_view)
	atlas_clock = app.label("",12,Color("e0c98e"))
	body.add_child(atlas_clock)
	var footer: HBoxContainer = HBoxContainer.new()
	body.add_child(footer)
	footer.add_child(app.label("Прозрачность",11))
	var opacity: HSlider = HSlider.new()
	opacity.min_value = .2; opacity.max_value = 1; opacity.step = .05
	opacity.custom_minimum_size.x = 180
	opacity.value = float(app.preferences.get("map_opacity",.95))
	footer.add_child(opacity)
	footer.add_child(app.label("Яркость",11))
	var brightness: HSlider = HSlider.new()
	brightness.min_value = .45; brightness.max_value = 1.5; brightness.step = .05
	brightness.custom_minimum_size.x = 180
	brightness.value = float(app.preferences.get("map_brightness",1))
	footer.add_child(brightness)
	var update: Callable = func(_v: float):
		atlas.self_modulate.a = opacity.value
		atlas_view.modulate = Color(brightness.value,brightness.value,brightness.value,opacity.value)
		app.preferences.map_opacity = opacity.value; app.preferences.map_brightness = brightness.value
		app.save_preferences()
	opacity.value_changed.connect(update); brightness.value_changed.connect(update); update.call(0.0)
	update_clock()

func update_clock() -> void:
	if not is_instance_valid(atlas_clock): return
	var env: Dictionary = app.world.current_snapshot.get("environment",{})
	if env.is_empty(): return
	var hour: float = float(env.hour)
	var real: Dictionary = Time.get_datetime_dict_from_unix_time(int(float(env.serverTime)/1000))
	atlas_clock.text = "Мир %02d:%02d · %s%s · до %s %s     Сервер %02d:%02d UTC" % [floori(hour),floori(fmod(hour,1)*60),"Ночь" if env.night else "День"," · Полнолуние" if env.fullMoon else "","рассвета" if env.night else "ночи",VarendorReferenceHud.timer_text(float(env.phaseRemainingMs)/1000),real.hour,real.minute]

func open_storage() -> void:
	if is_instance_valid(storage_panel): storage_panel.queue_free()
	storage_slots.clear()
	storage_signature = ""
	storage_panel = floating("PersonalStorage",Vector2(406,550))
	var body: VBoxContainer = shell(storage_panel,"Личный склад",func(): storage_panel.queue_free(); storage_panel = null,"storage")
	storage_count = app.label("",12)
	body.add_child(storage_count)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 8
	grid.add_theme_constant_override("h_separation",3); grid.add_theme_constant_override("v_separation",3)
	scroll.add_child(grid)
	for index: int in range(500):
		var slot: VarendorItemSlot = VarendorItemSlot.new()
		slot.owner_ui = app; slot.focus_mode = Control.FOCUS_NONE
		slot.custom_minimum_size = CELL
		slot.payload = {"kind":"storage","index":index,"item":{}}
		grid.add_child(slot); storage_slots.append(slot)
	body.add_child(app.label("Переносите предметы между сумкой и складом.\nДвойной клик в складе — забрать в сумку.",11))
	app.inventory_panel.show(); app.refresh_inventory()
	storage_panel.position = Vector2(maxf(8,app.ui.size.x*.5-410),70)
	app.inventory_panel.position = Vector2(storage_panel.position.x+416,70)
	clamp_panel(storage_panel); app.reference_hud.clamp_inventory()
	refresh_storage()

func refresh_storage() -> void:
	if not is_instance_valid(storage_panel): return
	var items: Array = app.net.hero.get("storage",[])
	var signature: String = JSON.stringify(items)
	if signature == storage_signature: return
	storage_signature = signature
	for index: int in range(storage_slots.size()):
		var item: Dictionary = items[index] if index<items.size() and items[index] is Dictionary else {}
		storage_slots[index].payload.item = item.duplicate()
		storage_slots[index].update_item(item)
	storage_count.text = "%d / 500 ячеек · общий склад двух городов" % items.filter(func(i): return i is Dictionary).size()

func shop(kind: String, title: String, selected_tab: int = 0) -> void:
	var body: VBoxContainer = app.dialog(title,Vector2i(480,350))
	body.add_child(app.label("Ваше золото: %d ◈" % int(app.net.hero.gold),13))
	var tabs: TabContainer = TabContainer.new()
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(tabs)
	var purchase: VBoxContainer = VBoxContainer.new(); purchase.name = "Купить"; purchase.add_theme_constant_override("separation",10); tabs.add_child(purchase)
	var sale: VBoxContainer = VBoxContainer.new(); sale.name = "Продать"; sale.add_theme_constant_override("separation",8); tabs.add_child(sale)
	tabs.current_tab = selected_tab
	if kind == "books": purchase.add_child(app.button("Книги умений · выбрать класс",app.book_ui.shop_classes))
	for id: String in ([] if kind == "books" else ["haste"] if kind == "alchemist" else ["potion","potion_large","haste","ether","teleport"]):
		var row: HBoxContainer = HBoxContainer.new(); row.add_theme_constant_override("separation",12); purchase.add_child(row)
		var cell: VarendorQuickSlot = VarendorQuickSlot.new(); cell.owner_ui = app; cell.custom_action = id; cell.custom_minimum_size = CELL
		cell.artwork = app.book_ui.item_icon({"id":id}); row.add_child(cell)
		var price: int = int({"haste":100,"potion":55,"potion_large":110,"ether":70,"teleport":130}[id])
		var column: VBoxContainer = VBoxContainer.new(); column.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(column)
		column.add_child(app.label(str(app.data.items[id].name),13))
		var desc: Label = app.label(str(app.data.items[id].desc),11); desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; column.add_child(desc)
		var buy: Button = app.button("%d ◈" % price,func():
			if app.net.command_busy: return
			await app.net.command({"type":"buy","itemId":id})
			if is_instance_valid(body): shop(kind,title,0))
		buy.set_meta("npc_action","buy:"+id); row.add_child(buy)
	sale.add_child(app.wrapped_label("Выберите предмет и количество. Ниже указана цена продажи одной единицы.",12))
	var count: int = 0
	for item: Dictionary in app.net.hero.inventory:
		if app.data.books.has(str(item.id)): continue
		count += 1
		var row: HBoxContainer = HBoxContainer.new(); row.add_theme_constant_override("separation",10); sale.add_child(row)
		var icon: TextureRect = TextureRect.new(); icon.texture = app.book_ui.item_icon(item); icon.custom_minimum_size = Vector2(36,36); icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED; row.add_child(icon)
		var name_label: Label = app.wrapped_label(app.item_name(item)+" ×"+str(int(item.count)),12); name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(name_label)
		var price: int = int(floorf(float(app.data.items[item.id].get("value",0))*.48))
		var sell: Button = app.button("%d ◈" % price,func():
			app.selected_item = {"kind":"bag","item":item.duplicate(true)}
			app.sell_selected(func(): shop(kind,title,1)))
		sell.set_meta("npc_action","sell:"+str(item.uid)); sell.tooltip_text = "Продать "+app.item_name(item); row.add_child(sell)
	if count == 0: sale.add_child(app.label("В сумке нет предметов для продажи.",12))

func open_skills() -> void:
	app.book_ui.catalogue()

func quick_action(data: Dictionary) -> String:
	if data.has("action"): return str(data.action)
	var item: Dictionary = data.get("item",{})
	if item.is_empty(): return ""
	if app.data.books.has(item.id): return str(item.id)
	return str(item.id) if app.data.items.get(item.id,{}).get("type","") == "consumable" else "item:"+str(item.uid)

func drop_quick(data: Dictionary, destination: int) -> void:
	var action: String = quick_action(data)
	if action.is_empty(): return
	var old: String = app.quick[destination].action
	app.quick[destination].action = action
	if data.get("kind") == "quick" and int(data.get("index",-1)) >= 0 and int(data.index) != destination: app.quick[int(data.index)].action = old
	app.refresh_quick(); app.save_preferences()

func finish_quick_drag(index: int, successful: bool) -> void:
	if index >= 0 and not successful and not drag_cancelled and not app.quick_panel_node.get_global_rect().has_point(app.ui.get_global_mouse_position()):
		app.quick[index].action = ""; app.refresh_quick(); app.save_preferences()
	dragging_quick = false; drag_cancelled = false

func configure_chat() -> void:
	chat_box = app.reference_hud.log_panel
	for child: Node in chat_box.get_children(): chat_box.remove_child(child); child.queue_free()
	chat_box.size = Vector2(330,215)
	var head: Label = app.reference_hud.text(chat_box,"Чат",Vector2(17,4),Vector2(200,20),12)
	make_draggable(head,chat_box,"chat")
	chat_lock = app.reference_hud.small_button(chat_box,"Фикс.",Vector2(270,2),Vector2(51,21),func():
		var state: Dictionary = layout_data.get("chat",{}); state.locked = not bool(state.get("locked",false)); layout_data.chat = state; save_layout())
	chat_lock.toggle_mode = true
	for index: int in range(3):
		var channel: String = ["world","trade","system"][index]
		var button: Button = app.reference_hud.small_button(chat_box,["Мир","Торговля","Система"][index],Vector2(8+index*100,28),Vector2(96,22),func(): chat_channel = channel; render_chat(true))
		chat_tabs.append(button)
	app.log_text = RichTextLabel.new(); app.log_text.bbcode_enabled = false; app.log_text.scroll_following = true
	app.log_text.add_theme_font_size_override("normal_font_size",12); chat_box.add_child(app.log_text)
	app.reference_hud.chat = LineEdit.new(); app.reference_hud.chat.max_length = 240; chat_box.add_child(app.reference_hud.chat)
	app.reference_hud.chat.text_submitted.connect(func(_text: String): send_chat())
	chat_send = app.reference_hud.small_button(chat_box,"›",Vector2.ZERO,Vector2(24,24),send_chat,16)
	chat_opacity = HSlider.new(); chat_opacity.min_value = .15; chat_opacity.max_value = 1; chat_opacity.step = .05; chat_opacity.value = .9; chat_opacity.tooltip_text = "Прозрачность фона"; chat_box.add_child(chat_opacity)
	chat_opacity.value_changed.connect(func(value: float):
		chat_box.add_theme_stylebox_override("panel",VarendorReferenceHud.frame(Color(.08,.12,.15,value),Color("8c7353")))
		var state: Dictionary = layout_data.get("chat",{}); state.opacity = value; layout_data.chat = state; save_layout())
	chat_resize = app.reference_hud.text(chat_box,"◢",Vector2.ZERO,Vector2(20,20),16); chat_resize.mouse_filter = Control.MOUSE_FILTER_STOP
	var dragging: Dictionary = {"active":false}
	chat_resize.gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
			dragging.active = event.pressed and not bool(layout_data.get("chat",{}).get("locked",false))
			if not event.pressed: save_layout()
		elif event is InputEventMouseMotion and dragging.active:
			chat_box.size = (app.ui.get_global_mouse_position()-chat_box.position).clamp(Vector2(330,190),Vector2(700,500).min(app.ui.size-chat_box.position-Vector2(8,8)))
			var state: Dictionary = layout_data.get("chat",{}); state.size = [chat_box.size.x,chat_box.size.y]; layout_data.chat = state; arrange_chat())
	arrange_chat()

func arrange_chat() -> void:
	if app.log_text == null or chat_box == null: return
	var width: float = chat_box.size.x
	var height: float = chat_box.size.y
	app.log_text.position = Vector2(8,56); app.log_text.size = Vector2(width-16,height-113)
	app.reference_hud.chat.position = Vector2(8,height-52); app.reference_hud.chat.size = Vector2(width-44,25)
	chat_send.position = Vector2(width-31,height-52)
	chat_opacity.position = Vector2(8,height-20); chat_opacity.size = Vector2(width-42,16)
	chat_resize.position = Vector2(width-24,height-24)

func send_chat() -> void:
	if chat_channel == "system": return
	var value: String = app.reference_hud.chat.text.strip_edges()
	if value.is_empty(): return
	app.net.command({"type":"chat","channel":chat_channel,"text":value})
	app.reference_hud.chat.text = ""; app.reference_hud.chat.release_focus()

func render_chat(force: bool = false) -> void:
	if app == null or chat_box == null: return
	var signature: String = chat_channel+str(chat_messages)+str(app.reference_hud.log_entries.size())+str(app.reference_hud.log_entries.back() if not app.reference_hud.log_entries.is_empty() else {})
	if signature == chat_signature and not force: return
	chat_signature = signature
	app.log_text.clear()
	if chat_channel == "system":
		for entry: Dictionary in app.reference_hud.log_entries: app.log_text.add_text(str(entry.stamp)+str(entry.message)+( " ×%d" % entry.count if entry.count > 1 else "")+"\n")
	else:
		for entry: Dictionary in chat_messages:
			if str(entry.channel) == chat_channel: app.log_text.add_text(str(entry.name)+": "+str(entry.text)+"\n")
	app.reference_hud.chat.editable = chat_channel != "system"
	app.reference_hud.chat.placeholder_text = "События игры" if chat_channel == "system" else "Enter — мировой чат" if chat_channel == "world" else "Enter — торговый чат"
	for i: int in range(chat_tabs.size()): chat_tabs[i].modulate = Color.WHITE if ["world","trade","system"][i] == chat_channel else Color("939da5")

func refresh(snapshot: Dictionary) -> void:
	chat_messages = snapshot.get("chat",[])
	render_chat(); update_clock(); refresh_storage()

func process(delta: float) -> void:
	elapsed += delta
	if elapsed > .25:
		elapsed = 0
		app.quick_panel_node.visible = bool(app.game_settings.get("quick_visible",true))
		app.reference_hud.dock.get_node("QuickConsumables").visible = app.quick_panel_node.visible
		if is_instance_valid(atlas): clamp_panel(atlas)
		if is_instance_valid(storage_panel): clamp_panel(storage_panel)
