extends SceneTree
## Real PackedScene save/reopen, including the collision transform.
func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var tree: Node3D = load("res://world-final/landmarks/ancient_tree.tscn").instantiate()
	root.add_child(tree)
	var before: Array = tree.collision_obstacles()
	var native: Array = JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/ancient-tree-collision-D14.json")).obstacles
	var baseline_error: float = 0
	for i: int in range(before.size()):
		baseline_error=maxf(baseline_error,absf(before[i].x-native[i].x))
		baseline_error=maxf(baseline_error,absf(before[i].z-native[i].z))
	assert(baseline_error < .0001)
	var original: Vector3 = tree.position
	tree.position += Vector3(3.25,1.5,-2.0)
	var destination: String = "user://ancient-tree-edit-qa.tscn"
	var packed: PackedScene = PackedScene.new()
	assert(packed.pack(tree) == OK)
	assert(ResourceSaver.save(packed,destination) == OK)
	tree.free()
	var saved: PackedScene = ResourceLoader.load(destination,"PackedScene",ResourceLoader.CACHE_MODE_IGNORE)
	var reopened: Node3D = saved.instantiate()
	root.add_child(reopened)
	assert(reopened.position.is_equal_approx(original+Vector3(3.25,1.5,-2.0)))
	assert(reopened.get_meta("stable_id") == "ANCIENT_TREE")
	var after: Array = reopened.collision_obstacles()
	var maximum_error: float = 0
	for i: int in range(after.size()):
		maximum_error=maxf(maximum_error,absf(after[i].x-before[i].x-3.25))
		maximum_error=maxf(maximum_error,absf(after[i].z-before[i].z-2.0))
		maximum_error=maxf(maximum_error,absf(after[i].bottom-before[i].bottom-1.5))
	assert(maximum_error < .0001)
	assert(reopened.find_children("*","MeshInstance3D",true,false).size() == 54)
	print("ANCIENT_TREE_EDIT "+JSON.stringify({"saved_reopened":true,"mesh_count":54,"colliders":after.size(),"baseline_error_m":baseline_error,"edit_collision_error_m":maximum_error,"source_files_overwritten":false,"visual_check":false}))
	reopened.free()
	DirAccess.remove_absolute(destination)
	quit(0)
