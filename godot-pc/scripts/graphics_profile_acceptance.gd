extends SceneTree
const Profile=preload("res://scripts/graphics_profile.gd")

func _initialize() -> void:
	var settings: Dictionary={"quality":0,"msaa":0,"shadows":false,"distance":2,"vegetation":2,"render_scale":2,"fps":1,"ui_scale":3}
	Profile.migrate(settings)
	var checks: Dictionary={"old_low_load_reduced":settings.distance==0 and settings.vegetation==0 and settings.render_scale==0,
		"fps_and_ui_untouched":settings.fps==1 and settings.ui_scale==3}
	settings.render_scale=1
	Profile.migrate(settings)
	checks["later_override_preserved"]=settings.render_scale==1
	Profile.apply(settings,2)
	checks["high_restores_quality"]=settings.render_scale==2 and settings.shadows and settings.msaa==2 and settings.distance==2
	var page: Control=Control.new()
	var scale: OptionButton=OptionButton.new()
	for value: String in ["50","75","100"]:scale.add_item(value)
	scale.set_meta("setting_key","render_scale");page.add_child(scale)
	var shadows: CheckButton=CheckButton.new()
	shadows.set_meta("setting_key","shadows");page.add_child(shadows)
	Profile.sync_controls(page,settings)
	checks["visible_controls_match"]=scale.selected==2 and shadows.button_pressed
	page.free()
	print("GRAPHICS_PROFILE_ACCEPTANCE ",JSON.stringify(checks))
	quit(0 if checks.values().all(func(value):return value) else 2)
