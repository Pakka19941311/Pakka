extends RefCounted

class DelayedNetwork extends VarendorNetwork:
	var replies: Array = []
	func request(_path: String, _data = null, _bearer: String = "") -> Dictionary:
		var reply: Dictionary = replies.pop_front()
		await get_tree().create_timer(float(reply.delay)).timeout
		return reply.value

static func run(tree: SceneTree, snapshot: Dictionary, directory: String) -> Dictionary:
	var checks: Dictionary = {}
	var next: Dictionary = snapshot.duplicate(true)
	next.character.id = "qa-next-profile"
	next.character.name = "Проверка Ёж"
	next.revision = 0
	next.time = 1
	# Split a real snapshot inside UTF-8 code units, not just between JSON fields.
	var decoder: VarendorNetwork = VarendorNetwork.new()
	tree.root.add_child(decoder)
	decoder.set_process(false)
	var events: Array = []
	decoder.snapshot_received.connect(func(value: Dictionary): events.append(value))
	var bytes: PackedByteArray = ("event: snapshot\ndata: " + JSON.stringify(next) + "\n\n").to_utf8_buffer()
	for byte: int in bytes:
		decoder.stream_bytes.append(byte)
		decoder.consume_stream()
	checks["sse_utf8_chunk_boundaries"] = events.size() == 1 and decoder.hero.name == "Проверка Ёж"
	events.clear()
	for index: int in range(20):
		var update: Dictionary = next.duplicate(true)
		update.time = index + 2
		update.events = [{"sequence":index + 1,"type":"qa-preserved-event"}]
		decoder.stream_bytes.append_array(("data: " + JSON.stringify(update) + "\n\n").to_utf8_buffer())
	decoder.consume_stream()
	checks["stream_burst_coalesced_without_event_loss"] = events.size() == 1 and events[0].time == 21 and events[0].events.size() == 20 and decoder.event_cursor == 20
	# A complete packet followed by a partial UTF-8 tail must survive compaction.
	# Finish that tail in two further calls, splitting the final LF/LF delimiter.
	events.clear()
	var complete: Dictionary = next.duplicate(true)
	complete.time = 22
	complete.events = [{"sequence":21,"type":"qa-before-tail"}]
	var trailing: Dictionary = next.duplicate(true)
	trailing.time = 23
	trailing.character.name = "Хвост Ёж"
	trailing.events = [{"sequence":22,"type":"qa-after-tail"}]
	var trailing_bytes: PackedByteArray = ("data: " + JSON.stringify(trailing) + "\n\n").to_utf8_buffer()
	var split: int = trailing_bytes.find(0xd0) + 1
	var prefix: PackedByteArray = trailing_bytes.slice(0, split)
	decoder.stream_bytes.append_array(("data: " + JSON.stringify(complete) + "\n\n").to_utf8_buffer())
	decoder.stream_bytes.append_array(prefix)
	decoder.consume_stream()
	var partial_kept: bool = events.size() == 1 and decoder.hero.name == "Проверка Ёж" and decoder.stream_bytes == prefix
	decoder.stream_bytes.append_array(trailing_bytes.slice(split, trailing_bytes.size() - 1))
	decoder.consume_stream()
	partial_kept = partial_kept and events.size() == 1
	decoder.stream_bytes.append(10)
	decoder.consume_stream()
	checks["sse_burst_compaction_preserves_partial_utf8_and_split_delimiter"] = partial_kept and events.size() == 2 and decoder.hero.name == "Хвост Ёж" and decoder.event_cursor == 22 and decoder.stream_bytes.is_empty() and decoder.stream_scan == 1
	decoder.expected_content = "deliberately-incompatible"
	decoder.accept(next)
	checks["incompatible_content_blocks_input"] = decoder.incompatible and not decoder.connected
	decoder.queue_free()

	var client: DelayedNetwork = DelayedNetwork.new()
	tree.root.add_child(client)
	client.set_process(false)
	client.bootstrap_path = directory.path_join("qa-session-bootstrap.json")
	client.replies = [{"delay":.7,"value":snapshot},{"delay":.01,"value":next}]
	client.connect_profile({"token":"qa-old"})
	client.connect_profile({"token":"qa-new"})
	await tree.create_timer(.9).timeout
	checks["late_session_response_ignored"] = client.hero.get("id") == next.character.id

	# A committed old receipt may arrive after the user chooses another hero.
	# It must not replace the new hero or clear either hero's pending journal.
	client.end_session()
	client.accept(snapshot)
	client.pending = {"id":"qa-old-receipt","command":{"type":"quest"}}
	var old_path: String = client.pending_path()
	client.save_private_json(old_path, client.pending)
	client.replies = [{"delay":.7,"value":{"receipt":{"ok":true},"snapshot":snapshot}},{"delay":.01,"value":next}]
	client.command({}, true)
	client.connect_profile({"token":"qa-new"})
	await tree.create_timer(.9).timeout
	checks["late_receipt_isolated_by_profile"] = client.hero.get("id") == next.character.id and client.read_private_json(old_path).get("id") == "qa-old-receipt" and client.pending.is_empty()
	client.end_session()
	client.queue_free()
	return checks
