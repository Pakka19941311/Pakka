shader_type spatial;
render_mode cull_disabled;
// Data baked by this Compatibility renderer round-trips its shader values.
// Do not add a transfer transform to either encoded sampler.
uniform sampler2D atlas : filter_linear_mipmap, repeat_disable;
uniform sampler2D vectors : filter_linear_mipmap, repeat_disable;
varying float tree_yaw;
varying float view_index;
uniform bool lod_enabled=false;
varying float tree_distance;
void vertex(){
    vec3 origin=MODEL_MATRIX[3].xyz;
    float scale=length(MODEL_MATRIX[0].xyz);
    tree_yaw=atan(-MODEL_MATRIX[0].z,MODEL_MATRIX[0].x);
    tree_distance=distance(CAMERA_POSITION_WORLD,INSTANCE_CUSTOM.xyz);
    vec3 forward=normalize(vec3(CAMERA_POSITION_WORLD.x-origin.x,0.0,CAMERA_POSITION_WORLD.z-origin.z));
    vec3 right=normalize(cross(vec3(0.0,1.0,0.0),forward));
    float direction=atan(forward.x,forward.z)-tree_yaw;
    view_index=mod(floor(direction/6.28318530718*8.0+0.5)+8.0,8.0);
    MODELVIEW_MATRIX=VIEW_MATRIX*mat4(vec4(right*scale,0.0),vec4(0.0,scale,0.0,0.0),vec4(forward*scale,0.0),vec4(origin,1.0));
}
void fragment(){
    if(lod_enabled){
        float noise=fract(dot(floor(FRAGCOORD.xy),vec2(0.75487766,0.56984029)));
        if(noise>=smoothstep(160.0,195.0,tree_distance))discard;
    }
    vec2 coords=vec2((clamp(UV.x,0.002,0.998)+view_index)/8.0,clamp(UV.y,0.002,0.998));
    vec4 color=texture(atlas,coords);
    ALBEDO=color.rgb/max(color.a,0.001);
    ALPHA=color.a;ALPHA_SCISSOR_THRESHOLD=0.40;
    vec4 encoded=texture(vectors,coords);
    vec3 n=normalize(encoded.rgb/max(encoded.a,0.001)*2.0-1.0);
    vec3 turned=vec3(cos(tree_yaw)*n.x+sin(tree_yaw)*n.z,n.y,-sin(tree_yaw)*n.x+cos(tree_yaw)*n.z);
    NORMAL=normalize((VIEW_MATRIX*vec4(turned,0.0)).xyz);
    ROUGHNESS=1.0;
}
