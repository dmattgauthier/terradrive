# Boulders, Blackwater bog and Summit courses

This round replaces mismatched simple stones and partial cliff/ice formations with **18 dry and six snow-covered scanned-boulder variants**. The library uses eight existing CC0 scans, gentle shape variation, varied scale/orientation/tint and avoidance of nearby repeated variant silhouettes. Original acquired packs and the browser source are preserved.

## Solid scanned rocks

The original OBJ scan seams were being treated as holes. In the largest source scan, a read-only check found 25,538 disconnected pieces and 114,778 open edges. Welding coincident seams produced one closed boulder with no added faces. Import now joins those seams before filling any genuine holes, preserving the photographic UVs and per-corner normals. All 24 imported variants read back as one closed source part with eight dedicated physical collision hulls. Opaque materials, two-sided rendering and Nanite/instance shader usage are verified. Full visual triangles remain available to tire queries.

The proving ground replaces 1,794 boulder instances and retires 157 partial cliff/icy placements. Scanned rocks are grounded against the actual terrain and constructed surfaces. Existing high-detail quarry assets remain; old low-poly boulders and partial freestanding formations have no placements.

## Blackwater bog

The new challenge sits in **Rutted Hollow**, with an irregular basin about **223 by 131 feet**, shallow muddy standing water and a finite soft layer about **two feet** deep over a firm substrate. Grip falls and rolling resistance rises gradually through its wet fringe. The waterline is clipped continuously and fades at shallow edges, with surface lighting, reflections and subtle ripple normals. A firmer outside line provides a bypass.

The actual equipped-Jeep trial crossed **266.1 feet in 20.9 seconds**, leaving ruts up to **1.93 inches** deep. That fixture uses stage III tires, stage II suspension, factory 4WD/low range and axle lockers. These are controlled test conditions; vehicle mass, pressure, tire choice, wheelspin and the chosen line still affect progress.

## More Summit park routes

The original circular giant loop and routes 0–8 remain. Four new challenges extend the list to 13:

- **Blackwater bog crossing** in Rutted Hollow.
- **Summit rhythm jumps:** three progressive take-offs, real unsupported gaps and broad descending landings. The receiving lips are lower so a long truck's bumper clears the entry.
- **Summit cross-axle staircase:** offset wheel tracks load opposing wheels. Its valleys sit about 1.6 inches above the base ground and grade down at both ends, avoiding overlapping surfaces.
- **Summit banked hairpin:** a raised, banked turn with an approach and return lane.

With default bindings, **J** cycles challenges. Use the controls shown in the HUD and Escape menu if you have rebound keys. Available 4WD, low range, lockers and appropriate upgrades affect the off-road routes.

## Bounded collision updates after a rollover

The broader native matrix caught six remaining soft-ground performance failures in an earlier candidate, which is excluded from final acceptance. CPU tracing showed that each tiny soil change deep-copied the physics triangle mesh and replaced its collision geometry, discarding resting contacts. The runtime now retains the actual uploaded collider while a conservative comparison with the live fine surface stays within the original **one-fifth-inch** height bound. Larger changes still refine and update collision synchronously. Visual impressions and tire samples keep their full resolution. Sixteen added portable checks verify retained geometry between vertices, larger edits and changes at fine nodes omitted by the sparse mesh.

The supplemental real-time Sprinter proof passes 46 checks across nine poses/regions, with maximum actual collider error **0.188 inches**. It uses the identical gameplay and collider implementation from the dedicated-test executable and the same retained assets; these diagnostic checks are excluded from the 1,812 formal native-check total.

With the same assets, unchanged physics fixtures, real-time clock and 20 FPS cap, the complete 58-pose matrix improved from **6.07–20.00 FPS** to **18.90–20.00 FPS**. All six previously failing cases now pass, with soft-ground body impressions still enabled.

## Stationary grip and real jump timing

Low-speed lateral tire holding now works with the service brake released and uses the scene's actual gravity. Holding remains limited by the tire's available grip; freely rolling tires can still move downhill. Across 38 fresh parking trials, maximum braked drift was **0.43 inches**. The longest EarthCruiser windows last 15 seconds and include a read-only equipped build on snow.

Gravity strength is unchanged. Three controlled free-flight cases measured downward acceleration of **32.03–32.04 ft/s²**, including drag, and apex times of **0.607–0.608 seconds**. Real elapsed apex time agrees with physics time. Six actual driven gap trials also compare real elapsed airtime with physics time and stop the measurement at the first real landing contact. The continuous tabletop is not required to launch a compliant heavy truck.

| Vehicle | Actual gap | Physics airtime | Real elapsed airtime | Ballistic residual | Forward speed at landing |
| --- | --- | ---: | ---: | ---: | ---: |
| Wrangler Rubicon | Low rhythm gap | 0.350 s | 0.350 s | -0.24 in | 32.2 mph |
| Wrangler Rubicon | High rhythm gap | 0.950 s | 0.951 s | -0.49 in | 37.3 mph |
| Wrangler Rubicon | Original park gap | 1.200 s | 1.200 s | 0.69 in | 36.4 mph |
| EarthCruiser EXP | Low rhythm gap | 0.350 s | 0.350 s | -0.43 in | 34.8 mph |
| EarthCruiser EXP | High rhythm gap | 0.750 s | 0.750 s | 0.50 in | 32.4 mph |
| EarthCruiser EXP | Original park gap | 0.600 s | 0.600 s | -1.20 in | 29.4 mph |

## Verification and limits

Native verification totals **1,812 passing checks**, **252 captures actually reviewed**, and **152 fresh portable collider checks**. The final executable passes 344 general checks; 1,468 dedicated checks retain their original receipts from the identical gameplay and dedicated-test code before a Full-only fixture repair. [The native validation record](validation-native.md) records both executable hashes, the exact source-equivalence scope and retained asset hashes. Rollover checks cover all nine vehicles and 58 poses, with averages of **18.90–20.00 FPS at the requested 20 FPS cap**.

Verification uses controlled offscreen fixtures and a temperature cutoff. It does not establish uncapped endurance or PC-crash stability. The earlier real-time quarry profile around 3.33 FPS was not repeated. Existing vehicle meshes, current player settings and browser files remain unchanged. Source publication excludes generated builds, Content, Saved, SourceAssets, raw acquired Epic/Fab packs and player files.
