# Native migration validation

Verified October 21, 2026 with Unreal Engine 5.8.3, Windows x64, DirectX 12 SM6 and NVIDIA GeForce RTX 4060 Laptop GPU. Launch Build/Windows/TerraDrive.exe and keep the complete Windows folder together.

## Final results

| Check | Result |
|---|---|
| Editor/runtime compile, import, full asset cook and Windows staging | Successful, exit 0 |
| Material cook | No shader fallbacks; build helper now rejects invalid material shaders |
| Packaged native checks | All 191 passed; fresh report and successful game exit |
| Standalone simulation | All 97 passed, including brake/reverse demand at 30/60/120 Hz |
| Export | 1,000 terrain samples, finite mesh data and stage-specific tire beads verified |
| Source assets | 217 meshes, 318 materials, seven layered terrain materials, 42 texture assets |
| Environment detail | 13,161 instances, including 1,073 solid details; 10,516 scanned rock/plant instances |
| Browser reference | All 189 files unchanged |
| Units | mph, feet/inches, pounds, pounds-force, PSI and US horsepower |
| Player garage | Original bytes preserved; live testing used an isolated save |

Final executable SHA-256: 01c82118c7afc372bdcb1f81691e2b14038e1437c26876eb778b80c245a92777.
The machine-readable [native-validation.json](native-validation.json) records all cases, source hashes and cooked-content hashes.

## Controls and lighting

S/Down brakes forward motion and then selects reverse after a continuous 0.65-second hold at a full stop. W/Up acts symmetrically when reversing. The gamepad triggers use the same demand resolver, with proportional reverse throttle after selection. Space and the bottom face button brake and hold, overriding drive input and suppressing gear changes. Controller hardware was not exercised; the analog resolver was tested at three frame rates.

The packaged checks require Space to stop all six physical vehicles while forward throttle remains held. They also require S to stop forward motion and produce physical reverse drive without a release, and Space to stop that reverse motion. The existing twelve-degree incline holding test passes.

Brake emitter materials illuminate during service braking and descent assist. Reverse emitter materials illuminate while reverse is selected. Thirty-six native assertions check both material roles across off/brake/reverse states on all six vehicles. All eighteen corresponding rendered captures were visually reviewed. These are simulator behavior checks, not factory lighting or braking certification.

## Tire marks and environment

Soft-ground tread impressions accompany physical rut deformation. Pavement rubber appears under longitudinal or lateral traction loss. The suite checks that ordinary pavement rolling and airborne tires leave no rubber, that marks remain after contact ends, that teleports break continuity, and that soil repair clears both marks and deformation. Existing soil-volume, pressure, flotation, seam continuity and rut-resistance checks continue to pass.

Final captures show pavement rubber, soft-ground tread/ruts, scanned rocks, vegetation clumps and photographic HDR clouds. The sky material's cube direction and sampler are connected explicitly; full-cook diagnostics confirm it compiles for both shader targets. Three photographic ground layers now supply their own normal detail. CC0 source records and manufacturer references are in [lighting-tracks-urus.md](lighting-tracks-urus.md).

## Vehicles, garage and persistence

The sixth vehicle is the original V8 Lamborghini Urus Performante, represented with steel coils, rear-biased AWD, rear steering, 22-inch rims and staggered tire widths. Its chassis coefficients and operating mass are estimates. All eighteen final front/side/rear model views were inspected, together with the Hummer lifted-height and actual garage-orbit captures. The earlier Hummer height, wheel-rotation, rim/bead and suspension checks continue to pass.

Live checks at 1600x900 exercised vehicle selection, drag orbit, scroll zoom, the upgrade menu and normal exit/restart persistence. The Urus engine menu showed 657 hp stock, then 775/920/1104 hp at stages I/II/III. Stage III suspension and tires visibly changed stance and tire diameter. These are simulator upgrade outputs. A legacy five-vehicle save loaded its original builds and added a stock Urus, then saved/reloaded the six-vehicle format. The original player garage remained byte-for-byte unchanged throughout.

## Reproduce and evidence

    .\Tools\test-core.cmd
    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

Run Unreal in a normal Windows process context. Full material/model changes need a cook; code-only changes may reuse a completed valid cook with -SkipCook. The build helper requires a fresh import marker and full-cook diagnostics. Source publication uses an explicit allowlist and rejects credential-like configuration values.

Final logs are Saved/package-lights-tracks-urus-sky-console.log, Saved/verify-lights-tracks-urus-final-console.log, Saved/Validation/packaged-game.log and Saved/core-lights-tracks-urus.log. The full geometry refinement build is recorded in Saved/package-lights-tracks-urus-final-console.log; its sky fallback was repaired by the later successful sky cook. An earlier 191-case pass is retained as Saved/Validation/lighting-first-pass.*.

Native captures are under Build/Windows/TerraDrive/Saved/Screenshots. Local inspection sheets are Saved/Validation/final-models-sheet.jpg and final-lamps-sheet.jpg. Local saves, logs, screenshots, research brochure copies, generated Unreal assets and Windows builds are excluded from the GitHub source publication. The vendored CC0 scan sources are included.

## Practical limits

Vehicles remain procedural approximations, including badges, interiors and fine body stampings. Factory active chassis, driveline calibration and every drive mode are not fully reproduced. Suspension, tires, soil, recovery hardware and upgrade parameters are simulator tuning.

Tire marks retain up to 4,096 segments during the current session, with oldest segments reused at capacity. Physical soil deformation has its own bounded tile pool. Marks are not stored in the garage save. Rocks are fixed scenery; plants are nonblocking.

Complete browser parity, every complete rocky route, uninterrupted full-loop traversal, detailed track animation, all sign lettering, controller hardware and long-session performance/stability remain unproven. The native checks cover starts and selected driving segments. No cause has been established for the earlier computer hard reboot.
