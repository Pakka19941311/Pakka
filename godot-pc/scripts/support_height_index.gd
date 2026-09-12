extends RefCounted

## Broad phase for immutable terrain support plates/ramps. Inputs are Godot X/Z;
## the exact rotated-rectangle and ramp equations remain the narrow phase.
const CELL_SIZE: float = 16.0
var cells: Dictionary = {}
var surface_count: int = 0

func setup(surfaces: Array) -> void:
	cells.clear()
	surface_count = surfaces.size()
	for surface: Dictionary in surfaces:
		var cosine: float = cos(float(surface.angle))
		var sine: float = sin(float(surface.angle))
		var half_x: float = float(surface.halfX)
		var half_z: float = float(surface.halfZ)
		var center := Vector2(float(surface.x),float(surface.z))
		var extent := Vector2(absf(cosine)*half_x+absf(sine)*half_z,absf(sine)*half_x+absf(cosine)*half_z)
		# Include numerical boundary cells; the exact test below rejects any
		# over-inclusion. Authored support heights and dimensions are unchanged.
		var low: Vector2 = center-extent-Vector2.ONE*.001
		var high: Vector2 = center+extent+Vector2.ONE*.001
		var record: Dictionary = {"x":float(surface.x),"z":float(surface.z),"angle":float(surface.angle),
			"hx":half_x,"hz":half_z,"ramp":str(surface.kind)=="ramp_z",
			"y":float(surface.y),"high":float(surface.get("high",surface.y))}
		for x: int in range(floori(low.x/CELL_SIZE),floori(high.x/CELL_SIZE)+1):
			for z: int in range(floori(low.y/CELL_SIZE),floori(high.y/CELL_SIZE)+1):
				var key := Vector2i(x,z)
				if not cells.has(key): cells[key] = []
				cells[key].append(record)

func height_at(x: float, z: float, base_height: float) -> float:
	var result: float = base_height
	for surface: Dictionary in cells.get(Vector2i(floori(x/CELL_SIZE),floori(z/CELL_SIZE)),[]):
		var local: Vector2 = Vector2(x-float(surface.x),z-float(surface.z)).rotated(float(surface.angle))
		if absf(local.x)<=float(surface.hx) and absf(local.y)<=float(surface.hz):
			var height: float = lerpf(float(surface.high),float(surface.y),(local.y+float(surface.hz))/(2.0*float(surface.hz))) if surface.ramp else float(surface.y)
			result = maxf(result,height)
	return result
