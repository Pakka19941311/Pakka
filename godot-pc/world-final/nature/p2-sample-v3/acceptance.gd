extends Node3D
const SAMPLE=preload("res://world-final/nature/p2-sample-v3/nature_sample.gd")
const ROOT: String="res://world-final/nature/p2-sample-v3/"
var checks: Array[Dictionary]=[]
var output: String=""
func check(label: String,pass_value: bool,evidence: Variant=null) -> void:
	checks.append({"name":label,"pass":pass_value,"evidence":evidence})
func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--nature-output="):output=arg.trim_prefix("--nature-output=")
	assert(not output.is_empty(),"Explicit QA output required")
	DirAccess.make_dir_recursive_absolute(output)
	var fixture: Node3D=Node3D.new();add_child(fixture)
	var batch: MultiMeshInstance3D=MultiMeshInstance3D.new();fixture.add_child(batch)
	var original: MultiMesh=MultiMesh.new();original.transform_format=MultiMesh.TRANSFORM_3D;original.use_custom_data=true;original.mesh=QuadMesh.new();original.instance_count=2
	original.set_instance_transform(0,Transform3D(Basis.IDENTITY,Vector3(-290,55,200)));original.set_instance_custom_data(0,Color(-290,55,200,1))
	original.set_instance_transform(1,Transform3D(Basis.IDENTITY,Vector3(-400,55,200)));original.set_instance_custom_data(1,Color(-400,55,200,1));batch.multimesh=original;fixture.hide()
	var sample: Node3D=SAMPLE.new();add_child(sample);sample.build(fixture)
	check("all chunks instantiated",sample.get_child_count()==sample.data.chunks.size(),sample.get_child_count())
	check("no physical scene objects",sample.find_children("*","CollisionObject3D",true,false).is_empty())
	check("no hero rigs",sample.find_children("*","Skeleton3D",true,false).is_empty())
	check("small decorations contain only grass chunks",sample.small_decorations.size()==sample.data.chunks.filter(func(c: Dictionary)->bool:return c.kind=="grass").size(),sample.small_decorations.size())
	check("local old grass suppressed",batch.multimesh!=original and batch.multimesh.get_instance_transform(0).basis.x.length()==0)
	check("outside old grass unchanged",batch.multimesh.get_instance_transform(1).is_equal_approx(original.get_instance_transform(1)))
	var count: int=sample.get_child_count();sample.build(fixture);check("build idempotent",sample.get_child_count()==count)
	sample.restore_local_grass();check("baseline grass restored by reference",batch.multimesh==original)
	var env: WorldEnvironment=WorldEnvironment.new();env.environment=Environment.new();env.environment.background_mode=Environment.BG_COLOR;env.environment.background_color=Color("a7b5bc");env.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.environment.ambient_light_color=Color("bdc9dc");env.environment.ambient_light_energy=.65;env.environment.tonemap_mode=Environment.TONE_MAPPER_FILMIC;add_child(env)
	var sun: DirectionalLight3D=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-48,-35,0);sun.light_color=Color("e9eff5");sun.light_energy=.95;sun.shadow_enabled=true;sun.directional_shadow_max_distance=90;add_child(sun)
	# Reconstruct only the matching real source triangles under the render-only
	# overlay, so close/far captures can reveal overlap. No physics body is made.
	var base_material: Material=load("res://world-final/materials/geology_material_D12.gd").terrain("D13","")
	for entry: Dictionary in sample.data.chunks:
		if entry.kind!="ground":continue
		var under: Node3D=load(ROOT+str(entry.path)).instantiate();under.position.y=-.008;add_child(under)
		for mesh: MeshInstance3D in under.find_children("*","MeshInstance3D",true,false):mesh.material_override=base_material
		if under is MeshInstance3D:under.material_override=base_material
	var polygon: PackedVector2Array=PackedVector2Array()
	for point: Array in sample.data.qaWaterPolygon:polygon.append(Vector2(point[0],point[1]))
	var indices: PackedInt32Array=Geometry2D.triangulate_polygon(polygon);var surface: SurfaceTool=SurfaceTool.new();surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index: int in indices:surface.set_normal(Vector3.UP);surface.add_vertex(Vector3(polygon[index].x,40,polygon[index].y))
	var water: MeshInstance3D=MeshInstance3D.new();water.mesh=surface.commit();var water_material: StandardMaterial3D=StandardMaterial3D.new();water_material.albedo_color=Color(.15,.3,.29,.75);water_material.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA;water_material.cull_mode=BaseMaterial3D.CULL_DISABLED;water_material.roughness=.3;water.material_override=water_material;add_child(water)
	var hero: Node3D=load("res://assets/knight/Knight_Modular.glb").instantiate();hero.scale=Vector3.ONE*(2.05/1.84);add_child(hero)
	var hidden: Array[String]=["FK_body_torso","FK_body_upperarms","FK_body_hands","FK_body_forearms","FK_body_calves","FK_body_feet","FK_human_hair","FK_human_eyes","FK_human_brows","FK_body_head","FK_starter_pants","FK_head_open_helmet"]
	for mesh: MeshInstance3D in hero.find_children("*","MeshInstance3D",true,false):
		for prefix: String in hidden:
			if mesh.name.begins_with(prefix):mesh.hide()
	var camera: Camera3D=Camera3D.new();camera.fov=rad_to_deg(.82);camera.near=.15;camera.far=450;add_child(camera);camera.current=true
	DisplayServer.window_set_size(Vector2i(1600,900))
	for shot: Dictionary in sample.data.qaShots:
		var hp: Array=shot.heroGodot;hero.position=Vector3(hp[0],hp[1],hp[2]);var cp: Array=shot.cameraBlender;var fp: Array=shot.focusBlender
		camera.position=Vector3(cp[0],cp[2],-cp[1]);var target: Vector3=Vector3(fp[0],fp[2],-fp[1]);camera.look_at(target);hero.look_at(Vector3(target.x,hero.position.y,target.z),Vector3.UP,true)
		await get_tree().process_frame
		if DisplayServer.get_name()!="headless":
			await RenderingServer.frame_post_draw;get_viewport().get_texture().get_image().save_png(output.path_join(str(shot.name)+"-native.png"))
		if shot.name=="forest-gameplay":
			camera.position=target+(camera.position-target)*4.5;camera.look_at(target);await get_tree().process_frame
			if DisplayServer.get_name()!="headless":
				await RenderingServer.frame_post_draw;get_viewport().get_texture().get_image().save_png(output.path_join("forest-far-native.png"))
	check("ground overlay has separate material",sample.find_children("*","MeshInstance3D",true,false).any(func(m: MeshInstance3D)->bool:return m.material_override is ShaderMaterial))
	var failed: int=checks.filter(func(c: Dictionary)->bool:return not c.pass).size();var f: FileAccess=FileAccess.open(output.path_join("nature-acceptance.json"),FileAccess.WRITE);f.store_string(JSON.stringify({"checks":checks.size(),"failed":failed,"results":checks,"scope":"isolated source adapter; not packaged/full-world/performance acceptance"},"\t"));f.close();print("P2_NATURE_QA "+JSON.stringify({"checks":checks.size(),"failed":failed}))
	sample.queue_free();hero.queue_free();fixture.queue_free();await get_tree().process_frame;get_tree().quit(0 if failed==0 else 2)
