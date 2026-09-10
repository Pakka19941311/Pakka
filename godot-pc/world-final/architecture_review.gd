extends "res://world-final/geography_preview.gd"
## Real C architecture inside the existing project; no saved character mutated.

func capture(name: String) -> void:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_jpg(output_dir.path_join(name+".jpg"),.91)

func run_review() -> void:
	if DisplayServer.get_name()=="headless":
		push_error("Architecture visual review needs a renderer")
		get_tree().quit(4)
		return
	DirAccess.make_dir_recursive_absolute(output_dir)
	status.text="VARENDOR · C · архитектура\nПрирода, атмосфера, население и перенос основной игры впереди"
	await capture("overview-C")
	var result: Dictionary={"stage":terrain.get("architecture_revision","C05"),"headless":false,"collision_entries":obstacles.size(),"routes":[],"main_integrated":false,"final_art":false}
	var roads: Array=layout.roads+layout.get("review_routes",[])
	if str(terrain.get("architecture_revision",""))>="C07":
		roads.append({"id":"pier-access","points_xyz":[[420,48,40],[404,48,40],[399,48,16],[379,48,16],[378,48,25],[375,48,25],[345,41.2,25],[330,41.2,25]]})
	for obj: Dictionary in layout.objects:
		if obj.kind=="ruined_house":
			var p: Array=obj.position
			roads.append({"id":str(obj.id)+"-inside","points_xyz":[[p[0],p[1],p[2]+float(obj.size[2])/2+4],[p[0],float(p[1])+.3,p[2]+1]]})
	var reverse: Array=[]
	for road: Dictionary in roads:
		var back: Dictionary=road.duplicate(true);back.id=str(road.id)+"-return";back.points_xyz.reverse();reverse.append(back)
	roads+=reverse
	var appearance_only: bool=OS.get_cmdline_user_args().has("--appearance-only")
	if appearance_only:roads=[]
	result["routes_checked_this_run"]=not appearance_only
	for road: Dictionary in roads:
		var points: Array=road.points_xyz
		reset_actor(Vector2(points[0][0],-points[0][2]));motor.input_mode="manual"
		var arrived: bool=true;var max_step: float=0
		for p: Array in points.slice(1):
			var to: Vector2=Vector2(p[0],-p[2]);var budget: int=ceili(motor.position_value.distance_to(to)/6.2*60)+180
			while motor.position_value.distance_to(to)>.15 and budget>0:
				var prev: Vector2=motor.position_value
				motor.input_direction=(to-prev).normalized();motor.physics_step(1.0/60.0)
				max_step=maxf(max_step,absf(height_server(prev.x,prev.y)-height_server(motor.position_value.x,motor.position_value.y)))
				budget-=1
				if budget%300==0:await get_tree().process_frame
			if budget==0:arrived=false;break
		motor.input_direction=Vector2.ZERO;motor.physics_step(1.0/60.0)
		var stopped: Vector2=motor.position_value
		for i: int in range(60):motor.physics_step(1.0/60.0)
		result.routes.append({"id":road.id,"arrived":arrived,"stop_drift_m":stopped.distance_to(motor.position_value),"max_support_step_m":max_step})
	result["all_routes_pass"]=null if appearance_only else result.routes.all(func(r:Dictionary):return r.arrived and r.stop_drift_m<.000001 and r.max_support_step_m<.08)
	var views: Array=[
		{"id":"village","point":Vector2(-489,-352),"yaw":0.0},
		{"id":"fort-gate","point":Vector2(-100,-245),"yaw":0.0},
		{"id":"fort-court","point":Vector2(-108,-150),"yaw":0.0},
		{"id":"shore-houses","point":Vector2(420,-86),"yaw":0.0},
		{"id":"mine-portal","point":Vector2(35,397),"yaw":0.0},
		{"id":"cave-mouth","point":Vector2(245,248),"yaw":0.0},
		{"id":"sanctuary","point":Vector2(620,43),"yaw":0.0},
		{"id":"ruin-inside","point":Vector2(-35,-443),"yaw":0.0},
		{"id":"church","point":Vector2(660,-331),"yaw":0.0},
		{"id":"graves","point":Vector2(452,-363),"yaw":0.0},
		{"id":"statue","point":Vector2(422,-512),"yaw":0.0}]
	views.append({"id":"pier","point":Vector2(361,-25),"yaw":-PI/2})
	for view: Dictionary in views:
		reset_actor(view.point);overview=false;camera.fov=rad_to_deg(.82);follow.yaw=view.yaw;follow.reset_follow()
		for i: int in range(40):await get_tree().process_frame
		await capture(view.id)
	# Stable independent overview views show composition, not just close details.
	overview=true
	for view: Dictionary in [{"id":"fort-overview","from":Vector3(-250,210,330),"to":Vector3(-100,80,140)},
		{"id":"village-overview","from":Vector3(-550,102,420),"to":Vector3(-484,39,330)},
		{"id":"church-overview","from":Vector3(575,132,415),"to":Vector3(660,47,280)},
		{"id":"statue-overview","from":Vector3(391,54,542),"to":Vector3(422,35,498)},
		{"id":"pier-overview","from":Vector3(304,72,76),"to":Vector3(353,43,25)}]:
		camera.position=view.from;camera.fov=52;camera.look_at(view.to)
		await capture(view.id)
	result["preview_draw_calls_last_view"]=Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
	result["preview_objects_last_view"]=Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)
	var f: FileAccess=FileAccess.open(output_dir.path_join("architecture-review.json"),FileAccess.WRITE)
	f.store_string(JSON.stringify(result,"  "));f.close()
	print("ARCHITECTURE_REVIEW "+JSON.stringify(result))
	get_tree().quit(0 if appearance_only or result.all_routes_pass else 3)
