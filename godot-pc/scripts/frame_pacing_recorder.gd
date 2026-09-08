extends Node

# Opt-in owner-PC capture. No polling, render queries or disk work in a normal
# launch. F3 starts 60 seconds of measurements, written once at the end.
var app: Node
var directory: String
var rows: Array = []
var metadata: Dictionary = {}
var started: int = 0
var previous: int = 0
var physics_previous: int = 0
var duration_seconds: float = 60.0

func _ready() -> void:
	set_process(false)

func start_recording() -> void:
	if started != 0: return
	rows.clear()
	var graph: bool = DisplayServer.get_name() != "headless"
	if graph: RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(),true)
	metadata = {"godot":Engine.get_version_info().string,"os":OS.get_name(),"cpu":OS.get_processor_name(),"adapter":RenderingServer.get_video_adapter_name(),"renderer":RenderingServer.get_current_rendering_method(),"refresh_hz":DisplayServer.screen_get_refresh_rate() if graph else -1,"vsync":DisplayServer.window_get_vsync_mode() if graph else -1,"max_fps":Engine.max_fps,"physics_hz":Engine.physics_ticks_per_second,"scene_physics_interpolation":get_tree().physics_interpolation,"manual_player_interpolation":true,"low_processor_mode":OS.low_processor_usage_mode,"render_scale":get_viewport().scaling_3d_scale,"msaa":get_viewport().msaa_3d,"viewport_texture_size_reported":[get_viewport().get_texture().get_width(),get_viewport().get_texture().get_height()] if graph else [0,0],"settings":app.game_settings.duplicate(true),"gpu_timer_note":"Asynchronous driver timer; zero/unsupported is null. CPU render excludes gameplay; process_ms includes gameplay."}
	started = Time.get_ticks_usec(); previous = started; physics_previous = Engine.get_physics_frames()
	if graph: RenderingServer.frame_post_draw.connect(sample)
	else: set_process(true)
	app.notice("Замер кадров: 60 секунд. Продолжайте двигаться и вращать камеру.")

func _process(_delta: float) -> void:
	sample()

func sample() -> void:
	if started == 0: return
	var now: int = Time.get_ticks_usec()
	var graph: bool = DisplayServer.get_name() != "headless"
	var view: RID = get_viewport().get_viewport_rid()
	var gpu: float = RenderingServer.viewport_get_measured_render_time_gpu(view) if graph else 0.0
	var camera: Vector3 = app.world.camera.position
	var hero: Vector3 = app.world.hero_position
	rows.append([float(now-started)/1000.0,float(now-previous)/1000.0,Engine.get_frames_per_second(),Performance.get_monitor(Performance.TIME_PROCESS)*1000.0,Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0,RenderingServer.viewport_get_measured_render_time_cpu(view)+RenderingServer.get_frame_setup_time_cpu() if graph else null,gpu if gpu>0 else null,Engine.get_physics_frames()-physics_previous,Engine.get_physics_interpolation_fraction(),app.world.player_motion.actual_velocity.length(),hero.x,hero.y,hero.z,camera.x,camera.y,camera.z,Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),app.world.weather.rain.emitting])
	previous = now; physics_previous = Engine.get_physics_frames()
	if float(now-started)/1000000.0 >= duration_seconds: finish()

func finish() -> void:
	if started == 0: return
	started = 0; set_process(false)
	if RenderingServer.frame_post_draw.is_connected(sample):
		RenderingServer.frame_post_draw.disconnect(sample)
		RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(),false)
	if DisplayServer.get_name() != "headless":
		var picture: Image = get_viewport().get_texture().get_image()
		metadata["rendered_image_pixels"] = [picture.get_width(),picture.get_height()]
	DirAccess.make_dir_recursive_absolute(directory)
	var path: String = directory.path_join("pacing-"+Time.get_datetime_string_from_system().replace(":","-"))
	var file: FileAccess = FileAccess.open(path+".csv",FileAccess.WRITE)
	if file == null:
		app.notice("Не удалось сохранить замер кадров: "+directory)
		return
	file.store_csv_line(PackedStringArray(["elapsed_ms","frame_ms","engine_fps","process_ms","physics_cpu_ms","render_cpu_ms","gpu_ms","physics_steps","interpolation_alpha","speed_m_s","hero_x","hero_y","hero_z","camera_x","camera_y","camera_z","draw_calls","primitives","rain"]))
	for row: Array in rows:
		file.store_csv_line(PackedStringArray(row.map(func(value): return "" if value == null else str(value))))
	file.close()
	var intervals: Array = rows.map(func(row): return row[1]); intervals.sort()
	metadata["frames"] = rows.size()
	metadata["seconds"] = rows.back()[0]/1000.0
	metadata["fps"] = rows.size()/metadata.seconds
	metadata["frame_ms"] = {"p50":intervals[intervals.size()/2],"p95":intervals[int(intervals.size()*.95)],"p99":intervals[int(intervals.size()*.99)],"max":intervals.back()}
	file = FileAccess.open(path+".json",FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(metadata,"  ")); file.close()
	rows.clear()
	app.notice("Замер кадров сохранён: "+path+".json")
