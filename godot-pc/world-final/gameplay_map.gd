extends RefCounted
## Provisional geographic layers from the authored geometry. The E-stage
## orthographic art atlas remains a separate visual acceptance task.
static func draw_map(view: Control) -> void:
	var world: VarendorWorld = view.world
	var scene: Node3D = world.final_environment
	if scene.active_space.is_empty(): return
	var full: bool = view.show_labels
	var room: Vector2 = view.size-Vector2(28,30) if full else view.size-Vector2(8,8)
	if full: room.x -= 236
	var b: Array = [-800,-700,800,700] if scene.active_space == "surface" else scene.terrain.bounds
	var extent: Vector2 = Vector2(b[2]-b[0],b[3]-b[1])
	var center: Vector2 = Vector2((b[0]+b[2])/2,(b[1]+b[3])/2)
	var hero: Dictionary = world.current_snapshot.get("character",{})
	var zoom: float = view.zoom if full else 4.0 if scene.active_space == "surface" else 1.6
	if not full and not hero.is_empty(): center = Vector2(hero.x,-hero.z)
	view.metre_scale = minf(room.x/extent.x,room.y/extent.y)
	view.map_rect = Rect2(Vector2(14,15)+(room-extent*view.metre_scale)/2 if full else (view.size-extent*view.metre_scale)/2,extent*view.metre_scale)
	var scale: float = view.metre_scale*zoom
	var project: Callable = func(x: float,z: float) -> Vector2: return view.map_rect.get_center()+(Vector2(x,z)-center)*scale+(view.pan if full else Vector2.ZERO)
	view.draw_rect(view.map_rect,Color("333d38"))
	if scene.active_space == "surface":
		# Hunting administration is drawn under the unchanged town/road layers.
		# It does not enlarge their protected area or collision boundaries.
		for location: Dictionary in scene.location_overrides:
			var hunting_polygon: PackedVector2Array = PackedVector2Array()
			for p: Array in location.outline_xz: hunting_polygon.append(project.call(p[0],p[1]))
			view.draw_colored_polygon(hunting_polygon,Color("53613c"))
		for location: Dictionary in scene.layout.locations:
			var polygon: PackedVector2Array = PackedVector2Array()
			for p: Array in location.outline_xz: polygon.append(project.call(p[0],p[1]))
			var color: Color = {"L01":Color("72684e"),"L02":Color("72684e"),"L03":Color("354938"),"L04":Color("8f9d9d"),"L09":Color("59433b"),"L11":Color("3e5147"),"L12":Color("585b55")}.get(location.id,Color("555d48"))
			view.draw_colored_polygon(polygon,color)
		var lake: PackedVector2Array = PackedVector2Array()
		for p: Array in scene.layout.water.lake.polygon: lake.append(project.call(p[0],p[1]))
		view.draw_colored_polygon(lake,Color("35646b"))
		for road: Dictionary in scene.layout.roads:
			var points: PackedVector2Array = PackedVector2Array()
			for p: Array in road.points_xyz: points.append(project.call(p[0],p[2]))
			view.draw_polyline(points,Color("c0b68a") if road.kind == "protected" else Color("918066"),maxf(1,road.width*scale),true)
		for id: String in VarendorNpcInteraction.SERVICES:
			var npc: Dictionary = VarendorNpcInteraction.SERVICES[id]
			view.draw_circle(project.call(npc.x,-npc.z),2.2 if full else 1.4,Color("e3bc67"))
	else:
		for corridor: Dictionary in scene.definition.corridors:
			var line: PackedVector2Array = PackedVector2Array()
			for p: Array in corridor.points: line.append(project.call(p[0],p[1]))
			view.draw_polyline(line,Color("a5a18b"),maxf(2,corridor.width*scale),true)
		for room_data: Dictionary in scene.definition.rooms:
			var polygon: PackedVector2Array = PackedVector2Array()
			for i: int in range(40):
				var a: float = i*TAU/40
				polygon.append(project.call(room_data.center[0]+cos(a)*room_data.radii[0],room_data.center[1]+sin(a)*room_data.radii[1]))
			view.draw_colored_polygon(polygon,Color("a5a18b"))
	for id: String in scene.spaces:
		if scene.active_space != "surface" and scene.active_space != id: continue
		var raw: Array = scene.spaces[id].surface_portal if scene.active_space == "surface" else scene.spaces[id].entry
		view.draw_circle(project.call(raw[0],raw[2]),4,Color("9a9fe8"))
	if not hero.is_empty():
		var p: Vector2 = project.call(hero.x,-hero.z)
		view.draw_circle(p,4,Color("76dcdf"))
		view.draw_line(p,p+Vector2(sin(float(hero.yaw)),-cos(float(hero.yaw)))*10,Color("e2ffff"),2)
	view.draw_rect(view.map_rect,Color("8c815e"),false,1)
	if full:
		var x: float = view.map_rect.end.x+16
		view.text_at(Vector2(x,40),"ВАРЕНДОР",21,Color("e6d4a8"))
		view.text_at(Vector2(x,72),scene.location_name(Vector2(hero.get("x",0),hero.get("z",0))),13,Color("ccd5c8"))
		view.text_at(Vector2(x,116),"Бирюзовый — герой",12,Color("76dcdf"))
		view.text_at(Vector2(x,141),"Золотой — службы",12,Color("e3bc67"))
		view.text_at(Vector2(x,166),"Сиреневый — вход / выход",12,Color("9a9fe8"))
		view.text_at(Vector2(x,214),"У входа нажмите F",12,Color("ccd5c8"))
		view.text_at(Vector2(x,250),"Колесо — масштаб",12,Color("ccd5c8"))
		view.text_at(Vector2(x,276),"Перетаскивание — обзор",12,Color("ccd5c8"))
		view.text_at(Vector2(x,310),"M / Esc — закрыть",12,Color("e6d4a8"))
