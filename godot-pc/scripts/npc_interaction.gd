class_name VarendorNpcInteraction
extends RefCounted

# A service click owns one cancellable approach, then waits for the server's
# stop ACK before opening UI. A locally predicted arrival is not permission
# to buy, take a quest or teleport on the authoritative server.
signal service_opened(id: String)
signal notice(message: String)

const SERVICES: Dictionary = {
	"npc:shop":{"name":"Торговка Эльза","model":"Ranger","x":.3,"z":-7.8,"role":"Торговля"},
	"npc:elder":{"name":"Староста Роэн","model":"Warrior","x":-7.0,"z":-2.6,"role":"Задание"},
	"npc:smith":{"name":"Кузнец Бран","model":"Warrior","x":-17.5,"z":-12.6,"role":"Кузница"},
	"npc:teleport":{"name":"Проводник Каэль","model":"Wizard","x":-7.0,"z":-20.0,"role":"Переход"}
}
const RANGE: float = 3.05 # Server requires <=3.2; reserve movement/rounding margin.
var world: VarendorWorld
var network: VarendorNetwork
var pending_id: String = ""
var phase: String = ""
var sequence: int = 0
var generation: int = -1
var hero_id: String = ""
var deadline: float = 0.0
var owns_dispatch: bool = false

func setup(value: VarendorWorld, connection: VarendorNetwork) -> void:
	world = value
	network = connection
	network.intent_reserved.connect(on_intent)

func clear() -> void:
	pending_id = ""
	phase = ""

func on_intent(value: Dictionary, _sequence: int) -> void:
	if owns_dispatch or pending_id.is_empty(): return
	# A neutral key-up is not a new movement choice. A new key press, ground
	# click, jump, combat command or explicit cancellation supersedes the NPC.
	if value.type == "direction" and Vector2(value.x,value.z).is_zero_approx(): return
	if value.type == "attack" and str(value.get("entityId","")) in ["@self",str(network.hero.get("id",""))]: return
	clear()

func valid(id: String) -> bool:
	return SERVICES.has(id) and world.actors.has(id) and is_instance_valid(world.actors[id]) and world.actors[id].visible and not world.actors[id].get_meta("dead",false)

func ready_for_service(id: String, point: Vector2) -> bool:
	if not valid(id): return false
	var service: Dictionary = SERVICES[id]
	var actor: Node3D = world.actors[id]
	var anchor: Vector2 = Vector2(service.x,service.z)
	var shown: Vector2 = Vector2(actor.position.x,-actor.position.z)
	if point.distance_to(anchor) > RANGE or point.distance_to(shown) > RANGE: return false
	var start: Vector3 = world.point(point.x,point.y,1.2)
	var end: Vector3 = actor.position+Vector3(0,1.2,0)
	return world.collision.ray_distance(start,end) >= start.distance_to(end)-.05

func approach_goal(id: String, start: Vector2) -> Variant:
	var actor: Node3D = world.actors[id]
	var center: Vector2 = Vector2(actor.position.x,-actor.position.z)
	var heading: float = (start-center).angle()
	var best: Variant = null
	var best_length: float = INF
	for radius: float in [2.25,1.6,2.65]:
		for index: int in range(16):
			var candidate: Vector2 = center+Vector2.RIGHT.rotated(heading+TAU*index/16.0)*radius
			if start.distance_to(candidate) >= best_length: continue
			if world.collision.blocked(candidate) or not ready_for_service(id,candidate): continue
			var route: Array = VarendorNavigation.find_path(world.collision,start,candidate)
			if route.is_empty(): continue
			var length: float = 0.0
			var previous: Vector2 = start
			for waypoint: Dictionary in route:
				var point: Vector2 = Vector2(waypoint.x,waypoint.z)
				length += previous.distance_to(point)
				previous = point
			if length < best_length:
				best_length = length
				best = candidate
	return best

func dispatch(value: Dictionary) -> void:
	owns_dispatch = true
	network.intent(value)
	sequence = network.sequence
	owns_dispatch = false

func begin(id: String) -> void:
	clear()
	if not network.connected or network.hero.is_empty() or bool(network.hero.get("dead",true)) or not valid(id): return
	world.target_id = id
	pending_id = id
	hero_id = str(network.hero.id)
	generation = int(network.hero.generation)
	deadline = 0.0
	var local: Vector2 = world.player_motion.position_value
	var server: Vector2 = Vector2(network.hero.x,network.hero.z)
	if ready_for_service(id,local) and ready_for_service(id,server):
		phase = "stopping"
		dispatch({"type":"cancel"})
		return
	var goal: Variant = approach_goal(id,local)
	if goal == null:
		clear()
		notice.emit("До собеседника нет свободного пути")
		return
	phase = "approach"
	dispatch({"type":"destination","x":goal.x,"z":goal.y})

func poll(delta: float) -> void:
	if pending_id.is_empty(): return
	if not network.connected or network.hero.is_empty() or bool(network.hero.get("dead",true)) or str(network.hero.id) != hero_id or int(network.hero.generation) != generation or not valid(pending_id):
		clear()
		return
	deadline += delta
	if deadline > 30.0:
		clear()
		dispatch({"type":"cancel"})
		notice.emit("Подойдите к собеседнику с другой стороны")
		return
	if int(network.hero.get("lastInputSequence",0)) < sequence: return
	if not ready_for_service(pending_id,world.player_motion.position_value) or not ready_for_service(pending_id,Vector2(network.hero.x,network.hero.z)): return
	if phase == "approach":
		phase = "stopping"
		dispatch({"type":"cancel"})
		return
	if phase == "stopping":
		var id: String = pending_id
		clear()
		service_opened.emit(id)
