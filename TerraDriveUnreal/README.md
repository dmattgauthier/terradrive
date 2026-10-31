# Terra Drive native port

The current [driving interface and center differential update](docs/interface-controls-19.md) replaces the large driving panels with a compact top status bar, shows the current control keys, adds an Escape pause menu with editable controls and graphics settings, and adds compatible center differential upgrades. The updated native executable passes **2,057 checks** across seven modes, with **245 fresh captures actually reviewed** at both interface resolutions and in drivetrain regressions. **1,127 portable checks** also pass. Existing vehicle models, terrain assets and browser source are retained. The [native validation record](docs/validation-native.md) identifies the tested executable, reused cooked assets, evidence and limits.

**Known performance limitation:** the previous pass-15 real-time quarry profile averaged about **3.33 FPS**, dominated by CPU physics. That bottleneck remains unresolved. This pass verifies revised models and their native regressions; it does not establish a frame-rate improvement or fix the reported PC crashes. Fixed-clock functional runs do not establish smooth real-time gameplay. See the [measurements and limits](docs/validation-native.md).

The preceding [drivetrain, running gear and soil pass 13](docs/mechanical-soil-13.md) added
staged four-wheel drive, low range, axle lockers and portal conversions in the
garage, more detailed moving wheel-area hardware, surface-specific tire spray
and varied physical rut shoulders. Final package verification is recorded in
[validation-native.md](docs/validation-native.md).

The [rollover and coachwork pass 12](docs/rollover-coachwork-12.md) derives solid
body collision from each exported vehicle, addressing the Sprinter's side-roll
burial. It refines all six bodies and adds ten native review views per model.
Use `Tools/verify-rollover.ps1` for the dedicated native rollover fixtures.

The [Civic and Urus contour revision 11](docs/body-contours-11.md) develops the
bonnet, nose and rear closure shapes on both cars and straightens the Civic's
A-pillar edges. Native Art mode adds close bonnet, rear, pillar and overhead
views for those models. Geometry checks report physical relief in inches.

The [fidelity pass 10](docs/fidelity-10.md) reshapes the Urus side panels with a
continuous physical-height grid and shallower handle recesses. Smaller meadow
tufts, lower scanned plant groups and a less saturated ground palette improve
the landscape's scale. Native evidence is recorded in
[validation-native.md](docs/validation-native.md).

The [terrain and vehicle detail pass 9](docs/terrain-models-9.md) adds varied
grass/root patches, continuously warped texture coordinates and clearer snow
wind detail. All six bodies gain curved ceramic glazing borders, and the Urus
gains recessed optical bowls and convex projector lenses. Native evidence is
recorded in [validation-native.md](docs/validation-native.md).

The [coachwork refinement 8](docs/model-refinement-8.md) develops all six vehicle
bodies, including Urus compound surfaces, open Civic grille cells, formed
Sprinter side panels, and SUV bonnet/cowl details. Project-owned Epic Automotive
Materials instances preserve the authored dark carbon tint. The
[rut refinement](docs/rut-refinement.md) replaces repeated pointed soil piles
with continuous rounded grooves, broad bounded shoulders, packed snow and
surface-specific exposed-soil shading. Run `Tools/verify-ruts.ps1` for the
physical profile fixtures and `Tools/verify-winter.ps1 -Mode Art` for all nine
vehicles' current close native views. Art and rut fixtures use the Quality preset at a
20 FPS test cap; player saves and graphics settings are isolated.

Soft-ground footprints now couple tire pressure, sink and the rolling contact
arc, so a loaded tire works the soil supporting its front edge instead of
digging a short pocket beneath its centre. Snow compaction respects a finite
local layer, and sustained wheelspin develops deeper disturbance over time.
`Tools/verify-ruts.ps1 -DrivenOnly` runs the two actual stock-Jeep mud/snow
trials; the complete rut check includes those trials and the six-surface
physical profile fixtures.

Winter Expedition has been removed at the player’s request, including its destination button, travel key, map preparation and cooked-map entries. The proving ground retains its snow region, snow deformation and shared acquired winter textures/rocks. See [destination removal](docs/winter-level.md).

The proving ground gains sharper acquired snow/grass scans, physical snow relief, slushy fringes and more meadow planting. See [winter-ground-detail.md](docs/winter-ground-detail.md). The [vehicle model refinement](docs/model-refinement-7.md) adds recessed Urus geometry, body-detail corrections and revised factory tires/wheels. [Momentum and suspension](docs/momentum-and-suspension.md) explains the shaped undertray and progressive suspension stops. Use `Tools/verify-winter.ps1 -Mode Detail`, `Movement` or `Art` for the focused native checks.

Target: Unreal Engine **5.8.3**, Windows x64. The simulation is native C++, with Chaos rigid-body dynamics, native static mesh assets, procedural terrain and instanced tire spray. There is no web view, JavaScript runtime or HTTP server in the native game.

The [terrain transition update](docs/terrain-transitions.md) replaces hard material boundaries with shared coverage: narrow pavement shoulders, damp mud/marsh fringes, scattered stone and broken snow cover. Ground color, normal detail, roughness, grip and rolling resistance grade through the fringes while terrain interiors stay distinct. Use `Tools/verify-render.ps1 -Mode Transitions` for the focused native checks and boundary captures.

The [rendering and GPU update](docs/rendering-and-gpu.md) corrects angle-dependent quarry rock visibility and adds **Tab → 03 Graphics**. The new default is Cool at 30 FPS; Balanced at 45 FPS and Quality at 60 FPS are selectable. Garage previews run at 20 FPS and background rendering at 15 FPS. Native verification is capped and records GPU telemetry with a conservative temperature cutoff.

The [all-vehicle coachwork round](docs/model-refinement-6.md) revises the six models' glazing, cabin surfaces and body details. It includes open Urus windshield/hatch surrounds, native seat/headrest shading, flatter SUV fender shelves, Civic panel changes, Sprinter liners and HUMMER haunch/mirror changes. Use `node Tools/validate-models.mjs` for the geometry and glazing regression checks; native build evidence is in `docs/native-validation.json`.

The earlier [vehicle and landscape pass](docs/realism-terrain.md) added curved-surface normals and rounded fittings, automotive finishes across the original six vehicles, lighter view-dependent glazing, MW landscape textures/foliage and scanned Winter Scene snow, rock and ice. It requires the acquired **MW Landscape Auto Material** and **Automotive Winter Scene** packs as well as Automotive Materials. The document explains how the packs feed the deformable native terrain and how to add them from your Epic library.

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

For an optional **ground-material-only iteration** after the initial asset import, `Tools/rebuild-ground.py` reuses the existing texture loader and ground recipes. It updates dirty project-owned textures/materials and leaves mesh and Fab preparation out of that run. Existing exported data and baked transition masks are required. From this project directory, with the game and editor closed:

```powershell
$groundProject = (Resolve-Path '.\TerraDrive.uproject').Path
$groundScript = (Resolve-Path '.\Tools\rebuild-ground.py').Path.Replace('\','/')
$groundStarted = Get-Date
$groundArgs = @(
    ('"'+$groundProject+'"'), '-run=pythonscript', ('-script="'+$groundScript+'"'),
    '-unattended', '-nullrhi', '-nosplash', '-NoSound', '-stdout', '-FullStdOutLogOutput'
)
$groundProcess = Start-Process -FilePath 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' -ArgumentList $groundArgs -WindowStyle Hidden -PassThru
$groundProcess.WaitForExit()
$groundProcess.Refresh()
$groundMarker = '.\Saved\ground-rebuild-complete.json'
if ($groundProcess.ExitCode -ne 0 -or !(Test-Path -LiteralPath $groundMarker) -or (Get-Item -LiteralPath $groundMarker).LastWriteTime -lt $groundStarted) {
    throw 'Ground material commandlet did not produce a fresh completion marker.'
}
```

Wait for that commandlet to finish, then run `Tools/build-native.ps1 -Package` for a **full cook**. `-SkipCook` and the C++ staging helper do not incorporate changed materials or textures. The completion marker confirms the material commandlet finished; final rendering must still be checked in the newly cooked game.

The unused Android File Server plugin is explicitly disabled. `Tools/prepare-github.mjs` rejects credential-like configuration values before preparing an upload; do not publish server tokens that Unreal may generate in local settings.

After packaging, launch `Build/Windows/TerraDrive.exe`. Keep the entire `Windows` directory together; the executable requires the adjacent cooked content. To run the native automated driving checks and capture the regions and challenge routes:

```powershell
.\Tools\verify-native.ps1
```

The verifier requires a fresh JSON report, a successful game exit, and all expanded checks passing. Its report and game log are in `Saved/Validation`; rendered screenshots are saved by the packaged game in its `TerraDrive/Saved/Screenshots` directory. These checks cover asset loading, acceleration, braking, steering, snow flotation, soil accounting, region spawns, camera clearance, rollover/airborne contact, moving debris, loop/gap collision, axle lockers, descent assist, nine challenge route spawns, upgrade effects, save/reload isolation, matched stock/tuned driving and garage entry/exit, pressure response, rut continuity and physical scenery contact. They do not establish full behavioral parity with the browser reference.

Use `Tools/verify-electric-pressure.ps1` for isolated nine-vehicle factory/conversion, save migration, moving tire-air and matched road/sand trials. Its user directory is separate from ordinary player settings. `Tools/test-electric-pressure.cmd` runs the portable electric/pressure checks without launching Unreal. Use `Tools/verify-mechanical.ps1` for hardware, save migration, portal ride-height and moving wheel-area checks across all nine vehicles, and `Tools/verify-spray.ps1` for the six material-specific ejection fixtures. `Tools/verify-ruts.ps1` includes physical bank variation, asymmetric displacement, deterministic replay and actual driven mud/snow tracks. Run native checks serially with the game and editor closed before each run.

Use `Tools/verify-native.ps1 -LockersOnly` for the open/locked climb comparison. Each attempt starts with repaired terrain and the same stock setup, so earlier tire ruts and compaction cannot bias the second attempt.

For a C++-only change after a successful cook, `-Package -SkipCook` rebuilds and stages against existing cooked content. Omit `-SkipCook` after asset or rendering-setting changes. `-SkipExport` reuses existing OBJ sources during material/import work. Generated mesh schema 2 accounts for Unreal's OBJ Y-axis conversion; changing the schema triggers reimport. Material signatures make interrupted imports resumable. The native renderer uses screen-space GI/reflections for its procedural terrain. Source foliage diffuse textures and alpha masks are imported; OBJ vertex-color variation is currently represented by each material's average source tint.

For a narrow C++ iteration against an already accepted asset cook, `Tools/stage-native-code.ps1` builds the game target and copies the matching executable/symbols into the packaged folder, checking executable parity and unchanged package sizes/timestamps. It avoids repeatedly archiving unchanged cooked content. It does not cook assets, update external runtime dependencies, or replace the full packaging workflow after content/configuration changes.

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
| F / L | Available four-wheel high drive / low range; change near a stop |
| Z / U | Rear / front differential lock; stop and select required driveline first |
| Shift + W | Crawl throttle |
| K | Descent assist on supported vehicles |
| + / - | Raise/lower the front pressure target by 2 PSI; equals/numpad-plus and hyphen/numpad-minus are supported |
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

The game opens in the scrollable nine-vehicle garage. Stock plus three upgrade stages across twelve categories are available immediately and saved independently for each vehicle. Drivetrain, differential, portal, EV conversion and tire-air stages retain factory capabilities and describe the current configuration separately from factory-character notes. The Upgrades menu shows actual front/rear PSI, the front target, air-system status and **−2 / +2** and **ROAD PRESSURE** controls. Rear pressure follows the vehicle's axle-pressure ratio. Garage adjustment and vehicle selection service the saved target immediately; installed trail systems change actual pressure over time and pause beyond their operating speed. Seven terrain surfaces use layered photographic textures, normal maps and world-space variation. See [pass 14](docs/expedition-electric-14.md) for current stages and pressure behavior, and the earlier [garage-and-terrain.md](docs/garage-and-terrain.md) for the original integration.

Player-facing measurements use mph, feet/inches, pounds, PSI, horsepower and pounds-force. The new tire-contact and model pass is described in [terrain-interaction-and-models.md](docs/terrain-interaction-and-models.md). Run `Tools/test-core.cmd` for the standalone simulation checks.

Earlier controls and researched refinements for the original six vehicles are described in [vehicle-model-research.md](docs/vehicle-model-research.md). Their regression coverage includes brake input/holding, forward/reverse wheel orientation, Hummer physical ride height, garage camera persistence and separate tire/rim scaling. The current nine-vehicle additions and their separate source/native acceptance boundary are described in [pass 14](docs/expedition-electric-14.md).

See [lighting-tracks-urus.md](docs/lighting-tracks-urus.md) for the original V8 Urus Performante, brake/reverse lights, CC0 scan sources and photographic sky. Vendored native sources are under Vendor/Environment. Run Tools/fetch-environment-assets.py only to recover missing source downloads; normal builds use the included offline copies.

The corrective [surface deformation round](docs/surface-deformation.md) replaces dark off-road tread ribbons with physical grooves, raised shoulders, compacted snow, light dusty dirt trails and bent grass instances. Rubber skidmarks are restricted to pavement traction loss. Backspace repairs terrain, plants and marks. The same document records the inspected Fab library, the downloaded quarry pack and additional free asset candidates.
