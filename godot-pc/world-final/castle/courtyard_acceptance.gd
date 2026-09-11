extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func go(app: Node, goal: Vector2, timeout: int = 18000) -> bool:
	app.net.intent({"type":"destination","x":goal.x,"z":goal.y})
	return await Wait.until(app,func(): return Vector2(app.net.hero.x,app.net.hero.z).distance_to(goal)<.5,timeout)

static func shot(app: Node, label: String, yaw: float = 0) -> void:
	app.world.camera_controller.yaw = yaw
	app.world.camera_controller.pitch = .58
	app.world.camera_controller.distance = 17
	await Keys.wait_ms(app.get_tree(),500)
	await Wait.capture(app,label)

static func overview(app: Node) -> void:
	if DisplayServer.get_name() == "headless": return
	var camera: Camera3D = Camera3D.new()
	app.world.add_child(camera)
	camera.position = Vector3(-175,159,249)
	camera.look_at(Vector3(-101,70,153))
	camera.far = 1000
	camera.make_current()
	app.ui.hide(); app.world.labels_layer.hide()
	await Keys.wait_ms(app.get_tree(),600)
	await Wait.capture(app,"castle-overview")
	app.world.camera.make_current(); camera.queue_free()
	app.ui.show(); app.world.labels_layer.show()

static func run(app: Node) -> void:
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(1600,900))
	app.qa_interaction = true
	var checks: Dictionary = {}
	checks.connected = await Wait.until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	app.login.hide(); app.close_dialog(); app.inventory_panel.hide(); app.player_input.focus_changed(true)
	# Fixed lighting and full 3D resolution make the art review reproducible;
	# these values belong only to this disposable QA process.
	app.world.weather.qa_override = {"hour":11.0,"daylight":1.0,"night":false,"fullMoon":false,"weather":"sun","clouds":.18}
	app.get_viewport().scaling_3d_scale = 1.0
	app.get_viewport().msaa_3d = Viewport.MSAA_2X
	var ambient: VarendorAmbientResidents = app.world.ambient_residents
	checks.fifteen_unique_residents = ambient.residents.size()==15 and app.world.actors.keys().filter(func(id): return str(id).begins_with("ambient:")).size()==15
	checks.five_secondary_animals = app.world.final_environment.courtyard.wildlife.creatures.size()==5
	checks.spawns_free = ambient.residents.all(func(r): return not app.world.collision.blocked(r.position,.42))
	checks.ambient_not_combat_targets = ambient.residents.all(func(r): return not app.world.actors[r.id].get_meta("pickable",true))
	checks.native_collision = true
	for obstacle: Dictionary in app.world.final_environment.courtyard.definition.obstacles:
		if obstacle.blocksMovement and not app.world.collision.blocked(Vector2(obstacle.x,obstacle.z),.05): checks.native_collision=false
	await Mouse.fixture(app,"castle-entry")
	await shot(app,"castle-gate")
	checks.gate_walk_in = await go(app,Vector2(-100,-205))
	checks.central_avenue = await go(app,Vector2(-100,-143))
	await Mouse.fixture(app,"castle-market")
	await shot(app,"castle-market",-.2)
	var travelled: Dictionary = {}; var gestures: Dictionary = {}; var pauses: Dictionary = {}
	var finite: bool = true; var max_speed: float = 0
	for r: Dictionary in ambient.residents:
		travelled[r.id]=0.0; gestures[r.id]=false; pauses[r.id]=false
	# Observe the ordinary physics loop, never accelerate its clock or reposition
	# residents. Merchant gestures and recruit attacks must actually be sampled.
	var until: int = Time.get_ticks_msec()+40000
	while Time.get_ticks_msec()<until:
		await app.get_tree().physics_frame
		for r: Dictionary in ambient.residents:
			var move: float = (r.position as Vector2).distance_to(r.previous)
			travelled[r.id] += move
			max_speed = maxf(max_speed,(r.velocity as Vector2).length()/float(r.speed))
			finite = finite and not app.world.collision.blocked(r.position,.40) and (r.position as Vector2).is_finite()
			gestures[r.id] = gestures[r.id] or r.action == "gesture"
			pauses[r.id] = pauses[r.id] or (r.state == "activity" and move < .001)
	checks.routes_no_wall_crossing = finite
	checks.no_superspeed = max_speed < 1.05
	checks.patrol_really_walks = travelled.get("ambient:103",0) > 12
	checks.porter_really_walks = travelled.get("ambient:112",0) > 12
	checks.trading_pair_animates = gestures.get("ambient:104",false) and gestures.get("ambient:105",false)
	checks.training_group_animates = gestures.get("ambient:107",false) and gestures.get("ambient:108",false) and gestures.get("ambient:109",false) and gestures.get("ambient:110",false)
	checks.workers_perform_chores = gestures.get("ambient:111",false) and gestures.get("ambient:113",false) and gestures.get("ambient:114",false)
	checks.pauses_between_jobs = pauses.values().all(func(v): return v)
	checks.nearby_conversations = app.world.final_environment.courtyard.speech_count > 0
	checks.elza_approach = await go(app,Vector2(-110,-191))
	app.open_npc_service("npc:shop")
	await Keys.wait_ms(app.get_tree(),200)
	checks.elza_trade_still_opens = is_instance_valid(app.active_dialog) and app.active_dialog.visible
	app.close_dialog()
	await Mouse.fixture(app,"castle-training")
	await Keys.wait_ms(app.get_tree(),1800)
	await shot(app,"castle-training",-1.1)
	checks.training_clips_really_loaded = true
	for id: String in ["ambient:107","ambient:108","ambient:109","ambient:110"]:
		var controller: VarendorAnimationController = app.world.actors[id].get_meta("animation_controller")
		var r: Dictionary = ambient.residents.filter(func(value): return value.id==id)[0]
		checks.training_clips_really_loaded = checks.training_clips_really_loaded and not controller.find_clip([r.route[0].clip]).is_empty()
	await Mouse.fixture(app,"castle-well"); await shot(app,"castle-well",.25)
	await Mouse.fixture(app,"castle-supply"); await shot(app,"castle-supply",-.5)
	await Mouse.fixture(app,"castle-overview"); await overview(app)
	var ids: Array = ambient.residents.map(func(r): return r.id)
	var clock_before: float = ambient.clock_ms
	await Mouse.fixture(app,"castle-interior")
	await Keys.wait_ms(app.get_tree(),400)
	checks.hidden_inside_cave = ids.all(func(id): return app.world.actors.has(id) and not app.world.actors[id].visible)
	var inside_clock: float = ambient.clock_ms
	await Keys.wait_ms(app.get_tree(),350)
	checks.distant_simulation_paused = is_equal_approx(ambient.clock_ms,inside_clock)
	await Mouse.fixture(app,"castle-return")
	await Keys.wait_ms(app.get_tree(),400)
	checks.return_without_duplicates = app.world.actors.keys().filter(func(id): return str(id).begins_with("ambient:")).size()==15 and ambient.clock_ms>clock_before
	checks.residents_grounded = ids.all(func(id): return absf(app.world.actors[id].position.y-70)<.05)
	checks.gate_walk_out = await go(app,Vector2(-100,-238))
	var ok: bool = checks.values().all(func(v): return v==true)
	app.net.save_private_json(app.qa_path,{"ok":ok,"checks":checks,"travelMetres":travelled,"maxSpeedRatio":max_speed,"adapter":RenderingServer.get_video_adapter_name()})
	app.get_tree().quit(0 if ok else 2)
