class_name VarendorPlayerMovement
extends RefCounted

# Client prediction of the server motor. Only fixed physics ticks integrate this
# state. Rendering reads an interpolated pose; snapshots reconcile past ticks.
const GRAVITY: float = 22.0
const JUMP_SPEED: float = 8.2
var collision: VarendorCollision
var position_value: Vector2 = Vector2.ZERO
var previous_position: Vector2 = Vector2.ZERO
var velocity: Vector2 = Vector2.ZERO
var actual_velocity: Vector2 = Vector2.ZERO
var height: float = 0.0
var previous_height: float = 0.0
var vertical_velocity: float = 0.0
var grounded: bool = true
var locomotion_state: String = "ground"
var jump_age: float = 0.0
var land_left: float = 0.0
var yaw: float = 0.0
var previous_yaw: float = 0.0
var input_direction: Vector2 = Vector2.ZERO
var input_mode: String = "idle"
var destination: Variant = null
var navigation_path: Array = []
var authoritative: Dictionary = {}
var bodies: Array = []
var radius: float = .46
var speed: float = 6.2
var generation: int = -1
var identity: String = ""
var clock_ms: float = 0.0
var history: Array = []
var visual_correction: Vector2 = Vector2.ZERO
var jump_wait_ground: bool = false
var jump_sent_sequence: int = -1
var last_sent_sequence: int = 0
var intent_pending: bool = false
var manual_cancel_pending: bool = false
var facing_direction: Vector2 = Vector2(0, 1)
var combat_target: String = ""
var approaching: bool = false
var navigation_goal: Vector2 = Vector2(INF, INF)
var navigation_cooldown: float = 0.0

func reconcile(snapshot: Dictionary) -> bool:
	var hero: Dictionary = snapshot.character
	var new_identity: bool = identity != str(hero.id) or generation != int(hero.generation)
	authoritative = hero.duplicate(true)
	bodies = snapshot.get("monsters", []).filter(func(m: Dictionary): return bool(m.alive))
	bodies.append_array(snapshot.get("heroes", []).filter(func(h: Dictionary): return str(h.id) != str(hero.id) and not bool(h.dead)))
	radius = float(hero.get("bodyRadius", .46))
	speed = float(hero.stats.get("speed", 6.2))
	if new_identity:
		identity = str(hero.id)
		generation = int(hero.generation)
		position_value = Vector2(hero.x, hero.z)
		previous_position = position_value
		height = float(hero.yOffset)
		previous_height = height
		vertical_velocity = float(hero.get("verticalVelocity", 0))
		grounded = bool(hero.grounded)
		yaw = float(hero.yaw)
		previous_yaw = yaw
		facing_direction = Vector2(sin(yaw), cos(yaw))
		velocity = Vector2.ZERO
		visual_correction = Vector2.ZERO
		history.clear()
		clock_ms = float(snapshot.time)
		input_mode = "idle"
		input_direction = Vector2.ZERO
		destination = null
		navigation_path.clear()
		intent_pending = false
		manual_cancel_pending = false
		jump_wait_ground = false
		combat_target = ""
		approaching = false
		navigation_goal = Vector2(INF, INF)
		return true
	# Compare the received pose to the prediction at that SAME server time.
	# Never blend an old server position into the current moving position.
	var reference: Vector2 = position_value
	var found: bool = false
	for index: int in range(history.size() - 1, -1, -1):
		if float(history[index].time) <= float(snapshot.time):
			reference = history[index].position
			if index + 1 < history.size():
				var span: float = float(history[index + 1].time) - float(history[index].time)
				reference = reference.lerp(history[index + 1].position, clampf((float(snapshot.time) - float(history[index].time)) / maxf(1, span), 0, 1))
			found = true
			break
	# An ACK predating the newest reserved command describes another control
	# state. It cannot erase that command's predicted travel while in flight.
	if int(hero.lastInputSequence) >= last_sent_sequence and (found or input_mode == "idle"):
		var error: Vector2 = Vector2(hero.x, hero.z) - reference
		if error.length() > .015:
			var corrected: Vector2 = collision.resolve(position_value, error)
			var applied: Vector2 = corrected - position_value
			position_value = corrected
			previous_position += applied
			visual_correction -= applied
			for frame: Dictionary in history:
				frame.position += applied
	clock_ms = maxf(clock_ms, float(snapshot.time))
	if int(hero.lastInputSequence) >= last_sent_sequence:
		intent_pending = false
		manual_cancel_pending = false
		if input_mode != "manual":
			# A locally planned path starts on the input tick. Server paths are
			# needed for blocked firing lines, not to rewind an already used path.
			if input_mode == "combat" and not combat_line_clear():
				navigation_path = hero.get("navigationPath", []).duplicate(true)
			if hero.get("destination") == null and hero.get("target") == null:
				input_mode = "idle"
				destination = null
				combat_target = ""
	if bool(hero.dead):
		cancel_planar()
		grounded = true
		height = 0
		vertical_velocity = 0
	elif not grounded:
		# A jump is locally integrated until landing. Old grounded/airborne
		# snapshots must not replay a jump or produce a second landing bounce.
		pass
	elif bool(hero.grounded) and int(hero.lastInputSequence) >= jump_sent_sequence:
		jump_wait_ground = false
		jump_sent_sequence = -1
	elif not jump_wait_ground and jump_sent_sequence < 0:
		grounded = false
		height = float(hero.yOffset)
		vertical_velocity = float(hero.get("verticalVelocity", 0))
	return false

func submit(value: Dictionary) -> void:
	intent_pending = true
	match str(value.type):
		"direction":
			var requested: Vector2 = Vector2(value.x, value.z).limit_length(1)
			if not requested.is_zero_approx():
				input_mode = "manual"
				input_direction = requested
				destination = null
				navigation_path.clear()
				combat_target = ""
				manual_cancel_pending = true
			elif input_mode == "manual":
				# Reference key release uses the motor's natural 30/s friction.
				input_direction = Vector2.ZERO
				input_mode = "idle"
		"destination":
			input_direction = Vector2.ZERO
			combat_target = ""
			manual_cancel_pending = true
			input_mode = "destination"
			destination = collision.nearest_free(Vector2(value.x, value.z))
			plan_path(destination, true)
		"attack":
			if str(value.get("entityId", "")) != combat_target:
				manual_cancel_pending = true
			input_direction = Vector2.ZERO
			destination = null
			navigation_path.clear()
			navigation_goal = Vector2(INF, INF)
			navigation_cooldown = 0
			combat_target = str(value.get("entityId", ""))
			approaching = false
			input_mode = "combat"
		"cancel":
			cancel_planar()
			manual_cancel_pending = true
		"jump":
			request_jump()

func sent(value: Dictionary, sequence: int) -> void:
	last_sent_sequence = sequence
	if value.type == "jump": jump_sent_sequence = sequence

func request_jump() -> bool:
	if not grounded or jump_wait_ground or bool(authoritative.get("dead", false)):
		return false
	if input_mode != "manual": cancel_planar()
	manual_cancel_pending = true
	grounded = false
	jump_age = 0
	land_left = 0
	vertical_velocity = JUMP_SPEED
	locomotion_state = "jump_start"
	return true

func cancel_planar() -> void:
	input_direction = Vector2.ZERO
	velocity = Vector2.ZERO
	actual_velocity = Vector2.ZERO
	destination = null
	navigation_path.clear()
	input_mode = "idle"
	combat_target = ""
	approaching = false
	navigation_goal = Vector2(INF, INF)

func segment_clear(start: Vector2, goal: Vector2) -> bool:
	return VarendorNavigation.path_segment_is_clear(collision, start, goal, radius)

func plan_path(goal: Vector2, force: bool = false) -> void:
	if force or (navigation_cooldown <= 0 and (navigation_goal.distance_to(goal) > .7 or navigation_path.is_empty())):
		navigation_path = VarendorNavigation.find_path(collision, position_value, goal, radius, {"cellSize":.85,"margin":24,"maxVisited":4500})
		navigation_goal = goal
		navigation_cooldown = .18 if not navigation_path.is_empty() else 1.0

func target_body() -> Dictionary:
	for body: Dictionary in bodies:
		if str(body.get("uid", body.get("id", ""))) == combat_target:
			return body
	return {}

func combat_line_clear() -> bool:
	var target: Dictionary = target_body()
	if target.is_empty(): return false
	return segment_clear(position_value, Vector2(target.x, target.z))

func physics_step(dt: float) -> void:
	if authoritative.is_empty() or dt <= 0: return
	previous_position = position_value
	previous_height = height
	previous_yaw = yaw
	clock_ms += dt * 1000
	navigation_cooldown = maxf(0, navigation_cooldown - dt)
	var direction: Vector2 = input_direction if input_mode == "manual" else Vector2.ZERO
	var remaining: float = INF
	var face_target: Variant = null
	var combat_lock: bool = str(authoritative.get("combatState", "idle")) in ["windup", "recovery"] and not manual_cancel_pending and input_mode != "manual"
	if bool(authoritative.get("dead", false)) or combat_lock:
		direction = Vector2.ZERO
		velocity = Vector2.ZERO
	elif input_mode in ["destination", "combat"]:
		if input_mode == "combat":
			var target: Dictionary = target_body()
			if target.is_empty():
				cancel_planar()
			else:
				var center: Vector2 = Vector2(target.x, target.z)
				var distance: float = position_value.distance_to(center)
				var attack_range: float = float(authoritative.get("attackRange", 2.6))
				if distance > attack_range: approaching = true
				var stop_distance: float = minf(attack_range, maxf(attack_range * (.9 if approaching else 1.0), radius + float(target.get("bodyRadius", .46)) + .04))
				if combat_line_clear() and distance <= stop_distance:
					approaching = false
					velocity = Vector2.ZERO
					navigation_path.clear()
					face_target = center
				elif combat_line_clear():
					var goal: Vector2 = center + (position_value - center).normalized() * maxf(.35, attack_range * .78)
					plan_path(goal)
				# A blocked firing line waits for the server's vetted firing
				# position; never collapse ranged reach to the monster centre.
		elif destination != null:
			if position_value.distance_to(destination) < .18:
				destination = null
				navigation_path.clear()
				input_mode = "idle"
			else: plan_path(destination)
		while not navigation_path.is_empty() and position_value.distance_to(Vector2(navigation_path[0].x, navigation_path[0].z)) < (.01 if input_mode == "combat" else .1):
			navigation_path.pop_front()
		if not navigation_path.is_empty():
			var next: Vector2 = Vector2(navigation_path[0].x, navigation_path[0].z)
			direction = (next - position_value).normalized()
			remaining = next.distance_to(position_value)
	if not direction.is_zero_approx(): direction = direction.normalized()
	var rate: float = 19.0 if not direction.is_zero_approx() else 30.0
	var blend: float = 1.0 - exp(-rate * dt)
	var desired: Vector2 = direction * speed
	velocity += (desired - velocity) * blend
	var displacement: Vector2 = velocity * dt
	if not direction.is_zero_approx(): facing_direction = direction
	if displacement.length() > remaining:
		displacement = displacement.limit_length(remaining)
		velocity = Vector2.ZERO
	for body: Dictionary in bodies:
		var center: Vector2 = Vector2(body.x,body.z)
		var spacing: float = radius+float(body.get("bodyRadius",.46))
		if absf(center.x-position_value.x) > spacing+absf(displacement.x) or absf(center.y-position_value.y) > spacing+absf(displacement.y): continue
		displacement = VarendorActorSpacing.slide(position_value,displacement,center,spacing)
	var next: Vector2 = collision.resolve(position_value,displacement).clamp(Vector2(-156,-136),Vector2(156,136))
	position_value = next
	actual_velocity = (position_value - previous_position) / dt
	if actual_velocity.length() > .08:
		yaw = lerp_angle(yaw, atan2(facing_direction.x, facing_direction.y), 1 - exp(-16 * dt))
	elif face_target != null:
		yaw = lerp_angle(yaw, atan2(face_target.x-position_value.x, face_target.y-position_value.y), 1 - exp(-9 * dt))
	elif str(authoritative.get("combatState", "idle")) in ["face", "windup", "recovery"]:
		yaw = lerp_angle(yaw, float(authoritative.yaw), 1 - exp(-9 * dt))
	if not grounded:
		jump_age += dt
		vertical_velocity -= GRAVITY * dt
		height += vertical_velocity * dt
		if height <= 0 and vertical_velocity < 0:
			height = 0
			vertical_velocity = 0
			grounded = true
			jump_wait_ground = true
			land_left = .10
	else:
		land_left = maxf(0, land_left - dt)
	locomotion_state = ("land" if land_left > 0 else "ground") if grounded else "jump_start" if jump_age <= .06 else "airborne" if vertical_velocity > 0 else "fall"
	visual_correction = visual_correction.lerp(Vector2.ZERO, 1 - exp(-22 * dt))
	history.append({"time":clock_ms,"position":position_value})
	while history.size() > 180: history.pop_front()

func render_pose(alpha: float) -> Dictionary:
	var position: Vector2 = previous_position.lerp(position_value, clampf(alpha, 0, 1)) + visual_correction
	# Render correction is swept too; smoothing never displays the hero inside a wall.
	position = collision.resolve(position_value, position - position_value)
	return {"x":position.x,"z":position.y,"yOffset":lerpf(previous_height,height,clampf(alpha,0,1)),"yaw":lerp_angle(previous_yaw,yaw,clampf(alpha,0,1)),"velocityX":actual_velocity.x,"velocityZ":actual_velocity.y,"verticalVelocity":vertical_velocity,"locomotionState":locomotion_state}
