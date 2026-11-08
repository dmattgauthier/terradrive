# Expanded roster, tire kits and native fidelity

This follow-up to merged PR #11 addresses the Urus hood reflections, the
Granite Trials ground boundary, vehicle selection and recovery. It appends
Grave Digger and the 1998 Subaru Impreza 22B STI to the ten existing vehicles.
Browser source and acquired Epic/Fab content remain preserved.

## Vehicle models

| Vehicle | Reference and implemented features | Representation limits |
| --- | --- | --- |
| Grave Digger | Contemporary black/green panel-wagon body, domed roof, narrow bonnet, separate front fenders, triangulated green tube chassis, rear engine and headers, constant red headlamps, long-travel nitrogen struts, separate beadlock rims and 66-by-43-inch directional tires. | Original procedural reconstruction of the recognizable design, without a claim to a particular competition chassis. Monster Jam's approximate class dimensions, 12,000-pound mass, 1,500 hp and 30-inch travel are reference anchors. Wheelbase, track, spring/damper rates, fuel capacity and detailed geometry are estimates. |
| Subaru Impreza 22B STI | 1998 two-door GC body, continuous wide quarters with actual wheel openings, crowned bonnet and coupe roof, open hood scoop, separate vents, fog covers, curved bumper openings, adjustable rear wing and gold 17-inch wheels. Factory dimensions, 2,800-pound mass, 276 hp, rated torque and transmission ratios anchor the reconstruction. | This is the original Impreza 22B STI, rather than a later WRX STI sedan. Interiors, trim and suspension calibration remain approximations. The driver-controlled center coupling is represented by the game's center-lock control. |

Grave Digger's flame, ghost and graveyard artwork now follows the body as thin
painted surfaces. Candidate 1 exposed raised tube-like artwork; those tubes
have been removed while actual cage and chassis members remain. Red front
lamps have constant emission independent of the rear brake-light circuit.

The 22B's closing faces now share their end curvature with the side shell,
bonnet and boot. Their outlines follow the adjoining panels instead of a
wider rectangular cap. This removes the protruding side strips and open joins
identified in candidate 1's front and rear views. The latest source also has
formed windshield and rear-window surrounds, connected roof, shoulder, cowl
and trunk junctions, and an opaque rear parcel shelf. These changes address
exposed rod-like pillars, small openings between panels and the visible rear
axle through the cabin. All ten candidate 4 native views were inspected:
the closed joins, formed pillars and parcel shelf are accepted. The prepared
body has 75,747 vertices. Angular fascias, heavy hood-vent bars, the scoop,
mirrors and cabin remain visibly simplified compared with the photographs.

Grave Digger uses four driven wheel contacts and speed-dependent coordinated
rear steering. Its factory fixed 4WD couples the front/rear shafts. A center
retrofit or EV conversion changes that coupling to match the chosen hardware;
the source does not assert that the real truck uses the game's selectable
axle-lock arrangement. Both additions participate in existing damage, fuel,
upgrades and terrain interaction. The Subaru's fuel capacity is 15.85 US
gallons from the factory release; the monster's 30 gallons is an estimate.

See [dimensions, multiple-angle references and known approximations](expanded-roster-references.md).
These are original reference-based game models, not scanned or
manufacturer-licensed digital twins. No downloaded vehicle mesh or vehicle
photograph is included in the exported art.

## Existing models and terrain

- The Urus carbon bonnet uses a ridge-following surface and analytic normals.
  Its narrow raised ribs are represented by geometry that follows their curves;
  the fix does not blur reflections or increase material roughness.
- Every existing vehicle receives adaptive panel tessellation and continuous
  seam/reveal geometry. Straight surfaces retain their form with fewer hidden
  faces; bends are sampled against positional and angular error limits.
- Granite Trials uses the same world-space ground layers as the surrounding
  terrain, with a broken, feathered apron. Markers keep their original colors.
  Candidate 4 close and oblique native views confirm the blended boundary.
  The quarry path mask is baked once instead of tracing its segments per pixel;
  its throughput effect still requires matching real-time measurements.

## Tire-diameter upgrades

The new tire-size slot has three explicit stages. Each diameter is rounded up
to a whole inch at one-third, two-thirds and all of the interval between the
factory diameter and 50 inches. For example, the 22B's approximately
24.4-inch factory tires become 33, 42 and 50 inches. Grave Digger keeps its
larger 66-inch factory tires; selecting a kit never shrinks them.

Each kit retains the original rim and bead diameter. Its tire sidewall is
reshaped rather than uniformly scaling the tire away from the rim. Compound
and width upgrades continue to affect their existing physical properties.
The enlarged radius feeds actual wheel contact, inertia and running-gear
placement, rather than only changing the visible mesh.

Body-derived fitting metadata selects lift and track additions for every
eligible vehicle and stage. The clearance sweep includes full steering,
suspension bump, the widest compound and every wheel-track stage. On the
6×6, only the trailing axle moves rearward as needed to separate tandem tires;
the front and middle axles retain their authored locations. Independent
rollover clearance witnesses come from the exported tire meshes, including
shoulders and sidewalls outside the body footprint.

These are substantial fictional conversions, particularly on road cars.
They preserve the existing wheel wells and structural underbody rather than
silently cutting them away. The garage reports the resulting lift and width.
See [body-derived fitting, measurements and limits](tire-fitting.md).

Fixed-size track pods and tire-diameter kits are mutually exclusive. The
garage requires the diameter slot to return to DEFAULT before fitting tracks,
and tracks must be removed before selecting a diameter kit. Rejected changes
preserve the installed configuration and display the required next step.

## Recovery, HUD and compatibility

**R / Recover here** uprights the vehicle at its current horizontal position,
finds support above terrain/objects and checks the actual welded collision
shapes for space. A blocked recovery leaves the vehicle unchanged. Route
progress, damage, charge/fuel and existing ground marks are retained.
**Restart route** remains a separate pause-menu action.

Driving status cards and key hints sit at the bottom of the screen. The chase
camera fits the visible body and tires above the complete status area,
including tall vehicles and large-tire conversions. The tire-size upgrade
row remains accessible in the garage's scrolling upgrade list.

Candidate 3 exposed a side-roll camera problem: the optical focus could fall
below the road, causing the spring-arm collision sweep to start underground.
The candidate 4 source starts that sweep above terrain and places the optical
framing adjustment in the arm's local socket offset. This preserves the
intended view while giving the collision sweep a valid starting position.
All 47 candidate 4 recovery checks pass, including eight before/after camera
and HUD checks. In the 1600-by-900 captures, camera height above terrain is
137.48–157.12 inches and minimum vehicle-to-HUD clearance is 122.15 pixels.
The separate twelve-vehicle largest-tire fixture measures 72.07–83.71 pixels
of clearance above the full bottom status area.

Garage format 9 appends the two vehicles and tire-size slot. Versions 1–8
retain their prior vehicle profiles and upgrade stages; existing roster
indices are not reordered.

## Upright suspension correction

The candidate 2 native diagnostic found a specific physics instability on
Grave Digger. All four support rays hit bare tarmac, yet alternating tires
unloaded as chassis roll grew. Its spring response used the static corner
mass for the impulse calculation, ignoring the smaller effective mass caused
by the body's rotational inertia and the tire's lever arm. Static lateral
grip and suspension then overcorrected the same roll motion.

Static corner load still determines spring preload and bump progression.
The corrected implicit response uses actual Chaos mass, principal inertia,
mass-frame rotation and contact lever. Damping samples velocity at the same
point where the force is applied. Body quantities are cached once per step,
and the redundant mount-velocity query has been removed. Factory spring and
damper rates, gravity and equilibrium ride height are unchanged.

Candidate 3's movement test then found excess brake dive on the EarthCruiser
and Grave Digger. The full-bump calculation had treated each suspension stop
independently even though braking and all wheel forces rotate the same body.
The new bounded solve accounts for those queued forces together and checks
travel throughout the physics substeps. It adds only the necessary stop
reaction within the existing force cap; ordinary ride support and airborne
wheels receive no extra stop force. Candidate 4 passes all 138 movement
checks, including both previously failing brake-dive cases, all twelve
vehicles, seven terrain-boundary coasts and the solid barrier test.

## Native verification and release status

The final Windows executable passes **1,708 native checks**. Its SHA-256 is `70a70cfd840e86fa7810bbcd837a1b93f0fd8ed6d7356beb1c844bd14e9ae297`. The [consolidated native record](expanded-roster-native.json) binds the final code, cooked content, receipts and measurements. The package passed the local preservation and promotion checks and is installed under Build/Windows.

The release record contains **1,884 accepted native checks** in total. The remaining 176 are the C5 interface and Grave Digger art checks and C4 Subaru art checks: those interface routines and cooked models/materials are unchanged in the final executable. They are identified separately rather than described as rerun.

| Suite | Build | Passing checks |
| --- | --- | ---: |
| RolloverPerformance-Grave | C7 | 59 |
| Movement | C7 | 138 |
| Mechanical | C7 | 707 |
| Recovery | C7 | 47 |
| Expanded | C7 | 278 |
| Rollover-Grave | C7 | 91 |
| Rollover-Civic50 | C7 | 91 |
| Rollover-Subaru | C7 | 91 |
| Quarry | C7 | 25 |
| Ruts | C7 | 117 |
| RutTransitions | C7 | 64 |
| Interface | C5 | 154 |
| Art-Grave | C5 | 11 |
| Art-Subaru | C4 | 11 |

All accepted suites have zero reported runtime errors. The final movement checks cover all twelve vehicles, braking compression, seven terrain transitions and solid-object stopping. Recovery preserves horizontal position, heading, progress, damage and energy while rejecting blocked upright placement. The narrow-post fixture removes the post before final supported settling, so it does not establish stable landing with that post left in place.

The retained C3 movement failure exposed coupled braking/full-bump forces; the retained C5 real-time rollover failure exposed a buried ramp underside incorrectly treated as inverted loop support. C7 passes the corrected tests, including actual buried-apron rejection, exposed-loop support and tire clearance during settling. Its nine real-time poses stay near the 20 FPS cap (19.7362–20.0003 FPS, worst p95 52.4348 ms). The unchanged clearance limit is 4 cm; the worst sampled visible-tire clearance is −3.796 cm. No test tolerance was weakened.

The final model report and source logs pass all twelve bodies, twelve wheel designs and four brake/caliper meshes. Focused source suites pass 719 simulation-core, 308 center-differential, 31 energy, 94 added-vehicle geometry and 327 tire-fit checks. Generated body/art assets match the versions visually inspected in the prior C1/C4/C5 captures.

### Matched real-time quarry measurements

All runs use the same stock-Urus route inputs and benchmark camera, 1920×1080, Balanced quality, 45 FPS cap, normal physics and a real elapsed-time clock. The old control is repeated without code/content changes; the final candidate repeat starts after cooldown. The route is unconstrained; actual distance and terrain work are recorded because physics changes can alter the resulting workload.

| Run | Average FPS | Mean ms | p95 ms | Worst ms | Distance ft / gates |
| --- | ---: | ---: | ---: | ---: | ---: |
| before-balanced | 30.76 | 32.51 | 51.02 | 100.84 | 256.7 / 4 |
| after-balanced | 44.72 | 22.36 | 22.63 | 56.95 | 257.8 / 4 |
| before-balanced-paired | 44.96 | 22.24 | 22.46 | 26.73 | 257.7 / 4 |
| after-balanced-cooled | 44.97 | 22.24 | 22.45 | 27.18 | 257.8 / 4 |

The shader change replaces a twenty-segment search per dirt pixel with a baked filtered coverage lookup and avoids zero-weight texture samples. The timing table measures the combined update, including physics and mesh changes; it does not isolate a shader-only speedup. Short capped runs do not establish uncapped headroom or long-session thermal/PC-crash stability.

The unchanged old build also reaches 44.96 FPS on repeat, while the new build reaches 44.72 FPS in its first completed run. These are effectively cap-limited parity, not evidence of a 45 percent speedup over the initial 30.76 FPS reading. The specific cause of the initial contrast was not isolated. The uninterrupted second new run was stopped at the 77°C guard (peak 77.8°C) and has no completed measurement; it remains recorded as a thermal abort. The final new run is a cooled retry. No cooling or long-session stability improvement is claimed.

### Visual and preservation limits

Sequential large-tire test captures retain earlier vehicles’ pavement marks. Repeated tight burnouts, particularly with the monster truck, can produce hard-edged overlapping skid ribbons. The same pattern occurs in C4/C7 and is a remaining mark-rendering limitation, not corrupted tire geometry or shadows.

The Urus ridge highlights are smoother in the reviewed hood views; separate vent-lip noise remains. Granite Trials now has a broken mixed ground apron instead of a straight material cut. The final stock Urus completes all 20 quarry gates upright. Six survey sectors are captured; 04 and 06 are heavily occluded by conifers, so only their visible peripheral ground was judged.

Grave Digger and the 22B are original photo-based models. Grave Digger artwork is a simplified paint interpretation; Subaru fascia, vents, lamps, mirrors and interior still need refinement. The roster remains below the photorealism target. Source documentation records the references, measured geometry and remaining visual limits.

Final preservation verifies 1,251 browser/player files and 715 acquired asset files unchanged. The promotion step copies the current playable build's Saved files byte-for-byte and retains the prior PR #11 package as the sole rollback. Cleanup removes superseded generated package payloads while retaining logs, reports and current evidence.

The accepted package is installed at `Build/Windows/TerraDrive.exe`. Promotion preserves all 37 current player files byte-for-byte. Cleanup removes 19.457 GiB of superseded generated build payloads, retaining the prior PR #11 rollback and all current reports, logs and verification captures.
