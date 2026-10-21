# Native migration validation

Verified October 20, 2026 with Unreal Engine 5.8.3 on Windows x64. The project imports, cooks and packages successfully. The packaged Development game runs using native C++ and DirectX 12 SM6 on an NVIDIA GeForce RTX 4060 Laptop GPU.

Launch `Build/Windows/TerraDrive.exe` and keep the entire `Windows` folder together. The executable under the project's top-level `Binaries/Win64` is an uncooked build product; use the packaged launcher above.

## Observed results

| Check | Result |
|---|---|
| Editor and game C++ targets | Both compiled successfully with MSVC 14.51.36256 and Windows SDK 10.0.26100 |
| Shared simulation core | 15 checks passed after recompilation: wheel integration, reverse symmetry, flotation, rigid soil, traction budget and brake-to-reverse gating |
| Source conversion | 141 meshes, five vehicle variants, eight regions and 472 tree placements |
| Terrain export | 1,000 height/water/surface samples passed; maximum height conversion error 0.00000190735 m; eight region references also verified |
| Native import | 141 meshes, 207 materials, nine textures and `/Game/Maps/ProvingGround`; mesh schema 2; fresh completion marker |
| Windows package | Full cook/stage/archive succeeded; camera and unused Android-plugin configuration revisions rebuilt and staged using that cooked content |
| Packaged runtime | All 27 native checks passed, with a fresh report and process exit 0 |
| Graphics | Nine rendered 1280×720 captures inspected across the driving test and eight regions; no fatal/runtime error entries in the final game log |
| Interactive desktop check | Packaged launcher opened the game; Tab opened the field garage, V changed Jeep to Bronco, Escape exited |
| Browser preservation | 189 browser code, test and asset files matched the remote Git tree by Git blob SHA-1; browser files were not edited |

The final machine-readable results are in [native-validation.json](native-validation.json). The export comparisons are in [export-validation.json](export-validation.json), and preserved browser hashes are in [browser-source-sha1.json](browser-source-sha1.json).

The native driving scenario traveled 66.483 m and reached 20.987 m/s, then stopped to 0.000 m/s under braking. The EV steered launch reached 16.558 m/s with 89.294 degrees of yaw. Snow deformation measured 22.02576 cm under the tire test versus 4.74707 cm under the track test; the soil volume accounting error was zero at the recorded precision. All eight region surface references matched, and the camera stayed above the terrain with zero roll at each capture. These are regression scenarios, not calibrated performance or real-world handling measurements.

## Repairs verified in this continuation

Unreal commandlets start correctly outside the restricted process sandbox. Forward slashes prevent PythonScriptCommandlet from treating the project path's backslash-t as a tab. The importer uses UE 5.8 editor property access for material slots and checks the saved map and a fresh completion marker. Packaging stages the native terrain data and dynamically loaded engine sphere asset.

The native terrain sampler now follows the exported row-X/column-Y layout. Mesh schema 2 compensates for the OBJ importer's own Y-axis conversion. Imported foliage uses the source diffuse textures and alpha masks, and materials enable instanced static mesh usage. The camera uses absolute rotation to keep its horizon upright when the chassis rolls or pitches; eight camera regression checks now catch underground or tilted views. The wider chase camera also returns correctly after toggling C.

The renderer uses screen-space GI/reflections, removing the invalid Lumen configuration seen in the first package. The final log retains two non-fatal warnings: SSGI is deprecated in UE 5.8, and the unused Enhanced Input user-settings subsystem has no PlayerInput object. Direct keyboard controls were verified. The compiler also warns that MSVC 14.51 is newer than its preferred 14.50 toolchain.

An automatically generated Android File Server token was removed before the final source publication; it was absent from the earlier remote configuration. The unused Android File Server plugin is now disabled, and the upload helper rejects credential-like configuration content.

## Reproduce and inspect

From the native project directory, in a normal Windows process context:

```powershell
.\Tools\build-native.ps1 -ImportAssets -Package
.\Tools\verify-native.ps1
```

The verifier rejects stale reports, failed checks and unsuccessful process exits. Local evidence remains in `Saved/Validation/native-validation.json`, `Saved/Validation/packaged-game.log`, `Saved/Logs/import-assets.log`, and `Saved/AutomationLogs`. Screenshots are in `Build/Windows/TerraDrive/Saved/Screenshots/native-acceleration.png` and `native-region-1.png` through `native-region-8.png`. The executable SHA-256 is recorded with the JSON results. Generated assets, builds, logs and private application configuration are excluded from GitHub.

## Remaining migration limits

This is a playable migration preview; full behavioral or visual parity with browser 1.15 has not been established. Advanced safety interlocks, detailed body/tire deformation, full upgrade persistence, moving-body spray sweep accuracy, tree inertia/contact calibration, track belt animation and challenge collision need further work. Native soil and vehicle values remain simulation estimates.

OBJ conversion represents per-vertex color variation with each material's average source tint. Browser procedural shaders and canvas sign lettering are not reproduced; signs currently render blank. Lighting, water appearance, snow shading and steep-slope camera framing still need polish. Gamepad mappings are implemented but were not physically tested. Frame rate and long-session stability were not benchmarked.

The historical browser checkpoint contains 62 passing focused Node regressions. A broad rerun during this continuation was interrupted to reduce memory pressure, so it is not recorded as a fresh full-suite pass. The browser source remains intact as the reference for further migration.
