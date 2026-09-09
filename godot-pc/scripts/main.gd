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
# Keep immutable icon resources alive across snapshot refreshes. Replacing a
# skill with a temporary weapon texture used to evict/reload it every update.
var quick_artwork_cache: Dictionary = {}
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
var active_dialog: PanelContainer
var qa_path: String = ""
var qa_started: bool = false
var qa_interaction: bool = false
var qa_times: Array = []
var qa_last_frame_usec: int = 0
var player_input: VarendorPlayerInput = VarendorPlayerInput.new()
var npc_interaction: VarendorNpcInteraction = VarendorNpcInteraction.new()
var mouse_orbit: bool:
	get: return world.camera_controller.captured if world != null else false
var mouse_sensitivity: float = 1.0
var invert_camera_y: bool = false
var chosen_equipment: String = ""
var inventory_footer: Label
var inventory_drag: bool = false
var inventory_drag_offset: Vector2
var game_settings: Dictionary = {}
const DEFAULT_BINDINGS: Dictionary = {"move_forward":KEY_W,"move_back":KEY_S,"move_left":KEY_A,"move_right":KEY_D,"potion":KEY_Q,"ether":KEY_E,"jump":KEY_SPACE,"interact":KEY_F}
const BINDING_NAMES: Dictionary = {"move_forward":"Вперёд","move_back":"Назад","move_left":"Влево","move_right":"Вправо","potion":"Зелье здоровья","ether":"Зелье ресурса","jump":"Прыжок","interact":"Взаимодействие"}
var rebinding_action: String = ""
var binding_message: Label
var display_before: Dictionary = {}
var display_remaining: float = 0.0
var display_countdown: Label
var quick_panel_node: PanelContainer
var reference_hud: VarendorReferenceHud = VarendorReferenceHud.new()
var book_ui: VarendorBookUI = VarendorBookUI.new()
var polish: VarendorInterfacePolish = VarendorInterfacePolish.new()

func _ready() -> void:
	book_ui.app = self
	polish.configure_startup(self)
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
	world.book_ui = book_ui
	add_child(world)
	player_input.setup(world,net)
	world.snapshot_presented.connect(present_snapshot)
	build_ui()
	polish.setup(self)
	world.event_presented.connect(reference_hud.combat_event)
	login.hide()
	notice("Загрузка мира…")
	await get_tree().process_frame
	if not await world.setup(data):
		notice("Не удалось загрузить мир. Полностью распакуйте свежий пакет игры.")
		return
	world.picked.connect(picked)
	npc_interaction.setup(world,net)
	npc_interaction.service_opened.connect(open_npc_service)
	npc_interaction.notice.connect(notice)
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
	for option: String in OS.get_cmdline_user_args():
		if option.begins_with("--frame-pacing-dir="):
			var recorder = preload("res://scripts/frame_pacing_recorder.gd").new()
			recorder.name = "FramePacingRecorder"; recorder.app = self
			recorder.directory = option.trim_prefix("--frame-pacing-dir=")
			add_child(recorder)
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--qa="):
			qa_path = arg.trim_prefix("--qa=")
	if not qa_path.is_empty():
		if not net.bootstrap.get("profiles", []).is_empty():
			await net.connect_profile(net.bootstrap.profiles[0])
		else:
			await net.create_character("PC Test", "knight")
		call_deferred("run_content_qa" if "--qa-scope=content" in OS.get_cmdline_user_args() else "run_knight_qa" if "--qa-scope=knight" in OS.get_cmdline_user_args() else "run_pacing_qa" if "--qa-scope=pacing" in OS.get_cmdline_user_args() else "run_polish_qa" if "--qa-scope=polish" in OS.get_cmdline_user_args() else "run_territory_qa" if "--qa-scope=world" in OS.get_cmdline_user_args() else "run_stop_npc_qa" if "--qa-scope=stop-npc" in OS.get_cmdline_user_args() or "--qa-scope=stop-only" in OS.get_cmdline_user_args() else "run_qa")

func run_content_qa() -> void:
	await preload("res://scripts/content_acceptance.gd").run(self)

func run_knight_qa() -> void:
	await preload("res://scripts/knight_integration_qa.gd").run(self)

func run_pacing_qa() -> void:
	await preload("res://scripts/pacing_acceptance.gd").run(self)

func run_polish_qa() -> void:
	await preload("res://scripts/polish_acceptance.gd").run(self)

func run_territory_qa() -> void:
	await preload("res://scripts/territory_acceptance.gd").run(self)

func run_stop_npc_qa() -> void:
	await preload("res://scripts/stop_npc_acceptance.gd").run(self)

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
	reference_hud.setup(self)

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
	reference_hud.build_inventory()

func snapshot_received(snapshot: Dictionary) -> void:
	world.receive_snapshot(snapshot)
	polish.refresh(snapshot)

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
	status.text = world.location_name(Vector2(hero.x,hero.z))
	respawn.visible = hero.dead
	reference_hud.refresh(hero)
	var fingerprint: String = JSON.stringify([hero.inventory, hero.equipment, hero.stats, selected_scroll])
	if fingerprint != inventory_fingerprint:
		inventory_fingerprint = fingerprint
		refresh_inventory()
	refresh_quick()
	target_text.text = ""
	target_panel.hide()
	target_hp.show()
	if VarendorNpcInteraction.SERVICES.has(world.target_id):
		var service: Dictionary = VarendorNpcInteraction.SERVICES[world.target_id]
		target_panel.show()
		target_text.text = service.name
		target_hp.hide()
		target_state.text = service.role + (" · Подход" if not npc_interaction.pending_id.is_empty() else " · F — поговорить")
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
	var model: Dictionary = reference_hud.tooltip_model(item)
	if model.is_empty(): return "Свободная ячейка"
	var lines: Array = [model.title,model.subtitle,model.description]
	for row: Dictionary in model.rows: lines.append(row.label+": "+str(row.value)+("\n"+str(row.detail) if row.has("detail") else ""))
	lines.append_array(model.restrictions)
	lines.append_array(model.actions)
	for comparison: Dictionary in model.comparisons:
		lines.append(comparison.title)
		for row: Dictionary in comparison.rows: lines.append(row.label+": "+str(row.value))
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
	var hero: Dictionary = reference_hud.display_hero()
	if hero.is_empty():
		return
	for index: int in range(42):
		var item: Dictionary = hero.inventory[index] if index < hero.inventory.size() else {}
		var slot: VarendorItemSlot = bag_slots[index]
		slot.payload.item = item.duplicate()
		slot.update_item(item)
		slot.tooltip_text = ""
	for slot_name: String in equipment_slots:
		var item = hero.equipment.get(slot_name)
		var slot: VarendorItemSlot = equipment_slots[slot_name]
		slot.payload.item = item.duplicate() if item is Dictionary else {}
		slot.update_item(item if item is Dictionary else {})
		slot.tooltip_text = "" if item is Dictionary else str(data.slotNames[slot_name])
	reference_hud.refresh_inventory_state()

func action_name(action: String) -> String:
	if action.begins_with("item:"):
		for item: Dictionary in net.hero.get("inventory",[]):
			if str(item.uid) == action.trim_prefix("item:"): return item_name(item)
		return "Предмет недоступен"
	if data.books.has(action): return str(data.books[action].name)
	if data.items.has(action): return str(data.items[action].name)
	if action.begins_with("skill:"):
		var class_id: String = str(net.hero.get("classId", "knight"))
		return data.classes[class_id].skills[int(action.trim_prefix("skill:"))].name
	return {"":"—","attack":"Атака","potion":"Здоровье","ether":"Ресурс","teleport":"Возврат"}.get(action, action)

func quick_artwork(path: String) -> Texture2D:
	if not quick_artwork_cache.has(path):
		quick_artwork_cache[path] = load(path)
	return quick_artwork_cache[path]

func refresh_quick() -> void:
	var hero: Dictionary = reference_hud.display_hero()
	if quick_panel_node != null:
		reference_hud.layout()
	for index: int in range(quick_buttons.size()):
		var slot: VarendorQuickSlot = quick_buttons[index]
		var action: String = quick[index].action
		var key: String = quick[index].key.replace("Shift+", "⇧").replace("Digit", "").replace("Key", "")
		var title: String = action_name(action)
		if action.is_empty():
			slot.artwork = null
		elif action.begins_with("skill:"):
			slot.artwork = quick_artwork("res://assets/icons/%s_skill_%d.svg" % [hero.get("classId", "knight"), int(action.trim_prefix("skill:"))])
		elif data.items.has(action):
			slot.artwork = book_ui.item_icon({"id":action})
		else:
			slot.artwork = quick_artwork("res://assets/icons/" + str(data.classes[hero.get("classId", "knight")].weapon) + ".svg")
		slot.remaining = 0
		slot.quantity = 0
		slot.usable = not net.hero.get("dead", false)
		if action in ["potion", "ether", "teleport", "haste"] and not hero.is_empty():
			for item: Dictionary in hero.inventory:
				if item.id == action:
					slot.quantity += int(item.count)
			slot.usable = slot.usable and slot.quantity > 0
		if action.begins_with("item:"):
			slot.usable = false
			for item: Dictionary in hero.get("inventory",[]):
				if str(item.uid) == action.trim_prefix("item:"):
					slot.artwork = book_ui.item_icon(item)
					slot.usable = not net.hero.get("dead",false)
		var icon: String = {"":"·","attack":"⚔","potion":"ОЗ","ether":"MP","teleport":"⌂"}.get(action, str(index % 8 + 1))
		if action.begins_with("skill:"):
			var skill_index: int = int(action.trim_prefix("skill:"))
			var skill: Dictionary = data.classes[hero.get("classId", "knight")].skills[skill_index]
			icon = str(skill.icon)
			if not hero.is_empty():
				var left: float = maxf(0, (hero.cooldowns[skill_index] - float(world.current_snapshot.get("time", net.last_time))) / 1000.0)
				slot.remaining = left
				slot.cooldown = float(skill.cd)
				slot.usable = slot.usable and hero.mp >= skill.cost and left <= 0
				if left > 0:
					icon = "%.1f" % left
			title += "\nЦена: %s · Перезарядка: %s с" % [skill.cost, skill.cd]
		if data.books.has(action):
			var book: Dictionary = data.books[action]
			slot.remaining = maxf(0,(float(hero.get("bookCooldowns",{}).get(action,0))-float(world.current_snapshot.get("time",net.last_time)))/1000)
			slot.cooldown = float(book.cd)
			slot.usable = slot.usable and book_ui.owns(action) and int(hero.get("level",0))>=int(book.level) and str(hero.get("classId",""))==str(book.classId) and float(hero.get("mp",0))>=float(book.cost)
			title = book_ui.tooltip(action)
		slot.text = ""
		slot.symbol = str(data.classes[hero.get("classId","knight")].skills[int(action.trim_prefix("skill:"))].icon) if action.begins_with("skill:") else {"":"","attack":"⚔","potion":"♥","ether":"◆","teleport":"⌂"}.get(action,"")
		slot.key_label = key
		slot.queue_redraw()
		slot.tooltip_text = title + "\nЛКМ и перенос — переставить; вне панели — убрать.\nПКМ — действие и клавиша."
		slot.visible = index < 16 or full_quick
	reference_hud.refresh_consumables()

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
			if action.begins_with("item:") or data.books.has(action) or action in ["", "attack", "potion", "ether", "teleport", "haste"]:
				quick[index].action = action
			quick[index].key = key if key in data.quickKeys and key not in used else ""
			if not quick[index].key.is_empty():
				used.append(quick[index].key)
	# One-time migration from the rejected native camera range to the reference.
	var reference_camera: bool = preferences.get("camera_reference","") == "1e94a0d1"
	world.camera_distance = clampf(float(preferences.get("camera_distance",10.5)) if reference_camera else 10.5,5.5,18)
	preferences["camera_reference"] = "1e94a0d1"
	game_settings = preferences.get("settings", {}).duplicate(true)
	for key: String in ["display","resolution","ui_scale"]: game_settings[key] = polish.startup_display.get(key,1)
	configure_input()
	full_quick = bool(preferences.get("full_quick", false))
	if preferences.get("hud_reference", "") == "1e94a0d1" and preferences.get("inventory_position") is Array and preferences.inventory_position.size() == 2:
		inventory_panel.position = Vector2(preferences.inventory_position[0], preferences.inventory_position[1]).clamp(Vector2.ZERO, (ui.size - inventory_panel.size).max(Vector2.ZERO))
	else:
		inventory_panel.position = Vector2(ui.size.x - 410, 58)
		keep_inventory_visible()
	apply_settings()
	polish.load_layout()
	refresh_quick()

func save_preferences() -> void:
	if preference_path.is_empty():
		return
	preferences["quickbar"] = quick
	preferences["camera_distance"] = world.camera_distance
	preferences["camera_reference"] = "1e94a0d1"
	preferences["schema"] = 2
	preferences["full_quick"] = full_quick
	preferences["inventory_position"] = [inventory_panel.position.x, inventory_panel.position.y]
	preferences["hud_reference"] = "1e94a0d1"
	preferences["settings"] = game_settings
	polish.save_display()
	if not net.save_private_json(preference_path, preferences):
		notice("Не удалось сохранить назначения клавиш")

func dialog(title: String, size: Vector2i = Vector2i(480, 270)) -> VBoxContainer:
	world.camera_controller.release_for_modal()
	if is_instance_valid(active_dialog): close_dialog()
	active_dialog = polish.floating(title,Vector2(size)+Vector2(0,40))
	var shell: VBoxContainer = polish.shell(active_dialog,title,close_dialog,"dialog")
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.name = "DialogScroll"
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	shell.add_child(scroll)
	var body: VBoxContainer = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation",10)
	scroll.add_child(body)
	return body

func assign_dialog(index: int) -> void:
	var box: VBoxContainer = dialog("Назначение ячейки " + str(index + 1))
	var actions: Array = ["", "attack", "potion", "ether", "teleport", "haste"]
	for id: String in data.books:
		if book_ui.owns(id): actions.append(id)
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
				setting_toggle(page, "Панель быстрого доступа", "quick_visible", true)
				setting_choice(page, "Масштаб интерфейса", "ui_scale", ["80%", "100%", "125%", "150%"], 1)
				setting_choice(page, "Громкость боя", "combat_volume", ["Выкл.", "25%", "50%", "75%", "100%"], 3)
				setting_choice(page, "Звуки окружения", "ambient_volume", ["Выкл.", "25%", "50%", "75%", "100%"], 2)
				page.add_child(wrapped_label("Tab — инвентарь и персонаж.\nEsc — закрыть окно / отменить действие / меню.", 15))
			"Графика":
				setting_choice(page, "Профиль", "quality", ["Низкий", "Средний", "Высокий"], 2)
				setting_choice(page, "Сглаживание MSAA", "msaa", ["Выкл.", "2×", "4×", "8×"], 2)
				setting_toggle(page, "Тени", "shadows", true)
				setting_toggle(page, "Атмосферный туман", "fog", true)
				setting_choice(page, "Дальность мира", "distance", ["150 м", "240 м", "360 м"], 2)
				setting_choice(page, "Декоративная растительность", "vegetation", ["24 м", "45 м", "80 м"], 2)
				setting_choice(page, "Разрешение 3D", "render_scale", ["50%", "75%", "100%"], 2)
			"Управление":
				page.add_child(wrapped_label("ЛКМ — идти / один удар. ЛКМ + ПКМ, затем отпустить — автоатака.\nПКМ — камера. Колесо — масштаб. K — автобег, N — навыки.\nWASD / стрелки — движение, Q / E — зелья, Пробел — прыжок.\nЛКМ и перенос ячейки — настройка панели. M — карта на ходу.", 15))
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
				setting_choice(page, "Режим экрана", "display", ["Оконный", "Без рамки", "Полный экран"], 1)
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

func wrapped_label(message: String, font_size: int = 15) -> Label:
	var result: Label = label(message,font_size)
	result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return result

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
		var previous: Dictionary = {"display":game_settings.get("display", 1),"resolution":game_settings.get("resolution", 1)}
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
		polish.apply_display()
	call_deferred("keep_inventory_visible")

func configure_input() -> void:
	for action: String in DEFAULT_BINDINGS:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		InputMap.action_erase_events(action)
		var event: InputEventKey = InputEventKey.new()
		event.physical_keycode = int(game_settings.get("bindings", {}).get(action, DEFAULT_BINDINGS[action]))
		InputMap.action_add_event(action, event)
		if action in ["move_forward","move_back","move_left","move_right"] and event.physical_keycode == DEFAULT_BINDINGS[action]:
			var arrow: InputEventKey = InputEventKey.new()
			arrow.physical_keycode = {"move_forward":KEY_UP,"move_back":KEY_DOWN,"move_left":KEY_LEFT,"move_right":KEY_RIGHT}[action]
			InputMap.action_add_event(action, arrow)

func assign_movement_binding(event: InputEventKey) -> void:
	var key: int = event.physical_keycode
	if event.shift_pressed or event.ctrl_pressed or event.alt_pressed or event.meta_pressed or key in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_I, KEY_C, KEY_TAB, KEY_K, KEY_N, KEY_M, KEY_ENTER] or (key >= KEY_1 and key <= KEY_8):
		binding_message.text = "Выберите одну клавишу без модификаторов.\nI / C / Tab, K / M, Enter и 1–8 заняты интерфейсом."
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
	reference_hud.layout()

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
		npc_interaction.begin(id)
	else:
		net.intent({"type":"attack","entityId":id,"skill":null})

func interact() -> void:
	npc_interaction.begin(world.target_id)

func open_npc_service(id: String) -> void:
	if id == "npc:asterhold:shop": book_ui.shop_classes(); return
	if id == "npc:asterhold:elder": book_ui.quest_menu(); return
	var service: Dictionary = VarendorNpcInteraction.SERVICES.get(id,{})
	var kind: String = id.get_slice(":",id.get_slice_count(":")-1)
	if kind in ["shop","alchemist"]:
		polish.shop(kind,str(service.get("name","Торговля")))
		return
	if kind == "storage":
		polish.open_storage()
		return
	id = "npc:"+kind
	if id == "npc:elder":
		var box: VBoxContainer = dialog(str(service.get("name","Старейшина")),Vector2i(480,240))
		var progress: Array[String] = ["За стенами снова слышен вой. Восемь тварей — и я поверю, что ты способен пережить эту ночь.","Очищай дорогу за стенами города. Побеждено тварей: %d / 8." % mini(int(net.hero.kills),8),"Теперь отыщи Кровавого Оборотня в Чёрном лесу.","Спустись к шахте и победи Хозяина Гнилого Леса.","Ты прошёл этот путь. Продолжай охоту и укрепляй своё снаряжение."]
		var quest_text: Label = label(progress[clampi(int(net.hero.quest),0,4)])
		quest_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(quest_text)
		var accept: Button = button("Я очищу дорогу" if int(net.hero.quest) == 0 else "Продолжить",func():
			if int(net.hero.quest) == 0:
				await net.command({"type":"quest"})
				if int(net.hero.quest) == 1: notice("Задание принято: очистить дорогу за городом")
			if int(net.hero.quest) > 0: close_dialog())
		accept.set_meta("npc_action","quest")
		box.add_child(accept)
	elif id == "npc:smith":
		inventory_panel.show()
		refresh_inventory()
		notice("Бран: дважды нажмите свиток, затем один раз — предмет. Свитки добываются с монстров.")
	elif id == "npc:teleport":
		var box: VBoxContainer = dialog(str(service.get("name","Переход")), Vector2i(480, 320))
		box.add_child(label("Переход в столицу бесплатен."))
		for destination: String in ["Астерхолд", "Гринфолл", "Чёрный лес", "Вход в шахту"]:
			var price: Array = {"Астерхолд":[0,1],"Гринфолл":[25,1],"Чёрный лес":[90,10],"Вход в шахту":[150,10]}[destination]
			var travel: Button = button(destination + " · %d золота · ур. %d" % [price[0],price[1]], func():
				var before_generation: int = int(net.hero.generation)
				await net.command({"type":"teleport","destination":destination})
				if int(net.hero.generation) != before_generation: close_dialog())
			travel.set_meta("npc_action","teleport:"+destination)
			box.add_child(travel)

func activate(action: String) -> void:
	if action.begins_with("skill:"): return
	if net.hero.is_empty() or net.hero.dead or not net.connected:
		return
	if data.books.has(action): book_ui.activate(action); return
	if action.begins_with("item:"):
		for item: Dictionary in net.hero.inventory:
			if str(item.uid) == action.trim_prefix("item:"):
				selected_item = {"kind":"bag","item":item.duplicate()}; use_selected(); return
		notice("Предмет недоступен в сумке")
		return
	if action in ["potion", "ether", "teleport", "haste"]:
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
		if index >= 0:
			if float(net.hero.cooldowns[index]) > float(net.last_time) or float(net.hero.mp) < float(skill.cost): return
			world.predict_skill(index)
		net.intent({"type":"attack","entityId":"@self" if self_cast else world.target_id,"skill":index if index >= 0 else null,"mode":"auto" if index < 0 else "single"})

func item_clicked(payload: Dictionary, double_click: bool) -> void:
	if net.command_busy:
		return
	selected_item = payload.duplicate(true)
	if payload.get("kind") == "storage":
		if double_click and not payload.get("item",{}).is_empty(): net.command({"type":"storage","direction":"withdraw","item":payload.item.duplicate()})
		return
	if payload.get("kind") == "equipment":
		chosen_equipment = str(payload.slot)
	var item: Dictionary = payload.get("item", {})
	reference_hud.refresh_inventory_state()
	if item.is_empty() or net.hero.get("dead",true):
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
	if net.hero.get("dead",true) or net.command_busy: return
	var item: Dictionary = selected_item.get("item", {})
	if item.is_empty():
		return
	if selected_item.get("kind") == "storage":
		net.command({"type":"storage","direction":"withdraw","item":item.duplicate()})
		return
	if not data.items.has(item.id):
		notice("Этот предмет сохранён, но пока не поддерживается клиентом")
		return
	if data.books.has(item.id):
		book_ui.activate(item.id); return
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
	if net.hero.get("dead",true) or net.command_busy or not reference_hud.has_item_version(source.item): return
	if destination.kind == "storage":
		net.command({"type":"storage","direction":"reorder" if source.kind == "storage" else "deposit","item":source.item.duplicate(),"index":int(destination.index)})
		return
	if source.kind == "storage":
		net.command({"type":"storage","direction":"withdraw","item":source.item.duplicate(),"index":int(destination.index)})
		return
	if source.kind == "equipment" and destination.kind == "equipment": return
	if destination.kind == "equipment":
		net.command({"type":"equip","item":source.item.duplicate(),"slot":destination.slot})
	elif source.kind == "equipment":
		net.command({"type":"unequip","item":source.item.duplicate(),"slot":source.slot,"index":mini(int(destination.index), net.hero.inventory.size())})
	else:
		net.command({"type":"reorder","item":source.item.duplicate(),"index":mini(int(destination.index), maxi(0, net.hero.inventory.size() - 1))})

func toggle_inventory() -> void:
	inventory_panel.visible = not inventory_panel.visible
	if inventory_panel.visible:
		refresh_inventory()
		reference_hud.clamp_inventory()
	elif is_instance_valid(tooltip_panel):
		tooltip_panel.queue_free()
		tooltip_panel = null

func notice(message: String) -> void:
	if not qa_path.is_empty():
		print("VARENDOR_QA_NOTICE " + message)
	var translations: Dictionary = {"book-required":"Умения применяются через книги", "book-level":"Недостаточный уровень для книги", "book-not-owned":"Книга должна находиться в сумке", "book-already-owned":"Эта книга уже куплена", "invalid-target":"Выберите живого противника", "invalid-ally":"Выберите союзника", "out-of-range":"Цель слишком далеко или закрыта препятствием", "safe-zone":"В городе нельзя применять боевые умения", "resource":"Недостаточно ресурса", "cannot-cast":"Дождитесь приземления", "cast-busy":"Дождитесь завершения применения", "cannot-sell-book":"Книга умения не продаётся обратно", "storage-unavailable":"Подойдите ближе к кладовщику", "storage-full":"Склад заполнен", "storage-slot-occupied":"Эта ячейка склада занята", "invalid-storage-slot":"Недоступная ячейка склада", "chat-too-fast":"Подождите перед следующим сообщением", "invalid-chat":"Введите сообщение до 240 символов", "skill-cooldown":"Умение восстанавливается", "shop-unavailable":"Подойдите ближе к торговцу", "teleport-unavailable":"Подойдите ближе к хранителю портала", "elder-unavailable":"Подойдите ближе к старейшине", "insufficient-gold":"Недостаточно золота", "level-required":"Недостаточный уровень", "cannot-use":"Этот предмет сейчас нельзя использовать", "bag-full":"Сумка заполнена", "stale-item":"Предмет уже изменился. Выберите его заново", "class-restricted":"Предмет не подходит вашему классу", "invalid-name":"Недопустимое имя персонажа", "missing-target":"Цель уже недоступна", "cooldown":"Умение восстанавливается", "insufficient-resource":"Недостаточно ресурса", "airborne":"Дождитесь приземления", "attack-in-progress":"Текущее действие ещё выполняется", "no-free-path":"До этой точки нет свободного пути", "dead":"Действие недоступно после гибели", "no-free-arrival":"Точка прибытия занята"}
	if log_text != null:
		var translated: String = str(translations.get(message,message))
		reference_hud.add_log(translated,"loot" if translated.begins_with("Добыча:") else "system")
	else:
		print(message)

func text_focused() -> bool:
	return get_viewport().gui_get_focus_owner() is LineEdit or (is_instance_valid(active_dialog) and not active_dialog.get_meta("nonmodal",false)) or (login != null and login.visible)

func _process(delta: float) -> void:
	if world == null or net == null:
		return
	# The frame's catch-up physics belongs to the previously held input.
	# Commit freshly sampled keys AFTER those ticks and BEFORE world rendering:
	# applying a release in the first catch-up tick retroactively erases elapsed
	# movement while the server has already simulated it, causing a later slide.
	# Only input sampling moves here; the motor still integrates fixed 60 Hz ticks.
	polish.process(delta)
	player_input.poll(delta,not text_focused() and net.connected and not net.hero.is_empty() and not net.hero.dead)
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

func _physics_process(delta: float) -> void:
	if world != null and net != null:
		# A fresh WASD edge commits after catch-up. Do not let an NPC window
		# open first and steal that input; its intent will cancel the approach.
		if npc_interaction.network != null and not player_input.movement_started: npc_interaction.poll(delta)
	if status != null and not net.connected and not net.hero.is_empty():
		status.text = "Соединение потеряно · переподключение…"

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_ESCAPE: player_input.autorun = false
		if event.physical_keycode == KEY_F3:
			var recorder: Node = get_node_or_null("FramePacingRecorder")
			if recorder != null: recorder.start_recording()
			diagnostics.visible = not diagnostics.visible
			return
		if event.physical_keycode == KEY_ESCAPE:
			if book_ui != null and not book_ui.targeting_book.is_empty():
				book_ui.targeting_book = ""
				return
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
		# F is also an assignable quickbar key. A selected service NPC owns
		# interaction here; without an NPC the user's quickbar binding wins.
		if event.is_action_pressed("interact") and VarendorNpcInteraction.SERVICES.has(world.target_id):
			interact()
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
			KEY_N: reference_hud.skills_dialog()
			KEY_K: player_input.autorun = not player_input.autorun
			KEY_M: reference_hud.map_dialog()
			KEY_ENTER: reference_hud.chat.grab_focus()
		if event.is_action_pressed("jump"):
			net.intent({"type":"jump"})
		elif event.is_action_pressed("potion") and not event.shift_pressed and not event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed:
			activate("potion")
		elif event.is_action_pressed("ether") and not event.shift_pressed and not event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed:
			activate("ether")
		elif event.is_action_pressed("interact"):
			interact()
	if text_focused():
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT and not selected_scroll.is_empty():
		selected_scroll = {}
		refresh_inventory()
		get_viewport().set_input_as_handled()
		return
	if player_input.mouse(event):
		get_viewport().set_input_as_handled()
		if event is InputEventMouseButton and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]: save_preferences()

func _input(event: InputEvent) -> void:
	if player_input != null and player_input.release_buttons(event):
		get_viewport().set_input_as_handled()
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if polish.dragging_quick and event.physical_keycode == KEY_ESCAPE: polish.drag_cancelled = true
		if is_instance_valid(polish.atlas) and event.physical_keycode in [KEY_M,KEY_ESCAPE]:
			polish.toggle_map(); get_viewport().set_input_as_handled(); return
		if is_instance_valid(polish.storage_panel) and event.physical_keycode == KEY_ESCAPE:
			polish.storage_panel.queue_free(); polish.storage_panel = null; get_viewport().set_input_as_handled(); return
		if is_instance_valid(active_dialog):
			if not rebinding_action.is_empty() and event.physical_keycode != KEY_ESCAPE:
				assign_movement_binding(event); get_viewport().set_input_as_handled(); return
			if event.physical_keycode in [KEY_ESCAPE,KEY_TAB]:
				close_dialog(); get_viewport().set_input_as_handled(); return
	if world != null and net != null:
		player_input.handle_keyboard(event, not text_focused() and net.connected and not bool(net.hero.get("dead", true)))
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
	var click_screen: Vector2 = world.camera.unproject_position(world.point(ground_goal.x, ground_goal.y))
	var click_picked: String = world.pick_entity(click_screen)
	var click_server_time: float = float(net.last_time)
	world.click(click_screen)
	var click_sequence: int = net.sequence
	checks["mouse_ground_intent_is_predicted_before_server_ack"] = not clicked.is_empty() and world.player_motion.input_mode == "destination" and not world.player_motion.navigation_path.is_empty()
	# The public click callback submits asynchronously. A 1.2s wall timer
	# could expire before HTTP/SSE was polled on a slow software-rendered frame.
	# Require the actual command ACK and endpoint; never count waiting alone.
	var click_deadline: int = Time.get_ticks_msec() + 8000
	while Time.get_ticks_msec() < click_deadline and (int(net.hero.lastInputSequence) < click_sequence or Vector2(net.hero.x,net.hero.z).distance_to(ground_goal) >= .25):
		await get_tree().process_frame
	world.moved_to.disconnect(on_move)
	checks["mouse_ground_destination"] = not clicked.is_empty() and int(net.hero.lastInputSequence) >= click_sequence and Vector2(net.hero.x, net.hero.z).distance_to(ground_goal) < .25
	checks["mouse_ground_observation"] = {"goal":[ground_goal.x,ground_goal.y],"screen":[click_screen.x,click_screen.y],"picked_entity":click_picked,"emitted_ground_count":clicked.size(),"input_sequence":click_sequence,"ack":net.hero.lastInputSequence,"server_elapsed_ms":float(net.last_time)-click_server_time,"actual":[net.hero.x,net.hero.z],"distance":Vector2(net.hero.x,net.hero.z).distance_to(ground_goal)}
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
	var prior_display: Dictionary = {"display":game_settings.get("display", 1),"resolution":game_settings.get("resolution", 1)}
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
	checks.merge(await preload("res://scripts/reference_ui_qa.gd").run(self))
	checks.merge(await preload("res://scripts/npc_interaction_qa.gd").run(self))
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
	var closing: PanelContainer = active_dialog
	active_dialog = null
	rebinding_action = ""
	if not display_before.is_empty(): revert_display()
	if is_instance_valid(closing):
		closing.hide()
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
	reference_hud.show_tooltip(item,anchor)

func fit_reference_tooltip(anchor: Control) -> void:
	reference_hud.fit_tooltip(anchor)

func leave_item_tip() -> void:
	tooltip_timer = .2
