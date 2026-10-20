# Native migration validation checkpoint

Date: October 20, 2026. Target: UE 5.8.3, Windows x64.

| Check | Observed result |
|---|---|
| Unreal editor C++ module | Compiled successfully; build-editor.log |
| Windows Development game target | Compiled successfully; build-game.log |
| Shared C++ simulation core | 15 checks passed: stiff wheel integration, reverse symmetry, track flotation, rigid soil, shared traction budget and brake-to-reverse gating |
| Preserved browser reference | 62 focused Node tests passed; reference-regression.log |
| Source asset conversion | Produced 141 OBJ sources, five vehicle variants, eight regions, 472 trees and source terrain grid |
| Native asset import | Not verified; commandlet returned 0 but produced no assets/map/log |
| Cook/package | Failed before cooking: AutomationTool log folder outside writable workspace |
| Native driving/graphics/frame rate | Not run; no fresh screenshot evidence |

The compiled `Binaries/Win64/TerraDrive.exe` requires cooked content. It is not a standalone release. The `-TerraValidate` in-engine scenarios have been written but have not executed. Historical browser screenshots and reference tests are not native validation.

## Migration coverage

The native source contains a Chaos rigid chassis with four spring/damper tire contacts, implicit wheel rotation and combined grip limits, five source-derived vehicle specifications/meshes, deterministic source terrain, sparse deformed surface patches, snow flotation tracks, surface-sensitive spray, body tracing/deposits, tree fall, finite obstacle queries, winch forces, a field garage and keyboard/gamepad input.

This is a first native implementation, not established simulation parity. Advanced factory safety interlocks, detailed body/tire deformation, full upgrade persistence, moving-body spray sweep accuracy, tree inertia/contact calibration, track belt animation, challenge content collision, and rendering quality require further migration and validation. The supplied browser implementation remains intact for those behaviors. Core values are simulation estimates, not calibrated real-world vehicle or soil measurements.

## Environment

Installed: UE 5.8.3 (CL 58210709), VS Community 2026, MSVC 14.51.36256, Windows SDK 10.0.26100, Node 24.19.0. UBT warns that this MSVC is newer than its preferred 14.50 range, but both targets compiled. No missing compiler/SDK package was observed. Unreal supplies the Python used for asset authoring.

The session cannot currently launch a useful Unreal editor commandlet or desktop helper. The exact commandlet startup cause is unknown. The packaging log-folder denial is a concrete sandbox path issue, not a gameplay failure. Native Linux/Mesa tests are irrelevant to this Windows port.
