# Native migration validation

Verified October 21, 2026 with Unreal Engine 5.8.3, Windows Development, DirectX 12 SM6 and NVIDIA GeForce RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe and keep the entire Windows directory together.

## Current results

| Check | Result |
|---|---|
| Native editor/runtime C++ compilation and Windows packaging | Successful |
| Revised terrain material import and full cook | Successful; no invalid material shader fallbacks |
| Final cache code package | Successful; reuses the completed valid material cook |
| Packaged native driving and rendering checks | All 233 passed; fresh report and exit 0 |
| Standalone simulation checks | All 105 passed |
| Export | 1,000 terrain samples, finite meshes and tire beads verified |
| Assets | 217 mesh sources, 318 materials, 42 textures and seven layered terrain materials |
| Environment | 13,161 detail instances, including 1,073 solid and 10,516 scanned rock/plant instances |
| Preserved browser reference | All 189 files unchanged |
| Player garage save | Original bytes preserved; automated test saves isolated |

Final executable SHA-256: 34b25774d815d75f1405a65495d2d4f4f1dccf41a2bccc4d2568c9bad319a86e.
The machine-readable [native-validation.json](native-validation.json) contains the full test results and source/cooked-content hashes.

## Surface behavior and observed measurements

The prior dark soft-surface tread ribbons are removed. Rubber geometry is limited to pavement traction loss. Hard dirt has a light dusty trail; loose dirt pockets, mud and sand excavate grooves and raised shoulders; snow compresses under load and piles beside the tire. Ground vegetation bends and loses height under the loaded footprint. The continuous loose-dirt field also drives its ground tint. Backspace repairs terrain, vegetation and rubber geometry.

These maxima were measured from actual wheel-driven scripted passes. They depend on load, pressure, tire slip and position; they are not universal soil depths or calibrated factory results.

| Surface | Deepest loaded groove | Highest sampled side berm |
|---|---:|---:|
| hard dirt | 0.74 in | shallow trail |
| soft dirt | 6.59 in | 3.00 in |
| mud | 9.70 in | 7.14 in |
| wetland | 8.51 in | 7.34 in |
| sand | 5.84 in | 5.39 in |
| snow | 23.41 in | 4.48 in |

Each pass verifies persistent depth, packing, vehicle advance, absence of rubber ribbons and soil-volume accounting. Soft surfaces also require positive side berms. The finite footprint is swept between loaded contacts. Unsupported tires, rigid obstacles and teleports break contact continuity. Existing flotation, rut rolling resistance and tile-seam checks pass.

The render pool now streams far tiles into an offscreen state cache instead of disabling new deformation when full. A deliberately reduced eight-tile test budget fills the pool, requires new ruts to keep appearing, verifies retained offscreen depth, revisits a cached rut and checks complete repair. Production limits are 768 active tiles and 8,192 cached states.

## Rendered review and Fab assets

Reviewed final captures: native-driven-dirt.png, native-driven-soft-dirt.png, native-driven-mud.png, native-driven-wetland.png, native-driven-sand.png, native-driven-snow.png, native-crushed-grass.png and native-pavement-skidmarks.png. Trail views use an oblique stationary camera after the driving pass. Screenshots are under Build/Windows/TerraDrive/Saved/Screenshots.

The signed-in Fab library contains Automotive Winter Scene, African Slate Quarry and Electric Dreams Env. Quarry medium FBX was downloaded, with 129 FBX files and 707 textures, approximately 470 MiB extracted. No Fab library asset is imported or placed in this build. The winter sample import dialog found no available project. Additional free Snow, Soil Mud, Forest Floor and Megaplants candidates and licensing/source-publication constraints are documented in [surface-deformation.md](surface-deformation.md).

Computer Use ended after Fab opened Firefox because URL policy enforcement was unsupported for that browser. No further desktop input was issued. This round's visual verification uses game-generated captures; live desktop driving and controller hardware were not exercised.

## Existing game behavior retained

The native suite still covers all six vehicles, Space braking/holding, S/Down brake-to-reverse demand, wheel orientation, Hummer ride height, upgrade effects, garage camera behavior, save migration, light emitters, rollover/airborne contact, moving debris, loop support, axle lockers, descent assist, region spawns and eight challenge starts. S/Down and gamepad left trigger select reverse after a continuous 0.65-second full-stop dwell; Space remains a hold brake.

The Urus Performante remains an authored approximation with steel coils, staggered tires, 22-inch wheels and estimated chassis/operating-mass parameters. Earlier live garage/orbit/upgrade and exit/restart checks are historical evidence from the lighting/vehicle round, not a new live test in this round. CC0 scan sources, original model research and lighting references remain in [lighting-tracks-urus.md](lighting-tracks-urus.md).

## Reproduce

    .\Tools\test-core.cmd
    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

Use a normal Windows process context. Material or asset changes require a full cook; code-only changes may reuse a successful cook with -SkipCook. The build helper requires fresh import/cook diagnostics and rejects invalid material shader fallbacks. The verifier requires a fresh complete report and successful game exit. A targeted developer run can add -TerraSoilOnly to -TerraValidate; it does not replace the complete verifier.

Final logs: Saved/package-surface-ruts-final-console.log, Saved/package-surface-ruts-verified-console.log, Saved/verify-surface-ruts-final-console.log and Saved/Validation/packaged-game.log. Core/export logs: Saved/core-surface-ruts.log and Saved/validate-export-surface-ruts.log. The earlier 223-case pass is retained as Saved/Validation/surface-first-pass-223.json and .log. The intermediate saturated-fixture failure is retained as Saved/Validation/surface-fixture-saturation.json and .log; the excavation test now starts on repaired soil.

Public source uses an explicit allowlist and credential checks. Generated Unreal assets, Windows builds, local saves/logs/screenshots, private configuration, research copies and raw Fab downloads are excluded. Vendored CC0 sources remain included.

## Practical limits

Soil is a finite height-field simulation with estimated coefficients. It does not model liquid mud flow, individual grains, snow temperature or arbitrary overhangs. Ruts, plant crushing and skidmarks persist for the session, with no disk save. The farthest cached terrain history may be discarded at the cache limit; rubber history reuses the oldest of 4,096 segments. Rocks remain fixed scenery and plants are nonblocking.

Vehicle models, factory chassis systems and driveline calibration remain approximate. Complete browser parity, every full rocky route, uninterrupted loop traversal, fine sign lettering, detailed track animation, controller hardware and long-session performance remain unproven. The earlier hard reboot has no established cause.
