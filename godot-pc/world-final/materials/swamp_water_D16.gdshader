shader_type spatial;
render_mode cull_back;
uniform vec3 shallow_color : source_color = vec3(0.18,0.19,0.12);
uniform vec3 deep_color : source_color = vec3(0.045,0.075,0.068);
// Static stage-D material. Coherent weather and water motion remain stage E.
void fragment(){
    ALBEDO=mix(shallow_color,deep_color,smoothstep(0.0,0.72,COLOR.r));
    METALLIC=0.0;
    ROUGHNESS=0.34;
    SPECULAR=0.35;
}
