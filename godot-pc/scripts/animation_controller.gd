class_name VarendorAnimationController
extends RefCounted
const CPU_TRACE = preload("res://scripts/p2_cpu_trace.gd")

# One presentation owner per actor. The server owns combat/lifecycle clocks;
# movement owns body position. This controller samples only the rig and its
# local pose, once per rendered frame, using the presentation clock. Presentation
# constants/clip choices follow approved browser 1e94a0d1 actor-animation.ts.
const REFERENCE_BLEND_SECONDS: float = .08
const REFERENCE_JUMP_PHASE: float = .06
const GAITS: Dictionary = {
	"Warrior": {"height": 2.05, "walk": 1.072079, "run": 3.297988},
	# Measured planted-toe travel in the actual imported run, at 1.84 m.
	"ForgottenKnight": {"height": 1.84, "walk": 6.23, "run": 6.23},
	"Wizard": {"height": 2.05, "walk": .993, "run": 3.057},
	"Ranger": {"height": 2.05, "walk": 1.041, "run": 3.203},
	"Rogue": {"height": 2.05, "walk": 1.024, "run": 3.152},
	"Monk": {"height": 2.05, "walk": 1.065, "run": 3.279},
	"Fox": {"height": 1.25, "walk": 1.489192, "run": 1.670283},
	"Skeleton": {"height": 1.9, "walk": 3.228, "run": 3.228},
	# Authored stance travels 40% of body height in 60% of each 1.6s cycle.
	"IceGolem": {"height":3.1,"walk":1.292,"run":1.292},
	"FireGolem": {"height":3.1,"walk":1.292,"run":1.292},
	"RiftWarden": {"height":5.1,"walk":2.125,"run":2.125},
	"HellforgedWarden": {"height":2.8,"walk":1.167,"run":1.167},
	"Werewolf": {"height":3.2,"walk":2.259,"run":2.259},
	"SkeletonV3": {"height":1.92,"walk":.8,"run":.8},
	"GiantBat": {"height":1.6,"walk":3.0,"run":3.0},
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
var hit_pose_until: float = -1
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
var prefer_run: bool = false
var running_gait: bool = false
var pose_rotation: Vector3 = Vector3.ZERO
var pose_offset: Vector3 = Vector3.ZERO
# Asset presentation only. These values never schedule a hit or change its rate.
var knight_skill: int = -1
var knight_combo_index: int = 0
var knight_next_combo: int = 0
var knight_combo_target: String = ""
var knight_combo_finish: float = -1
var knight_previous_combo: Dictionary = {}
var knight_attack_context: Dictionary = {}
var knight_auto_active: bool = false
var knight_hold_until: float = -1
var knight_rig: Skeleton3D
var knight_hips: int = -1
var knight_hips_origin: Vector3 = Vector3.ZERO

func bind(body: Node3D) -> void:
	var cpu_bind: int = CPU_TRACE.begin()
	_profiled_bind(body)
	CPU_TRACE.end("actor.animation_bind",cpu_bind)

func _profiled_bind(body: Node3D) -> void:
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
	if model == "ForgottenKnight":
		for rig: Node in visual.find_children("*", "Skeleton3D", true, false):
			knight_rig = rig as Skeleton3D
			for index: int in range(knight_rig.get_bone_count()):
				if str(knight_rig.get_bone_name(index)).ends_with("Hips"):
					knight_hips = index
					knight_hips_origin = knight_rig.get_bone_rest(index).origin
					break
			if knight_hips >= 0:
				break

static func normalized_name(clip: String) -> String:
	var suffix: String = clip.get_slice("|", clip.get_slice_count("|") - 1)
	return suffix.get_slice("-", suffix.get_slice_count("-") - 1).to_lower()

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
	hit_pose_until = -1
	state = "idle"
	current_clip = ""
	was_grounded = true
	land_until = -1
	jump_started_at = -1
	gait_phase = 0
	idle_phase = 0
	running_gait = false
	knight_skill = -1
	knight_combo_index = 0
	knight_next_combo = 0
	knight_combo_finish = -1
	knight_hold_until = -1
	knight_combo_target = ""
	knight_attack_context.clear()
	knight_previous_combo.clear()
	visual.transform = base_visual
	visual.visible = true

func on_event(event: Dictionary, presentation_time_ms: float) -> void:
	if event.has("bookId"):
		if model == "ForgottenKnight":
			var book: String = str(event.bookId)
			if book not in ["book_knight_10", "book_knight_60"]: return
			event = event.duplicate()
			event["skill"] = 0 if book == "book_knight_10" else 2
	var kind: String = str(event.get("kind", ""))
	var event_time: float = float(event.get("at", event.get("time", presentation_time_ms)))
	if kind == "death":
		begin_death(float(event.get("deathAt", event_time)), float(event.get("corpseUntil", event_time + 3000)))
	elif death_at < 0:
		if kind == "attack":
			begin_attack(float(event.get("actionStartedAt", event_time)), float(event.get("impactAt", event_time + 350)), float(event.get("endsAt", event_time + 800)), event)
		elif kind == "buff" and model == "ForgottenKnight" and int(event.get("skill", -1)) == 3:
			begin_attack(event_time, event_time + 1, event_time + 180, event)
		elif kind == "release":
			released = true
			# A late join may first see release; recover a bounded recovery pose.
			if attack_started_at < 0:
				begin_attack(event_time - 1, event_time, event_time + 250, event)
				released = true
		elif kind == "hit":
			react_to_hit(event_time, float(event.get("hitUntil", event_time + 180)))
		elif kind == "cancel":
			attack_ends_at = -1
			knight_hold_until = -1

func react_to_hit(start: float, finish: float) -> void:
	hit_at = start
	hit_until = finish
	var clip: String = find_clip(["recievehit", "hit"])
	if state == "idle" and not clip.is_empty():
		hit_pose_until = start + minf(.3, clip_length(clip)) * 1000

func begin_attack(start: float, impact: float, finish: float, context: Dictionary = {}) -> void:
	if death_at >= 0 or start < attack_started_at:
		return
	if start == attack_started_at:
		# Snapshots can precede their matching event. Enrich that same action with
		# its skill/target without allocating another combo step or restarting it.
		if model == "ForgottenKnight" and context.has("skill"):
			var actual_skill: int = -1 if context.skill == null else int(context.skill)
			var actual_target: String = str(context.get("target", knight_attack_context.get("resolved_target", "")))
			if actual_skill != knight_skill or actual_target != str(knight_attack_context.get("resolved_target", "")):
				knight_next_combo = int(knight_previous_combo.get("next", 0))
				knight_combo_finish = float(knight_previous_combo.get("finish", -1))
				knight_combo_target = str(knight_previous_combo.get("target", ""))
				configure_knight_attack(start, finish, context)
				current_clip = ""
		return
	attack_started_at = start
	attack_impact_at = maxf(start + 1, impact)
	attack_ends_at = maxf(attack_impact_at + 1, finish)
	released = false
	if model == "ForgottenKnight":
		knight_previous_combo = {"next":knight_next_combo, "finish":knight_combo_finish, "target":knight_combo_target}
		configure_knight_attack(start, finish, context)
	# Consecutive attacks are distinct even when both use the same clip.
	current_clip = ""

func configure_knight_attack(start: float, finish: float, context: Dictionary) -> void:
	knight_attack_context = context.duplicate()
	knight_skill = -1 if context.get("skill", null) == null else int(context.skill)
	knight_hold_until = -1
	if knight_skill >= 0:
		return
	var target: String = str(context.get("target", actor.get_meta("knight_autoattack_target", "")))
	knight_attack_context["resolved_target"] = target
	var chained: bool = bool(actor.get_meta("knight_autoattack_active", true))
	var contiguous: bool = knight_combo_finish >= 0 and start - knight_combo_finish < 600 and target == knight_combo_target
	knight_combo_index = knight_next_combo if chained and contiguous else 0
	knight_next_combo = (knight_combo_index + 1) % 5
	knight_combo_target = target
	knight_combo_finish = finish
	knight_hold_until = finish + minf(350, (finish - start) * .3)

func knight_weapon_equipped() -> bool:
	return bool(actor.get_meta("knight_weapon_equipped", false))

func stabilize_knight_root() -> void:
	if knight_rig == null or knight_hips < 0:
		return
	# The imported hips include horizontal pose offsets (including at idle).
	# Keep the gameplay root in place; retain vertical bend/bob and all rotations.
	# This modifies this instance's sampled pose, never the accepted source clips.
	var pose: Vector3 = knight_rig.get_bone_pose_position(knight_hips)
	pose.x = knight_hips_origin.x
	pose.z = knight_hips_origin.z
	knight_rig.set_bone_pose_position(knight_hips, pose)

func begin_death(start: float, finish: float) -> void:
	if death_at >= 0:
		return
	death_at = start
	corpse_until = maxf(start + 650, finish)
	attack_ends_at = -1
	hit_until = -1
	hit_pose_until = -1
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
	# Local chores use existing authored clips; they cannot schedule damage,
	# acquire a combat target, or alter a network actor's combat animation.
	if motion.get("kind","") == "ambient" and motion.get("state","") == "activity" and motion.get("activity","") in ["drink","sit_drink","doze","tend_bar"]:
		preload("res://world-final/castle/tavern_pose.gd").sample(self,motion,presentation_time_ms,dt)
		return
	if motion.get("kind","") == "ambient" and motion.get("action","") == "gesture":
		var clip: String = find_clip([str(motion.get("activityClip","pickup"))])
		if not clip.is_empty():
			set_state("gesture",presentation_time_ms)
			visual.transform = base_visual
			var span: float = maxf(1,float(motion.actionEndsAt)-float(motion.actionStartedAt))
			sample(clip,clampf((presentation_time_ms-float(motion.actionStartedAt))/span,0,1),false,dt)
			actor.set_meta("animation_state","gesture")
			return
	if model == "ForgottenKnight":
		knight_auto_active = bool(motion.get("autoAttack", actor.get_meta("knight_autoattack_active", false)))
	var snapshot_start: float = float(motion.get("actionStartedAt", -1))
	if str(motion.get("action", "")) == "attack" and snapshot_start > attack_started_at:
		var finish: float = float(motion.get("actionEndsAt", presentation_time_ms + 800))
		var contact: float = contact_fraction()
		var context: Dictionary = {"skill":motion.animationSkill} if model == "ForgottenKnight" and motion.has("animationSkill") else {}
		begin_attack(snapshot_start, float(motion.get("hitAt", motion.get("impactAt", snapshot_start + (finish - snapshot_start) * contact))), finish, context)
	if str(motion.get("combatState", "")) in ["idle", "approach", "face"] and snapshot_start >= attack_started_at:
		# Keep the attack start as a high-water mark so an older snapshot/event
		# cannot resurrect the animation after manual input cancelled it.
		attack_ends_at = -1
	if float(motion.get("hitUntil", -1)) > hit_until:
		react_to_hit(float(motion.hitUntil) - 180, float(motion.hitUntil))
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
	elif model == "ForgottenKnight" and knight_skill < 0 and knight_auto_active and speed <= .025 and grounded and presentation_time_ms >= knight_combo_finish and presentation_time_ms < knight_hold_until:
		next_state = "combo_hold"
	elif not grounded:
		next_state = "fall" if vertical < -.05 or locomotion == "fall" else "jump_start" if presentation_time_ms - jump_started_at < 100 else "airborne"
	elif presentation_time_ms < land_until:
		next_state = "land"
	elif speed > .025:
		next_state = "run" if use_run_gait(speed) else "walk"
	elif presentation_time_ms < hit_pose_until:
		next_state = "hit"
	set_state(next_state, presentation_time_ms)
	visual.transform = base_visual
	pose_rotation = Vector3.ZERO
	pose_offset = Vector3.ZERO
	if state == "attack":
		sample_attack(presentation_time_ms, dt)
	elif state == "combo_hold":
		sample(find_clip(["combo_%02d" % (knight_combo_index + 1)]), 1, false, dt)
	elif state in ["walk", "run"]:
		sample_gait(speed, dt)
	elif state in ["jump_start", "airborne", "fall", "land"]:
		sample_airborne(speed, presentation_time_ms, dt)
	elif state == "hit":
		var hit_clip: String = find_clip(["recievehit", "receivehit", "hit", "recievehit_2"])
		if hit_clip.is_empty():
			sample_idle(dt)
		else:
			sample(hit_clip, clampf((presentation_time_ms - hit_at) / maxf(1, hit_pose_until - hit_at), 0, 1), false, dt)
	else:
		sample_idle(dt)
	# Hit reaction is additive during locomotion/attack; it does not restart or
	# cancel a server-owned attack and cannot hide the bow release/sword impact.
	if presentation_time_ms < hit_until:
		var reaction: float = sin(clampf((presentation_time_ms - hit_at) / maxf(1, hit_until - hit_at), 0, 1) * PI)
		apply_reference_pose(pose_rotation + Vector3(reaction * .07, 0, 0), pose_offset)
	actor.set_meta("animation_state", state)

func set_state(value: String, now: float) -> void:
	if value != state:
		if value in ["idle", "hit", "attack", "death"]:
			gait_phase = 0
			idle_phase = 0
		state = value
		state_started_at = now

func sample_idle(dt: float) -> void:
	var choices: Array = ["idle_weapon", "idle", "survey", "flying"]
	if model == "ForgottenKnight" and not knight_weapon_equipped():
		choices = ["idle", "idle_weapon"]
	var clip: String = find_clip(choices)
	idle_phase = fposmod(idle_phase + dt / clip_length(clip), 1)
	gait_phase = idle_phase
	playback_rate = 1
	sample(clip, idle_phase, true, dt)

func use_run_gait(speed: float) -> bool:
	return prefer_run or speed > (1.55 if running_gait else 1.85) * height / 2.05

func sample_gait(speed: float, dt: float) -> void:
	var profile: Dictionary = GAITS.get(model, {"height": height, "walk": 2.25, "run": 2.25})
	var run_choices: Array = ["run_weapon", "run_holding", "run", "running", "flying"]
	if model == "ForgottenKnight" and not knight_weapon_equipped():
		run_choices = ["run", "run_weapon"]
	var run_clip: String = find_clip(run_choices)
	var walk_clip: String = find_clip(["walk", "running", "run", "flying"])
	running_gait = use_run_gait(speed) and not run_clip.is_empty()
	var next_gait: String = run_clip if running_gait else walk_clip
	var native_speed: float = float(profile.get("run" if running_gait else "walk")) * (clampf(height / float(profile.height),.55,1.25) if model == "Fox" else height / float(profile.height))
	gait_clip = next_gait
	playback_rate = speed / maxf(.01, native_speed)
	# Distance-driven phase: feet stop immediately when the actual body stops,
	# regardless of a stale network action or a held key against a wall.
	gait_phase = fposmod(gait_phase + speed * dt / maxf(.01, native_speed * clip_length(gait_clip)), 1)
	sample(gait_clip, gait_phase, true, dt)

func contact_fraction() -> float:
	return .5 if model in ["Warrior", "ForgottenKnight"] else .56 if model == "Wizard" else .48 if model == "Ranger" else .42

func sample_attack(now: float, dt: float) -> void:
	if model == "ForgottenKnight":
		sample_knight_attack(now, dt)
		return
	var before_impact: bool = now < attack_impact_at and not released
	var phase: float
	# The reference uses one complete attack clip. Switching Bow_Draw to
	# Bow_Shoot at release introduced an extra pose discontinuity in the port.
	var clip: String = find_clip(["spell1", "spell2", "staff_attack"]) if model == "Wizard" else find_clip(["sword_attack", "dagger_attack", "bow_shoot", "attack"])
	var contact: float = contact_fraction()
	phase = contact * clampf((now - attack_started_at) / maxf(1, attack_impact_at - attack_started_at), 0, 1) if before_impact else lerpf(contact, 1, clampf((now - attack_impact_at) / maxf(1, attack_ends_at - attack_impact_at), 0, 1))
	playback_rate = clip_length(clip) / maxf(.001, (attack_ends_at - attack_started_at) / 1000)
	if clip.is_empty():
		# Exact approved fallback: hold the rig while the pose wrapper lunges.
		sample(find_clip(["idle", "survey", "flying"]), 0, false, dt)
		var lunge: float = sin(minf(1, phase / .84) * PI)
		apply_reference_pose(Vector3(-lunge * .2, 0, 0), Vector3(0, 0, lunge * height * .15))
	else:
		sample(clip, phase, false, dt)

func sample_knight_attack(now: float, dt: float) -> void:
	var before: bool = now < attack_impact_at and not released
	var phase: float = .5 * clampf((now - attack_started_at) / maxf(1, attack_impact_at - attack_started_at), 0, 1) if before else lerpf(.5, 1, clampf((now - attack_impact_at) / maxf(1, attack_ends_at - attack_impact_at), 0, 1))
	var clip: String
	if knight_skill == 3:
		# Guard is the knight's only magical skill. Immediate server release uses
		# its release gesture immediately: never prepend a cosmetic cast delay.
		if before:
			var enter: String = find_clip(["cast_enter", "cast_loop", "spell1"])
			var windup_elapsed: float = maxf(0, now - attack_started_at) / 1000
			if windup_elapsed < clip_length(enter):
				sample(enter, windup_elapsed / clip_length(enter), false, dt)
			else:
				clip = find_clip(["cast_loop", "cast_enter"])
				sample(clip, fposmod((windup_elapsed - clip_length(enter)) / clip_length(clip), 1), true, dt)
			return
		var recovery: float = clampf((now - attack_impact_at) / maxf(1, attack_ends_at - attack_impact_at), 0, 1)
		clip = find_clip(["cast_release", "spell1"]) if recovery < .8 else find_clip(["cast_exit", "cast_release"])
		sample(clip, recovery / .8 if recovery < .8 else (recovery - .8) / .2, false, dt)
		return
	elif knight_skill == 0:
		clip = find_clip(["sword_attack_heavy", "sword_attack"])
		# Heavy's first strike, bounded to the first authored contact/recovery.
		phase *= .31
	elif knight_skill == 1:
		clip = find_clip(["block", "sword_attack"])
	elif knight_skill == 2:
		clip = find_clip(["sword_attack", "sword_strike_c"])
	else:
		clip = find_clip(["combo_%02d" % (knight_combo_index + 1), "sword_attack"])
	playback_rate = clip_length(clip) / maxf(.001, (attack_ends_at - attack_started_at) / 1000)
	sample(clip, phase, false, dt)

func sample_airborne(speed: float, _now: float, dt: float) -> void:
	if model == "ForgottenKnight":
		if state == "land":
			if speed > .025:
				sample_gait(speed, dt)
			else:
				sample(find_clip(["jump_land", "idle"]), clampf(1 - (land_until - _now) / 160, 0, 1), false, dt)
		elif state == "jump_start":
			sample(find_clip(["jump_start", "jump_air"]), clampf((_now - jump_started_at) / 100, 0, 1), false, dt)
		else:
			var clip: String = find_clip(["jump_air", "jump_start"])
			sample(clip, fposmod(maxf(0, _now - jump_started_at - 100) / (clip_length(clip) * 1000), 1), true, dt)
		return
	# Reference jump is a frozen running pose, not an idle pose or a second
	# animation-driven Y trajectory. Ground contact immediately resumes gait.
	if state == "land":
		if speed > .025:
			sample_gait(speed, dt)
		else:
			sample_idle(dt)
		return
	var clip: String = find_clip(["run_weapon", "run_holding", "run", "running", "walk", "flying", "idle_weapon", "idle", "survey"])
	sample(clip, REFERENCE_JUMP_PHASE, false, dt)
	apply_reference_pose(Vector3(-.08, 0, 0))

func apply_reference_pose(rotation: Vector3, offset: Vector3 = Vector3.ZERO) -> void:
	# Browser presentation wrapper pivots at 45% of actor height. Transform only
	# the normalized visual, preserving authoritative body, scale and grounding.
	var pivot: Vector3 = base_visual.origin + Vector3(0, height * .45, 0)
	pose_rotation = rotation
	pose_offset = offset
	var turn: Basis = Basis.from_euler(rotation)
	visual.transform = Transform3D(turn * base_visual.basis, pivot + turn * (base_visual.origin - pivot) + offset)

func sample_death(now: float, dt: float) -> void:
	state = "death"
	actor.set_meta("animation_state", state)
	var age: float = maxf(0, (now - death_at) / 1000)
	var clip: String = find_clip(["death", "die"])
	visual.transform = base_visual
	if clip.is_empty():
		sample(find_clip(["idle", "survey", "flying"]), 0, false, dt)
		var fall: float = smoothstep(0, .65, age)
		apply_reference_pose(Vector3(0, 0, fall * 1.48), Vector3(0, -height * .25 * fall, 0))
	else:
		sample(clip, clampf(age / maxf(.65, clip_length(clip)), 0, 1), false, dt)
	# Reference removes the held corpse at lifecycle expiry; no added sinking.
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
		player.play(clip, REFERENCE_BLEND_SECONDS)
		starts += 1
	player.speed_scale = 1
	# Manual processing prevents a second engine animation tick. Advancing blend
	# time and then seeking the authoritative phase keeps attacks and feet synced.
	player.advance(dt)
	player.seek(clampf(phase, 0, .999999) * clip_length(clip), true)
	if model == "ForgottenKnight":
		stabilize_knight_root()
