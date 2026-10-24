# Terrain momentum and suspension

The final packaged build passed **84/84 focused movement checks** and **287/287 full native regression checks**, verified **2026-10-24T01:33:49.948Z**. Seven unpowered boundary coasts retain momentum, all six stock vehicles cross the rounded rise and brake, and a solid barrier still stops the vehicle. These are bounded native fixtures, supported by **200/200** independent core checks; they do not guarantee every terrain encounter. Executable SHA-256: `ebd05c41b0aa96964b134de27ff7de216a9c1762cb0b52c5d752048b46edf7d0`.

## Implemented response

The low chassis collider formerly extended across most of the vehicle as one flat box. It could meet a hill with its square front edge before the tires had rolled onto the slope. The central undertray now ends near the axles, with raised front and rear collision sections covering the overhangs. All three sections still block physical objects.

The undertray uses a low-friction physical material so incidental belly contact can slide along a crest. Tire grip continues to come from the tire solver and each terrain surface. The roof retains its prior material response. This change does not reset vehicle velocity or disable collisions. Gravity, tire drag, loose soil, braking and object impacts can still remove momentum; gradual slowing on a climb is expected.

Suspension bump travel now varies with the vehicle's estimated wheel travel and its upgrades. A progressive rubber stop engages near full compression. A final unilateral travel constraint limits further compression by applying a bounded support force through the actual rigid body. A high-speed compression valve reduces sharp damper impulses, while normal articulation, static support and rebound damping retain their previous response. These are simulation calibrations, not measured manufacturer damper curves.

The suspension display meshes use the revised compression limits. Hit telemetry separates terrain contact from solid objects and records the largest collision impulse relative to vehicle mass. The complete winter level uses the same vehicle collision and suspension code.

## Standalone verification

`Tools/test-core.cmd` passes **200 native simulation core checks**, including 25 suspension/momentum additions and 32 sustained loaded-shaft checks for this round. The additions cover:

- Loaded ride height at 120, 30, 20 and 10 simulation updates per second.
- Normal articulation and rebound damping below the bump-stop region.
- Compression damping response to a sharp terrain edge.
- A temporary 2.2-g equivalent load pulse, bounded full-bump compression and return to the original ride height.
- Different bump travel for the sedan and HUMMER, and additional usable compression travel with suspension upgrades.
- Coasting through a large change in rolling resistance using the actual wheel solver, retaining momentum while losing energy to tire drag.
- Loaded locked axles at the engine speed limit in forward and reverse, at 20, 30, 60 and 120 simulation updates per second. The checks require sustained traction, the RPM cap, conservation of wheel inertia/tire/drag torque, and drive torque no greater than the engine request.

In the standalone 20-update-per-second load-pulse probe, peak spring compression decreased from **19.2 inches to 12.7 inches**, including **6.1 inches** of static spring preload. The spring then returned to its initial loaded height. Spring compression includes the static preload and is not the same as body dive or wheel travel about ride height. This is numerical core evidence, not a measurement from the rendered Unreal game.

The drivetrain now uses the implicit per-wheel or per-axle speed limiter once. The prior additional global torque fade used the previous frame's shaft RPM and could cut all drive torque when a loaded locked axle reached redline. That produced alternating drive and coast frames during the native cross-axle climb. The existing implicit limiter can maintain tire reaction torque at the RPM cap while respecting the actual engine curve and throttle request. No tire grip or engine torque rating was increased for this correction; bounded native climbing results are recorded below, while other full challenge routes remain unproven.

## Verified native movement checks

`-TerraMomentumOnly` dispatches the separate `TerraMomentumValidation` helper through the normal native verification report. Its 84 passing checks exercise the actual pawn, scene queries, tire forces and Chaos collisions:

1. Seven terrain-boundary coasts begin near **27 mph**, with zero throttle and brake. They measure complete crossings, remaining speed and speed change between frames. Both terrain coverages must be encountered without hitting a solid object. The sudden-deceleration guard is **1.5 g**.
2. All six stock vehicles begin near **18 mph**, cross a rounded **5.5-inch-high, 7.9-foot-long** rise and then brake. The suite records compression relative to loaded ride height, body pitch, lower collision-shape clearance, actual coachwork clearance and stopping speed. Coachwork checks allow a maximum **1.2-inch** penetration tolerance for the sampled contact/mesh response.
3. An unbraked vehicle begins near **22 mph** and meets a solid barrier, checking that a real collision still stops it.

Thirteen screenshot requests accompany these probes. `TERRA_MOMENTUM_BOUNDARY`, `TERRA_MOMENTUM_SUSPENSION` and `TERRA_BODY_CONTACT` records preserve the numerical evidence. The run must use the original proving ground, the existing conservative frame cap and GPU temperature monitor. It must not overlap an editor, importer, cook or other game process.

The shortest crossing was extended to provide more than 12 observation frames at the capped test rate. The sand crossing was moved **9.8 feet** along the same boundary to clear an existing boulder; its endpoints retain dirt and sand. The mud/rock fixture crosses a narrow rock patch and returns to mud, so coverage is sampled along each travelled segment rather than inferred from its final position alone. These are fixture corrections; momentum and collision requirements were retained or strengthened.

## Actual body-surface probes

Run `node Tools/bake-vehicle-ground-probes.mjs` after exporting models. It creates the staged native data file `Content/NativeData/vehicle-ground-probes.json` from the actual six coachwork OBJs, without modifying their geometry or materials. The current output contains **337 surface points**: 60 for each of the first five vehicles and 37 for the Urus. They cover front/rear lower panels, both skirts and the underbody.

Each point is a real source vertex selected from spatial bins. Its source vertex index and the complete model's SHA256 are recorded. The generator verifies the export manifest, finite dimensions, coverage, point counts and source stability during extraction. It applies the same OBJ Y reflection as Unreal's Interchange importer. Runtime verification must transform these mesh-local points with the Body component before comparing them against the ground and the test rise.

These samples address an important gap in the old clearance test: several vehicles' collision undertrays sit higher than their lowest visible body panels. They provide stronger clipping evidence than the collision bounds alone. They are still a sparse sample, so native captures remain part of acceptance.

<!-- WINTER_NATIVE_RESULT_BEGIN -->
The accepted movement report is `Saved/Validation/winter-Movement.json`, SHA-256 `0f26576fb22f4b04e9fe98dc32ff5b203397477d8fd68849188fba13a41e9c80`; its native process exited 0. All **13 movement captures** are explicitly reviewed at IHDR-verified **1600 × 900 output pixels**, separate from the configured internal rendering percentage. The complete case list, final source/cooked hashes and reviewed image hashes are in [native-validation.json](native-validation.json).

Seven boundary coasts retain at least **20.4 mph**; the maximum observed frame speed loss is **4.0%**, with peak boundary deceleration **0.90 g**. Native clearance results below come from the **337 sparse source-vertex probes**; negative values indicate limited transient penetration within the **1.2-inch** acceptance tolerance, not proof of whole-mesh clearance.

| Stock vehicle | Lowest rise clearance | Lowest braking clearance | Peak pitch |
|---|---|---|---|
| Wrangler Rubicon | 8.34 in | 5.82 in | 7.2° |
| Bronco Badlands | 8.20 in | 6.23 in | 7.2° |
| Civic Sport | 3.64 in | 3.53 in | 5.2° |
| Sprinter 2500 | 5.75 in | 4.87 in | 4.9° |
| HUMMER EV SUV | 5.46 in | 3.62 in | 6.7° |
| Urus Performante | 4.08 in | 1.00 in | 5.3° |

The complete authored winter map has separate **46/46** checks: four short drive/brake starts, real entry/return travel and **441 tire-support queries at 49 internal road joins**. Runtime filtering makes **18 Wind FX sheet components** non-colliding. The whole winter road has not been continuously driven, and its original landscape is not excavated. Short capped thermal runs do not establish long-session stability or diagnose previous reboots. Failed candidates remain separate from this final acceptance.

The **4/4 focused locker checks** and full regression require all four finite tire cylinders to stay inside the continuous course strip, **8.50 feet either side of the original course center**, and the actual imported body OBB to clear all **eight real finite guarded gateposts** at every observed settle/drive pose. Both runs use the same 19.7-inch low-side offset, equal two-second settled starts, fourteen-second drives and ordinary player-range steering. Progress stays anchored to original Route.Spawn, and the original locked-axle progress/coupling criteria remain unchanged. Full-run minimum open/locked tire clearances are **15.09 / 9.81 inches**, with **2496 / 2480 body/post tests and zero overlaps**. Final proof requires an additional tire margin of approximately **0.04 inches**. Actual cooked post caps are cross-checked against independent OBJ geometry. Body overhang between finite posts is permitted; the earlier nominal center-point and continuous-body-strip proxy failures remain separate historical outcomes. The rollback experiment was reverted. The **18/18 focused braking checks** reuse the full suite's all-six launch/Space, continuous reverse and twelve-degree incline fixtures. These bounded scenarios do not prove every possible climb, object encounter or brake application.

The runtime also removes a duplicate global fade based on the previous frame's redline RPM, which could alternate full and zero drive under load. The engine curve and existing implicit wheel/axle RPM cap remain. The **200/200** standalone core checks include 32 sustained loaded locked-axle cases over two seconds at forward/reverse and 20/30/60/120 simulation updates per second, supplementing the native results without asserting manufacturer calibration.
<!-- WINTER_NATIVE_RESULT_END -->
