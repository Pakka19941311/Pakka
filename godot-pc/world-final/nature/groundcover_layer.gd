extends Node3D
## Only saved native points/meshes. No changes to the actor or terrain support.
const ROOT: String="res://world-final/nature/"
var data: Dictionary
var batch_count: int=0

func parts(node: Node, transform: Transform3D=Transform3D.IDENTITY) -> Array:
	var result: Array=[]
	if node is Node3D:transform*=node.transform
	if node is MeshInstance3D:result.append({"mesh":node.mesh,"transform":transform})
	for child: Node in node.get_children():result.append_array(parts(child,transform))
	return result

func build() -> void:
	data=JSON.parse_string(FileAccess.get_file_as_string(ROOT+"groundcover-authored-D11.json"))
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
					var material: ShaderMaterial=ShaderMaterial.new();material.shader=load(ROOT+"grass_mesh.gdshader")
					material.set_shader_parameter("lod_index",lod);part.mesh.surface_set_material(surface,material)
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
				batch.visibility_range_begin=0 if lod==0 else 6;batch.visibility_range_end=66 if lod==0 else 114
				batch.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;batch.lod_bias=100000
				add_child(batch);batch_count+=1
		built+=1
		if built%32==0:await get_tree().process_frame
	var surface: ShaderMaterial=load("res://world-final/materials/surface_materials.gd").terrain()
	for cliff: Dictionary in data.cliff_meshes:
		var node: Node3D=load(ROOT+cliff.path).instantiate();add_child(node)
		if node is MeshInstance3D:node.material_override=surface
		for part: Node in node.find_children("*","MeshInstance3D",true,false):part.material_override=surface
	print("GROUNDCOVER_LOADED "+JSON.stringify({"points":data.counts.grass_tufts,"cliffs":data.cliff_meshes.size(),"batches":batch_count}))
