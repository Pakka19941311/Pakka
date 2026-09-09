extends Node3D
## Standalone review only. The clock below emulates already-authorized strikes.
## It neither imports nor modifies the game's combat/inventory systems.

const FULL: Array[String] = ["helmet_closed", "armor_chest", "armor_gloves", "armor_boots", "armor_belt", "sword"]
var visual: KnightAssetVisual
var selected_target := false
var running := false
var review_time := 0.0
var attack_period := 1.0
var strike_ordinal := 0
var clip_time := 0.0
var current_clip := "idle"
var status: Label
var failures: Array[String] = []
var checks: Array[String] = []

func _ready() -> void:
	visual = KnightAssetVisual.new()
	add_child(visual)
	visual.initialize()
	if "--verify" in OS.get_cmdline_user_args():
		await get_tree().process_frame
		await _verify()
		return
	_make_stage()
	_make_ui()

func _process(delta: float) -> void:
	if not is_instance_valid(status):
		return
	if running and selected_target:
		review_time += delta
		strike_ordinal = int(floor(review_time / attack_period))
		visual.present_strike(strike_ordinal, fmod(review_time, attack_period) / attack_period)
		status.text = "AUTO / selected dummy   |   strike %d   |   clip %d/5   |   period %.2fs\nPreview clock only. No damage or game balance changes." % [strike_ordinal + 1, posmod(strike_ordinal, 5) + 1, attack_period]
	else:
		clip_time += delta
		var length := visual.player.get_animation(visual.clips[current_clip]).length
		visual.present_clip(current_clip, fmod(clip_time, length) / length)
		status.text = "Preview: %s   |   armor: %s" % [current_clip, ", ".join(visual.loadout)]

func _make_stage() -> void:
	var camera := Camera3D.new()
	add_child(camera)
	camera.position = Vector3(3.0, 2.0, 4.2)
	camera.look_at(Vector3(0, 1.0, 0))
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 4.0
	camera.current = true
	var key := DirectionalLight3D.new()
	add_child(key)
	key.rotation_degrees = Vector3(-40, -35, 0)
	key.light_energy = 1.3
	var fill := DirectionalLight3D.new()
	add_child(fill)
	fill.rotation_degrees = Vector3(-20, 145, 0)
	fill.light_energy = 0.65
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color(0.55, 0.6, 0.7)
	env.environment.ambient_light_energy = 0.55
	add_child(env)
	var floor_mesh := MeshInstance3D.new()
	floor_mesh.mesh = PlaneMesh.new()
	floor_mesh.mesh.size = Vector2(8, 8)
	add_child(floor_mesh)
	var dummy := MeshInstance3D.new()
	dummy.name = "SelectedReviewTarget"
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.18
	capsule.height = 1.4
	dummy.mesh = capsule
	dummy.position = Vector3(-0.45, 0.7, 0.95)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.23, 0.39, 0.33)
	dummy.material_override = mat
	add_child(dummy)

func _button(parent: Node, text: String, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.pressed.connect(callback)
	parent.add_child(button)

func _make_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var panel := VBoxContainer.new()
	panel.position = Vector2(16, 16)
	layer.add_child(panel)
	var title := Label.new()
	title.text = "VARENDOR / ISOLATED KNIGHT ASSET REVIEW"
	panel.add_child(title)
	var equipment := HBoxContainer.new()
	panel.add_child(equipment)
	_button(equipment, "Starter / no armor", func(): visual.set_loadout([]))
	_button(equipment, "Full armor", func(): visual.set_loadout(FULL))
	_button(equipment, "Open helmet", func(): _head("helmet_open"))
	_button(equipment, "Closed helmet", func(): _head("helmet_closed"))
	_button(equipment, "No helmet", func(): _head(""))
	var parts := HBoxContainer.new()
	panel.add_child(parts)
	for item in ["armor_chest", "armor_gloves", "armor_boots", "armor_belt", "sword"]:
		_button(parts, "Toggle " + item.trim_prefix("armor_"), func(): _toggle_item(item))
	var motions := HBoxContainer.new()
	panel.add_child(motions)
	for clip in ["idle", "run", "run_weapon", "cast_loop", "hit", "jump_start"]:
		_button(motions, clip, func(): running = false; current_clip = clip; clip_time = 0.0)
	var attacks := HBoxContainer.new()
	panel.add_child(attacks)
	_button(attacks, "Select dummy + AUTO", func(): selected_target = true; running = true; review_time = 0.0; visual.set_loadout(FULL))
	_button(attacks, "Stop / clear target", func(): running = false; selected_target = false; current_clip = "idle_weapon")
	var speed := SpinBox.new()
	speed.min_value = 0.4
	speed.max_value = 3.0
	speed.step = 0.05
	speed.value = attack_period
	speed.suffix = "s / review strike"
	speed.value_changed.connect(func(value): attack_period = value; review_time = 0.0)
	attacks.add_child(speed)
	status = Label.new()
	panel.add_child(status)

func _head(id: String) -> void:
	var ids := visual.loadout.duplicate()
	ids.erase("helmet_closed")
	ids.erase("helmet_open")
	if not id.is_empty():
		ids.append(id)
	visual.set_loadout(ids)

func _toggle_item(id: String) -> void:
	var ids := visual.loadout.duplicate()
	if id in ids:
		ids.erase(id)
	else:
		ids.append(id)
	visual.set_loadout(ids)

func _check(condition: bool, description: String) -> void:
	if condition:
		checks.append(description)
	else:
		failures.append(description)
		push_error(description)

func _pose() -> Array[Quaternion]:
	var poses: Array[Quaternion] = []
	for i in visual.skeleton.get_bone_count():
		poses.append(visual.skeleton.get_bone_pose_rotation(i))
	return poses

func _verify() -> void:
	_check(visual.skeleton.get_bone_count() == 56, "56 imported bones")
	_check(visual.clips.size() == 29, "29 imported animations, including five combo clips")
	_check(visual.loadout.is_empty() and visual.meshes.FK_starter_pants.visible, "Default starter wears pants and no equipment")
	for item in visual.manifest.items:
		for mesh_name in visual.manifest.items[item]:
			_check(visual.meshes.has(mesh_name), "Imported equipment mesh: " + mesh_name)
	for mesh in visual.meshes.values():
		_check(mesh.skin != null and mesh.get_node_or_null(mesh.skeleton) is Skeleton3D, "Valid skin binding: " + String(mesh.name))
	visual.set_loadout(FULL)
	_check(visual.meshes.FK_head_helmet.visible and not visual.meshes.FK_head_open_helmet.visible, "Closed helmet exclusive")
	_check(not visual.meshes.FK_body_torso.visible and not visual.meshes.FK_starter_pants.visible, "Covered body masked with chest equipped")
	_head("helmet_open")
	_check(visual.meshes.FK_head_open_helmet.visible and not visual.meshes.FK_head_helmet.visible and visual.meshes.FK_body_head.visible, "Open helmet replaces closed and reveals face")
	visual.set_loadout([])
	_check(visual.meshes.FK_body_torso.visible and visual.meshes.FK_body_hands.visible and visual.meshes.FK_body_feet.visible and visual.meshes.FK_human_hair.visible, "Removing equipment restores uncovered body")
	var max_boundary_error := 0.0
	var min_motion := 1000.0
	for i in 5:
		visual.present_strike(i, 0.1)
		var a := _pose()
		visual.present_strike(i, 0.65)
		var b := _pose()
		var motion := 0.0
		for j in a.size():
			motion = maxf(motion, a[j].angle_to(b[j]))
		min_motion = minf(min_motion, motion)
		visual.present_strike(i, 1.0)
		a = _pose()
		visual.present_strike(i + 1, 0.0)
		b = _pose()
		for j in a.size():
			max_boundary_error = maxf(max_boundary_error, a[j].angle_to(b[j]))
	_check(min_motion > 0.2, "Every combo segment animates the imported skeleton")
	_check(max_boundary_error < 0.015, "All five combo boundaries match, including 5 to 1")
	var forbidden_tracks := 0
	for key in visual.clips.values():
		var animation := visual.player.get_animation(key)
		for track in animation.get_track_count():
			if animation.track_get_type(track) == Animation.TYPE_METHOD:
				forbidden_tracks += 1
	_check(forbidden_tracks == 0, "No animation method callbacks / no authored damage")
	for count in [1, 3, 5, 10]:
		for i in count:
			visual.present_strike(i, 0.5)
		_check(String(visual.player.current_animation).ends_with("combo_%02d" % (posmod(count - 1, 5) + 1)), "Continuous sequence of %d authorized strikes" % count)
	# Exercise the actual review update: one start continues past a five-hit chain.
	status = Label.new()
	add_child(status)
	var pacing_samples: Array[Dictionary] = []
	attack_period = 0.75
	for hz in [30, 60, 120]:
		selected_target = true
		running = true
		review_time = 0.0
		for step in int(6.25 * hz):
			_process(1.0 / hz)
		_check(strike_ordinal == 8 and selected_target, "One AUTO start continues through nine strikes at %d FPS" % hz)
		pacing_samples.append({"hz": hz, "ordinal": strike_ordinal, "phase": fmod(review_time, attack_period) / attack_period})
	var phase_range: float = absf(pacing_samples[0].phase - pacing_samples[2].phase)
	_check(phase_range < (1.0 / 30.0) / attack_period + 0.00001, "Preview playback varies by at most one 30Hz frame across 30/60/120 FPS")
	selected_target = false
	var before_stop := review_time
	_process(0.25)
	_check(review_time == before_stop, "Clearing selected target stops preview autoattack clock")
	status.queue_free()
	var report := {"engine": Engine.get_version_info(), "mode": "native headless import and scene execution; no GPU visual claim", "checks": checks, "failures": failures, "max_boundary_angle_radians": max_boundary_error, "minimum_segment_motion_radians": min_motion, "game_systems_touched": false, "preview_pacing": pacing_samples}
	DirAccess.make_dir_recursive_absolute("res://evidence")
	var file := FileAccess.open("res://evidence/native_verify.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "\t"))
	file.close()
	print("KNIGHT_NATIVE_REVIEW ", JSON.stringify(report))
	get_tree().quit(0 if failures.is_empty() else 1)
