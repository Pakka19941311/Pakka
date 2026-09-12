extends VarendorItemSlot

var crafting: RefCounted
var index: int = 0

func _get_drag_data(_position: Vector2):
	return null

func _can_drop_data(_position: Vector2, data) -> bool:
	return data is Dictionary and data.get("kind","") in ["bag","craft_source"] and crafting.can_accept(index,data.get("item",{}))

func _drop_data(_position: Vector2, data) -> void:
	crafting.assign(index,data.item)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT: crafting.choose_slot(index)
		elif event.button_index == MOUSE_BUTTON_RIGHT: crafting.assign(index,{})
		accept_event()
