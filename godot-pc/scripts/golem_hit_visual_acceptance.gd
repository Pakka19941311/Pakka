extends SceneTree
const Visual = preload("res://scripts/golem_hit_visual.gd")
class World:
	extends Node3D
	var effects: Array=[]
	func point(x: float,z: float,y: float=0) -> Vector3: return Vector3(x,y,-z)
	func effect_mesh(color: Color,mesh: Mesh) -> MeshInstance3D:
		var node: MeshInstance3D=MeshInstance3D.new();node.mesh=mesh
		var material: StandardMaterial3D=StandardMaterial3D.new();material.albedo_color=color
		node.material_override=material;add_child(node);return node
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var world: World=World.new();root.add_child(world)
	var source: Node3D=Node3D.new();world.add_child(source)
	var target: Node3D=Node3D.new();world.add_child(target)
	source.set_meta("pick_size",Vector3(2,6.2,2));target.position=Vector3(4,0,0)
	var checks: Dictionary={}
	for id: String in ["fire_golem","ice_golem","rift_boss","cave_boss"]:
		source.set_meta("motion",{"id":id});world.effects.clear()
		checks[id+"_handled"]=Visual.show(world,{"effect":"slash","durationMs":0,"target":"hero","generation":7},source,target)
		checks[id+"_no_arrow_or_beam"]=world.effects.size()==2 and world.effects.all(func(e):return not e.node.mesh is CylinderMesh)
		var color: Color=world.effects[0].node.material_override.albedo_color
		checks[id+"_element_color"]=color.b>color.r if id=="ice_golem" else color.r>color.b
		checks[id+"_contact_at_target"]=world.effects[0].node.position==Vector3(4,1.4,0)
	source.set_meta("motion",{"id":"fire_golem"});world.effects.clear()
	Visual.show(world,{"effect":"arrow","durationMs":280,"target":"hero","generation":7},source,target)
	checks.legacy_projectile_is_elemental_sphere=world.effects.size()==1 and world.effects[0].node.mesh is SphereMesh and not world.effects[0].arrow
	checks.projectile_duration_preserved=is_equal_approx(world.effects[0].duration,.28)
	source.set_meta("motion",{"classId":"ranger"});source.set_meta("model","Ranger");world.effects.clear()
	checks.player_arrow_untouched=not Visual.show(world,{"effect":"arrow","durationMs":280},source,target) and world.effects.is_empty()
	world.free()
	var ok: bool=checks.values().all(func(value):return value)
	print("GOLEM_HIT_VISUAL ",JSON.stringify({"ok":ok,"checks":checks}))
	quit(0 if ok else 2)
