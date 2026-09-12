extends SceneTree
const NPC = preload("res://world-expansion-v3/city/motion/npc_motion_adapter.gd")
const P2 = preload("res://world-expansion-v3/actors/profile_adapter.gd")
const TRACE = preload("res://scripts/p2_cpu_trace.gd")
var checks: Dictionary = {}
var world: VarendorWorld
var output: String = ""

func _init() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--evidence="): output=arg.trim_prefix("--evidence=")
	call_deferred("run")

func capture(name: String, at: Vector3, target: Vector3, size: float) -> void:
	world.camera.position=at
	world.camera.look_at(target)
	world.camera.size=size
	await process_frame
	await RenderingServer.frame_post_draw
	if not output.is_empty(): root.get_texture().get_image().save_png(output.path_join(name+".png"))

func run() -> void:
	root.size=Vector2i(1440,900)
	world=VarendorWorld.new();root.add_child(world);world.set_process(false);world.set_physics_process(false)
	world.add_child(world.camera_controller);world.data={"items":{}};world.labels_layer=Control.new();world.add_child(world.labels_layer)
	world.camera=Camera3D.new();world.add_child(world.camera);world.camera.projection=Camera3D.PROJECTION_ORTHOGONAL;world.camera.current=true
	var environment:=WorldEnvironment.new();environment.environment=Environment.new();environment.environment.background_mode=Environment.BG_COLOR;environment.environment.background_color=Color("707b80");environment.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;environment.environment.ambient_light_color=Color("b1b7bd");environment.environment.ambient_light_energy=.7;world.add_child(environment)
	var light:=DirectionalLight3D.new();light.rotation_degrees=Vector3(-48,-35,0);light.light_energy=1.8;light.shadow_enabled=true;world.add_child(light)
	var floor_mesh:=MeshInstance3D.new();var plane:=PlaneMesh.new();plane.size=Vector2(150,150);floor_mesh.mesh=plane;var material:=StandardMaterial3D.new();material.albedo_color=Color("73746a");material.roughness=.9;floor_mesh.material_override=material;world.add_child(floor_mesh)
	TRACE.begin_phase("p2-bind-count")
	for index: int in range(5):
		var id: String="MOB-%02d"%(index+1)
		var actor: Node3D=P2.create_actor(world,"qa:"+id,id)
		actor.position=Vector3(index*3.5,0,0)
		var controller=actor.get_meta("animation_controller")
		checks[id+"_owns_controller"]=controller.get_script()==preload("res://world-expansion-v3/actors/profile_animation_controller.gd")
		for clip: String in ["idle","walk","run","attack","hit","death"]:
			checks[id+"_"+clip]=not controller.find_clip([clip]).is_empty()
		controller.sample(controller.find_clip(["idle"]),0,true,0)
	var bind_trace: Dictionary=TRACE.finish_phase()
	checks.one_bind_per_p2_actor=int(bind_trace.timings["actor.animation_bind"].per_call_ms.count)==5
	var bug: Node3D=world.actors["qa:MOB-05"]
	checks.beetle_height=is_equal_approx((bug.get_meta("pick_size") as Vector3).y,2.05)
	checks.beetle_pick_width=(bug.get_meta("pick_size") as Vector3).x>2.37
	var bug_controller=bug.get_meta("animation_controller")
	bug_controller.align_to_ground(func(x: float,z: float): return x*.12+z*.07)
	checks.beetle_ground_radius=is_equal_approx(float(bug.get_meta("p2_ground_fit").radius),1.42)
	checks.beetle_ground_slope=(bug.get_meta("p2_ground_fit").normal as Vector3).is_equal_approx(Vector3(-.12,1,-.07).normalized())
	bug_controller.sample_gait(1.0,.1)
	checks.beetle_scaled_stride=is_equal_approx(float(bug.get_meta("p2_gait_contract").source_stride_speed),float(P2.profiles()["MOB-05"].gait.walk))
	var game: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/castle/courtyard-p2.json"))
	var roles: Dictionary={}
	for resident: Dictionary in game.residents:
		var role: String=NPC.role_for("ambient:"+str(int(resident.seed)),resident)
		roles[role]=int(roles.get(role,0))+1
		checks["resident_"+str(int(resident.seed))]=NPC.PROFILES.has(role)
	checks.all_guards=roles.get("guard",0)==7
	var services: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/gameplay/services.json"))
	for id: String in services: checks[id+"_appearance"]=NPC.PROFILES.has(NPC.role_for(id,services[id]))
	for index: int in range(4):
		var role: String=["guard","resident","worker","woman"][index]
		var actor: Node3D=NPC.create_actor(world,"qa-npc:"+role,role);actor.position=Vector3(index*1.5,0,8)
		for clip: String in ["idle","walk","talk","turn_left","turn_right"]:
			NPC.pose_at(actor,clip,.3);checks[role+"_"+clip]=actor.get_meta("p2_npc_state")==clip
		NPC.pose_at(actor,"idle",0)
	await capture("npc-production",Vector3(8,4,18),Vector3(2.3,1,8),7)
	await capture("p2-production",Vector3(17,8,12),Vector3(7,1,0),19)
	for entry: Array in [["FireGolem",6.2],["IceGolem",6.2],["RiftWarden",10.2]]:
		var actor: Node3D=world.make_actor("qa-large:"+entry[0],entry[0],entry[1],entry[0],Color.WHITE)
		actor.position=Vector3((world.actors.size()-9)*12,0,-15)
		checks[entry[0]+"_height"]=is_equal_approx((actor.get_meta("pick_size") as Vector3).y,float(entry[1]))
		var controller=actor.get_meta("animation_controller");controller.sample(controller.find_clip(["idle"]),0,true,0)
	await capture("golem-production",Vector3(35,16,16),Vector3(20,4,-15),45)
	if not output.is_empty():
		var file:=FileAccess.open(output.path_join("checks.json"),FileAccess.WRITE);file.store_string(JSON.stringify({"checks":checks,"roles":roles,"bind_trace":bind_trace},"  "));file.close()
	print("PRODUCTION_ACTORS ",JSON.stringify(checks))
	world.queue_free();await process_frame;await process_frame
	quit(0 if checks.values().all(func(value):return value) else 2)
