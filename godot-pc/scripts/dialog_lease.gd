extends RefCounted

# A reply may update its own live dialog, never reopen one the player closed
# or steal the current window/profile after an asynchronous item command.
static func capture(app: Node, body: Control) -> Dictionary:
	return {"body":weakref(body),"session":app.net.session_generation,"hero":str(app.net.hero.get("id","")),"generation":int(app.net.hero.get("generation",-1))}

static func current(app: Node, lease: Dictionary, allow_new_generation: bool = false) -> bool:
	var reference: WeakRef = lease.get("body")
	if reference == null: return false
	var body: Control = reference.get_ref()
	if not is_instance_valid(body) or body.is_queued_for_deletion() or not is_instance_valid(app.active_dialog) or app.active_dialog.is_queued_for_deletion(): return false
	if not app.active_dialog.is_ancestor_of(body) or not app.active_dialog.visible: return false
	if app.net.session_generation != lease.session or str(app.net.hero.get("id","")) != lease.hero: return false
	return allow_new_generation or int(app.net.hero.get("generation",-1)) == lease.generation
