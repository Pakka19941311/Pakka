class_name VarendorP2ActorAdapter
extends RefCounted

const CONTROLLER = preload("res://world-expansion-v3/actors/profile_animation_controller.gd")
const PROFILE_PATH: String = "res://world-expansion-v3/actors/profiles.json"
static var cached_profiles: Dictionary = {}

static func profiles() -> Dictionary:
	if cached_profiles.is_empty(): cached_profiles = JSON.parse_string(FileAccess.get_file_as_string(PROFILE_PATH))
	return cached_profiles

static func visual_profile_for(monster: Dictionary, definition: Dictionary) -> String:
	var canonical: String = str(monster.get("canonicalMobId",""))
	if canonical in ["MOB-01","MOB-02","MOB-03","MOB-04","MOB-05"]: return canonical
	# Reuse the replacement for the older live Slime and Roach entries too.
	# This does not assign a canonical species, level, reward or body radius.
	var model: String = str(definition.get("visualModel",definition.get("model","")))
	if model in ["Slime","V3StarterSlime","V3FacelessSlime"]: return "MOB-01"
	if model in ["Roach","V3RoachCandidate","V3RoachSixLeg","V3StarterBeetle"]: return "MOB-05"
	return ""

static func create_actor(world: VarendorWorld, id: String, mob_id: String) -> Node3D:
	var profile: Dictionary = profiles()[mob_id]
	var model: String = str(profile.model)
	# Unique V3 names make this opt-in. Existing model paths/profiles stay intact.
	world.templates[model] = load(str(profile.asset_path))
	var registered: Dictionary = VarendorWorld.monster_asset_profiles()
	registered[model] = profile.native_bounds.duplicate(true)
	var actor: Node3D = world.make_actor(id, model, float(profile.height), str(profile.title), Color("dfc9b0"), false)
	var visual: Node3D = actor.get_meta("visual")
	visual.rotation.y = PI
	actor.set_meta("base_visual", visual.transform)
	actor.set_meta("pick_size", Vector3(profile.pick_size[0], profile.pick_size[1], profile.pick_size[2]))
	actor.set_meta("pickable", true)
	actor.set_meta("p2_profile", profile.duplicate(true))
	actor.set_meta("p2_proposed_body_radius", float(profile.body_radius_proposed))
	actor.set_meta("p2_visual_candidate", true)
	var point: Marker3D = Marker3D.new()
	point.name = "P2HitPoint"
	point.position = Vector3(profile.hit_point[0], profile.hit_point[1], profile.hit_point[2])
	actor.add_child(point)
	actor.set_meta("p2_hit_point", point)
	var controller: VarendorP2AnimationController = CONTROLLER.new()
	controller.profile = profile.duplicate(true)
	controller.bind(actor)
	return actor

static func body_radius(actor: Node3D, authoritative_motion: Dictionary = {}) -> float:
	# A snapshot's bodyRadius always wins. The proposed radius is for isolated
	# staging/QA until server population integration is explicitly implemented.
	return float(authoritative_motion.get("bodyRadius", actor.get_meta("p2_proposed_body_radius", .46)))

static func hit_point(actor: Node3D) -> Vector3:
	return (actor.get_meta("p2_hit_point") as Marker3D).global_position

static func event_visual_destination(actor: Node3D, event: Dictionary) -> Vector3:
	if event.get("destination") is Dictionary:
		var destination: Dictionary = event.destination
		return Vector3(float(destination.x), float(destination.y), -float(destination.z))
	return hit_point(actor)
