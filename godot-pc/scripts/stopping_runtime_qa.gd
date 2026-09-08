extends RefCounted

# Real keyboard -> physics -> HTTP input -> SSE -> rendered actor. The delayed
# transport matrix lives in player_stop_qa; this checks the actual application.
static func key(app: Node, code: Key, pressed: bool) -> void:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = code
	event.pressed = pressed
	app._input(event)

static func run(app: Node) -> Dictionary:
	var checks: Dictionary = {}
	var tree: SceneTree = app.get_tree()
	var observations: Array = []
	var input_trace: Array = []
	var snapshot_trace: Array = []
	var trace_started: int = Time.get_ticks_msec()
	var on_input: Callable = func(value: Dictionary, sequence: int):
		input_trace.append({"wall_ms":Time.get_ticks_msec()-trace_started,"sequence":sequence,"intent":value.duplicate(true),"clock_ms":app.world.player_motion.clock_ms})
	var on_snapshot: Callable = func(snapshot: Dictionary):
		var hero: Dictionary = snapshot.character
		snapshot_trace.append({"wall_ms":Time.get_ticks_msec()-trace_started,"time":snapshot.time,"lastInputAt":hero.lastInputAt,"ack":hero.lastInputSequence,"position":[hero.x,hero.z],"velocity":[hero.velocityX,hero.velocityZ],"clock_ms":app.world.player_motion.clock_ms})
	app.net.intent_reserved.connect(on_input)
	app.net.snapshot_received.connect(on_snapshot)
	app.inventory_panel.hide()
	if is_instance_valid(app.active_dialog): app.close_dialog()
	if app.get_viewport().gui_get_focus_owner() != null: app.get_viewport().gui_get_focus_owner().release_focus()
	app.player_input.focus_changed(true)
	await app.net.intent({"type":"cancel"})
	await tree.create_timer(.3).timeout
	for index: int in range(2):
		var before: Vector2 = app.world.player_motion.position_value
		# Short opposing runs stay in the safe spawn courtyard. The change of
		# direction recreates the video's multidirectional stopping sequence.
		var forward: Key = KEY_W if index == 0 else KEY_S
		var sideways: Key = KEY_A if index == 0 else KEY_D
		key(app, forward, true)
		await tree.create_timer(.32).timeout
		key(app, forward, false)
		key(app, sideways, true)
		await tree.create_timer(.20).timeout
		key(app, sideways, false)
		await tree.physics_frame
		await tree.process_frame
		var sequence: int = app.net.sequence
		var released_at: int = Time.get_ticks_msec()
		var anchor: Variant = null
		var previous: Variant = null
		var late_excursion: float = 0
		var late_travel: float = 0
		var late_frames: int = 0
		var trace: Array = []
		var last_sample: float = -1
		while Time.get_ticks_msec() - released_at < 1600:
			await tree.process_frame
			var elapsed: float = float(Time.get_ticks_msec() - released_at) / 1000.0
			var pose: Vector2 = Vector2(app.world.hero_position.x,-app.world.hero_position.z)
			if elapsed >= .35:
				if anchor == null: anchor = pose
				if previous != null: late_travel += pose.distance_to(previous)
				late_excursion = maxf(late_excursion,pose.distance_to(anchor))
				previous = pose
				late_frames += 1
			if elapsed - last_sample >= .10:
				last_sample = elapsed
				trace.append({"seconds_after_release":elapsed,"pose":[pose.x,pose.y],"speed":app.world.player_motion.actual_velocity.length(),"correction":app.world.player_motion.visual_correction.length(),"ack":app.net.hero.lastInputSequence,"state":app.world.actors[app.world.hero_id].get_meta("animation_state","")})
		checks["live_stop_%d_keyboard_really_moved" % index] = before.distance_to(app.world.player_motion.position_value) > .3
		checks["live_stop_%d_neutral_input_acknowledged" % index] = app.net.hero.lastInputSequence >= sequence and app.world.player_motion.input_direction.is_zero_approx() and app.world.player_motion.input_mode == "idle"
		checks["live_stop_%d_no_late_rendered_slide" % index] = late_frames > 8 and late_excursion < .04 and late_travel < .08
		checks["live_stop_%d_local_matches_server_endpoint" % index] = app.world.player_motion.position_value.distance_to(Vector2(app.net.hero.x,app.net.hero.z)) < .04
		observations.append({"sequence":sequence,"late_frames":late_frames,"late_excursion_m":late_excursion,"late_travel_m":late_travel,"samples":trace})
	checks["live_stop_observations"] = observations
	checks["live_stop_input_trace"] = input_trace
	checks["live_stop_snapshot_trace"] = snapshot_trace
	app.net.intent_reserved.disconnect(on_input)
	app.net.snapshot_received.disconnect(on_snapshot)
	return checks
