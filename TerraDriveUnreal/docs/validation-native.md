# Native migration validation

Verified October 22, 2026, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe with the complete Windows folder.

| Check | Result |
|---|---|
| Import, full shader cook and Windows packaging | Successful; no invalid material fallback in the accepted cook |
| Packaged native suite | 256/256 pass; fresh report and exit 0 |
| Independent simulation core | 143 checks pass |
| Export | 1,000 broad terrain samples plus 363 explicit trail samples, finite meshes/materials, wheel beads, circular loop and new trail checks pass |
| Native meshes/materials | 238 source-derived meshes; 335 material records |
| Slate Rim | 20/20 gates in a continuous stock-Urus drive; approximately 1065 feet |
| New CC0 scenery | 22 cliff, 425 boulder and 2566 grass placements |
| Acquired Fab scenery | Eight meshes; 274 placements |
| Original browser and garage save | Preserved; 189 published browser files and all 1214 local browser-tree files checked |

Executable SHA-256: 70417e36ee6d0ba70642ba17631637394b4fd6dc5d9657a968023a248915aa77. [native-validation.json](native-validation.json) contains all current cases, source/cooked hashes and asset metadata.

## Rendered inspection

Reviewed actual packaged-game captures: native-urus-hero-0.png, native-urus-hero-1.png, native-urus-hero-2.png, native-urus-hero-3.png, native-slate-rim-trail.png, native-urus-quarry-driving.png, native-model-0-view-0.png, native-model-0-view-1.png, native-model-0-view-2.png, native-model-0-view-3.png, native-model-1-view-0.png, native-model-1-view-1.png, native-model-1-view-2.png, native-model-1-view-3.png, native-model-2-view-0.png, native-model-2-view-1.png, native-model-2-view-2.png, native-model-2-view-3.png, native-model-3-view-0.png, native-model-3-view-1.png, native-model-3-view-2.png, native-model-3-view-3.png, native-model-4-view-0.png, native-model-4-view-1.png, native-model-4-view-2.png, native-model-4-view-3.png, native-model-5-view-0.png, native-model-5-view-1.png, native-model-5-view-2.png, native-model-5-view-3.png, native-driven-snow.png, native-driven-mud.png, native-round-loop.png, native-fab-slate-quarry.png. The Urus body/cabin and coherent quarry ground, cliffs, grasses and markers are described in [urus-slate-rim.md](urus-slate-rim.md). Numerical checks establish loading/behavior, not exact photographic accuracy. See that document for manufacturer references and the distinction between authored geometry and CAD.

## Driving and terrain regressions

The new suite uses normal throttle and steering inputs to take the stock Urus through every Slate Rim gate, without intermediate teleportation. Native collision rays check both new rock scans; cooked textures, grass loading and stable entrance support are verified. The earlier brakes/reverse, six-vehicle lamps, wheel rotation, Hummer ride height, upgrades, garage orbit, save isolation, rollover, moving debris, lockers, descent and course-start checks remain passing.

Pavement traction loss alone leaves black rubber. Hard dirt leaves a light trail, loose dirt/mud/sand excavate ruts and berms, snow compacts and vegetation bends. Current maximum driven samples, not universal calibrated depths:

| Surface | Deepest groove | Highest sampled berm |
|---|---:|---:|
| hard dirt | 0.77 in | shallow trail |
| soft dirt | 6.78 in | 4.48 in |
| mud | 7.76 in | 6.74 in |
| wetland | 9.87 in | 6.88 in |
| sand | 7.10 in | 4.69 in |
| snow | 18.41 in | 3.66 in |

## Reproduce and limits

Run Tools/test-core.cmd, Tools/build-native.ps1 -ImportAssets -Package and Tools/verify-native.ps1. Mesh/material changes require a fresh cook. The browser source remains a reference, not proof of native parity. Models remain authored approximations, physics coefficients are estimates, full traversal of the other routes/loop and long-session stability remain unproven. This round uses automated native driving and engine-generated renders; no separate live desktop or controller-hardware session was performed. Licensed raw Fab files are excluded from public source; vendored Poly Haven sources are CC0.

A CSV-enabled diagnostic passed its game cases but faulted during shutdown (exit 777003). That run was rejected. The accepted full suite and focused brake rerun omitted CSV capture and exited 0; the profiling fault's cause remains unproven.

