# Native Civic and Urus contour revision 11 validation

Verified October 25, 2026 at 7:31 PM America/New_York with Unreal Engine 5.8.3, Windows Development, DX12 SM6 and the RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with its complete Windows folder.

The current executable SHA-256 is `a1157c61c74428e5f301772de2a8be2afa048b38074d6d421dd122e1bfc8a077`. The accepted full asset import/cook/package is `Saved/contours11-build-2.log`, SHA-256 `d628553c0f679db5a3f23b541b7a1098ab8f23a6939770ee7869760efb4c6755`. Compiled and packaged game bytes match. Source/tool/configuration fingerprints stayed frozen through acceptance. Package/native data, exact report hashes, source audit and visual-review observations are recorded in [native-validation.json](native-validation.json).

**684/684 native checks and 382/382 independent core checks pass.** Each report follows the current accepted cook and belongs to the current executable.

| Native check | Passed | Process exit |
|---|---:|---:|
| Full | 287/287 | 0 |
| Ruts | 101/101 | 0 |
| Art | 50/50 | 0 |
| Movement | 84/84 | 0 |
| Detail | 15/15 | 0 |
| Winter | 46/46 | 0 |
| Transitions | 53/53 | 0 |
| Cool | 16/16 | 0 |
| Balanced | 16/16 | 0 |
| QualitySmoke | 16/16 | 0 |

All six source-model geometry/glazing/wheel checks pass. The Urus retains 1,134 fascia probes and 90 bonnet probes with zero painted intrusions. The twelve additional [body contour probes](body-contour-validation.json) pass: actual Civic A-pillar edges remain within about 0.017 inch of their projected chords, the Civic bonnet/deck have physical relief, and the Urus bonnet/hatch have formed ridges and recesses. These are shape and clearance checks, not a photographic likeness score.

## Changed geometry

The Civic has straight principal A-pillar edges, converging bonnet draw lines, a crowned trunk deck and a formed rear recess. Its nose and rear corners wrap more continuously around the centre. The Urus has stronger bonnet ridges/channels, swept leading corners, a deeper bumper cheek and a folded hatch below the rear lamp shoulder. Lamps, openings, seams and trim follow their parent surfaces. The reference selection and model limitations are described in [body-contours-11.md](body-contours-11.md).

Only `civic_sport_body.obj` and `urus_performante_body.obj` change. The other 236 OBJ files, including the other four vehicle bodies and all separate wheel/tire meshes, are byte-identical. Civic source vertices rise from 308,263 to 310,942 (about 0.9%); Urus source vertices remain 789,687. This is a contour change, not a GPU optimization claim.

All terrain shaders, scene placements, Fab scenery, native/scanned details, trees, routes, loop frames, source heights and five protected non-vehicle NativeData files match the checkpoint. Mechanical vehicle specifications and vehicle/world simulation source are unchanged. Body support queries are regenerated from the two revised meshes. Fresh native support and Space-stop checks pass for all six vehicles. The held-S reverse and incline-hold fixtures, rounded-rise trials, solid-object contacts and stock Urus twenty-gate quarry route also pass.

## Actual rendered review

124 distinct current game PNGs were actually inspected and recorded by hash. Art includes 36 original vehicle directions plus eight new close views for the Civic and Urus, covering bonnet, rear closure, pillar/side glazing and overhead shape. Additional Urus directions, actual/controlled soil tracks, terrain boundaries, rocky support, movement, winter roads and presets are also reviewed. Specific observations are in the recorded root review. No separate manual/controller session is claimed.

Art, detail, winter and rut fixtures use Quality at 20 FPS and 1600×900. Full driving uses 1280×720; transitions and presets use 1920×1080. Movement retains its isolated 1600×900 wrapper settings. The before checkpoint's original Art directions use the same explicit Quality/20 FPS settings. The new close angles supplement those comparable directions.

## GPU and preservation

The full 20 FPS run recorded 391 GPU samples: maximum 58°C, mean 23.8% utilization and 8.8 W. Short Cool/Balanced/Quality-smoke peaks were 59/63/61°C. Quality smoke remains capped at 20 FPS; all wrappers retain the 77°C cutoff. These samples do not establish normal 60 FPS endurance, long-session thermal stability or a cause for previous PC reboots.

All 1,214 local browser hashes match. All 189 published browser files and 86 existing binary assets are preserved. Current garage builds and the Quality at 60 FPS preference match this round's fresh baseline; no older player saves were restored. Original IceRoad/IceRoad_Lighting and source terrain.bin are unchanged. Generated builds, raw acquired Epic/Fab packs, reference photographs, caches and player/app data remain local.

The models remain procedural reconstructions with approximate fine body surfacing, fascia details and interiors. Some ground repetition and simplified scenery remain. Physical soil is a bounded height field in the proving ground; Winter Expedition's authored landscape/road stays static.
