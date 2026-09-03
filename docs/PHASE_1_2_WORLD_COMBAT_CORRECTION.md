# Phase 1.2 — World, Population & Combat Readability Correction

## Objective
Turn the current prototype-like test scene into a readable MMORPG vertical slice before deeper content expansion. The acceptance bar is user-visible behavior, not merely passing code tests.

## Non-negotiable acceptance criteria
1. **No giant red/orange geometry** may appear from targeting, hit confirmation or imported helper meshes. Target feedback must remain readable through the target HUD/nameplate and restrained contact effects.
2. **Greenfall must read as a settlement at first glance**: southern gate, enclosing walls, watch towers, visible keep/castle focus, tavern, market/storehouse, forge, roads and civic square. Broken black roof/cube placeholders are not acceptable inside the authored settlement.
3. **Daylight readability** is mandatory for this slice. Terrain, roads, characters and architecture must be readable without crushing blacks.
4. **Monster ecology must be spatially authored**: same-species camps, camps separated across the field, ordinary mobs patrol around their own camp while idle, bosses remain authored encounters.
5. **Residents must move on safe routes** rather than vibrating against props. Route points must be collision-safe and movement must recover from a blocked waypoint.
6. **NPC staging must communicate role**: Bran faces an anvil and repeatedly performs a smithing strike beside a forge/brazier; elder, merchant and guide are placed at role-appropriate landmarks.
7. **Ranger and Mage must not feel like the same ranged class**: Ranger owns the longest physical basic range; Mage uses a shorter, weaker magical basic projectile and relies on spell throughput for power.
8. **Chain Lightning must actually chain**: primary target plus nearby hops, each hop originates from the previous victim, each subsequent hit is weaker, and a dense group can receive up to five total links.

## Follow-up / v0.5
Do not confuse this correction with final art. v0.5 still owns production-grade environment assets, animation retargeting, navigation mesh/pathfinding and deeper AI states.
