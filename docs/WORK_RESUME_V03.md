# Work resume — v0.3 stabilization

## Source of truth
- Repository: `Pakka19941311/Pakka`
- Branch: `main`
- Last Work playable-core commit: `77dcb8146e84eac434503c67e95e0edc5a429e70`
- After that commit the user performed a real Windows/browser test.
- Gameplay code was not changed after the Work v0.3 checkpoint.

## Runtime fixes already made after Work stopped
Do not revert these changes:
- Windows launcher hardened (`RUN_WINDOWS.bat`, `setup-and-run.ps1`).
- Portable Node/PATH handling fixed for npm/esbuild lifecycle scripts.
- Fragile custom PowerShell HTTP serving path replaced by Vite preview.
- Missing world-model texture restored at `public/assets/models/world/Textures/colormap.png` after a real browser load failure exposed the missing GLB dependency.

The user has now reached the actual game scene in a Windows browser and visually confirmed that the game runs.

## Current task — only close v0.3
Do **not** start the v0.4 redesign yet. Camera, graphics, UI, equipment visuals, skills, stats and other redesign work will be specified separately.

Finish v0.3 as a stable checkpoint:
1. Pull/read current `main` before changing anything.
2. Run typecheck, production build and existing tests.
3. Verify all game assets and, importantly, external URIs referenced from GLB/glTF files (textures/buffers), not just the model files themselves.
4. Run the strongest available real browser/runtime check. If GPU/browser visual validation is unavailable, state that limitation explicitly instead of claiming it passed.
5. Fix only launch/build/runtime/asset-loading/blocking gameplay defects found during this pass.
6. Produce a complete Windows user build that launches without requiring the user to manually install Node/npm/dependencies.
7. Update the v0.3 QA report to distinguish automated/headless checks from actual Windows visual validation.

## Plus-plan efficiency rules
- Commit each completed block to `Pakka/main`; do not keep a long uncommitted session.
- Target a checkpoint about every 15–20 minutes.
- If the Work limit is approaching, stop starting new work, verify the current state and commit it first.
- After stable v0.3 is completed, stop. Wait for the separate v0.4 specification.
