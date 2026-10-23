# Native migration validation

Verified October 23, 2026, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with the complete Windows folder.

| Check | Result |
|---|---|
| Terrain material import and full cook | Successful; no invalid material fallback |
| Final C++ compilation and staging | Successful against the accepted material cook |
| Packaged native suite | 286/286 pass at 20 FPS; fresh report and actual process exit 0 |
| Terrain boundary checks | 53/53 pass; 14 fresh captures covering seven boundaries |
| Offline terrain coverage | All 2,563,201 samples normalized; CPU field/texture-source channel parity passes |
| Controlled axle-locker comparison | 3/3 focused checks pass; same stock setup and repaired ground before each attempt |
| Preset samples | Cool and capped Quality smoke: 16 checks each, exits 0 |
| Independent simulation core | 143/143 pass |
| Previous rock update | 69/69, 44 views and 17 closed source LOD meshes in commit 8c851a6; rock meshes unchanged |
| Previous model round | 42 close-art and 30 garage checks in commit bc131f5; vehicle geometry unchanged |
| Browser, player garage and graphics settings | Preserved; all 1,214 local browser file hashes match |

Executable, cooked-content, source and inspected capture SHA-256 values, exact cases and phase-specific GPU samples are recorded in [native-validation.json](native-validation.json).

## Terrain and visual review

The [terrain transition update](terrain-transitions.md) gives natural ground irregular fringes and keeps pavement shoulders narrower. Seven coverage channels blend color, normal detail and roughness across the same world coordinates on coarse ground and deformable tiles. Grip and rolling resistance grade through the underlying coverage field; rock and pavement retain rigid substrates. All seven terrain types keep pure interiors. About 4% of sampled ground lies in mixed fringes.

The final review covers 14 native boundary captures, six driven-soil captures, six live-physics firm-ground captures and two preset views. Snow thins into exposed-ground patches, sand breaks into the adjacent ground, mud/marsh margins remain distinct and stony surfaces blend into their surroundings. The accepted blend uses patches at several scales within the fringe. The original terrain geometry and source surface IDs are unchanged.

Driven soil captures still show light hard-dirt trails, mud/soft-dirt grooves and side berms, snow compaction and sand tracks. Rubber marks remain pavement-only; loaded tire footprints crush vegetation. These are driven samples, not universally calibrated soil depths.

The preceding [coachwork round](model-refinement-6.md) and [rock/GPU update](rendering-and-gpu.md) retain their own detailed evidence. Vehicle reconstructions remain below production racing-game precision. Original acquired pack assets, vehicle glazing, grass masks and repaired rock geometry are unchanged in this transition round. The project uses installed MW landscape, Automotive Winter Scene and quarry assets through project-owned integration recipes.

## Driving and contact

The full suite checks braking and held-input reverse on all six vehicles, Space braking, lights, wheel rotation, HUMMER ride height, upgrades, garage orbit, isolated saves, rollover grip inhibition, moving debris, lockers, descent and course starts. The stock Urus completes all 20 Slate Rim gates continuously using ordinary throttle and steering input.

The firm-ground regression queries the cooked Axlebreaker ledges and verifies all six vehicles settle above the quarry floor and reverse out of banked compression. The axle comparison repairs soil and resets to the same stock setup before both trials, so the locked trial does not inherit disturbed ground from the open trial. Its climb-advantage and coupled-shaft criteria are unchanged. Use `Tools/verify-native.ps1 -LockersOnly` to reproduce that comparison.

## Rendering load and reproduction

Cool remains the default at 30 FPS / 75% internal resolution; Balanced is 45 FPS / 85%; Quality is 60 FPS / 100%. Garage previews cap at 20 FPS and background rendering at 15 FPS. Small MW grass clumps retain shorter draw distances and do not cast shadows. Terrain interaction and solid obstacles remain available in all presets.

At the stationary 1920×1080 quarry viewpoint, the ~25-second Cool sample measured 30.00 FPS, 34.5% average GPU utilization, 18.0 W and a maximum of 56°C. Quality was checked at a separate 20 FPS cap: 20.00 FPS, 34.0% utilization, 15.3 W, maximum 56°C. The GPU fixture freezes its vehicle before suspension settling; its pose is not ground-clearance evidence. Firm-ground cases use live physics separately.

The final full driving run recorded 353 GPU observations at a 20 FPS cap, maximum 58°C, averaging 29.1% utilization and 8.8 W. No accepted run reached the conservative 77°C cutoff. The preset views and terrain material were checked after the accepted asset cook; the subsequent C++ change isolates the locker verification setup without changing rendering or vehicle simulation. These are short scene/run observations, not whole-map performance averages, long-session stability proof or a diagnosis of prior PC reboots. Normal 60 FPS Quality thermals were not tested.

Add acquired packs as described in [realism-terrain.md](realism-terrain.md), then run `Tools/build-native.ps1 -ImportAssets -Package`, `node Tools/validate-terrain-transitions.mjs`, `Tools/verify-render.ps1 -Mode Transitions`, Cool/QualitySmoke modes, `Tools/verify-native.ps1 -LockersOnly`, `Tools/verify-native.ps1` and `Tools/test-core.cmd`. Asset or material changes require a full cook. C++-only changes can stage with `-SkipCook` after an accepted asset cook. Validation isolates player garage and graphics settings. Player displays use imperial units; diagnostic JSON documents internal SI values.

Only Slate Rim is verified as a full uninterrupted route. Other complete routes/loop traversal, controller hardware and long-session stability remain unproven. Fourteen boundary views sample representative map edges. The original surface classification still controls tire-mark type and deformation, with visual patch coverage and graded traction averaged through the fringes. This round uses automated native driving and engine-generated captures without a separate manual desktop/controller session.

Raw acquired Epic/Fab assets, generated builds, saves and private configuration stay local. The public repository contains original source, preserved browser assets, integration recipes and verification metadata.
