@tool
extends Node3D
## The wrapper transform is the editable landmark placement. Native geometry
## stays immutable; movement and camera obstacles follow the saved transform.
@export_file("*.json") var collision_source: String = "res://world-final/nature/ancient-tree-collision-D14.json"
@export_file("*.json") var source_record: String = "res://world-final/nature/ancient-tree-D14.json"

func collision_obstacles() -> Array:
	var record: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(source_record))
	var anchor: Vector3 = Vector3(record.anchor_xyz[0],record.anchor_xyz[1],record.anchor_xyz[2])
	var data: Array = JSON.parse_string(FileAccess.get_file_as_string(collision_source)).obstacles
	var result: Array = []
	var scale_xz: float = maxf(global_basis.x.length(),global_basis.z.length())
	for original: Dictionary in data:
		var obstacle: Dictionary = original.duplicate(true)
		var local_x: float = float(original.x)-anchor.x
		var local_z: float = -float(original.z)-anchor.z
		var lower: Vector3 = global_transform*Vector3(local_x,float(original.bottom)-anchor.y,local_z)
		var upper: Vector3 = global_transform*Vector3(local_x,float(original.top)-anchor.y,local_z)
		obstacle.x = (lower.x+upper.x)*.5
		obstacle.z = -(lower.z+upper.z)*.5
		obstacle.bottom = minf(lower.y,upper.y)
		obstacle.top = maxf(lower.y,upper.y)
		obstacle.radius = float(original.radius)*scale_xz
		result.append(obstacle)
	return result
