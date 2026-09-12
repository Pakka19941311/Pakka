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

func before_camera() -> void:
	var p := Vector2(world.hero_position.x,-world.hero_position.z)
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
