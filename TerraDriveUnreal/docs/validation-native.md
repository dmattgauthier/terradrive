# Native migration validation

Verified October 21, 2026, Unreal Engine 5.8.3, Windows Development, DX12 SM6, NVIDIA GeForce RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe with the complete Windows folder.

| Check | Result |
|---|---|
| Editor/runtime compile, full import/cook and Windows package | Successful; no invalid material shader fallback |
| Packaged native checks | All 243 pass, fresh report, exit 0 |
| Standalone simulation checks | All 105 pass |
| Export | 1,000 terrain samples, finite geometry, upgraded tire beads and circular loop profile pass |
| Generated meshes/materials | 217 source-derived meshes; 324 source materials |
| Epic library scenery | Eight acquired meshes, 24 PBR textures, 282 solid placements |
| Existing environment detail | 13,161 instances, including 1,073 solid and 10,516 scanned rock/plant instances |
| Browser reference | All 189 files preserved |
| Player garage | Original bytes preserved; automated saves isolated |

Executable SHA-256: 9f2cfc81e4e520eefe73a61c327535813ef52706a8589bf69d02eb37207f0e13. Full cases, source hashes and cooked-content hashes are in [native-validation.json](native-validation.json).

## Rendered inspection

All six vehicles were inspected from front, side, rear and three-quarter views in fresh packaged captures. The Urus now uses compound body surfaces with a rising belt, tapered greenhouse, bonnet crown, shaped quarters, 22-inch Helianthus wheel faces and individual intake openings. A first render exposed side-sheet overlaps obscuring front/rear details; those sheets were trimmed to the wrapped fascia edges, and canopy rails/bonnet/hatch joins were closed. Other bodies receive continuous model-specific crown/taper/door refinements; the Civic splitter is fitted to its bumper rather than floating ahead of it. These are reference-based approximations, not OEM CAD replicas.

The Summit loop has an exact 131.2-foot circular side elevation, with separated entry/exit. A clean stationary side capture verifies the whole loop; native casts verify physical support around the curve and existing inverted tire contact still passes.

African Slate Quarry scenery is now actually imported and placed. Render review checks its PBR appearance and ground contact. A first placement pass exposed floating objects near the quarry approach; native terrain heights and collision traces now establish the slope and buried base, including streamed areas. The packaged suite checks all eight meshes, placement counts and an actual world collision ray. See [body-shapes-and-fab.md](body-shapes-and-fab.md) for research, geometry decisions and acquisition requirements.

Captures are under Build/Windows/TerraDrive/Saved/Screenshots: native-model-{0..5}-view-{0..3}.png, native-round-loop.png, native-fab-slate-quarry.png, native-inverted-loop-contact.png and the retained light/terrain cases. This round uses native automated input and game-generated renders; no fresh live desktop driving or controller hardware session was performed.

## Terrain and driving regressions

Pavement traction loss alone produces black skidmarks. Hard dirt leaves a light shallow trail; loose dirt, mud and sand excavate grooves/berms; snow compacts; grass bends and flattens. Actual scripted driving measures the following maxima, which depend on position, load, pressure and slip and are not calibrated universal soil depths:

| Surface | Deepest groove | Highest sampled berm |
|---|---:|---:|
| hard dirt | 0.80 in | shallow trail |
| soft dirt | 5.24 in | 2.39 in |
| mud | 7.84 in | 5.79 in |
| wetland | 8.99 in | 6.86 in |
| sand | 7.65 in | 4.13 in |
| snow | 18.87 in | 4.21 in |

Contact continuity, unsupported tires, rigid surfaces, tile seams, cache overflow/return/repair and volume accounting pass. History remains session-only and bounded. Existing checks retain braking/hold/reverse, all six vehicles and lights, wheel rotation, Hummer ride height, upgrades, garage orbit, save migration, lockers, descent, rollover, moving debris and eight challenge starts. S/Down and gamepad left trigger brake then select reverse after a 0.65-second full-stop dwell; Space holds.

## Reproduce and limits

    .\Tools\test-core.cmd
    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

The verifier requires at least 243 passing checks and a fresh successful process/report. -TerraVisualOnly is a short model/loop/scenery capture mode, and -TerraSoilOnly is a short terrain mode; neither replaces the full verifier. Material/mesh changes require a full cook. Logs: Saved/package-body-assets-final-console.log (full cook), Saved/package-body-final-console.log (final code package), Saved/verify-body-final-console.log, Saved/Validation/packaged-game.log, Saved/core-body.log and Saved/validate-export-body.log.

Raw Fab files, generated assets/builds, research copies, saves, screenshots, logs and private configuration are excluded from public source. Optional Fab scenery requires the user's own acquired pack. Browser parity, every full route, uninterrupted loop traversal, fine lettering, controller hardware and long-session stability remain unproven. The previous hard reboot has no established cause.
