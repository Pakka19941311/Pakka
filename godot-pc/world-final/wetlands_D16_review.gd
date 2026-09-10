extends "res://world-final/groundcover_world_review.gd"

func run_review() -> void:
	add_child(load("res://world-final/landmarks/swamp_water.tscn").instantiate())
	await super.run_review()
