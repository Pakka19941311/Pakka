class_name VarendorLineEffects
extends Node3D
## Immutable server capsules. Only presentation geometry and short pulses live here.
const SURFACE_STEP: float=.30
const BORDER_WIDTH: float=.045
const PULSE_SECONDS: float=.18
var world: Node3D
var telegraphs: Dictionary={}
var pulses: Array[Dictionary]=[]
var seen_releases: Dictionary={}
var active_space: String=""
var ignored_mutations: int=0
var surface_samples: Dictionary={}

func setup(value: Node3D) -> void:
	world=value
	if world.has_signal("event_presented") and not world.event_presented.is_connected(on_event):world.event_presented.connect(on_event)

static func space_of(snapshot: Dictionary) -> String:
	return str(snapshot.get("character",{}).get("spaceId",snapshot.get("spaceId","surface")))

static func planar(point: Dictionary) -> Vector2:
	return Vector2(float(point.get("x",NAN)),float(point.get("z",NAN)))

static func color_for(effect: String,alpha: float=1.0) -> Color:
	var value: Color=Color("ff8b42") if effect=="fire" else Color("8adeff")
	value.a=alpha
	return value

func material(vertex_colors: bool=false) -> StandardMaterial3D:
	var value: StandardMaterial3D=StandardMaterial3D.new()
	value.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	value.cull_mode=BaseMaterial3D.CULL_DISABLED
	value.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	value.vertex_color_use_as_albedo=vertex_colors
	return value

func triangle(mesh: ImmediateMesh,a: Vector2,b: Vector2,c: Vector2,color: Color,offset: float) -> void:
	mesh.surface_set_color(color)
	mesh.surface_set_normal(Vector3.UP)
	for p: Vector2 in [a,b,c]:
		# Shared triangle vertices need only one terrain query during construction.
		if not surface_samples.has(p):surface_samples[p]=world.point(p.x,p.y)
		mesh.surface_add_vertex(surface_samples[p]+Vector3.UP*offset)

func quad(mesh: ImmediateMesh,a: Vector2,b: Vector2,c: Vector2,d: Vector2,color: Color,offset: float) -> void:
	triangle(mesh,a,b,c,color,offset);triangle(mesh,a,c,d,color,offset)

func capsule(a: Vector2,b: Vector2,radius: float,effect: String) -> MeshInstance3D:
	surface_samples.clear()
	var direction: Vector2=(b-a).normalized()
	var normal: Vector2=Vector2(-direction.y,direction.x)
	var length: float=a.distance_to(b)
	var along: int=maxi(1,int(ceil(length/SURFACE_STEP)))
	var across: int=maxi(2,int(ceil(radius*2.0/SURFACE_STEP)))
	var fill: Color=color_for(effect,.16)
	var border: Color=color_for(effect,.92)
	var mesh: ImmediateMesh=ImmediateMesh.new();mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for i: int in range(along):
		var start: Vector2=a+direction*length*i/along
		var finish: Vector2=a+direction*length*(i+1)/along
		for j: int in range(across):
			var left: float=lerpf(-radius,radius,float(j)/across)
			var right: float=lerpf(-radius,radius,float(j+1)/across)
			quad(mesh,start+normal*left,finish+normal*left,finish+normal*right,start+normal*right,fill,.045)
		for side: float in [-1.0,1.0]:
			quad(mesh,start+normal*radius*side,finish+normal*radius*side,finish+normal*(radius-BORDER_WIDTH)*side,start+normal*(radius-BORDER_WIDTH)*side,border,.055)
	var rings: int=maxi(1,int(ceil(radius/SURFACE_STEP)))
	for end: int in range(2):
		var center: Vector2=a if end==0 else b
		var first: float=PI*.5 if end==0 else -PI*.5
		for arc: int in range(24):
			var aa: float=first+PI*arc/24.0
			var bb: float=first+PI*(arc+1)/24.0
			var va: Vector2=direction*cos(aa)+normal*sin(aa)
			var vb: Vector2=direction*cos(bb)+normal*sin(bb)
			for ring: int in range(rings):
				var inner: float=radius*ring/rings
				var outer: float=radius*(ring+1)/rings
				quad(mesh,center+va*inner,center+va*outer,center+vb*outer,center+vb*inner,fill,.045)
			quad(mesh,center+va*radius,center+vb*radius,center+vb*(radius-BORDER_WIDTH),center+va*(radius-BORDER_WIDTH),border,.055)
	mesh.surface_end()
	surface_samples.clear()
	var node: MeshInstance3D=MeshInstance3D.new();node.mesh=mesh;node.material_override=material(true)
	node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.set_meta("server_capsule",{"start":a,"end":b,"half_width":radius})
	add_child(node)
	return node

func discard_telegraph(id: String) -> void:
	if not telegraphs.has(id):return
	var node: Node3D=telegraphs[id].node
	if is_instance_valid(node):node.hide();node.queue_free()
	telegraphs.erase(id)

func clear_owner(owner: String) -> void:
	for id: String in telegraphs.keys():
		if telegraphs[id].owner==owner:discard_telegraph(id)
	for pulse: Dictionary in pulses.duplicate():
		if pulse.owner==owner:
			pulse.node.hide();pulse.node.queue_free();pulses.erase(pulse)

func clear_all() -> void:
	for id: String in telegraphs.keys():discard_telegraph(id)
	for pulse: Dictionary in pulses:
		if is_instance_valid(pulse.node):pulse.node.hide();pulse.node.queue_free()
	pulses.clear()

func apply(snapshot: Dictionary) -> void:
	var space: String=space_of(snapshot)
	if active_space!=space:clear_all();active_space=space
	if bool(snapshot.get("character",{}).get("dead",false)):clear_all();return
	var keep: Dictionary={}
	var dead: Dictionary={}
	for actor: Dictionary in snapshot.get("monsters",[]):
		if not bool(actor.get("alive",true)):dead[str(actor.uid)]=true
	for zone: Dictionary in snapshot.get("groundEffects",[]):
		if zone.get("kind","")!="line":continue
		var a: Dictionary=zone.get("point",{});var b: Dictionary=zone.get("endPoint",{})
		var start: Vector2=planar(a);var end: Vector2=planar(b)
		var width: float=float(zone.get("halfWidth",0));var id: String=str(zone.get("id",""));var owner: String=str(zone.get("owner",""))
		if id.is_empty() or owner.is_empty() or dead.has(owner) or not start.is_finite() or not end.is_finite() or start.distance_to(end)<.001:continue
		if not is_finite(width) or width<=BORDER_WIDTH or width>10 or start.distance_to(end)>200:continue
		if str(a.get("spaceId","surface"))!=space or str(b.get("spaceId","surface"))!=space:continue
		if float(zone.get("expiresAt",0))<=float(snapshot.time):continue
		keep[id]=true
		if telegraphs.has(id):
			if telegraphs[id].start!=start or telegraphs[id].end!=end or telegraphs[id].width!=width:ignored_mutations+=1
			continue # One ID is immutable, including its initial expiry.
		telegraphs[id]={"node":capsule(start,end,width,str(zone.get("effect","fire"))),"start":start,"end":end,"width":width,"owner":owner,"expires":float(zone.expiresAt)}
	for id: String in telegraphs.keys():
		if not keep.has(id):discard_telegraph(id)

func on_event(event: Dictionary) -> void:
	if str(event.get("kind","")) in ["cancel","death"]:clear_owner(str(event.get("actor","")))
	if event.get("kind","")=="release" and event.get("attackKind","")=="aimed-line":clear_owner(str(event.get("actor","")))

func show_release(event: Dictionary) -> bool:
	if event.get("attackKind","")!="aimed-line":return false
	var key: String=str(event.get("actor",""))+":"+str(event.get("actorGeneration",0))+":"+str(event.get("sequence",-1))
	if seen_releases.has(key):return true
	seen_releases[key]=true
	if seen_releases.size()>512:seen_releases.erase(seen_releases.keys()[0])
	clear_owner(str(event.get("actor","")))
	var origin: Dictionary=event.get("origin",{});var destination: Dictionary=event.get("destination",{})
	var start: Vector3=Vector3(float(origin.get("x",NAN)),float(origin.get("y",NAN)),-float(origin.get("z",NAN)))
	var end: Vector3=Vector3(float(destination.get("x",NAN)),float(destination.get("y",NAN)),-float(destination.get("z",NAN)))
	# The timeline already validates backlog/generation and event order. Like the
	# existing instant-release path, present each accepted event once on receipt.
	if not start.is_finite() or not end.is_finite() or start.distance_to(end)<.001:return true
	var beam: CylinderMesh=CylinderMesh.new()
	beam.top_radius=maxf(.03,float(event.get("halfWidth",.9))*.16);beam.bottom_radius=beam.top_radius;beam.height=start.distance_to(end)
	var node: MeshInstance3D=MeshInstance3D.new();node.mesh=beam;node.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var surface: StandardMaterial3D=material();surface.albedo_color=color_for(str(event.get("effect","fire")),.85);node.material_override=surface
	add_child(node);node.position=(start+end)*.5;node.quaternion=Quaternion(Vector3.UP,(end-start).normalized())
	node.set_meta("fixed_release",{"origin":start,"destination":end})
	pulses.append({"node":node,"material":surface,"owner":str(event.get("actor","")),"left":PULSE_SECONDS,"duration":PULSE_SECONDS,"start":start,"end":end,"last_presented_us":-1})
	return true

func tick(now: float,delta: float,space: String,dead: bool=false,presentation_us: int=-1) -> void:
	if space!=active_space or dead:clear_all();active_space=space;return
	for id: String in telegraphs.keys():
		if float(telegraphs[id].expires)<=now:discard_telegraph(id)
	for pulse: Dictionary in pulses.duplicate():
		var elapsed: float=delta
		if presentation_us>=0:
			# A release can be born during the parent's _process. Its first frame
			# must not consume CPU time spent before it was created or presented.
			elapsed=0.0 if int(pulse.last_presented_us)<0 else maxf(0,float(presentation_us-int(pulse.last_presented_us))/1000000.0)
			pulse.last_presented_us=presentation_us
		pulse.left-=elapsed
		if pulse.left<=0:pulse.node.hide();pulse.node.queue_free();pulses.erase(pulse)
		else:pulse.material.albedo_color.a=.85*float(pulse.left)/float(pulse.duration)

func _process(delta: float) -> void:
	if not is_instance_valid(world):return
	if world.get("space_loading")==true:clear_all();return
	var snapshot: Dictionary=world.get("current_snapshot")
	if not snapshot.is_empty():tick(float(snapshot.get("time",0)),delta,space_of(snapshot),bool(snapshot.get("character",{}).get("dead",false)),Time.get_ticks_usec())
