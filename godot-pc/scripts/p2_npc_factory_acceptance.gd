extends SceneTree
const NPC = preload("res://world-expansion-v3/city/motion/npc_motion_adapter.gd")

func _init() -> void:
	call_deferred("run")

func run() -> void:
	var checks: Dictionary = {}
	var before: Dictionary = VarendorWorld.monster_asset_profiles().duplicate(true)
	for round_index: int in range(2):
		var world: VarendorWorld = VarendorWorld.new()
		root.add_child(world)
		world.set_process(false)
		world.set_physics_process(false)
		world.add_child(world.camera_controller)
		world.data={"items":{}}
		world.labels_layer=Control.new()
		world.add_child(world.labels_layer)
		for role: String in ["guard","resident"]:
			var actor: Node3D = NPC.create_actor(world,"npc-test:"+role,role)
			NPC.advance_actor(actor,"walk",.25,.275)
			checks[str(round_index)+role+"_gait"] = float(actor.get_meta("p2_npc_phase"))>0 and actor.get_meta("p2_npc_state")=="walk"
			checks[str(round_index)+role+"_profile_registry"] = VarendorWorld.monster_asset_profiles()==before
		world.queue_free()
		await process_frame
	print("P2_NPC_FACTORY ",JSON.stringify(checks))
	quit(0 if checks.values().all(func(v): return v) else 2)
