# Civic and Urus body contour revision 11

This round addresses the squared nose/rear surfaces on the Civic and Urus and the Civic's bowed A-pillars. It changes their actual body geometry, with the lamps, apertures, trim and panel divisions following the same surfaces.

## Civic sedan

The painted A-pillar edges now run directly from cowl to roof instead of using the old intermediate control points that bowed the strip upward. The painted outer boundary meets the front side-window seal, and the roof flange shares its upper corner. The short rounded glazing corners and the roof crown remain. After the normal body refinement, the two principal projected edges depart from their straight chords by about 0.017 inch, and the measured paint-to-seal separation stays within 0.091 inch along the principal edge.

The bonnet has a broader transverse crown and converging inner draw lines, with shallow channels beside their raised crests. A finer trunk grid carries a crowned deck into the integrated upswept trailing edge. The front and rear corners wrap around the centre more continuously in plan view. A formed recess below the rear lamp shoulder gives the trunk face depth around its existing plate pocket.

The reference is Honda's [2022 Civic Sedan press kit and photographs](https://hondanews.com/en-US/releases/release-53541be6030b25a47a2899aba12aa1f6-2022-honda-civic-sedan-press-kit). The exterior Touring photographs are used for the shared sedan body, hood, trunk and pillar contours. The Sport with HPD photographs provide supplemental Sport fascia views; this model retains its existing Sport equipment rather than adding the HPD spoiler or Touring fog lamps.

## Urus Performante

The bonnet has stronger outer ridges and drawn channels, a more deliberate crown and leading corners swept back around the central nose. Its separate carbon and painted regions, cooling-duct lips, recesses and seams share the revised bonnet map. The front fascia and side returns share their depth contour, including the recessed bumper cheek.

The hatch now folds inward beneath the lamp shoulder with a sloping pressed feature and a broader drawn region around the plate well. The quarter-panel returns use the same hatch surface at their junctions. The existing glazing, projector optics, open bonnet vents, diffuser and spoiler remain.

The comparison uses the original V8 Performante's [official model page](https://www.lamborghini.com/en-en/history/urus-performante) and [brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/URUS%20PERFORMANCE_DIGITAL_BROCHURE_WCAG_EN.pdf), particularly the rear-quarter view on printed page 4 and front-quarter views on pages 6 and 15. Reference photographs remain private review material.

## Verification and scope

Run `node Tools/validate-body-contours.mjs` for twelve physical contour and pillar probes, including the paint-to-window-seal join. It reports inches and checks the formed sheets rather than treating a material highlight as geometric relief. `validate-models.mjs` checks all six bodies and glazing/wheel regressions; `validate-urus-panels.mjs` retains the dense aperture and carbon-overlap checks.

The native Art mode adds four close views for each revised car: bonnet, rear closure, pillar/side glazing and overhead plan. They supplement the six existing directions on all six vehicles. Current package and rendered review evidence is recorded in [validation-native.md](validation-native.md).

The other four vehicle bodies, terrain materials, scenery placements, routes and physics source are retained. The two models are still procedural reference reconstructions with approximate fine surfacing and interiors. These measurements establish physical shape and clearance, not manufacturer CAD accuracy or production racing-game fidelity.

## Native acceptance

The current Windows package passes 684 native and 382 core checks, with 124 actually reviewed current captures. Executable SHA-256: `a1157c61c74428e5f301772de2a8be2afa048b38074d6d421dd122e1bfc8a077`. See [validation-native.md](validation-native.md) for package provenance, rendering scope, preservation and limitations.
