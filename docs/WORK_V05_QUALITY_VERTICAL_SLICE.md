# v0.5 — Core Quality Vertical Slice

## Goal
Stop horizontal feature growth. Turn one small playable slice into a convincing dark-fantasy MMORPG-quality reference before scaling content.

## Scope
Greenfall → short field route → 3 distinct monster archetypes → 1 mini-boss.

## Mandatory systems
1. **Monster lifecycle**
   - replace fragile hide/reset respawn with explicit Spawn → Alive → Death → Corpse → Despawn → Fresh Respawn lifecycle;
   - no broken skeleton/material/scale/animation state after respawn;
   - centralized reset contract if pooling is used.

2. **Monster AI / navigation**
   - states: Idle, Patrol, Suspicious, Aggro, Chase, Attack, HitReaction, Leash, Return, Dead;
   - NavMesh/pathfinding or equivalent navigation layer;
   - local obstacle avoidance;
   - collision remains last safety layer, not navigation;
   - three archetypes must actually behave differently.

3. **Combat presentation**
   - attack phases: wind-up → hit frame → recovery;
   - damage applies on real hit/contact timing;
   - melee, ranged and magic presentation separated;
   - hit reactions and restrained impact FX;
   - no giant emissive red target/impact blobs;
   - selected target uses subtle ground ring/outline only.

4. **Animation/character feel**
   - locomotion blend, acceleration/deceleration, smooth facing;
   - no hard clip switching where blending is possible;
   - equipped weapon visuals must eventually follow real equipment state; do not fake permanent weapon meshes.

5. **Art vertical slice**
   - current low-poly placeholder look is not the quality target;
   - rebuild only this slice first: ground, foliage, buildings, props, lighting, materials, monsters;
   - coherent dark-fantasy art direction;
   - no mass content expansion until this slice is approved by user.

6. **Greenfall composition**
   - readable gate/main path/central hub/trade/smith/exit hierarchy;
   - town must read as a place, not scattered props;
   - ambient NPCs should hide algorithmic repetition with varied pauses/activities/facing.

7. **Performance / architecture**
   - keep Babylon.js + TypeScript;
   - avoid unnecessary engine rewrite;
   - separate gameplay state from presentation where practical;
   - preserve server-ready command boundary, but do not build multiplayer in this phase;
   - measure frame time / draw calls / active entities in the vertical slice.

## Do not spend time on
- full skill tree;
- 60+ skills;
- new regions;
- 100 monsters;
- crafting;
- full MMO backend;
- mass quests;
- full inventory redesign unless required for the slice;
- rewriting docs already covered elsewhere.

## Acceptance gate
Do not scale content until user approves all of these in real Windows gameplay:
- movement/camera feels smooth, not prototype-like;
- clicking/attacking is reliable;
- attacks visually connect with targets;
- no broken respawns;
- mobs navigate around world geometry;
- three enemy types feel behaviorally different;
- art no longer reads as generic low-poly debug scene;
- Greenfall is visually readable as a settlement;
- stable runtime on the user's target PC.

## Work discipline
Use current `Pakka/main` only. Preserve existing user-tested fixes. Commit finished logical blocks. If the Work limit is close, stop starting new blocks and save current working state first.
