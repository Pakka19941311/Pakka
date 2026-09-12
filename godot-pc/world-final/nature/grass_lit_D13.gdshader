shader_type spatial;
render_mode cull_disabled,specular_disabled;
uniform int lod_index=0;
uniform bool lod_enabled=true;
uniform float draw_distance=80.0;
uniform float wind_strength=.055;
varying float camera_distance;
void vertex(){
    camera_distance=distance(CAMERA_POSITION_WORLD.xz,INSTANCE_CUSTOM.xz);
    float tip=clamp(VERTEX.y,0.0,1.4);
    float phase=dot(INSTANCE_CUSTOM.xz,vec2(.083,.061));
    float gust=sin(TIME*1.37+phase)+.28*sin(TIME*2.11+phase*.7);
    VERTEX.xz+=vec2(.76,.32)*gust*wind_strength*tip*tip;
}
void fragment(){
	float rank=fract(dot(floor(FRAGCOORD.xy),vec2(.754877666,.569840296)));
	// Camera distance is the saved world-space centre of this individual tuft,
	// not the MultiMesh cell origin. Final coverage ends at the chosen setting.
	if(rank<smoothstep(draw_distance*.8,draw_distance,camera_distance))discard;
    if(lod_enabled){
        float transition=smoothstep(25.0,36.0,camera_distance);
        if(lod_index==0 && rank<transition)discard;
        if(lod_index==1 && rank>=transition)discard;
    }
    // Both faces use the authored upward clump normal. Godot flips it for
    // back-facing triangles of a two-sided mesh; restore it on that side.
    if(!FRONT_FACING)NORMAL=-NORMAL;
    ALBEDO=COLOR.rgb*1.25;
    BACKLIGHT=vec3(.18);
    ROUGHNESS=.94;
}
