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
var collision: VarendorCollision = VarendorCollision.new()
var effects: Array = []
var arrival_marker: MeshInstance3D
var click_goal: Variant = null
var predicted_velocity: Vector2 = Vector2.ZERO
var snapshot_age: float = 0.0
var snapshot_interval: float = .1
var generation: int = -1
var sent_sequence: int = 0
var pending_inputs: Array = []
var sun_light: DirectionalLight3D
var world_environment: Environment
var show_names: bool = true
var decorations: Array[GeometryInstance3D] = []
signal loot_received(message: String)

func setup(game: Dictionary) -> bool:
	data = game
	terrain = JSON.parse_string(FileAccess.get_file_as_string("res://generated/terrain.json"))
	collision.setup(terrain.colliders)
	if ResourceLoader.load_threaded_request("res://generated/world.glb") != OK:
		return false
	while ResourceLoader.load_threaded_get_status("res://generated/world.glb") == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
		await get_tree().process_frame
	var scene: PackedScene = ResourceLoader.load_threaded_get("res://generated/world.glb")
	if scene == null:
		return false
	var environment_world: Node3D = scene.instantiate()
	add_child(environment_world)
	for mesh: Node in environment_world.find_children("*", "GeometryInstance3D", true, false):
		if "fern" in str(mesh.name).to_lower() or "shrub" in str(mesh.name).to_lower() or "grass" in str(mesh.name).to_lower():
			decorations.append(mesh)
	# Blender exports photometric intensities (5087/9001 cd). Compatibility uses
	# relative energy here; copying those values clips the whole settlement white.
	for node: Node in environment_world.find_children("*", "OmniLight3D", true, false):
		var fire_light: OmniLight3D = node
		fire_light.light_energy = 1.0
		fire_light.omni_range = 5.0
		fire_light.omni_attenuation = 1.6
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
	world_environment = env
	add_child(environment)
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	sun_light = sun
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
	arrival_marker = target_ring.duplicate()
	add_child(arrival_marker)
	arrival_marker.scale = Vector3(.65, .65, .65)
	arrival_marker.visible = false
	for npc: Dictionary in [{"id":"npc:shop","name":"Торговка Эльза","model":"Ranger","x":.3,"z":-7.8}, {"id":"npc:elder","name":"Староста Роэн","model":"Warrior","x":-7,"z":-2.6}, {"id":"npc:smith","name":"Кузнец Бран","model":"Warrior","x":-17.5,"z":-12.6}, {"id":"npc:teleport","name":"Проводник Каэль","model":"Wizard","x":-7,"z":-20}]:
		var actor: Node3D = make_actor(npc.id, npc.model, 2.05, npc.name, Color("e2c382"))
		actor.position = point(npc.x, npc.z)
		actor.set_meta("destination", actor.position)
		animate(actor, "idle")

	# Load each shared actor template during loading, before exploration.
	for model: String in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk", "Fox", "Slime", "Skeleton", "Dragon", "Bat"]:
		if not templates.has(model):
			var path: String = "res://generated/actors/" + model + (".gltf" if model in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk"] else ".glb")
			templates[model] = load(path)
		await get_tree().process_frame
	return true

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
	root.set_meta("pick_size", Vector3(maxf(.75, bounds.size.x * size / maxf(.001, bounds.size.y)), size, maxf(.75, bounds.size.z * size / maxf(.001, bounds.size.y))))
	root.set_meta("pickable", id.begins_with("npc:"))
	root.set_meta("yaw", 0.0)
	root.set_meta("previous", root.position)
	root.set_meta("initialized", false)
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
	snapshot_interval = clampf(snapshot_age, .05, .2)
	snapshot_age = 0
	current_snapshot = snapshot
	var hero: Dictionary = snapshot.character
	var new_hero: bool = hero_id != str(hero.id)
	hero_id = str(hero.id)
	server_position = point(hero.x, hero.z, hero.get("yOffset", 0))
	hero_speed = float(hero.stats.get("speed", 6.2))
	if new_hero or int(hero.generation) != generation or hero_position.distance_to(server_position) > 3.5 or hero.dead:
		hero_position = server_position
		predicted_velocity = Vector2.ZERO
		pending_inputs.clear()
		click_goal = null
		target_id = ""
		generation = int(hero.generation)
	for pending_input: Dictionary in pending_inputs.duplicate():
		if int(pending_input.sequence) <= int(hero.lastInputSequence):
			pending_inputs.erase(pending_input)
	var keep: Dictionary = {"npc:shop":true,"npc:elder":true,"npc:smith":true,"npc:teleport":true}
	var people: Array = snapshot.get("heroes", []).duplicate()
	# Character is authoritative even when the nearby-heroes list omits self.
	people = people.filter(func(person: Dictionary): return str(person.id) != hero_id)
	people.append(hero)
	for person: Dictionary in people:
		var id: String = str(person.id)
		keep[id] = true
		var actor: Node3D = make_actor(id, data.classes[person.classId].model, 2.05, person.name + " · " + str(person.get("level", "")), Color("e8dfcb") if id == hero_id else Color("9bc5cf"))
		set_destination(actor, point(person.x, person.z, person.get("yOffset", 0)))
		actor.set_meta("yaw", -float(person.get("yaw", 0)) + PI)
		apply_motion(actor, person)
	for monster: Dictionary in snapshot.get("monsters", []):
		if Vector2(monster.x - hero.x, monster.z - hero.z).length() > 115:
			continue
		var id: String = str(monster.uid)
		keep[id] = true
		var def: Dictionary = data.monsters[monster.id]
		var actor: Node3D = make_actor(id, def.model, 2.05 * float(def.get("scale", 1)), def.name + " · " + str(def.level), Color("e0a6a0"))
		set_destination(actor, point(monster.x, monster.z, monster.get("yOffset", 0)))
		actor.set_meta("pickable", bool(monster.alive))
		actor.set_meta("yaw", -float(monster.get("yaw", 0)) + PI)
		actor.visible = monster.alive or (snapshot.time - monster.get("actionStartedAt", 0) < 4000)
		apply_motion(actor, monster, "death" if not monster.alive else "")
	for summon: Dictionary in snapshot.get("summons", []):
		var id: String = str(summon.uid)
		keep[id] = true
		var actor: Node3D = make_actor(id, "Skeleton", 1.9, "Призванный скелет", Color("86b3c2"))
		set_destination(actor, point(summon.x, summon.z, summon.get("yOffset", 0)))
		actor.set_meta("yaw", -float(summon.get("yaw", 0)) + PI)
		apply_motion(actor, summon)
	for id: String in actors.keys():
		if not keep.has(id):
			actors[id].queue_free()
			actors.erase(id)
	for event: Dictionary in snapshot.get("events", []):
		if int(event.sequence) <= last_event:
			continue
		last_event = int(event.sequence)
		if event.kind == "release":
			show_release(event)
		elif event.kind in ["buff", "summon"] and actors.has(str(event.actor)):
			show_aura(actors[str(event.actor)].position, Color("7da4eb") if event.kind == "buff" else Color("b38bd9"))
		elif event.kind == "loot" and str(event.actor) == hero_id:
			var names: Array = []
			for item_id: String in event.get("items", []):
				names.append(str(data.items.get(item_id, {}).get("name", item_id)))
			var message: String = "+%d золота · +%d опыта" % [event.get("gold", 0), event.get("xp", 0)]
			if not names.is_empty():
				message += "\n" + ", ".join(names)
			loot_received.emit("Добыча: " + message)
			if actors.has(str(event.get("target", ""))):
				show_text(actors[str(event.target)].position, message, Color("edcd83"), 4.0)
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

func apply_motion(actor: Node3D, motion: Dictionary, override_action: String = "") -> void:
	var action: String = override_action if not override_action.is_empty() else str(motion.get("action", "idle"))
	var start: float = float(motion.get("actionStartedAt", 0))
	if action in ["attack", "jump", "death"] and start != float(actor.get_meta("action_start", -1)):
		actor.set_meta("action", "")
		actor.set_meta("action_start", start)
	animate(actor, action)

func blocked(position: Vector3) -> bool:
	return collision.blocked(Vector2(position.x, -position.z))

func set_destination(actor: Node3D, destination: Vector3) -> void:
	actor.set_meta("previous", actor.get_meta("destination"))
	actor.set_meta("destination", destination)
	if not actor.get_meta("initialized") or actor.position.distance_to(destination) > 8:
		actor.position = destination
		actor.set_meta("previous", destination)
		actor.set_meta("initialized", true)

func record_intent(value: Dictionary, input_sequence: int) -> void:
	sent_sequence = input_sequence
	pending_inputs.append({"sequence":input_sequence,"intent":value.duplicate()})
	if value.type in ["attack", "cancel"] or (value.type == "direction" and Vector2(value.x, value.z).length() > .01):
		click_goal = null
	if value.type == "destination":
		click_goal = collision.nearest_free(Vector2(value.x, value.z))

func _process(delta: float) -> void:
	if camera == null:
		return
	var dt: float = minf(delta, .05)
	snapshot_age += delta
	if not current_snapshot.is_empty():
		var hero: Dictionary = current_snapshot.character
		var local: Vector2 = movement
		var pos: Vector2 = Vector2(hero_position.x, -hero_position.z)
		if click_goal != null and pos.distance_to(click_goal) < .25:
			click_goal = null
		# Predict manual input immediately. Click/auto-approach follows the server's
		# path with bounded velocity extrapolation, never walks through a wall.
		if not hero.dead and not local.is_zero_approx():
			predicted_velocity = predicted_velocity.lerp(local * hero_speed, 1.0 - exp(-19.0 * dt))
			var next: Vector2 = collision.resolve(pos, predicted_velocity * dt)
			hero_position = point(next.x, next.y, float(hero.get("yOffset", 0)))
			if pending_inputs.is_empty():
				hero_position = hero_position.lerp(server_position, 1 - exp(-3 * dt))
		elif actors.has(hero_id):
			predicted_velocity = Vector2.ZERO
			var previous: Vector3 = actors[hero_id].get_meta("previous")
			var velocity: Vector3 = (server_position - previous) / snapshot_interval
			velocity = velocity.limit_length(hero_speed)
			var extra: Vector3 = velocity * minf(snapshot_age, .12) if hero.action == "walk" else Vector3.ZERO
			var next: Vector2 = collision.resolve(Vector2(server_position.x, -server_position.z), Vector2(extra.x, -extra.z))
			var desired: Vector3 = point(next.x, next.y, float(hero.get("yOffset", 0)))
			if click_goal != null and not pending_inputs.is_empty():
				var walk: Vector2 = (click_goal - pos).limit_length(hero_speed * dt)
				var preview: Vector2 = collision.resolve(pos, walk)
				desired = point(preview.x, preview.y, float(hero.get("yOffset", 0)))
			hero_position = hero_position.lerp(desired, 1 - exp(-24 * dt))
	for id: String in actors:
		var actor: Node3D = actors[id]
		var destination: Vector3 = actor.get_meta("destination")
		actor.position = hero_position if id == hero_id else (actor.get_meta("previous") as Vector3).lerp(destination, clampf(snapshot_age / snapshot_interval, 0, 1))
		actor.rotation.y = lerp_angle(actor.rotation.y, float(actor.get_meta("yaw")), 1 - exp(-18 * dt))
		(actor.get_meta("label") as Label3D).visible = show_names
		if id == hero_id and not movement.is_zero_approx():
			actor.rotation.y = lerp_angle(actor.rotation.y, -atan2(movement.x, movement.y) + PI, 1 - exp(-16 * dt))
			animate(actor, "walk")
	var pivot: Vector3 = hero_position + Vector3(0, 1.25, 0)
	var offset: Vector3 = Vector3(sin(camera_yaw) * cos(camera_pitch), sin(camera_pitch), cos(camera_yaw) * cos(camera_pitch))
	var distance: float = maxf(.6, collision.ray_distance(pivot, pivot + offset * camera_distance, .22) - .12)
	camera.position = pivot + offset * distance
	camera.position.y = maxf(camera.position.y, height_at(camera.position.x, -camera.position.z) + .3)
	camera.look_at(pivot)
	target_ring.visible = actors.has(target_id) and actors[target_id].visible and actors[target_id].get_meta("pickable", false)
	if target_ring.visible:
		target_ring.position = actors[target_id].position + Vector3(0, .13, 0)
	arrival_marker.visible = click_goal != null
	if click_goal != null:
		arrival_marker.position = point(click_goal.x, click_goal.y, .12)
	for effect: Dictionary in effects.duplicate():
		effect.left -= delta
		var progress: float = 1 - maxf(0, effect.left) / effect.duration
		if effect.has("end"):
			effect.node.position = (effect.start as Vector3).lerp(effect.end, progress)
		else:
			effect.node.scale = Vector3.ONE * (.5 + progress * 1.7)
		if effect.left <= 0:
			effect.node.queue_free()
			effects.erase(effect)
	for floater: Dictionary in floaters.duplicate():
		floater.left -= delta
		floater.node.position.y += delta * 1.2
		floater.node.modulate.a = maxf(0, floater.left)
		if floater.left <= 0:
			floater.node.queue_free()
			floaters.erase(floater)

func pick_entity(screen: Vector2) -> String:
	var origin: Vector3 = camera.project_ray_origin(screen)
	var direction: Vector3 = camera.project_ray_normal(screen)
	var closest: float = INF
	var selected: String = ""
	for id: String in actors:
		var actor: Node3D = actors[id]
		if id == hero_id or not actor.visible or not actor.get_meta("pickable", false):
			continue
		var size: Vector3 = actor.get_meta("pick_size")
		var transform_inverse: Transform3D = actor.global_transform.affine_inverse()
		var local_origin: Vector3 = transform_inverse * origin
		var local_direction: Vector3 = transform_inverse.basis * direction
		var bounds: AABB = AABB(Vector3(-size.x / 2, 0, -size.z / 2), size).grow(.12)
		var hit = bounds.intersects_ray(local_origin, local_direction)
		if hit != null:
			var location: Vector3 = actor.global_transform * hit
			var distance: float = origin.distance_to(location)
			if distance < closest and collision.ray_distance(origin, location) >= distance - .05:
				closest = distance
				selected = id
	return selected

func click(screen: Vector2) -> void:
	var selected: String = pick_entity(screen)
	if not selected.is_empty():
		target_id = selected
		click_goal = null
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
			var goal: Vector2 = collision.nearest_free(Vector2(position.x, -position.z).clamp(Vector2(-155, -135), Vector2(155, 135)))
			if not collision.blocked(goal):
				click_goal = goal
				target_id = ""
				moved_to.emit(goal)
			return
		previous = position

func show_text(position_value: Vector3, message: String, color: Color, duration: float = 1.0) -> void:
	var text_node: Label3D = Label3D.new()
	text_node.text = message
	text_node.font_size = 32
	text_node.pixel_size = .01
	text_node.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	text_node.no_depth_test = true
	text_node.modulate = color
	text_node.position = position_value + Vector3(0, 2.4, 0)
	add_child(text_node)
	floaters.append({"node":text_node,"left":duration})

func effect_mesh(color: Color, mesh: Mesh) -> MeshInstance3D:
	var node: MeshInstance3D = MeshInstance3D.new()
	node.mesh = mesh
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	node.material_override = material
	add_child(node)
	return node

func show_aura(position_value: Vector3, color: Color) -> void:
	var ring: TorusMesh = TorusMesh.new()
	ring.inner_radius = .55
	ring.outer_radius = .65
	var node: MeshInstance3D = effect_mesh(color, ring)
	node.position = position_value + Vector3(0, .25, 0)
	effects.append({"node":node,"left":.6,"duration":.6})

func show_release(event: Dictionary) -> void:
	if not actors.has(str(event.actor)) or not actors.has(str(event.get("target", ""))):
		return
	var start: Vector3 = actors[str(event.actor)].position + Vector3(0, 1.15, 0)
	var end: Vector3 = actors[str(event.target)].position + Vector3(0, .85, 0)
	var colors: Dictionary = {"fire":Color("ff7736"),"ice":Color("83ddff"),"lightning":Color("d7c2ff"),"poison":Color("91d45b"),"bone":Color("cbaddd"),"drain":Color("cf6689"),"shadow":Color("a882d8"),"arrow":Color("e5d1a1"),"slash":Color("f2dfb3")}
	var color: Color = colors.get(event.get("effect", "slash"), Color("b3a0e3"))
	var duration: float = float(event.get("durationMs", 0)) / 1000.0
	if duration > 0:
		var sphere: SphereMesh = SphereMesh.new()
		sphere.radius = .16
		sphere.height = .32
		var node: MeshInstance3D = effect_mesh(color, sphere)
		node.position = start
		effects.append({"node":node,"start":start,"end":end,"left":duration,"duration":duration})
	else:
		var beam: CylinderMesh = CylinderMesh.new()
		beam.top_radius = .035
		beam.bottom_radius = .07
		beam.height = start.distance_to(end)
		var node: MeshInstance3D = effect_mesh(color, beam)
		node.position = (start + end) / 2
		if start.distance_to(end) > .01:
			node.quaternion = Quaternion(Vector3.UP, (end - start).normalized())
		effects.append({"node":node,"left":.12,"duration":.12,"start":node.position,"end":node.position})
