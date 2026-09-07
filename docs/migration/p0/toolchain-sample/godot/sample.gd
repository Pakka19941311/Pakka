extends Node3D

func check(condition: bool, message: String) -> void:
	if not condition:
		push_error(message)
		get_tree().quit(1)
		assert(condition, message)

func _ready() -> void:
	var scene: PackedScene = load("res://p0-crate.glb") as PackedScene
	check(scene != null, "Imported scene missing")
	var imported: Node3D = scene.instantiate() as Node3D
	add_child(imported)
	var meshes: Array[Node] = imported.find_children("*", "MeshInstance3D", true, false)
	check(meshes.size() == 1, "Collision-only mesh must not render")
	var mesh: MeshInstance3D = meshes[0] as MeshInstance3D
	var material: BaseMaterial3D = mesh.get_active_material(0) as BaseMaterial3D
	check(material != null and material.albedo_texture != null, "Material texture missing")
	check(material.albedo_texture.get_width() == 1024, "Wrong texture dimensions")
	var arrays: Array = mesh.mesh.surface_get_arrays(0)
	check(arrays[Mesh.ARRAY_TEX_UV].size() > 0, "UV missing")
	var bounds: AABB = mesh.global_transform * mesh.get_aabb()
	check(bounds.size.is_equal_approx(Vector3(0.8252729, 0.3219084, 0.4083103)), "Metric scale changed")
	var shapes: Array[Node] = imported.find_children("*", "CollisionShape3D", true, false)
	check(shapes.size() == 1, "Collision shape missing")
	await get_tree().physics_frame
	await get_tree().physics_frame
	var ray: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(bounds.get_center() + Vector3.UP * 2, bounds.get_center())
	var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(ray)
	check(not hit.is_empty(), "Physics ray did not hit imported collision")
	var players: Array[Node] = imported.find_children("*", "AnimationPlayer", true, false)
	check(players.size() == 1, "Animation player missing")
	var player: AnimationPlayer = players[0] as AnimationPlayer
	var clips: PackedStringArray = player.get_animation_list()
	var clip: String = ""
	for candidate: String in clips:
		if candidate != "RESET":
			clip = candidate
	check(not clip.is_empty(), "Animation clip missing")
	player.play(clip)
	player.advance(0)
	var before: Quaternion = mesh.quaternion
	player.advance(0.5)
	check(not before.is_equal_approx(mesh.quaternion), "Animation did not move the mesh")
	player.stop()
	check(get_meta("p0_preserved_setting") == "wrapper-survives-reimport", "Wrapper setting lost")
	print("P0_SAMPLE_PASS " + JSON.stringify({"engine": Engine.get_version_info().string, "texture_width": material.albedo_texture.get_width(), "metric_bounds": [bounds.size.x, bounds.size.y, bounds.size.z], "uv": true, "collision_ray": true, "animation": clip, "wrapper_setting": true}))
	if "--verify" in OS.get_cmdline_user_args():
		get_tree().quit(0)
		return
	var camera: Camera3D = Camera3D.new()
	add_child(camera)
	camera.position = bounds.get_center() + Vector3(1.3, 1.2, 1.8)
	camera.look_at(bounds.get_center())
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.6
	var light: DirectionalLight3D = DirectionalLight3D.new()
	add_child(light)
	light.rotation_degrees = Vector3(-50, -30, 0)
	light.light_energy = 1.5
