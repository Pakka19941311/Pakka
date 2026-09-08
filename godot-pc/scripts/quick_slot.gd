class_name VarendorQuickSlot
extends Button

var artwork: Texture2D
var symbol: String = ""
var key_label: String = ""
var remaining: float = 0.0
var cooldown: float = 1.0
var quantity: int = 0
var usable: bool = true

func _draw() -> void:
	var icon_font: Font = get_theme_default_font()
	if not symbol.is_empty():
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
