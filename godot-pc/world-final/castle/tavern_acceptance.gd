extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")
const Court = preload("res://world-final/castle/courtyard_acceptance.gd")

static func art(app: Node, label: String, eye: Vector3, focus: Vector3) -> void:
	var camera: Camera3D = Camera3D.new()
	app.world.add_child(camera); camera.position = eye; camera.look_at(focus); camera.far = 1000
	camera.make_current(); app.ui.hide(); app.world.labels_layer.hide()
	await Keys.wait_ms(app.get_tree(),500)
	await Wait.capture(app,label)
	app.world.camera.make_current(); camera.queue_free(); app.ui.show(); app.world.labels_layer.show()

static func run(app: Node) -> void:
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(1600,900))
	app.qa_interaction = true
	var checks: Dictionary = {}
	checks.connected = await Wait.until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	app.login.hide(); app.close_dialog(); app.inventory_panel.hide(); app.player_input.focus_changed(true)
	app.world.weather.qa_override = {"hour":14.5,"daylight":1.0,"night":false,"fullMoon":false,"weather":"sun","clouds":.18}
	app.get_viewport().scaling_3d_scale = 1.0; app.get_viewport().msaa_3d = Viewport.MSAA_2X
	# Art review at the existing shadow option; no saved preferences are changed.
	app.world.sun_light.shadow_enabled = true
	var court: Node3D = app.world.final_environment.courtyard
	checks.residents_unique = app.world.ambient_residents.residents.size()==39 and app.world.actors.keys().filter(func(id): return str(id).begins_with("ambient:")).size()==39
	checks.residents_grounded_free = app.world.ambient_residents.residents.all(func(r): return not app.world.collision.blocked(r.position,.42))
	if "--block=street-signs" in OS.get_cmdline_user_args():
		await Mouse.fixture(app,"castle-fair")
		await art(app,"tavern-street",Vector3(-140.5,76,179),Vector3(-140.5,76,134))
		await art(app,"apothecary-front",Vector3(-121,77,175),Vector3(-130,75,166))
		await art(app,"guild-front",Vector3(-90,77,154),Vector3(-80,76,140))
		await art(app,"market-street",Vector3(-106,79,219),Vector3(-127,75,191))
		var signs_ok: bool = checks.values().all(func(v): return v==true)
		app.net.save_private_json(app.qa_path,{"ok":signs_ok,"checks":checks,"review_only":true,"game_exported":false,"art_only":true})
		app.get_tree().quit(0 if signs_ok else 2)
		return
	await Mouse.fixture(app,"castle-overview")
	await art(app,"castle-overview",Vector3(-203,167,271),Vector3(-100,78,148))
	await Mouse.fixture(app,"castle-citadel")
	await art(app,"castle-citadel",Vector3(-94,87,182),Vector3(-105,87,111))
	await Mouse.fixture(app,"castle-fair")
	await art(app,"market-street",Vector3(-106,79,219),Vector3(-127,75,191))
	await art(app,"tavern-street",Vector3(-140.5,76,179),Vector3(-140.5,76,134))
	await Mouse.fixture(app,"castle-alehouse")
	await art(app,"podkova-beer-garden",Vector3(-79,78,186),Vector3(-58,75,205))
	await Mouse.fixture(app,"castle-fair")
	await Court.shot(app,"market-gameplay",-.35)
	app.world.weather.qa_override = {"hour":19.8,"daylight":.18,"night":true,"fullMoon":false,"weather":"sun","clouds":.18}
	await Keys.wait_ms(app.get_tree(),2200)
	checks.street_lanterns_work = court.street_lights.size()==10 and court.street_lights.all(func(l): return l.visible and not l.shadow_enabled)
	await art(app,"market-evening",Vector3(-106,79,219),Vector3(-127,75,191))
	app.world.weather.qa_override = {"hour":14.5,"daylight":1.0,"night":false,"fullMoon":false,"weather":"sun","clouds":.18}
	await Keys.wait_ms(app.get_tree(),2200)
	await Mouse.fixture(app,"castle-training")
	await Court.shot(app,"castle-training",-1.1)
	await Mouse.fixture(app,"castle-tavern")
	await art(app,"tavern-exterior",Vector3(-116,90,217),Vector3(-154,77,198))
	if "--block=art-only" in OS.get_cmdline_user_args():
		var art_ok: bool = checks.values().all(func(v): return v==true)
		app.net.save_private_json(app.qa_path,{"ok":art_ok,"checks":checks,"review_only":true,"game_exported":false,"art_only":true})
		app.get_tree().quit(0 if art_ok else 2)
		return
	checks.door_walk_in = await Court.go(app,Vector2(-147,-199))
	await Keys.wait_ms(app.get_tree(),900)
	checks.inside_cutaway = court.tavern.inside and not court.tavern.parts.roof.is_empty() and court.tavern.parts.roof.all(func(p): return p.cast_shadow==GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY)
	app.world.weather.qa_override.weather = "rain"
	await Keys.wait_ms(app.get_tree(),150)
	checks.rain_stays_outside = not app.world.weather.rain.emitting
	app.world.weather.qa_override.weather = "sun"
	checks.walls_still_solid = app.world.collision.blocked(Vector2(-142.5,-206))
	var eye: Vector3 = app.world.point(-145,-206,1.2)
	var end: Vector3 = app.world.point(-140,-206,1.2)
	checks.cutaway_does_not_disable_sight_blocking = app.world.collision.ray_distance(eye,end)<eye.distance_to(end)-.1
	await Keys.wait_ms(app.get_tree(),5000)
	await Court.shot(app,"tavern-gameplay",.50)
	await art(app,"tavern-interior",Vector3(-138,90,216),Vector3(-155,71,198))
	checks.drinkers_hold_tankards = ["ambient:117","ambient:118","ambient:120"].all(func(id): return app.world.actors[id].has_meta("tavern_tankard"))
	checks.sleeper_has_social_pose = app.world.actors["ambient:119"].get_meta("animation_state","")=="doze"
	checks.bookshop_approach = await Court.go(app,Vector2(-146.4,-192.8))
	app.npc_interaction.begin("npc:books")
	checks.bookshop_opens = await Wait.until(app,func(): return is_instance_valid(app.active_dialog) and app.active_dialog.visible and app.book_ui.merchant_name.contains("Северин"),5000)
	app.book_ui.catalogue(true,"knight")
	await Wait.capture(app,"tavern-books")
	var gold: int = int(app.net.hero.gold)
	await app.net.command({"type":"buy","itemId":"book_knight_10"})
	checks.book_bought_once = await Wait.until(app,func(): return app.net.hero.inventory.filter(func(i): return i.id=="book_knight_10").size()==1 and int(app.net.hero.gold)==gold-2000,3000)
	app.close_dialog()
	checks.door_walk_out = await Court.go(app,Vector2(-139,-199))
	await Keys.wait_ms(app.get_tree(),400)
	checks.roof_restored = not court.tavern.inside and court.tavern.parts.roof.all(func(p): return p.cast_shadow==GeometryInstance3D.SHADOW_CASTING_SETTING_ON) and app.world.collision.camera_ignored_ids.is_empty()
	app.world.weather.qa_override.weather = "rain"
	await Keys.wait_ms(app.get_tree(),150)
	checks.outdoor_weather_restored = app.world.weather.rain.emitting and app.world.world_environment.reflected_light_source == Environment.REFLECTION_SOURCE_BG
	app.world.weather.qa_override.weather = "sun"
	checks.door_reenter = await Court.go(app,Vector2(-147,-199))
	checks.no_resident_duplicates = app.world.actors.keys().filter(func(id): return str(id).begins_with("ambient:")).size()==39
	checks.back_to_main_court = await Court.go(app,Vector2(-100,-201))
	checks.quarter_walkable = true
	checks.crowd_stays_on_free_ground = true
	for point: Dictionary in court.definition.quarter.routeReview:
		checks.quarter_walkable = await Court.go(app,Vector2(point.x,point.z),25000) and checks.quarter_walkable
		checks.crowd_stays_on_free_ground = app.world.ambient_residents.residents.all(func(r): return not app.world.collision.blocked(r.position,.40)) and checks.crowd_stays_on_free_ground
	var ok: bool = checks.values().all(func(v): return v==true)
	app.net.save_private_json(app.qa_path,{"ok":ok,"checks":checks,"review_only":true,"game_exported":false,"adapter":RenderingServer.get_video_adapter_name()})
	app.get_tree().quit(0 if ok else 2)
