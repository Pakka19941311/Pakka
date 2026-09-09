class_name VarendorKnightEquipment
extends RefCounted
## Visibility adapter for the approved Forgotten Knight rig.
## The inventory/server owns equipment. The animation controller owns the pose.
## This adapter only toggles per-instance meshes; shared meshes/materials and the
## actor transform are never modified and no animation/timer is created here.

const MANIFEST_PATH: String = "res://data/knight_manifest.json"
const EQUIPMENT_SLOTS: Array[String] = ["head", "chest", "gloves", "boots", "belt", "weapon", "offhand"]
const MODEL_SLOTS: Dictionary = {
	"helmet_closed": "head", "helmet_open": "head", "armor_chest": "chest",
	"armor_gloves": "gloves", "armor_boots": "boots", "armor_belt": "belt", "sword": "weapon",
}
# Compatibility for a cached catalog from before the visualModel field existed.
# There is deliberately no slot-wide fallback: a staff must never show a sword,
# and an unimplemented robe/shield must never silently become plate armor.
const LEGACY_MODELS: Dictionary = {
	"fallen_helm": "helmet_closed", "fallen_helm_open": "helmet_open",
	"militia_plate": "armor_chest", "dead_king_plate": "armor_chest",
	"wolf_gloves": "armor_gloves", "grave_boots": "armor_boots",
	"ash_belt": "armor_belt", "wardens_blade": "sword", "executioner": "sword",
}

static var _manifest_cache: Dictionary = {}

var actor: Node3D
var visual: Node3D
var definitions: Dictionary = {}
var manifest: Dictionary = {}
var meshes: Dictionary = {}
var loadout: Array[String] = []
var unsupported_items: Array[String] = []
var equipment_signature: String = ""
var visibility_updates: int = 0
var _has_equipment: bool = false

func bind(root: Node3D, model_visual: Node3D, item_definitions: Dictionary) -> void:
	actor = root
	visual = model_visual
	definitions = item_definitions
	meshes.clear()
	loadout.clear()
	unsupported_items.clear()
	_has_equipment = false
	equipment_signature = ""
	visibility_updates = 0
	if _manifest_cache.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST_PATH))
		if parsed is Dictionary:
			_manifest_cache = parsed
	manifest = _manifest_cache
	_collect_meshes(visual)
	actor.set_meta("knight_equipment", self)
	apply_equipment({})

func _collect_meshes(node: Node) -> void:
	if node is MeshInstance3D:
		meshes[String(node.name)] = node
	for child: Node in node.get_children():
		_collect_meshes(child)

func _item_id(item: Variant) -> String:
	if item is Dictionary:
		return str(item.get("id", ""))
	if item is String or item is StringName:
		return str(item)
	return ""

func _model_for_item(item_id: String, slot: String) -> String:
	var definition: Dictionary = definitions.get(item_id, {})
	var model_id: String = str(definition.get("visualModel", LEGACY_MODELS.get(item_id, "")))
	if str(MODEL_SLOTS.get(model_id, "")) != slot:
		return ""
	if not manifest.get("items", {}).has(model_id):
		return ""
	return model_id

func apply_equipment(equipment: Dictionary) -> void:
	# Seven small identifiers are enough: upgrades/UIDs/stats do not change a mesh.
	# A repeated snapshot performs no tree walk, allocation of assets, or writes.
	var item_ids: PackedStringArray = PackedStringArray()
	for slot: String in EQUIPMENT_SLOTS:
		item_ids.append(_item_id(equipment.get(slot)))
	var next_signature: String = "|".join(item_ids)
	if _has_equipment and next_signature == equipment_signature:
		return
	_has_equipment = true
	equipment_signature = next_signature
	loadout.clear()
	unsupported_items.clear()
	for index: int in range(EQUIPMENT_SLOTS.size()):
		var item_id: String = item_ids[index]
		if item_id.is_empty():
			continue
		var model_id: String = _model_for_item(item_id, EQUIPMENT_SLOTS[index])
		if model_id.is_empty():
			unsupported_items.append(item_id)
		else:
			loadout.append(model_id)
	_apply_visibility()

func _apply_visibility() -> void:
	var shown_meshes: Dictionary = {}
	for model_id: String in loadout:
		for mesh_name: String in manifest.get("items", {}).get(model_id, []):
			shown_meshes[mesh_name] = true
	var has_closed_helmet: bool = "helmet_closed" in loadout
	var has_helmet: bool = has_closed_helmet or "helmet_open" in loadout
	var has_chest: bool = "armor_chest" in loadout
	var has_gloves: bool = "armor_gloves" in loadout
	var has_boots: bool = "armor_boots" in loadout
	var body_regions: Dictionary = manifest.get("body_regions", {})
	for mesh_name: String in body_regions:
		var region: String = str(body_regions[mesh_name])
		var shown: bool = region != "reference"
		if region in ["head", "eyes", "brows"]:
			shown = not has_closed_helmet
		elif region == "hair":
			shown = not has_helmet
		elif region in ["torso", "upperarms"]:
			shown = not has_chest
		elif region in ["forearms", "hands"]:
			shown = not has_gloves
		elif region == "feet":
			shown = not has_boots
		elif region == "calves":
			shown = has_chest and not has_boots
		shown_meshes[mesh_name] = shown
	shown_meshes[str(manifest.get("starter_pants", "FK_starter_pants"))] = not has_chest
	for mesh_name: String in meshes:
		var mesh: MeshInstance3D = meshes[mesh_name]
		var shown: bool = bool(shown_meshes.get(mesh_name, false))
		if mesh.visible != shown:
			mesh.visible = shown
	actor.set_meta("knight_weapon_equipped", "sword" in loadout)
	visibility_updates += 1

func visible_meshes() -> Array[String]:
	var result: Array[String] = []
	for mesh_name: String in meshes:
		if (meshes[mesh_name] as MeshInstance3D).visible:
			result.append(mesh_name)
	result.sort()
	return result
