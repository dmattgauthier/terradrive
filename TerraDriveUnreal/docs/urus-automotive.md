# Urus Performante body and Epic Automotive Materials

Completed and verified: October 22, 2026. Native vehicle art only; the supplied browser tree and player garage save are preserved.

## Reference set

This is the original V8 Performante, with 22-inch Helianthus Shiny Black wheels, rather than the later SE. Body dimensions and mechanical wheel hardpoints are unchanged. This is an original mesh reconstructed from references; it is not manufacturer CAD or a purchased vehicle model.

- [Lamborghini's original model page](https://www.lamborghini.com/en-en/history/urus-performante): exterior design, carbon bonnet/roof/arches, air curtains and rear spoiler.
- [Lamborghini brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/gateway_urus/performante/2022/banner/pdf/2023/URUS%20PERFORMANCE_DIGITAL_BROCHURE_WCAG_EN.pdf): exterior plate on page 6, factory wheel designs on page 8, cabin on page 10 and aero on page 15.
- [Manufacturer side profile](https://www.lamborghini.com/sites/it-en/files/DAM/lamborghini/face_react/history/masterpieces/2025/04_11/masterpiece_2023_urus_perf.png): axle spacing, overhangs, roof and beltline.
- [Manufacturer media rear view](https://www.thenewsmarket.com/urus-performante-exterior/a/1bc6fb6a-086e-493e-b7fc-de63b17be74d): hatch, lamp strip, diffuser and exhaust placement.
- [European Prestige 2023 car gallery](https://www.europeanprestige.co.uk/stock/previously-sold/details/2023-lamborghini-urus-performante/642): real painted surfaces, front lamp and intake close-ups, side and rear-quarter views. This particular car has optional 23-inch Pelope wheels; those wheels are not used as a reference for the selected 22-inch design.
- [Auto Bild side photograph](https://www.autobild.de/artikel/lamborghini-urus-performante-test-suv-motor-preis-22310135.html): independent side silhouette and door/arch relationship. Its bronze wheels are also a different option.

Reference photographs are used for inspection and are not shipped as textures or published in the repository.

## Corrections to the previous native model

The baseline had nearly flat vertical door sheets, a square rear quarter, tubular roof rails, oversimplified bumper openings, a broad five-point wheel web and protruding exhaust tips. The replacement uses separately controlled width, shoulder and beltline stations; a recessed waist; a rising carbon rocker; continuous painted pillars with inset glazing; a bounded sloping hatch; bonnet vents and intake reveals; a broad splitter; and exhaust outlets within the rear bumper. The 22-inch wheel now has five large angular openings, five outer triangular reliefs, a narrow rim and a dished web. The rear has a continuous black lamp band and a carbon lower corner; mirror housings are fuller and their reflecting faces point rearward.

The model retains the published 202.24-inch length, 79.76-inch body width and 118.34-inch wheelbase. Mirror geometry now matches the published 85.87-inch overall width. These are authoring targets; they do not establish photographic accuracy. The body is substantially reconstructed but remains an approximation. Precise panel curvature, lens assemblies, badging, cabin detailing and production LOD/UV work remain below Forza-level asset quality.

## Adding the acquired Epic pack

The pack was added from the user's Epic/Fab library using **Automotive Materials > Add to Project > Show all projects > TerraDrive > version 5.7 > Add to Project**. The project itself remains on UE 5.8.3; 5.7 was the newest downloadable pack version offered by the Launcher. The Launcher project discovery list needed this project's parent folder registered first.

The installed pack is under `Content/AutomotiveMaterials`. Its original material instances and master materials are preserved. `Tools/automotive-materials.py` creates project-owned instances under `/Game/Materials/Automotive`, then `import-assets.py` assigns those instances to the exported Urus material slots. The generated binding report is saved locally at `Saved/automotive-bindings.json`.

Eleven imported material slots cover nine finish roles: clear-coated paint, exterior carbon, gloss black trim, rubber seals, metal, interior plastic, suede-like upholstery, painted wheels and carbon-ceramic rotors. The underlying pack supplies the shading and textures; the new instances tune tint, roughness, normal intensity and clear coat. Metallic flakes are disabled for the selected solid yellow paint and black wheels. Carbon anisotropy and baked-in dust/fingerprint switches are disabled. Parameter changes are verified by readback because UE 5.8's parameter setters return false even when the assignment succeeds. Brake and reverse emitters retain the game's existing dynamic lamp parameters.

See [Epic's pack documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/automotive-materials-pack-in-unreal-engine) and its [Fab listing](https://www.fab.com/listings/5dd132fe-ee32-4e8c-9cd3-7496547dfb29). The pack does not include the example vehicle meshes.

For a fresh checkout, acquire the free pack through your own Epic account and add it before importing. The import stops with a specific missing-asset message if required parents are unavailable. The public repository contains the integration recipe and original geometry code, not the licensed raw Epic UAssets. Packaging cooks the native asset folders and their referenced Automotive dependencies instead of every demonstration asset in the pack.

## Verification

The first six packaged-game captures passed technical loading checks but were rejected visually: flat triangles cut across curved lamp/window surrounds, the bumper corners were not joined correctly, and the carbon/wheel reflections were excessive. The corrective pass subdivides contours in parameter space before mapping them to the curved panels, conforms intake walls and door seams to their supporting surfaces, and adjusts the material response. A second native comparison caught overlapping rear quarter-window contours and the missing outer wheel reliefs. Those were corrected together with the front corner join, bonnet carbon outline, rear lamp band and mirror orientation. Rejected passes remain locally in `Saved/UrusAutomotiveReview/iteration-1` and `iteration-2`.

The third and fourth comparisons corrected mirror width, the black C-pillar, the curved roof surround, folded bumper corners and panel-end seams. The fifth set was accepted as an improvement over the starting model after reviewing front, side, rear, both front quarters and rear quarter. Those six actual packaged-game renders are preserved locally under `Saved/UrusAutomotiveReview/iteration-5`. The review is qualitative against the cited references; it is not a CAD overlay or a claim of exact replica accuracy.

Final import/full cook/package succeeded in `Saved/urus-automotive-build-6.log`. Focused native review passed 7/7 checks with a fresh report, six fresh images and actual process exit 0. Independent simulation checks passed 143/143. The full native regression passed 278/278 with a fresh report, clean mesh/render diagnostics and actual process exit 0; the stock Urus completed all 20 Slate Rim gates continuously. [validation-native.md](validation-native.md) and [native-validation.json](native-validation.json) contain the results and exact source/cooked hashes. All 1,214 local browser-tree files and the player's garage bytes remain unchanged.
