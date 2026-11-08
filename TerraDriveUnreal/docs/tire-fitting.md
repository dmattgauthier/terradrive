# Oversized-tire fitting geometry

The three tire-size options are actual meshes with the stock rim/bead retained. Their diameters are rounded up to whole inches at one-third, two-thirds and all of the interval from the stock diameter to 50 inches. Grave Digger keeps its larger factory monster tires.

`Tools/tire-fit.mjs` runs at the end of `export-source.mjs`, when both the exported body and final vehicle metadata are available. It samples the actual opaque body triangles into a 25 mm lateral/longitudinal grid. It retains the lowest actual surface in each occupied cell, including skirts, fender liners, steps and underbody plates. The source OBJ transform is reversed before testing; the body's center-of-gravity offset is restored to contact-plane coordinates. A SHA-256 cache under `Saved/ExpandedRosterFidelity/TireFit` is invalidated when the exported body changes.

Each kit is fitted against the tire's complete upward suspension sweep, through full bump. The sweep includes both steering directions, Ackermann steering, the Urus/Hummer rear steering, every wheel-track upgrade, the widest tire compound, and the larger rear Urus tires. The fitting search tests local body surfaces against the swept tire cylinder and uses 40 mm radial/axial allowance for surface sampling, steering interpolation and tire detail. It chooses lift and track together; added track is limited to 450 mm total and cannot be less than the runtime fallback. The result is stored as `vehicles[].tireFits` in both `SourceAssets/import.json` and `Content/NativeData/world.json`.

The 6×6 keeps its front and middle axles in the authored openings. Only the trailing axle moves rearward if necessary, preserving an 80 mm gap between the larger tandem tires. Additional suspension lift always exceeds the extra bump travel from those upgrades, so the stock suspension is the worst upward envelope.

These are fictional high-clearance conversions. They retain the existing body and solid underbody instead of cutting larger wheel openings or remodeling floors. Consequently the largest sizes require substantial lift, especially on road vehicles. The metadata is a body-clearance bound, not a claim that these conversions correspond to factory engineering or road-legal modifications.

## Verification

Run after exporting the complete roster:

```powershell
node Tools/validate-tire-fit.mjs --expect-vehicles=12
```

The validator independently evaluates one-degree steering samples using the native upgrade equations and the actual body sample cache. It checks all three kits, every wheel-track stage, the suspension-stage inequality, staggered tire widths, the tandem gap, source/cooked metadata equality, and the preservation of Grave Digger's stock tires. It also verifies that the previous diameter-only lift formula creates an overlap, ensuring the regression test actually exercises the reported clipping.

`docs/tire-fit-validation.json` records the exported roster, source hashes, sampled clearances and limiting body points. This is source-geometry evidence; it is complemented by the packaged motion checks and inspected installed-kit views recorded below. The current source validator checks vertical clearance to a conservative swept cylinder, rather than exact tire-to-body triangle intersections; the fitting margins cover the discrete sample spacing, and the native views do not independently prove every hidden full-travel intersection.

## Audit of large fitting lifts

The large lifts were checked for a possible false positive caused by treating the empty rim/hub as solid tire. Two source witnesses show that ignoring the hub would not make the earlier small-lift kits clear:

- Wrangler 39-inch kit with 104.9 mm lift and 43.945 mm total track addition: the inner wheelwell wall at source point `(-.590, .435, 1.81915)` crosses the center tread crown at 26.27 degrees steering, essentially at static suspension height (0.44 mm droop). Its tire-plane radius is 490.35 mm, well outside the 209.42 mm bead radius. The axial position is only 44.71 mm from the tire center, inside the central tread band. This wall is authored by `nativeFender` in `Tools/vehicle-fenders.mjs`; it is the real inner wheelwell closure.
- G63 4×4² 41-inch kit with 87.55 mm lift and 34.403 mm total track addition: the boxed frame rail at `(-.6445, .600, .93261)` crosses the center tread crown at -19.55 degrees steering, with only 0.39 mm bump. Its tire-plane radius is 515.49 mm, outside the 271.02 mm bead radius; axial position 114.75 mm is within the central tread band. The rail is authored at lateral ±611 mm in `Tools/mercedes-gclass.mjs` and raised 271 mm by the squared variant.

These witnesses are sampled source evidence, not a native collision log. They distinguish actual tread interference from an empty-hub artifact. A rounded carcass could tighten the conservative bound at its shoulders, but simply excluding the rim hole or suppressing hidden body samples would conceal actual intersections. The retained kit envelopes therefore remain conservative; the native tests and inspected views are recorded below. More compact conversions would require separately designed inner-wheelwell and chassis/axle packaging rather than silent deletion of structural geometry.

## Independent rollover tire witnesses

`Tools/bake-tire-probes.mjs` reads the actual exported tire OBJ meshes and writes `Content/NativeData/vehicle-tire-probes.json` for native clearance/drop fixtures. The twelve-vehicle bake contains 48 size profiles from 45 unique meshes; Grave Digger reuses its stock 66-inch mesh for all size selections. Each source file is SHA-256 checked against the export manifest. Each profile has at most 96 deduplicated witnesses selected from real mesh vertices: crown/shoulder/sidewall support directions around twelve azimuths, plus inner sidewall/bead-band samples outside 40% of the tire radius.

The points use the actual Unreal-imported tire-local centimeter basis `(OBJ X, -OBJ Y, OBJ Z)` and retain their original vertex indices. The native fixture must apply the wheel component's real transform, including width and rear-tire scaling. These samples are deliberately independent of the analytic rollover support formula; they are not generated from its equations. `build-native.ps1` bakes them before import and requires the resulting metadata for packaging.

The exported Grave Digger tire has a 571.272 mm axial half-width and an 838.200 mm radius. At its 2.72 m stock track, its outer sidewall reaches 1.93127 m from the vehicle center—far beyond the approximately 1 m body half-width. This explains why body-only ground support cannot prevent those tires from passing through the ground during a roll. Width upgrades can extend that half-width to 691.239 mm. At the 50-inch/maximum-width Urus setting, the actual front/rear tire half-widths are 227.711/259.670 mm. These source envelope measurements explain the required support area; native results are recorded below.

## Packaged tire-kit checks and release status

Candidate 4 passes the 278-check expanded-roster fixture. All twelve vehicles
install their maximum tire choice, settle on all wheels, move with full
steering input, retain rolling tire motion, stop under braking and recover in
place. All twelve near-camera captures were inspected; no glaring visible
body/tire overlap appeared in those rear views, and each complete vehicle
clears the bottom HUD. These pictures do not expose every hidden full-bump
intersection: the independent swept-body source bounds remain the evidence
for that complete envelope. The focused source validator passes 327 checks,
with a minimum sampled clearance of 48.057 mm (1.89 inches).

The final twelve-body source suite and all twelve wheel designs pass after
the final Subaru closures and monster livery changes. The 327-check fitting
report covers eleven eligible bodies plus the monster's unchanged factory
tires; every recorded body hash matches the current export manifest.

Separate candidate 4 rollover fixtures pass 91 checks each for stock Grave
Digger, stock Subaru and the Civic on 50-inch tires, using independent exported-
mesh witnesses. Candidate 5 passes 707 mechanical checks, including both
track-pod/tire-kit installation orders. Those passes cover the tested poses;
they do not replace the later real-time park check, which failed a tire-
clearance guard when buried ramp geometry was treated as inverted support.

The build is not promoted. Candidate 7's support correction and final native
performance checks remain pending. See the
[consolidated native record](expanded-roster-native.json) for exact source/build
identity, retained failures and the eventual release decision.
