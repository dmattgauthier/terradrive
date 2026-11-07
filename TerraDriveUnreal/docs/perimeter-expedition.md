# Perimeter Expedition

Use **Next challenge** (J by default) to select **Perimeter Expedition**.
The route starts on West Rim and returns to its trailhead after a 2.36-mile
lap. Follow the paired stakes. The HUD shows the next sector and its driving
tip as you approach. Start in a high-clearance 4WD vehicle for the rocky
sections and bog.

| Sector | Terrain and features |
| --- | --- |
| West Rim | Blind crests and rolling outer rim |
| Copper Dunes | Soft sand rollers, climbs and descents |
| Slate Rim | Quarry shelf trail and articulation stones |
| East Escarpment | Banked turns, steep crest and snow approach |
| Boreal Snow Basin | Packed lane, shoulders and snow banks |
| Summit Park | Existing narrow balance ramp and cross-axle bumps |
| Northwest Rim and Tarmac Crossing | Northwest high meadow and paved crossing |
| Pine Ridge | Wooded turns and staggered earthen humps |
| Willow Marsh | Shallow ford and soft banks |
| Granite Steps | Bedrock and offset ledges |
| Blackwater and Rutted Hollow | Deep mud, wet exits and the return climb |

The main lap takes the Summit balance lane. The high-speed loop, jumps,
staircase, hairpin and Granite Trials courses remain separate challenges
accessible from the same park and quarry areas.

## Terrain and verification

The export grades the trail into the existing terrain and tapers it into the
surrounding slopes. Render and collision use that same height field. The
material adds a feathered, uneven worn lane to the existing texture blend,
with pavement and bedrock retaining their original appearance. The export
keeps the original surface classification and water depth at every sample,
so the route still encounters the existing traction and rut behaviors.

Run `node Tools/validate-export.mjs` after generating the source assets. It
checks route closure, perimeter coverage, all seven surface types and the
exported collision grade. After packaging, use `Tools/verify-fidelity.ps1
-Mode Perimeter -TimeoutSeconds 1500` for the continuous driving check.

The original Unreal 5.8.3 Windows package passed the five perimeter checks.
An upgraded Wrangler Rubicon drove all 191 gates in a single lap with no
teleports after the trailhead. It stayed upright, within 11.1 ft of the sampled
trail center. The original surface check sampled beneath the chassis origin.
The test aired down in the snow and used low range and the rear locker in
Blackwater. It captured all 11 sectors and the finish. The lap took 615.4
seconds on the simulation
clock and the test process took 750.9 seconds in real time, including load.
The fixed 20 Hz run checked driving behavior on this Jeep configuration.
On the same executable, 117 rut checks, 64 rut-transition checks and 81
focused Jeep rollover checks passed. Across all four offscreen runs, the
highest sampled GPU temperature was 61°C. These runs used an isolated player
profile and a 20 FPS cap.

The final route is 12,485 ft long. The export compared 2,563,201 terrain
cells with the previous field. Water depths and physical surface IDs matched
at every cell. The 13 prior routes and 307 generated mesh inputs were
preserved. The local Windows package reused the already imported G63 6×6
side-step assets from PR #7, which are reviewed separately.

| Tested item | SHA-256 |
| --- | --- |
| Packaged game executable | `0d1c2b97dbcb9e9e1e2b83576333b36fb6a598092bee4d9e948206e6b1e9b7d8` |
| Cooked data PAK | `019bc8d3e0d6fecb1e279c786e69e77d1da28758002ff4fe6666f04207edf002` |
| Cooked asset UCAS | `b2318a6960b5d7fc23c06e2397797e4f296391e8af2ad61e8932b55934ae063a` |
| Source file hash manifest | `187e5c9eb4d7b6eda9838c5e13910a4e1f846fb15e86f1f614c8c922a7d06074` |
| Generated input hash manifest | `085a8099b5e97ee80be2341f956bc34b07f201f99ac3d999aa684f1a11cb132b` |

## Review fixes

The HUD now keeps the upcoming gate's sector tip visible alongside transient
notices. The lap verifier records resolved surfaces at loaded tire contacts,
including the surface assigned to constructed supports. The expedition bake
keeps the authored Slate Rim sign grounded by shifting it with the one-metre
collision triangles.

The refreshed export moved the sign up 47.6 cm. The terrain binary, masks and
remaining export data matched the merged photoreal pilot, and all 307 mesh
inputs passed the export validator. The pilot's merged transition validator
checks Blend B alpha alongside the authored quarry texture changes and
validates the seven physical coverage channels separately. The merged
validator passed all 2,563,201 atlas samples, including 16,415 quarry
overrides, and passed the pre-expedition fixture. Deliberate mask corruption
and the original unadjusted sign failed their respective checks.

The combined Unreal 5.8.3 Windows package passed 267 checks. The upgraded
Wrangler completed all 191 gates upright, stayed within 11.1 ft of the trail
center and registered all seven surfaces at loaded tires. The lap took 615.4
seconds on the simulation clock and 628.6 seconds of real process time
including load. Captures showed the sector guidance, grounded sign and finish
notice. The same package passed 117 rut checks, 64 rut-transition checks and
81 focused Jeep rollover checks. These were fixed 20 Hz functional runs
with an isolated player profile. Peak sampled GPU temperature was 59°C.

| Tested item | SHA-256 |
| --- | --- |
| Packaged game executable | `b402d7e166fb34c790c18fe359e9045c462b57cdd4cdb922bd3927ddd7f39445` |
| Cooked data PAK | `21b11e08fc93aab6b14cd053c7cad0499d079ab5a5c7084ad763ccc5e820adbc` |
| Cooked asset UCAS | `cc0e16137cc820682dd8a0ebb36b39290ae6e52dfc62aa5ab7dbfede198cdbcd` |
| Source file hash manifest | `8b2d70258bfe5d7533697a5febb39a311813bbd7c06587ad5be0803fcd2ee171` |
| Runtime world input | `953823e202f14f6b8aec5e8b6a0f0ccd214ec38f4c0f70a731fd0ea31fcea0a9` |

Local receipts and captures are under `Saved/PerimeterReview/CombinedValidation`.

## Terrain follow-up

Landmark meshes and collision boxes now move together from a shared ground
anchor. The full export check matched all 28 collision boxes to visible mesh
centers. Nine boxes across three signs moved, including a 9.7 cm drop for
each box of the Boreal Snow Basin sign.

The grade fades the distance-driven relief through the start and finish.
At three offsets across the lane, the largest source grade difference
between points 1 mm on either side of the join was 0.63 mm. On the native
one-metre collision triangles, the final 75 cm climbed 22.2 cm after the fix, compared
with 50.0 cm in the previous expedition export. The change affected 1,855
height cells within 15.5 m of the join. Water depths and surface IDs matched
at all 2,563,201 cells. The blend data and texture masks matched byte for
byte, and all 13 prior routes matched.

The standalone Slate Rim refresh succeeded on a pre-expedition export that
previously threw an error. The refreshed import and runtime manifests agreed,
and the terrain field and 13 routes were preserved. A repeat refresh
requested a full export and left the inputs intact.

The Windows package was recooked with the regenerated native data, the
previously built executable from identical native source and the existing
imported art. The cooked art container matched the prior package byte for
byte. The fresh fixed-20 Hz lap completed all 191 gates, including the
regraded finish. The upgraded Wrangler stayed upright within 11.1 ft of the
trail center and registered all seven surfaces at loaded tires. The lap
took 614.9 seconds on the simulation clock and 761.2 seconds of real process
time including load. The package passed all 267 functional checks across
the lap, ruts, rut transitions and focused Jeep rollover. Runs used an
isolated player profile and peaked at a sampled GPU temperature of 58°C.

| Tested item | SHA-256 |
| --- | --- |
| Packaged game executable | `b402d7e166fb34c790c18fe359e9045c462b57cdd4cdb922bd3927ddd7f39445` |
| Cooked data PAK | `c69ec763eb9114bce5021827740b2ccc14367c87c935f231f2a2bb8f705d02e7` |
| Cooked asset UCAS | `cc0e16137cc820682dd8a0ebb36b39290ae6e52dfc62aa5ab7dbfede198cdbcd` |
| Source file hash manifest | `2d824c1fd5dfd5dde75ce31fcfb54280d7b66b2b7595d212833aad812c1cee20` |
| Native data hash manifest | `5011208697bd97019c0185994b4023a3834309e17379901a8823ef38f7e8f781` |

Local receipts and captures are under `Saved/PerimeterFollowUp/Validation`.
