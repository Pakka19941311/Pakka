extends "res://world-final/interior_preview.gd"
var walking: bool=false
var walk_target: Vector2
var frame_number: int=0
var sample_ticks: int=0
var frame_times_ms: Array=[]

func _physics_process(dt: float) -> void:
	if not loaded:return
	motor.input_direction=(walk_target-motor.position_value).normalized() if walking else Vector2.ZERO
	motor.physics_step(dt)

func take_frame() -> void:
	await RenderingServer.frame_post_draw
	var img: Image=get_viewport().get_texture().get_image()
	img.save_jpg(output_dir.path_join("frame-%05d.jpg" % frame_number),.85)
	frame_times_ms.append(Time.get_ticks_msec());frame_number+=1

func run_review() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	DirAccess.make_dir_recursive_absolute(output_dir)
	overview=false;ceiling.show();camera.fov=rad_to_deg(.82)
	var points: Array=space.corridors[1].points
	reset_actor(Vector2(points[0][0],-points[0][1]));motor.input_mode="manual"
	follow.yaw=0;follow.reset_follow()
	for frame: int in range(35):await get_tree().physics_frame
	var success: bool=true
	for point: Array in points.slice(1):
		walk_target=Vector2(point[0],-point[1]);walking=true
		var budget: int=ceili(motor.position_value.distance_to(walk_target)/6.2*60)+180
		while motor.position_value.distance_to(walk_target)>.16 and budget>0:
			await get_tree().physics_frame
			budget-=1;sample_ticks+=1
			if sample_ticks%6==0:await take_frame()
		if budget<=0:success=false;break
	walking=false;await get_tree().physics_frame
	var stop: Vector2=motor.position_value
	for frame: int in range(60):
		await get_tree().physics_frame
		if frame%6==0:await take_frame()
	await capture("corridor-stop")
	var result: Dictionary={"space_id":space_id,"speed_m_s":6.2,"headless":false,"ceiling_visible":ceiling.visible,"frames":frame_number,"frame_times_ms":frame_times_ms,
		"arrived":success,"stop_drift_m":stop.distance_to(motor.position_value),"prebaked_navigation_reused":get_meta("navigation_cache_reused",false),"main_game_integrated":false}
	var file: FileAccess=FileAccess.open(output_dir.path_join("motion-review.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(result,"  "));file.close()
	print("INTERIOR_MOTION "+JSON.stringify(result))
	get_tree().quit(0 if success and result.stop_drift_m<.000001 else 3)
