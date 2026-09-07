class_name VarendorWorld
extends Node3D

signal picked(entity_id: String)
signal moved_to(point: Vector2)

var data: Dictionary
var terrain: Dictionary
var camera: Camera3D
var actors: Dictionary = {}
var templates: Dictionary = {}
var hero_id: String = ""
var hero_position: Vector3 = Vector3(-7, 0, 11)
var server_position: Vector3 = hero_position
var movement: Vector2 = Vector2.ZERO
var camera_yaw: float = 0.0
var camera_pitch: float = .72
var camera_distance: float = 21.0
var target_id: String = ""
var target_ring: MeshInstance3D
var hero_speed: float = 6.2
var current_snapshot: Dictionary = {}
var last_event: int = 0
var floaters: Array = []

func setup(game: Dictionary) -> void:
	data = game
	terrain = JSON.parse_string(FileAccess.get_file_as_string("res://generated/terrain.json"))
	var scene: PackedScene = load("res://generated/world.glb")
	add_child(scene.instantiate())
	var environment: WorldEnvironment = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("788788")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("bdc9dc")
	env.ambient_light_energy = .62
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color("8b9995")
	env.fog_density = .0024
	environment.environment = env
	add_child(environment)
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48, -35, 0)
	sun.light_color = Color("ffe3ba")
	sun.light_energy = 1.65
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90
	add_child(sun)
	camera = Camera3D.new()
	camera.fov = 49
	camera.near = .15
	camera.far = 360
	add_child(camera)
	camera.current = true
	var ring: TorusMesh = TorusMesh.new()
	ring.inner_radius = .57
	ring.outer_radius = .66
	ring.rings = 24
	ring.ring_segments = 8
	target_ring = MeshInstance3D.new()
	target_ring.mesh = ring
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.albedo_color = Color("e2ab52")
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	target_ring.material_override = material
	target_ring.visible = false
	add_child(target_ring)
	for npc: Dictionary in [{"id":"npc:shop","name":"Торговец","model":"Ranger","x":.3,"z":-7.8}, {"id":"npc:elder","name":"Старейшина","model":"Wizard","x":-7,"z":-2.6}, {"id":"npc:teleport","name":"Хранитель портала","model":"Monk","x":-7,"z":-20}]:
		var actor: Node3D = make_actor(npc.id, npc.model, 2.05, npc.name, Color("e2c382"))
		actor.position = point(npc.x, npc.z)
		actor.set_meta("destination", actor.position)
		animate(actor, "idle")

func height_at(x: float, z: float) -> float:
	var cols: int = int(terrain.columns)
	var rows: int = int(terrain.rows)
	var gx: float = clampf((x + terrain.width / 2.0) * cols / terrain.width, 0, cols - .000001)
	var gz: float = clampf((terrain.depth / 2.0 - z) * rows / terrain.depth, 0, rows - .000001)
	var ix: int = int(gx)
	var iz: int = int(gz)
	var u: float = gx - ix
	var v: float = gz - iz
	var h: Array = terrain.heights
	var a: float = h[iz * (cols + 1) + ix]
	var b: float = h[iz * (cols + 1) + ix + 1]
	var c: float = h[(iz + 1) * (cols + 1) + ix]
	var d: float = h[(iz + 1) * (cols + 1) + ix + 1]
	var y: float = a + u * (b - a) + v * (d - b) if u >= v else a + u * (d - c) + v * (c - a)
	for platform: Dictionary in terrain.platforms:
		if absf(x - platform.x) <= platform.width / 2.0 and absf(z - platform.z) <= platform.depth / 2.0:
			y = maxf(y, platform.y)
	return y

func point(x: float, z: float, offset: float = 0.0) -> Vector3:
	return Vector3(x, height_at(x, z) + offset, -z)

func make_actor(id: String, model: String, size: float, title: String, color: Color) -> Node3D:
	if actors.has(id):
		return actors[id]
	var root: Node3D = Node3D.new()
	add_child(root)
	if not templates.has(model):
		var path: String = "res://generated/actors/" + model + (".gltf" if model in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk"] else ".glb")
		templates[model] = load(path)
	var visual: Node3D = (templates[model] as PackedScene).instantiate()
	root.add_child(visual)
	var bounds: AABB = AABB()
	var first: bool = true
	for node: Node in visual.find_children("*", "MeshInstance3D", true, false):
		var mesh: MeshInstance3D = node
		var box: AABB = (visual.global_transform.affine_inverse() * mesh.global_transform) * mesh.get_aabb()
		bounds = box if first else bounds.merge(box)
		first = false
	if bounds.size.y > .001:
		var scale_factor: float = size / bounds.size.y
		visual.scale = Vector3.ONE * scale_factor
		visual.position.y = -bounds.position.y * scale_factor
	var label: Label3D = Label3D.new()
	label.text = title
	label.font_size = 32
	label.pixel_size = .012
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.modulate = color
	label.position.y = size + .38
	label.outline_modulate = Color("151819")
	label.outline_size = 8
	root.add_child(label)
	root.set_meta("label", label)
	root.set_meta("visual", visual)
	var players: Array[Node] = visual.find_children("*", "AnimationPlayer", true, false)
	if not players.is_empty():
		root.set_meta("player", players[0])
	root.set_meta("destination", root.position)
	root.set_meta("action", "")
	actors[id] = root
	return root

func animate(actor: Node3D, action: String) -> void:
	if str(actor.get_meta("action")) == action or not actor.has_meta("player"):
		return
	var player: AnimationPlayer = actor.get_meta("player")
	var candidates: Array = ["idle_weapon", "idle", "survey", "flying"]
	if action == "walk":
		candidates = ["run", "running", "walk", "walking", "flying"]
	elif action == "attack":
		candidates = ["attack", "sword", "punch", "bite", "shoot", "spell"]
	elif action == "death":
		candidates = ["death", "die"]
	elif action == "jump":
		candidates = ["jump", "flying", "idle"]
	for match_text: String in candidates:
		for clip: String in player.get_animation_list():
			if match_text in clip.to_lower() and "reset" not in clip.to_lower():
				var animation: Animation = player.get_animation(clip)
				animation.loop_mode = Animation.LOOP_LINEAR if action in ["idle", "walk"] else Animation.LOOP_NONE
				player.play(clip, .12)
				actor.set_meta("action", action)
				return

func apply_snapshot(snapshot: Dictionary) -> void:
	current_snapshot = snapshot
	var hero: Dictionary = snapshot.character
	var new_hero: bool = hero_id != str(hero.id)
	hero_id = str(hero.id)
	server_position = point(hero.x, hero.z, hero.get("yOffset", 0))
	hero_speed = float(hero.stats.get("speed", 6.2))
	if new_hero or hero_position.distance_to(server_position) > 3.5 or hero.dead:
		hero_position = server_position
	var keep: Dictionary = {"npc:shop":true,"npc:elder":true,"npc:teleport":true}
	var people: Array = snapshot.get("heroes", []).duplicate()
	# Character is authoritative even when the nearby-heroes list omits self.
	people.append(hero)
	for person: Dictionary in people:
		var id: String = str(person.id)
		keep[id] = true
		var actor: Node3D = make_actor(id, data.classes[person.classId].model, 2.05, person.name + " · " + str(person.get("level", "")), Color("e8dfcb") if id == hero_id else Color("9bc5cf"))
		actor.set_meta("destination", point(person.x, person.z, person.get("yOffset", 0)))
		actor.rotation.y = -float(person.get("yaw", 0)) + PI
		animate(actor, str(person.get("action", "idle")))
	for monster: Dictionary in snapshot.get("monsters", []):
		if Vector2(monster.x - hero.x, monster.z - hero.z).length() > 85:
			continue
		var id: String = str(monster.uid)
		keep[id] = true
		var def: Dictionary = data.monsters[monster.id]
		var actor: Node3D = make_actor(id, def.model, 2.05 * float(def.get("scale", 1)), def.name + " · " + str(def.level), Color("e0a6a0"))
		actor.set_meta("destination", point(monster.x, monster.z, monster.get("yOffset", 0)))
		actor.rotation.y = -float(monster.get("yaw", 0)) + PI
		actor.visible = monster.alive or (snapshot.time - monster.get("actionStartedAt", 0) < 4000)
		animate(actor, "death" if not monster.alive else str(monster.get("action", "idle")))
	for summon: Dictionary in snapshot.get("summons", []):
		var id: String = str(summon.uid)
		keep[id] = true
		var actor: Node3D = make_actor(id, "Skeleton", 1.9, "Призванный скелет", Color("86b3c2"))
		actor.set_meta("destination", point(summon.x, summon.z, summon.get("yOffset", 0)))
		actor.rotation.y = -float(summon.get("yaw", 0)) + PI
		animate(actor, str(summon.get("action", "idle")))
	for id: String in actors.keys():
		if not keep.has(id):
			actors[id].queue_free()
			actors.erase(id)
	for event: Dictionary in snapshot.get("events", []):
		if int(event.sequence) <= last_event:
			continue
		last_event = int(event.sequence)
		if event.get("kind") in ["hit", "miss"] and actors.has(str(event.get("target", ""))):
			var target: Node3D = actors[str(event.target)]
			var label: Label3D = Label3D.new()
			label.text = str(int(event.amount)) if event.has("amount") else "Промах"
			label.font_size = 48 if event.get("critical", false) else 36
			label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			label.no_depth_test = true
			label.modulate = Color("ffc86b") if event.get("critical", false) else Color("f0ded0")
			label.position = target.position + Vector3(0, 2.6, 0)
			add_child(label)
			floaters.append({"node":label,"left":1.0})

func blocked(position: Vector3) -> bool:
	var x: float = position.x
	var z: float = -position.z
	var y: float = height_at(x, z)
	for collider: Dictionary in terrain.colliders:
		if collider.top < y + .38 or collider.bottom > y + 1.7:
			continue
		var offset: Vector2 = Vector2(x - collider.x, z - collider.z)
		if collider.kind == "circle":
			if offset.length_squared() < pow(float(collider.radius) + .4, 2):
				return true
		else:
			var local: Vector2 = offset.rotated(float(collider.rotation))
			if absf(local.x) < collider.halfX + .4 and absf(local.y) < collider.halfZ + .4:
				return true
	return false

func _process(delta: float) -> void:
	if camera == null:
		return
	var dt: float = minf(delta, .05)
	if not current_snapshot.is_empty():
		var hero: Dictionary = current_snapshot.character
		if not hero.dead and not movement.is_zero_approx():
			var displacement: Vector3 = Vector3(movement.x, 0, -movement.y) * hero_speed * dt
			var next: Vector3 = hero_position + displacement
			if not blocked(next):
				hero_position = next
			else:
				for slide: Vector3 in [Vector3(displacement.x, 0, 0), Vector3(0, 0, displacement.z)]:
					if not blocked(hero_position + slide):
						hero_position += slide
			hero_position.y = height_at(hero_position.x, -hero_position.z) + float(hero.get("yOffset", 0))
			hero_position = hero_position.lerp(server_position, 1.0 - exp(-2.0 * dt))
		else:
			hero_position = hero_position.lerp(server_position, 1.0 - exp(-14.0 * dt))
	for id: String in actors:
		var actor: Node3D = actors[id]
		actor.position = hero_position if id == hero_id else actor.position.lerp(actor.get_meta("destination"), 1.0 - exp(-15.0 * dt))
		if id == hero_id and not movement.is_zero_approx():
			actor.rotation.y = -atan2(movement.x, movement.y) + PI
			animate(actor, "walk")
	var pivot: Vector3 = hero_position + Vector3(0, 1.25, 0)
	camera.position = pivot + Vector3(sin(camera_yaw) * cos(camera_pitch), sin(camera_pitch), cos(camera_yaw) * cos(camera_pitch)) * camera_distance
	camera.look_at(pivot)
	target_ring.visible = actors.has(target_id) and actors[target_id].visible
	if target_ring.visible:
		target_ring.position = actors[target_id].position + Vector3(0, .13, 0)
	for floater: Dictionary in floaters.duplicate():
		floater.left -= delta
		floater.node.position.y += delta * 1.2
		floater.node.modulate.a = maxf(0, floater.left)
		if floater.left <= 0:
			floater.node.queue_free()
			floaters.erase(floater)

func click(screen: Vector2) -> void:
	var closest: float = 55.0
	var selected: String = ""
	for id: String in actors:
		var actor: Node3D = actors[id]
		if id == hero_id or not actor.visible or camera.is_position_behind(actor.position):
			continue
		var distance: float = camera.unproject_position(actor.position + Vector3(0, 1, 0)).distance_to(screen)
		if distance < closest:
			closest = distance
			selected = id
	if not selected.is_empty():
		target_id = selected
		picked.emit(selected)
		return
	var origin: Vector3 = camera.project_ray_origin(screen)
	var direction: Vector3 = camera.project_ray_normal(screen)
	var previous: Vector3 = origin
	for index: int in range(1, 700):
		var position: Vector3 = origin + direction * index * .5
		if position.y <= height_at(position.x, -position.z):
			for step: int in range(8):
				var midpoint: Vector3 = (position + previous) * .5
				if midpoint.y <= height_at(midpoint.x, -midpoint.z):
					position = midpoint
				else:
					previous = midpoint
			moved_to.emit(Vector2(position.x, -position.z))
			return
		previous = position
