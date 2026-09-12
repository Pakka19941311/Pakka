extends RefCounted

const Timeline = preload("res://scripts/snapshot_timeline.gd")

static func fixture(time: float, x: float = 80.0, generation: int = 1) -> Dictionary:
	return {"time":time, "character":{"id":"hero", "generation":generation, "x":x, "z":-60.0, "yOffset":0.0, "yaw":0.0, "hp":100.0, "dead":false, "gold":0, "target":"fox"}, "heroes":[], "monsters":[{"uid":"fox", "generation":1, "x":90.0, "z":-60.0, "yaw":0.0, "hp":100.0, "alive":true, "action":"idle"}], "events":[]}

static func run() -> Dictionary:
	var checks: Dictionary = {}
	var timeline = Timeline.new()
	var original: Dictionary = fixture(1000.0)
	original.events = [{"sequence":1, "at":900.0, "kind":"loot", "actor":"hero", "gold":10}]
	timeline.ingest(original)
	var initial: Dictionary = timeline.advance(0.0)
	checks["timeline_first_snapshot_never_interpolates_from_origin"] = float(timeline.sample_motion("hero").x) == 80.0 and float(timeline.sample_motion("hero").z) == -60.0
	checks["timeline_entry_does_not_replay_historical_loot"] = initial.events.is_empty()
	initial.snapshot.character.x = -999.0
	checks["timeline_preserves_raw_snapshots_and_return_isolation"] = original.character.x == 80.0 and timeline.current.character.x == 80.0 and original.events.size() == 1

	# One received packet can contain the entire attack. Its final HP/rewards
	# must not appear before the presentation clock reaches its hit/death.
	var final_state: Dictionary = fixture(1500.0, 83.0)
	final_state.monsters[0].hp = 0.0
	final_state.monsters[0].alive = false
	final_state.monsters[0].action = "death"
	final_state.character.gold = 11
	final_state.character.target = null
	final_state.events = [
		{"sequence":5, "at":1480.0, "kind":"death", "actor":"fox", "generation":1, "endsAt":4180.0},
		{"sequence":3, "at":1200.0, "kind":"release", "actor":"hero", "target":"fox", "durationMs":280.0},
		{"sequence":2, "at":1100.0, "kind":"attack", "actor":"hero", "target":"fox", "endsAt":1650.0},
		{"sequence":6, "at":1480.0, "kind":"loot", "actor":"hero", "target":"fox", "gold":11},
		{"sequence":4, "at":1480.0, "kind":"hit", "actor":"hero", "target":"fox", "targetHp":0.0, "targetMaxHp":100.0, "targetGeneration":1}
	]
	timeline.ingest(final_state)
	var order: Array[String] = []
	var hp_waited: bool = true
	var rewards_waited: bool = true
	var event_times: Dictionary = {}
	var hit_frame: int = -1
	var release_frame: int = -1
	for frame: int in range(70):
		var result: Dictionary = timeline.advance(1.0 / 60.0)
		if timeline.clock_ms < 1480.0:
			hp_waited = hp_waited and float(timeline.current.monsters[0].hp) == 100.0 and bool(timeline.current.monsters[0].alive)
			rewards_waited = rewards_waited and int(timeline.current.character.gold) == 0
		for event: Dictionary in result.events:
			order.append(str(event.kind))
			event_times[str(event.kind)] = timeline.clock_ms
			if event.kind == "release": release_frame = frame
			if event.kind == "hit": hit_frame = frame
	checks["timeline_batched_attack_release_hit_death_loot_order"] = order == ["attack", "release", "hit", "death", "loot"]
	checks["timeline_hp_and_rewards_never_precede_impact"] = hp_waited and rewards_waited and float(timeline.current.monsters[0].hp) == 0.0
	checks["timeline_projectile_has_real_presentation_flight"] = hit_frame - release_frame >= 10 and float(event_times.get("hit", 0.0)) >= 1480.0
	checks["timeline_death_clears_combat_target_immediately"] = timeline.current.character.target == null and timeline.current.monsters[0].action == "death"
	var duplicate: Dictionary = final_state.duplicate(true)
	duplicate.time = 1600.0
	timeline.ingest(duplicate)
	var duplicate_count: int = 0
	for frame: int in range(20): duplicate_count += timeline.advance(1.0 / 60.0).events.size()
	checks["timeline_retransmitted_events_present_once"] = duplicate_count == 0

	var old_snapshot: Dictionary = fixture(1700.0, 1.0)
	var teleported: Dictionary = fixture(1800.0, -108.0, 2)
	timeline.ingest(teleported)
	var teleport_result: Dictionary = timeline.advance(0.0)
	checks["timeline_generation_resets_at_authoritative_spawn"] = timeline.sample_motion("hero").x == -108.0 and not teleport_result.snapshot.is_empty()
	checks["timeline_stale_generation_and_stale_time_are_rejected"] = not timeline.ingest(old_snapshot) and not timeline.ingest(fixture(1750.0, -99.0, 2)) and timeline.sample_motion("hero").x == -108.0

	var stale_event: Dictionary = fixture(1900.0, -108.0, 2)
	stale_event.events = [{"sequence":7, "at":1850.0, "kind":"hit", "actor":"fox", "target":"hero", "targetGeneration":1, "targetHp":0.0}]
	timeline.ingest(stale_event)
	var stale_events: int = 0
	for frame: int in range(20): stale_events += timeline.advance(1.0 / 60.0).events.size()
	checks["timeline_old_lifecycle_hit_cannot_kill_respawn"] = stale_events == 0 and float(timeline.current.character.hp) == 100.0

	var positions: Dictionary = {}
	var frame_independent: bool = true
	var no_overshoot: bool = true
	for fps: int in [30, 60, 144]:
		var moving = Timeline.new()
		moving.ingest(fixture(0.0, 80.0))
		moving.advance(0.0)
		var next_packet: float = 100.0
		var old_x: float = 80.0
		var largest_step: float = 0.0
		for frame: int in range(1, fps * 2 + 1):
			var elapsed: float = frame * 1000.0 / float(fps)
			while next_packet <= elapsed + .0001:
				moving.ingest(fixture(next_packet, 80.0 + next_packet * .0062))
				next_packet += 100.0
			moving.advance(1.0 / float(fps))
			var x: float = float(moving.sample_motion("hero").x)
			largest_step = maxf(largest_step, x - old_x)
			no_overshoot = no_overshoot and x >= old_x - .0001 and x <= float(moving.latest.character.x) + .0001
			old_x = x
		positions[fps] = old_x
		frame_independent = frame_independent and largest_step <= 6.2 / float(fps) * 1.16
	checks["timeline_motion_speed_bounded_at_30_60_144_fps"] = frame_independent and no_overshoot
	checks["timeline_render_rates_share_server_time_motion"] = absf(float(positions[30]) - float(positions[144])) < .22 and absf(float(positions[60]) - float(positions[144])) < .11

	var blackout = Timeline.new()
	blackout.ingest(fixture(0.0, 80.0))
	blackout.advance(0.0)
	blackout.ingest(fixture(100.0, 80.62))
	for frame: int in range(20): blackout.advance(1.0 / 60.0)
	var stalled_position: float = float(blackout.sample_motion("hero").x)
	blackout.advance(5.0)
	checks["timeline_network_blackout_freezes_without_extrapolation"] = blackout.frozen and float(blackout.sample_motion("hero").x) == stalled_position
	var recovered: Dictionary = fixture(6100.0, 117.82)
	recovered.monsters[0].hp = 0
	recovered.monsters[0].alive = false
	recovered.monsters[0].action = "death"
	recovered.events = [{"sequence":1,"at":3000.0,"kind":"release","actor":"hero","target":"fox","durationMs":280},{"sequence":2,"at":3280.0,"kind":"hit","actor":"hero","target":"fox","targetHp":0,"targetGeneration":1}]
	blackout.ingest(recovered)
	var recovery: Dictionary = blackout.advance(0.0)
	checks["timeline_long_outage_resync_uses_current_hp_and_pose_once"] = blackout.did_resynchronize and float(blackout.sample_motion("hero").x) == 117.82 and float(blackout.current.monsters[0].hp) == 0 and not bool(blackout.current.monsters[0].alive)
	checks["timeline_long_outage_never_replays_old_projectiles_or_backlog"] = recovery.events.is_empty() and blackout.clock_ms == 6100 and blackout.backlog_ms == 0
	var short_jitter = Timeline.new()
	short_jitter.ingest(fixture(1000.0))
	short_jitter.advance(0.0)
	short_jitter.ingest(fixture(1700.0,84.34))
	short_jitter.advance(1.0 / 60)
	checks["timeline_subsecond_jitter_remains_smooth_without_resync"] = not short_jitter.did_resynchronize and short_jitter.clock_ms < 1020 and float(short_jitter.sample_motion("hero").x) < 80.13
	var revision = Timeline.new()
	var base: Dictionary = fixture(0.0)
	base.revision = 1
	revision.ingest(base)
	revision.advance(0.0)
	var newer: Dictionary = base.duplicate(true)
	newer.revision = 2
	newer.character.hp = 90.0
	checks["timeline_same_tick_new_revision_updates_without_rewind"] = revision.ingest(newer) and not revision.ingest(base) and float(revision.advance(0.0).snapshot.character.hp) == 90.0
	var lifecycle = Timeline.new()
	lifecycle.ingest(fixture(0.0))
	lifecycle.advance(0.0)
	var corpse: Dictionary = fixture(100.0)
	corpse.monsters[0].hp = 0.0
	corpse.monsters[0].alive = false
	corpse.monsters[0].x = 94.0
	corpse.events = [{"sequence":1, "at":50.0, "kind":"death", "actor":"fox", "generation":1, "position":{"x":94.0, "z":-60.0, "yOffset":0.0, "yaw":1.0}}]
	lifecycle.ingest(corpse)
	for frame: int in range(4): lifecycle.advance(1.0 / 60.0)
	checks["timeline_death_freezes_at_authoritative_event_position"] = float(lifecycle.sample_motion("fox").x) == 94.0 and not bool(lifecycle.sample_motion("fox").alive)
	var respawn: Dictionary = fixture(200.0)
	respawn.monsters[0].generation = 2
	respawn.monsters[0].x = 30.0
	lifecycle.ingest(respawn)
	var respawn_ready: bool = false
	var corpse_stable: bool = true
	for frame: int in range(20):
		lifecycle.advance(1.0 / 60.0)
		var motion: Dictionary = lifecycle.sample_motion("fox")
		if lifecycle.clock_ms < 200.0:
			corpse_stable = corpse_stable and float(motion.x) == 94.0
		else:
			respawn_ready = int(motion.generation) == 2 and float(motion.x) == 30.0
	checks["timeline_respawn_never_interpolates_from_previous_corpse"] = corpse_stable and respawn_ready
	var low_fps = Timeline.new()
	low_fps.ingest(fixture(0.0))
	low_fps.advance(0.0)
	var bounded_low_fps_backlog: bool = true
	for frame: int in range(1,21):
		low_fps.ingest(fixture(float(frame * 250), 80.0 + frame * .25 * 6.2))
		low_fps.advance(.25)
		bounded_low_fps_backlog = bounded_low_fps_backlog and float(low_fps.latest.time) - low_fps.clock_ms <= 250 and low_fps.backlog_ms <= 250 and not low_fps.did_resynchronize
	checks["timeline_healthy_four_fps_does_not_accumulate_clock_backlog"] = bounded_low_fps_backlog and low_fps.clock_ms >= 4750
	# ingest detaches events from its already-owned snapshot. Later input writes
	# must not mutate queued events, including nested dictionaries.
	var ownership = Timeline.new()
	ownership.ingest(fixture(1000.0))
	ownership.advance(0.0)
	var input_event: Dictionary = {"sequence":1,"kind":"hit","actor":"hero","target":"fox","targetHp":73.0,"position":{"x":90.0}}
	var input_state: Dictionary = fixture(1200.0)
	input_state.events = [input_event]
	ownership.ingest(input_state)
	var original_unchanged: bool = not input_event.has("at") and input_state.events.size() == 1
	input_event.targetHp = 1.0
	input_event.position.x = -900.0
	var presented: Dictionary = ownership.advance(.2)
	checks["timeline_detached_events_keep_nested_input_ownership"] = original_unchanged and presented.events.size() == 1 and float(presented.events[0].targetHp) == 73.0 and float(presented.events[0].position.x) == 90.0
	return checks
