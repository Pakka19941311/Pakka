extends Node3D
## Explicit local adapter. No terrain, navigation, service or collision mutation.
const ROOT: String="res://world-final/nature/p2-sample-v3/"
var data: Dictionary={}
var replaced_grass: Array[Dictionary]=[]
var built: bool=false
var small_decorations: Array[GeometryInstance3D]=[]
var nature_meshes: Array[MeshInstance3D]=[]
var focus_bound: bool=false
var shore_water: MeshInstance3D

func build(existing_groundcover: Node=null) -> void:
	if built:return
	data=JSON.parse_string(FileAccess.get_file_as_string(ROOT+"manifest.json"))
	assert(data.get("schema",0)==1,"Missing P2 nature candidate manifest")
	for entry: Dictionary in data.chunks:
		var packed: PackedScene=load(ROOT+str(entry.path))
		assert(packed!=null,"Missing P2 nature chunk "+str(entry.path))
		var node: Node3D=packed.instantiate();add_child(node)
		var meshes: Array=node.find_children("*","MeshInstance3D",true,false)
		if node is MeshInstance3D:meshes.append(node)
		for mesh: MeshInstance3D in meshes:
			mesh.set_meta("p2_nature_candidate",true)
			if entry.kind=="ground":
				var material: ShaderMaterial=ShaderMaterial.new();material.shader=load(ROOT+"ground_overlay.gdshader")
				for key: String in ["litter","soil","mud"]:material.set_shader_parameter(key,load(ROOT+str(data.textures[key].path)))
				material.set_shader_parameter("ground_normal",load(ROOT+str(data.textures.normal.path)))
				var b: Array=entry.bounds;material.set_shader_parameter("bounds",Vector4(b[0],b[1],b[2],b[3]));material.set_shader_parameter("shore",entry.region=="shore")
				mesh.material_override=material;mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			elif entry.kind=="grass":
				var material: ShaderMaterial=ShaderMaterial.new();material.shader=load(ROOT+"grass.gdshader");mesh.material_override=material;mesh.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				small_decorations.append(mesh)
			else:nature_meshes.append(mesh)
			# Spatial chunks cull independently. These use the existing LOD1 meshes;
			# do not claim a measured production LOD or performance gain.
	if existing_groundcover!=null:replace_local_grass(existing_groundcover)
	bind_local_shore_water()
	built=true

func bind_local_shore_water() -> void:
	# Reuse the exact production lake geometry; only a narrow local material
	# band renders above it. Original mesh/material, level and collision stay.
	var lake: MeshInstance3D=get_parent().find_child("Lake_Level_40m",true,false) as MeshInstance3D
	if lake==null:return # Standalone reference QA has no production lake.
	shore_water=MeshInstance3D.new();shore_water.name="P2N_LocalShoreWater"
	shore_water.mesh=lake.mesh;add_child(shore_water)
	shore_water.global_transform=lake.global_transform;shore_water.position.y+=.008
	shore_water.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material: ShaderMaterial=ShaderMaterial.new();material.shader=load(ROOT+"shore_water.gdshader")
	var b: Array=data.regions.shore;material.set_shader_parameter("bounds",Vector4(b[0],b[1],b[2],b[3]))
	var polyline: Array = data.get("qaShorePolyline",[data.qaWaterPolygon[0],data.qaWaterPolygon[-1]])
	var points: PackedVector2Array = PackedVector2Array()
	for i in range(8):
		var point: Array = polyline[mini(i,polyline.size()-1)]
		points.append(Vector2(float(point[0]),float(point[1])))
	material.set_shader_parameter("shore_points",points)
	material.set_shader_parameter("shore_point_count",mini(8,polyline.size()))
	var a: Array=polyline[0];var end: Array=polyline[-1]
	material.set_shader_parameter("shore_a",Vector2(a[0],a[1]));material.set_shader_parameter("shore_b",Vector2(end[0],end[1]))
	material.set_shader_parameter("sediment",load(ROOT+str(data.textures.mud.path)))
	shore_water.material_override=material

func bind_focus(reference_layer: Node) -> void:
	if focus_bound:return
	# Reuse the current tree readability shader and parameter updates. Only
	# alpha foliage participates: trunks, rocks and logs keep their materials.
	# The merged candidate meshes have no INSTANCE_CUSTOM tree centres, so the
	# existing per-tree LOD shader must remain disabled for these chunks.
	for instance: MeshInstance3D in nature_meshes:
		var original: Mesh=instance.mesh
		var focused: Mesh=reference_layer.focus_mesh(original,1)
		for index: int in range(original.get_surface_count()):
			var source: Material=original.surface_get_material(index)
			var material: Material=focused.surface_get_material(index)
			var foliage: bool=source is BaseMaterial3D and source.transparency!=BaseMaterial3D.TRANSPARENCY_DISABLED and ("shrub_04" in source.resource_name or "pine_tree_01_twig" in source.resource_name)
			if foliage and material is ShaderMaterial:
				material.set_shader_parameter("lod_enabled",false)
				if "pine_tree_01_twig" in source.resource_name:material.set_shader_parameter("base_color",Color(.70,.96,.72))
				if "shrub_04" in source.resource_name:
					# Scan leaves were nearly white in the actual world. Preserve
					# UV/alpha/focus, use a local matte green surface only for them.
					material.shader=load(ROOT+"leaf.gdshader")
					material.set_shader_parameter("base_color",source.albedo_color*Color(.56,.73,.34))
					material.set_shader_parameter("use_rough",false)
					material.set_shader_parameter("roughness_value",.94)
			else:
				focused.surface_set_material(index,source)
				reference_layer.focus_materials.erase(material)
		instance.mesh=focused
	focus_bound=true

func contains_point(x: float,z: float) -> bool:
	for bounds: Array in data.regions.values():
		if x>=bounds[0] and x<=bounds[2] and z>=bounds[1] and z<=bounds[3]:return true
	return false

func replace_local_grass(layer: Node) -> void:
	if not replaced_grass.is_empty():return
	for node: Node in layer.find_children("*","MultiMeshInstance3D",true,false):
		var batch: MultiMeshInstance3D=node
		var original: MultiMesh=batch.multimesh
		if original==null or not original.use_custom_data:continue
		var indices: Array[int]=[]
		for index: int in range(original.instance_count):
			var p: Color=original.get_instance_custom_data(index)
			if contains_point(p.r,p.b):indices.append(index)
		if indices.is_empty():continue
		var local: MultiMesh=original.duplicate()
		for index: int in indices:
			var transform: Transform3D=local.get_instance_transform(index);transform.basis=Basis.from_scale(Vector3.ZERO);local.set_instance_transform(index,transform)
		replaced_grass.append({"batch":batch,"original":original,"count":indices.size()});batch.multimesh=local

func restore_local_grass() -> void:
	for record: Dictionary in replaced_grass:
		if is_instance_valid(record.batch):record.batch.multimesh=record.original
	replaced_grass.clear()

func _exit_tree() -> void:
	restore_local_grass()
	small_decorations.clear()
	nature_meshes.clear()
