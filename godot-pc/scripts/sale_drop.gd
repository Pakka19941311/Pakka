extends PanelContainer
var app: Node
var reopen: Callable
func _ready() -> void:
	name = "SaleDrop"
	custom_minimum_size.y = 48
	mouse_filter = Control.MOUSE_FILTER_STOP
	var caption: Label = app.label("Перетащите сюда предмет для выбора количества",12)
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(caption)
	style(false)
func style(active: bool) -> void:
	add_theme_stylebox_override("panel",VarendorReferenceHud.frame(Color("243a32") if active else Color("151e24"),Color("d5bd88") if active else Color("65707780"),0,1))
func _notification(what: int) -> void:
	if what == NOTIFICATION_DRAG_BEGIN or what == NOTIFICATION_DRAG_END:
		if is_inside_tree(): style(what == NOTIFICATION_DRAG_BEGIN and _can_drop_data(Vector2.ZERO,get_viewport().gui_get_drag_data()))
func _can_drop_data(_point: Vector2, data) -> bool:
	return data is Dictionary and data.get("kind","") == "bag" and not data.get("item",{}).is_empty() and not app.net.command_busy and not app.net.hero.get("dead",true) and not app.data.books.has(data.item.id) and app.reference_hud.has_item_version(data.item)
func _drop_data(_point: Vector2, data) -> void:
	app.selected_item = data.duplicate(true)
	app.sell_selected.call_deferred(reopen)
