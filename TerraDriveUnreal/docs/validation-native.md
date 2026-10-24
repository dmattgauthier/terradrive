# Native migration validation

Verified **2026-10-24T01:33:49.948Z**, Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with the complete Windows folder. This acceptance covers the winter, momentum, ground-detail and vehicle round; the preceding published build is linked below as history.

Executable SHA-256: `ebd05c41b0aa96964b134de27ff7de216a9c1762cb0b52c5d752048b46edf7d0`.

| Check | Result | Verified PNG output pixels | Dimension-checked captures |
|---|---|---|---|
| Full native regression | 287/287 | 1280 × 720 | 22 |
| Snow/grass detail | 15/15 | 1600 × 900 | 6 |
| Momentum/suspension | 84/84 | 1600 × 900 | 13 |
| Complete winter scene | 46/46 | 1600 × 900 | 6 |
| All-six close art | 42/42 | 1600 × 900 | 36 |
| Terrain transitions | 53/53 | 1920 × 1080 | 14 |
| Cool preset | 16/16 | 1920 × 1080 | 1 |
| Balanced preset | 16/16 | 1920 × 1080 | 1 |

All listed native processes exited with code 0 and produced all-passing reports newer than **both the final executable and the accepted asset cook**. The independent simulation core passes **200/200**, including 32 sustained loaded-axle cases. Accepted full asset cook: `Saved/winter-scan-final-build.log`; final C++ build/stage: `Saved/winter-code-accepted.log`. Earlier ground-material and pre-opacity scan cooks are retained only as asset history. Material/shader diagnostics are clean. [native-validation.json](native-validation.json) records the exact cases, report/executable hashes, cooked-content and native-data hashes, final source fingerprints, GPU samples and explicitly reviewed capture hashes.

The PNG sizes above are read from their actual IHDR headers. They are output pixels after upscaling, separate from the configured internal screen percentages: Cool 75%, Balanced 85%, Quality 100%. Garage and background frame caps remain 20 and 15 FPS. The reviewer explicitly inspected **99 captures**: 36 model, 6 ground-detail, 6 winter-scene, 13 movement, 14 boundary and 24 other full/preset views. Dimension checks alone are not visual acceptance.

## Momentum and suspension

Seven unpowered coasts cross actual terrain coverages near 27 mph. All preserve rolling momentum; the lowest observed remaining speed is **20.4 mph**. The largest recorded per-frame loss is **4.0%**, and peak measured boundary deceleration is **0.90 g**, below the 1.5-g guard. Six stock vehicles traverse the rounded 5.5-inch rise near 18 mph and brake. The solid-barrier case still stops an unbraked vehicle through a real chassis collision.

The clearance checks transform **337 actual source vertices** covering lower bodywork and the underbody. The lowest sampled rise/braking clearance is **1.00 inches**. Acceptance permits up to **1.2 inches** of transient penetration; sparse point samples and these bounded scenarios do not prove clearance of every polygon or momentum behavior on every hill. Spring and damper values remain simulation calibrations. See [momentum-and-suspension.md](momentum-and-suspension.md) for the geometry, fixtures and numerical limits.

The full regression retains brake/reverse/light, garage, upgrade, rollover, locker, soil, hard-ground and challenge checks. It drives all 20 Slate Rim gates continuously with the stock Urus. Other complete challenge routes and full loop traversal remain unproven.

The focused locker proof also passes **4/4**. Both virgin-soil stock-Jeep trials request the same low-side line **19.7 inches** from the original course center, with equal two-second brake settles, fourteen-second drives and ordinary player-range steering. The centered candidate physically high-centered the modeled running board on the rock ledge; differential locks cannot remove that body support. The shared line and terrain-relative starting height change while the vehicle geometry, physical collision, progress and coupling criteria remain intact. The full run records open/locked progress of **28.4 / 36.9 feet**. The original requirements remain more than 1.64 feet of locked-axle advantage and more than 26.25 feet of locked progress. Automated steering input is reset after the comparison so later independent fixtures do not inherit it.

The final physical check operates at **every observed settle/drive pose**. All four finite tire cylinders must stay in the continuous course strip, **8.50 feet to either side of the original course center**. The imported body OBB must clear all **eight real finite gateposts**, using their actual cooked top-cap traces, **4.92-foot** heights and **6.30-inch** radii plus an approximately **0.04-inch** guard. Source OBJ geometry independently confirms all traced post bases/tops within **0.04 inches**. Body overhang between finite posts is valid; its lateral extreme is diagnostic rather than an invisible wall.

Full-run open/locked minimum **tire-strip** clearances are **15.09 / 9.81 inches**, from **312 / 310 finite pose samples**, with **2496 / 2480 body/post checks and zero overlaps**. Runtime requires nonnegative tire clearance, at least 240 poses per trial and eight real-post checks per pose. Final proof additionally requires a tire margin of approximately **0.04 inches** to cover the stock cylinder's sub-millimetre tread approximation. The original route spawn anchors both progress and the absolute strip; neither is recentered on the biased target. This does not prove absence of interior rock contact or completion of every climb.

The focused braking run passes **18/18** on the same final executable: launch and Space braking in all six stock vehicles, continuous S braking into reverse, release/reapplication in reverse, Space holding while S remains pressed, and speed/creep limits on a twelve-degree incline. It reuses the full suite's fixtures and numerical limits. The continuous sequence begins **131 feet** farther along the same clear pavement so its reverse leg stays on pavement; the separate incline fixture remains unchanged. Position, velocity, wheel surface/contact and once-per-second Space-hold diagnostics remain in the JSON evidence. The final full run follows both focused brake and locker runs so the generic GPU telemetry belongs to that full run.

A genuine drivetrain fault was also corrected: a second, global torque fade used the previous frame's RPM after the wheel/axle limiter had already bounded redline torque. Under load it could alternate requested drive and zero drive on successive frames. Removing that duplicate cut preserves the engine torque curve and the existing per-wheel/per-axle RPM cap. The 32 additional core cases exercise a loaded locked axle for two seconds in forward/reverse at 20/30/60/120 simulation updates per second, checking the RPM cap, sustained contact traction, wheel-inertia/tire-reaction/drag torque balance and the engine-request bound. Those standalone primitive checks supplement the final native driving results; they are not measurements of engine hardware.

## Winter, ground and model inspection

The complete acquired Automotive Winter Scene is playable through the generated Winter Expedition map. Native verification checks the authored landscape, at least 460 static mesh actors, 18 cinematic cameras, 10,646 foliage/snow-clump instances and the visible lighting sublevel. It travels into the map and back, checks vehicle/upgrade/pressure transfer, and exercises support, acceleration, braking and brake lamps at four starts. Runtime diagnostics identify **18 wind-effect sheet components made non-colliding**; those visual effects had intercepted road contact. Physical road/rock collision remains active.

The final six scene captures include four road starts and visually reviewed distinct coast/quarry overviews. A delayed camera handoff corrects the preceding duplicate overview capture; the old review and image hashes remain separate under `captureHistory`, rather than being counted as final viewpoints.

All **49 internal road joins / 441 footprint queries** retain finite packed-snow road support. A hit on landscape beneath a missing road does not pass. The approximately **3,943-foot** authored road has **not** been continuously driven end to end. Its original landscape retains static collision/materials and currently receives no excavated native rut mesh. Native proving-ground snow remains deformable. See [winter-level.md](winter-level.md).

The proving ground uses bounded resident snow/grass scan copies, wind-shaped relief, acquired snow banks and slushy fringes. Native drift waves span roughly 12–120 feet; summer grass cards are suppressed in snow-dominated areas. The reviewed ground and transition views cover representative locations, not every map edge. [winter-ground-detail.md](winter-ground-detail.md) describes the authored effect and its separate landscape limitation.

The scenery import also corrects the glTF-to-OBJ V-coordinate convention that sampled empty black parts of scan atlases. The preserved offline proof compares **37 changed scan OBJs / 207,278 UV records**, with U unchanged and V precompensated as `1−V`; positions, normals, faces, material assignments and record counts stay unchanged. The other **201 OBJs** and original acquired glTF/textures/maps remain intact. All seven NativeData files are unchanged before import. Import then adds only the separately declared winter-manifest count of 18 already non-colliding wind visuals; terrain/world/probe data remain byte-identical. The post-import proof repeats the preservation checks. Final native reports, image reviews and cooked-content hashes belong to the recooked scan revision; pre-correction captures are kept as history.

The scanned grass also receives its missing **original Poly Haven CC0 opacity map** (648,718 bytes, SHA256 `711a8e49af758d6a6ce1f610db858899a27be19da6d1866bd35c13bc7b8ffeff`). Its red channel now cuts out the grass blades through a masked material at a 0.5 threshold, removing opaque rectangular atlas backgrounds. This separate material-only step changes exactly the two declared M_346 import fields, adds one pinned vendor PNG and one manifest record, and preserves all **238 OBJs**, all seven post-scan NativeData files and prior vendor sources. The native importer records the red-channel binding and unchanged protected meshes/maps; final screenshots are reviewed after the alpha asset cook. Source and license: [Poly Haven grass_medium_01](https://polyhaven.com/a/grass_medium_01), [CC0 terms](https://polyhaven.com/license).

The model review includes all six vehicles and the Urus's real bonnet openings, recessed hatch plate well and thicker spoiler. Wrangler/HUMMER/Bronco details and all six factory tires/wheels are refined; Civic and Sprinter body shapes retain the preceding reconstruction. These remain reference-built approximations below production racing-game/Forza precision, with further body, UV, interior and LOD work needed. See [model-refinement-7.md](model-refinement-7.md).

## Measured GPU load and limits

Preset samples use the same stationary quarry viewpoint and actual **1920 × 1080 output PNGs**. Internal rendering uses the selected preset percentage. Cool/Balanced native limits are 30/45 FPS; these short windows are not whole-map averages.

| Preset | FPS cap | Measured FPS | Measured phase / GPU observations | Mean GPU | Mean power | Phase max / run max |
|---|---|---|---|---|---|---|
| Cool | 30 | 29.98 | 25.0 s / 23 | 39.0% | 27.0 W | 64°C / 64°C |
| Balanced | 45 | 44.97 | 25.0 s / 23 | 64.0% | 38.1 W | 70°C / 70°C |

The full 20-FPS run records **371 GPU observations**, maximum **59°C**, mean **28.2%** utilization and **9.0 W**. Accepted runs remain below the conservative 77°C cutoff. These capped runs do not establish long-session stability, normal 60-FPS Quality thermals or the cause of earlier whole-PC reboots. Older performance numbers are historical observations, not a controlled comparison to these IHDR-verified output sizes.

## Preservation and reproduction

All **1,214 browser files**, the player's garage and graphics settings, the two original acquired winter maps and the original terrain field are preserved against the fresh checkpoint. Final fingerprints are in the JSON preservation record. Epic's acquired packs, generated builds, saves and private configuration remain local; public source contains the preserved browser assets, native code, pinned CC0 source assets, integration recipes and verification metadata.

After installed packs/import and a full cook, reproduce with `Tools/verify-winter.ps1 -Mode Detail`, `Movement`, `Winter` and `Art`; `Tools/verify-render.ps1 -Mode Transitions`, `Cool` and `Balanced`; `Tools/verify-native.ps1 -LockersOnly`, `-BrakeOnly`, then the full `Tools/verify-native.ps1`; and `Tools/test-core.cmd`. Use isolated saves, existing frame/temperature limits and sequential game/editor/cook execution. Material changes require a new full cook. Player displays use imperial units; diagnostic JSON identifies SI fields.

This round uses automated driving and engine-generated captures without a separate manual desktop/controller session. Historical acceptance for commit [11d97ed](https://github.com/dmattgauthier/terradrive/blob/11d97ed04f8bb453f5beedfa36d778d83a9eb478/TerraDriveUnreal/docs/validation-native.md) is retained separately under `history` in the JSON and at that published revision; it is not evidence for the new executable.

## Failed candidates retained separately

| Archived candidate | Passing checks | Failed cases |
|---|---|---|
| First completed winter regression | 284/286 | locked axles climb farther than open axles; Space stops and holds while S requests reverse |
| Earlier centered locker comparison | 3/4 | locked axles climb farther than open axles |
| Centered locker comparison with body-contact diagnostics | 3/4 | locked axles climb farther than open axles |
| Low-side locker comparison before torque correction | 2/4 | locked axles climb farther than open axles; both locker trials stay inside the gate corridor |
| Torque-corrected locker comparison with nominal center-point corridor | 3/4 | both locker trials stay inside the gate corridor |
| Full-steer locker comparison with continuous body-strip guard | 3/4 | both locker trials keep actual body and tires inside the gate corridor |
| Discarded rollback-controller experiment with continuous body-strip guard | 3/4 | both locker trials keep actual body and tires inside the gate corridor |

These candidates are excluded from final acceptance. The JSON's `failedCandidates` records their archived report/log locations, hashes and failed cases, including the earlier locker and reverse/Space failures. No preserved executable fingerprint accompanies those candidate archives, so they are not assigned the final executable's identity. The centered locker archive retains the real rock-deck/ChaosChassis contact diagnostics. Later center-point and continuous-body-strip candidates failed their historical proxies; those failures do not establish real finite-post collisions. The discarded body strip incorrectly rejected valid roof/mirror overhang between widely separated posts. The rollback controller experiment was reverted; final verification uses the ordinary full-range forward-input controller, tire course bounds and guarded finite-post/body-OBB checks. Their historical failed values remain unchanged in the JSON.
