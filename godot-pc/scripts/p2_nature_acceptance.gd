extends RefCounted
## Actual application, existing world light/camera, authoritative destinations.
const Wait = preload("res://scripts/content_acceptance.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func planar(value: Dictionary) -> Vector2:
	return Vector2(float(value.x),float(value.z))

static func presentation_row(app: Node) -> Dictionary:
	var p: Vector3=app.world.hero_position
	return {"wall_ms":Time.get_ticks_msec(),"server_ms":float(app.world.timeline.latest.time),"presentation_ms":app.world.timeline.clock_ms,
		"generation":int(app.net.hero.generation),"position":[p.x,p.z],"speed":float(app.net.hero.stats.speed)}

static func presentation_summary(frames: Array) -> Dictionary:
	var maximum_excess: float=0.0
	var max_wall_gap: float=0.0
	var max_server_gap: float=0.0
	var max_presentation_gap: float=0.0
	var max_render_step: float=0.0
	var stable_generation: bool=true
	var intervals: Array[float]=[]
	for index: int in range(1,frames.size()):
		var a: Dictionary=frames[index-1];var b: Dictionary=frames[index]
		var wall_dt: float=(float(b.wall_ms)-float(a.wall_ms))/1000.0
		var server_dt: float=(float(b.server_ms)-float(a.server_ms))/1000.0
		var presentation_dt: float=(float(b.presentation_ms)-float(a.presentation_ms))/1000.0
		var step: float=Vector2(b.position[0],b.position[1]).distance_to(Vector2(a.position[0],a.position[1]))
		max_wall_gap=maxf(max_wall_gap,wall_dt);max_server_gap=maxf(max_server_gap,server_dt);max_presentation_gap=maxf(max_presentation_gap,presentation_dt)
		max_render_step=maxf(max_render_step,step)
		maximum_excess=maxf(maximum_excess,step-maxf(float(a.speed),float(b.speed))*maxf(0,presentation_dt))
		stable_generation=stable_generation and int(a.generation)==int(b.generation)
		intervals.append(wall_dt*1000.0)
	intervals.sort()
	return {"frames":frames.size(),"stable_generation":stable_generation,"max_excess_render_step_m":maximum_excess,"max_render_step_m":max_render_step,
		"max_wall_gap_s":max_wall_gap,"max_server_gap_s":max_server_gap,"max_presentation_gap_s":max_presentation_gap,
		"observed_frame_p95_ms":intervals[int(floor((intervals.size()-1)*.95))] if not intervals.is_empty() else -1,
		"note":"Per-frame observation of the real renderer. Wall/server/presentation clocks are separate; this QA trace is not a packaged performance benchmark."}

static func diagnose_render_cost(app: Node, candidate: Node3D) -> Dictionary:
	var report: Array=[]
	var actors: Array=[]
	for id: String in app.world.actors:
		if id!=app.world.hero_id:
			var actor: Node3D=app.world.actors[id]
			for mesh: GeometryInstance3D in actor.find_children("*","GeometryInstance3D",true,false):
				actors.append({"node":mesh,"layers":mesh.layers})
	var height_query: Array=[]
	for with_support: bool in [false,true]:
		var start: int=Time.get_ticks_usec()
		var total: float=0.0
		for i: int in range(1000):total+=app.world.final_environment.height_at(-284.0+float(i%10)*.1,-208.0,with_support)
		height_query.append({"support":with_support,"calls":1000,"elapsed_ms":float(Time.get_ticks_usec()-start)/1000.0,"checksum":total})
	for mode: String in ["visible","sample-hidden","actors-hidden","both-hidden"]:
		candidate.visible=not mode in ["sample-hidden","both-hidden"]
		for record: Dictionary in actors:
			if is_instance_valid(record.node):record.node.layers=0 if mode in ["actors-hidden","both-hidden"] else int(record.layers)
		var intervals: Array[float]=[]
		var draws: Array[float]=[]
		var process_times: Array[float]=[]
		var deadline: int=Time.get_ticks_msec()+3500
		var previous: int=Time.get_ticks_msec()
		while Time.get_ticks_msec()<deadline:
			await app.get_tree().process_frame
			var now: int=Time.get_ticks_msec()
			intervals.append(float(now-previous));previous=now
			draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
			process_times.append(Performance.get_monitor(Performance.TIME_PROCESS)*1000.0)
		intervals.sort();draws.sort();process_times.sort()
		report.append({"mode":mode,"frames":intervals.size(),"frame_median_ms":intervals[intervals.size()/2],"frame_p95_ms":intervals[int((intervals.size()-1)*.95)],
			"draw_calls_median":draws[draws.size()/2],"process_median_ms":process_times[process_times.size()/2]})
	candidate.show()
	for record: Dictionary in actors:
		if is_instance_valid(record.node):record.node.layers=record.layers
	return {"phases":report,"height_query":height_query,"actor_geometry_instances":actors.size()}

static func observe(app: Node, stage: String) -> Dictionary:
	var hero: Vector3 = app.world.hero_position
	var torso: Vector3 = hero+Vector3.UP*1.25
	var camera: Camera3D = app.world.camera
	var screen: Vector2 = camera.unproject_position(torso)
	var viewport: Vector2 = app.get_viewport().get_visible_rect().size
	var usable: Rect2 = Rect2(viewport*Vector2(.22,.11),viewport*Vector2(.625,.69))
	return {"stage":stage,"at":float(app.world.timeline.latest.time),"hero":[app.net.hero.x,app.net.hero.z],
		"generation":int(app.net.hero.generation),"rendered":[hero.x,hero.y,hero.z],
		"camera":[camera.global_position.x,camera.global_position.y,camera.global_position.z],"torso_screen":[screen.x,screen.y],
		"in_frame":not camera.is_position_behind(torso) and usable.has_point(screen),
		"camera_clear":app.world.collision.ray_distance(torso,camera.global_position,.1,true)>=torso.distance_to(camera.global_position)-.03,
		"root_gap":hero.y-app.world.point(hero.x,-hero.z).y,
		"orbit":app.world.camera_controller.actual_distance,"collision_limited":app.world.camera_controller.collision_limited}

static func walk(app: Node, goal: Dictionary, trace: Array) -> Dictionary:
	var target: Vector2 = planar(goal)
	var distance: float = 0.0
	var previous: Vector2 = planar(app.net.hero)
	var generation: int = int(app.net.hero.generation)
	var previous_at: float = float(app.world.timeline.latest.time)
	var max_gap: float = 0.0
	var max_step: float = 0.0
	var peak_speed: float = 0.0
	var deadline: int = Time.get_ticks_msec()+20000
	var continuous: bool = true
	app.net.intent({"type":"destination","x":target.x,"z":target.y})
	while Time.get_ticks_msec()<deadline and not bool(app.net.hero.get("dead",false)):
		await app.get_tree().create_timer(.1).timeout
		var sample: Dictionary = observe(app,str(goal.id))
		var current: Vector2 = planar(app.net.hero)
		var step: float = current.distance_to(previous)
		var dt: float = (float(sample.at)-previous_at)/1000.0
		max_gap=maxf(max_gap,dt);max_step=maxf(max_step,step)
		if dt>0:peak_speed=maxf(peak_speed,step/dt)
		distance += step
		# Observation spacing can grow during resource loading. Judge physical
		# displacement against the elapsed SERVER time; report gaps separately.
		continuous = continuous and dt>=0 and step<=float(app.net.hero.stats.speed)*dt+.08 and int(app.net.hero.generation)==generation
		previous = current;previous_at=float(sample.at);trace.append(sample)
		if current.distance_to(target)<.3 and str(app.net.hero.get("action",""))!="walk":
			return {"reached":true,"metres":distance,"continuous":continuous,"max_observation_gap_s":max_gap,"max_observed_step_m":max_step,"peak_observed_speed":peak_speed}
	return {"reached":false,"metres":distance,"continuous":continuous,"max_observation_gap_s":max_gap,"max_observed_step_m":max_step,"peak_observed_speed":peak_speed}

static func run(app: Node, checks: Dictionary) -> void:
	checks.nature_actual_native_world = DisplayServer.get_name()!="headless" and app.world.final_environment!=null
	if not checks.nature_actual_native_world:return
	var environment: Node = app.world.final_environment
	checks.nature_p2_adapter_loaded = environment.p2_nature_enabled and is_instance_valid(environment.nature_sample)
	if not checks.nature_p2_adapter_loaded:return
	var sample: Node = environment.nature_sample
	checks.nature_keeps_candidate_art_gate = bool(sample.data.get("candidateOnly",false))
	checks.nature_only_grass_in_distance_controls = sample.small_decorations.size()==18 and sample.small_decorations.all(func(mesh: GeometryInstance3D):return mesh in app.world.decorations) and sample.nature_meshes.all(func(mesh: MeshInstance3D):return not mesh in app.world.decorations)
	var previous_settings: Dictionary = app.game_settings.duplicate(true)
	var previous_interaction: bool = app.qa_interaction
	# The shared mouse QA runner forces half-resolution with shadows off.
	# This visual route uses the existing high profile, not a separate light rig.
	app.qa_interaction=false
	app.game_settings.merge({"quality":2,"distance":2,"vegetation":2,"render_scale":2,"shadows":true,"msaa":2},true)
	var nature_ranges: Array = sample.nature_meshes.map(func(mesh: MeshInstance3D):return mesh.visibility_range_end)
	for quality: int in range(3):
		app.game_settings.vegetation=quality;app.apply_settings()
		checks["nature_grass_range_"+str([24,45,80][quality])] = sample.small_decorations.all(func(mesh: GeometryInstance3D):return is_equal_approx(mesh.visibility_range_end,float([24,45,80][quality])))
	checks.nature_hard_obstacles_retain_visibility = nature_ranges==sample.nature_meshes.map(func(mesh: MeshInstance3D):return mesh.visibility_range_end)
	app.game_settings.vegetation=2;app.apply_settings()
	checks.nature_full_resolution_visual_profile = is_equal_approx(app.get_viewport().scaling_3d_scale,1.0) and app.world.sun_light.shadow_enabled
	checks.nature_focus_uses_existing_policy = bool(sample.focus_bound)
	checks.nature_local_shore_uses_original_mesh = is_instance_valid(sample.shore_water) and sample.shore_water.mesh==sample.get_parent().find_child("Lake_Level_40m",true,false).mesh
	app.close_dialog();app.inventory_panel.hide()
	var report: Dictionary = {"schema":1,"candidateOnly":true,"native_render":true,"method":"Existing gameplay world and lighting. Initial hero fixture per site, ordinary destination movement, no manual actor pose or world edits.","sites":[]}
	for site: String in ["forest","shore"]:
		var fixture: Dictionary = await Mouse.fixture(app,"p2-nature-"+site)
		checks["nature_"+site+"_fixture"] = not fixture.is_empty() and not fixture.has("error")
		if not checks["nature_"+site+"_fixture"]:continue
		checks["nature_"+site+"_no_monster_mutation"] = fixture.populationBefore==fixture.populationAfter and int(fixture.population)==1151
		app.world.camera_distance=float(fixture.distance);app.world.camera_yaw=float(fixture.yaw);app.world.camera_pitch=float(fixture.pitch)
		await app.get_tree().create_timer(1.0).timeout
		var trace: Array = [observe(app,site+"-initial")]
		checks["nature_"+site+"_initial_hero_visible"] = bool(trace[0].in_frame) and bool(trace[0].camera_clear)
		await Wait.capture(app,"p2-nature-"+site+"-world")
		if OS.get_environment("VARENDOR_NATURE_DIAGNOSTIC")=="1":
			var cost: Dictionary=await diagnose_render_cost(app,sample)
			app.net.save_private_json(app.qa_path.get_base_dir().path_join("nature-cost-diagnostic.json"),{"diagnosticOnly":true,"note":"Temporary render visibility comparison in one real-world position; no world state/geometry mutation. Not route or artistic acceptance.","result":cost})
			print("NATURE_COST_DIAGNOSTIC ",JSON.stringify(cost))
			checks.nature_diagnostic_only=true
			app.game_settings=previous_settings;app.qa_interaction=previous_interaction;app.apply_settings()
			return
		var walks: Array = []
		var frames: Array=[]
		var observer: Callable=func():frames.append(presentation_row(app))
		app.get_tree().process_frame.connect(observer)
		var lower_height: float = 0.0
		for goal: Dictionary in fixture.goals:
			var result: Dictionary = await walk(app,goal,trace)
			walks.append({"goal":goal,"result":result})
			checks["nature_"+str(goal.id)+"_reached"] = bool(result.reached)
			checks["nature_"+str(goal.id)+"_continuous"] = bool(result.continuous)
			if not bool(result.reached):break
			await app.get_tree().create_timer(.35).timeout
			if goal.id=="approach":lower_height=app.world.hero_position.y
			if goal.id=="uphill":
				checks.nature_walks_over_40m = float(result.metres)>=float(fixture.minimumContinuousMetres)
				checks.nature_real_uphill = app.world.hero_position.y-lower_height>2.0
			if goal.id=="downhill":checks.nature_returns_to_ground_height=absf(app.world.hero_position.y-lower_height)<.1
			if goal.id in ["uphill","downhill","shore-return"]:await Wait.capture(app,"p2-nature-"+str(goal.id)+"-world")
		await app.net.intent({"type":"cancel"})
		app.get_tree().process_frame.disconnect(observer)
		var presentation: Dictionary=presentation_summary(frames)
		checks["nature_"+site+"_presentation_generation_stable"] = bool(presentation.stable_generation)
		checks["nature_"+site+"_render_step_bound"] = frames.size()>10 and float(presentation.max_excess_render_step_m)<.15
		checks["nature_"+site+"_hero_in_frame_during_walk"] = trace.all(func(row: Dictionary):return bool(row.in_frame))
		checks["nature_"+site+"_camera_geometry_clear"] = trace.all(func(row: Dictionary):return bool(row.camera_clear))
		checks["nature_"+site+"_terrain_follow"] = trace.all(func(row: Dictionary):return absf(float(row.root_gap))<.03)
		checks["nature_"+site+"_hero_survived"] = not bool(app.net.hero.get("dead",false))
		report.sites.append({"fixture":fixture,"walks":walks,"trace":trace,"presentation_summary":presentation,"frames":frames})
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("p2-nature-world-trace.json"),report)
	app.game_settings=previous_settings;app.qa_interaction=previous_interaction;app.apply_settings()
	print("P2_NATURE_WORLD ",JSON.stringify(checks))
