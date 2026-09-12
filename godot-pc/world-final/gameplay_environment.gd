extends Node3D
## Geography adapter for the existing multiplayer client. No preview actor,
## camera, offline inventory or independent combat simulation is created here.
const ROOT: String = "res://world-final/"
var world: VarendorWorld
var layout: Dictionary
var location_overrides: Array = []
var spaces: Dictionary = {}
var active_space: String = ""
var terrain: Dictionary
var heights: PackedFloat32Array
var supports: Array = []
var definition: Dictionary = {}
var bounds: Array = []
var nature: Node3D
var roots: Dictionary = {}
var loaded_data: Dictionary = {}
var courtyard: Node3D
var castle_mesh: Node3D
var courtyard_path: String = "castle/courtyard.json"
var p2_house_cutaway: RefCounted
var nature_sample: Node3D
var p2_nature_enabled: bool=false

func setup(value: VarendorWorld) -> bool:
	world = value
	p2_nature_enabled = world.data.get("populationMode","") == "starter-v3"
	courtyard_path = "castle/courtyard-p2.json" if world.data.get("populationMode","") == "starter-v3" else "castle/courtyard.json"
	layout = read_json("world_layout.json")
	location_overrides = world.data.get("locationOverrides",[])
	for item: Dictionary in read_json("interiors/spaces.json").spaces: spaces[item.id] = item
	return await activate_space("surface")

func read_json(path: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(ROOT+path))

func load_scene(path: String, parent: Node3D) -> Node3D:
	if ResourceLoader.load_threaded_request(ROOT+path) != OK: return null
	while ResourceLoader.load_threaded_get_status(ROOT+path) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
		await get_tree().process_frame
	if ResourceLoader.load_threaded_get_status(ROOT+path) != ResourceLoader.THREAD_LOAD_LOADED: return null
	var packed: PackedScene = ResourceLoader.load_threaded_get(ROOT+path)
	var node: Node3D = packed.instantiate()
	parent.add_child(node)
	return node

func activate_space(id: String) -> bool:
	for root: Node3D in roots.values(): root.hide()
	if not roots.has(id):
		var root: Node3D = Node3D.new()
		root.name = "World_"+id
		add_child(root)
		roots[id] = root
		var meta: Dictionary = read_json("geology-D13/terrain.json" if id == "surface" else "interiors/"+id+".json")
		var raw: PackedFloat32Array = FileAccess.get_file_as_bytes(ROOT+("geology-D13/heightmap.f32" if id == "surface" else "interiors/"+str(meta.floor))).to_float32_array()
		var support: Array = read_json("geography/support-surfaces.json").surfaces if id == "surface" else []
		if id == "surface": support.append_array(read_json(courtyard_path).get("supportSurfaces",[]))
		var obstacles: Array = read_json("geography/collision.json").obstacles if id == "surface" else meta.obstacles
		if id == "surface":
			var replaced: Array = read_json(courtyard_path).get("tavern",{}).get("replacesLandmarks",[])
			obstacles = obstacles.filter(func(o: Dictionary): return not o.get("landmark","") in replaced)
		loaded_data[id] = {"terrain":meta,"heights":raw,"supports":support,"obstacles":obstacles}
		if id == "surface":
			var ground: ShaderMaterial = load(ROOT+"materials/geology_material_D12.gd").terrain("D13")
			var loaded_cells: int = 0
			for cell: Dictionary in meta.chunks:
				var cell_node: Node3D = await load_scene("geology-D13/"+str(cell.glb),root)
				if cell_node == null:
					push_error("Missing final terrain cell: "+str(cell.glb))
					return false
				for mesh: MeshInstance3D in cell_node.find_children("*","MeshInstance3D",true,false): mesh.material_override = ground
				loaded_cells += 1
				world.loading_progress.emit("Ландшафт: %d / %d" % [loaded_cells,meta.chunks.size()])
				await get_tree().process_frame
			world.loading_progress.emit("Загрузка городов и построек…")
			var landmarks: Node3D = await load_scene("geography/landmarks.glb",root)
			if landmarks == null:
				push_error("Missing final architecture")
				return false
			for old_id: String in read_json(courtyard_path).get("tavern",{}).get("replacesLandmarks",[]):
				var old_building: Node3D = landmarks.find_child(old_id,true,false)
				if old_building != null: old_building.hide()
			world.loading_progress.emit("Обустройство двора Гринфолла…")
			var courtyard_mesh: Node3D = await load_scene(courtyard_path.replace(".json",".glb"),root)
			if courtyard_mesh == null: return false
			castle_mesh = courtyard_mesh
			for mesh: MeshInstance3D in courtyard_mesh.find_children("*","MeshInstance3D",true,false):
				mesh.visibility_range_end = 430 if "citadel" in str(mesh.name) or "tower_roofs" in str(mesh.name) else 210
				mesh.visibility_range_end_margin = 12
			obstacles.append_array(read_json(courtyard_path).obstacles)
			world.loading_progress.emit("Загрузка леса и растительности…")
			nature = load(ROOT+"nature/nature_layer.gd").new()
			nature.authored_revision = "D13"
			nature.distant_trees = true
			root.add_child(nature)
			await nature.build()
			for material: ShaderMaterial in nature.focus_materials:
				var source: Material = material.get_meta("unmodified_source_material")
				if "pine_tree_01_twig" in source.resource_name: material.set_shader_parameter("base_color",Color(.70,.96,.72))
			var groundcover: Node3D = load(ROOT+"nature/groundcover_layer.gd").new()
			groundcover.authored_revision = "D13"
			groundcover.geology_material_revision = "D13"
			groundcover.grass_shader = ROOT+"nature/grass_lit_D13.gdshader"
			root.add_child(groundcover)
			await groundcover.build()
			for path: String in ["nature/collision-D13.json","nature/groundcover-collision-D13.json"]: obstacles.append_array(read_json(path).obstacles)
			if p2_nature_enabled:
				world.loading_progress.emit("Обустройство начальной охоты…")
				nature_sample = load(ROOT+"nature/p2-sample-v3/nature_sample.gd").new()
				root.add_child(nature_sample)
				nature_sample.build(groundcover)
				nature_sample.bind_focus(nature)
				world.decorations.append_array(nature_sample.small_decorations)
				obstacles.append_array(read_json("nature/p2-sample-v3/collision.json").obstacles)
		else:
			var interior: Node3D = await load_scene("interiors/"+id+".glb",root)
			if interior == null:
				push_error("Missing final interior: "+id)
				return false
			# Use the saved interior navigation; runtime does not rebake it.
			var nav: NavigationRegion3D = NavigationRegion3D.new()
			nav.navigation_mesh = load(ROOT+"interiors/"+id+"-nav.tres")
			# Server navigation owns decisions. Do not merge these local coordinates
			# with another space's Godot navigation map.
			nav.enabled = false
			root.add_child(nav)
			for room: Dictionary in spaces[id].rooms:
				var lamp: OmniLight3D = OmniLight3D.new()
				lamp.position = Vector3(room.center[0],5,room.center[1])
				lamp.omni_range = maxf(room.radii[0],room.radii[1])*1.5
				lamp.light_energy = 2
				lamp.light_color = Color("ffbb78") if id == "mine" else Color("99b5c4")
				root.add_child(lamp)
	active_space = id
	var saved: Dictionary = loaded_data[id]
	terrain = saved.terrain
	heights = saved.heights
	supports = saved.supports
	definition = spaces.get(id,{})
	bounds = [-796,-696,796,696] if id == "surface" else [terrain.bounds[0]+1,-terrain.bounds[3]+1,terrain.bounds[2]-1,-terrain.bounds[1]-1]
	world.collision.setup(saved.obstacles)
	world.collision.walkability = walkable
	world.player_motion.bounds_min = Vector2(bounds[0],bounds[1])
	world.player_motion.bounds_max = Vector2(bounds[2],bounds[3])
	roots[id].show()
	build_portal_markers(id)
	for service_id: String in VarendorNpcInteraction.SERVICES:
		if world.actors.has(service_id): world.actors[service_id].visible = id == "surface"
	print("FINAL_WORLD_SPACE_READY "+id)
	return true

func setup_courtyard_life() -> void:
	if courtyard != null: return
	courtyard = load("res://world-final/castle/courtyard_life.gd").new()
	roots.surface.add_child(courtyard)
	courtyard.setup(world,read_json(courtyard_path))
	if courtyard_path.ends_with("courtyard-p2.json"):
		p2_house_cutaway = preload("res://world-final/castle/p2_house_cutaway.gd").new()
		p2_house_cutaway.setup(world,castle_mesh,read_json(courtyard_path).obstacles)

func height_at(x: float,z: float,with_support: bool = true) -> float:
	var b: Array = terrain.get("bounds",[-800,-700,800,700])
	var c: int = int(terrain.columns)
	var r: int = int(terrain.rows)
	var step: float = float(terrain.step)
	var gx: float = clampf((x-float(b[0]))/step,0,c)
	var gz: float = clampf((-z-float(b[1]))/step,0,r)
	var col: int = mini(c-1,floori(gx))
	var row: int = mini(r-1,floori(gz))
	var u: float = gx-col
	var v: float = gz-row
	var i: int = row*(c+1)+col
	var a: float = heights[i]
	var bb: float = heights[i+1]
	var cc: float = heights[i+c+1]
	var d: float = heights[i+c+2]
	var y: float = a+u*(bb-a)+v*(d-bb) if u>=v else a+u*(d-cc)+v*(cc-a)
	if with_support:
		for s: Dictionary in supports:
			var local: Vector2 = Vector2(x-float(s.x),-z-float(s.z)).rotated(float(s.angle))
			if absf(local.x)<=float(s.halfX) and absf(local.y)<=float(s.halfZ):
				y = maxf(y,lerpf(float(s.high),float(s.y),(local.y+float(s.halfZ))/(2*float(s.halfZ))) if s.kind == "ramp_z" else float(s.y))
	return y

func polygon_has(x: float,z: float,polygon: Array) -> bool:
	var inside: bool = false
	var j: int = polygon.size()-1
	for i: int in range(polygon.size()):
		var a: Array = polygon[i]
		var b: Array = polygon[j]
		if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]: inside = not inside
		j = i
	return inside

func gap(x: float,z: float,a: Array,b: Array) -> float:
	var aa: Vector2 = Vector2(a[0],a[1])
	var delta: Vector2 = Vector2(b[0],b[1])-aa
	return Vector2(x,z).distance_to(aa+delta*clampf((Vector2(x,z)-aa).dot(delta)/maxf(.000001,delta.length_squared()),0,1))

func interior_fits(x: float,z: float) -> bool:
	for room: Dictionary in definition.rooms:
		if pow((x-room.center[0])/room.radii[0],2)+pow((z-room.center[1])/room.radii[1],2)<.98: return true
	for corridor: Dictionary in definition.corridors:
		for i: int in range(1,corridor.points.size()):
			if gap(x,z,corridor.points[i],corridor.points[i-1])<float(corridor.width)/2-.25: return true
	return false

func walkable(p: Vector2,radius: float = .46) -> bool:
	if p.x-radius<bounds[0] or p.y-radius<bounds[1] or p.x+radius>bounds[2] or p.y+radius>bounds[3]: return false
	var x: float = p.x
	var z: float = -p.y
	var y: float = height_at(p.x,p.y)
	if active_space != "surface":
		for offset: Vector2 in [Vector2.ZERO,Vector2(radius,0),Vector2(-radius,0),Vector2(0,radius),Vector2(0,-radius)]:
			if not interior_fits(x+offset.x,z+offset.y): return false
	else:
		var water: Dictionary = layout.water
		if polygon_has(x,z,water.lake.polygon) and y<water.lake.level+.12: return false
		if polygon_has(x,z,water.swamp.polygon) and y<water.swamp.level-.25: return false
		for i: int in range(1,water.river.centerline_xyz.size()):
			var a: Array = water.river.centerline_xyz[i-1]
			var b: Array = water.river.centerline_xyz[i]
			if gap(x,z,[a[0],a[2]],[b[0],b[2]])<water.river.width/2+radius and y<maxf(a[1],b[1])+1: return false
	var step: float = .5
	var dx: float = (height_at(p.x+step,p.y)-height_at(p.x-step,p.y))/(2*step)
	var dz: float = (height_at(p.x,p.y+step)-height_at(p.x,p.y-step))/(2*step)
	# Match FinalWorld: hills permit uphill AND downhill travel; the authored
	# tree/wall/rock collision and water rules above remain authoritative.
	var maximum_slope: float = 50.0 if active_space == "surface" else 20.0
	return is_finite(y) and Vector2(dx,dz).length()<=tan(deg_to_rad(maximum_slope))+.015

func location_name(p: Vector2) -> String:
	if active_space == "mine": return "Шахта"
	if active_space == "great_cave": return "Большая пещера"
	for location: Dictionary in location_overrides:
		if polygon_has(p.x,-p.y,location.outline_xz): return str(location.name)
	for location: Dictionary in layout.locations:
		if polygon_has(p.x,-p.y,location.outline_xz): return location.name_ru
	return "Варендор"

func portal_near(p: Vector2) -> String:
	for id: String in spaces:
		var raw: Array = spaces[id].surface_portal if active_space == "surface" else spaces[id].entry
		if active_space != "surface" and active_space != id: continue
		var point: Vector2 = Vector2(raw[0],-raw[2])
		if p.distance_to(point)>3.2: continue
		var start: Vector3 = world.point(p.x,p.y,1.2)
		var end: Vector3 = world.point(point.x,point.y,1.2)
		if world.collision.ray_distance(start,end)>=start.distance_to(end)-.05: return id
	return ""

func _process(_dt: float) -> void:
	if active_space == "surface" and nature != null and world.camera != null:
		nature.update_focus(world.hero_position,world.camera.global_position,false)

func build_portal_markers(id: String) -> void:
	var root: Node3D = roots[id]
	if root.has_node("PortalMarkers"): return
	var group: Node3D = Node3D.new(); group.name = "PortalMarkers"; root.add_child(group)
	for portal_id: String in spaces:
		if id != "surface" and id != portal_id: continue
		var raw: Array = spaces[portal_id].surface_portal if id == "surface" else spaces[portal_id].entry
		var anchor: Node3D = Node3D.new(); anchor.name = portal_id; group.add_child(anchor)
		anchor.position = Vector3(raw[0],height_at(raw[0],-raw[2])+.08,raw[2])
		var glow: StandardMaterial3D = StandardMaterial3D.new()
		glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; glow.albedo_color = Color("68d4eb")
		var ring: MeshInstance3D = MeshInstance3D.new(); var torus: TorusMesh = TorusMesh.new()
		torus.inner_radius = 1.15; torus.outer_radius = 1.3; torus.rings = 24; torus.ring_segments = 8
		ring.mesh = torus; ring.material_override = glow; ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		anchor.add_child(ring)
		var caption: Label3D = Label3D.new()
		caption.name = "PortalLabel"
		caption.text = ("Большая пещера" if portal_id == "great_cave" else "Шахта") if id == "surface" else "Выход из пещеры"
		caption.text += "\nF / ЛКМ — "+("войти" if id == "surface" else "выйти")
		caption.position.y = 2.7; caption.font_size = 38; caption.outline_size = 8; caption.pixel_size = .008
		caption.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		caption.modulate = Color("b7f3ff"); caption.visibility_range_end = 55
		anchor.add_child(caption)

func portal_clicked(screen: Vector2) -> String:
	var id: String = portal_near(Vector2(world.hero_position.x,-world.hero_position.z))
	if id.is_empty(): return ""
	var raw: Array = spaces[id].surface_portal if active_space == "surface" else spaces[id].entry
	for height: float in [.15,1.3,2.7]:
		var point: Vector3 = world.point(raw[0],-raw[2],height)
		if not world.camera.is_position_behind(point) and world.camera.unproject_position(point).distance_to(screen)<48: return id
	return ""
