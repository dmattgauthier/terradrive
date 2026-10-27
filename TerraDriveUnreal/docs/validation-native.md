# Native validation — drivetrain, running gear and soil pass 13

The Windows game was compiled, imported, fully cooked and packaged with Unreal
Engine 5.8.3. The current package passes **1,415 native checks**, **467 portable
simulation checks** and **648 portable spray-response checks**. The native image review covered **198 fresh native captures**, including sixty vehicle views, forty
rollover poses, twelve stock/portal views (six pairs) and six controlled ejection views.
All reports and pictures belong to the same current executable. Its compiled
code stage retains the verified full asset cook without changing its containers.

| Native mode | Passed |
| --- | ---: |
| Mechanical | 334/334 |
| Spray | 44/44 |
| Full | 287/287 |
| Ruts | 117/117 |
| Art | 66/66 |
| Rollover | 321/321 |
| Movement | 84/84 |
| Detail | 15/15 |
| Winter | 46/46 |
| Transitions | 53/53 |
| Cool | 16/16 |
| Balanced | 16/16 |
| QualitySmoke | 16/16 |

The new Mechanical mode covers all six factory configurations, added four-wheel
high drive, low/crawler range and selectable lockers, legacy-save migration and
version 3 persistence. All 24 stock/portal configurations settle with four loaded
tires; actual welded mass, incremental clearance, installed housings and loaded
materials are checked. Six short drives verify that rims and friction rotors
follow their wheels while calipers follow steering without wheel spin.

Spray mode isolates grass, mud, snow, sand, gravel and water using controlled
loaded-wheel inputs. It verifies material-specific emissions, varying finite
transforms, world-space motion, complete expiry and non-emitting pavement,
airborne/tipped tires and solid constructed rock. Actual motor-driven mud/snow
rut trials and Full driving checks provide separate terrain-interaction evidence.

Ruts retains continuity, depth, slope, packing, unloaded/rigid-ground, repair,
cache and volume accounting checks. Added checks measure unequal bank
distribution, changing physical spread along the path and exact deterministic
replay of floor/shoulder/packing/shear history. Reviewed profiles show broader,
irregular low banks in mud/wet grass and compacted snow channels. Firm dirt and
sand relief remain subtle in daylight. The straight controlled fixtures have
straight overall wheel paths; their local shoulders vary.

Full includes braking/reverse and Space-stop checks for every vehicle, wheel
support, equipment, deformable terrain and the stock Urus twenty-gate quarry
route. Movement covers seven coasting terrain boundaries, six rises, suspension,
brakes and a solid obstacle. Its short trials retain their fixed 20 Hz test clock;
player driving retains the normal clock. Rollover covers forty stock garage-to-
driving side/roof/partial-roll poses and recovery. Every requested tipped pose
must be observed; gravity, pose and velocity are not corrected during a drop.
Winter checks retain the full acquired level and four short road-driving trials.

Vehicle review covers front, side, rear, oblique, bonnet, closure, pillar and
overhead views. Revised barrels, fasteners, calipers, rotors and articulated
running gear are original procedural reconstructions fitted to retained
hardpoints. They are not measured CAD assemblies or an additional solved
suspension-linkage simulation. The six body envelopes remain retained except
for the three factory spare-wheel revisions. No manufacturer-CAD or production
racing-game fidelity is claimed.

Current executable SHA-256:

`0eceea64de4767f4f859c89e6b0c386c45cb8d779434910b7b2c850223bd44bb`

Full import/cook/package log: `Saved/mechanical13-build-3.log`; SHA-256:

`7881128f7a68c321970e3d15773872344b9a4a324c5f1beca131fb482b701922`

The package contains 242 source-derived meshes, 72 body convex sections and eight
verified NativeData files. All five package containers were fingerprinted and
their extracted NativeData bytes match the current source. The import reads
back Nanite support on scanned materials and instancing overrides on project-
owned Epic automotive rotor instances. All native modes reject missing usage
flags and default-material fallbacks. Original acquired Epic parents are not
edited by the instance-override recipe.

The first cooked candidate exposed five rotor-orientation failures caused by
absolute instances lagging the chassis's final physics update. Chassis-relative
running gear corrected them. A later numerical candidate was rejected visually
for a snow test camera below terrain and missing renderer-usage settings. Its
build, images and reports are retained privately. The current full cook includes
the material and camera fixes. A later code-only stage corrects the descent
fixture: it now begins on the actual rocky slope after the stock vehicle has
activated, and requires downhill travel, loss of elevation and controlled peak
speed. The cooked content is unchanged. Diagnostic candidates are excluded from
current acceptance.

All 1,214 preserved browser files, the player's garage and graphics files, the
original terrain height data and both protected original Winter Scene maps
match the fresh pre-pass checkpoint. Publication retains 189 browser entries and
86 binary entries from the approved source repository. Generated Windows builds,
UAssets, acquired Epic/Fab assets, reference photos and private app/player files
remain outside the public source upload.

Driving, art, soil and Quality-smoke verification use a 20 FPS cap. Brief Cool
and Balanced samples exercise their 30/45 FPS limits. Every native run uses the
77°C cutoff. The highest sampled GPU
temperature across these runs was **69°C**. This is capped automated
verification and static image review, not a separate manual/controller session,
normal 60 FPS endurance run, long-session thermal guarantee or reboot diagnosis.

Physical ruts use the proving ground's bounded height field. The acquired Winter
Expedition landscape and road remain authored/static. Airborne debris is a
short-lived visual effect, not a collection of persistent loose rigid bodies.
Aftermarket portal/drivetrain conversions are fictional simulator options.

Machine-readable evidence is in [native-validation.json](native-validation.json).
Implementation and controls are in [mechanical-soil-13.md](mechanical-soil-13.md).
