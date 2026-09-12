extends RefCounted
## Ordinary golem contact uses a compact elemental impact, never a pale slash ray.
## The server's aimed-line path is handled earlier and retains its fixed endpoints.
static func element(source: Node3D) -> String:
	var species: String = str(source.get_meta("motion",{}).get("id",""))
	if species=="ice_golem": return "ice"
	if species in ["fire_golem","rift_boss","cave_boss"]: return "fire"
	var model: String = str(source.get_meta("model",""))
	return "ice" if model=="IceGolem" else "fire" if model in ["FireGolem","RiftWarden"] else ""

static func show(world: Node3D,event: Dictionary,source: Node3D,target: Node3D) -> bool:
	var kind: String = element(source)
	if kind.is_empty(): return false
	var color: Color = Color("ff6528") if kind=="fire" else Color("36baff")
	var start: Vector3 = world.point(source.position.x,-source.position.z,float(source.get_meta("pick_size",Vector3(1,2,1)).y)*.62)
	var end: Vector3 = world.point(target.position.x,-target.position.z,1.4)
	if event.has("origin"): start=Vector3(event.origin.x,event.origin.y,-event.origin.z)
	if event.has("destination"): end=Vector3(event.destination.x,event.destination.y,-event.destination.z)
	var sphere: SphereMesh = SphereMesh.new()
	sphere.radius=.27;sphere.height=.54
	sphere.radial_segments=12 if kind=="fire" else 6
	sphere.rings=6 if kind=="fire" else 3
	var node: MeshInstance3D = world.effect_mesh(color,sphere)
	node.set_meta("golem_element",kind)
	var duration: float = float(event.get("durationMs",0))/1000.0
	if duration>0:
		var age: float=float(event.get("presentationAgeMs",0))/1000.0
		node.position=start.lerp(end,clampf(age/duration,0,1))
		world.effects.append({"node":node,"start":start,"end":end,"left":maxf(0,duration-age),"duration":duration,"target":str(event.target),"target_generation":int(event.get("generation",target.get_meta("motion",{}).get("generation",0))),"arrow":false})
	else:
		# Damage already happened at contact: no invented travel time or long beam.
		node.position=end
		world.effects.append({"node":node,"left":.20,"duration":.20})
		var ring: TorusMesh=TorusMesh.new();ring.inner_radius=.22;ring.outer_radius=.39
		var rim: MeshInstance3D=world.effect_mesh(color,ring)
		rim.position=end;rim.set_meta("golem_element",kind)
		world.effects.append({"node":rim,"left":.20,"duration":.20})
	return true
