extends RefCounted
# Graphical, ordinary client input against a disposable real world server.
# Fixture requests only place the test hero beside services/entrances.
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

class Run extends Node:
	var app: Node
	var checks: Dictionary = {}
	var rows: Array[Dictionary] = []
	var transitions: Array[Dictionary] = []
	var disconnects: Array[Dictionary] = []
	var phase: String = "startup"
	var started: int
	var deadline: int
	var last_frame: int = 0
	var last_snapshot: int = 0
	var next_progress: int = 0
	var finished: bool = false
	var budget_seconds: int = 210
	var fixture_serial: int = 0

	func _process(_delta: float) -> void:
		if finished: return
		var now: int = Time.get_ticks_msec()
		var motor: VarendorPlayerMovement = app.world.player_motion
		var unsent: int = 0
		if app.net.input_transport != null:
			app.net.input_transport._mutex.lock()
			unsent = app.net.input_transport._queue.size()
			app.net.input_transport._mutex.unlock()
		if last_frame > 0 and not app.net.hero.is_empty():
			rows.append({"wall_ms":now-started,"frame_ms":now-last_frame,"phase":phase,"generation":int(app.net.hero.get("generation",0)),"space":str(app.net.hero.get("spaceId","surface")),
				"sse_age_ms":now-last_snapshot,"network_bookkeeping":app.net.input_queue.size(),"unsent":unsent,"sequence":app.net.sequence,"ack":int(app.net.hero.get("lastInputSequence",-1)),
				"loading":app.world.space_loading,"physics_ms":motor.clock_ms,"remote_ms":app.world.timeline.clock_ms,"server_ms":app.net.last_time,
				"position":[motor.position_value.x,motor.position_value.y],"render_position":[app.world.hero_position.x,-app.world.hero_position.z],"correction":[motor.visual_correction.x,motor.visual_correction.y],"speed":motor.speed,
				"process_ms":Performance.get_monitor(Performance.TIME_PROCESS)*1000.0,"physics_cost_ms":Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0})
		last_frame = now
		if now >= next_progress:
			next_progress = now+2000
			app.net.save_private_json(app.qa_path.get_base_dir().path_join("stability-progress.json"),{"phase":phase,"elapsed_ms":now-started,"samples":rows.size(),"checks":checks,"last_sample":rows.back() if not rows.is_empty() else {}})
		if now >= deadline: finish("time-budget-exceeded")

	func received(_snapshot: Dictionary) -> void:
		last_snapshot = Time.get_ticks_msec()

	func disconnected(reason: String,_details: Dictionary) -> void:
		disconnects.append({"wall_ms":Time.get_ticks_msec()-started,"phase":phase,"reason":reason})

	func key(code: Key,pressed: bool) -> void:
		var event: InputEventKey = InputEventKey.new(); event.physical_keycode = code; event.keycode = code; event.pressed = pressed
		app.get_viewport().push_input(event,true)

	func tap(code: Key) -> void:
		key(code,true); key(code,false)

	func wait(test: Callable, milliseconds: int) -> bool:
		var end: int = mini(deadline,Time.get_ticks_msec()+milliseconds)
		while not finished and Time.get_ticks_msec()<end:
			await get_tree().process_frame
			if test.call(): return true
		return false

	func pause(milliseconds: int) -> void:
		var end: int = mini(deadline,Time.get_ticks_msec()+milliseconds)
		await wait(func(): return Time.get_ticks_msec()>=end, milliseconds+50)

	func fixture(kind: String) -> Dictionary:
		fixture_serial += 1
		var name: String = "stability:"+kind+":"+str(fixture_serial)
		app.net.save_private_json(app.qa_path.get_base_dir().path_join("fixture-request.json"),{"stage":name})
		var path: String = app.qa_path.get_base_dir().path_join("fixture-ready.json")
		var ready: bool = await wait(func():
			if not FileAccess.file_exists(path): return false
			var value = JSON.parse_string(FileAccess.get_file_as_string(path))
			return value is Dictionary and value.get("stage","")==name,8000)
		if not ready: return {}
		var result: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
		if result.has("error"): return result
		ready = await wait(func(): return int(app.net.hero.get("generation",-1))>=int(result.generation) and not app.world.space_loading and int(app.world.player_motion.generation)==int(result.generation),12000)
		if not ready: return {}
		await pause(350)
		return result

	func point() -> Vector2:
		return Vector2(app.net.hero.get("x",0),app.net.hero.get("z",0))

	func neutral() -> bool:
		for code: Key in [KEY_W,KEY_A,KEY_S,KEY_D]: key(code,false)
		app.player_input.stop_autorun()
		app.net.intent({"type":"direction","x":0,"z":0})
		var sequence: int = app.net.sequence
		return await wait(func(): return int(app.net.hero.get("lastInputSequence",-1))>=sequence and not app.net.input_busy and app.world.player_motion.actual_velocity.length()<.02,5000)

	func capture(name: String) -> void:
		if DisplayServer.get_name()=="headless" or finished: return
		await RenderingServer.frame_post_draw
		app.get_viewport().get_texture().get_image().save_png(app.qa_path.get_base_dir().path_join(name+".png"))

	func choose_heading() -> bool:
		var origin: Vector2 = point()
		for index: int in range(16):
			var direction: Vector2 = Vector2.UP.rotated(TAU*index/16.0)
			var free: bool = true
			for step: int in range(1,13):
				if app.world.collision.blocked(origin+direction*(step*.3)): free = false; break
			if not free: continue
			app.world.camera_controller.yaw = atan2(-direction.x,direction.y)
			app.world.camera_controller.smoothed_yaw = app.world.camera_controller.yaw
			return true
		return false

	func controls_at(label: String) -> void:
		if finished: return
		phase = label+":movement"
		app.close_dialog(); app.inventory_panel.hide(); app.player_input.focus_changed(true)
		await neutral()
		checks[label+":landing_clear"] = not app.world.collision.blocked(point()) and app.world.hero_position.is_finite()
		checks[label+":heading_available"] = choose_heading()
		var origin: Vector2 = point(); var generation: int = int(app.net.hero.generation)
		key(KEY_W,true); await pause(450); key(KEY_W,false)
		checks[label+":wasd_stop_ack"] = await neutral()
		checks[label+":wasd_motion"] = point().distance_to(origin)>.35
		var settled: Vector2 = point(); await pause(650)
		checks[label+":stopped_without_rollback"] = point().distance_to(settled)<.12 and int(app.net.hero.generation)==generation
		# All four bindings enter through the viewport, then neutralise normally.
		for code: Key in [KEY_A,KEY_S,KEY_D]:
			key(code,true); await pause(120); key(code,false); await neutral()
		checks[label+":r_started"] = false
		tap(KEY_R); await pause(100)
		checks[label+":r_started"] = app.player_input.autorun
		await pause(250); tap(KEY_R)
		checks[label+":r_stop"] = await neutral() and not app.player_input.autorun
		var clicked: Vector2 = Mouse.click_near_hero(app)
		checks[label+":ordinary_click_target"] = clicked.is_finite()
		checks[label+":ordinary_click_arrival"] = clicked.is_finite() and await wait(func(): return point().distance_to(clicked)<.35,6000)
		await neutral()
		phase = label+":ui"
		tap(KEY_I); await pause(150)
		checks[label+":inventory_opens"] = app.inventory_panel.visible
		tap(KEY_ESCAPE); await pause(100)
		checks[label+":inventory_closes"] = not app.inventory_panel.visible
		app.system_menu(); await pause(100)
		checks[label+":menu_visible"] = is_instance_valid(app.active_dialog)
		tap(KEY_ESCAPE); await pause(100)
		checks[label+":menu_releases_input"] = not is_instance_valid(app.active_dialog) and not app.text_focused()
		checks[label+":hud_finite"] = is_finite(app.hp.value) and app.hp.max_value>0 and not app.status.text.is_empty()
		await capture("stability-"+label)

	func surface_tp(destination: String,index: int) -> void:
		phase = "tp%d:approach-fixture" % index
		var f: Dictionary = await fixture("teleporter")
		checks["tp%d:fixture" % index] = not f.is_empty() and not f.has("error")
		if f.is_empty() or f.has("error") or finished: return
		await neutral(); app.open_npc_service("npc:teleport"); await pause(200)
		var buttons: Array = app.active_dialog.find_children("*","Button",true,false).filter(func(b: Button): return b.get_meta("npc_action","")=="teleport:"+destination) if is_instance_valid(app.active_dialog) else []
		checks["tp%d:button" % index] = buttons.size()==1
		if buttons.is_empty(): return
		var generation: int = int(app.net.hero.generation)
		phase = "tp%d:transition" % index
		Mouse.mouse(app,buttons[0].get_global_rect().get_center())
		checks["tp%d:ordinary_teleport" % index] = await wait(func(): return int(app.net.hero.generation)>generation and app.net.hero.get("spaceId","")=="surface" and not app.world.space_loading and not app.net.command_busy and app.world.player_motion.generation==int(app.net.hero.generation),15000)
		var landing: Vector2 = Vector2(f.destinations[destination].x,f.destinations[destination].z)
		checks["tp%d:correct_destination" % index] = point().distance_to(landing)<1.0
		var landed_at: int = Time.get_ticks_msec(); var landed_generation: int = int(app.net.hero.generation)
		transitions.append({"kind":"teleport","destination":destination,"generation_changed":int(app.net.hero.generation)>generation,"position":[app.net.hero.x,app.net.hero.z]})
		await controls_at("surface-%d" % index)
		phase = "surface-%d:post-teleport-observation" % index
		await pause(maxi(0,11000-(Time.get_ticks_msec()-landed_at)))
		checks["tp%d:no_delayed_cross_map_rollback" % index] = int(app.net.hero.generation)==landed_generation and point().distance_to(landing)<20 and app.world.player_motion.position_value.distance_to(point())<2

	func interior(id: String) -> void:
		phase = id+":entrance-fixture"
		var f: Dictionary = await fixture("portal-"+id)
		checks[id+":fixture"] = not f.is_empty() and not f.has("error")
		if f.is_empty() or f.has("error") or finished: return
		await neutral(); app.close_dialog(); phase = id+":enter"
		tap(KEY_F)
		checks[id+":enter"] = await wait(func(): return app.net.hero.get("spaceId","")==id and not app.world.space_loading,20000)
		if not checks[id+":enter"]: return
		await controls_at(id)
		phase = id+":walk-to-exit"
		app.net.intent({"type":"destination","x":f.exit.x,"z":f.exit.z})
		checks[id+":walk_to_exit"] = await wait(func(): return point().distance_to(Vector2(f.exit.x,f.exit.z))<1.5,10000)
		await neutral(); tap(KEY_F); phase = id+":exit"
		checks[id+":exit"] = await wait(func(): return app.net.hero.get("spaceId","")=="surface" and not app.world.space_loading,20000)
		transitions.append({"kind":"portal","space":id,"returned":app.net.hero.get("spaceId","")=="surface"})
		checks[id+":exit_stop"] = await neutral()
		checks[id+":correct_surface_return"] = point().distance_to(Vector2(f.surfaceReturn.x,f.surfaceReturn.z))<1.0
		await capture("stability-"+id+"-exit")

	func percentile(values: Array, fraction: float) -> float:
		if values.is_empty(): return 0
		values.sort(); return float(values[clampi(int(ceil(values.size()*fraction))-1,0,values.size()-1)])

	func finish(reason: String = "completed") -> void:
		if finished: return
		finished = true
		for code: Key in [KEY_W,KEY_A,KEY_S,KEY_D]: key(code,false)
		app.player_input.stop_autorun(); app.net.intent({"type":"cancel"})
		var frames: Array = rows.map(func(r: Dictionary): return r.frame_ms)
		var play_frames: Array = rows.filter(func(r: Dictionary): return not r.loading and (str(r.phase).ends_with(":movement") or str(r.phase).ends_with(":ui"))).map(func(r: Dictionary): return r.frame_ms)
		var max_sse: float = 0; var max_queue: int = 0; var max_unsent: int = 0; var max_correction: float = 0
		for row: Dictionary in rows:
			max_sse = maxf(max_sse,row.sse_age_ms); max_queue = maxi(max_queue,row.network_bookkeeping); max_unsent = maxi(max_unsent,row.unsent)
			max_correction = maxf(max_correction,Vector2(row.correction[0],row.correction[1]).length())
		checks.completed_within_budget = reason=="completed"
		checks.no_stream_disconnects = disconnects.is_empty()
		checks.no_multi_second_play_freeze = not play_frames.is_empty() and percentile(play_frames,1)<2000
		checks.native_graphical = DisplayServer.get_name()!="headless"
		var metrics: Dictionary = {"frames":rows.size(),"mean_observed_fps":rows.size()*1000.0/maxf(1,Time.get_ticks_msec()-started),"frame_p50_ms":percentile(frames,.5),"frame_p95_ms":percentile(frames,.95),"frame_p99_ms":percentile(frames,.99),"frame_max_ms":percentile(frames,1),"play_frame_max_ms":percentile(play_frames,1),"max_sse_age_ms":max_sse,"max_network_bookkeeping":max_queue,"max_unsent":max_unsent,"max_visual_correction_m":max_correction}
		app.net.save_private_json(app.qa_path.get_base_dir().path_join("stability-trace.json"),{"samples":rows,"disconnects":disconnects,"note":"No player IDs, names, inventory or tokens. Local motor physics, remote interpolation and wall clocks are separate; visual correction is an observed offset, not an invented speed bound."})
		app.net.save_private_json(app.qa_path,{"ok":checks.values().all(func(v): return v==true),"checks":checks,"reason":reason,"elapsed_ms":Time.get_ticks_msec()-started,"metrics":metrics,"transitions":transitions,"adapter":RenderingServer.get_video_adapter_name(),"native_render":DisplayServer.get_name()!="headless","packaged_binary":"--qa-packaged" in OS.get_cmdline_user_args(),"block":"stability"})
		app.get_tree().quit(0 if checks.values().all(func(v): return v==true) else 2)

	func execute() -> void:
		started = Time.get_ticks_msec(); deadline = started+budget_seconds*1000; last_snapshot = started
		app.net.snapshot_received.connect(received); app.net.stream_disconnected.connect(disconnected)
		checks.joined = app.net.connected and app.world.actors.has(app.world.hero_id)
		for index: int in range(4):
			if finished: return
			await surface_tp(["Астерхолд","Гринфолл","Чёрный лес","Вход в шахту"][index],index)
		for id: String in ["mine","great_cave"]:
			if finished: return
			await interior(id)
		phase = "settled-observation"
		# Continue a quiet observation to expose the reported delayed loss of input.
		await pause(mini(20000,maxi(0,deadline-Time.get_ticks_msec()-2000)))
		if not finished: finish()

static func run(app: Node) -> void:
	var runner: Run = Run.new(); runner.app = app
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--stability-budget="): runner.budget_seconds = clampi(int(arg.trim_prefix("--stability-budget=")),120,240)
	app.add_child(runner)
	await runner.execute()
