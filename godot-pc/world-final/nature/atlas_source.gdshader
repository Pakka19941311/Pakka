shader_type spatial;
render_mode unshaded,cull_disabled;
uniform sampler2D base : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform sampler2D normals : hint_normal,filter_linear_mipmap_anisotropic,repeat_enable;
uniform vec4 tint : source_color=vec4(1.0);
uniform vec2 uv_scale=vec2(1.0);
uniform vec2 uv_offset=vec2(0.0);
uniform bool use_normal=false;
uniform bool use_alpha=false;
uniform bool use_vertex_color=false;
uniform float strength=1.0;
uniform float cutoff=.35;
uniform bool vector_pass=false;
void vertex(){UV=UV*uv_scale+uv_offset;}
void fragment(){
    vec4 color=texture(base,UV)*tint;
    if(use_vertex_color)color*=COLOR;
    ALBEDO=color.rgb;
    if(vector_pass){
        vec3 n=NORMAL;
        if(use_normal){
            vec2 xy=texture(normals,UV).rg*2.0-1.0;
            float nz=sqrt(max(0.0,1.0-dot(xy,xy)));
            n=normalize(mix(NORMAL,TANGENT*xy.x+BINORMAL*xy.y+NORMAL*nz,strength));
        }
        // The Compatibility renderer already reverses NORMAL on back faces.
        // A second flip here reverses the baked lighting of half the needles.
        ALBEDO=normalize((INV_VIEW_MATRIX*vec4(n,0.0)).xyz)*.5+.5;
    }
    ALPHA=use_alpha?color.a:1.0;
    ALPHA_SCISSOR_THRESHOLD=cutoff;
}
