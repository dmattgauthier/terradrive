# Vehicle surface craft and Urus reflection correction

This change fixes the Urus bonnet's repeated diagonal highlight scallops and
polishes the existing roster's panel reveals. It retains the photographed
panel forms, wheel hardpoints and existing Epic Automotive material families.
The V8 Performante remains the original trim, rather than the later SE model.
[Lamborghini's trim reference](https://www.lamborghini.com/en-en/history/urus-performante)
and the [same-trim front/bonnet photographs](https://www.largus.fr/actualite-automobile/essai-lamborghini-urus-performante-2023-dompte-ses-666-ch-30001100-30020213-photos.html)
anchor the exposed carbon, two ridges and vent placement.

## Bonnet

The former 72-column grid crossed a narrow, curving ridge at a different
fraction of a triangle on each row. Its normals were individually smooth,
but interpolation between them produced the repeated ripple. The new grid
follows the ridge and adjacent trough. Its normals are evaluated in physical
panel coordinates, independently of the sampling lookup. The carbon/paint
boundary and two open cooling ducts remain part of the same bonnet surface.
The finish has not been made matte to disguise the defect.

The [source reflection test](hood-reflection-validation.json) compares
interpolated triangle normals with the underlying smooth surface at centroids
and edge midpoints over the two fully formed ridges:

| Normal interpolation error | Before | After |
| --- | ---: | ---: |
| Mean | 0.771 degrees | 0.048 degrees |
| 95th percentile | 3.855 degrees | 0.213 degrees |
| Maximum | 8.549 degrees | 0.375 degrees |

This is a 94.5% reduction in 95th-percentile source shading error. The carbon
sheet changes from 8,640 to 32,000 triangles. The [aperture and winding tests](urus-panel-validation.json)
retain the complete 1,316 intake probes, 90 carbon overlap probes, 32,000
upward-facing triangles and 16,281 upward vertex normals. Those measurements
are source geometry evidence. Native photographs under the same lights decide
whether the visible defect is resolved.

## Common model craft

Panel joints, glass seals, small trim and related polyline details now use one
continuous round reveal through every authored station. Previously, separate
capped cylinders met at each segment, leaving small intersecting end discs and
irregular highlights. The continuous reveal keeps the original centerline and
radius, closes its actual ends, and shares adjacent rings. This applies to all
ten existing vehicle bodies and is available to the new models.

Mapped panels use conforming adaptive subdivision where that is cheaper than
the old fixed subdivision. Shared edge midpoints prevent mismatched edges;
midpoint and centroid tests limit sampled surface sag to 0.022 inches and normal
interpolation error to 0.75 degrees. A complicated surface retains the original
fixed grid if the adaptive version cannot converge within 80% of its triangle
budget. True holes, contours, sharp material boundaries and analytic normals
are retained. This is geometric economy, not a reduced-detail graphics preset.

The [independent craft checks](surface-craft-validation.json) measure a
five-station reveal at 65 vertices instead of 184, verify its section radius
and closed seam, and test an eight-triangle flat sheet with a real aperture.
A shallow compound sheet needs 128 triangles instead of 512, with 0.0134-inch
maximum sampled sag and negligible normal error. These examples explain the
method; the native performance comparison establishes its practical effect.

The full coachwork test now also probes the G63 4x4 squared headlamp at the
variant's actual raised body datum. Its earlier failure used the standard G
lamp height. Width, opening and normal thresholds are unchanged. All 24
focused Urus/G-Class coachwork tests pass.

## Limits

The models remain original photograph-based reconstructions with estimated
small details and simplified cabins. This pass improves surface quality and
panel craft; it does not replace all bodies with scanned or OEM geometry.
Source vertex counts do not establish native FPS, GPU temperature or endurance
stability. The packaged verification record must supply those results and
identify the exact executable and cooked content.

## Exported bonnet UV and tangent audit

The exact exported Urus body (`d205778eb7aedce0c92dc82e367341f43e9659f7ea62af150dfa60311aab26cd`) was audited separately after Unreal reported its general degenerate-MikkTSpace warning. All 16,281 exposed-carbon UV pairs match the authored physical-coordinate sequence. None of its 32,000 triangles has zero area or a UV determinant below `1e-8`. The minimum absolute UV determinant is `9.498e-7`; vertex normals are unit length to floating-point precision. After orthogonalizing against those normals, the minimum tangent and bitangent lengths are 99.47 and 86.53, and the largest tangent-basis condition measure is 1.01456. The carbon sheet therefore has a sound tangent basis; its corrected highlights are not being undermined by degenerate UVs.

The [export audit](urus-bonnet-uv-validation.json) also records remaining degeneracies elsewhere: 714 zero-UV triangles over the complete body and 182 in a broader hood-surface selection that includes paint and vent lips. That broader selection is spatial/UV based, not an exact named-component attribution. Those records explain why the body-wide import warning cannot be used as evidence that the new carbon panel is broken. They do not claim the entire mesh is free of UV issues, and native highlight captures remain the acceptance test. No geometry or export was changed during this audit.

## Native C1 image review

The packaged C1 art run in `Saved/ExpandedRosterFidelity/NativeC1/Art/Screenshots`
was visually reviewed at front three-quarter (hero 3), rear three-quarter
(hero 4), and close pillar/door (hero 8) angles for the ten existing vehicles.
These thirty stills show intact body panels, automotive materials, and stock
wheel placement. They are visual checks at the pictured static poses, not
proof of clearance over the whole suspension/steering envelope or frame-rate
measurements.

The exact Urus bonnet view `native-vehicle-5-hero-6.png` was compared with
`Saved/UrusQuarryReviewFixes/FreshSurvey/Screenshots/native-urus-hero-6.png`.
The repeated sawtooth highlights along the carbon ridge in the baseline are
absent in C1; the same light now forms a continuous smooth band. The narrow
black/yellow speckling along the vent wall/lip appears in both captures and
remains a separate close-up defect.

Other remaining close-up limitations are visible in hero 8: uneven Civic
chrome trim at the roof/window corner joins, a short interruption in the
Sprinter door reveal at its beltline bulge, and a partly obscured lower-left
rear side-window trim segment on the G63 6x6. The G-family hood highlights and
door seams remain intact across these views. No new large panel holes,
material fallback, or stock tire/body intersections were observed in this
review. These images support the focused surface improvements; they do not
establish photorealism or exact factory geometry.

## Final source validation and release status

The final [twelve-body report](model-validation.json) and
`SourceTests/models-final.log` pass after the final model revisions, retaining
all 156 expedition assertions. `SourceTests/running-gear-final.log` passes
all twelve wheel designs and four brake/caliper meshes. The focused added-
vehicle suite passes 94 checks; Grave Digger and the 22B contain 93,539 and
75,747 prepared body vertices respectively. These final reports replace the
earlier initial-roster validation, while the reviewed original-ten artwork
and Urus bonnet remain unchanged.

Candidate 4's Subaru views accept the corrected joins, formed pillars and
opaque parcel shelf. Candidate 5's Grave Digger art fixture passes 11 checks.
Candidate 5 was held after a real-time park rollover failed its tire-clearance
guard because a buried ramp underside was interpreted as inverted support.
Candidate 7 corrected that support test, passed the final native verification,
and was installed. The [fidelity record](expanded-roster-fidelity.md) documents
the original failure and the passing rerun separately.
