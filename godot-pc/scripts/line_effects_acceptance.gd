extends SceneTree
## Isolated geometry/lifecycle contract, not a live combat or art acceptance.
const LineEffects = preload("res://scripts/line_effects.gd")
const BookGround = preload("res://scripts/book_ground_effects.gd")

class SlopedWorld extends Node3D:
	signal event_presented(event: Dictionary)
	var current_snapshot: Dictionary={}
	var space_loading: bool=false
	var queries: int=0
	func point(x: float,z: float,offset: float=0) -> Vector3:
		queries+=1
		return Vector3(x,.15*x-.2*z+offset,-z)

func _initialize() -> void:
	call_deferred("run")

func zone(id: String="counter:1",effect: String="fire") -> Dictionary:
	return {"kind":"line","id":id,"owner":"golem","point":{"x":0.0,"z":0.0,"spaceId":"surface"},
		"endPoint":{"x":6.0,"z":0.0,"spaceId":"surface"},"halfWidth":.9,"radius":.9,"expiresAt":2200.0,"effect":effect}

func snapshot(zones: Array,at: float=1000) -> Dictionary:
	return {"time":at,"character":{"spaceId":"surface","dead":false,"x":6.0,"z":0.0},"monsters":[],"groundEffects":zones}

func distance_to_segment(p: Vector2,a: Vector2,b: Vector2) -> float:
	var t: float=clampf((p-a).dot(b-a)/(b-a).length_squared(),0,1)
	return p.distance_to(a+(b-a)*t)

func run() -> void:
	var checks: Dictionary={}
	var world: SlopedWorld=SlopedWorld.new();root.add_child(world)
	var layer: Node3D=LineEffects.new();world.add_child(layer);layer.setup(world);layer.set_process(false)
	var s: Dictionary=snapshot([zone()]);layer.apply(s)
	checks["one_capsule"] = layer.telegraphs.size()==1
	var mesh_node: MeshInstance3D=layer.telegraphs["counter:1"].node
	var vertices: PackedVector3Array=mesh_node.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	var all_inside: bool=true;var conforms: bool=true
	var minimum: Vector2=Vector2(INF,INF);var maximum: Vector2=Vector2(-INF,-INF)
	for v: Vector3 in vertices:
		var p: Vector2=Vector2(v.x,-v.z)
		all_inside=all_inside and distance_to_segment(p,Vector2.ZERO,Vector2(6,0))<=.90002
		var offset: float=v.y-(.15*p.x-.2*p.y)
		conforms=conforms and (absf(offset-.045)<.00002 or absf(offset-.055)<.00002)
		minimum=minimum.min(p);maximum=maximum.max(p)
	checks["exact_server_capsule_no_outside_border"] = all_inside
	checks["round_caps_extend_exact_radius"] = absf(minimum.x+.9)<.00002 and absf(maximum.x-6.9)<.00002
	checks["full_width_1_8_metres"] = absf(minimum.y+.9)<.00002 and absf(maximum.y-.9)<.00002
	checks["all_vertices_follow_real_point_adapter"] = conforms
	checks["terrain_queries_deduplicated"] = world.queries<vertices.size()/2
	checks["one_surface_no_shadow"] = mesh_node.mesh.get_surface_count()==1 and mesh_node.cast_shadow==GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var original: Transform3D=mesh_node.transform
	var mutated: Dictionary=s.duplicate(true);mutated.character.z=3.5;mutated.groundEffects[0].endPoint.z=3.5
	layer.apply(mutated)
	checks["same_id_endpoint_and_hero_move_cannot_home"] = layer.telegraphs["counter:1"].node==mesh_node and layer.telegraphs["counter:1"].end==Vector2(6,0) and mesh_node.transform==original and layer.ignored_mutations==1
	layer.tick(2199,0,"surface")
	checks["visible_before_deadline"] = layer.telegraphs.size()==1
	layer.tick(2200,0,"surface")
	checks["hidden_at_deadline"] = layer.telegraphs.is_empty() and not mesh_node.visible
	layer.apply(s);layer.apply(snapshot([]))
	checks["snapshot_absence_clears_cancelled_line"] = layer.telegraphs.is_empty()
	layer.apply(s);world.event_presented.emit({"kind":"cancel","actor":"golem"})
	checks["cancel_event_immediate"] = layer.telegraphs.is_empty()
	layer.apply(s);world.event_presented.emit({"kind":"death","actor":"golem"})
	checks["death_event_immediate"] = layer.telegraphs.is_empty()
	var dead_source: Dictionary=s.duplicate(true);dead_source.monsters=[{"uid":"golem","alive":false}]
	layer.apply(dead_source)
	checks["dead_source_snapshot_rejected"] = layer.telegraphs.is_empty()
	layer.apply(s);var dead_hero: Dictionary=s.duplicate(true);dead_hero.character.dead=true;layer.apply(dead_hero)
	checks["dead_hero_snapshot_clears"] = layer.telegraphs.is_empty()
	layer.apply(s);layer.tick(1000,0,"mine")
	checks["space_change_immediate"] = layer.telegraphs.is_empty()
	var foreign: Dictionary=zone();foreign.endPoint.spaceId="cave";layer.apply(snapshot([foreign]))
	checks["mixed_space_endpoints_rejected"] = layer.telegraphs.is_empty()
	var malformed: Dictionary=zone();malformed.halfWidth=0;layer.apply(snapshot([malformed]))
	checks["invalid_geometry_rejected"] = layer.telegraphs.is_empty()
	layer.apply(snapshot([zone("ice","ice")]))
	var ice_node: MeshInstance3D=layer.telegraphs.ice.node
	var ice_colors: PackedColorArray=ice_node.mesh.surface_get_arrays(0)[Mesh.ARRAY_COLOR]
	checks["ice_color_distinct"] = ice_colors[0].b>ice_colors[0].r
	var release: Dictionary={"kind":"release","attackKind":"aimed-line","actor":"golem","actorGeneration":3,"sequence":5,
		"origin":{"x":0.0,"y":1.2,"z":0.0},"destination":{"x":6.0,"y":2.1,"z":0.0},"durationMs":0,"halfWidth":.9,"effect":"fire"}
	checks["release_consumes_aimed_line"] = layer.show_release(release)
	checks["release_removes_telegraph"] = layer.telegraphs.is_empty()
	checks["release_needs_no_target_actor"] = layer.pulses.size()==1
	var pulse: MeshInstance3D=layer.pulses[0].node
	var pulse_transform: Transform3D=pulse.transform
	var fixed: Dictionary=pulse.get_meta("fixed_release")
	checks["release_uses_exact_server_3d_points"] = fixed.origin==Vector3(0,1.2,0) and fixed.destination==Vector3(6,2.1,0)
	layer.show_release(release)
	checks["same_release_sequence_only_once"] = layer.pulses.size()==1
	layer.tick(1050,.05,"surface")
	checks["release_does_not_home"] = pulse.transform==pulse_transform
	layer.tick(1200,.15,"surface")
	checks["release_fades_and_expires"] = layer.pulses.is_empty() and not pulse.visible
	var stale: Dictionary=release.duplicate(true);stale.sequence=6;stale.presentationAgeMs=200;layer.show_release(stale)
	layer.show_release(stale)
	checks["late_valid_release_presented_only_once"] = layer.pulses.size()==1
	layer.tick(1400,.2,"surface")
	world.current_snapshot=snapshot([])
	var newborn: Dictionary=release.duplicate(true);newborn.sequence=7;newborn.presentationAgeMs=100
	layer.show_release(newborn)
	# Exercise the actual child process entry, with a long frame delta that
	# elapsed before the parent dispatched this brand-new release.
	layer._process(5.0)
	checks["newborn_survives_same_frame_process_large_delta"] = layer.pulses.size()==1 and layer.pulses[0].node.visible and absf(float(layer.pulses[0].left)-.18)<.00001
	var first_presented: int=int(layer.pulses[0].last_presented_us)
	layer.tick(1181,5.0,"surface",false,first_presented+181000)
	checks["presented_pulse_uses_full_wall_lifetime"] = layer.pulses.is_empty()
	checks["legacy_release_not_consumed"] = not layer.show_release({"kind":"release","effect":"fire"})
	var book: RefCounted=BookGround.new();book.world=world
	book.apply(snapshot([zone(),{"kind":"trap","id":"legacy-trap","point":{"x":2,"z":2},"radius":4,"expiresAt":2200}]))
	book.lines.set_process(false)
	checks["legacy_ring_kept_line_not_drawn_as_ring"] = book.nodes.size()==1 and book.nodes.has("legacy-trap") and book.lines.telegraphs.size()==1
	book.apply(snapshot([]));layer.clear_all();world.queue_free()
	await process_frame
	await process_frame
	checks["owned_meshes_freed"] = not is_instance_valid(mesh_node) and not is_instance_valid(pulse) and not is_instance_valid(ice_node)
	var failed: Array=[]
	for key: String in checks:
		if not checks[key]:failed.append(key)
	print("LINE_EFFECTS_ACCEPTANCE ",JSON.stringify({"checks":checks,"failed":failed,"vertices":vertices.size(),"scope":"isolated geometry and lifecycle, no live-counter/art/performance claim"}))
	quit(0 if failed.is_empty() else 1)
