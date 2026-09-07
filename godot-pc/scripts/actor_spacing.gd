class_name VarendorActorSpacing
extends RefCounted

# Exact swept-circle/tangent contract of src/controls/actor-spacing.ts.
static func slide(from: Vector2, displacement: Vector2, center: Vector2, radius: float) -> Vector2:
	var offset: Vector2 = from-center
	var distance: float = offset.length()
	if distance < radius+.0001:
		if distance < .0001: return displacement
		var normal: Vector2 = offset/distance
		return displacement-minf(0,displacement.dot(normal))*normal
	var a: float = displacement.length_squared()
	if a < .000000000001: return displacement
	var b: float = 2*offset.dot(displacement)
	var c: float = offset.length_squared()-radius*radius
	var discriminant: float = b*b-4*a*c
	if discriminant <= 0 or b >= 0: return displacement
	var hit: float = (-b-sqrt(discriminant))/(2*a)
	if hit < 0 or hit > 1: return displacement
	var t: float = maxf(0,hit-.0001)
	var normal: Vector2 = (offset+displacement*hit)/radius
	var remaining: Vector2 = displacement*(1-t)
	return displacement*t+remaining-minf(0,remaining.dot(normal))*normal
