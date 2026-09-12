extends SceneTree
var scene: Node3D
var camera: Camera3D
var output: String = ""
var root_dir: String = "res://world-final/"

func _initialize() -> void:
    call_deferred("run")

func take(name: String, position_value: Vector3, target: Vector3, ortho_size: float = 0.0) -> void:
    camera.projection = Camera3D.PROJECTION_ORTHOGONAL if ortho_size > 0 else Camera3D.PROJECTION_PERSPECTIVE
    if ortho_size > 0: camera.size = ortho_size
    camera.position = position_value
    camera.look_at(target, Vector3.FORWARD if abs(position_value.x-target.x)+abs(position_value.z-target.z)<.01 else Vector3.UP)
    for i in range(4): await process_frame
    await RenderingServer.frame_post_draw
    var result: Error = get_root().get_texture().get_image().save_png(output.path_join(name+".png"))
    assert(result == OK)

func surface_material(node: Node, material: Material) -> void:
    if node is MeshInstance3D: node.material_override = material
    for child in node.get_children(): surface_material(child, material)

func run() -> void:
    for arg: String in OS.get_cmdline_user_args():
        if arg.begins_with("--output="): output = arg.trim_prefix("--output=")
    if output.is_empty():
        quit(2)
        return
    DirAccess.make_dir_recursive_absolute(output)
    get_root().size = Vector2i(1600,1000)
    scene = Node3D.new()
    get_root().add_child(scene)
    var environment: WorldEnvironment = WorldEnvironment.new()
    environment.environment = Environment.new()
    environment.environment.background_mode = Environment.BG_COLOR
    environment.environment.background_color = Color(.36,.49,.58)
    environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    environment.environment.ambient_light_color = Color("bdc9dc")
    environment.environment.ambient_light_energy = .65
    environment.environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    scene.add_child(environment)
    var sun: DirectionalLight3D = DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-48,-35,0)
    sun.light_energy = .95
    sun.light_color = Color("e9eff5")
    sun.shadow_enabled = true
    scene.add_child(sun)
    camera = Camera3D.new()
    camera.fov = 54
    camera.far = 5000
    scene.add_child(camera)
    camera.current = true
    var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(root_dir+"geology-D13/terrain.json"))
    var material: ShaderMaterial = load(root_dir+"materials/geology_material_D12.gd").terrain("D13")
    var count: int = 0
    for cell: Dictionary in meta.chunks:
        # Lake and northern snow highland, directly from shipped terrain GLBs.
        if (int(cell.col)>=320 and int(cell.col)<=640 and int(cell.row)>=128 and int(cell.row)<=448) or (int(cell.col)<=256 and int(cell.row)<=192):
            var piece: Node3D = load(root_dir+"geology-D13/"+str(cell.glb)).instantiate()
            scene.add_child(piece)
            surface_material(piece,material)
            count += 1
    var landmarks: Node3D = load(root_dir+"geography/landmarks.glb").instantiate()
    scene.add_child(landmarks)
    # Keep actual lake and piers, discard unrelated city geometry only in this
    # isolated review. Production landmark data is preserved by the generator.
    for name_value: String in ["Lake_Level_40m","P2_LAKE_WEST_PIER","PIER"]:
        var found: Node3D = landmarks.find_child(name_value,true,false)
        if found != null:
            found.reparent(scene,true)
            if name_value == "Lake_Level_40m":
                var water_material: ShaderMaterial = ShaderMaterial.new()
                water_material.shader = load(root_dir+"materials/lake_water_p2.gdshader")
                (found as MeshInstance3D).material_override = water_material
            if name_value == "P2_LAKE_WEST_PIER":
                var timber_material: ShaderMaterial = ShaderMaterial.new()
                timber_material.shader = load(root_dir+"materials/pier_wood_p2.gdshader")
                (found as MeshInstance3D).material_override = timber_material
    landmarks.queue_free()
    await process_frame
    await take("lake-overview",Vector3(525,385,405),Vector3(176,40,-79))
    await take("lake-top",Vector3(186,650,-77),Vector3(186,40,-77),610)
    await take("new-pier",Vector3(118,54,17),Vector3(100,41.4,-17))
    await take("ground-macro",Vector3(113,56,25),Vector3(105,43,0))
    var sample: Node3D = load(root_dir+"nature/p2-sample-v3/nature_sample.gd").new()
    scene.add_child(sample)
    sample.build()
    await take("shore-macro",Vector3(-34,65,-42),Vector3(-35,40,-76))
    await take("snow-macro",Vector3(-340,340,-325),Vector3(-385,232,-415))
    await take("snow-hero-height",Vector3(-560,254.05,-520),Vector3(-549,252.8,-525))
    var report: Dictionary = {"scope":"isolated shipped geometry and material review","terrain_chunks":count,"screenshots":7,"full_gameplay":false,"collision_report":"art/terrain-lake-p2-v3/geometry-check.json"}
    var file: FileAccess = FileAccess.open(output.path_join("native-review.json"),FileAccess.WRITE)
    file.store_string(JSON.stringify(report,"  "))
    file.close()
    scene.queue_free()
    await process_frame
    await process_frame
    quit(0)
