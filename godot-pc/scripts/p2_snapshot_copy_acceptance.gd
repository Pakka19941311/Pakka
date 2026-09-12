extends SceneTree
const TimelineQA = preload("res://scripts/snapshot_timeline_qa.gd")
const NetworkQA = preload("res://scripts/network_qa.gd")

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var output: String = ""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--report="): output = arg.trim_prefix("--report=")
	if output.is_empty():
		push_error("Snapshot copy QA requires --report=<new output path>")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(output.get_base_dir())
	var checks: Dictionary = TimelineQA.run()
	var snapshot: Dictionary = TimelineQA.fixture(1000.0)
	snapshot.protocol = 1
	snapshot.character.name = "Проверка"
	snapshot.character.classId = "knight"
	snapshot.character.level = 1
	checks.merge(await NetworkQA.run(self,snapshot,output.get_base_dir()))
	await process_frame
	var ok: bool = checks.values().all(func(value): return value)
	var report: Dictionary = {"ok":ok,"scope":"snapshot-copy-semantics","checks":checks,"method":"Existing timeline/network QA plus nested event ownership and burst/partial UTF-8 tail regression. No FPS claim, renderer or live population changes."}
	var file: FileAccess = FileAccess.open(output,FileAccess.WRITE)
	if file == null:
		push_error("Cannot write snapshot copy QA report")
		quit(2)
		return
	file.store_string(JSON.stringify(report,"  "))
	file.close()
	print("P2_SNAPSHOT_COPY ",JSON.stringify(report))
	quit(0 if ok else 2)
