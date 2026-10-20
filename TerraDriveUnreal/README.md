# Terra Drive native port

Target: Unreal Engine **5.8.3**, Windows x64. The simulation is native C++, with Chaos rigid-body dynamics, native static mesh assets, procedural terrain and instanced tire spray. There is no web view, JavaScript runtime or HTTP server in the native game.

## Build

Install Unreal Engine 5.8, Visual Studio with Desktop/Game Development C++, and a Windows 10/11 SDK. Development here uses UE 5.8.3, VS 2026 MSVC 14.51 and SDK 10.0.26100. Node 24 is needed only to convert the supplied source assets. Unreal's bundled Python runs the editor import script.

From this directory:

```powershell
.\Tools\build-native.ps1 -ImportAssets -Package
```

The current script expects the standard `C:\Program Files\Epic Games\UE_5.8` installation. Adjust `engineRoot` if necessary. Conversion reads the adjacent `TerraDrive-v1.13` folder. Do not substitute an older source ZIP over that updated folder.

Open `TerraDrive.uproject` to edit. Packaged output is under `Build/Windows/`. Generated assets are recreated with `Tools/export-source.mjs` and `Tools/import-assets.py`; `Content/NativeData` must be staged with the game. `UBA_ROOT` is deliberately project-local so the build accelerator does not need to write to ProgramData.

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

This is a migration preview. Browser regression results are reference evidence, not proof of native parity. The native build and gameplay validation report will be recorded in `docs/validation-native.md`.
