extends "res://world-final/world_nature_review.gd"
@export var groundcover_revision: String="D11"
@export var grass_shader_path: String="res://world-final/nature/grass_mesh.gdshader"
var details: Node3D

func run_review() -> void:
	details=load("res://world-final/nature/groundcover_layer.gd").new()
	details.authored_revision=groundcover_revision;details.geology_material_revision=geology_material_revision;details.grass_shader=grass_shader_path;add_child(details)
	await details.build()
	var cliff_obstacles: Array=JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/groundcover-collision-"+groundcover_revision+".json")).obstacles
	obstacles.append_array(cliff_obstacles)
	await super.run_review()
	var report_path: String=output_dir.path_join("world-nature-overview.json" if "--overview-only" in OS.get_cmdline_user_args() else "world-nature-review.json")
	if FileAccess.file_exists(report_path):
		var report: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(report_path))
		report["revision"]=groundcover_revision;report["groundcover_counts"]=details.data.counts;report["native_source"]=details.data.native_source
		report["grass_batches"]=details.batch_count;report["cliff_meshes"]=details.data.cliff_meshes.size()
		var file: FileAccess=FileAccess.open(output_dir.path_join("groundcover-review.json"),FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()

func capture(name: String) -> void:
	status.text=status.text.replace("D08",groundcover_revision)+"\nТрава и подогнанные скалы · промежуточная проверка"
	await super.capture(name)
	if name=="lake-shore" and "--groundcover-close" in OS.get_cmdline_user_args():
		var saved: Transform3D=camera.transform;var fov: float=camera.fov
		actor.visible=true;camera.fov=55
		for view: Dictionary in [{"id":"forest-ground","xz":Vector2(-670,-37)}, {"id":"swamp-ground","xz":Vector2(-648,470)}, {"id":"lakeside-ground","xz":Vector2(423,5)}]:
			reset_actor(Vector2(view.xz.x,-view.xz.y));motor.input_mode="manual"
			camera.position=actor.position+Vector3(7,6,9);camera.look_at(actor.position+Vector3(0,.6,0))
			status.text="VARENDOR · D11 · "+view.id+"\nСуществующий рыцарь · сохранённая трава и рельеф"
			for i: int in range(8):await get_tree().process_frame
			await super.capture(view.id)
		actor.visible=false;camera.transform=saved;camera.fov=fov
