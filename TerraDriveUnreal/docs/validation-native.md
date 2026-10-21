# Native migration validation

Verified October 20, 2026 with Unreal Engine 5.8.3 on Windows x64, DirectX 12 SM6 and NVIDIA GeForce RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` and keep the complete Windows folder together.

## Recorded results

| Check | Result |
|---|---|
| Editor/game compilation and packaging | Successful; full cook followed by code-only rebuilds/staging against that cook |
| Packaged native game | All 55 checks passed with a fresh report and successful process exit |
| Shared C++ core | 24 checks passed: finite support reach, differential torque transfer, tire integration, friction budget, flotation and direction gating |
| Export/import | 144 mesh sources, 295 materials, nine textures, nine regions, eight challenge routes and 412 trees; mesh schema 2 |
| Terrain conversion | 1,000 height/water/surface samples plus zone references passed; maximum height conversion error 0.00000190735 m |
| Roof-down input | Zero tire drive force; 0.0916 cm horizontal drift during the stationary roof test; upright camera horizon and positive terrain clearance |
| Airborne input | No tire force or artificial horizontal/yaw control |
| Debris | 430 emitted, 403 expired and 27 still rendered at the driving sample; zero live/rendered particles after stopping |
| Locked axle climb | 8.746 m progress open versus 10.081 m locked under the same throttle and duration; shaft-speed coupling passed |
| Low range | Engine drive cuts near redline; the driving regression stayed below 7,000 rpm |
| Descent assist | 2.788 m/s at the recorded downhill sample |
| Summit park | Five real collision probes around the loop, including its ceiling; no hidden support across the jump gap; an inverted vehicle retained wheel support |
| Cameras/routes | All eight original region camera checks, eight stable challenge spawns, rollover camera clearance and inverted-loop camera line of sight passed |
| Live keyboard check | 7 Summit park, 9 Granite Trials, L low range, Z rear locker, U front locker, K descent assist, J next route, R restart, Escape exit |
| Browser preservation | All 189 preserved browser files match their recorded Git blob hashes; none were edited |

Native acceleration traveled 55.182 m and reached 18.766 m/s; braking stopped the vehicle. EV steering reached 14.897 m/s with 91.293 degrees of yaw. These are regression scenarios, not calibrated real-world performance measurements.

The machine-readable report and executable/source hashes are in [native-validation.json](native-validation.json). Export checks are in [export-validation.json](export-validation.json); browser hashes are in [browser-source-sha1.json](browser-source-sha1.json).

## Changes verified

Suspension contacts now require finite travel and a surface facing the tire. A roof-down vehicle cannot obtain invented grip from ground behind its suspension. The cabin has a physical roof collider. Legitimate ceiling contact inside the loop remains supported.

Moving debris uses persistent world-space instances, gravity, drag, impact removal and short lifetimes. Permanent spheres behind the tires were removed. Detailed terrain updates reuse collision/render vertices instead of repeatedly recooking bodies.

The full source Summit park is exported with an exposed-surface collision mesh. Granite Trials adds alternating axle-lift ledges, a steep staircase, an off-camber ridge and a controlled descent. Low range, supported front/rear lockers, axle shaft coupling, crawl throttle, engine rev limiting and descent assistance affect the native simulation. The full-loop route requires its ceiling checkpoint before the exit gate.

Conventional dynamic shadows avoid the virtual-shadow marking overflow from large non-Nanite course meshes. The camera uses an upright horizon, a world-height pivot after a rollover and a shorter inside-loop view. Soft ground-bounce lighting improves underside readability. Final runtime logs contain no fatal/error entries or VSM overflow. Existing non-fatal notices concern deprecated SSGI and unused Enhanced Input user settings; keyboard handling is native.

## Reproduce

From the native project directory, in a normal Windows process context:

```powershell
.\Tools\build-native.ps1 -ImportAssets -Package
.\Tools\verify-native.ps1
```

The verifier rejects stale reports, failed checks and unsuccessful process exits. The importer uses forward-slash Python arguments, resumable material signatures and schema metadata. Asset or rendering changes require a fresh cook; code-only changes may reuse the successful cook with -SkipCook. Logs and local reports remain under Saved/Validation, Saved/AutomationLogs and Saved/Logs. Captures are in Build/Windows/TerraDrive/Saved/Screenshots.

Generated assets, Windows packages, logs and private application configuration are excluded from GitHub. The unused Android File Server plugin is disabled and upload preparation rejects credential-like configuration values.

## Practical limits

This remains a playable migration preview. Full browser 1.15 parity, factory-accurate driveline/safety interlocks, detailed deformation, setup persistence, tree calibration and track belt animation are not established. The courses are competition-inspired exercises, not an official event/rules replica. The tests verify collision, driving behavior and route starts; they do not establish an uninterrupted completion of every course or a complete full-speed loop traversal.

Browser procedural shaders and canvas sign lettering are not reproduced; some signs remain blank. Material vertex variation is represented by mean tints, and lighting/terrain appearance remains approximate. Gamepad hardware testing, frame-rate benchmarking and long-session stability are not complete. Historical browser tests are reference evidence; this work preserves the browser rather than claiming a new full browser-suite pass.
