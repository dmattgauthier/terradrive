# Performance review: terrain work and repair stalls

The review found avoidable CPU and memory work in the runtime terrain pipeline. This PR removes it without changing graphics presets, acquired assets, tire/soil resolution, vehicle shapes or the existing one-fifth-inch collision error limit. Development now uses a feature branch and an open PR for Code Review; main is left unchanged until the owner requests merging.

## Fixed causes

**Terrain repair rebuilt the entire world.** ResetSoil recreated all 676 coarse chunks, including untouched ground, and launched redundant collision cooks. It now restores only the chunks whose coarse faces were cut out for fine soil, including pending retired tiles. Plants, marks, active deformation and cached deformation still reset. A native check confirms visible coverage and vehicle support after repair.

**The physics cook received unused vertices.** Adaptive collision triangles used a subset of the fine grid but the complete vertex payload was still copied, cleaned, cooked and uploaded. The cook now includes only referenced vertices and stores an explicit mapping back to fine nodes for subsequent height uploads. The vertex remapping preserves every supplied triangle's positions and winding exactly. The complete fine render/tire grid and conservative height bound remain in use. Native raycasts test the installed collision surface, including nodes omitted by the adaptive mesh.

**Adaptive leaves retained unnecessary internal edge samples.** Each internal leaf edge previously kept every fine-grid point, producing extra long, thin triangles. Collision now retains the shared corners required by neighbouring leaves, plus every original tile-border segment. Exact paired-edge/area tests prevent cracks and T-junctions; the plane proof and native raycasts retain the same height bound. The fine visible/tire surface is unchanged.

**Identical terrain materials had separate mesh sections.** Coarse and fine ground now use one section when they share Terrain_GroundBlend. The earlier seven-material fallback is retained. This reduces duplicate buffers, draw sections and collision-cook requests. The renderer still receives the original terrain triangles and vertex attributes.

**Build behavior depended on Git's working set.** The previous unborn repository caused implementation files to compile separately. A real checkout exposed anonymous-helper name collisions in unity builds. TerraDrive.Build.cs now explicitly compiles this module per file, making branch and editor builds consistent.

## Matched native measurements

Both controls and optimized runs use the **same final executable**, stock Urus, real elapsed time, matching graphics/physics and a thirty-second quarry drive. The legacy switches are available only under validation. Both paths are checked for placement, driving, collision accuracy and terrain repair.

| Scenario | Legacy | Optimized |
| --- | ---: | ---: |
| 1280×720, preset 0, 30 FPS cap: average FPS | 9.33 | 26.09 |
| Same run: 95th-percentile frame time | 205.27 ms | 46.15 ms |
| 1600×900, preset 2, 45 FPS cap: average FPS | 12.86 | 34.70 |
| Same run: 95th-percentile frame time | 180.86 ms | 41.50 ms |
| Same run: worst individual frame | 290.89 ms | 84.25 ms |
| Terrain repair after that drive | 3041.0 ms | 21.1 ms |
| Coarse chunks rebuilt by repair | 676 | 5 |
| Peak process private memory, including repair | 5.41 GiB | 4.19 GiB |

The repair stall and peak-memory reductions are repeatable. FPS varies with warm-up and host memory pressure; earlier warm controls also reached their caps. The table above records the final-build comparison on the 16 GB host, where a mid-queue snapshot recorded roughly 25 GB committed. Vehicles cover different distances when slow frames limit simulation progress. These short trials establish neither a universal FPS multiplier nor a steady-state ceiling. Occasional longer frames remain.

Intermediate candidates, failed rollover runs, the misplaced first fixture and the early trace's abnormal shutdown are retained as diagnostic evidence and excluded from final acceptance. The first cold comparison's 18-to-30 FPS gap is also excluded from headline results. Rollover failures were intermittent: old-edge controls could pass too. The final matrix establishes the recorded result; it does not establish a universal rollover multiplier.

The optimized run retained 207,025 fine render vertices while the installed collider used 54,777 referenced vertices. Its 1,225 physical raycasts measured a maximum **0.065-inch** difference from the visible fine surface, inside the unchanged one-fifth-inch limit. The public benchmark runner also passed independently with saved-settings preservation enabled.

## Complete trail and regression checks

The complete Slate Rim trail passes all 20 gates in real time at 1600×900, preset 2 and a 30 FPS cap. The existing engine frame counters over 98.5 seconds report **24.95 FPS**, with roughly one-second intervals from 10.5 to 28.2 FPS. These coarse log intervals do not measure individual-frame spikes.

All 58 side/roof drop trials pass the original physical and real-time frame-budget checks. Their short settled measurement windows average 11.39–19.48 FPS at the 20 FPS cap. The Sprinter trials started at -110 and +110 degrees measure 16.43 and 15.50 FPS; the intermediate candidate had failed those two cases. These are unconstrained drops, and some vehicles naturally roll upright before capture; the timings do not imply that every vehicle remained inverted throughout its window. Both short old/new controls could also pass, so this remains evidence for the recorded matrix, without a universal multiplier claim.

Final verification totals **904 native checks** (including 28 legacy-control checks), **219 standalone collision checks** and **124 screenshots actually inspected**. Affected suites cover ruts, every vehicle's side/roof contacts, terrain transitions and momentum. Movement retains its established fixed 20 Hz functional clock; the performance comparisons and complete trail use real time. Game and editor builds pass. All runs identify the same final executable and frozen source.

Browser files, current game settings, all 300 SourceAssets, seven NativeData files and five package containers remain unchanged. This is a C++ code stage over the accepted asset cook. [The machine-readable record](performance-validation-22.json) contains exact hashes, receipts, metrics and preservation evidence.

## Remaining opportunities from source review

The next profiling target is the remaining frame spikes. The intermediate CPU trace found synchronous soil-collider replacement and subsequent Chaos contact generation; the final build still uses that synchronous path when topology must change. A longer final-build trace should quantify its remaining cost and guide bounded staging/batching without loosening collision accuracy. Final trail log intervals identify slowdowns but cannot localize each spike.

The following source-review candidates are additional opportunities, without measured speedup claims or implementation in this PR:

- [Quarry trail distance queries](../Source/TerraDrive/TerraWorld.cpp#L122) scan every sampled trail segment inside LooseDirt. A bounded spatial index could preserve exact near-trail distances while reducing repeated work during tire sampling and new-tile construction.
- [Ground shading](../Tools/terrain-surface.hlsl#L76) combines multiple stochastic color/normal/roughness layers and triplanar projections. GPU pass timing at the player's actual display resolution should guide any distance-based sampling simplification while preserving terrain variation.
- [Vehicle selection](../Source/TerraDrive/TerraVehicle.cpp#L164) synchronously loads meshes and rebuilds collision. A bounded asynchronous preview cache could reduce garage-switch stalls without preloading every model on a 16 GB machine.
- [Plant crushing](../Source/TerraDrive/TerraWorld.cpp#L1090) and falling-tree updates submit individual instance transforms. Grouping transforms by component is worth profiling during vegetation-heavy driving.

## Repeat and review

From the Unreal project directory, after building the native game, compare matching runs:

```powershell
.\Tools\verify-performance.ps1 -Name legacy-q2 -Legacy -Cap 45 -Quality 2 -Width 1600 -Height 900
.\Tools\verify-performance.ps1 -Name optimized-q2 -Cap 45 -Quality 2 -Width 1600 -Height 900
```

Use identical Cap, Quality, Width and Height values for each pair. The default is a 30 FPS cap; 45 is available for a bounded comparison. Each run isolates settings, records the executable/source, captures the real physics surface and stops at a sampled 77°C cutoff. Main receives changes through a reviewed PR; see [CONTRIBUTING](../../CONTRIBUTING.md).

These capped offscreen runs and static-image reviews do not establish uncapped throughput, 60 FPS everywhere, manual-controller feel, long-session thermal behavior or PC-crash stability. Acquired packs and runnable builds stay local.
