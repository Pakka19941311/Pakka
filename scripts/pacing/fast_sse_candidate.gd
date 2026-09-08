extends VarendorNetwork

# Diagnostic candidate, not loaded by the shipped client.
func consume_stream() -> void:
	# Decode UTF-8 only after a complete SSE packet; Cyrillic may span TCP chunks.
	# Render only the newest state from a burst. Replaying every stale UI/actor
	# snapshot after a slow frame creates a backlog; all discrete events survive.
	var latest: Dictionary = {}
	var events: Dictionary = {}
	while stream_scan < stream_bytes.size():
		# Search in native PackedByteArray code, not one GDScript iteration per
		# byte of the 35 KB snapshot. Keep the trailing LF for split delimiters.
		var newline: int = stream_bytes.find(10, maxi(0, stream_scan - 1))
		if newline < 0 or newline + 1 >= stream_bytes.size():
			stream_scan = stream_bytes.size()
			break
		if stream_bytes[newline + 1] == 10:
			var packet: String = stream_bytes.slice(0, newline).get_string_from_utf8()
			stream_bytes = stream_bytes.slice(newline + 2)
			stream_scan = 1
			for line: String in packet.split("\n"):
				if line.begins_with("data:"):
					var value = JSON.parse_string(line.trim_prefix("data:").strip_edges())
					if value is Dictionary:
						silence = 0
						for event: Dictionary in value.get("events", []):
							events[int(event.sequence)] = event
						if events.size() > 2048:
							stream_failed()
							return
						if latest.is_empty() or int(value.get("revision", 0)) > int(latest.get("revision", 0)) or (int(value.get("revision", 0)) == int(latest.get("revision", 0)) and float(value.get("time", 0)) >= float(latest.get("time", 0))):
							latest = value
		else:
			stream_scan = newline + 2
	if not latest.is_empty():
		var order: Array = events.keys()
		order.sort()
		latest["events"] = order.map(func(id: int): return events[id])
		accept(latest)
