extends SceneTree

# Read the notices from the exact engine binary used by CI, then exit.
# Godot has no --license command-line option.
func _initialize() -> void:
	var target: String = ""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--license-output="):
			target = arg.trim_prefix("--license-output=")
	if target.is_empty():
		push_error("Missing --license-output")
		quit(2)
		return
	var file: FileAccess = FileAccess.open(target, FileAccess.WRITE)
	if file == null:
		push_error("Cannot write engine license: " + target)
		quit(3)
		return
	file.store_string(Engine.get_license_text())
	file.store_string("\n\nTHIRD-PARTY COPYRIGHT NOTICES\n")
	file.store_string(JSON.stringify(Engine.get_copyright_info(), "  "))
	file.store_string("\n\nTHIRD-PARTY LICENSE TEXTS\n")
	file.store_string(JSON.stringify(Engine.get_license_info(), "  ") + "\n")
	file.close()
	print("ENGINE_LICENSE_WRITTEN version=" + str(Engine.get_version_info().string))
	quit(0)
