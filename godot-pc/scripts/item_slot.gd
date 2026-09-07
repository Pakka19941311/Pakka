class_name VarendorItemSlot
extends Button

var payload: Dictionary = {}
var owner_ui: Node
var press_position: Vector2
var double_pressed: bool = false
var dragging: bool = false
var texture: Texture2D
static var textures: Dictionary = {}

func update_item(item: Dictionary) -> void:
	text = ""
	texture = null
	if not item.is_empty():
		var id: String = str(item.id)
		if not textures.has(id):
			var path: String = "res://assets/icons/" + id + ".svg"
			textures[id] = load(path if ResourceLoader.exists(path) else "res://assets/icons/unknown.svg")
		texture = textures[id]
	queue_redraw()

func _draw() -> void:
	var bounds: Rect2 = Rect2(Vector2(2, 2), size - Vector2(4, 4))
	draw_style_box(owner_ui.panel_style(Color("1c2528"), Color("747461") if payload.kind == "equipment" else Color("575d52")), bounds)
	draw_line(Vector2(4, 4), Vector2(size.x - 4, 4), Color("999d87"), 1)
	if texture != null:
		draw_texture_rect(texture, Rect2(Vector2(5, 5), size - Vector2(10, 10)), false)
	var font: Font = get_theme_default_font()
	var item: Dictionary = payload.get("item", {})
	if item.is_empty() and payload.kind == "equipment":
		var titles: Dictionary = {"head":"Шлем","neck":"Шея","chest":"Доспех","gloves":"Руки","weapon":"Оружие","offhand":"Щит","ring1":"Кольцо","ring2":"Кольцо","ear1":"Серьга","ear2":"Серьга","belt":"Пояс","boots":"Обувь"}
		var title: String = titles.get(payload.slot, "")
		draw_string(font, Vector2(3, size.y / 2 + 4), title, HORIZONTAL_ALIGNMENT_CENTER, size.x - 6, 10, Color("737d78"))
	if int(item.get("plus", 0)) > 0:
		draw_string_outline(font, Vector2(5, 16), "+" + str(int(item.plus)), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 5, Color("101719"))
		draw_string(font, Vector2(5, 16), "+" + str(int(item.plus)), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("edd09a"))
	if int(item.get("count", 0)) > 1:
		var count_text: String = str(int(item.count))
		var position_value: Vector2 = Vector2(size.x - font.get_string_size(count_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x - 4, size.y - 4)
		draw_string_outline(font, position_value, count_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 5, Color("101719"))
		draw_string(font, position_value, count_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("f0e8d1"))
	if owner_ui.can_enhance(item):
		draw_rect(bounds.grow(-1), Color("d1b769"), false, 2)

func _get_drag_data(_position: Vector2):
	if payload.is_empty() or payload.get("item", {}).is_empty():
		return null
	dragging = true
	var preview: TextureRect = TextureRect.new()
	preview.texture = texture
	preview.custom_minimum_size = Vector2(58, 58)
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	set_drag_preview(preview)
	return payload.duplicate(true)

func _can_drop_data(_position: Vector2, data) -> bool:
	if data is not Dictionary or not data.has("item") or data.item.is_empty() or owner_ui.net.command_busy:
		return false
	if payload.kind == "equipment":
		var slot: String = owner_ui.data.items.get(data.item.id, {}).get("slot", "")
		return str(payload.slot) in (["ring1", "ring2"] if slot == "ring" else ["ear1", "ear2"] if slot in ["ear", "earring"] else [slot])
	return true

func _drop_data(_position: Vector2, data) -> void:
	owner_ui.drop_item(data, payload)

func _make_custom_tooltip(for_text: String) -> Object:
	var panel: PanelContainer = PanelContainer.new()
	panel.add_theme_stylebox_override("panel", owner_ui.panel_style(Color("12191d"), Color("aa925c")))
	var info: RichTextLabel = RichTextLabel.new()
	info.custom_minimum_size = Vector2(340, minf(520, for_text.split("\n").size() * 21 + 12))
	info.text = for_text
	info.add_theme_font_size_override("normal_font_size", 14)
	info.scroll_active = true
	panel.add_child(info)
	return panel

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			press_position = event.position
			double_pressed = event.double_click
			dragging = false
		elif not dragging and event.position.distance_to(press_position) < 6:
			owner_ui.item_clicked(payload, double_pressed)
