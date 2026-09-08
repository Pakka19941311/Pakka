extends SceneTree

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var fixture: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/reference-navigation.json"))
	for item: Dictionary in fixture.cases:
		var collision: VarendorCollision = VarendorCollision.new()
		collision.setup(item.obstacles)
		var start: Vector2 = Vector2(item.start.x, item.start.z)
		var path: Array = VarendorNavigation.find_path(collision, start, Vector2(item.goal.x, item.goal.z), item.radius, item.options)
		var expected: Array = item.path
		var matches: bool = path.size() == expected.size()
		for index: int in range(mini(path.size(), expected.size())):
			matches = matches and Vector2(path[index].x, path[index].z).distance_to(Vector2(expected[index].x, expected[index].z)) < .0001
		if str(item.name) == "blocked_click_projected_free":
			# Documented exception: this exact golden browser path clips a corner.
			# Require repair plus the identical free goal, not parity with its bug.
			checks["reference_blocked_click_corner_repaired"] = not item.referenceSegmentsClear and not matches and not path.is_empty() and Vector2(path.back().x, path.back().z).distance_to(Vector2(expected.back().x, expected.back().z)) < .0001
		else:
			checks["reference_navigation_" + str(item.name)] = matches
		if not matches and str(item.name) != "blocked_click_projected_free":
			print("Navigation mismatch ", item.name, " expected=", JSON.stringify(expected), " actual=", JSON.stringify(path))
		var cursor: Vector2 = VarendorNavigation.nearest_free(collision, start, item.radius)
		var clear: bool = true
		for waypoint: Dictionary in path:
			var point: Vector2 = Vector2(waypoint.x, waypoint.z)
			clear = clear and VarendorNavigation.path_segment_is_clear(collision, cursor, point, item.radius)
			cursor = point
		checks["navigation_segments_clear_" + str(item.name)] = clear
	return checks

func _initialize() -> void:
	var checks: Dictionary = run()
	print("VARENDOR_NAVIGATION_QA " + JSON.stringify(checks))
	quit(0 if checks.values().all(func(value): return value) else 2)
