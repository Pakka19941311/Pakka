extends Node3D

const WORLD = preload("res://scripts/world.gd")
const CLOAK = preload("res://scripts/cloak_visual.gd")
const MODELS: Array[String] = ["ForgottenKnight", "Wizard", "Ranger", "Rogue", "Monk"]
var world: Node3D
var bodies: Array[Node3D] = []
var camera: Camera3D
var results: Array[Dictionary] = []
var output: String = ""
var item_ids: Array[String] = ["cloak_defense"]
var capture_images: bool = true

func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--cloak-output="): output = arg.trim_prefix("--cloak-output=")
		if arg == "--all-cloaks": item_ids = ["cloak_defense", "cloak_captain", "cloak_sky"]
		if arg == "--no-images": capture_images = false
	if DisplayServer.get_name()=="headless": capture_images = false
	if output.is_empty():
		push_error("Missing explicit --cloak-output")
		get_tree().quit(2)
		return
	DirAccess.make_dir_recursive_absolute(output)
	DisplayServer.window_set_size(Vector2i(1920, 1080))
	world = WORLD.new()
	world.set_process(false)
	var catalog: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://generated/game.json"))
	if not catalog is Dictionary:
		push_error("Missing generated game catalog")
		get_tree().quit(2)
		return
	world.data = catalog
	world.labels_layer = Control.new()
	add_child(world)
	add_child(world.labels_layer)
	var environment: WorldEnvironment = WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("313942")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("e8edf1")
	environment.environment.ambient_light_energy = .7
	add_child(environment)
	var light: DirectionalLight3D = DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-38,-30,0)
	light.light_energy = 1.5
	light.shadow_enabled = true
	add_child(light)
	var floor_mesh: MeshInstance3D = MeshInstance3D.new()
	var plane: PlaneMesh = PlaneMesh.new()
	plane.size = Vector2(40,40)
	floor_mesh.mesh = plane
	var floor_mat: StandardMaterial3D = StandardMaterial3D.new()
	floor_mat.albedo_color = Color("48505a")
	floor_mat.roughness = 1
	floor_mesh.material_override = floor_mat
	add_child(floor_mesh)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 5.7
	add_child(camera)
	camera.current = true
	for i: int in range(MODELS.size()):
		var actor: Node3D = world.make_actor("cloak-fit-"+str(i),MODELS[i],2.05,MODELS[i],Color.WHITE)
		actor.position.x = (i-2)*1.85
		(actor.get_meta("screen_label") as Label).hide()
		if actor.has_meta("knight_equipment"):
			actor.get_meta("knight_equipment").apply_equipment({"head":{"id":"fallen_helm"},"chest":{"id":"militia_plate"},"gloves":{"id":"wolf_gloves"},"boots":{"id":"grave_boots"},"belt":{"id":"ash_belt"},"weapon":{"id":"wardens_blade"}})
		var cloak: RefCounted = CLOAK.new()
		cloak.bind(actor)
		bodies.append(actor)
		_check(MODELS[i]+" host binding",cloak.bind_error.is_empty(),{"fitScale":cloak.fit_scale,"error":cloak.bind_error})
	await _run()

func _run() -> void:
	for item_id: String in item_ids:
		for actor: Node3D in bodies:
			var cloak: RefCounted = actor.get_meta("cloak_visual")
			cloak.apply_equipment({"cloak":{"id":item_id}})
			var names: Array[String] = []
			if cloak.cloth_rig!=null:
				for bone: int in range(cloak.cloth_rig.get_bone_count()): names.append(String(cloak.cloth_rig.get_bone_name(bone)))
			_check(str(actor.get_meta("model"))+" "+item_id+" skin",cloak.item_id==item_id and cloak.cloth_rig!=null and cloak.cloth_rig.get_bone_count()==4 and not -1 in cloak.cloth_bones,{"boneNames":names,"boundBones":cloak.cloth_bones})
			var mount_id: int = cloak.mount.get_instance_id() if cloak.mount!=null else 0
			cloak.apply_equipment({"cloak":{"id":item_id,"upgrade":7}})
			_check(str(actor.get_meta("model"))+" "+item_id+" repeat has no duplicate",cloak.mount!=null and cloak.mount.get_instance_id()==mount_id and cloak.mount.find_children("*","CollisionObject3D",true,false).is_empty())
		for state: String in ["idle","run","attack","jump"]:
			for actor: Node3D in bodies:
				var controller: RefCounted = actor.get_meta("animation_controller")
				controller.reset_alive()
				actor.position.y = .35 if state=="jump" else 0.0
			for frame: int in range(32):
				var now: float = 1000.0 + frame*16.6667
				for actor: Node3D in bodies:
					var motion: Dictionary = {"grounded":state!="jump","verticalVelocity":1.0,"alive":true,"hp":100}
					if state=="attack": motion.merge({"action":"attack","actionStartedAt":1000,"actionEndsAt":2000,"hitAt":1500})
					var velocity: Vector3 = Vector3(0,0,5.0 if state=="run" else 0.0)
					actor.get_meta("animation_controller").update(motion,velocity,now,1.0/60)
					actor.get_meta("cloak_visual").tick(now,motion,velocity)
				await get_tree().process_frame
			for actor: Node3D in bodies:
				var cloak: RefCounted = actor.get_meta("cloak_visual")
				var bones_before: Array[Transform3D] = []
				for bone: int in range(cloak.host_rig.get_bone_count()): bones_before.append(cloak.host_rig.get_bone_global_pose(bone))
				var repeat_motion: Dictionary = {"alive":true}
				if state=="attack": repeat_motion.merge({"action":"attack","actionStartedAt":1000,"actionEndsAt":2000})
				cloak.tick(1516.67,repeat_motion,Vector3(0,0,5.0 if state=="run" else 0.0))
				var unchanged: bool = true
				for bone: int in range(bones_before.size()): unchanged = unchanged and bones_before[bone].is_equal_approx(cloak.host_rig.get_bone_global_pose(bone))
				_check(str(actor.get_meta("model"))+" "+item_id+" "+state+" avatar pose unchanged",unchanged)
				var points: Array[Vector3] = _skinned_points(cloak.mount)
				var min_y: float = INF
				for point: Vector3 in points: min_y = minf(min_y,point.y)
				_check(str(actor.get_meta("model"))+" "+item_id+" "+state+" ground clearance",not points.is_empty() and min_y>.08,{"vertices":points.size(),"hemFloorMinM":min_y,"anchorM":str(actor.global_transform.affine_inverse()*cloak.mount.global_transform.origin),"restAnchorM":cloak.rest_anchor_height})
			for side: String in ["rear","front"]:
				if not capture_images: continue
				camera.position = Vector3(.1,2.9,-11 if side=="rear" else 11)
				camera.look_at(Vector3(0,1.2,0))
				await get_tree().process_frame
				await RenderingServer.frame_post_draw
				get_viewport().get_texture().get_image().save_png(output.path_join(item_id+"-"+state+"-"+side+".png"))
	for actor: Node3D in bodies:
		var cloak: RefCounted = actor.get_meta("cloak_visual")
		var before: int = (actor.get_meta("visual") as Node3D).get_child_count()
		cloak.apply_equipment({})
		_check(str(actor.get_meta("model"))+" unequip removes accessory",cloak.mount==null and (actor.get_meta("visual") as Node3D).get_child_count()==before-1)
		if actor.has_meta("knight_equipment"):
			var restored: bool = true
			for mesh: MeshInstance3D in cloak.legacy_meshes: restored = restored and mesh.visible
			_check("Knight original cape restored",restored)
			cloak.apply_equipment({"cloak":{"id":"cloak_defense"}})
			actor.get_meta("knight_equipment").apply_equipment({})
			cloak.apply_equipment({})
			var stayed_off: bool = true
			for mesh: MeshInstance3D in cloak.legacy_meshes: stayed_off = stayed_off and not mesh.visible
			_check("Chest unequipped during new cloak cannot resurrect old cape",stayed_off)
	var failed: int = results.filter(func(row: Dictionary) -> bool: return not bool(row.pass)).size()
	var report: Dictionary = {"checks":results.size(),"failed":failed,"results":results,"scope":"native isolated current actor rigs and animation controller; not packaged world acceptance"}
	var file: FileAccess = FileAccess.open(output.path_join("cloak-fit.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"\t"));file.close()
	print("CLOAK_FIT "+JSON.stringify({"checks":results.size(),"failed":failed}))
	world.actors.clear()
	for actor: Node3D in bodies:
		actor.remove_meta("cloak_visual")
		actor.remove_meta("animation_controller")
		if actor.has_meta("knight_equipment"): actor.remove_meta("knight_equipment")
	# make_actor is exercised without world.setup; this Node normally becomes a
	# world child in setup and must be released explicitly in this isolated scene.
	world.camera_controller.free()
	world.camera_controller = null
	world.queue_free()
	bodies.clear()
	await get_tree().process_frame
	await get_tree().process_frame
	get_tree().quit(1 if failed else 0)

func _check(label: String, okay: bool, evidence: Dictionary = {}) -> void:
	results.append({"name":label,"pass":okay,"evidence":evidence})
	if not okay: push_warning("CLOAK CHECK: "+label+" "+JSON.stringify(evidence))

func _skinned_points(root: Node3D) -> Array[Vector3]:
	var points: Array[Vector3] = []
	if root==null: return points
	for candidate: Node in root.find_children("*","MeshInstance3D",true,false):
		var mesh: MeshInstance3D = candidate
		var rig: Skeleton3D = mesh.get_node_or_null(mesh.skeleton) as Skeleton3D
		if mesh.skin==null or rig==null: continue
		for surface: int in range(mesh.mesh.get_surface_count()):
			var arrays: Array = mesh.mesh.surface_get_arrays(surface)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
			var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
			var stride: int = bones.size()/maxi(1,vertices.size())
			for index: int in range(vertices.size()):
				var p: Vector3 = Vector3.ZERO
				for joint: int in range(stride):
					var weight: float = weights[index*stride+joint]
					if weight<=0: continue
					var bind: int = bones[index*stride+joint]
					# Godot imported named binds can retain an index field of zero.
					# Resolve the nonempty bind name first, as the skin itself does.
					var bind_name: StringName = mesh.skin.get_bind_name(bind)
					var bone: int = rig.find_bone(bind_name) if not String(bind_name).is_empty() else mesh.skin.get_bind_bone(bind)
					if bone>=0: p += (rig.get_bone_global_pose(bone)*mesh.skin.get_bind_pose(bind)*vertices[index])*weight
				points.append(rig.global_transform*p)
	return points
