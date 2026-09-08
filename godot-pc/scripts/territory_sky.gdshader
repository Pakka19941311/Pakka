shader_type sky;
render_mode use_half_res_pass;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float cloud(vec2 p) { return noise(p)*0.55+noise(p*2.03)*0.27+noise(p*4.07)*0.12+noise(p*8.11)*0.06; }
void sky() {
    float elevation=max(EYEDIR.y,0.0);
    vec3 base=mix(vec3(0.56,0.64,0.66),vec3(0.23,0.37,0.5),pow(elevation,0.45));
    vec2 plane=EYEDIR.xz/max(0.14,EYEDIR.y+0.18);
    float first=smoothstep(0.47,0.72,cloud(plane*1.65+vec2(TIME*0.004,TIME*0.0018)));
    float second=smoothstep(0.51,0.74,cloud(plane*2.7+vec2(TIME*0.0025+37.0,17.0)));
    float coverage=(first*.68+second*.23)*smoothstep(-0.12,0.25,EYEDIR.y);
    COLOR=mix(base,vec3(.78,.8,.77),coverage);
    if(EYEDIR.y<0.0) COLOR=mix(vec3(.37,.43,.41),base,smoothstep(-.08,0.0,EYEDIR.y));
}
