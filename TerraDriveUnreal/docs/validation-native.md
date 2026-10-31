# Native validation — bounded-error rollover collision

The final Windows executable passes **1,962/1,962 fresh native checks**: **1,916 functional checks** plus **46 real-time performance/collider checks**. **136 new portable collider checks** also pass. **345 fresh captures were actually viewed**. All accepted native processes exit 0 and bind the same executable and immutable code-stage receipt. Evidence was assembled **2026-10-31T04:54:29.177563+00:00**; [native-validation.json](native-validation.json) records exact hashes. The [rollover performance guide](rollover-performance-20.md) explains the root cause, adaptive representation, measurements and limitations.

| Native mode | Passed | Captures reviewed | Clock | Highest sampled GPU temperature |
| --- | ---: | ---: | --- | ---: |
| Rollover | 523/523 | 58 | realTime | 58°C |
| BodyGround | 469/469 | 78 | realTime | 60°C |
| Damage | 228/228 | 45 | realTime | 60°C |
| Ruts | 117/117 | 16 | realTime | 61°C |
| Movement | 111/111 | 16 | fixed20Hz | 70°C |
| Interface | 124/124 | 23 | realTime | 64°C |
| Full | 344/344 | 109 | pacedFixed20Hz | 61°C |
| Saved-build rollover/collider benchmark | 46/46 | 0 | realTime | 57°C |

## Coverage

The complete rollover matrix measures actual frame intervals in 58 side/roof/oblique poses across all nine vehicles on dirt and tarmac. The recorded averages are **18.87–20.02 FPS** at a 20 FPS cap. It retains all 465 original physical checks, including clearance within the existing 1.6-inch penetration allowance, 12 welded body hulls per vehicle, mass/center of mass, finite motion, disabled tire power while overturned and normal recovery. The matched prior dense-collision run has 8 frame-budget failures; the final adaptive run has 0.

The upgraded EarthCruiser benchmark independently measures freely settled upright, side and roof poses at three locations, averaging **19.64–20.00 FPS**. Mean and 95th-percentile frames remain below 100 ms. Actual installed terrain collision triangle counts are lower than the retained fine display meshes, and the conservative height-error bound remains below 0.197 inch. The portable test separately checks watertight geometry and the accuracy of interpolation/refinement, including nonplanar saddle cases.

BodyGround covers body friction and impressions across surfaces; Damage covers visible/mechanical damage and free run; Ruts covers terrain displacement and response; Movement covers braking, momentum, transitions and recovery. Interface covers the status cards, current controls, pause/graphics/controls menus and center-differential rows. Full covers the complete vehicle/challenge fixture. Movement and Full use the clocks listed above; their functional results do not establish real-time throughput.

## Exact stage and preservation

- Executable SHA-256: `ad06fb0cb70dd30825481fd01517aa163554e5e4775c87cbdc9c56020849eee4`.
- Immutable code-stage receipt SHA-256: `9606c701e3925ae3e3aed999e33ad07c37b7cd8a5dcaf820b32a90ff87465880`.
- Parent full asset-cook receipt SHA-256: `f0218b91bd3f24644ca18c442a85a7715b0292145459ced5639206b17cc3ef9b`. Native code is newly compiled and staged over the accepted existing cooked assets; no fresh asset import/full cook is claimed.
- **158** frozen Source/Tools/Config/project files match the tested candidate. All **five** package containers, **seven** NativeData files, **275** SourceAssets files and **1,214** local browser files remain byte-identical to the checkpoint.
- **147** current named player settings/existing engine INI files remain unchanged. Fixtures use separate paths and a read-only checkpoint copy of the garage.
- ProvingGround, **272 meshes**, **108 vehicle body hulls** and the original fine terrain/tire data are retained. Runtime terrain collision triangulation is new and uses a 0.197-inch vertical budget. Retired Winter Expedition remains absent.

Previous 1,127 portable checks, vehicle geometry/import checks and earlier native counts remain historical and are excluded. Two partial performance candidates each retained 8 new frame-budget failures and were rejected; their raw evidence remains unchanged. Other diagnostic counts are excluded, including trace-shutdown failures and the preliminary focused run with a stale receipt binding.

Private evidence: `Saved/Pass20-2026-10-31T02-30-08Z/Final3`. Source publication excludes generated builds, Content, Saved, SourceAssets, acquired Epic/Fab packs, reference photos and player files. Launch `Build/Windows/TerraDrive.exe` with its complete Windows folder.

## Practical limits

Tests are controlled offscreen fixtures with actual static-image review; no desktop input or manual/controller session was used. The requested render cap was 20 FPS, with a 77°C sampled cutoff; the highest sampled accepted GPU temperature was **70°C**. No uncapped endurance or PC-crash/hardware-temperature guarantee is claimed. The previous real-time quarry profile around 3.33 FPS was not repeated. Source-only publication requires a separate complete remote tree/ref readback and preservation audit.
