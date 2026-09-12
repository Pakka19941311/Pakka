shader_type spatial;
render_mode cull_disabled,shadows_disabled;
varying vec3 world_position;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
    vec2 p=world_position.xz;
    float grain=sin(p.y*74.0+sin(p.x*.7)*.65+noise(vec2(p.x*.6,p.y*3.0)))*.5+.5;
    float wear=noise(vec2(p.x*.31,p.y*1.6));
    float board=hash(vec2(floor((p.y+30.0)/.6),7.0));
    ALBEDO=mix(vec3(.17,.125,.085),vec3(.24,.205,.16),wear)*mix(.92,1.07,grain)*mix(.94,1.04,board);
    ROUGHNESS=.9;SPECULAR=.14;METALLIC=0.0;
}
