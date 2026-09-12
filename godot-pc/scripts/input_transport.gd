class_name VarendorInputTransport
extends RefCounted

# Input is a sequential stream, not one HTTP operation per rendered frame.
# The worker owns its HTTPClient and drains the FIFO independently of rendering;
# immutable results cross back through a deferred signal on the main thread.
signal completed(entry: Dictionary, response: Dictionary)

var _thread: Thread = Thread.new()
var _mutex: Mutex = Mutex.new()
var _wake: Semaphore = Semaphore.new()
var _queue: Array[Dictionary] = []
var _stopping: bool = false
var _url: String
var _token: String
var _last_response_ms: int = 0

func start(url: String, bearer: String) -> Error:
	_url = url
	_token = bearer
	return _thread.start(_run)

func enqueue(entry: Dictionary) -> Array[int]:
	var superseded: Array[int] = []
	_mutex.lock()
	# Direction is a held state, not an action that must be replayed later.
	# Retain only its newest UNSENT state. An already dispatched request and
	# attack/jump/cancel/destination entries are immutable ordering barriers.
	# The mutex also fences the worker's pop: never retire an in-flight input.
	while not _queue.is_empty() and can_supersede_direction(_queue[-1], entry):
		superseded.append(int(_queue.pop_back().sequence))
	_queue.append(entry.duplicate(true))
	_mutex.unlock()
	# Replacing a queued entry reuses that entry's existing wake permit.
	# Posting for every camera sample otherwise leaves thousands of empty wakes.
	if superseded.is_empty(): _wake.post()
	return superseded

static func can_supersede_direction(older: Dictionary, newer: Dictionary) -> bool:
	return str(older.get("value",{}).get("type","")) == "direction" and str(newer.get("value",{}).get("type","")) == "direction" and int(older.get("session",-1)) == int(newer.get("session",-2)) and int(older.get("payload",{}).get("generation",-1)) == int(newer.get("payload",{}).get("generation",-2)) and int(older.get("sequence",0)) < int(newer.get("sequence",0))

func stop() -> void:
	_mutex.lock()
	_stopping = true
	_queue.clear()
	_mutex.unlock()
	_wake.post()
	if _thread.is_started(): _thread.wait_to_finish()
	_token = ""

func _is_stopping() -> bool:
	_mutex.lock()
	var result: bool = _stopping
	_mutex.unlock()
	return result

func _run() -> void:
	var http: HTTPClient = HTTPClient.new()
	while true:
		_wake.wait()
		_mutex.lock()
		var stopping: bool = _stopping
		var entry: Dictionary = {} if _queue.is_empty() else _queue.pop_front()
		_mutex.unlock()
		if stopping: break
		if entry.is_empty(): continue
		var response: Dictionary = _request(http, entry.payload)
		if not _is_stopping(): completed.emit(entry, response)
		# Failed transport cannot replay a backlog before the deferred error
		# reaches the main thread and starts the normal reconnect path.
		if response.get("transport_error", false): break
	http.close()

func _request(http: HTTPClient, payload: Dictionary) -> Dictionary:
	var deadline: int = Time.get_ticks_msec() + 7000
	var address: String = _url.trim_prefix("http://").trim_prefix("https://").trim_suffix("/")
	var host: String = address.get_slice(":", 0)
	var port: int = int(address.get_slice(":", 1)) if ":" in address else (443 if _url.begins_with("https://") else 80)
	# Reuse the ordered connection. Reconnecting for every camera steering sample
	# let handshake latency queue the neutral release behind old movement.
	# Node closes idle keep-alive sockets after five seconds. Renew an idle
	# socket before sending, so the next attack/cancel is not lost to that close.
	if http.get_status() != HTTPClient.STATUS_CONNECTED or Time.get_ticks_msec()-_last_response_ms > 3500:
		http.close()
		if http.connect_to_host(host, port, TLSOptions.client() if _url.begins_with("https://") else null) != OK:
			return {"error":"Нет соединения с сервером","transport_error":true}
	while http.get_status() != HTTPClient.STATUS_CONNECTED:
		if not _poll(http, deadline): return _failure(http)
	var headers: PackedStringArray = ["Content-Type: application/json", "Connection: keep-alive"]
	if not _token.is_empty(): headers.append("Authorization: Bearer " + _token)
	if http.request(HTTPClient.METHOD_POST, "/api/input", headers, JSON.stringify(payload)) != OK:
		return _failure(http)
	while http.get_status() == HTTPClient.STATUS_REQUESTING:
		if not _poll(http, deadline): return _failure(http)
	var status: int = http.get_response_code()
	var body: PackedByteArray = PackedByteArray()
	while http.get_status() == HTTPClient.STATUS_BODY:
		body.append_array(http.read_response_body_chunk())
		if body.size() > 1048576: return _failure(http)
		if http.get_status() == HTTPClient.STATUS_BODY and not _poll(http, deadline): return _failure(http)
	if _is_stopping(): return {"stale":true}
	if status == 401: return {"error":"Доступ к герою истёк. Откройте «Герои» и повторите вход."}
	var json: JSON = JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK or json.data is not Dictionary: return {"error":"Сервер вернул некорректный ответ","transport_error":true}
	_last_response_ms = Time.get_ticks_msec()
	return json.data

func _poll(http: HTTPClient, deadline: int) -> bool:
	if _is_stopping() or Time.get_ticks_msec() >= deadline: return false
	if http.poll() != OK: return false
	if http.get_status() in [HTTPClient.STATUS_CANT_RESOLVE, HTTPClient.STATUS_CANT_CONNECT, HTTPClient.STATUS_CONNECTION_ERROR, HTTPClient.STATUS_TLS_HANDSHAKE_ERROR, HTTPClient.STATUS_DISCONNECTED]: return false
	# Sleep only this worker; gameplay, rendering and callbacks keep running.
	OS.delay_usec(1000)
	return true

func _failure(http: HTTPClient) -> Dictionary:
	http.close()
	return {"stale":true} if _is_stopping() else {"error":"Соединение потеряно. Повторяем подключение…","transport_error":true}
