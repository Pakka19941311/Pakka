extends Node3D
## Authored Blender placements, grouped spatially; never changes the actor motor.
const ROOT: String = "res://world-final/nature/"
@export var authored_revision: String = "D03"
@export var distant_trees: bool = false
var data: Dictionary
var prototypes: Dictionary = {}
var batches: Array[MultiMeshInstance3D] = []
var focus_materials: Array[ShaderMaterial] = []
var far_materials: Array[ShaderMaterial] = []

func mesh_parts(node: Node, parent_transform: Transform3D = Transform3D.IDENTITY) -> Array:
	var result: Array = []
	var transform: Transform3D = parent_transform
	if node is Node3D: transform *= node.transform
	if node is MeshInstance3D:
		result.append({"mesh":node.mesh,"transform":transform})
	for child: Node in node.get_children(): result.append_array(mesh_parts(child,transform))
	return result

func placement_transform(p: Dictionary) -> Transform3D:
	return Transform3D(Basis(Vector3.UP,float(p.yaw)).scaled(Vector3.ONE*float(p.scale)),Vector3(p.position[0],p.position[1],p.position[2]))

func build() -> void:
	data = JSON.parse_string(FileAccess.get_file_as_string(ROOT+"authored-"+authored_revision+".json"))
	for key: String in data.catalog:
		var variants: Array = []
		for lod_index: int in range(data.catalog[key].lods.size()):
			var source: Dictionary=data.catalog[key].lods[lod_index]
			var packed: PackedScene = load(ROOT+str(source.path))
			assert(packed != null,"Missing authored nature asset: "+str(source.path))
			var node: Node = packed.instantiate()
			var parts: Array=mesh_parts(node)
			if parts.size()>8:parts=merge_parts(parts)
			if data.catalog[key].group=="pine_tree_01" or data.catalog[key].get("is_tree",false):
				for part: Dictionary in parts:part.mesh=focus_mesh(part.mesh,lod_index)
			variants.append(parts);node.free()
		prototypes[key] = variants
	if distant_trees:load_far_prototypes()
	var groups: Dictionary = {}
	for p: Dictionary in data.placements:
		var key: String = str(p.asset)+"/%d/%d" % [floori(p.position[0]/32),floori(p.position[2]/32)]
		if not groups.has(key):groups[key]=[]
		groups[key].append(p)
	var built_groups: int=0
	for group_key: String in groups:
		var placements: Array = groups[group_key]
		var kind: String = str(placements[0].kind)
		var center: Vector3 = Vector3.ZERO
		for p: Dictionary in placements:center += placement_transform(p).origin
		center /= placements.size()
		for lod: int in range(prototypes[placements[0].asset].size() if distant_trees else mini(2,prototypes[placements[0].asset].size())):
			for part: Dictionary in prototypes[placements[0].asset][lod]:
				var batch: MultiMeshInstance3D = make_batch(part,placements,center)
				batch.name = group_key.replace("/","_")+"_lod%d" % lod
				var change: float = 65 if kind=="tree" else 32
				batch.visibility_range_begin = change if lod==1 else 0
				batch.visibility_range_end = change if lod==0 else (0 if kind=="tree" else (95 if kind=="fern" else 210))
				if kind=="tree" and distant_trees:
					# Bounds include the entire 32 m cell and a scaled crown. Actual
					# transitions use each saved tree position in the shader.
					batch.visibility_range_begin=[0.0,20.0,110.0][lod]
					batch.visibility_range_end=[135.0,250.0,0.0][lod]
					if lod==2:batch.extra_cull_margin=40.0
				# Compatibility has no built-in HLOD fading. Margins stay zero so
				# these two versions cannot be visible simultaneously.
				batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if kind=="fern" or lod==2 else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
				batch.set_meta("lod_index",lod)
				batch.set_meta("normal_range",Vector2(batch.visibility_range_begin,batch.visibility_range_end))
				add_child(batch);batches.append(batch)
		built_groups+=1
		if built_groups%24==0:await get_tree().process_frame

func merge_parts(parts: Array) -> Array:
	# Preserve authored triangles/attributes while avoiding a separate draw
	# batch for every small branch. Different materials/formats remain separate.
	var groups: Dictionary={}
	for part: Dictionary in parts:
		var mesh: ArrayMesh=part.mesh
		for surface: int in range(mesh.get_surface_count()):
			var material: Material=mesh.surface_get_material(surface)
			var key: String=str(material.get_instance_id())+":"+str(mesh.surface_get_format(surface))
			if not groups.has(key):groups[key]={"material":material,"parts":[]}
			groups[key].parts.append({"mesh":mesh,"surface":surface,"transform":part.transform})
	var combined: Array=[]
	for key: String in groups:
		var tool: SurfaceTool=SurfaceTool.new();tool.begin(Mesh.PRIMITIVE_TRIANGLES)
		tool.set_material(groups[key].material)
		for part: Dictionary in groups[key].parts:tool.append_from(part.mesh,part.surface,part.transform)
		combined.append({"mesh":tool.commit(),"transform":Transform3D.IDENTITY})
	return combined

func set_overview_geometry(enabled: bool) -> void:
	# Upright distant cards are unsuitable for steep map/overview angles.
	# Use the actual source meshes for these separate captures.
	for batch: MultiMeshInstance3D in batches:
		batch.visible=int(batch.get_meta("lod_index"))==1 if enabled else true
		var normal_range: Vector2=batch.get_meta("normal_range")
		batch.visibility_range_begin=0.0 if enabled else normal_range.x
		batch.visibility_range_end=0.0 if enabled else normal_range.y
	for material: ShaderMaterial in focus_materials:material.set_shader_parameter("lod_enabled",distant_trees and not enabled)

func make_batch(part: Dictionary, placements: Array, center: Vector3) -> MultiMeshInstance3D:
	var mm: MultiMesh = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	# Explicit white keeps instance tint neutral alongside custom distance data.
	# In Compatibility the colour slot is multiplied into vertex COLOR even
	# when only custom data was supplied; the isolated D09 comparison reproduces
	# dark bark without this initialized colour buffer.
	mm.use_colors=true
	mm.use_custom_data=true
	mm.mesh = part.mesh
	mm.instance_count = placements.size()
	for index: int in range(placements.size()):
		var transform: Transform3D = placement_transform(placements[index])*part.transform
		transform.origin -= center
		mm.set_instance_transform(index,transform)
		mm.set_instance_color(index,Color.WHITE)
		var p: Dictionary=placements[index]
		mm.set_instance_custom_data(index,Color(p.position[0],p.position[1],p.position[2],p.scale))
	var node: MultiMeshInstance3D = MultiMeshInstance3D.new()
	node.position=center;node.multimesh=mm
	return node

func ground_material() -> ShaderMaterial:
	var material: ShaderMaterial = ShaderMaterial.new()
	material.shader = load(ROOT+"forest_ground.gdshader")
	material.set_shader_parameter("ground_mask",load(ROOT+"ground-sample-D01.png"))
	for name: String in ["forest_diff","forest_normal","trail_diff","trail_normal","rock_diff","rock_normal"]:
		material.set_shader_parameter(name,load(ROOT+"textures/"+name+".jpg"))
	return material

func world_ground_material() -> ShaderMaterial:
	var material: ShaderMaterial=ground_material()
	material.set_shader_parameter("ground_mask",load(ROOT+"ground-world-D08.png"))
	material.set_shader_parameter("sample_bounds",Vector4(-800,-700,800,700))
	material.set_shader_parameter("forest_only",true)
	return material

func focus_mesh(source: Mesh,lod_index: int=0) -> Mesh:
	var mesh: Mesh=source.duplicate()
	for index: int in range(source.get_surface_count()):
		var original: Material=source.surface_get_material(index)
		if not original is BaseMaterial3D:continue
		var material: ShaderMaterial=ShaderMaterial.new()
		material.shader=load(ROOT+"tree_focus.gdshader")
		material.set_shader_parameter("lod_enabled",distant_trees)
		material.set_shader_parameter("lod_index",lod_index)
		material.set_meta("unmodified_source_material",original)
		material.set_shader_parameter("albedo_tex",original.albedo_texture)
		material.set_shader_parameter("base_color",original.albedo_color)
		material.set_shader_parameter("use_vertex_color",original.vertex_color_use_as_albedo)
		material.set_shader_parameter("uv_scale",Vector2(original.uv1_scale.x,original.uv1_scale.y))
		material.set_shader_parameter("uv_offset",Vector2(original.uv1_offset.x,original.uv1_offset.y))
		material.set_shader_parameter("normal_tex",original.normal_texture)
		material.set_shader_parameter("normal_strength",original.normal_scale)
		material.set_shader_parameter("use_normal",original.normal_enabled)
		material.set_shader_parameter("rough_tex",original.roughness_texture)
		material.set_shader_parameter("use_rough",original.roughness_texture!=null)
		material.set_shader_parameter("rough_channel",original.roughness_texture_channel)
		material.set_shader_parameter("roughness_value",original.roughness)
		material.set_shader_parameter("use_alpha",original.transparency!=BaseMaterial3D.TRANSPARENCY_DISABLED)
		material.set_shader_parameter("source_alpha_cutoff",original.alpha_scissor_threshold)
		mesh.surface_set_material(index,material);focus_materials.append(material)
	return mesh

func load_far_prototypes() -> void:
	var descriptor: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(ROOT+"impostors/far-trees-D07.json"))
	if bool(data.get("full_world",false)):
		var families: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(ROOT+"impostors/far-trees-D09.json"))
		descriptor.assets.merge(families.assets)
	for key: String in descriptor.assets:
		if not prototypes.has(key):continue
		var entry: Dictionary=descriptor.assets[key]
		var quad: QuadMesh=QuadMesh.new();quad.size=Vector2.ONE*entry.size_m
		var material: ShaderMaterial=ShaderMaterial.new();material.shader=load(ROOT+"far_tree.gdshader")
		material.set_shader_parameter("atlas",load(entry.texture));material.set_shader_parameter("vectors",load(entry.vectors))
		material.set_shader_parameter("lod_enabled",true);quad.material=material;far_materials.append(material)
		var parts: Array=[{"mesh":quad,"transform":Transform3D(Basis.IDENTITY,Vector3(entry.center[0],entry.center[1],entry.center[2]))}]
		if prototypes[key].size()>2:prototypes[key][2]=parts
		else:prototypes[key].append(parts)

func update_focus(hero: Vector3, view: Vector3, enabled: bool) -> void:
	for material: ShaderMaterial in focus_materials:
		material.set_shader_parameter("focus_enabled",enabled)
		material.set_shader_parameter("focus_hero",hero)
		material.set_shader_parameter("focus_camera",view)

func canopy_mesh(source: Mesh) -> Mesh:
	var mesh: Mesh = source.duplicate()
	for surface: int in range(mesh.get_surface_count()):
		var original: Material = source.surface_get_material(surface)
		if original.has_meta("unmodified_source_material"):original=original.get_meta("unmodified_source_material")
		var shader: Shader = Shader.new()
		shader.code = "shader_type spatial; render_mode unshaded,cull_disabled; uniform sampler2D silhouette; uniform bool cutout=false; void fragment(){ ALBEDO=vec3(1.0); ALPHA=cutout?texture(silhouette,UV).a:1.0; ALPHA_SCISSOR_THRESHOLD=0.4; }"
		var material: ShaderMaterial = ShaderMaterial.new();material.shader=shader
		if original is BaseMaterial3D and original.albedo_texture != null:
			material.set_shader_parameter("silhouette",original.albedo_texture)
			material.set_shader_parameter("cutout",original.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED)
		mesh.surface_set_material(surface,material)
	return mesh

func measure_canopy(output: String) -> Dictionary:
	var viewport: SubViewport = SubViewport.new()
	viewport.size=Vector2i(1024,1024);viewport.own_world_3d=true
	viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	var environment: WorldEnvironment = WorldEnvironment.new()
	var settings: Environment = Environment.new()
	settings.background_mode=Environment.BG_COLOR;settings.background_color=Color.BLACK
	environment.environment=settings;viewport.add_child(environment)
	var top: Camera3D = Camera3D.new()
	top.projection=Camera3D.PROJECTION_ORTHOGONAL;top.size=170;top.far=600
	viewport.add_child(top);top.position=Vector3(-645,420,-60)
	top.look_at(Vector3(-645,0,-60),Vector3.FORWARD);top.current=true
	for key: String in data.catalog:
		if data.catalog[key].group!="pine_tree_01":continue
		var placements: Array=data.placements.filter(func(p:Dictionary):return p.asset==key)
		for part: Dictionary in prototypes[key][0]:
			var white: Dictionary={"mesh":canopy_mesh(part.mesh),"transform":part.transform}
			viewport.add_child(make_batch(white,placements,Vector3.ZERO))
	for i: int in range(6):await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var picture: Image=viewport.get_texture().get_image()
	picture.save_png(output.path_join("canopy-alpha-mask.png"))
	var eligible: Image=Image.load_from_file(ProjectSettings.globalize_path(ROOT+"sample-canopy-eligible.png"))
	var numerator: int=0;var denominator: int=0
	for y: int in range(picture.get_height()):
		for x: int in range(picture.get_width()):
			if eligible.get_pixel(mini(169,int((x+.5)/1024*170)),mini(169,int((y+.5)/1024*170))).r>.5:
				denominator+=1
				if picture.get_pixel(x,y).r>.5:numerator+=1
	viewport.queue_free()
	return {"method":"Godot orthographic LOD0 silhouette, actual leaf texture alpha, trails and authored clearings excluded","pixels":denominator,"covered_pixels":numerator,"fraction":float(numerator)/maxi(1,denominator),"resolution":[1024,1024]}
