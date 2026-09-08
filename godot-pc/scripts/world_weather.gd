class_name VarendorWorldWeather
extends Node3D

var world: VarendorWorld
var sky_material: ShaderMaterial
var rain: CPUParticles3D
var current: Dictionary = {}
var qa_override: Dictionary = {}
var daylight: float = 1.0
var last_weather: String = ""

func setup(value: VarendorWorld) -> void:
	world = value
	sky_material = ShaderMaterial.new()
	sky_material.shader = preload("res://scripts/polish_sky.gdshader")
	world.world_environment.sky.sky_material = sky_material
	world.world_environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	rain = CPUParticles3D.new()
	rain.name = "WorldRain"
	rain.amount = 550
	rain.lifetime = 2.2
	rain.preprocess = 1.0
	rain.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	rain.emission_box_extents = Vector3(18,1,18)
	rain.direction = Vector3(.08,-1,.04)
	rain.spread = 3
	rain.initial_velocity_min = 12
	rain.initial_velocity_max = 16
	rain.gravity = Vector3(0,-3,0)
	rain.local_coords = false
	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(.022,.65)
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = Color(.65,.8,.95,.48)
	material.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mesh.material = material
	rain.mesh = mesh
	add_child(rain)
	rain.emitting = false

func _process(delta: float) -> void:
	if world == null or world.world_environment == null: return
	var env: Dictionary = qa_override if not qa_override.is_empty() else world.current_snapshot.get("environment",{})
	if env.is_empty(): env = {"hour":9.0,"daylight":1.0,"night":false,"fullMoon":false,"weather":"sun","clouds":.18}
	current = env
	var target_light: float = float(env.get("daylight",1))
	daylight = move_toward(daylight,target_light,delta*.4)
	var hour: float = float(env.get("hour",9))
	var angle: float = (hour-6)/24.0*TAU
	var sun_direction: Vector3 = Vector3(cos(angle),sin(angle),-.4).normalized()
	sky_material.set_shader_parameter("daylight",daylight)
	sky_material.set_shader_parameter("sun_direction",sun_direction)
	sky_material.set_shader_parameter("cloud_cover",float(env.get("clouds",.18)))
	sky_material.set_shader_parameter("full_moon",bool(env.get("fullMoon",false)))
	var raining: bool = str(env.get("weather","sun")) == "rain"
	sky_material.set_shader_parameter("rain_amount",1.0 if raining else 0.0)
	var light_dir: Vector3 = sun_direction if target_light > .2 else -sun_direction
	world.sun_light.look_at_from_position(Vector3.ZERO,-light_dir,Vector3.UP)
	world.sun_light.light_color = Color("fff0d1").lerp(Color("c4d8ff"),1-daylight)
	world.sun_light.light_energy = lerpf(.25,.95,daylight)*( .62 if raining else 1.0)
	world.world_environment.ambient_light_color = Color("6b82ae").lerp(Color("bacde4"),daylight)
	world.world_environment.ambient_light_energy = lerpf(.24,.62,daylight)
	world.world_environment.fog_light_color = Color("192b48").lerp(Color("a1c2d9"),daylight)
	world.world_environment.fog_density = .003 if raining else .0007
	world.world_environment.fog_sky_affect = .1
	rain.position = world.hero_position+Vector3(0,14,0)
	rain.emitting = raining
	last_weather = str(env.get("weather","sun"))
