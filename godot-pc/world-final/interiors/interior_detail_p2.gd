extends Node3D
## Visual-only layer. No physics, navigation, floor or boss data is authored here.
const STONE = preload("res://world-final/interiors/interior_stone_p2.gdshader")
var receipt: Dictionary = {}

func floor_y(x: float,z: float) -> float:
	return .014*z+.11*sin(x*.12+z*.035)*sin(z*.11)

func material_for(is_floor: bool,is_mine: bool) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader=STONE
	m.set_shader_parameter("diffuse_map",load("res://world-final/nature/textures/trail_diff.jpg") if is_floor else load("res://world-final/materials/rock_diff-D12.jpg"))
	m.set_shader_parameter("normal_map",load("res://world-final/nature/textures/trail_normal.jpg") if is_floor else load("res://world-final/materials/rock_normal-D12.jpg"))
	m.set_shader_parameter("rough_map",load("res://world-final/materials/rock_rough-D12.jpg"))
	m.set_shader_parameter("floor_surface",is_floor)
	m.set_shader_parameter("stone_tint",Vector3(.79,.70,.56) if is_mine else Vector3(.70,.79,.82))
	return m

func lamp(at: Vector3,color: Color,energy: float,reach: float,fixture: bool) -> void:
	var light := OmniLight3D.new()
	light.position=at;light.light_color=color;light.light_energy=energy
	light.omni_range=reach;light.omni_attenuation=1.35;light.shadow_enabled=false
	add_child(light)
	if fixture:
		var mesh := MeshInstance3D.new()
		var box := BoxMesh.new();box.size=Vector3(.22,.36,.22);mesh.mesh=box
		var mat := StandardMaterial3D.new();mat.albedo_color=color;mat.emission_enabled=true
		mat.emission=color;mat.emission_energy_multiplier=1.8;mesh.material_override=mat
		mesh.position=at;add_child(mesh)

func pendant(at: Vector3,length_m: float,radius: float,seed_value: int,material: Material) -> void:
	var surface := SurfaceTool.new();surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rings: Array[PackedVector3Array]=[]
	for ring: int in range(3):
		var points := PackedVector3Array()
		for i: int in range(8):
			var angle: float=TAU*float(i)/8.0
			var r: float=radius*(1.0 if ring==0 else (.53 if ring==1 else .025))*(.82+.18*sin(float(i*7+seed_value)))
			points.append(Vector3(cos(angle)*r+ring*.08,-length_m*float(ring)/2.0,sin(angle)*r))
		rings.append(points)
	for ring: int in range(2):
		for i: int in range(8):
			var j: int=(i+1)%8
			for v: Vector3 in [rings[ring][i],rings[ring][j],rings[ring+1][i],rings[ring][j],rings[ring+1][j],rings[ring+1][i]]:
				surface.add_vertex(v)
	surface.generate_normals()
	var instance := MeshInstance3D.new();instance.mesh=surface.commit();instance.material_override=material
	instance.position=at;add_child(instance)

func build(geometry: Node3D,space: Dictionary) -> void:
	var is_mine: bool=space.id=="mine"
	var wall_mat := material_for(false,is_mine)
	var floor_mat := material_for(true,is_mine)
	var changed: int=0
	for suffix: String in ["_Floor","_Walls","_Ceiling"]:
		var part := geometry.find_child(str(space.id)+suffix,true,false) as MeshInstance3D
		if part!=null:part.material_override=floor_mat if suffix=="_Floor" else wall_mat;changed+=1
	var formations: int=0
	var minimum_tip_clearance: float=INF
	for room: Dictionary in space.rooms:
		var center := Vector2(room.center[0],room.center[1])
		var floor_height: float=floor_y(center.x,center.y)
		lamp(Vector3(center.x,floor_height+5.0,center.y),Color("ffc48a") if is_mine else Color("93b8c2"),1.45 if is_mine else 1.8,maxf(room.radii[0],room.radii[1])*1.35,false)
		# Raised edge accents and hanging rock tips remain above the player/camera corridor.
		if float(room.height)<10.0:continue
		for i: int in range(5 if is_mine else 12):
			var angle: float=TAU*(float(i)+.29)/float(5 if is_mine else 12)
			var x: float=center.x+cos(angle)*float(room.radii[0])*.60
			var z: float=center.y+sin(angle)*float(room.radii[1])*.60
			var roof: float=floor_y(x,z)+float(room.height)*(1.0-.24*.36)+.7*sin(x*.15+z*.06)*cos(z*.17)
			var length_m: float=minf(1.4+float(i%4)*.53,roof-floor_y(x,z)-7.0)
			if length_m<.5:continue
			pendant(Vector3(x,roof+.15,z),length_m,.65+float(i%3)*.27,i,wall_mat)
			formations+=1;minimum_tip_clearance=minf(minimum_tip_clearance,roof+.15-length_m-floor_y(x,z))
	for corridor: Dictionary in space.corridors:
		var points: Array=corridor.points
		if points.size()<2:continue
		var a := Vector2(points[0][0],points[0][1]);var b := Vector2(points[1][0],points[1][1])
		var direction: Vector2=(b-a).normalized();var side := Vector2(-direction.y,direction.x)
		var p: Vector2=(a+b)*.5+side*float(corridor.width)*.34
		lamp(Vector3(p.x,floor_y(p.x,p.y)+4.5,p.y),Color("ffb66c") if is_mine else Color("769ea8"),1.4 if is_mine else 1.15,18.0 if is_mine else 24.0,is_mine)
	receipt={"space":space.id,"materials":changed,"ceiling_formations":formations,"minimum_tip_clearance_m":minimum_tip_clearance,"physics_nodes_added":0,"floor_changed":false}
