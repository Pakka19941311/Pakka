extends Node3D
## Only saved native points/meshes. No changes to the actor or terrain support.
const ROOT: String="res://world-final/nature/"
@export var authored_revision: String="D11"
@export var geology_material_revision: String=""
@export var surface_style: String=""
@export var grass_shader: String=ROOT+"grass_mesh.gdshader"
var data: Dictionary
var batch_count: int=0
const GRASS_CELL_BUFFER: float=32.0
const GRASS_LOD_START: float=25.0
const GRASS_LOD_END: float=36.0
var detail_distance: float=80.0
var grass_materials: Array[ShaderMaterial]=[]
var grass_batches: Array[MultiMeshInstance3D]=[]

func apply_detail_distance(meters: float) -> void:
	# Store the choice before build too; never move or rebuild authored points.
	detail_distance=clampf(meters,24.0,80.0)
	for material: ShaderMaterial in grass_materials:
		material.set_shader_parameter("draw_distance",detail_distance)
	for batch: MultiMeshInstance3D in grass_batches:
		if is_instance_valid(batch): _apply_grass_batch_distance(batch,int(batch.get_meta("grass_lod",0)))

func _apply_grass_batch_distance(batch: MultiMeshInstance3D, lod: int) -> void:
	# Coarse whole-cell culling cannot replace per-instance shader distance.
	# Keep a full 32 m cell buffer so an edge tuft survives camera movement.
	batch.visibility_range_begin=0.0
	batch.visibility_range_end=(minf(detail_distance,GRASS_LOD_END) if lod==0 else detail_distance)+GRASS_CELL_BUFFER
	batch.visible=lod==0 or detail_distance>GRASS_LOD_START

func register_grass_batch(batch: MultiMeshInstance3D, lod: int) -> void:
	batch.set_meta("grass_lod",lod)
	grass_batches.append(batch)
	_apply_grass_batch_distance(batch,lod)

func parts(node: Node, transform: Transform3D=Transform3D.IDENTITY) -> Array:
	var result: Array=[]
	if node is Node3D:transform*=node.transform
	if node is MeshInstance3D:result.append({"mesh":node.mesh,"transform":transform})
	for child: Node in node.get_children():result.append_array(parts(child,transform))
	return result

func build() -> void:
	data=JSON.parse_string(FileAccess.get_file_as_string(ROOT+"groundcover-authored-"+authored_revision+".json"))
	var prototypes: Dictionary={}
	for key: String in data.catalog:
		if data.catalog[key].kind=="cliff":continue
		prototypes[key]=[]
		for lod: int in range(2):
			var node: Node3D=load(ROOT+data.catalog[key].lods[lod].path).instantiate()
			var meshes: Array=parts(node)
			for part: Dictionary in meshes:
				part.mesh=part.mesh.duplicate()
				for surface: int in range(part.mesh.get_surface_count()):
					var material: ShaderMaterial=ShaderMaterial.new();material.shader=load(grass_shader)
					material.set_shader_parameter("lod_index",lod);material.set_shader_parameter("draw_distance",detail_distance)
					grass_materials.append(material);part.mesh.surface_set_material(surface,material)
			prototypes[key].append(meshes);node.free()
	var built: int=0
	for cell: Dictionary in data.grass_cells:
		var center: Vector3=Vector3(cell.cell[0]*32+16,0,cell.cell[1]*32+16)
		var points: Array=cell.points
		for lod: int in range(2):
			for part: Dictionary in prototypes[cell.asset][lod]:
				var mm: MultiMesh=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D
				mm.use_colors=true;mm.use_custom_data=true;mm.mesh=part.mesh;mm.instance_count=points.size()
				for index: int in range(points.size()):
					var p: Array=points[index];var position: Vector3=Vector3(p[0],p[1],p[2])
					var normal: Vector3=Vector3(-p[5],1,-p[6]).normalized()
					var rotation: Basis=Basis(Quaternion(Vector3.UP,normal))*Basis(Vector3.UP,p[3])
					mm.set_instance_transform(index,Transform3D(rotation.scaled(Vector3.ONE*p[4]),position-center)*part.transform)
					mm.set_instance_color(index,Color.WHITE);mm.set_instance_custom_data(index,Color(p[0],p[1],p[2],p[4]))
				var batch: MultiMeshInstance3D=MultiMeshInstance3D.new();batch.multimesh=mm;batch.position=center
				batch.name="D11_"+str(cell.asset)+"_%s_%s_LOD%s"%[cell.cell[0],cell.cell[1],lod]
				register_grass_batch(batch,lod)
				batch.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;batch.lod_bias=100000
				add_child(batch);batch_count+=1
		built+=1
		if built%32==0:await get_tree().process_frame
	var surface: ShaderMaterial=load("res://world-final/materials/surface_materials.gd").terrain()
	if not geology_material_revision.is_empty():surface=load("res://world-final/materials/geology_material_D12.gd").terrain(geology_material_revision,surface_style)
	for cliff: Dictionary in data.cliff_meshes:
		var node: Node3D=load(ROOT+cliff.path).instantiate();add_child(node)
		if node is MeshInstance3D:node.material_override=surface
		for part: Node in node.find_children("*","MeshInstance3D",true,false):part.material_override=surface
	print("GROUNDCOVER_LOADED "+JSON.stringify({"points":data.counts.grass_tufts,"cliffs":data.cliff_meshes.size(),"batches":batch_count}))
