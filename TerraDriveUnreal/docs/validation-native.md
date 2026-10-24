# Native terrain and vehicle detail validation

Verified October 24, 2026 at 6:09 PM America/New_York, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with its complete Windows folder.

The current executable SHA-256 is `0bdbf059543d6b837f99181207b1d0d12482a89627ca376476ac43eb7c65a51b`. This pass imports the revised vehicle meshes and uses a fresh full cook/package, `Saved/terrain-models9-build-4.log`, SHA-256 `27d466e7a71bcdce9bf497f24fd05e01b09f684ce31061f6291dc33c968a10ed`. The compiled and packaged executables match. Native data, package hashes and the source/tool/configuration fingerprints frozen through validation are recorded in [native-validation.json](native-validation.json). Earlier model/rut acceptance remains historical.

**676/676 native checks and 382/382 independent core checks pass.** Every listed report is fresh, belongs to this executable and contains only passing cases.

| Native check | Passed | Process exit |
|---|---:|---:|
| Full | 287/287 | 0 |
| Ruts | 101/101 | 0 |
| Art | 42/42 | 0 |
| Movement | 84/84 | 0 |
| Detail | 15/15 | 0 |
| Winter | 46/46 | 0 |
| Transitions | 53/53 | 0 |
| Cool | 16/16 | 0 |
| Balanced | 16/16 | 0 |
| QualitySmoke | 16/16 | 0 |

The source geometry audit passes all six vehicles. The separate Urus audit retains 1,134 fascia and 90 bonnet probes with zero painted intrusions. Source checks complement the native image review and do not establish visual quality alone.

## What changed

Grass now distinguishes green growth, dry growth and exposed root patches. Small continuously warped texture coordinates break up surviving scan motifs; fine root/soil normal detail fades at distance. Snow has more defined blue-grey hollows and two scales of meandering wind ridges, suppressed on packed floors and wet margins. A matching photographic leafy-grass triplet joins the existing MW dirt/stone layers. Project-owned ground copies explicitly retain their color space and bounded resident resolution (23 maps capped at 1K, 26 capped at 2K; smaller originals retain their native resolution). Bounded residency increases memory use; no extra texture fetches, terrain tessellation or collision ridges were added. Additional shader arithmetic is included in the monitored samples below.

All six bodies have narrow ceramic borders following their curved glazing, with open central panes and retained cabin visibility. The Urus adds recessed reflector bowls and convex projector lenses inside the existing angular light housings. Body hardpoints, original bonnet/intake openings, dimensions and vehicle dynamics remain. The glazing and optics are incremental model detail; broad body shapes and interiors retain the limitations of reference-built procedural assets.

The vehicle and world physics sources and simulation core retain their checkpoint hashes. Terrain heights and transition masks are unchanged. Real motor-drive mud and snow paths, rut depth/banks/continuity/volume, braking/reverse/lockers and the continuous twenty-gate Slate Rim route pass in the new package. The movement suite still measures seven terrain-boundary coasts, all six rounded-rise/braking trials and actual solid-object contact.

## Actual rendered review

116 distinct current PNGs were actually inspected and recorded by hash. The review covers all six vehicles from six directions, terrain close/wide views, controlled and real driven ruts, hard-ground contact, transitions, movement, Winter Expedition and presets. The root review record retains specific observations and visual limits. There is no separate manual/controller session claim.

Art, terrain-detail, winter and rut inspections use Quality at a 20 FPS cap and 1600×900 output. Full driving uses 1280×720; transitions and preset samples use 1920×1080. Movement retains its isolated wrapper settings at 1600×900. Prior saved Detail views may use a different internal rendering preset; those comparisons are visual context, not a controlled image-quality benchmark.

## GPU and preservation scope

The full capped run recorded 367 GPU observations: maximum 59°C, mean 29.0% utilization and 8.1W. Short Cool/Balanced/Quality-smoke samples peaked at 65/71/67°C. Quality smoke remains capped 20 FPS. All wrappers retain a 77°C cutoff. These samples do not prove normal 60 FPS endurance, long-session thermal stability or the cause of earlier PC crashes.

All 1,214 local browser hashes match, and publication preserves 189 browser files and 86 existing binary assets. Current player vehicle builds and the Quality 60 graphics preference are unchanged. The original `IceRoad`, `IceRoad_Lighting` and source `terrain.bin` match the fresh preservation baseline. Generated builds, acquired raw Epic/Fab assets, caches and player data remain excluded from source publication.

Remaining limits include repeated ground motifs at some distances, simplified fine coachwork/interiors/lighting optics and bounded height-field soil. Authored Winter Expedition landscape/road remains static; physical excavation applies to the proving ground including its snow. Feature details are in [terrain-models-9.md](terrain-models-9.md).
