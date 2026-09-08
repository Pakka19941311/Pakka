shader_type spatial;
render_mode cull_disabled;
uniform sampler2D albedo_map : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 base_color : source_color = vec4(1.0);
uniform bool textured = false;
uniform bool cutout = false;
uniform float strength = 0.12;
uniform bool cloth = false;
varying vec3 world_point;
void vertex() {
    world_point = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz;
    float phase = world_point.x * 0.31 + world_point.z * 0.18;
    float gust = sin(TIME*1.45+phase)*0.65 + sin(TIME*2.7+phase*1.6)*0.22;
    float weight = COLOR.a;
    VERTEX.x += gust * strength * weight;
    VERTEX.z += sin(TIME*1.45+phase+0.7) * strength * 0.48 * weight;
}
void fragment() {
    vec4 surface = base_color;
    if (textured) surface *= texture(albedo_map,UV);
    if (cutout && surface.a < 0.45) discard;
    ALBEDO = surface.rgb * COLOR.rgb;
    ROUGHNESS = 0.9;
    SPECULAR = 0.18;
}
