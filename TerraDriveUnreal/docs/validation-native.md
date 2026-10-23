# Native migration validation

Verified October 23, 2026, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with the complete Windows folder.

| Check | Result |
|---|---|
| Import and full material cook | Successful; final all-model asset cook has no invalid material fallback |
| Final code compilation and Windows staging | Successful against the final full model cook |
| Packaged native suite | 286/286 pass; fresh report and actual process exit 0 |
| Six-vehicle garage | 30/30 pass; four captured views per vehicle and acquired finish checks |
| All-six close model review | 42/42 pass; 36 fresh native captures and actual exit 0 |
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

The [all-vehicle coachwork round](model-refinement-6.md) was reviewed in the packaged game using repeatable close cameras and the garage. The first captures led to shallower SUV door stampings, corrected hood/rear lettering, removal of the Civic's duplicate front strip and more inner lining in the HUMMER and Urus. A final source correction completes the fender trim trace and removes an unsupported extra Urus badge. The Urus windshield and hatch now have genuine open surrounds rather than opaque backing sheets.

Thirty-two final images were inspected: front, side, rear and quarter views of every vehicle, two further Urus angles and six garage quarter views. All 36 close captures and 24 garage captures are required to be fresh by their native verification runs. These are actual native renders. References are linked in [vehicle-model-research.md](vehicle-model-research.md), [urus-automotive.md](urus-automotive.md) and the current model notes. Current shapes remain authored approximations with visible limits in exact panel transitions, lamp optics, interior details and production topology/UV/LOD work. They are not Forza-equivalent assets.

The preceding terrain review covered forest, rock, dune and snow regions and driven soil captures. MW landscape color/normal maps, scanned Winter Scene snow/road textures, rock formations, ice and foliage are integrated through project-owned recipes. A scenery capture caught Winter Scene snow/weather materials on temperate rocks; those formations now use the biome's matching photographic rock material. The new grass participates in tire crushing.

## Driving and contact

The full suite checks six-vehicle braking and held-input reverse, Space braking, lights, wheel rotation, Hummer ride height, upgrades, garage orbit, isolated saves, rollover grip inhibition, moving debris, lockers, descent and course starts. The stock Urus completes all 20 Slate Rim gates continuously using ordinary throttle/steering input.

The firm-ground regression queries the cooked Axlebreaker ledges and verifies all six vehicles settle above the quarry floor and reverse out of a banked compression. Soil cases retain hard-dirt trails, soft-soil grooves and berms, snow compaction, crushed vegetation and pavement-only rubber marks. Results report individual driven samples, not universally calibrated soil depths.

## Reproduce and limits

Add the acquired packs as described in [realism-terrain.md](realism-terrain.md), then run `Tools/build-native.ps1 -ImportAssets -Package`, `node Tools/validate-models.mjs`, `node Tools/validate-export.mjs`, `Tools/verify-model-art.ps1`, `Tools/verify-native.ps1` and `Tools/test-core.cmd`. Asset/material changes require a fresh cook. Validation uses its own garage save. Player displays use imperial units; diagnostic JSON documents internal SI values.

Only Slate Rim is verified as a full uninterrupted route. Full traversal of the other challenges/loop, controller hardware and long-session stability remain unproven. This round uses native automated driving and engine-generated captures, without a separate live desktop/controller session. The preceding model candidate also passed the full suite, but the accepted final evidence comes from the rebuilt package after the last cosmetic corrections.

Raw acquired Epic/Fab assets, saves and builds remain local. The public repository contains original source, preserved browser assets, integration recipes and verification metadata.
