extends SceneTree
## Targeted D14 collision check with the production fixed-step movement class.
## This is numerical coverage, never a substitute for the rendered walk.
const Motor = preload("res://scripts/player_movement.gd")
const Collision = preload("res://scripts/collision.gd")

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var obstacles: Array = JSON.parse_string(FileAccess.get_file_as_string("res://world-final/geography/collision.json")).obstacles
	obstacles = obstacles.filter(func(o: Dictionary):return o.landmark != "ANCIENT_TREE")
	for file: String in ["ancient-tree-collision-D14.json", "collision-D13.json", "groundcover-collision-D13.json"]:
		obstacles.append_array(JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/" + file)).obstacles)
	var collision = Collision.new()
	collision.setup(obstacles)
	var specification: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world-final/ancient-tree-routes.json"))
	var points: Array = specification.approach_xz
	var results: Array = []
	for reverse: bool in [false, true]:
		var route: Array = points.duplicate(true)
		if reverse:route.reverse()
		var motor = Motor.new()
		motor.collision = collision
		motor.bounds_min = Vector2(-796,-696)
		motor.bounds_max = Vector2(796,696)
		motor.reconcile({"time":0,"monsters":[],"heroes":[],"character":{"id":"ancient-tree-route","generation":1,"x":route[0][0],"z":-route[0][1],"yOffset":0,"verticalVelocity":0,"grounded":true,"yaw":0,"stats":{"speed":6.2},"dead":false,"combatState":"idle"}})
		motor.input_mode = "manual"
		var passed: bool = true
		var blocking: Array = []
		for point: Array in route.slice(1):
			var target: Vector2 = Vector2(point[0],-point[1])
			var budget: int = ceili(motor.position_value.distance_to(target)/6.2*60)+150
			while motor.position_value.distance_to(target) > .16 and budget > 0:
				motor.input_direction = (target-motor.position_value).normalized()
				motor.physics_step(1.0/60.0)
				budget -= 1
			if budget == 0:
				passed = false
				for obstacle: Dictionary in collision.candidates(motor.position_value-Vector2.ONE*3,motor.position_value+Vector2.ONE*3):
					blocking.append(obstacle.id)
				break
		motor.input_direction = Vector2.ZERO
		motor.physics_step(1.0/60.0)
		var stopped: Vector2 = motor.position_value
		for i: int in range(60):motor.physics_step(1.0/60.0)
		results.append({"reverse":reverse,"arrived":passed,"position_server":[stopped.x,stopped.y],"stop_drift_m":stopped.distance_to(motor.position_value),"nearby_obstacles":blocking})
	var preserved: Dictionary = obstacles.filter(func(o: Dictionary):return o.id == specification.preserved_obstacle)[0]
	var wall: Dictionary = obstacles.filter(func(o: Dictionary):return o.id == "D14_trunk_wall_0")[0]
	var collision_controls: Dictionary = {
		"existing_tree_still_solid":collision.blocked(Vector2(preserved.x,preserved.z)),
		"hollow_wall_still_solid":collision.blocked(Vector2(wall.x,wall.z)),
		"hollow_floor_accessible":not collision.blocked(Vector2(specification.hollow_test_xz[0],-specification.hollow_test_xz[1]))
	}
	var report: Dictionary = {"headless":true,"visual_verified":false,"walks":results,"collision_controls":collision_controls,"all_pass":results.all(func(r: Dictionary):return r.arrived and r.stop_drift_m < .000001) and collision_controls.values().all(func(v: bool):return v)}
	print("ANCIENT_TREE_ROUTES " + JSON.stringify(report))
	quit(0 if report.all_pass else 3)
