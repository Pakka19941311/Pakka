# Local polish queue

The following user-visible fixes are deliberately handled outside Work so Work time is reserved for structural changes:

- character locomotion smoothing;
- third-person camera response smoothing;
- launcher isolation from global npm workspace settings;
- less synchronized ambient NPC behaviour;
- reduced collision snagging around static props;
- giant emissive target/impact glow suppressed at bootstrap; target marker reduced to a restrained thin indicator.

## Next local-test focus
- camera/movement feel after softer response;
- whether collision still snags at dense prop corners;
- whether ambient residents feel less synchronized;
- verify combat no longer produces the large orange/red impact blob.

## Reserved for Work / v0.5
See `WORK_V05_QUALITY_VERTICAL_SLICE.md` for monster lifecycle, AI/navigation, combat timing, animation pipeline and art-quality rebuild.
