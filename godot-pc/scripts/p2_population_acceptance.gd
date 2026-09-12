extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func auto_attack_chord(app: Node, point: Vector2) -> void:
	# Use the existing release-of-LMB+RMB gesture; a single LMB is one strike.
	for step: Array in [[MOUSE_BUTTON_LEFT,true],[MOUSE_BUTTON_RIGHT,true],[MOUSE_BUTTON_LEFT,false],[MOUSE_BUTTON_RIGHT,false]]:
		var event: InputEventMouseButton = InputEventMouseButton.new()
		event.position = point; event.button_index = step[0]; event.pressed = step[1]
		app.get_viewport().push_input(event,true)

static func run(app: Node, checks: Dictionary) -> void:
	checks.p2_native_render = DisplayServer.get_name() != "headless"
	checks.p2_population = int(app.world.current_snapshot.get("populationCapacity",0)) == 1151
	var selected_mobs: Array = ["MOB-01","MOB-03","MOB-02","MOB-04","MOB-05"]
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--block=p2:"): selected_mobs = Array(arg.trim_prefix("--block=p2:").split(","))
	for mob_id: String in selected_mobs:
		app.close_dialog(); app.inventory_panel.hide()
		var fixture: Dictionary = await Mouse.fixture(app,"p2-combat-"+mob_id)
		checks[mob_id+"_fixture"] = not fixture.is_empty()
		if fixture.is_empty(): continue
		var uid: String = str(fixture.target)
		checks[mob_id+"_visible"] = await Wait.until(app,func(): return app.world.actors.has(uid),12000)
		if not checks[mob_id+"_visible"]: continue
		var actor: Node3D = app.world.actors[uid]
		checks[mob_id+"_profile"] = actor.has_meta("p2_profile") and actor.get_meta("animation_controller") is VarendorP2AnimationController
		var definition: Dictionary = app.world.monster_definition(actor.get_meta("motion"))
		checks[mob_id+"_instance_level"] = int(definition.level) == int(fixture.level) and str(actor.get_meta("screen_label").text).ends_with("· %d" % int(fixture.level))
		checks[mob_id+"_instance_max_hp"] = is_equal_approx(float(definition.hp),float(fixture.maxHp))
		checks[mob_id+"_full_health_target"] = is_equal_approx(float(fixture.monsterHpBefore),float(fixture.maxHp))
		var gear: VarendorKnightEquipment = app.world.actors[app.world.hero_id].get_meta("knight_equipment")
		checks[mob_id+"_starter_gear_visible"] = gear.unsupported_items.is_empty() and gear.loadout.size() == 6 and bool(app.world.actors[app.world.hero_id].get_meta("knight_weapon_equipped",false))
		var clicked: bool = false
		app.world.camera_distance = 8.5
		for angle: float in [0.0,PI/2.0,PI,PI*1.5]:
			app.world.camera_yaw = angle
			await Keys.wait_ms(app.get_tree(),300)
			var point: Vector2 = app.world.camera.unproject_position(actor.global_position+Vector3(0,float(actor.get_meta("p2_profile").height)*.5,0))
			if Rect2(360,120,960,590).has_point(point) and app.world.targeting.pick(point) == uid:
				Mouse.mouse(app,point); auto_attack_chord(app,point); clicked = true; break
		checks[mob_id+"_real_lmb_pick"] = clicked
		if not clicked:
			await Wait.capture(app,"p2-unpicked-"+mob_id)
			continue
		checks[mob_id+"_existing_chord_starts_auto"] = await Wait.until(app,func(): return bool(app.net.hero.get("autoAttack",false)),5000)
		checks[mob_id+"_damage_and_target_bar"] = await Wait.until(app,func():
			return app.world.target_id == uid and app.target_hp.visible and is_equal_approx(app.target_hp.max_value,float(fixture.maxHp)) and app.target_hp.value < app.target_hp.max_value,10000)
		await Wait.capture(app,"p2-live-"+mob_id.to_lower())
		checks[mob_id+"_ordinary_attack_kill"] = await Wait.until(app,func(): return int(app.net.hero.kills)>int(fixture.kills),45000)
		checks[mob_id+"_survived"] = not bool(app.net.hero.get("dead",false))
		checks[mob_id+"_loot"] = int(app.net.hero.gold)>int(fixture.gold)
		checks[mob_id+"_no_action_clock_violation"] = not bool(actor.get_meta("p2_attack_contract_violation",false)) and not bool(actor.get_meta("p2_gait_contract_violation",false))
		var controller: VarendorP2AnimationController = actor.get_meta("animation_controller")
		app.net.save_private_json(app.qa_path.get_base_dir().path_join("p2-motion-"+mob_id+".json"),{
			"profile":actor.get_meta("p2_profile"),"motion":actor.get_meta("motion"),"state":controller.state,
			"attack_violation":actor.get_meta("p2_attack_contract_violation",false),"gait_violation":actor.get_meta("p2_gait_contract_violation",false),
			"last_gait_violation":actor.get_meta("p2_last_gait_violation",{}),"last_attack_violation":actor.get_meta("p2_last_attack_violation",{}),
			"attack_length":controller.clip_length(controller.find_clip(["attack"])),"gait_clip":controller.gait_clip,"playback_rate":controller.playback_rate})
		checks[mob_id+"_dead_unpickable"] = await Wait.until(app,func(): return not is_instance_valid(actor) or bool(actor.get_meta("dead",false)) and not bool(actor.get_meta("pickable",true)),5000)
		var position: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
		await Keys.wait_ms(app.get_tree(),400)
		checks[mob_id+"_no_slide_after_kill"] = position.distance_to(Vector2(app.net.hero.x,app.net.hero.z))<.03
		print("P2_NATIVE ",mob_id," ",JSON.stringify(checks))
