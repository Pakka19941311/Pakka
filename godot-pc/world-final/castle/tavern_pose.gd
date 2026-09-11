extends RefCounted
## Additive social poses, confined to ambient tavern residents. The accepted
## hero and combat animation tracks are never modified or duplicated here.
static func rig_for(actor: Node3D) -> Skeleton3D:
	if actor.has_meta("tavern_rig"): return actor.get_meta("tavern_rig")
	var rigs: Array[Node] = (actor.get_meta("visual") as Node3D).find_children("*","Skeleton3D",true,false)
	if rigs.is_empty(): return null
	var rig: Skeleton3D = rigs[0]
	actor.set_meta("tavern_rig",rig)
	return rig

static func aim(rig: Skeleton3D, name: String, tip: String, destination: Vector3) -> void:
	var bone: int = rig.find_bone(name)
	var child: int = rig.find_bone(tip)
	if bone < 0 or child < 0: return
	var pose: Transform3D = rig.get_bone_global_pose(bone)
	var a: Vector3 = (rig.get_bone_global_pose(child).origin-pose.origin).normalized()
	var b: Vector3 = (destination-pose.origin).normalized()
	if a.is_zero_approx() or b.is_zero_approx(): return
	var basis: Basis = Basis(Quaternion(a,b))*pose.basis
	var parent: int = rig.get_bone_parent(bone)
	if parent >= 0: basis = rig.get_bone_global_pose(parent).basis.inverse()*basis
	rig.set_bone_pose_rotation(bone,basis.orthonormalized().get_rotation_quaternion())

static func tankard(actor: Node3D, rig: Skeleton3D) -> void:
	if actor.has_meta("tavern_tankard"): return
	if rig.find_bone("Fist.R") < 0: return
	var hand: BoneAttachment3D = BoneAttachment3D.new()
	hand.bone_name = "Fist.R"
	rig.add_child(hand)
	var cup: MeshInstance3D = MeshInstance3D.new()
	var shape: CylinderMesh = CylinderMesh.new()
	shape.top_radius = .115; shape.bottom_radius = .09; shape.height = .23; shape.radial_segments = 12
	cup.mesh = shape; cup.position = Vector3(0,.03,.06)
	var material: StandardMaterial3D = StandardMaterial3D.new()
	material.albedo_color = Color("787264"); material.metallic = .5; material.roughness = .48
	cup.material_override = material
	hand.add_child(cup)
	actor.set_meta("tavern_tankard",hand)

static func sample(controller: VarendorAnimationController, motion: Dictionary, now: float, dt: float) -> void:
	controller.visual.transform = controller.base_visual
	controller.sample_idle(dt)
	var rig: Skeleton3D = rig_for(controller.actor)
	if rig == null: return
	var head: int = rig.find_bone("Head")
	var torso: int = rig.find_bone("Torso")
	var seconds: float = now/1000.0+float(str(motion.id).get_slice(":",1))*.73
	var activity: String = str(motion.activity)
	if activity == "sit_drink":
		controller.visual.position.y -= .46
		for side: String in ["L","R"]:
			var thigh: int = rig.find_bone("UpperLeg."+side)
			if thigh < 0: continue
			var hip: Vector3 = rig.get_bone_global_pose(thigh).origin
			var knee: Vector3 = hip+Vector3(0,-.04,.50)
			aim(rig,"UpperLeg."+side,"LowerLeg."+side,knee)
			aim(rig,"LowerLeg."+side,"Foot."+side,knee+Vector3(0,-.51,.05))
	if activity == "doze":
		if head >= 0: rig.set_bone_pose_rotation(head,rig.get_bone_pose_rotation(head)*Quaternion(Vector3.RIGHT,.36+.06*sin(seconds*.7)))
		if torso >= 0: rig.set_bone_pose_rotation(torso,rig.get_bone_pose_rotation(torso)*Quaternion(Vector3.RIGHT,.15))
	else:
		var lift: float = smoothstep(.15,.8,(sin(seconds*.75)+1)*.5) if activity in ["drink","sit_drink"] else .15
		if head >= 0:
			var h: Vector3 = rig.get_bone_global_pose(head).origin
			var elbow: Vector3 = h+Vector3(-.35,-.55,.21)
			var hand: Vector3 = h+Vector3(-.08,lerpf(-.62,-.20,lift),lerpf(.39,.23,lift))
			aim(rig,"UpperArm.R","LowerArm.R",elbow)
			aim(rig,"LowerArm.R","Fist.R",hand)
			rig.set_bone_pose_rotation(head,rig.get_bone_pose_rotation(head)*Quaternion(Vector3.RIGHT,-.06*lift))
		if activity in ["drink","sit_drink"]: tankard(controller.actor,rig)
	controller.visual.rotate_z(.025*sin(seconds*.63))
	controller.actor.set_meta("animation_state",activity)
