# Native validation — driving interface and center differential update

The updated Windows executable passes **2,057/2,057 native checks** across seven modes. **245 fresh captures were actually reviewed**, including the interface at 1600×900 and 1280×720. All accepted runs bind the same executable and immutable code-stage receipt. Final evidence was assembled **2026-10-31T02:15:02.322550+00:00**; [native-validation.json](native-validation.json) records the individual report, review and preservation hashes.

| Native mode | Passed | Captures reviewed | Simulation clock | Highest sampled GPU temperature |
| --- | ---: | ---: | --- | ---: |
| Interface | 124/124 | 23 | realTime | 50°C |
| Interface720 | 124/124 | 23 | realTime | 51°C |
| Mechanical | 502/502 | 18 | realTime | 54°C |
| ElectricPressure | 280/280 | 36 | realTime | 54°C |
| Turning | 572/572 | 20 | fixed20Hz | 60°C |
| Movement | 111/111 | 16 | fixed20Hz | 60°C |
| Full | 344/344 | 109 | pacedFixed20Hz | 55°C |

## What was verified

The [interface and controls guide](interface-controls-19.md) explains the top status cards, actual key labels, pause menu, 33 editable primary controls, graphics settings and center-lock upgrade. Native interface fixtures inspect all nine stock vehicles, a converted Civic with front/center/rear lockers, independent-motor EV compatibility, and the G63's existing factory center lock. They exercise actual Slate key capture, cancellation, conflicts, saved-layout round trips, invalid-data rejection, graphics settings and the separate compatible/incompatible upgrade rows. The rows are scrolled into view and their real stage-button availability is checked.

Pause checks preserve the vehicle's physical state rather than replacing its physics body or resetting its velocity. They compare every sample over a fully paused interval: maximum position drift stays within 0.01 cm and velocity drift within 0.01 cm/s, with strict rotation, world-time and challenge-time checks. The request-frame and first-fully-paused-frame values are logged separately. Resume, garage entry and the explicit exit action are exercised without allowing the automated exit check to terminate evidence collection.

The center differential uses the existing tire/axle solver to couple front and rear shaft motion within the fitted hardware's torque limit. Open and locked cases, engagement restrictions, factory equipment, conversion compatibility and older garage saves are tested. Mechanical, ElectricPressure, Turning, Movement and Full provide the drivetrain, pressure, full-lock wheel motion, braking/momentum, garage, lamps and challenge regressions on this executable.

**1,127 portable checks** pass: **179 center drivetrain**, **648 core**, and **300 electric/pressure** checks. Body-ground portable tests were not rerun in this update. Geometry/packaging validation from the preceding vehicle pass is retained as historical evidence for the unchanged asset set; those validators were not rerun and their counts are not added to this update. Historical native or visual counts are also excluded. The [previous model craft pass](reference-coachwork-18.md) remains the reference for the preserved nine-vehicle geometry.

## Executable stage and preserved assets

- Executable SHA-256: `32c7303abc1991456190cb8b2e2571f8f2cbbf9b95251d071518716089b1a98a`.
- Immutable code-stage receipt SHA-256: `2527db56626aedea96deab77e7bfae8d2726395eb538bb62d2ad3db03c26d278`.
- Parent full asset-cook receipt SHA-256: `f0218b91bd3f24644ca18c442a85a7715b0292145459ced5639206b17cc3ef9b`. This update compiles and stages native code over the existing accepted cooked assets; it does not claim a fresh asset import or full cook.
- All **153** frozen Source/Tools/Config/project producers match the tested candidate. The **five** cooked package containers and **seven** NativeData files are byte-identical to the checkpoint.
- All **275** SourceAssets files and **1,214** local browser files remain unchanged. All nine vehicle models and acquired terrain/scenery assets are retained. The current garage and graphics files are preserved; fixtures use isolated settings paths.
- The retained package includes ProvingGround, **272 meshes**, **108 coachwork hulls** and the existing body-scrape material. Retired Winter Expedition remains absent.

An initial interface candidate retained two failed pause assertions because its baseline was taken inside an already-started unpaused physics frame. Unreal completes that frame before entering its paused tick path. The corrected fixture logs that boundary and retains the strict drift criteria across the subsequent fully paused interval; it does not hide movement by resetting the vehicle. A later numerical pass was visually rejected because the center-upgrade row had not actually scrolled into view. A subsequent explicit viewport assertion exposed the dynamic-layout timing problem too. The corrected garage defers its bounded scroll until layout is available; final fixtures verify the actual viewport position and review the corresponding rows at both resolutions. Rejected results and images are excluded from acceptance totals.

The next candidate exposed a real G63 single-motor conversion bug: inherited factory AWD forced the front axle on despite selecting rear drive. The conversion now supports rear drive and selectable four-wheel drive while retaining its compatible center lock. The topology assertion checks both selections. The two cooked trail hints that named default crawl/throttle and descent-assist keys now resolve the current bindings without changing the terrain data, with two additional native interface assertions at each resolution.

Exact private evidence is under `Saved/Pass19-2026-10-31T00-24-11Z/Candidate6`. Generated builds, Content, SourceAssets, Saved evidence, raw Epic/Fab content, reference photographs and player settings are excluded from the source upload. Launch `Build/Windows/TerraDrive.exe` with its complete Windows folder.

## Practical limits

These are controlled offscreen native fixtures with actual static-image review. Fixed-clock checks establish behavior under their recorded conditions, not real-time throughput. The runs requested a 20 FPS rendering cap and used a 77°C sampled GPU cutoff; the highest sampled acceptance temperature was **60°C**.

The prior real-time quarry CPU-physics bottleneck of about **3.33 FPS** remains unresolved and was not reprofiled here. This update makes no manual/controller-session, full-rate endurance, PC-crash-fix or hardware-temperature guarantee. No driver or saved player graphics setting was changed during verification. Models remain procedural reference approximations, and terrain deformation retains its existing bounded session-local implementation.
