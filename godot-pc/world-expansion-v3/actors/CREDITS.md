# Credits for VARENDOR v3 isolated model adaptations

## MOB-02 — Animated Wolf
Original model and animation: CoinCoin.
Source: https://opengameart.org/content/animated-wolf
License: Creative Commons Attribution 4.0 International (CC BY 4.0).
License text: https://creativecommons.org/licenses/by/4.0/legalcode.en
Changes for this adaptation: FBX-to-GLB conversion; six explicit animation names; selected source clips; walk is a slower timing derivative of run, not a new source gait; metric scale, floor origin and forward axis adjusted. Original source texture retained. Original author does not endorse this adaptation.

## MOB-03 — Evil Giant Rat
Original contributors: CDmir / Cestmir Dammer and TinyWorlds.
Source: https://opengameart.org/content/evil-giant-rat
License: CC0 1.0 Universal.
License text: https://creativecommons.org/publicdomain/zero/1.0/legalcode.en
Changes: removed scene helpers and malformed separate hair card; rebuilt legacy materials using original diffuse textures; reduced used diffuse textures from 1024 to 512 pixels; selected and renamed six existing clips; adjusted scale, floor origin and forward axis.

## MOB-05 alternate candidate — Shell Bug
Original author: br-n518.
Source: https://opengameart.org/content/shell-bug
License: CC0 1.0 Universal.
License text: https://creativecommons.org/publicdomain/zero/1.0/legalcode.en
Changes: converted legacy material using supplied bug_diffuse.png; selected and renamed six existing clips; converted to GLB; adjusted scale, floor origin and forward axis. The archive also supplies a normal texture; it is not connected in this minimal material adaptation. This model explicitly replaces the rejected Beetle Golem source candidate, without changing an existing game scene.

## P2 starter Slime — Quaternius
Reused existing godot-pc/generated/actors/Slime.glb from Animated Monster Pack.
Source: https://quaternius.com/packs/animatedmonster.html
License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/
Existing project credit: public/assets/licenses/Quaternius_Animated_Monster_Pack_CC0.txt
Changes: selected and renamed four existing actions; run derived from walk timing; authored local Body-bone squash recoil; compact GLB export; metric floor origin and forward axis; baked local floor correction. No new source hit clip is claimed.

## P2 starter Boar — Teh_Bucket
Source: https://opengameart.org/content/boar
License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/
Changes: applied source Mirror modifier; converted original diffuse material; reduced diffuse to 512 pixels; retained source attack/walk; run is a timing variant of walk; authored breath, spine/head recoil and ROOT-bone roll/death; metric scale, floor origin and baked floor correction.

## Additional P2 changes to Wolf, Rat and Shell Bug
Wolf attack is now the documented frame 18–43 window from source ATK2 at the imported 24 fps, not the long ATK1 of the earlier intake preview. This retains the source bite poses without speeding the entire 2.667-second attack up threefold. All five P2 actors have 60 Hz baked upward floor corrections and per-clip millimetre clearance guards where needed. Bone display helper geometry was excluded from normalization. Existing source authors and licenses above remain applicable. These are visual candidates, not endorsed or final production art.

## Canonical MOB-04 — adapted unarmoured Boar (2026-09-12)

Canonical MOB-04 uses `alternatives/boar/V3BoarCandidate.glb`, from Danimal's Boar Enemies; original boar by Myname, with requested credit to Clint Bellanger. Source: https://opengameart.org/content/boar-enemies. License: CC BY-SA 4.0. Rider and armour removed; mane, hooves, ears and local rig adaptations are documented in the standalone release folder `art/boar-cc-by-sa-4.0/CREDITS.md`, alongside the adapted GLB, texture and full legal text. The earlier Teh_Bucket model above remains historical attribution, not the current P2 actor.

## Canonical MOB-05 — six-legged Roach (2026-09-12)

Canonical MOB-05 uses `alternatives/roach-six/V3RoachSixLeg.glb`, original model by Atmostatic, rig/animation/textures by Danimal. Source: https://opengameart.org/content/roach-game-ready-and-animated. License: CC BY-SA 3.0. The added articulated middle legs, mandibles and animation changes are documented in the standalone release folder `art/roach-six-cc-by-sa-3.0/CREDITS.md`, alongside the adapted GLB, textures and full legal text. The Shell Bug and four-legged Roach remain historical prototypes in the checkout and are excluded from the current release.

Releases select these two active adaptations from `docs/world-expansion-v3/P2_STANDALONE_ART_PACKS.json` using canonical `profiles.json`. Their art and licenses remain accessible outside the PCK without additional restrictions. This artwork requirement does not relicense independent game code. No endorsement by the original artists is implied.
