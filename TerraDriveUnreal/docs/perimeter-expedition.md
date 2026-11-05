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

The final Unreal 5.8.3 Windows package passed the five perimeter checks.
An upgraded Wrangler Rubicon drove all 191 gates in a single lap with no
teleports after the trailhead. It encountered all seven surfaces and stayed
upright, within 11.1 ft of the sampled trail center. The test aired down in
the snow and used low range and the rear locker in Blackwater. It captured
all 11 sectors and the finish. The lap took 615.4 seconds on the simulation
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
