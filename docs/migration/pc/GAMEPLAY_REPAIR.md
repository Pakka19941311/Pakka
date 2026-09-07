# Gameplay repair from owner reports — 2026-09-07

The owner rejected the prior gameplay/HUD implementation. This revision addresses the two supplied Markdown reports; a new recording was not attached to this revision. Existing world geometry and game rules remain the source; no new content phase was started.

Changes: initialize static NPC interpolation endpoints; smooth bounded camera orbit/zoom and restore the pointer after capture; render the authoritative jump continuously and suppress stale airborne samples after predicted landing; select actual attack/release clips rather than Idle_Attacking; use procedural hit/fall for Fox's missing clips; show travelling arrows, impacts, immediate non-pickable death and a short corpse; preserve class attack range when finding a free firing angle. Existing authoritative AI remains, with tests of patrol/chase/attack/leash/death.

HUD: compact lower HP/MP/XP and quickbar, separate journal, target HP/state, bounded screen labels, Tab inventory with stats and equipment, six-column scrolling bag, manual readable comparison tips, closable menus and display rollback. Minimap uses existing terrain/roads/footprints. Existing combat and forest sounds restored with volume settings; F3 shows frame/p95/process/physics/draw-call diagnostics.

Validation: focused authoritative tests plus the native fixture run in the release workflow. Native gameplay QA checks NPCs across server snapshots, real imported Ranger/Fox clips and visual effects, death/respawn, render-frame jump under 10 Hz snapshots, HUD/inventory bounds, menu lifecycle, and graphical pointer restoration. Linux/Mesa rendering and packaged Windows headless execution are separate gates. Neither is target-PC GPU/FPS acceptance. Owner tests this block before new P1 content.

Release evidence and exact build commit are recorded after the pipeline completes. No player database was used.
