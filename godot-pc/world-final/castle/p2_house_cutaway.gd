extends RefCounted
## Close house pieces crossing the stair view use the tavern's cutaway method.
## Physical walls, movement, attack visibility and the house silhouette outside
## this small approach remain unchanged.
var world: VarendorWorld
var parts: Array[MeshInstance3D] = []
var obstacle_ids: Array[String] = []
var active: bool = false
var hidden_names: Array[String] = []
var boxes: Array[AABB] = []
var shadow_modes: Array[int] = []
var additional_houses: Array[Dictionary] = []

func setup(value: VarendorWorld, geometry: Node3D, obstacles: Array) -> void:
	world = value
	var house: Node = geometry.find_child("P2_housepack",true,false)
	if house == null: return
	for part: MeshInstance3D in house.find_children("*","MeshInstance3D",true,false):
		parts.append(part)
		boxes.append((part.global_transform*part.get_aabb()).grow(.55))
		shadow_modes.append(part.cast_shadow)
	for obstacle: Dictionary in obstacles:
		if str(obstacle.get("id","")).begins_with("courtyard:p2-house:"):
			obstacle_ids.append(str(obstacle.id))
	var city: Dictionary = world.final_environment.read_json(world.final_environment.courtyard_path).get("p2City",{})
	for definition: Dictionary in city.get("buildings",[]):
		if not definition.has("stairs"): continue
		var building: Node = geometry.find_child(str(definition.root),true,false)
		if building == null: continue
		var row: Dictionary = {"parts":[],"boxes":[],"shadows":[],"ids":[],"active":false,"stairs":definition.stairs}
		for part: MeshInstance3D in building.find_children("*","MeshInstance3D",true,false):
			row.parts.append(part);row.boxes.append((part.global_transform*part.get_aabb()).grow(.55));row.shadows.append(part.cast_shadow)
		for obstacle: Dictionary in obstacles:
			if str(obstacle.get("id","")).begins_with(str(definition.obstaclePrefix)):row.ids.append(str(obstacle.id))
		additional_houses.append(row)

func before_camera() -> void:
	var p := Vector2(world.hero_position.x,-world.hero_position.z)
	update_additional_houses(p)
	var inside: bool = world.final_environment.active_space == "surface" and Rect2(-87.2,-213.2,2.5,5.7).has_point(p)
	if inside != active:
		active = inside
		for id: String in obstacle_ids:
			if active: world.collision.camera_ignored_ids[id] = true
			else: world.collision.camera_ignored_ids.erase(id)
	elif not active: return
	var controller: VarendorCameraController = world.camera_controller
	var yaw: float = controller.smoothed_yaw
	var pitch: float = controller.smoothed_pitch
	var direction := Vector3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))
	var body := Vector3(world.hero_position.x,world.hero_position.y-world.jump_offset+1.35,world.hero_position.z)
	var camera: Vector3 = body+Vector3(-sin(yaw),0,-cos(yaw))*controller.LOOK_AHEAD+direction*controller.smoothed_distance
	hidden_names.clear()
	for index: int in range(parts.size()):
		var hidden: bool = active and (boxes[index].intersects_segment(body-Vector3.UP*.45,camera)!=null or boxes[index].intersects_segment(body+Vector3.UP*.4,camera)!=null)
		parts[index].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if hidden else shadow_modes[index]
		if hidden: hidden_names.append(str(parts[index].name))

func update_additional_houses(p: Vector2) -> void:
	var controller: VarendorCameraController = world.camera_controller
	var yaw: float = controller.smoothed_yaw
	var pitch: float = controller.smoothed_pitch
	var direction := Vector3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))
	var body := Vector3(world.hero_position.x,world.hero_position.y-world.jump_offset+1.35,world.hero_position.z)
	var camera: Vector3 = body+Vector3(-sin(yaw),0,-cos(yaw))*controller.LOOK_AHEAD+direction*controller.smoothed_distance
	for row: Dictionary in additional_houses:
		var low: Array = row.stairs.min;var high: Array = row.stairs.max
		var inside: bool = world.final_environment.active_space == "surface" and Rect2(float(low[0]),float(low[1]),float(high[0])-float(low[0]),float(high[1])-float(low[1])).has_point(p)
		if inside != bool(row.active):
			row.active=inside
			for id: String in row.ids:
				if inside: world.collision.camera_ignored_ids[id]=true
				else: world.collision.camera_ignored_ids.erase(id)
		elif not inside: continue
		for index: int in range(row.parts.size()):
			var hidden: bool = inside and (row.boxes[index].intersects_segment(body-Vector3.UP*.45,camera)!=null or row.boxes[index].intersects_segment(body+Vector3.UP*.4,camera)!=null)
			row.parts[index].cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if hidden else row.shadows[index]
