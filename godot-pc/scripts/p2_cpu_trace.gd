extends RefCounted
## Opt-in inclusive CPU timers. Disabled until the dedicated QA block starts.
## No mesh/vertex inspection, disk I/O, logging or scene mutations in a timed frame.
static var enabled: bool = false
static var phase: String = ""
static var started_usec: int = 0
static var last_frame_usec: int = 0
static var spans: Dictionary = {}
static var counts: Dictionary = {}
static var frames: Dictionary = {}
static var events: Array = []

static func begin_phase(name: String) -> void:
	phase = name
	spans = {}; counts = {}; frames = {}; events = []
	started_usec = Time.get_ticks_usec()
	last_frame_usec = 0
	enabled = true

static func begin() -> int:
	return Time.get_ticks_usec() if enabled else 0

static func bucket() -> Dictionary:
	var index: int = Engine.get_process_frames()
	if not frames.has(index): frames[index] = {"frame":index,"timings_ms":{},"calls":{}}
	return frames[index]

static func end(name: String, start: int) -> void:
	if not enabled or start == 0: return
	var elapsed: float = float(Time.get_ticks_usec()-start)/1000.0
	if not spans.has(name): spans[name] = []
	spans[name].append(elapsed)
	var frame: Dictionary = bucket()
	frame.timings_ms[name] = float(frame.timings_ms.get(name,0.0))+elapsed
	frame.calls[name] = int(frame.calls.get(name,0))+1

static func count(name: String, value: int = 1) -> void:
	if not enabled: return
	counts[name] = int(counts.get(name,0))+value

static func note(value: Dictionary) -> void:
	if not enabled or events.size()>=4096: return
	value["frame"] = Engine.get_process_frames()
	events.append(value)

static func observe(world: Node) -> void:
	if not enabled: return
	var now: int = Time.get_ticks_usec()
	var frame: Dictionary = bucket()
	frame["wall_ms"] = float(now)/1000.0
	if last_frame_usec>0: frame["wall_interval_ms"] = float(now-last_frame_usec)/1000.0
	last_frame_usec = now
	frame["engine_process_ms_previous"] = Performance.get_monitor(Performance.TIME_PROCESS)*1000.0
	frame["engine_physics_ms_previous"] = Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0
	frame["draw_calls_previous"] = Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
	frame["actors"] = world.actors.size()
	frame["snapshot_monsters"] = world.current_snapshot.get("monsters",[]).size()
	frame["timeline_ms"] = world.timeline.clock_ms
	frame["latest_ms"] = float(world.timeline.latest.get("time",0))
	frame["hero"] = [world.hero_position.x,world.hero_position.y,world.hero_position.z]

static func stats(values: Array) -> Dictionary:
	if values.is_empty(): return {"count":0}
	var ordered: Array = values.duplicate()
	ordered.sort()
	var total: float = 0.0
	for value: float in ordered: total += value
	return {"count":ordered.size(),"total":total,"mean":total/ordered.size(),"median":ordered[ordered.size()/2],"p95":ordered[int(floor((ordered.size()-1)*.95))],"max":ordered.back()}

static func finish_phase() -> Dictionary:
	var duration: float = float(Time.get_ticks_usec()-started_usec)/1000.0
	enabled = false
	var rows: Array = frames.values()
	rows.sort_custom(func(a: Dictionary,b: Dictionary): return int(a.frame)<int(b.frame))
	var timings: Dictionary = {}
	for name: String in spans:
		var per_frame: Array = []
		for row: Dictionary in rows: per_frame.append(float(row.timings_ms.get(name,0.0)))
		timings[name] = {"per_call_ms":stats(spans[name]),"per_frame_ms":stats(per_frame)}
	var metrics: Dictionary = {}
	for key: String in ["wall_interval_ms","engine_process_ms_previous","engine_physics_ms_previous","draw_calls_previous","actors","snapshot_monsters"]:
		var values: Array = []
		for row: Dictionary in rows:
			if row.has(key): values.append(float(row[key]))
		metrics[key] = stats(values)
	return {"phase":phase,"wall_duration_ms":duration,"counts":counts.duplicate(),"timings":timings,"metrics":metrics,"frames":rows,"events":events.duplicate()}
