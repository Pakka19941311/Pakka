extends RefCounted
## Distance and elapsed time must belong to the same presentation clock.
## Sum the path between rig samples, including turns and throttled far actors.
var travelled: float = 0.0
var elapsed: float = 0.0
var direction: Vector3 = Vector3.RIGHT
var vertical: float = 0.0

func push(displacement: Vector3, dt: float) -> void:
	if dt <= 0.000001: return
	var horizontal := Vector3(displacement.x,0,displacement.z)
	travelled += horizontal.length()
	elapsed += dt
	vertical += displacement.y
	if not horizontal.is_zero_approx(): direction = horizontal.normalized()

func consume() -> Vector3:
	var velocity := direction * travelled / maxf(.000001,elapsed)
	velocity.y = vertical / maxf(.000001,elapsed)
	travelled = 0.0
	elapsed = 0.0
	vertical = 0.0
	return velocity
