# G 63 AMG 6×6 pickup correction — pass 25

The previous model's low triangular cargo bar, separate rounded rear arches and shallow bed did not follow the factory truck's silhouette. Several retained SUV floor/card panels also intersected the middle tires' travel. This pass changes the **6×6 body and optional armor**, while retaining the six physical tire contacts, 18-inch wheels, nominal 37-inch tires, approximately 123-inch front-to-middle wheelbase and 43-inch tandem spacing.

## Reference comparison and resulting shape

The [Mercedes-Benz Japan driving gallery](https://mb-live.jp/report/re_6x6_testdrive_150107/) supplies first-party front, descending and rear-articulation views. The [2014 manufacturer release](https://www.mercedes-benz.jp/news/release/2014/20140425_1.pdf), successfully read in this pass, confirms the three-axle equipment, nominal 37-inch tires and approximate 7½-foot overall height. It is an equipment release, not an engineering dimension drawing.

Six additional Mercedes press photographs mirrored in the [original 2013 gallery](https://www.caricos.com/cars/m/mercedes-benz/2013_mercedes-benz_g63_amg_6x6/) were inspected: two rear/side quarters, a front/side quarter, articulation view, rear view and close cargo-bed view. The original factory design, rather than a later conversion or Brabus body, is the target. These show a full-height stainless hoop just behind the cab, bent stays extending rearward, connected tandem fenders, horizontal rear lamps and wood-lined cargo surfaces. Private reference downloads are retained locally and are not distributed as game assets.

The authored hoop now reaches about **7 ft 7½ in** overall, just above the cab, with a continuous transverse tube, rounded shoulders and four cast mounting feet. The rear stays meet the hoop near roof height, then slope rearward and turn down to the bed shoulders. This replaces the former bar that peaked approximately 23 inches lower. The cab roof rises about two inches; its large donor glass panel is replaced by painted longitudinal roof pressings and a continuous carbon front spoiler with two recessed LED modules.

Each side now has one joined, box-shouldered rear fender spanning both rear axle centers, and a matching front fender. The flares extend approximately 1½ inches beyond the tires on each side. The deeper bed has scalloped double-wall sides, formed inner tandem wheel housings, a central floor, horizontal rear lamps and a more appropriate rear bumper/tailgate. Epic's acquired Automotive Materials wood parent supplies real texture and roughness variation to the planks. That oak veneer material is a visual substitute for the factory bamboo finish; no exact bamboo scan is claimed.

## Wheel clearance and collision

Tire centers are not moved to conceal incorrect bodywork. The body is fitted to the existing mechanical hardpoints. The donor cabin floor is narrowed between the tires, rear door cards terminate at the actual rear-door edge, and the cab/bed bulkheads have clearance above the middle tires. The side step ends before the front tire's compressed outline. Optional armor is narrowed and its rear outrigger is moved into the clear space between the front and middle axles.

Native Candidate2 passed its functional checks, but its front/side views exposed a rounded donor paint crescent behind each new front fender. The final correction clips those actual sheet triangles to the shared boxed opening and adds a dark flexible inner liner. Fifty-four additional rays guard the full opening above the tire outline, where the original tire-silhouette probes did not reach. The liner is excluded from structural coachwork collision; the original exterior/folded fender and undertray remain the physical envelope.

The stainless hoop uses an explicit structural material tag. The coachwork baker includes that tagged metal for this vehicle, keeping the usual cosmetic-metal exclusions for other vehicles. Collision remains bounded to twelve convex longitudinal sections, with at most 64 vertices each. This is an approximation of the coachwork envelope; it does not provide a hollow, exact tubular collision mesh throughout the open cargo bed.

## Source validation

- **95 portal checks** pass: 67 for the 6×6 and 28 for the existing 4×4².
- Within those checks, **372 triangle ray probes** clear all six upper tire outlines at rest and with approximately four inches of compression. Another **432 probes** check the optional armor against the tire volumes.
- The full ten-model suite passes, including **151 expedition/portal checks**. The 95 portal checks above are included in 151, rather than added to it.
- Export checks pass for 307 meshes, all ten vehicle slots, shared terrain data and source provenance. Exactly two mesh inputs change; 305 are byte-identical to the accepted prior export. The other nine vehicle records and their ground/collision data are unchanged.
- The 6×6 body contains **443,915 triangles**, up from 414,993, within its existing 450,000-triangle limit. This is a geometry budget, not an FPS measurement. Early source checks rejected excess bevel geometry and several tire intersections; their diagnostic logs are retained.

## Native acceptance

The final package passes **226 fresh native checks**: SixWheel 35, Art 110 and focused six-wheeler Rollover 81. The latter covers side/roof drops on pavement and dirt plus four additional tilt poses. SixWheel checks actual load/drive/braking on six tires, all five locks, three EV donor stages, garage migration/travel and physical mud displacement from all three axles.

All ten new 6×6 Art views were manually inspected, along with the focused driving/rollover captures recorded in the [evidence summary](g63-sixwheel-native-25.json). Art produces 100 views across the roster; its automatic checks establish rendering/material presence, not reference accuracy for every car. Other nine models' mesh/data inputs remain unchanged.

The game uses the exact previously accepted native code (88 C++/config/project producers checked byte-for-byte) with a **full new content cook**. Executable SHA256 is `140b976cbe874c8eb8af407e9eb62e175dcf9e1fb68d97ec0b0c1ef7f0e633a0`; the new container hashes, 191-producer source freeze and 319-input manifest are in the evidence summary. Source-only checks are separate from native checks. Failed early source diagnostics, Candidate1's successful cook log and unaccepted source snapshot, and Candidate2's visually rejected results remain local.

Runs used isolated settings, 1600×900 offscreen rendering, a paced fixed 20 Hz clock and a 77°C cutoff. Peak sampled GPU temperature was **61.0°C**. These are bounded functional checks, not uncapped throughput or endurance measurements.

## Preservation and cleanup

Full hashes confirm all **1,214 browser files**, **715 original acquired asset files** and the presence/content of **eight player-state paths** match the pre-change baseline. The 191 frozen source producers and 319 generated inputs also match the final tested package's manifests.

After acceptance, 166 files comprising duplicate cook/stage/temp outputs and the superseded body input backup were removed, reclaiming **1,771,710,906 bytes** (about 1.77 GB). Current package container hashes remain identical before and after cleanup. The current game, local symbols, useful shader caches, source inputs, player files, acquired packs, failed/current evidence and one validated rollback build are retained.

## Limits

The bar, panel stations, stance and trim are original photographic estimates, not OEM CAD. The cabin remains based on the shared G model and retains simplified dashboard, seating and small trim. Press photographs taken with perspective and suspension articulation cannot establish exact engineering dimensions. This pass targets the visibly incorrect pickup equipment and wheel/body relationship; it does not establish production racing-game asset quality.
