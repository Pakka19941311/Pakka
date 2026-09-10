extends "res://world-final/nature_review.gd"
## Full authored forest distribution in the existing geography scene.
func run_review() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	DirAccess.make_dir_recursive_absolute(output_dir)
	var nature: Node3D=NatureLayer.new();nature.authored_revision="D08";nature.distant_trees=true
	add_child(nature);nature_visual=nature
	status.text="VARENDOR · D08 · загрузка сохранённых лесных массивов"
	await nature.build()
	var ground: ShaderMaterial=nature.world_ground_material()
	for node: Node in find_children("*","MeshInstance3D",true,false):
		if str(node.name).begins_with("cell_"):node.material_override=ground
	var added: Array=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/collision-D08.json")).obstacles
	obstacles.append_array(added);collision.setup(obstacles)
	camera_collision.setup(obstacles.filter(func(o:Dictionary):return not str(o.source_mesh).contains("_access_ramp")))
	var report: Dictionary={"revision":"D08","headless":false,"counts":nature.data.counts,"zones":nature.data.zones,"colliders":added.size(),"batch_count":nature.batches.size(),"walks":[],"main_game_integrated":false,"final_art_accepted":false}
	overview=true;actor.visible=false;nature.set_overview_geometry(true)
	for view: Dictionary in [
		{"id":"whole-world-forests","from":Vector3(870,1450,1740),"to":Vector3(0,70,0)},
		{"id":"living-forest-mass","from":Vector3(-450,360,260),"to":Vector3(-510,70,-80)},
		{"id":"rotten-forest-mass","from":Vector3(-90,325,-190),"to":Vector3(-240,125,-430)},
		{"id":"snow-treeline","from":Vector3(-610,360,-135),"to":Vector3(-570,220,-405)},
		{"id":"southern-forest","from":Vector3(0,240,740),"to":Vector3(-160,40,495)}]:
		camera.position=view.from;camera.look_at(view.to);camera.fov=55
		status.text="VARENDOR · D08 · лесные массивы\nГеология, атмосфера и игровые переходы ещё в работе"
		for i: int in range(3):await get_tree().process_frame
		await capture(view.id)
	if "--overview-only" in OS.get_cmdline_user_args():
		report["overview_uses_actual_geometry"]=true;report["routes_checked_this_run"]=false
		var overview_file: FileAccess=FileAccess.open(output_dir.path_join("world-nature-overview.json"),FileAccess.WRITE);overview_file.store_string(JSON.stringify(report,"  "));overview_file.close()
		get_tree().call_deferred("quit",0);return
	nature.set_overview_geometry(false)
	actor.visible=true;overview=false;camera.fov=rad_to_deg(.82)
	var walks: Array=[{"id":"forest-sample","points":[[-671.5762,-33.5799],[-669.5329,-37.1492],[-648.3,-64.9163]]}]
	for road: Dictionary in layout.roads:
		if road.id not in ["snow-ascent","living-forest-loop","rotten-approach","south-ruins"]:continue
		var index: int=0
		for candidate: int in range(road.points_xyz.size()-1):
			var start: Array=road.points_xyz[candidate];var end: Array=road.points_xyz[candidate+1]
			if road.id=="snow-ascent" and start[1]<150:continue
			if Vector2(start[0],start[2]).distance_to(Vector2(end[0],end[2]))>25:index=candidate;break
		var a: Array=road.points_xyz[index];var b: Array=road.points_xyz[index+1]
		var from: Vector2=Vector2(a[0],a[2]);var to: Vector2=Vector2(b[0],b[2]);to=from+from.direction_to(to)*minf(25,from.distance_to(to))
		walks.append({"id":road.id,"points":[[from.x,from.y],[to.x,to.y]]})
	for walk: Dictionary in walks:
		var points: Array=walk.points;reset_actor(Vector2(points[0][0],-points[0][1]));motor.input_mode="manual"
		var direction: Vector2=Vector2(points[1][0]-points[0][0],-(points[1][1]-points[0][1])).normalized()
		follow.yaw=-atan2(direction.x,direction.y);follow.reset_follow()
		status.text="VARENDOR · D08 · "+walk.id+"\nСуществующий герой и камера · скорость 6,2 м/с"
		for i: int in range(24):await get_tree().physics_frame
		await capture(str(walk.id)+"-start")
		var arrived: bool=true;var first: int=movie_frame
		for point: Array in points.slice(1):
			walk_target=Vector2(point[0],-point[1]);walking=true
			var budget: int=ceili(motor.position_value.distance_to(walk_target)/6.2*60)+180
			while motor.position_value.distance_to(walk_target)>.16 and budget>0:
				await get_tree().physics_frame;budget-=1;recorded_physics+=1
				if recorded_physics%6==0:await record_frame()
			if budget<=0:arrived=false;break
		walking=false;await get_tree().physics_frame;var stopped: Vector2=motor.position_value
		for i: int in range(30):await get_tree().physics_frame
		await capture(str(walk.id)+"-stop")
		report.walks.append({"id":walk.id,"arrived":arrived,"stop_drift_m":stopped.distance_to(motor.position_value),"first_frame":first,"last_frame":movie_frame-1})
	report["all_walks_pass"]=report.walks.all(func(w:Dictionary):return w.arrived and w.stop_drift_m<.000001)
	report["frame_times_ms"]=frame_times;report["frames"]=movie_frame
	var file: FileAccess=FileAccess.open(output_dir.path_join("world-nature-review.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("WORLD_NATURE_REVIEW "+JSON.stringify(report));get_tree().call_deferred("quit",0 if report.all_walks_pass else 3)
