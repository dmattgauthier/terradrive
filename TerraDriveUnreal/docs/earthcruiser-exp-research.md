# EarthCruiser EXP98 reference model, revision 14

The native addition represents one consistent vehicle: the white, single-cab **2022 EXP98 on the Isuzu NPR gas chassis**, with its pop-top closed for driving. It is an original procedural reconstruction. No manufacturer CAD, downloaded vehicle mesh, photographed paint texture, or browser source has been changed or incorporated into the distributable model.

## Primary references and configuration

Research checked on October 27, 2026:

1. [EarthCruiser's EXP98 sales flyer](https://earthcruiser.com/wp-content/uploads/2023/11/EC98_Sales_Flyer-1.pdf), 13 PDF pages. Its specification page supplies the 83-inch width, 254-inch length, 109/133-inch closed/open height, 132.5-inch wheelbase, 37-inch Toyo MT tires, 17-inch Method wheels, reservoir shocks, four disc brakes, high/low transfer case and axle lockers/manual hubs. It also documents five solar panels, recovery winches and a compressor.
2. [EarthCruiser's April 28, 2022 Isuzu platform announcement](https://earthcruiser.com/earthcruiser-announces-next-generation-overland-vehicle-platform/). This identifies the GM 6.6-liter V8 at 350 horsepower and 425 lb-ft, 6L90 transmission, Atlas transfer case and Fusion axles with Auburn electronic lockers. Those components distinguish this Isuzu configuration from older Fuso models.
3. [EarthCruiser's current EXP/FX overview](https://earthcruiser.com/vehicles/earthcruiser/). Used to confirm the EXP pop-top distinction and kinetic mounting concept. Its changing model-wide equipment claims do not override the period-specific EXP98 evidence.

The flyer was visually inspected at full page size: page 1 front quarter with roof closed; pages 3–5 side, front, rear and both quarters; pages 7–11 cabin, entry, kitchen and pass-through; page 12 dimensions. Photographs support the raked NPR windscreen, swept side-window sill, cab protection/rack, molded camper, separate entry and service sides, rear spare/storage asymmetry and stacked rear lights. Panel measurements remain photo fits, not factory drawings.

Private working references and CPU-only shape previews are under `Saved/Expedition14References/`. They are not source assets to publish. The reference PDF and photos have not been copied into materials or meshes.

## Implemented model

`Tools/earthcruiser-exp.mjs` authors the cab-over front and side sheets, windshield and side apertures, open wheel arches, framed house windows, closed pop-top seam, solar cells, entry and utility hatches, mirrors, ladder, scrub bars, bull bar, winch/fairlead, rear carrier/covered spare, recovery fittings and chassis rails. The glazing has genuine openings in the opaque sheets. The cab and house also have aligned pass-through openings; the dash, seats, console and camper fittings supply depth behind the glass.

The wheel uses an original eight-window Method-style face, barrel, perimeter fasteners, six lug positions and projecting locking hub. It reuses the established native mud-tire carcass and bead compensation. The exact Method part number and hub pattern are not verified. Both exported wheel sides are modeled so a wheel never becomes transparent from the reverse angle.

Materials declare the existing automotive roles for paint, metal, rubber, glass, interior and lamps. Brake and reverse geometry uses the native `brake` and `reverse` roles, including the upper and lower rear brake lights. The model is compatible with the existing Epic Automotive Materials remapping. The recovery rope must use a non-emissive red material rather than the brake-light role.

## Official envelope and estimated hardpoints

Source coordinates are meters: X is width, Y is up, +Z points forward. The ground is Y=0; the unshifted geometric origin lies halfway between the axle centers. The body is deliberately asymmetric around that midpoint.

| Quantity | Value | Evidence/status |
| --- | --- | --- |
| Overall nominal length | 254 in / 6.4516 m | Published |
| Camper body width | 83 in / 2.1082 m | Published |
| Driving roof height | 109 in / 2.7686 m | Published |
| Raised roof height | 133 in / 3.3782 m | Published; raised mode is not modeled |
| Wheelbase | 132.5 in / 3.3655 m | Published |
| Tire radius / wheel diameter | 18.5 in / 0.4699 m; 17 in | Published nominal tire/wheel sizes |
| Tire width | 13.5 in / 0.3429 m | Estimate; EC98 does not publish the width |
| Front/rear track | 70.1 in / 1.78 m | Photo fit, not an axle drawing |
| Cab half width | 39.25 in / 0.997 m | Photo fit |
| Mirror-tip width | About 98.4 in / 2.50 m | Photo fit; exceeds nominal body width |
| Frontmost nominal Z | +2.70 m | Photo-fitted overhang split |
| Rearmost nominal Z | -3.7516 m | Photo-fitted spare/carrier extent |
| Cab front / rear | Z +2.50 / +0.96 m | Photo fit |
| Camper front / rear wall | Z +0.99 / -3.30 m | Photo fit |
| Front axle center | Y 0.4699, Z +1.68275 m | Wheelbase and tire radius, origin convention |
| Rear axle center | Y 0.4699, Z -1.68275 m | Wheelbase and tire radius, origin convention |

Tiny fastener/cover details can extend a few millimeters beyond the nominal envelope. Collision should follow the main shell and chassis, excluding mirror rods, light lenses and recovery loops. In particular, do not build a symmetric 254-inch collider centered on the axle midpoint: it would leave the long rear overhang unprotected and protrude ahead of the nose. Rear contact support must include the camper bumper and spare carrier.

For the proposed stock simulation setup, the body offset is `[0, -1.12, +0.168275]`, applying `[-cgHeight, (0.5-frontWeightFraction)*wheelbase]` in Y/Z. With a 45% front weight fraction, wheel centers relative to the CG pivot are:

| Wheel pair | Source X | Source Y | Source Z | UE X/Y/Z, centimeters after (Z,-X,Y) basis |
| --- | --- | --- | --- | --- |
| Front | ±0.89 | -0.6501 | +1.851025 | +185.1025, ∓89, -65.01 |
| Rear | ±0.89 | -0.6501 | -1.514475 | -151.4475, ∓89, -65.01 |

The estimated 0.48-meter rest length puts a nominal vertical probe anchor 0.48 meters above each static wheel center. The parent runtime should apply its established tire/probe conventions and suspension calibration; the static export wheels intentionally remain detached at local origin, exactly as required by the source export pipeline.

## Simulation estimates requiring native calibration

The spec exports a **12,346 lb / 5,600 kg operating-mass estimate**, 45% front weight, 44.1-inch / 1.12-meter CG height, 12.6-inch / 0.32-meter clearance, and the following starting wheel rates: 78,000 N/m spring, 9,500 N·s/m damper, 0.48-meter rest and 0.27-meter travel. These are game calibration values, not published vehicle measurements. They need load, roll, braking and rock-crawl validation in the native build.

The 6L90 family ratios are 4.027, 2.364, 1.532, 1.152, 0.852 and 0.667; reverse is 3.064. The 5.38 axle ratio and 3:1 low range are unverified choices for the simulation. The supplied torque interpolation passes through the published power/torque but its RPM landmarks are estimates. Starting cold pressures of 55 front / 60 rear PSI are simulation choices for the assumed load; they are not a tire placard or instructions for a real expedition truck. The new pressure upgrade and EV conversions must retain the parent runtime's load, tire, heat and traction limits.

`features.frontLocker`, `features.rearLocker`, 2H/4H/4L and low-speed interlocks represent the period vehicle's selectable hardware. Exact engagement limits and the 50/50 simulated transfer split are gameplay choices. Stock modeled running gear uses solid-axle/leaf-spring semantics; portal and EV changes should be upgrade-driven, not silently shown as stock equipment.

## Integration API

```js
import {
  EARTHCRUISER_EXP_SPEC,
  EARTHCRUISER_EXP_LANDMARKS,
  buildEarthCruiser,
  refineEarthCruiser,
} from './earthcruiser-exp.mjs';

const view = buildEarthCruiser(spec);
// Existing vehicleFinishes(view, spec) may be applied here.
const parts = refineEarthCruiser(view, spec);
// Existing export: view.root for body, view.wheels[0].root for combined wheel,
// parts.tire and parts.rim for independent tire / rim meshes.
```

`buildEarthCruiser` returns `scene`, `root`, `body`, `materials`, four `wheels`, `links`, `driveLinks`, `lamps`, `dispose` and `spec`. Each wheel exposes the established `root`, `tireShape`, `tireSpin`, `rimSpin`, `deformation`, `rimRadius` and `spare` fields. The body carries metadata identifying an original reference reconstruction and its hardpoint conventions.

Branch to this builder before the generic `VehicleView` path. **Skip generic `bodyRefinement` and generic `refineVehicle` for `earthcruiser-exp`**: their old body-style assumptions would distort the new cab/house or replace its wheel. `refineEarthCruiser` supplies the matching replacement. No additional npm dependency is needed; it uses the preserved browser Three runtime and existing native helpers read-only.

Any generic roof lights, wheelbase-dependent chassis visuals, collision corners, preview cameras and rim/brake sizes should use this model's dimensions. In particular, a generic SUV nose coordinate or van roof light position is inappropriate. Additional visible suspension/steering/brakes are generated by the parent's existing native running-gear system; this module supplies static chassis rails/mounts and the factory wheel.

## Verification and limits

The module passes Node syntax checking and can build, refine and dispose all four wheels without a DOM or Unreal. Geometry inspection checks finite vertices, envelope, wheel count and adapter shape. Seven CPU-only views are used to compare the silhouette and panel arrangement against the primary images; their simple painter rendering is not evidence of Unreal shading quality. Solar panels are above the cap with separate cells, and the cabin pass-through is open through both shells.

The checks above record the model author's source-level checkpoint. That author did not perform engine compilation, source-asset export, import, cook, packaged-game launch or publication. The parent integration has subsequently produced a complete cooked package and is running the final native verification queue; its acceptance requires the final receipts and visual review, which are separate from this authoring record. The native pass covers front/side/rear/roof views, brake and reverse lamps, wheel fit at full steer and articulation, rear overhang collision, rollover support, upgrades and the garage camera. No final native pass is claimed here. This remains a procedural visual approximation: there is no claim of OEM scan accuracy, full camper interior, moving pop-top, functioning service hatches or exact production hardware dimensions.
