extends RefCounted
const Trace = preload("res://scripts/p2_cpu_trace.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func interval(app: Node, milliseconds: int) -> void:
	var deadline: int = Time.get_ticks_msec()+milliseconds
	while Time.get_ticks_msec()<deadline:
		await app.get_tree().process_frame

static func run(app: Node, checks: Dictionary) -> void:
	var native: bool = DisplayServer.get_name()!="headless"
	checks.cpu_profile_scene = app.world.final_environment!=null
	if not checks.cpu_profile_scene: return
	var previous_settings: Dictionary = app.game_settings.duplicate(true)
	var previous_interaction: bool = app.qa_interaction
	app.qa_interaction = false
	app.game_settings.merge({"quality":2,"distance":2,"vegetation":2,"render_scale":2,"shadows":true,"msaa":2},true)
	app.apply_settings()
	app.close_dialog(); app.inventory_panel.hide()
	var report: Dictionary = {"schema":1,"diagnostic_only":true,"native_render":native,"phases":[],
		"method":"Inclusive CPU timers; nested spans must not be summed. Each frame has CPU spans plus previous engine frame metrics. One existing hero-only forest fixture, no monster/clock/geometry edits. No vertex audit or render visibility changes.",
		"settings":app.game_settings.duplicate(true),"adapter":RenderingServer.get_video_adapter_name()}
	Trace.begin_phase("fixture")
	var fixture: Dictionary = await Mouse.fixture(app,"p2-nature-forest")
	report.phases.append(Trace.finish_phase())
	checks.cpu_profile_fixture = not fixture.is_empty() and not fixture.has("error")
	if checks.cpu_profile_fixture:
		report["fixture"] = fixture
		checks.cpu_profile_unchanged_population = fixture.populationBefore==fixture.populationAfter
		app.world.camera_distance=float(fixture.distance);app.world.camera_yaw=float(fixture.yaw);app.world.camera_pitch=float(fixture.pitch)
		checks.cpu_profile_high_settings = is_equal_approx(app.get_viewport().scaling_3d_scale,1.0) and app.world.sun_light.shadow_enabled
		Trace.begin_phase("warmup_5s")
		await interval(app,5000)
		report.phases.append(Trace.finish_phase())
		Trace.begin_phase("idle_8s")
		await interval(app,8000)
		report.phases.append(Trace.finish_phase())
		var before: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
		var generation: int = int(app.net.hero.generation)
		var goal: Dictionary = fixture.goals[1]
		Trace.begin_phase("destination_10s")
		app.net.intent({"type":"destination","x":float(goal.x),"z":float(goal.z)})
		await interval(app,10000)
		report.phases.append(Trace.finish_phase())
		var after: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
		report["destination"] = {"goal":goal,"start":[before.x,before.y],"end":[after.x,after.y],"displacement_m":before.distance_to(after),"generation_stable":generation==int(app.net.hero.generation),"note":"Ten-second observation window after one ordinary destination command; arrival may precede the end of the window."}
		checks.cpu_profile_actual_destination = before.distance_to(after)>10 and generation==int(app.net.hero.generation)
		app.net.intent({"type":"direction","x":0.0,"z":0.0})
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("p2-cpu-profile.json"),report)
	print("P2_CPU_PROFILE ",JSON.stringify({"phases":report.phases.size(),"checks":checks}))
	app.game_settings=previous_settings;app.qa_interaction=previous_interaction;app.apply_settings()
