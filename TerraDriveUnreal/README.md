# Terra Drive native port

Target: Unreal Engine **5.8.3**, Windows x64. The simulation is native C++, with Chaos rigid-body dynamics, native static mesh assets, procedural terrain and instanced tire spray. There is no web view, JavaScript runtime or HTTP server in the native game.

## Build

Install Unreal Engine 5.8, Visual Studio with Desktop/Game Development C++, and a Windows 10/11 SDK. Development here uses UE 5.8.3, VS 2026 MSVC 14.51 and SDK 10.0.26100. Node 24 is needed only to convert the supplied source assets. Unreal's bundled Python runs the editor import script.

From this directory:

```powershell
.\Tools\build-native.ps1 -ImportAssets -Package
```

The current script expects the standard `C:\Program Files\Epic Games\UE_5.8` installation. Pass `-EngineRoot 'D:\YourEngine'` for another installation. Conversion reads the adjacent `TerraDrive-v1.13` folder. Do not substitute an older source ZIP over that updated folder.

Open `TerraDrive.uproject` to edit. Packaged output is under `Build/Windows/`. Generated assets are recreated with `Tools/export-source.mjs` and `Tools/import-assets.py`; `Content/NativeData` must be staged with the game. `UBA_ROOT` is deliberately project-local so the build accelerator does not need to write to ProgramData.

Run editor import and packaging in a normal Windows process context. A restricted process sandbox can make Unreal exit before logging, and UE 5.8 staging writes a temporary `StagedBuild_TerraDrive.ini` under the installed engine's `Intermediate/Build/BuildCookRun` directory. Automation logs stay in `Saved/AutomationLogs`; importer diagnostics are in `Saved/Logs/import-assets.log`. The importer uses forward slashes in the Python script argument and requires a fresh completion marker and saved map. Interrupted mesh imports can be resumed.

The unused Android File Server plugin is explicitly disabled. `Tools/prepare-github.mjs` rejects credential-like configuration values before preparing an upload; do not publish server tokens that Unreal may generate in local settings.

After packaging, launch `Build/Windows/TerraDrive.exe`. Keep the entire `Windows` directory together; the executable requires the adjacent cooked content. To run the native automated driving checks and capture the eight regions:

```powershell
.\Tools\verify-native.ps1
```

The verifier requires a fresh JSON report, a successful game exit, and all 27 checks passing. Its report and game log are in `Saved/Validation`; rendered screenshots are saved by the packaged game in its `TerraDrive/Saved/Screenshots` directory. These checks cover asset loading, acceleration, braking, steering, snow flotation, soil accounting, region spawns, and camera clearance and roll in all eight regions. They do not establish full behavioral parity with the browser reference.

For a C++-only change after a successful cook, `-Package -SkipCook` rebuilds and stages against existing cooked content. Omit `-SkipCook` after asset or rendering-setting changes. `-SkipExport` reuses existing OBJ sources during material/import work. Generated mesh schema 2 accounts for Unreal's OBJ Y-axis conversion; changing the schema triggers reimport. Material signatures make interrupted imports resumable. The native renderer uses screen-space GI/reflections for its procedural terrain. Source foliage diffuse textures and alpha masks are imported; OBJ vertex-color variation is currently represented by each material's average source tint.

## Controls

| Input | Action |
|---|---|
| W / S or arrows | Accelerate / service brake; hold opposite direction at rest to change forward/reverse |
| A / D or arrows | Progressive steering |
| Space | Brake |
| Right mouse + mouse | Orbit camera |
| C | Near/far chase camera |
| 1–8 | Trail, tarmac, rock, mud, marsh, sand, challenge course, snow |
| V | Cycle the five migrated vehicles |
| T | Equip/remove flotation tracks while stopped; Civic excluded |
| F / L | Driveline / low range |
| + / - | Tire pressure |
| X / Q | Attach/detach nearest standing-tree anchor / reel winch |
| Tab | Field garage |
| E / H in garage | Engine stage / suspension lift |
| P | Dry/rain response |
| R | Recover at current region |
| Backspace | Repair/reset deformed soil |
| Esc | Quit |

Gamepad left stick steers, right trigger drives, left trigger and bottom face button brake.

This is a migration preview. Browser regression results are reference evidence, not proof of native parity. See `docs/validation-native.md` for observed native results and remaining limits.
