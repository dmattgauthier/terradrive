# Rock visibility and GPU load

The quarry importer previously forced the eight African Slate Quarry materials to one-sided rendering. These scanned formations include open backs and undersides, so looking toward the back of a triangle could remove it entirely. The project-owned rock materials now remain opaque and render both sides. An editor-only Geometry Script repair closes open boundaries on the eleven non-ice rock copies and checks the target assets' source geometry. Original scan faces retain their texture/material assignments; newly closed faces receive world-mapped stone and recalculated normals. The original Epic pack assets, ice shading, grass masks and vehicle glass are preserved.

## Graphics controls

Open **Tab → 03 Graphics** in the native garage. Changes apply immediately and persist in `TerraDrive/Saved/graphics-settings.json`, separately from vehicle upgrades.

| Preset | Driving cap | Internal render scale | Lighting and shadows |
|---|---:|---:|---|
| Cool — new default | 30 FPS | 75% | Screen-space GI/reflections off, 1024 shadow maps, two cascades, shorter shadow distance |
| Balanced | 45 FPS | 85% | Screen-space GI off, simple reflections, 1536 shadow maps, three cascades |
| Quality | 60 FPS | 100% | Screen-space GI/reflections on, 2048 shadow maps, three cascades |

Every preset limits garage previews to 20 FPS and the unfocused game to 15 FPS. Startup is capped at 30 FPS before settings load. TSR reconstructs the selected internal resolution to the window resolution; UI stays at output resolution. See Epic's [scalability reference](https://dev.epicgames.com/documentation/unreal-engine/scalability-reference-for-unreal-engine) for the rendering controls.

The acquired MW grass clumps no longer cast shadows and stop drawing at 262 feet rather than 1,181 feet. Solid rock formations keep their existing draw/collision distances. Texture detail, terrain deformation, crushed grass and physical obstacles remain available in all presets. No driver clocks, voltage, power limits or cooling controls are changed.

## Repeatable checks

Build with `Tools/build-native.ps1 -ImportAssets -Package -SkipExport` after this material/configuration change. A full cook is required.

`Tools/verify-render.ps1 -Mode Rocks` checks the eleven non-ice acquired rock groups' actual cooked material flags and captures four directions around each group. It also checks independent graphics save/load, resolution settings and cap bounds, then captures the graphics menu. It uses a 20 FPS test limit.

`Tools/verify-render.ps1 -Mode Cool` and `-Mode Balanced` run the same stationary quarry overlook at 1920×1080. They warm up for ten seconds, sample real wall-clock frame rate for approximately 25 seconds, and record NVIDIA GPU utilization, board power and temperature when `nvidia-smi` is available. They do not run an unlimited-frame benchmark. Both wrappers stop at a conservative 77°C GPU cutoff by default. The full native verifier now also caps at 20 FPS and records GPU telemetry with that cutoff.

Reports, logs and telemetry are under `Saved/Validation`. Validation uses independent garage/graphics files. It does not rewrite the player's vehicle builds or graphics preference.

`-Mode QualitySmoke` renders the Quality preset at a separate 20 FPS test cap to check its full-resolution lighting/shaders without a 60 FPS stress run. The inspection cameras are raised above the actual hillside at each angle. `Saved/rock-closure-report.json` records source-LOD closure/readback checks. Geometry Scripting is enabled only for the editor; the packaged game uses the repaired static meshes.

Lower rendering demand does not establish the cause of a PC reboot or guarantee a particular temperature. The Windows event log recorded unexpected reboots on October 20 and 22; those entries did not identify a thermal, driver or hardware cause. Short rendering checks do not establish long-session stability.

## Recorded preset samples — October 23, 2026

The table below records the rock/GPU update in commit `8c851a6`, before the subsequent terrain transition material. Current package measurements and focused transition checks are recorded in [native-validation.json](native-validation.json) and [validation-native.md](validation-native.md).

That package was sampled on the RTX 4060 Laptop GPU at the same 1920×1080 quarry overlook. Each sample window lasted approximately 25 seconds after ten seconds of warmup, with 23 NVIDIA telemetry observations.

| Preset | Measured FPS | Average GPU utilization | Average GPU board power | Maximum sample temperature |
|---|---:|---:|---:|---:|
| Cool | 29.99 | 37.4% | 19.2 W | 59°C |
| Balanced | 44.98 | 50.3% | 25.4 W | 62°C |

Cool reached 60°C during its complete run including startup; Balanced's complete-run maximum was 62°C. Neither reached the 77°C cutoff. These are short, stationary scene samples, not whole-map averages or a controlled comparison to the user's earlier screenshot. The Quality shader check used a separate 20 FPS cap and is not a measurement of normal 60 FPS Quality performance. The original evidence is retained in commit `8c851a6` and locally in `Saved/gpu-rocks-final-evidence.json`.
