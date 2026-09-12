shader_type spatial;
render_mode blend_mix,depth_draw_opaque,cull_disabled,specular_disabled;
uniform vec4 bounds;
uniform vec2 shore_a;
uniform vec2 shore_b;
uniform sampler2D sediment : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
varying vec3 world_position;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
    vec2 p=world_position.xz;
    vec2 edge=min(p-bounds.xy,bounds.zw-p);
    float local=smoothstep(0.0,4.0,min(edge.x,edge.y));
    vec2 line=shore_b-shore_a;
    float along=clamp(dot(p-shore_a,line)/dot(line,line),0.0,1.0);
    float coast=distance(p,shore_a+line*along);
    float grain=noise(p*3.0);
    float depth=clamp(coast*.18,0.0,1.0);
    vec3 mud=texture(sediment,vec2(p.x,-p.y)*.28).rgb*vec3(.72,.76,.55);
    vec3 shallow=mix(mud,vec3(.055,.105,.10),smoothstep(.3,4.5,coast+.38*grain));
    float ripple=sin(dot(p,vec2(.83,.56))*10.0-TIME*.85+noise(p)*1.6)*.5+.5;
    ALBEDO=shallow*(.93+.07*ripple)+vec3(.013,.019,.015)*grain;
    ROUGHNESS=mix(.90,.58,depth);
    ALPHA=local*(1.0-smoothstep(4.0,10.0,coast+.4*(grain-.5)));
    ALPHA*=1.0-smoothstep(65.0,85.0,distance(CAMERA_POSITION_WORLD,world_position));
    if(ALPHA<.003)discard;
}
