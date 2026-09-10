shader_type spatial;
render_mode cull_back;
uniform sampler2D ground_mask : filter_linear, repeat_disable;
uniform sampler2D forest_diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D trail_diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D trail_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_diff : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec4 sample_bounds = vec4(-730.0,-145.0,-560.0,25.0);
varying vec3 world_position;
varying vec4 terrain_color;
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;terrain_color=COLOR;}
void fragment(){
    vec2 coords=(world_position.xz-sample_bounds.xy)/(sample_bounds.zw-sample_bounds.xy);
    vec2 edge=min(coords,vec2(1.0)-coords);
    float sample_weight=smoothstep(0.0,0.018,min(edge.x,edge.y));
    vec3 mask=texture(ground_mask,coords).rgb;
    vec2 uv=vec2(world_position.x,-world_position.z)/3.6;
    vec3 woodland=texture(forest_diff,uv).rgb*vec3(.64,.68,.59);
    vec3 mud=texture(trail_diff,uv*.9).rgb*vec3(.75,.72,.66);
    vec3 stones=texture(rock_diff,uv*.68).rgb*vec3(.57,.60,.60);
    vec3 color=mix(woodland,mud,mask.r);
    color=mix(color,stones,mask.b*(1.0-mask.r));
    color=mix(color,color*vec3(.88,1.03,.80),1.0-mask.g);
    ALBEDO=mix(terrain_color.rgb,color,sample_weight);
    vec3 n=mix(texture(forest_normal,uv).rgb,texture(trail_normal,uv*.9).rgb,mask.r);
    n=mix(n,texture(rock_normal,uv*.68).rgb,mask.b*(1.0-mask.r));
    NORMAL_MAP=mix(vec3(.5,.5,1.0),n,sample_weight);
    NORMAL_MAP_DEPTH=.6;ROUGHNESS=.93;
}
