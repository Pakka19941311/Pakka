class_name SnapshotTimeline
extends RefCounted

# The server owns simulation and rewards. This clock only presents immutable
# snapshots/events on one time axis, one 30 Hz network frame behind the server. Motion
# samples the same axis instead of starting a new lerp on every HTTP/SSE packet.
const INTERPOLATION_DELAY_MS: float = 1000.0 / 30.0
const MAX_SNAPSHOTS: int = 32
const MAX_CLOCK_RATE: float = 1.15
const DISCONNECT_RESYNC_MS: float = 1000.0
const MOTION_FIELDS: Array[String] = ["id", "uid", "generation", "x", "z", "yOffset", "yaw", "velocityX", "velocityZ", "verticalVelocity", "grounded", "locomotionState", "action", "actionStartedAt", "actionEndsAt", "combatState", "hp", "alive", "dead", "hitUntil", "deathAt", "corpseUntil", "bodyRadius", "attackRange"]

var clock_ms: float = 0.0
var current: Dictionary = {}
var latest: Dictionary = {}
var backlog_ms: float = 0.0
var frozen: bool = true
var did_resynchronize: bool = false

var _snapshots: Array[Dictionary] = []
var _snapshot_entities: Array[Dictionary] = []
var _current_entities: Dictionary = {}
var _events: Array[Dictionary] = []
var _seen_sequences: Dictionary = {}
var _sequence_floor: int = -1
var _highest_sequence: int = -1
var _entry_time: float = 0.0
var _source_time: float = 0.0
var _arrival_age_ms: float = 0.0
var _buffer_ready: bool = false
var _initial_pending: bool = false
var _hero_id: String = ""
var _generation: int = -1

func reset() -> void:
	clock_ms = 0.0
	current = {}
	latest = {}
	backlog_ms = 0.0
	frozen = true
	did_resynchronize = false
	_snapshots.clear()
	_snapshot_entities.clear()
	_current_entities.clear()
	_events.clear()
	_seen_sequences.clear()
	_sequence_floor = -1
	_highest_sequence = -1
	_entry_time = 0.0
	_source_time = 0.0
	_arrival_age_ms = 0.0
	_buffer_ready = false
	_initial_pending = false
	_hero_id = ""
	_generation = -1

func ingest(snapshot: Dictionary) -> bool:
	did_resynchronize = false
	if not snapshot.has("time") or not snapshot.get("character", {}) is Dictionary:
		return false
	var hero: Dictionary = snapshot.get("character", {})
	if hero.is_empty() or not hero.has("id"):
		return false
	var received_time: float = float(snapshot.time)
	if not is_finite(received_time):
		return false
	var received_id: String = str(hero.id)
	var received_generation: int = int(hero.get("generation", 0))
	if not latest.is_empty():
		# HTTP replies from before teleport/respawn may arrive after the new SSE
		# generation. They can neither rewind the actor nor resurrect its events.
		if received_id == _hero_id and received_generation < _generation:
			return false
		if received_time < float(latest.time):
			return false
		if received_id != _hero_id or received_generation > _generation:
			reset()
		elif received_time == float(latest.time) and int(snapshot.get("revision", 0)) <= int(latest.get("revision", 0)):
			return false
	if not latest.is_empty() and (received_time - float(latest.time) > DISCONNECT_RESYNC_MS or _arrival_age_ms > DISCONNECT_RESYNC_MS):
		# After a real outage, replaying seconds of old combat would leave HP,
		# targets and projectiles detached from the responsive local player.
		# This explicit recovery uses one authoritative baseline correction;
		# ordinary network jitter still uses the bounded interpolated clock.
		reset()
		did_resynchronize = true
	var owned: Dictionary = snapshot.duplicate(true)
	var incoming_events: Array = owned.get("events", []).duplicate(true)
	owned["events"] = []
	latest = owned
	_arrival_age_ms = 0.0
	if current.is_empty():
		_hero_id = received_id
		_generation = received_generation
		_entry_time = received_time
		clock_ms = received_time
		_source_time = received_time
		current = owned.duplicate(true)
		_current_entities = _index_entities(current)
		_initial_pending = true
	if not _snapshots.is_empty() and float(_snapshots[-1].time) == received_time:
		_snapshots[-1] = owned
		_snapshot_entities[-1] = _index_entities(owned)
		if received_time <= clock_ms:
			current = owned.duplicate(true)
			_current_entities = _index_entities(current)
			_source_time = received_time
			_initial_pending = true
	else:
		_snapshots.append(owned)
		_snapshot_entities.append(_index_entities(owned))
	for event: Dictionary in incoming_events:
		var sequence: int = int(event.get("sequence", -1))
		if sequence < 0 or sequence <= _sequence_floor or _seen_sequences.has(sequence):
			continue
		_seen_sequences[sequence] = true
		_highest_sequence = maxi(_highest_sequence, sequence)
		var event_time: float = float(event.get("at", received_time))
		# On entry, the snapshot is already the result of its historical events.
		# Replaying them would duplicate old loot messages and dead projectiles.
		if event_time <= _entry_time:
			continue
		event["at"] = event_time
		_events.append(event)
	_events.sort_custom(_event_before)
	if _highest_sequence - _sequence_floor > 4096:
		_sequence_floor = _highest_sequence - 2048
		for sequence: int in _seen_sequences.keys():
			if sequence <= _sequence_floor:
				_seen_sequences.erase(sequence)
	# Keep the current bracket and newest future samples. Subsecond jitter
	# retains events; explicit disconnect recovery above discards stale FX.
	while _snapshots.size() > MAX_SNAPSHOTS:
		_snapshots.remove_at(2)
		_snapshot_entities.remove_at(2)
	if float(latest.time) - clock_ms >= INTERPOLATION_DELAY_MS:
		_buffer_ready = true
	return true

func advance(delta: float) -> Dictionary:
	var result: Dictionary = {"snapshot":{}, "events":[], "transitions":[]}
	if current.is_empty():
		return result
	var elapsed_ms: float = maxf(0.0, delta) * 1000.0
	_arrival_age_ms += elapsed_ms
	var changed: bool = _initial_pending
	_initial_pending = false
	if _buffer_ready:
		var desired: float = minf(float(latest.time), float(latest.time) + _arrival_age_ms - INTERPOLATION_DELAY_MS)
		var error: float = desired - clock_ms
		# The normal-rate term already advances one frame: compensate drift
		# against where the clock should end this frame, not its starting point.
		var rate: float = clampf(1.0 + (error - elapsed_ms) / 600.0, .85, MAX_CLOCK_RATE)
		var step: float = elapsed_ms * rate
		clock_ms = minf(float(latest.time), clock_ms + step)
	frozen = clock_ms >= float(latest.time) or not _buffer_ready
	backlog_ms = maxf(0.0, float(latest.time) + _arrival_age_ms - clock_ms - INTERPOLATION_DELAY_MS)
	var due_events: Array = []
	var transitions: Array = []
	while true:
		var snapshot_time: float = float(_snapshots[1].time) if _snapshots.size() > 1 else INF
		var event_time: float = float(_events[0].at) if not _events.is_empty() else INF
		if minf(snapshot_time, event_time) > clock_ms:
			break
		if event_time <= snapshot_time:
			var event: Dictionary = _events.pop_front()
			if not _event_matches_lifecycle(event):
				continue
			event["presentationAgeMs"] = maxf(0.0, clock_ms - event_time)
			var state_changed: bool = _apply_event_state(event)
			changed = changed or state_changed
			due_events.append(event.duplicate(true))
			transitions.append({"time":event_time, "event":event.duplicate(true)})
		else:
			_snapshots.pop_front()
			_snapshot_entities.pop_front()
			current = _snapshots[0].duplicate(true)
			_current_entities = _index_entities(current)
			_source_time = float(current.time)
			changed = true
			transitions.append({"time":_source_time, "snapshot":current.duplicate(true)})
	current["time"] = clock_ms
	current["events"] = []
	result.events = due_events
	result.transitions = transitions
	if changed:
		result.snapshot = current.duplicate(true)
	return result

func sample_motion(entity_id: String) -> Dictionary:
	if _snapshots.is_empty():
		return {}
	var presented: Dictionary = _current_entities.get(entity_id, {})
	if not presented.is_empty() and (bool(presented.get("dead", false)) or not bool(presented.get("alive", true))):
		return _motion_fields(presented)
	var before: Dictionary = _snapshot_entities[0].get(entity_id, {})
	if before.is_empty():
		return {}
	var after: Dictionary = _snapshot_entities[1].get(entity_id, {}) if _snapshots.size() > 1 else before
	if after.is_empty():
		after = before
	var sample: Dictionary = _motion_fields(before)
	if int(before.get("generation", 0)) != int(after.get("generation", 0)):
		# A respawn uses its first authoritative position, never a path from
		# the old corpse or from Vector3.ZERO across the map.
		return sample
	var factor: float = 0.0
	if _snapshots.size() > 1:
		var span: float = float(_snapshots[1].time) - float(_snapshots[0].time)
		factor = clampf((clock_ms - float(_snapshots[0].time)) / maxf(1.0, span), 0.0, 1.0)
	for key: String in ["x", "z", "yOffset", "velocityX", "velocityZ", "verticalVelocity"]:
		sample[key] = lerpf(float(before.get(key, 0.0)), float(after.get(key, before.get(key, 0.0))), factor)
	sample["yaw"] = lerp_angle(float(before.get("yaw", 0.0)), float(after.get("yaw", before.get("yaw", 0.0))), factor)
	return sample

func _event_before(a: Dictionary, b: Dictionary) -> bool:
	var a_time: float = float(a.at)
	var b_time: float = float(b.at)
	return int(a.sequence) < int(b.sequence) if a_time == b_time else a_time < b_time

func _motion_fields(entity: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for key: String in MOTION_FIELDS:
		if entity.has(key):
			result[key] = entity[key]
	return result

func _index_entities(snapshot: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for group: String in ["heroes", "monsters", "summons", "npcs"]:
		for actor: Dictionary in snapshot.get(group, []):
			result[str(actor.get("uid", actor.get("id", "")))] = actor
	var hero: Dictionary = snapshot.get("character", {})
	if not hero.is_empty():
		result[str(hero.id)] = hero
	return result

func _event_matches_lifecycle(event: Dictionary) -> bool:
	var actor: Dictionary = _current_entities.get(str(event.get("actor", "")), {})
	var target: Dictionary = _current_entities.get(str(event.get("target", "")), {})
	if event.has("actorGeneration") and not actor.is_empty() and int(event.actorGeneration) != int(actor.get("generation", 0)):
		return false
	if str(event.get("kind", "")) == "death":
		return not actor.is_empty() and int(event.get("generation", actor.get("generation", 0))) == int(actor.get("generation", 0))
	if event.has("targetGeneration") and not target.is_empty() and int(event.targetGeneration) != int(target.get("generation", 0)):
		return false
	return true

func _apply_event_state(event: Dictionary) -> bool:
	# An authoritative snapshot may already contain the result of a late event.
	# Such a visual event can catch up, but must never rewind newer HP/state.
	if float(event.at) <= _source_time:
		return false
	var kind: String = str(event.get("kind", ""))
	var entity_id: String = str(event.get("target", "")) if kind == "hit" else str(event.get("actor", ""))
	var actor: Dictionary = _current_entities.get(entity_id, {})
	if actor.is_empty():
		return false
	if kind == "hit" and event.has("targetHp"):
		actor["hp"] = maxf(0.0, float(event.targetHp))
		if event.has("targetMaxHp"):
			actor["maxHp"] = float(event.targetMaxHp)
		actor["hitUntil"] = float(event.at) + 180.0
		if float(actor.hp) <= 0.0:
			if actor.has("alive"):
				actor["alive"] = false
			else:
				actor["dead"] = true
		return true
	if kind == "death":
		actor["hp"] = 0.0
		if actor.has("alive"):
			actor["alive"] = false
		else:
			actor["dead"] = true
		actor["combatState"] = "dead"
		actor["action"] = "death"
		actor["actionStartedAt"] = float(event.at)
		actor["deathAt"] = float(event.at)
		actor["corpseUntil"] = float(event.get("endsAt", float(event.at) + 2700.0))
		actor["velocityX"] = 0.0
		actor["velocityZ"] = 0.0
		actor["targetId"] = null
		if event.get("position", {}) is Dictionary:
			var position: Dictionary = event.get("position", {})
			for key: String in ["x", "z", "yOffset", "yaw"]:
				if position.has(key):
					actor[key] = position[key]
		var hero: Dictionary = current.get("character", {})
		if str(hero.get("target", "")) == entity_id:
			hero["target"] = null
		return true
	return false
