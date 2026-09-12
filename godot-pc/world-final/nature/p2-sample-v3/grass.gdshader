shader_type spatial;
render_mode cull_disabled,specular_disabled;
void fragment(){
    if(!FRONT_FACING)NORMAL=-NORMAL;
    ALBEDO=vec3(.10,.16,.033);BACKLIGHT=vec3(.18);ROUGHNESS=.9;
}
