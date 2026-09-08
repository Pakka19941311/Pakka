class_name PacingMetrics
extends RefCounted

static var active: bool = false
static var freeze_animation: bool = false
static var rigid_camera: bool = false
static var static_camera: bool = false
static var times: Dictionary = {}
static var calls: Dictionary = {}

static func record(label: String, start: int) -> void:
	if not active: return
	times[label] = float(times.get(label, 0)) + float(Time.get_ticks_usec() - start) / 1000.0
	calls[label] = int(calls.get(label, 0)) + 1

static func clear() -> void:
	times.clear()
	calls.clear()
