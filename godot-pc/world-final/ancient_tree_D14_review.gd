extends "res://world-final/nature_review.gd"

func run_review() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	DirAccess.make_dir_recursive_absolute(output_dir)
	var old: Node=find_child("ANCIENT_TREE",true,false)
	assert(old!=null,"Expected existing ancient tree landmark")
	old.get_parent().remove_child(old);old.queue_free()
	obstacles=obstacles.filter(func(o: Dictionary):return o.landmark!="ANCIENT_TREE")
	var tree: Node3D=load("res://world-final/nature/assets/ancient_tree_D14.glb").instantiate();add_child(tree)
	var extra: Array=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/ancient-tree-collision-D14.json")).obstacles
	obstacles.append_array(extra)
	var details: Node3D=load("res://world-final/nature/groundcover_layer.gd").new()
	details.authored_revision="D13";details.geology_material_revision="D13";details.grass_shader="res://world-final/nature/grass_lit_D13.gdshader";add_child(details);await details.build()
	obstacles.append_array(JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/groundcover-collision-D13.json")).obstacles)
	var nature: Node3D=NatureLayer.new();nature.authored_revision="D13";nature.distant_trees=true;add_child(nature);nature_visual=nature;await nature.build()
	obstacles.append_array(JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/collision-D13.json")).obstacles)
	var ground: ShaderMaterial=load("res://world-final/materials/geology_material_D12.gd").terrain("D13")
	for node: Node in find_children("*","MeshInstance3D",true,false):
		if str(node.name).begins_with("cell_"):node.material_override=ground
	for material: ShaderMaterial in nature.focus_materials:
		var source: Material=material.get_meta("unmodified_source_material")
		if "pine_tree_01_twig" in source.resource_name:material.set_shader_parameter("base_color",Color(.70,.96,.72))
	get_viewport().msaa_3d=Viewport.MSAA_4X
	collision.setup(obstacles);camera_collision.setup(obstacles.filter(func(o: Dictionary):return not str(o.source_mesh).contains("_access_ramp")))
	overview=true;nature.set_overview_geometry(true);actor.visible=true
	reset_actor(Vector2(-170,438));motor.input_mode="manual";camera.fov=55
	for view: Dictionary in [
		{"id":"ancient-tree-context","from":Vector3(-207,181,-353),"to":Vector3(-170,144,-450)},
		{"id":"ancient-tree-hollow","from":Vector3(-173,129,-429),"to":Vector3(-168,132,-450)},
		{"id":"ancient-tree-west","from":Vector3(-223,154,-421),"to":Vector3(-170,141,-450)}]:
		camera.position=view.from;camera.look_at(view.to)
		status.text="VARENDOR · D14 · древнее дерево\nНативная геометрия, полый ствол и корни · визуальная проверка"
		for i: int in range(8):await get_tree().process_frame
		await capture(view.id)
	if "--tree-static-only" in OS.get_cmdline_user_args():get_tree().call_deferred("quit",0);return
	nature.set_overview_geometry(false);overview=false;camera.fov=rad_to_deg(.82)
	var points: Array=[[-194.0,-425.0],[-181.0,-433.0],[-170.0,-440.0],[-170.0,-449.0]]
	var walks: Array=[]
	for reverse: bool in [false,true]:
		var route: Array=points.duplicate()
		if reverse:route.reverse()
		reset_actor(Vector2(route[0][0],-route[0][1]));motor.input_mode="manual"
		var direction: Vector2=Vector2(route[1][0]-route[0][0],-(route[1][1]-route[0][1])).normalized()
		follow.yaw=-atan2(direction.x,direction.y);follow.reset_follow()
		status.text="VARENDOR · D14 · "+("выход из полого ствола" if reverse else "подход к полому стволу")+"\nСуществующий герой и камера · 6,2 м/с"
		for i: int in range(24):await get_tree().physics_frame
		var first: int=movie_frame;var arrived: bool=true
		for point: Array in route.slice(1):
			walk_target=Vector2(point[0],-point[1]);walking=true
			var budget: int=ceili(motor.position_value.distance_to(walk_target)/6.2*60)+150
			while motor.position_value.distance_to(walk_target)>.16 and budget>0:
				await get_tree().physics_frame;budget-=1;recorded_physics+=1
				if recorded_physics%6==0:await record_frame()
			if budget<=0:arrived=false;break
		walking=false;await get_tree().physics_frame;var stopped: Vector2=motor.position_value
		for i: int in range(30):await get_tree().physics_frame
		await capture("hollow-exit-stop" if reverse else "hollow-entry-stop")
		walks.append({"reverse":reverse,"arrived":arrived,"stop_drift_m":stopped.distance_to(motor.position_value),"last_position_server":[stopped.x,stopped.y],"first_frame":first,"last_frame":movie_frame-1})
	var report: Dictionary={"revision":"D14","headless":false,"native_source":"art/world-final/Varendor_Ancient_Tree_D-14.blend","forest_removed":0,"tree_colliders":extra.size(),"walks":walks,"frames":movie_frame,"all_walks_pass":walks.all(func(w: Dictionary):return w.arrived and w.stop_drift_m<.000001),"final_art_accepted":false,"main_integrated":false}
	var file: FileAccess=FileAccess.open(output_dir.path_join("ancient-tree-review.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("ANCIENT_TREE_REVIEW "+JSON.stringify(report));get_tree().call_deferred("quit",0 if report.all_walks_pass else 3)
