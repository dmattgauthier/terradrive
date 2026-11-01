# Vehicle fidelity pass 24

This pass adds an original **2014 G 63 AMG 6×6 double-cab pickup**, replaces the existing AMG G 63 selection with the **newer G 63 4×4²**, and revises the formed body surfaces of the other eight vehicles. Browser reference files, acquired vehicle/environment packs and player saves are preserved. This document records source geometry work; packaged-game acceptance is recorded separately.

## New portal variants

The 6×6 is a separate three-axle body, rather than a stretched SUV with two decorative wheels. The rear SUV closure is removed by clipping the actual triangles, then a closed double-cab back with genuine glazing, open cargo bed, ribbed floor, wheel tubs, tailgate, lamps and independent rear bumper are built. Three pairs of carbon arch extensions have outward faces, upper crowns, dark inner returns and closed ends. The selected axle centers are +82.7, −40.2 and −83.5 inches from the simulator CG datum. Separate factory-style 18-inch beadlock wheels have perforated plates, a closed barrel, bead bolts and hub bolts; the tires are nominally 37 inches. Classic circular projectors, a twin-blade AMG grille, analogue instrument binnacle, separate central display, stainless cargo rollover bar and two recessed front roof LED units distinguish it from the modern G donor. The cab, dashboard and small trim remain a simplified reconstruction.

The 4×4² retains the standard modern G wheelbase and cabin dimensions while raising the body, widening the carbon arch extensions, changing to the selected 325/55R22 tires, enlarging the round covered spare coherently, widening the stainless steps and adding the two recessed roof LED housings. The factory portal stance is part of the stock model; it must not receive the factory body rise twice during native placement. The additional portal upgrade is separate from that stock stance.

The 4×4² body contains **451,323 triangles**; the 6×6 contains **414,993**, excluding separately exported tire/rim assets. For comparison, the retained standard G 63 donor has approximately 448,763 body triangles. Removed hidden donor fenders, indexed clipped cab vertices and simple small tread/LED cells keep the new variants near or below the donor budget. These are geometry counts, not a measured GPU-performance claim.

## Formed surfaces across the roster

| Vehicle | Authored change in this pass |
| --- | --- |
| Jeep Wrangler Rubicon | Fuller coherent bonnet/cowl crown and rear tub shoulder; existing straight door/glass framework retained. |
| Ford Bronco Badlands | More defined twin bonnet draws and receding nose corners. |
| Honda Civic Sport | More rounded trunk crown and rear quarter haunch; A-pillar geometry is preserved. |
| Mercedes-Benz Sprinter 2500 | More drawn cab front and less abrupt rear corners. |
| GMC HUMMER EV SUV | Fuller rear haunch and more distinct twin bonnet shoulders. |
| Lamborghini Urus Performante | Stronger front-corner wrap, waist recess, coherent bonnet blades/troughs and tapered leading corners; more rear-corner draw, hatch crease and plate-well depth. Matching skins/returns follow the same surface maps. |
| EarthCruiser EXP | More formed NPR cab front corners and central pressing, with matching front openings moving together. |
| Mercedes-Benz G 580 | Broader, softer bonnet rib and crown, distinct from the narrower stronger AMG bonnet ribs. |
| Mercedes-AMG G 63 4×4² | Factory portal body stance, broad closed carbon arches, larger spare, wide steps and recessed roof LEDs. |
| Mercedes-Benz G 63 AMG 6×6 | Separate closed double cab/open bed, three physical arch pairs, classic lamps/grille/cabin and original 18-inch beadlock wheel construction. |

## References actually checked

The [Mercedes-AMG 4×4² walkaround](https://www.mercedes-amg.com/en/mercedes-amg-g63-4x4-walkaround) confirms the newer model's portal-axle equipment, carbon body details and 22-inch wheels, and distinguishes it from the older G 500 4×4². Its image links were located, but direct image downloads returned HTTP 403; those downloads are not represented as inspected pictures. The retained modern-G manufacturer product-sheet front quarter and equipment pages were inspected locally; the earlier common-body drawing/reference procedure is documented in [mercedes-gclass-research.md](mercedes-gclass-research.md).

The [2014 Mercedes-Benz Japan 6×6 launch](https://media.mercedes-benz.jp/G-63-AMG-6%C3%976%E3%82%92%E9%99%90%E5%AE%9A%E7%99%BA%E5%A3%B2/) describes the six-wheel model. Its indexed equipment table identifies portals, six-wheel tire-pressure control, 18-inch two-piece beadlock wheels, 37-inch tires, carbon fenders and a roof spoiler with LED lamps. The launch's actual front three-quarter rock-climbing photograph and cabin photograph were saved privately and inspected. They establish the pickup layout, classic twin-blade grille, perforated beadlocks, analogue instruments and separate display. The linked technical PDF returned HTTP 403.

The original V8 [Urus Performante manufacturer page](https://www.lamborghini.com/en-en/history/urus-performante) and [manufacturer brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/04092023_URUS%20PERFORMANTE_DIGITAL_BROCHURE_WCAG_EN.pdf) are the variant authority. Both front-three-quarter photographs on brochure pages 5 and 6 were rendered and inspected: the broad tapered carbon bonnet, thin outboard ducts and folded front corners informed the coherent surface changes. The reference is the 666 CV V8 Performante, rather than a different Urus derivative. Existing rear and side reconstruction is refined, but this pass does not claim a new all-angle photogrammetric fit.

The [G 580 launch](https://media.mbusa.com/news/the-gelandewagen-electrified) identifies its raised bonnet and EV-specific exterior treatments. The [EarthCruiser EC98 flyer](https://earthcruiser.com/wp-content/uploads/2023/11/EC98_Sales_Flyer-1.pdf) remains the expedition body's specification reference. Earlier roster references remain in their existing source metadata; this pass does not claim a fresh manufacturer photo survey of every unchanged detail.

Downloaded research photographs and PDFs stay under `Saved/ModelResearch24` and existing private reference directories. They are reference material, not published textures or redistributed meshes.

## Native review corrections

Candidate2's packaged Art run produced 100 views and passed 110 automatic render/material checks. Manual inspection covered every view 0–9 for the Urus (index 5), G580 (7), 4×4² (8) and 6×6 (9), plus Civic rear quarter and Sprinter rear close-up. The automatic render checks did not catch several visible attachment/closure errors. Candidate2 is therefore diagnostic evidence for these details, rather than final visual acceptance.

The subsequent source correction nests the Urus vent trim, returns and louvers into the actual bonnet holes, broadens/reduces the abrupt ridge around them, and clips each louver span to the aperture. The 6×6 lower rear-cab repair sheet now faces outward on both sides. The 4×4² label moves clear of the larger spare. Civic lettering is lowered onto painted trunk sheet and fitted to that final curved surface; a guard rejects any mounting ray that passes through a lamp hole to the vehicle's front. Sprinter door openings now have continuous folded jamb/header returns connecting the frame to the aft door plane, closing the oblique daylight slit. The EarthCruiser's common rear service hatch is suppressed on the side that already has its own utility hatch, removing the doubled outlines and hinges. These corrections add no new material slots. The source beadlock barrel normals are normalized consistently with the already normalized native export.

The focused attachment suite passes **196 checks** across the Civic, Sprinter, Urus and EarthCruiser. The portal suite passes **65**, including the repaired cab normals and clear badge/spare bounds. Refreshed native captures remain required for these changed details. Broader Urus end-shape accuracy, simplified cabin/lamp construction and strong reflection ripples remain fidelity limits; these repairs do not establish production racing-game quality.

## Checks and limits

`validate-models.mjs` passes for all **ten original bodies**, including finite/unit normals, bounded geometry, authentic window/intake cavities and matching tire/hub dimensions. Its expedition section passes **121 checks**, including the current portal variants. `validate-gclass-variants.mjs` passes **65 source checks** for the new bodies: open bed/closed cabin, genuine first-hit glazing, axle/hub datums, tire/rim sizes, equipment differences, roof/length envelopes and outward fender faces. `validate-gclass-shape.mjs` passes **93 shared G-body checks** using the current G 580 and an explicit standard-G 63 donor fixture; that donor result must not be described as the raised 4×4²'s final rendered acceptance. The 65 variant checks are included in the full report's 121 expedition checks, rather than an additional independent total. The separate 196 attachment checks are recorded in `visual-attachments-validation.json`.

The selected 4×4² height/tire section and 6×6 length, height and axle spacing are reference envelopes. Neither researcher obtained an inspectable first-party dimension table for these variants in this session. They are labeled estimates, rather than certified engineering measurements. Panel stations, cabin detail, CG and suspension calibration also include estimates. These models are original authored geometry, not OEM CAD, licensed production scans or a claim of Forza fidelity. Native six-wheel handling, clearances, lighting/materials and appearance still require the separate packaged-game verification.
