class_name VarendorAmbientResidents
extends RefCounted

# The six residents and their authored activities from browser 1e94a0d1.
# This is local atmosphere, never a second mover for network-owned service NPCs.
var LOOKS: Dictionary = {}
var ROUTES: Array = []

var collision: VarendorCollision
var residents: Array[Dictionary] = []
var service_positions: Array[Vector2] = []
var visitor_positions: Array[Vector2] = []
var clock_ms: float = 0.0
var navigation_budget: int = 2
var last_delta: float = 1.0 / 60.0

func setup(world_collision: VarendorCollision, territory: Dictionary = {}) -> void:
	if territory.is_empty(): territory = JSON.parse_string(FileAccess.get_file_as_string("res://generated/territory.json"))
	ROUTES = territory.residents
	for key: String in territory.residentLooks:
		var value: Dictionary = territory.residentLooks[key]
		LOOKS[key] = Vector2(value.x,value.z)
	collision = world_collision
	residents.clear()
	service_positions.clear()
	clock_ms = 0
	for service: Dictionary in territory.services.values():
		var point: Vector2 = Vector2(service.x,service.z)
		service_positions.append(VarendorNavigation.nearest_free(collision, point, .42))
	for definition: Dictionary in ROUTES:
		var spawn: Vector2 = VarendorNavigation.nearest_free(collision, Vector2(definition.x, definition.z), .38)
		# Resolve the .38 spawn/.42 walking-body difference before the FIRST pose;
		# no origin-to-spawn or embedded-to-free interpolation is ever rendered.
		if collision.blocked(spawn, .42): spawn = collision.depenetrate(spawn, .42)
		var route: Array = definition.route.duplicate(true)
		for waypoint: Dictionary in route:
			# Arrival and navigation must agree on the same free destination. The
			# imported Godot town can obstruct an original browser activity point.
			var free: Vector2 = VarendorNavigation.nearest_free(collision, Vector2(waypoint.x, waypoint.z), .42)
			waypoint.x = free.x
			waypoint.z = free.y
		var first: Dictionary = route[0]
		var yaw: float = atan2(float(first.x) - spawn.x, float(first.z) - spawn.y)
		residents.append({"id":"ambient:" + str(int(definition.seed)), "name":definition.name, "model":definition.model, "speed":definition.speed, "route":route, "position":spawn, "previous":spawn, "yaw":yaw, "previous_yaw":yaw, "velocity":Vector2.ZERO, "state":"idle", "waypoint_index":int(definition.get("start_index",absi(int(definition.seed)) % route.size())), "timer":.8 + float(definition.get("phase",(absi(int(definition.seed) * 17) % 20) / 10.0)), "path":[], "nav_index":0, "nav_goal":Vector2.INF, "nav_cooldown":0.0, "action":"idle", "action_started_at":0.0, "work_until":-1.0, "activity":str(first.activity),"activity_clip":"","next_gesture":0.0,"civilian":definition.get("civilian",false),"role":definition.get("role","")})

func _set_action(resident: Dictionary, action: String) -> void:
	if resident.action != action:
		resident.action = action
		resident.action_started_at = clock_ms

func _resolve(start: Vector2, displacement: Vector2) -> Vector2:
	var point: Vector2 = collision.depenetrate(start, .42) if collision.blocked(start, .42) else start
	var steps: int = maxi(1, ceili(displacement.length() / .21))
	for index: int in range(steps):
		var candidate: Vector2 = point + displacement / steps
		if not collision.blocked(candidate, .42):
			point = candidate
		else:
			var slide: Vector2 = collision.depenetrate(candidate, .42)
			if not collision.blocked(slide, .42): point = slide
	return point

func _navigate(resident: Dictionary, destination: Vector2, delta: float) -> bool:
	resident.nav_cooldown = maxf(0, float(resident.nav_cooldown) - delta)
	var goal_moved: bool = (resident.nav_goal as Vector2).distance_to(destination) > .7
	if resident.nav_cooldown <= 0 and (goal_moved or resident.path.is_empty() or resident.nav_index >= resident.path.size()) and navigation_budget > 0:
		navigation_budget -= 1
		resident.path = VarendorNavigation.find_path(collision, resident.position, destination, .4, {"cellSize":.85,"margin":10,"maxVisited":4500})
		resident.nav_index = 0
		resident.nav_goal = destination
		resident.nav_cooldown = .65 if not resident.path.is_empty() else 1.0
	while resident.nav_index < resident.path.size():
		var point: Dictionary = resident.path[resident.nav_index]
		if (resident.position as Vector2).distance_to(Vector2(point.x, point.z)) >= .24: break
		resident.nav_index += 1
	if resident.nav_index >= resident.path.size(): return false
	var waypoint: Dictionary = resident.path[resident.nav_index]
	var target: Vector2 = Vector2(waypoint.x, waypoint.z)
	var from: Vector2 = resident.position
	var offset: Vector2 = target - from
	var distance: float = maxf(.0001, offset.length())
	var separation: Vector2 = Vector2.ZERO
	for neighbor: Dictionary in residents:
		if neighbor.id == resident.id: continue
		separation += _separation(from, neighbor.position)
	for point: Vector2 in service_positions:
		separation += _separation(from, point)
	for point: Vector2 in visitor_positions:
		separation += _separation(from, point)
	var intent: Vector2 = offset / distance + separation
	var displacement: Vector2 = intent / maxf(.001, intent.length()) * minf(distance, float(resident.speed) * delta)
	var resolved: Vector2 = _resolve(from, displacement)
	if resolved.distance_to(from) < .0001:
		var direction: float = 1.0 if int(resident.id.right(1)) % 2 != 0 else -1.0
		resolved = _resolve(from, Vector2(-displacement.y * direction, displacement.x * direction))
	resident.position = resolved
	resident.yaw = lerp_angle(float(resident.yaw), atan2(offset.x, offset.y), 1 - exp(-9 * delta))
	var moved: bool = resolved.distance_to(from) > .0001
	if not moved:
		resident.path = []
		resident.nav_cooldown = maxf(float(resident.nav_cooldown), .3)
	return moved

static func _separation(from: Vector2, to: Vector2) -> Vector2:
	var offset: Vector2 = from - to
	var gap: float = offset.length()
	return offset / gap * (1.1 - gap) * .85 if gap > .001 and gap < 1.1 else Vector2.ZERO

func physics_step(delta: float) -> void:
	if collision == null or delta <= 0: return
	clock_ms += delta * 1000
	last_delta = delta
	navigation_budget = 2
	for resident: Dictionary in residents:
		resident.previous = resident.position
		resident.previous_yaw = resident.yaw
		resident.timer -= delta
		var waypoint: Dictionary = resident.route[resident.waypoint_index]
		var changed: bool = false
		if resident.state == "idle" and resident.timer <= 0:
			resident.state = "walk"
			changed = true
		elif resident.state == "walk" and (resident.position as Vector2).distance_to(Vector2(waypoint.x, waypoint.z)) < .35:
			resident.state = "activity"
			resident.timer = float(waypoint.get("duration",2.5 + (int(resident.waypoint_index) % 3) * .8))
			changed = true
		elif resident.state == "activity" and resident.timer <= 0:
			resident.state = "idle"
			resident.waypoint_index = (int(resident.waypoint_index) + 1) % resident.route.size()
			resident.timer = 1.1 + (int(resident.waypoint_index) % 2) * .9
			changed = true
		waypoint = resident.route[resident.waypoint_index]
		resident.activity = str(waypoint.activity)
		if resident.state == "walk":
			_set_action(resident, "walk" if _navigate(resident, Vector2(waypoint.x, waypoint.z), delta) else "idle")
		else:
			resident.path = []
			resident.nav_index = 0
			var look: Vector2 = LOOKS.get(waypoint.activity,resident.position)
			if waypoint.has("look"): look = Vector2(waypoint.look.x,waypoint.look.z)
			var offset: Vector2 = look - (resident.position as Vector2)
			resident.yaw = lerp_angle(float(resident.yaw), atan2(offset.x, offset.y), 1 - exp(-9 * delta))
			if resident.state == "activity" and waypoint.has("clip"):
				if changed or (clock_ms >= float(resident.next_gesture) and resident.action != "gesture"):
					_set_action(resident,"gesture")
					resident.activity_clip = str(waypoint.clip)
					resident.work_until = clock_ms+1300.0
					resident.next_gesture = clock_ms+float(waypoint.get("interval",5))*1000.0
				elif resident.action == "gesture" and clock_ms >= float(resident.work_until): _set_action(resident,"idle")
			elif resident.state == "activity" and changed and waypoint.activity == "work":
				_set_action(resident, "attack")
				resident.work_until = clock_ms + 620
			elif resident.action in ["walk","gesture"] or (resident.action == "attack" and clock_ms >= float(resident.work_until)):
				_set_action(resident, "idle")
		resident.velocity = ((resident.position as Vector2) - (resident.previous as Vector2)) / delta

func sample(alpha: float = 1.0) -> Array:
	var result: Array = []
	for resident: Dictionary in residents:
		var position: Vector2 = (resident.previous as Vector2).lerp(resident.position, clampf(alpha, 0, 1))
		var velocity: Vector2 = resident.velocity
		var working: bool = resident.action in ["attack","gesture"]
		result.append({"id":resident.id,"name":resident.name,"model":resident.model,"kind":"ambient","generation":1,"x":position.x,"z":position.y,"yaw":lerp_angle(float(resident.previous_yaw),float(resident.yaw),clampf(alpha,0,1)),"velocityX":velocity.x,"velocityZ":velocity.y,"speed":resident.speed,"targetHeight":1.92,"alive":true,"dead":false,"grounded":true,"yOffset":0,"locomotionState":"ground","action":resident.action,"state":resident.state,"activity":resident.activity,"actionStartedAt":resident.action_started_at,"actionEndsAt":resident.work_until if working else 0,"hitAt":float(resident.action_started_at)+310 if working else 0,"combatState":"windup" if working else "idle"})
		result[-1]["activityClip"] = resident.activity_clip
		result[-1]["civilian"] = resident.civilian
	return result

