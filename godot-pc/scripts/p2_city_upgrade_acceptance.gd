extends RefCounted
## Continue the actual city walk. No second fixture or position/HP reset.
const Wait = preload("res://scripts/content_acceptance.gd")

static func walk(app: Node, target: Vector2, timeout_ms: int = 20000) -> bool:
	app.net.intent({"type":"destination","x":target.x,"z":target.y})
	return await Wait.until(app,func(): return Vector2(app.net.hero.x,app.net.hero.z).distance_to(target)<.3 and str(app.net.hero.get("action",""))!="walk",timeout_ms)

static func run(app: Node, checks: Dictionary) -> void:
	var city: Dictionary = app.world.final_environment.read_json(app.world.final_environment.courtyard_path).get("p2City",{})
	checks.upgrade_city_version = int(city.get("version",0)) == 2
	checks.upgrade_eight_buildings = city.get("buildings",[]).size() == 8
	var loaded: int = 0
	for row: Dictionary in city.get("buildings",[]):
		if app.world.final_environment.castle_mesh.find_child(str(row.root),true,false) != null: loaded += 1
	checks.upgrade_eight_roots_loaded = loaded == 8
	app.world.camera_distance = 14
	app.world.camera_yaw = PI
	checks.upgrade_market_route = await walk(app,Vector2(-100,-198))
	await Wait.capture(app,"p2-city-upgrade-market")
	checks.upgrade_citadel_street = await walk(app,Vector2(-100,-145))
	checks.upgrade_guard_approach = await walk(app,Vector2(-136,-121))
	await Wait.capture(app,"p2-city-upgrade-guardhouse")
	checks.upgrade_guard_arch_entry = await walk(app,Vector2(-136,-117))
	checks.upgrade_guard_arch_passage = await walk(app,Vector2(-136,-104))
	checks.upgrade_guard_arch_return = await walk(app,Vector2(-136,-121))
	checks.upgrade_tavern_lane = await walk(app,Vector2(-138,-180))
	checks.upgrade_tavern_entry = await walk(app,Vector2(-139,-199))
	checks.upgrade_tavern_inside = await walk(app,Vector2(-147,-199))
	app.world.camera_distance = 8
	await Wait.capture(app,"p2-city-upgrade-tavern")
	checks.upgrade_city_alive = not bool(app.net.hero.dead)
