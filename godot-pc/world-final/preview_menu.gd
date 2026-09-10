extends Node
## A temporary exploration entrance in the existing project. No server/save I/O.
const DESTINATIONS: Array=[
	["Астерхолд",-490,356],["Гринфолл",-100,243],
	["Живой лес",-671.5762,-33.5799],["Гнилая чаща",-181,-433],
	["Снежные горы — подъём",-414,-143],["Шахта — вход",35,-420],
	["Озеро и посёлок",420,40],["Пещера — вход",245,-280],
	["Восточное святилище",620,-42],["Вулкан — подъём",561,-3],
	["Кратер",545,-490],["Южные руины",10,425],
	["Болото",-575,559],["Некрополь",510,365]]
var space: Node3D
var screen: Control
var panel: PanelContainer
var choices: VBoxContainer
var hud: HBoxContainer
var location: OptionButton
var loading: Label
var busy: bool=false
var qa_output: String=""
var qa_space: String="surface"

func _ready() -> void:
	var canvas: CanvasLayer=CanvasLayer.new();add_child(canvas)
	screen=Control.new();screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);screen.mouse_filter=Control.MOUSE_FILTER_IGNORE;canvas.add_child(screen)
	panel=PanelContainer.new();screen.add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.offset_left=-330;panel.offset_right=330;panel.offset_top=-270;panel.offset_bottom=270
	var style: StyleBoxFlat=StyleBoxFlat.new();style.bg_color=Color("111a21");style.border_color=Color("b39a67")
	style.set_border_width_all(1);style.set_content_margin_all(26);panel.add_theme_stylebox_override("panel",style)
	choices=VBoxContainer.new();choices.add_theme_constant_override("separation",12);panel.add_child(choices)
	label("V A R E N D O R",32)
	label("Промежуточная прогулка по новому миру",21)
	label("1600 × 1400 м · поверхность, шахта и пещера",17)
	label("Окружение ещё в работе. Монстры, NPC, финальная\nатмосфера и карты нового мира пока не подключены.",16)
	button("Новый мир — начать у Гринфолла",func():open_space("surface"))
	button("Шахта — спуститься внутрь",func():open_space("mine"))
	button("Большая пещера — войти",func():open_space("great_cave"))
	button("Продолжить прогулку",func():toggle_menu(false))
	button("Выйти",func():get_tree().quit())
	label("WASD — бег · пробел — прыжок · ПКМ — камера\nКолесо — приближение · Esc — меню · F11 — окно\nF1 — общий вид · F2 — вернуться к герою",16)
	loading=Label.new();loading.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;loading.add_theme_font_size_override("font_size",21)
	screen.add_child(loading);loading.set_anchors_and_offsets_preset(Control.PRESET_CENTER);loading.position-=Vector2(260,0);loading.hide()
	hud=HBoxContainer.new();hud.add_theme_constant_override("separation",12);screen.add_child(hud);hud.position=Vector2(22,18);hud.hide()
	var menu: Button=Button.new();menu.text="Меню · Esc";menu.pressed.connect(func():toggle_menu(true));hud.add_child(menu)
	location=OptionButton.new();location.custom_minimum_size=Vector2(285,40)
	for d: Array in DESTINATIONS:location.add_item(d[0])
	location.item_selected.connect(func(index:int):space.enter_location(Vector2(DESTINATIONS[index][1],DESTINATIONS[index][2])))
	hud.add_child(location)
	var help: Label=Label.new();help.text="WASD · ПКМ · пробел | F1 обзор / F2 герой";help.add_theme_color_override("font_outline_color",Color.BLACK);help.add_theme_constant_override("outline_size",5);hud.add_child(help)
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--walk-preview-qa="):qa_output=arg.trim_prefix("--walk-preview-qa=")
		if arg.begins_with("--preview-space="):qa_space=arg.trim_prefix("--preview-space=")
	if not qa_output.is_empty():call_deferred("run_qa")

func label(text: String,size: int) -> void:
	var item: Label=Label.new();item.text=text;item.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;item.add_theme_font_size_override("font_size",size);choices.add_child(item)

func button(text: String,action: Callable) -> void:
	var item: Button=Button.new();item.text=text;item.custom_minimum_size.y=42;item.pressed.connect(action);choices.add_child(item)

func open_space(id: String) -> void:
	if busy:return
	busy=true;panel.hide();hud.hide();loading.text="Загрузка мира…";loading.show()
	if is_instance_valid(space):
		space.follow.release_capture();space.queue_free();space=null
		await get_tree().process_frame
	get_tree().root.set_meta("preview_space",id)
	var path: String="res://world-final/walk_preview.tscn" if id=="surface" else "res://world-final/interior_walk_preview.tscn"
	space=load(path).instantiate();add_child(space)
	while not space.preview_ready:
		await get_tree().process_frame
	busy=false;loading.hide();hud.show();location.visible=id=="surface";location.select(1)

func toggle_menu(show_menu: bool) -> void:
	if busy:return
	if not is_instance_valid(space):return
	panel.visible=show_menu;hud.visible=not show_menu
	space.follow.release_capture();space.motor.input_direction=Vector2.ZERO
	space.motor.physics_step(1.0/60.0);space.set_physics_process(not show_menu)
	space.set_process_unhandled_input(not show_menu)

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode==KEY_ESCAPE:toggle_menu(not panel.visible);get_viewport().set_input_as_handled()
		if event.keycode==KEY_F11:
			get_window().mode=Window.MODE_WINDOWED if get_window().mode!=Window.MODE_WINDOWED else Window.MODE_FULLSCREEN
			get_viewport().set_input_as_handled()

func screenshot(name: String) -> void:
	if DisplayServer.get_name()=="headless":return
	await get_tree().process_frame;await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(qa_output.path_join(name+".png"))

func run_qa() -> void:
	DirAccess.make_dir_recursive_absolute(qa_output)
	await screenshot("menu")
	await open_space(qa_space)
	if qa_space=="surface":space.enter_location(Vector2(-671.5762,-33.5799));space.follow.yaw=.52;space.follow.reset_follow()
	for i:int in range(12):await get_tree().physics_frame
	await screenshot("start")
	var start: Vector2=space.motor.position_value
	var key: InputEventKey=InputEventKey.new();key.physical_keycode=KEY_W;key.keycode=KEY_W;key.pressed=true;Input.parse_input_event(key)
	for i:int in range(120):
		await get_tree().physics_frame
		if i in [30,60,90]:await screenshot("walk-"+str(i))
	key=InputEventKey.new();key.physical_keycode=KEY_W;key.keycode=KEY_W;key.pressed=false;Input.parse_input_event(key)
	await get_tree().physics_frame;await get_tree().physics_frame
	var stop: Vector2=space.motor.position_value
	for i:int in range(60):await get_tree().physics_frame
	var drift: float=stop.distance_to(space.motor.position_value)
	await screenshot("stop")
	toggle_menu(true);await get_tree().physics_frame
	var pause_ok: bool=not space.is_physics_processing()
	toggle_menu(false)
	var checks: Dictionary={"space_loaded":space.preview_ready,"movement":start.distance_to(stop)>3,"stop":drift<.000001,"pause_resume":pause_ok and space.is_physics_processing(),"actor":is_instance_valid(space.actor),"height_bytes":space.heights.size()>1000}
	if qa_space=="surface":
		checks["forest_count"]=space.nature_visual.data.placements.size()==92973
		checks["grass_count"]=int(space.details.data.counts.grass_tufts)==362189
		checks["chunks"]=space.terrain.chunks.size()==143
	else:checks["cached_navigation"]=space.get_meta("navigation_cache_reused",false) and space.nav_mesh.get_polygon_count()>0
	var ok: bool=checks.values().all(func(v:bool):return v)
	var report: Dictionary={"ok":ok,"space":qa_space,"checks":checks,"stop_drift_m":drift,"distance_m":start.distance_to(stop),"headless":DisplayServer.get_name()=="headless","personal_saves_opened":false,"full_world_acceptance":false}
	var file: FileAccess=FileAccess.open(qa_output.path_join("preview-qa.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("WALK_PREVIEW_QA "+JSON.stringify(report));get_tree().quit(0 if ok else 3)
