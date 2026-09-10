extends "res://world-final/geography_preview.gd"
## Actual fixed-physics, normal-speed walks, rendered with the accepted hero.
## This supplements accelerated route coverage; it never replaces server QA.
var walking: bool = false
var walk_target: Vector2
var movie_frame: int = 0
var recorded_physics: int = 0

func _physics_process(dt: float) -> void:
	if not loaded:return
	motor.input_direction = (walk_target-motor.position_value).normalized() if walking else Vector2.ZERO
	motor.physics_step(dt)

func record_frame() -> void:
	await RenderingServer.frame_post_draw
	var picture: Image = get_viewport().get_texture().get_image()
	picture.save_jpg(output_dir.path_join("frame-%05d.jpg" % movie_frame),.85)
	movie_frame += 1

func run_review() -> void:
	if DisplayServer.get_name()=="headless":
		push_error("Motion evidence requires the graphical renderer")
		get_tree().quit(4)
		return
	DirAccess.make_dir_recursive_absolute(output_dir)
	var walks: Array = [
		{"id":"fort-gate","points":[[-100,70,245],[-100,70,205]]},
		{"id":"lake-bridge","points":[[284,48,144],[332,48,144]]},
		{"id":"mine-entrance","points":[[35,125,-397],[35,125,-422]]},
		{"id":"cave-entrance","points":[[245,48,-248],[245,48,-282]]},
		{"id":"sanctuary-ramp","points":[[620,80,-42],[620,83,-56],[620,83,-90]]}]
	for road: Dictionary in layout.roads:
		if road.id in ["snow-ascent","volcano-ascent"]:
			var points: Array = road.points_xyz
			var segment: int = floori(points.size()*.55)
			var a: Array = points[segment]
			var b: Array = points[segment+1]
			# Select a long real segment, keeping exactly its slope and direction.
			for index: int in range(segment,points.size()-1):
				if Vector2(points[index][0],points[index][2]).distance_to(Vector2(points[index+1][0],points[index+1][2]))>30:
					a=points[index];b=points[index+1];break
			var from: Vector3 = Vector3(a[0],a[1],a[2])
			var to: Vector3 = Vector3(b[0],b[1],b[2])
			to = from+(to-from).normalized()*minf(32,from.distance_to(to))
			walks.append({"id":road.id,"points":[a,[to.x,to.y,to.z]]})
	var report: Dictionary = {"normal_speed_m_s":6.2,"physics_hz":Engine.physics_ticks_per_second,"frame_sample_hz":10,"headless":false,"walks":[],"server_integration":false}
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--motion-only="):
			var selected: String=arg.trim_prefix("--motion-only=")
			walks=walks.filter(func(w: Dictionary):return w.id==selected)
			assert(not walks.is_empty())
	overview=false
	camera.fov=rad_to_deg(.82)
	for walk: Dictionary in walks:
		var points: Array=walk.points
		reset_actor(Vector2(points[0][0],-points[0][2]))
		motor.input_mode="manual"
		var direction: Vector2=Vector2(points[1][0]-points[0][0],-(points[1][2]-points[0][2])).normalized()
		follow.yaw=atan2(direction.x,direction.y)
		follow.reset_follow()
		status.text="VARENDOR · B · " + str(walk.id) + "\nПроход 6,2 м/с · исходный герой и контроллер · макеты окружения"
		for frame: int in range(30):await get_tree().physics_frame
		var arrived: bool=true
		var start_frame: int=movie_frame
		for point: Array in points.slice(1):
			walk_target=Vector2(point[0],-point[2]);walking=true
			var budget: int=ceili(motor.position_value.distance_to(walk_target)/6.2*60)+180
			while motor.position_value.distance_to(walk_target)>.16 and budget>0:
				await get_tree().physics_frame
				budget-=1;recorded_physics+=1
				if recorded_physics%6==0:await record_frame()
			if budget<=0:arrived=false;break
		walking=false
		await get_tree().physics_frame
		var stop: Vector2=motor.position_value
		for frame: int in range(60):
			await get_tree().physics_frame
			if frame%6==0:await record_frame()
		await capture(str(walk.id)+"-stop")
		report.walks.append({"id":walk.id,"arrived":arrived,"stop_drift_m":stop.distance_to(motor.position_value),"first_frame":start_frame,"last_frame":movie_frame-1})
	report["frames"]=movie_frame
	report["all_pass"]=report.walks.all(func(w:Dictionary):return w.arrived and w.stop_drift_m<.000001)
	var file: FileAccess=FileAccess.open(output_dir.path_join("motion-review.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "));file.close()
	print("WORLD_B_MOTION "+JSON.stringify(report))
	get_tree().quit(0 if report.all_pass else 3)
