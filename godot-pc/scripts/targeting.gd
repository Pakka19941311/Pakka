class_name VarendorTargeting
extends RefCounted

var selected_id: String = ""
var selected_generation: int = -1
var current: Dictionary = {}
var world: VarendorWorld

func setup(value: VarendorWorld) -> void:
	world = value

func select(id: String) -> void:
	selected_id = id
	selected_generation = -1
	current = {}

func clear() -> void:
	selected_id = ""
	selected_generation = -1
	current = {}

func reconcile(snapshot: Dictionary) -> void:
	if selected_id.is_empty() or selected_id.begins_with("npc:"): return
	var entity: Dictionary = {}
	for monster: Dictionary in snapshot.get("monsters", []):
		if str(monster.uid) == selected_id:
			entity = monster
			break
	if entity.is_empty() or not bool(entity.alive) or float(entity.hp) <= 0:
		clear()
		return
	var next_generation: int = int(entity.get("generation", 0))
	if selected_generation >= 0 and selected_generation != next_generation:
		clear()
		return
	selected_generation = next_generation
	var hero: Dictionary = snapshot.character
	current = {"id":selected_id,"generation":next_generation,"name":world.data.monsters[entity.id].name,"hp":entity.hp,"alive":true,"distance":Vector2(hero.x-entity.x,hero.z-entity.z).length(),"attackRange":hero.get("attackRange",2.6),"combatState":hero.get("combatState","idle"),"entity":entity}

func pick(screen: Vector2) -> String:
	var origin: Vector3 = world.camera.project_ray_origin(screen)
	var direction: Vector3 = world.camera.project_ray_normal(screen)
	var closest: float = INF
	var selected: String = ""
	for id: String in world.actors:
		var actor: Node3D = world.actors[id]
		if id == world.hero_id or not actor.visible or actor.get_meta("dead", false) or not actor.get_meta("pickable", false): continue
		var size: Vector3 = actor.get_meta("pick_size")
		var inverse: Transform3D = actor.global_transform.affine_inverse()
		var bounds: AABB = AABB(Vector3(-size.x/2,0,-size.z/2),size).grow(.12)
		var hit = bounds.intersects_ray(inverse * origin,inverse.basis * direction)
		if hit != null:
			var point: Vector3 = actor.global_transform * hit
			var distance: float = origin.distance_to(point)
			if distance < closest and world.collision.ray_distance(origin,point) >= distance-.05:
				closest = distance
				selected = id
	return selected

func ground(screen: Vector2) -> Variant:
	var origin: Vector3 = world.camera.project_ray_origin(screen)
	var direction: Vector3 = world.camera.project_ray_normal(screen)
	var previous: Vector3 = origin
	for index: int in range(1,700):
		var point: Vector3 = origin+direction*index*.5
		if point.y <= world.height_at(point.x,-point.z):
			for step: int in range(8):
				var middle: Vector3 = (point+previous)*.5
				if middle.y <= world.height_at(middle.x,-middle.z): point = middle
				else: previous = middle
			# A ground ray hitting a wall first is not a request to walk through it.
			if world.collision.ray_distance(origin,point) < origin.distance_to(point)-.1: return null
			var goal: Vector2 = world.collision.nearest_free(Vector2(point.x,-point.z).clamp(Vector2(-155,-135),Vector2(155,135)))
			return null if world.collision.blocked(goal) else goal
		previous = point
	return null
