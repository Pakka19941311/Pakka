extends SceneTree

static func run() -> Dictionary:
	var collision: VarendorCollision = VarendorCollision.new()
	# Exercise the actual imported town colliders, not only an empty fixture.
	var terrain: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://generated/terrain.json"))
	collision.setup(terrain.colliders)
	var ambient: VarendorAmbientResidents = VarendorAmbientResidents.new()
	ambient.setup(collision)
	var checks: Dictionary = {}
	var samples: Array = ambient.sample(0)
	checks["reference_six_authored_residents_exist"] = samples.size() == 6
	var initialized: bool = true
	var ids: Dictionary = {}
	var distances: Dictionary = {}
	var walks: Dictionary = {}
	var pauses: Dictionary = {}
	var initial: Dictionary = {}
	for resident: Dictionary in samples:
		ids[resident.id] = true
		distances[resident.id] = 0.0
		walks[resident.id] = false
		pauses[resident.id] = false
		initial[resident.id] = Vector2(resident.x, resident.z)
	for resident: Dictionary in ambient.residents:
		initialized = initialized and (resident.previous as Vector2).is_equal_approx(resident.position) and (resident.position as Vector2).length() > 1
	checks["ambient_initial_previous_equals_spawn_never_origin"] = initialized
	checks["ambient_ids_do_not_replace_service_npcs"] = ids.size() == 6 and ids.keys().all(func(id): return str(id).begins_with("ambient:"))
	var max_speed_ratio: float = 0
	var contained: bool = true
	var synchronized: bool = true
	var interpolation: bool = true
	var timer_works: bool = false
	var changed_activity: bool = false
	var prior_activities: Dictionary = {}
	for index: int in range(3600):
		ambient.physics_step(1.0 / 60.0)
		var midway: Array = ambient.sample(.5)
		for resident: Dictionary in ambient.residents:
			var displacement: Vector2 = (resident.position as Vector2) - (resident.previous as Vector2)
			var speed: float = displacement.length() * 60
			max_speed_ratio = maxf(max_speed_ratio, speed / float(resident.speed))
			distances[resident.id] += displacement.length()
			walks[resident.id] = bool(walks[resident.id]) or (resident.action == "walk" and speed > .01)
			pauses[resident.id] = bool(pauses[resident.id]) or (resident.state != "walk" and speed < .001)
			contained = contained and (resident.position as Vector2).x > -35 and (resident.position as Vector2).x < 20 and (resident.position as Vector2).y > -35 and (resident.position as Vector2).y < 15
			synchronized = synchronized and ((resident.action == "walk" and speed > .0059) or (resident.action != "walk" and speed <= .0059))
			timer_works = timer_works or (resident.action == "attack" and resident.work_until > ambient.clock_ms)
			if prior_activities.has(resident.id) and prior_activities[resident.id] != resident.activity: changed_activity = true
			prior_activities[resident.id] = resident.activity
		for sample: Dictionary in midway:
			var resident: Dictionary = ambient.residents[int(str(sample.id).get_slice(":", 1)) - 1]
			var expected: Vector2 = (resident.previous as Vector2).lerp(resident.position, .5)
			interpolation = interpolation and expected.distance_to(Vector2(sample.x, sample.z)) < .00001
	checks["ambient_sixty_seconds_no_superspeed_or_teleport"] = max_speed_ratio <= 1.005
	checks["ambient_all_six_really_walk_during_minute"] = walks.values().all(func(value): return value)
	checks["ambient_idle_pauses_between_authored_activities"] = pauses.values().all(func(value): return value)
	checks["ambient_walk_animation_matches_real_displacement"] = synchronized
	checks["ambient_stays_inside_settlement_route_area"] = contained
	checks["ambient_render_interpolates_two_physics_poses"] = interpolation
	checks["ambient_work_action_has_finite_animation_timing"] = timer_works
	checks["ambient_authored_route_advances_activities"] = changed_activity
	checks["ambient_clock_advances_sixty_seconds_once"] = absf(ambient.clock_ms - 60000) < .0001
	print("VARENDOR_AMBIENT_OBSERVATION " + JSON.stringify({"seconds":60,"physicsSteps":3600,"maxSpeedRatio":max_speed_ratio,"travelMeters":distances,"walked":walks}))
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	print("VARENDOR_AMBIENT_QA " + JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return value) else 2)
