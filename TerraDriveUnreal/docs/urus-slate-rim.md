# Urus Performante and Slate Rim quarry trail

Native-only art round, October 22, 2026. The original browser tree is preserved.

## Urus

The model represents the original 2024 V8 Performante, with the brochure's 202.24-inch length, 79.76-inch body width, 63.70-inch height and 118.34-inch wheelbase. It does not substitute the newer SE hybrid. References are [Lamborghini's history page](https://www.lamborghini.com/en-en/history/urus-performante) and the original manufacturer's brochure, retained locally for inspection rather than distributed as a game asset.

`Tools/urus-body.mjs` uses longitudinal body stations and a nonlinear vertical cross-section: tucked lower body, a drawn door waist, shoulder crease, broad fenders and tapered nose/rear corners. Hood, roof, hatch, wheel arches, intake reveals, lamps, spoiler and exhaust remain separate authored surfaces. The side-window frames have actual openings rather than a solid black backing; curved glazing exposes the cabin.

`Tools/urus-cabin.mjs` adds shaped seat cushions/backrests, bolsters and stitching, a rounded dash, hexagonal vents, instrument cluster, two center displays, center-console controls, flat-bottom steering wheel and inset door cards. The rear hatch has an inset opening, heater lines and a wiper; the wheels use the brochure's standard 22-inch Helianthus Silver finish. Carbon parts use a local-space woven material, with conservative paint metalness and softer clear-coat reflections. Garage fill lights have reduced specular contribution to keep body contours legible. The existing photographic HDR cube supplies stable skylight illumination directly, rather than depending on sky-dome capture timing. Vehicle render proxies stay visible while their PSOs warm.

This is authored manufacturer-reference geometry, not licensed manufacturer CAD or a scan. Proportions and detailed surfaces remain approximate, and a successful automated geometry test does not certify photographic accuracy or Forza-equivalent art quality. Mechanical hardpoints, stock tuning and upgrades remain independent of the body art.

## Slate Rim

Select the Urus in the garage, then press **J** until **Slate Rim quarry trail** appears. It is the ninth challenge, around the southern/eastern perimeter of Granite Trials. **R** restarts that challenge. Existing courses keep their previous order.

The trail is approximately **1,065 feet long** and **18.4 feet wide**, with 20 directional gates. `Tools/native-terrain.mjs` grades the native height field along its driving line: a smoothed longitudinal profile, gentle drainage crossfall and feathered cut/fill shoulders. Physics and rendering read that same field. The dirt is firmer along the line, blending into loose shoulders over the same width used by its shader. There is no rigid road overlay concealing tire ruts. Scanned rock faces lie into the hillside as exposed bedrock; boulders and varied grasses gather along the shoulders. A rough optional wheel line exposes tire contact and articulation. Three original trees and old incidental props were removed from its corridor in the native export.

The driving line has gentle sections and natural climbs/descents. The stock Urus is the verification vehicle. The existing steeper Granite Trials routes remain the place to compare axle lockers, low range and descent assistance on suitable 4WD vehicles; the Urus is not given fictional axle lockers.

Native driving exposed an automatic-shift defect: spinning wheels could select cruising gears while the chassis barely moved. Automatic shifting now uses road speed with a shaft-speed guard, retaining a useful ratio during wheelspin and downshifting under load. Seven additional independent regression cases cover that correction.

The automatic transmission also has a bounded converter launch response. Engine RPM can rise above the stationary input shaft under throttle, then follows shaft speed once coupled. This fixes an idle-RPM stall on an otherwise supported climb. Stall speed is an estimate, bounded by the rated peak-torque RPM and 2,300 RPM by default; it does not add an arbitrary wheel-force boost. Six independent checks cover idle, partial demand, coupling and input bounds. The automated route driver uses ordinary throttle/brake/steering with a curvature-based steering target.

Cold native runs also exposed tire/suspension oscillation during long render frames. Spring/damper response now uses an implicit step with gravity compensation, preserving static ride height; tire stiffness includes the inertia of the supported vehicle. Electronic traction control cuts drive and applies bounded individual-wheel braking where the vehicle's feature record enables it. Grip still comes from loaded contacts, and open axles remain open. Eleven additional independent checks cover support across frame times, contact damping and forward/reverse traction control.

Five further cases exercise useful drive through the actual tire solver and decay of the combined tire/suspension roll response. The latter reproduced the native long-frame oscillation before the inertia budget was shared between the interacting contact axes. Debris collision traces are batched per frame, with a body-bounds rejection before detailed vehicle traces. Terrain updates reuse fixed triangle topology, cached soil variation and adjacent grid heights for normals. Physical rut depth and rendered rut geometry retain the same height data.

Brake holding uses the body's actual translational and rotational contact mass, shared between loaded tires. This prevents high-body vehicles from overcorrecting contact motion while Space is held. Nine further checks cover effective contact mass and combined suspension/brake settling for the Bronco, Sprinter and HUMMER across frame intervals. `-TerraValidate -TerraBrakeOnly` runs the focused all-vehicle brake/reverse/incline checks without replacing full verification.

New sources are [Mountainside](https://polyhaven.com/a/mountainside), [Boulder 01](https://polyhaven.com/a/boulder_01), [Grass Medium 01](https://polyhaven.com/a/grass_medium_01), [Dry Ground Rocks](https://polyhaven.com/a/dry_ground_rocks) and [Rocks Ground 05](https://polyhaven.com/a/rocks_ground_05), all from Poly Haven under [CC0](https://polyhaven.com/license). Original downloads and checksums are in `Vendor/Environment/manifest.json`. No experimental Megaplants/PVE runtime dependency is introduced. Previously acquired African Slate Quarry scenery remains optional and its raw Fab content stays outside the public repository.

The new scans use instanced meshes and distance culling. The two solid rock scans use Nanite with a full-resolution collision fallback. Medium/tall grass variants have small conventional blade geometry; high-resolution offline source packs are not loaded wholesale. C++ compilation and editor shader workers are limited to two jobs on the 16 GB development laptop.

## Verification

`Tools/validate-export.mjs` checks all exported meshes/material slots, trail samples, route gates and existing terrain/vehicle invariants. `Tools/test-core.cmd` runs the independent simulation checks. `Tools/verify-native.ps1` requires a fresh packaged report, successful exit and at least 256 passing cases, including the stock Urus's full trail traversal with throttle/steering inputs and no intermediate teleportation. It also checks the new scans' native collision, grass instances, cooked photographic ground textures and actual vehicle rendering in four close views.

Focused diagnostics: `-TerraValidate -TerraCapture -TerraTrailOnly` exercises the new trail; `-TerraValidate -TerraCapture -TerraVisualOnly` captures the six vehicle bodies and existing loop/quarry. Neither replaces the full verifier. Results, rendered observations and remaining limits are recorded in [validation-native.md](validation-native.md).
