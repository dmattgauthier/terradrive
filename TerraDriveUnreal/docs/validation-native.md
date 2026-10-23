# Native migration validation

Verified October 23, 2026, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with the complete Windows folder.

| Check | Result |
|---|---|
| Import and full material cook | Successful; final rock geometry/material cook has no invalid material fallback |
| Final code compilation and Windows staging | Successful against the accepted rock repair cook |
| Packaged native suite | 286/286 pass at 20 FPS; fresh report and actual process exit 0 |
| Rock / graphics settings | 69/69 pass, 44 fresh rock views, exit 0 |
| Scan geometry closure | Eleven non-ice project copies, 17 source LOD meshes, all closed with zero failed fills |
| Preset samples | Cool, Balanced and capped Quality smoke: 16 checks each, exits 0 |
| Previous model-round garage | 30/30 pass in commit bc131f5; vehicle geometry unchanged this round |
| Previous all-six close model review | 42/42 pass in commit bc131f5; historical art evidence |
| Assembled model geometry | All six pass finite-surface and shading checks; Urus front/rear glazing has real clear paths |
| Independent simulation core | 143/143 pass |
| Export validation | 1,000 broad terrain samples and 363 explicit trail samples pass, with finite geometry, seated tires and circular loop checks |
| Native export | 238 source meshes; 347 material records |
| Automotive Materials | 90 project-owned finish bindings across all six vehicles |
| Acquired scenery | 16 mesh variants and 818 placements, including 444 MW grass clumps |
| New foliage behavior | All three acquired MW grass variants flatten under loaded tire footprints and restore with terrain repair |
| Browser and player garage | All 1,214 local browser files and player save bytes preserved |

Executable and cooked-content SHA-256 values, exact source hashes and all cases are recorded in [native-validation.json](native-validation.json).

## Visual review

This round inspected 44 native rock captures (four directions for each of eleven groups), three preset scene views and the graphics menu. Rock materials are opaque and two-sided. Closing faces have world-mapped stone and recalculated normals; all 17 source LOD meshes pass topology readback. The review cameras stay above the hillside. Original acquired pack assets, ice, grass masks and vehicle glass are preserved. The source scans still have broad, authored closure surfaces; this corrects holes and visibility rather than claiming a new high-detail rock sculpt.

The preceding [all-vehicle coachwork round](model-refinement-6.md) was reviewed in the packaged game using repeatable close cameras and the garage. The first captures led to shallower SUV door stampings, corrected hood/rear lettering, removal of the Civic's duplicate front strip and more inner lining in the HUMMER and Urus. A final source correction completes the fender trim trace and removes an unsupported extra Urus badge. The Urus windshield and hatch now have genuine open surrounds rather than opaque backing sheets.

Thirty-two final images were inspected: front, side, rear and quarter views of every vehicle, two further Urus angles and six garage quarter views. All 36 close captures and 24 garage captures are required to be fresh by their native verification runs. These are actual native renders. References are linked in [vehicle-model-research.md](vehicle-model-research.md), [urus-automotive.md](urus-automotive.md) and the current model notes. Current shapes remain authored approximations with visible limits in exact panel transitions, lamp optics, interior details and production topology/UV/LOD work. They are not Forza-equivalent assets.

The preceding terrain review covered forest, rock, dune and snow regions and driven soil captures. MW landscape color/normal maps, scanned Winter Scene snow/road textures, rock formations, ice and foliage are integrated through project-owned recipes. A scenery capture caught Winter Scene snow/weather materials on temperate rocks; those formations now use the biome's matching photographic rock material. The new grass participates in tire crushing.

## Driving and contact

The full suite checks six-vehicle braking and held-input reverse, Space braking, lights, wheel rotation, Hummer ride height, upgrades, garage orbit, isolated saves, rollover grip inhibition, moving debris, lockers, descent and course starts. The stock Urus completes all 20 Slate Rim gates continuously using ordinary throttle/steering input.

The firm-ground regression queries the cooked Axlebreaker ledges and verifies all six vehicles settle above the quarry floor and reverse out of a banked compression. Soil cases retain hard-dirt trails, soft-soil grooves and berms, snow compaction, crushed vegetation and pavement-only rubber marks. Results report individual driven samples, not universally calibrated soil depths.

## Reproduce and limits

Cool is the new default at 30 FPS / 75% internal resolution; Balanced is 45 FPS / 85%; Quality is 60 FPS / 100%. The garage caps at 20 FPS and the background window at 15 FPS. Small MW grass clumps no longer cast shadows and have a shorter draw distance. Terrain interaction and solid obstacles remain available in all modes.

At the same stationary 1920×1080 quarry viewpoint, ~25-second samples measured Cool at 29.99 FPS / 37.4% GPU / 19.2 W / max sample 59°C, and Balanced at 44.98 FPS / 50.3% / 25.4 W / max 62°C. Cool's entire run including startup reached 60°C. Quality was checked with a separate 20 FPS safety cap; its 60 FPS thermal behavior was not tested. The full 286-case driving run recorded 355 GPU observations, maximum 59°C, and completed without reaching the conservative 77°C cutoff. These readings do not establish long-session stability or the cause of the reported whole-PC reboots. See [rendering-and-gpu.md](rendering-and-gpu.md).

Add the acquired packs as described in [realism-terrain.md](realism-terrain.md), then run `Tools/build-native.ps1 -ImportAssets -Package`, `Tools/verify-render.ps1 -Mode Rocks`, the Cool/Balanced/QualitySmoke modes, `Tools/verify-native.ps1` and `Tools/test-core.cmd`. Asset/material changes require a fresh cook. Validation isolates both garage and graphics settings. Player displays use imperial units; diagnostic JSON documents internal SI values. Vehicle geometry/export tools and the all-model camera mode remain available for later art changes.

Only Slate Rim is verified as a full uninterrupted route. Full traversal of the other challenges/loop, controller hardware and long-session stability remain unproven. This round uses native automated driving and engine-generated captures, without a separate live desktop/controller session. Earlier candidates were revised after visual inspection; acceptance comes from the full cook with the final textured closing faces, followed by fresh rendering, GPU and driving checks.

Raw acquired Epic/Fab assets, saves and builds remain local. The public repository contains original source, preserved browser assets, integration recipes and verification metadata.
