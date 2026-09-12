extends SceneTree
const Index = preload("res://scripts/support_height_index.gd")

func reference(surfaces: Array, x: float, z: float, base: float) -> float:
	var height: float = base
	for surface: Dictionary in surfaces:
		var local: Vector2 = Vector2(x-float(surface.x),z-float(surface.z)).rotated(float(surface.angle))
		if absf(local.x)<=float(surface.halfX) and absf(local.y)<=float(surface.halfZ):
			height = maxf(height,lerpf(float(surface.high),float(surface.y),(local.y+float(surface.halfZ))/(2*float(surface.halfZ))) if surface.kind == "ramp_z" else float(surface.y))
	return height

func _initialize() -> void:
	var surfaces: Array = JSON.parse_string(FileAccess.get_file_as_string("res://world-final/geography/support-surfaces.json")).surfaces
	surfaces.append_array(JSON.parse_string(FileAccess.get_file_as_string("res://world-final/castle/courtyard-p2.json")).get("supportSurfaces",[]))
	var index = Index.new()
	index.setup(surfaces)
	var probes: Array[Vector2] = []
	for surface: Dictionary in surfaces:
		for u: float in [-1.001,-1.0,-.999,-.5,0,.5,.999,1.0,1.001]:
			for v: float in [-1.001,-1.0,-.999,-.5,0,.5,.999,1.0,1.001]:
				probes.append(Vector2(float(surface.x),float(surface.z))+Vector2(u*float(surface.halfX),v*float(surface.halfZ)).rotated(-float(surface.angle)))
	for x: int in range(-800,801,16):
		for z: int in range(-700,701,16):
			probes.append(Vector2(x,z))
	var largest_error: float = 0.0
	for point: Vector2 in probes:
		for base: float in [-100.0,40.0,72.0,100.0]:
			largest_error = maxf(largest_error,absf(index.height_at(point.x,point.y,base)-reference(surfaces,point.x,point.y,base)))
	var checks: Dictionary = {"actual_supports":surfaces.size()==39,"plate_ramp_edge_and_world_grid":largest_error<.000001,"no_forest_supports":not index.cells.has(Vector2i(-18,13))}
	var timings: Dictionary = {}
	for method: String in ["reference","indexed"]:
		var start: int = Time.get_ticks_usec()
		var checksum: float = 0.0
		for i: int in range(10000):
			var x: float = -284.0+float(i%10)*.1
			checksum += reference(surfaces,x,208.0,51.7) if method=="reference" else index.height_at(x,208.0,51.7)
		timings[method] = {"microseconds":Time.get_ticks_usec()-start,"checksum":checksum,"queries":10000}
	checks.same_query_checksum = timings.reference.checksum==timings.indexed.checksum
	index.setup([])
	checks.space_change_clears_supports = index.cells.is_empty() and is_equal_approx(index.height_at(-100.0,150.0,4.0),4.0)
	index.setup(surfaces)
	checks.return_restores_supports = index.surface_count==39 and absf(index.height_at(float(surfaces[0].x),float(surfaces[0].z),-100.0)-reference(surfaces,float(surfaces[0].x),float(surfaces[0].z),-100.0))<.000001
	var environment = preload("res://world-final/gameplay_environment.gd").new()
	environment.terrain={"bounds":[-1024,-1024,1024,1024],"columns":1,"rows":1,"step":2048}
	environment.heights=PackedFloat32Array([0,0,0,0])
	environment.supports=surfaces
	environment.support_index.setup(surfaces)
	var signs_match: bool = true
	for surface: Dictionary in surfaces:
		var x: float = float(surface.x)
		var z: float = float(surface.z)
		signs_match = signs_match and absf(environment.height_at(x,-z)-reference(surfaces,x,z,0))<.000001 and environment.height_at(x,-z,false)==0.0
	checks.environment_server_z_and_raw_ground = signs_match
	environment.free()
	print("SUPPORT_HEIGHT_ACCEPTANCE ",JSON.stringify({"checks":checks,"queries":probes.size()*4,"maximum_height_error":largest_error,"timings":timings}))
	quit(0 if checks.values().all(func(value):return value==true) else 2)
