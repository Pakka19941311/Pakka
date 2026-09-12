class_name VarendorWorld
extends Node3D

# Art selection stays client-only: server class model still owns attack timings.
const P2_ADAPTER = preload("res://world-expansion-v3/actors/profile_adapter.gd")
const CLOAK_VISUAL = preload("res://scripts/cloak_visual.gd")
const P2_NPC_MOTION = preload("res://world-expansion-v3/city/motion/npc_motion_adapter.gd")
const P2_NPC_ROLES: Dictionary = {"ambient:103":"guard","ambient:115":"resident"}
const KNIGHT_MODEL: String = "ForgottenKnight"
const KNIGHT_ASSET: String = "res://assets/knight/Knight_Modular.glb"
const KNIGHT_SOURCE_HEIGHT: float = 1.84

signal picked(entity_id: String)
signal moved_to(point: Vector2)
signal loading_progress(message: String)
signal loading_failed(message: String)

var book_ui: VarendorBookUI
var book_ground: VarendorBookGroundEffects = VarendorBookGroundEffects.new()
var final_environment: Node3D
var space_loading: bool = false
var pending_space_snapshot: Dictionary = {}
var data: Dictionary
var terrain: Dictionary
var territory: Dictionary
var territory_life: VarendorTerritoryLife
var territory_material_audit: Dictionary = {"graded":[],"wind_surfaces":0}
var camera: Camera3D
var actors: Dictionary = {}
var templates: Dictionary = {}
static var cached_monster_profiles: Dictionary = {}
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
var weather: VarendorWorldWeather
var world_environment: Environment
var show_names: bool = true
var decorations: Array[GeometryInstance3D] = []
signal loot_received(message: String)
signal snapshot_presented(snapshot: Dictionary)
signal event_presented(event: Dictionary)

func _init() -> void:
	book_ground.world = self
	player_motion.collision = collision
	targeting.setup(self)

func receive_snapshot(snapshot: Dictionary) -> void:
	if final_environment != null:
		pending_space_snapshot = snapshot
		if space_loading: return
		if str(snapshot.character.get("spaceId","surface")) != final_environment.active_space:
			space_loading = true
			while str(pending_space_snapshot.character.get("spaceId","surface")) != final_environment.active_space:
				if not await final_environment.activate_space(str(pending_space_snapshot.character.get("spaceId","surface"))):
					loading_failed.emit("Не удалось загрузить локацию. Перезапустите игру из полностью распакованного пакета.")
					return
			snapshot = pending_space_snapshot
			for id: String in actors.keys():
				if not id.begins_with("npc:") and not id.begins_with("ambient:"):
					actors[id].queue_free()
					actors.erase(id)
			timeline = SnapshotTimeline.new()
			for effect: Dictionary in effects:
				if is_instance_valid(effect.get("node")): effect.node.queue_free()
			effects.clear()
			for floater: Dictionary in floaters:
				if is_instance_valid(floater.get("node")): floater.node.queue_free()
			floaters.clear()
			player_motion.identity = ""
			space_loading = false
	# Validate chronology/lifecycle before ANY consumer mutates live state.
	# A delayed HTTP reply must not rewind prediction after a new SSE generation.
	if not timeline.ingest(snapshot): return
	if timeline.did_resynchronize:
		# Recovery is one explicit authoritative correction after a real outage.
		# Do not fly through seconds of old motion or replay expired projectiles.
		player_motion.identity = ""
		reset_remote_pose_baselines()
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
		if actors.has(str(snapshot.character.id)):
			actors[str(snapshot.character.id)].position = hero_position
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
	if value.get("skill") != null and actors.has(hero_id):
		actors[hero_id].set_meta("predicted_skill_until",0)
		(actors[hero_id].get_meta("animation_controller") as VarendorAnimationController).attack_ends_at = -1
	if error not in ["target-occluded", "missing-target"] or target_id != str(value.get("entityId", "")): return
	targeting.clear()
	player_motion.cancel_planar()
	player_motion.intent_pending = false

func _physics_process(delta: float) -> void:
	if space_loading: return
	player_motion.physics_step(delta)
	if not current_snapshot.is_empty() and ambient_active():
		ambient_residents.visitor_positions = [player_motion.position_value]
		ambient_residents.physics_step(delta)

func ambient_active() -> bool:
	return final_environment == null or (final_environment.active_space == "surface" and player_motion.position_value.distance_to(Vector2(-100,-150)) < 210)


func setup(game: Dictionary) -> bool:
	loading_progress.emit("Подготовка звука…")
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
	if data.get("worldRevision","") == "world-final-gameplay-1":
		final_environment = load("res://world-final/gameplay_environment.gd").new()
		add_child(final_environment)
		VarendorNpcInteraction.SERVICES = JSON.parse_string(FileAccess.get_file_as_string("res://world-final/gameplay/services.json"))
		if not await final_environment.setup(self): return false
	else:
		terrain = JSON.parse_string(FileAccess.get_file_as_string("res://generated/terrain.json"))
		territory = JSON.parse_string(FileAccess.get_file_as_string("res://generated/territory.json"))
		VarendorNpcInteraction.SERVICES = territory.services
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
		var wind_materials: Dictionary = {}
		var graded_materials: Dictionary = {}
		for instance: Node in environment_world.find_children("*", "MeshInstance3D", true, false):
			var geometry: MeshInstance3D = instance
			for surface: int in geometry.mesh.get_surface_count():
				var source: Material = geometry.get_active_material(surface)
				if not source is StandardMaterial3D: continue
				var key: int = source.get_instance_id()
				if not graded_materials.has(key):
					graded_materials[key] = true
					var material_name: String = str(source.resource_name).to_lower().replace(" ","_")
					var tint: Color = Color.WHITE
					if "castle_stone" in material_name or "limewashed_fieldstone" in material_name: tint = Color("b5c1c4")
					elif "medieval_wood" in material_name: tint = Color("94724f")
					elif "slate_roof" in material_name: tint = Color("637683")
					elif "paved_roads" in material_name: tint = Color("b4b8ad")
					if tint != Color.WHITE:
						source.albedo_color = tint
						territory_material_audit.graded.append(str(source.resource_name))
				if not str(source.resource_name).begins_with("Territory_Wind_"): continue
				territory_material_audit.wind_surfaces += 1
				if not wind_materials.has(key):
					var wind: ShaderMaterial = ShaderMaterial.new()
					wind.shader = preload("res://scripts/territory_wind.gdshader")
					wind.set_shader_parameter("base_color",source.albedo_color)
					wind.set_shader_parameter("textured",source.albedo_texture != null)
					if source.albedo_texture != null: wind.set_shader_parameter("albedo_map",source.albedo_texture)
					wind.set_shader_parameter("cutout","Foliage" in source.resource_name or source.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED)
					wind.set_shader_parameter("strength",.11 if "Grass" in source.resource_name else .16 if "Banner" in source.resource_name else .12)
					wind_materials[key] = wind
				geometry.set_surface_override_material(surface,wind_materials[key])
		# Blender exports photometric intensities (5087/9001 cd). Compatibility uses
		# relative energy here; copying those values clips the whole settlement white.
		for node: Node in environment_world.find_children("*", "OmniLight3D", true, false):
			var fire_light: OmniLight3D = node
			fire_light.light_energy = 1.0
			fire_light.omni_range = 5.0
			fire_light.omni_attenuation = 1.6
	loading_progress.emit("Подготовка города и персонажей…")
	var environment: WorldEnvironment = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky: Sky = Sky.new()
	var sky_material: ShaderMaterial = ShaderMaterial.new()
	sky_material.shader = preload("res://scripts/territory_sky.gdshader")
	sky.sky_material = sky_material
	sky.process_mode = Sky.PROCESS_MODE_REALTIME
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("bdc9dc")
	env.ambient_light_energy = .65
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color("8b9995")
	env.fog_density = .0013
	environment.environment = env
	world_environment = env
	add_child(environment)
	var sun: DirectionalLight3D = DirectionalLight3D.new()
	sun_light = sun
	sun.rotation_degrees = Vector3(-48, -35, 0)
	sun.light_color = Color("e9eff5")
	sun.light_energy = .95
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90
	add_child(sun)
	weather = VarendorWorldWeather.new()
	add_child(weather)
	weather.setup(self)
	camera = Camera3D.new()
	camera.fov = rad_to_deg(.82)
	camera.near = .15
	camera.far = 5000 if final_environment != null else 520
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
	for model: String in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk", "Fox", "Slime", "Skeleton", "Dragon", "Bat", KNIGHT_MODEL] + monster_asset_profiles().keys():
		if not templates.has(model):
			var path: String = actor_asset_path(model)
			templates[model] = load(path)
		await get_tree().process_frame
	# Local residents have their own 60Hz motion owner; service NPCs above keep
	# their static positions. Install each first pose before it can be rendered.
	var resident_data: Dictionary = territory
	if final_environment != null:
		resident_data = final_environment.read_json(final_environment.courtyard_path)
		resident_data["services"] = VarendorNpcInteraction.SERVICES
	ambient_residents.setup(collision,resident_data)
	for resident: Dictionary in ambient_residents.sample():
		var p2_role: String = str(P2_NPC_ROLES.get(str(resident.id),"")) if final_environment != null and final_environment.courtyard_path.ends_with("courtyard-p2.json") else ""
		var actor: Node3D = P2_NPC_MOTION.create_actor(self,str(resident.id),p2_role) if not p2_role.is_empty() else make_actor(str(resident.id),str(resident.model),float(resident.targetHeight),str(resident.name),Color("d4c7af"))
		(actor.get_meta("screen_label") as Label).text = str(resident.name)
		(actor.get_meta("label") as Label3D).text = str(resident.name)
		initialize_pose(actor,point(resident.x,resident.z))
		actor.rotation.y = -float(resident.yaw) + PI
		actor.set_meta("motion",resident)
		actor.set_meta("pickable",false)
		if resident.get("civilian",false) and p2_role.is_empty():
			for piece: Node in (actor.get_meta("visual") as Node3D).find_children("*","MeshInstance3D",true,false):
				if "sword" in str(piece.name).to_lower() or "bow" in str(piece.name).to_lower() or "dagger" in str(piece.name).to_lower(): piece.hide()
	if final_environment != null: final_environment.setup_courtyard_life()
	else:
		territory_life = VarendorTerritoryLife.new()
		add_child(territory_life)
		territory_life.setup(self)
	return true

func location_name(p: Vector2) -> String:
	if final_environment != null: return final_environment.location_name(p)
	if territory.is_empty(): return "Варендор"
	for settlement: Dictionary in [territory.fort,territory.capital]:
		if absf(p.x-settlement.x)<settlement.width/2 and absf(p.y-settlement.z)<settlement.depth/2:
			return "Гринфолл" if settlement.x==territory.fort.x else "Астерхолд"
	for road: Dictionary in territory.roads:
		if road.kind!="protected": continue
		for i: int in range(1,road.points.size()):
			var a: Vector2 = Vector2(road.points[i-1].x,road.points[i-1].z)
			var b: Vector2 = Vector2(road.points[i].x,road.points[i].z)
			var direction: Vector2 = b-a
			var t: float = clampf((p-a).dot(direction)/maxf(.001,direction.length_squared()),0,1)
			if p.distance_to(a+direction*t)<5.2: return road.name
	var closest: float = INF
	var result: String = "Пограничные земли"
	for landmark: Dictionary in territory.landmarks:
		if landmark.kind in ["fort","town"]: continue
		var distance: float = p.distance_squared_to(Vector2(landmark.x,landmark.z))
		if distance<closest:
			closest = distance
			result = landmark.name
	return result

func height_at(x: float, z: float) -> float:
	if final_environment != null: return final_environment.height_at(x,z)
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

static func actor_asset_path(model: String) -> String:
	if model == KNIGHT_MODEL: return KNIGHT_ASSET
	return "res://generated/actors/" + model + (".gltf" if model in ["Warrior", "Wizard", "Ranger", "Rogue", "Monk"] else ".glb")

func monster_definition(monster: Dictionary) -> Dictionary:
	var definition: Dictionary = data.monsters.get(str(monster.id),{}).duplicate(true)
	var canonical: String = str(monster.get("canonicalMobId",""))
	if canonical in ["MOB-01","MOB-02","MOB-03","MOB-04","MOB-05"]:
		var profile: Dictionary = P2_ADAPTER.profiles()[canonical]
		definition.model = str(profile.model); definition.visualModel = str(profile.model); definition.visualHeight = float(profile.height)
		definition.name = str(monster.get("name",{"MOB-01":"Теневой слизень","MOB-02":"Пепельный гончий","MOB-03":"Полевая крыса","MOB-04":"Лесной кабан","MOB-05":"Панцирный жук"}[canonical]))
	definition.level = int(monster.get("level",definition.get("level",1)))
	definition.hp = float(monster.get("maxHp",definition.get("hp",1)))
	return definition

func make_actor(id: String, model: String, size: float, title: String, color: Color) -> Node3D:
	if actors.has(id):
		var existing: Node3D = actors[id]
		(existing.get_meta("screen_label") as Label).text = title
		(existing.get_meta("label") as Label3D).text = title
		return actors[id]
	var root: Node3D = Node3D.new()
	add_child(root)
	if not templates.has(model):
		var path: String = actor_asset_path(model)
		templates[model] = load(path)
	var visual: Node3D = (templates[model] as PackedScene).instantiate()
	root.add_child(visual)
	var monster_profiles: Dictionary = monster_asset_profiles()
	var bounds: AABB = AABB()
	var first: bool = true
	for node: Node in visual.find_children("*", "MeshInstance3D", true, false):
		var mesh: MeshInstance3D = node
		var box: AABB = (visual.global_transform.affine_inverse() * mesh.global_transform) * mesh.get_aabb()
		bounds = box if first else bounds.merge(box)
		first = false
	if model == KNIGHT_MODEL:
		# Calibrate to body height, never to sword/cape/helmet bounds. Equipment
		# replacement cannot resize the hero or move their gameplay root.
		visual.scale = Vector3.ONE * (size / KNIGHT_SOURCE_HEIGHT)
		visual.position.y = 0.0
	elif monster_profiles.has(model):
		var profile: Dictionary = monster_profiles[model]
		var factor: float = size / float(profile.sourceHeight)
		visual.scale = Vector3.ONE * factor
		visual.position.y = -float(profile.sourceFloor) * factor
		bounds = AABB(Vector3.ZERO,Vector3(float(profile.sourceWidth),float(profile.sourceHeight),float(profile.sourceDepth)))
	elif bounds.size.y > .001:
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
	if model == KNIGHT_MODEL:
		root.set_meta("pick_size", Vector3(.82, size, .68))
		var equipment: VarendorKnightEquipment = VarendorKnightEquipment.new()
		equipment.bind(root, visual, data.get("items", {}))
	var controller: VarendorAnimationController = VarendorAnimationController.new()
	controller.prefer_run = id == hero_id or model == "Fox"
	controller.bind(root)
	root.set_meta("motion", {})
	actors[id] = root
	return root

static func monster_asset_profiles() -> Dictionary:
	if cached_monster_profiles.is_empty():
		cached_monster_profiles = JSON.parse_string(FileAccess.get_file_as_string("res://generated/monster-profiles.json"))
	return cached_monster_profiles

func apply_snapshot(snapshot: Dictionary) -> void:
	current_snapshot = snapshot
	book_ground.apply(snapshot)
	var hero: Dictionary = snapshot.character
	hero_id = str(hero.id)
	hero_speed = float(hero.stats.get("speed",6.2))
	if player_motion.identity.is_empty(): player_motion.reconcile(snapshot)
	targeting.reconcile(snapshot)
	var keep: Dictionary = {}
	for service_id: String in VarendorNpcInteraction.SERVICES: keep[service_id] = true
	for resident: Dictionary in ambient_residents.residents: keep[str(resident.id)] = true
	var people: Array = snapshot.get("heroes", []).duplicate()
	# Character is authoritative even when the nearby-heroes list omits self.
	people = people.filter(func(person: Dictionary): return str(person.id) != hero_id)
	people.append(hero)
	for person: Dictionary in people:
		var id: String = str(person.id)
		keep[id] = true
		var model: String = KNIGHT_MODEL if str(person.classId) == "knight" else str(data.classes[person.classId].model)
		var actor: Node3D = make_actor(id, model, 2.05, person.name + (" · %d" % int(person.level) if person.has("level") else ""), Color("e8dfcb") if id == hero_id else Color("9bc5cf"))
		if actor.has_meta("knight_equipment"):
			# Use the presented inventory snapshot; sampled motion intentionally
			# contains no equipment and must not reset appearance every frame.
			(actor.get_meta("knight_equipment") as VarendorKnightEquipment).apply_equipment(person.get("equipment", {}))
			if person.has("autoAttack"):
				actor.set_meta("knight_autoattack_active", bool(person.autoAttack))
				actor.set_meta("knight_autoattack_target", str(person.get("target", "")) if person.get("target") != null else "")
		if not actor.has_meta("cloak_visual"):
			var cloak: RefCounted = CLOAK_VISUAL.new()
			cloak.bind(actor)
		actor.get_meta("cloak_visual").apply_equipment(person.get("equipment",{}))
		initialize_pose(actor, point(person.x, person.z, person.get("yOffset", 0)),int(person.get("generation",0)))
		actor.set_meta("yaw", -float(person.get("yaw", 0)) + PI)
		actor.set_meta("motion", person.duplicate(true))
		var vanishing: bool = float(person.get("buffs",{}).get("vanish",0)) > float(snapshot.get("time",0))
		for mesh: MeshInstance3D in (actor.get_meta("visual") as Node3D).find_children("*","MeshInstance3D",true,false):
			mesh.transparency = .68 if vanishing else 0.0
		if bool(person.get("dead", false)):
			begin_death(actor)
		elif actor.get_meta("dead", false):
			actor.set_meta("dead", false)
			actor.set_meta("pose_dirty",true)
			(actor.get_meta("animation_controller") as VarendorAnimationController).reset_alive()
			(actor.get_meta("visual") as Node3D).transform = actor.get_meta("base_visual")
			actor.set_meta("action", "")
			actor.visible = true

	for monster: Dictionary in snapshot.get("monsters", []):
		if Vector2(monster.x - hero.x, monster.z - hero.z).length() > 115:
			continue
		var id: String = str(monster.uid)
		keep[id] = true
		var def: Dictionary = monster_definition(monster)
		var canonical: String = str(monster.get("canonicalMobId",""))
		var actor: Node3D
		if canonical in ["MOB-01","MOB-02","MOB-03","MOB-04","MOB-05"] and not actors.has(id):
			actor = P2_ADAPTER.create_actor(self,id,canonical)
		else:
			actor = make_actor(id,str(def.get("visualModel",def.model)),float(def.get("visualHeight",2.05 * float(def.get("scale",1)))),str(def.name),Color("e0a6a0"))
		var title: String = str(def.name)+" · %d" % int(def.level)
		(actor.get_meta("screen_label") as Label).text = title
		(actor.get_meta("label") as Label3D).text = title
		if str(monster.id) == "night_zombie" and str(def.get("visualModel","")) != "Zombie" and not actor.has_meta("undead_tint"):
			for mesh: MeshInstance3D in actor.find_children("*","MeshInstance3D",true,false):
				if mesh.mesh == null: continue
				for surface: int in range(mesh.mesh.get_surface_count()):
					var material: Material = mesh.get_active_material(surface)
					if material is StandardMaterial3D:
						var owned: StandardMaterial3D = material.duplicate()
						owned.albedo_color = Color("7c966b")
						mesh.set_surface_override_material(surface,owned)
			actor.set_meta("undead_tint",true)
		initialize_pose(actor, point(monster.x, monster.z, monster.get("yOffset", 0)),int(monster.get("generation",0)))
		actor.set_meta("pickable", bool(monster.alive))
		actor.set_meta("yaw", -float(monster.get("yaw", 0)) + PI)
		actor.set_meta("motion", monster.duplicate(true))
		if not monster.alive or float(monster.hp) <= 0:
			begin_death(actor)
		elif actor.get_meta("dead", false):
			actor.set_meta("dead", false)
			actor.set_meta("pose_dirty",true)
			(actor.get_meta("animation_controller") as VarendorAnimationController).reset_alive()
			(actor.get_meta("visual") as Node3D).transform = actor.get_meta("base_visual")
			actor.set_meta("action", "")
			actor.visible = true

	for summon: Dictionary in snapshot.get("summons", []):
		var id: String = str(summon.uid)
		keep[id] = true
		var kind: String = str(summon.get("bookKind","skeleton"))
		var model: String = "FireGolem" if kind == "fire_golem" else "HellforgedWarden" if kind == "infernal" else "SkeletonV3"
		var actor: Node3D = make_actor(id, model, 2.8 if kind == "infernal" else 2.7 if kind == "fire_golem" else 1.9, "Инфернал" if kind == "infernal" else "Призванный голем" if kind == "fire_golem" else "Призванный скелет", Color("86b3c2"))
		initialize_pose(actor, point(summon.x, summon.z, summon.get("yOffset", 0)),int(summon.get("generation",0)))
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
		if event.kind in ["attack","release","death","cancel","buff"]:
			(actor.get_meta("animation_controller") as VarendorAnimationController).on_event(event,float(current_snapshot.get("time",0)))
			actor.set_meta("pose_dirty",true)
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
		var message: String = "+%d серебра · +%d опыта" % [event.get("gold", 0), event.get("xp", 0)]
		if not names.is_empty():
			message += "\n" + ", ".join(names)
		loot_received.emit("Добыча: " + message)
		play_sound("coin", hero_position)
	if event.get("kind") in ["hit", "miss"] and actors.has(str(event.get("target", ""))):
		var target: Node3D = actors[str(event.target)]
		(target.get_meta("animation_controller") as VarendorAnimationController).on_event(event,float(current_snapshot.get("time",0)))
		show_text(target.position, str(int(event.amount)) if event.has("amount") else "Промах", Color("ef7770") if str(event.target) == hero_id else Color("f5d698"), .85)
		play_sound("melee-impact" if str(event.target) == hero_id else "monster-hit", target.position)

func blocked(position: Vector3) -> bool:
	return collision.blocked(Vector2(position.x, -position.z))

func reset_remote_pose_baselines() -> void:
	for id: String in actors:
		if id == hero_id or id.begins_with("ambient:") or id.begins_with("npc:"): continue
		var actor: Node3D = actors[id]
		actor.set_meta("initialized",false)
		actor.set_meta("pose_delta",0.0)
		actor.set_meta("pose_dirty",true)
		if actor.has_meta("pose_motion"): actor.remove_meta("pose_motion")

func initialize_pose(actor: Node3D, destination: Vector3, pose_generation: int = -1) -> void:
	actor.set_meta("previous", actor.position)
	actor.set_meta("destination", destination)
	var discontinuity: bool = pose_generation >= 0 and pose_generation != int(actor.get_meta("pose_generation",pose_generation))
	if pose_generation >= 0: actor.set_meta("pose_generation",pose_generation)
	if not actor.get_meta("initialized") or discontinuity:
		actor.position = destination
		actor.set_meta("previous", destination)
		actor.set_meta("initialized", true)
		actor.set_meta("pose_delta",0.0)
		actor.set_meta("pose_dirty",true)
		if actor.has_meta("pose_motion"): actor.remove_meta("pose_motion")

func record_intent(value: Dictionary, input_sequence: int) -> void:
	player_motion.sent(value,input_sequence)

func _process(delta: float) -> void:
	if camera == null or space_loading: return
	book_ground.update_preview()
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
		if id.begins_with("ambient:") and not ambient_active():
			actor.hide()
			continue
		var before: Vector3 = actor.position
		var motion: Dictionary = actor.get_meta("motion", {}).duplicate()
		if id == hero_id:
			actor.position = hero_position
			actor.rotation.y = -float(local_pose.yaw) + PI
			motion.merge(local_pose,true)
			motion["grounded"] = player_motion.grounded
			if player_motion.input_mode == "manual" or player_motion.manual_cancel_pending:
				motion["combatState"] = "idle"
				motion["autoAttack"] = false
				motion["action"] = "walk" if player_motion.actual_velocity.length() > .08 else "idle"
				motion["actionStartedAt"] = maxf(float(motion.get("actionStartedAt",0)),float(current_snapshot.get("time",0)))
			if Time.get_ticks_msec() < int(actor.get_meta("predicted_skill_until",0)) and not bool(motion.get("dead",false)):
				motion["action"] = "attack"
				motion["animationSkill"] = int(actor.get_meta("predicted_skill", -1))
				motion["combatState"] = "windup"
				motion["actionStartedAt"] = float(actor.get_meta("predicted_skill_start"))
				motion["hitAt"] = motion.actionStartedAt+1
				motion["actionEndsAt"] = motion.actionStartedAt+180
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
		var remote_clock: bool = id != hero_id and not ambient_poses.has(id)
		var motion_dt: float = presentation_dt if remote_clock else delta
		var rendered_velocity: Vector3 = (actor.position-before)/maxf(.0001,motion_dt) if motion_dt > .000001 else Vector3.ZERO
		if remote_clock:
			if not actor.has_meta("pose_motion"): actor.set_meta("pose_motion",preload("res://scripts/pose_motion.gd").new())
			actor.get_meta("pose_motion").push(actor.position-before,motion_dt)
		if actor.has_meta("p2_npc_role"):
			actor.set_meta("p2_npc_travel",float(actor.get_meta("p2_npc_travel",0.0))+Vector2(actor.position.x-before.x,actor.position.z-before.z).length())
		if id == hero_id:
			# Gait covers the distance actually drawn, including bounded network
			# correction; raw motor speed used to make the feet skate during it.
			# A neutral input owns idle on the release frame.
			if player_motion.actual_velocity.is_zero_approx(): rendered_velocity = Vector3.ZERO
			rendered_velocity.y = player_motion.vertical_velocity
		var controller: VarendorAnimationController = actor.get_meta("animation_controller")
		controller.prefer_run = id == hero_id or str(actor.get_meta("model","")) == "Fox"
		var actor_clock: float = ambient_time if ambient_poses.has(id) else timeline.clock_ms if not timeline.current.is_empty() else float(current_snapshot.get("time",0))
		# Simulation, positions and event clocks continue for every actor. Only
		# distant rig sampling is throttled; combat and the hero stay full rate.
		var distance_sq: float = actor.position.distance_squared_to(hero_position)
		var pose_delta: float = float(actor.get_meta("pose_delta", 0.0)) + (delta if id == hero_id or ambient_poses.has(id) else presentation_dt)
		var interval: float = 0.0 if id == hero_id or id == target_id or distance_sq < 24.0*24.0 else .1 if distance_sq < 50.0*50.0 else .5
		if bool(actor.get_meta("pose_dirty",false)) or (pose_delta >= interval and (not remote_clock or pose_delta > .000001)):
			if remote_clock: rendered_velocity = actor.get_meta("pose_motion").consume()
			if actor.has_meta("p2_npc_role"):
				var travelled: float = float(actor.get_meta("p2_npc_travel",0.0))
				var npc_state: String = "walk" if travelled>.001 else "talk" if motion.get("state","")=="activity" and motion.get("activity","")=="talk" else "idle"
				P2_NPC_MOTION.advance_actor(actor,npc_state,pose_delta,travelled)
				actor.set_meta("p2_npc_travel",0.0)
			else:
				controller.update(motion,rendered_velocity,actor_clock,pose_delta)
				if controller is VarendorP2AnimationController:
					controller.align_to_ground(func(x: float,z: float) -> float: return point(x,-z).y)
			if actor.has_meta("cloak_visual"):
				actor.get_meta("cloak_visual").tick(actor_clock,motion,rendered_velocity)
			pose_delta = 0.0
			actor.set_meta("pose_dirty",false)
		actor.set_meta("pose_delta",pose_delta)
		actor.visible = not controller.corpse_complete and (id == hero_id or distance_sq < 85.0*85.0)
		update_corpse_fade(actor,controller,actor_clock)
		(actor.get_meta("label") as Label3D).hide()
	if final_environment != null and final_environment.courtyard != null and final_environment.courtyard.tavern != null:
		final_environment.courtyard.tavern.before_camera()
	if final_environment != null and final_environment.p2_house_cutaway != null:
		final_environment.p2_house_cutaway.before_camera()
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
	if book_ui != null and book_ui.click(screen): return true
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
	actor.set_meta("pose_dirty",true)
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
		if id.begins_with("ambient:") and actor.position.distance_to(hero_position)>12: continue
		if id == "npc:books" or (id.begins_with("ambient:") and int(id.get_slice(":",1)) >= 116):
			var eye: Vector3 = hero_position+Vector3.UP*1.5
			var head: Vector3 = actor.position+Vector3.UP*1.5
			if collision.ray_distance(eye,head) < eye.distance_to(head)-.1: continue
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

func update_corpse_fade(actor: Node3D, controller: VarendorAnimationController, clock: float) -> void:
	var opacity: float = 1.0 if controller.death_at < 0 else clampf(1.0-(clock-controller.death_at)/3000.0,0,1)
	if opacity >= 1 and not actor.has_meta("fade_materials"): return
	if not actor.has_meta("fade_materials"):
		var materials: Array = []
		for mesh: MeshInstance3D in actor.find_children("*","MeshInstance3D",true,false):
			if mesh.mesh == null: continue
			for i: int in range(mesh.mesh.get_surface_count()):
				var source: Material = mesh.get_active_material(i)
				if source is StandardMaterial3D:
					var owned: StandardMaterial3D = source.duplicate()
					mesh.set_surface_override_material(i,owned)
					materials.append({"material":owned,"alpha":source.albedo_color.a,"mode":source.transparency})
		actor.set_meta("fade_materials",materials)
	for entry: Dictionary in actor.get_meta("fade_materials"):
		entry.material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA if opacity < 1 else entry.mode
		entry.material.albedo_color.a = float(entry.alpha)*opacity

func predict_skill(index: int) -> void:
	if not actors.has(hero_id): return
	var hero: Dictionary = current_snapshot.get("character",{})
	var skill: Dictionary = data.classes[hero.get("classId","knight")].skills[index]
	if not skill.has("buff") and not bool(skill.get("summon",false)):
		if not actors.has(target_id) or actors[hero_id].position.distance_to(actors[target_id].position)>float(hero.get("attackRange",2.6))+.1: return
	var controller: VarendorAnimationController = actors[hero_id].get_meta("animation_controller")
	var now: float = timeline.clock_ms
	controller.begin_attack(now,now+1,now+180,{"skill":index})
	actors[hero_id].set_meta("predicted_skill",index)
	actors[hero_id].set_meta("predicted_skill_start",now)
	actors[hero_id].set_meta("predicted_skill_until",Time.get_ticks_msec()+180)
