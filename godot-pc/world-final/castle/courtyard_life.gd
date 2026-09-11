extends Node3D
## Local atmosphere, kept separate from the authoritative economy and combat.
var world: VarendorWorld
var wildlife: VarendorTerritoryLife
var speech_clock: float = 6.0
var speech_index: int = 0
var speech_count: int = 0
var definition: Dictionary
var tavern: RefCounted
const LINES: Dictionary = {
	"merchant":["Полотно проверяй по краю. Всё целое.","Три тюка — и доставим к складу."],
	"buyer":["Муку оставьте. Заберу после кузницы.","Сойдёмся на этой цене."],
	"instructor":["Щит выше. Шаг в сторону — удар!","Держите дистанцию. Ещё раз."],
	"trainee":["Есть, сержант!"],
	"archer":["Выдох… и отпускаем тетиву."],
	"worker":["Эти доски пойдут на новые ворота."],
	"porter":["Следующий груз — к мастерской."],
	"scribe":["Две бочки, три мешка. Записал."],
	"gardener":["Свежие травы — для Миры."],
	"gate":["Проход свободен. Оружие держите в ножнах."],
	"walker":["У колодца сегодня спокойно."],
	"barkeep":["Книги у Северина. Эль — у меня.","Хельга, ещё хлеба к дальнему столу!"],
	"drinker":["Я эту байку… сам видел!", "За Гринфолл! И за следующую кружку…"],
	"sleeper":["Я не сплю… я слушаю."],
	"server":["Горячее несу! Дайте пройти.","Сначала расчёт за прошлую кружку."]}

func setup(value: VarendorWorld, data: Dictionary) -> void:
	world = value
	definition = data
	if data.has("tavern"):
		tavern = preload("res://world-final/castle/tavern_life.gd").new()
		tavern.setup(world,data.tavern,world.final_environment.castle_mesh,self)
	wildlife = VarendorTerritoryLife.new()
	wildlife.name = "CourtyardWildlife"
	add_child(wildlife)
	wildlife.setup(world,data.wildlife)
	for sign_data: Dictionary in data.signs:
		var sign: Label3D = Label3D.new()
		sign.text = str(sign_data.text)
		sign.position = world.point(sign_data.x,sign_data.z,sign_data.height)
		sign.font_size = 48
		sign.pixel_size = .012
		sign.modulate = Color("d4c6a0")
		sign.outline_size = 5
		sign.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		if sign_data.get("physical",false):
			sign.billboard = BaseMaterial3D.BILLBOARD_DISABLED
			sign.rotation.y = sign_data.yaw
			sign.pixel_size = .003
			sign.font_size = 36
		sign.visibility_range_end = float(sign_data.range)
		add_child(sign)
	# One small, shadow-free forge light; no particle emitters or new shadow maps.
	var forge: OmniLight3D = OmniLight3D.new()
	forge.name = "ForgeEmbers"
	forge.position = world.point(-139,-187,1.7)
	forge.light_color = Color("e99245")
	forge.light_energy = .6
	forge.omni_range = 4.0
	forge.shadow_enabled = false
	forge.distance_fade_enabled = true
	forge.distance_fade_begin = 24
	forge.distance_fade_length = 8
	add_child(forge)

func _process(delta: float) -> void:
	if world == null or world.current_snapshot.is_empty() or not world.ambient_active(): return
	speech_clock -= delta
	if speech_clock > 0: return
	speech_clock = 8.0
	var residents: Array[Dictionary] = world.ambient_residents.residents
	for offset: int in range(residents.size()):
		var index: int = (speech_index+offset)%residents.size()
		var resident: Dictionary = residents[index]
		if resident.state != "activity" or not LINES.has(resident.role): continue
		var position: Vector2 = resident.position
		if world.player_motion.position_value.distance_to(position) > 13: continue
		var point: Vector3 = world.point(position.x,position.y,1.2)
		if world.camera.is_position_behind(point): continue
		var eye: Vector3 = world.hero_position+Vector3.UP*1.5
		if world.collision.ray_distance(eye,point) < eye.distance_to(point)-.1: continue
		var lines: Array = LINES[resident.role]
		world.show_text(world.point(position.x,position.y),lines[speech_count%lines.size()],Color("d6d2bd"),3.2)
		speech_index = index+1
		speech_count += 1
		break
