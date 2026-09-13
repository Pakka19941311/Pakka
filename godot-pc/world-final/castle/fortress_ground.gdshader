shader_type spatial;
render_mode cull_back;
#include "res://world-final/materials/terrain_macro.gdshaderinc"
uniform sampler2D road_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D road_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D road_rough : filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D earth_diff : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D earth_normal : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform bool solid_road = false;
varying vec3 world_p;
varying vec3 world_n;
void vertex(){world_p=(MODEL_MATRIX*vec4(VERTEX,1.)).xyz;world_n=normalize(MODEL_NORMAL_MATRIX*NORMAL);}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x),f.y);}
void fragment(){
 vec2 uv=world_p.xz/4.8;
 float blend=noise2(world_p.xz/24.+vec2(3.7,41.9));
 float broad=noise2(world_p.xz/53.-vec2(21,7));
 float edge=noise2(world_p.xz/1.65);
 float road=solid_road?1.:smoothstep(.1,.9,COLOR.r+(edge-.5)*.19);
 vec3 paved=macro_surface(road_diff,uv,blend)*vec3(.65,.64,.59);
 vec3 soil=macro_surface(earth_diff,uv*.91,blend)*vec3(.60,.54,.43);
 ALBEDO=mix(soil,paved,road)*mix(.87,1.12,broad);
 vec3 bump=mix(macro_normal(earth_normal,uv*.91,blend),macro_normal(road_normal,uv,blend),road)*2.-1.;
 NORMAL=normalize((VIEW_MATRIX*vec4(normalize(world_n+vec3(bump.x,0,bump.y)*.28),0.)).xyz);
 float stone_rough=macro_surface(road_rough,uv,blend).r;
 ROUGHNESS=mix(.94,clamp(stone_rough*.3+.58,.65,.96),road);SPECULAR=.18;
}
