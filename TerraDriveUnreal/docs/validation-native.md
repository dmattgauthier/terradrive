# Native validation — steering and front coachwork pass 16

The current Windows package passes **3,331/3,331 native checks** and **1,643/1,643 portable checks**. **434 fresh native captures were actually reviewed**. All native results below bind to the same final executable and full asset cook. The final C++ producer inventory contains 131 Source/Tools/Config/project files, all unchanged after the final stage. The complete cook5 retains its own immutable source inventory; a later native C++ stage changes four source files for loaded-contact brake holding, the automatic driver and portable coverage, preserving the other 127 producer files and all cooked assets byte-for-byte. Evidence was assembled **2026-10-29T01:19:47.366806+00:00**; the machine-readable record is [native-validation.json](native-validation.json).

| Native mode | Passed | Captures reviewed | Highest sampled GPU temperature | Clock |
| --- | ---: | ---: | ---: | --- |
| Art | 99/99 | 90 | 59°C | real time |
| Turning | 572/572 | 20 | 62°C | fixed 20 Hz simulation |
| TurningRealTime | 572/572 | 20 | 60°C | real time |
| Full | 344/344 | 109 | 63°C | fixed 20 Hz simulation |
| Mechanical | 500/500 | 18 | 58°C | real time |
| Movement | 111/111 | 16 | 64°C | fixed 20 Hz simulation |
| Rollover | 465/465 | 58 | 59°C | real time |
| ElectricPressure | 279/279 | 36 | 58°C | real time |
| Ruts | 117/117 | 16 | 54°C | real time |
| Spray | 44/44 | 6 | 54°C | real time |
| Damage | 228/228 | 45 | 57°C | real time |

Portable checks comprise **648 simulation**, **300 electric/pressure**, **47 damage**, and **648 spray response** checks. Focused source validation additionally passes **93 G-Class**, **10 Wrangler**, **88 expedition**, and **20 proving-ground-only** assertions; these source assertions are not added to the native or portable totals. All-nine body geometry, normals, openings and wheel checks pass.

## Full-lock wheel motion

The old tire solver could allocate all available contact friction to sideways force at full lock, leaving no rolling reaction to overcome wheel drag. The new bounded combined-slip calculation solves lateral and longitudinal tire response together for independent wheels and locked axles. It preserves genuine brake holding and brake lock. Individual Ackermann angles account for inner/outer wheels and the existing rear-steering vehicles.

Each of the two Turning runs covers **44 trials**: all nine vehicles in forward/reverse and both full-lock directions, plus eight locked-axle Wrangler/G63 cases. Each trial seeds a rolling speed once, then coasts under the actual vehicle solver. Loaded contact movement, continuous angular phase, wheel/rim pose, steering demand and retained vehicle movement are checked. One complete run uses the fixed simulation clock; the other uses real time. Static screenshots supplement these numerical observations; they do not alone prove animation continuity.

The Full, Mechanical, Movement, Rollover, ElectricPressure, Ruts, Spray and Damage suites provide fresh driving, stopping, support, rollover, upgrade, soil and damage regressions. An initial Full run passed 343/344 checks but the scripted locker attempt crossed the tire corridor. Its forward-only steering feedback mishandled rollback, and its old approach contacted the ledge with the bumper before the tires could climb. The final automatic driver uses the same original low-side approach line and ordinary bounded crawl controls in both open/locked comparisons, with correct rollback steering and actual service-brake holding before unsafe alignment or edge clearance. Physical terrain, grip, collision, gate-post guards, time limit, required locked advantage and zero-negative-clearance threshold are unchanged. Exact reverse source deltas verify the automatic-driver and loaded-contact brake changes against the original cook5 producer; all physical force limits and all test thresholds remain unchanged. The terrain material transition and graphics-preset suites from pass 15 are not included in this pass's totals; material transitions and renderer configuration were not changed here.

The accepted rollover run requires mesh-matched coachwork collision and mass/centre-of-mass checks, with **58 poses and 465 checks**. An earlier offscreen probe omitted that required option and was interrupted; its partial captures and receipt are archived separately and excluded from acceptance.

## Loaded-contact slope braking

The native cross-axle probe exposed a runtime defect: wheels stopped rotating under the service brake, yet the vehicle crept on the slope when some tires were unloaded. Gravity compensation was still divided among four nominal tire shares. The corrected calculation distributes that compensation among valid loaded tires according to their supported load, retaining the existing friction ellipse, brake-torque and contact-inertia bounds. Thirty-four additional portable cases exercise one/two/three/four loaded tires at two frame intervals; they require a hold with enough grip, downhill motion with insufficient grip, no excess friction and no artificial airborne support. Native driving, braking, slope and rollover regressions supply the separate cooked-game verification.

## G-Class and Wrangler review

Native front, side, overhead and three-quarter views were inspected for all nine vehicles, with closer review of the three changed bodies against manufacturer photographs. G-Class door contours now follow densely sampled final body surfaces, with straight lower flanges; old closed partial strokes no longer draw diagonal returns. The wing/cowl joint sits ahead of the door. Shallower bonnet caps, approximately **0.94-inch** leading returns, front-wing closure webs and seated indicators improve both fronts. G580 retains its higher softer bonnet and full Black Panel around the circular headlights; G63 retains its lower pressed bonnet, twin relief and AMG grille.

The Wrangler's reconstructed painted bonnet is approximately **61.3 inches** wide at the cowl/middle and **60.2 inches** near the grille, with matching sides, cowl and latch placement. Those are authored mesh measurements rather than manufacturer specifications. The Rubicon script now sits outside the broader skin with corrected normals.

An earlier candidate passed numerical Art checks but was visually rejected for hidden Jeep lettering, broken door joints and an overly deep bonnet lip. A subsequent pre-boundary package had accepted geometry, then was superseded to restore the ordinary proving-ground recovery rule independently of the removed winter helper. Neither earlier candidate contributes to the final totals. Current native review found the requested changes visible and no new missing mesh/material regression. Broad panels, front-corner transitions, optics and interiors remain simplified original reconstructions, below OEM CAD or Forza fidelity. Sources and limitations are in [steering and front coachwork](steering-coachwork-16.md).

## Winter Expedition removal

The destination button, 0-key travel, map-specific runtime/validator, preparation/survey helpers and explicit cook entries are removed. Active Content no longer contains the authored winter destination maps, generated WinterExpedition map or WinterGameplay collision. The actual final IoStore listing confirms their absence and the presence of the proving-ground map and all **272** imported meshes. Extracted package data matches all **7** current NativeData files; retired winter collision data is absent.

The proving ground retains its snow biome, bounded physical deformation, drifts, slush and shared acquired winter textures/rocks. Ordinary out-of-world recovery is preserved independently and has five boundary assertions. [Destination removal](winter-level.md) records the rebuild and dependency implications.

## Exact package and preservation

- Nested executable: `Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe`
- Executable SHA-256: `be0e2aa2106a900639874eee4741aa24158bddf5fade6ac7360e2612cea779dc`
- Full asset cook/build attempt: **5**, completed **2026-10-28T23:38:53.1841707Z**, followed by native brake-holding/driver C++ stage **6**, completed **2026-10-29T00:17:03.5522515Z**. All final native modes use the later staged executable.
- Immutable asset-cook receipt SHA-256: `6da729b84180965501e59cb631bf96eb015e72d20f5de6a7e765401693f46a8e`.
- **131** frozen producer files, **272** exported/imported meshes, **108** coachwork convex hulls, **7** extracted NativeData files and **5** package containers verified against the producer.
- All **1,214** local browser file hashes unchanged. Three body OBJs and the export manifest changed; the other **269** meshes and both mask images are byte-exact to the fresh baseline.
- Fresh current player garage SHA-256 remains `ebb97cafc3c9a45991d4f3b5c26eb9e38fc18b58747783f71d3bd1e7654abdac`; graphics SHA-256 remains `7fc551251542fe476e18f213de4614fe4669231df4fb29ab6a87a938c0fd19e0`. Isolated test paths prevented overwriting those files.
- Raw Epic/Fab assets, generated assets/builds, reference photos, test captures and private player/configuration files are excluded from the public source publication.

Exact mode receipts, logs, GPU samples, image hashes and actual review observations remain under `Saved/Pass16-2026-10-28T22-03-23-284Z/FinalCode6`. Use the complete `Build/Windows` folder to run the game; the nested executable alone is insufficient.

## Practical limits

The **previous pass-15** clean-load quarry profile averaged about **3.33 FPS** on this machine, with CPU physics dominating. Its final 100 sampled frames averaged 300.000 ms; mean physics-worker time was 220.885 ms, EndPhysics wait 221.043 ms and GPU time 48.552 ms. Those overlapping counters must not be added. The CSV is usable diagnostic evidence, while its original profiling runner exited **777003** with a failed receipt. It is excluded from functional acceptance. This pass did not repeat that profile, identify the expensive physics subroutine, or demonstrate a performance or PC-crash fix.

All current suites requested a **20 FPS** render cap and enforced a **77°C** sampled GPU cutoff. Highest sampled temperature was **64°C**. Turning, Full and Movement use a fixed 20 Hz simulation step; a synthetic step can bypass ordinary frame pacing and does not establish 20 rendered FPS. Other listed modes use the real-time clock. No full-rate endurance test, hardware crash-cause diagnosis or long-session thermal guarantee is claimed. Verification consists of automated native driving/state changes and actual static image review; no separate manual/controller or mouse-click traversal is claimed.

Damage remains visible local deformation and gameplay impairment with original collision hulls, transient dents and no structural soft-body collapse or wheel detachment. Physical soil deformation is bounded. The previous HZB occlusion choice and readiness/bounds protections remain; this pass does not establish that every reset or coarse/fine terrain handoff frame is gap-free. [Damage behavior](vehicle-damage.md), [powertrain/pressure](electric-pressure-research.md) and the prior soil notes describe those existing systems.
