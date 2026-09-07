extends Control

# North-up map of the existing world. Terrain and footprint geometry are cached;
# only the small viewport and moving markers are redrawn, at most ten times/sec.
const MAP_SCALE: float = 2.0
const REFRESH_SECONDS: float = .1
const TERRAIN_CELL: float = 2.0
var world: VarendorWorld
var terrain_texture: ImageTexture
var terrain_size: Vector2
var terrain_building: bool = false
var map_owner: int = 0
var refresh_left: float = 0.0
var footprints: Array[Dictionary] = []

func _ready() -> void:
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _process(delta: float) -> void:
	if world == null or world.terrain.is_empty():
		return
	if map_owner != world.get_instance_id() and not terrain_building:
		map_owner = world.get_instance_id()
		build_terrain()
	refresh_left -= delta
	if refresh_left <= 0:
		refresh_left = REFRESH_SECONDS
		queue_redraw()

func build_terrain() -> void:
	terrain_building = true
	terrain_texture = null
	footprints.clear()
	terrain_size = Vector2(float(world.terrain.width), float(world.terrain.depth))
	var columns: int = int(world.terrain.columns)
	var rows: int = int(world.terrain.rows)
	var heights: Array = world.terrain.heights
	var pixels: Vector2i = Vector2i(ceil(terrain_size.x / TERRAIN_CELL), ceil(terrain_size.y / TERRAIN_CELL))
	var terrain_image: Image = Image.create(pixels.x, pixels.y, false, Image.FORMAT_RGB8)
	for y: int in range(pixels.y):
		for x: int in range(pixels.x):
			var col: int = clampi(int(float(x) / pixels.x * columns), 0, columns - 1)
			var row: int = clampi(int(float(y) / pixels.y * rows), 0, rows - 1)
			var index: int = row * (columns + 1) + col
			var height: float = float(heights[index])
			var slope: float = float(heights[index + 1]) - height
			var shade: float = clampf(.48 + height * .055 - slope * .25, .12, .86)
			terrain_image.set_pixel(x, y, Color("293b30").lerp(Color("677452"), shade))
		# Prepare the static image over several frames instead of blocking movement.
		if y % 12 == 11:
			await get_tree().process_frame
	for road: Dictionary in world.terrain.get("roads", []):
		cache_footprint(road, Color("aa986e"), false)
	for platform: Dictionary in world.terrain.get("platforms", []):
		cache_footprint(platform, Color("9a9377"), true)
	for collider: Dictionary in world.terrain.get("colliders", []):
		# Overhead arches do not close a walkable gateway on the map.
		if not collider.get("blocksMovement", true):
			continue
		cache_footprint(collider, Color("303c31") if collider.kind == "circle" else Color("777b73"), true)
	terrain_texture = ImageTexture.create_from_image(terrain_image)
	terrain_building = false
	queue_redraw()

func cache_footprint(source: Dictionary, color: Color, outlined: bool) -> void:
	var center: Vector2 = Vector2(float(source.x), -float(source.z))
	var points: PackedVector2Array = PackedVector2Array()
	if source.get("kind", "box") == "circle":
		var radius: float = maxf(.5, float(source.radius))
		for i: int in range(8):
			points.append(center + Vector2.RIGHT.rotated(TAU * i / 8.0) * radius)
	else:
		var half_size: Vector2 = Vector2(float(source.get("halfX", float(source.get("width", 0)) * .5)), float(source.get("halfZ", float(source.get("depth", 0)) * .5)))
		half_size = half_size.max(Vector2(.25, .25))
		var rotation: float = float(source.get("rotation", 0))
		for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
			points.append(center + (corner * half_size).rotated(rotation))
	var bounds: Rect2 = Rect2(points[0], Vector2.ZERO)
	for point: Vector2 in points:
		bounds = bounds.expand(point)
	footprints.append({"points": points, "bounds": bounds, "color": color, "outlined": outlined})

func _draw() -> void:
	var map_rect: Rect2 = Rect2(Vector2.ONE * 2, size - Vector2.ONE * 4)
	draw_rect(Rect2(Vector2.ZERO, size), Color("192422"))
	if world == null or world.current_snapshot.is_empty():
		return
	var center: Vector2 = size * .5
	var hero: Vector2 = Vector2(world.hero_position.x, world.hero_position.z)
	var visible_world: Rect2 = Rect2(hero - map_rect.size / (MAP_SCALE * 2), map_rect.size / MAP_SCALE)
	if terrain_texture != null:
		var source: Rect2 = Rect2((visible_world.position + terrain_size * .5) / TERRAIN_CELL, visible_world.size / TERRAIN_CELL)
		var clipped: Rect2 = source.intersection(Rect2(Vector2.ZERO, Vector2(terrain_texture.get_size())))
		if clipped.has_area():
			draw_texture_rect_region(terrain_texture, Rect2(map_rect.position + (clipped.position - source.position) * TERRAIN_CELL * MAP_SCALE, clipped.size * TERRAIN_CELL * MAP_SCALE), clipped)
	for footprint: Dictionary in footprints:
		if not visible_world.intersects(footprint.bounds):
			continue
		var points: PackedVector2Array = PackedVector2Array()
		for point: Vector2 in footprint.points:
			points.append(center + (point - hero) * MAP_SCALE)
		draw_colored_polygon(points, footprint.color)
		if footprint.outlined:
			points.append(points[0])
			draw_polyline(points, Color("aaa38a"), .75, true)
	draw_landmarks(center, hero, map_rect)
	for id: String in world.actors:
		var actor: Node3D = world.actors[id]
		if not actor.visible or bool(actor.get_meta("dead", false)) or id == world.hero_id:
			continue
		var point: Vector2 = center + (Vector2(actor.position.x, actor.position.z) - hero) * MAP_SCALE
		if not map_rect.grow(-5).has_point(point):
			continue
		var color: Color = Color("e8c773") if id.begins_with("npc:") else Color("ee8875")
		draw_circle(point, 3, Color("111914"))
		draw_circle(point, 2, color)
		if id == world.target_id:
			draw_arc(point, 4.5, 0, TAU, 12, Color("f7df91"), 1.2, true)
	var forward: Vector2 = Vector2(-sin(world.camera_yaw), -cos(world.camera_yaw))
	draw_line(center, center + forward * 14, Color("fff3c8"), 1.5, true)
	draw_colored_polygon(PackedVector2Array([center + forward * 6, center + forward.rotated(2.5) * 5, center + forward.rotated(-2.5) * 5]), Color("fff7d9"))
	var font: Font = ThemeDB.fallback_font
	draw_rect(Rect2(3, 3, 18, 18), Color("192422"))
	draw_string(font, Vector2(7, 16), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("f1ddb4"))
	draw_rect(Rect2(7, size.y - 20, 49, 16), Color("192422"))
	draw_line(Vector2(10, size.y - 7), Vector2(30, size.y - 7), Color("d3c7a7"), 1)
	draw_string(font, Vector2(33, size.y - 5), "10 м", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("d3c7a7"))
	draw_rect(Rect2(Vector2.ONE, size - Vector2.ONE * 2), Color("a28b59"), false, 1.0)

func draw_landmarks(center: Vector2, hero: Vector2, map_rect: Rect2) -> void:
	var font: Font = ThemeDB.fallback_font
	for location: Dictionary in world.data.get("locations", []):
		var point: Vector2 = center + (Vector2(float(location.x), -float(location.z)) - hero) * MAP_SCALE
		if not map_rect.grow(-9).has_point(point):
			continue
		var text: String = str(location.name)
		var text_width: float = minf(font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x, map_rect.size.x - 12)
		var label_position: Vector2 = Vector2(clampf(point.x - text_width * .5, 8, size.x - text_width - 8), clampf(point.y - 9, 30, size.y - 27))
		draw_rect(Rect2(label_position + Vector2(-3, -12), Vector2(text_width + 6, 16)), Color("192422", .88))
		draw_string(font, label_position, text, HORIZONTAL_ALIGNMENT_LEFT, text_width, 11, Color("dfc897"))
