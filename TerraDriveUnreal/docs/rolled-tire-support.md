# Rolled tire support

The previous physics used suspension rays for wheel contact and mesh-matched convex coachwork for body contact. Tires themselves had no rigid collision. A sideways suspension ray cannot support a tire against horizontal ground, so wide sidewalls could pass through the terrain before the coachwork touched it. Grave Digger's exported stock tire reaches 193.13 cm from the vehicle centerline; its coachwork reaches 100 cm. That left about 93 cm of sidewall penetration untested by body-only rollover checks.

`TerraVehicleTireContact.cpp` adds a bounded carcass contact solver when the chassis tilts past about 50 degrees. It uses each wheel's actual suspension center, steering orientation, tire width and a rounded radial profile. Larger tire kits retain the same bead radius and use the exporter's bead-preserving shoulder scaling. Supported inverted loop driving retains its normal suspension path.

At most two candidates and two real collision rays per wheel are considered. Live terrain samples supply deformed natural-ground contact; short rays also resolve nearby upper surfaces of rocks, constructed tracks and other obstacles. The solver applies normal and Coulomb-friction impulses with rotational effective mass. It neither teleports the vehicle nor cooks, rewelds or moves collision geometry. This addresses rolled ground and upper-object support, not comprehensive wheel CCD against every vertical wall. Actual coachwork collisions continue to produce body scrapes; tire support does not fabricate body impacts.

Chaos accumulates impulses before simulation. The solver therefore tracks predicted linear/angular velocity while resolving eight fixed projected contact iterations, followed by one combined Chaos impulse per contact, so multiple contacts cannot repeatedly apply the same missing velocity change. The prediction also includes the upcoming actual world-gravity velocity change; gravity itself is still integrated only by Chaos. Omitting that prediction produces frame-rate-dependent resting penetration.

The tire prediction also considers at most four recent **actual Chaos coachwork contact witnesses**. A tire impulse can attempt to rotate a roof or shoulder through the ground; without that body reaction in the prediction, the solver can report successful tire separation that Chaos subsequently prevents. Witnesses expire after 0.20 seconds and are discarded after more than 8 cm of tangential movement, a plane gap outside -4 to +3 cm, a changed ground normal/height, or loss of the supporting component. Moving/simulated surfaces are excluded from this approximation. Teleport, vehicle selection and recovery clear the cache. These four constraints affect prediction only: the solver submits no extra coachwork impulse, and Chaos supplies the real body response. The tire query budget remains two candidates/rays per wheel; these constraints add no collision queries.

The `NativeC2Diagnostic/Rollover-Grave` run exposed why this coupling matters. Tarmac side-pose minimum visible tire clearance improved to -1.30 and -1.01 inches after accumulated impulse projection, within the existing 1.6-inch limit, but Pine Ridge side/oblique poses still reached -2.73 to -3.31 inches. Analytic contact residuals could already be below 0.3 cm/s while the tire remained deeply embedded; inflating the tire profile or adding solver iterations would hide the wrong cause. The actual exported Grave profile differed by under 1 cm in an independent angular sweep. C1 and C2 failed evidence remains retained. C3 below verifies the coachwork prediction together with the separate upright suspension response-mass correction.

AutoTest `-TerraRolledTireDiagnostics` reports analytic clearance/residual, the bounded coachwork-prediction count, and the minimum independent visible tire witness with its wheel index/world position. Detailed probe reads occur only in this explicit diagnostic mode, not ordinary gameplay.

Independent acceptance uses `vehicle-tire-probes.json`, baked from actual exported OBJ vertices. Every model has stock and three tire-kit profiles, with up to 96 source vertices per mesh. Rollover drop placement and settled clearance include these points through the live wheel component transforms; they do not reuse the gameplay support formula. `-TerraRolloverTireSize=0..3` selects a kit for both functional and real-time fixtures. `-TerraLegacyRolledTires` is an AutoTest-only counterfactual that disables the new contact solver while keeping the same meshes, terrain and test poses.

Expected functional checks: 91 for one vehicle's quick coachwork suite, 685 for the complete twelve-vehicle suite; an optional real-time guard adds one per pose. The dedicated nine-pose real-time performance suite has 55 checks. Tire clearance and the bounded candidate/ray budget are checked together, while existing body, mass, drivetrain suppression and recovery assertions remain intact. The C3 functional result below covers stock Grave Digger. Other vehicles, enlarged tire kits and real-time measurements require their own recorded runs.

## C3 native functional acceptance — 2026-11-08

`Saved/ExpandedRosterFidelity/NativeC3/Rollover-Grave/receipt.json` records **91/91 passed**, zero runtime errors and ten native screenshots. This was a paced **fixed 20 Hz functional verification**, not a throughput or FPS measurement. The run started at 05:10:34 UTC and completed in 93.74 seconds; peak sampled GPU temperature was 60.73 °C. Reports, captures and failures from earlier candidates remain in their original evidence directories.

Independent minimum visible-tire clearance in inches (negative means penetration):

| Requested drop | C1 | C2 diagnostic | C3 |
|---|---:|---:|---:|
| Tarmac -90° | -3.2658 | -1.2968 | +0.1518 |
| Tarmac +90° | -2.7542 | -1.0144 | +0.1209 |
| Tarmac roof | +54.4743 | +54.4743 | +55.2636 |
| Pine Ridge -90° | -5.5953 | -2.7266 | +31.5663 |
| Pine Ridge +90° | -5.4143 | -3.2233 | -0.0111 |
| Pine Ridge roof | +51.6860 | +51.6860 | +51.2415 |
| Pine Ridge -55° | -1.6012 | -1.6012 | -1.4183 |
| Pine Ridge +55° | -8.0346 | -8.0346 | -0.8121 |
| Pine Ridge -110° | -5.3789 | -3.3064 | -0.0734 |
| Pine Ridge +110° | -6.1804 | -3.2492 | -0.1417 |

The unchanged pass threshold is -4 cm (approximately -1.6 inches). These are observed drop outcomes, not constrained static poses: C3's Pine Ridge -90° drop continued onto its roof (up-vector Z -0.978), and both ±55° drops self-righted. Therefore the +31.5663-inch result is not a stationary side-contact comparison. The worst C3 tire clearance was -1.4183 inches after self-righting; the smallest sampled coachwork clearance was +0.1239 inches.

All ten return-to-spawn checks regained **four supporting tires**, versus two in every C1/C2 trial. These checks verify upright settling after the fixture's zone placement; the dedicated `Recovery` suite separately verifies the new recovery-in-place behavior. Mass/center-of-mass, requested drop pose, body clearance, retained source probes and suppression of tire drive while overturned all passed. Runtime diagnostics used at most four coachwork prediction witnesses, eight tire candidates and four collision rays. No test tolerance was relaxed.

Visual inspection covered the tarmac side, Pine Ridge side, both oblique poses, self-righted pose and continued roof roll, with the C1 Pine Ridge image as a comparison. The large buried sidewalls are resolved in these views, without an obvious oversized support envelope holding tires above the ground. Detailed contact diagnostics were enabled for this run; real-time performance acceptance is recorded separately.

The receipt identifies executable SHA-256 `28848b67b4025a9c1956989947efecf04cec8a967892c3475b18fb02952232a5` and each staged content container hash. Its package was `Saved/ExpandedRosterFidelity/Candidate3/Windows`. Frozen source inputs are recorded in `Saved/ExpandedRosterFidelity/Candidate3/source-inputs.json`, SHA-256 `c100c8e3bb63ab0855790d6f0b3de80a2e5926f63fc6cc4325ea5ca5fafc51b8`. Relevant recorded source hashes:

| Source input | SHA-256 |
|---|---|
| `Source/TerraDrive/TerraVehicleTireContact.cpp` | `a64e55864932a37b2ad9486e8f96897edc76219b4a1fc89155f2ec72402ea9c9` |
| `Source/TerraDrive/TerraVehicle.cpp` | `00ca0dd9547741742b73ccec1d419afdaef62e4605ae1958671db6b02f0d8d08` |
| `Source/TerraDrive/TerraVehicle.h` | `8d6f6abc2c79c6ba7efa09acff0660cc3582d2b16c94bb32e5f40eef2917d146` |
| `Source/TerraDrive/TerraSimCore.h` | `496bbf769722a9790a19ee380b0c7ca1d0270d5ec5f794b68f4a0b98305e7b40` |
| `Source/TerraDrive/TerraRolloverValidation.cpp` | `21bc8faebb21ad9361a2bad31551a2397e3c347b7575809ba2d3b1354d92e494` |
| `Source/TerraDrive/TerraTireProbeValidation.cpp` | `d2a5881371677b00b29f94756e0a6b73e54ed023fc4cb594c81a00ed454aa6c6` |

## Gravity integration diagnostic

A one-dimensional, inelastic contact calculation with 60 Hz semi-implicit substeps exposes the ordering issue independently of any terrain or tire geometry. At 20 rendered updates per second, omitting upcoming gravity settles about 7.04 cm below the contact surface. Predicting gravity in the contact solve settles about 0.32 cm above it. The equivalent pairs at 15/30/45/60 updates per second are -11.40/+1.14, -3.77/-0.23, -1.95/-0.38 and -1.59/-0.50 cm. Negative means penetration.

These are numerical diagnostic results, not native game measurements. The following reproducible calculation isolates the integration ordering; the native probes still decide actual acceptance, including body inertia, angular motion, friction, terrain normals and collisions.

```python
from math import ceil
for hz in (15, 20, 30, 45, 60):
    for predict_gravity in (False, True):
        dt, gravity, height, velocity = 1 / hz, -981.0, 30.0, 0.0
        for _ in range(hz * 12):
            predicted = velocity + (gravity * dt if predict_gravity else 0)
            if height <= max(2, min(60, -predicted * dt)):
                target = (-(height + .5) / dt if height >= -.5
                          else min(150, (-height - .5) * .25 / dt))
                velocity += max(0, target - predicted)
            count = min(6, max(1, ceil(dt * 60)))
            for _ in range(count):
                velocity += gravity * dt / count
                height += velocity * dt / count
        print(hz, predict_gravity, round(height, 4))
```

## Buried ramp underside correction

The later real-time C5 test exposed a separate problem on the park apron: a
Grave Digger tire briefly penetrated roughly 26 inches below the terrain.
Although a repeat diagnostic finished above ground, its settling interval
contained the same failure. It is retained as diagnostic evidence, not a
replacement pass.

The actual apron collider has a bottom at Z446 cm beneath natural ground at
Z460 cm. The suspension accepted that bottom's downward normal as legitimate
inverted-track support. That retracted the wheel, bypassed rolled-tire support,
and enabled the ordinary bump-stop response on a sideways chassis. The fix
rejects a constructed contact witness more than 4 cm below the current natural
surface in the sphere, shoulder-confirmation and finite-tread paths. Exposed
inverted loop geometry still supports tires. No collision mesh, contact-force
cap or tire-clearance acceptance threshold was weakened.

The final real-time fixture includes four checks against actual level geometry:
the buried apron must exist and fail both suspension support paths; the exposed
loop apex must retain both sphere and finite-tread support. Clearance minima
also include settling after a 0.5-second transform-update grace, as well as the
six-second timing interval. This prevents a transient burial from disappearing
before measurement. The resulting suite requires 59 checks across its existing
nine upright/side/roof poses on dirt, snow and the terrain park.
C7's final real-time run passes **59/59**, with zero runtime errors. Its
executable SHA-256 is
`70a70cfd840e86fa7810bbcd837a1b93f0fd8ed6d7356beb1c844bd14e9ae297`.
The four actual-geometry guards pass. Across the nine poses, including settling,
the worst independent visible-tire clearance is -1.49451 inches (-3.796 cm),
within the unchanged 4 cm limit. The park side-roll minimum improves from
-26.1915 inches in C5 to +3.94156 inches above natural ground in C7; the apron
surface is 4.724 inches above that ground. The final native park capture was
reviewed and shows supported tires and coachwork above the apron.

At 1600×900, Cool quality and a 20 FPS cap, the nine timing intervals average
19.7362–20.0003 FPS; the largest p95 frame time is 52.4348 ms. Peak sampled GPU
temperature was 60.39°C. These short real-time tests establish that the rolled
poses avoid the single-digit collapse under this cap. They do not measure
uncapped rendering capacity or long-session thermal stability. Exact pose
measurements, content hashes and the retained C5 failure are recorded in the
[consolidated native record](expanded-roster-native.json).