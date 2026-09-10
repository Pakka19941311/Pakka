extends Node3D
const NatureLayer = preload("res://world-final/nature/nature_layer.gd")

func _ready() -> void:
	call_deferred("review")

func review() -> void:
	var output: String=""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--material-output="):output=arg.trim_prefix("--material-output=")
	assert(not output.is_empty());DirAccess.make_dir_recursive_absolute(output)
	get_window().size=Vector2i(1600,900)
	var environment: WorldEnvironment=WorldEnvironment.new();var settings: Environment=Environment.new()
	settings.background_mode=Environment.BG_COLOR;settings.background_color=Color("697d88")
	settings.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;settings.ambient_light_color=Color("d6deec");settings.ambient_light_energy=.3
	settings.tonemap_mode=Environment.TONE_MAPPER_FILMIC;environment.environment=settings;add_child(environment)
	var light: DirectionalLight3D=DirectionalLight3D.new();light.rotation_degrees=Vector3(-51,-33,0);light.light_energy=.85;light.light_color=Color("ffe7ce");add_child(light)
	var camera: Camera3D=Camera3D.new();camera.current=true;camera.far=2000;add_child(camera)
	var layer: Node3D=NatureLayer.new();add_child(layer)
	var original: Node3D=load("res://world-final/nature/assets/pine_D03_0_lod0.glb").instantiate()
	var report: Array=[]
	for part: Dictionary in layer.mesh_parts(original):
		var mesh: Mesh=part.mesh
		for surface: int in range(mesh.get_surface_count()):
			var material: BaseMaterial3D=mesh.surface_get_material(surface)
			var colors: PackedColorArray=[]
			var stored_colors: Variant=mesh.surface_get_arrays(surface)[Mesh.ARRAY_COLOR]
			if stored_colors!=null:colors=stored_colors
			var low: Color=Color.WHITE;var high: Color=Color.BLACK
			for color: Color in colors:
				low=Color(minf(low.r,color.r),minf(low.g,color.g),minf(low.b,color.b),minf(low.a,color.a))
				high=Color(maxf(high.r,color.r),maxf(high.g,color.g),maxf(high.b,color.b),maxf(high.a,color.a))
			report.append({"material":material.resource_name,"vertex_color":material.vertex_color_use_as_albedo,"vertex_color_srgb":material.vertex_color_is_srgb,"color_count":colors.size(),"low":str(low),"high":str(high),"uv_scale":str(material.uv1_scale),"uv_offset":str(material.uv1_offset),"base_color":str(material.albedo_color),"alpha":material.transparency})
	original.free()
	var nodes: Array=[]
	for mode: int in range(4):
		var source: Node3D=load("res://world-final/nature/assets/pine_D03_0_lod0.glb").instantiate()
		var parts: Array=layer.mesh_parts(source)
		var holder: Node3D=Node3D.new();holder.position.x=(mode-1.5)*12;add_child(holder);nodes.append(holder)
		for part: Dictionary in parts:
			var mesh: Mesh=part.mesh
			if mode in [1,3]:mesh=layer.focus_mesh(mesh)
			else:mesh=mesh.duplicate()
			for surface: int in range(mesh.get_surface_count()):
				var mat: Material=mesh.surface_get_material(surface)
			if mode>=2:
				var instance: MultiMeshInstance3D=layer.make_batch({"mesh":mesh,"transform":part.transform},[{"position":[-600,50,-90],"yaw":0,"scale":1}],Vector3(-600,50,-90));instance.position=Vector3.ZERO
				if mode in [2,3]:
					var transform: Transform3D=instance.multimesh.get_instance_transform(0)
					instance.multimesh.instance_count=0;instance.multimesh.use_colors=mode==3;instance.multimesh.instance_count=1
					instance.multimesh.set_instance_transform(0,transform)
					if mode==3:instance.multimesh.set_instance_color(0,Color.WHITE)
					instance.multimesh.set_instance_custom_data(0,Color(-600,50,-90,1))
				holder.add_child(instance)
			else:
				var instance: MeshInstance3D=MeshInstance3D.new();instance.mesh=mesh;instance.transform=part.transform;holder.add_child(instance)
		source.free()
	var canvas: CanvasLayer=CanvasLayer.new();add_child(canvas);var label: Label=Label.new();label.position=Vector2(20,20);label.add_theme_font_size_override("font_size",20);canvas.add_child(label)
	for view: Dictionary in [{"id":"near","position":Vector3(0,7,42),"target":Vector3(0,7,0)},{"id":"high","position":Vector3(0,100,130),"target":Vector3(0,8,0)}]:
		camera.position=view.position;camera.look_at(view.target)
		label.text="D09 diagnostic · Mesh standard / Mesh focus / MultiMesh standard / MultiMesh focus explicit white"
		for i: int in range(10):await get_tree().process_frame
		await RenderingServer.frame_post_draw;get_viewport().get_texture().get_image().save_png(output.path_join(view.id+".png"))
	for node: Node3D in nodes:node.visible=false;node.position=Vector3.ZERO
	camera.position=Vector3(4,4,8);camera.look_at(Vector3(0,4,0))
	for mode: int in range(nodes.size()):
		nodes[mode].visible=true;label.visible=false
		for i: int in range(8):await get_tree().process_frame
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(output.path_join("bark-mode-%d.png"%mode))
		nodes[mode].visible=false
	var file: FileAccess=FileAccess.open(output.path_join("materials.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	get_tree().call_deferred("quit",0)
