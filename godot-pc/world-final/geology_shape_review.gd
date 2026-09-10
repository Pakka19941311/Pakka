extends "res://world-final/geography_preview.gd"

func run_review() -> void:
	if DisplayServer.get_name()=="headless":get_tree().quit(4);return
	DirAccess.make_dir_recursive_absolute(output_dir)
	var surface: ShaderMaterial=load("res://world-final/materials/surface_materials.gd").terrain()
	if "--geology-paint-D12" in OS.get_cmdline_user_args():
		surface=load("res://world-final/materials/geology_material_D12.gd").terrain()
	for node: Node in find_children("*","MeshInstance3D",true,false):
		if str(node.name).begins_with("cell_"):node.material_override=surface
	actor.visible=false;overview=true;camera.fov=55
	for view: Dictionary in [
		{"id":"snow-ridges","from":Vector3(-610,360,-135),"to":Vector3(-570,220,-405)},
		{"id":"snow-north","from":Vector3(-370,440,-880),"to":Vector3(-560,250,-550)},
		{"id":"volcano-ridges","from":Vector3(705,520,-85),"to":Vector3(545,216,-490)},
		{"id":"volcano-north","from":Vector3(740,475,-830),"to":Vector3(545,216,-490)},
		{"id":"whole-world-shape","from":Vector3(870,1450,1740),"to":Vector3(0,70,0)}]:
		camera.position=view.from;camera.look_at(view.to)
		status.text="VARENDOR · D12 · проверка формы гор\nОтдельный рельеф: природа сохранена в D11, перенос ещё не выполнен"
		for i: int in range(8):await get_tree().process_frame
		await capture(view.id)
	var file: FileAccess=FileAccess.open(output_dir.path_join("geology-review.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"headless":false,"native_source":terrain.native_source,"whole_world_finished":false,"vegetation_reseated":false,"geography_promoted":false},"  "));file.close()
	get_tree().call_deferred("quit",0)
