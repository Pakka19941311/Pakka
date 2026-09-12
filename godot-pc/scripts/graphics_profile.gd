extends RefCounted

static func apply(settings: Dictionary, quality: int) -> void:
	quality=clampi(quality,0,2)
	for key: String in ["quality","msaa","distance","vegetation","render_scale"]:
		settings[key]=quality
	settings["shadows"]=quality>0
	settings["fog"]=quality>0
	settings["graphics_profile_revision"]=1

static func migrate(settings: Dictionary) -> void:
	# The former Low preset only disabled shadows/MSAA, leaving full 3D load.
	# Apply the corrected Low once; future individual overrides stay persistent.
	if int(settings.get("graphics_profile_revision",0))<1:
		if int(settings.get("quality",2))==0: apply(settings,0)
		settings["graphics_profile_revision"]=1

static func sync_controls(parent: Node, settings: Dictionary) -> void:
	for child: Node in parent.get_children():
		var key: String=str(child.get_meta("setting_key",""))
		if settings.has(key):
			if child is OptionButton: child.selected=int(settings[key])
			elif child is CheckButton: child.set_pressed_no_signal(bool(settings[key]))
		sync_controls(child,settings)
