extends RefCounted
const Wait=preload("res://scripts/content_acceptance.gd")
const Keys=preload("res://scripts/knight_integration_qa.gd")
const Mouse=preload("res://world-final/gameplay_acceptance.gd")
static func run(app:Node,checks:Dictionary) -> void:
	for id:String in ["v3_potion_concentrate","v3_potion_elixir","v3_potion_supreme"]:
		app.close_dialog();await Mouse.fixture(app,"late-healing|"+id)
		await app.open_npc_service("npc:shop");await Keys.wait_ms(app.get_tree(),250)
		var buttons:Array=app.active_dialog.find_children("*","Button",true,false).filter(func(b):return b.get_meta("npc_action","")=="buy:"+id)
		checks[id+"_available"]=buttons.size()==1 and not buttons[0].disabled
		if buttons.is_empty():continue
		var scroll:ScrollContainer=app.active_dialog.find_child("DialogScroll",true,false);scroll.ensure_control_visible(buttons[0]);await Keys.wait_ms(app.get_tree(),150)
		await Wait.capture(app,id+"-shop")
		var gold:int=app.net.hero.gold;Mouse.mouse(app,buttons[0].get_global_rect().get_center())
		checks[id+"_purchased"]=await Wait.until(app,func():return app.net.hero.inventory.any(func(i):return i.id==id),4000)
		checks[id+"_price"]=app.net.hero.gold==gold-int(app.data.items[id].buyPrice)
		app.close_dialog();var hp:float=app.net.hero.hp
		checks[id+"_icon"]=app.book_ui.item_icon({"id":id}).get_size()==Vector2(40,40)
		app.activate(id)
		checks[id+"_used_once"]=await Wait.until(app,func():return not app.net.hero.inventory.any(func(i):return i.id==id),4000)
		checks[id+"_exact_heal"]=app.net.hero.hp==hp+int(app.data.items[id].heal)
	await app.open_npc_service("npc:shop");await Keys.wait_ms(app.get_tree(),150);await Wait.capture(app,"late-healing-shop");app.close_dialog()
