class_name VarendorNavigation
extends RefCounted

# Behavioral port of src/world/navigation.ts at reference 1e94a0d1.
# Coordinates are the server's x/z plane. A click is routed immediately using
# the same collision data, endpoint connection, A* ordering and smoothing.
class Frontier:
	extends RefCounted
	var nodes: Array[Dictionary] = []
	func push(node: Dictionary) -> void:
		var index: int = nodes.size()
		nodes.append(node)
		while index > 0:
			var parent: int = (index - 1) >> 1
			if float(nodes[parent].score) <= float(node.score):
				break
			nodes[index] = nodes[parent]
			index = parent
		nodes[index] = node
	func pop() -> Dictionary:
		var first: Dictionary = nodes[0]
		var last: Dictionary = nodes.pop_back()
		if not nodes.is_empty():
			var index: int = 0
			while index * 2 + 1 < nodes.size():
				var child: int = index * 2 + 1
				if child + 1 < nodes.size() and float(nodes[child + 1].score) < float(nodes[child].score):
					child += 1
				if float(nodes[child].score) >= float(last.score):
					break
				nodes[index] = nodes[child]
				index = child
			nodes[index] = last
		return first

static func nearest_free(collision: VarendorCollision, point: Vector2, radius: float = .46) -> Vector2:
	if not collision.blocked(point, radius):
		return point
	for ring: int in range(1, 9):
		var samples: int = 12 + ring * 4
		for index: int in range(samples):
			var candidate: Vector2 = point + Vector2.RIGHT.rotated(float(index) / samples * TAU) * ring * .8
			if not collision.blocked(candidate, radius):
				return candidate
	return point

static func _segment_clear(collision: VarendorCollision, start: Vector2, goal: Vector2, radius: float, sample_step: float) -> bool:
	var samples: int = maxi(1, ceili(start.distance_to(goal) / sample_step))
	for index: int in range(1, samples + 1):
		if collision.blocked(start.lerp(goal, float(index) / samples), radius):
			return false
	return true

static func path_segment_is_clear(collision: VarendorCollision, start: Vector2, goal: Vector2, radius: float = .46) -> bool:
	return _segment_clear(collision, start, goal, radius, .35)

static func _point(cell: Vector2i, origin: Vector2, cell_size: float) -> Vector2:
	return origin + Vector2(cell) * cell_size

static func _endpoint_cell(collision: VarendorCollision, point: Vector2, origin: Vector2, bounds: Vector2i, radius: float, cell_size: float) -> Variant:
	var center: Vector2i = Vector2i(clampi(floori((point.x - origin.x) / cell_size + .5), 0, bounds.x), clampi(floori((point.y - origin.y) / cell_size + .5), 0, bounds.y))
	for ring: int in range(4):
		var best: Variant = null
		var distance: float = INF
		for dx: int in range(-ring, ring + 1):
			for dz: int in range(-ring, ring + 1):
				if maxi(absi(dx), absi(dz)) != ring:
					continue
				var cell: Vector2i = center + Vector2i(dx, dz)
				if cell.x < 0 or cell.y < 0 or cell.x > bounds.x or cell.y > bounds.y:
					continue
				var candidate: Vector2 = _point(cell, origin, cell_size)
				var gap: float = candidate.distance_to(point)
				if gap < distance and not collision.blocked(candidate, radius) and _segment_clear(collision, point, candidate, radius, cell_size * .3):
					best = cell
					distance = gap
		if best != null:
			return best
	return null

static func _smooth(collision: VarendorCollision, start: Vector2, path: Array[Vector2], radius: float, cell_size: float) -> Array:
	var result: Array = []
	var anchor: Vector2 = start
	var index: int = 0
	while index < path.size():
		var furthest: int = index
		for candidate: int in range(path.size() - 1, index - 1, -1):
			# Reference's coarse sample can miss the inside of a rounded corner.
			# Keep its ordering, but require the public .35 segment contract too.
			if _segment_clear(collision, anchor, path[candidate], radius, cell_size * .45) and path_segment_is_clear(collision, anchor, path[candidate], radius):
				furthest = candidate
				break
		anchor = path[furthest]
		result.append({"x": anchor.x, "z": anchor.y})
		index = furthest + 1
	return result

static func find_path(collision: VarendorCollision, requested_start: Vector2, requested_goal: Vector2, radius: float = .46, options: Dictionary = {}) -> Array:
	var cell_size: float = float(options.get("cellSize", 1.15))
	var margin: float = float(options.get("margin", 8))
	var max_visited: int = int(options.get("maxVisited", 8000))
	var start: Vector2 = nearest_free(collision, requested_start, radius)
	var goal: Vector2 = nearest_free(collision, requested_goal, radius)
	if _segment_clear(collision, start, goal, radius, cell_size * .45):
		return [{"x": goal.x, "z": goal.y}]
	var origin: Vector2 = start.min(goal) - Vector2.ONE * margin
	var bounds: Vector2i = Vector2i(maxi(3, ceili((maxf(start.x, goal.x) - origin.x + margin) / cell_size)), maxi(3, ceili((maxf(start.y, goal.y) - origin.y + margin) / cell_size)))
	var grid_start: Variant = _endpoint_cell(collision, start, origin, bounds, radius, cell_size)
	var grid_goal: Variant = _endpoint_cell(collision, goal, origin, bounds, radius, cell_size)
	if grid_start == null or grid_goal == null:
		return []
	var open: Frontier = Frontier.new()
	open.push({"cell": grid_start, "score": 0.0})
	var costs: Dictionary = {grid_start: 0.0}
	var previous: Dictionary = {}
	var closed: Dictionary = {}
	while not open.nodes.is_empty() and closed.size() < max_visited:
		var current: Vector2i = open.pop().cell
		if closed.has(current):
			continue
		if current == grid_goal:
			var path: Array[Vector2] = [goal]
			var cursor: Vector2i = current
			while cursor != grid_start:
				path.push_front(_point(cursor, origin, cell_size))
				cursor = previous.get(cursor, grid_start)
			return _smooth(collision, start, path, radius, cell_size)
		closed[current] = true
		var current_cost: float = float(costs.get(current, INF))
		for dx: int in [-1, 0, 1]:
			for dz: int in [-1, 0, 1]:
				if dx == 0 and dz == 0:
					continue
				var next: Vector2i = current + Vector2i(dx, dz)
				if next.x < 0 or next.y < 0 or next.x > bounds.x or next.y > bounds.y:
					continue
				if closed.has(next) or collision.blocked(_point(next, origin, cell_size), radius):
					continue
				if dx != 0 and dz != 0:
					if collision.blocked(_point(current + Vector2i(dx, 0), origin, cell_size), radius) or collision.blocked(_point(current + Vector2i(0, dz), origin, cell_size), radius):
						continue
				var next_cost: float = current_cost + (sqrt(2.0) if dx != 0 and dz != 0 else 1.0)
				if next_cost >= float(costs.get(next, INF)):
					continue
				costs[next] = next_cost
				previous[next] = current
				open.push({"cell": next, "score": next_cost + Vector2(grid_goal - next).length()})
	return [{"x": goal.x, "z": goal.y}] if _segment_clear(collision, start, goal, radius, cell_size * .3) else []
