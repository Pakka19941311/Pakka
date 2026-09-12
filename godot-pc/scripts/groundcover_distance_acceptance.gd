extends SceneTree
const Layer = preload("res://world-final/nature/groundcover_layer.gd")
const Grass = preload("res://world-final/nature/grass_lit_D13.gdshader")

func _init() -> void:
	call_deferred("run")

func run() -> void:
	var layer=Layer.new();root.add_child(layer)
	var material:=ShaderMaterial.new();material.shader=Grass
	layer.grass_materials.append(material)
	var lods: Array[MultiMeshInstance3D]=[]
	var original: Array[Transform3D]=[]
	var original_custom: Array[Color]=[]
	var checks: Dictionary={}
	# No world geometry needs importing to test settings propagation and safety.
	for lod: int in range(2):
		var batch:=MultiMeshInstance3D.new();var mm:=MultiMesh.new();mm.transform_format=MultiMesh.TRANSFORM_3D;mm.use_custom_data=true;mm.mesh=BoxMesh.new();mm.instance_count=2
		mm.set_instance_transform(0,Transform3D(Basis.IDENTITY,Vector3(14,2,15)))
		# Same suppression used by the local P2 nature replacement must survive.
		mm.set_instance_transform(1,Transform3D(Basis.from_scale(Vector3.ZERO),Vector3(-13,1,-14)))
		mm.set_instance_custom_data(0,Color(110,72,-150,1));mm.set_instance_custom_data(1,Color(113,74,-144,1))
		batch.multimesh=mm;layer.add_child(batch);layer.register_grass_batch(batch,lod);lods.append(batch)
		original.append(mm.get_instance_transform(0));original.append(mm.get_instance_transform(1))
		original_custom.append(mm.get_instance_custom_data(0));original_custom.append(mm.get_instance_custom_data(1))
	var cliff:=MeshInstance3D.new();cliff.visibility_range_end=321;layer.add_child(cliff)
	for distance: float in [24.0,45.0,80.0,24.0,80.0]:
		layer.apply_detail_distance(distance)
		var key: String=str(int(distance))
		checks[key+"_material_distance"]=is_equal_approx(float(material.get_shader_parameter("draw_distance")),distance)
		checks[key+"_coarse_buffer"]=is_equal_approx(lods[0].visibility_range_end,minf(distance,36.0)+32.0) and is_equal_approx(lods[1].visibility_range_end,distance+32.0)
		checks[key+"_lod_coverage"]=lods[0].visible and lods[1].visible==(distance>25.0)
		checks[key+"_no_near_cell_hole"]=lods[0].visibility_range_begin==0 and lods[1].visibility_range_begin==0
	checks.cliff_unchanged=cliff.visible and cliff.visibility_range_end==321
	checks.transforms_unchanged=original==[lods[0].multimesh.get_instance_transform(0),lods[0].multimesh.get_instance_transform(1),lods[1].multimesh.get_instance_transform(0),lods[1].multimesh.get_instance_transform(1)]
	checks.instance_data_unchanged=original_custom==[lods[0].multimesh.get_instance_custom_data(0),lods[0].multimesh.get_instance_custom_data(1),lods[1].multimesh.get_instance_custom_data(0),lods[1].multimesh.get_instance_custom_data(1)]
	layer.apply_detail_distance(24)
	var late:=MultiMeshInstance3D.new();layer.add_child(late);layer.register_grass_batch(late,1)
	checks.build_after_setting=not late.visible and late.visibility_range_end==56
	print("GROUNDCOVER_DISTANCE ",JSON.stringify(checks))
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--evidence="):
			var file:=FileAccess.open(arg.trim_prefix("--evidence="),FileAccess.WRITE);file.store_string(JSON.stringify(checks,"  "));file.close()
	layer.queue_free();await process_frame;await process_frame
	quit(0 if checks.values().all(func(value):return value) else 2)
