extends Control

# Native atlas + HUD minimap: the exact authored roads and footprints. North=+Z.
var world: VarendorWorld
var show_labels: bool = false
var elapsed: float = 0
var zoom: float = 1
var pan: Vector2 = Vector2.ZERO
var dragging: bool = false
var map_rect: Rect2
var metre_scale: float = 1
const PAPER: Color = Color("d4ccb0")
const INK: Color = Color("263932")
const GOLD: Color = Color("d8b366")

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP if show_labels else Control.MOUSE_FILTER_IGNORE
	clip_contents = true

func _process(delta: float) -> void:
	elapsed += delta
	if elapsed >= .12:
		elapsed = 0
		queue_redraw()

func layout_projection() -> void:
	var room: Vector2 = size-Vector2(28,30) if show_labels else size-Vector2(8,8)
	if show_labels: room.x -= 236
	metre_scale = minf(room.x/320,room.y/280)
	var extent: Vector2 = Vector2(320,280)*metre_scale
	map_rect = Rect2(Vector2(14,15)+(room-extent)/2 if show_labels else (size-extent)/2,extent)

func map_point(x: float,z: float) -> Vector2:
	return map_rect.get_center()+Vector2(x,-z)*metre_scale*zoom+pan

func _gui_input(event: InputEvent) -> void:
	if not show_labels: return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT: dragging = event.pressed
		if event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN] and map_rect.has_point(event.position):
			var before: float = zoom
			zoom = clampf(zoom*(1.2 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1/1.2),1,3.5)
			pan = event.position-map_rect.get_center()-(event.position-map_rect.get_center()-pan)*(zoom/before)
			if zoom == 1: pan = Vector2.ZERO
		if event.double_click:
			zoom = 1
			pan = Vector2.ZERO
		accept_event()
	elif event is InputEventMouseMotion and dragging:
		pan += event.relative
		var limit: Vector2 = map_rect.size*(zoom-1)*.5
		pan = pan.clamp(-limit,limit)
		accept_event()
	queue_redraw()

func rect_at(x: float,z: float,w: float,d: float,color: Color,outline: Color = Color.TRANSPARENT) -> void:
	var rect: Rect2 = Rect2(map_point(x-w/2,z+d/2),Vector2(w,d)*metre_scale*zoom)
	draw_rect(rect,color)
	if outline.a > 0: draw_rect(rect,outline,false,maxf(.7,metre_scale*.5))

func text_at(p: Vector2,value: String,font_size: int,color: Color = INK) -> void:
	draw_string(ThemeDB.fallback_font,p,value,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size,color)

func _draw() -> void:
	layout_projection()
	draw_rect(Rect2(Vector2.ZERO,size),Color("161f1c"))
	if world == null or world.territory.is_empty(): return
	draw_rect(map_rect,PAPER)
	for forest: Dictionary in world.territory.forests:
		var polygon: PackedVector2Array = PackedVector2Array()
		for i: int in 32:
			var a: float = TAU*i/32.0
			var edge: float = 1+.05*sin(a*5+float(forest.x))
			polygon.append(map_point(forest.x+cos(a)*forest.rx*edge,forest.z+sin(a)*forest.rz*edge))
		draw_colored_polygon(polygon,Color("9ba886"))
	for tree: Dictionary in world.territory.trees:
		var p: Vector2 = map_point(tree.x,tree.z)
		var r: float = (1.4 if show_labels else .9)*zoom
		draw_colored_polygon(PackedVector2Array([p+Vector2(0,-2*r),p+Vector2(1.3*r,r),p+Vector2(-1.3*r,r)]),Color("53745f"))
	for i: int in 15:
		var x: float = -149+i*21
		draw_colored_polygon(PackedVector2Array([map_point(x-11,118),map_point(x,136),map_point(x+12,118)]),Color("8b9589"))
	for road: Dictionary in world.territory.roads:
		var axis: PackedVector2Array = PackedVector2Array()
		for p: Dictionary in road.points: axis.append(map_point(p.x,p.z))
		var width: float = maxf(1,road.width*metre_scale*zoom)
		if road.kind == "protected": draw_polyline(axis,Color("b2c39a"),width+6*metre_scale*zoom,true)
		if road.kind == "danger":
			for i: int in range(1,axis.size()):
				if i%4 < 2: draw_line(axis[i-1],axis[i],Color("a45b43"),maxf(1,1.2*metre_scale*zoom),true)
		else:
			draw_polyline(axis,Color("eee3c5"),width+maxf(1,metre_scale),true)
			draw_polyline(axis,Color("ad8a55"),width,true)
	for f: Dictionary in [world.territory.fort,world.territory.capital]: rect_at(f.x,f.z,f.width,f.depth,Color("b8bba0"),Color("506259"))
	rect_at(-30,-5,21,57,Color("9fa99c"))
	rect_at(-5,-5,27,57,Color("c3b88e"))
	rect_at(18,-5,18,57,Color("d8cba4"))
	rect_at(1.5,-3,35,25,Color("d0c6a5"))
	for gate: Dictionary in [world.territory.fort.eastGate,world.territory.fort.westGate,{"x":-86,"z":-82}]: rect_at(gate.x,gate.z,3.4,6,Color("ad8a55"))
	for b: Dictionary in world.territory.buildings: rect_at(b.x,b.z,b.width,b.depth,Color("78897e"),Color("455a50"))
	for road: Dictionary in world.territory.roads:
		for i: int in range(1,road.points.size()):
			var p: Dictionary = road.points[i]
			var inside: bool = (absf(p.x+7)<35 and absf(p.z+5)<30) or (absf(p.x+108)<22 and absf(p.z+82)<19)
			if inside:
				var a: Dictionary = road.points[i-1]
				draw_line(map_point(a.x,a.z),map_point(p.x,p.z),Color("d7caaa"),maxf(1,road.width*metre_scale*zoom),true)
	for x: float in [-42,28]:
		for z: float in [-35,25]: rect_at(x,z,5.8,5.8,Color("5a7268"),INK)
	if show_labels:
		for district: Array in [[18,4,"01"],[-4,3,"02"],[-30,-9,"03"]]:
			var p: Vector2 = map_point(district[0],district[1])
			draw_circle(p,10,Color("30574b"))
			text_at(p+Vector2(-7,4),district[2],11,Color("f2ead1"))
	for landmark: Dictionary in world.territory.landmarks:
		var p: Vector2 = map_point(landmark.x,landmark.z)
		var major: bool = landmark.kind in ["fort","town","ruin","forest","den","camp","boss","ridge"]
		if landmark.kind not in ["fort","town","ridge"]: draw_circle(p,4 if show_labels else 1.5,Color("a15138") if landmark.kind == "boss" else Color("5b6852"))
		if show_labels:
			var font_size: int = 13 if major else 10
			var extent: Vector2 = ThemeDB.fallback_font.get_string_size(landmark.name,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size)
			var origin: Vector2 = p+Vector2(-extent.x/2,-12 if landmark.kind not in ["fort","town"] else 29*metre_scale*zoom+16)
			origin.x = clampf(origin.x,map_rect.position.x+4,map_rect.end.x-extent.x-4)
			draw_rect(Rect2(origin-Vector2(3,extent.y-3),extent+Vector2(6,4)),Color(.92,.89,.79,.93))
			text_at(origin,landmark.name,font_size)
	for service: Dictionary in world.territory.services.values():
		var p: Vector2 = map_point(service.x,service.z)
		draw_circle(p,3 if show_labels else 1.4,GOLD)
		if show_labels and zoom >= 1.75: text_at(p+Vector2(5,-4),service.name,11)
	if not world.current_snapshot.is_empty():
		for monster: Dictionary in world.current_snapshot.get("monsters",[]):
			if monster.get("alive",false): draw_circle(map_point(monster.x,monster.z),1.4 if show_labels else .9,Color("a24c3a"))
		var hero: Dictionary = world.current_snapshot.get("character",{})
		if not hero.is_empty():
			var p: Vector2 = map_point(float(hero.x),float(hero.z))
			var yaw: float = float(hero.get("yaw",0))
			var direction: Vector2 = Vector2(sin(yaw),-cos(yaw))
			draw_circle(p,7 if show_labels else 4,Color("142c30"))
			draw_circle(p,4 if show_labels else 2.5,Color("76dcdf"))
			draw_line(p,p+direction*(13 if show_labels else 7),Color("d5fcff"),2,true)
	# Mask zoom overflow; legend/compass remain outside the navigable map.
	var edge: Color = Color("161f1c")
	draw_rect(Rect2(Vector2.ZERO,Vector2(size.x,map_rect.position.y)),edge)
	draw_rect(Rect2(0,map_rect.end.y,size.x,size.y-map_rect.end.y),edge)
	draw_rect(Rect2(0,0,map_rect.position.x,size.y),edge)
	draw_rect(Rect2(map_rect.end.x,0,size.x-map_rect.end.x,size.y),edge)
	draw_rect(map_rect,Color("8c815e"),false,1)
	if not show_labels: return
	var x: float = map_rect.end.x+22
	text_at(Vector2(x,39),"ВАРЕНДОР",23,Color("e6d4a8"))
	text_at(Vector2(x,63),"Пограничные земли",13,Color("a7b7a7"))
	text_at(Vector2(x,101),"ГРИНФОЛЛ",14,GOLD)
	for row: Array in [[133,"01  Вход и площадь"],[157,"02  Ремесло и торговля"],[181,"03  Донжон и память"]]: text_at(Vector2(x,row[0]),row[1],12,Color("d0d6c7"))
	for row: Array in [[231,"Основной маршрут",Color("bd945a")],[260,"Опасная тропа",Color("ad6448")],[289,"Защищённый подход",Color("b2c39a")],[318,"Лес и подлесок",Color("748c69")],[347,"Городские службы",GOLD],[376,"Ваш персонаж",Color("76dcdf")]]:
		draw_circle(Vector2(x+5,row[0]-4),4,row[2])
		text_at(Vector2(x+18,row[0]),row[1],12,Color("c3cdbf"))
	text_at(Vector2(x,size.y-106),"Колесо — масштаб",12,Color("a7b7a7"))
	text_at(Vector2(x,size.y-86),"Перетаскивание — обзор",12,Color("a7b7a7"))
	text_at(Vector2(x,size.y-66),"Двойной щелчок — вся карта",11,Color("a7b7a7"))
	text_at(Vector2(x,size.y-34),"M / Esc — закрыть",12,GOLD)
	var compass: Vector2 = map_rect.position+Vector2(24,40)
	draw_line(compass,compass+Vector2(0,-18),INK,2,true)
	draw_colored_polygon(PackedVector2Array([compass+Vector2(0,-25),compass+Vector2(-4,-14),compass+Vector2(4,-14)]),INK)
	text_at(compass+Vector2(-4,-30),"С",12)
	var start: Vector2 = map_rect.position+Vector2(17,map_rect.size.y-18)
	draw_line(start,start+Vector2(40*metre_scale*zoom,0),INK,2)
	text_at(start+Vector2(0,-6),"40 м",11)
