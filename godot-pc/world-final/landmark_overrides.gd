extends RefCounted
## Replace just the approved landmark ID, preserving the rest of the world.
static func install_ancient_tree(world: Node3D, obstacles: Array) -> Array:
	var old: Node = world.find_child("ANCIENT_TREE",true,false)
	assert(old != null,"Expected authored ANCIENT_TREE landmark")
	if old.get_meta("source_revision","") == "D14":return obstacles
	old.get_parent().remove_child(old)
	old.queue_free()
	var tree: Node3D = load("res://world-final/landmarks/ancient_tree.tscn").instantiate()
	world.add_child(tree)
	var updated: Array = obstacles.filter(func(o: Dictionary):return o.landmark != "ANCIENT_TREE")
	updated.append_array(tree.collision_obstacles())
	return updated
