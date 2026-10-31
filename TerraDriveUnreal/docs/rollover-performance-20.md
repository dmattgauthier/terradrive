# Rollover performance — adaptive terrain collision

The native game now separates fine terrain appearance and soil/tire samples from the triangle count used for body collisions. Side and roof contacts previously put twelve detailed body hulls against thousands of tiny terrain triangles, repeatedly generating expensive collision manifolds. That cost could amplify as slow frames requested up to twelve physics substeps.

## What changed

`UTerraSoilMeshComponent` retains the complete **2.46-inch** terrain grid for rendering and soil/tire height data. Its collision provider uses larger triangles in regions that are nearly planar, and refines around curved ruts, bumps and drifts. The maximum conservative vertical difference from the original fine triangular surface is **0.197 inch**. Every original boundary vertex remains on each leaf and tile edge, so different resolutions meet without cracks or T-junctions. The finest leaves retain the original diagonals.

The bound is geometric, rather than a few sampled comparisons: all source vertices in a leaf lie within half the allowed error of one fitted plane. Both the original fine triangles and replacement triangles therefore stay within that half-error of the same plane everywhere; their mutual difference cannot exceed the full bound. New deformation refines the topology synchronously before an older coarse representation can exceed the budget. Refinement is monotonic while a tile remains active. Existing topology refits in place with the stock vertex count and ordering; packing/color-only edits avoid unnecessary collision uploads.

The installed UE 5.8 collision geometry is checked through `UBodySetup::TriMeshGeometries`, rather than counting only requested triangles. The final benchmark reports roughly **12,160–19,296 collision triangles** across active tiles whose visible meshes still contain **65,536 triangles**. The exact values and height bounds are below.

The game also uses Chaos's closest-feature-first convex/triangle contact generator, `p.Chaos.Collision.ConvexTriMeshMode=2`, and restores Unreal's standard **60 Hz body-physics schedule with six substeps maximum**. The old 120 Hz/twelve-step schedule and the new schedule cover the same maximum **0.1-second** interval. Tire integration, vehicle hulls, mass/center of mass, suspension, CCD, solver iterations and graphics settings are retained. The schedule is applied in memory for code-only stages over older cooked defaults; player configuration is not overwritten.

## Diagnosis and rejected fixes

A slow diagnostic reproduced EarthCruiser side **3.75 FPS** and roof **3.26 FPS**. Its six-second roof region contained **240 physics advances in 20 frames**: twelve per frame. Collision generation took about **3.23 CPU seconds**, constraint solving **1.10 seconds**, and the body's own soil-contact logic **0.029 seconds**. The dominant work was physical collision processing.

Terrain update caching and exact smaller collision patches did not solve the issue and were reverted. A contact-generator-only candidate retained **eight** real-time frame-budget failures despite passing all **465 original physical assertions**. A second candidate with the standard 60 Hz/six-step budget also retained **eight** failures, including the EarthCruiser. Both were rejected. The final correction reduces the terrain triangles themselves while maintaining the stated accuracy, in addition to the retained scheduling/contact changes.

The trigger was intermittent: short old-path controls could also run near the cap. Earlier 3-FPS and successful diagnostic profiles used different experimental executable versions; they are not an exact same-executable sixfold comparison. No universal multiplier is claimed. The table below compares the same complete 58-pose matrix before and after adaptive collision, both at 1600×900, graphics preset 0, real time, 20 FPS requested cap, mode-2 contacts and 60 Hz/six-step physics. Executables differ by the correction. All 465 physical assertions pass in both runs; frame-budget failures fall from **8 to 0**.

| Vehicle | Dirt roll | Before, dense collision FPS | After, adaptive collision FPS |
| --- | ---: | ---: | ---: |
| Urus Performante | 180.0° | 9.79 | 19.99 |
| EarthCruiser EXP | -90.0° | 6.42 | 18.87 |
| EarthCruiser EXP | 90.0° | 7.53 | 19.88 |
| EarthCruiser EXP | 180.0° | 8.32 | 19.63 |
| G 580 EV | -90.0° | 8.44 | 19.99 |
| AMG G 63 | 90.0° | 8.04 | 20.00 |
| Sprinter 2500 | -110.0° | 6.81 | 19.68 |
| Sprinter 2500 | 110.0° | 7.24 | 20.02 |

## Final real-time benchmark

The longer benchmark loads a read-only copy of the player's saved upgraded EarthCruiser, settles each pose freely for four seconds and measures six seconds of actual wall-clock frame intervals. There are no pose constraints, fixed simulation clocks, replacement flat ground or disabled body collisions. It renders offscreen at 1280×720, graphics preset 0, capped at 20 FPS. The three locations are ordinary dirt, a rocky area and the constructed park, rather than three soft-soil materials.

| Zone | Requested roll | Average FPS | 95th-percentile frame | Live collision / visible soil triangles | Maximum conservative height error |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 | 0° | 19.99 | 50.6 ms | 12,160/65,536 | 0.1950 in |
| 0 | 90° | 19.91 | 51.3 ms | 16,672/65,536 | 0.1952 in |
| 0 | 180° | 19.64 | 55.4 ms | 18,752/65,536 | 0.1962 in |
| 2 | 0° | 20.00 | 50.4 ms | 19,296/65,536 | 0.1960 in |
| 2 | 90° | 20.00 | 50.5 ms | 19,296/65,536 | 0.1960 in |
| 2 | 180° | 19.98 | 50.4 ms | 19,296/65,536 | 0.1960 in |
| 6 | 0° | 19.99 | 50.6 ms | 19,296/65,536 | 0.1960 in |
| 6 | 90° | 19.99 | 50.8 ms | 19,296/65,536 | 0.1960 in |
| 6 | 180° | 20.00 | 50.6 ms | 19,296/65,536 | 0.1960 in |

All **46** benchmark checks pass, including six checks of actual installed triangle counts and collision height bounds. The complete rollover regression passes **523 checks** across **58 poses on all nine vehicles**, on deformable dirt and tarmac. Its measured pose windows average **18.87–20.02 FPS**. The original clearance, body hull, mass/center-of-mass, finite motion, overturned power-disable and recovery criteria are unchanged.

Run the full rollover check, or the focused stock EarthCruiser check, from the Unreal project directory:

```powershell
.\Tools\verify-rollover.ps1 -MeasurePerformance -Name rollover-performance
.\Tools\verify-rollover.ps1 -Quick -QuickVehicle 6 -MeasurePerformance -Name earthcruiser-rollover
.\Tools\test-soil-collision.cmd
```

The new portable collider test passes **136 checks**: exact area and winding, paired interior edges and original boundary segments, sixteen curved/rut/noise fields with actual interpolated samples, local refinement, stable topology and saddle diagonals. The finest collision detail remains available where the error budget requires it.

Validation-only `-TerraLegacyDenseSoilCollision`, `-TerraLegacyRolloverSteps` and `-TerraLegacyRolloverContacts`, together with `-TerraValidate`, expose the dense terrain, 120 Hz schedule and older contact generator respectively. Ordinary play always uses adaptive collision, 60 Hz/six steps and mode 2. `-TerraRolloverPerformanceOnly` runs the longer benchmark; `-TerraPerfBuild="PATH_TO_COPIED_GARAGE_JSON"` supplies a read-only garage profile. Use isolated `TerraGarage`, `TerraGraphics`, `TerraControls`, `UserDir` and report paths.

## Accepted evidence and limits

The final executable passes **1,962 native checks** and **136 new portable checks**. **345 fresh captures were actually reviewed**. Every accepted native process exits 0 and uses no trace capture. [validation-native.md](validation-native.md) and [native-validation.json](native-validation.json) identify hashes, clock choices, rejected candidates, actual image review and preservation.

Trace-enabled diagnostics, including the previous executable, exited 777003 during shutdown after normal engine teardown; their counts are excluded. A preliminary final-executable focused run also has a stale previous cook-receipt binding because it overlapped freeze completion; its unchanged receipt is excluded. The later complete rollover run and benchmark bind the final source and cook correctly.

These are controlled offscreen, 20-FPS-capped tests. They establish the recorded rollover behavior, rather than uncapped throughput, a manual/controller session or long-session PC-crash stability. The highest sampled accepted GPU temperature is **70°C**, below the 77°C cutoff. The previous real-time quarry profile around 3.33 FPS was not repeated; fixed-clock Full does not measure that throughput. The source update reuses the accepted full asset cook; fine visible meshes, vehicle models, acquired assets, browser source and current player settings are preserved.
