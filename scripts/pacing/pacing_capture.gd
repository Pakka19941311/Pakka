extends RefCounted

static func argument(name: String, fallback: String = "") -> String:
	for value: String in OS.get_cmdline_user_args():
		if value.begins_with(name + "="): return value.trim_prefix(name + "=")
	return fallback

static func stats(values: Array) -> Dictionary:
	if values.is_empty(): return {}
	var ordered: Array = values.duplicate()
	ordered.sort()
	var sum: float = 0
	for v: float in values: sum += v
	return {"mean":sum/values.size(), "p50":ordered[values.size()/2], "p95":ordered[mini(values.size()-1,int(values.size()*.95))], "p99":ordered[mini(values.size()-1,int(values.size()*.99))], "max":ordered.back()}

static func request(app: Node, point: Vector2) -> Dictionary:
	var http: HTTPRequest = HTTPRequest.new()
	app.add_child(http)
	var url: String = argument("--pacing-control") + "&x=" + str(point.x) + "&z=" + str(point.y)
	http.request(url)
	var response: Array = await http.request_completed
	http.queue_free()
	return JSON.parse_string((response[3] as PackedByteArray).get_string_from_utf8())

static func key(app: Node, code: int, pressed: bool) -> void:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = pressed
	app._input(event)

static func run(app: Node) -> void:
	var tree: SceneTree = app.get_tree()
	while app.world == null or app.world.camera == null or app.net.bootstrap.is_empty():
		await tree.create_timer(.1).timeout
	await app.net.connect_profile(app.net.bootstrap.profiles[0])
	while app.net.hero.is_empty() or not app.world.actors.has(str(app.net.hero.id)):
		await tree.process_frame
	app.game_settings.merge({"quality":2,"msaa":3,"shadows":true,"fog":true,"distance":2,"vegetation":2,"render_scale":2,"fps":1,"vsync":true},true)
	app.qa_interaction = false
	app.apply_settings()
	var viewport: Viewport = app.get_viewport()
	var world: VarendorWorld = app.world
	var camera: VarendorCameraController = world.camera_controller
	var weather: VarendorWorldWeather = world.weather
	var graph: bool = DisplayServer.get_name() != "headless"
	if graph:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(1600,900))
		RenderingServer.viewport_set_measure_render_time(viewport.get_viewport_rid(),true)
	OS.low_processor_usage_mode = false
	var output: String = argument("--pacing-output")
	DirAccess.make_dir_recursive_absolute(output)
	var report: Dictionary = {"source":argument("--pacing-source"),"baseline_source":"629cdef571c81473725acc88afe59385e2fcd518","godot":Engine.get_version_info().string,"display":DisplayServer.get_name(),"renderer":RenderingServer.get_current_rendering_method(),"adapter":RenderingServer.get_video_adapter_name(),"cpu":OS.get_processor_name(),"logical_cores":OS.get_processor_count(),"physics_ticks_per_second":Engine.physics_ticks_per_second,"physics_interpolation_enabled":tree.physics_interpolation,"manual_player_interpolation":true,"max_physics_steps_per_frame":Engine.max_physics_steps_per_frame,"low_processor_mode":OS.low_processor_usage_mode,"initial_max_fps":Engine.max_fps,"vsync":DisplayServer.window_get_vsync_mode() if graph else -1,"refresh_hz":DisplayServer.screen_get_refresh_rate() if graph else -1,"scenarios":[],"target_windows_gpu_measured":false,"fixture":"Ranger level 4 with haste, rain; blood-alpha-den / bloodwing-ridge from owner video. Isolated SQLite; explicit deterministic reset/ablation only."}
	var cases: Array = [
		{"name":"idle_rain","seconds":5.0},
		{"name":"run_rain","move":true,"seconds":30.0},
		{"name":"orbit_rain","orbit":true,"seconds":7.0},
		{"name":"run_orbit_rain","move":true,"orbit":true,"seconds":10.0},
		{"name":"pursuit_rain","pursuit":true,"seconds":9.0},
		{"name":"run_animation_frozen","move":true,"freeze":true,"seconds":6.0},
		{"name":"run_camera_rigid","move":true,"rigid":true,"seconds":6.0},
		{"name":"run_static_camera","sideways":true,"static":true,"seconds":6.0},
		{"name":"run_rain_off_diagnostic","move":true,"rain_off":true,"seconds":6.0},
		{"name":"run_sky_static_diagnostic","move":true,"sky_static":true,"seconds":6.0},
		{"name":"run_hud_disconnected_diagnostic","move":true,"hud_off":true,"seconds":6.0},
		{"name":"run_4k_rain","move":true,"fourk":true,"seconds":8.0},
		{"name":"orbit_4k_rain","orbit":true,"fourk":true,"seconds":8.0},
		{"name":"run_4k_rain_off_diagnostic","move":true,"fourk":true,"rain_off":true,"seconds":6.0},
	]
	if not graph:
		cases = [{"name":"run_30hz","move":true,"cap":30,"seconds":4.0},{"name":"run_60hz","move":true,"cap":60,"seconds":4.0},{"name":"run_120hz","move":true,"cap":120,"seconds":4.0},{"name":"orbit_120hz","orbit":true,"cap":120,"seconds":3.0}]
	for spec: Dictionary in cases:
		PacingMetrics.active = false
		PacingMetrics.freeze_animation = false
		PacingMetrics.static_camera = false
		PacingMetrics.rigid_camera = false
		key(app,KEY_W,false); key(app,KEY_D,false)
		app.player_input.autorun = false
		camera.release_capture(false)
		app.net.intent({"type":"cancel"})
		var reset: Dictionary = await request(app,Vector2(88,70))
		app.net.accept(reset.snapshot)
		camera.yaw = .8
		camera.pitch = camera.DEFAULT_PITCH
		camera.distance = 10.5
		camera.reset_follow()
		Engine.max_fps = int(spec.get("cap",60))
		if graph:
			DisplayServer.window_set_size(Vector2i(3838,2158) if spec.get("fourk",false) else Vector2i(1600,900))
		weather.qa_override = {"hour":10.0,"daylight":1.0,"night":false,"fullMoon":false,"weather":"rain","clouds":.72}
		weather.daylight = 1.0
		weather.set_process(true)
		weather.rain.visible = not spec.get("rain_off",false)
		weather.rain.set_process(not spec.get("rain_off",false))
		var original_sky: Shader = weather.sky_material.shader
		if spec.get("sky_static",false):
			var frozen_shader: Shader = Shader.new()
			frozen_shader.code = original_sky.code.replace("TIME","0.0")
			weather.sky_material.shader = frozen_shader
			world.world_environment.sky.process_mode = Sky.PROCESS_MODE_QUALITY
			weather._process(.016)
			weather.set_process(false)
		var hud_listener: Callable = Callable(app,"present_snapshot")
		if spec.get("hud_off",false): world.snapshot_presented.disconnect(hud_listener)
		await tree.create_timer(3.0 if graph else .35).timeout
		PacingMetrics.freeze_animation = bool(spec.get("freeze",false))
		PacingMetrics.rigid_camera = bool(spec.get("rigid",false))
		PacingMetrics.static_camera = bool(spec.get("static",false))
		if spec.get("move",false): key(app,KEY_W,true)
		if spec.get("sideways",false): key(app,KEY_D,true)
		if spec.get("pursuit",false):
			app.world.target_id = str(reset.target)
			app.net.intent({"type":"attack","entityId":str(reset.target),"skill":null,"mode":"auto"})
		if spec.get("orbit",false): camera.begin_capture(viewport.get_visible_rect().size * .5)
		var rows: Array = []
		var previous_usec: int = Time.get_ticks_usec()
		var previous_physics: int = Engine.get_physics_frames()
		var previous_position: Vector3 = world.hero_position
		var previous_camera: Vector3 = world.camera.position
		var start: int = previous_usec
		var last: int = start
		PacingMetrics.clear()
		PacingMetrics.active = true
		print("PACING_BEGIN "+str(spec.name))
		while float(Time.get_ticks_usec()-start)/1000000.0 < float(spec.seconds):
			await tree.process_frame
			var now: int = Time.get_ticks_usec()
			var dt: float = float(now-previous_usec)/1000000.0
			var physics_now: int = Engine.get_physics_frames()
			var phases: Dictionary = PacingMetrics.times.duplicate()
			var calls: Dictionary = PacingMetrics.calls.duplicate()
			PacingMetrics.clear()
			var gpu_ms: float = RenderingServer.viewport_get_measured_render_time_gpu(viewport.get_viewport_rid()) if graph else 0.0
			rows.append({"t_ms":float(now-start)/1000.0,"frame_ms":dt*1000.0,"engine_fps":Engine.get_frames_per_second(),"engine_process_ms":Performance.get_monitor(Performance.TIME_PROCESS)*1000.0,"engine_physics_ms":Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0,"render_cpu_ms":RenderingServer.viewport_get_measured_render_time_cpu(viewport.get_viewport_rid())+RenderingServer.get_frame_setup_time_cpu() if graph else 0.0,"gpu_ms":gpu_ms,"physics_steps":physics_now-previous_physics,"alpha":Engine.get_physics_interpolation_fraction(),"hero_step":world.hero_position.distance_to(previous_position),"camera_step":world.camera.position.distance_to(previous_camera),"hero_speed":world.player_motion.actual_velocity.length(),"hero":[world.hero_position.x,world.hero_position.y,world.hero_position.z],"camera":[world.camera.position.x,world.camera.position.y,world.camera.position.z],"raw":[world.player_motion.position_value.x,world.player_motion.position_value.y],"correction":world.player_motion.visual_correction.length(),"draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"objects":Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),"primitives":Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),"node_count":Performance.get_monitor(Performance.OBJECT_NODE_COUNT),"resource_count":Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),"phases":phases,"calls":calls})
			if spec.get("orbit",false):
				var motion: InputEventMouseMotion = InputEventMouseMotion.new()
				motion.screen_relative = Vector2(42*dt,0)
				app._input(motion)
			previous_usec = now; previous_physics = physics_now
			previous_position = world.hero_position; previous_camera = world.camera.position
			last = now
		PacingMetrics.active = false
		key(app,KEY_W,false); key(app,KEY_D,false)
		app.player_input.autorun = false
		camera.release_capture(false)
		app.net.intent({"type":"cancel"})
		var summary: Dictionary = spec.duplicate()
		summary["frames"] = rows.size()
		summary["actual_seconds"] = float(last-start)/1000000.0
		summary["fps"] = rows.size()/maxf(.001,float(last-start)/1000000.0)
		summary["resolution"] = [DisplayServer.window_get_size().x,DisplayServer.window_get_size().y] if graph else [0,0]
		summary["render_scale"] = viewport.scaling_3d_scale
		summary["msaa"] = viewport.msaa_3d
		for field: String in ["frame_ms","engine_process_ms","engine_physics_ms","render_cpu_ms","gpu_ms","draw_calls","resource_count","node_count","physics_steps"]:
			summary[field] = stats(rows.map(func(row: Dictionary): return float(row[field])))
		var phase_stats: Dictionary = {}
		for phase: String in ["input_ui","hud_snapshot","quickbar","network","world_process","physics","world_snapshot","nameplates","weather","minimap_draw"]:
			phase_stats[phase] = stats(rows.map(func(row: Dictionary): return float(row.phases.get(phase,0))))
		summary["phases"] = phase_stats
		var moving: Array = rows.filter(func(row: Dictionary): return float(row.hero_speed) > 1.0)
		summary["moving_frames"] = moving.size()
		summary["held_moving_frames"] = moving.filter(func(row: Dictionary): return float(row.hero_step)<.0001).size()
		summary["camera_held_while_hero_moving"] = moving.filter(func(row: Dictionary): return float(row.hero_step)>.002 and float(row.camera_step)<.0001).size()
		report.scenarios.append(summary)
		var file: FileAccess = FileAccess.open(output.path_join(str(spec.name)+".json"),FileAccess.WRITE)
		file.store_string(JSON.stringify({"summary":summary,"frames":rows})); file.close()
		print("PACING_RESULT "+JSON.stringify(summary))
		if graph and spec.name in ["idle_rain","run_4k_rain"]:
			await RenderingServer.frame_post_draw
			var picture: Image = viewport.get_texture().get_image()
			picture.save_png(output.path_join(str(spec.name)+".png"))
		if spec.get("hud_off",false): world.snapshot_presented.connect(hud_listener)
		weather.sky_material.shader = original_sky
		world.world_environment.sky.process_mode = Sky.PROCESS_MODE_REALTIME
		weather.set_process(true)
		weather.rain.visible = true
		weather.rain.set_process(true)
	var result_file: FileAccess = FileAccess.open(output.path_join("report.json"),FileAccess.WRITE)
	result_file.store_string(JSON.stringify(report,"  ")); result_file.close()
	print("PACING_REPORT "+JSON.stringify(report))
	tree.quit()
