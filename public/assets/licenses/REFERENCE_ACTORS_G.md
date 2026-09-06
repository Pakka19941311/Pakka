# Varendor G / B02 — reference actor sources and modifications

This notice accompanies `models/reference/Knight_Reference.gltf` and
`models/reference/Grey_Wolf_Reference.gltf`. Both are derivatives of the source
assets already bundled with Varendor. The original assets and their notices
remain in the distribution. The reference models do not contain R2 Online assets.

## Knight_Reference.gltf

Source: `models/characters/Warrior.gltf`, **RPG Character Pack by Quaternius**.

- Original creator: **Quaternius**.
- Original pack: <https://quaternius.com/packs/rpgcharacters.html>.
- Original license: **CC0 1.0 Universal — Public Domain Dedication**,
  <https://creativecommons.org/publicdomain/zero/1.0/>.
- Bundled original notice: [Quaternius_RPG_Character_Pack_CC0.txt](Quaternius_RPG_Character_Pack_CC0.txt).

Varendor reference modifications: longer legs and a smaller head; coordinated
changes to mesh positions, joint rest positions, inverse bind matrices and
translation keys; adjusted normals; separate steel, sword, leather/cloth and skin
PBR assignments. The original embedded texture pixels, skin weights, joint and
clip identities, rotation/scale keys, and all 13 source animation clips are
retained. These changes do not transfer authorship of the source art to Varendor.

## Grey_Wolf_Reference.gltf

Source: `models/monsters-glb/Fox.glb`, **Fox** from the Khronos glTF Sample Assets
collection: <https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox>.

The bundled source notice distinguishes these contributions:

| Contribution | Credited author | Source notice and license |
| --- | --- | --- |
| Model | **PixelMannen** | © 2014, Public; **CC0 1.0 Universal**, <https://creativecommons.org/publicdomain/zero/1.0/legalcode> |
| Rigging and animation | **tomkranis** | © 2014, tomkranis; **CC BY 4.0 International**, <https://creativecommons.org/licenses/by/4.0/legalcode> |
| Conversion to glTF | **@AsoboStudio and @scurest** | © 2017, @AsoboStudio and @scurest; **CC BY 4.0 International**, <https://creativecommons.org/licenses/by/4.0/legalcode> |

Source links retained from the embedded Fox copyright notice:

- PixelMannen model: <https://opengameart.org/content/fox-and-shiba>.
- tomkranis animation: <https://sketchfab.com/3d-models/low-poly-fox-by-pixelmannen-animated-371dea88d7e04a76af5763f2a36866bc>.
- AsoboStudio/scurest conversion: <https://github.com/KhronosGroup/glTF-Sample-Models/pull/150#issuecomment-406300118>.

The unmodified upstream notice is bundled at
[models/monsters-glb/licenses/Fox_README.md](../models/monsters-glb/licenses/Fox_README.md).
The derivative also preserves the source glTF `asset.copyright` string verbatim.
Its retained rigging, animation and conversion contributions remain attributed
under CC BY 4.0; the combined Fox derivative is not represented as an entirely
CC0 asset.

Varendor reference modifications: broader chest, shorter ears, a shorter and
less bulky tail; coordinated vertex/joint/bind/translation-key adjustments;
smoothed normals and a nonmetallic rough coat material. The original texture
pixels are embedded unchanged; a runtime material shader converts the sampled
texture colour to a grey coat while retaining its eye, nose and muzzle detail.
This replaces the earlier coarse vertex-colour coat. The source topology, skin
weights, UVs and **Survey, Walk, Run** clips are retained. No raster fur texture
was created or edited. No endorsement by the original authors is implied.

## Modification record

The modifications above were made for the **Varendor / Pakka project, G / B02**.
The reproducible authoring code is `scripts/author-reference-actors.py` in the
project repository; `models/reference/reference-actors.json` records the derivative
filenames and measured geometry. Logical model names remain `Warrior` and `Fox`
for compatibility with the existing game. All original attribution and license
notices are preserved; this document records the derivative changes and does not
replace or waive the source licenses.
