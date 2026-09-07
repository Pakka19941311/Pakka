class_name VarendorAnimationController
extends RefCounted

# One presentation owner per actor. The server owns combat/lifecycle clocks;
# movement owns body position. This controller samples only the rig and its
# local pose, once per rendered frame, using the presentation clock.
const GAITS: Dictionary = {
	"Warrior": {"height": 2.05, "walk": 1.072079, "run": 3.297988},
	"Wizard": {"height": 2.05, "walk": .993, "run": 3.057},
	"Ranger": {"height": 2.05, "walk": 1.041, "run": 3.203},
	"Rogue": {"height": 2.05, "walk": 1.024, "run": 3.152},
	"Monk": {"height": 2.05, "walk": 1.065, "run": 3.279},
	"Fox": {"height": 1.25, "walk": 1.489192, "run": 1.670283},
	"Skeleton": {"height": 1.9, "walk": 3.228, "run": 3.228},
}

var actor: Node3D
var visual: Node3D
var player: AnimationPlayer
var model: String = ""
var base_visual: Transform3D
var clips: Dictionary = {}
var state: String = "idle"
var current_clip: String = ""
var current_looping: bool = false
var state_started_at: float = 0
var playback_rate: float = 1
var attack_started_at: float = -1
var attack_impact_at: float = -1
var attack_ends_at: float = -1
var released: bool = false
var hit_at: float = -1
var hit_until: float = -1
var death_at: float = -1
var corpse_until: float = -1
var corpse_complete: bool = false
var starts: int = 0
var last_time: float = 0
var was_grounded: bool = true
var land_until: float = -1
var jump_started_at: float = -1
var gait_phase: float = 0
var gait_clip: String = ""
var idle_phase: float = 0
var height: float = 2.05

func bind(body: Node3D) -> void:
	actor = body
	visual = actor.get_meta("visual")
	base_visual = actor.get_meta("base_visual", visual.transform)
	model = str(actor.get_meta("model", ""))
	height = (actor.get_meta("pick_size", Vector3.ONE * 2.05) as Vector3).y
	player = actor.get_meta("player", null)
	if player == null:
		return
	player.stop()
	# PackedScene instances otherwise share Animation resources. A looping idle
	# or held death on one actor must never change another actor's playback.
	for library_name: StringName in player.get_animation_library_list():
		var source: AnimationLibrary = player.get_animation_library(library_name)
		var owned: AnimationLibrary = AnimationLibrary.new()
		for animation_name: StringName in source.get_animation_list():
			owned.add_animation(animation_name, source.get_animation(animation_name).duplicate(true))
		player.remove_animation_library(library_name)
		player.add_animation_library(library_name, owned)
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	for clip: String in player.get_animation_list():
		clips[normalized_name(clip)] = clip
	actor.set_meta("animation_controller", self)

static func normalized_name(clip: String) -> String:
	return clip.get_slice("|", clip.get_slice_count("|") - 1).to_lower()

func find_clip(candidates: Array) -> String:
	for candidate: String in candidates:
		if clips.has(candidate):
			return str(clips[candidate])
		for key: String in clips:
			if key.ends_with("_" + candidate):
				return str(clips[key])
	return ""

func reset_alive() -> void:
	death_at = -1
	corpse_until = -1
	corpse_complete = false
	attack_started_at = -1
	attack_ends_at = -1
	hit_at = -1
	hit_until = -1
	state = "idle"
	current_clip = ""
	was_grounded = true
	land_until = -1
	jump_started_at = -1
	visual.transform = base_visual
	visual.visible = true

func on_event(event: Dictionary, presentation_time_ms: float) -> void:
	var kind: String = str(event.get("kind", ""))
	var event_time: float = float(event.get("at", event.get("time", presentation_time_ms)))
	if kind == "death":
		begin_death(float(event.get("deathAt", event_time)), float(event.get("corpseUntil", event_time + 3000)))
	elif death_at < 0:
		if kind == "attack":
			begin_attack(float(event.get("actionStartedAt", event_time)), float(event.get("impactAt", event_time + 350)), float(event.get("endsAt", event_time + 800)))
		elif kind == "release":
			released = true
			# A late join may first see release; recover a bounded recovery pose.
			if attack_started_at < 0:
				begin_attack(event_time - 1, event_time, event_time + 250)
				released = true
		elif kind == "hit":
			hit_at = event_time
			hit_until = float(event.get("hitUntil", event_time + 180))
		elif kind == "cancel":
			attack_ends_at = -1

func begin_attack(start: float, impact: float, finish: float) -> void:
	if death_at >= 0 or start <= attack_started_at:
		return
	attack_started_at = start
	attack_impact_at = maxf(start + 1, impact)
	attack_ends_at = maxf(attack_impact_at + 1, finish)
	released = false
	# Consecutive attacks are distinct even when both use the same clip.
	current_clip = ""

func begin_death(start: float, finish: float) -> void:
	if death_at >= 0:
		return
	death_at = start
	corpse_until = maxf(start + 650, finish)
	attack_ends_at = -1
	hit_until = -1
	state = "death"
	state_started_at = start
	current_clip = ""
	if player != null:
		player.stop()
	# Even before the next frame, a missing death clip must not remain in a
	# running/idle animation. The fall is sampled continuously in update().
	sample_death(start, 0)

func update(motion: Dictionary, rendered_velocity: Vector3, presentation_time_ms: float, delta: float) -> void:
	var dt: float = maxf(0, delta)
	last_time = presentation_time_ms
	var dead: bool = bool(motion.get("dead", false)) or not bool(motion.get("alive", true)) or float(motion.get("hp", 1)) <= 0
	if dead and death_at < 0:
		begin_death(float(motion.get("deathAt", presentation_time_ms)), float(motion.get("corpseUntil", presentation_time_ms + 3000)))
	if death_at >= 0:
		sample_death(presentation_time_ms, dt)
		return
	var snapshot_start: float = float(motion.get("actionStartedAt", -1))
	if str(motion.get("action", "")) == "attack" and snapshot_start > attack_started_at:
		var finish: float = float(motion.get("actionEndsAt", presentation_time_ms + 800))
		var contact: float = contact_fraction()
		begin_attack(snapshot_start, float(motion.get("hitAt", motion.get("impactAt", snapshot_start + (finish - snapshot_start) * contact))), finish)
	if str(motion.get("combatState", "")) in ["idle", "approach", "face"] and snapshot_start >= attack_started_at:
		# Keep the attack start as a high-water mark so an older snapshot/event
		# cannot resurrect the animation after manual input cancelled it.
		attack_ends_at = -1
	if float(motion.get("hitUntil", -1)) > hit_until:
		hit_until = float(motion.hitUntil)
		hit_at = hit_until - 180
	var grounded: bool = bool(motion.get("grounded", true))
	var vertical: float = float(motion.get("verticalVelocity", rendered_velocity.y))
	var locomotion: String = str(motion.get("locomotionState", "")).to_lower()
	if not grounded and was_grounded:
		jump_started_at = presentation_time_ms
	if grounded and not was_grounded:
		land_until = presentation_time_ms + 160
	was_grounded = grounded
	var speed: float = Vector2(rendered_velocity.x, rendered_velocity.z).length()
	var next_state: String = "idle"
	if attack_started_at >= 0 and presentation_time_ms < attack_ends_at:
		next_state = "attack"
	elif not grounded:
		next_state = "fall" if vertical < -.05 or locomotion == "fall" else "jump_start" if presentation_time_ms - jump_started_at < 100 else "airborne"
	elif presentation_time_ms < land_until:
		next_state = "land"
	elif speed > .025:
		next_state = "run" if speed > 1.8 * height / 2.05 else "walk"
	elif presentation_time_ms < hit_until:
		next_state = "hit"
	set_state(next_state, presentation_time_ms)
	visual.transform = base_visual
	if state == "attack":
		sample_attack(presentation_time_ms, dt)
	elif state in ["walk", "run"]:
		sample_gait(speed, dt)
	elif state in ["jump_start", "airborne", "fall", "land"]:
		sample_airborne(vertical, presentation_time_ms, dt)
	elif state == "hit":
		var hit_clip: String = find_clip(["recievehit", "receivehit", "hit", "recievehit_2"])
		if hit_clip.is_empty():
			sample_idle(dt)
		else:
			sample(hit_clip, clampf((presentation_time_ms - hit_at) / maxf(1, hit_until - hit_at), 0, 1), false, dt)
	else:
		sample_idle(dt)
	# Hit reaction is additive during locomotion/attack; it does not restart or
	# cancel a server-owned attack and cannot hide the bow release/sword impact.
	if presentation_time_ms < hit_until:
		var reaction: float = sin(clampf((presentation_time_ms - hit_at) / maxf(1, hit_until - hit_at), 0, 1) * PI)
		visual.rotate_object_local(Vector3.FORWARD, reaction * .075)
	actor.set_meta("animation_state", state)

func set_state(value: String, now: float) -> void:
	if value != state:
		state = value
		state_started_at = now

func sample_idle(dt: float) -> void:
	var clip: String = find_clip(["idle_weapon", "idle", "survey", "flying"])
	idle_phase = fposmod(idle_phase + dt / clip_length(clip), 1)
	playback_rate = 1
	sample(clip, idle_phase, true, dt)

func sample_gait(speed: float, dt: float) -> void:
	var profile: Dictionary = GAITS.get(model, {"height": height, "walk": 2.25, "run": 2.25})
	var run_clip: String = find_clip(["run_weapon", "run_holding", "run", "running", "flying"])
	var walk_clip: String = find_clip(["walk", "walking", "run", "running", "flying"])
	var next_gait: String = run_clip if state == "run" and not run_clip.is_empty() else walk_clip
	var native_speed: float = float(profile.get("run" if next_gait == run_clip and state == "run" else "walk")) * height / float(profile.height)
	gait_clip = next_gait
	playback_rate = speed / maxf(.01, native_speed)
	# Distance-driven phase: feet stop immediately when the actual body stops,
	# regardless of a stale network action or a held key against a wall.
	gait_phase = fposmod(gait_phase + speed * dt / maxf(.01, native_speed * clip_length(gait_clip)), 1)
	sample(gait_clip, gait_phase, true, dt)

func contact_fraction() -> float:
	return .5 if model == "Warrior" else .56 if model == "Wizard" else .48 if model == "Ranger" else .42

func sample_attack(now: float, dt: float) -> void:
	var before_impact: bool = now < attack_impact_at and not released
	var phase: float
	var clip: String
	if model == "Ranger":
		clip = find_clip(["bow_draw"]) if before_impact else find_clip(["bow_shoot"])
		phase = clampf((now - attack_started_at) / maxf(1, attack_impact_at - attack_started_at), 0, 1) if before_impact else lerpf(.48, 1, clampf((now - attack_impact_at) / maxf(1, attack_ends_at - attack_impact_at), 0, 1))
	else:
		clip = find_clip(["spell1", "spell2", "staff_attack"]) if model == "Wizard" else find_clip(["sword_attack", "dagger_attack", "attack", "bite", "punch"])
		var contact: float = contact_fraction()
		phase = contact * clampf((now - attack_started_at) / maxf(1, attack_impact_at - attack_started_at), 0, 1) if before_impact else lerpf(contact, 1, clampf((now - attack_impact_at) / maxf(1, attack_ends_at - attack_impact_at), 0, 1))
	playback_rate = clip_length(clip) / maxf(.001, (attack_ends_at - attack_started_at) / 1000)
	if clip.is_empty():
		# Fox has Survey/Walk/Run only. Hold its rig and use a single lunge whose
		# maximum extension is exactly the authoritative impact timestamp.
		sample(find_clip(["idle", "survey", "flying"]), 0, false, dt)
		var lunge: float = sin(clampf((now - attack_started_at) / maxf(1, attack_impact_at - attack_started_at), 0, 1) * PI * .5) if before_impact else cos(clampf((now - attack_impact_at) / maxf(1, attack_ends_at - attack_impact_at), 0, 1) * PI * .5)
		visual.rotate_object_local(Vector3.RIGHT, -lunge * .2)
		visual.position.z += lunge * height * .13
	else:
		sample(clip, phase, false, dt)

func sample_airborne(vertical: float, now: float, dt: float) -> void:
	var names: Array = ["jump_start", "jump"] if state == "jump_start" else ["fall", "jump_fall", "jump"] if state == "fall" else ["land", "landing"] if state == "land" else ["jump", "airborne"]
	var clip: String = find_clip(names)
	if clip.is_empty():
		sample(find_clip(["idle_weapon", "idle", "survey", "flying"]), 0, false, dt)
		if state == "land":
			var amount: float = sin(clampf((land_until - now) / 160, 0, 1) * PI)
			visual.scale.y *= 1 - amount * .065
		else:
			visual.rotate_object_local(Vector3.RIGHT, clampf(vertical / 8.2, -1, 1) * -.06)
	else:
		var duration: float = 160 if state == "land" else clip_length(clip) * 1000
		sample(clip, clampf((now - state_started_at) / maxf(1, duration), 0, 1), false, dt)

func sample_death(now: float, dt: float) -> void:
	state = "death"
	actor.set_meta("animation_state", state)
	var age: float = maxf(0, (now - death_at) / 1000)
	var clip: String = find_clip(["death", "die"])
	visual.transform = base_visual
	if clip.is_empty():
		sample(find_clip(["idle", "survey", "flying"]), 0, false, dt)
		var fall: float = smoothstep(0, .45, age)
		visual.rotate_object_local(Vector3.FORWARD, fall * 1.48)
		visual.position.y -= height * .16 * fall
	else:
		sample(clip, clampf(age / minf(clip_length(clip), .95), 0, 1), false, dt)
	# Hold a corpse until the server lifecycle expires. The final 450ms sink is
	# local to the visual rig; it never changes collision/authoritative position.
	var sink: float = clampf((now - (corpse_until - 450)) / 450, 0, 1)
	visual.position.y -= height * .65 * sink
	corpse_complete = now >= corpse_until
	visual.visible = not corpse_complete

func clip_length(clip: String) -> float:
	return maxf(.001, player.get_animation(clip).length) if player != null and not clip.is_empty() else 1

func sample(clip: String, phase: float, looping: bool, dt: float) -> void:
	if player == null or clip.is_empty():
		return
	if current_clip != clip or current_looping != looping:
		current_clip = clip
		current_looping = looping
		var animation: Animation = player.get_animation(clip)
		animation.loop_mode = Animation.LOOP_LINEAR if looping else Animation.LOOP_NONE
		player.play(clip, .07)
		starts += 1
	player.speed_scale = 1
	# Manual processing prevents a second engine animation tick. Advancing blend
	# time and then seeking the authoritative phase keeps attacks and feet synced.
	player.advance(dt)
	player.seek(clampf(phase, 0, .999999) * clip_length(clip), true)
