extends SceneTree
const World = preload("res://scripts/world.gd")
const Weather = preload("res://scripts/world_weather.gd")
const Geography = preload("res://world-final/gameplay_environment.gd")
const Courtyard = preload("res://world-final/castle/courtyard_life.gd")
const Tavern = preload("res://world-final/castle/tavern_life.gd")

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var world: Node3D = World.new()
	world.set_process(false)
	root.add_child(world)
	# Full World.setup normally parents this preallocated controller.
	world.add_child(world.camera_controller)
	world.world_environment = Environment.new()
	world.world_environment.sky = Sky.new()
	world.sun_light = DirectionalLight3D.new()
	world.add_child(world.sun_light)
	var geography: Node3D = Geography.new()
	world.add_child(geography)
	world.final_environment = geography
	geography.active_space = "surface"
	var courtyard: Node3D = Courtyard.new()
	courtyard.set_process(false)
	geography.add_child(courtyard)
	geography.courtyard = courtyard
	courtyard.tavern = Tavern.new()
	var weather: Node3D = Weather.new()
	weather.set_process(false)
	world.add_child(weather)
	weather.setup(world)
	var environment: Dictionary = {"hour":14.5,"daylight":1.0,"night":false,"fullMoon":false,"weather":"rain","clouds":.8}
	world.current_snapshot = {"environment":environment.duplicate(true)}
	var checks: Dictionary = {}
	weather._process(1.0/60.0)
	checks.surface_rain_emits = weather.rain.emitting
	checks.surface_rain_visible = weather.rain.is_visible_in_tree()
	courtyard.tavern.inside = true
	weather._process(1.0/60.0)
	checks.indoor_stops_new_particles = not weather.rain.emitting
	checks.indoor_hides_existing_particles = not weather.rain.is_visible_in_tree()
	checks.indoor_does_not_reset_global_weather = world.current_snapshot.environment == environment and weather.current == environment and weather.qa_override.is_empty()
	courtyard.tavern.inside = false
	weather._process(1.0/60.0)
	checks.exit_restores_visible_rain = weather.rain.emitting and weather.rain.is_visible_in_tree()
	for space: String in ["mine","great_cave"]:
		geography.active_space = space
		weather._process(1.0/60.0)
		checks[space+"_hides_precipitation"] = not weather.rain.emitting and not weather.rain.is_visible_in_tree()
	geography.active_space = "surface"
	weather._process(1.0/60.0)
	checks.return_to_surface_restores_weather = weather.rain.emitting and weather.rain.is_visible_in_tree() and world.sun_light.visible
	checks.particle_lifetime_and_coordinates_preserved = is_equal_approx(weather.rain.lifetime,2.2) and not weather.rain.local_coords
	var ok: bool = checks.values().all(func(value): return value == true)
	print("INDOOR_WEATHER_QA ",JSON.stringify({"ok":ok,"checks":checks,"scope":"isolated production weather visibility; no city route or image claim"}))
	world.queue_free()
	await process_frame
	quit(0 if ok else 2)
