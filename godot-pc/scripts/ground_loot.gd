extends Node3D
## Two shared instanced meshes: no per-chest physics body, light or actor AI.
const LIMIT: int = 64
var app
var rows: Array = []
var positions: Array[Vector3] = []
var chests: MultiMeshInstance3D
var halos: MultiMeshInstance3D
var hint: Label
var elapsed: float = 0.0
var nearest_id: String = ""
var shown_space: String = ""

func setup(value) -> void:
	app = value
	chests = batch(chest_mesh())
	var ring: TorusMesh = TorusMesh.new()
	ring.inner_radius = .38
	ring.outer_radius = .41
	ring.rings = 16
	ring.ring_segments = 4
	var glow: StandardMaterial3D = StandardMaterial3D.new()
	glow.albedo_color = Color("eac778")
	glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material = glow
	halos = batch(ring)
	hint = app.label("", 14)
	hint.name = "GroundLootHint"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hint.add_theme_color_override("font_color", Color("f7dd9c"))
	hint.add_theme_color_override("font_shadow_color", Color(0,0,0,.95))
	hint.add_theme_constant_override("shadow_offset_x", 1)
	hint.add_theme_constant_override("shadow_offset_y", 2)
	app.ui.add_child(hint)
	app.world.snapshot_presented.connect(present)
	hint.hide()

func batch(mesh: Mesh) -> MultiMeshInstance3D:
	var node: MultiMeshInstance3D = MultiMeshInstance3D.new()
	node.multimesh = MultiMesh.new()
	node.multimesh.transform_format = MultiMesh.TRANSFORM_3D
	node.multimesh.mesh = mesh
	node.multimesh.instance_count = LIMIT
	node.multimesh.visible_instance_count = 0
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	return node

func present(snapshot: Dictionary) -> void:
	rows = snapshot.get("groundLoot", []).slice(0,LIMIT)
	shown_space = str(snapshot.character.get("spaceId", "surface"))
	positions.clear()
	for row: Dictionary in rows:
		positions.append(app.world.point(float(row.x),float(row.z),.05))

func _process(delta: float) -> void:
	if app == null: return
	elapsed += delta
	var show_world: bool = app.startup_complete and not app.net.hero.is_empty() and not app.world.space_loading
	show_world = show_world and str(app.net.hero.get("spaceId","surface")) == shown_space
	visible = show_world
	nearest_id = ""
	var nearest_distance: float = INF
	chests.multimesh.visible_instance_count = rows.size() if show_world else 0
	halos.multimesh.visible_instance_count = rows.size() if show_world else 0
	for i: int in range(rows.size() if show_world else 0):
		var origin: Vector3 = positions[i]
		var phase: float = float(posmod(str(rows[i].id).hash(),1000)) * .01
		var pose: Transform3D = Transform3D(Basis(Vector3.UP,phase),origin + Vector3.UP * (.035 + sin(elapsed*2.1+phase)*.025))
		chests.multimesh.set_instance_transform(i,pose)
		var pulse: float = 1.0 + sin(elapsed*2.1+phase)*.035
		halos.multimesh.set_instance_transform(i,Transform3D(Basis.IDENTITY.scaled(Vector3(pulse,1,pulse)),origin))
		var gap: float = app.world.hero_position.distance_to(origin)
		if bool(rows[i].get("available",false)) and gap <= 2.65 and gap < nearest_distance:
			nearest_distance = gap
			nearest_id = str(rows[i].id)
	var has_loot: bool = not nearest_id.is_empty() and not app.net.hero.get("dead",true)
	hint.visible = show_world and has_loot and not is_instance_valid(app.active_dialog)
	if hint.visible:
		var entry: Dictionary = {}
		for row: Dictionary in rows:
			if str(row.id) == nearest_id: entry = row; break
		var details: String = "%d предм." % int(entry.get("itemCount",0))
		if int(entry.get("gold",0)) > 0: details += " · %d золота" % int(entry.gold)
		hint.text = ("Автолут · " if app.net.hero.get("lootMode","ground") == "auto" else "Подобрать [E] · ") + details
		hint.size = Vector2(480,28)
		hint.position = Vector2((app.ui.size.x-hint.size.x)*.5,maxf(40,app.ui.size.y-235))

func pickup() -> void:
	if app.net.command_busy or not app.net.connected or app.world.space_loading or app.net.hero.get("dead",true): return
	if nearest_id.is_empty():
		app.notice("Рядом нет доступной добычи.")
		return
	await app.net.command({"type":"pickup","lootId":nearest_id})

func add_mode_setting(parent: Control) -> void:
	var check: CheckButton = CheckButton.new()
	check.name = "AutoLootSetting"
	check.text = "Автолут — подбирать рядом (2,5 м)"
	check.custom_minimum_size.y = 38
	check.button_pressed = app.net.hero.get("lootMode","ground") == "auto"
	parent.add_child(check)
	parent.add_child(app.wrapped_label("По умолчанию добыча остаётся в сундуке на земле. E — подобрать. Опыт начисляется за победу сразу.",13))
	check.toggled.connect(func(enabled: bool):
		check.disabled = true
		await app.net.command({"type":"lootMode","mode":"auto" if enabled else "ground"})
		if is_instance_valid(check):
			check.set_pressed_no_signal(app.net.hero.get("lootMode","ground") == "auto")
			check.disabled = false)

static func quad(tool: SurfaceTool,a: Vector3,b: Vector3,c: Vector3,d: Vector3,color: Color) -> void:
	var normal: Vector3 = (b-a).cross(c-a).normalized()
	for vertex: Vector3 in [a,b,c,a,c,d]:
		tool.set_normal(normal)
		tool.set_color(color)
		tool.add_vertex(vertex)

static func box(tool: SurfaceTool,center: Vector3,size_value: Vector3,color: Color) -> void:
	var primitive: BoxMesh = BoxMesh.new()
	primitive.size = size_value
	var arrays: Array = primitive.get_mesh_arrays()
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	for index: int in arrays[Mesh.ARRAY_INDEX]:
		tool.set_normal(normals[index])
		tool.set_color(color)
		tool.add_vertex(center+vertices[index])

static func arch(tool: SurfaceTool,left: float,right: float,color: Color,lift: float = 0.0) -> void:
	for segment: int in range(8):
		var a: float = PI*float(segment)/8.0
		var b: float = PI*float(segment+1)/8.0
		var y1: float = .34+sin(a)*(.23+lift)
		var y2: float = .34+sin(b)*(.23+lift)
		var z1: float = cos(a)*(.27+lift)
		var z2: float = cos(b)*(.27+lift)
		quad(tool,Vector3(left,y1,z1),Vector3(left,y2,z2),Vector3(right,y2,z2),Vector3(right,y1,z1),color)
		quad(tool,Vector3(left,.34,0),Vector3(left,y1,z1),Vector3(left,y2,z2),Vector3(left,.34,0),color.darkened(.18))
		quad(tool,Vector3(right,.34,0),Vector3(right,y2,z2),Vector3(right,y1,z1),Vector3(right,.34,0),color.darkened(.12))

static func chest_mesh() -> ArrayMesh:
	var tool: SurfaceTool = SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var wood: Color = Color("56371f")
	var gold: Color = Color("daa647")
	box(tool,Vector3(0,.18,0),Vector3(.78,.32,.54),wood)
	arch(tool,-.39,.39,wood.lightened(.12))
	box(tool,Vector3(0,.04,0),Vector3(.82,.07,.58),gold.darkened(.24))
	box(tool,Vector3(0,.325,0),Vector3(.80,.035,.56),gold)
	for x: float in [-.26,.26]:
		box(tool,Vector3(x,.185,-.28),Vector3(.052,.27,.025),gold)
		box(tool,Vector3(x,.185,.28),Vector3(.052,.27,.025),gold)
		arch(tool,x-.028,x+.028,gold,.005)
		for z: float in [-.19,.19]: box(tool,Vector3(x,0,z),Vector3(.10,.09,.10),gold.darkened(.32))
	box(tool,Vector3(0,.29,.302),Vector3(.105,.125,.04),gold.lightened(.12))
	box(tool,Vector3(0,.285,.327),Vector3(.026,.044,.008),Color("201b18"))
	tool.index()
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.roughness = .68
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	tool.set_material(material)
	return tool.commit()
