extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func use(app: Node, item: Dictionary, kind: String = "bag", slot: String = "cloak") -> bool:
	if not await Wait.until(app,func(): return not app.net.command_busy,4000): return false
	app.item_clicked({"kind":kind,"slot":slot,"item":item},true)
	return await Wait.until(app,func(): return not app.net.command_busy and (app.net.hero.equipment.get(slot,{}).get("uid","")==item.uid if kind=="bag" else not app.net.hero.equipment.get(slot)),5000)

static func run(app: Node, checks: Dictionary) -> void:
	checks.cloak_fixture = not (await Mouse.fixture(app,"p2-cloak")).is_empty()
	var actor: Node3D = app.world.actors[app.world.hero_id]
	var cloak: RefCounted = actor.get_meta("cloak_visual")
	var gear: VarendorKnightEquipment = actor.get_meta("knight_equipment")
	var base: Transform3D = actor.get_meta("base_visual")
	var ids: Array[String] = []
	checks.cloak_live_rig_bound = str(cloak.bind_error).is_empty()
	app.world.camera_distance = 8.5
	app.world.camera_yaw = 0
	await Keys.wait_ms(app.get_tree(),800)
	for id: String in ["cloak_defense","cloak_captain","cloak_sky"]:
		var item: Dictionary = app.net.hero.inventory.filter(func(i): return i.id==id)[0].duplicate(true)
		ids.append(str(item.uid))
		checks[id+"_normal_inventory_action"] = await use(app,item)
		checks[id+"_server_snapshot_attaches_model"] = await Wait.until(app,func(): return cloak.item_id==id and is_instance_valid(cloak.mount),4000)
		checks[id+"_one_cloak_only"] = actor.find_children("EquippedCloak","Node3D",true,false).size()==1 and not gear.meshes.FK_chest_cape.visible
		checks[id+"_actor_transform_unchanged"] = (actor.get_meta("base_visual") as Transform3D).is_equal_approx(base)
		await Keys.wait_ms(app.get_tree(),250)
		app.net.save_private_json(app.qa_path.get_base_dir().path_join("live-"+id+"-state.json"),{"motion":actor.get_meta("motion"),"mount":str(cloak.mount.transform),"root":str(actor.transform),"visual":str(actor.get_meta("visual").transform),"velocity":str(app.world.player_motion.actual_velocity)})
		await Wait.capture(app,"live-"+id)
	var worn: Dictionary = app.net.hero.equipment.cloak.duplicate(true)
	checks.cloak_unequip = await use(app,worn,"equipment")
	checks.cloak_old_chest_cape_restored = await Wait.until(app,func(): return cloak.item_id.is_empty() and not is_instance_valid(cloak.mount) and gear.meshes.FK_chest_cape.visible,4000)
	checks.cloak_three_uids_preserved = ids.all(func(uid): return app.net.hero.inventory.filter(func(i): return i.uid==uid).size()==1)
	var chest: Dictionary = app.net.hero.equipment.chest.duplicate(true)
	checks.cloak_no_phantom_after_chest_removed = await use(app,chest,"equipment","chest")
	checks.cloak_no_phantom_after_chest_removed = checks.cloak_no_phantom_after_chest_removed and await Wait.until(app,func(): return not gear.meshes.FK_chest_cape.visible,4000)
	checks.cloak_chest_requip_restores_original = await use(app,chest,"bag","chest")
	checks.cloak_chest_requip_restores_original = checks.cloak_chest_requip_restores_original and await Wait.until(app,func(): return gear.meshes.FK_chest_cape.visible,4000)
	print("P2_CLOAK_LIVE ",JSON.stringify(checks))
