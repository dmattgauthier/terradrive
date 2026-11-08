# Grave Digger and Impreza 22B STI reference reconstruction

The two new native entries are appended after the existing ten vehicles. The
1998 Subaru is the **Impreza 22B STI**, a two-door GC-generation car, rather
than a later four-door WRX STI. The Grave Digger body follows the contemporary
black/green panel-wagon interpretation photographed by Monster Jam. It does
not claim a particular competition chassis serial number.

## Research and scale

[Subaru STI's heritage archive](https://www.sti.jp/brand/heritage/1998/impreza-22b/)
provides the 171.9-inch length, 69.7-inch width, 54.7-inch height, 99.2-inch
wheelbase, 2,800-pound reference curb weight, 235/40R17 tires, 276 hp and
268 lb-ft. It identifies the wide fenders, hood, side skirts, adjustable
rear wing, gold forged BBS wheels and driver-controlled center differential.
The [same-model auction gallery](https://collectingcars.com/for-sale/1998-subaru-impreza-sti-22b-5)
was inspected for the side/rear glass, single long door, rear quarter flare,
wing supports and lamp arrangement. A separate
[front gallery](https://collectingcars.com/for-sale/1998-subaru-impreza-sti-22b-13)
was inspected for headlamp outline, hood scoop, fog covers and bumper openings.
That front reference has aftermarket mechanical equipment; those modifications
are not treated as factory specifications.

[Monster Jam's Grave Digger page](https://www.monsterjam.com/en-us/truck/grave-digger/)
identifies the original Chevy panel-wagon inspiration, characteristic red
headlights and green/black flame motif. Its official photo gallery supplies
side, front/top and airborne views of the shell, exposed tube chassis,
rear engine, deep wheels and directional tires. The
[Monster Jam 101 guide](https://www.monsterjam.com/en-gb/monster-jam-101/)
provides approximate class dimensions of 17 feet long, 12.5 feet wide and
10.5 feet tall, 12,000 pounds, 1,500 hp, 66-by-43-inch tires at 23 PSI, and
30 inches of four-link suspension travel. These are class-level reference
quantities; the 137.8-inch wheelbase and individual panel/chassis coordinates
are photographic estimates. The selected 25-inch wheel is a visual estimate.
The sources inspected do not establish this truck's exact axle-spool hardware.
Selectable axle locks, gearing and torque interpolation are simulator choices.

## Original model work

The Subaru has continuous wide rear/front quarters with actual wheel apertures,
a short crowned coupe roof, a single long door per side, four side-window
openings, a physical hood scoop, separate hood vents, a curved perforated
bumper, period headlamp fluting and covered fog lamps. It uses a separate
closed rear wing, rear-window glass, shaped lamp clusters and gold wheels
with ten forked spoke groups. The prepared body contains 75,747 vertices.

Formed sheet surrounds now connect the front/rear glass to the roof and side
frames. Matching returns close the bonnet, trunk, shoulders, cowl and rear
window sill. An opaque parcel shelf and rear bench close the view toward the
rear axle. These revisions preserve the dimension and wheelbase anchors.
All ten candidate 4 native views were inspected and the targeted joins,
pillars and parcel shelf were accepted. Fascias, vents, scoop, mirrors and
interior details remain simplified compared with the reference photographs.

Grave Digger has a long domed wagon roof, a lower narrow hood, separate rounded
front fenders, a green tube frame with triangulated bays, rear engine/header
geometry, red headlamps and an original geometric interpretation of the
flame/ghost/graveyard paintwork. The 66-inch tires have a separate bulged
carcass and 48 directional chevron half-lugs. Deep 25-inch wheel barrels and
beadlock rings remain separate from the tires. The body contains about
93,539 prepared vertices. A separate normalized nitrogen shock with a remote
reservoir is exported for animation by the native suspension code.

No downloaded vehicle meshes, CAD or photo textures are included. Interiors,
small trim, lettering, livery, chassis stations and physics coefficients are
approximations. These are distinct, reference-based game models, not scanned
or manufacturer-licensed digital twins.

## Tire-size assets and checks

The size upgrade has three staged diameters through 50 inches. Every generated
tire keeps the original wheel bead radius; a radial derivative transform
updates the shading normals as the sidewall grows. The mesh width remains at
stock width so the native component can apply the compound/load-width scale
once. Each size needs one mesh shared by all compound stages. Grave Digger's
66-inch factory tires remain at 66 inches through its compound stages.

`node Tools/validate-added-vehicles.mjs` checks the two physical envelopes,
actual empty wheel wells, stock tire/rim dimensions, lamp slots, glazing,
roof crown, scoop height, wing, cage and chevron topology, plus the tire-size
coordinate/normal transform. The focused source suite passes **94 checks**:
23 for Grave Digger, 67 for the 22B and four shared tire-size checks.

The tests keep brake emission confined to rear lamps and the monster's red
headlights independent. For the painted livery, 287,568 triangle-interior and
edge probes measure 0.285–1.400 mm clearance from the body with outward winding.
Structural checks count actual rails and diagonal braces separately.

The 22B's end closures share their curved boundary with the side shell,
bonnet and boot. Separate nearest-triangle checks cover the connected window,
roof, shoulder, cowl and sill edges, outward-facing glass/surrounds, and opaque
parcel-shelf coverage. These checks target gaps and exposed bars seen in the
native views, rather than only counting newly added objects.

The final complete twelve-body source suite passes after these visual
corrections, including all 156 expedition assertions. Its
[model report](model-validation.json) matches `SourceTests/models-final.log`:
Grave Digger has 93,539 prepared vertices and the Subaru has 75,747.
`SourceTests/running-gear-final.log` records a passing running-gear suite for
all twelve wheel designs and four brake/caliper meshes. The 32 sampled Subaru
panel junctions have a worst adjoining-triangle gap of 0.433 mm; all 15 parcel-
shelf rays are occluded. These are source checks rather than a native FPS claim.

Candidate 5 was held after its park side-roll tire-clearance failure.
Candidate 7 corrected the buried ramp support issue, passed the final
native checks, and was installed. The [fidelity verification record](expanded-roster-fidelity.md)
preserves both outcomes.

The [original Subaru release](https://www.subaru.co.jp/news/archives/98_1_3/3_16_1.html)
also confirms the 15.85-US-gallon fuel tank, all five transmission ratios and
4.444 final drive, front/rear ventilated discs, and DCCD 35:65 open torque split.
The monster truck uses an estimated 30-gallon capacity; no authoritative tank
capacity was located. Its body collision width is separate from the wider
overall tire envelope.


## Upright suspension diagnosis

The candidate 2 diagnostic binary (`425af6ea1939b701…`) measured all four Grave
Digger tire supports hitting bare tarmac while chassis roll grew from 0.066° to
1.823° in 0.5 seconds and two tires repeatedly lost load. The measured roll
inertia was 1368 kg m². The original spring response used the 1361 kg static
corner share even though the normal force lever gives about 496 kg effective
response mass. Combined with static tire grip, this amplified roll rather
than damping it.

The corrected response retains static corner load for preload and travel but
uses actual Chaos principal inertia, mass frame and contact lever for its
implicit response. Damping velocity is sampled at that same force point.
A standalone rigid-body regression reproduces the old 20 Hz amplification and
checks decay across 120/60/30/20/10 Hz while preserving static ride load.

Candidate 3 then passed 136 of 138 movement checks; the remaining failures
were excessive braking compression on the EarthCruiser and Grave Digger.
The latest source predicts the combined spring and tire-force response, then
solves the full-bump reactions together within the existing force cap. The
regression advances the queued forces through individual physics substeps,
reproduces the old travel overshoot and verifies the corrected bound. Ordinary
supported suspension and unsupported wheels receive no supplemental reaction.

All **719 core checks pass**. Candidate 4 subsequently passed all **138 native
movement checks** and **47 recovery checks**, including the separate camera
and obstruction guards. Exact build identity is recorded in the
[consolidated native record](expanded-roster-native.json).
