extends RefCounted

class OrbitDriver extends Node:
	var camera: VarendorCameraController
	var remaining: float = 0
	func _process(delta: float) -> void:
		if remaining <= 0: return
		camera.orbit(Vector2(95.0*minf(delta,remaining),0))
		remaining -= delta

class StopObserver extends Node:
	var motor: VarendorPlayerMovement
	var world: Node3D
	var watching: bool = false
	var ticks: int = 0
	var driven_distance: float = 0
	var started: int = 0
	var samples: Array = []
	var frames: Array[Image] = []
	var frame_times: Array = []
	var capture_enabled: bool = false
	var await_arrival: bool = false
	var saw_motion: bool = false
	func begin() -> void:
		ticks = 0
		driven_distance = 0
		samples.clear()
		frames.clear()
		frame_times.clear()
		started = Time.get_ticks_msec()
		watching = true
	func _physics_process(delta: float) -> void:
		if await_arrival:
			if motor.actual_velocity.length() > .1: saw_motion = true
			if saw_motion and motor.actual_velocity.length() < .00001 and motor.input_mode == "idle":
				await_arrival = false
				begin()
		if watching:
			ticks += 1
			driven_distance += motor.actual_velocity.length()*delta
	func _process(_delta: float) -> void:
		# Runs AFTER world._process. SceneTree.process_frame is emitted before
		# nodes render their pose and would accidentally sample the old frame.
		if not watching or ticks == 0: return
		var pose: Vector2 = Vector2(world.hero_position.x,-world.hero_position.z)
		samples.append({"seconds_after_release":float(Time.get_ticks_msec()-started)/1000.0,"pose":[pose.x,pose.y],"speed":motor.actual_velocity.length(),"correction":motor.visual_correction.length(),"rest_anchor":motor.rest_anchor_active,"must_settle":motor.correction_must_settle,"offset_releasing":motor.rest_offset_releasing,"state":world.actors[world.hero_id].get_meta("animation_state","")})
	func after_draw() -> void:
		if not capture_enabled or not watching or ticks == 0 or frames.size() >= 12: return
		var seconds: float = float(Time.get_ticks_msec()-started)/1000.0
		if frames.size() >= 8 and seconds < [.25,.5,1.0,1.5][frames.size()-8]: return
		frames.append(get_viewport().get_texture().get_image())
		frame_times.append(seconds)
	func save_frames(directory: String, case_index: int) -> void:
		if frames.is_empty(): return
		var sheet: Image = Image.create(4*480,3*320,false,Image.FORMAT_RGB8)
		for index: int in range(frames.size()):
			frames[index].save_png(directory.path_join("forward-stop-%d-frame-%02d.png" % [case_index,index]))
			var frame: Image = frames[index].duplicate()
			# Real rendered pixels; fixed center crop keeps ground and feet legible.
			var area: Rect2i = Rect2i(Vector2i(maxi(0,frame.get_width()/2-360),maxi(0,frame.get_height()/2-240)),Vector2i(mini(720,frame.get_width()),mini(480,frame.get_height())))
			frame = frame.get_region(area)
			frame.resize(480,320,Image.INTERPOLATE_LANCZOS)
			frame.convert(Image.FORMAT_RGB8)
			sheet.blit_rect(frame,Rect2i(0,0,480,320),Vector2i((index%4)*480,(index/4)*320))
		sheet.save_jpg(directory.path_join("forward-stop-%d.jpg" % case_index),.88)
		var encoded: String = Marshalls.raw_to_base64(sheet.save_jpg_to_buffer(.88))
		var chunks: int = ceili(float(encoded.length())/40000)
		for index: int in range(chunks):
			print("VARENDOR_REFERENCE_UI_JPG_PART forward-stop-%d %d/%d %s" % [case_index,index+1,chunks,encoded.substr(index*40000,40000)])

# Real keyboard -> physics -> HTTP input -> SSE -> rendered actor. The delayed
# transport matrix lives in player_stop_qa; this checks the actual application.
static func key(app: Node, code: Key, pressed: bool) -> void:
	var event: InputEventKey = InputEventKey.new()
	event.physical_keycode = code
	event.pressed = pressed
	app._input(event)

static func wall_delay(tree: SceneTree, milliseconds: int) -> void:
	var until: int = Time.get_ticks_msec()+milliseconds
	while Time.get_ticks_msec() < until:
		await tree.process_frame

static func run(app: Node) -> Dictionary:
	var checks: Dictionary = {}
	var tree: SceneTree = app.get_tree()
	var observations: Array = []
	var input_trace: Array = []
	var snapshot_trace: Array = []
	var captures: Array = []
	var observer: StopObserver = StopObserver.new()
	observer.motor = app.world.player_motion
	observer.world = app.world
	observer.process_physics_priority = 100
	observer.process_priority = 100
	observer.capture_enabled = DisplayServer.get_name() != "headless"
	app.add_child(observer)
	if observer.capture_enabled: RenderingServer.frame_post_draw.connect(observer.after_draw)
	var orbit: OrbitDriver = OrbitDriver.new()
	orbit.camera = app.world.camera_controller
	app.add_child(orbit)
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
	# Unit/rig checks above execute synchronously. Drain their accumulated
	# frame time BEFORE input, using wall time rather than a frame-delta timer.
	await wall_delay(tree,1000)
	for index: int in range(4):
		var before: Vector2 = app.world.player_motion.position_value
		# Short opposing runs stay in the safe spawn courtyard. The change of
		# direction recreates the video's multidirectional stopping sequence.
		var forward: Key = KEY_W if index == 0 else KEY_S
		var sideways: Key = KEY_A if index == 0 else KEY_D
		var queue_peak: int = 0
		if index == 3:
			observer.await_arrival = true
			observer.saw_motion = false
			observer.samples.clear()
			observer.frames.clear()
			observer.frame_times.clear()
			var goal: Vector2 = before
			for direction_index: int in range(16):
				var candidate: Vector2 = before+Vector2.from_angle(TAU*direction_index/16.0)*2.0
				if VarendorNavigation.path_segment_is_clear(app.world.collision,before,candidate):
					goal = candidate
					break
			checks["live_destination_has_reachable_two_meter_route"] = goal.distance_to(before) > 1.9
			app.net.intent({"type":"destination","x":goal.x,"z":goal.y})
			var until: int = Time.get_ticks_msec()+8000
			while not observer.watching and Time.get_ticks_msec() < until:
				await tree.process_frame
			checks["live_destination_reached_stop_boundary"] = observer.watching
		elif index == 2:
			orbit.remaining = 2.0
			key(app,KEY_W,true)
			while orbit.remaining > 0:
				await tree.process_frame
				queue_peak = maxi(queue_peak,app.net.input_queue.size())
			key(app,KEY_W,false)
		else:
			key(app, forward, true)
			await wall_delay(tree,320)
			key(app, forward, false)
			key(app, sideways, true)
			await wall_delay(tree,200)
			key(app, sideways, false)
		var release_physics: Vector2 = app.world.player_motion.position_value
		var release_correction: float = app.world.player_motion.visual_correction.length()
		var released_at: int = observer.started if index == 3 and observer.watching else Time.get_ticks_msec()
		if index != 3: observer.begin()
		await tree.physics_frame
		await tree.process_frame
		var sequence: int = app.net.sequence
		var first_tick_stopped: bool = app.world.player_motion.actual_velocity.length() < .00001 and app.world.player_motion.velocity.length() < .00001
		var first_tick_drift: float = app.world.player_motion.position_value.distance_to(release_physics)
		var early_excursion: float = 0
		var early_anchor: Variant = null
		var anchor: Variant = null
		var previous: Variant = null
		var late_excursion: float = 0
		var late_travel: float = 0
		var late_frames: int = 0
		var trace: Array = []
		while Time.get_ticks_msec() - released_at < 1600:
			await tree.process_frame
		observer.watching = false
		for sample: Dictionary in observer.samples:
			var elapsed: float = sample.seconds_after_release
			var pose: Vector2 = Vector2(sample.pose[0],sample.pose[1])
			if early_anchor == null: early_anchor = pose
			early_excursion = maxf(early_excursion,pose.distance_to(early_anchor))
			if elapsed >= .35:
				if anchor == null: anchor = pose
				if previous != null: late_travel += pose.distance_to(previous)
				late_excursion = maxf(late_excursion,pose.distance_to(anchor))
				previous = pose
				late_frames += 1
			trace.append(sample)
		checks["live_stop_%d_keyboard_really_moved" % index] = before.distance_to(app.world.player_motion.position_value) > .3
		checks["live_stop_%d_no_motor_drift_from_first_physics_tick" % index] = first_tick_stopped and observer.ticks > 1 and observer.driven_distance < .00001
		checks["live_stop_%d_no_early_rendered_slide" % index] = observer.samples.size() > 8 and early_excursion < .04
		checks["live_stop_%d_neutral_input_acknowledged" % index] = app.net.hero.lastInputSequence >= sequence and app.world.player_motion.input_direction.is_zero_approx() and app.world.player_motion.input_mode == "idle"
		checks["live_stop_%d_no_late_rendered_slide" % index] = late_frames > 8 and late_excursion < .04 and late_travel < .08
		checks["live_stop_%d_local_matches_server_endpoint" % index] = app.world.player_motion.position_value.distance_to(Vector2(app.net.hero.x,app.net.hero.z)) < .04
		observations.append({"sequence":sequence,"case":"destination_arrival" if index == 3 else "orbit_and_run" if index == 2 else "run_strafe_release","queue_peak":queue_peak,"correction_at_release_m":release_correction,"motor_distance_after_release_m":observer.driven_distance,"first_tick_position_delta_m":first_tick_drift,"render_excursion_from_first_frame_m":early_excursion,"late_frames":late_frames,"late_excursion_m":late_excursion,"late_travel_m":late_travel,"capture_times_after_release":observer.frame_times.duplicate(),"samples":trace})
		# PNG/JPEG encoding can block a software renderer for seconds. Keep
		# raw frame references here and encode ONLY after all movement and the
		# network session have ended; instrumentation must not create an outage.
		captures.append({"index":index,"frames":observer.frames.duplicate()})
	checks["live_stop_observations"] = observations
	checks["live_stop_input_trace"] = input_trace
	checks["live_stop_snapshot_trace"] = snapshot_trace
	app.net.intent_reserved.disconnect(on_input)
	app.net.snapshot_received.disconnect(on_snapshot)
	if observer.capture_enabled: RenderingServer.frame_post_draw.disconnect(observer.after_draw)
	observer.queue_free()
	orbit.queue_free()
	app.set_meta("stopping_frame_captures",captures)
	return checks

static func save_captures(app: Node) -> void:
	var writer: StopObserver = StopObserver.new()
	for sequence: Dictionary in app.get_meta("stopping_frame_captures",[]):
		writer.frames.assign(sequence.frames)
		writer.save_frames(app.qa_path.get_base_dir(),int(sequence.index))
	writer.free()
	app.remove_meta("stopping_frame_captures")
