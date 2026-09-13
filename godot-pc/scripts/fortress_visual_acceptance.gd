extends SceneTree
func _initialize() -> void: call_deferred("review")
func review() -> void:
	var stage:=Node3D.new();root.add_child(stage)
	var scene:Node3D=load("res://world-final/castle/courtyard-p2.glb").instantiate();stage.add_child(scene)
	var helper=load("res://world-final/castle/fortress_visuals.gd").new();helper.apply(scene);helper.free()
	var ground:MeshInstance3D=scene.find_child("F3_ground_continuous",true,false)
	assert(ground.material_override is ShaderMaterial)
	var sun:=DirectionalLight3D.new();sun.rotation_degrees=Vector3(-52,-28,0);sun.light_energy=1.1;sun.shadow_enabled=true;stage.add_child(sun)
	var env:=WorldEnvironment.new();env.environment=Environment.new();env.environment.background_mode=Environment.BG_COLOR;env.environment.background_color=Color(.32,.41,.46);env.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.environment.ambient_light_color=Color(.72,.77,.82);env.environment.ambient_light_energy=.65;stage.add_child(env)
	var camera:=Camera3D.new();stage.add_child(camera);camera.current=true;camera.far=650;camera.fov=62
	var folder:String=OS.get_cmdline_user_args()[0];DirAccess.make_dir_recursive_absolute(folder)
	for shot:Dictionary in [{"name":"market","eye":Vector3(-107,83,210),"target":Vector3(-105,70.3,180)},{"name":"overview","eye":Vector3(32,163,300),"target":Vector3(-101,83,152)}]:
		camera.position=shot.eye;camera.look_at(shot.target)
		for i:int in range(8):await process_frame
		await RenderingServer.frame_post_draw
		assert(root.get_texture().get_image().save_png(folder+"/"+shot.name+".png")==OK)
	print("FORTRESS_VISUAL_REVIEW_OK")
	stage.free();quit()
