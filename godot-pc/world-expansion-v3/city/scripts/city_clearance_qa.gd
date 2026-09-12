extends "res://world-expansion-v3/city/scripts/city_sample.gd"

# Read-only snapshot of camera_controller.gd defaults on 2026-09-12.
# This probe tests the desired ray, not the live controller's clipping integration.
const PROBE_LOOK_AHEAD := 2.15
const PROBE_PITCH := PI/2.0-1.06
const PROBE_ZOOM := 10.5
var clearance: Dictionary = {"hero_height":2.05,"server_capsule_radius":0.46,"tested_radii":[0.46,0.54],"lateral_offsets":[-0.45,0,0.45],"floor_clearance":0.03,"mesh_bounds":[],"gate_sweep":[],"gate_cross_sections":[],"stairs_surface":[],"door_probe":[]}

func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--city-output="): output = argument.trim_prefix("--city-output=")
	capture_mode = true
	build()
	call_deferred("audit_clearance")

func obstruction(at: Vector3, radius: float = .46) -> Array:
	var shape := CapsuleShape3D.new()
	shape.radius = radius
	shape.height = 2.05
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis.IDENTITY,at+Vector3(0,1.055,0))
	var hits := world.get_world_3d().direct_space_state.intersect_shape(query,32)
	var names: Array = []
	for hit: Dictionary in hits:
		var path := str((hit.collider as Node).get_parent().get_path())
		if not path in names: names.append(path)
	return names

func ray(at: Vector3, to: Vector3) -> Dictionary:
	var query := PhysicsRayQueryParameters3D.create(at,to)
	query.hit_back_faces = true
	var hit := world.get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty(): return {}
	return {"position":[hit.position.x,hit.position.y,hit.position.z],"distance":at.distance_to(hit.position),"mesh":str((hit.collider as Node).get_parent().get_path())}

func audit_clearance() -> void:
	await get_tree().physics_frame
	await get_tree().physics_frame
	for mesh: MeshInstance3D in world.find_children("*","MeshInstance3D",true,false):
		if not ("housepack" in str(mesh.get_path()).to_lower() or "gatehouse" in str(mesh.get_path()).to_lower()): continue
		var bounds: AABB = mesh.global_transform * mesh.get_aabb()
		clearance.mesh_bounds.append({"path":str(mesh.get_path()),"position":[bounds.position.x,bounds.position.y,bounds.position.z],"size":[bounds.size.x,bounds.size.y,bounds.size.z]})
	for radius: float in [.46,.54]:
		for x: float in [-.45,0,.45]:
			for step: int in range(129):
				var z := -34.0+step*.25
				var hits := obstruction(Vector3(x,0,z),radius)
				if not hits.is_empty(): clearance.gate_sweep.append({"x":x,"z":z,"radius":radius,"hits":hits})
	for step: int in range(81):
		var z := -28.0+step*.2
		var pivot := Vector3(0,1.35,z-PROBE_LOOK_AHEAD)
		var direction := Vector3(0,sin(PROBE_PITCH),cos(PROBE_PITCH))
		var wanted := pivot+direction*PROBE_ZOOM
		clearance.gate_cross_sections.append({"z":z,"left":ray(Vector3(0,1.5,z),Vector3(-10,1.5,z)),"right":ray(Vector3(0,1.5,z),Vector3(10,1.5,z)),"ceiling":ray(Vector3(0,2.08,z),Vector3(0,20,z)),"camera_unclipped_default":ray(Vector3(0,1.25,z),wanted)})
	for step: int in range(25):
		var x := -10.5-step*.22
		clearance.stairs_surface.append({"x":x,"surface":ray(Vector3(x,3.7,2.8),Vector3(x,-.1,2.8))})
	for x: float in [-8.0,-9.0,-9.7,-10.0,-10.3,-10.6,-11.0]:
		clearance.door_probe.append({"x":x,"feet_y":.5688,"hits":obstruction(Vector3(x,.5688,12.57))})
	DirAccess.make_dir_recursive_absolute(output)
	FileAccess.open(output.path_join("CITY_CLEARANCE_QA.json"),FileAccess.WRITE).store_string(JSON.stringify(clearance,"\t"))
	print("P2_CITY_CLEARANCE_DONE blockers=",clearance.gate_sweep.size())
	set_process(false)
	for actor: Node3D in actor_list:
		var controller: VarendorAnimationController = actor.get_meta("animation_controller")
		controller.actor = null
		controller.visual = null
		controller.player = null
		actor.remove_meta("animation_controller")
	actor_list.clear()
	world.templates.clear()
	world.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	get_tree().quit()
