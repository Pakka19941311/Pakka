class_name VarendorCollision
extends RefCounted

# Server coordinates (x,z). Same radius, rounded corners and swept slide as
# src/world/collision-world.ts; decorative overhead arches do not stop walking.
const RADIUS: float = .46
var cells: Dictionary = {}

func setup(obstacles: Array) -> void:
	cells.clear()
	for obstacle: Dictionary in obstacles:
		var ext: Vector2 = Vector2.ONE * float(obstacle.get("radius", 0))
		if obstacle.kind == "box":
			var angle: float = float(obstacle.rotation)
			ext = Vector2(absf(cos(angle)) * obstacle.halfX + absf(sin(angle)) * obstacle.halfZ, absf(sin(angle)) * obstacle.halfX + absf(cos(angle)) * obstacle.halfZ)
		var center: Vector2 = Vector2(obstacle.x, obstacle.z)
		for x: int in range(floori((center.x - ext.x) / 8), floori((center.x + ext.x) / 8) + 1):
			for z: int in range(floori((center.y - ext.y) / 8), floori((center.y + ext.y) / 8) + 1):
				var key: Vector2i = Vector2i(x, z)
				if not cells.has(key):
					cells[key] = []
				cells[key].append(obstacle)

func candidates(low: Vector2, high: Vector2) -> Array:
	var result: Array = []
	for x: int in range(floori(low.x / 8), floori(high.x / 8) + 1):
		for z: int in range(floori(low.y / 8), floori(high.y / 8) + 1):
			for obstacle: Dictionary in cells.get(Vector2i(x, z), []):
				if obstacle not in result:
					result.append(obstacle)
	return result

func blocked(point: Vector2, radius: float = RADIUS) -> bool:
	for obstacle: Dictionary in candidates(point - Vector2.ONE * radius, point + Vector2.ONE * radius):
		if not obstacle.get("blocksMovement", true):
			continue
		var offset: Vector2 = point - Vector2(obstacle.x, obstacle.z)
		if obstacle.kind == "circle":
			if offset.length() < radius + obstacle.radius:
				return true
		else:
			var local: Vector2 = offset.rotated(float(obstacle.rotation))
			var edge: Vector2 = local.clamp(Vector2(-obstacle.halfX, -obstacle.halfZ), Vector2(obstacle.halfX, obstacle.halfZ))
			if local.distance_to(edge) < radius:
				return true
	return false

func depenetrate(start: Vector2, radius: float = RADIUS) -> Vector2:
	var point: Vector2 = start
	for iteration: int in range(8):
		var pushed: bool = false
		for obstacle: Dictionary in candidates(point - Vector2.ONE * radius, point + Vector2.ONE * radius):
			if not obstacle.get("blocksMovement", true):
				continue
			var offset: Vector2 = point - Vector2(obstacle.x, obstacle.z)
			if obstacle.kind == "circle":
				var depth: float = radius + float(obstacle.radius) - offset.length()
				if depth <= 0:
					continue
				point += (offset.normalized() if offset.length() > .00000001 else Vector2.RIGHT) * (depth + .00001)
			else:
				var local: Vector2 = offset.rotated(float(obstacle.rotation))
				var edge: Vector2 = local.clamp(Vector2(-obstacle.halfX, -obstacle.halfZ), Vector2(obstacle.halfX, obstacle.halfZ))
				var normal: Vector2 = local - edge
				if normal.length() >= radius:
					continue
				var push: Vector2
				if normal.length() > .00000001:
					push = normal.normalized() * (radius - normal.length() + .00001)
				elif obstacle.halfX - absf(local.x) < obstacle.halfZ - absf(local.y):
					push = Vector2((-1 if local.x < 0 else 1) * (obstacle.halfX - absf(local.x) + radius + .00001), 0)
				else:
					push = Vector2(0, (-1 if local.y < 0 else 1) * (obstacle.halfZ - absf(local.y) + radius + .00001))
				point += push.rotated(-float(obstacle.rotation))
			pushed = true
		if not pushed:
			break
	return point

func resolve(start: Vector2, displacement: Vector2) -> Vector2:
	var point: Vector2 = depenetrate(start) if blocked(start) else start
	var steps: int = maxi(1, ceili(displacement.length() / (RADIUS * .5)))
	for index: int in range(steps):
		var candidate: Vector2 = point + displacement / steps
		if not blocked(candidate):
			point = candidate
		else:
			var slide: Vector2 = depenetrate(candidate)
			if not blocked(slide):
				point = slide
	return point

func nearest_free(point: Vector2) -> Vector2:
	if not blocked(point):
		return point
	for ring: int in range(1, 9):
		var samples: int = 12 + ring * 4
		for index: int in range(samples):
			var candidate: Vector2 = point + Vector2.RIGHT.rotated(float(index) / samples * TAU) * ring * .8
			if not blocked(candidate):
				return candidate
	return point

# Finite camera/picking sweep with real height bounds. Inputs use Godot xyz.
func ray_distance(origin: Vector3, end: Vector3, radius: float = 0.0) -> float:
	var start: Vector3 = Vector3(origin.x, origin.y, -origin.z)
	var finish: Vector3 = Vector3(end.x, end.y, -end.z)
	var direction: Vector3 = finish - start
	var closest: float = 1.0
	var a: Vector2 = Vector2(start.x, start.z)
	var b: Vector2 = Vector2(finish.x, finish.z)
	for obstacle: Dictionary in candidates(a.min(b) - Vector2.ONE * radius, a.max(b) + Vector2.ONE * radius):
		var center: Vector2 = Vector2(obstacle.x, obstacle.z)
		var angle: float = float(obstacle.get("rotation", 0))
		var local: Vector2 = (a - center).rotated(angle)
		var planar: Vector2 = Vector2(direction.x, direction.z).rotated(angle)
		var ext: Vector2 = Vector2(float(obstacle.get("halfX", obstacle.get("radius", 0))), float(obstacle.get("halfZ", obstacle.get("radius", 0)))) + Vector2.ONE * radius
		var near: float = 0.0
		var far: float = closest
		for slab: Vector4 in [Vector4(start.y, direction.y, float(obstacle.get("bottom", -1000)) - radius, float(obstacle.get("top", 1000)) + radius), Vector4(local.x, planar.x, -ext.x, ext.x), Vector4(local.y, planar.y, -ext.y, ext.y)]:
			if absf(slab.y) < .00000001:
				if slab.x < slab.z or slab.x > slab.w:
					far = -1
			else:
				var low: float = (slab.z - slab.x) / slab.y
				var high: float = (slab.w - slab.x) / slab.y
				near = maxf(near, minf(low, high))
				far = minf(far, maxf(low, high))
		if obstacle.kind == "circle":
			var aa: float = planar.length_squared()
			var bb: float = 2 * local.dot(planar)
			var cc: float = local.length_squared() - ext.x * ext.x
			if aa > .00000001:
				var disc: float = bb * bb - 4 * aa * cc
				if disc < 0:
					continue
				near = maxf(near, (-bb - sqrt(disc)) / (2 * aa))
				far = minf(far, (-bb + sqrt(disc)) / (2 * aa))
			elif cc > 0:
				continue
		if near <= far and far >= 0:
			closest = maxf(0, near)
	return direction.length() * closest
