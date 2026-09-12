extends RefCounted

## Keep each distant rig's existing interval, but spread its sample within the
## shared presentation clock. Movement/event clocks and accumulated gait dt stay exact.
static func next_sample_ms(clock_ms: float, interval_seconds: float, entity_id: String) -> float:
	if interval_seconds<=0.0:return clock_ms
	var period: float=interval_seconds*1000.0
	# Avalanche neighbouring spawn IDs; a raw string hash clusters numeric suffixes.
	var seed: int=entity_id.hash() & 0xffffffff
	seed=(((seed>>16)^seed)*0x45d9f3b) & 0xffffffff
	seed=(((seed>>16)^seed)*0x45d9f3b) & 0xffffffff
	seed=(seed>>16)^seed
	var phase: float=float(seed)/4294967296.0
	var next: float=(floor(clock_ms/period-phase)+1.0+phase)*period
	return next if next>clock_ms+.0001 else next+period
