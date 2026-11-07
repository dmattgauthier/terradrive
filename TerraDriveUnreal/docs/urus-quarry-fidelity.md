# Urus front and Slate Rim Quarry follow-up

## Urus Performante

The front reconstruction uses Lamborghini's original V8 Performante brochure
and matching studio photographs for the visible panel boundaries. The factory
dimensions still anchor the vehicle envelope. The body now has a broad
exposed-carbon hood with a rounded leading edge, paired pressed ridges, and
recessed, louvered hood outlets. The bumper has one continuous dark lower
opening, swept slats, side air curtains, painted chin hooks and a stepped
splitter. The factory and studio photos guide the panel shapes by eye.

[Lamborghini factory brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/URUS%20PERFORMANCE_DIGITAL_BROCHURE_WCAG_EN.pdf)
· [Same-trim studio photographs](https://www.marshallgoldmanoh.com/used-vehicle-2023-lamborghini-urus-performante-c-3816/)
· [2024 front close-ups](https://exoticsgroup.com/cars/2024-lamborghini-urus-performante-zpbuc3zl8rla30052/)

The original automotive materials, lighting controls and vehicle hardpoints
carry through the new front surfaces. The only changed mesh input among 307
is the Urus body. The body contact data was regenerated. The source checks
passed 1,316 intake probes, 90 hood samples, the duct openings and the rear
lamp and exhaust regressions. The hood ridge now clears the existing
1.2-inch requirement at the new ridge's cross section, measuring 1.44 inches
against the adjacent channel. The roster-wide model checks passed for all
ten vehicles. The separate coachwork suite still reports the previously
documented G63 4×4² headlamp fixture failure.

## Slate Rim Quarry

The extension picks up at the end of the original art section and continues
638 feet to the finish. Its four sections have different rock and ground
patterns. The reference quarry at Dinorwic has terraced workings and waste
tips. The placement recipe uses those features to distinguish the cut faces
from broken stone below. [Royal Commission quarry record](https://coflein.gov.uk/en/sites/40538)

| Trail station | Treatment |
| --- | --- |
| 427–610 ft | Upper Cut with stepped bedrock and an exposed bank |
| 610–797 ft | Articulation Bench with broken low shelves around the existing obstacle line |
| 797–958 ft | Spoil Fans with loose stone spreading downslope |
| 958–1,065 ft | Reclaimed Exit with scattered rock and a gradual return to grass |

The recipe adds 43 shelf rocks, 141 scree fragments and 64 vegetation clumps
from existing scans and retires 426 generic placements. The nearest added
solid rock's bounding envelope has 23.9 inches of clearance beyond the
protected corridors. The new treatment changes 27,399 atlas pixels. The
original pilot placements, authored gates, heights, and physical surface
data match the merged baseline. The render coverage checks examined all
2,563,201 pixels.

The standard full exporter applies both quarry recipes. An existing
first-pilot export can apply just the extension once with
`node Tools/refresh-slate-rim-pilot.mjs`. After editing either recipe, use the
full export, bake terrain transitions, and rebuild the ground material before
cooking. The validation script accepts an optional baseline project directory.

## Packaged Windows verification

The cooked UE 5.8.3 Windows package passed 285 focused functional checks.
The stock Urus drove all 20 quarry gates upright, with a maximum line error
of about 4.5 feet. The quarry run produced 15 captures. The separate native
runs passed 117 rut checks, 64 terrain-transition checks and 81 Urus rollover
checks. The unrelated 191-gate Perimeter run ended early to prioritize the
performance comparison. The source clearance checks cover the intersecting
corridor.

The front and three-quarter captures show the new bumper proportions and hood
ridges. The close hood view still shows some rippling in the ridge highlights.
Pines obscure two survey angles, and an existing sharp terrain seam remains
visible beside the Granite Trials approach.

The 1080p entrance benchmark measures 30 seconds of real-time play under the
30 FPS Cool and 45 FPS Balanced caps. The initial baseline runs averaged
29.86 and 44.87 FPS. The candidate initially averaged 25.09 and 29.25 FPS.
The same older package slowed when repeated in the later session.

| Back-to-back repeat | Old average FPS | New average FPS | Old p95 frame time | New p95 frame time |
| --- | ---: | ---: | ---: | ---: |
| Cool | 24.98 | 25.03 | 48.84 ms | 50.94 ms |
| Balanced | 31.11 | 32.49 | 50.42 ms | 48.46 ms |

The two Balanced controls independently swapped the cooked content and
executable. They averaged 31.61 and 31.71 FPS. Both finished four gates
and passed all 14 benchmark guards, as did each repeat above. The initial
large gap did not follow either component. The cause of the change between
sessions remains unresolved. These short runs cover the quarry entrance.

Run `Tools/verify-fidelity.ps1 -Mode Quarry -QuarrySurvey` for the complete
stock Urus route, six later-trail stations and a dedicated hood close-up.
`-PackageDirectory` selects a particular Windows build. The run receipts
record the executable and content hashes. Local evidence is under
`Saved/UrusQuarryFidelity`.

The next art milestone can use this workflow for another trim-specific body
and terrain region. The Urus remains a photo-based reconstruction, with
lighting optics and small body details still estimated. Distant ridgelines
remain a separate landscape task.
