# Vehicle reference and native model refinement

Research and implementation: October 21, 2026. Configurations follow the existing US-market catalogue: MY2024 Wrangler Rubicon four-door, Bronco Badlands four-door, Civic Sport sedan, HUMMER EV SUV 3X with Extreme Off-Road Package, and MY2016 Sprinter 2500 Crew 144-inch wheelbase/standard roof. Geometry is authored from reference; no manufacturer CAD or downloaded commercial mesh is used. The browser source is preserved.

The later sixth-vehicle and input changes are in [lighting-tracks-urus.md](lighting-tracks-urus.md). This page records the preceding five-vehicle model refinement.

## Reference decisions

| Vehicle | Reference observations that guide the model |
|---|---|
| Wrangler Rubicon | MY24 shortened seven-slot grille, round lamps, separate high flares, black three-piece roof, narrow bonnet and exposed hinges distinguish it from a generic box-shaped SUV. Retain the 118.4-inch wheelbase and 17-inch wheel/33-inch tire configuration. Recreate the missing Rubicon bonnet lettering with geometry. Use five forked, dished spokes and separate machined faces rather than uniformly extruded strips. |
| Bronco Badlands | Keep the four-door body, frameless-door proportions, body-mounted mirrors, MIC roof panels, round/horizontal signature lamps and modular bumper. Retain the selected 116.1-inch wheelbase and 17-inch six-lug wheel configuration. Rebuild the dished split-spoke faces and barrel. The optional beadlock-capable accessory wheel is a comparison reference, not permission to add a functional beadlock or Raptor parts to the standard model. |
| Civic Sport | Honda's MY24 model page shows the low bonnet, long cabin, sharply rising rear quarter and narrow lamps; its trim sheet specifies 18-inch gloss-black alloy wheels, black mirrors and chrome exhaust finisher. Keep the Sport sedan, not the hatchback, Si or Touring. Build curved ten-branch wheel faces and restore painted/gloss trim, clear lenses and Civic/Sport lettering. |
| Sprinter Crew | The MY16 brochure's standard-roof elevation and front view establish the W906 roof/forehead, long 144.3-inch wheelbase, short front overhang, crew glazing and tall rear doors. Preserve the 233.3-inch length and 96.3-inch standard-roof height. Rebuild the twelve-vent dished steel wheel, six fasteners and three-point cap; restore rear lettering instead of blank label panels. |
| HUMMER EV SUV | GMC's MY24 brochure separates the shorter SUV and its rear spare from the pickup. Use the three-motor 3X, opaque roof panels, chamfered wheel openings and wide stepped nose. The selected Extreme Off-Road package uses 18-inch wheels and 35-inch mud-terrain tires, with underbody/rocker protection. Rebuild the eight-lug dished wheel with machined edge faces, stationary calipers and articulated independent-suspension hardware. Do not substitute the standard 22-inch road wheel, Omega trim, pickup proportions or later model features. |

## Primary sources inspected

1. [Stellantis: Jeep reveals the new 2024 Wrangler](https://www.media.stellantis.com/uk-en/jeep/press/jeep-reveals-new-2024-wrangler). Exact-year grille/trim distinction and exterior design description.
2. [Jeep MY24 petrol model guide](https://www.jeep.com/content/dam/cross-regional/ee/jeep/wrangler-petrol/WRANGLER_PRICE_LIST.pdf), page 2 rendered for front three-quarter photographs and Rubicon exterior finishes. This regional document supports appearance; it does not replace the US powertrain catalogue.
3. [Ford MY24 Bronco catalogue](https://www.ford.mx/content/dam/Ford/website-assets/latam/mx/nameplate/bronco/2024/pdf/ford-bronco-2024-catalogo-descargable.pdf), exterior, dimensions and Badlands sections read through the web PDF index. Regional equipment differences are not copied into the US catalogue.
4. [Ford Bronco two-/four-door technical specifications](https://www.ford.com/cmslibs/content/dam/brand_ford/en_us/brand/suvs-crossovers/bronco/2021/mediakit/21_Bronco_Prelim_Tech_Specs_1.pdf). Carry-over body dimensions and wheel/suspension distinctions; the model year and preliminary nature are retained.
5. [Ford optional Badlands wheel kit](https://www.ford.com/product/20212024-bronco-17-x-8-beadlock-capable-wheel-kit-badlands-p2760900988). Confirms that the optional ring-equipped 17-inch wheel is distinct from the standard wheel.
6. [Honda MY24 Civic Sedan specifications and features](https://hondanews.com/en-US/releases/release-5003aaa39c009393f5d06d620f091c7d-2024-honda-civic-sedan-specifications-features). Exact Sport dimensions, tire designation and trim separation.
7. [Honda MY24 Civic Sedan model page](https://www.hondainfocenter.com/2024/Civic-Sedan/). Manufacturer side/front-quarter imagery inspected in the browser; the large header image is a different trim and is used for body shape, not Sport wheel finish.
8. [Honda MY24 features by trim](https://www.hondainfocenter.com/-/media/Honda-Sales-Tool-Media-Folder/Images/2024-Civic-Sedan/PDFs/2024-Civic-Sedan-Features-by-Trim.ashx), pages 1-2 rendered. Exact Sport wheel/mirror/exhaust and suspension equipment.
9. [Mercedes-Benz MY16 Sprinter Crew brochure](https://assets.mbvans.com/Mercedes-Benz-Vans/Brochures/Mercedes-Benz-Sprinter-Crew-Van.pdf), pages 1-2 rendered, including the standard-roof front/side elevations and crew seating/glazing.
10. [Mercedes-Benz MY16 2500 Cargo/Crew 144 low-roof drawing](https://www.mbvans.com/content/dam/mb-vans/us/upfitter/drawings/2d/2500-cargo-van-crew-van-144wb-low-roof-partition.pdf). Cross-reference to the catalogue's manufacturer engineering drawing. Direct retrieval timed out in this pass; the rendered brochure elevation supplies the inspected dimensions.
11. [GMC MY24 HUMMER EV SUV features, specifications and options](https://www.gmc.com/content/dam/gmc/na/us/english/index/about/download-brochures/2024-models/GMTH23CT000-2024-HUMMER-EV-SUV-FO-031924.pdf), pages 3, 4 and 13 rendered. 3X exterior, adjustable air suspension, wheels and SUV dimensions.
12. [GMC 3X introduction](https://news.gmc.com/newsroom.detail.html/Pages/news/us/en/2023/apr/0421-hummer.html). Exact SUV Extreme Off-Road 18-inch wheel/35-inch tire distinction and three-motor configuration.

Manufacturer PDF copies, rendered research pages and retrieval outcomes are local under Saved/VehicleResearch. They are reference material and are excluded from the source upload. The Ford PDF direct download returned a CDN 403; no access barrier was bypassed. Previously registered reference photographs remain documented in the preserved browser source. No new external photograph or raster is shipped as a vehicle texture.

## What the native pipeline changes

Tools/vehicle-fidelity.mjs authors curved wheel-spoke sections, dished steel/alloy faces, barrels, machined strips, fasteners, brake rotors, center details, raised tire sizing and model lettering. Tires and rims export separately. Tire upgrades change the rubber diameter/width while factory rim and rotor diameter stay fixed. Calipers stay with the steered hub instead of spinning with the wheel; independent wishbones and knuckles follow wheel travel.

Each vehicle also exports three upgrade tire meshes. Their radial profile compensates for the component scale at the inner bead: the tread reaches the larger physical radius while the bead remains seated on the original wheel diameter. Normals follow the profile transformation. Rim width follows the wider tire fitment; rim and rotor diameter remain fixed. Export checks measure both the bead and tread at every stage. This brings the generated set to 189 mesh sources and 302 source materials.

The old exporter did not have pixels for canvas-generated labels. Those planes became opaque white cards, including the Rubicon bonnet label. The native exporter excludes those unavailable planes and substitutes geometry. Rear heater lines are projected onto actual rear-glass intersections rather than placed on a guessed floating plane.

The importer now preserves the original physical materials' clear-coat layers and lamp emissive values. Glass/lenses use surface per-pixel lighting and screen-space reflections instead of particle-volume lighting. This follows [Epic's Material API](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/Material?application_version=5.6) and [TranslucencyLightingMode API](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/TranslucencyLightingMode?application_version=5.6), with installed UE5.8 headers used to confirm the relevant settings. MakeMaterialAttributes connects the clear-coat inputs because their underlying property enum entries are hidden from Python. Two broad garage-only fill lights make the body curvature, trim and rims readable while orbiting. Their initial intensity was reduced after rendered inspection; preview framing and dark view buttons were also corrected.

These changes improve the existing reference-built bodies rather than claiming a scanned or manufacturer-CAD reconstruction. Small fonts, badges, tire branding, interiors and trim-specific stampings remain approximations. Published dimensions are references; spring rates, center of gravity, inertia, air-strut response and tire/soil parameters remain simulator tuning, not manufacturer measurements.

## Driving and inspection corrections

Garage preview: drag the vehicle view to orbit, scroll to zoom, or use Front/Side/Rear/Reset. Arrow keys adjust the view and Page Up/Page Down zoom. Preview-key handling keeps those camera commands working after a child button takes focus. Other UI button actions retain their handling. Camera pitch and distance are bounded, and the camera is no longer reset each frame.

The native wheel's exported axle is Unreal Y. Positive forward angular speed now gives the bottom tread a rearward tangent; reverse gives the opposite motion. Brake holding torque is solved with tire contact, with a friction-limited low-speed holding force. Space overrides throttle. S brakes a forward-moving vehicle, then selects reverse when kept held at a full stop for 0.65 seconds. W behaves symmetrically while reversing. Space remains a dedicated brake and hold.

Suspension mounting uses the stock tire/body hardpoints and subtracts added spring length. A lift and larger tire therefore raise the driving body consistently with the frozen garage pose. Hummer stock, suspension III and combined tire/lift stages are checked by measured ride height, not only by upgraded parameter values.

Final build, native regression and rendered inspection evidence is recorded in validation-native.md and native-validation.json after verification.
