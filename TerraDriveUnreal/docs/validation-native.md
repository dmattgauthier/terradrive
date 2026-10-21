# Native migration validation

Verified October 21, 2026 with Unreal Engine 5.8.3 on Windows x64, DirectX 12 SM6 and NVIDIA GeForce RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe and keep the full Windows folder together.

## Recorded results

| Check | Result |
|---|---|
| Final compile, import, full cook and Windows staging | Successful; process exit 0 |
| Packaged game | All 87 checks passed with a fresh JSON report and successful game exit |
| Standalone simulation | All 63 checks passed, including imperial conversions, footprint area across grid phases and redline limits at 30/60/120 Hz |
| Assets | 163 mesh sources, 305 source materials, seven terrain materials and 26 textures |
| Scenery | 2,645 added detail instances, including 645 solid rocks/logs; 13 materials use individual instance colors |
| Browser source | All 189 reference files unchanged; 53 existing vendor/binary files preserved |
| Display units | mph, feet/inches, pounds, pounds-force, PSI and horsepower; raw diagnostics retain SI where named |
| Pressure comparison | 37 to 16 PSI changed mean contact length from 3.94 to 6.37 in and mean grip from 0.4807 to 0.5566 |
| Low-range wheelspin | 4675 RPM at the sampled point; powered rotation is constrained by delivered torque at redline |
| Contact geometry | Rigid support outside the tread width rejected; boulders and deadwood supply physical support |
| Ruts | Depth-dependent resistance and continuous deformation across tile seams passed |
| Engine comparison | Stock 31.1 mph / 130.9 ft; stage III 47.2 mph / 242.4 ft at identical throttle and duration |
| Vehicle models | All five vehicles load articulated suspension and upgrade models; armor visibility and live wheel-travel positions passed |
| Existing behavior | Rollover/airborne control suppression, moving/expiring debris, locker comparison, controlled descent, loop/gap probes, eight route starts, upgrades, persistence and garage entry/exit passed |

The pressure and engine comparisons are game regressions, not real-vehicle setup recommendations or manufacturer calibration. The machine-readable report records every case, source hashes and the executable hash. Test saves use a separate Validation folder.

## Rendered inspection

Native engine captures were inspected for mph in the driving HUD, pounds/inches in the vehicle menu, detailed boulders/deadwood, revised vegetation, textured terrain and the loop view. Shrub geometry was refined from oversized shapes to thin curved leaves before the final package. Individual source instance colors are preserved through a vertex-interpolated path on the 13 scenery materials that use them.

The live desktop control tool returned "failed to activate captured window" after a refreshed binding and showed only wallpaper. Live UI input was stopped; no new live mouse/keyboard verification is claimed for this pass. The packaged native suite did verify garage freeze/cursor/exit, persistence and upgrade effects. Previous live menu/persistence checks remain historical evidence. The displayed native captures are from the final package.

Final build and runtime logs contain no fatal or material-compilation errors. Existing SSGI deprecation, Enhanced Input notices and numeric-conversion compiler warnings remain non-fatal. This is not a frame-time benchmark or a long-session stability claim.

## Reproduce

    .\Tools\test-core.cmd
    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

Run Unreal in a normal Windows process context. Full material/model changes need a cook; code-only changes can reuse a valid cook with -SkipCook. The importer checks per-mesh source hashes, fresh completion and saved map. It waits for the commandlet process directly and rejects failed imports. Upload preparation checks the explicit source allowlist for credential-like values.

Final logs: Saved/package-imperial-release-console.log, Saved/verify-imperial-final-console.log, Saved/core-imperial-console.log and Saved/Validation/packaged-game.log. Captures: Build/Windows/TerraDrive/Saved/Screenshots. Generated assets, builds, local saves and private configuration are excluded from publication.

## Practical limits

This remains a playable migration preview. Tire/soil coefficients, chassis parameters, recovery hardware and upgrade stages are simulator tuning. Contact uses finite analytical/mesh queries, not a fully deformable tire or flexible frame. Scenery rocks/logs are fixed solid obstacles; vegetation is nonblocking. Vehicle details are procedural additions to the preserved reference bodies.

Full browser parity, every complete rocky route, uninterrupted full-loop traversal, factory driveline/calibration fidelity, detailed track animation, all sign lettering, gamepad hardware and long-session stability/performance remain unproven. The tests verify collision, starts and selected driving segments. Historical browser results are reference evidence; no fresh full browser-suite pass is claimed.
