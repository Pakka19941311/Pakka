extends SceneTree
const Network = preload("res://scripts/network.gd")
var checks: Dictionary = {}
var failures: Array = []
var snapshots: Array = []
var net: Node

func _initialize() -> void:
	call_deferred("run")

func packet(revision: int) -> String:
	return "data: " + JSON.stringify({"protocol":1,"revision":revision,"time":revision,"character":{"generation":1,"lastInputSequence":0},"events":[{"sequence":revision}]}) + "\n\n"

func pump(count: int = 6) -> void:
	for index: int in range(count):
		net._process(8.0) # Deliberate stale render delta; socket clock is independent.
		await create_timer(0.001).timeout

func run() -> void:
	var output: String = ""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--report="): output = arg.trim_prefix("--report=")
	var listener: TCPServer = TCPServer.new()
	checks.listen = listener.listen(43193,"127.0.0.1") == OK
	net = Network.new()
	root.add_child(net)
	net.set_process(false)
	net.token = "isolated-no-user-token"
	net.server_url = "http://127.0.0.1:43193"
	net.stream_disconnected.connect(func(reason: String, diagnostic: Dictionary): failures.append({"reason":reason,"diagnostic":diagnostic}))
	net.snapshot_received.connect(func(value: Dictionary): snapshots.append(value))
	await pump()
	var peer: StreamPeerTCP = listener.take_connection()
	checks.connection = peer != null
	if peer == null:
		net.free()
		listener.stop()
		quit(2)
		return
	var first: String = packet(1)
	peer.put_data(("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n%x\r\n" % first.to_utf8_buffer().size() + first.substr(0,8)).to_utf8_buffer())
	await pump()
	checks.partial_http_body_not_decoded = net.stream_bytes.is_empty() and snapshots.is_empty()
	checks.partial_socket_progress_recorded = net.stream_fragment_ms >= 0
	checks.render_delta_does_not_disconnect = failures.is_empty()
	peer.put_data((first.substr(8)+"\r\n").to_utf8_buffer())
	await pump()
	checks.complete_packet_accepted = net.connected and net.last_revision == 1
	checks.complete_packet_clears_fragment_clock = net.stream_fragment_ms == -1
	var burst: String = packet(2)+packet(3)
	peer.put_data(("%x\r\n" % burst.to_utf8_buffer().size()+burst+"\r\n").to_utf8_buffer())
	await pump()
	checks.burst_latest_snapshot_once = snapshots.size() == 2 and net.last_revision == 3
	checks.burst_discrete_events_retained = snapshots.size() == 2 and snapshots[1].events.size() == 2 and snapshots[1].events[0].sequence == 2 and snapshots[1].events[1].sequence == 3
	# Real synchronous consumer stall. The next socket poll, not time spent
	# inside the consumer, must decide whether new server bytes are available.
	var stall: Callable = func(value: Dictionary):
		if int(value.revision) == 4: OS.delay_msec(5100)
	net.snapshot_received.connect(stall)
	var fourth: String = packet(4)
	peer.put_data(("%x\r\n" % fourth.to_utf8_buffer().size()+fourth+"\r\n").to_utf8_buffer())
	await pump(1)
	checks.synchronous_callback_not_network_silence = net.connected and net.last_revision == 4 and failures.is_empty()
	net.snapshot_received.disconnect(stall)
	var fifth: String = packet(5)
	peer.put_data(("%x\r\n" % fifth.to_utf8_buffer().size()+fifth+"\r\n").to_utf8_buffer())
	await pump()
	checks.next_poll_consumes_waiting_packet = net.connected and net.last_revision == 5 and failures.is_empty()
	var now_ms: int = Time.get_ticks_msec()
	net.stream_progress_ms = now_ms-5000
	checks.exact_five_seconds_not_expired = not net.stream_silence_expired(now_ms)
	net.stream_progress_ms = now_ms-5001
	checks.genuine_silence_still_expires = net.stream_silence_expired(now_ms)
	var malformed: String = "data: []\n\n"
	peer.put_data(("%x\r\n" % malformed.to_utf8_buffer().size()+malformed+"\r\n").to_utf8_buffer())
	await pump()
	checks.non_snapshot_json_does_not_clear_fragment_clock = net.stream_fragment_ms >= 0
	# Inject deadline time into the same production decision; no real 5s sleep.
	net.stream_progress_ms = 6001
	net.stream_fragment_ms = 1000
	net.check_stream_deadline(6001)
	checks.unfinished_packet_cannot_keep_alive = failures.size() == 1 and failures[0].reason == "sse-incomplete-packet"
	checks.failure_clears_transport = not net.connected and net.stream_bytes.is_empty()
	net.free()
	peer.disconnect_from_host()
	listener.stop()
	var ok: bool = checks.values().all(func(value): return value)
	var report: Dictionary = {"ok":ok,"checks":checks,"failures":failures,"scope":"Real local TCP chunk fragmentation, stale render delta, SSE burst ownership and monotonic deadlines. No gameplay FPS claim."}
	if not output.is_empty():
		DirAccess.make_dir_recursive_absolute(output.get_base_dir())
		var file: FileAccess = FileAccess.open(output,FileAccess.WRITE)
		file.store_string(JSON.stringify(report,"  "))
		file.close()
	print("NETWORK_PROGRESS ",JSON.stringify(report))
	quit(0 if ok else 2)
