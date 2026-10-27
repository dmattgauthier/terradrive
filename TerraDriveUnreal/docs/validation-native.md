# Native validation — rollover and coachwork pass 12

The Windows assets were fully imported, cooked and packaged with Unreal
Engine 5.8.3. The current executable was subsequently code-staged over those
identical packages after correcting the Urus revision assertion and refreshing
coachwork collision readiness when leaving the garage. It passes
**1,021 native runtime checks**, **382 core checks**,
the all-six source geometry checks, twelve contour/pillar probes and
1,134 fascia/90 bonnet coverage probes with zero painted intrusion. Root
actually inspected **180 fresh native PNGs**, including sixty vehicle views and
forty rollover cases. Numerical checks and static image review are recorded
separately.

The original Sprinter reproduction showed about seven inches of side burial,
ten inches on its roof and up to nineteen inches in a partial-roll case.
The corrected final package uses twelve exported-body convex sections per
vehicle, welded to the chassis. The forty final cases cover both sides/roof
on pavement and Pine Ridge for all six vehicles, plus four Sprinter partial
rolls. Each trial first selects the vehicle through the garage, returns to
driving and checks the actual weld. Worst sampled penetration is
0.4629 inch. The 55-degree Sprinter cases
self-right through normal gravity; their larger positive clearance is expected.
No upright pose or velocity correction is imposed during the drop. Mass,
centre of mass, disabled tipped tire drive and recovery are also checked.

| Native mode | Passed |
| --- | ---: |
| Full | 287/287 |
| Ruts | 101/101 |
| Art | 66/66 |
| Rollover | 321/321 |
| Movement | 84/84 |
| Detail | 15/15 |
| Winter | 46/46 |
| Transitions | 53/53 |
| Cool | 16/16 |
| Balanced | 16/16 |
| QualitySmoke | 16/16 |

The Full run includes actual driving, Space-stop checks for all six vehicles,
held-opposite-input reverse and incline-hold fixtures, wheel support, equipment
and the stock Urus twenty-gate quarry route. Movement tests coasting terrain
crossings, rounded rises, visible-body clearance, suspension/braking and a
solid barrier. Its short trials use a fixed 20 Hz test clock so rendering
stalls cannot remove the required observation frames. Player driving retains
its normal clock. Winter checks retain the complete acquired level, internal
road joins and four short road-driving trials; this is not a continuous drive
of the entire authored road.

The model review covers front, side, rear, three oblique directions, bonnet,
rear closure, pillar/side detail and overhead for every vehicle, compared with
baseline captures and actually inspected photographs/catalogue views.
[The change report](rollover-coachwork-12.md) links the primary references and
lists the six models' revisions. These remain procedural reconstructions with
simplified interiors, lamp treatment, fittings and fine surfacing; the checks
do not establish manufacturer-CAD precision or production racing-game quality.

Accepted executable SHA-256:

`449198103240594d632968c382393523a8c3ae9454fd283e3762fbdfacc43a9c`

Full import/cook/package log: `Saved/rollover12-build-1.log`; SHA-256:

`e58443806937b670bf6e87cccfa974564d86951d5f2e56d29c92bdb60c8c2117`

Code-stage log: `Saved/rollover12-garage-code.log`; SHA-256:

`d8322b667e2b0fb4a30c2b6b0961d8712df017f963c8e81877851e4a900ce9ba`

The original full-cook producer is
`546310a78fab4e0c84bc6470daf399e189d38dd1fa22d342bbc881c7fc0f5e81`. Its receipt is retained unchanged.
The code-stage guard verifies four changed source files against the original
cook: the Urus revision assertion, garage collision preparation/activation,
mass/centre-of-mass restoration and rollover fixtures that select through the
garage. The earlier metadata-only runtime is retained as diagnostic history.
All native modes and image captures were rerun against the executable above.

The compiled and staged executable bytes match. All five Paks and eight
extracted NativeData files are hash checked, including the new collision data
and its matching body/ground-probe hashes. The source freeze covers
97 Source/Tools/Config files. Terrain residency
retains 49 unique bounded textures across 63 shared references. JSON evidence:
[native-validation.json](native-validation.json). Private receipts, captures
and logs are retained under Saved.

All six body geometries change. The other 232 meshes are byte-identical after
remapping the one added Jeep reflector material's slot IDs. Vehicle mechanical
specifications, brake/reverse bindings, terrain heights/shaders, routes, loop,
trees and scenery placements are preserved. All 1,214 local browser hashes,
the fresh player garage/graphics files and original acquired maps match the
current task baseline. Generated builds, raw acquired packs, reference photos
and private app/player data are excluded from public source publication.

The Full capped run records 371 GPU samples, maximum
59 C, mean 28.87%
utilization and 9.47 W. Short preset peaks are
Cool: 65 C; Balanced: 72 C; QualitySmoke: 68 C. Quality smoke remains capped at 20 FPS; the wrappers retain 77 C
cutoffs and isolated saves. These are bounded automated checks and actual
image review, not a separate manual/controller session, every possible terrain
pose, normal 60 FPS endurance, long-session thermal stability or a diagnosis of
the prior PC reboots. Physical soil remains a bounded proving-ground height
field; the authored Winter Expedition landscape and road remain static.
