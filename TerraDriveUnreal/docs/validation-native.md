# Native migration validation

Verified October 20, 2026 with Unreal Engine 5.8.3 on Windows x64, DirectX 12 SM6 and NVIDIA GeForce RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe and keep the complete Windows folder together.

## Recorded results

| Check | Result |
|---|---|
| Editor/game compilation, import and full cook/package | Successful |
| Packaged native game | All 71 checks passed with a fresh report and successful process exit |
| Shared C++ core | 41 checks passed, including upgrade progression, hardware limits, contact, differential torque, friction and flotation |
| Assets | 144 mesh sources, 295 source materials, seven layered terrain materials, 26 imported textures, nine regions and eight routes |
| Browser preservation | All 189 preserved browser files match their recorded Git blob hashes |
| Existing terrain conversion | 1,000 height/water/surface samples and region references remain the unchanged geometry baseline |
| Matched engine comparison | Stock 13.953 m/s and 40.177 m; stage III 21.059 m/s and 73.749 m at identical throttle and duration |
| Body upgrade | Actual Chaos mass falls with lightweight body stages; roof collision no longer adds a second cabin mass |
| Other upgrade systems | Rendered tire size/friction, wheel inertia, suspension travel, frame damping/protection, electrical recovery and EV output checks passed |
| Persistence | Atomic save, seven-category reload, independent vehicle builds and invalid-file protection passed |
| Garage | Vehicle freeze/cursor and return to simulated driving passed |
| Live controls | mouse vehicle selection and all seven visible upgrade rows, Bronco engine II: 330 to 462 hp, stage II engine retained after full restart, Wrangler stock build remained independent, Bronco tire II: 35.3 in and +28% grip, Reset to Stock restored 330 hp and 32.7 in, Let's Drive, Tab and Escape, test setups restored to stock and game closed |
| Rollover/airborne input | Zero tire drive or invented airborne steering |
| Debris | 434 emitted, 410 expired, 24 rendered at the sample; no permanent particles after stopping |
| Courses | Five loop contact probes, unsupported gap, moving inverted wheel support, eight stable route starts, locker comparison and controlled descent passed |

The engine comparison is a repeatable game regression, not a calibrated real-world performance claim. The machine-readable report records every case, executable hash and source hashes. Test save files live under Saved/Validation and never overwrite the player garage.

## Visual and interaction checks

The native vehicle and upgrade menus were inspected in the running game. Vehicle cards, live preview, stage controls and build-sheet numbers were checked. Saved vehicle upgrades were checked after restarting. Terrain screenshots were inspected across the regions, including varied dirt, mud and rock. The material pass uses three photographic layers, world-space/triplanar projection, irregular patches at multiple scales, normal maps and roughness variation. Dry-soil specularity was reduced and pale gravel was soil-stained after the first renders showed unnatural white patches. The final seven-row upgrade layout was rebuilt and staged against that successful cook, then passed the complete native suite again.

Final cook and runtime logs contain no material compilation errors, fatal errors or virtual-shadow overflow. Existing SSGI deprecation and unused Enhanced Input settings notices remain non-fatal. These observations do not constitute a frame-time benchmark or long-session stability test.

## Reproduce

    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

Use a normal Windows process context for Unreal. Material/rendering changes require a full cook; code-only changes may reuse a successful cook with -SkipCook. The importer uses forward-slash Python arguments, resumable material signatures and mesh schema 2. The verifier rejects stale reports or failed checks.

Logs remain under Saved/Validation, Saved/Logs and Saved/AutomationLogs. Captures are in Build/Windows/TerraDrive/Saved/Screenshots. Generated assets, Windows packages, local saves and private configuration are excluded from GitHub. The unused Android File Server plugin is disabled, and upload preparation rejects credential-like configuration values.

## Practical limits

This is a playable migration preview. Upgrade stages are game tuning rather than manufacturer-approved or factory-calibrated modifications. Body/frame upgrades primarily change simulation properties; they do not provide a complete set of replacement body meshes. Terrain variation improves existing surface materials without adding new physical soil categories.

Full browser 1.15 parity, detailed track animation, every procedural sign, factory driveline interlocks, gamepad hardware testing and long-session performance/stability are not established. Some signs remain blank. The tests verify course collision, route starts and selected driving segments; they do not prove an uninterrupted full-speed loop or completion of every rocky route. Historical browser regressions remain reference evidence; no new full browser-suite pass is claimed.
