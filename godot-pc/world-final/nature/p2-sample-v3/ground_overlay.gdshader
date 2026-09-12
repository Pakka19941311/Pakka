shader_type spatial;
render_mode blend_mix,depth_draw_opaque,cull_back,specular_disabled;
uniform sampler2D litter : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D soil : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D mud : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D ground_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform vec4 bounds;
uniform bool shore=false;
varying vec3 world_position;
varying vec3 masks;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;masks=COLOR.rgb;}
void fragment(){
    vec2 uv=vec2(world_position.x,-world_position.z)*.28;
    vec3 base=mix(texture(litter,uv).rgb,shore?texture(mud,uv).rgb:texture(soil,uv).rgb,masks.r);
    base*=mix(vec3(1.0),shore?vec3(.77,.73,.57):vec3(.90,.94,.70),.25);
    if(!shore)base=base*1.20+vec3(.018,.019,.008);
    float fleck=clamp(noise(world_position.xz*3.0)*.7+noise(world_position.xz*7.0)*.3,0.0,1.0);
    vec3 moss=mix(vec3(.095,.12,.038),vec3(.18,.21,.067),fleck);
    ALBEDO=mix(base,moss,masks.g);
    if(shore)ALBEDO=mix(ALBEDO,ALBEDO*vec3(.57,.61,.48),masks.b*(.75+.25*noise(world_position.xz*1.8)));
    ROUGHNESS=shore?mix(.9,.28,masks.b):.94;
    NORMAL_MAP=texture(ground_normal,uv).rgb;NORMAL_MAP_DEPTH=.25;
    vec2 edge=min(world_position.xz-bounds.xy,bounds.zw-world_position.xz);
    ALPHA=smoothstep(0.0,4.0,min(edge.x,edge.y));
    ALPHA*=1.0-smoothstep(65.0,85.0,distance(CAMERA_POSITION_WORLD,world_position));
    if(shore)ALPHA*=smoothstep(40.015,40.10,world_position.y);
    if(ALPHA<.003)discard;
}
