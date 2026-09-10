extends "res://world-final/geography_preview.gd"
## Interactive D13 checkpoint; the accepted motor/camera/avatar are unchanged.
var nature_visual: Node3D
var details: Node3D
var preview_ready: bool=false

func _ready() -> void:
	terrain_root="res://world-final/geology-D13/"
	await super._ready()
	loaded=false
	status.text="VARENDOR · загрузка леса"
	nature_visual=load("res://world-final/nature/nature_layer.gd").new()
	nature_visual.authored_revision="D13";nature_visual.distant_trees=true;add_child(nature_visual)
	await nature_visual.build()
	for material: ShaderMaterial in nature_visual.focus_materials:
		var source: Material=material.get_meta("unmodified_source_material")
		if "pine_tree_01_twig" in source.resource_name:material.set_shader_parameter("base_color",Color(.70,.96,.72))
	var ground: ShaderMaterial=load("res://world-final/materials/geology_material_D12.gd").terrain("D13")
	for node: Node in find_children("*","MeshInstance3D",true,false):
		if str(node.name).begins_with("cell_"):node.material_override=ground
	status.text="VARENDOR · загрузка травы и скал"
	details=load("res://world-final/nature/groundcover_layer.gd").new()
	details.authored_revision="D13";details.geology_material_revision="D13"
	details.grass_shader="res://world-final/nature/grass_lit_D13.gdshader";add_child(details)
	await details.build()
	for path: String in ["collision-D13.json","groundcover-collision-D13.json"]:
		obstacles.append_array(JSON.parse_string(FileAccess.get_file_as_string("res://world-final/nature/"+path)).obstacles)
	collision.setup(obstacles)
	camera_collision.setup(obstacles.filter(func(o:Dictionary):return not str(o.source_mesh).contains("_access_ramp")))
	status.hide();loaded=true;preview_ready=true
	enter_location(Vector2(-100,243))
	print("WALK_PREVIEW_READY surface forest=92973 grass=362189")

func enter_location(point: Vector2) -> void:
	var target: Vector2=Vector2(point.x,-point.y)
	# Menu destinations use road coordinates. Resolve a nearby free standing
	# point if a hand-placed trunk or wall overlaps a destination.
	if collision.blocked(target):
		var found: bool=false
		for radius: int in range(1,16):
			for step: int in range(16):
				var candidate: Vector2=target+Vector2.from_angle(step*TAU/16)*radius
				if not collision.blocked(candidate):target=candidate;found=true;break
			if found:break
	reset_actor(target);motor.input_mode="manual";motor.input_direction=Vector2.ZERO
	overview=false;actor.show();camera.fov=rad_to_deg(.82)
	nature_visual.set_overview_geometry(false);follow.reset_follow()

func _process(dt: float) -> void:
	super._process(dt)
	if preview_ready:nature_visual.update_focus(actor.global_position,camera.global_position,not overview)

func set_overview() -> void:
	super.set_overview()
	if preview_ready:nature_visual.set_overview_geometry(true)

func _unhandled_input(event: InputEvent) -> void:
	super._unhandled_input(event)
	if event is InputEventKey and event.pressed and event.keycode==KEY_F2 and preview_ready:
		nature_visual.set_overview_geometry(false)
