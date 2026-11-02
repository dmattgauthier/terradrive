# Current native acceptance — terrain, transitions and ruts, pass 26

The final package passes **927 fresh native checks**: RutTransitions 64,
Transitions 53, Detail 15, Ruts 117, Movement 120, Garden 10, Rollover 513 and
SixWheel 35. All eight processes exit 0 on the same final executable and cooked
containers. The content cook reports **0 errors and 0 warnings**. A separate
fresh standalone simulation run passes **667 checks**. The
[terrain guide](terrain-ruts-26.md) explains the behavior and
[exact acceptance record](terrain-ruts-native-26.json) identifies the executable,
193 source producers, 319 generated inputs, cook and raw result hashes.

Visual review covers 50 focused terrain/rut frames and 12 selected suspension,
garden, rollover and six-wheel frames. Of the terrain frames, 23 were inspected
directly from the final run; 27 are byte-identical to inspected Candidate4
frames. Both sets and their hashes are distinguished in the record. One wide
snow view is partly obscured by a pine branch; other close and edge views cover
the visible ground. Light-load sand and firm-soil tracks remain subtle.

The new seven-boundary fixture confirms that a finite footprint presses both
soft sides while hard substrates stay unchanged. Maximum sampled collider
error is approximately **0.048 inches**, below the **0.197-inch** limit. Movement
checks retain the original seven coast crossings and all ten rise/braking
fixtures, measuring every wheel including all six on the G63. Full rollover
coverage includes 64 vehicle/terrain/pose cases.

Runs use isolated player settings, 1600×900 offscreen rendering, a paced fixed
20 Hz clock, a 20 FPS cap and a sampled 77°C cutoff. Peak sampled GPU temperature
is **54°C**. These are functional checks, not uncapped throughput, manual
controller play or long-session stability evidence. The 185 before-build checks
and failed/rejected candidates are retained separately and excluded from 927.
All 307 mesh inputs and main terrain data are unchanged from the fresh baseline.
Browser source, acquired originals and current player state are preserved.

---

# Prior native acceptance — 6×6 pickup correction, pass 25

The corrected G63 6×6 package passes **226 fresh native checks**: SixWheel 35,
Art 110 and focused six-wheeler Rollover 81. All ten new 6×6 garage views, five
driving captures and three selected rollover views were manually inspected.
The [model correction guide](g63-sixwheel-proportions.md) and
[exact evidence summary](g63-sixwheel-native-25.json) record the source/input
freeze, executable and cooked-container hashes, review coverage and preservation.

The 88 C++/Config/project producers and executable are byte-identical to accepted
pass 24; all content was cooked again for this model. Source validation passes
for all ten models, including 151 expedition/portal checks (95 portal checks
are included in that total). The two changed mesh inputs are the 6×6 body and
optional armor. Runs used isolated settings, 1600×900 offscreen rendering, a
paced fixed 20 Hz clock and a 77°C cutoff. Peak sampled GPU temperature was
61°C. This proves bounded function, rather than uncapped FPS or long-session
thermal stability. Earlier results below retain their original artifact scope.

---

# Prior native acceptance — G-Class and fidelity pass 24

The pass 24 package passed **1,762 native checks** on one executable, plus
**15,854 fresh portable checks**. It introduced ten vehicles, six actual tire
contacts on the G63 6×6 and bounded finer rock-garden geometry. Its
[acceptance record](gclass-sixwheel-native-24.md) gives exact build/source
hashes, visual-review coverage, cleanup and limits. Those are historical results.

---

# Native validation — boulders, deep mud and Summit courses

Native verification passes **1,812/1,812 checks** and **152 fresh portable collider checks**, with **252 captures actually viewed**. Of these native checks, **344 run on the final executable** and **1,468 retain their original dedicated-mode receipts from identical gameplay/test branches before a Full-only fixture repair**. Each accepted process exits 0 and identifies its own executable and cook hash. Evidence was accepted **2026-10-31T20:09:48.649812+00:00**. [native-validation.json](native-validation.json) records exact hashes; [the feature guide](boulders-mud-park-21.md) explains the changes and measured behavior.

| Native mode | Passed | Captures reviewed | Clock | Highest sampled GPU temperature |
| --- | ---: | ---: | --- | ---: |
| Field | 145/145 | 33 | realTime | 62°C |
| Movement | 111/111 | 16 | pacedFixed20Hz | 59°C |
| Turning | 572/572 | 20 | pacedFixed20Hz | 59°C |
| Ruts | 117/117 | 16 | realTime | 56°C |
| Rollover | 523/523 | 58 | realTime | 59°C |
| Full | 344/344 | 109 | pacedFixed20Hz | 59°C |

## Measurements

All 24 boulder variants read back as one closed source part with eight physical collision hulls, opaque materials and correct instance/Nanite usage. Dedicated native quarry and snow impacts confirm real solid-object collisions without an engine ensure. Package readback confirms ProvingGround, **297 meshes**, **108 vehicle body hulls**, seven exact NativeData files, nine regions and 13 routes. Retired Winter Expedition remains absent.

The Jeep physically crosses the full bog in **20.9 seconds over 266.1 feet**, with maximum rut depth **1.93 inches**. Thirty-eight rest cases cover every stock vehicle on dirt/pavement with and without brakes, plus an equipped EarthCruiser on snow. Maximum braked drift is **0.43 inches**; maximum overall drift is **5.21 inches**, including unbraked motion on the gentle soft slopes.

Three controlled airborne cases measure normal gravity with matching real elapsed apex time. Six true driven gap trials measure physics and wall-clock airtime separately and retain forward momentum at real landings. Field uses actual real-time simulation. Movement and Turning retain their listed functional test clocks; Full uses paced fixed 20 Hz. Those fixed-clock results do not measure real-time throughput.

The 58-pose rollover matrix records mean frame rates of **18.90–20.00 FPS at a 20 FPS cap**. The adaptive soil/body collider now coalesces submillimetre changes against the actual uploaded geometry within the same one-fifth-inch bound, avoiding repeated deep copies and contact replacement at rest. Fine tire/display data remain in use. The new portable run passes all 152 bounded-error/topology and retained-collider checks.

## Final executable and scoped fixture update

The general run initially crashed when its old rock-array index reached a deliberately retired empty placeholder group. The final Stage33 fixture finds an actual placed scanned boulder and deadwood, resolves their live world bounds, and still requires real tire support. A second Stage61 fixture now requires collision hits on two distinct replacement boulder variants instead of retired asset names. All three physical checks remain; no thresholds, clocks or completed reports are changed.

Only these two Full-validation blocks differ between the dedicated-test executable and final executable. Normal gameplay returns before validation, and each dedicated mode returns before Stage33. The source-equivalence receipt covers all 163 producers: the two scoped Full-only blocks change and the other 162 files are byte-identical. The final game runs the complete 344-check general suite again, with 109 fresh captures. The preceding 1,468 passing dedicated checks and 143 already reviewed captures are retained with their original executable/cook hashes. No failed-run image is counted.

## Exact package and preservation

- Executable SHA-256: `d0919699c05177020e1112e76e1f60aaa77ca415b7f3e228397b5968bfdababf`.
- Final asset/code-stage receipt SHA-256: `c1d1b2ced61a204bd944262d151cb3272ec2c48d5fdeaef325a1c51f5e3f32d9`.
- Fresh full-cook receipt SHA-256: `515e81b9c8e18d70e127dbf36dbbe66348040e3b38f4d341fbf0428b64854f18`.
- Source freeze SHA-256: `9a19bbc5018bb161a539ae62a38a96b0d4f8881fc555174b61a9fd7b62a1defe`; **163** frozen producers match.
- **1,214 local browser files**, **36 core vehicle body/tire/rim/wheel OBJ files**, all vehicle specifications and **3 current game save/settings files** remain unchanged. The broader 120-entry baseline also included 114 generated crash-client configs and three editor settings: 30 old crash configs expired through Unreal's configured two-day cleanup, and the editor updated only its external-compile timestamp. Overall, 89 baseline entries are byte-identical; baseline diagnostic backups remain intact and no settings were restored.
- All accepted runs use the same verified **300 SourceAssets**, seven NativeData files and five package containers. Generated rocks, water and park assets are deliberately new; no claim of retaining the old package is made.

Private evidence: `Saved/Pass21-2026-10-31T15-09-23Z/Candidate15`. It includes the final report and references to the original dedicated-mode receipts, image manifests/review notes and GPU samples. Historical tests and failed runs are excluded. The five retained dedicated-mode runs passed in full; the failed C13 and C14 Full runs and their 15 and 109 captures are excluded. An exact scoped source comparison proves that the final edit affects only the guarded Full Stage33/61 live-detail selection fixtures, after normal gameplay and every dedicated mode have returned. All 162 other producers and all cooked assets are identical. The source-only public repository includes the recipes and this hash record, while the local complete Windows build is under `Build/Windows`.

## Practical limits

These are controlled offscreen tests with actual static-image review; no manual driving/controller session or desktop input was used. Native runs use a 20 FPS cap, -NoTrace and a 77°C sampled cutoff. The highest sampled accepted GPU temperature is **62°C**. Uncapped endurance, thermal behavior over a long play session and PC-crash stability remain unverified. The prior real-time quarry profile around 3.33 FPS was not repeated. Source publication requires a separate complete remote tree/ref readback and preservation audit.
