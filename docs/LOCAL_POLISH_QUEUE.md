# Local polish queue

The following user-visible fixes are deliberately handled outside Work so Work time is reserved for structural changes:

- character locomotion smoothing;
- third-person camera response smoothing;
- launcher isolation from global npm workspace settings;
- less synchronized ambient NPC behaviour;
- reduced collision snagging around static props.

## Still requires a main.ts touch before next user test
- remove giant emissive red target/impact glow;
- replace it with a restrained thin ground marker/outline;
- avoid duplicate impact effect on the same hit.

## Reserved for Work / v0.5
See `WORK_V05_QUALITY_VERTICAL_SLICE.md` for monster lifecycle, AI/navigation, combat timing, animation pipeline and art-quality rebuild.
