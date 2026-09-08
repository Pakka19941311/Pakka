extends RefCounted

static func run(tree: SceneTree) -> Dictionary:
	var checks: Dictionary = {}
	var world: VarendorWorld = VarendorWorld.new()
	tree.root.add_child(world)
	world.terrain = {"columns":1,"rows":1,"width":400.0,"depth":400.0,"heights":[0.0,0.0,0.0,0.0],"platforms":[]}
	world.collision.setup([])
	world.hero_id = "qa:hero"
	world.player_motion.identity = world.hero_id
	var source: Node3D = Node3D.new()
	var target: Node3D = Node3D.new()
	world.add_child(source)
	world.add_child(target)
	source.set_meta("motion",{"generation":1})
	source.set_meta("animation_controller",VarendorAnimationController.new())
	target.set_meta("motion",{"generation":3,"hp":90})
	target.set_meta("dead",false)
	target.position = Vector3(10,0,0)
	world.actors = {"qa:hero":source,"qa:target":target}
	world.targeting.select("qa:target")
	world.submit_intent({"type":"direction","x":1.0,"z":0.0})
	checks["reference_wasd_cancels_pursuit_but_keeps_selected_target"] = world.target_id == "qa:target" and world.player_motion.input_mode == "manual"
	world.submit_intent({"type":"destination","x":4.0,"z":0.0})
	checks["reference_ground_command_keeps_selected_target"] = world.target_id == "qa:target" and world.player_motion.input_mode == "destination"
	world.submit_intent({"type":"cancel"})
	world.present_event({"kind":"cancel","actor":"qa:hero","sequence":1,"at":1000})
	checks["reference_cancel_ack_does_not_erase_selected_living_target"] = world.target_id == "qa:target" and world.player_motion.input_mode == "idle"

	world.data = JSON.parse_string(FileAccess.get_file_as_string("res://generated/game.json"))
	var manual_preserved: bool = true
	var destination_preserved: bool = true
	for class_id: String in ["knight","assassin","necro"]:
		world.player_motion.authoritative = {"classId":class_id}
		for target_id: String in ["@self",world.hero_id]:
			world.targeting.select("qa:target")
			world.submit_intent({"type":"direction","x":1.0,"z":0.0})
			for tick: int in range(8): world.player_motion.physics_step(1.0/60.0)
			var before_position: Vector2 = world.player_motion.position_value
			var before_velocity: Vector2 = world.player_motion.velocity
			world.submit_intent({"type":"attack","entityId":target_id,"skill":3})
			manual_preserved = manual_preserved and world.player_motion.input_mode == "manual" and world.player_motion.velocity == before_velocity and world.player_motion.position_value == before_position and world.target_id == "qa:target"
			world.player_motion.physics_step(1.0/60.0)
			manual_preserved = manual_preserved and world.player_motion.position_value.x > before_position.x
			world.submit_intent({"type":"destination","x":world.player_motion.position_value.x+8.0,"z":0.0})
			for tick: int in range(8): world.player_motion.physics_step(1.0/60.0)
			var before_goal: Vector2 = world.player_motion.destination
			var before_path: Array = world.player_motion.navigation_path.duplicate(true)
			before_position = world.player_motion.position_value
			before_velocity = world.player_motion.velocity
			world.submit_intent({"type":"attack","entityId":target_id,"skill":3})
			destination_preserved = destination_preserved and world.player_motion.input_mode == "destination" and world.player_motion.destination == before_goal and world.player_motion.navigation_path == before_path and world.player_motion.velocity == before_velocity and world.target_id == "qa:target"
			world.player_motion.physics_step(1.0/60.0)
			destination_preserved = destination_preserved and world.player_motion.position_value.x > before_position.x
	checks["reference_instant_self_buffs_and_summon_preserve_manual_motion_and_target"] = manual_preserved
	checks["reference_instant_self_buffs_and_summon_preserve_destination_path_and_target"] = destination_preserved
	world.player_motion.cancel_planar()

	var release: Dictionary = {"kind":"release","actor":"qa:hero","target":"qa:target","generation":3,"effect":"arrow","durationMs":280}
	world.show_release(release)
	checks["reference_projectile_initial_pose_is_release_origin"] = world.effects.size() == 1 and world.effects[0].node.position.distance_to(Vector3(0,1.4,0)) < .00001
	target.position.z = -4
	world.update_effects(.14)
	checks["reference_projectile_homes_on_current_target_at_half_flight"] = world.effects.size() == 1 and world.effects[0].node.position.distance_to(Vector3(5,1.4,-2)) < .00001
	var heading: Vector3 = (Vector3(10,1.4,-4) - world.effects[0].node.position).normalized()
	checks["reference_arrow_rotates_toward_moving_endpoint"] = (world.effects[0].node.basis.y as Vector3).normalized().dot(heading) > .999
	world.update_effects(.14)
	checks["reference_projectile_expires_after_028_without_client_damage"] = world.effects.is_empty() and target.get_meta("motion").hp == 90

	world.show_release(release)
	target.set_meta("motion",{"generation":4,"hp":90})
	world.update_effects(.01)
	checks["reference_projectile_does_not_follow_respawn_generation"] = world.effects.is_empty()
	target.set_meta("motion",{"generation":3,"hp":90})
	world.show_release(release)
	target.set_meta("dead",true)
	world.update_effects(.01)
	checks["reference_projectile_stops_when_target_dies"] = world.effects.is_empty()
	target.set_meta("dead",false)
	target.position.z = 0
	world.collision.setup([{"kind":"box","x":3.0,"z":0.0,"halfX":.2,"halfZ":2.0,"rotation":0.0,"bottom":0.0,"top":3.0}])
	world.show_release(release)
	world.update_effects(.14)
	checks["reference_projectile_sweeps_segment_instead_of_passing_wall"] = world.effects.is_empty()
	world.collision.setup([])
	world.terrain.platforms = [{"x":5.0,"z":0.0,"width":2.0,"depth":4.0,"y":2.0}]
	world.show_release(release)
	world.update_effects(.14)
	checks["reference_projectile_checks_terrain_contact"] = world.effects.is_empty()
	world.camera_controller.free()
	world.queue_free()
	await tree.process_frame
	return checks
