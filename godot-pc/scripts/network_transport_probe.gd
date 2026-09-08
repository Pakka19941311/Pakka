extends SceneTree

const Network = preload("res://scripts/network.gd")

var client: Network

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	client = Network.new()
	root.add_child(client)
	client.set_process(false)
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--transport-probe-url="):
			client.server_url = arg.trim_prefix("--transport-probe-url=")
	client.connected = true
	client.hero = {"generation":1}
	# This is the real production request/queue, with only the receiving server
	# replaced. At 15 FPS, render-polled HTTP loses a turn and delays release.
	for direction: Vector2 in [Vector2.RIGHT,Vector2.UP,Vector2.LEFT,Vector2.ZERO]:
		client.intent({"type":"direction","x":direction.x,"z":direction.y,"probe_sent_ms":Time.get_unix_time_from_system()*1000.0})
		await create_timer(.12).timeout
	while client.input_busy:
		await process_frame
	print("VARENDOR_TRANSPORT_PROBE_DONE")
	quit()
