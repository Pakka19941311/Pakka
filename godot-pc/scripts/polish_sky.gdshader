shader_type sky;
uniform float daylight = 1.0;
uniform vec3 sun_direction = vec3(0.5,0.8,-0.4);
uniform float cloud_cover = 0.18;
uniform float rain_amount = 0.0;
uniform bool full_moon = false;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
void sky(){
 vec3 d=normalize(EYEDIR);float h=max(d.y,0.0);
 vec3 clear=mix(vec3(.38,.64,.89),vec3(.045,.24,.59),pow(h,.48));
 vec3 night=mix(vec3(.035,.062,.12),vec3(.007,.017,.055),pow(h,.5));
 vec3 col=mix(night,clear,daylight);
 float sun=dot(d,normalize(sun_direction));
 col+=vec3(1.0,.81,.48)*(smoothstep(.99945,.99972,sun)*daylight*2.0+pow(max(sun,0.0),100.0)*.23*daylight);
 vec3 md=-normalize(sun_direction);float moon=smoothstep(.9988,.9994,dot(d,md));
 float phase=full_moon?1.0:smoothstep(-.005,.005,dot(d-md,normalize(cross(md,vec3(0,1,0))))+.008);
 col+=vec3(.77,.84,1.0)*moon*phase*(1.0-daylight)*1.6;
 vec2 star_uv=d.xz/max(.12,h)*180.0;vec2 cell=floor(star_uv);float star=step(.995,hash21(cell))*pow(max(0.0,1.0-length(fract(star_uv)-.5)*2.0),12.0);
 col+=vec3(star)*(1.0-daylight)*smoothstep(.06,.25,h);
 vec2 uv=d.xz/max(.12,h)*1.6+vec2(TIME*.004,TIME*.002);
 float cloud=noise2(uv)*.55+noise2(uv*2.1)*.3+noise2(uv*4.3)*.15;
 float opacity=smoothstep(.76-cloud_cover*.42,.94-cloud_cover*.42,cloud)*smoothstep(.015,.15,h);
 vec3 cc=mix(vec3(.08,.12,.19),mix(vec3(.95,.97,1.0),vec3(.31,.4,.49),rain_amount),daylight);
 col=mix(col,cc,opacity);
 col=mix(col,mix(vec3(.06,.09,.14),vec3(.23,.34,.43),daylight),rain_amount*.38);
 COLOR=col;
}
