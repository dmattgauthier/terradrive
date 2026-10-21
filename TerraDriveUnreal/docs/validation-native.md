# Native migration validation

Verified October 21, 2026 with Unreal Engine 5.8.3 on Windows x64, DirectX 12 SM6 and NVIDIA GeForce RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe and keep the full Windows folder together.

## Recorded results

| Check | Result |
|---|---|
| Final compile, import, full cook and Windows staging | Successful; process exit 0 |
| Packaged game | All 87 checks passed with a fresh JSON report and successful game exit |
| Standalone simulation | All 63 checks passed, including imperial conversions, footprint area across grid phases and redline limits at 30/60/120 Hz; the light-bar follow-up leaves this C++ source unchanged |
| Assets | 163 mesh sources, 305 source materials, seven terrain materials and 26 textures |
| Scenery | 2,645 added detail instances, including 645 solid rocks/logs; 13 materials use individual instance colors |
| Browser source | All 189 reference files unchanged; 53 existing vendor/binary files preserved |
| Display units | mph, feet/inches, pounds, pounds-force, PSI and horsepower; raw diagnostics retain SI where named |
| Pressure comparison | 37 to 16 PSI changed mean contact length from 3.94 to 6.39 in and mean grip from 0.4803 to 0.5565 |
| Low-range wheelspin | 6426 RPM at the sampled point; powered rotation is constrained by delivered torque at redline |
| Contact geometry | Rigid support outside the tread width rejected; boulders and deadwood supply physical support |
| Ruts | Depth-dependent resistance and continuous deformation across tile seams passed |
| Engine comparison | Stock 31.2 mph / 131.6 ft; stage III 47.1 mph / 241.6 ft at identical throttle and duration |
| Vehicle models | All five vehicles load articulated suspension and upgrade models; armor visibility and live wheel-travel positions passed |
| Light-bar mounts | Eight brackets intersect the exported roofs across four applicable vehicles; corrected Wrangler inspected live in the garage and driving views |
| Existing behavior | Rollover/airborne control suppression, moving/expiring debris, locker comparison, controlled descent, loop/gap probes, eight route starts, upgrades, persistence and garage entry/exit passed |

The pressure and engine comparisons are game regressions, not real-vehicle setup recommendations or manufacturer calibration. The values above are from the fresh native run after the light-bar asset correction. The machine-readable report records every case, source hashes, the executable hash and the cooked-content hashes. Test saves use a separate Validation folder.

## Rendered inspection

Native engine captures were inspected for mph in the driving HUD, pounds/inches in the vehicle menu, detailed boulders/deadwood, revised vegetation, textured terrain and the loop view. Shrub geometry was refined from oversized shapes to thin curved leaves before the final package. Individual source instance colors are preserved through a vertex-interpolated path on the 13 scenery materials that use them.

Live desktop inspection completed at 1920x1080 after Windows was unlocked. The vehicle menu displays pounds and inches, and all seven upgrade rows fit. Suspension, tire, body and electrical stage III selections updated the Wrangler preview. Let's Drive, Tab and Escape returned correctly between the garage and driving. The first driving view exposed a light bar projecting ahead of the SUV roof. The generator now uses each model's actual roof position and body-to-CG offset, with visible mounting feet and brackets. After reimport and a full cook, the corrected Wrangler bar was inspected in both the garage and rear driving view and the complete 87-check native suite passed again. Eight roof intersections also verify bracket support across the Wrangler, Bronco, Sprinter and Hummer geometry; those other three corrected models were not separately inspected live. The original player garage was restored byte-for-byte after normal game exit. Live captures are Saved/live-imperial-mounted-vehicle.jpg and Saved/live-imperial-mounted-driving.jpg.

Final build and runtime logs contain no fatal or material-compilation errors. Existing SSGI deprecation, Enhanced Input notices and numeric-conversion compiler warnings remain non-fatal. This is not a frame-time benchmark or a long-session stability claim.

## Reproduce

    .\Tools\test-core.cmd
    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

Run Unreal in a normal Windows process context. Full material/model changes need a cook; code-only changes can reuse a valid cook with -SkipCook. The importer checks per-mesh source hashes, fresh completion and saved map. It waits for the commandlet process directly and rejects failed imports. Upload preparation checks the explicit source allowlist for credential-like values.

Final logs: Saved/package-lightbar-mount-console.log, Saved/verify-lightbar-mount-console.log, Saved/core-imperial-console.log and Saved/Validation/packaged-game.log. Captures: Build/Windows/TerraDrive/Saved/Screenshots and the live capture paths above. Generated assets, builds, local saves and private configuration are excluded from publication.

## Practical limits

This remains a playable migration preview. Tire/soil coefficients, chassis parameters, recovery hardware and upgrade stages are simulator tuning. Contact uses finite analytical/mesh queries, not a fully deformable tire or flexible frame. Scenery rocks/logs are fixed solid obstacles; vegetation is nonblocking. Vehicle details are procedural additions to the preserved reference bodies.

Full browser parity, every complete rocky route, uninterrupted full-loop traversal, factory driveline/calibration fidelity, detailed track animation, all sign lettering, gamepad hardware and long-session stability/performance remain unproven. The tests verify collision, starts and selected driving segments. Historical browser results are reference evidence; no fresh full browser-suite pass is claimed.
