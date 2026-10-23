# Native migration validation

Verified October 22, 2026, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe with the complete Windows folder.

| Check | Result |
|---|---|
| Import, full shader cook and Windows packaging | Successful; accepted cook has no invalid-material fallback |
| Packaged native suite | 278/278 pass; fresh report and actual process exit 0 |
| Focused Urus review | 7/7 pass; six fresh native captures and actual exit 0 |
| Independent simulation core | 143/143 pass |
| Export validation | 1,000 broad terrain samples, 363 trail samples, finite meshes/materials, wheel beads and circular loop pass |
| Native assets | 238 source meshes; 338 material records |
| Epic Automotive Materials | 11 Urus material slots across nine finish roles; parent and parameter bindings verified |
| Slate Rim | 20/20 gates in the uninterrupted stock-Urus drive; approximately 1,065 feet |
| Browser and player garage | All 1,214 local browser files match the preserved tree; player save bytes preserved |

Executable SHA-256: fc9577ae8a4b7eeae89eb174c0e2858558c4f813866cf41d96274bb6bf687cd7. [native-validation.json](native-validation.json) records the cases, source/cooked hashes and asset metadata.

## Urus render review

The new [Urus body and automotive-material integration](urus-automotive.md) was reviewed through five native preview rounds. Front, side, rear and three quarter-angle views were compared against the cited manufacturer and dealer reference photographs. The first four sets led to corrections; the fifth six-image set is the accepted review evidence. Screenshots are actual packaged-game renders, not browser images or generated concept art.

The current body has reshaped doors and shoulders, continuous painted pillars, inset glazing, revised bonnet and intake geometry, a black rear lamp band, revised mirrors and dished 22-inch wheel webs. Epic child material instances supply paint, carbon, trim, upholstery, wheel and rotor finishes. Raw Epic UAssets remain local; the public source includes the integration recipe and reference links.

This is an authored reconstruction and remains below Forza-level automotive asset quality. Exact panel curvature, detailed lamp optics, trim, cabin and production LOD/UV work remain limitations. Numerical loading tests and polygon counts are not evidence of exact photographic accuracy. See [vehicle-art-production.md](vehicle-art-production.md).

## Driving and terrain regressions

The full suite retains all six vehicles' braking/reverse, lamp, wheel rotation, Hummer ride height, upgrade, garage orbit, save-isolation, rollover, moving debris, locker, descent and course-start checks. The stock Urus still drives every Slate Rim gate using normal throttle/steering without intermediate teleportation.

The [firm-ground contact correction](ground-contact.md) remains passing in this suite: zero missing supports in the cooked Axlebreaker probe grid, and all six vehicles settle and reverse from banked compression. Its preceding focused 19/19 run at a 20-FPS cap is historical evidence on the prior executable; it is not presented as a fresh focused run of this art build.

Pavement traction loss alone leaves black rubber. Hard dirt leaves a light trail; loose dirt/mud/sand create grooves and berms; snow compacts and vegetation bends. Current driven sample maxima, not universally calibrated depths:

| Surface | Deepest groove | Highest sampled berm |
|---|---:|---:|
| hard dirt | 0.87 in | shallow trail |
| soft dirt | 5.99 in | 4.45 in |
| mud | 8.33 in | 6.28 in |
| wetland | 8.49 in | 6.79 in |
| sand | 7.07 in | 4.57 in |
| snow | 18.31 in | 4.33 in |

## Reproduce and limits

Add the acquired Epic Automotive Materials pack to the project as described in [README.md](../README.md), then run Tools/test-core.cmd, Tools/build-native.ps1 -ImportAssets -Package and Tools/verify-native.ps1. Asset/material changes require a fresh cook. Player displays use imperial units; diagnostic JSON retains explicitly documented SI values.

Only Slate Rim is verified as a complete uninterrupted route. Full traversal of the other challenges/loop, controller hardware and long-session stability remain unproven. This verification uses native automated driving and engine-generated captures, with no separate live desktop driving session. Licensed raw Fab/Epic files are excluded from public source; the existing vendored Poly Haven sources are CC0.

A previous CSV-enabled diagnostic passed its game cases but exited 777003 during shutdown. It was rejected; the cause remains unproven. The accepted current focused and full runs omit CSV capture and exit 0.
