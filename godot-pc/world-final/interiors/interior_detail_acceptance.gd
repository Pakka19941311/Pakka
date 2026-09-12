extends SceneTree
const DETAIL = preload("res://world-final/interiors/interior_detail_p2.gd")
var output: String = ""

func _initialize() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--output="):output=arg.trim_prefix("--output=")
	call_deferred("run")

func run() -> void:
	root.size=Vector2i(1280,720)
	DirAccess.make_dir_recursive_absolute(output)
	var spaces: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/interiors/spaces.json"))
	var results: Array=[]
	for space: Dictionary in spaces.spaces:
		var holder := Node3D.new();root.add_child(holder)
		var env := WorldEnvironment.new();var settings := Environment.new()
		settings.background_mode=Environment.BG_COLOR;settings.background_color=Color("12181c")
		settings.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
		settings.ambient_light_color=Color("bdc9dc");settings.ambient_light_energy=.65
		settings.tonemap_mode=Environment.TONE_MAPPER_FILMIC;env.environment=settings;holder.add_child(env)
		var sun := DirectionalLight3D.new();sun.rotation_degrees=Vector3(-48,-35,0)
		sun.light_energy=.95;sun.shadow_enabled=true;holder.add_child(sun)
		var packed: PackedScene=load("res://world-final/interiors/"+str(space.id)+".glb")
		var geometry: Node3D=packed.instantiate();holder.add_child(geometry)
		var detail: Node3D=DETAIL.new();holder.add_child(detail);detail.build(geometry,space)
		var camera := Camera3D.new();holder.add_child(camera);camera.current=true;camera.fov=76
		for index: int in [0,1,5]:
			var room: Dictionary=space.rooms[index]
			var cx: float=room.center[0];var cz: float=room.center[1]
			camera.position=Vector3(cx,detail.floor_y(cx,cz+9)+2.05,cz+9)
			camera.look_at(Vector3(cx+float(room.radii[0])*.45,detail.floor_y(cx,cz)+5.5,cz-10))
			for frame: int in range(4):await process_frame
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(output.path_join(str(space.id)+"-"+str(room.id)+".png"))
		results.append(detail.receipt)
		holder.queue_free();await process_frame;await process_frame
	var passed: bool=results.all(func(r: Dictionary) -> bool:return r.materials==3 and r.minimum_tip_clearance_m>=7.0 and r.physics_nodes_added==0)
	var file := FileAccess.open(output.path_join("interior-detail.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"spaces":results,"scope":"isolated production detail helper; existing floor/nav/collision retained"},"  "));file.close()
	print("INTERIOR_DETAIL_P2 "+JSON.stringify(results));quit(0 if passed else 2)
