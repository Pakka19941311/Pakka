extends SceneTree
const Books = preload("res://scripts/book_ui.gd")
func _init() -> void:
	var samples: Dictionary = {600000:"10:00",125000:"2:05",61000:"1:01",60000:"60 с",59000:"59 с",1:"1 с",0:""}
	for value: int in samples:
		assert(Books.buff_time(value)==samples[value],str(value))
	print("BUFF_FORMAT_OK: 7 boundaries")
	quit()
