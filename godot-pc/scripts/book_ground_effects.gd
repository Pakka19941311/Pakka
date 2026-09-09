class_name VarendorBookGroundEffects
extends RefCounted

var world: Node3D
var nodes: Dictionary = {}
var preview: MeshInstance3D

func ring(center: Vector2, radius: float, color: Color) -> MeshInstance3D:
	# Follow the real terrain so the indicated radius matches the server on slopes.
	var mesh: ImmediateMesh = ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in range(64):
		var a: float = TAU*index/64.0
		var b: float = TAU*(index+1)/64.0
		var points: Array[Vector2] = []
		for pair: Vector2 in [Vector2(a,radius-.065),Vector2(a,radius+.065),Vector2(b,radius+.065),Vector2(b,radius-.065)]:
			points.append(center+Vector2(sin(pair.x),cos(pair.x))*pair.y)
		for vertex: int in [0,1,2,0,2,3]:
			mesh.surface_add_vertex(world.point(points[vertex].x,points[vertex].y,.065))
	mesh.surface_end()
	var node: MeshInstance3D = MeshInstance3D.new()
	node.mesh = mesh
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.albedo_color = color
	node.material_override = material
	world.add_child(node)
	return node

func apply(snapshot: Dictionary) -> void:
	var keep: Dictionary = {}
	for zone: Dictionary in snapshot.get("groundEffects",[]):
		if float(zone.expiresAt) <= float(snapshot.time): continue
		var id: String = str(zone.id)
		keep[id] = true
		if nodes.has(id): continue
		var color: Color = Color("ed693d") if zone.kind == "slam" else Color("ba9557") if zone.kind == "trap" else Color("9eacf1")
		nodes[id] = ring(Vector2(zone.point.x,zone.point.z),float(zone.radius),color)
	for id: String in nodes.keys():
		if not keep.has(id): nodes[id].queue_free(); nodes.erase(id)

func update_preview() -> void:
	if is_instance_valid(preview): preview.queue_free()
	preview = null
	if world.book_ui == null or world.book_ui.targeting_book.is_empty(): return
	var book: Dictionary = world.data.books[world.book_ui.targeting_book]
	if book.mode != "area": return
	var point: Variant = world.targeting.ground(world.get_viewport().get_mouse_position())
	if point == null: return
	var hero: Dictionary = world.current_snapshot.get("character",{})
	if hero.is_empty(): return
	var valid: bool = Vector2(hero.x,hero.z).distance_to(point) <= float(hero.attackRange)
	preview = ring(point,4.0,Color("91b2d2") if valid else Color("c85443"))
