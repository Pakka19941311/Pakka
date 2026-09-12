extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var camera := Camera3D.new()
	root.add_child(camera)
	var collision := VarendorCollision.new()
	collision.setup([])
	var controller := VarendorCameraController.new()
	root.add_child(controller)
	controller.setup(camera,collision,func(_x: float,_z: float)->float: return 0.0)
	var checks: Dictionary = await preload("res://scripts/camera_qa.gd").run(controller,self)
	var failed := []
	for key: String in checks:
		if checks[key] is bool and not checks[key]: failed.append(key)
	print("P2_CAMERA_CONTRACT ",JSON.stringify({"checks":checks,"failed":failed}))
	controller.queue_free()
	camera.queue_free()
	await process_frame
	await process_frame
	quit(0 if failed.is_empty() else 1)
