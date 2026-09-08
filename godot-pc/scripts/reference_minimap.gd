extends Control

# Exact whole-world HUD projection from the approved browser drawMinimap().
# Raw server coordinates are used; Godot's visual Z conversion is irrelevant here.
var world: VarendorWorld
var show_labels: bool = false
var elapsed: float = 0
var background: GradientTexture2D

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	var gradient: Gradient = Gradient.new()
	gradient.set_color(0,Color("3c493a"))
	gradient.set_color(1,Color("121a17"))
	background = GradientTexture2D.new()
	background.gradient = gradient
	background.width = 428
	background.height = 328
	background.fill = GradientTexture2D.FILL_RADIAL
	background.fill_from = Vector2(.5,.5)
	background.fill_to = Vector2(1,.5)

func _process(delta: float) -> void:
	elapsed += delta
	if elapsed >= .1:
		elapsed = 0
		queue_redraw()

func map_point(x: float, z: float) -> Vector2:
	return Vector2((x+160)/320*size.x,(z+140)/280*size.y)

func _draw() -> void:
	if background != null: draw_texture_rect(background,Rect2(Vector2.ZERO,size),false)
	if world == null or world.current_snapshot.is_empty(): return
	var ratio: float = minf(size.x/428,size.y/328)
	var road: PackedVector2Array = PackedVector2Array()
	for point: Vector2 in [Vector2(-108,-82),Vector2(-7,-5),Vector2(35,18),Vector2(72,52),Vector2(104,48),Vector2(136,101)]: road.append(map_point(point.x,point.y))
	draw_polyline(road,Color("847252"),maxf(.8,4*ratio),true)
	for monster: Dictionary in world.current_snapshot.get("monsters",[]):
		if not monster.get("alive",false): continue
		# Catalog boss is a category string (mini/big), not a Boolean.
		var boss: bool = world.data.monsters.get(monster.id,{}).get("boss", "") in ["mini", "big"]
		draw_circle(map_point(float(monster.x),float(monster.z)),maxf(.8,(5 if boss else 2)*ratio),Color("ffb24f") if boss else Color("a93d3d"))
	var hero: Dictionary = world.current_snapshot.get("character",{})
	if not hero.is_empty(): draw_circle(map_point(float(hero.x),float(hero.z)),maxf(2,5*ratio),Color("5fd8ff"))
	if show_labels:
		for location: Dictionary in world.data.get("locations",[]):
			var position_value: Vector2 = map_point(float(location.x),float(location.z))
			draw_circle(position_value,4,Color("e0b758"))
			draw_string(ThemeDB.fallback_font,position_value+Vector2(6,-5),str(location.name),HORIZONTAL_ALIGNMENT_LEFT,150,12,Color("e3c88f"))
	draw_rect(Rect2(Vector2.ONE,size-Vector2.ONE*2),Color("5b4b34"),false,1)
