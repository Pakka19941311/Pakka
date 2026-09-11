extends RefCounted
## Tests the ordinary client against a disposable authoritative server.
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")

static func mouse(app: Node, screen: Vector2, button: int = MOUSE_BUTTON_LEFT) -> void:
	for pressed: bool in [true,false]:
		var event: InputEventMouseButton = InputEventMouseButton.new()
		event.position = screen
		event.button_index = button
		event.pressed = pressed
		# Projection and GUI rectangles use viewport-local coordinates. Keep
		# the full input/GUI/unhandled pipeline, without desktop DPI conversion.
		app.get_viewport().push_input(event,true)

static func click_near_hero(app: Node) -> Vector2:
	var position: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	for offset: Vector2 in [Vector2(2,0),Vector2(-2,0),Vector2(0,2),Vector2(0,-2)]:
		var target: Vector2 = position+offset
		if app.world.collision.blocked(target): continue
		var screen: Vector2 = app.world.camera.unproject_position(app.world.point(target.x,target.y))
		var picked = app.world.targeting.ground(screen)
		if picked == null or picked.distance_to(target) > .25 or not app.world.targeting.pick(screen).is_empty(): continue
		mouse(app,screen)
		return target
	return Vector2.INF

static func fixture(app: Node, stage: String) -> Dictionary:
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("fixture-request.json"),{"stage":stage})
	var file: String = app.qa_path.get_base_dir().path_join("fixture-ready.json")
	var ready: bool = await Wait.until(app,func():
		if not FileAccess.file_exists(file): return false
		var value = JSON.parse_string(FileAccess.get_file_as_string(file))
		return value != null and value.get("stage","") == stage,10000)
	if not ready: return {}
	var result: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(file))
	await Wait.until(app,func(): return not app.world.space_loading and int(app.net.hero.generation) >= int(result.generation),15000)
	await Keys.wait_ms(app.get_tree(),500)
	return result

static func run(app: Node) -> void:
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(1600,900))
	app.qa_interaction = true
	var checks: Dictionary = {"native_render":DisplayServer.get_name() != "headless"}
	checks.connected = await Wait.until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	app.login.hide(); app.close_dialog(); app.inventory_panel.hide()
	app.player_input.focus_changed(true)
	checks.final_world = app.world.final_environment != null and app.world.current_snapshot.get("populationCapacity",0) == 1000
	var a: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	Keys.keyboard(app,KEY_W,true); await Keys.wait_ms(app.get_tree(),900)
	Keys.keyboard(app,KEY_W,false); await Keys.wait_ms(app.get_tree(),300)
	var b: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	checks.wasd_moves = a.distance_to(b) > 1
	await Keys.wait_ms(app.get_tree(),500)
	checks.stop = b.distance_to(Vector2(app.net.hero.x,app.net.hero.z)) < .015
	# This town is outside the legacy +/-135m limits; a real click must stay
	# near its projected destination instead of being clamped to the old map.
	var mouse_goal: Vector2 = click_near_hero(app)
	checks.mouse_ground_moves_in_new_world = mouse_goal.is_finite() and await Wait.until(app,func(): return Vector2(app.net.hero.x,app.net.hero.z).distance_to(mouse_goal)<.4,5000)
	print("MOUSE_QA goal=",mouse_goal," actual=",Vector2(app.net.hero.x,app.net.hero.z)," viewport=",app.get_viewport().get_visible_rect()," focused=",app.player_input.focused)
	await Keys.wait_ms(app.get_tree(),300)
	app.polish.toggle_map()
	await Keys.wait_ms(app.get_tree(),200)
	var ui_position: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	mouse(app,app.polish.atlas.get_global_rect().get_center())
	await Keys.wait_ms(app.get_tree(),350)
	checks.map_consumes_mouse = Vector2(app.net.hero.x,app.net.hero.z).distance_to(ui_position)<.05
	print("MAP_MOUSE_QA before=",ui_position," after=",Vector2(app.net.hero.x,app.net.hero.z)," rect=",app.polish.atlas.get_global_rect())
	app.polish.toggle_map()
	await Wait.capture(app,"final-town")
	var combat: Dictionary = await fixture(app,"combat")
	checks.fixture_combat = not combat.is_empty()
	if checks.fixture_combat:
		checks.visible_monster = await Wait.until(app,func(): return app.world.actors.has(combat.target))
		app.net.intent({"type":"attack","entityId":combat.target,"skill":null,"mode":"auto"})
		await Keys.wait_ms(app.get_tree(),1800)
		await Wait.capture(app,"final-combat")
		checks.real_autoattack_loot = await Wait.until(app,func(): return int(app.net.hero.kills)>int(combat.kills),30000)
		checks.real_knight_rig = app.world.actors[app.world.hero_id].get_meta("animation_controller").knight_rig != null
	for id: String in ["mine","great_cave"]:
		var f: Dictionary = await fixture(app,"portal-"+id)
		checks[id+"_fixture"] = not f.is_empty()
		if f.is_empty(): continue
		var level: int = int(app.net.hero.level)
		Keys.keyboard(app,KEY_F,true,true); Keys.keyboard(app,KEY_F,false)
		checks[id+"_entered"] = await Wait.until(app,func(): return app.world.final_environment.active_space == id and not app.world.space_loading,20000)
		await Keys.wait_ms(app.get_tree(),900)
		checks[id+"_level"] = int(app.net.hero.level) == level
		checks[id+"_entities"] = app.world.current_snapshot.monsters.size()>0 and app.world.current_snapshot.monsters.all(func(m): return m.get("spaceId","") == id)
		var entry_position: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
		Keys.keyboard(app,KEY_W,true); await Keys.wait_ms(app.get_tree(),900)
		Keys.keyboard(app,KEY_W,false); await Keys.wait_ms(app.get_tree(),300)
		var walking_position: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
		checks[id+"_walk"] = entry_position.distance_to(walking_position)>1
		await Keys.wait_ms(app.get_tree(),400)
		checks[id+"_stop"] = walking_position.distance_to(Vector2(app.net.hero.x,app.net.hero.z))<.015
		await Wait.capture(app,"final-"+id)
		app.polish.toggle_map(); await Keys.wait_ms(app.get_tree(),200)
		await Wait.capture(app,"final-map-"+id); app.polish.toggle_map()
		app.net.intent({"type":"destination","x":entry_position.x,"z":entry_position.y})
		checks[id+"_walk_back"] = await Wait.until(app,func(): return entry_position.distance_to(Vector2(app.net.hero.x,app.net.hero.z))<.6,6000)
		Keys.keyboard(app,KEY_F,true,true); Keys.keyboard(app,KEY_F,false)
		checks[id+"_returned"] = await Wait.until(app,func(): return app.world.final_environment.active_space == "surface" and not app.world.space_loading,15000)
		checks[id+"_return_level"] = int(app.net.hero.level) == level
	var ok: bool = true
	for key: String in checks:
		if key != "native_render" and not checks[key]: ok = false
	app.net.save_private_json(app.qa_path,{"ok":ok,"checks":checks,"adapter":RenderingServer.get_video_adapter_name(),"fixture":"isolated save; hero repositioned between stages; existing monster stats and population unchanged"})
	print("FINAL_GAMEPLAY_QA "+JSON.stringify(checks))
	app.world.stop_audio(); await app.net.request("/api/disconnect",{}); app.net.end_session()
	app.get_tree().quit(0 if ok else 2)
