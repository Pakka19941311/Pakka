extends RefCounted

# Actual application/world/HTTP inventory and attack presentation, on a disposable
# beta save supplied by scripts/godot-knight-qa.mjs. Never run on a personal save.
class Observer extends Node:
	var app: Node
	var stage: String = "setup"
	var samples: Array = []
	var attacks: Array = []
	var clips: Dictionary = {}
	var events: Array = []
	var last_attack: float = -1
	var recording: bool = false
	var directory: String = ""
	var captured: Array = []
	var next_capture: int = 0
	var stop_clock: int = 0
	var stop_samples: Array = []
	func _process(_delta: float) -> void:
		if not app.world.actors.has(app.world.hero_id): return
		var actor: Node3D = app.world.actors[app.world.hero_id]
		var c: VarendorAnimationController = actor.get_meta("animation_controller")
		var clip: String = c.normalized_name(c.current_clip)
		if not clips.has(stage): clips[stage] = []
		if clip not in clips[stage]: clips[stage].append(clip)
		if c.state == "attack" and c.attack_started_at != last_attack:
			last_attack = c.attack_started_at
			attacks.append({"stage":stage,"start":c.attack_started_at,"impact":c.attack_impact_at,"finish":c.attack_ends_at,"skill":c.knight_skill,"clip":clip,"combo":c.knight_combo_index})
		if stop_clock > 0:
			var p: Vector3 = c.knight_rig.get_bone_pose_position(c.knight_hips)
			stop_samples.append({"ms":Time.get_ticks_msec()-stop_clock,"speed":app.world.player_motion.actual_velocity.length(),"state":c.state,"hips":[p.x,p.z],"position":[actor.position.x,actor.position.z]})
	func event(value: Dictionary) -> void:
		if str(value.get("actor","")) == app.world.hero_id or str(value.get("target","")) == app.world.hero_id:
			var owned: Dictionary = value.duplicate(true)
			owned["qa_stage"] = stage
			events.append(owned)
	func after_draw() -> void:
		if not recording or captured.size() >= 180 or Time.get_ticks_msec() < next_capture: return
		next_capture = Time.get_ticks_msec()+100
		var image: Image = app.get_viewport().get_texture().get_image()
		image.resize(960,540,Image.INTERPOLATE_BILINEAR)
		var path: String = directory.path_join("knight-frame-%04d.jpg" % captured.size())
		if image.save_jpg(path,.86) == OK:
			captured.append({"file":path.get_file(),"wall_ms":Time.get_ticks_msec(),"stage":stage})

static func wait_ms(tree: SceneTree, ms: int) -> void:
	var until: int = Time.get_ticks_msec()+ms
	while Time.get_ticks_msec() < until:
		await tree.process_frame

static func until(app: Node, test: Callable, timeout_ms: int = 6000) -> bool:
	var limit: int = Time.get_ticks_msec()+timeout_ms
	while Time.get_ticks_msec() < limit:
		await app.get_tree().process_frame
		if test.call(): return true
	return false

static func keyboard(app: Node, code: Key, pressed: bool, unhandled: bool = false) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code; event.keycode = code; event.pressed = pressed
	if unhandled: app._unhandled_input(event)
	else: app._input(event)

static func equip(app: Node, item_id: String, slot: String, model_id: String) -> bool:
	var item: Dictionary = {}
	for value: Dictionary in app.net.hero.inventory:
		if str(value.id) == item_id: item = value.duplicate(); break
	if item.is_empty(): return false
	await app.net.command({"type":"equip","item":item,"slot":slot})
	return await until(app, func():
		var adapter: VarendorKnightEquipment = app.world.actors[app.world.hero_id].get_meta("knight_equipment")
		return app.net.hero.equipment.get(slot,{}).get("uid","") == item.uid and model_id in adapter.loadout)

static func unequip(app: Node, slot: String, model_id: String) -> bool:
	var item: Dictionary = app.net.hero.equipment.get(slot,{}).duplicate()
	if item.is_empty(): return false
	await app.net.command({"type":"unequip","item":item,"slot":slot})
	return await until(app, func():
		var adapter: VarendorKnightEquipment = app.world.actors[app.world.hero_id].get_meta("knight_equipment")
		return not app.net.hero.equipment.get(slot) and app.net.hero.inventory.any(func(value): return value.uid == item.uid) and model_id not in adapter.loadout)

static func capture(app: Node, name: String, front: bool = false) -> String:
	if DisplayServer.get_name() == "headless": return ""
	var c: VarendorCameraController = app.world.camera_controller
	var old: Array = [c.yaw,c.smoothed_yaw,c.distance,c.smoothed_distance,c.pitch,c.smoothed_pitch]
	if front:
		var actor: Node3D = app.world.actors[app.world.hero_id]
		var ahead: Vector3 = actor.basis.z
		c.yaw = atan2(ahead.x,ahead.z)
		c.smoothed_yaw = c.yaw
		c.distance = 5.5; c.smoothed_distance = 5.5
		c.pitch = .30; c.smoothed_pitch = .30
	await wait_ms(app.get_tree(),160)
	await RenderingServer.frame_post_draw
	var path: String = app.qa_path.get_base_dir().path_join(name+".png")
	var result: int = app.get_viewport().get_texture().get_image().save_png(path)
	c.yaw = old[0]; c.smoothed_yaw = old[1]; c.distance = old[2]; c.smoothed_distance = old[3]; c.pitch = old[4]; c.smoothed_pitch = old[5]
	return path.get_file() if result == OK else ""

static func run(app: Node) -> void:
	var tree: SceneTree = app.get_tree()
	var license_file: FileAccess = FileAccess.open(app.qa_path.get_base_dir().path_join("godot-license.txt"),FileAccess.WRITE)
	if license_file != null:
		license_file.store_string(Engine.get_license_text()+"\n\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n\n"+JSON.stringify(Engine.get_license_info(),"  "))
		license_file.close()
	# Functional tests preserve the user's current graph settings and weather.
	app.qa_interaction = false
	app.apply_settings()
	# The first graphics frame may compile shaders longer than a profile HTTP
	# request timeout. Await the existing reconnect/SSE path and an actual actor;
	# no network deadlines or production retry behavior are changed for this QA.
	print("VARENDOR_KNIGHT_QA_STAGE waiting-for-world-connection")
	var connection_ready: bool = await until(app,func(): return app.net.connected and not app.net.hero.is_empty() and app.world.actors.has(app.world.hero_id),45000)
	await wait_ms(tree,300)
	print("VARENDOR_KNIGHT_QA_STAGE world-connected="+str(connection_ready))
	var checks: Dictionary = {"connected":app.net.connected,"connection_settled":connection_ready,"native_render":DisplayServer.get_name() != "headless"}
	var measurements: Dictionary = {}
	var captures: Array[String] = []
	var observer: Observer = Observer.new()
	observer.app = app; observer.directory = app.qa_path.get_base_dir()
	observer.process_priority = 100
	app.add_child(observer)
	app.world.event_presented.connect(observer.event)
	if checks.native_render: RenderingServer.frame_post_draw.connect(observer.after_draw)
	var valid: bool = not app.net.hero.is_empty() and app.net.hero.get("classId","") == "knight" and app.world.actors.has(app.world.hero_id)
	checks["fresh_knight_connected"] = valid
	if valid:
		app.login.hide(); app.inventory_panel.hide(); app.close_dialog()
		if app.get_viewport().gui_get_focus_owner() != null: app.get_viewport().gui_get_focus_owner().release_focus()
		app.player_input.focus_changed(true)
		var actor: Node3D = app.world.actors[app.world.hero_id]
		var controller: VarendorAnimationController = actor.get_meta("animation_controller")
		var adapter: VarendorKnightEquipment = actor.get_meta("knight_equipment",null)
		checks["actual_world_loads_forgotten_knight"] = actor.get_meta("model") == "ForgottenKnight" and adapter != null
		if adapter != null:
			checks["fresh_knight_starts_in_pants_without_equipped_items"] = app.net.hero.equipment.is_empty() and adapter.loadout.is_empty() and adapter.meshes.FK_starter_pants.visible and adapter.meshes.FK_body_torso.visible
			var base: Transform3D = actor.get_meta("base_visual")
			checks["height_calibrated_from_184cm_body"] = absf(base.basis.get_scale().y - 2.05/1.84)<.0001 and absf(base.origin.y)<.001
			checks["gameplay_root_starts_on_terrain"] = absf(actor.position.y-app.world.height_at(actor.position.x,-actor.position.z)) < .02
			captures.append(await capture(app,"knight-starter",true))
			observer.stage = "unarmed-run"; observer.recording = checks.native_render
			var start: Vector2 = app.world.player_motion.position_value
			var camera: VarendorCameraController = app.world.camera_controller
			for i: int in 16:
				var yaw: float = TAU*i/16
				var goal: Vector2 = start + Vector2(0,1).rotated(yaw)*7
				if VarendorNavigation.path_segment_is_clear(app.world.collision,start,goal):
					camera.yaw = yaw; camera.smoothed_yaw = yaw; break
			keyboard(app,KEY_W,true)
			await wait_ms(tree,900)
			checks["native_w_runs_unarmed_body"] = app.world.player_motion.position_value.distance_to(start)>.5 and "run" in observer.clips.get("unarmed-run",[])
			keyboard(app,KEY_W,false)
			observer.stage = "stop"; observer.stop_clock = Time.get_ticks_msec()
			await wait_ms(tree,500)
			observer.stop_clock = 0
			var stopped: Array = observer.stop_samples.filter(func(value): return float(value.ms)>35)
			checks["key_release_stops_body_and_gait"] = not stopped.is_empty() and stopped.all(func(value): return float(value.speed)<.001 and value.state=="idle")
			var planar_drift: float = 0
			if not stopped.is_empty():
				var initial := Vector2(stopped[0].hips[0],stopped[0].hips[1])
				for sample: Dictionary in stopped: planar_drift = maxf(planar_drift,initial.distance_to(Vector2(sample.hips[0],sample.hips[1])))
			checks["stopped_rig_has_no_planar_hip_slide"] = planar_drift<.000001
			measurements["stop_hip_drift_m"] = planar_drift
			observer.stage = "jump"
			keyboard(app,KEY_SPACE,true,true); keyboard(app,KEY_SPACE,false,true)
			checks["jump_reaches_airborne_gameplay_state"] = await until(app,func(): return not app.world.player_motion.grounded,2000)
			checks["jump_lands_on_existing_ground"] = await until(app,func(): return app.world.player_motion.grounded,2500)
			await wait_ms(tree,200)
			checks["jump_renders_imported_air_and_landing_clips"] = "jump_air" in observer.clips.get("jump",[]) and "jump_land" in observer.clips.get("jump",[])
			observer.recording = false
			observer.stage = "wardrobe"
			checks["equip_closed_helmet_round_trip"] = await equip(app,"fallen_helm","head","helmet_closed")
			checks["closed_helmet_masks_head"] = adapter.meshes.FK_head_helmet.visible and not adapter.meshes.FK_body_head.visible
			captures.append(await capture(app,"knight-closed",true))
			checks["replace_with_open_helmet_round_trip"] = await equip(app,"fallen_helm_open","head","helmet_open")
			checks["open_helmet_has_distinct_geometry_and_visible_face"] = adapter.meshes.FK_head_open_helmet.visible and not adapter.meshes.FK_head_helmet.visible and adapter.meshes.FK_body_head.visible and adapter.meshes.FK_head_open_helmet.mesh != adapter.meshes.FK_head_helmet.mesh
			captures.append(await capture(app,"knight-open",true))
			checks["unequip_head_restores_hair"] = await unequip(app,"head","helmet_open") and adapter.meshes.FK_human_hair.visible
			for entry: Array in [["militia_plate","chest","armor_chest"],["wolf_gloves","gloves","armor_gloves"],["grave_boots","boots","armor_boots"],["ash_belt","belt","armor_belt"],["wardens_blade","weapon","sword"]]:
				checks["equip_"+str(entry[1])+"_round_trip"] = await equip(app,entry[0],entry[1],entry[2])
			checks["full_gear_hides_covered_body_and_shows_sword"] = not adapter.meshes.FK_starter_pants.visible and not adapter.meshes.FK_body_torso.visible and not adapter.meshes.FK_body_hands.visible and not adapter.meshes.FK_body_feet.visible and actor.get_meta("knight_weapon_equipped",false)
			checks["equipment_never_rescales_or_reoffsets_actor"] = (actor.get_meta("base_visual") as Transform3D).is_equal_approx(base) and (actor.get_meta("visual") as Node3D).scale.is_equal_approx(base.basis.get_scale())
			captures.append(await capture(app,"knight-equipped",true))
			for entry: Array in [["chest","armor_chest"],["gloves","armor_gloves"],["boots","armor_boots"],["belt","armor_belt"],["weapon","sword"]]:
				checks["unequip_"+str(entry[0])+"_round_trip"] = await unequip(app,entry[0],entry[1])
			checks["removing_every_item_restores_complete_starter"] = adapter.loadout.is_empty() and adapter.meshes.FK_starter_pants.visible and adapter.meshes.FK_body_torso.visible and adapter.meshes.FK_body_hands.visible and adapter.meshes.FK_body_feet.visible
			for entry: Array in [["fallen_helm_open","head","helmet_open"],["militia_plate","chest","armor_chest"],["wolf_gloves","gloves","armor_gloves"],["grave_boots","boots","armor_boots"],["ash_belt","belt","armor_belt"],["wardens_blade","weapon","sword"]]:
				checks["reequip_"+str(entry[1])+"_round_trip"] = await equip(app,entry[0],entry[1],entry[2])
			checks["inventory_journal_cleared"] = app.net.read_private_json(app.net.pending_path()).is_empty()
			var target: String = ""
			var distance: float = INF
			for monster: Dictionary in app.world.current_snapshot.get("monsters",[]):
				if not monster.alive or not app.world.actors.has(str(monster.uid)): continue
				var d: float = Vector2(monster.x,monster.z).distance_to(app.world.player_motion.position_value)
				if d < distance: distance = d; target = str(monster.uid)
			checks["disposable_live_monster_available"] = not target.is_empty()
			if not target.is_empty():
				app.world.targeting.select(target)
				observer.stage = "single-attack"; observer.recording = checks.native_render
				app.picked(target)
				checks["single_attack_approach_reaches_real_attack"] = await until(app,func(): return observer.events.any(func(e): return e.qa_stage=="single-attack" and e.kind=="attack" and str(e.actor)==app.world.hero_id),9000)
				await wait_ms(tree,2200)
				var singles: Array = observer.events.filter(func(e): return e.qa_stage=="single-attack" and e.kind=="attack" and str(e.actor)==app.world.hero_id)
				checks["single_click_does_not_repeat_server_attack"] = singles.size()==1 and not bool(app.net.hero.get("autoAttack",false))
				observer.stage = "autoattack"
				app.activate("attack")
				checks["one_autoattack_activation_repeats_six_server_attacks"] = await until(app,func(): return observer.events.filter(func(e): return e.qa_stage=="autoattack" and e.kind=="attack" and str(e.actor)==app.world.hero_id and e.get("skill")==null).size()>=6,16000)
				await wait_ms(tree,100)
				var auto_clips: Array = observer.attacks.filter(func(e): return e.stage=="autoattack" and e.skill<0).map(func(e): return e.clip)
				measurements["live_autoattack_clips"] = auto_clips
				checks["real_autoattack_visits_all_five_combo_clips"] = ["combo_01","combo_02","combo_03","combo_04","combo_05"].all(func(clip): return clip in auto_clips)
				checks["autoattack_keeps_selected_target"] = bool(app.net.hero.get("autoAttack",false)) and str(app.net.hero.get("target",""))==target
				app.net.intent({"type":"cancel"})
				await until(app,func(): return not bool(app.net.hero.get("autoAttack",false)),3000)
				for index: int in 4:
					if float(app.net.hero.mp)<float(app.data.classes.knight.skills[index].cost):
						app.activate("ether"); await wait_ms(tree,400)
					observer.stage = "skill-%d" % index
					app.world.targeting.select(target)
					app.activate("skill:%d" % index)
					checks["skill_%d_server_effect" % index] = await until(app,func(): return observer.events.any(func(e): return e.qa_stage=="skill-%d"%index and str(e.get("actor",""))==app.world.hero_id and e.get("skill",-1)==index and e.kind in ["attack","buff"]),5000)
					await wait_ms(tree,350)
					var expected: String = ["sword_attack_heavy","block","sword_attack","cast_release"][index]
					checks["skill_%d_real_animation" % index] = expected in observer.clips.get("skill-%d" % index,[])
				checks["guard_buff_applies_without_cast_delay"] = float(app.net.hero.buffs.get("guard",0))>float(app.net.last_time)
				checks["normal_monster_retaliation_reaches_player"] = observer.events.any(func(e): return e.kind=="hit" and str(e.get("target",""))==app.world.hero_id)
				checks["knight_survives_fixture_review"] = not bool(app.net.hero.dead)
				captures.append(await capture(app,"knight-gameplay"))
			observer.recording = false
	measurements["observed_animation_clips"] = observer.clips
	measurements["live_presentation_attacks"] = observer.attacks
	measurements["live_server_events"] = observer.events
	measurements["recorded_frames"] = observer.captured
	measurements["frame_capture_note"] = "Actual game render captures; readback is diagnostic overhead, not performance evidence."
	checks["gameplay_screenshots_saved"] = captures.filter(func(path): return not path.is_empty()).size()>=4 if checks.native_render else true
	var success: bool = true
	for name: String in checks:
		if name != "native_render" and checks[name] is bool and not checks[name]: success = false
	var report := {"ok":success,"scope":"knight-integration","checks":checks,"measurements":measurements,"captures":captures,"display":DisplayServer.get_name(),"godot":Engine.get_version_info().string,"notes":"Actual main world, input, HTTP/SSE and authoritative inventory/attack events on an isolated beta save. Fixture monster HP is prolonged for combo observation; combat code, timings, damage formulas, world graphics and weather are unchanged. Headless validates behavior only; screenshots require a renderer."}
	app.net.save_private_json(app.qa_path,report)
	print("VARENDOR_NATIVE_QA "+JSON.stringify(report))
	if checks.native_render and RenderingServer.frame_post_draw.is_connected(observer.after_draw): RenderingServer.frame_post_draw.disconnect(observer.after_draw)
	app.world.event_presented.disconnect(observer.event)
	observer.queue_free()
	app.net.set_process(false); app.world.stop_audio()
	await app.net.request("/api/disconnect",{})
	app.net.stop_input_transport()
	# Preserve the accepted native-render shutdown ordering: release scene and
	# coroutine-local model references while RenderingServer is still alive.
	app.queue_free()
	tree.create_timer(.4).timeout.connect(func(): tree.quit(0 if success else 2))
