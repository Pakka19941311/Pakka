class_name VarendorP2CityActorAdapter
extends RefCounted

static func create_actor(world: VarendorWorld, id: String, role: String) -> Node3D:
	assert(role in ["guard", "resident"])
	var height: float = 1.8 if role == "guard" else 1.74
	var model: String = "P2City" + role.capitalize()
	world.templates[model] = load("res://world-expansion-v3/city/assets/P2_" + role + ".glb")
	VarendorWorld.monster_asset_profiles()[model] = {"sourceHeight":height,"sourceFloor":0.0,"sourceWidth":.8,"sourceDepth":.55}
	var actor: Node3D = world.make_actor(id, model, height, "Страж · образец" if role == "guard" else "Житель · образец", Color("dfc9b0"))
	var visual: Node3D = actor.get_meta("visual")
	visual.rotation.y = PI
	actor.set_meta("base_visual", visual.transform)
	actor.set_meta("pick_size", Vector3(.8,height,.55))
	actor.set_meta("p2_city_visual_candidate", true)
	actor.set_meta("p2_animation_scope", "authored idle only; walk and guard combat pending")
	(actor.get_meta("screen_label") as Label).hide()
	return actor
