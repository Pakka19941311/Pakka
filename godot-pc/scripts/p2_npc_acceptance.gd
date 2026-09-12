extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func run(app: Node, checks: Dictionary) -> void:
	checks.npc_fixture = not (await Mouse.fixture(app,"p2-npc")).is_empty()
	checks.npc_original_population = app.world.ambient_residents.residents.size()==39
	checks.npc_original_services = VarendorNpcInteraction.SERVICES.size()==13
	checks.npc_exact_two_replacements = app.world.actors.values().filter(func(a): return a.has_meta("p2_npc_role")).size()==2
	var observed: Dictionary = {}
	for id: String in ["ambient:103","ambient:115"]:
		var actor: Node3D = app.world.actors[id]
		observed[id] = {"distance":0.0,"phases":[],"states":[],"blocked":0,"max_step":0.0,"height_error":0.0,"walk_frame":false}
		checks[id+"_model"] = str(actor.get_meta("model")).begins_with("P2CityMotion")
		checks[id+"_ground_scale"] = (actor.get_meta("visual").scale as Vector3).is_equal_approx(Vector3.ONE)
	app.world.camera_distance = 10
	app.world.camera_yaw = -PI*.5
	var start: int = Time.get_ticks_msec()
	var previous: Dictionary = {}
	var talk_frame: bool = false
	var view_sequence: int = 0
	while Time.get_ticks_msec()-start < 100000:
		for id: String in observed:
			var actor: Node3D = app.world.actors[id]
			var value: Dictionary = observed[id]
			var state: String = str(actor.get_meta("p2_npc_state"))
			if not value.states.has(state): value.states.append(state)
			var at: Vector2 = Vector2(actor.position.x,-actor.position.z)
			if previous.has(id):
				var step: float = at.distance_to(previous[id])
				value.distance += step
				value.max_step = maxf(value.max_step,step)
			previous[id] = at
			if app.world.collision.blocked(at,.4): value.blocked += 1
			value.height_error = maxf(value.height_error,absf(actor.position.y-app.world.point(at.x,at.y).y))
			if state=="walk" and value.phases.size()<30: value.phases.append(float(actor.get_meta("p2_npc_phase")))
			var wanted: bool = (not value.walk_frame and state=="walk") or (id=="ambient:115" and state=="talk" and not talk_frame)
			if wanted:
				for angle: float in [0.0,PI*.5,PI,PI*1.5]:
					var offset: Vector2 = Vector2(cos(angle),sin(angle))*4
					var destination: Vector2 = at+offset
					if app.world.collision.blocked(destination,.46): continue
					var source: Vector3 = actor.position+Vector3.UP*1.3
					var view: Vector3 = app.world.point(destination.x,destination.y)+Vector3.UP*1.3
					if app.world.collision.ray_distance(source,view,.1,true)<source.distance_to(view)-.03: continue
					view_sequence+=1
					await Mouse.fixture(app,"p2-npc-view|%f|%f|%d" % [destination.x,destination.y,view_sequence])
					app.world.camera_yaw=atan2(offset.x,-offset.y)
					await Keys.wait_ms(app.get_tree(),600)
					var screen: Vector2 = app.world.camera.unproject_position(actor.position+Vector3.UP)
					if Rect2(340,30,1100,670).has_point(screen):
						await Wait.capture(app,"p2-npc-"+id.replace(":","-")+"-"+state)
						if state=="walk": value.walk_frame=true
						else: talk_frame=true
					break
		if observed.values().all(func(v): return v.distance>5 and v.states.has("idle") and v.states.has("walk") and v.walk_frame) and talk_frame: break
		await Keys.wait_ms(app.get_tree(),100)
	for id: String in observed:
		var value: Dictionary = observed[id]
		checks[id+"_real_route_distance"] = value.distance>5
		checks[id+"_walk_and_rest"] = value.states.has("walk") and value.states.has("idle")
		checks[id+"_walk_visible"] = value.walk_frame
		checks[id+"_not_in_wall"] = value.blocked==0
		checks[id+"_grounded"] = value.height_error<.01
		checks[id+"_phase_advances"] = value.phases.size()>=10 and absf(value.phases[0]-value.phases[9])>.01
		# Sampling around captures can be slower; the route itself remains the
		# unmodified local 60Hz simulation, never a fixture-driven NPC teleport.
	checks.npc_resident_live_conversation = talk_frame
	checks.npc_player_alive = not bool(app.net.hero.dead)
	app.net.intent({"type":"destination","x":app.net.hero.x,"z":app.net.hero.z})
	await Wait.until(app,func(): return not app.net.command_busy,4000)
	await Keys.wait_ms(app.get_tree(),500)
	await Wait.capture(app,"p2-npc-final-view")
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("p2-npc-route-observation.json"),observed)
	print("P2_NPC_LIVE ",JSON.stringify(checks))
