extends SceneTree
const Loot = preload("res://scripts/ground_loot.gd")
const Main = preload("res://scripts/main.gd")

class FakeNetwork extends Node:
	var hero: Dictionary = {"dead":false,"spaceId":"surface","lootMode":"ground"}
	var command_busy: bool = false
	var connected: bool = true
	var commands: Array = []
	func command(value: Dictionary) -> void:
		commands.append(value.duplicate(true))
		if value.type == "lootMode": hero.lootMode = value.mode

class FakeWorld extends Node3D:
	signal snapshot_presented(snapshot: Dictionary)
	var space_loading: bool = false
	var hero_position: Vector3 = Vector3.ZERO
	func point(x: float,z: float,offset: float = 0.0) -> Vector3: return Vector3(x,offset,-z)

class Fixture extends Node:
	var net: FakeNetwork = FakeNetwork.new()
	var world: FakeWorld = FakeWorld.new()
	var ui: Control = Control.new()
	var startup_complete: bool = true
	var active_dialog: Control
	var notices: Array = []
	func label(text: String,font_size: int) -> Label:
		var result: Label = Label.new()
		result.text = text
		result.add_theme_font_size_override("font_size",font_size)
		return result
	func wrapped_label(text: String,font_size: int) -> Label: return label(text,font_size)
	func notice(text: String) -> void: notices.append(text)

class InputFixture extends Main:
	func _ready() -> void: set_process(false)

class PickupCapture extends Node3D:
	var calls: int = 0
	func pickup() -> void: calls += 1

func _initialize() -> void: call_deferred("run")

func run() -> void:
	var output: String = ""
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--loot-qa-output="): output = argument.trim_prefix("--loot-qa-output=")
	var app: Fixture = Fixture.new()
	root.add_child(app)
	app.add_child(app.net)
	app.add_child(app.world)
	app.add_child(app.ui)
	app.ui.size = root.get_visible_rect().size
	var loot = Loot.new()
	app.world.add_child(loot)
	loot.setup(app)
	var rows: Array = [
		{"id":"loot:one","x":0.0,"z":1.4,"available":true,"gold":120,"itemCount":3},
		{"id":"loot:two","x":1.6,"z":3.0,"available":false,"gold":30,"itemCount":1},
		{"id":"loot:three","x":-1.7,"z":2.8,"available":false,"gold":90,"itemCount":4}]
	loot.present({"character":app.net.hero,"groundLoot":rows})
	loot._process(.1)
	var checks: Dictionary = {"mana_released_E":int(Main.DEFAULT_BINDINGS.ether)==0,
		"three_visible_chests":loot.chests.multimesh.visible_instance_count==3,
		"nearest_server_eligible_chest":loot.nearest_id=="loot:one",
		"E_hint":loot.hint.visible and "[E]" in loot.hint.text,
		"shared_draw_batches":loot.get_child_count()==2,
		"compact_mesh":loot.chests.multimesh.mesh.get_aabb().size.x<1.0}
	var old_pose: Transform3D = loot.chests.multimesh.get_instance_transform(0)
	loot._process(.4)
	checks["loop_animation"] = not old_pose.is_equal_approx(loot.chests.multimesh.get_instance_transform(0))
	await loot.pickup()
	checks["pickup_sends_id_only"] = app.net.commands==[{"type":"pickup","lootId":"loot:one"}]
	app.net.command_busy = true
	await loot.pickup()
	checks["no_duplicate_while_pending"] = app.net.commands.size()==1
	app.net.command_busy = false
	var settings: VBoxContainer = VBoxContainer.new()
	app.ui.add_child(settings)
	loot.add_mode_setting(settings)
	var toggle: CheckButton = settings.get_node("AutoLootSetting")
	toggle.button_pressed = true
	await process_frame
	checks["mode_toggle_uses_server_command"] = app.net.commands.back()=={"type":"lootMode","mode":"auto"} and toggle.button_pressed
	settings.queue_free()
	app.world.space_loading = true
	loot._process(.016)
	checks["transition_hides_loot"] = not loot.visible and not loot.hint.visible and loot.nearest_id.is_empty()
	var input_app: InputFixture = InputFixture.new()
	input_app.startup_complete = true
	input_app.world = preload("res://scripts/world.gd").new()
	input_app.net = preload("res://scripts/network.gd").new()
	input_app.player_input.world = input_app.world
	input_app.player_input.network = input_app.net
	input_app.ground_loot.free()
	var capture: PickupCapture = PickupCapture.new()
	input_app.ground_loot = capture
	root.add_child(input_app)
	var press: InputEventKey = InputEventKey.new()
	press.physical_keycode = KEY_E
	press.keycode = 0x423 # Cyrillic У: the same physical key on a Russian layout.
	press.pressed = true
	input_app._unhandled_input(press)
	checks["physical_E_independent_of_layout"] = capture.calls==1
	press.echo = true
	input_app._unhandled_input(press)
	checks["held_E_does_not_repeat"] = capture.calls==1
	press.echo = false
	var edit: LineEdit = LineEdit.new()
	app.ui.add_child(edit)
	edit.grab_focus()
	await process_frame
	input_app._unhandled_input(press)
	checks["quantity_and_search_focus_ignore_E"] = capture.calls==1
	edit.release_focus()
	edit.queue_free()
	var chat: TextEdit = TextEdit.new()
	app.ui.add_child(chat)
	chat.grab_focus()
	await process_frame
	input_app._unhandled_input(press)
	checks["chat_focus_ignores_E"] = capture.calls==1
	chat.release_focus()
	chat.queue_free()
	input_app.active_dialog = PanelContainer.new()
	input_app._unhandled_input(press)
	checks["modal_ignores_E"] = capture.calls==1
	input_app.active_dialog.free()
	press.shift_pressed = true
	input_app._unhandled_input(press)
	checks["modified_E_has_no_old_quick_action"] = capture.calls==1
	# This input-only fixture never runs World._ready(), which normally owns it.
	input_app.world.camera_controller.free()
	input_app.world.free()
	input_app.net.free()
	capture.free()
	input_app.queue_free()
	app.world.space_loading = false
	app.net.hero.lootMode = "ground"
	loot._process(.016)
	var ground: MeshInstance3D = MeshInstance3D.new()
	var plane: PlaneMesh = PlaneMesh.new()
	plane.size = Vector2(20,20)
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.albedo_color = Color("33423c")
	plane.material = material
	ground.mesh = plane
	app.world.add_child(ground)
	var environment: WorldEnvironment = WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("202c32")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("d6d9dc")
	environment.environment.ambient_light_energy = .7
	app.world.add_child(environment)
	var light: DirectionalLight3D = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45,-30,0)
	light.light_energy = 1.3
	app.world.add_child(light)
	var camera: Camera3D = Camera3D.new()
	app.world.add_child(camera)
	camera.position = Vector3(3.2,3.3,2.5)
	camera.look_at(Vector3(0,.12,-2.1))
	camera.fov = 43
	camera.make_current()
	for frame: int in range(30): await process_frame
	var rendered: bool = DisplayServer.get_name() != "headless"
	if rendered and not output.is_empty():
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(output+".png")
	checks["rendered"] = rendered
	print("GROUND_LOOT_ACCEPTANCE ",JSON.stringify(checks))
	if not output.is_empty():
		var file: FileAccess = FileAccess.open(output+".json",FileAccess.WRITE)
		file.store_string(JSON.stringify(checks,"  "))
	app.queue_free()
	await process_frame
	quit(0 if checks.values().all(func(value): return value) else 2)
