# Native validation — vehicle reference craft pass 18

The fresh Windows package passes **2,905/2,905 native checks** across nine modes. **450 fresh captures were actually inspected**, including ten close native views of each of the nine vehicles. All accepted runs bind the same executable and immutable fresh full asset-cook receipt. Evidence was assembled **2026-10-30T07:17:11.471915+00:00**. [native-validation.json](native-validation.json) records the individual report, image-review, package and source hashes.

| Native mode | Passed | Captures reviewed | Highest sampled GPU temperature | Clock |
| --- | ---: | ---: | ---: | --- |
| Art | 99/99 | 90 | 55°C | realTime |
| Full | 344/344 | 109 | 54°C | pacedFixed20Hz |
| Turning | 572/572 | 20 | 63°C | fixed20Hz |
| Mechanical | 500/500 | 18 | 58°C | realTime |
| Movement | 111/111 | 16 | 60°C | fixed20Hz |
| Rollover | 465/465 | 58 | 58°C | fixed10Hz |
| BodyGround | 469/469 | 78 | 56°C | realTime |
| Ruts | 117/117 | 16 | 54°C | realTime |
| Damage | 228/228 | 45 | 57°C | realTime |

## Model and source review

[Reference craft decisions and manufacturer sources](reference-coachwork-18.md) describe all nine vehicles and their selected configurations. Before views and manufacturer front, side, rear, three-quarter and detail images informed the refinements; the final native Art suite supplies 90 fresh views. Actual image inspection covers the revised lights and fascia, bonnet/roof flow, straight panel runs, mirror orientation, visible cabin and wheel finishes. Static captures do not prove continuous animation or photogrammetric dimensional accuracy.

Nine source validators pass: all-model geometry, G-Class dimensions and variant details, Wrangler bonnet, Urus panels, Civic/Urus contours, running gear, the new craft probes, complete export consistency and proving-ground-only packaging. The **24 new craft probes** inspect actual optical recesses/layers, open grille cells, absence of painted headlamp fill, rear-facing mirror glass, the existing geometry budgets and the complete shared Urus fascia/shoulder edges and continuous painted lamp perimeter. An initial G 63 draft exceeded its existing 450,000-triangle limit; new detail tessellation was reduced without raising the limit. Historical portable/native counts are not added to this pass.

The source-only pass retains native C++ physics, stock dimensions, axle centres and upgrade mounting points. Full covers driving, garage, lamps and challenges; Turning covers full-lock wheel motion; Mechanical covers running gear and conversions; Movement covers braking and momentum; Rollover and BodyGround cover the revised coachwork hulls and ground support; Ruts and Damage cover deformation and Free Run regressions. BodyGround remains the 39-trial moving-side/roof matrix. The existing [rollover friction and body-impression implementation](body-ground-17.md) is unchanged.

## Fresh import, full cook and preservation

- Executable SHA-256: `b362c60160c72b18410d8a789b5143b9e683bbc22b94eec843d68acbf701f9ae`. No native C++ file changed, so the executable is byte-identical to pass 17; the revised geometry is in the freshly cooked assets.
- Immutable asset-cook receipt SHA-256: `f0218b91bd3f24644ca18c442a85a7715b0292145459ced5639206b17cc3ef9b`. Full build/cook completed **2026-10-30T06:16:30.8574339Z**.
- All **142** frozen Source/Tools/Config/project producers match the tested candidate. Actual IoStore listing verifies **272 meshes**, the proving-ground map and owned body-scrape material; retired Winter Expedition remains absent. **108** regenerated collision hulls and per-model support probes bind the revised body hashes.
- A separate read-only Unreal commandlet verifies the import metadata/source hashes of all **15 changed meshes**, with all nine bodies retaining CPU access for visible damage. All **seven** NativeData files extracted from the UFS package are byte-identical to their sources.
- Of **275** SourceAssets files, **16** changed: nine body OBJs, six rim/combined-wheel OBJs and their import manifest. **259** remain byte-identical, including scenery and tires. Stable exported material IDs prevent unrelated scenery churn. Four terrain-data files remain unchanged.
- All **1,214** local browser files and the current garage/graphics files remain byte-identical to the checkpoint. Native fixtures use isolated player files. Raw Epic/Fab content, reference photographs, generated builds/assets and player files are excluded from the source upload.

One pre-cook candidate failed because an imported material script overwrote the importer's material factory in its shared Python globals. That failure is preserved with zero native acceptance. The final importer executes the helper in a separate namespace. The old export checker also expected an obsolete six-vehicle/revision-11 manifest; it now checks the existing nine-vehicle/revision-12 format, the new reference revision and unique stable material IDs, preserving the physical checks. EarthCruiser tire metadata now truthfully identifies its already formed and beveled mesh. All accepted export, import, cook and native checks were rerun after these corrections.

The first cooked visual candidate passed99/99 render checks but was rejected after actual inspection of all90 views: its Urus outer fascia/lamp edge stood proud of the bonnet shoulder. The final candidate restores a common closure boundary, fits the lamp and Y guide inside that boundary, and adds four independent continuous-edge/perimeter probes, plus two full front-seam checks. A subsequent source-only candidate was also rejected after a full-edge diagnostic measured a roughly0.85-inch interior gap between matching corners; the final strip uses fixed endpoints and checks all11 edge vertices on each side against the shoulder polyline. Its source export, import, full cook and all accepted native runs are fresh; the rejected99 checks and90 images are excluded from acceptance totals.

A later preview was rejected after inspecting only two of its90 captures: a thin front crown/fascia slit remained. The actual front-seam diagnostic missed60/73 rays because the crown used smooth interpolation above a polygonal fascia edge. The final source uses one shared piecewise-linear boundary and includes every crest station in the crown grid. Fresh front-seam measurements have zero missed rays, with the deliberate0.012-inch probe offset included in the reported hit distances. These extra checks raise the craft suite to24. Rejected render checks and unseen images are excluded.

An initial read-only material audit rejected an old Bronco rim slot absent from the export. A section-aware audit then verified **296 used material slots across all render LODs** and established that the three retained legacy slots are unused. The failed audit remains archived, excluded from native acceptance. This correction changed only the private auditor; it did not change the cooked assets or relax any used-material check.

Private exact evidence: `Saved/Pass18-2026-10-30T03-11-33Z/Candidate5`. Launch `Build/Windows/TerraDrive.exe` with the complete Windows folder; the nested executable alone is insufficient.

## Practical limits

These are original procedural reference models. They still need dedicated artist-authored production surfacing, baked detail maps, complete interiors and authored LODs to approach Forza-class fidelity. They are not manufacturer CAD or scanned production vehicles. See the [vehicle art production plan](vehicle-art-production.md).

Native runs requested **20 FPS** with a **77°C** sampled GPU cutoff. The highest sampled acceptance temperature was **63°C**. Full uses a 1280×720 viewport and paced fixed 20 Hz, with both engine frame-rate properties printed and checked at runtime. Movement/Turning use unpaced fixed 20 Hz and Rollover fixed 10 Hz; the remaining modes use real time. Other captures use 1600×900. Synthetic clocks establish functional behavior under those conditions, not real-time throughput. BodyGround's observation delta remains capped at 0.1 seconds.

The prior real-time quarry profile of about **3.33 FPS**, dominated by CPU physics, remains unresolved and was not repeated. This pass makes no performance, hardware-temperature, crash-stability, full-rate endurance or manual/controller-session claim. No driver or saved player graphics setting changed. Existing bounded session-local terrain deformation and the hull-based collision approach remain; there is no new volumetric-soil, persistent-map or structural soft-body claim.
