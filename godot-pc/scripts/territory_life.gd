class_name VarendorTerritoryLife
extends Node3D

var world: VarendorWorld
var creatures: Array[Dictionary] = []
var clock: float = 0

func setup(value: VarendorWorld, authored: Array = []) -> void:
	world = value
	var definitions: Array = [
		["crow",Vector2(15,-15)],["crow",Vector2(-24,-18)],["crow",Vector2(34,-12)],
		["crow",Vector2(-78,58)],["crow",Vector2(63,-5)],
		["hare",Vector2(-66,-21)],["hare",Vector2(-73,8)],["hare",Vector2(80,33)],
		["hare",Vector2(39,-58)],["hare",Vector2(-110,27)]]
	if not authored.is_empty():
		definitions.clear()
		for entry: Dictionary in authored: definitions.append([str(entry.species),Vector2(entry.x,entry.z)])
	for index: int in definitions.size():
		var definition: Array = definitions[index]
		var asset_root: String = "res://world-final/castle/wildlife/" if world.final_environment != null else "res://generated/wildlife/"
		var packed: PackedScene = load(asset_root+str(definition[0])+".glb")
		var actor: Node3D = packed.instantiate()
		add_child(actor)
		var position_value: Vector2 = world.collision.nearest_free(definition[1])
		actor.position = world.point(position_value.x,position_value.y)
		actor.set_meta("pickable",false)
		creatures.append({"node":actor,"species":definition[0],"home":position_value,"point":position_value,"goal":position_value,"state":"idle","timer":1.2+index*.37,"phase":index*1.7,"height":0.0,"yaw":index*.8})

func _process(delta: float) -> void:
	if world == null or world.current_snapshot.is_empty(): return
	if world.final_environment != null and (world.final_environment.active_space != "surface" or not world.ambient_active()): return
	clock += delta
	var hero: Vector2 = world.player_motion.position_value
	for creature: Dictionary in creatures:
		var actor: Node3D = creature.node
		var p: Vector2 = creature.point
		var crow: bool = creature.species == "crow"
		creature.timer -= delta
		if hero.distance_to(p) < (4.5 if crow else 6.0) and creature.state != "flee":
			creature.state = "flee"
			var away: Vector2 = (p-hero).normalized()
			if away.length_squared() < .1: away = Vector2.RIGHT
			creature.goal = world.collision.nearest_free(p+away*(11.0 if crow else 8.0))
			creature.timer = 3.5
		if creature.state == "flee" or creature.state == "walk":
			var offset: Vector2 = (creature.goal as Vector2)-p
			var speed: float = (4.2 if crow else 3.7) if creature.state == "flee" else .45
			var movement: Vector2 = offset.normalized()*minf(speed*delta,offset.length())
			if crow and creature.state == "flee" and float(creature.height)>7.5 and world.final_environment == null: p += movement
			else: p = world.collision.resolve(p,movement)
			creature.yaw = lerp_angle(float(creature.yaw),atan2(movement.x,movement.y),minf(1,delta*9))
			if offset.length() < .3 or creature.timer <= 0:
				creature.state = "idle"
				creature.timer = 2.5+fmod(float(creature.phase)+clock,3.0)
		elif creature.timer <= 0:
			if creature.state == "idle":
				creature.state = "feed"
				creature.timer = 1.7
			else:
				creature.state = "walk"
				var a: float = clock*.17+float(creature.phase)
				creature.goal = world.collision.nearest_free((creature.home as Vector2)+Vector2(cos(a),sin(a))*3.0)
				creature.timer = 8
		creature.point = p
		creature.height = move_toward(float(creature.height),8.5 if crow and creature.state == "flee" else 0.0,delta*3.3)
		actor.position = world.point(p.x,p.y)+Vector3(0,float(creature.height),0)
		actor.rotation.y = -float(creature.yaw)+PI
		actor.rotation.x = sin(clock*8+float(creature.phase))*.14 if creature.state == "feed" else 0
		if creature.state == "flee" and not crow: actor.position.y += absf(sin(clock*15+float(creature.phase)))*.14
		if crow:
			for part: Node in actor.find_children("wing_*","Node3D",true,false):
				var side: float = -1.0 if "left" in str(part.name) else 1.0
				part.rotation.z = side*(.55+sin(clock*19)*.65) if creature.state == "flee" else 0
