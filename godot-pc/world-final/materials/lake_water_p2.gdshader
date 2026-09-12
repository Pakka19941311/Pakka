shader_type spatial;
render_mode cull_disabled,depth_draw_opaque;
varying vec3 world_position;
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
    vec2 p=world_position.xz;
    float a=dot(p,vec2(.83,.56))*.83-TIME*.46;
    float b=dot(p,vec2(-.38,.92))*.43+TIME*.28;
    // Calm opaque water: existing level/collision, no SSR, screen read or refraction.
    vec2 slope=vec2(.83,.56)*cos(a)*.018+vec2(-.38,.92)*cos(b)*.011;
    NORMAL=normalize((VIEW_MATRIX*vec4(normalize(vec3(-slope.x,1.0,-slope.y)),0.0)).xyz);
    float fresnel=pow(1.0-clamp(dot(NORMAL,VIEW),0.0,1.0),3.0);
    float cloud=sin(p.x*.013+p.y*.006)*sin(p.y*.011-p.x*.004)*.5+.5;
    ALBEDO=mix(vec3(.10,.18,.20),vec3(.23,.34,.36),fresnel*.65+cloud*.18);
    ROUGHNESS=.27+.04*sin(a)*sin(b);
    METALLIC=.0;SPECULAR=.38;
}
