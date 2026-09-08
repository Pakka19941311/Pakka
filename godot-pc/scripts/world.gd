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
var camera_controller: VarendorCameraController = VarendorCameraController.new()
var player_motion: VarendorPlayerMovement = VarendorPlayerMovement.new()
var targeting: VarendorTargeting = VarendorTargeting.new()
var timeline: SnapshotTimeline = SnapshotTimeline.new()
var ambient_residents: VarendorAmbientResidents = VarendorAmbientResidents.new()
var camera_yaw: float:
	get: return camera_controller.yaw
	set(value): camera_controller.yaw = value
var camera_pitch: float:
	get: return camera_controller.pitch
	set(value): camera_controller.pitch = value
var camera_distance: float:
	get: return camera_controller.distance
	set(value): camera_controller.distance = clampf(value,5.5,18.0)
var movement: Vector2:
	get: return player_motion.input_direction
	set(value): player_motion.submit({"type":"direction","x":value.x,"z":value.y})
var jump_offset: float:
	get: return player_motion.height
var jump_active: bool:
	get: return not player_motion.grounded
var jump_velocity: float:
	get: return player_motion.vertical_velocity
var labels_layer: Control
var sound_players: Array[AudioStreamPlayer] = []
var sound_streams: Dictionary = {}
var combat_volume: float = .75
var ambient_player: AudioStreamPlayer
var target_id: String:
	get: return targeting.selected_id
	set(value): targeting.select(value) if not value.is_empty() else targeting.clear()
var target_ring: MeshInstance3D
var hero_speed: float = 6.2
var current_snapshot: Dictionary = {}
var last_event: int = 0
var floaters: Array = []
var collision: VarendorCollision = VarendorCollision.new()
var effects: Array = []
var arrival_marker: MeshInstance3D
var click_goal: Variant:
	get: return player_motion.destination
	set(value): player_motion.destination = value
var generation: int = -1
var sun_light: DirectionalLight3D
var world_environment: Environment
var show_names: bool = true
var decorations: Array[GeometryInstance3D] = []
signal loot_received(message: String)
signal snapshot_presented(snapshot: Dictionary)
signal event_presented(event: Dictionary)

func _init() -> void:
	player_motion.collision = collision
	targeting.setup(self)

func receive_snapshot(snapshot: Dictionary) -> void:
	# Validate chronology/lifecycle before ANY consumer mutates live state.
	# A delayed HTTP reply must not rewind prediction after a new SSE generation.
	if not timeline.ingest(snapshot): return
	if timeline.did_resynchronize:
		# Recovery is one explicit authoritative correction after a real outage.
		# Do not fly through seconds of old motion or replay expired projectiles.
		player_motion.identity = ""
		for effect: Dictionary in effects:
			if is_instance_valid(effect.get("node")): effect.node.queue_free()
		effects.clear()
		for floater: Dictionary in floaters:
			if is_instance_valid(floater.get("node")): floater.node.queue_free()
		floaters.clear()
	var reset: bool = player_motion.reconcile(snapshot)
	server_position = point(snapshot.character.x,snapshot.character.z,snapshot.character.yOffset)
	if reset:
		last_event = 0
		hero_position = server_position
		camera_controller.reset_follow()
		targeting.clear()

func submit_intent(value: Dictionary) -> void:
	if str(value.type) == "attack" and value.get("skill") != null and str(value.get("entityId", "")) in ["@self", hero_id, player_motion.identity]:
		var class_id: String = str(player_motion.authoritative.get("classId", current_snapshot.get("character",{}).get("classId", "")))
		var skills: Array = data.get("classes",{}).get(class_id,{}).get("skills",[])
		var index: int = int(value.skill)
		if index >= 0 and index < skills.size() and (skills[index].has("buff") or bool(skills[index].get("summon",false))):
			# Instant self skills keep the server's movement and selected monster.
			# They are not a new pursuit/attack lock in local prediction.
			return
	player_motion.submit(value)
	if value.type == "attack": targeting.select(str(value.entityId))
	# The reference cancels pursuit/attack on WASD, jump and ground commands,
	# while keeping the selected living target for its panel and later skills.
	# Explicit Escape, death/despawn and invalid selection own target clearing.

func reject_intent(value: Dictionary, input_sequence: int, error: String) -> void:
	# An old HTTP rejection must not erase a newer click or manual direction.
	if input_sequence != player_motion.last_sent_sequence or str(value.get("type", "")) != "attack": return
	if error not in ["target-occluded", "missing-target"] or target_id != str(value.get("entityId", "")): return
	targeting.clear()
	player_motion.cancel_planar()
	player_motion.intent_pending = false

func _physics_process(delta: float) -> void:
	player_motion.physics_step(delta)
	if not current_snapshot.is_empty(): ambient_residents.physics_step(delta)


func setup(game: Dictionary) -> bool:
	data = game
	var canvas: CanvasLayer = CanvasLayer.new()
	canvas.layer = 0
	add_child(canvas)
	labels_layer = Control.new()
	labels_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.add_child(labels_layer)
	for sound_name: String in ["sword-swing", "melee-impact", "monster-hit", "monster-death", "monster-aggro", "coin"]:
		sound_streams[sound_name] = load("res://generated/audio/" + sound_name + ".ogg")
	for i: int in range(8):
		var player: AudioStreamPlayer = AudioStreamPlayer.new()
		player.volume_db = -10
		add_child(player)
		sound_players.append(player)
	ambient_player = AudioStreamPlayer.new()
	var forest: AudioStreamMP3 = load("res://generated/audio/forest.mp3")
	forest.loop = true
	ambient_player.stream = forest
	ambient_player.volume_linear = .275
	add_child(ambient_player)
	ambient_player.play()
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
	camera.fov = rad_to_deg(.82)
	camera.near = .15
	camera.far = 360
	add_child(camera)
	camera.current = true
	add_child(camera_controller)
	camera_controller.setup(camera,collision,Callable(self,"height_at"))
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
	for id: String in VarendorNpcInteraction.SERVICES:
		var npc: Dictionary = VarendorNpcInteraction.SERVICES[id]
		var actor: Node3D = make_actor(id, npc.model, 2.05, npc.name, Color("e2c382"))
		# The approved client placed service actors outside nearby stalls/signs.
		# Keep their server service anchor, but never spawn a body inside props.
		var free: Vector2 = collision.nearest_free(Vector2(npc.x,npc.z))
		actor.position = point(free.x, free.y)
		actor.set_meta("destination", actor.position)
		actor.set_meta("previous", actor.position)
		actor.set_meta("initialized", true)

	# Load each shared actor template during loading, before exploration.
	for model: String in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk", "Fox", "Slime", "Skeleton", "Dragon", "Bat"]:
		if not templates.has(model):
			var path: String = "res://generated/actors/" + model + (".gltf" if model in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk"] else ".glb")
			templates[model] = load(path)
		await get_tree().process_frame
	# Local residents have their own 60Hz motion owner; service NPCs above keep
	# their static positions. Install each first pose before it can be rendered.
	ambient_residents.setup(collision)
	for resident: Dictionary in ambient_residents.sample():
		var actor: Node3D = make_actor(str(resident.id),str(resident.model),float(resident.targetHeight),str(resident.name),Color("d4c7af"))
		initialize_pose(actor,point(resident.x,resident.z))
		actor.rotation.y = -float(resident.yaw) + PI
		actor.set_meta("motion",resident)
		actor.set_meta("pickable",false)
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
	label.hide()
	var screen_label: Label = Label.new()
	screen_label.text = title
	screen_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen_label.add_theme_font_size_override("font_size", 14)
	screen_label.add_theme_color_override("font_color", color)
	screen_label.add_theme_color_override("font_outline_color", Color("101619"))
	screen_label.add_theme_constant_override("outline_size", 4)
	labels_layer.add_child(screen_label)
	root.set_meta("screen_label", screen_label)
	root.tree_exiting.connect(screen_label.queue_free)
	root.set_meta("model", model)
	root.set_meta("base_visual", visual.transform)
	root.set_meta("dead", false)
	root.set_meta("attack_left", 0.0)
	root.set_meta("hit_left", 0.0)
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
	var controller: VarendorAnimationController = VarendorAnimationController.new()
	controller.prefer_run = id == hero_id
	controller.bind(root)
	root.set_meta("motion", {})
	actors[id] = root
	return root

func apply_snapshot(snapshot: Dictionary) -> void:
	current_snapshot = snapshot
	var hero: Dictionary = snapshot.character
	hero_id = str(hero.id)
	hero_speed = float(hero.stats.get("speed",6.2))
	if player_motion.identity.is_empty(): player_motion.reconcile(snapshot)
	targeting.reconcile(snapshot)
	var keep: Dictionary = {"npc:shop":true,"npc:elder":true,"npc:smith":true,"npc:teleport":true}
	for resident: Dictionary in ambient_residents.residents: keep[str(resident.id)] = true
	var people: Array = snapshot.get("heroes", []).duplicate()
	# Character is authoritative even when the nearby-heroes list omits self.
	people = people.filter(func(person: Dictionary): return str(person.id) != hero_id)
	people.append(hero)
	for person: Dictionary in people:
		var id: String = str(person.id)
		keep[id] = true
		var actor: Node3D = make_actor(id, data.classes[person.classId].model, 2.05, person.name + (" · %d" % int(person.level) if person.has("level") else ""), Color("e8dfcb") if id == hero_id else Color("9bc5cf"))
		initialize_pose(actor, point(person.x, person.z, person.get("yOffset", 0)))
		actor.set_meta("yaw", -float(person.get("yaw", 0)) + PI)
		actor.set_meta("motion", person.duplicate(true))
		if bool(person.get("dead", false)):
			begin_death(actor)
		elif actor.get_meta("dead", false):
			actor.set_meta("dead", false)
			(actor.get_meta("animation_controller") as VarendorAnimationController).reset_alive()
			(actor.get_meta("visual") as Node3D).transform = actor.get_meta("base_visual")
			actor.set_meta("action", "")
			actor.visible = true

	for monster: Dictionary in snapshot.get("monsters", []):
		if Vector2(monster.x - hero.x, monster.z - hero.z).length() > 115:
			continue
		var id: String = str(monster.uid)
		keep[id] = true
		var def: Dictionary = data.monsters[monster.id]
		var actor: Node3D = make_actor(id, def.model, 2.05 * float(def.get("scale", 1)), def.name + " · %d" % int(def.level), Color("e0a6a0"))
		initialize_pose(actor, point(monster.x, monster.z, monster.get("yOffset", 0)))
		actor.set_meta("pickable", bool(monster.alive))
		actor.set_meta("yaw", -float(monster.get("yaw", 0)) + PI)
		actor.set_meta("motion", monster.duplicate(true))
		if not monster.alive or float(monster.hp) <= 0:
			begin_death(actor)
		elif actor.get_meta("dead", false):
			actor.set_meta("dead", false)
			(actor.get_meta("animation_controller") as VarendorAnimationController).reset_alive()
			(actor.get_meta("visual") as Node3D).transform = actor.get_meta("base_visual")
			actor.set_meta("action", "")
			actor.visible = true

	for summon: Dictionary in snapshot.get("summons", []):
		var id: String = str(summon.uid)
		keep[id] = true
		var actor: Node3D = make_actor(id, "Skeleton", 1.9, "Призванный скелет", Color("86b3c2"))
		initialize_pose(actor, point(summon.x, summon.z, summon.get("yOffset", 0)))
		actor.set_meta("yaw", -float(summon.get("yaw", 0)) + PI)
		actor.set_meta("motion", summon.duplicate(true))

	for id: String in actors.keys():
		if not keep.has(id):
			actors[id].queue_free()
			actors.erase(id)
	for event: Dictionary in snapshot.get("events", []): present_event(event)
	snapshot_presented.emit(snapshot)

func present_event(event: Dictionary) -> void:
	if int(event.sequence) <= last_event: return
	last_event = int(event.sequence)
	if actors.has(str(event.actor)):
		var actor: Node3D = actors[str(event.actor)]
		if event.has("actorGeneration") and int(actor.get_meta("motion", {}).get("generation",event.actorGeneration)) != int(event.actorGeneration): return
		if event.kind in ["attack","release","death","cancel"]:
			(actor.get_meta("animation_controller") as VarendorAnimationController).on_event(event,float(current_snapshot.get("time",0)))
	event_presented.emit(event)
	if event.kind == "death" and target_id == str(event.actor): targeting.clear()
	if event.kind == "attack" and actors.has(str(event.actor)):
		var actor: Node3D = actors[str(event.actor)]
		if not actor.get_meta("dead", false):

			play_sound("sword-swing", actor.position)
	elif event.kind == "death" and actors.has(str(event.actor)):
		begin_death(actors[str(event.actor)])
	elif event.kind == "release":
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
		play_sound("coin", hero_position)
	if event.get("kind") in ["hit", "miss"] and actors.has(str(event.get("target", ""))):
		var target: Node3D = actors[str(event.target)]
		(target.get_meta("animation_controller") as VarendorAnimationController).on_event(event,float(current_snapshot.get("time",0)))
		show_text(target.position, str(int(event.amount)) if event.has("amount") else "Промах", Color("ef7770") if str(event.target) == hero_id else Color("f5d698"), .85)
		show_aura(target.position + Vector3(0, .7, 0), Color("ffcf87"))
		play_sound("melee-impact" if str(event.target) == hero_id else "monster-hit", target.position)

func blocked(position: Vector3) -> bool:
	return collision.blocked(Vector2(position.x, -position.z))

func initialize_pose(actor: Node3D, destination: Vector3) -> void:
	actor.set_meta("previous", actor.position)
	actor.set_meta("destination", destination)
	if not actor.get_meta("initialized"):
		actor.position = destination
		actor.set_meta("previous", destination)
		actor.set_meta("initialized", true)

func record_intent(value: Dictionary, input_sequence: int) -> void:
	player_motion.sent(value,input_sequence)

func _process(delta: float) -> void:
	if camera == null: return
	var before_clock: float = timeline.clock_ms
	var frame: Dictionary = timeline.advance(delta)
	if not frame.snapshot.is_empty(): apply_snapshot(frame.snapshot)
	if not current_snapshot.is_empty(): current_snapshot["time"] = timeline.clock_ms if not timeline.current.is_empty() else current_snapshot.time
	for event: Dictionary in frame.events: present_event(event)
	var presentation_dt: float = maxf(0,(timeline.clock_ms-before_clock)/1000.0) if not timeline.current.is_empty() else delta
	var alpha: float = Engine.get_physics_interpolation_fraction()
	var ambient_poses: Dictionary = {}
	for pose: Dictionary in ambient_residents.sample(alpha): ambient_poses[str(pose.id)] = pose
	var ambient_time: float = maxf(0,ambient_residents.clock_ms - ambient_residents.last_delta * 1000.0 * (1.0-alpha))
	var local_pose: Dictionary = player_motion.render_pose(alpha)
	hero_position = point(local_pose.x,local_pose.z,local_pose.yOffset)
	for id: String in actors:
		var actor: Node3D = actors[id]
		var before: Vector3 = actor.position
		var motion: Dictionary = actor.get_meta("motion", {}).duplicate()
		if id == hero_id:
			actor.position = hero_position
			actor.rotation.y = -float(local_pose.yaw) + PI
			motion.merge(local_pose,true)
			motion["grounded"] = player_motion.grounded
			if player_motion.input_mode == "manual" or player_motion.manual_cancel_pending:
				motion["combatState"] = "idle"
				motion["action"] = "walk" if player_motion.actual_velocity.length() > .08 else "idle"
				motion["actionStartedAt"] = maxf(float(motion.get("actionStartedAt",0)),float(current_snapshot.get("time",0)))
		elif ambient_poses.has(id):
			motion = ambient_poses[id]
			actor.position = point(motion.x,motion.z)
			actor.rotation.y = -float(motion.yaw) + PI
			actor.set_meta("motion",motion)
		elif not id.begins_with("npc:"):
			var pose: Dictionary = timeline.sample_motion(id)
			if pose.is_empty(): pose = motion
			if not pose.is_empty():
				actor.position = point(pose.x,pose.z,pose.get("yOffset",0))
				actor.rotation.y = -float(pose.get("yaw",0)) + PI
		var rendered_velocity: Vector3 = (actor.position-before)/maxf(.0001,delta)
		if id == hero_id: rendered_velocity = Vector3(player_motion.actual_velocity.x,player_motion.vertical_velocity,-player_motion.actual_velocity.y)
		var controller: VarendorAnimationController = actor.get_meta("animation_controller")
		controller.prefer_run = id == hero_id
		var actor_clock: float = ambient_time if ambient_poses.has(id) else timeline.clock_ms if not timeline.current.is_empty() else float(current_snapshot.get("time",0))
		controller.update(motion,rendered_velocity,actor_clock,delta if id == hero_id or ambient_poses.has(id) else presentation_dt)
		actor.visible = not controller.corpse_complete
		(actor.get_meta("label") as Label3D).hide()
	camera_controller.update_pose(delta,hero_position,jump_offset)
	update_nameplates()
	target_ring.visible = actors.has(target_id) and actors[target_id].visible and actors[target_id].get_meta("pickable", false)
	if target_ring.visible:
		target_ring.position = actors[target_id].position + Vector3(0, .13, 0)
	arrival_marker.visible = click_goal != null
	if click_goal != null:
		arrival_marker.position = point(click_goal.x, click_goal.y, .12)
	update_effects(presentation_dt)
	for floater: Dictionary in floaters.duplicate():
		floater.left -= delta
		floater.position.y += delta * .8
		floater.node.position = camera.unproject_position(floater.position) - floater.node.size * .5
		floater.node.visible = not camera.is_position_behind(floater.position)
		floater.node.modulate.a = maxf(0, floater.left)
		if floater.left <= 0:
			floater.node.queue_free()
			floaters.erase(floater)

func pick_entity(screen: Vector2) -> String:
	return targeting.pick(screen)

func click(screen: Vector2) -> bool:
	var selected: String = targeting.pick(screen)
	if not selected.is_empty():
		targeting.select(selected)
		picked.emit(selected)
		return true
	var goal: Variant = targeting.ground(screen)
	if goal != null:
		moved_to.emit(goal)
		return true
	return false

func show_text(position_value: Vector3, message: String, color: Color, duration: float = 1.0) -> void:
	var text_node: Label = Label.new()
	text_node.text = message
	text_node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text_node.add_theme_font_size_override("font_size", 18)
	text_node.add_theme_constant_override("outline_size", 4)
	text_node.add_theme_color_override("font_outline_color", Color("111518"))
	text_node.modulate = color
	labels_layer.add_child(text_node)
	floaters.append({"node":text_node,"position":position_value + Vector3(0, 2.2, 0),"left":duration})

func play_sound(sound_name: String, position_value: Vector3) -> void:
	var distance: float = position_value.distance_to(hero_position)
	if distance > 28 or combat_volume <= 0:
		return
	for player: AudioStreamPlayer in sound_players:
		if not player.playing:
			player.stream = sound_streams.get(sound_name)
			player.volume_linear = combat_volume * clampf(1.0 - distance / 35.0, .2, 1.0)
			player.play()
			return

func stop_audio() -> void:
	if ambient_player != null:
		ambient_player.stop()
		ambient_player.stream = null
	for player: AudioStreamPlayer in sound_players:
		player.stop()
		player.stream = null

func begin_death(actor: Node3D) -> void:
	if actor.get_meta("dead",false): return
	actor.set_meta("dead",true)
	actor.set_meta("pickable",false)
	var motion: Dictionary = actor.get_meta("motion",{})
	(actor.get_meta("animation_controller") as VarendorAnimationController).begin_death(float(motion.get("deathAt",current_snapshot.get("time",0))),float(motion.get("corpseUntil",float(current_snapshot.get("time",0))+3000)))
	play_sound("monster-death",actor.position)

func update_nameplates() -> void:
	var ordered: Array = actors.keys()
	ordered.sort_custom(func(a: String, b: String): return (0 if a == target_id else 1 if a == hero_id else 2 if a.begins_with("npc:") else 3) < (0 if b == target_id else 1 if b == hero_id else 2 if b.begins_with("npc:") else 3))
	var used: Array[Rect2] = []
	for id: String in ordered:
		var actor: Node3D = actors[id]
		var title: Label = actor.get_meta("screen_label")
		title.hide()
		if not show_names or not actor.visible or actor.get_meta("dead", false) or actor.position.distance_to(hero_position) > 26 or used.size() >= 10:
			continue
		var point_value: Vector3 = actor.position + Vector3(0, (actor.get_meta("pick_size") as Vector3).y + .3, 0)
		if camera.is_position_behind(point_value):
			continue
		var pos: Vector2 = camera.unproject_position(point_value) - Vector2(title.size.x * .5, 20)
		var bounds: Rect2 = Rect2(pos, title.size).grow(4)
		var overlaps: bool = false
		for occupied: Rect2 in used:
			if occupied.intersects(bounds):
				overlaps = true
		if not overlaps:
			title.position = pos
			title.show()
			used.append(bounds)

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
	var source: Node3D = actors[str(event.actor)]
	var target: Node3D = actors[str(event.target)]
	var start: Vector3 = point(source.position.x,-source.position.z,1.4)
	var end: Vector3 = point(target.position.x,-target.position.z,1.4)
	var colors: Dictionary = {"fire":Color("ff7736"),"ice":Color("83ddff"),"lightning":Color("d7c2ff"),"poison":Color("91d45b"),"bone":Color("cbaddd"),"drain":Color("cf6689"),"shadow":Color("a882d8"),"arrow":Color("e5d1a1"),"slash":Color("f2dfb3")}
	if event.has("origin"):
		start = point(float(event.origin.x),float(event.origin.z),float(event.origin.y)-height_at(float(event.origin.x),float(event.origin.z)))
	if event.has("destination"):
		end = point(float(event.destination.x),float(event.destination.z),float(event.destination.y)-height_at(float(event.destination.x),float(event.destination.z)))
	var color: Color = colors.get(event.get("effect", "slash"), Color("b3a0e3"))
	var duration: float = float(event.get("durationMs", 0)) / 1000.0
	if duration > 0:
		var sphere: SphereMesh = SphereMesh.new()
		sphere.radius = .24
		sphere.height = .48
		var node: MeshInstance3D = effect_mesh(color, sphere)
		if event.get("effect") == "arrow":
			var arrow: CylinderMesh = CylinderMesh.new()
			arrow.top_radius = .025
			arrow.bottom_radius = .055
			arrow.height = .9
			node.mesh = arrow
			node.quaternion = Quaternion(Vector3.UP, (end - start).normalized())
		var age: float = float(event.get("presentationAgeMs",0))/1000.0
		node.position = start.lerp(end,clampf(age/duration,0,1))
		effects.append({"node":node,"start":start,"end":end,"left":maxf(0,duration-age),"duration":duration,"target":str(event.target),"target_generation":int(event.get("generation",target.get_meta("motion",{}).get("generation",0))),"arrow":event.get("effect") == "arrow"})
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

func update_effects(delta: float) -> void:
	for effect: Dictionary in effects.duplicate():
		effect.left -= delta
		var progress: float = 1 - maxf(0,effect.left) / effect.duration
		var expired: bool = false
		if effect.has("target"):
			var target: Node3D = actors.get(str(effect.target))
			if not is_instance_valid(target) or bool(target.get_meta("dead",false)) or int(target.get_meta("motion",{}).get("generation",0)) != int(effect.target_generation):
				expired = true
			else:
				# Reference projectiles home on the living generation's current body
				# over 0.28s; they do not keep aiming at an old snapshot endpoint.
				effect.end = point(target.position.x,-target.position.z,1.4)
				var next: Vector3 = (effect.start as Vector3).lerp(effect.end,progress)
				var previous: Vector3 = effect.node.position
				expired = collision.ray_distance(previous,next,.025) < previous.distance_to(next) - .00001 or next.y < height_at(next.x,-next.z) + .04
				if not expired:
					effect.node.position = next
					if bool(effect.arrow):
						var heading: Vector3 = (effect.end as Vector3) - next
						if heading.length_squared() > .000001: effect.node.quaternion = Quaternion(Vector3.UP,heading.normalized())
					else:
						effect.node.scale = Vector3.ONE * (1.0 + sin((effect.duration-effect.left)*30.0)*.16)
		elif effect.has("end"):
			effect.node.position = (effect.start as Vector3).lerp(effect.end,progress)
		else:
			effect.node.scale = Vector3.ONE * (.5 + progress*1.7)
		if expired or effect.left <= 0:
			effect.node.queue_free()
			effects.erase(effect)
