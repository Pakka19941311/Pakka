shader_type spatial;
render_mode cull_disabled;
uniform float strength = 0.055;
uniform vec3 tint = vec3(1.0);
void vertex() {
    float mask = COLOR.a;
    float phase = TIME * 1.25 + VERTEX.x * 0.8 + VERTEX.z * 0.43;
    VERTEX.x += sin(phase) * strength * mask;
    VERTEX.z += cos(phase * 0.73) * strength * mask * 0.45;
}
void fragment() {
    ALBEDO = COLOR.rgb * tint;
    ROUGHNESS = 0.92;
    BACKLIGHT = COLOR.rgb * 0.12;
}
