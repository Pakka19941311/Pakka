extends "res://world-final/geography_motion_review.gd"
## Normal-speed movements through changed architecture; captured frame times.
var frame_times: Array[int]=[]

func record_frame() -> void:
	frame_times.append(Time.get_ticks_msec())
	await super.record_frame()

func run_review() -> void:
	if DisplayServer.get_name()=="headless":
		get_tree().quit(4)
		return
	DirAccess.make_dir_recursive_absolute(output_dir)
	var walks: Array=[
		{"id":"fort-gate","points":[[-100,245],[-100,205]]},
		{"id":"pier","points":[[379,16],[378,25],[375,25],[345,25],[330,25]]},
		{"id":"ruin-R04","points":[[24,476],[24,467]]},
		{"id":"grave-aisle","points":[[449,365],[449,331]]}]
	var report: Dictionary={"stage":terrain.get("architecture_revision","C"),"headless":false,"normal_speed_m_s":6.2,"walks":[],"main_integrated":false}
	overview=false;camera.fov=rad_to_deg(.82)
	for walk: Dictionary in walks:
		var points: Array=walk.points
		reset_actor(Vector2(points[0][0],-points[0][1]));motor.input_mode="manual"
		var direction: Vector2=Vector2(points[1][0]-points[0][0],-(points[1][1]-points[0][1])).normalized()
		follow.yaw=atan2(direction.x,direction.y);follow.reset_follow()
		status.text="VARENDOR · C · "+str(walk.id)+"\nПроход 6,2 м/с · существующий герой и управление"
		for i: int in range(30):await get_tree().physics_frame
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
	report["all_pass"]=report.walks.all(func(w:Dictionary):return w.arrived and w.stop_drift_m<.000001)
	report["frames"]=movie_frame;report["frame_times_ms"]=frame_times
	var f: FileAccess=FileAccess.open(output_dir.path_join("motion-review.json"),FileAccess.WRITE)
	f.store_string(JSON.stringify(report,"  "));f.close()
	print("ARCHITECTURE_MOTION "+JSON.stringify(report))
	get_tree().quit(0 if report.all_pass else 3)
