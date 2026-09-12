extends SceneTree

# Actual production HTTP worker, input routing and prediction. The local test
# server delays ACKs; there is no game/save fixture and no replacement queue.
const Network = preload("res://scripts/network.gd")
const ReservationQA = preload("res://scripts/network_intent_qa.gd")
var client: Network
var world: VarendorWorld
var controls: VarendorPlayerInput
var checks: Dictionary = {}
var completions: Array[Dictionary] = []
var output: String
var max_pending: int = 0
var max_unsent: int = 0

func _initialize() -> void:
	call_deferred("run")

func snapshot(time: int, sequence: int, generation: int = 1, position: Vector2 = Vector2.ZERO) -> Dictionary:
	var value: Dictionary = ReservationQA.snapshot(time,sequence)
	value.character.id = "qa-input-backpressure"
	value.character.generation = generation
	value.character.x = position.x; value.character.z = position.y
	value.character.lastInputAt = time
	return value

func record(entry: Dictionary, response: Dictionary) -> void:
	completions.append({"entry":entry.duplicate(true),"response":response.duplicate(true),"wall_ms":Time.get_ticks_msec()})

func connect_recorder() -> void:
	if client.input_transport != null and not client.input_transport.completed.is_connected(record):
		client.input_transport.completed.connect(record,CONNECT_DEFERRED)

func drain(timeout_ms: int = 2500) -> bool:
	var deadline: int = Time.get_ticks_msec()+timeout_ms
	while client.input_busy and Time.get_ticks_msec() < deadline:
		await process_frame
	return not client.input_busy

func key(pressed: bool) -> void:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = KEY_W; event.pressed = pressed
	controls.handle_keyboard(event,true)

func run() -> void:
	var url: String = ""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--input-qa-url="): url = arg.trim_prefix("--input-qa-url=")
		if arg.begins_with("--input-qa-output="): output = arg.trim_prefix("--input-qa-output=")
	if url.is_empty() or output.is_empty(): push_error("Isolated QA URL/output required"); quit(2); return
	checks.merge(ReservationQA.run())
	checks.merge(await preload("res://scripts/dialog_lifecycle_qa.gd").run(self))
	checks.merge(await preload("res://scripts/network_qa.gd").run(self,snapshot(1000,0),output.get_base_dir()))
	client = Network.new(); root.add_child(client); client.set_process(false)
	client.server_url = url; client.bootstrap_path = output.get_base_dir().path_join("synthetic-bootstrap.json")
	world = VarendorWorld.new(); root.add_child(world); world.set_process(false); world.set_physics_process(false)
	world.collision.setup([])
	world.camera = Camera3D.new(); world.add_child(world.camera)
	world.add_child(world.camera_controller)
	world.camera_controller.setup(world.camera,world.collision,func(_x: float,_z: float): return 0.0)
	client.intent_reserved.connect(world.player_motion.sent)
	client.intent_submitted.connect(world.player_motion.submit)
	client.snapshot_received.connect(world.player_motion.reconcile)
	client.accept(snapshot(1000,0))
	controls = VarendorPlayerInput.new(); controls.setup(world,client); controls.poll(0,true)
	for action: String in ["move_forward","move_back","move_left","move_right"]:
		if not InputMap.has_action(action): InputMap.add_action(action)
	var binding: InputEventKey = InputEventKey.new(); binding.physical_keycode = KEY_W
	InputMap.action_add_event("move_forward",binding)
	var down: InputEventMouseButton = InputEventMouseButton.new()
	down.button_index = MOUSE_BUTTON_RIGHT; down.pressed = true; down.position = root.get_visible_rect().get_center()
	checks["right_mouse_capture_enters_production_controller"] = controls.mouse(down) and world.camera_controller.captured
	key(true)
	for tick: int in range(60):
		var motion: InputEventMouseMotion = InputEventMouseMotion.new(); motion.screen_relative = Vector2(2,0)
		# Headless has no OS capture. Exercise the same orbit method directly;
		# graphical acceptance still owns the actual cursor/viewport contract.
		if DisplayServer.get_name() == "headless": world.camera_controller.orbit(motion.screen_relative)
		else: world.camera_controller.handle_captured_input(motion)
		world.camera_controller.update_pose(1.0/60.0,Vector3(world.player_motion.position_value.x,0,-world.player_motion.position_value.y),0)
		controls.poll(1.0/60.0,true); world.player_motion.physics_step(1.0/60.0)
		connect_recorder(); max_pending = maxi(max_pending,client.input_queue.size())
		client.input_transport._mutex.lock()
		max_unsent = maxi(max_unsent,client.input_transport._queue.size())
		client.input_transport._mutex.unlock()
		await create_timer(1.0/60.0).timeout
	var release_at: int = Time.get_ticks_msec()
	key(false)
	var up: InputEventMouseButton = InputEventMouseButton.new(); up.button_index = MOUSE_BUTTON_RIGHT
	controls.release_buttons(up); world.camera_controller.handle_captured_input(up)
	controls.poll(1.0/60.0,true)
	checks["w_and_rmb_release_stop_prediction_before_ack"] = world.player_motion.input_direction.is_zero_approx() and not controls.right_down and not world.camera_controller.captured
	# Network bookkeeping may additionally contain a COMPLETED response whose
	# deferred callback has not run yet. Measure unsent worker entries directly.
	checks["held_direction_unsent_backlog_bounded_by_latest"] = max_unsent <= 1 and client.superseded_direction_count >= 30
	checks["release_drains_within_two_delayed_requests"] = await drain(600)
	var release_latency: int = Time.get_ticks_msec()-release_at
	checks["latest_release_reached_worker"] = not completions.is_empty() and completions[-1].entry.value.type == "direction" and Vector2(completions[-1].entry.value.x,completions[-1].entry.value.z).is_zero_approx()
	# One anchor is already in flight. Discrete actions must fence each preceding
	# held-state segment; only directions inside each segment may disappear.
	var phase_start: int = completions.size()
	client.intent({"type":"cancel"}); connect_recorder()
	for index: int in range(15): client.intent({"type":"direction","x":1,"z":0})
	client.intent({"type":"jump"})
	for index: int in range(15): client.intent({"type":"direction","x":0,"z":1})
	client.intent({"type":"attack","entityId":"synthetic-target","skill":null})
	client.intent({"type":"destination","x":4,"z":2})
	for index: int in range(15): client.intent({"type":"direction","x":-1,"z":0})
	client.intent({"type":"cancel"}); client.intent({"type":"direction","x":0,"z":0})
	checks["action_barriers_drain"] = await drain(2200)
	var types: Array = completions.slice(phase_start).map(func(row: Dictionary): return str(row.entry.value.type))
	checks["jump_attack_destination_cancel_keep_fifo_order"] = types == ["cancel","direction","jump","direction","attack","destination","direction","cancel","direction"]
	var latest: Dictionary = completions[-1].entry
	var rejected: Array[int] = []
	client.intent_rejected.connect(func(_v: Dictionary,sequence: int,_error: String): rejected.append(sequence))
	client.input_completed(latest,{"error":"duplicate synthetic completion"})
	checks["duplicate_completion_has_no_second_rejection"] = rejected.is_empty() and client.input_queue.is_empty()
	# A normal teleport command accepts a new generation while an old HTTP input
	# is pending. The old worker must stop and its delayed callbacks stay fenced.
	client.intent({"type":"direction","x":1,"z":0}); connect_recorder()
	var old_entry: Dictionary = client.input_queue[-1].duplicate(true)
	await client.command({"type":"teleport","destination":"synthetic-forest"})
	checks["teleport_resets_prediction_and_queued_generation"] = int(client.hero.generation) == 2 and world.player_motion.position_value == Vector2(40,-20) and world.player_motion.history.is_empty() and client.input_queue.is_empty()
	client.intent({"type":"direction","x":0,"z":0}); connect_recorder()
	var new_sequence: int = client.sequence
	client.input_completed(old_entry,{"error":"late old-generation error","transport_error":true})
	checks["old_generation_ack_cannot_clear_new_input_or_disconnect"] = client.connected and client.input_queue.size() == 1 and int(client.input_queue[0].sequence) == new_sequence and rejected.is_empty()
	checks["post_teleport_release_acknowledged"] = await drain(600)
	client.accept(snapshot(3000,new_sequence,2,Vector2(40,-20)))
	checks["newest_ack_retires_predicted_intent"] = not world.player_motion.intent_pending and world.player_motion.position_value == Vector2(40,-20)
	var cross_generation_old: Dictionary = {"value":{"type":"direction"},"sequence":1,"session":1,"payload":{"generation":1}}
	var cross_generation_new: Dictionary = {"value":{"type":"direction"},"sequence":2,"session":1,"payload":{"generation":2}}
	checks["coalescing_never_crosses_generation"] = not VarendorInputTransport.can_supersede_direction(cross_generation_old,cross_generation_new)
	cross_generation_new.payload.generation = 1; cross_generation_new.session = 2
	checks["coalescing_never_crosses_session"] = not VarendorInputTransport.can_supersede_direction(cross_generation_old,cross_generation_new)
	client.end_session()
	var report: Dictionary = {"ok":checks.values().all(func(ok: bool): return ok),"checks":checks,"max_pending_directions":max_pending,"max_unsent_directions":max_unsent,"release_ack_wall_ms":release_latency,"superseded_directions":client.superseded_direction_count,"completed":completions}
	var file: FileAccess = FileAccess.open(output,FileAccess.WRITE); file.store_string(JSON.stringify(report,"  ")); file.close()
	InputMap.action_erase_event("move_forward",binding)
	world.free(); client.free()
	print("VARENDOR_INPUT_BACKPRESSURE_QA "+JSON.stringify(checks))
	quit(0 if report.ok else 1)
