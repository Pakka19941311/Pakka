extends RefCounted

const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")

class Observer extends Node:
	var app: Node
	var phase: String = "setup"
	var rows: Array = []
	func _process(dt: float) -> void:
		if not app.world.actors.has(app.world.hero_id): return
		var actor: Node3D = app.world.actors[app.world.hero_id]
		var c: VarendorAnimationController = actor.get_meta("animation_controller")
		var m: VarendorPlayerMovement = app.world.player_motion
		var feet: Array = []
		for side: String in ["Left", "Right"]:
			var bone: int = -1
			for index: int in range(c.knight_rig.get_bone_count()):
				if str(c.knight_rig.get_bone_name(index)).ends_with(side+"ToeBase"): bone = index; break
			if bone < 0: continue
			var p: Vector3 = c.knight_rig.global_transform * c.knight_rig.get_bone_global_pose(bone).origin
			feet.append([p.x,p.y,p.z])
		rows.append({"phase":phase,"wall":Time.get_ticks_msec(),"dt":dt,"x":actor.position.x,"z":-actor.position.z,"yaw":actor.rotation.y,"speed":m.actual_velocity.length(),"mode":m.input_mode,"correction":[m.visual_correction.x,m.visual_correction.y],"physics":[m.position_value.x,m.position_value.y],"server":[app.net.hero.x,app.net.hero.z],"sent":m.last_sent_sequence,"ack":app.net.hero.lastInputSequence,"clock":m.clock_ms,"server_clock":app.net.last_time,"clip":c.current_clip,"gait_phase":c.gait_phase,"feet":feet,"camera":[app.world.camera.position.x,app.world.camera.position.y,app.world.camera.position.z],"anchor":m.rest_anchor_active,"settle":m.correction_must_settle})

static func run(app: Node) -> void:
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_size(Vector2i(3822,2140) if "--sliding-4k" in OS.get_cmdline_user_args() else Vector2i(1600,900))
		if OS.get_environment("LIBGL_ALWAYS_SOFTWARE") == "1": app.qa_interaction = true; app.apply_settings()
	var checks: Dictionary = {"native_render":DisplayServer.get_name() != "headless"}
	checks.connected = await Wait.until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	app.login.hide(); app.close_dialog(); app.inventory_panel.hide()
	app.player_input.focus_changed(true)
	var observer: Observer = Observer.new(); observer.app = app; observer.process_priority = 100; app.add_child(observer)
	observer.phase = "teleport"
	app.net.command({"type":"teleport","destination":"Астерхолд"})
	checks.teleport_asterhold = await Wait.until(app,func(): return absf(app.net.hero.x+98)<.2 and absf(app.net.hero.z+84)<.2,4000)
	checks.teleport_keeps_level_xp = int(app.net.hero.level)==10 and int(app.net.hero.xp)==16000
	app.net.intent({"type":"destination","x":-93.0,"z":-84.0})
	checks.reach_city_portal = await Wait.until(app,func(): return absf(app.net.hero.x+93)<1.0,5000)
	app.net.command({"type":"teleport","destination":"Гринфолл"})
	checks.teleport_greenfall = await Wait.until(app,func(): return absf(app.net.hero.x-12)<.2 and absf(app.net.hero.z+9)<.2,4000)
	await Keys.wait_ms(app.get_tree(),200)
	checks.return_keeps_level_xp = int(app.net.hero.level)==10 and int(app.net.hero.xp)==16000
	checks.level_nameplate = (app.world.actors[app.world.hero_id].get_meta("screen_label") as Label).text.ends_with(" · 10")
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("hotfix-phase.json"),{"phase":"walk"})
	checks.route_ready = await Wait.until(app,func(): return absf(app.net.hero.x+75)<.1 and absf(app.net.hero.z+83)<.1)
	app.world.camera_controller.yaw = -.45
	await Keys.wait_ms(app.get_tree(),1000)
	if "--hotfix-slow" in OS.get_cmdline_user_args(): Engine.max_fps = 15
	var keys: Array[Key] = [KEY_W,KEY_W,KEY_D,KEY_A,KEY_D,KEY_A,KEY_W,KEY_S]
	for index: int in range(keys.size()):
		observer.phase = "move_%d" % index
		Keys.keyboard(app,keys[index],true)
		for part: int in range(5):
			if index >= 2: app.world.camera_controller.yaw += .08
			await Keys.wait_ms(app.get_tree(),140)
		Keys.keyboard(app,keys[index],false)
		observer.phase = "stop_%d" % index
		await Keys.wait_ms(app.get_tree(),800)
	observer.phase = "long_run"
	Keys.keyboard(app,KEY_W,true); await Keys.wait_ms(app.get_tree(),6000)
	Keys.keyboard(app,KEY_W,false); observer.phase = "long_stop"; await Keys.wait_ms(app.get_tree(),1500)
	Engine.max_fps = 0
	var metrics: Dictionary = {}
	for stage: String in ["stop_0","stop_1","stop_2","stop_3","stop_4","stop_5","stop_6","stop_7","long_stop"]:
		var rows: Array = observer.rows.filter(func(r): return r.phase == stage and r.speed < .001)
		var maximum: float = 0
		if rows.is_empty(): checks[stage] = false; continue
		var first: Vector2 = Vector2(rows[0].x,rows[0].z)
		for r: Dictionary in rows: maximum = maxf(maximum,Vector2(r.x,r.z).distance_to(first))
		metrics[stage] = maximum; checks[stage] = maximum < .015
	await Wait.capture(app,"sliding-final")
	checks.real_rig_sampled = observer.rows.all(func(r): return r.feet.size()==2)
	var ok: bool = true
	for name: String in checks: if name != "native_render" and not checks[name]: ok = false
	app.net.save_private_json(app.qa_path,{"ok":ok,"checks":checks,"stop_metres":metrics,"samples":observer.rows,"viewport":str(app.get_viewport().get_visible_rect()),"adapter":RenderingServer.get_video_adapter_name()})
	print("SLIDING_QA "+JSON.stringify(checks)+" "+JSON.stringify(metrics))
	observer.queue_free(); app.world.stop_audio(); await app.net.request("/api/disconnect",{}); app.net.end_session()
	app.get_tree().quit(0 if ok or "--hotfix-diagnose" in OS.get_cmdline_user_args() else 2)
