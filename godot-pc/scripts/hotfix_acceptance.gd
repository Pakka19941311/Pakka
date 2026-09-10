extends RefCounted

const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")

class Observer extends Node:
	var app: Node
	var phase: String = "load"
	var rows: Array = []
	var previous: int = 0
	func _process(_dt: float) -> void:
		var now: int = Time.get_ticks_usec()
		if previous > 0 and app.world.actors.has(app.world.hero_id):
			var m: VarendorPlayerMovement = app.world.player_motion
			var c: VarendorAnimationController = app.world.actors[app.world.hero_id].get_meta("animation_controller")
			rows.append({"phase":phase,"wall":now/1000.0,"frame_ms":(now-previous)/1000.0,"x":app.world.hero_position.x,"z":-app.world.hero_position.z,"server_x":app.net.hero.x,"server_z":app.net.hero.z,"speed":m.actual_velocity.length(),"correction":m.visual_correction.length(),"clock_error":float(app.net.last_time)-m.clock_ms,"queue":app.net.input_queue.size(),"clip":c.current_clip,"animation_skill":c.knight_skill,"process_ms":Performance.get_monitor(Performance.TIME_PROCESS)*1000})
			var view: RID = app.get_viewport().get_viewport_rid()
			rows.back().merge({"gpu_ms":RenderingServer.viewport_get_measured_render_time_gpu(view),"render_cpu_ms":RenderingServer.viewport_get_measured_render_time_cpu(view),"physics_ms":Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000,"draws":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"primitives":Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)})
		previous = now

static func mouse_click(app: Node, control: Control, twice: bool = false) -> void:
	var point: Vector2 = control.get_global_rect().get_center()
	var motion: InputEventMouseMotion = InputEventMouseMotion.new(); motion.position = point; app.get_viewport().push_input(motion,true)
	for click: int in range(2 if twice else 1):
		for down: bool in [true,false]:
			var event: InputEventMouseButton = InputEventMouseButton.new(); event.position = point; event.button_index = MOUSE_BUTTON_LEFT; event.pressed = down; event.double_click = twice and click == 1 and down
			app.get_viewport().push_input(event,true)
			await app.get_tree().process_frame

static func phase(app: Node, name: String) -> void:
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("hotfix-phase.json"),{"phase":name})

static func run(app: Node) -> void:
	if DisplayServer.get_name() != "headless":
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED); DisplayServer.window_set_size(Vector2i(1600,900))
		if OS.get_environment("LIBGL_ALWAYS_SOFTWARE") == "1": app.qa_interaction = true; app.apply_settings()
	var tree: SceneTree = app.get_tree()
	if DisplayServer.get_name() != "headless": RenderingServer.viewport_set_measure_render_time(app.get_viewport().get_viewport_rid(),true)
	var checks: Dictionary = {"native_render":DisplayServer.get_name() != "headless"}
	checks.connected = await Wait.until(app,func(): return app.net.connected and app.world.actors.has(app.world.hero_id),45000)
	app.login.hide(); app.close_dialog(); app.inventory_panel.hide()
	var observer: Observer = Observer.new(); observer.app = app; observer.process_priority = 100; app.add_child(observer)
	await Keys.wait_ms(tree,1500)
	observer.phase = "storage"
	app.polish.open_storage(); await Keys.wait_ms(tree,300)
	await mouse_click(app,app.polish.storage_slots[0]); await Keys.wait_ms(tree,150)
	checks.storage_selection_action = app.reference_hud.inventory_actions.get_children().any(func(n): return n is Button and "Забрать" in n.text)
	var uid: String = app.net.hero.storage[0].uid
	await mouse_click(app,app.polish.storage_slots[0],true)
	checks.storage_double_click = is_instance_valid(app.active_dialog) and app.active_dialog.find_child("StorageQuantity",true,false) != null
	if checks.storage_double_click:
		var quantity: SpinBox = app.active_dialog.find_child("StorageQuantity",true,false)
		quantity.value = 7
		await mouse_click(app,app.active_dialog.find_child("StorageConfirm",true,false))
	checks.storage_partial_withdraw = await Wait.until(app,func(): return app.net.hero.storage[0] is Dictionary and int(app.net.hero.storage[0].count) == 23 and app.net.hero.inventory.any(func(i): return i.id == "potion" and int(i.count) == 27),2500)
	var stack: Dictionary = app.net.hero.inventory.filter(func(i): return i.id == "potion")[0]
	app.drop_item({"kind":"bag","item":stack},{"kind":"storage","index":2})
	await Keys.wait_ms(tree,150)
	if is_instance_valid(app.active_dialog):
		(app.active_dialog.find_child("StorageQuantity",true,false) as SpinBox).value = 3
		await mouse_click(app,app.active_dialog.find_child("StorageConfirm",true,false))
	checks.storage_partial_deposit = await Wait.until(app,func(): return app.net.hero.storage.size() > 2 and app.net.hero.storage[2] is Dictionary and int(app.net.hero.storage[2].count) == 3 and app.net.hero.inventory.any(func(i): return i.id == "potion" and int(i.count) == 24),2500)
	await Wait.capture(app,"hotfix-storage")
	app.polish.storage_panel.queue_free(); app.polish.storage_panel = null; app.inventory_panel.hide(); app.close_dialog()
	observer.phase = "relocate"
	phase(app,"walk"); checks.route_ready = await Wait.until(app,func(): return absf(app.net.hero.x+110)<.1 and absf(app.net.hero.z+105)<.1)
	app.player_input.focus_changed(true); app.world.camera_controller.yaw = -PI/2; app.world.camera_controller.smoothed_yaw = -PI/2
	await Keys.wait_ms(tree,1000)
	if "--hotfix-slow" in OS.get_cmdline_user_args(): Engine.max_fps = 12
	for segment: int in range(2):
		observer.phase = "run_%d" % segment
		var code: Key = KEY_W if segment == 0 else KEY_S
		Keys.keyboard(app,code,true)
		await Keys.wait_ms(tree,6000)
		if segment == 0 and "--hotfix-slow" in OS.get_cmdline_user_args(): OS.delay_msec(800)
		await Keys.wait_ms(tree,6000); Keys.keyboard(app,code,false)
		observer.phase = "stop_%d" % segment; await Keys.wait_ms(tree,2200)
		observer.phase = "capture"
		await Wait.capture(app,"hotfix-stop-%d" % segment)
	Engine.max_fps = 0
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("hotfix-motion.json"),{"checks":checks,"samples":observer.rows})
	observer.phase = "relocate"
	phase(app,"combat"); checks.combat_ready = await Wait.until(app,func(): return absf(app.net.hero.x+75)<.1 and absf(app.net.hero.z-5)<.1)
	await Keys.wait_ms(tree,700)
	observer.phase = "autoattack"
	var target: Dictionary = app.world.current_snapshot.monsters.filter(func(m: Dictionary): return m.id == "wolf")[0]
	app.world.targeting.select(target.uid); app.activate("attack"); await Keys.wait_ms(tree,12000)
	var attacks: Array = observer.rows.filter(func(r): return r.phase == "autoattack")
	checks.melee_combo_all_five = true
	for step: int in range(1,6):
		if not attacks.any(func(r): return "combo_%02d" % step in r.clip): checks.melee_combo_all_five = false
	checks.no_cast_or_bow_in_autoattack = not attacks.any(func(r): return "cast" in r.clip or "bow" in r.clip or "shoot" in r.clip)
	observer.phase = "capture"
	await Wait.capture(app,"hotfix-knight-combo")
	app.net.intent({"type":"cancel"}); await Keys.wait_ms(tree,500)
	for book: String in ["book_knight_10","book_knight_20","book_knight_30","book_knight_40","book_knight_50","book_knight_60"]:
		observer.phase = book
		app.net.command({"type":"castBook","bookId":book,"targetId":target.uid})
		await Keys.wait_ms(tree,700)
	checks.knight_books_do_not_shoot = not observer.rows.any(func(r): return r.phase.begins_with("book_knight_") and ("cast" in r.clip or "bow" in r.clip or "shoot" in r.clip))
	observer.phase = "loot"
	app.book_ui.show_loot({"gold":120,"items":["potion","wardens_blade"]}); await Keys.wait_ms(tree,300)
	var loot: Rect2 = app.book_ui.loot_panel.get_global_rect(); var quick: Rect2 = app.quick_panel_node.get_global_rect()
	checks.loot_near_quickbar = absf(loot.get_center().x-app.ui.get_global_rect().get_center().x)<3 and absf(loot.end.y-quick.position.y)<12
	await Wait.capture(app,"hotfix-loot")
	var stop_metrics: Dictionary = {}
	for name: String in ["stop_0","stop_1"]:
		var rows: Array = observer.rows.filter(func(r): return r.phase == name)
		var anchor: Vector2 = Vector2(rows[mini(2,rows.size()-1)].x,rows[mini(2,rows.size()-1)].z)
		var drift: float = 0
		for r: Dictionary in rows.slice(2): drift = maxf(drift,Vector2(r.x,r.z).distance_to(anchor))
		stop_metrics[name] = drift; checks[name] = drift < .04
	for segment: int in range(2):
		var rows: Array = observer.rows.filter(func(r): return r.phase == "run_%d" % segment)
		var direction: float = 1.0 if segment == 0 else -1.0
		checks["run_%d_distance" % segment] = direction*(float(rows.back().x)-float(rows.front().x)) > 60.0
		var backstep: float = 0.0
		for index: int in range(1,rows.size()): backstep = maxf(backstep,-direction*(float(rows[index].x)-float(rows[index-1].x)))
		checks["run_%d_no_rubberband" % segment] = backstep < .1
		stop_metrics["run_%d_backstep" % segment] = backstep
	var ok: bool = true
	for name: String in checks: if name != "native_render" and not checks[name]: ok = false
	app.net.save_private_json(app.qa_path,{"ok":ok,"scope":"owner-seven-hotfixes","checks":checks,"stop_metres":stop_metrics,"samples":observer.rows,"adapter":RenderingServer.get_video_adapter_name(),"render_scale":app.get_viewport().scaling_3d_scale})
	print("HOTFIX_QA "+JSON.stringify(checks))
	observer.queue_free(); app.world.stop_audio(); await app.net.request("/api/disconnect",{}); app.net.end_session()
	tree.quit(0 if ok or "--hotfix-diagnose" in OS.get_cmdline_user_args() else 2)
