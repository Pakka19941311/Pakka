extends RefCounted
## Native, resizable controls in the supplied «Руны титанов» visual language.
const PLATE = preload("res://ui/titan/plate.svg")
const BUTTON = preload("res://ui/titan/button.svg")

static func plate(margin: float = 12.0) -> StyleBoxTexture:
	var style: StyleBoxTexture = StyleBoxTexture.new()
	style.texture = PLATE
	for side: int in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]:
		style.set_texture_margin(side,20)
		style.set_content_margin(side,margin)
	return style

static func button(state: String = "normal", margin: float = 7.0) -> StyleBoxTexture:
	var style: StyleBoxTexture = StyleBoxTexture.new()
	style.texture = BUTTON
	for side: int in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]:
		style.set_texture_margin(side,7)
		style.set_content_margin(side,margin)
	style.modulate_color = Color("ffc58f") if state == "hover" else Color("d89356") if state == "pressed" else Color("ffffff")
	if state == "disabled": style.modulate_color = Color("737b82")
	return style

static func heading(label: Label) -> void:
	var font: SystemFont = SystemFont.new()
	font.font_names = PackedStringArray(["Georgia","Times New Roman"])
	label.add_theme_font_override("font",font)
	label.add_theme_color_override("font_color",Color("efdbb8"))
	label.add_theme_color_override("font_shadow_color",Color("080b0e"))
	label.add_theme_constant_override("shadow_offset_y",1)

static func install(theme: Theme) -> void:
	for control: String in ["Button","OptionButton"]:
		for state: String in ["normal","hover","pressed","disabled"]:
			theme.set_stylebox(state,control,button(state))
		theme.set_color("font_color",control,Color("eee8dc"))
		theme.set_color("font_hover_color",control,Color("ffe0b0"))
		theme.set_color("font_pressed_color",control,Color("ffffff"))
		theme.set_color("font_disabled_color",control,Color("96918a"))
	for control: String in ["LineEdit","TextEdit"]:
		theme.set_stylebox("normal",control,button())
		theme.set_stylebox("focus",control,button("hover"))
		theme.set_color("font_color",control,Color("eee8dc"))
		theme.set_color("caret_color",control,Color("ffbf73"))
	theme.set_stylebox("panel","PopupMenu",plate())
	theme.set_stylebox("hover","PopupMenu",button("hover"))
	theme.set_color("font_color","PopupMenu",Color("eee8dc"))
	theme.set_stylebox("panel","TabContainer",button("normal",8))
	for control: String in ["TabBar","TabContainer"]:
		for state: String in ["tab_selected","tab_hovered","tab_unselected","tab_disabled"]:
			theme.set_stylebox(state,control,button("pressed" if state == "tab_selected" else "hover" if state == "tab_hovered" else "normal",8))
		theme.set_color("font_selected_color",control,Color("ffe0b0"))
		theme.set_color("font_unselected_color",control,Color("d0c8b9"))
	theme.set_stylebox("panel","PanelContainer",plate())
	theme.set_color("font_color","Label",Color("eee8dc"))
	for state: String in ["normal","hover","pressed","hover_pressed","disabled"]:
		theme.set_stylebox(state,"CheckButton",StyleBoxEmpty.new())
	theme.set_icon("checked","CheckButton",preload("res://ui/titan/toggle-on.svg"))
	theme.set_icon("unchecked","CheckButton",preload("res://ui/titan/toggle-off.svg"))
	var separator: StyleBoxLine = StyleBoxLine.new()
	separator.color = Color("434b4c")
	separator.thickness = 1
	theme.set_stylebox("separator","HSeparator",separator)
