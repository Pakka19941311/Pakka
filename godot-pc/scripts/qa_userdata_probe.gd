extends SceneTree
func _initialize() -> void:
	var directory: String=OS.get_user_data_dir()
	var result: Dictionary={"user_dir":directory,"APPDATA":OS.get_environment("APPDATA"),"LOCALAPPDATA":OS.get_environment("LOCALAPPDATA")}
	if "--qa-user-write-probe" in OS.get_cmdline_user_args():
		var file: FileAccess=FileAccess.open("user://checked-qa-write-probe",FileAccess.WRITE)
		result["write_ok"]=file!=null
		if file!=null:
			file.store_string("QA only");file.close()
			result["remove_error"]=DirAccess.remove_absolute(directory.path_join("checked-qa-write-probe"))
	print("VARENDOR_USER_DIR "+JSON.stringify(result))
	quit(0 if not result.has("write_ok") or result.write_ok else 1)
