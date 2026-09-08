extends RefCounted

static func walk(app: Node,goal: Vector2,limit: float = 24) -> bool:
	app.net.intent({"type":"destination","x":goal.x,"z":goal.y})
	var began: int = Time.get_ticks_msec()
	while Time.get_ticks_msec()-began < limit*1000:
		await app.get_tree().create_timer(.18).timeout
		if app.net.hero.is_empty() or bool(app.net.hero.dead): return false
		if Vector2(app.net.hero.x,app.net.hero.z).distance_to(goal) < 1.1:
			app.net.intent({"type":"cancel"})
			return true
	app.net.intent({"type":"cancel"})
	return false

static func capture(app: Node,name: String) -> void:
	if DisplayServer.get_name() == "headless": return
	var previous: bool = app.qa_interaction
	app.qa_interaction = false
	app.apply_settings()
	await app.get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image: Image = app.get_viewport().get_texture().get_image()
	image.save_png(app.qa_path.get_base_dir().path_join(name+".png"))
	image.resize(1120,630,Image.INTERPOLATE_LANCZOS)
	var bytes: PackedByteArray = image.save_jpg_to_buffer(.7)
	var file: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join(name+".jpg"),FileAccess.WRITE)
	file.store_buffer(bytes)
	file.close()
	var encoded: String = Marshalls.raw_to_base64(bytes)
	var count: int = ceili(encoded.length()/8000.0)
	for index: int in count:
		print("VARENDOR_WORLD_IMAGE "+JSON.stringify({"name":name,"part":index,"count":count,"data":encoded.substr(index*8000,8000)}))
	app.qa_interaction = previous
	app.apply_settings()

static func run(app: Node) -> void:
	app.qa_interaction = true
	app.apply_settings()
	var tree: SceneTree = app.get_tree()
	await tree.create_timer(1).timeout
	var checks: Dictionary = {"connected":app.net.connected,"classes":app.data.classes.size(),"item_definitions":app.data.items.size(),"quick_slots":app.quick.size(),"bag_slots":app.bag_slots.size(),"equipment_slots":app.equipment_slots.size(),"territory_version":app.world.territory.version==3,"native_render":DisplayServer.get_name()!="headless"}
	var license: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join("godot-license.txt"),FileAccess.WRITE)
	license.store_string(Engine.get_license_text()+"\n\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n\n"+JSON.stringify(Engine.get_license_info(),"  "))
	license.close()
	app.quick[31] = {"action":"potion","key":"Shift+KeyG"}
	app.save_preferences()
	checks["territory_landmarks"] = app.world.territory.landmarks.size()==13
	checks["fifty_three_initial_enemies"] = app.world.current_snapshot.monsters.size()==53
	checks["four_services_six_residents"] = VarendorNpcInteraction.SERVICES.size()==4 and app.world.ambient_residents.residents.size()==6
	checks["wildlife_two_loaded_species"] = app.world.territory_life.creatures.size()==10
	var opened: Array[String] = []
	var service_open: Callable = func(id: String): opened.append(id)
	app.npc_interaction.service_opened.connect(service_open)
	# Relocation changed these approaches; accepted NPC behavior is not retested.
	for id: String in VarendorNpcInteraction.SERVICES:
		app.inventory_panel.hide()
		var count: int = opened.size()
		app.picked(id)
		var began: int = Time.get_ticks_msec()
		while opened.size()==count and Time.get_ticks_msec()-began<20000:
			await tree.create_timer(.15).timeout
		var shown: bool = app.inventory_panel.visible if id=="npc:smith" else is_instance_valid(app.active_dialog)
		checks["relocated_service_"+id] = opened.size()==count+1 and opened[-1]==id and shown and app.npc_interaction.ready_for_service(id,Vector2(app.net.hero.x,app.net.hero.z))
		app.close_dialog()
		app.inventory_panel.hide()
		await tree.process_frame
	app.npc_interaction.service_opened.disconnect(service_open)
	# Actual exported player/HTTP/SSE across the new primary route and forest edge.
	var r01: bool = true
	for p: Vector2 in [Vector2(20,-5),Vector2(34,-5),Vector2(64,0),Vector2(71,27),Vector2(35,55),Vector2(-47,51),Vector2(-79,54),Vector2(-83,22),Vector2(-80,2),Vector2(-93,-5)]:
		if not await walk(app,p):
			r01 = false
			break
	checks["r01_gate_road_forest_traversed"] = r01
	var combat: Dictionary = {"hit":false,"loot":false}
	var on_event: Callable = func(event: Dictionary):
		if event.get("actor","")==app.world.hero_id and event.get("kind","")=="hit": combat.hit = true
		if event.get("kind","")=="loot" and event.get("target","")==app.world.hero_id: combat.loot = true
	app.world.event_presented.connect(on_event)
	if r01:
		app.net.intent({"type":"attack","entityId":"greyfang-meadow:0","skill":null})
		var began: int = Time.get_ticks_msec()
		while Time.get_ticks_msec()-began<22000 and not bool(app.net.hero.dead):
			await tree.create_timer(.2).timeout
			var dead: bool = false
			for monster: Dictionary in app.world.current_snapshot.monsters:
				if monster.uid=="greyfang-meadow:0" and not monster.alive: dead = true
			if dead: break
	app.net.intent({"type":"cancel"})
	checks["first_forest_encounter_server_hit"] = combat.hit
	# Inspect the actual clearing before returning along the protected approach.
	await capture(app,"territory-forest")
	var returned: bool = true
	for p: Vector2 in [Vector2(-81,-4),Vector2(-66,-24),Vector2(-48,-18),Vector2(-36,-18),Vector2(12,-9)]:
		if not await walk(app,p):
			returned = false
			break
	checks["r01_return_through_west_gate"] = returned
	# One bounded danger shortcut approach, not a second full combat matrix.
	var r02: bool = true
	for p: Vector2 in [Vector2(34,-5),Vector2(65,0),Vector2(87,1),Vector2(101,-5),Vector2(77,7),Vector2(34,-5),Vector2(12,-9)]:
		if not await walk(app,p):
			r02 = false
			break
	checks["r02_danger_shortcut_and_return"] = r02
	app.world.event_presented.disconnect(on_event)
	# Capture current in-engine geometry at authored viewpoints; no concept renders.
	app.world.set_process(false)
	var original_camera: Transform3D = app.world.camera.global_transform
	app.world.camera.position = Vector3(15,14,23)
	app.world.camera.look_at(Vector3(-13,5,-4))
	await tree.create_timer(.25).timeout
	await capture(app,"territory-courtyard")
	app.world.camera.position = Vector3(54,8,10)
	app.world.camera.look_at(Vector3(24,5,5))
	await tree.create_timer(.25).timeout
	await capture(app,"territory-gate")
	app.world.camera.global_transform = original_camera
	app.world.set_process(true)
	var key: InputEventKey = InputEventKey.new()
	key.keycode = KEY_M
	key.physical_keycode = KEY_M
	key.pressed = true
	app._unhandled_input(key)
	await tree.create_timer(.25).timeout
	checks["m_opens_full_atlas"] = is_instance_valid(app.active_dialog) and app.active_dialog.get_meta("territory_map",false)
	if checks.m_opens_full_atlas:
		var atlas: Control = app.active_dialog.find_child("TerritoryAtlas",true,false)
		checks["atlas_north_projection"] = atlas.map_point(0,103).y<atlas.map_point(0,-82).y
		var wheel: InputEventMouseButton = InputEventMouseButton.new()
		wheel.button_index = MOUSE_BUTTON_WHEEL_UP
		wheel.pressed = true
		wheel.position = atlas.map_rect.get_center()
		atlas._gui_input(wheel)
		checks["atlas_zoom"] = atlas.zoom>1
		atlas.zoom = 1
		atlas.pan = Vector2.ZERO
		await tree.create_timer(.2).timeout
		await capture(app,"territory-atlas")
		if checks.native_render:
			await RenderingServer.frame_post_draw
			app.get_viewport().get_texture().get_image().save_png(app.qa_path.get_basename()+".png")
		app.active_dialog.window_input.emit(key)
		await tree.process_frame
		checks["m_closes_atlas"] = not is_instance_valid(app.active_dialog)
	var success: bool = true
	for name: String in checks:
		if checks[name] is bool and name!="native_render" and not checks[name]: success = false
	var report: Dictionary = {"ok":success,"scope":"territory-world-map","checks":checks,"display":DisplayServer.get_name(),"godot":Engine.get_version_info().string,"notes":"Changed territory only: actual exported native movement through new gates, relocated services, first forest encounter, danger shortcut, atlas and runtime scene captures. Linux Mesa graphics; Windows headless is not a Windows GPU test."}
	app.net.save_private_json(app.qa_path,report)
	print("VARENDOR_NATIVE_QA "+JSON.stringify(report))
	app.net.set_process(false)
	app.world.stop_audio()
	await app.net.request("/api/disconnect",{})
	app.net.stop_input_transport()
	await tree.process_frame
	tree.quit(0 if success else 2)
