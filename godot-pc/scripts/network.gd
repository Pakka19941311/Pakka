class_name VarendorNetwork
extends Node

const InputTransport = preload("res://scripts/input_transport.gd")

signal snapshot_received(snapshot: Dictionary)
signal notice(message: String)
signal profiles_changed
signal receipt_received(receipt: Dictionary)
signal intent_reserved(value: Dictionary, input_sequence: int)
signal intent_submitted(value: Dictionary)
signal intent_rejected(value: Dictionary, input_sequence: int, error: String)

var server_url: String = "http://127.0.0.1:4185"
var token: String = ""
var bootstrap_path: String = ""
var bootstrap: Dictionary = {}
var hero: Dictionary = {}
var sequence: int = 0
var event_cursor: int = 0
var connected: bool = false
var polling: bool = false
var command_busy: bool = false
var pending: Dictionary = {}
var elapsed: float = 0.0
var last_revision: int = -1
var last_time: float = -1
var session_busy: bool = false
var stream: HTTPClient = HTTPClient.new()
var stream_requested: bool = false
var stream_bytes: PackedByteArray = PackedByteArray()
var stream_scan: int = 1
var retry_in: float = 0.0
var silence: float = 0.0
var input_queue: Array = []
var input_busy: bool = false
var input_transport: InputTransport
var expected_content: String = ""
var expected_map: String = ""
var incompatible: bool = false
var session_generation: int = 0

func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--bootstrap="):
			bootstrap_path = arg.trim_prefix("--bootstrap=")
	if not bootstrap_path.is_empty() and FileAccess.file_exists(bootstrap_path):
		var value = JSON.parse_string(FileAccess.get_file_as_string(bootstrap_path))
		if value is Dictionary:
			bootstrap = value
	server_url = str(bootstrap.get("server_url", server_url))

func request(path: String, data = null, bearer: String = "") -> Dictionary:
	var generation: int = session_generation
	var http: HTTPRequest = HTTPRequest.new()
	http.timeout = 7.0
	# HTTPClient needs several polls to connect, write, and read a response.
	# General profile/item requests use threaded I/O. Movement has its own
	# sequential worker below, so request_completed cannot throttle input to
	# one command per rendered frame. The durable item journal is unchanged.
	http.use_threads = true
	add_child(http)
	var headers: PackedStringArray = ["Content-Type: application/json"]
	var authorization: String = token if bearer.is_empty() else bearer
	if not authorization.is_empty():
		headers.append("Authorization: Bearer " + authorization)
	var err: int = http.request(server_url + path, headers, HTTPClient.METHOD_GET if data == null else HTTPClient.METHOD_POST, "" if data == null else JSON.stringify(data))
	if err != OK:
		http.queue_free()
		return {"error":"Нет соединения с сервером"}
	var result: Array = await http.request_completed
	http.queue_free()
	if generation != session_generation:
		return {"stale":true}
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return {"error":"Соединение потеряно. Повторяем подключение…"}
	if int(result[1]) == 401:
		return {"error":"Доступ к герою истёк. Откройте «Герои» и повторите вход."}
	var parsed = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	if parsed is not Dictionary:
		return {"error":"Сервер вернул некорректный ответ"}
	return parsed

func accept(value: Dictionary) -> void:
	if int(value.get("protocol", 0)) != 1 or not value.has("character"):
		incompatible = true
		connected = false
		stop_input_transport()
		close_stream()
		notice.emit("Версия сервера несовместима с этой сборкой")
		return
	if (not expected_content.is_empty() and value.get("contentVersion", "") != expected_content) or (not expected_map.is_empty() and value.get("mapVersion", "") != expected_map):
		incompatible = true
		connected = false
		stop_input_transport()
		close_stream()
		notice.emit("Версии мира и клиента не совпадают. Запустите клиент и сервер из одного пакета.")
		return
	# A slower poll must not undo a newer item receipt or resurrect a stale item.
	var revision: int = int(value.get("revision", 0))
	var server_time: float = float(value.get("time", 0))
	if revision < last_revision or (revision == last_revision and server_time < last_time):
		return
	last_revision = revision
	last_time = server_time
	var reconnecting: bool = not connected
	if not hero.is_empty() and hero.get("generation") != value.character.get("generation"):
		stop_input_transport()
	hero = value.character
	sequence = maxi(sequence, int(hero.get("lastInputSequence", 0)))
	connected = true
	snapshot_received.emit(value)
	for event: Dictionary in value.get("events", []):
		event_cursor = maxi(event_cursor, int(event.sequence))
	if reconnecting and not pending.is_empty() and not command_busy:
		call_deferred("command", {}, true)

func end_session() -> void:
	# Invalidate callbacks before changing the selected hero. A pending command
	# remains in its own durable journal until this hero is resumed later.
	session_generation += 1
	stop_input_transport()
	close_stream()
	token = ""
	hero = {}
	connected = false
	session_busy = false
	command_busy = false
	input_busy = false
	pending = {}
	input_queue.clear()
	sequence = 0
	event_cursor = 0
	last_revision = -1
	last_time = -1
	incompatible = false

func connect_profile(profile: Dictionary) -> void:
	end_session()
	var generation: int = session_generation
	session_busy = true
	token = str(profile.get("token", ""))
	var value: Dictionary = await request("/api/world")
	if generation != session_generation or value.get("stale", false):
		return
	session_busy = false
	if value.has("error"):
		notice.emit(str(value.error))
		return
	accept(value)
	if not connected:
		return
	load_pending()
	if not pending.is_empty():
		await command({}, true)

func create_character(player_name: String, class_id: String) -> void:
	if session_busy:
		return
	end_session()
	var generation: int = session_generation
	session_busy = true
	var value: Dictionary = await request("/api/session", {"name":player_name,"classId":class_id})
	if generation != session_generation or value.get("stale", false):
		return
	session_busy = false
	if value.has("error"):
		notice.emit(str(value.error))
		return
	token = str(value.token)
	accept(value.snapshot)
	if not connected:
		return
	var profiles: Array = bootstrap.get("profiles", [])
	profiles.append({"token":token,"id":hero.id,"name":hero.name,"classId":hero.classId,"level":hero.level})
	bootstrap["profiles"] = profiles
	save_private_json(bootstrap_path, bootstrap)
	profiles_changed.emit()

func _process(delta: float) -> void:
	if token.is_empty() or session_busy or incompatible:
		return
	retry_in -= delta
	silence += delta
	if retry_in > 0:
		return
	stream.poll()
	match stream.get_status():
		HTTPClient.STATUS_DISCONNECTED:
			var address: String = server_url.trim_prefix("http://").trim_prefix("https://").trim_suffix("/")
			var host: String = address.get_slice(":", 0)
			var port: int = int(address.get_slice(":", 1)) if ":" in address else (443 if server_url.begins_with("https://") else 80)
			stream.connect_to_host(host, port, TLSOptions.client() if server_url.begins_with("https://") else null)
		HTTPClient.STATUS_CONNECTED:
			if not stream_requested:
				stream_requested = true
				stream.request(HTTPClient.METHOD_GET, "/api/stream?after=" + str(event_cursor), ["Authorization: Bearer " + token, "Accept: text/event-stream"])
			elif stream.has_response():
				stream_failed()
		HTTPClient.STATUS_BODY:
			if stream.get_response_code() == 401:
				end_session()
				notice.emit("Доступ к герою истёк. Откройте «Герои» и повторите вход.")
				return
			if stream.get_response_code() != 200:
				stream_failed()
				return
			for index: int in range(64):
				var chunk: PackedByteArray = stream.read_response_body_chunk()
				if chunk.is_empty():
					break
				stream_bytes.append_array(chunk)
				if stream_bytes.size() > 4194304:
					stream_failed()
					return
			consume_stream()
		HTTPClient.STATUS_CANT_RESOLVE, HTTPClient.STATUS_CANT_CONNECT, HTTPClient.STATUS_CONNECTION_ERROR, HTTPClient.STATUS_TLS_HANDSHAKE_ERROR:
			stream_failed()
	if silence > 5.0:
		stream_failed()

func consume_stream() -> void:
	# Decode UTF-8 only after a complete SSE packet; Cyrillic may span TCP chunks.
	# Render only the newest state from a burst. Replaying every stale UI/actor
	# snapshot after a slow frame creates a backlog; all discrete events survive.
	var latest: Dictionary = {}
	var events: Dictionary = {}
	while stream_scan < stream_bytes.size():
		if stream_bytes[stream_scan - 1] == 10 and stream_bytes[stream_scan] == 10:
			var packet: String = stream_bytes.slice(0, stream_scan - 1).get_string_from_utf8()
			stream_bytes = stream_bytes.slice(stream_scan + 1)
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
			stream_scan += 1
	if not latest.is_empty():
		var order: Array = events.keys()
		order.sort()
		latest["events"] = order.map(func(id: int): return events[id])
		accept(latest)

func close_stream() -> void:
	stream.close()
	stream_requested = false
	stream_bytes.clear()
	stream_scan = 1
	silence = 0

func stream_failed() -> void:
	stop_input_transport()
	close_stream()
	retry_in = 1.0
	if connected:
		notice.emit("Соединение потеряно. Восстанавливаем…")
	connected = false

func intent(value: Dictionary) -> void:
	if not connected: return
	# Reserve the acknowledgement ID before local prediction. All distinct
	# inputs retain order, including camera-relative steering and release.
	sequence += 1
	var entry: Dictionary = {"value":value.duplicate(true),"sequence":sequence,"session":session_generation,
		"payload":{"sequence":sequence,"generation":hero.get("generation",0),"intent":value.duplicate(true)}}
	intent_reserved.emit(value.duplicate(true),sequence)
	intent_submitted.emit(value.duplicate(true))
	input_queue.append(entry)
	input_busy = true
	dispatch_input(entry)

func dispatch_input(entry: Dictionary) -> void:
	if input_transport == null:
		input_transport = InputTransport.new()
		input_transport.completed.connect(input_completed, CONNECT_DEFERRED)
		if input_transport.start(server_url, token) != OK:
			input_transport = null
			input_completed(entry, {"error":"Не удалось запустить соединение ввода"})
			return
	input_transport.enqueue(entry)

func input_completed(entry: Dictionary, response: Dictionary) -> void:
	# A response queued before a profile change/teleport cannot clear newer
	# pending input or report an error against the newly selected hero.
	if int(entry.session) != session_generation or int(entry.payload.generation) != int(hero.get("generation",0)) or response.get("stale",false): return
	var pending_index: int = -1
	for index: int in range(input_queue.size()):
		if input_queue[index].sequence == entry.sequence:
			pending_index = index
			break
	if pending_index < 0: return
	input_queue.remove_at(pending_index)
	input_busy = not input_queue.is_empty()
	if response.has("error"):
		intent_rejected.emit(entry.value.duplicate(true),int(entry.sequence),str(response.error))
		notice.emit(str(response.error))
		if response.get("transport_error", false): stream_failed()

func stop_input_transport() -> void:
	if input_transport != null:
		input_transport.stop()
		input_transport = null
	input_queue.clear()
	input_busy = false

func _exit_tree() -> void:
	stop_input_transport()

func pending_path() -> String:
	return bootstrap_path.get_base_dir().path_join("pending-" + str(hero.get("id", "unknown")) + ".json")

func load_pending() -> void:
	pending = read_private_json(pending_path())

func read_private_json(path: String) -> Dictionary:
	for candidate: String in [path, path + ".previous"]:
		if FileAccess.file_exists(candidate):
			var value = JSON.parse_string(FileAccess.get_file_as_string(candidate))
			if value is Dictionary:
				return value
	return {}

func command(value: Dictionary, retry: bool = false) -> void:
	if command_busy or not connected:
		return
	if not pending.is_empty() and not retry:
		notice.emit("Предыдущее действие ожидает ответа. Повторяем тот же запрос.")
		retry = true
	if not retry:
		pending = {"id":Crypto.new().generate_random_bytes(20).hex_encode(),"command":value}
		if not save_private_json(pending_path(), pending):
			notice.emit("Не удалось сохранить запрос. Предметное действие отменено.")
			pending = {}
			return
	command_busy = true
	var generation: int = session_generation
	var response: Dictionary = await request("/api/command", pending)
	if generation != session_generation or response.get("stale", false):
		return
	if response.has("receipt"):
		var receipt: Dictionary = response.receipt
		if bool(receipt.get("ok", false)):
			var outcome = receipt.get("outcome")
			if outcome is Dictionary and outcome.has("success"):
				notice.emit("Заточка успешна: +%d → +%d" % [outcome.from, outcome.to] if outcome.success else "Заточка не удалась. Предмет разрушен.")
		else:
			notice.emit(str(receipt.get("reason", "Действие недоступно")))
		pending = {}
		save_private_json(pending_path(), {})
		accept(response.snapshot)
		receipt_received.emit(receipt)
	else:
		notice.emit(str(response.get("error", "Ответ не получен. Запрос сохранён для повтора.")))
	command_busy = false

func save_private_json(path: String, value: Dictionary) -> bool:
	if path.is_empty():
		return false
	var temp: String = path + ".tmp"
	var file: FileAccess = FileAccess.open(temp, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(value))
	file.flush()
	file.close()
	# Keep the previous profile until the replacement is completely written.
	if FileAccess.file_exists(path):
		var old: String = path + ".previous"
		if FileAccess.file_exists(old):
			DirAccess.remove_absolute(old)
		if DirAccess.rename_absolute(path, old) != OK:
			return false
	return DirAccess.rename_absolute(temp, path) == OK
