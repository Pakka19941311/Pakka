extends SceneTree
## A successful editor import can still contain stale cached scene references.
## Load actual runtime models so missing extracted textures fail before export.

var checked: int = 0
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("verify")

func verify_scene(path: String) -> void:
	var resource: Resource = ResourceLoader.load(path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE)
	checked += 1
	if not resource is PackedScene:
		failures.append(path)
		push_error("Missing gameplay scene dependency: "+path)

func verify_directory(path: String) -> void:
	for file: String in DirAccess.get_files_at(path):
		if file.ends_with(".glb"):
			verify_scene(path.path_join(file))
	for directory: String in DirAccess.get_directories_at(path):
		verify_directory(path.path_join(directory))

func verify() -> void:
	verify_scene("res://world-final/geography/landmarks.glb")
	verify_scene("res://world-final/interiors/mine.glb")
	verify_scene("res://world-final/interiors/great_cave.glb")
	verify_directory("res://world-final/geology-D13")
	verify_directory("res://world-final/nature/assets")
	print("GAMEPLAY_IMPORT_DEPENDENCIES "+JSON.stringify({"scenes":checked,"missing":failures}))
	quit(0 if failures.is_empty() and checked > 100 else 1)
