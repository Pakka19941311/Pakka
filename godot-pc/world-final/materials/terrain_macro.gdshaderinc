// Continuous world-space de-tiling. No chunk-local UV or repeating cell border.
vec2 macro_rotate(vec2 p) { return mat2(vec2(.798636, .601815), vec2(-.601815, .798636)) * p; }
vec3 macro_surface(sampler2D map, vec2 uv, float blend) {
    vec3 a=texture(map,uv).rgb;
    vec3 b=texture(map,macro_rotate(uv)*.713+vec2(17.37,-9.21)).rgb;
    return mix(a,b,mix(.24,.76,blend));
}
vec3 macro_normal(sampler2D map, vec2 uv, float blend) {
    vec3 a=texture(map,uv).rgb*2.0-1.0;
    vec3 b=texture(map,macro_rotate(uv)*.713+vec2(17.37,-9.21)).rgb*2.0-1.0;
    // Bring the second sample's tangent slope back from its rotated UV basis.
    b.xy=mat2(vec2(.798636,-.601815),vec2(.601815,.798636))*b.xy;
    return normalize(mix(a,b,mix(.24,.76,blend)))*.5+.5;
}
