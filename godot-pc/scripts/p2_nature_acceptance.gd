extends RefCounted
## Actual application, existing world light/camera, authoritative destinations.
const Wait = preload("res://scripts/content_acceptance.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func planar(value: Dictionary) -> Vector2:
	return Vector2(float(value.x),float(value.z))

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
	var deadline: int = Time.get_ticks_msec()+20000
	var continuous: bool = true
	app.net.intent({"type":"destination","x":target.x,"z":target.y})
	while Time.get_ticks_msec()<deadline and not bool(app.net.hero.get("dead",false)):
		await app.get_tree().create_timer(.1).timeout
		var sample: Dictionary = observe(app,str(goal.id))
		var current: Vector2 = planar(app.net.hero)
		var step: float = current.distance_to(previous)
		distance += step
		continuous = continuous and step<2.0 and int(app.net.hero.generation)==generation
		previous = current; trace.append(sample)
		if current.distance_to(target)<.3 and str(app.net.hero.get("action",""))!="walk":
			return {"reached":true,"metres":distance,"continuous":continuous}
	return {"reached":false,"metres":distance,"continuous":continuous}

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
	var nature_ranges: Array = sample.nature_meshes.map(func(mesh: MeshInstance3D):return mesh.visibility_range_end)
	for quality: int in range(3):
		app.game_settings.vegetation=quality;app.apply_settings()
		checks["nature_grass_range_"+str([24,45,80][quality])] = sample.small_decorations.all(func(mesh: GeometryInstance3D):return is_equal_approx(mesh.visibility_range_end,float([24,45,80][quality])))
	checks.nature_hard_obstacles_retain_visibility = nature_ranges==sample.nature_meshes.map(func(mesh: MeshInstance3D):return mesh.visibility_range_end)
	app.game_settings=previous_settings;app.apply_settings()
	checks.nature_focus_uses_existing_policy = bool(sample.focus_bound)
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
		var walks: Array = []
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
		checks["nature_"+site+"_hero_in_frame_during_walk"] = trace.all(func(row: Dictionary):return bool(row.in_frame))
		checks["nature_"+site+"_camera_geometry_clear"] = trace.all(func(row: Dictionary):return bool(row.camera_clear))
		checks["nature_"+site+"_terrain_follow"] = trace.all(func(row: Dictionary):return absf(float(row.root_gap))<.03)
		checks["nature_"+site+"_hero_survived"] = not bool(app.net.hero.get("dead",false))
		report.sites.append({"fixture":fixture,"walks":walks,"trace":trace})
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("p2-nature-world-trace.json"),report)
	print("P2_NATURE_WORLD ",JSON.stringify(checks))
