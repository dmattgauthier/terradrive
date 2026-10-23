# Terra Drive native port

Target: Unreal Engine **5.8.3**, Windows x64. The simulation is native C++, with Chaos rigid-body dynamics, native static mesh assets, procedural terrain and instanced tire spray. There is no web view, JavaScript runtime or HTTP server in the native game.

The latest [vehicle and landscape pass](docs/realism-terrain.md) adds curved-surface normals and rounded fittings, automotive finishes across all six vehicles, lighter view-dependent glazing, MW landscape textures/foliage and scanned Winter Scene snow, rock and ice. It requires the acquired **MW Landscape Auto Material** and **Automotive Winter Scene** packs as well as Automotive Materials. The document explains how the packs feed the deformable native terrain and how to add them from your Epic library.

The latest physics correction restores finite-tread support on uneven rigid ledges after the sphere query rejects a side contact. See [ground-contact.md](docs/ground-contact.md) and run `Tools/verify-native.ps1 -GroundOnly` for the focused regression. Current bodies remain procedural approximations; [vehicle-art-production.md](docs/vehicle-art-production.md) describes the recommended mesh, material and reference-review pipeline for a substantial visual improvement.

The Urus art update is described in [urus-automotive.md](docs/urus-automotive.md): reconstructed coachwork, inset glazing, deeper intake and diffuser geometry, dished 22-inch wheels and actual Epic Automotive Materials instances. The material pack is a separately acquired build dependency; its original UAssets are not distributed in this source repository. The reference reconstruction is improved but remains below the precision and detail of a production racing-game vehicle asset.

The latest native model/scenery changes are documented in [urus-slate-rim.md](docs/urus-slate-rim.md): sculpted V8 Urus Performante body/cabin surfaces and the 1,065-foot Slate Rim quarry trail, with matching CC0 cliff, boulder, grass and ground scans. It is the ninth challenge, selectable with J. The previous [body-shapes-and-fab.md](docs/body-shapes-and-fab.md) round retains the other five body refinements, circular Summit loop and African Slate Quarry scenery. Optional Fab content is imported from your own Epic cache; raw licensed assets are excluded from this public source.

## Build

Install Unreal Engine 5.8, Visual Studio with Desktop/Game Development C++, and a Windows 10/11 SDK. Development here uses UE 5.8.3, VS 2026 MSVC 14.51 and SDK 10.0.26100. Node 24 is needed only to convert the supplied source assets. Unreal's bundled Python runs the editor import script.

Before importing, add Epic's free [Automotive Materials](https://www.fab.com/listings/5dd132fe-ee32-4e8c-9cd3-7496547dfb29) pack from your Fab library to this project. Use **Show all projects**, select **TerraDrive**, and choose the nearest available pack version (5.7 in this installation) if the Launcher filters out UE 5.8. Keep the project on UE 5.8.3. The required material parents must exist under `Content/AutomotiveMaterials`; the import script checks for them.

From this directory:

```powershell
.\Tools\build-native.ps1 -ImportAssets -Package
```

The current script expects the standard `C:\Program Files\Epic Games\UE_5.8` installation. Pass `-EngineRoot 'D:\YourEngine'` for another installation. Conversion reads the adjacent `TerraDrive-v1.13` folder. Do not substitute an older source ZIP over that updated folder.

Open `TerraDrive.uproject` to edit. Packaged output is under `Build/Windows/`. Generated assets are recreated with `Tools/export-source.mjs` and `Tools/import-assets.py`; `Content/NativeData` must be staged with the game. `UBA_ROOT` is deliberately project-local so the build accelerator does not need to write to ProgramData.

Run editor import and packaging in a normal Windows process context. A restricted process sandbox can make Unreal exit before logging, and UE 5.8 staging writes a temporary `StagedBuild_TerraDrive.ini` under the installed engine's `Intermediate/Build/BuildCookRun` directory. Automation logs stay in `Saved/AutomationLogs`; importer diagnostics are in `Saved/Logs/import-assets.log`. The importer uses forward slashes in the Python script argument and requires a fresh completion marker and saved map. Interrupted mesh imports can be resumed.

The unused Android File Server plugin is explicitly disabled. `Tools/prepare-github.mjs` rejects credential-like configuration values before preparing an upload; do not publish server tokens that Unreal may generate in local settings.

After packaging, launch `Build/Windows/TerraDrive.exe`. Keep the entire `Windows` directory together; the executable requires the adjacent cooked content. To run the native automated driving checks and capture the regions and challenge routes:

```powershell
.\Tools\verify-native.ps1
```

The verifier requires a fresh JSON report, a successful game exit, and all expanded checks passing. Its report and game log are in `Saved/Validation`; rendered screenshots are saved by the packaged game in its `TerraDrive/Saved/Screenshots` directory. These checks cover asset loading, acceleration, braking, steering, snow flotation, soil accounting, region spawns, camera clearance, rollover/airborne contact, moving debris, loop/gap collision, axle lockers, descent assist, nine challenge route spawns, upgrade effects, save/reload isolation, matched stock/tuned driving and garage entry/exit, pressure response, rut continuity and physical scenery contact. They do not establish full behavioral parity with the browser reference.

For a C++-only change after a successful cook, `-Package -SkipCook` rebuilds and stages against existing cooked content. Omit `-SkipCook` after asset or rendering-setting changes. `-SkipExport` reuses existing OBJ sources during material/import work. Generated mesh schema 2 accounts for Unreal's OBJ Y-axis conversion; changing the schema triggers reimport. Material signatures make interrupted imports resumable. The native renderer uses screen-space GI/reflections for its procedural terrain. Source foliage diffuse textures and alpha masks are imported; OBJ vertex-color variation is currently represented by each material's average source tint.

## Controls

| Input | Action |
|---|---|
| W / S or arrows | Drive; keep opposite input held through a full stop for 0.65 seconds to select reverse/forward |
| A / D or arrows | Progressive steering |
| Space | Brake and hold; does not select reverse |
| Right mouse + mouse | Orbit camera |
| C | Near/far chase camera |
| 1–9 | Trail, tarmac, rock, mud, marsh, sand, Summit park, snow, Granite Trials |
| J | Cycle nine challenge routes |
| V | Open vehicle selection while stopped |
| T | Equip/remove flotation tracks while stopped; Civic excluded |
| F / L | 2WD/4WD / low range on supported vehicles |
| Z / U | Rear / front differential lock; stop and select required driveline first |
| Shift + W | Crawl throttle |
| K | Descent assist on supported vehicles |
| + / - | Tire pressure |
| X / Q | Attach/detach nearest standing-tree anchor / reel winch |
| Tab | Open vehicle and upgrade garage while stopped; return to driving |
| Drag / scroll over garage vehicle | Orbit / zoom; Front, Side, Rear and Reset buttons select views |
| Arrow keys / Page Up / Page Down in garage | Orbit / zoom with the keyboard |
| Mouse on garage buttons | Select a vehicle, category stage, reset to stock, or drive |
| Escape in garage | Return to driving |
| P | Dry/rain response |
| R | Recover at current region or restart current challenge route |
| Backspace | Repair deformed soil and clear tire marks |
| Esc | Quit |

Gamepad left stick steers. Right/left triggers request forward/reverse; opposite input brakes before selecting direction. The bottom face button is a dedicated brake/hold.

This is a migration preview. Browser regression results are reference evidence, not proof of native parity. See `docs/validation-native.md` for observed native results and remaining limits.

See [offroad-challenges.md](docs/offroad-challenges.md) for route descriptions, driving techniques and the native axle/contact model.

The game opens in the vehicle garage. Stock plus three upgrade stages are available immediately and saved independently for each vehicle. Seven terrain surfaces use layered photographic textures, normal maps and world-space variation. See [garage-and-terrain.md](docs/garage-and-terrain.md) for stages, persistence and material reproduction.

Player-facing measurements use mph, feet/inches, pounds, PSI, horsepower and pounds-force. The new tire-contact and model pass is described in [terrain-interaction-and-models.md](docs/terrain-interaction-and-models.md). Run `Tools/test-core.cmd` for the standalone simulation checks.

Native controls and researched model refinements are described in [vehicle-model-research.md](docs/vehicle-model-research.md). The extended suite covers brake input/holding for all six vehicles, forward/reverse wheel orientation, Hummer physical ride height, garage camera persistence and separate tire/rim scaling.

See [lighting-tracks-urus.md](docs/lighting-tracks-urus.md) for the original V8 Urus Performante, brake/reverse lights, CC0 scan sources and photographic sky. Vendored native sources are under Vendor/Environment. Run Tools/fetch-environment-assets.py only to recover missing source downloads; normal builds use the included offline copies.

The corrective [surface deformation round](docs/surface-deformation.md) replaces dark off-road tread ribbons with physical grooves, raised shoulders, compacted snow, light dusty dirt trails and bent grass instances. Rubber skidmarks are restricted to pavement traction loss. Backspace repairs terrain, plants and marks. The same document records the inspected Fab library, the downloaded quarry pack and additional free asset candidates.

