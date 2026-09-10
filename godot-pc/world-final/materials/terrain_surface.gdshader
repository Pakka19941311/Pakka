shader_type spatial;
render_mode cull_back;
uniform sampler2D biomes : filter_linear,repeat_disable;
uniform sampler2D forest_mask : filter_linear,repeat_disable;
uniform sampler2D forest_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D forest_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D soil_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D soil_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D cliff_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D cliff_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D cliff_arm : filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D snow_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D snow_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D snow_rough : filter_linear_mipmap_anisotropic,repeat_enable;
varying vec3 world_position;
varying vec3 terrain_normal;
void vertex(){
    world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
    terrain_normal=normalize(MODEL_NORMAL_MATRIX*NORMAL);
}
vec3 triplanar(sampler2D map, vec3 p, vec3 weights){
    return texture(map,p.zy).rgb*weights.x+texture(map,p.xz).rgb*weights.y+texture(map,p.xy).rgb*weights.z;
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float smooth_noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void fragment(){
    vec2 uv=(world_position.xz+vec2(800,700))/vec2(1600,1400);
    vec4 zone=texture(biomes,uv);
    vec3 forest=texture(forest_mask,uv).rgb;
    vec3 n=normalize(terrain_normal);
    vec3 weights=pow(abs(n),vec3(4.0));weights/=max(.001,dot(weights,vec3(1.0)));
    float slope=1.0-abs(n.y);
    float rock=smoothstep(.14,.39,slope)*(1.0-zone.r);
    float macro=smooth_noise(world_position.xz/27.0);
    vec2 ground_uv=vec2(world_position.x,-world_position.z)/3.6;
    vec3 litter=texture(forest_diff,ground_uv).rgb*vec3(.67,.75,.59);
    vec3 field=litter*mix(vec3(.82,.99,.63),vec3(1.03,.95,.76),macro);
    vec3 soil=texture(soil_diff,ground_uv*.9).rgb*vec3(.75,.72,.65);
    vec3 stone=triplanar(cliff_diff,world_position/8.0,weights)*vec3(.69,.72,.75);
    vec3 color=mix(field,litter,forest.g);
    color=mix(color,soil,max(zone.r,zone.a*.76));
    color=mix(color,stone,rock);
    vec3 ash=mix(soil*vec3(.43,.40,.38),stone*vec3(.30,.28,.27),max(rock,.30));
    color=mix(color,ash,zone.b);
    // Snow rests on upward slopes and shelves; exposed faces retain rock.
    float snow=zone.g*(1.0-smoothstep(.19,.48,slope));
    snow*=mix(.90,1.0,smooth_noise(world_position.xz/9.0));
    vec3 ice=texture(snow_diff,ground_uv*1.8).rgb*vec3(.94,.975,1.0);
    color=mix(color,ice,snow);
    color*=mix(.92,1.06,macro);
    ALBEDO=color;METALLIC=0.0;SPECULAR=.22;
    vec3 bump=mix(texture(forest_normal,ground_uv).rgb,texture(soil_normal,ground_uv*.9).rgb,max(zone.r,zone.a));
    bump=mix(bump,texture(cliff_normal,ground_uv*.45).rgb,rock);
    bump=mix(bump,texture(snow_normal,ground_uv*1.8).rgb,snow);
    NORMAL_MAP=bump;NORMAL_MAP_DEPTH=mix(.55,.38,snow);
    ROUGHNESS=mix(.94,.80,zone.a);
    ROUGHNESS=mix(ROUGHNESS,clamp(triplanar(cliff_arm,world_position/8.0,weights).g,.65,1.0),rock);
    ROUGHNESS=mix(ROUGHNESS,clamp(texture(snow_rough,ground_uv*1.8).r,.65,1.0),snow);
}
