class_name VarendorQuickSlot
extends Button

var artwork: Texture2D
var symbol: String = ""
var key_label: String = ""
var remaining: float = 0.0
var cooldown: float = 1.0
var quantity: int = 0
var usable: bool = true
var owner_ui: Node
var slot_index: int = -1
var custom_action: String = ""
var owns_drag: bool = false

func _ready() -> void:
	focus_mode = Control.FOCUS_NONE
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	custom_minimum_size = VarendorInterfacePolish.CELL

func _get_drag_data(_position: Vector2):
	if owner_ui == null: return null
	var action: String = str(owner_ui.quick[slot_index].action) if slot_index >= 0 else custom_action
	if action.is_empty(): return null
	var preview: Control = Control.new()
	var icon_view: TextureRect = TextureRect.new()
	icon_view.texture = artwork
	icon_view.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon_view.size = VarendorInterfacePolish.ICON
	icon_view.position = -VarendorInterfacePolish.ICON*.5
	preview.add_child(icon_view)
	if artwork == null:
		var glyph: Label = Label.new()
		glyph.text = symbol; glyph.position = Vector2(-12,-14)
		glyph.add_theme_font_size_override("font_size",22); preview.add_child(glyph)
	set_drag_preview(preview)
	owns_drag = true
	owner_ui.polish.dragging_quick = true
	owner_ui.polish.drag_cancelled = false
	return {"kind":"quick" if slot_index >= 0 else "catalog","index":slot_index,"action":action}

func _can_drop_data(_position: Vector2, data) -> bool:
	return owner_ui != null and slot_index >= 0 and data is Dictionary and not owner_ui.polish.quick_action(data).is_empty() and str(data.get("kind","")) in ["quick","catalog","bag","equipment"]

func _drop_data(_position: Vector2, data) -> void:
	owner_ui.polish.drop_quick(data,slot_index)

func _notification(what: int) -> void:
	if what == NOTIFICATION_DRAG_END and owns_drag:
		owns_drag = false
		owner_ui.polish.finish_quick_drag(slot_index,is_drag_successful())

func _draw() -> void:
	var icon_font: Font = get_theme_default_font()
	if artwork != null:
		draw_texture_rect(artwork,Rect2((size-VarendorInterfacePolish.ICON)*.5,VarendorInterfacePolish.ICON),false,Color.WHITE if usable else Color("77746c"))
	elif not symbol.is_empty():
		draw_string(icon_font,Vector2(0,size.y*.5+8),symbol,HORIZONTAL_ALIGNMENT_CENTER,size.x,22,Color("d8b56d") if usable else Color("77746c"))
	if remaining > 0:
		var height: float = (size.y - 4) * clampf(remaining / maxf(.1, cooldown), 0, 1)
		draw_rect(Rect2(Vector2(2, size.y - height - 2), Vector2(size.x - 4, height)), Color(0.03, .05, .07, .8))
	var font: Font = get_theme_default_font()
	draw_string_outline(font, Vector2(3, 11), key_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, 4, Color("101618"))
	draw_string(font, Vector2(3, 11), key_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color("d2c6a6"))
	var caption: String = "%.1f" % remaining if remaining > 0 else str(quantity) if quantity > 0 else ""
	draw_string_outline(font, Vector2(3, size.y - 3), caption, HORIZONTAL_ALIGNMENT_RIGHT, size.x - 9, 13, 4, Color("101618"))
	draw_string(font, Vector2(3, size.y - 3), caption, HORIZONTAL_ALIGNMENT_RIGHT, size.x - 9, 13, Color("f1dfb9"))
