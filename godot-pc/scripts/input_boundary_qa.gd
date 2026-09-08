extends RefCounted

# Exercise the production app callbacks in Godot's frame order: input delivery,
# elapsed fixed-step catch-up, then _process before the world presents its pose.
# A release delivered now must not rewrite movement during the elapsed interval.
const STEP: float = 1.0 / 60.0
const SPEED: float = 5.89

class ImmediateNetwork extends VarendorNetwork:
	var transmitted: Array[Dictionary] = []
	func dispatch_input(entry: Dictionary) -> void:
		transmitted.append(entry.duplicate(true))
		input_completed(entry, {})

static func key_event(pressed: bool) -> InputEventKey:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = KEY_W
	event.pressed = pressed
	return event

static func make_fixture(app: Node, position: Vector2 = Vector2.ZERO) -> Node3D:
	# Attach an already-ready plain node before assigning the real app script.
	# This calls real callbacks without invoking _ready's UI/server/world boot.
	var fixture: Node3D = Node3D.new()
	app.add_child(fixture)
	fixture.set_script(app.get_script())
	fixture.set_process(false)
	fixture.set_physics_process(false)
	fixture.set_process_input(false)
	fixture.set_process_unhandled_input(false)
	var world: VarendorWorld = VarendorWorld.new()
	var client: ImmediateNetwork = ImmediateNetwork.new()
	var diagnostics: Label = Label.new()
	diagnostics.hide()
	fixture.world = world
	fixture.net = client
	fixture.diagnostics = diagnostics
	fixture.player_input.setup(world, client)
	client.connected = true
	client.hero = {"id":"qa:input-boundary","generation":1,"dead":false,"x":position.x,"z":position.y,"lastInputSequence":0}
	client.intent_reserved.connect(world.record_intent)
	client.intent_submitted.connect(world.submit_intent)
	world.collision.setup([])
	world.player_motion.reconcile({"time":1000,"character":{
		"id":"qa:input-boundary","generation":1,"x":position.x,"z":position.y,
		"yOffset":0.0,"yaw":0.0,"grounded":true,"dead":false,
		"lastInputSequence":0,"stats":{"speed":SPEED}}})
	return fixture

static func free_fixture(fixture: Node3D) -> void:
	var world: VarendorWorld = fixture.world
	var client: VarendorNetwork = fixture.net
	var diagnostics: Label = fixture.diagnostics
	if is_instance_valid(fixture.active_dialog): fixture.active_dialog.free()
	fixture.world = null
	fixture.net = null
	fixture.free()
	diagnostics.free()
	client.free()
	world.camera_controller.free()
	world.free()

static func scenario(app: Node, catch_up_ticks: int) -> Dictionary:
	var fixture: Node3D = make_fixture(app)
	var world: VarendorWorld = fixture.world
	var client: ImmediateNetwork = fixture.net
	fixture._input(key_event(true))
	fixture._process(STEP)
	for tick: int in range(90):
		fixture._physics_process(STEP)
		world._physics_process(STEP)
		fixture._process(STEP)
	var motor: VarendorPlayerMovement = world.player_motion
	var before: Vector2 = motor.position_value
	var start_clock: float = motor.clock_ms
	var running_speed: float = motor.actual_velocity.length()
	var sequence_before: int = client.sequence
	fixture._input(key_event(false))
	var moved_each_tick: bool = true
	for tick: int in range(catch_up_ticks):
		var previous: Vector2 = motor.position_value
		fixture._physics_process(STEP)
		world._physics_process(STEP)
		moved_each_tick = moved_each_tick and motor.position_value.distance_to(previous) > SPEED * STEP * .99
	var caught_up: Vector2 = motor.position_value
	var release_was_deferred: bool = client.sequence == sequence_before
	fixture._process(catch_up_ticks * STEP)
	var neutral_sequence: int = client.sequence
	var neutral: Dictionary = client.transmitted.back().value
	var commit_clock: float = float(motor.sent_inputs.get(neutral_sequence, -1))
	var stopped_at_commit: bool = motor.velocity.is_zero_approx() and motor.actual_velocity.is_zero_approx() and motor.input_mode == "idle"
	var stopped: Vector2 = motor.position_value
	var post_release_distance: float = 0.0
	for tick: int in range(8):
		var previous: Vector2 = motor.position_value
		fixture._physics_process(STEP)
		world._physics_process(STEP)
		fixture._process(STEP)
		post_release_distance += motor.position_value.distance_to(previous)
	var result: Dictionary = {
		"catch_up_ticks":catch_up_ticks,"running_speed_m_s":running_speed,
		"elapsed_held_distance_m":before.distance_to(caught_up),
		"expected_elapsed_held_distance_m":SPEED * STEP * catch_up_ticks,
		"release_was_deferred_until_process":release_was_deferred,
		"moved_during_every_elapsed_tick":moved_each_tick,
		"neutral_command_at_frame_boundary":neutral_sequence == sequence_before + 1 and neutral.type == "direction" and Vector2(neutral.x,neutral.z).is_zero_approx(),
		"neutral_clock_error_ms":absf(commit_clock - (start_clock + catch_up_ticks * STEP * 1000)),
		"stopped_at_commit":stopped_at_commit,
		"release_commit_position_jump_m":stopped.distance_to(caught_up),
		"distance_during_eight_stopped_ticks_m":post_release_distance}
	free_fixture(fixture)
	return result

static func npc_boundary(app: Node, key_action: String) -> Dictionary:
	var fixture: Node3D = make_fixture(app, Vector2(.3,-6.0))
	var world: VarendorWorld = fixture.world
	var client: ImmediateNetwork = fixture.net
	# Flat terrain and one real service actor isolate input/UI ordering from
	# the city layout. Service distance, ACK and cancellation remain production.
	world.terrain = {"columns":1,"rows":1,"width":100.0,"depth":100.0,"heights":[0.0,0.0,0.0,0.0],"platforms":[]}
	var service: Dictionary = VarendorNpcInteraction.SERVICES["npc:shop"]
	var actor: Node3D = Node3D.new()
	actor.position = world.point(service.x,service.z)
	world.add_child(actor)
	world.actors["npc:shop"] = actor
	var interaction: VarendorNpcInteraction = fixture.npc_interaction
	interaction.setup(world,client)
	var opened: Array[String] = []
	interaction.service_opened.connect(func(id: String):
		opened.append(id)
		# Opening any real service window makes main.text_focused() true.
		fixture.active_dialog = Window.new())
	interaction.begin("npc:shop")
	client.hero.lastInputSequence = client.sequence
	var sequence_before: int = client.sequence
	var awaiting_acknowledged_stop: bool = interaction.phase == "stopping" and interaction.pending_id == "npc:shop"
	if key_action != "neutral_release": fixture._input(key_event(true))
	if key_action != "held": fixture._input(key_event(false))
	for tick: int in range(4):
		fixture._physics_process(STEP)
		world._physics_process(STEP)
	var opened_during_catch_up: int = opened.size()
	fixture._process(4 * STEP)
	var committed: Dictionary = client.transmitted.back().value
	var manual_committed: bool = client.sequence == sequence_before + 1 and committed.type == "direction" and Vector2(committed.x,committed.z).length() > .99 and world.player_motion.input_mode == "manual"
	var tap_committed: bool = client.sequence == sequence_before + 1 and committed.type == "cancel" and world.player_motion.input_mode == "idle"
	fixture._physics_process(STEP)
	world._physics_process(STEP)
	var result: Dictionary = {
		"key_action":key_action,"fixture_waited_for_acknowledged_stop":awaiting_acknowledged_stop,
		"opened_during_catch_up":opened_during_catch_up,"opened_total":opened.size(),
		"manual_committed":manual_committed,"tap_committed":tap_committed,
		"pending_cleared":interaction.pending_id.is_empty(),"selection_retained":world.target_id == "npc:shop"}
	free_fixture(fixture)
	return result

static func run(app: Node) -> Dictionary:
	var checks: Dictionary = {}
	var observations: Array = []
	var temporary_actions: Array[StringName] = []
	var saved_events: Dictionary = {}
	var bindings: Dictionary = {"move_forward":KEY_W,"move_back":KEY_S,"move_left":KEY_A,"move_right":KEY_D}
	for action: StringName in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			temporary_actions.append(action)
		saved_events[action] = InputMap.action_get_events(action)
		InputMap.action_erase_events(action)
		var binding: InputEventKey = InputEventKey.new()
		binding.physical_keycode = bindings[action]
		InputMap.action_add_event(action, binding)
	for ticks: int in [1,2,4,8]:
		var result: Dictionary = scenario(app, ticks)
		observations.append(result)
		var prefix: String = "input_boundary_" + str(ticks) + "_catch_up_ticks"
		checks[prefix + "_preserve_elapsed_held_travel"] = result.running_speed_m_s > SPEED * .99 and result.moved_during_every_elapsed_tick and absf(result.elapsed_held_distance_m - result.expected_elapsed_held_distance_m) < .00001
		checks[prefix + "_reserve_neutral_after_catch_up"] = result.release_was_deferred_until_process and result.neutral_command_at_frame_boundary and result.neutral_clock_error_ms < .00001
		checks[prefix + "_stop_before_render_without_later_motion"] = result.stopped_at_commit and result.release_commit_position_jump_m < .00001 and result.distance_during_eight_stopped_ticks_m < .00001
	var npc_observations: Array = []
	for key_action: String in ["held","tap","neutral_release"]:
		var result: Dictionary = npc_boundary(app,key_action)
		npc_observations.append(result)
		if key_action == "neutral_release":
			checks["input_boundary_npc_neutral_release_keeps_service_opening"] = result.fixture_waited_for_acknowledged_stop and result.opened_during_catch_up == 1 and result.opened_total == 1 and result.pending_cleared and result.selection_retained
		else:
			checks["input_boundary_npc_"+key_action+"_cannot_open_before_manual_commit"] = result.fixture_waited_for_acknowledged_stop and result.opened_during_catch_up == 0 and result.opened_total == 0
			checks["input_boundary_npc_"+key_action+"_commits_input_and_cancels_service"] = result.pending_cleared and (result.manual_committed if key_action == "held" else result.tap_committed)
	for action: StringName in saved_events:
		InputMap.action_erase_events(action)
		for event: InputEvent in saved_events[action]: InputMap.action_add_event(action, event)
	for action: StringName in temporary_actions: InputMap.erase_action(action)
	checks["input_boundary_observations"] = observations
	checks["input_boundary_npc_observations"] = npc_observations
	return checks
