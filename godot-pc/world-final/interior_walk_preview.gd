extends "res://world-final/interior_preview.gd"
var preview_ready: bool=false

func _ready() -> void:
	space_id=str(get_tree().root.get_meta("preview_space","mine"))
	await super._ready()
	overview=false;ceiling.show();camera.fov=rad_to_deg(.82);follow.reset_follow()
	status.hide();preview_ready=true
	print("WALK_PREVIEW_READY "+space_id)

func bake_navigation() -> void:
	# Runtime uses the hash-verified authored cache. Imported GLB source bytes
	# are not accessible in PCK; never rebake or write res:// in a shipped game.
	var path: String=INTERIORS+space_id+"-nav.tres"
	if not ResourceLoader.exists(path):
		push_error("Missing packaged interior navigation: "+path);get_tree().quit(3);return
	nav_mesh=load(path)
	set_meta("navigation_cache_reused",true)
	nav_map=NavigationServer3D.map_create()
	NavigationServer3D.map_set_cell_size(nav_map,.25)
	NavigationServer3D.map_set_cell_height(nav_map,.125)
	NavigationServer3D.map_set_active(nav_map,true)
	nav_region=NavigationRegion3D.new();nav_region.navigation_mesh=nav_mesh
	nav_region.set_navigation_map(nav_map);add_child(nav_region)
	NavigationServer3D.map_force_update(nav_map)
	await get_tree().physics_frame
