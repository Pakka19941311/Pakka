class_name VarendorItemSlot
extends Button

var payload: Dictionary = {}
var owner_ui: Node
var press_position: Vector2
var pressed_payload: Dictionary = {}
var empty_caption: String = ""
var double_pressed: bool = false
var dragging: bool = false
var texture: Texture2D
static var textures: Dictionary = {}

func _ready() -> void:
	size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	custom_minimum_size = VarendorInterfacePolish.CELL
	add_theme_stylebox_override("normal",VarendorReferenceHud.frame(Color("151e24"),Color("65707780"),0,1))
	add_theme_stylebox_override("hover",VarendorReferenceHud.frame(Color("29343b"),Color("b7ad85"),0,1))
	add_theme_stylebox_override("pressed",VarendorReferenceHud.frame(Color("354148"),Color("d5bd88"),0,1))
	mouse_entered.connect(func(): owner_ui.show_item_tip(payload.get("item", {}), self))
	mouse_exited.connect(owner_ui.leave_item_tip)

func update_item(item: Dictionary) -> void:
	text = ""
	var empty_slot: String = str(payload.get("slot",""))
	if item.is_empty():
		texture = VarendorReferenceIcons.texture(VarendorReferenceIcons.kind({}, {},empty_slot),true) if payload.kind == "equipment" else null
	else:
		texture = VarendorReferenceIcons.texture(VarendorReferenceIcons.kind(item,owner_ui.data.items.get(item.id,{})))
	queue_redraw()

func _draw() -> void:
	var bounds: Rect2 = Rect2(Vector2.ONE,size-Vector2.ONE*2)
	var item: Dictionary = payload.get("item",{})
	var selected: bool = not item.is_empty() and str(owner_ui.selected_item.get("item",{}).get("uid","")) == str(item.uid)
	var scroll: bool = not item.is_empty() and owner_ui.data.scrolls.has(item.id)
	var improved: bool = scroll and owner_ui.data.scrolls[item.id].quality == "improved"
	var background: Color = Color("37446a") if improved else Color("29343b") if selected else Color("151e24") if not item.is_empty() else Color("10171c")
	draw_style_box(VarendorReferenceHud.frame(background,Color("d5bd88") if selected else Color("65707780") if not item.is_empty() else Color("5968715c"),0,1),bounds)
	draw_rect(bounds.grow(-1),Color("050a0dbb"),false,1)
	if texture != null:
		var dimensions: Vector2 = VarendorInterfacePolish.ICON
		var origin: Vector2 = (size-dimensions)*.5-Vector2(0,3 if item.is_empty() else 0)
		draw_texture_rect(texture,Rect2(origin,dimensions),false,Color(1,1,1,.29) if item.is_empty() else Color.WHITE)
	var font: Font = get_theme_default_font()
	if item.is_empty() and payload.kind == "equipment":
		draw_string(font,Vector2(2,size.y-3),empty_caption,HORIZONTAL_ALIGNMENT_CENTER,size.x-4,8,Color("839097"))
	var prefix: String = "+%d" % int(item.get("plus",0)) if int(item.get("plus",0))>0 else ("О" if str(item.get("id","")).begins_with("weapon") else "Д")+("★" if improved else "") if scroll else ""
	if not prefix.is_empty():
		draw_string_outline(font,Vector2(3,12),prefix,HORIZONTAL_ALIGNMENT_LEFT,-1,11,3,Color("0a0b0c"))
		draw_string(font,Vector2(3,12),prefix,HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color("e9d9b0"))
	if int(item.get("count",0))>1:
		var count_text: String = str(int(item.count))
		draw_string_outline(font,Vector2(2,size.y-3),count_text,HORIZONTAL_ALIGNMENT_RIGHT,size.x-6,11,3,Color.BLACK)
		draw_string(font,Vector2(2,size.y-3),count_text,HORIZONTAL_ALIGNMENT_RIGHT,size.x-6,11,Color("edf0e3"))
	if payload.kind == "equipment" and owner_ui.chosen_equipment == payload.slot:
		for x: int in range(4,int(size.x)-4,5):
			draw_line(Vector2(x,4),Vector2(mini(x+3,int(size.x)-4),4),Color("c5b688aa"))
			draw_line(Vector2(x,size.y-4),Vector2(mini(x+3,int(size.x)-4),size.y-4),Color("c5b688aa"))
	if owner_ui.can_enhance(item): draw_rect(bounds.grow(-1),Color("d5b66c"),false,2)

func _get_drag_data(_position: Vector2):
	if owner_ui.net.hero.get("dead",true) or owner_ui.net.command_busy or not owner_ui.selected_scroll.is_empty(): return null
	if pressed_payload.is_empty() or pressed_payload.get("item",{}).is_empty() or not owner_ui.reference_hud.has_item_version(pressed_payload.item): return null
	dragging = true
	var preview: Control = Control.new()
	var image: TextureRect = TextureRect.new()
	image.texture = texture
	image.size = VarendorInterfacePolish.ICON
	image.position = -VarendorInterfacePolish.ICON*.5
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.add_child(image)
	set_drag_preview(preview)
	return pressed_payload.duplicate(true)

func _can_drop_data(_position: Vector2, data) -> bool:
	if owner_ui.net.hero.get("dead",true) or not owner_ui.selected_scroll.is_empty(): return false
	if data is not Dictionary or not data.has("item") or data.item.is_empty() or owner_ui.net.command_busy:
		return false
	if not owner_ui.reference_hud.has_item_version(data.item): return false
	if payload.kind == "storage": return data.get("kind") in ["bag","storage"]
	if payload.kind == "equipment":
		if data.get("kind") in ["equipment","storage"]: return false
		var slot: String = owner_ui.data.items.get(data.item.id, {}).get("slot", "")
		return str(payload.slot) in (["ring1", "ring2"] if slot == "ring" else ["ear1", "ear2"] if slot in ["ear", "earring"] else [slot])
	return true

func _drop_data(_position: Vector2, data) -> void:
	owner_ui.drop_item(data, payload)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
		if not owner_ui.selected_scroll.is_empty():
			owner_ui.selected_scroll = {}
			owner_ui.refresh_inventory()
		accept_event()
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			press_position = event.position
			pressed_payload = payload.duplicate(true)
			double_pressed = event.double_click
			dragging = false
		elif not dragging and event.position.distance_to(press_position) < 6:
			if pressed_payload.get("item",{}).is_empty() or owner_ui.reference_hud.has_item_version(pressed_payload.item):
				owner_ui.item_clicked(pressed_payload,double_pressed)
			else: owner_ui.notice("stale-item")
