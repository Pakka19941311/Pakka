shader_type spatial;
render_mode cull_disabled,specular_disabled;
varying vec3 world_position;
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
    if(!FRONT_FACING)NORMAL=-NORMAL;
    float variation=.5+.5*sin(world_position.x*1.41+sin(world_position.z*.88))*sin(world_position.z*1.1+.7);
    ALBEDO=mix(vec3(.12,.16,.043),vec3(.21,.235,.075),variation);
    BACKLIGHT=vec3(.10);ROUGHNESS=.94;
}
