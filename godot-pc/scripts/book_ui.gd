class_name VarendorBookUI
extends RefCounted
const DialogLease = preload("res://scripts/dialog_lease.gd")

var app: Node
var merchant_name: String = "Торговец Эдрик"
var targeting_book: String = ""
var last_book_press: int = 0
var effect_signature: String = ""
var effect_cells: Dictionary = {}
var loot_panel: PanelContainer
var loot_generation: int = 0
static var icons: Dictionary = {}

static func icon(id: String, effect: bool = false) -> Texture2D:
	var key: String = id + (":effect" if effect else ":book")
	if icons.has(key): return icons[key]
	if id == "haste":
		icons[key] = load("res://generated/book-icons/haste.png")
		return icons[key]
	var parts: PackedStringArray = id.split("_")
	if parts.size() != 3 or parts[0] != "book": return null
	var texture: AtlasTexture = AtlasTexture.new()
	texture.atlas = load("res://generated/book-icons/"+parts[1]+".png")
	texture.region = Rect2((int(parts[2])/10-1)*362,362 if effect else 0,362,362)
	texture.filter_clip = true
	icons[key] = texture
	return texture

func owns(id: String) -> bool:
	for item: Dictionary in app.net.hero.get("inventory",[]):
		if str(item.id) == id: return true
	return false

func item_icon(item: Dictionary) -> Texture2D:
	var id: String = str(item.get("id",""))
	if id == "potion_large": return preload("res://assets/icons/potion_large.svg")
	if id.begins_with("book_") or id == "haste": return icon(id)
	if app.data.get("itemIcons",{}).has(id):
		if not icons.has(id):
			var cell: Dictionary = app.data.itemIcons[id]
			var atlas: AtlasTexture = AtlasTexture.new()
			atlas.atlas = load("res://generated/item-icons/"+str(cell.file))
			var cell_size: Vector2 = atlas.atlas.get_size()/4.0
			atlas.region = Rect2(Vector2(cell.column,cell.row)*cell_size,cell_size)
			atlas.filter_clip = true
			icons[id] = atlas
		return icons[id]
	return VarendorReferenceIcons.texture(VarendorReferenceIcons.kind(item,app.data.items.get(id,{})))

func tooltip(id: String) -> String:
	var b: Dictionary = app.data.books.get(id,{})
	if b.is_empty(): return ""
	return "%s · ур. %d · %s\n%s\nРесурс: %d · Перезарядка: %d с\nКнига остаётся в сумке после применения." % [b.name,int(b.level),app.data.classes[b.classId].name,b.description,int(b.cost),int(b.cd)]

func activate(id: String) -> void:
	var b: Dictionary = app.data.books.get(id,{})
	if b.is_empty(): return
	if not owns(id): app.notice("Книга должна находиться в сумке"); return
	if int(app.net.hero.level) < int(b.level): app.notice("Нужен уровень %d" % int(b.level)); return
	if str(app.net.hero.classId) != str(b.classId): app.notice("Книга другого класса"); return
	if b.mode == "ally":
		if targeting_book == id and Time.get_ticks_msec()-last_book_press < 450:
			targeting_book = ""; cast(id,str(app.net.hero.id)); return
		targeting_book = id; last_book_press = Time.get_ticks_msec()
		app.notice("Выберите союзника. Двойное нажатие книги — на себя. Esc — отмена."); return
	if b.mode == "area":
		targeting_book = id; app.notice("Укажите область на земле. Esc — отмена."); return
	if b.mode == "enemy":
		if app.world.target_id.is_empty() or app.world.target_id.begins_with("npc:"):
			targeting_book = id; app.notice("Выберите противника для книги"); return
		cast(id,app.world.target_id); return
	cast(id)

func cast(id: String, target: String = "", point: Variant = null) -> void:
	if app.data.books[id].get("mode","") in ["enemy","area"]: app.player_input.stop_autorun()
	var command: Dictionary = {"type":"castBook","bookId":id}
	if not target.is_empty(): command.targetId = target
	if point is Vector2: command.point = {"x":point.x,"z":point.y}
	app.net.command(command)

func click(screen: Vector2) -> bool:
	if targeting_book.is_empty(): return false
	var id: String = targeting_book
	var b: Dictionary = app.data.books[id]
	if b.mode == "ally":
		var best: String = ""
		var closest: float = 48
		for hero: Dictionary in app.world.current_snapshot.get("heroes",[]):
			var pos: Vector3 = app.world.point(hero.x,hero.z,float(hero.get("yOffset",0)))+Vector3.UP
			if app.world.camera.is_position_behind(pos): continue
			var distance: float = app.world.camera.unproject_position(pos).distance_to(screen)
			if distance < closest: best = str(hero.id); closest = distance
		if best.is_empty(): app.notice("Нажмите на союзника либо дважды на книгу для себя"); return true
		targeting_book = ""; cast(id,best); return true
	if b.mode == "enemy":
		var selected: String = app.world.pick_entity(screen)
		if selected.is_empty() or selected.begins_with("npc:"): return true
		app.world.target_id = selected; targeting_book = ""; cast(id,selected); return true
	var point: Variant = app.world.targeting.ground(screen)
	if point != null: targeting_book = ""; cast(id,"",point)
	return true

func catalogue(shop: bool = false, class_id: String = "") -> void:
	if class_id.is_empty(): class_id = str(app.net.hero.get("classId","knight"))
	var body: VBoxContainer = app.dialog(("Книготорговец · " if shop else "Мои книги · ")+str(app.data.classes[class_id].name),Vector2i(610,490))
	var lease: Dictionary = DialogLease.capture(app,body)
	app.active_dialog.set_meta("nonmodal",not shop)
	body.add_child(app.label("Книги умений для выбранного класса.\nПеретащите купленную книгу из сумки на панель.",12))
	for level: int in [10,20,30,40,50,60]:
		var id: String = "book_%s_%d" % [class_id,level]
		var b: Dictionary = app.data.books[id]
		var row: HBoxContainer = HBoxContainer.new(); row.add_theme_constant_override("separation",12); body.add_child(row)
		var cell: VarendorQuickSlot = VarendorQuickSlot.new(); cell.owner_ui = app; cell.custom_action = id if owns(id) else ""; cell.artwork = icon(id); cell.usable = owns(id) or shop; cell.tooltip_text = tooltip(id); row.add_child(cell)
		var text: Label = app.label("%d+  %s\n%s" % [level,b.name,b.description],12); text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; text.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(text)
		if shop and int(b.price)>0:
			var buy: Button = app.button("%d золота" % int(b.price),func():
				if not DialogLease.current(app,lease): return
				await app.net.command({"type":"buy","itemId":id})
				if DialogLease.current(app,lease): catalogue(true,class_id))
			buy.disabled = owns(id) or class_id != str(app.net.hero.classId); row.add_child(buy)
		elif not owns(id): row.add_child(app.label("Задание" if level>=50 else "Не куплена",11))
	if shop: body.add_child(app.button("Все классы",shop_classes))

func shop_classes() -> void:
	var body: VBoxContainer = app.dialog(merchant_name+" · Книги умений",Vector2i(410,350))
	if merchant_name == "Торговец Эдрик": body.add_child(app.button("Продать добычу",func(): app.polish.shop("books",merchant_name,1)))
	body.add_child(app.label("Выберите класс",16))
	for id: String in ["knight","ranger","mage","necro","assassin"]:
		body.add_child(app.button(str(app.data.classes[id].name),func(): catalogue(true,id)))

func quest_menu() -> void:
	var body: VBoxContainer = app.dialog("Арден · Книги высших умений",Vector2i(540,330))
	var lease: Dictionary = DialogLease.capture(app,body)
	body.add_child(app.wrapped_label("Новые испытания класса выдаёт Северин в Гринфолле. Прежнее право на книгу сохранено; готовую награду можно забрать и здесь.",13))
	for quest: Dictionary in app.net.progression_quests:
		if str(quest.giverId) != "npc:books": continue
		var state: String = str(quest.status)
		body.add_child(app.wrapped_label("%d+ · %s" % [int(quest.level),str(quest.title)],14))
		if state in ["ready","pending"]:
			var level: int = int(quest.level)
			body.add_child(app.button("Забрать сохранённую награду",func():
				if not DialogLease.current(app,lease): return
				await app.net.command({"type":"bookQuest","level":level})
				if DialogLease.current(app,lease): quest_menu()))
		else: body.add_child(app.wrapped_label("Награда получена" if state == "claimed" else "Подробности испытания — у Северина",12))

static func buff_time(milliseconds: float) -> String:
	var seconds: int = ceili(milliseconds / 1000.0)
	if seconds <= 0: return ""
	return "%d:%02d" % [seconds / 60, seconds % 60] if seconds > 60 else "%d с" % seconds

func refresh_effects(hero: Dictionary, row: HBoxContainer) -> void:
	var now: float = float(app.world.current_snapshot.get("time",app.net.last_time))
	var effects: Array = []
	for effect: Dictionary in hero.get("bookEffects",[]):
		if float(effect.expiresAt)>now: effects.append(effect)
	effects.sort_custom(func(a: Dictionary,b: Dictionary): return float(a.appliedAt)<float(b.appliedAt))
	# The first applied effect is nearest the map; haste always occupies that place.
	effects.reverse()
	if float(hero.get("buffs",{}).get("haste",0))>now: effects.append({"id":"haste","expiresAt":hero.buffs.haste})
	for legacy: String in ["guard","vanish"]:
		if float(hero.get("buffs",{}).get(legacy,0))>now: effects.append({"id":legacy,"expiresAt":hero.buffs[legacy]})
	var ids: Array = effects.map(func(e: Dictionary): return str(e.id))
	var signature: String = ",".join(ids)
	if signature != effect_signature:
		effect_signature = signature; effect_cells.clear()
		for child: Node in row.get_children(): row.remove_child(child); child.queue_free()
		for effect: Dictionary in effects:
			var cell: Control = Control.new(); cell.custom_minimum_size = Vector2(38,49); row.add_child(cell)
			var image: TextureRect = TextureRect.new(); image.texture = icon({"guard":"book_knight_20","vanish":"book_assassin_20"}.get(str(effect.id),str(effect.id)),true); image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; image.size = Vector2(36,36); cell.add_child(image)
			cell.tooltip_text = "Стремительность · бег +50%, атака +15%" if effect.id == "haste" else tooltip(effect.id)
			image.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var timer: Label = app.label("",10); timer.position = Vector2(0,35); timer.size = Vector2(36,14); timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; timer.mouse_filter = Control.MOUSE_FILTER_IGNORE; cell.add_child(timer)
			effect_cells[effect.id] = timer
	for effect: Dictionary in effects:
		if effect_cells.has(effect.id):
			var remaining: String = buff_time(float(effect.expiresAt)-now)
			effect_cells[effect.id].text = remaining
			var caption: String = {"haste":"Стремительность · бег +50%, атака +15%","guard":"Защита","vanish":"Невидимость"}.get(str(effect.id),"")
			if caption.is_empty(): caption = tooltip(effect.id)
			effect_cells[effect.id].get_parent().tooltip_text = caption+"\nОсталось: "+remaining

func clear_session() -> void:
	targeting_book = ""
	last_book_press = 0
	loot_generation += 1
	if is_instance_valid(loot_panel):
		loot_panel.hide()
		loot_panel.queue_free()
	loot_panel = null

func position_loot() -> void:
	if not is_instance_valid(loot_panel): return
	var quick: Rect2 = app.quick_panel_node.get_global_rect()
	loot_panel.global_position = Vector2(app.ui.get_global_rect().get_center().x - loot_panel.size.x*.5,quick.position.y-loot_panel.size.y-6)

func show_loot(event: Dictionary) -> void:
	if is_instance_valid(loot_panel): loot_panel.queue_free()
	loot_generation += 1
	var generation: int = loot_generation
	loot_panel = PanelContainer.new()
	loot_panel.add_theme_stylebox_override("panel",app.panel_style(Color("151b20ed")))
	app.ui.add_child(loot_panel)
	loot_panel.resized.connect(position_loot)
	if not app.quick_panel_node.item_rect_changed.is_connected(position_loot): app.quick_panel_node.item_rect_changed.connect(position_loot)
	if not app.ui.resized.is_connected(position_loot): app.ui.resized.connect(position_loot)
	var grid: GridContainer = GridContainer.new(); grid.columns = 6
	grid.add_theme_constant_override("h_separation",4); grid.add_theme_constant_override("v_separation",4); loot_panel.add_child(grid)
	var counts: Dictionary = {"silver":int(event.get("gold",0))}
	for id: String in event.get("items",[]): counts[id] = int(counts.get(id,0))+1
	for id: String in counts:
		var cell: Control = Control.new(); cell.custom_minimum_size = Vector2(42,50); grid.add_child(cell)
		var image: TextureRect = TextureRect.new(); image.texture = item_icon({"id":id}); image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; image.size = Vector2(36,36); image.position.x = 3; cell.add_child(image)
		image.tooltip_text = "Серебро" if id == "silver" else str(app.data.items[id].name)
		var number: Label = app.label("+%d" % int(counts[id]),10); number.position.y = 36; number.size = Vector2(42,14); number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; cell.add_child(number)
	await app.get_tree().create_timer(5).timeout
	if generation == loot_generation and is_instance_valid(loot_panel): loot_panel.queue_free()
