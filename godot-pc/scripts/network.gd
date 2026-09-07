class_name VarendorNetwork
extends Node

signal snapshot_received(snapshot: Dictionary)
signal notice(message: String)
signal profiles_changed

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

func _ready() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--bootstrap="):
			bootstrap_path = arg.trim_prefix("--bootstrap=")
	if not bootstrap_path.is_empty() and FileAccess.file_exists(bootstrap_path):
		var value = JSON.parse_string(FileAccess.get_file_as_string(bootstrap_path))
		if value is Dictionary:
			bootstrap = value
	server_url = str(bootstrap.get("server_url", server_url))

func request(path: String, data = null) -> Dictionary:
	var http: HTTPRequest = HTTPRequest.new()
	http.timeout = 7.0
	add_child(http)
	var headers: PackedStringArray = ["Content-Type: application/json"]
	if not token.is_empty():
		headers.append("Authorization: Bearer " + token)
	var err: int = http.request(server_url + path, headers, HTTPClient.METHOD_GET if data == null else HTTPClient.METHOD_POST, "" if data == null else JSON.stringify(data))
	if err != OK:
		http.queue_free()
		return {"error":"Нет соединения с сервером"}
	var result: Array = await http.request_completed
	http.queue_free()
	if result[0] != HTTPRequest.RESULT_SUCCESS:
		return {"error":"Соединение потеряно. Повторяем подключение…"}
	var parsed = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	if parsed is not Dictionary:
		return {"error":"Сервер вернул некорректный ответ"}
	return parsed

func accept(value: Dictionary) -> void:
	if int(value.get("protocol", 0)) != 1 or not value.has("character"):
		connected = false
		notice.emit("Версия сервера несовместима с этой сборкой")
		return
	# A slower poll must not undo a newer item receipt or resurrect a stale item.
	var revision: int = int(value.get("revision", 0))
	var server_time: float = float(value.get("time", 0))
	if revision < last_revision or (revision == last_revision and server_time < last_time):
		return
	last_revision = revision
	last_time = server_time
	hero = value.character
	sequence = maxi(sequence, int(hero.get("lastInputSequence", 0)))
	connected = true
	snapshot_received.emit(value)
	for event: Dictionary in value.get("events", []):
		event_cursor = maxi(event_cursor, int(event.sequence))

func connect_profile(profile: Dictionary) -> void:
	if session_busy:
		return
	session_busy = true
	token = str(profile.get("token", ""))
	var value: Dictionary = await request("/api/world")
	session_busy = false
	if value.has("error"):
		notice.emit(str(value.error))
		return
	accept(value)
	load_pending()
	if not pending.is_empty():
		await command({}, true)

func create_character(player_name: String, class_id: String) -> void:
	if session_busy:
		return
	session_busy = true
	var value: Dictionary = await request("/api/session", {"name":player_name,"classId":class_id})
	session_busy = false
	if value.has("error"):
		notice.emit(str(value.error))
		return
	token = str(value.token)
	accept(value.snapshot)
	var profiles: Array = bootstrap.get("profiles", [])
	profiles.append({"token":token,"id":hero.id,"name":hero.name,"classId":hero.classId,"level":hero.level})
	bootstrap["profiles"] = profiles
	save_private_json(bootstrap_path, bootstrap)
	profiles_changed.emit()

func _process(delta: float) -> void:
	elapsed += delta
	if token.is_empty() or polling or elapsed < .10:
		return
	elapsed = 0.0
	polling = true
	var value: Dictionary = await request("/api/world?after=" + str(event_cursor))
	if value.has("error"):
		if connected:
			notice.emit(str(value.error))
		connected = false
	else:
		accept(value)
	polling = false

func intent(value: Dictionary) -> void:
	if not connected:
		return
	sequence += 1
	await request("/api/input", {"sequence":sequence,"intent":value})

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
	var response: Dictionary = await request("/api/command", pending)
	if response.has("receipt"):
		var receipt: Dictionary = response.receipt
		if bool(receipt.get("ok", false)):
			notice.emit("Действие выполнено" + (" · " + JSON.stringify(receipt.outcome) if receipt.get("outcome") != null else ""))
		else:
			notice.emit(str(receipt.get("reason", "Действие недоступно")))
		pending = {}
		save_private_json(pending_path(), {})
		accept(response.snapshot)
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
