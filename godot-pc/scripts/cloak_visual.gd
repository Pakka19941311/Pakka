class_name VarendorCloakVisual
extends RefCounted
## A presentation-only accessory. Call tick AFTER the actor animation controller.
## Owns neither avatar bones, gameplay collision, equipment, nor animation clocks.

const ASSETS: Dictionary = {
	"cloak_defense": "res://assets/cloaks-v3/cloak_defense.glb",
	"cloak_captain": "res://assets/cloaks-v3/cloak_captain.glb",
	"cloak_sky": "res://assets/cloaks-v3/cloak_sky.glb",
}
const LEGACY_CAPE_NAMES: Array[String] = [
	"FK_chest_cape", "FK_chest_cloak_conector_left",
	"FK_chest_cloak_conector_right", "FK_chest_top_belt_cloak",
]
static var _scenes: Dictionary = {}
var actor: Node3D
var visual: Node3D
var host_rig: Skeleton3D
var torso: int = -1
var mount: Node3D
var cloth_rig: Skeleton3D
var cloth_bones: Array[int] = []
var cloth_rest_rotations: Array[Quaternion] = []
var item_id: String = ""
var bind_error: String = ""
var rest_torso: Transform3D
var neutral_mount: Transform3D
var legacy_meshes: Array[MeshInstance3D] = []
var legacy_visibility: Dictionary = {}
var fit_scale: float = 1.0
var rest_anchor_height: float = 0.0

func bind(root: Node3D) -> void:
	actor = root
	visual = actor.get_meta("visual", null)
	actor.set_meta("cloak_visual", self)
	if visual == null:
		bind_error = "Actor has no visual"
		return
	host_rig = _skeleton(visual)
	if host_rig == null:
		bind_error = "Actor has no skeleton"
		return
	var knight: bool = str(actor.get_meta("model", "")) == "ForgottenKnight"
	torso = _host_bone("Spine2" if knight else "Torso")
	var neck: int = _host_bone("Neck")
	if torso < 0 or neck < 0:
		bind_error = "Unsupported rig: upper torso/neck missing"
		return
	var rig_in_visual: Transform3D = visual.global_transform.affine_inverse() * host_rig.global_transform
	rest_torso = rig_in_visual * host_rig.get_bone_global_rest(torso)
	var neck_in_actor: Vector3 = actor.global_transform.affine_inverse() * host_rig.global_transform * host_rig.get_bone_global_rest(neck).origin
	fit_scale = clampf(neck_in_actor.y / 1.75814, .65, 1.10)
	# Normalized metres: source skeletons have different units and body heights.
	# The four stylized bodies have a much deeper torso relative to their neck
	# height. A separate depth fit also lengthens the shoulder straps, preserving
	# front clasps instead of translating the entire garment away from the body.
	var anchor: Vector3 = Vector3(0, neck_in_actor.y - .092 * fit_scale, (-.16 if knight else -.33) * fit_scale)
	rest_anchor_height = anchor.y
	var proportions: Vector3 = Vector3(1,1,1 if knight else 1.8) * fit_scale
	var fitted: Transform3D = Transform3D(Basis.from_scale(proportions), anchor)
	neutral_mount = visual.global_transform.affine_inverse() * actor.global_transform * fitted
	for child: Node in visual.find_children("*", "MeshInstance3D", true, false):
		if String(child.name) in LEGACY_CAPE_NAMES:
			legacy_meshes.append(child as MeshInstance3D)
			legacy_visibility[String(child.name)] = (child as MeshInstance3D).visible

func apply_equipment(equipment: Dictionary) -> void:
	var value: Variant = equipment.get("cloak", {})
	var next_id: String = str(value.get("id", "")) if value is Dictionary else str(value) if value is String else ""
	if not ASSETS.has(next_id):
		next_id = ""
	if next_id == item_id:
		_suppress_legacy()
		return
	if is_instance_valid(mount):
		mount.get_parent().remove_child(mount)
		mount.queue_free()
	mount = null
	cloth_rig = null
	cloth_bones.clear()
	cloth_rest_rotations.clear()
	item_id = ""
	_restore_legacy()
	if next_id.is_empty() or not bind_error.is_empty():
		return
	if not _scenes.has(next_id):
		_scenes[next_id] = load(str(ASSETS[next_id])) as PackedScene
	var scene: PackedScene = _scenes[next_id]
	if scene == null:
		bind_error = "Cloak scene unavailable: " + next_id
		return
	mount = Node3D.new()
	mount.name = "EquippedCloak"
	visual.add_child(mount)
	mount.add_child(scene.instantiate())
	cloth_rig = _skeleton(mount)
	if cloth_rig != null:
		for bone_name: String in ["cloak_01", "cloak_02", "cloak_03"]:
			var bone: int = cloth_rig.find_bone(bone_name)
			cloth_bones.append(bone)
			cloth_rest_rotations.append(cloth_rig.get_bone_pose_rotation(bone) if bone>=0 else Quaternion.IDENTITY)
	item_id = next_id
	mount.transform = neutral_mount
	_suppress_legacy()

func tick(presentation_time_ms: float, motion: Dictionary, rendered_velocity: Vector3 = Vector3.ZERO) -> void:
	if not is_instance_valid(mount) or host_rig == null or torso < 0:
		return
	# Sample the current torso pose in visual-local coordinates. Visual death tilt,
	# actor rotation/jump and visibility are inherited exactly once from the parent.
	var pose: Transform3D = visual.global_transform.affine_inverse() * host_rig.global_transform * host_rig.get_bone_global_pose(torso)
	mount.transform = pose * rest_torso.affine_inverse() * neutral_mount
	var speed: float = Vector2(rendered_velocity.x, rendered_velocity.z).length()
	var dead: bool = bool(motion.get("dead", false))
	var moving: float = 0.0 if dead else clampf(speed / 5.0, 0.0, 1.0)
	var local_anchor: Vector3 = actor.global_transform.affine_inverse() * mount.global_transform.origin
	var crouch: float = 0.0 if dead else clampf((rest_anchor_height-local_anchor.y)/(.42*fit_scale),0.0,1.0)
	# The knight's turning strike lowers a hem corner through torso rotation even
	# when the anchor height barely changes. Fold during the actual attack window.
	if not dead and str(actor.get_meta("model", ""))=="ForgottenKnight" and str(motion.get("action", ""))=="attack":
		var started: float = float(motion.get("actionStartedAt",presentation_time_ms))
		var span: float = maxf(1,float(motion.get("actionEndsAt",started+1000))-started)
		crouch = maxf(crouch,sin(PI*clampf((presentation_time_ms-started)/span,0,1)))
	var tuck: float = crouch * (.40 if item_id=="cloak_captain" else .25 if item_id=="cloak_sky" else .05)
	# Restrained kinematic drape, not a cloth solver or a gameplay effect. Lower
	# bones bend back as movement increases, keeping the hem away from rear knees.
	if cloth_rig != null:
		for index: int in range(cloth_bones.size()):
			var bone: int = cloth_bones[index]
			if bone < 0:
				continue
			var sway: float = 0.0 if dead else sin(presentation_time_ms * .001 * 3.1 + index * .7) * (.012 + moving * .022)
			var pitch: float = moving * (.11 if item_id == "cloak_captain" else .075) + tuck
			cloth_rig.set_bone_pose_rotation(bone, cloth_rest_rotations[index] * Quaternion.from_euler(Vector3(pitch, 0, sway)))
	_suppress_legacy()

func _suppress_legacy() -> void:
	if item_id.is_empty():
		return
	for mesh: MeshInstance3D in legacy_meshes:
		if is_instance_valid(mesh):
			mesh.visible = false

func _restore_legacy() -> void:
	for mesh: MeshInstance3D in legacy_meshes:
		if not is_instance_valid(mesh):
			continue
		if actor.has_meta("knight_equipment"):
			# Its live loadout is authoritative for appearance after chest changes.
			var adapter: RefCounted = actor.get_meta("knight_equipment")
			mesh.visible = "armor_chest" in adapter.get("loadout")
		else:
			mesh.visible = bool(legacy_visibility.get(String(mesh.name), false))

func _host_bone(suffix: String) -> int:
	for index: int in range(host_rig.get_bone_count()):
		if String(host_rig.get_bone_name(index)).ends_with(suffix):
			return index
	return -1

static func _skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child: Node in node.get_children():
		var found: Skeleton3D = _skeleton(child)
		if found != null:
			return found
	return null
