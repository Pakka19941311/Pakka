extends Control
## Draw directly: source texture dimensions must never become a Control minimum.
var artwork: Texture2D
var dimensions: Vector2
var quantity: int
var glyph: String
static func make(source: Control, texture: Texture2D, count: int, symbol: String = "") -> Control:
	var preview = load("res://scripts/drag_preview.gd").new()
	preview.name = "ItemDragPreview"
	preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	preview.artwork = texture
	preview.dimensions = VarendorInterfacePolish.ICON * source.get_global_transform().get_scale().abs()
	preview.quantity = count; preview.glyph = symbol
	return preview
func _draw() -> void:
	if artwork != null:
		var natural: Vector2 = artwork.get_size()
		var fitted: Vector2 = natural * minf(dimensions.x / natural.x, dimensions.y / natural.y)
		draw_texture_rect(artwork,Rect2(-fitted*.5,fitted),false)
	var font: Font = get_theme_default_font()
	var caption: String = str(quantity) if quantity > 1 else glyph if artwork == null else ""
	if not caption.is_empty():
		var point: Vector2 = Vector2(-dimensions.x*.5,dimensions.y*.5)
		draw_string_outline(font,point,caption,HORIZONTAL_ALIGNMENT_RIGHT,dimensions.x,11,3,Color.BLACK)
		draw_string(font,point,caption,HORIZONTAL_ALIGNMENT_RIGHT,dimensions.x,11,Color.WHITE)
