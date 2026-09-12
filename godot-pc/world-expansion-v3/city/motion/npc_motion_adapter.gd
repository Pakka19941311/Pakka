class_name VarendorP2NpcMotionAdapter
extends RefCounted

# Isolated candidate adapter. The eventual caller owns persistent IDs, routes,
# position and yaw. Do not tick the generic controller on the same actor too.
const PROFILES: Dictionary = {
	"guard":{"body_height":1.8,"walk_mps":1.0,"walk_seconds":1.3},
	"resident":{"body_height":1.74,"walk_mps":.9,"walk_seconds":1.4},
}

static func create_actor(world: VarendorWorld, id: String, role: String) -> Node3D:
	assert(PROFILES.has(role))
	var profile: Dictionary = PROFILES[role]
	var model: String = "P2CityMotion" + role.capitalize()
	world.templates[model] = load("res://world-expansion-v3/city/motion/assets/P2_" + role + "_motion.glb")
	VarendorWorld.monster_asset_profiles()[model] = {"sourceHeight":profile.body_height,"sourceFloor":0.0,"sourceWidth":.8,"sourceDepth":.55}
	var actor: Node3D = world.make_actor(id,model,float(profile.body_height),"Страж" if role == "guard" else "Житель",Color("ddc4a4"))
	var visual: Node3D = actor.get_meta("visual")
	visual.rotation.y = PI
	actor.set_meta("base_visual",visual.transform)
	actor.set_meta("p2_npc_role",role)
	actor.set_meta("p2_npc_phase",0.0)
	actor.set_meta("p2_npc_state","")
	actor.set_meta("p2_npc_visual_candidate",true)
	(actor.get_meta("screen_label") as Label).hide()
	return actor

static func pose_at(actor: Node3D, state: String, phase: float) -> void:
	assert(state in ["idle","walk","talk","turn_left","turn_right"])
	var player: AnimationPlayer = actor.get_meta("player")
	var clip: String = ""
	for key: String in player.get_animation_list():
		if key == state or key.ends_with("/" + state) or key.ends_with("|" + state):
			clip = key
			break
	assert(not clip.is_empty(),"Missing authored NPC clip: " + state)
	if str(actor.get_meta("p2_npc_state")) != state:
		player.play(clip)
		actor.set_meta("p2_npc_state",state)
	player.seek(clampf(phase,0.0,1.0) * player.get_animation(clip).length,true)
	actor.set_meta("p2_npc_phase",phase)

static func advance_actor(actor: Node3D, state: String, delta: float, travelled_m: float = 0.0) -> void:
	var profile: Dictionary = PROFILES[str(actor.get_meta("p2_npc_role"))]
	var phase: float = float(actor.get_meta("p2_npc_phase",0.0)) if str(actor.get_meta("p2_npc_state")) == state else 0.0
	var duration: float = float(profile.walk_seconds) if state == "walk" else 3.2 if state == "talk" else 1.2 if state.begins_with("turn") else 4.0
	phase += maxf(0.0,travelled_m)/(float(profile.walk_mps)*duration) if state == "walk" else maxf(0.0,delta)/duration
	pose_at(actor,state,minf(1.0,phase) if state.begins_with("turn") else fposmod(phase,1.0))

static func turn_yaw(progress: float, left: bool = true) -> float:
	var t: float = clampf(progress,0.0,1.0)
	return (PI/2 if left else -PI/2) * t*t*(3.0-2.0*t)
