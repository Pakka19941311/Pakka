extends Control

var world: VarendorWorld

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	if world == null or world.current_snapshot.is_empty():
		return
	var center: Vector2 = size * .5
	draw_rect(Rect2(Vector2.ZERO, size), Color("192422"))
	draw_rect(Rect2(Vector2.ZERO, size), Color("a28b59"), false, 1.0)
	var hero: Dictionary = world.current_snapshot.character
	for platform: Dictionary in world.terrain.platforms:
		var point: Vector2 = center + Vector2(platform.x - hero.x, hero.z - platform.z) * 2
		if Rect2(Vector2.ZERO, size).has_point(point):
			draw_rect(Rect2(point - Vector2(platform.width, platform.depth), Vector2(platform.width, platform.depth) * 2), Color("786e4c"))
	for id: String in world.actors:
		var actor: Node3D = world.actors[id]
		if not actor.visible:
			continue
		var point: Vector2 = center + Vector2(actor.position.x - hero.x, actor.position.z + hero.z) * 2
		if point.x < 5 or point.y < 5 or point.x > size.x - 5 or point.y > size.y - 5:
			continue
		var color: Color = Color("d7b369") if id.begins_with("npc:") else Color("dc7160")
		if id == world.hero_id:
			color = Color("e9e9ce")
		draw_circle(point, 3.0 if id == world.hero_id else 2.0, color)
	draw_line(center, center + Vector2(-sin(world.camera_yaw), -cos(world.camera_yaw)) * 11, Color("eee8cd"), 1.5)
