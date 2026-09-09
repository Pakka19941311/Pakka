class_name KnightAssetVisual
extends Node3D
## Visual adapter only. No attack timer, input, target selection or damage logic.
## Integration supplies the ordinal and normalized phase of an authorized strike.

var manifest: Dictionary
var actor: Node3D
var player: AnimationPlayer
var skeleton: Skeleton3D
var meshes: Dictionary = {}
var loadout: Array[String] = []
var clips: Dictionary = {}

func initialize() -> void:
	manifest = JSON.parse_string(FileAccess.get_file_as_string("res://assets/knight_manifest.json"))
	actor = load("res://assets/Knight_Modular.glb").instantiate()
	add_child(actor)
	_collect(actor)
	for clip in player.get_animation_list():
		clips[String(clip).get_slice("/", String(clip).get_slice_count("/") - 1)] = clip
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	set_loadout([])
	present_clip("idle", 0.3)

func _collect(node: Node) -> void:
	if node is MeshInstance3D:
		meshes[String(node.name)] = node
	elif node is AnimationPlayer:
		player = node
	elif node is Skeleton3D:
		skeleton = node
	for child in node.get_children():
		_collect(child)

func set_loadout(ids: Array[String]) -> void:
	loadout = ids.duplicate()
	# Slot replacement is deterministic: the last supplied head item wins.
	var head := ""
	for id in loadout:
		if id.begins_with("helmet_"):
			head = id
	for id in ["helmet_closed", "helmet_open"]:
		if id != head:
			loadout.erase(id)
	for mesh in meshes.values():
		mesh.visible = false
	for id in loadout:
		for mesh_name in manifest.items.get(id, []):
			if meshes.has(mesh_name):
				meshes[mesh_name].visible = true
	for mesh_name in manifest.body_regions:
		if not meshes.has(mesh_name):
			continue
		var region: String = manifest.body_regions[mesh_name]
		var shown := region != "reference"
		if region in ["head", "eyes", "brows"] and "helmet_closed" in loadout:
			shown = false
		if region == "hair" and not head.is_empty():
			shown = false
		if region in ["torso", "upperarms"] and "armor_chest" in loadout:
			shown = false
		if region in ["forearms", "hands"] and "armor_gloves" in loadout:
			shown = false
		if region == "feet" and "armor_boots" in loadout:
			shown = false
		if region == "calves":
			shown = "armor_chest" in loadout and "armor_boots" not in loadout
		meshes[mesh_name].visible = shown
	meshes[manifest.starter_pants].visible = "armor_chest" not in loadout

func present_strike(ordinal: int, phase: float) -> void:
	var clip: String = manifest.combo.clips[posmod(ordinal, 5)]
	present_clip(clip, phase)

func present_clip(clip: String, normalized_phase: float) -> void:
	var key: StringName = clips[clip]
	if player.current_animation != key:
		player.play(key)
	player.seek(clampf(normalized_phase, 0.0, 1.0) * player.get_animation(key).length, true)
	player.advance(0.0)
