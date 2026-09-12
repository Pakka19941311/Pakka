class_name VarendorReferenceIcons
extends RefCounted

# Exact code-native SVG silhouettes from the owner-approved browser build 1e94a0d1.
# Kept as text and rendered once per kind: no dependency on fonts or emoji glyphs.
const PATHS: Dictionary = {
	"cloak": "<path d=\"M14 5q6-4 12 0l5 7 5 23-8-2-8 4-8-4-8 2 5-23Z\"/><path d=\"M14 5q6 10 12 0M13 14l-2 18m9-17v20m7-21 2 18\"/>",
	"wings": "<path d=\"M19 30C9 29 3 19 4 5l6 9 6 2 4 8 4-8 6-2 6-9c1 14-5 24-15 25l-1 6Z\"/><path d=\"m7 15 9 10M10 22l7 5m16-12-9 10m6-3-7 5\"/>",
	"sword": "<path d=\"m7 34 4-4m-5-3 9 9m-4-9L29 7l6-2-2 7-18 19Z\"/><path d=\"m15 27 16-17\"/>",
	"staff": "<path d=\"m11 36 14-22m-4-3 2-6 7-1 4 6-3 6-7 1Z\"/><path d=\"m24 10 4-2 2 4-4 2Z\"/>",
	"bow": "<path d=\"M10 4c25 7 25 25 0 32l7-16Z\"/><path d=\"M7 20h28m-4-4 4 4-4 4\"/>",
	"daggers": "<path d=\"m8 8 5 2 13 19-4 3L9 14Zm24 0-5 2-13 19 4 3 13-18ZM8 29l12 6m0-6 12 6\"/>",
	"book": "<path d=\"M9 7h24v28H9a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4Zm0 0v28M9 29h24\"/><path d=\"m18 14 6-3 5 3-5 9Z\"/>",
	"chest": "<path d=\"m14 6-7 3-4 9 7 3 1 14h18l1-14 7-3-4-9-7-3-3 5h-6Z\"/><path d=\"m11 17 9 5 9-5M20 22v12\"/>",
	"robe": "<path d=\"m15 5-8 5-4 10 8 3-4 13h26l-4-13 8-3-4-10-8-5-5 7Z\"/><path d=\"m15 5 5 13 5-13M13 25h14m-7-7v18\"/>",
	"head": "<path d=\"M7 24v-9a13 13 0 0 1 26 0v9l-5 10-8-5-8 5Z\"/><path d=\"M20 4v25M8 18l8 3m8 0 8-3M7 24l7 2m12 0 7-2\"/>",
	"gloves": "<path d=\"M8 35V21L5 15l4-3 6 6V6l4-1 2 11 1-12 4 1 1 12 2-9 4 2-1 14-5 11Z\"/><path d=\"M9 28h20\"/>",
	"boots": "<path d=\"M14 5h17l-2 21 6 5v5H5v-8l10-7Z\"/><path d=\"m15 11 14 2m-15 5 14 2M6 31h28\"/>",
	"belt": "<path d=\"M4 14h32v13H4Z\"/><rect x=\"15\" y=\"11\" width=\"13\" height=\"19\" rx=\"2\"/><path d=\"M20 20h9M8 18v5\"/>",
	"offhand": "<path d=\"m20 4 14 5v12c-1 7-7 11-14 15C13 32 7 28 6 21V9Z\"/><path d=\"m20 9 9 4v8c-1 4-4 7-9 10-5-3-8-6-9-10v-8ZM20 9v22\"/>",
	"ring": "<ellipse cx=\"20\" cy=\"24\" rx=\"11\" ry=\"10\"/><path d=\"m13 11 3-6h8l3 6-7 8Zm3-6 4 14 4-14M13 11h14\"/>",
	"ear": "<path d=\"M25 9a7 7 0 1 0-7 7v7m0-7h4\"/><path d=\"m18 21 8 8-8 8-8-8Z\"/>",
	"neck": "<path d=\"M7 5v11a13 13 0 0 0 26 0V5\"/><path d=\"m20 22 7 7-7 8-7-8Z\"/>",
	"potion": "<path d=\"M15 5h10v6l-2 3v3l8 11v8H9v-8l8-11v-3l-2-3Z\"/><path d=\"M15 10h10M11 28h18\"/><path class=\"ci-icon-liquid\" d=\"M12 29h16v4H12Z\"/>",
	"scroll": "<path d=\"M11 7h20v25H11l-3 3-3-3V12Zm20 0 4 3v6h-4M8 28h20l3 4M14 15h12m-12 5h10\"/>",
	"gem": "<path d=\"m11 7 18 0 7 12-16 18L4 19Zm-7 12h32M11 7l9 30 9-30M11 7l9 12 9-12\"/>",
	"fang": "<path d=\"M12 5c16 1 22 9 18 18-4 8-13 12-24 13 10-7 14-13 13-20-1-4-4-7-7-11Z\"/>",
	"bone": "<path d=\"M12 7c-3-7-11-2-7 3-6 3-1 11 4 8l15 15c-3 5 5 10 8 4 6 3 10-5 4-8L21 14c3-5-4-10-7-5Z\"/>"
}
static var cache: Dictionary = {}

static func kind(item: Dictionary, definition: Dictionary = {}, empty_slot: String = "") -> String:
	var id: String = str(item.get("id", ""))
	if id == "cloak_sky": return "wings"
	if id.begins_with("ring_str_"): return "ring_str"
	if id.begins_with("ring_dex_"): return "ring_dex"
	if id.begins_with("ring_int_"): return "ring_int"
	if id == "ring_blank": return "ring"
	if id == "haste": return "haste"
	if "staff" in id or "root" in id: return "staff"
	if "bow" in id: return "bow"
	if "grimoire" in id: return "book"
	if "fangs" in id: return "daggers"
	if "robe" in id or "raiment" in id: return "robe"
	if "potion" in id: return "potion"
	if "ether" in id: return "ether"
	if "scroll" in id: return "scroll"
	if "fang" in id: return "fang"
	if "bone" in id: return "bone"
	var category: String = str(definition.get("slot", definition.get("type", empty_slot)))
	if category == "weapon": return "sword"
	if category.begins_with("ring"): return "ring"
	if category.begins_with("ear"): return "ear"
	if PATHS.has(category): return category
	return "gem"

static func texture(kind_value: String, empty: bool = false) -> Texture2D:
	if kind_value == "haste": return preload("res://assets/icons/haste.svg")
	var key: String = kind_value + (":empty" if empty else "")
	if cache.has(key): return cache[key]
	var color: String = "#829199" if empty else {"sword":"#d0d6c7","daggers":"#d0d6c7","staff":"#bfa7c9","book":"#bfa7c9","bow":"#c6ad80","ring":"#cbb581","neck":"#cbb581","ear":"#cbb581","scroll":"#cbb99a","potion":"#c6b6b3","ether":"#c6b6b3"}.get(kind_value,"#bbc8c9")
	if kind_value in ["ring_str","ring_dex","ring_int"]: color = {"ring_str":"#dc8074","ring_dex":"#83cfa4","ring_int":"#a19ce8"}[kind_value]
	var paths: String = str(PATHS.get("potion" if kind_value == "ether" else "ring" if kind_value.begins_with("ring_") else kind_value, PATHS.gem))
	paths = paths.replace('class="ci-icon-liquid"', 'fill="%s" stroke="%s"' % (["#3b81aa","#8dbdd1"] if kind_value == "ether" else ["#bb434b","#ce7070"]))
	var svg: String = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40"><g fill="%s" stroke="%s" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round">%s</g></svg>' % ["none" if empty else "#4e5f684d",color,"1.25" if empty else "1.5",paths]
	var image: Image = Image.new()
	if image.load_svg_from_string(svg) != OK: return null
	var value: ImageTexture = ImageTexture.create_from_image(image)
	cache[key] = value
	return value
