# Native migration validation

Verified October 23, 2026, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with the complete Windows folder.

| Check | Result |
|---|---|
| Import and full material cook | Successful; corrected scenery cook has no invalid material fallback |
| Final code compilation and Windows staging | Successful against the corrected full cook |
| Packaged native suite | 286/286 pass; fresh report and actual process exit 0 |
| Six-vehicle garage | 30/30 pass; four captured views per vehicle and acquired finish checks |
| Close Urus review | 7/7 pass; six fresh native captures and actual exit 0 |
| Independent simulation core | 143/143 pass |
| Export validation | 1,000 broad terrain samples and 363 explicit trail samples pass, with finite geometry, seated tires and circular loop checks |
| Native export | 238 source meshes; 346 material records |
| Automotive Materials | 90 project-owned finish bindings across all six vehicles |
| Acquired scenery | 16 mesh variants and 818 placements, including 444 MW grass clumps |
| New foliage behavior | All three acquired MW grass variants flatten under loaded tire footprints and restore with terrain repair |
| Browser and player garage | All 1,214 local browser files and player save bytes preserved |

Executable and cooked-content SHA-256 values, exact source hashes and all cases are recorded in [native-validation.json](native-validation.json).

## Visual review

The [vehicle and terrain pass](realism-terrain.md) was reviewed in the packaged game. The first model captures exposed paint inside the Urus cabin and an excessively narrow waist. Corrections add inner pillar trims, a roof liner and taller door cards, broaden the lower door cross section and thin the arch reveals. The HUMMER side sheets have a denser grid with a matching seam projector and less extra door bulging. Native helpers add rounded fittings and analytic surface normals; all six vehicles use acquired automotive finishes.

The corrected garage was inspected in side and front-quarter views across all six vehicles, with additional front views and six close Urus angles. The figures are actual native renders. Manufacturer and dealer references are linked in [urus-automotive.md](urus-automotive.md) and [vehicle-art-production.md](vehicle-art-production.md). Current shapes remain reference reconstructions, with visible limitations in exact panel transitions, lamp optics, cabin details and production topology/UV/LOD work. They are not Forza-equivalent assets.

Terrain review covers forest, rock, dune and snow regions and driven soil captures. MW landscape color/normal maps, scanned Winter Scene snow/road textures, rock formations, ice and foliage are integrated through project-owned recipes. A scenery capture caught Winter Scene snow/weather materials on temperate rocks; those formations now use the biome's matching photographic rock material. The new grass participates in tire crushing.

## Driving and contact

The full suite checks six-vehicle braking and held-input reverse, Space braking, lights, wheel rotation, Hummer ride height, upgrades, garage orbit, isolated saves, rollover grip inhibition, moving debris, lockers, descent and course starts. The stock Urus completes all 20 Slate Rim gates continuously using ordinary throttle/steering input.

The firm-ground regression queries the cooked Axlebreaker ledges and verifies all six vehicles settle above the quarry floor and reverse out of a banked compression. Soil cases retain hard-dirt trails, soft-soil grooves and berms, snow compaction, crushed vegetation and pavement-only rubber marks. Results report individual driven samples, not universally calibrated soil depths.

## Reproduce and limits

Add the acquired packs as described in [realism-terrain.md](realism-terrain.md), then run `Tools/build-native.ps1 -ImportAssets -Package`, `Tools/verify-native.ps1` and `Tools/test-core.cmd`. Asset/material changes require a fresh cook. Validation uses its own garage save. Player displays use imperial units; diagnostic JSON documents internal SI values.

Only Slate Rim is verified as a full uninterrupted route. Full traversal of the other challenges/loop, controller hardware and long-session stability remain unproven. This round uses native automated driving and engine-generated captures, without a separate live desktop/controller session. An earlier candidate full run was intentionally stopped for the scenery correction and is not accepted as passing evidence. The accepted final run completes on the corrected package.

Raw acquired Epic/Fab assets, saves and builds remain local. The public repository contains original source, preserved browser assets, integration recipes and verification metadata.
