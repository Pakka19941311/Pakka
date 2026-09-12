extends RefCounted

var app: Node
var box: VBoxContainer
var recipe: Dictionary = {}
var inputs: Array[Dictionary] = [{},{},{},{}]
var sockets: Array = []
var details: Array[Label] = []
var selected: int = 0
var confirm: Button
var status: Label
var palette: GridContainer
var reserve_box: VBoxContainer
var local_busy: bool = false
var signature: String = ""

func active() -> bool:
	return is_instance_valid(box) and is_instance_valid(app.active_dialog) and app.active_dialog.is_ancestor_of(box)

func open() -> void:
	if active(): app.close_dialog(); return
	if app.net.hero.is_empty(): return
	app.selected_scroll = {}; app.refresh_inventory()
	inputs = [{},{},{},{}]; sockets.clear(); details.clear(); selected = 0; signature = ""
	box = app.dialog("Крафт колец [J]",Vector2i(580,480))
	box.add_child(app.wrapped_label("Выберите рецепт, затем заполните четыре ячейки. Нажмите ячейку и предмет в сумке ниже или перетащите предмет. ПКМ — убрать из ячейки.",12))
	var choice: OptionButton = OptionButton.new(); choice.name = "CraftRecipe"; box.add_child(choice)
	for row: Dictionary in app.net.craft_recipes:
		choice.add_item(str(app.data.items.get(row.resultId,{}).get("name",row.resultId)))
	if app.net.craft_recipes.is_empty():
		box.add_child(app.wrapped_label("Рецепты пока недоступны. Дождитесь подключения к миру.",13)); return
	var slots_row: HBoxContainer = HBoxContainer.new(); slots_row.add_theme_constant_override("separation",12); box.add_child(slots_row)
	for index: int in range(4):
		var column: VBoxContainer = VBoxContainer.new(); column.size_flags_horizontal = Control.SIZE_EXPAND_FILL; slots_row.add_child(column)
		column.add_child(app.label("Основа" if index == 0 else "Материал %d" % index,12))
		var socket = preload("res://scripts/craft_slot.gd").new()
		socket.name = "CraftInput%d" % index; socket.owner_ui = app; socket.crafting = self; socket.index = index
		socket.payload = {"kind":"craft_input","item":{}}; column.add_child(socket); sockets.append(socket)
		var detail: Label = app.wrapped_label("",11); detail.custom_minimum_size = Vector2(100,48); column.add_child(detail); details.append(detail)
	status = app.wrapped_label("",12); status.name = "CraftStatus"; box.add_child(status)
	confirm = app.button("Создать",submit); confirm.name = "CraftConfirm"; box.add_child(confirm)
	box.add_child(app.wrapped_label("Крафт доступен вне боя, стоя на земле. При неудаче основа уничтожается. Материалы и золото расходуются при любом результате. Назначение в ячейку и закрытие окна ничего не расходуют.",12))
	box.add_child(app.label("Предметы в сумке",12))
	palette = GridContainer.new(); palette.columns = 10; palette.name = "CraftBag"; box.add_child(palette)
	reserve_box = VBoxContainer.new(); reserve_box.name = "MigrationReserve"; box.add_child(reserve_box)
	choice.item_selected.connect(func(index: int): choose_recipe(app.net.craft_recipes[index]))
	choose_recipe(app.net.craft_recipes[0])
	refresh_palette(); refresh_reserve()

func choose_recipe(value: Dictionary) -> void:
	recipe = value.duplicate(true)
	for index: int in range(4):
		if not inputs[index].is_empty() and str(inputs[index].id) != expected(index): inputs[index] = {}
	selected = 0
	refresh()

func expected(index: int) -> String:
	if recipe.is_empty(): return ""
	return str(recipe.targetId) if index == 0 else str(recipe.materials[index-1].id)

func amount(index: int) -> int:
	return 1 if index == 0 else int(recipe.materials[index-1].count)

func can_accept(index: int, item: Dictionary) -> bool:
	if not active() or local_busy or app.net.command_busy or not app.net.pending.is_empty() or item.is_empty(): return false
	if str(item.get("id","")) != expected(index) or not app.reference_hud.has_item_version(item): return false
	if not app.net.hero.inventory.any(func(i: Dictionary): return i.uid == item.uid): return false
	for other: int in range(4):
		if other != index and inputs[other].get("uid","") == item.uid: return false
	return true

func choose_slot(index: int) -> void:
	if local_busy: return
	selected = index; refresh()

func choose_item(item: Dictionary) -> void:
	if not can_accept(selected,item):
		app.notice("Для выбранной ячейки нужен: "+str(app.data.items.get(expected(selected),{}).get("name",expected(selected))))
		return
	assign(selected,item)
	selected = mini(3,selected+1); refresh()

func assign(index: int, item: Dictionary) -> void:
	if local_busy or (not item.is_empty() and not can_accept(index,item)): return
	inputs[index] = item.duplicate(true); refresh()

func ready() -> bool:
	if recipe.is_empty() or local_busy or not app.net.connected or app.net.command_busy or not app.net.pending.is_empty(): return false
	if bool(app.net.hero.get("dead",true)) or int(app.net.hero.gold) < int(recipe.fee): return false
	for index: int in range(4):
		if inputs[index].is_empty() or inputs[index].id != expected(index) or int(inputs[index].count) < amount(index): return false
		if not app.reference_hud.has_item_version(inputs[index]): return false
	return true

func refresh() -> void:
	if not active() or recipe.is_empty(): return
	for index: int in range(4):
		var item: Dictionary = inputs[index]
		sockets[index].payload.item = item; sockets[index].update_item(item)
		sockets[index].modulate = Color("fff0b5") if index == selected else Color.WHITE
		var title: String = str(app.data.items.get(expected(index),{}).get("name",expected(index)))
		details[index].text = title+"\n%d / %d" % [int(item.get("count",0)),amount(index)]
		details[index].modulate = Color("eca0a0") if not item.is_empty() and (not app.reference_hud.has_item_version(item) or int(item.count) < amount(index)) else Color.WHITE
	var chance: int = roundi(float(recipe.chance)*100)
	status.text = "Шанс успеха: %d%% · Стоимость: %d золота · У вас: %d" % [chance,int(recipe.fee),int(app.net.hero.gold)]
	confirm.text = "Создать · %d%% · %d золота" % [chance,int(recipe.fee)]
	confirm.disabled = not ready()

func refresh_palette() -> void:
	if not active() or not is_instance_valid(palette): return
	signature = JSON.stringify([app.net.hero.inventory,app.net.hero.get("migrationReserve",[])])
	for child: Node in palette.get_children(): palette.remove_child(child); child.queue_free()
	for item: Dictionary in app.net.hero.inventory:
		if not app.net.craft_recipes.any(func(r: Dictionary): return r.targetId == item.id or r.materials.any(func(m: Dictionary): return m.id == item.id)): continue
		var slot: VarendorItemSlot = VarendorItemSlot.new(); slot.owner_ui = app
		slot.payload = {"kind":"craft_source","item":item.duplicate(true)}; palette.add_child(slot); slot.update_item(item)

func refresh_reserve() -> void:
	if not active() or not is_instance_valid(reserve_box): return
	for child: Node in reserve_box.get_children(): reserve_box.remove_child(child); child.queue_free()
	var reserve: Array = app.net.hero.get("migrationReserve",[])
	if reserve.is_empty(): return
	reserve_box.add_child(app.wrapped_label("Сохранённые при обновлении вещи: %d. Освободите место в сумке и заберите их. Срок хранения не ограничен." % reserve.size(),12))
	for item: Dictionary in reserve:
		var claim: Button = app.button("Забрать: "+app.item_name(item),func():
			if app.net.command_busy or local_busy: return
			await app.net.command({"type":"claimMigration","item":item.duplicate(true)})
			refresh_reserve(); refresh_palette(); refresh())
		claim.disabled = app.net.hero.inventory.size() >= 42 or app.net.command_busy; reserve_box.add_child(claim)

func poll() -> void:
	if not active() or recipe.is_empty(): return
	if not app.net.connected or app.net.hero.get("dead",true): app.close_dialog(); return
	var current: String = JSON.stringify([app.net.hero.inventory,app.net.hero.get("migrationReserve",[])])
	if current != signature:
		refresh_palette(); refresh_reserve()
	refresh()

func submit() -> void:
	if not ready(): return
	var command: Dictionary = {"type":"craftRing","recipeId":recipe.id,"target":inputs[0].duplicate(true),"materials":[inputs[1].duplicate(true),inputs[2].duplicate(true),inputs[3].duplicate(true)]}
	local_busy = true; confirm.disabled = true
	var response: Array = []
	var capture: Callable = func(receipt: Dictionary): response.append(receipt)
	app.net.receipt_received.connect(capture)
	await app.net.command(command)
	if app.net.receipt_received.is_connected(capture): app.net.receipt_received.disconnect(capture)
	local_busy = false
	if not active(): return
	if not response.is_empty() and bool(response.back().get("ok",false)): inputs = [{},{},{},{}]
	refresh_palette(); refresh_reserve(); refresh()
