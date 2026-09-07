class_name VarendorItemSlot
extends Button

var payload: Dictionary = {}
var owner_ui: Node
var press_position: Vector2
var double_pressed: bool = false
var dragging: bool = false

func _get_drag_data(_position: Vector2):
	if payload.is_empty() or payload.get("item", {}).is_empty():
		return null
	dragging = true
	var preview: Label = Label.new()
	preview.text = text
	set_drag_preview(preview)
	return payload.duplicate(true)

func _can_drop_data(_position: Vector2, data) -> bool:
	return data is Dictionary and data.has("item") and not data.item.is_empty()

func _drop_data(_position: Vector2, data) -> void:
	owner_ui.drop_item(data, payload)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			press_position = event.position
			double_pressed = event.double_click
			dragging = false
		elif not dragging and event.position.distance_to(press_position) < 6:
			owner_ui.item_clicked(payload, double_pressed)
