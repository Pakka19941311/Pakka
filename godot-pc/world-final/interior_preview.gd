extends "res://world-final/geography_preview.gd"
## C review of real local spaces using the accepted movement/avatar/camera.
const INTERIORS: String = "res://world-final/interiors/"
var space: Dictionary
var space_id: String = "mine"
var geometry: Node3D
var ceiling: MeshInstance3D
var nav_region: NavigationRegion3D
var nav_mesh: NavigationMesh
var nav_map: RID

func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--interior="):space_id=arg.trim_prefix("--interior=")
		if arg.begins_with("--world-C-output="):
			output_dir=arg.trim_prefix("--world-C-output=");automate=true
	assert(space_id in ["mine","great_cave"])
	var definitions: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(INTERIORS+"spaces.json"))
	for item: Dictionary in definitions.spaces:
		if item.id==space_id:space=item
	terrain=JSON.parse_string(FileAccess.get_file_as_string(INTERIORS+space_id+".json"))
	heights=FileAccess.get_file_as_bytes(INTERIORS+str(terrain.floor)).to_float32_array()
	obstacles=terrain.obstacles
	collision.setup(obstacles);camera_collision.setup(obstacles)
	if automate:
		get_window().mode=Window.MODE_WINDOWED
		get_window().size=Vector2i(1600,900)
	var env: WorldEnvironment=WorldEnvironment.new()
	var setting: Environment=Environment.new()
	setting.background_mode=Environment.BG_COLOR;setting.background_color=Color("101419")
	setting.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
	setting.ambient_light_color=Color("8695a1");setting.ambient_light_energy=.3
	setting.tonemap_mode=Environment.TONE_MAPPER_FILMIC
	env.environment=setting;add_child(env)
	var packed: PackedScene=load(INTERIORS+space_id+".glb")
	geometry=packed.instantiate();add_child(geometry)
	ceiling=geometry.find_child(space_id+"_Ceiling",true,false) as MeshInstance3D
	assert(ceiling!=null)
	for room: Dictionary in space.rooms:
		var lamp: OmniLight3D=OmniLight3D.new()
		lamp.position=Vector3(room.center[0],height_godot(room.center[0],room.center[1])+5,room.center[1])
		lamp.omni_range=maxf(room.radii[0],room.radii[1])*1.5
		lamp.omni_attenuation=1.15;lamp.light_energy=2.0
		lamp.light_color=Color("ffbb78") if space_id=="mine" else Color("99b5c4")
		lamp.shadow_enabled=true;add_child(lamp)
	# Review lamps are explicitly temporary, not a substitute for E atmosphere.
	camera=Camera3D.new();camera.current=true;camera.far=1500;add_child(camera)
	add_child(follow);follow.setup(camera,camera_collision,height_server)
	var canvas: CanvasLayer=CanvasLayer.new();add_child(canvas)
	status=Label.new();status.position=Vector2(24,22);status.add_theme_font_size_override("font_size",18)
	status.add_theme_color_override("font_outline_color",Color.BLACK);status.add_theme_constant_override("outline_size",5);canvas.add_child(status)
	create_actor()
	motor.bounds_min=Vector2(space.bounds[0],-space.bounds[3])
	motor.bounds_max=Vector2(space.bounds[2],-space.bounds[1])
	reset_actor(Vector2(space.entry[0],-space.entry[2]))
	loaded=true
	status.text="VARENDOR · C · " + space_id + "\nF1 — срез для обзора · F2 — герой · WASD · ПКМ\nСвет для проверки; население и переходы основной игры ещё не подключены"
	await bake_navigation()
	set_overview()
	if automate:call_deferred("run_review")

func height_godot(x: float,z: float) -> float:
	var cols: int=int(terrain.columns);var rows: int=int(terrain.rows)
	var gx: float=clampf(x-float(terrain.bounds[0]),0,cols)
	var gz: float=clampf(z-float(terrain.bounds[1]),0,rows)
	var col: int=mini(cols-1,floori(gx));var row: int=mini(rows-1,floori(gz))
	var u: float=gx-col;var v: float=gz-row;var index: int=row*(cols+1)+col
	var a: float=heights[index];var b: float=heights[index+1]
	var c: float=heights[index+cols+1];var d: float=heights[index+cols+2]
	return a+u*(b-a)+v*(d-b) if u>=v else a+u*(d-c)+v*(c-a)

func bake_navigation() -> void:
	var nav_path: String=INTERIORS+space_id+"-nav.tres"
	var receipt_path: String=INTERIORS+space_id+"-nav.json"
	var receipt: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(receipt_path)) if FileAccess.file_exists(receipt_path) else {}
	var geometry_hash: String=FileAccess.get_sha256(INTERIORS+space_id+".glb")
	if ResourceLoader.exists(nav_path) and receipt.get("glb_sha256","")==geometry_hash:
		nav_mesh=load(nav_path)
		set_meta("navigation_cache_reused",true)
	else:
		set_meta("navigation_cache_reused",false)
		# Offline C authoring only. F runtime consumes the saved resource and never
		# reads GPU geometry or bakes navigation during player movement.
		var data: NavigationMeshSourceGeometryData3D=NavigationMeshSourceGeometryData3D.new()
		for node: Node in geometry.find_children("*","MeshInstance3D",true,false):
			var instance: MeshInstance3D=node as MeshInstance3D
			data.add_mesh(instance.mesh,instance.global_transform)
		nav_mesh=NavigationMesh.new()
		nav_mesh.agent_height=1.875;nav_mesh.agent_radius=.75
		nav_mesh.agent_max_climb=.25;nav_mesh.agent_max_slope=20
		nav_mesh.cell_size=.25;nav_mesh.cell_height=.125
		nav_mesh.region_min_size=2;nav_mesh.region_merge_size=4
		NavigationServer3D.bake_from_source_geometry_data(nav_mesh,data)
		assert(nav_mesh.get_polygon_count()>0)
		var save_error: Error=ResourceSaver.save(nav_mesh,nav_path)
		assert(save_error==OK)
		var receipt_file: FileAccess=FileAccess.open(receipt_path,FileAccess.WRITE)
		receipt_file.store_string(JSON.stringify({"glb_sha256":geometry_hash,"space_id":space_id,"polygons":nav_mesh.get_polygon_count(),"agent_height":1.875,"agent_radius":.75},"  "));receipt_file.close()
	nav_map=NavigationServer3D.map_create()
	NavigationServer3D.map_set_cell_size(nav_map,.25)
	NavigationServer3D.map_set_cell_height(nav_map,.125)
	NavigationServer3D.map_set_active(nav_map,true)
	nav_region=NavigationRegion3D.new();nav_region.navigation_mesh=nav_mesh
	nav_region.set_navigation_map(nav_map);add_child(nav_region)
	NavigationServer3D.map_force_update(nav_map)
	await get_tree().physics_frame
	print("INTERIOR_NAV_BAKED "+space_id+" polygons="+str(nav_mesh.get_polygon_count()))

func set_overview() -> void:
	if camera==null:return
	overview=true
	if ceiling!=null:ceiling.hide()
	var middle: Vector3=Vector3((float(space.bounds[0])+float(space.bounds[2]))/2,0,(float(space.bounds[1])+float(space.bounds[3]))/2)
	camera.position=middle+Vector3(0,330,210);camera.fov=57;camera.look_at(middle)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode==KEY_F2:
		ceiling.show()
	super._unhandled_input(event)

func traverse_nav_path(path: PackedVector3Array) -> Dictionary:
	if path.is_empty():return {"passed":false,"reason":"empty path"}
	reset_actor(Vector2(path[0].x,-path[0].z));motor.input_mode="manual"
	var steps: int=0
	for point: Vector3 in path:
		var target: Vector2=Vector2(point.x,-point.z)
		var budget: int=ceili(motor.position_value.distance_to(target)/6.2*60)+120
		while motor.position_value.distance_to(target)>.07 and budget>0:
			motor.input_direction=(target-motor.position_value).normalized();motor.physics_step(1.0/60.0)
			budget-=1;steps+=1
			if steps%300==0:await get_tree().process_frame
		if budget<=0:return {"passed":false,"reason":"blocked","x":motor.position_value.x,"z":motor.position_value.y}
	motor.input_direction=Vector2.ZERO;motor.physics_step(1.0/60.0)
	return {"passed":true,"steps":steps}

func run_review() -> void:
	DirAccess.make_dir_recursive_absolute(output_dir)
	await capture("cutaway-"+space_id)
	var result: Dictionary={"space_id":space_id,"population_capacity_reserved":space.population_capacity,"headless":DisplayServer.get_name()=="headless",
		"rooms":space.rooms.size(),"corridor_cycles":space.corridors.size()-space.rooms.size(),"floor_triangles":terrain.floor_triangles,
		"obstacles":obstacles.size(),"nav_polygons":nav_mesh.get_polygon_count(),"nav_paths":[],"motor_routes":[],"main_game_integrated":false,"maps_final":false}
	for corridor: Dictionary in space.corridors:
		for reversed: bool in [false,true]:
			var points: Array=corridor.points.duplicate(true)
			if reversed:points.reverse()
			reset_actor(Vector2(points[0][0],-points[0][1]));motor.input_mode="manual"
			var arrived: bool=true;var steps: int=0
			for point: Array in points.slice(1):
				var target: Vector2=Vector2(point[0],-point[1])
				var budget: int=ceili(motor.position_value.distance_to(target)/6.2*60)+240
				while motor.position_value.distance_to(target)>.15 and budget>0:
					motor.input_direction=(target-motor.position_value).normalized();motor.physics_step(1.0/60.0)
					budget-=1;steps+=1
					if steps%300==0:await get_tree().process_frame
				if budget<=0:arrived=false;break
			motor.input_direction=Vector2.ZERO;motor.physics_step(1.0/60.0)
			var stop: Vector2=motor.position_value
			for frame: int in range(60):motor.physics_step(1.0/60.0)
			result.motor_routes.append({"id":str(corridor.id)+("-return" if reversed else ""),"arrived":arrived,"stop_drift_m":stop.distance_to(motor.position_value)})
	var start: Vector3=Vector3(0,height_godot(0,0),0)
	for room: Dictionary in space.rooms:
		var end: Vector3=Vector3(room.center[0],height_godot(room.center[0],room.center[1]),room.center[1])
		var path: PackedVector3Array=NavigationServer3D.map_get_path(nav_map,start,end,true)
		var walk: Dictionary=await traverse_nav_path(path)
		result.nav_paths.append({"room":room.id,"path_points":path.size(),"reaches_room":not path.is_empty() and path[-1].distance_to(end)<1,"motor_traversal":walk})
	overview=false;ceiling.show();camera.fov=rad_to_deg(.82)
	for i: int in [0,2,5]:
		var room: Dictionary=space.rooms[i]
		reset_actor(Vector2(room.center[0],-room.center[1]+minf(float(room.radii[1])*.6,13)))
		follow.yaw=.5 if i==2 else 0.0;follow.reset_follow()
		for frame: int in range(35):await get_tree().process_frame
		await capture(str(room.id))
	result["all_routes_pass"]=result.motor_routes.all(func(r: Dictionary):return r.arrived and r.stop_drift_m<.000001)
	result["all_rooms_connected"]=result.nav_paths.all(func(p: Dictionary):return p.reaches_room and p.motor_traversal.passed)
	var file: FileAccess=FileAccess.open(output_dir.path_join("interior-review.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(result,"  "));file.close()
	print("INTERIOR_REVIEW "+JSON.stringify(result))
	get_tree().quit(0 if result.all_routes_pass and result.all_rooms_connected else 3)

func _exit_tree() -> void:
	if nav_map.is_valid():
		if is_instance_valid(nav_region):nav_region.set_navigation_map(RID())
		NavigationServer3D.free_rid(nav_map)
