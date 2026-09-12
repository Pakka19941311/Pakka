extends RefCounted
const Wait = preload("res://scripts/content_acceptance.gd")
const Keys = preload("res://scripts/knight_integration_qa.gd")
const Mouse = preload("res://world-final/gameplay_acceptance.gd")

static func walk(app: Node, target: Vector2, timeout_ms: int = 12000) -> bool:
	app.net.intent({"type":"destination","x":target.x,"z":target.y})
	return await Wait.until(app,func(): return Vector2(app.net.hero.x,app.net.hero.z).distance_to(target)<.25 and str(app.net.hero.get("action",""))!="walk",timeout_ms)

static func run(app: Node, checks: Dictionary) -> void:
	checks.city_fixture = not (await Mouse.fixture(app,"p2-city")).is_empty()
	checks.native_city_render = DisplayServer.get_name() != "headless"
	checks.city_p2_source = app.world.final_environment.courtyard_path.ends_with("courtyard-p2.json")
	checks.house_loaded = app.world.final_environment.castle_mesh.find_child("P2_housepack",true,false) != null
	app.world.camera_distance = 16
	app.world.camera_yaw = PI
	await Keys.wait_ms(app.get_tree(),600)
	await Wait.capture(app,"p2-city-street")
	checks.city_frontage = await walk(app,Vector2(-79,-206.5))
	checks.city_underpass = await walk(app,Vector2(-79,-215.8))
	checks.city_underpass_return = await walk(app,Vector2(-79,-206.5))
	checks.city_stair_approach = await walk(app,Vector2(-85.99,-208.4))
	app.world.camera_distance = 7.5
	app.world.camera_yaw = PI*.6
	var ground: float = app.world.hero_position.y
	checks.city_stairs_up = await walk(app,Vector2(-85.99,-212.45))
	await Keys.wait_ms(app.get_tree(),350)
	checks.city_real_height_gain = app.world.hero_position.y-ground>2.0
	checks.city_stair_canopy_cutaway = app.world.final_environment.p2_house_cutaway.active and not app.world.final_environment.p2_house_cutaway.hidden_names.is_empty()
	var torso: Vector3 = app.world.hero_position+Vector3.UP
	var screen: Vector2 = app.world.camera.unproject_position(torso)
	checks.city_hero_in_frame_at_wall = not app.world.camera.is_position_behind(torso) and Rect2(0,0,1600,900).has_point(screen)
	var from: Vector3 = app.world.hero_position+Vector3.UP*1.25
	checks.city_camera_clear_at_wall = app.world.collision.ray_distance(from,app.world.camera.position,.1,true)>=from.distance_to(app.world.camera.position)-.03
	app.net.save_private_json(app.qa_path.get_base_dir().path_join("p2-city-camera.json"),{
		"hero":str(app.world.hero_position),"camera":str(app.world.camera.position),"torso_screen":str(screen),
		"orbit":app.world.camera_controller.actual_distance,"limited":app.world.camera_controller.collision_limited})
	await Wait.capture(app,"p2-city-stair-top")
	# A wall-facing orbit can only contract within the actual gap. Turning the
	# existing camera back to the approach must restore a usable full-body view.
	app.world.camera_yaw = PI
	await Keys.wait_ms(app.get_tree(),1200)
	screen = app.world.camera.unproject_position(torso)
	checks.city_camera_recovers_after_rotation = app.world.camera_controller.actual_distance>6.5
	checks.city_hero_clear_of_hud_after_rotation = not app.world.camera.is_position_behind(torso) and Rect2(350,100,1000,620).has_point(screen)
	await Wait.capture(app,"p2-city-stair-clear-view")
	checks.city_stairs_down = await walk(app,Vector2(-85.99,-208.4))
	await Keys.wait_ms(app.get_tree(),350)
	checks.city_ground_return = absf(app.world.hero_position.y-ground)<.15
	checks.city_leave_stair_approach = await walk(app,Vector2(-86,-206.5))
	checks.city_canopy_restored = not app.world.final_environment.p2_house_cutaway.active
	checks.city_alive = not bool(app.net.hero.dead)
	var stopped: Vector2 = Vector2(app.net.hero.x,app.net.hero.z)
	await Keys.wait_ms(app.get_tree(),350)
	checks.city_stop = stopped.distance_to(Vector2(app.net.hero.x,app.net.hero.z))<.03
	await Wait.capture(app,"p2-city-stair-bottom")
	await preload("res://scripts/p2_city_upgrade_acceptance.gd").run(app,checks)
	print("P2_CITY_LIVE ",JSON.stringify(checks))
