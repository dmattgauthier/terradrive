# Native validation — rollover contact and ground disturbance pass 17

The Windows package passes **2,306/2,306 native checks** and **230/230 new portable body-ground checks**. **342 fresh native captures were actually inspected**, each bound by hash to its run. All seven acceptance modes use the same executable and fresh full asset cook. Full uses a 1280×720 test viewport; the other acceptance captures use 1600×900. Evidence was assembled **2026-10-30T02:03:00.562325+00:00**; [native-validation.json](native-validation.json) contains the exact receipts, hashes, observations and limitations.

| Native mode | Passed | Captures reviewed | Highest sampled GPU temperature | Clock |
| --- | ---: | ---: | ---: | --- |
| BodyGround | 469/469 | 78 | 58°C | realTime |
| Rollover | 465/465 | 58 | 56°C | fixed10Hz |
| Movement | 111/111 | 16 | 58°C | fixed20Hz |
| Turning | 572/572 | 20 | 62°C | fixed20Hz |
| Full | 344/344 | 109 | 57°C | pacedFixed20Hz |
| Ruts | 117/117 | 16 | 54°C | realTime |
| Damage | 228/228 | 45 | 56°C | realTime |

## Body friction and settling

The original chassis, bumper and coachwork used the low-friction undertray material even on their sides and roofs. A smooth orientation transition now applies authored ground-specific panel friction. Upright undertray sliding/static values remain **0.10/0.12**. Fully rolled dry-ground sliding values range from **0.32 on snow** to **0.66 on sand**, including **0.48 on pavement**. Static friction is higher, rain reduces grip, and correctly tire-supported inverted loop driving uses the constructed track normal. These values tune the game; they are not measured manufacturer coating data.

The change explicitly updates the live Chaos physics material and welded body shapes. The actual solver resolves collision, tumbling, friction and settling. Velocity is not clamped; aerial drag and automatic braking after legitimate tire-supported recovery are not added. [Implementation and reproduction](body-ground-17.md) describes the contact rules.

The dedicated **39-trial BodyGround** run covers all nine vehicles on left side, right side and roof on pavement, plus Wrangler side/roof drops on dirt, mud, grass, rock, sand and snow. Moving road fixtures seed approximately **18 mph** once, then coast under the actual solver. Checks require real body contact, clearance, disabled overturned drive, supported settling or genuine recovery onto tires, rendered body marks and appropriate physical ground response. The separate **465-check Rollover** regression requires mesh-matched coachwork collision, with 58 observed poses. Movement, full-lock Turning, Full driving/challenges, Ruts and Damage supply fresh regressions for momentum, steering, braking, soil and Free Run behavior.

An initial real-time Rollover run passed **456/465** checks. All 58 recorded clearance minima met the original limit, but nine soft-ground poses collected only **4–7** samples in its short timed window. That failed run is preserved and excluded. The final Rollover run uses a fixed **10 Hz** simulation clock, retaining all 58 poses, the original **eight-sample minimum** and every physical threshold; its minimum observed count is **14** samples per pose. The dedicated BodyGround suite remains real-time. To reproduce this separate regression, launch the packaged executable with `-TerraValidate -TerraRolloverOnly -TerraExpectCoachworkCollision -UseFixedTimeStep -FPS=10`, plus the isolated report/garage/graphics and capture flags used by the native verifiers.

## Same-executable old-friction comparison

These six diagnostic trials restore the old **0.10** panel friction with an automated-test-only option. Their measured travel illustrates the behavior being corrected. Initial conditions and terrain are shared; natural rigid-body contacts can vary between runs. This comparison is excluded from release totals. The BodyGround observation clock caps each delta at **0.1 seconds** to follow the runtime physics budget; on a slow frame it can advance more slowly than wall time. The two-second speeds below refer to that observation clock, and do not establish real-time throughput.

| Vehicle | Pose | Old travel | New travel | Old speed at 2 seconds | New speed at 2 seconds |
| --- | --- | ---: | ---: | ---: | ---: |
| Wrangler | Side | 62.0 ft | 21.2 ft | 12.5 mph | 0.0 mph |
| Wrangler | Roof | 78.2 ft | 19.2 ft | 12.5 mph | 0.0 mph |
| Sprinter | Side | 50.3 ft | 17.1 ft | 6.9 mph | 0.0 mph |
| Sprinter | Roof | 69.4 ft | 17.0 ft | 12.5 mph | 1.6 mph |
| G580 | Side | 85.1 ft | 21.5 ft | 12.5 mph | 0.0 mph |
| G580 | Roof | 68.6 ft | 20.1 ft | 12.3 mph | 0.0 mph |

The old-friction diagnostic passed **73/73** checks. All explicit old-friction expectations passed in this diagnostic run. No universal claim is made that every old-friction trial keeps sliding at the same speed. All **12** diagnostic captures were actually reviewed. A separate normal six-case smoke passed **73/73** checks with **12** reviewed captures; those repeat cases also remain outside the full-matrix totals.

## Ground disturbance and image review

Terrain-body hit positions and normal impulses produce broad, bounded panel contact patches. Duplicate welded notifications are merged, then at most four strongest support patches work the terrain per tick. Soft soil and snow receive physical compaction and low displaced shoulders; firm dirt receives shallow disturbance, and contacted grass plants flatten. Soft surfaces render their actual displaced ground and compaction material, with no painted body-track overlay. Rigid pavement and rock receive pale broken scrape fragments without excavation, using a dedicated project-owned vertex-color material. Tire skid marks retain their separate rubber material.

Actual capture review checked side/roof support, rigid scrape visibility, soft-ground relief, grass disturbance and existing wheel/rut/damage views. Static images complement measured physics; they do not prove continuous animation or frame rate. Earlier candidates are archived and excluded: one had black comb-like marks, and the next still painted parallel lines on dirt. The final soft-ground assertion requires actual rendered depressed/packed terrain vertices and zero overlay geometry. Four earlier pose/grip observation failures were traced to two vehicles recovering before the observation window; the fixture now observes the initial settling drop as well, retaining its stopping, travel and clearance limits. The final rigid-scrape material's unnamed VertexColor output was verified against UE5.8 source, connected with checked editor API results and included in a fresh full cook. No vehicle geometry was changed in this pass.

The new portable checks cover grip transitions, static/dynamic bounds, wet/snow response, finite pressure/area handling, bounded soil layers and rigid no-excavation. They are **230 new checks**; historical pass16 portable/native totals are not added to this pass.

## Exact package and preservation

- Nested executable: `Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe`
- Executable SHA-256: `b362c60160c72b18410d8a789b5143b9e683bbc22b94eec843d68acbf701f9ae`
- Full build/cook completed **2026-10-30T00:43:04.9848515Z**; immutable receipt SHA-256: `55ed80484eb931cedb7fd3f7e83cf99b9221c59f686a8ceb17f899a36fbfa5e5`.
- **140** frozen Source/Tools/Config/project files match the tested producer, alongside **5** package containers. The actual IoStore listing includes the proving-ground map, all **272** imported meshes and `BodyGroundScuff`; Winter Expedition remains absent.
- All **7** extracted NativeData files match their sources. All **275** existing SourceAssets files and **1,214** local browser files are unchanged. No vehicle mesh import/export was needed.
- Current player garage SHA-256: `32b447d985ada225c709e08aaf7748c87843e8d22d6983913d87681e5a45a470`; graphics SHA-256: `7fc551251542fe476e18f213de4614fe4669231df4fb29ab6a87a938c0fd19e0`. Native fixtures used isolated player files and capture paths.
- Public source excludes generated builds/assets, raw acquired Epic/Fab content, reference photographs, captures and player files. The project-owned material is recreated by its published recipe.

Exact private observations remain under `Saved/Pass17-2026-10-29T23-28-17-741257Z/Candidate3`. Launch `Build/Windows/TerraDrive.exe` with its complete Windows folder; the nested executable alone is insufficient.

## Practical limits

Body-ground history is capped at **1,024** patches, divided into 32-patch mesh sections so a new contact rebuilds affected sections. Compaction is bounded by the available height-field layer. Recovery retains disturbance; terrain reset clears it. This is session-local deformation and procedural scrape shading, without persistent map saving or volumetric soil simulation. Vehicle bodies remain the existing procedural approximations. Damage retains solid original collision hulls rather than structural soft-body destruction or detached wheels.

The prior pass15 real-time quarry profile averaged about **3.33 FPS**, with CPU physics dominating. Its profiling runner exited **777003** despite a usable CSV and remains excluded from functional acceptance. This pass did not repeat that profile or establish a performance or PC-crash fix.

One Full attempt was interrupted by the **77°C GPU watchdog**, after 103 captures and before a complete report. Its failed receipt, log, GPU samples and partial captures are preserved and excluded. Installed UE5.8 source confirms that `UseFixedTimeStep` bypasses the normal maximum-frame-rate wait. The accepted Full repeat retains the same **0.05-second simulation step**, executable, asset cook, driver and all check thresholds, using process-scoped Engine configuration `bUseFixedFrameRate=True` and `FixedFrameRate=20.0` instead, with a **1280×720** viewport. Both engine property values are printed and verified in the runtime log. This path retains frame waiting. Driver settings and player graphics files were not changed. The failed 77°C attempt is distinct from the accepted-run temperatures in the table.

All current runs requested a **20 FPS** cap and enforced a **77°C** sampled GPU cutoff. Highest sampled acceptance temperature was **62°C**. Full uses paced fixed 20 Hz; Movement and Turning use the unpaced fixed 20 Hz path; Rollover uses fixed 10 Hz. Synthetic clocks do not establish real-time throughput. BodyGround, Ruts and Damage use real time, with the BodyGround observation-delta limit described above. There was no separate manual/controller session, full-rate endurance test or hardware crash-cause diagnosis. The existing HZB and coarse/fine terrain protections remain; these tests do not establish that every handoff/reset frame is gap-free.
