extends SceneTree
const Motion = preload("res://scripts/pose_motion.gd")
const Adapter = preload("res://world-expansion-v3/actors/profile_adapter.gd")

func _init() -> void:
	call_deferred("run")

func run() -> void:
	var checks: Dictionary = {}
	var world := VarendorWorld.new()
	root.add_child(world)
	world.set_process(false)
	world.set_physics_process(false)
	world.add_child(world.camera_controller)
	world.data={"items":{}}
	world.labels_layer=Control.new()
	world.add_child(world.labels_layer)
	var actor: Node3D = Adapter.create_actor(world,"clock-slime","MOB-01")
	var controller: VarendorP2AnimationController = actor.get_meta("animation_controller")
	for rate: float in [.85,1.0,1.15]:
		for rig_interval: int in [1,5,25]:
			controller.reset_alive()
			var motion = Motion.new()
			var distance: float = 0.0
			var elapsed: float = 0.0
			var rates_valid: bool = true
			for frame: int in range(100):
				var dt: float = .02*rate
				var direction := Vector3.RIGHT if frame%2==0 else Vector3.FORWARD
				motion.push(direction*1.5*dt,dt)
				distance+=1.5*dt
				elapsed+=dt
				if (frame+1)%rig_interval==0:
					var velocity: Vector3 = motion.consume()
					controller.sample_gait(Vector2(velocity.x,velocity.z).length(),elapsed)
					rates_valid = rates_valid and not actor.get_meta("p2_gait_contract_violation")
					elapsed=0.0
			var expected: float = fposmod(distance/float(controller.profile.gait.run)/controller.clip_length(controller.gait_clip),1.0)
			checks[str(rate)+"_"+str(rig_interval)+"_path_phase"] = absf(controller.gait_phase-expected)<.0001
			checks[str(rate)+"_"+str(rig_interval)+"_source_rate"] = rates_valid
			motion.push(Vector3.ZERO,0.0)
			checks[str(rate)+"_"+str(rig_interval)+"_frozen"] = motion.consume().is_zero_approx()
	for slope: float in [-.3,0.0,.3]:
		for yaw: float in [0.0,PI/2]:
			actor.rotation.y=yaw
			controller.visual.transform=controller.base_visual
			var root_before: Transform3D = actor.global_transform
			controller.align_to_ground(func(x: float,z: float) -> float: return x*slope+z*slope*.5)
			var expected := Vector3(-slope,1.0,-slope*.5).normalized()
			checks[str(slope)+"_"+str(yaw)+"_slope"] = controller.visual.global_basis.y.normalized().dot(expected)>.99999
			checks[str(slope)+"_"+str(yaw)+"_root"] = actor.global_transform==root_before
			checks[str(slope)+"_"+str(yaw)+"_plane_contact"] = float(actor.get_meta("p2_ground_fit").support)<.00001
	world.initialize_pose(actor,Vector3(2,0,1),1)
	var pending = Motion.new()
	pending.push(Vector3(1,0,0),.5)
	actor.set_meta("pose_motion",pending)
	actor.set_meta("pose_delta",.5)
	world.initialize_pose(actor,Vector3(3,0,1),1)
	checks.same_generation_keeps_interpolation = actor.position==Vector3(2,0,1) and actor.get_meta("pose_motion")==pending
	world.initialize_pose(actor,Vector3(-20,0,8),2)
	checks.new_generation_teleports_once = actor.position==Vector3(-20,0,8)
	checks.new_generation_clears_old_gait_distance = not actor.has_meta("pose_motion") and float(actor.get_meta("pose_delta"))==0
	checks.new_generation_requests_initial_pose = bool(actor.get_meta("pose_dirty"))
	actor.set_meta("pose_motion",pending)
	actor.set_meta("pose_delta",.4)
	world.reset_remote_pose_baselines()
	checks.outage_invalidates_old_pose = not actor.get_meta("initialized") and not actor.has_meta("pose_motion") and float(actor.get_meta("pose_delta"))==0
	world.initialize_pose(actor,Vector3(10,0,-5),2)
	checks.outage_same_generation_resets_baseline = actor.position==Vector3(10,0,-5)
	world.queue_free()
	await process_frame
	print("P2_POSE_CLOCK ",JSON.stringify(checks))
	quit(0 if checks.values().all(func(v): return v) else 2)
