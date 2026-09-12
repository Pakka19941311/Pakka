extends SceneTree
const Schedule=preload("res://scripts/pose_sample_schedule.gd")

func _initialize() -> void:
	var slots: Dictionary={}
	var exact: bool=true
	for i: int in range(200):
		var id: String="world:slime:%03d" % i
		var first: float=Schedule.next_sample_ms(1789230000000.0,.5,id)
		var next: float=Schedule.next_sample_ms(first+.0002,.5,id)
		exact=exact and first>1789230000000.0 and first<=1789230000500.0 and absf(next-first-500.0)<.001
		var bucket: int=int((first-1789230000000.0)/16.666667)
		slots[bucket]=int(slots.get(bucket,0))+1
	var peak: int=0
	for count: int in slots.values():peak=maxi(peak,count)
	var checks: Dictionary={"same_interval_and_monotonic_clock":exact,"sequential_spawn_ids_spread_across_frames":slots.size()>=25 and peak<20,
		"near_actor_immediate":Schedule.next_sample_ms(400,.0,"hero")==400.0,
		"generation_reset_can_schedule_from_new_clock":Schedule.next_sample_ms(100,.5,"world:slime:000")<=600.0}
	print("POSE_SCHEDULE_ACCEPTANCE ",JSON.stringify({"checks":checks,"peak_updates_in_frame":peak,"occupied_frames":slots.size()}))
	quit(0 if checks.values().all(func(value):return value) else 2)
