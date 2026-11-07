# Urus Performante and Slate Rim art pilot

This pilot tests the production workflow on the original V8 Urus Performante
and the 400-foot section near the entrance to Slate Rim Quarry. The remaining roster and
regions follow after review of these packaged results.

## Vehicle

The existing Urus chassis, wheels and interior serve as the basis for an
original body reconstruction. The door and rear-quarter sections carry a
continuous shoulder into the carbon arches and lower sill. The rear now has
rounded hatch glazing, a carbon ducktail, lamp apertures with separate
emissive layers, and rolled oval exhaust tips backed by diffuser wells. The
brake and reverse lamp material IDs stay attached to the original controls.

The factory brochure anchors the overall envelope and the same-model dealer
gallery supplies independent rear and quarter views. The panel forms are
artistic estimates fitted to those references. The work uses project geometry
and the existing Unreal automotive materials. The pilot could proceed with
these inputs while rights to distribute a vendor mesh remained unresolved.
[Lamborghini model archive](https://www.lamborghini.com/en-en/history/urus-performante)
· [2024 factory brochure](https://www.centuryu.com/uploads/1/4/4/6/144698822/2024_urus_performante.pdf)
· [2024 photo gallery](https://exoticsgroup.com/cars/2024-lamborghini-urus-performante-zpbuc3zl8rla30052/)

The focused source check covers 1,134 front intake samples, 90 bonnet
samples and the new rear geometry. The optical layers are about 0.25 inches
apart and the exhaust wells are about 2.41 inches deep. Four finished flare
checks fit within 0.28 inches of the factory half-width. The release export
changes one of 307 mesh inputs. Wheel and upgrade geometry remains the same,
and the Urus body contact data is regenerated from the new mesh.

## Quarry

The scene uses existing closed scans for 40 aligned shelves, 62 scree stones
and 98 vegetation instances grouped near protected joints. The recipe retires
256 scattered instances in the pilot area. The bounds of added collision
rocks clear the protected trail corridors by at least 28 inches. USGS images
of talus accumulation inform the relationship between the shelf, broken stone
and the finer wash below. [USGS reference, figure 25](https://pubs.usgs.gov/pp/0484/report.pdf)

The quarry blend transfers visual dirt coverage to exposed rock along the
shoulders and softens the uniform worn strip. The localized change covers
16,415 atlas pixels. The source checks compare all 2,563,201 terrain samples
and confirm that physical height, surface coverage and transition fixtures are
byte-identical. The routes and their gates match the previous data. The pilot
uses the existing playable elevation field. Regional elevation data remains
available for the later horizon and landform pass.

Run `node Tools/export-source.mjs` after editing the placement recipe, then
bake the masks with `node Tools/bake-terrain-transitions.mjs`, rebuild the ground
material, and cook. `Tools/refresh-slate-rim-pilot.mjs` can apply the pilot once
to a matching pair of pre-pilot manifests. It stops if the pilot is already
applied. The full export rebuilds the original scatter before applying the new
recipe. `Tools/validate-slate-rim-pilot.mjs` also accepts a baseline directory
to check scene, route, and terrain differences. Run `verify-fidelity.ps1` with
`-Mode Quarry` for the stock Urus route and close views.

The standalone refresh accepts matching manifests from before Perimeter
Expedition. It protects the Slate Rim spline and the other routes present
in the input, and also protects the expedition spline when present.

Both verification scripts accept `-PackageDirectory` for an isolated Windows
package. Each receipt records the resolved package path, executable SHA-256,
and SHA-256 for each staged game content file, including cooked containers and
any loose native data. The performance receipt's `source` entries describe the
checkout identified by `verifierSourceDirectory`.

## Packaged Windows verification

The old package and the pilot were run on the same machine at 1920 × 1080,
with the stock Urus and the same 30-second real-time quarry drive. Both
runs at each setting passed all 14 driving guards, reached gate 4, and
covered about 257 feet. The frame rate cap stayed active.

| Preset | Average FPS, before → pilot | 95th-percentile frame time, before → pilot | Peak GPU memory, before → pilot | GPU temperature first sample → peak, before / pilot |
| --- | ---: | ---: | ---: | --- |
| Cool, 30 FPS | 29.85 → 29.85 | 33.92 → 34.01 ms | 2,587 → 2,652 MiB | 49 → 60 °C / 58 → 65 °C |
| Balanced, 45 FPS | 44.77 → 44.81 | 22.66 → 22.73 ms | 2,609 → 2,657 MiB | 56 → 69 °C / 61 → 72 °C |

The pilot started warmer in both runs. These short samples measure capped
frame pacing and memory on this drive. Uncapped performance and long-session
thermal behavior remain unverified. The cooked containers grew by about
1.18 MiB. The gameplay executable has the same SHA-256 as the baseline.

At Quality with a 20 FPS test cap, the stock Urus completed all 20 quarry
gates upright. All 16 checks passed and the eight matched captures were
reviewed. The wheel arch and rocker outlines are cleaner in profile, and the
rear glazing, taillights and diffuser read as separate components. The
quarry banks show exposed bedrock and looser material near the trail.
The same package passed 117 rut checks, 64 rut-transition checks and 81
focused Urus rollover checks across ten side and roof drop cases.

Evidence lives locally under `Saved/PhotorealPilot`. The original build
containers are retained there for rollback. The exact pilot package hashes
and run receipts are stored under `Candidate`.

Two older source fixtures still report the same out-of-range measurements
on both baseline and pilot. These are the Urus bonnet ridge and the
G63 4×4² headlamp surround. The focused Urus panel and terrain checks pass.

## Review follow-up verification

A copy of the pre-pilot manifests regenerated the existing placement output
exactly. A second refresh exited with full-export instructions and left both
manifests and the heightfield byte-identical. The Slate Rim baseline comparison
and the terrain mask check across 2,563,201 samples passed.

The receipt check reused the retained candidate Windows package. Its five
content hashes matched the staged files. The baseline shared the candidate's
executable SHA-256 but had different `.pak`, `.ucas`, and `.utoc` hashes for
the TerraDrive containers. The 1080p Cool benchmark passed 14 guards with
a 30 FPS cap and a peak GPU temperature of 58 °C. The fixed-clock Quarry run
passed 16 checks, cleared all 20 gates, and produced eight captures at a peak
of 63 °C. Both receipts recorded the same candidate hashes. Two earlier
launches crashed during startup with restricted Windows access. The local
evidence retains those attempts alongside the successful runs. The matched
performance measurements above are the original pilot evidence.

## Rollout

The [Urus front and Slate Rim follow-up](urus-quarry-fidelity.md) records the
completed hood and bumper work and the quarry extension to the finish.

1. Refine the Urus front bumper and bonnet against matched-angle photographs,
   then build the next vehicle from a trim-specific reference sheet. Capture
   straight-on and three-quarter views under controlled light before adding
   detail. Record which dimensions come from factory data and which are
   estimated from photos.
2. Extend the quarry material and geology workflow by terrain sector. Use
   remote elevation data to guide distant ridgelines, and use licensed scans
   for close rocks and ground. Check collision and grip independently of the
   visual material so new scenery does not close an established driving line.
3. Review each sector and vehicle in the packaged game before moving to the
   next. Keep the same comparisons at 1080p on Cool and Balanced, and check
   the worst camera angles for frame-time spikes, visible repeats and gaps
   between collision and scenery. Compare larger rollouts under a longer,
   temperature-monitored drive.
