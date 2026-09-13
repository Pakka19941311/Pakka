extends SceneTree
## A successful editor import can still contain stale cached scene references.
## Load actual runtime models so missing extracted textures fail before export.

var checked: int = 0
var scenes_checked: int = 0
var failures: Array[String] = []
var active_checked: Dictionary = {}

func _initialize() -> void:
	call_deferred("verify")

func verify_scene(path: String) -> void:
	var resource: Resource = ResourceLoader.load(path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE)
	scenes_checked += 1
	checked += 1
	if not resource is PackedScene:
		failures.append(path)
		push_error("Missing gameplay scene dependency: "+path)

func verify_directory(path: String) -> void:
	if not DirAccess.dir_exists_absolute(path):
		failures.append(path)
		return
	for file: String in DirAccess.get_files_at(path):
		var resource_name: String = file.trim_suffix(".remap")
		if resource_name.ends_with(".glb"):
			verify_scene(path.path_join(resource_name))
	for directory: String in DirAccess.get_directories_at(path):
		verify_directory(path.path_join(directory))

func read_manifest(path: String) -> Dictionary:
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not value is Dictionary or value.is_empty():
		failures.append(path)
		push_error("Missing gameplay manifest: " + path)
		return {}
	return value

func verify_resource(path: String) -> void:
	checked += 1
	if ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_IGNORE) == null:
		failures.append(path)
		push_error("Missing gameplay resource: " + path)

func verify_active_p2() -> void:
	# Consume the actual runtime registries. Rejected alternatives/cohorts are
	# intentionally outside this closure; no second model-name list is maintained.
	var profiles: Dictionary = read_manifest("res://world-expansion-v3/actors/profiles.json")
	for id: String in profiles:
		var path: String = str(profiles[id].get("asset_path", ""))
		verify_scene(path)
		active_checked[id] = path
	if profiles.size() != 5:
		failures.append("canonical P2 profile count")
	var cloak_script: GDScript = load("res://scripts/cloak_visual.gd")
	var cloaks: Dictionary = cloak_script.get_script_constant_map().get("ASSETS", {}) if cloak_script != null else {}
	for id: String in cloaks:
		verify_scene(str(cloaks[id]))
		active_checked[id] = str(cloaks[id])
	if cloaks.size() != 3:
		failures.append("active cloak registry")
	var courtyard_json: String = "res://world-final/castle/courtyard-p2.json"
	read_manifest(courtyard_json)
	verify_scene(courtyard_json.replace(".json", ".glb"))
	for file: String in DirAccess.get_files_at("res://world-final/castle"):
		if file.begins_with("courtyard") and file.get_extension() in ["jpg","jpeg","png","webp"]:
			var texture: Texture2D = load("res://world-final/castle/"+file)
			checked += 1
			if texture == null or not texture.get_image().has_mipmaps(): failures.append("city mipmaps: "+file)
	verify_directory("res://world-expansion-v3/city/motion/assets")
	verify_directory("res://world-expansion-v3/city/production")
	var nature_root: String = "res://world-final/nature/p2-sample-v3/"
	var nature_manifest: Dictionary = read_manifest(nature_root + "manifest.json")
	for entry: Dictionary in nature_manifest.get("chunks", []):
		verify_scene(nature_root + str(entry.get("path", "")))
	for entry: Dictionary in nature_manifest.get("textures", {}).values():
		verify_resource(nature_root + str(entry.get("path", "")))
	# Nature shaders are assigned at runtime, rather than embedded in the GLBs.
	for file: String in DirAccess.get_files_at(nature_root):
		var resource_name: String = file.trim_suffix(".remap")
		if resource_name.ends_with(".gdshader"):
			verify_resource(nature_root + resource_name)
	read_manifest(nature_root + "collision.json")
	active_checked["nature_chunks"] = nature_manifest.get("chunks", []).size()
	if int(active_checked["nature_chunks"]) == 0:
		failures.append("active P2 nature chunks")

func verify() -> void:
	verify_scene("res://world-final/geography/landmarks.glb")
	verify_scene("res://world-final/castle/courtyard.glb")
	verify_scene("res://world-final/castle/wildlife/crow.glb")
	verify_scene("res://world-final/castle/wildlife/hare.glb")
	verify_scene("res://world-final/interiors/mine.glb")
	verify_scene("res://world-final/interiors/great_cave.glb")
	verify_directory("res://world-final/geology-D13")
	verify_directory("res://world-final/nature/assets")
	var game: Dictionary = read_manifest("res://generated/game.json")
	if game.get("populationMode", "legacy") == "starter-v3":
		verify_active_p2()
	print("GAMEPLAY_IMPORT_DEPENDENCIES "+JSON.stringify({"resources":checked,"scenes":scenes_checked,"active":active_checked,"missing":failures}))
	quit(0 if failures.is_empty() and scenes_checked > 100 else 1)
