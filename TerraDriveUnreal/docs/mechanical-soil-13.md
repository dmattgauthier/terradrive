# Drivetrain, running gear and soil pass 13

The garage adds staged drivetrain, differential and portal-axle upgrades.
Visible suspension, steering, brakes and wheel details follow the selected
vehicle and its installed hardware. Soft-ground wheel paths gain less uniform
shoulders and scattered low deposits, while tire spray responds to the material
and the work being done by the loaded drive tires.

This page describes the implementation and its limits. Final package identity,
native results and reviewed captures belong in
[validation-native.md](validation-native.md); earlier accepted builds do not
verify this pass.

## Garage hardware

Stock means the original vehicle specification. Factory four-wheel drive,
low-range ratios and axle locks are retained when an upgrade is selected.
The new rows add missing capabilities rather than remove existing equipment.
They are fictional aftermarket conversions within the simulator, including
conversions of the Civic and Urus; they are not claims about manufacturer
options or the feasibility of a real conversion.

| Upgrade | Stage 1 | Stage 2 | Stage 3 |
| --- | --- | --- | --- |
| Drivetrain | Add four-wheel high drive where missing. | Add selectable low range, retaining a stronger factory low ratio. | Reinforced crawler gearing with a stronger low ratio. |
| Differentials | Add a selectable lock to the original driven axle where missing. | Add selectable locks on both axles. | Retain both locks and add limited-slip bias while unlocked. |
| Portal axles | About 3.1 inches of hub offset and 1.18:1 reduction. | About 5.1 inches of offset and 1.35:1 reduction. | About 7.1 inches of offset and 1.55:1 reduction. |

Added hardware carries mass. Portal stages also add rotational inertia and
gearing losses, increase clearance, and trade gearing speed for wheel torque.
The effect is included in drive and reverse ratios, wheel inertia and chassis
setup; selecting a portal stage is more than moving the displayed body upward.
The garage shows the current effective equipment and its imperial-unit
consequences.

**F** selects available four-wheel drive, **L** selects available low range,
**Z** controls the rear lock and **U** the front lock. Range changes require a
near stop. Four-wheel-drive and lock changes also require a stop. The front
lock requires low range when low range is equipped, and the Wrangler retains
its rear-before-front interlock. A permanent
all-wheel-drive vehicle remains permanent all-wheel drive. A locker on an axle
that is not currently driven cannot supply drive torque to that axle.

Garage saves append the three hardware rows after the original seven upgrade
rows. Version 1 and 2 saves retain their original stage values and start the
new rows at stock. Version 3 saves include all ten rows. Invalid stage arrays
are rejected rather than partially applied.

## Visible running gear

The wheel area now separates rotating friction surfaces from fixed calipers
and steering knuckles. Axle housings, driven half-shafts, steering links,
springs, dampers and suspension arms follow the moving wheel positions and
the suspension layout in the vehicle specification. Portal cases occupy the
offset between the axle joint and wheel hub when fitted. The stock and tuned
rim and hub details remain distinct from the tire geometry.

The iron and ceramic rotor finishes use Epic Automotive Materials through
project-owned instances with the renderer usage settings required for instancing.
Scanned rock materials also retain their required Nanite usage. Import reads
those settings back, and native verification rejects default-material fallbacks.

| Vehicle | Layout represented in the wheel area |
| --- | --- |
| Wrangler Rubicon | Front and rear live axles, differential covers, links and lateral location rods. |
| Bronco Badlands | Independent front arms and a linked live rear axle. |
| Civic Sport | Front struts, rear multilink arms and transverse front drive; rear drive shafts appear after the four-wheel-drive conversion. |
| Sprinter 2500 | Transverse front leaf and layered longitudinal rear leaves. |
| HUMMER EV SUV | Independent suspension with air-strut bellows. |
| Urus Performante | Independent arms, steel coils and larger drilled ceramic-style brake rotors. |

The rims add stepped inner barrels, bead seats, drop centers, recessed lug
seats, washers, fastener sockets and valve caps around the retained factory
spoke profiles. Plain, vented and drilled rotors have distinct physical faces;
the Civic's solid rear rotor remains distinct from its front rotor.

The aim is readable mechanical structure and motion from the garage and close
driving views. These parts remain procedural reconstructions. They do not
represent a measured service-manual assembly, a deformable suspension linkage
simulation or a complete mechanical interior. Existing coachwork, glazing,
lamps and collision work are retained.

## Wheel paths and displaced material

The proving ground uses the same physical ground displacement for wheel
support and the rendered rut surface. Its local deformation grid is about
2.5 inches between nodes. Tire load, contact area, slip, speed and the existing
packing/shear history determine the change. Repeated passes pack the groove;
sustained shear can deepen disturbed soil within the configured local layer.

| Surface | Ground response |
| --- | --- |
| Pavement or tarmac | Rigid ground. Black rubber marks require tire slip. |
| Rigid rock | No excavated rut or displaced boulder material. Loose gravel can produce visual chips under driven-wheel spin. |
| Firm dirt | A shallow, light disturbed path with little displaced material. |
| Loose dirt and mud | A physical depression, rounded walls and unequal side banks with smaller outer clods. |
| Grass | Crushed planting and disturbed ground; wet, soft grass can rut. |
| Snow | Compaction within the local snow layer and pale displaced shoulders. |

The new variation is fixed in world space. Broad changes alter soil strength
and wall width; smaller lobes vary the bank width, height and outward deposits.
The two sides receive different material weights. Driving or rendering another
frame does not choose a new random floor under a supported tire.

Each stamp first measures the volume actually excavated. Only a
surface-dependent share can be placed in receivers beside the tires, and each
receiver has a low height envelope. Material that cannot fit is recorded as
compaction. The accounting remains excavation equals displaced bank volume
plus compaction. Existing depth limits, smooth edge profiles, tile-boundary
synchronization and undisturbed far shoulders remain in place.

The airborne effect uses surface-specific clods, gravel, sand, grass fragments,
snow and water droplets. Loaded driven-wheel tread speed and slip determine
the launch; ordinary rolling produces less disturbance than wheelspin.
Particles travel in world space, fall under gravity and expire on impact or
after their short lifetime. Their visual variety does not excavate extra ground
or create permanent debris attached behind the tires.

The complete acquired Winter Expedition level retains its authored landscape.
Physical height deformation applies to the proving ground's native terrain;
the original Winter Scene landscape does not acquire the native rut grid.
See [winter-level.md](winter-level.md) for this boundary.

## Verification scope

The native rut fixtures retain the previous continuity, maximum-depth,
cross-slope, bank-height, far-shoulder, rigid-ground, packing, unloaded-wheel,
repair and volume checks. New checks measure variation in the physical bank
spread along each path, unequal material on its two sides, and deterministic
replay of the floor, shoulders, packing and churn after clearing soil history.
The actual driven Jeep mud/snow trials remain part of the complete rut run.

Run `Tools/verify-ruts.ps1` for the complete physical profile and real-drive
checks, or add `-DrivenOnly` for the two motor-driven trials. The existing Art,
Movement, Rollover, Detail, Winter, Transitions and graphics-preset checks cover
the surrounding native regressions. Verification uses isolated player files,
render caps and GPU telemetry; a short passing run does not demonstrate
long-session thermal stability.

`Tools/verify-mechanical.ps1` checks the six vehicles' equipment, saved-build
migration, four portal stages, actual mass and ride height, loaded running-gear
materials and wheel/rim/rotor/caliper motion. `Tools/verify-spray.ps1` uses
controlled loaded-wheel inputs to isolate grass, mud, snow, sand, gravel and
water ejection, varied transforms, expiry and non-emitting surfaces. These
controlled emitter fixtures complement the actual driving and rut trials.

Source export, asset import, collision data and the final executable must agree
before release. The preserved browser source, player garage/graphics files,
original terrain height data and original Winter Scene maps are compared to
the checkpoint separately from behavioral acceptance. Generated UAssets,
Windows builds, acquired Epic/Fab content and private verification receipts
remain local build products and dependencies.

## Native acceptance

The current Windows package passes 1,415 native checks, 467 portable simulation
checks and 648 portable spray checks, with 198 reviewed current captures.
Executable SHA-256: `0eceea64de4767f4f859c89e6b0c386c45cb8d779434910b7b2c850223bd44bb`. See
[validation-native.md](validation-native.md) for provenance and scope.
