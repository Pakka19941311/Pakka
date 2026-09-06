# Medieval Castle Asset Pack — ChuckCG

- Author: ChuckCG.
- Public source: https://chuckcg.gumroad.com/l/sfehn
- Edition: free version, obtained by the project owner on 2026-09-06.
- Source file: `castle_pack.blend`, 176,487,810 bytes.
- Source SHA-256: `a1d0bb60837ebfeeeb0f9b8da899c0ba3610d743b41e0913d5cf0dd3f8bce55e`.

## Author terms

This is a custom author permission, **not CC0**. The source page states:

> Feel free to use it in your commercial projects.

> Do not permit use for machine learning, including generative AI models.

Those terms are retained for the castle assets. They do not apply to independently licensed Poly Haven assets. The original standalone castle pack and private delivery page are not published in this repository.

## Prepared game derivatives

| Game module | Source mesh |
|---|---|
| castle_arch | castle_element_07 |
| castle_wall | castle_element_03 |
| castle_tower | castle_element_04 |
| castle_keep | castle_element_09 |
| castle_spire | castle_element_10 |
| castle_turret | castle_element_11 |

Changes: normalized origins and floor height, reoriented arch, shared 1024-pixel color/normal/roughness maps from packed source textures, GLB conversion, simplified distant geometry for the three larger closed modules. The arch retains its original geometry at both distances. Its collision profile is measured from the prepared mesh.

Toolchain: Python 3.11 and Blender `bpy` 4.5.13; reproducible preparation in `scripts/prepare-castle-assets.py`. Embedded source scripts are disabled. Outputs and checksums are listed in `assets/world/castle_pack/prepared-castle.json`.
