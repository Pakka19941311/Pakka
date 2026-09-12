extends RefCounted
## Actual world counter. Needs the opt-in stage server and line fixture hook.
const Wait = preload("res://scripts/content_acceptance.gd")
const Fixture = preload("res://world-final/gameplay_acceptance.gd")
const CPU_TRACE = preload("res://scripts/p2_cpu_trace.gd")

static func run(app: Node,checks: Dictionary) -> void:
	var old_settings: Dictionary=app.game_settings.duplicate(true)
	var old_interaction: bool=app.qa_interaction
	app.qa_interaction=false
	var low_profile: bool="--qa-graphics=low" in OS.get_cmdline_user_args()
	preload("res://scripts/graphics_profile.gd").apply(app.game_settings,0 if low_profile else 2)
	app.apply_settings()
	app.close_dialog();app.inventory_panel.hide()
	var report: Array=[]
	for stage: String in ["p2-line-fire","p2-line-ice-dodge"]:
		CPU_TRACE.begin_phase(stage)
		var prefix: String=stage.replace("-","_")+"_"
		# Existing aggro can detect the initial hero before fixture acknowledgement.
		# Observe from before placement; never miss that legitimate first windup.
		var events: Array=[]
		var timings: Dictionary={}
		var input_trace: Array=[]
		var pending_acks: Dictionary={}
		var reserved: Callable=func(value: Dictionary,sequence: int):
			var row: Dictionary={"kind":"reserved","sequence":sequence,"intent":value.duplicate(true),"generation":int(app.net.hero.get("generation",0)),"wall_ms":Time.get_ticks_msec(),"connected":app.net.connected}
			input_trace.append(row);pending_acks[sequence]=row
		var rejected: Callable=func(value: Dictionary,sequence: int,error: String):
			input_trace.append({"kind":"rejected","sequence":sequence,"intent":value.duplicate(true),"error":error,"wall_ms":Time.get_ticks_msec()})
		var acknowledged: Callable=func(snapshot: Dictionary):
			var hero: Dictionary=snapshot.get("character",{})
			for sequence: int in pending_acks.keys():
				var row: Dictionary=pending_acks[sequence]
				if int(hero.get("generation",-1))==int(row.generation) and int(hero.get("lastInputSequence",-1))>=sequence:
					input_trace.append({"kind":"server_ack_seen","sequence":sequence,"server_sequence":int(hero.lastInputSequence),"server_ms":snapshot.get("time",0),"wall_ms":Time.get_ticks_msec()});pending_acks.erase(sequence)
		var disconnected: Callable=func(message: String):
			if "Соединение потеряно" in message: input_trace.append({"kind":"stream_or_transport_disconnect","message":message,"wall_ms":Time.get_ticks_msec(),"pending_sequences":pending_acks.keys()})
		var stream_reason: Callable=func(reason: String,diagnostic: Dictionary):
			input_trace.append({"kind":"stream_disconnect_reason","reason":reason,"diagnostic":diagnostic.duplicate(true)})
		app.net.intent_reserved.connect(reserved);app.net.intent_rejected.connect(rejected);app.net.snapshot_received.connect(acknowledged);app.net.notice.connect(disconnected)
		app.net.stream_disconnected.connect(stream_reason)
		var disconnect_network: Callable=func():
			app.net.intent_reserved.disconnect(reserved);app.net.intent_rejected.disconnect(rejected);app.net.snapshot_received.disconnect(acknowledged);app.net.notice.disconnect(disconnected)
			app.net.stream_disconnected.disconnect(stream_reason)
		var listener: Callable=func(event: Dictionary):
			var received: Dictionary=event.duplicate(true);received["receivedWallMs"]=Time.get_ticks_msec();events.append(received)
		app.world.event_presented.connect(listener)
		var fixture: Dictionary=await Fixture.fixture(app,stage)
		checks[prefix+"fixture"] = not fixture.is_empty() and not fixture.has("error")
		if not checks[prefix+"fixture"]:
			report.append({"stage":stage,"blocked":"fixture","cpu_trace":CPU_TRACE.finish_phase()})
			app.world.event_presented.disconnect(listener);disconnect_network.call();continue
		checks[prefix+"population_unchanged"] = fixture.populationBefore==fixture.populationAfter
		timings.fixture_ack=Time.get_ticks_msec()
		app.world.camera_distance=float(fixture.distance);app.world.camera_pitch=float(fixture.pitch);app.world.camera_yaw=float(fixture.yaw)
		var layer: Node3D=app.world.book_ground.line_layer()
		# This run measures a warmed combat area, not first-load performance.
		# All image readback/file I/O stays outside the response window.
		await app.get_tree().create_timer(4.0).timeout
		checks[prefix+"warm_setup_no_damage"] = float(app.net.hero.hp)==float(app.net.hero.maxHp)
		# Do not stall the input/stream clocks with synchronous GPU readback
		# immediately before combat. Capture only after the response window.
		timings.warm_end=Time.get_ticks_msec()
		checks[prefix+"connected_before_input"]=await Wait.until(app,func():return app.net.connected and int(app.net.hero.get("generation",-1))==int(fixture.generation),7000)
		if not checks[prefix+"connected_before_input"]:
			report.append({"stage":stage,"fixture":fixture,"timings":timings,"input_trace":input_trace,"shown":false,"blocked":"not-connected-before-input","cpu_trace":CPU_TRACE.finish_phase()})
			app.world.event_presented.disconnect(listener);disconnect_network.call();continue
		var observation: Dictionary={"pulse_seen":false,"fixed_release":{},"pulse_ids":{},"draws":0}
		var draw_observer: Callable=func():
			observation.draws+=1
			for pulse: Dictionary in layer.pulses:
				if pulse.owner==fixture.targetUid and pulse.node.visible:
					observation.pulse_seen=true
					observation.fixed_release=pulse.node.get_meta("fixed_release").duplicate()
					observation.pulse_ids[pulse.node.get_instance_id()]=true
		RenderingServer.frame_post_draw.connect(draw_observer)
		var initial_hp: float=float(app.net.hero.hp)
		timings.approach_sent=Time.get_ticks_msec()
		app.net.intent({"type":"destination","x":fixture.engagePoint.x,"z":fixture.engagePoint.z})
		timings.approach_reserved_sequence=app.net.sequence
		await Wait.until(app,func():return Vector2(app.net.hero.x,app.net.hero.z).distance_to(Vector2(fixture.engagePoint.x,fixture.engagePoint.z))<.3 or layer.telegraphs.values().any(func(t):return t.owner==fixture.targetUid),6000)
		timings.attack_sent=Time.get_ticks_msec()
		app.net.intent({"type":"attack","entityId":fixture.targetUid,"mode":"single","skill":null})
		timings.attack_reserved_sequence=app.net.sequence
		var shown: bool=await Wait.until(app,func():return layer.telegraphs.values().any(func(t):return t.owner==fixture.targetUid),10000)
		checks[prefix+"real_windup_visible"] = shown
		timings.windup_seen=Time.get_ticks_msec();timings.windup_seen_server=float(app.world.timeline.latest.time);timings.windup_seen_presentation=app.world.timeline.clock_ms
		if not shown:
			report.append({"stage":stage,"fixture":fixture,"timings":timings,"events":events,"input_trace":input_trace,"pending_ack_sequences":pending_acks.keys(),"shown":false,"connected":app.net.connected,"hero":app.net.hero.duplicate(true),"target":app.world.current_snapshot.get("monsters",[]).filter(func(m):return m.uid==fixture.targetUid),"input_queue":app.net.input_queue.duplicate(true),"cpu_trace":CPU_TRACE.finish_phase()})
			RenderingServer.frame_post_draw.disconnect(draw_observer);app.world.event_presented.disconnect(listener);disconnect_network.call();continue
		var id: String=""
		for key: String in layer.telegraphs:
			if layer.telegraphs[key].owner==fixture.targetUid:id=key;break
		var initial: Dictionary=layer.telegraphs[id].duplicate()
		var node: MeshInstance3D=initial.node
		var captured_mesh: Mesh=node.mesh
		checks[prefix+"no_legacy_circle"] = not app.world.book_ground.nodes.has(id)
		var start_hero: Vector2=Vector2(app.net.hero.x,app.net.hero.z)
		timings.response_sent=Time.get_ticks_msec()
		if stage.ends_with("dodge"):
			app.net.intent({"type":"destination","x":fixture.sidestep.x,"z":fixture.sidestep.z})
		else:app.net.intent({"type":"cancel"})
		timings.response_reserved_sequence=app.net.sequence
		var immutable: bool=true
		var frames: int=0
		var frame_trace: Array=[]
		var deadline: int=Time.get_ticks_msec()+2500
		while Time.get_ticks_msec()<deadline:
			if layer.telegraphs.has(id):
				var current: Dictionary=layer.telegraphs[id]
				immutable=immutable and current.start==initial.start and current.end==initial.end and current.node==node
			frames+=1
			frame_trace.append({"wall_ms":Time.get_ticks_msec(),"server_ms":float(app.world.timeline.latest.time),"presentation_ms":app.world.timeline.clock_ms,"hero":[app.net.hero.x,app.net.hero.z]})
			await app.get_tree().process_frame
			if observation.pulse_seen and layer.pulses.is_empty() and not layer.telegraphs.has(id):break
		RenderingServer.frame_post_draw.disconnect(draw_observer)
		app.world.event_presented.disconnect(listener)
		var final_hp: float=float(app.net.hero.hp)
		var fixed_release: Dictionary=observation.fixed_release
		# Geometry readback/iteration is deliberately after the live response.
		checks[prefix+"capsule_half_width"] = is_equal_approx(float(initial.width),.9)
		var vertices: PackedVector3Array=captured_mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		var a: Vector2=initial.start;var b: Vector2=initial.end
		var max_radius: float=0.0
		for vertex: Vector3 in vertices:
			var point: Vector2=Vector2(vertex.x,-vertex.z)
			var along: float=clampf((point-a).dot(b-a)/(b-a).length_squared(),0,1)
			max_radius=maxf(max_radius,point.distance_to(a+(b-a)*along))
		checks[prefix+"actual_mesh_matches_server_width"] = absf(max_radius-.9)<.0001
		var colors: PackedColorArray=captured_mesh.surface_get_arrays(0)[Mesh.ARRAY_COLOR]
		checks[prefix+"element_color"] = colors[0].r>colors[0].b if stage=="p2-line-fire" else colors[0].b>colors[0].r
		var windups: Array=events.filter(func(e):return e.kind=="attack" and e.get("actor","")==fixture.targetUid and e.get("attackKind","")=="aimed-line")
		checks[prefix+"server_windup_1200ms"] = not windups.is_empty() and absf(float(initial.expires)-float(windups[-1].at)-1200)<=17.0
		var releases: Array=events.filter(func(e):return e.kind=="release" and e.get("attackKind","")=="aimed-line" and e.get("actor","")==fixture.targetUid)
		var hits: Array=events.filter(func(e):return e.kind=="hit" and e.get("target","")==app.world.hero_id and e.get("actor","")==fixture.targetUid)
		checks[prefix+"fixed_endpoint_during_movement"] = immutable
		checks[prefix+"one_release_event"] = releases.size()==1
		checks[prefix+"directed_pulse_presented"] = observation.pulse_seen and observation.pulse_ids.size()==1
		checks[prefix+"telegraph_and_pulse_expired"] = not layer.telegraphs.has(id) and layer.pulses.is_empty()
		if not releases.is_empty() and not fixed_release.is_empty():
			var release: Dictionary=releases[0]
			checks[prefix+"release_endpoint_exact"] = fixed_release.destination.distance_to(Vector3(release.destination.x,release.destination.y,-release.destination.z))<.001 and fixed_release.origin.distance_to(Vector3(release.origin.x,release.origin.y,-release.origin.z))<.001
		else:checks[prefix+"release_endpoint_exact"]=false
		var moved: float=start_hero.distance_to(Vector2(app.net.hero.x,app.net.hero.z))
		if stage.ends_with("dodge"):
			checks[prefix+"ordinary_sidestep_over_2m"] = moved>2.0
			checks[prefix+"sidestep_avoids_real_damage"] = hits.is_empty() and final_hp==initial_hp
		else:checks[prefix+"stationary_receives_one_real_hit"] = hits.size()==1 and is_equal_approx(initial_hp-final_hp,float(hits[0].amount))
		checks[prefix+"hero_survived"] = not bool(app.net.hero.dead)
		report.append({"fixture":fixture,"timings":timings,"input_trace":input_trace,"pending_ack_sequences":pending_acks.keys(),"events":events.filter(func(e):return e.get("actor","")==fixture.targetUid),"frames":frames,"frame_trace":frame_trace,"draws":observation.draws,"initial_hp":initial_hp,"final_hp":final_hp,"moved":moved,"pulse_seen":observation.pulse_seen,"pulse_count":observation.pulse_ids.size(),"cpu_trace":CPU_TRACE.finish_phase()})
		disconnect_network.call()
		await app.net.intent({"type":"cancel"})
		await Wait.capture(app,stage+"-after")
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("p2-line-live.json"),{"scope":"Real initial fixture + authoritative single attacks and movement. No forced target HP, clock or positions during combat.","graphics":"low" if low_profile else "high","cases":report})
	app.game_settings=old_settings;app.qa_interaction=old_interaction;app.apply_settings()
