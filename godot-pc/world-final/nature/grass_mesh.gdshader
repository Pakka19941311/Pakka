shader_type spatial;
render_mode cull_disabled, specular_disabled;
uniform int lod_index=0;
uniform bool lod_enabled=true;
varying float camera_distance;
void vertex(){
    camera_distance=distance(CAMERA_POSITION_WORLD.xz,INSTANCE_CUSTOM.xz);
}
void fragment(){
    if(lod_enabled){
        float rank=fract(dot(floor(FRAGCOORD.xy),vec2(.754877666,.569840296)));
        float transition=smoothstep(25.0,36.0,camera_distance);
        if(lod_index==0 && rank<transition)discard;
        if(lod_index==1 && rank>=transition)discard;
        if(rank<smoothstep(64.0,82.0,camera_distance))discard;
    }
    ALBEDO=COLOR.rgb;
    ROUGHNESS=.94;
}
