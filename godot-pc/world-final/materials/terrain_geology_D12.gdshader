shader_type spatial;
render_mode cull_back;
uniform sampler2D biomes : filter_linear,repeat_disable;
uniform sampler2D forest_mask : filter_linear,repeat_disable;
uniform sampler2D forest_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D soil_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D rock_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D rock_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D rock_rough : filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D snow_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
varying vec3 world_position;
varying vec3 terrain_normal;
void vertex(){
    world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
    terrain_normal=normalize(MODEL_NORMAL_MATRIX*NORMAL);
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
vec3 triplanar(sampler2D map,vec3 p,vec3 weights){
    return texture(map,p.zy).rgb*weights.x+texture(map,p.xz).rgb*weights.y+texture(map,p.xy).rgb*weights.z;
}
void fragment(){
    vec2 uv=(world_position.xz+vec2(800,700))/vec2(1600,1400);
    vec4 zone=texture(biomes,uv);
    vec3 forest=texture(forest_mask,uv).rgb;
    vec3 n=normalize(terrain_normal);
    vec3 weights=pow(abs(n),vec3(4.0));weights/=max(.001,dot(weights,vec3(1.0)));
    float coarse=noise(world_position.xz/51.0);
    float medium=noise(world_position.xz/17.0+3.1);
    float fine=noise(world_position.xz/3.7);
    float slope=1.0-abs(n.y);
    float rock=smoothstep(.07,.36,slope+(medium-.5)*.08)*(1.0-zone.r*.88);
    vec2 ground_uv=vec2(world_position.x,-world_position.z)/3.6;
    vec3 litter=texture(forest_diff,ground_uv).rgb;
    vec3 field=litter*mix(vec3(.55,.69,.48),vec3(.77,.80,.60),coarse);
    vec3 soil=texture(soil_diff,ground_uv*.9).rgb*vec3(.81,.79,.74);
    // rock_wall_02 is a tileable PBR surface. A scanned mesh UV atlas is
    // deliberately not used as a repeating terrain texture.
    vec3 raw_stone=mix(triplanar(rock_diff,world_position/5.0,weights),triplanar(rock_diff,world_position/19.0,weights),.30);
    float stone_value=dot(raw_stone,vec3(.2126,.7152,.0722));
    vec3 stone=mix(raw_stone,vec3(stone_value),.64)*vec3(.99,1.035,1.07);
    stone*=mix(.85,1.15,coarse);
    vec3 color=mix(field,litter*vec3(.65,.73,.58),forest.g);
    color=mix(color,soil,max(zone.r,zone.a*.76));
    color=mix(color,stone,max(rock,zone.g*.5));
    vec3 ash=mix(soil*vec3(.53,.52,.51),stone*vec3(.71,.69,.68),max(rock,.56));
    color=mix(color,ash,zone.b);
    // Broken windward snow line follows current heights and surface angle.
    // Shelves retain cover; steep faces show irregular ribs, not a solid band.
    float snow_altitude=smoothstep(155.0,219.0,world_position.y+(coarse-.5)*34.0+(medium-.5)*15.0);
    float snow=zone.g*snow_altitude*(1.0-smoothstep(.22,.75,slope+(medium-.5)*.19+(fine-.5)*.06));
    vec3 ice=texture(snow_diff,ground_uv*1.3).rgb*vec3(.90,.95,1.0);
    color=mix(color,ice,snow);
    ALBEDO=color;METALLIC=0.0;SPECULAR=.22;
    vec3 p=world_position/5.0;
    vec2 dx=texture(rock_normal,p.zy).rg*2.0-1.0;
    vec2 dy=texture(rock_normal,p.xz).rg*2.0-1.0;
    vec2 dz=texture(rock_normal,p.xy).rg*2.0-1.0;
    vec3 perturb=vec3(0,dx.y,dx.x)*weights.x+vec3(dy.x,0,dy.y)*weights.y+vec3(dz.x,dz.y,0)*weights.z;
    NORMAL=normalize((VIEW_MATRIX*vec4(normalize(n+perturb*.34*rock*(1.0-snow)),0.0)).xyz);
    ROUGHNESS=mix(.94,clamp(triplanar(rock_rough,p,weights).r,.72,1.0),rock);
    ROUGHNESS=mix(ROUGHNESS,.88,snow);
}
