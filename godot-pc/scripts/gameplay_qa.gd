extends RefCounted

# Focused regressions for the rejected gameplay build. Actor/event checks use
# the real imported models in a separate world; the server fixture stays intact.
static func run(main: Node) -> Dictionary:
	var checks: Dictionary = {}
	var tree: SceneTree = main.get_tree()
	var live: VarendorWorld = main.world
	var anchors: Dictionary = {}
	for id: String in ["npc:shop", "npc:elder", "npc:smith", "npc:teleport"]:
		if live.actors.has(id):
			anchors[id] = live.actors[id].position
	var stable_npcs: bool = anchors.size() == 4
	var observed_snapshots: Dictionary = {}
	var deadline: int = Time.get_ticks_msec() + 650
	while Time.get_ticks_msec() < deadline:
		await tree.process_frame
		observed_snapshots[str(live.current_snapshot.get("time", 0))] = true
		for id: String in anchors:
			var actor: Node3D = live.actors[id]
			stable_npcs = stable_npcs and actor.position.distance_to(anchors[id]) < .001
			stable_npcs = stable_npcs and (actor.get_meta("previous") as Vector3).distance_to(anchors[id]) < .001
	checks["npc_anchors_stable_across_snapshots"] = stable_npcs and observed_snapshots.size() >= 3

	var probe: VarendorWorld = VarendorWorld.new()
	tree.root.add_child(probe)
	probe.set_process(false)
	probe.hide()
	probe.data = live.data
	probe.terrain = live.terrain
	probe.templates = live.templates.duplicate()
	probe.labels_layer = Control.new()
	probe.add_child(probe.labels_layer)
	probe.labels_layer.hide()
	probe.camera = Camera3D.new()
	probe.add_child(probe.camera)
	probe.camera.current = false
	probe.target_ring = MeshInstance3D.new()
	probe.add_child(probe.target_ring)
	probe.arrival_marker = MeshInstance3D.new()
	probe.add_child(probe.arrival_marker)
	var snapshot: Dictionary = live.current_snapshot.duplicate(true)
	snapshot.heroes = []
	snapshot.summons = []
	snapshot.events = []
	snapshot.monsters = []
	snapshot.character.id = "qa:gameplay:ranger"
	snapshot.character.dead = false
	snapshot.character.grounded = true
	snapshot.character.yOffset = 0
	snapshot.character.action = "idle"
	for id: String in probe.data.classes:
		if str(probe.data.classes[id].model) == "Ranger":
			snapshot.character.classId = id
	var fox_id: String = ""
	for id: String in probe.data.monsters:
		if str(probe.data.monsters[id].model) == "Fox":
			fox_id = id
			break
	checks["gameplay_fox_fixture_available"] = not fox_id.is_empty()
	if fox_id.is_empty():
		probe.queue_free()
		return checks
	snapshot.monsters = [{"uid":"qa:gameplay:fox", "id":fox_id, "x":snapshot.character.x + 4, "z":snapshot.character.z, "hp":100, "alive":true, "action":"idle"}]
	probe.apply_snapshot(snapshot)
	probe._process(1.0 / 60.0)
	var ranger: Node3D = probe.actors[probe.hero_id]
	var fox: Node3D = probe.actors["qa:gameplay:fox"]
	var ranger_player: AnimationPlayer = ranger.get_meta("player")
	snapshot.time += 100
	snapshot.events = [{"sequence":1, "kind":"attack", "actor":probe.hero_id, "target":"qa:gameplay:fox", "endsAt":snapshot.time + 600}]
	probe.apply_snapshot(snapshot)
	checks["ranger_attack_uses_bow_draw_not_idle"] = "bow_draw" in str(ranger_player.current_animation).to_lower() and "idle" not in str(ranger_player.current_animation).to_lower()
	snapshot.time += 100
	snapshot.events = [{"sequence":2, "kind":"release", "actor":probe.hero_id, "target":"qa:gameplay:fox", "effect":"arrow", "durationMs":280}]
	probe.apply_snapshot(snapshot)
	checks["ranger_release_uses_bow_shoot"] = "bow_shoot" in str(ranger_player.current_animation).to_lower()
	var projectile: Dictionary = probe.effects[-1]
	var start: Vector3 = projectile.node.position
	probe._process(.05)
	checks["arrow_visible_mesh_moves_toward_target"] = projectile.node.mesh is CylinderMesh and projectile.node.position.distance_to(start) > .1 and projectile.node.position.distance_to(projectile.end) < start.distance_to(projectile.end)
	snapshot.time += 100
	snapshot.events = [{"sequence":3, "kind":"hit", "actor":probe.hero_id, "target":"qa:gameplay:fox", "amount":12}]
	snapshot.monsters[0].hp = 88
	probe.apply_snapshot(snapshot)
	checks["impact_has_reaction_and_damage_text"] = float(fox.get_meta("hit_left", 0)) > 0 and not probe.floaters.is_empty() and probe.floaters[-1].node.text == "12"
	var fox_label: Label = fox.get_meta("screen_label")
	var near_font: int = fox_label.get_theme_font_size("font_size")
	probe.camera_distance = 30
	probe._process(.05)
	checks["nameplates_use_fixed_screen_font"] = near_font == 14 and fox_label.get_theme_font_size("font_size") == near_font and not (fox.get_meta("label") as Label3D).visible

	# A model with no death clip must fall, stop accepting hits immediately and
	# leave a corpse before fading. A later living snapshot must restore its pose.
	snapshot.time += 100
	snapshot.events = [{"sequence":4, "kind":"death", "actor":"qa:gameplay:fox"}]
	snapshot.monsters[0].alive = false
	snapshot.monsters[0].hp = 0
	probe.apply_snapshot(snapshot)
	checks["fox_death_immediately_disables_targeting"] = fox.get_meta("dead", false) and not fox.get_meta("pickable", true)
	var corpse_position: Vector3 = fox.position
	for index: int in range(30):
		probe._process(1.0 / 60.0)
	var visual: Node3D = fox.get_meta("visual")
	var base: Transform3D = fox.get_meta("base_visual")
	var tilt: float = visual.basis.y.normalized().angle_to(base.basis.y.normalized())
	checks["fox_without_death_clip_falls_and_leaves_corpse"] = tilt > 1 and fox.visible and fox.position.distance_to(corpse_position) < .001
	for index: int in range(140):
		probe._process(1.0 / 60.0)
	checks["corpse_removed_after_death_presentation"] = not fox.visible
	snapshot.time += 3000
	snapshot.events = []
	snapshot.monsters[0].alive = true
	snapshot.monsters[0].hp = 100
	probe.apply_snapshot(snapshot)
	checks["respawn_restores_pose_and_pickability"] = not fox.get_meta("dead", true) and fox.visible and fox.get_meta("pickable", false) and visual.transform.is_equal_approx(base)

	probe.record_intent({"type":"jump"}, 10001)
	var heights: Array[float] = []
	var double_jump_blocked: bool = true
	for index: int in range(60):
		if index > 0 and index % 6 == 0:
			var elapsed: float = float(index) / 60.0
			snapshot.time += 100
			snapshot.character.yOffset = maxf(0, 8.2 * elapsed - 11 * elapsed * elapsed)
			snapshot.character.grounded = elapsed >= .75
			snapshot.character.action = "idle" if snapshot.character.grounded else "jump"
			probe.apply_snapshot(snapshot)
		if index == 6:
			var velocity_before: float = probe.jump_velocity
			probe.record_intent({"type":"jump"}, 10002)
			double_jump_blocked = is_equal_approx(velocity_before, probe.jump_velocity)
		probe._process(1.0 / 60.0)
		heights.append(probe.hero_position.y - probe.height_at(probe.hero_position.x, -probe.hero_position.z))
	var smooth_ascent: bool = true
	for index: int in range(1, 18):
		var step: float = heights[index] - heights[index - 1]
		smooth_ascent = smooth_ascent and step > .01 and step < .15
	checks["jump_smooth_between_10hz_server_updates"] = smooth_ascent and heights.max() > 1.3 and heights.max() < 1.7
	checks["jump_rejects_second_jump"] = double_jump_blocked
	checks["jump_lands_without_stale_snapshot_bounce"] = not probe.jump_active and absf(heights[-1]) < .001 and heights.slice(45).max() < .01
	checks["jump_final_offset_m"] = heights[-1]
	checks["jump_post_landing_max_offset_m"] = heights.slice(45).max()
	probe.queue_free()
	await tree.process_frame

	# Verify actual container geometry after a layout frame: six complete bag
	# columns and three rows must fit, and expanding the quickbar stays on screen.
	var inventory_was_visible: bool = main.inventory_panel.visible
	var inventory_position: Vector2 = main.inventory_panel.position
	var was_full_quick: bool = main.full_quick
	main.inventory_panel.show()
	main.keep_inventory_visible()
	await tree.process_frame
	await tree.process_frame
	var viewport_bounds: Rect2 = Rect2(Vector2.ZERO, main.ui.size)
	var inventory_bounds: Rect2 = main.inventory_panel.get_global_rect()
	checks["inventory_fits_viewport"] = contains_rect(viewport_bounds, inventory_bounds)
	var bag: GridContainer = main.bag_slots[0].get_parent()
	var scroll: ScrollContainer = bag.get_parent()
	var scroll_before: int = scroll.scroll_vertical
	scroll.scroll_vertical = 0
	await tree.process_frame
	var scroll_bounds: Rect2 = scroll.get_global_rect()
	var three_rows_fit: bool = bag.columns == 6
	for index: int in range(18):
		three_rows_fit = three_rows_fit and contains_rect(scroll_bounds, main.bag_slots[index].get_global_rect())
	checks["inventory_six_columns_three_complete_visible_rows"] = three_rows_fit
	checks["inventory_slots_remain_compact"] = main.bag_slots[0].size.x <= 58 and main.bag_slots[0].size.y <= 58 and inventory_bounds.size.x <= 410
	var stat_bounds: Rect2 = Rect2()
	for id: String in main.stat_values:
		stat_bounds = stat_bounds.merge(main.stat_values[id].get_global_rect()) if stat_bounds.has_area() else main.stat_values[id].get_global_rect()
	var first_equipment: Control = main.equipment_slots["neck"]
	checks["inventory_stats_left_of_twelve_equipment_slots"] = main.stat_values.size() == 12 and main.equipment_slots.size() == 12 and stat_bounds.end.x <= first_equipment.global_position.x + 1
	var hp_panel: Control = main.hp.get_parent().get_parent()
	checks["compact_player_hud_fits_viewport"] = contains_rect(viewport_bounds, hp_panel.get_global_rect()) and hp_panel.size.x <= 320 and hp_panel.size.y <= 115
	for expanded: bool in [false, true]:
		main.full_quick = expanded
		main.refresh_quick()
		await tree.process_frame
		var quick_bounds: Rect2 = main.quick_panel_node.get_global_rect()
		var visible_slots: int = 0
		var slots_fit: bool = true
		for slot: Control in main.quick_buttons:
			if slot.visible:
				visible_slots += 1
				slots_fit = slots_fit and contains_rect(quick_bounds, slot.get_global_rect())
		checks["quickbar_" + ("four" if expanded else "two") + "_rows_fit_viewport"] = visible_slots == (32 if expanded else 16) and slots_fit and contains_rect(viewport_bounds, quick_bounds)
	main.full_quick = was_full_quick
	main.refresh_quick()
	scroll.scroll_vertical = scroll_before
	main.inventory_panel.position = inventory_position
	main.inventory_panel.visible = inventory_was_visible

	# Exercise window handlers/buttons rather than toggling their visibility.
	main.close_dialog()
	await tree.process_frame
	main.system_menu()
	var close_button: Button = find_button(main.active_dialog, "×")
	checks["system_menu_has_return_settings_profile_and_quit"] = find_button(main.active_dialog, "Вернуться в игру") != null and find_button(main.active_dialog, "Настройки") != null and find_button(main.active_dialog, "Сменить персонажа") != null and find_button(main.active_dialog, "Выйти из игры") != null
	if close_button != null:
		close_button.pressed.emit()
	checks["menu_visible_close_button_works"] = close_button != null and not is_instance_valid(main.active_dialog)
	await tree.process_frame
	for key: int in [KEY_ESCAPE, KEY_TAB]:
		main.system_menu()
		var event: InputEventKey = InputEventKey.new()
		event.physical_keycode = key
		event.pressed = true
		main.active_dialog.window_input.emit(event)
		checks["menu_closes_with_" + ("escape" if key == KEY_ESCAPE else "tab")] = not is_instance_valid(main.active_dialog)
		await tree.process_frame
	main.system_menu()
	main.system_menu()
	checks["system_menu_repeat_button_closes"] = not is_instance_valid(main.active_dialog)
	await tree.process_frame
	var before_display: Dictionary = {"display":main.game_settings.get("display", 0), "resolution":main.game_settings.get("resolution", 1)}
	main.controls_dialog()
	main.confirm_display(before_display)
	checks["display_confirmation_survives_settings_close"] = not main.display_before.is_empty() and is_instance_valid(main.active_dialog) and main.active_dialog.title == "Сохранить видеорежим?"
	main.active_dialog.close_requested.emit()
	checks["display_close_rolls_back_and_returns_to_game"] = main.display_before.is_empty() and not is_instance_valid(main.active_dialog) and main.game_settings.get("display") == before_display.display and main.game_settings.get("resolution") == before_display.resolution
	await tree.process_frame
	if DisplayServer.get_name() == "headless":
		checks["pointer_capture_restore_display_check"] = "skipped_headless"
	else:
		var original_pointer: Vector2i = DisplayServer.mouse_get_position()
		var original_yaw: float = live.camera_yaw
		var original_pitch: float = live.camera_pitch
		DisplayServer.warp_mouse(Vector2i(240, 190))
		await tree.process_frame
		var pointer_before: Vector2i = DisplayServer.mouse_get_position()
		var press: InputEventMouseButton = InputEventMouseButton.new()
		press.button_index = MOUSE_BUTTON_RIGHT
		press.pressed = true
		main._unhandled_input(press)
		checks["pointer_rmb_enters_capture"] = main.mouse_orbit and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
		var motion: InputEventMouseMotion = InputEventMouseMotion.new()
		motion.screen_relative = Vector2(38, 22)
		main._input(motion)
		press.pressed = false
		main._input(press)
		await tree.process_frame
		await tree.process_frame
		checks["pointer_rmb_restores_exact_previous_position"] = not main.mouse_orbit and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE and Vector2(DisplayServer.mouse_get_position()).distance_to(Vector2(pointer_before)) <= 1
		press.pressed = true
		main._unhandled_input(press)
		main._notification(MainLoop.NOTIFICATION_APPLICATION_FOCUS_OUT)
		checks["pointer_focus_loss_releases_capture"] = not main.mouse_orbit and not main.mouse_restore_valid and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE
		live.camera_yaw = original_yaw
		live.camera_pitch = original_pitch
		DisplayServer.warp_mouse(original_pointer - DisplayServer.window_get_position())
	return checks

static func find_button(root: Node, title: String) -> Button:
	if root == null:
		return null
	for child: Node in root.get_children():
		if child is Button and child.text == title:
			return child
		var found: Button = find_button(child, title)
		if found != null:
			return found
	return null

static func contains_rect(outer: Rect2, inner: Rect2) -> bool:
	return outer.grow(1).encloses(inner)
