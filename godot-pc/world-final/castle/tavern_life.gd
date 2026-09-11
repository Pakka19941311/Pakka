extends RefCounted
## A walk-in building on the existing surface. No private economy or teleport.
var world: VarendorWorld
var definition: Dictionary
var parts: Dictionary = {}
var inside: bool = false
var mask: String = ""
var lights: Array[OmniLight3D] = []

func setup(value: VarendorWorld, data: Dictionary, geometry: Node3D, parent: Node3D) -> void:
	world = value
	definition = data
	for side: String in ["roof","wall_west","wall_east","wall_north","wall_south"]:
		parts[side] = geometry.find_children("Courtyard_tavern_"+side+"_*","MeshInstance3D",true,false)
	for item: Dictionary in data.lights:
		var lamp: OmniLight3D = OmniLight3D.new()
		lamp.position = world.point(item.x,item.z,item.height)
		lamp.light_color = Color("ffb25f")
		lamp.light_energy = 1.3 if item.range > 5 else .75
		lamp.omni_range = item.range
		lamp.shadow_enabled = false
		lamp.distance_fade_enabled = true
		lamp.distance_fade_begin = 28
		lamp.distance_fade_length = 8
		parent.add_child(lamp)
		lights.append(lamp)
	if world.actors.has("npc:books"):
		world.actors["npc:books"].rotation.y = 0

func before_camera() -> void:
	var p: Vector2 = Vector2(world.hero_position.x,-world.hero_position.z)
	var b: Array = definition.bounds
	inside = world.final_environment.active_space == "surface" and p.x > b[0] and p.x < b[2]+.5 and p.y > b[1] and p.y < b[3]
	var yaw: float = world.camera_controller.smoothed_yaw
	var hidden: Array[String] = []
	if inside:
		hidden.append("roof")
		if sin(yaw) > .20: hidden.append("wall_east")
		if sin(yaw) < -.20: hidden.append("wall_west")
		if cos(yaw) > .20: hidden.append("wall_south")
		if cos(yaw) < -.20: hidden.append("wall_north")
	var next: String = ",".join(hidden)
	if next == mask: return
	mask = next
	world.collision.camera_ignored_ids.clear()
	for side: String in parts:
		for part: MeshInstance3D in parts[side]:
			# Keep the physical roof's shadow when it is cut away for the camera.
			part.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if side in hidden else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	for obstacle: Dictionary in world.final_environment.courtyard.definition.obstacles:
		for side: String in hidden:
			if str(obstacle.id).begins_with("courtyard:Tavern_"+side+":"):
				world.collision.camera_ignored_ids[str(obstacle.id)] = true
