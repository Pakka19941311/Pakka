extends RefCounted

# Follow-up scope only. The accepted full reference-port matrix is preserved in
# Git evidence; this release reruns the changed controls/NPC/UI and package gate.
static func run(app: Node) -> void:
	app.qa_interaction = true
	app.apply_settings()
	var tree: SceneTree = app.get_tree()
	await tree.create_timer(1.0).timeout
	var checks: Dictionary = {"connected":app.net.connected,"classes":app.data.classes.size(),"item_definitions":app.data.items.size(),"quick_slots":app.quick.size(),"bag_slots":app.bag_slots.size(),"equipment_slots":app.equipment_slots.size(),"world_loaded":app.world.get_child_count()>4,"hero_model_loaded":app.world.actors.has(app.world.hero_id)}
	if app.net.hero.is_empty():
		app.net.save_private_json(app.qa_path,{"ok":false,"checks":checks})
		tree.quit(2)
		return
	var license: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join("godot-license.txt"),FileAccess.WRITE)
	if license != null:
		license.store_string(Engine.get_license_text()+"\n\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n\n"+JSON.stringify(Engine.get_license_info(),"  "))
		license.close()
	app.quick[31] = {"action":"potion","key":"Shift+KeyG"}
	app.save_preferences()
	checks.merge(preload("res://scripts/player_movement_qa.gd").run())
	checks.merge(preload("res://scripts/player_pending_qa.gd").run())
	checks.merge(preload("res://scripts/player_input_qa.gd").run())
	checks.merge(preload("res://scripts/input_boundary_qa.gd").run(app))
	checks.merge(preload("res://scripts/network_intent_qa.gd").run())
	checks.merge(preload("res://scripts/player_stop_qa.gd").run())
	checks.merge(preload("res://scripts/stop_anchor_qa.gd").run())
	checks.merge(preload("res://scripts/stop_pose_qa.gd").run(app))
	checks.merge(preload("res://scripts/navigation_qa.gd").run())
	checks.merge(await preload("res://scripts/stopping_runtime_qa.gd").run(app))
	var stop_only: bool = "--qa-scope=stop-only" in OS.get_cmdline_user_args()
	if not stop_only:
		checks.merge(await preload("res://scripts/npc_interaction_qa.gd").run(app))
		checks.merge(await preload("res://scripts/reference_ui_qa.gd").run(app))
	app.inventory_panel.show()
	app.qa_interaction = false
	app.apply_settings()
	await tree.create_timer(.5).timeout
	checks["native_render"] = DisplayServer.get_name() != "headless"
	if checks.native_render:
		await RenderingServer.frame_post_draw
		var capture: Image = app.get_viewport().get_texture().get_image()
		capture.save_png(app.qa_path.get_basename()+".png")
	var success: bool = true
	for name: String in checks:
		if checks[name] is bool and name != "native_render" and not checks[name]: success = false
	var report: Dictionary = {"ok":success,"scope":"forward-stop-follow-up" if stop_only else "stop-npc-stats-follow-up","checks":checks,"display":DisplayServer.get_name(),"godot":Engine.get_version_info().string,"notes":"Actual native input/HTTP/SSE/actor against isolated synthetic save; first-tick stop, imported rigs and camera transforms. Windows headless does not establish Windows GPU behavior or subjective feel."}
	app.net.save_private_json(app.qa_path,report)
	print("VARENDOR_NATIVE_QA "+JSON.stringify(report))
	app.net.set_process(false)
	app.world.stop_audio()
	await app.net.request("/api/disconnect",{})
	app.net.stop_input_transport()
	preload("res://scripts/stopping_runtime_qa.gd").save_captures(app)
	await tree.process_frame
	tree.quit(0 if success else 2)
