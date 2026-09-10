extends "res://world-final/geography_motion_review.gd"
const NatureLayer = preload("res://world-final/nature/nature_layer.gd")
var frame_times: Array[int]=[]

func record_frame() -> void:
	frame_times.append(Time.get_ticks_msec())
	await super.record_frame()

func run_review() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	DirAccess.make_dir_recursive_absolute(output_dir)
	status.text="VARENDOR · D01 · загрузка лесного участка"
	var nature: Node3D = NatureLayer.new();add_child(nature)
	await nature.build()
	var ground: ShaderMaterial = nature.ground_material()
	for node: Node in find_children("*","MeshInstance3D",true,false):
		if str(node.name).begins_with("cell_"):node.material_override=ground
	var added: Array=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/collision-"+str(nature.data.revision)+".json")).obstacles
	obstacles.append_array(added);collision.setup(obstacles)
	camera_collision.setup(obstacles.filter(func(o:Dictionary):return not str(o.source_mesh).contains("_access_ramp")))
	var report: Dictionary={"stage":nature.data.revision,"scope":"170x170m forest sample","full_world":false,"headless":false,"counts":nature.data.counts,"colliders":added.size(),"normal_speed_m_s":6.2,"walks":[]}
	if "--nature-static" in OS.get_cmdline_user_args():
		overview=false;camera.fov=rad_to_deg(.82)
		reset_actor(Vector2(-671.5762,33.5799));motor.input_mode="manual"
		for view: Dictionary in [{"id":"previous-defect-angle","yaw":.521},{"id":"cross-trail","yaw":1.52},{"id":"canopy-edge","yaw":-.62}]:
			follow.yaw=view.yaw;follow.reset_follow()
			status.text="VARENDOR · "+str(nature.data.revision)+" · проверка контуров хвои"
			for i: int in range(30):await get_tree().process_frame
			await capture(view.id)
		report["routes_checked_this_run"]=false;report["all_pass"]=null
		var visual_file: FileAccess=FileAccess.open(output_dir.path_join("nature-appearance.json"),FileAccess.WRITE)
		visual_file.store_string(JSON.stringify(report,"  "));visual_file.close()
		get_tree().quit(0);return
	status.text="VARENDOR · "+str(nature.data.revision)+" · лесной участок 170 × 170 м"
	camera.position=Vector3(-645,240,110);camera.look_at(Vector3(-645,70,-60));camera.fov=55
	for i: int in range(25):await get_tree().process_frame
	await capture("forest-overview")
	report.canopy=await nature.measure_canopy(output_dir)
	report.trunks_block=added.filter(func(o:Dictionary):return o.kind=="circle").all(func(o:Dictionary):return collision.blocked(Vector2(o.x,o.z)))
	var walks: Array=[{"id":"forest-trail","points":[[-671.5762,-33.5799],[-669.5329,-37.1492],[-648.3,-64.9163],[-615.4671,-107.8508],[-612.6337,-111.3271]]}]
	overview=false;camera.fov=rad_to_deg(.82)
	for walk: Dictionary in walks:
		var points: Array=walk.points
		reset_actor(Vector2(points[0][0],-points[0][1]));motor.input_mode="manual"
		var direction: Vector2=Vector2(points[1][0]-points[0][0],-(points[1][1]-points[0][1])).normalized()
		# Camera yaw rotates server-forward toward negative X. This is only
		# the review camera's starting orientation, not a controller change.
		follow.yaw=-atan2(direction.x,direction.y);follow.reset_follow()
		status.text="VARENDOR · "+str(nature.data.revision)+" · лесная тропа\n6,2 м/с · существующий герой, управление и камера"
		for i: int in range(30):await get_tree().physics_frame
		await capture("forest-trail-start")
		var first: int=movie_frame;var arrived: bool=true
		for point: Array in points.slice(1):
			walk_target=Vector2(point[0],-point[1]);walking=true
			var budget: int=ceili(motor.position_value.distance_to(walk_target)/6.2*60)+180
			while motor.position_value.distance_to(walk_target)>.16 and budget>0:
				await get_tree().physics_frame;budget-=1;recorded_physics+=1
				if recorded_physics%6==0:await record_frame()
			if budget<=0:arrived=false;break
		walking=false;await get_tree().physics_frame
		var stop: Vector2=motor.position_value
		for i: int in range(60):
			await get_tree().physics_frame
			if i%6==0:await record_frame()
		await capture(str(walk.id)+"-stop")
		report.walks.append({"id":walk.id,"arrived":arrived,"stop_drift_m":stop.distance_to(motor.position_value),"first_frame":first,"last_frame":movie_frame-1})
	report.all_pass=report.walks.all(func(w:Dictionary):return w.arrived and w.stop_drift_m<.000001) and report.trunks_block
	report.frames=movie_frame;report.frame_times_ms=frame_times
	report.canopy_target_met=report.canopy.fraction>=.75 and report.canopy.fraction<=.90
	var f: FileAccess=FileAccess.open(output_dir.path_join("nature-review.json"),FileAccess.WRITE)
	f.store_string(JSON.stringify(report,"  "));f.close()
	print("NATURE_REVIEW "+JSON.stringify(report))
	get_tree().quit(0 if report.all_pass else 3)
