# Inactive cohort 06–10: reproducible source adaptation

Use Blender 4.2.3, factory startup, and `--disable-autoexec`. No generator downloads assets, edits live profiles, or launches Godot. Scripts read the private intake and write only explicitly supplied output/report folders.

Required cache layout:

- `cohort-06-10/MOB-06/spider.blend` and `spider.png` from the Spider page and exact attachment URLs in its candidate metadata.
- `cohort-06-10/MOB-07/extracted/Defender.blend` from `Defender.zip`.
- `cohort-06-10/MOB-08/extracted/cat_2-80.blend` from `cat.zip`; `MOB-08/cat_free.png` is the separate author texture.
- Existing pinned city cache: `A03/extracted`, `city-p2/suits02/extracted`, `city-p2/mpfb/extracted/mpfb2-master/src`. Archive hashes, URLs and the MPFB commit are in `../city/sources.json`. Verify them before generating, using `../city/verify_sources.py --intake <root>`.

Source archives and their file lists are recorded in `docs/world-expansion-v3/cohort-06-10-evidence/SOURCE_ARCHIVES.json`; per-model manifests add texture hashes and detailed extracted-source SHA. Extraction must reject paths outside the chosen cache directory. The raw archive cache is not part of the game distribution.

Example PowerShell, from the repository root; set these three local paths first:

```powershell
$cohortBlender = 'C:/path/to/blender.exe'
$cohortIntake = 'C:/path/to/asset-intake-v3'
$cohortRepo = (Get-Location).Path
foreach ($cohortMob in @('MOB-06', 'MOB-07', 'MOB-08')) {
  & $cohortBlender --background --factory-startup --disable-autoexec --python scripts/assets/cohort-06-10/prepare_source_candidates.py -- --intake "$cohortIntake/cohort-06-10" --output "$cohortIntake/cohort-06-10/repro/$cohortMob" --reports "$cohortIntake/cohort-06-10/repro/$cohortMob" --mob $cohortMob --skip-render
  if ($LASTEXITCODE -ne 0) { throw "Failed: $cohortMob" }
}
foreach ($cohortMob in @('MOB-09', 'MOB-10')) {
  & $cohortBlender --background --factory-startup --disable-autoexec --python scripts/assets/cohort-06-10/prepare_humanoid_candidates.py -- --repo $cohortRepo --intake $cohortIntake --output "$cohortIntake/cohort-06-10/repro/$cohortMob" --reports "$cohortIntake/cohort-06-10/repro/$cohortMob" --mob $cohortMob --skip-render
  if ($LASTEXITCODE -ne 0) { throw "Failed: $cohortMob" }
}
```

Omit `--skip-render` for the review images. Each export also saves an editable Blender scene. `prepare_humanoid_candidates.py` imports the committed authored motion functions in `../city/prepare_npc_motion.py`; that dependency is intentional and must remain available.

Audit a folder of generated GLBs:

```powershell
& $cohortBlender --background --factory-startup --disable-autoexec --python scripts/assets/cohort-06-10/audit_candidates.py -- --models "$cohortIntake/cohort-06-10/repro" --output "$cohortIntake/cohort-06-10/repro-audit"
```

`audit_candidates.py` reimports the exported files and samples actual mesh deformation, including source defects. It excludes Blender's generated bone-display meshes. It does not impose a false success threshold on floor/loop defects, and explicitly records `godot_import_tested: false` and `runtime_accepted: false`.

`stage_metadata.py` is the controlled packaging step for this checkpoint. It expects the canonical candidate reports, final `export-audit-02`, complete upstream license HTML, source metadata and the completed `repro` folder. It checks the three pinned city archives, copies credits/evidence, compares fresh GLB hashes with the candidate hashes and fails on mismatch. It writes only this cohort's directories. Do not run it against partial or newly changed candidates without reviewing the resulting reports and updating the written findings.
