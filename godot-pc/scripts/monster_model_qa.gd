extends Node

var output: String = "user://monster-qa"
var report: Dictionary = {"ok":true,"scope":"approved-monster-models","models":{},"native_render":false}
var stage: Node3D
var camera: Camera3D
var root: Window

func _ready() -> void:
	root = get_tree().root
	print("MONSTER_QA_BEGIN exported scene entry")
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--monster-output="): output = argument.trim_prefix("--monster-output=")
	DirAccess.make_dir_recursive_absolute(output)
	call_deferred("run")

func capture(name: String) -> void:
	if not report.native_render: return
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(output.path_join(name+".png"))

func measure(rigs: Array[Node]) -> Array:
	var values: Array = []
	for rig: Skeleton3D in rigs:
		rig.force_update_all_bone_transforms()
		for index: int in rig.get_bone_count():
			var p: Vector3 = (rig.global_transform * rig.get_bone_global_pose(index)).origin
			values.append([p.x,p.y,p.z])
	return values

func moved(a: Array,b: Array) -> float:
	var distance: float = 0
	for index: int in mini(a.size(),b.size()):
		distance = maxf(distance,Vector3(a[index][0],a[index][1],a[index][2]).distance_to(Vector3(b[index][0],b[index][1],b[index][2])))
	return distance

func run() -> void:
	report.native_render = DisplayServer.get_name() != "headless"
	root.size = Vector2i(1280,900)
	stage = Node3D.new();root.add_child(stage)
	var environment: WorldEnvironment = WorldEnvironment.new();environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR;environment.environment.background_color = Color("34404b")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR;environment.environment.ambient_light_color = Color("b4c3d4");environment.environment.ambient_light_energy = .55
	stage.add_child(environment)
	var sun: DirectionalLight3D = DirectionalLight3D.new();sun.rotation_degrees = Vector3(-45,-35,0);sun.light_energy = 1.5;sun.shadow_enabled = true;stage.add_child(sun)
	var floor: MeshInstance3D = MeshInstance3D.new();var plane: PlaneMesh = PlaneMesh.new();plane.size = Vector2(100,100);floor.mesh = plane
	var material: StandardMaterial3D = StandardMaterial3D.new();material.albedo_color = Color("484b4c");material.roughness = .95;floor.material_override = material;stage.add_child(floor)
	camera = Camera3D.new();stage.add_child(camera);camera.current = true;camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	var profiles: Dictionary = VarendorWorld.monster_asset_profiles()
	profiles["ForestLord"] = {"targetHeight":5.2}
	for model: String in profiles:
		var result: Dictionary = {"ok":true}
		var packed: PackedScene = load("res://generated/actors/"+model+".glb")
		if packed == null: report.ok = false;report.models[model] = {"ok":false,"reason":"missing scene"};continue
		var actor: Node3D = Node3D.new();stage.add_child(actor)
		var visual: Node3D = packed.instantiate();actor.add_child(visual)
		var profile: Dictionary = profiles[model];var height: float = float(profile.targetHeight)
		var box: AABB;var first: bool = true;var triangles: int = 0
		for mesh: MeshInstance3D in visual.find_children("*","MeshInstance3D",true,false):
			if mesh.mesh == null:continue
			var bound: AABB = (visual.global_transform.affine_inverse()*mesh.global_transform)*mesh.get_aabb()
			box = bound if first else box.merge(bound);first = false
			for surface: int in mesh.mesh.get_surface_count():
				var arrays: Array = mesh.mesh.surface_get_arrays(surface)
				triangles += arrays[Mesh.ARRAY_INDEX].size()/3 if arrays[Mesh.ARRAY_INDEX] != null else arrays[Mesh.ARRAY_VERTEX].size()/3
		var factor: float = height/float(profile.get("sourceHeight",box.size.y))
		visual.scale = Vector3.ONE*factor;visual.position.y = -float(profile.get("sourceFloor",box.position.y))*factor
		var players: Array[Node] = visual.find_children("*","AnimationPlayer",true,false)
		var rigs: Array[Node] = visual.find_children("*","Skeleton3D",true,false)
		if players.is_empty() or rigs.is_empty():report.ok = false;report.models[model] = {"ok":false,"reason":"missing rig/animations"};actor.queue_free();continue
		actor.set_meta("visual",visual);actor.set_meta("base_visual",visual.transform);actor.set_meta("model",model);actor.set_meta("pick_size",Vector3(1,height,1));actor.set_meta("player",players[0])
		var controller: VarendorAnimationController = VarendorAnimationController.new();controller.bind(actor)
		var clips: Dictionary = {}
		for clip: String in ["idle","walk","attack","death"]:
			clips[clip] = controller.find_clip([clip])
			if clips[clip] == "":result.ok = false
		result.clips = clips;result.triangles = triangles;result.height = height
		camera.size = maxf(height*1.55,float(profile.get("sourceWidth",box.size.x))*factor*1.12);camera.position = Vector3(height*.85,height*.68,height*2.5);camera.look_at(Vector3(0,height*.42,0))
		var now: float = 0;var measured: Dictionary = {}
		for phase: String in ["idle","walk","attack","death"]:
			controller.reset_alive()
			if phase == "attack":controller.begin_attack(now,now+840,now+2000)
			if phase == "death":controller.begin_death(now,now+3000)
			var start: Array = [];var change: float = 0
			for frame: int in range(61):
				var t: float = frame/30.0
				controller.update({"grounded":true,"alive":phase!="death","hp":100},Vector3(0,0,1.2) if phase == "walk" else Vector3.ZERO,now+t*1000,1.0/30)
				await get_tree().process_frame
				var pose: Array = measure(rigs)
				if phase == "idle" and frame == 30 and model not in ["WraithV3","GiantBat","ForestLord"]:
					var feet: Dictionary = {}
					for side: String in ["L","R"]:
						var bone_name: String = str(profile.get("aliases",{}).get("Foot."+side,""))
						for rig: Skeleton3D in rigs:
							var index: int = rig.find_bone(bone_name)
							if index < 0: index = rig.find_bone(bone_name.replace(".","_"))
							if index >= 0:
								var foot: Vector3 = (rig.global_transform*rig.get_bone_global_pose(index)).origin
								feet[side] = foot.y
								if foot.y < -.05*height or foot.y > .25*height: result.ok = false
					result.idle_foot_pivots_metres = feet
					if feet.size() != 2: result.ok = false
				if frame == 0:start = pose
				else:change = maxf(change,moved(start,pose))
				if frame == (25 if phase == "attack" else 52 if phase == "death" else 30):await capture(model+"-"+phase)
			measured[phase] = change
			if change < .0005:result.ok = false
			now += 3500
		result.pose_motion_metres = measured;result.renderer_draw_calls = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		report.models[model] = result;report.ok = report.ok and result.ok
		actor.queue_free();await get_tree().process_frame
	var file: FileAccess = FileAccess.open(output.path_join("monster-models.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("MONSTER_QA "+JSON.stringify(report));get_tree().quit(0 if report.ok else 1)
