extends SceneTree

const Fast = preload("res://fast_sse_candidate.gd")

func _initialize() -> void:
	call_deferred("run")

func feed(network: VarendorNetwork, bytes: PackedByteArray, width: int) -> void:
	for start: int in range(0,bytes.size(),width):
		network.stream_bytes.append_array(bytes.slice(start,mini(start+width,bytes.size())))
		network.consume_stream()

func summary(values: Array) -> Dictionary:
	values.sort()
	var sum: float = 0
	for value: float in values: sum += value
	return {"mean":sum/values.size(),"p50":values[values.size()/2],"p95":values[int(values.size()*.95)],"max":values.back()}

func run() -> void:
	var fixture: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://fixture.json"))
	fixture.character.name = "Рейнджер · проверка UTF-8 ☀"
	fixture["events"] = [{"sequence":101,"kind":"notice","text":"Дождь идёт"}]
	var packet: PackedByteArray = ("id: 1\nevent: world\ndata: "+JSON.stringify(fixture)+"\n\n").to_utf8_buffer()
	var results: Dictionary = {"bytes":packet.size(),"godot":Engine.get_version_info().string,"cpu":OS.get_processor_name(),"checks":{},"timings_ms":{}}
	for fast: bool in [false,true]:
		var label: String = "native_search_candidate" if fast else "released_byte_loop"
		var network: VarendorNetwork = Fast.new() if fast else VarendorNetwork.new()
		var received: Array = []
		network.snapshot_received.connect(func(value: Dictionary): received.append(value.duplicate(true)))
		for width: int in [1,2,3,7,31,1024,16384,packet.size()-1,packet.size()]:
			network.close_stream(); network.last_revision = -1; network.last_time = -1; received.clear()
			feed(network,packet,width)
			results.checks[label+"_fragment_"+str(width)] = received.size()==1 and received[0].character.name==fixture.character.name and received[0].events[0].text=="Дождь идёт" and network.stream_bytes.is_empty()
		var newer: Dictionary = fixture.duplicate(true)
		newer.revision = int(fixture.revision)+1; newer.time = float(fixture.time)+33
		newer.events = [{"sequence":102,"kind":"notice","text":"Второе событие"}]
		var next: PackedByteArray = ("id: 2\ndata: "+JSON.stringify(newer)+"\n\n").to_utf8_buffer()
		network.close_stream(); network.last_revision = -1; network.last_time = -1; received.clear()
		network.stream_bytes = packet+next+packet
		network.consume_stream()
		results.checks[label+"_burst_latest_and_ordered_events"] = received.size()==1 and received[0].revision==newer.revision and received[0].events.size()==2 and received[0].events[0].sequence==101 and received[0].events[1].sequence==102
		# A final single LF waits for its partner in the next TCP read.
		network.close_stream(); network.last_revision = -1; network.last_time = -1; received.clear()
		feed(network,packet.slice(0,packet.size()-1),packet.size())
		var no_early: bool = received.is_empty()
		feed(network,PackedByteArray([10]),1)
		results.checks[label+"_split_blank_line"] = no_early and received.size()==1
		for count: int in [1,4]:
			var burst: PackedByteArray = PackedByteArray()
			for i: int in count: burst.append_array(packet)
			var samples: Array = []
			for iteration: int in 130:
				network.close_stream(); network.last_revision = -1; network.last_time = -1; received.clear()
				var start: int = Time.get_ticks_usec()
				feed(network,burst,burst.size())
				if iteration>=10: samples.append(float(Time.get_ticks_usec()-start)/1000.0)
			results.timings_ms[label+"_"+str(count)+"_packets"] = summary(samples)
		network.free()
	var ok: bool = true
	for value: bool in results.checks.values(): ok = ok and value
	results["ok"] = ok
	var file: FileAccess = FileAccess.open("res://sse-result.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(results,"  "));file.close()
	print("PACING_SSE "+JSON.stringify(results))
	quit(0 if ok else 2)
