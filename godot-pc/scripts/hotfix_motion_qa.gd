extends SceneTree

const Pending = preload("res://scripts/player_pending_qa.gd")
const STEP: float = 1.0/60.0

func _initialize() -> void:
	var checks: Dictionary = {}
	for direction: Vector2 in [Vector2.RIGHT,Vector2.LEFT,Vector2.UP,Vector2.DOWN,Vector2(1,1).normalized()]:
		for sign_value: float in [-1.0,1.0]:
			var value: VarendorPlayerMovement = VarendorPlayerMovement.new()
			value.collision = VarendorCollision.new()
			value.reconcile(Pending.snapshot(1000,Vector2.ZERO,0))
			value.sent({"type":"direction"},1)
			value.submit({"type":"direction","x":direction.x,"z":direction.y})
			for tick: int in range(60): value.physics_step(STEP)
			var before: Vector2 = value.position_value
			var snapshot: Dictionary = Pending.snapshot(value.clock_ms,before+direction*2.0*sign_value,1)
			value.reconcile(snapshot)
			var authoritative: bool = value.position_value.distance_to(before+direction*2.0*sign_value)<.00001
			var previous: Vector2 = rendered(value)
			var forward: bool = true
			for tick: int in range(180):
				value.physics_step(STEP)
				var shown: Vector2 = rendered(value)
				forward = forward and (shown-previous).dot(direction) >= -.00001
				previous = shown
			checks[str(direction)+"/"+str(sign_value)] = authoritative and forward and value.visual_correction.length()<.0001
	var ok: bool = checks.values().all(func(v): return v)
	print("HOTFIX_MOTION "+JSON.stringify({"ok":ok,"checks":checks}))
	quit(0 if ok else 1)

static func rendered(value: VarendorPlayerMovement) -> Vector2:
	var pose: Dictionary = value.render_pose(.5)
	return Vector2(pose.x,pose.z)
