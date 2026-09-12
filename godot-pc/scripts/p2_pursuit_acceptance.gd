extends RefCounted
## Observe the ordinary native renderer against the disposable authoritative
## server. This probe never calls controller.sample/update or writes actor pose.
const Wait = preload("res://scripts/content_acceptance.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")
const Combat = preload("res://scripts/p2_population_acceptance.gd")
const SIX_LEG_ASSET: String = "res://world-expansion-v3/actors/alternatives/roach-six/V3RoachSixLeg.glb"

static func planar(value: Dictionary) -> Vector2:
	return Vector2(float(value.get("x",0)),float(value.get("z",0)))

static func monster(app: Node, uid: String) -> Dictionary:
	for value: Dictionary in app.world.current_snapshot.get("monsters",[]):
		if str(value.uid) == uid: return value
	return {}

static func rig_cache(actor: Node3D) -> Array:
	var result: Array = []
	for mesh: MeshInstance3D in actor.find_children("*","MeshInstance3D",true,false):
		var skeleton: Skeleton3D = mesh.get_node_or_null(mesh.skeleton) as Skeleton3D
		if skeleton == null or mesh.skin == null or mesh.mesh == null: continue
		var bindings: Array = []
		for bind: int in range(mesh.skin.get_bind_count()):
			var index: int = mesh.skin.get_bind_bone(bind)
			if index < 0: index = skeleton.find_bone(mesh.skin.get_bind_name(bind))
			bindings.append({"index":index,"rest":mesh.skin.get_bind_pose(bind)})
		for surface: int in range(mesh.mesh.get_surface_count()):
			var arrays: Array = mesh.mesh.surface_get_arrays(surface)
			result.append({"skeleton":skeleton,"bindings":bindings,"vertices":arrays[Mesh.ARRAY_VERTEX],"joints":arrays[Mesh.ARRAY_BONES],"weights":arrays[Mesh.ARRAY_WEIGHTS]})
	return result

static func observed_floor(app: Node, actor: Node3D, surfaces: Array) -> Dictionary:
	var lowest: float = INF
	var highest: float = -INF
	var pose: Array = []
	var low_points: Array[Vector3] = []
	for surface: Dictionary in surfaces:
		var skeleton: Skeleton3D = surface.skeleton
		var transforms: Array[Transform3D] = []
		for binding: Dictionary in surface.bindings:
			var bone: Transform3D = skeleton.get_bone_global_pose(int(binding.index))
			transforms.append(skeleton.global_transform * bone * binding.rest)
			pose.append(str(bone))
		var vertices: PackedVector3Array = surface.vertices
		var joints: PackedInt32Array = surface.joints
		var weights: PackedFloat32Array = surface.weights
		var influences: int = int(joints.size()/maxi(1,vertices.size()))
		for vertex: int in range(vertices.size()):
			var point: Vector3 = Vector3.ZERO
			for influence: int in range(influences):
				var cursor: int = vertex*influences+influence
				point += (transforms[joints[cursor]] * vertices[vertex]) * weights[cursor]
			lowest = minf(lowest,point.y); highest = maxf(highest,point.y)
			# The support test uses actual deformed low vertices, not static AABB.
			if point.y <= lowest+.04: low_points.append(point)
	var min_gap: float = INF
	for point: Vector3 in low_points:
		if point.y <= lowest+.04:
			min_gap = minf(min_gap,point.y-app.world.point(point.x,-point.z).y)
	return {"skin_min_gap":min_gap,"skin_height":highest-lowest,"pose":str(pose).sha256_text(),
		"root_gap":actor.global_position.y-app.world.point(actor.global_position.x,-actor.global_position.z).y}

static func click_target(app: Node, actor: Node3D, uid: String, auto: bool = false) -> bool:
	app.world.camera_distance = 9.0
	for angle: float in [0.0,PI/2,PI,PI*1.5]:
		app.world.camera_yaw = angle
		await app.get_tree().create_timer(.25).timeout
		var point: Vector2 = app.world.camera.unproject_position(actor.global_position+Vector3(0,float(actor.get_meta("p2_profile").height)*.5,0))
		if Rect2(360,120,960,590).has_point(point) and app.world.targeting.pick(point) == uid:
			Mouse.mouse(app,point)
			if auto: Combat.auto_attack_chord(app,point)
			return true
	return false

static func row(app: Node, actor: Node3D, uid: String, stage: String, surfaces: Array) -> Dictionary:
	var motion: Dictionary = monster(app,uid)
	var controller: VarendorP2AnimationController = actor.get_meta("animation_controller")
	var value: Dictionary = {"at":float(app.world.current_snapshot.time),"stage":stage,"server":motion.duplicate(true),
		"hero":[app.net.hero.x,app.net.hero.z],"rendered":[actor.global_position.x,actor.global_position.y,actor.global_position.z],
		"controller_state":controller.state,"clip":controller.current_clip,"gait_phase":controller.gait_phase,
		"rate":controller.playback_rate,"gait":actor.get_meta("p2_gait_contract",{}).duplicate(true),
		"gait_violation":bool(actor.get_meta("p2_gait_contract_violation",false)) or actor.has_meta("p2_last_gait_violation"),
		"attack_violation":bool(actor.get_meta("p2_attack_contract_violation",false)) or actor.has_meta("p2_last_attack_violation"),
		"last_gait_violation":actor.get_meta("p2_last_gait_violation",{}).duplicate(true),
		"last_attack_violation":actor.get_meta("p2_last_attack_violation",{}).duplicate(true)}
	value.merge(observed_floor(app,actor,surfaces))
	return value

static func evaluate(trace: Array, fixture: Dictionary, hero_id: String) -> Dictionary:
	var checks: Dictionary = {}
	var longest: float = 0.0
	var segment: float = 0.0
	var moving_samples: int = 0
	var stall: float = 0.0
	var poses: Dictionary = {}
	var airborne: float = 0.0
	var longest_airborne: float = 0.0
	var max_root_gap: float = 0.0
	var min_skin_gap: float = INF
	var violations: int = 0
	var peak_speed: float = 0.0
	var home_peak: float = 0.0
	var hero_home_peak: float = 0.0
	var saw_return: bool = false
	var returned: bool = false
	var monotonic: bool = true
	var before: Dictionary = {}
	for sample: Dictionary in trace:
		var motion: Dictionary = sample.server
		if motion.is_empty(): continue
		var home_distance: float = planar(motion).distance_to(planar(fixture.home))
		home_peak = maxf(home_peak,home_distance)
		hero_home_peak = maxf(hero_home_peak,Vector2(float(sample.hero[0]),float(sample.hero[1])).distance_to(planar(fixture.home)))
		var chasing: bool = str(motion.get("targetId","")) == hero_id and str(motion.get("aiState","")) in ["chase","aggro"]
		var returning: bool = str(motion.get("aiState","")) in ["return","leash"]
		saw_return = saw_return or returning
		returned = returned or (saw_return and home_distance <= .7 and motion.get("targetId") == null and motion.get("provokedBy") == null)
		if bool(sample.gait_violation) or bool(sample.attack_violation): violations += 1
		if not before.is_empty():
			var dt: float = (float(sample.at)-float(before.at))/1000.0
			monotonic = monotonic and dt > 0
			if dt <= 0: continue
			var distance: float = planar(motion).distance_to(planar(before.server))
			var speed: float = distance/dt
			peak_speed = maxf(peak_speed,speed)
			if chasing and speed > float(fixture.movementSpeed)*.45:
				segment += distance; stall = 0; moving_samples += 1
				poses[sample.pose] = true
				max_root_gap = maxf(max_root_gap,absf(float(sample.root_gap)))
				min_skin_gap = minf(min_skin_gap,float(sample.skin_min_gap))
				airborne = airborne+dt if float(sample.skin_min_gap) > .06 else 0.0
				longest_airborne = maxf(longest_airborne,airborne)
				longest = maxf(longest,segment)
			else:
				stall += dt
				if stall > .6: segment = 0
		before = sample
	checks.continuous_pursuit_at_least_12m = longest >= float(fixture.minimumContinuousMetres)
	checks.actual_rig_changes_during_pursuit = moving_samples >= 30 and poses.size() >= 20
	checks.no_gait_or_attack_contract_violation = violations == 0
	checks.root_follows_terrain = moving_samples > 0 and max_root_gap < .03
	# A bounce may be airborne; an entire cycle without contact is hover.
	checks.no_sustained_hover = moving_samples > 0 and longest_airborne < (1.2 if fixture.mobId == "MOB-01" else .65)
	checks.no_deep_terrain_penetration = moving_samples > 0 and min_skin_gap > -.065
	checks.server_speed_respects_definition = peak_speed <= float(fixture.movementSpeed)*1.08+.05
	# At 150 ms observation spacing the first return step can already be inside
	# the boundary. Require the hero beyond it and the monster at its edge.
	checks.leash_boundary_reached_then_left = hero_home_peak > float(fixture.leashRadius)+2 and home_peak >= float(fixture.leashRadius)-float(fixture.movementSpeed)*.3
	checks.real_return_home_and_release = saw_return and returned
	checks.snapshot_time_is_monotonic = monotonic
	return {"checks":checks,"continuous_metres":longest,"moving_samples":moving_samples,"unique_poses":poses.size(),
		"peak_server_speed":peak_speed,"max_home_distance":home_peak,"max_hero_home_distance":hero_home_peak,"max_root_gap":max_root_gap,
		"minimum_skin_gap":min_skin_gap,"longest_airborne_seconds":longest_airborne,"violations":violations}

static func pursuit(app: Node, mob_id: String, checks: Dictionary) -> void:
	var prefix: String = "pursuit_"+mob_id+"_"
	var fixture: Dictionary = await Mouse.fixture(app,"p2-pursuit-"+mob_id)
	checks[prefix+"fixture"] = not fixture.is_empty() and not fixture.has("error")
	if not checks[prefix+"fixture"]: return
	var uid: String = str(fixture.target)
	checks[prefix+"visible"] = await Wait.until(app,func(): return app.world.actors.has(uid),12000)
	if not checks[prefix+"visible"]: return
	var actor: Node3D = app.world.actors[uid]
	var profile: Dictionary = actor.get_meta("p2_profile",{})
	checks[prefix+"canonical_profile"] = profile.get("mob_id","") == mob_id and (mob_id != "MOB-05" or profile.get("asset_path","") == SIX_LEG_ASSET)
	if not checks[prefix+"canonical_profile"]: return
	var surfaces: Array = rig_cache(actor)
	checks[prefix+"skinned_geometry_available"] = not surfaces.is_empty()
	if surfaces.is_empty(): return
	var before_hp: float = float(monster(app,uid).hp)
	checks[prefix+"real_single_lmb"] = await click_target(app,actor,uid)
	checks[prefix+"single_hit_provokes"] = await Wait.until(app,func():
		var m: Dictionary = monster(app,uid)
		return not m.is_empty() and float(m.hp) < before_hp and bool(m.alive) and str(m.get("provokedBy","")) == app.world.hero_id,12000)
	if not checks[prefix+"single_hit_provokes"]: return
	var trace: Array = []
	var center: Vector2 = planar(fixture.home)
	var home: Vector2 = center
	var stage: String = "orbit"
	var distance: float = 0.0
	var previous: Vector2 = planar(monster(app,uid))
	var last_sample_time: float = -1
	var deadline: int = Time.get_ticks_msec()+90000
	var last_command: int = 0
	var saw_return: bool = false
	var captured: Dictionary = {}
	while Time.get_ticks_msec() < deadline and is_instance_valid(actor) and not bool(app.net.hero.get("dead",false)):
		await app.get_tree().create_timer(.15).timeout
		var m: Dictionary = monster(app,uid)
		if m.is_empty() or not bool(m.alive): break
		var at: float = float(app.world.current_snapshot.time)
		if at <= last_sample_time: continue
		last_sample_time = at
		var current: Vector2 = planar(m)
		if str(m.get("targetId","")) == app.world.hero_id: distance += current.distance_to(previous)
		previous = current
		if stage == "orbit" and Time.get_ticks_msec()-last_command > 250:
			var angle: float = (current-center).angle() if current.distance_to(center) > .8 else float(fixture.angle)
			var lead: float = angle+.82
			var goal: Vector2 = center+Vector2(cos(lead),sin(lead))*float(fixture.radius)
			if distance >= float(fixture.minimumContinuousMetres)+1.0:
				var hero_angle: float = (planar(app.net.hero)-center).angle()
				for route: Dictionary in fixture.escapeRoutes:
					if absf(angle_difference(hero_angle,float(route.angle))) < .22:
						goal = planar(route.escape); stage = "escape"; break
			app.net.intent({"type":"destination","x":goal.x,"z":goal.y})
			last_command = Time.get_ticks_msec()
		var sample: Dictionary = row(app,actor,uid,stage,surfaces)
		trace.append(sample)
		for threshold: int in [5,10]:
			if distance >= threshold and not captured.has(threshold):
				captured[threshold] = true
				await Wait.capture(app,"pursuit-"+mob_id+"-"+str(threshold)+"m")
		saw_return = saw_return or str(m.get("aiState","")) in ["leash","return"]
		if saw_return and stage != "return":
			stage = "return"
			await Wait.capture(app,"pursuit-"+mob_id+"-return")
		if saw_return and current.distance_to(home) <= .7 and m.get("targetId") == null and m.get("provokedBy") == null: break
	app.net.intent({"type":"cancel"})
	var result: Dictionary = evaluate(trace,fixture,app.world.hero_id)
	for key: String in result.checks: checks[prefix+key] = result.checks[key]
	checks[prefix+"hero_survived"] = not bool(app.net.hero.get("dead",false))
	checks[prefix+"one_hit_only_no_kill"] = is_equal_approx(float(monster(app,uid).get("hp",-1)),float(trace[0].server.hp)) if not trace.is_empty() else false
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("native-pursuit-"+mob_id+".json"),{
		"schema":1,"fixture":fixture,"profile":profile,"native_render":DisplayServer.get_name() != "headless",
		"method":"Single real LMB, ordinary destination intents, live snapshot and existing renderer observation. No manual animation sampling.",
		"summary":result,"trace":trace})
	print("P2_NATIVE_PURSUIT ",mob_id," ",JSON.stringify(result))

static func roach_combat(app: Node, checks: Dictionary) -> void:
	var fixture: Dictionary = await Mouse.fixture(app,"p2-combat-MOB-05")
	checks.roach6_combat_fixture = not fixture.is_empty() and not fixture.has("error")
	if not checks.roach6_combat_fixture: return
	var uid: String = str(fixture.target)
	checks.roach6_combat_visible = await Wait.until(app,func(): return app.world.actors.has(uid),12000)
	if not checks.roach6_combat_visible: return
	var actor: Node3D = app.world.actors[uid]
	checks.roach6_combat_canonical = actor.get_meta("p2_profile",{}).get("asset_path","") == SIX_LEG_ASSET
	checks.roach6_combat_full_hp = is_equal_approx(float(fixture.monsterHpBefore),float(fixture.maxHp))
	var events: Array = []
	var observer: Callable = func(event: Dictionary):
		if str(event.get("actor","")) == uid or str(event.get("target","")) == uid: events.append(event.duplicate(true))
	app.world.event_presented.connect(observer)
	checks.roach6_combat_real_lmb_and_chord = await click_target(app,actor,uid,true)
	checks.roach6_combat_auto = await Wait.until(app,func(): return bool(app.net.hero.get("autoAttack",false)),5000)
	var motion: Array = []
	var surfaces: Array = rig_cache(actor)
	var deadline: int = Time.get_ticks_msec()+60000
	var captured_attack: bool = false
	while Time.get_ticks_msec() < deadline and is_instance_valid(actor) and not bool(app.net.hero.get("dead",false)):
		await app.get_tree().create_timer(.15).timeout
		motion.append(row(app,actor,uid,"combat",surfaces))
		if not captured_attack and actor.get_meta("animation_controller").state == "attack":
			captured_attack = true
			await Wait.capture(app,"roach6-live-attack")
		if int(app.net.hero.kills) > int(fixture.kills): break
	checks.roach6_combat_ordinary_kill = int(app.net.hero.kills) > int(fixture.kills)
	checks.roach6_combat_survived = not bool(app.net.hero.get("dead",false))
	checks.roach6_combat_gold = int(app.net.hero.gold) > int(fixture.gold)
	checks.roach6_combat_attack_was_rendered = captured_attack
	checks.roach6_combat_no_contract_violation = not motion.is_empty() and motion.all(func(s: Dictionary): return not bool(s.gait_violation) and not bool(s.attack_violation))
	checks.roach6_combat_dead_unpickable = await Wait.until(app,func(): return not is_instance_valid(actor) or bool(actor.get_meta("dead",false)) and not bool(actor.get_meta("pickable",true)),5000)
	await Wait.capture(app,"roach6-live-death")
	var stopped: Vector2 = planar(app.net.hero)
	await app.get_tree().create_timer(.5).timeout
	checks.roach6_combat_hero_stops = stopped.distance_to(planar(app.net.hero)) < .03
	app.world.event_presented.disconnect(observer)
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("native-roach6-combat.json"),{"fixture":fixture,"events":events,"trace":motion})

static func run(app: Node, checks: Dictionary) -> void:
	checks.pursuit_native_render = DisplayServer.get_name() != "headless"
	var selected: Array = ["MOB-01","MOB-03","MOB-04","MOB-05"]
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--block=p2-pursuit:"): selected = Array(arg.trim_prefix("--block=p2-pursuit:").split(","))
	for mob_id: String in selected:
		app.close_dialog(); app.inventory_panel.hide()
		await pursuit(app,mob_id,checks)
	if "MOB-05" in selected: await roach_combat(app,checks)
