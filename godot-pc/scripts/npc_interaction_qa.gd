extends RefCounted

class ControlledNetwork extends VarendorNetwork:
	var sent: Array[Dictionary] = []
	func intent(value: Dictionary) -> void:
		sequence += 1
		sent.append(value.duplicate(true))
		intent_reserved.emit(value,sequence)
		intent_submitted.emit(value)

static func transitions() -> Dictionary:
	var checks: Dictionary = {}
	var world: VarendorWorld = VarendorWorld.new()
	world.terrain = JSON.parse_string(FileAccess.get_file_as_string("res://generated/terrain.json"))
	world.collision.setup(world.terrain.colliders)
	for id: String in VarendorNpcInteraction.SERVICES:
		var service: Dictionary = VarendorNpcInteraction.SERVICES[id]
		var actor: Node3D = Node3D.new()
		var position: Vector2 = world.collision.nearest_free(Vector2(service.x,service.z))
		actor.position = world.point(position.x,position.y)
		world.add_child(actor)
		world.actors[id] = actor
	var net: ControlledNetwork = ControlledNetwork.new()
	net.connected = true
	net.hero = {"id":"qa:npc","generation":1,"dead":false,"x":-7.0,"z":-12.0,"lastInputSequence":0}
	world.player_motion.position_value = Vector2(-7,-12)
	var interaction: VarendorNpcInteraction = VarendorNpcInteraction.new()
	interaction.setup(world,net)
	var opened: Array[String] = []
	interaction.service_opened.connect(func(id: String): opened.append(id))
	interaction.begin("npc:shop")
	var goal: Vector2 = Vector2(net.sent[-1].x,net.sent[-1].z)
	checks["npc_far_click_builds_clear_stopping_goal_not_npc_center"] = interaction.phase == "approach" and opened.is_empty() and interaction.ready_for_service("npc:shop",goal) and not world.collision.blocked(goal) and goal.distance_to(Vector2(.3,-7.8)) > .9
	world.player_motion.position_value = goal
	interaction.poll(.1)
	checks["npc_predicted_arrival_alone_cannot_open_service"] = opened.is_empty() and interaction.phase == "approach"
	net.hero.x = goal.x
	net.hero.z = goal.y
	net.hero.lastInputSequence = net.sequence
	interaction.poll(.1)
	checks["npc_authoritative_arrival_requests_stop_before_open"] = opened.is_empty() and interaction.phase == "stopping" and net.sent[-1].type == "cancel"
	interaction.poll(.1)
	checks["npc_stale_ack_cannot_open_service_before_stop"] = opened.is_empty()
	net.hero.lastInputSequence = net.sequence
	interaction.poll(.1)
	interaction.poll(.1)
	checks["npc_stop_ack_opens_once_and_retains_selection"] = opened == ["npc:shop"] and interaction.pending_id.is_empty() and world.target_id == "npc:shop"
	var cancellations: bool = true
	for command: Dictionary in [{"type":"direction","x":1,"z":0},{"type":"destination","x":-7,"z":-15},{"type":"jump"},{"type":"attack","entityId":"qa:monster","skill":null},{"type":"cancel"}]:
		world.player_motion.position_value = Vector2(-7,-12)
		net.hero.x = -7.0
		net.hero.z = -12.0
		interaction.begin("npc:shop")
		net.intent(command)
		interaction.poll(.1)
		cancellations = cancellations and interaction.pending_id.is_empty() and opened.size() == 1
	checks["npc_wasd_ground_jump_combat_escape_cancel_pending_service"] = cancellations
	interaction.begin("npc:elder")
	interaction.begin("npc:shop")
	checks["npc_retarget_replaces_previous_service_intent"] = interaction.pending_id == "npc:shop" and world.target_id == "npc:shop"
	net.intent({"type":"direction","x":0,"z":0})
	net.intent({"type":"attack","entityId":"@self","skill":3})
	checks["npc_neutral_keyup_and_instant_self_buff_preserve_approach"] = interaction.pending_id == "npc:shop" and interaction.phase == "approach"
	net.hero.generation = 2
	interaction.poll(.1)
	checks["npc_teleport_generation_cancels_old_service"] = interaction.pending_id.is_empty()
	interaction.begin("npc:shop")
	net.hero.dead = true
	interaction.poll(.1)
	checks["npc_death_cancels_pending_service"] = interaction.pending_id.is_empty()
	net.hero.dead = false
	interaction.begin("npc:shop")
	net.connected = false
	interaction.poll(.1)
	checks["npc_disconnect_cancels_pending_service"] = interaction.pending_id.is_empty()
	world.camera_controller.free()
	world.free()
	net.free()
	return checks

static func action_button(app: Node, action: String) -> Button:
	if not is_instance_valid(app.active_dialog): return null
	for node: Node in app.active_dialog.find_children("*","Button",true,false):
		if str(node.get_meta("npc_action","")) == action: return node
	return null

static func count_item(hero: Dictionary, id: String) -> int:
	var total: int = 0
	for item: Dictionary in hero.inventory:
		if item.id == id: total += int(item.count)
	return total

static func wait_command(app: Node, tree: SceneTree) -> void:
	var deadline: int = Time.get_ticks_msec()+8000
	while app.net.command_busy and Time.get_ticks_msec() < deadline:
		await tree.process_frame
	await tree.process_frame

static func click_service(app: Node, id: String) -> bool:
	var actor: Node3D = app.world.actors[id]
	var camera: Camera3D = app.world.camera
	var old_pose: Transform3D = camera.transform
	# Real model AABB + actual world occlusion; use an unobstructed view of
	# each service body, without disabling props or mutating actor positions.
	for index: int in range(8):
		var offset: Vector2 = Vector2.RIGHT.rotated(TAU*index/8.0)*7.0
		camera.position = actor.position+Vector3(offset.x,5.0,offset.y)
		camera.look_at(actor.position+Vector3(0,1.0,0))
		for height: float in [1.0,1.65,.5]:
			var screen: Vector2 = camera.unproject_position(actor.position+Vector3(0,height,0))
			if app.world.pick_entity(screen) == id:
				var clicked: bool = app.world.click(screen)
				camera.transform = old_pose
				return clicked
	camera.transform = old_pose
	return false

static func run(app: Node) -> Dictionary:
	var checks: Dictionary = transitions()
	var tree: SceneTree = app.get_tree()
	var opened: Array[String] = []
	var on_open: Callable = func(id: String): opened.append(id)
	app.npc_interaction.service_opened.connect(on_open)
	var observations: Dictionary = {}
	for id: String in ["npc:shop","npc:elder","npc:smith","npc:teleport"]:
		app.close_dialog()
		app.inventory_panel.hide()
		var actor: Node3D = app.world.actors[id]
		var original: Dictionary = VarendorNpcInteraction.SERVICES[id]
		var actual: Vector2 = Vector2(actor.position.x,-actor.position.z)
		checks["npc_"+id.trim_prefix("npc:")+"_body_clear_of_city_props"] = not app.world.collision.blocked(actual) and actual.distance_to(Vector2(original.x,original.z)) < 3.0
		var before: int = opened.size()
		var picked: bool = click_service(app,id)
		checks["npc_"+id.trim_prefix("npc:")+"_actual_model_click"] = picked
		var timeout: int = Time.get_ticks_msec()+20000
		while opened.size() == before and Time.get_ticks_msec() < timeout:
			await tree.process_frame
		var opened_correctly: bool = opened.size() == before+1 and opened[-1] == id
		checks["npc_"+id.trim_prefix("npc:")+"_approach_stop_and_open"] = opened_correctly and app.world.target_id == id and app.npc_interaction.ready_for_service(id,Vector2(app.net.hero.x,app.net.hero.z)) and app.net.hero.destination == null and app.net.hero.target == null
		checks["npc_"+id.trim_prefix("npc:")+"_selection_survives_snapshot_refresh"] = opened_correctly and app.target_panel.visible and app.target_text.text == str(original.name) and not app.target_hp.visible
		observations[id] = {"actor":[actual.x,actual.y],"hero":[app.net.hero.x,app.net.hero.z],"opened":opened_correctly,"ack":app.net.hero.lastInputSequence,"pending":app.npc_interaction.pending_id,"phase":app.npc_interaction.phase}
		if not opened_correctly: continue
		if DisplayServer.get_name() != "headless":
			await tree.process_frame
			checks["npc_"+id.trim_prefix("npc:")+"_graphical_service_capture"] = await preload("res://scripts/reference_ui_qa.gd").capture(app,"npc-"+id.trim_prefix("npc:"))
		if id == "npc:shop":
			var buy: Button = action_button(app,"buy:potion")
			var gold: int = int(app.net.hero.gold)
			var potions: int = count_item(app.net.hero,"potion")
			if buy != null: buy.pressed.emit()
			await wait_command(app,tree)
			checks["npc_shop_button_buys_once_on_authoritative_server"] = buy != null and int(app.net.hero.gold) == gold-55 and count_item(app.net.hero,"potion") == potions+1
		elif id == "npc:elder":
			var accept: Button = action_button(app,"quest")
			var had_accept: bool = accept != null
			if had_accept: accept.pressed.emit()
			await wait_command(app,tree)
			checks["npc_elder_dialog_accepts_persistent_quest"] = had_accept and int(app.net.hero.quest) >= 1
			observations[id]["quest_after"] = int(app.net.hero.quest)
		elif id == "npc:smith":
			checks["npc_smith_opens_functional_inventory_forge"] = app.inventory_panel.visible
			var weapon: Dictionary = app.net.hero.equipment.get("weapon",{}).duplicate()
			var scroll: Dictionary = {}
			for item: Dictionary in app.net.hero.inventory:
				if item.id == "weapon_scroll": scroll = item.duplicate()
			var before_count: int = count_item(app.net.hero,"weapon_scroll")
			if not weapon.is_empty() and int(weapon.plus) < 3 and not scroll.is_empty():
				app.item_clicked({"kind":"bag","item":scroll},true)
				app.item_clicked({"kind":"equipment","slot":"weapon","item":weapon},false)
				await wait_command(app,tree)
			checks["npc_smith_existing_scroll_gesture_enhances_same_item_uid"] = not weapon.is_empty() and app.net.hero.equipment.get("weapon",{}).get("uid","") == weapon.get("uid","") and int(app.net.hero.equipment.get("weapon",{}).get("plus",-1)) == int(weapon.get("plus",-1))+1 and count_item(app.net.hero,"weapon_scroll") == before_count-1
		elif id == "npc:teleport":
			var denied: Button = action_button(app,"teleport:Чёрный лес")
			var before_generation: int = int(app.net.hero.generation)
			var gold: int = int(app.net.hero.gold)
			if denied != null: denied.pressed.emit()
			await wait_command(app,tree)
			checks["npc_teleport_level_denial_keeps_dialog_and_gold"] = denied != null and is_instance_valid(app.active_dialog) and int(app.net.hero.generation) == before_generation and int(app.net.hero.gold) == gold
			var travel: Button = action_button(app,"teleport:Гринфолл")
			var had_travel: bool = travel != null
			if had_travel: travel.pressed.emit()
			await wait_command(app,tree)
			checks["npc_teleport_button_relocates_and_charges_once"] = had_travel and int(app.net.hero.generation) > before_generation and int(app.net.hero.gold) == gold-25 and not app.world.collision.blocked(Vector2(app.net.hero.x,app.net.hero.z))
			observations[id]["travel_result"] = {"generation_before":before_generation,"generation_after":int(app.net.hero.generation),"gold_before":gold,"gold_after":int(app.net.hero.gold),"hero":[app.net.hero.x,app.net.hero.z]}
	checks["npc_service_runtime_observations"] = observations
	app.npc_interaction.service_opened.disconnect(on_open)
	app.close_dialog()
	app.inventory_panel.hide()
	app.world.target_id = ""
	return checks
