class_name VarendorP2AnimationController
extends "res://scripts/animation_controller.gd"

# An optional instance adapter. The existing controller still owns state,
# cancellation, death and manual AnimationPlayer sampling. No damage is emitted.
var profile: Dictionary = {}

func align_to_ground(height_at: Callable) -> void:
	# Only the visible animal tilts. The authoritative root, picking and route
	# stay untouched. The base controller resets this transform before each pose.
	var bounds: Array = profile.get("pick_size",[1.0,1.0,1.0])
	var radius: float = float(profile.get("ground_radius",maxf(.2,minf(.65,maxf(float(bounds[0]),float(bounds[2]))*.4))))
	var origin: Vector3 = actor.global_position
	var center: float = height_at.call(origin.x,origin.z)
	var dx: float = (float(height_at.call(origin.x+radius,origin.z))-float(height_at.call(origin.x-radius,origin.z)))/(2.0*radius)
	var dz: float = (float(height_at.call(origin.x,origin.z+radius))-float(height_at.call(origin.x,origin.z-radius)))/(2.0*radius)
	var normal := Vector3(-dx,1.0,-dz).normalized()
	var local_normal: Vector3 = (actor.global_basis.inverse()*normal).normalized()
	var support: float = 0.0
	for x: float in [-radius,0.0,radius]:
		for z: float in [-radius,0.0,radius]:
			var residual: float = float(height_at.call(origin.x+x,origin.z+z))-center-dx*x-dz*z
			support = maxf(support,residual)
	visual.transform = Transform3D(Basis(Quaternion(Vector3.UP,local_normal)),Vector3(0,support,0))*visual.transform
	actor.set_meta("p2_ground_fit",{"normal":normal,"support":support,"radius":radius})

func contact_fraction() -> float:
	return float(profile.get("attack_contact", .42))

func react_to_hit(start: float, finish: float) -> void:
	hit_at = start
	hit_until = finish
	var clip: String = find_clip(["hit", "receivehit", "recievehit"])
	if state == "idle" and not clip.is_empty():
		# Visual recoil may continue after the authoritative hit flash. It never
		# locks movement or cancels an attack, and is sampled at source speed.
		hit_pose_until = start + clip_length(clip) * 1000.0

func use_run_gait(speed: float) -> bool:
	var gait: Dictionary = profile.get("gait", {})
	var walk_speed: float = float(gait.get("walk", 1.0))
	return prefer_run or speed > walk_speed * (1.3 if running_gait else 1.6)

func sample_gait(speed: float, dt: float) -> void:
	var gait: Dictionary = profile.get("gait", {})
	running_gait = use_run_gait(speed)
	gait_clip = find_clip(["run" if running_gait else "walk"])
	var native_speed: float = float(gait.get("run" if running_gait else "walk", 1.0))
	var requested: float = speed / maxf(.01, native_speed)
	var maximum: float = float(profile.get("maximum_gait_rate", 1.65))
	playback_rate = minf(requested, maximum)
	actor.set_meta("p2_gait_contract_violation", requested > maximum + .001)
	var diagnostic: Dictionary = {"kind":"gait","mob_id":profile.get("mob_id",""),"clip":gait_clip,"rendered_speed":speed,"source_stride_speed":native_speed,"requested_rate":requested,"maximum_rate":maximum,"applied_rate":playback_rate,"maximum_supported_speed":native_speed*maximum}
	actor.set_meta("p2_gait_contract",diagnostic)
	if requested > maximum + .001:
		actor.set_meta("p2_last_gait_violation",diagnostic.duplicate(true))
	# Stopping is immediate; phase is driven by drawn movement. If the incoming
	# speed exceeds this asset's stride capacity, flag it instead of frantic legs.
	gait_phase = fposmod(gait_phase + playback_rate * dt / clip_length(gait_clip), 1.0)
	sample(gait_clip, gait_phase, true, dt)

func sample_attack(now: float, dt: float) -> void:
	var clip: String = find_clip(["attack"])
	var contact: float = contact_fraction()
	var length: float = clip_length(clip)
	var windup: float = maxf(.001, (attack_impact_at - attack_started_at) / 1000.0)
	var recovery: float = maxf(.001, (attack_ends_at - attack_impact_at) / 1000.0)
	var before_rate: float = length * contact / windup
	var after_rate: float = length * (1.0 - contact) / recovery
	var maximum: float = float(profile.get("maximum_attack_rate", 1.5))
	var clipped: bool = maxf(before_rate, after_rate) > maximum + .001
	actor.set_meta("p2_attack_contract_violation", clipped)
	var diagnostic: Dictionary = {"kind":"attack","mob_id":profile.get("mob_id",""),"clip":clip,"source_length":length,"contact_fraction":contact,"windup_seconds":windup,"recovery_seconds":recovery,"windup_rate":before_rate,"recovery_rate":after_rate,"maximum_rate":maximum,"started_at":attack_started_at,"impact_at":attack_impact_at,"ends_at":attack_ends_at}
	actor.set_meta("p2_attack_contract",diagnostic)
	if clipped:
		actor.set_meta("p2_last_attack_violation",diagnostic.duplicate(true))
	# Even an incompatible incoming clock cannot create damage or accelerate
	# beyond the cap. Trim presentation endpoints while retaining exact contact.
	var first_phase: float = maxf(0.0, contact - windup * maximum / length)
	var last_phase: float = minf(1.0, contact + recovery * maximum / length)
	var phase: float
	if now < attack_impact_at and not released:
		phase = lerpf(first_phase, contact, clampf((now - attack_started_at) / (windup * 1000.0), 0.0, 1.0))
		playback_rate = minf(before_rate, maximum)
	else:
		phase = lerpf(contact, last_phase, clampf((now - attack_impact_at) / (recovery * 1000.0), 0.0, 1.0))
		playback_rate = minf(after_rate, maximum)
	actor.set_meta("p2_sampled_attack_phase", phase)
	sample(clip, phase, false, dt)
