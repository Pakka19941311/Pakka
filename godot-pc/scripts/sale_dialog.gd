extends RefCounted

static func amount(text: String, maximum: int) -> int:
	var value: String = text.strip_edges()
	if not value.is_valid_int(): return 0
	var number: int = int(value)
	return number if number >= 1 and number <= maximum else 0

static func open(app: Node, item: Dictionary, return_to: Callable = Callable()) -> void:
	var maximum: int = int(item.count)
	var unit_price: int = int(floorf(float(app.data.items[item.id].get("value",0))*.48))
	var box: VBoxContainer = app.dialog("Продать предмет",Vector2i(500,280))
	var header: HBoxContainer = HBoxContainer.new(); box.add_child(header)
	var icon: TextureRect = TextureRect.new(); icon.texture = app.book_ui.item_icon(item)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = VarendorInterfacePolish.CELL; header.add_child(icon)
	header.add_child(app.wrapped_label(app.item_name(item),15))
	box.add_child(app.label("Доступно: %d · Цена единицы: %d золота" % [maximum,unit_price],13))
	var row: HBoxContainer = HBoxContainer.new(); box.add_child(row)
	var field: LineEdit = LineEdit.new(); field.name = "SaleQuantity"; field.text = "1"
	field.custom_minimum_size.x = 100; field.editable = maximum > 1
	var minus: Button = app.button("−",func(): field.text = str(maxi(1,int(field.text)-1)); field.text_changed.emit(field.text))
	row.add_child(minus); row.add_child(field)
	var plus: Button = app.button("+",func(): field.text = str(clampi(int(field.text)+1,1,maximum)); field.text_changed.emit(field.text))
	row.add_child(plus)
	var all: Button = app.button("Все",func(): field.text = str(maximum); field.text_changed.emit(field.text)); all.name = "SaleAll"; row.add_child(all)
	minus.disabled = maximum == 1; plus.disabled = maximum == 1; all.disabled = maximum == 1
	var error: Label = app.wrapped_label("",12); error.name = "SaleValidation"; box.add_child(error)
	var confirm: Button = app.button("",func(): pass); confirm.name = "SaleConfirm"; box.add_child(confirm)
	var refresh: Callable = func(_text: String = ""):
		var quantity: int = amount(field.text,maximum)
		confirm.disabled = quantity == 0 or app.net.command_busy
		error.text = "Введите целое количество от 1 до %d" % maximum if quantity == 0 else ""
		confirm.text = "Продать %d за %d золота" % [quantity,quantity*unit_price] if quantity > 0 else "Продать"
	field.text_changed.connect(refresh)
	confirm.pressed.connect(func():
		var quantity: int = amount(field.text,maximum)
		if quantity == 0 or app.net.command_busy or not is_instance_valid(box): return
		if not app.reference_hud.has_item_version(item): error.text = "Предмет уже изменился. Откройте продажу заново."; confirm.disabled = true; return
		confirm.disabled = true
		await app.net.command({"type":"sell","item":item.duplicate(true),"quantity":quantity})
		if not is_instance_valid(box): return
		var remainder: int = 0
		for current: Dictionary in app.net.hero.inventory:
			if current.uid == item.uid: remainder = int(current.count)
		if remainder != maximum-quantity: refresh.call(); return
		app.close_dialog()
		if return_to.is_valid(): return_to.call())
	box.add_child(app.button("Отмена",app.close_dialog))
	field.text_submitted.connect(func(_text: String): if not confirm.disabled: confirm.pressed.emit())
	refresh.call()
