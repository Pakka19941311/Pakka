shader_type spatial;
render_mode cull_disabled,specular_disabled;
// P2 local matte leaf variant. Existing UV, alpha and focus contracts retained.
// Collision, camera movement, architecture, rocks and enemies are unaffected.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rough_tex : filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec4 base_color : source_color = vec4(1.0);
uniform vec2 uv_scale = vec2(1.0);
uniform vec2 uv_offset = vec2(0.0);
uniform bool use_normal = false;
uniform bool use_rough = false;
uniform bool use_alpha = false;
uniform bool use_vertex_color = false;
uniform int rough_channel = 1;
uniform float roughness_value = 1.0;
uniform float normal_strength = 1.0;
uniform float source_alpha_cutoff = 0.35;
uniform bool focus_enabled = false;
uniform vec3 focus_camera;
uniform vec3 focus_hero;
uniform bool lod_enabled = false;
uniform int lod_index = 0;
varying float tree_distance;
varying vec3 world_position;
void vertex(){
    world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
    tree_distance=distance(CAMERA_POSITION_WORLD,INSTANCE_CUSTOM.xyz);
    UV=UV*uv_scale+uv_offset;
}
void fragment(){
    vec4 color=texture(albedo_tex,UV)*base_color;
    if(use_vertex_color)color*=COLOR;
    ALBEDO=color.rgb;
    float a=use_alpha?color.a:1.0;
    if(lod_enabled){
        float near_mix=smoothstep(70.0,85.0,tree_distance);
        float far_mix=smoothstep(160.0,195.0,tree_distance);
        float noise=fract(dot(floor(FRAGCOORD.xy),vec2(0.75487766,0.56984029)));
        if(lod_index==0 && noise<near_mix)discard;
        if(lod_index==1 && (noise>=near_mix || noise<far_mix))discard;
        if(lod_index==2 && noise>=far_mix)discard;
    }
    if(focus_enabled){
        vec3 target=focus_hero+vec3(0.0,0.95,0.0);
        vec3 line=target-focus_camera;
        float length_squared=max(dot(line,line),0.01);
        float t=dot(world_position-focus_camera,line)/length_squared;
        vec3 closest=focus_camera+line*clamp(t,0.0,1.0);
        // Cone follows only the projected body silhouette. It does not reveal
        // the full tree or a broad region of enemies beyond the avatar.
        float radius=mix(0.035,1.08,clamp(t,0.0,1.0));
        float distance_from_focus=length(world_position-closest);
        float weight=(1.0-smoothstep(radius*0.72,radius,distance_from_focus))*step(0.025,t)*(1.0-step(0.97,t));
        float coverage=mix(1.0,0.18,weight);
        float pattern=fract(dot(floor(FRAGCOORD.xy),vec2(0.75487766,0.56984029)));
        a*=step(pattern,coverage);
    }
    ALPHA=a;
    ALPHA_SCISSOR_THRESHOLD=use_alpha?source_alpha_cutoff:0.5;
    ROUGHNESS=roughness_value;
    if(use_rough){
        vec4 rough=texture(rough_tex,UV);
        ROUGHNESS*=rough_channel==4?dot(rough.rgb,vec3(0.333333)):rough[rough_channel];
    }
    if(use_normal){NORMAL_MAP=texture(normal_tex,UV).rgb;NORMAL_MAP_DEPTH=normal_strength;}
}
