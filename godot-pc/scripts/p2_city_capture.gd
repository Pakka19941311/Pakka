extends RefCounted
## City QA must report an undrawn window instead of waiting forever for a PNG.
## Readback runs on the following process frame, outside the render signal callback.
static func capture(app: Node, name: String) -> bool:
	var record: Dictionary={"name":name,"started_ms":Time.get_ticks_msec(),"phase":"waiting-for-draw"}
	var file: String=app.qa_path.get_base_dir().path_join(name+"-capture.json")
	record["window_mode"]=DisplayServer.window_get_mode()
	record["window_focused"]=DisplayServer.window_is_focused()
	record["frames_drawn_before"]=Engine.get_frames_drawn()
	app.net.save_private_json(file,record)
	if DisplayServer.get_name()=="headless":
		record["phase"]="headless-no-image";app.net.save_private_json(file,record);return false
	var state: Dictionary={"drawn":false}
	var drew: Callable=func():state.drawn=true
	RenderingServer.frame_post_draw.connect(drew,CONNECT_ONE_SHOT)
	var end: int=Time.get_ticks_msec()+3000
	while not state.drawn and Time.get_ticks_msec()<end:
		await app.get_tree().process_frame
	if RenderingServer.frame_post_draw.is_connected(drew):RenderingServer.frame_post_draw.disconnect(drew)
	if not state.drawn:
		record["phase"]="draw-timeout";record["ended_ms"]=Time.get_ticks_msec()
		record["window_mode"]=DisplayServer.window_get_mode();record["frames_drawn_after"]=Engine.get_frames_drawn()
		app.net.save_private_json(file,record);return false
	record["phase"]="readback";record["draw_seen_ms"]=Time.get_ticks_msec();app.net.save_private_json(file,record)
	var picture: Image=app.get_viewport().get_texture().get_image()
	record["readback_ms"]=Time.get_ticks_msec();record["phase"]="save-png"
	app.net.save_private_json(file,record)
	var result: Error=picture.save_png(app.qa_path.get_base_dir().path_join(name+".png"))
	record["phase"]="complete" if result==OK else "save-failed";record["error"]=result;record["ended_ms"]=Time.get_ticks_msec()
	app.net.save_private_json(file,record)
	return result==OK
