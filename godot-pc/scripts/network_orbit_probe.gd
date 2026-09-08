extends SceneTree

# The receiver measures wall time independently of this scene's frame rate.
# Main gameplay methods are exercised: pressed-key input after frame physics,
# then camera orbit/update at render frequency and the real network input FIFO.
class ProbeNetwork extends VarendorNetwork:
	func intent(value: Dictionary) -> void:
		var stamped: Dictionary = value.duplicate(true)
		stamped.probe_sent_ms = Time.get_unix_time_from_system() * 1000.0
		super.intent(stamped)

class OrbitDriver extends Node:
	var world: VarendorWorld
	var input: VarendorPlayerInput
	var client: VarendorNetwork
	var ticks: int = 0
	var released: bool = false
	var maximum_queue: int = 0
	var render_poll_count: int = 0
	var first_render_usec: int = 0
	var last_render_usec: int = 0
	func _physics_process(_delta: float) -> void:
		ticks += 1
	func _process(delta: float) -> void:
		render_poll_count += 1
		last_render_usec = Time.get_ticks_usec()
		if first_render_usec == 0: first_render_usec = last_render_usec
		# Match main._process: sample this frame's keys after catch-up physics
		# and before the camera/world render. Synthetic burst mode stays 60 Hz.
		if ticks >= 120 and not released:
			var release: InputEventKey = InputEventKey.new()
			release.physical_keycode = KEY_W
			input.handle_keyboard(release, true)
			released = true
		input.poll(delta, true)
		maximum_queue = maxi(maximum_queue, client.input_queue.size())
		if not released: world.camera_controller.orbit(Vector2(-180.0 * delta, 0))
		world.camera_controller.update_pose(delta, Vector3.ZERO)

func _initialize() -> void: call_deferred("run")

func run() -> void:
	# Headless Godot otherwise sleeps 6900 us even without low-usage mode,
	# silently limiting an "unlimited" test to ~144 FPS. Only this QA process
	# removes that idle sleep; explicit --max-fps and game settings are intact.
	OS.low_processor_usage_mode_sleep_usec = 0
	var args: Dictionary = {}
	for arg: String in OS.get_cmdline_user_args():
		if "=" in arg: args[arg.get_slice("=",0)] = arg.substr(arg.find("=")+1)
	var client: VarendorNetwork = ProbeNetwork.new() if not args.has("--transport-probe-legacy") else load(args["--transport-probe-legacy"]).new()
	root.add_child(client)
	client.set_process(false)
	client.server_url = args.get("--transport-probe-url", "http://127.0.0.1:4185")
	client.connected = true
	client.hero = {"generation":1}
	var errors: Array = []
	var reserved: Array = []
	client.intent_rejected.connect(func(_value: Dictionary, sequence: int, error: String): errors.append({"sequence":sequence,"error":error}))
	client.intent_reserved.connect(func(value: Dictionary, sequence: int): reserved.append({"sequence":sequence,"direction":[value.get("x",0),value.get("z",0)]}))
	# Load/compile time precedes playable input. Drain startup catch-up before
	# measuring a stated 60 Hz cadence; first-game-frame catch-up has separate
	# full-game stopping coverage. The delivery bounds below remain unchanged.
	var ready_at: int = Time.get_ticks_msec() + 250
	while Time.get_ticks_msec() < ready_at: await process_frame
	var scenario: String = args.get("--transport-probe-scenario", "orbit")
	var maximum_queue: int = 0
	var release_ms: float = 0
	var render_metrics: Dictionary = {}
	if scenario == "orbit":
		var world: VarendorWorld = VarendorWorld.new()
		world.collision.setup([])
		var camera: Camera3D = Camera3D.new()
		root.add_child(camera)
		world.camera_controller.setup(camera,world.collision,func(_x: float,_z: float): return 0.0)
		var input: VarendorPlayerInput = VarendorPlayerInput.new()
		input.setup(world, client)
		for action: StringName in VarendorPlayerInput.MOVE_ACTIONS:
			if not InputMap.has_action(action): InputMap.add_action(action)
		var press: InputEventKey = InputEventKey.new()
		press.physical_keycode = KEY_W
		InputMap.action_add_event("move_forward",press)
		press.pressed = true
		input.handle_keyboard(press,true)
		var driver: OrbitDriver = OrbitDriver.new()
		driver.world = world
		driver.input = input
		driver.client = client
		root.add_child(driver)
		while not driver.released: await process_frame
		release_ms = Time.get_unix_time_from_system() * 1000.0
		maximum_queue = driver.maximum_queue
		var duration_ms: float = float(driver.last_render_usec-driver.first_render_usec)/1000.0
		render_metrics = {"poll_count":driver.render_poll_count,"duration_ms":duration_ms,
			"observed_fps":float(driver.render_poll_count-1)*1000.0/maxf(1.0,duration_ms),"requested_max_fps":Engine.max_fps}
		driver.free()
		world.camera_controller.free()
		world.free()
		camera.free()
	elif scenario == "physics-burst":
		for tick: int in range(120):
			await physics_frame
			var angle: float = tick * .012
			client.intent({"type":"direction","x":cos(angle),"z":sin(angle)})
			maximum_queue = maxi(maximum_queue,client.input_queue.size())
		client.intent({"type":"direction","x":0.0,"z":0.0})
		release_ms = Time.get_unix_time_from_system() * 1000.0
	else:
		# Cancel while the old connection is actively waiting for its response,
		# not merely while idle. New input must not inherit the old FIFO/error.
		client.intent({"type":"direction","x":1.0,"z":0.0,"probe_delay_ms":800})
		var warm_deadline: int = Time.get_ticks_msec() + 250
		while Time.get_ticks_msec() < warm_deadline: await process_frame
		var before_stop: int = Time.get_ticks_msec()
		client.end_session()
		maximum_queue = Time.get_ticks_msec() - before_stop
		client.connected = true
		client.hero = {"generation":2}
		client.intent({"type":"direction","x":0.0,"z":0.0})
		release_ms = Time.get_unix_time_from_system() * 1000.0
	while client.input_busy: await process_frame
	if scenario == "lifecycle": await create_timer(.9).timeout
	var report: Dictionary = {"scenario":scenario,"reserved":reserved,"maximum_queue":maximum_queue,"stop_ack_ms":Time.get_unix_time_from_system()*1000.0-release_ms,"errors":errors,"render_metrics":render_metrics}
	client.end_session()
	client.free()
	print("VARENDOR_ORBIT_PROBE ",JSON.stringify(report))
	quit(1 if not errors.is_empty() else 0)
