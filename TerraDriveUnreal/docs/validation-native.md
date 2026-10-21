# Native migration validation

Verified October 21, 2026 with Unreal Engine 5.8.3 on Windows x64, DirectX 12 SM6 and NVIDIA GeForce RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe and keep the full Windows folder together.

## Recorded results

| Check | Result |
|---|---|
| Final editor/runtime compile, import, full cook and Windows staging | Successful; process exit 0 |
| Packaged game | All 140 checks passed with a fresh JSON report and successful game exit |
| Standalone simulation | All 82 checks passed, including shared driver controls and wheel/axle braking at 30/60/120 Hz |
| Assets | 189 mesh sources, 302 source materials, seven terrain materials and 26 textures |
| Scenery | 2,645 detail instances, including 645 solid rocks/logs; 13 materials retain instance colors |
| Browser source | All 189 reference files unchanged; 53 existing vendor/binary files preserved |
| Display units | mph, feet/inches, pounds, pounds-force, PSI and horsepower |
| Wheel direction | Actual wheel component orientation gives the correct forward/reverse tread direction on all four wheels |
| Braking input | Space overrides throttle on all five vehicles; held S stops and holds; release/reapply deliberately selects reverse |
| Incline | Space holds the physical chassis on a twelve-degree contact surface without sustained downhill creep |
| Hummer suspension | Stock and lifted physical heights pass; measured stage III rise 4.13 in; larger tire/lift combination matches the garage target |
| Garage camera | Fifteen persistent preset views plus actual camera orbit, zoom and bounds passed; drag/scroll/presets checked live |
| Model upgrades | Separate fixed-diameter rims/rotors, stationary calipers, loaded stage-specific tires; export verifies seated beads at every stage |
| Existing behavior | Rollover/airborne suppression, moving/expiring debris, locker comparison, controlled descent, loop/gap probes, all eight route starts, upgrades, persistence, pressure response, rut continuity and scenery support passed |

## Measured braking

The shared input resolver is exercised with W held while Space brakes. After five seconds the chassis is held at the speeds below. Distance is measured from brake application, including the held interval. These are simulator regressions, not real-vehicle braking ratings.

| Vehicle | Entry speed | Held speed | Distance |
|---|---|---|---|
| Wrangler Rubicon | 31.3 mph | 0.000 mph | 32.8 ft |
| Bronco Badlands | 40.5 mph | 0.000 mph | 54.4 ft |
| Civic Sport | 10.0 mph | 0.000 mph | 3.4 ft |
| Sprinter 2500 | 26.7 mph | 0.000 mph | 23.8 ft |
| Hummer EV SUV | 51.0 mph | 0.000 mph | 85.7 ft |

S is checked separately: it stops a forward-moving vehicle and continues braking instead of becoming reverse throttle. After releasing and holding S again at rest, physical reverse drive is required. Space must then stop the reversing vehicle too. The incline check uses contact forces bounded by tire grip and brake torque; it does not freeze chassis velocity. Hummer height measurements refer to the chassis/body reference above terrain, not underbody ground clearance.

## Rendered and interactive inspection

The first passing package exposed excessive garage fill light and a toolbar covering part of the front wheel. Both were corrected before the final package. All fifteen final front/side/rear preset captures were inspected. The live JPEGs provide the visual evidence for free orbit and the upgraded Hummer. Paint, glass, lamps, wheel geometry, air struts, body stance and toolbar legibility were reviewed. The queued native-garage-orbit.png samples the closing driving frame, and the first-frame native-hummer-lifted.png clips some Slate text; those two automated images are not used as UI evidence. The corresponding live JPEGs show the settled garage correctly.

Live desktop checks exercised left-drag orbit, scroll zoom, view buttons, vehicle selection and Hummer suspension stages. Arrow orbit and Page Down zoom were checked after clicking a child button; preview-key handling fixes the child-focus interception found during inspection. The original player garage was reselected before normal game exit and verified byte-for-byte afterward: selected Hummer, stock suspension, all other categories III. Automated saves use a separate Validation folder. See the interactive observations and screenshot paths in native-validation.json.

The model/reference decisions and manufacturer links are in [vehicle-model-research.md](vehicle-model-research.md). New geometry is authored from reference. No new manufacturer photograph or commercial mesh is distributed.

## Other simulation observations

At the matched throttle/duration, the stock engine reached 31.2 mph / 131.7 ft and stage III reached 47.1 mph / 242.0 ft. Reducing the sampled pressure from 37 to 16 PSI changed mean patch length from 3.94 to 6.44 in and mean grip from 0.4794 to 0.5561. These are model measurements, not setup advice or manufacturer calibration.

Final build/runtime logs contain no fatal or material-compilation errors. Non-fatal numeric-conversion, SSGI deprecation, input and procedural-mesh tangent notices remain. The machine-readable report records the executable, cooked-content and source hashes.

## Reproduce

    .\Tools\test-core.cmd
    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

Run Unreal in a normal Windows process context. A restricted process can exit before logging. Full material/model changes need a cook; code-only changes can reuse a valid cook with -SkipCook. Import and export reject missing/empty geometry and require fresh completion. Publication preparation checks the explicit source allowlist for credential-like values.

Final logs: Saved/package-vehicle-refinement-release3-console.log (full asset cook), Saved/package-vehicle-refinement-keyboard-console.log (final keyboard-focus correction), Saved/verify-vehicle-refinement-final-console.log, Saved/core-vehicle-refinement-console.log and Saved/Validation/packaged-game.log. Captures: Build/Windows/TerraDrive/Saved/Screenshots and the live paths in the JSON report. The earlier 140-case pass is retained under Saved/Validation/vehicle-refinement-first-pass.*; use the final fresh report for this release. Generated assets, builds, local saves, research PDF copies and private configuration are excluded from publication.

## Practical limits

This remains a playable migration preview. Tire/soil coefficients, chassis parameters, spring rates, recovery hardware and upgrades are simulator tuning. Tire contact uses finite analytical/mesh queries; flexible tire carcasses and frames are approximations. Solid rocks/logs are fixed; vegetation is nonblocking. Bodies, small badges, fonts, interiors and trim-specific stampings remain procedural approximations.

Full browser parity, every complete rocky route, uninterrupted full-loop traversal, factory driveline/calibration fidelity, detailed track animation, complete sign lettering, gamepad hardware and long-session performance/stability remain unproven. The tests verify starts and selected driving segments. Historical browser results are reference evidence; no fresh full browser-suite pass is claimed.
