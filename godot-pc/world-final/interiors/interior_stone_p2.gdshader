shader_type spatial;
render_mode cull_back;
#include "res://world-final/materials/terrain_macro.gdshaderinc"
uniform sampler2D diffuse_map : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D normal_map : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D rough_map : filter_linear_mipmap_anisotropic,repeat_enable;
uniform vec3 stone_tint : source_color = vec3(.68,.73,.76);
uniform bool floor_surface = false;
varying vec3 p_world;
varying vec3 n_world;
void vertex(){p_world=(MODEL_MATRIX*vec4(VERTEX,1.)).xyz;n_world=normalize(MODEL_NORMAL_MATRIX*NORMAL);}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x),f.y);}
void fragment(){
 vec3 n=normalize(n_world),w=pow(abs(n),vec3(4.));w/=max(dot(w,vec3(1)),.001);
 vec3 p=p_world/(floor_surface?5.7:7.8);
 float blend=noise2(p_world.xz/21.+vec2(9.7,-4.3));
 vec3 col=macro_surface(diffuse_map,p.zy,blend)*w.x+macro_surface(diffuse_map,p.xz,blend)*w.y+macro_surface(diffuse_map,p.xy,blend)*w.z;
 float broad=noise2(p_world.xz/39.+vec2(21,7));
 float strata=.5+.5*sin(p_world.y*.68+noise2(p_world.xz/12.)*3.7);
 float damp=smoothstep(.48,.75,noise2(p_world.xz/8.7));
 col*=stone_tint*mix(.78,1.16,broad)*mix(.87,1.05,strata);
 if(floor_surface){col*=mix(1.,.64,damp);}
 ALBEDO=col;
 float rough=macro_surface(rough_map,p.zy,blend).r*w.x+macro_surface(rough_map,p.xz,blend).r*w.y+macro_surface(rough_map,p.xy,blend).r*w.z;
 ROUGHNESS=clamp(rough*.35+.57-(floor_surface?damp*.18:0.),.46,.96);SPECULAR=.23;
 vec2 dx=macro_normal(normal_map,p.zy,blend).rg*2.-1.;
 vec2 dy=macro_normal(normal_map,p.xz,blend).rg*2.-1.;
 vec2 dz=macro_normal(normal_map,p.xy,blend).rg*2.-1.;
 vec3 perturb=vec3(0,dx.y,dx.x)*w.x+vec3(dy.x,0,dy.y)*w.y+vec3(dz.x,dz.y,0)*w.z;
 NORMAL=normalize(mat3(VIEW_MATRIX)*normalize(n+perturb*.34));
}
