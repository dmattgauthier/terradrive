# Native validation — expedition, electric drive and tire air pass 14

The current Windows package is verified. Unreal Engine 5.8.3 compiled, imported, fully cooked and packaged this round. **2,087/2,087 native checks** across fourteen modes, **1,393/1,393 portable checks**, and actual review of **279 fresh native PNGs** belong to the same executable and accepted asset cook.

The garage contains **nine vehicles and twelve upgrade categories**. The additions are the reference-built EarthCruiser EXP, Mercedes-Benz G 580 with EQ Technology and Mercedes-AMG G 63. Factory HUMMER EV three-motor and G 580 four-motor layouts remain distinct from the fictional single/dual/quad conversion kits. Original procedural geometry and calibrated game physics remain approximations.

| Native mode | Passed | Highest sampled GPU temperature |
| --- | ---: | ---: |
| ElectricPressure | 245/245 | 63°C |
| Mechanical | 500/500 | 62°C |
| Spray | 44/44 | 60°C |
| Full | 344/344 | 64°C |
| Ruts | 117/117 | 65°C |
| Art | 99/99 | 64°C |
| Rollover | 465/465 | 62°C |
| Movement | 111/111 | 71°C |
| Detail | 15/15 | 55°C |
| Winter | 46/46 | 57°C |
| Transitions | 53/53 | 56°C |
| Cool | 16/16 | 63°C |
| Balanced | 16/16 | 66°C |
| QualitySmoke | 16/16 | 63°C |

Native run interval: **2026-10-28T01:09:52.692Z to 2026-10-28T01:58:44.691Z**. Final evidence was assembled at **2026-10-28T02:00:50.631Z**. The portable suites comprise **480 simulation**, **265 electric/pressure** and **648 spray-response** checks; their source dependencies and compiled-program hashes are recorded in the machine-readable evidence.

## Electric drive, pressure and persistence

The 245-check ElectricPressure mode inspects all **36 factory/conversion configurations** (nine vehicles × four stages), loaded assets, real Chaos mass, supported settling, driven wheels and restoration of factory output/mass. Native save checks retain nine independent pressure and battery states and all twelve category slots; malformed legacy data reject atomically. These checks use isolated fixture/user storage and preserve the six monitored ordinary settings files.

The HUMMER SUV now uses a **170 kWh C/3-rated simulation energy basis**, replacing the erroneous 212 kWh assumption. GMC's [MY2024 SUV brochure, pages 8 and 15](https://www.gmc.com/content/dam/gmc/na/us/english/index/about/download-brochures/2024-models/GMTH23CT000-2024-HUMMER-EV-SUV-FO-031924.pdf) identifies its 20-module pack; GM's [MY2025 EPA application, PDF page 18](https://dis.epa.gov/otaqpub/display_file.jsp?docid=61422&flag=1) rates that module count at 170 kWh at C/3. Applying that rated basis to the MY2024 configuration is an inference, not an established MY2024 usable/net/gross capacity. Native factory checks independently require HUMMER 170 kWh and G 580 116 kWh. The correction changes the simulated energy clock and estimated replacement donor mass; stock operating mass, power and torque remain unchanged. The donor-pack mass still uses a generic 185 Wh/kg estimate, not a measured HUMMER pack weight.

Three installed air stages change actual pressure while the vehicle moves. Target requests, loaded minimum/maximum bounds, speed and power interlocks, volume scaling and garage service are tested separately. The observed deflation samples were:

| Air stage | Elapsed time | Actual drop | Expected volume-scaled drop | Moving frames |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1.300 sec | 0.300 PSI | 0.300 PSI | 26 |
| 2 | 1.300 sec | 0.524 PSI | 0.524 PSI | 26 |
| 3 | 1.300 sec | 0.899 PSI | 0.899 PSI | 26 |

The Civic's three conversion stages and the three new factory vehicles complete real launch, steering, lift-off and service-brake trials. Factory gasoline vehicles show no electrical generation; the electric configurations show lift-off generation. Portable tests separately cover power/RPM conservation, battery energy limits and low-speed regenerative fade. This is a bounded battery/regen model, not a cell, thermal-management or real retrofit simulation.

Matched Civic road braking starts at **26.8 mph**. At 33.0 versus 16.5 PSI, stopping distance is **24.56 versus 28.64 feet**: **16.6% longer** when aired down. Both stop with four loaded contacts and no scenery impacts. The matched **17.9 mph** steering entry uses a 1.2-second input: yaw is **18.924° versus 14.429°**, a **23.8% lower** response at half pressure. These are controlled game measurements, not tire safety advice.

The paired stock-Jeep sand trials use the same natural, unobstructed lane, mass, 5.59 mph rolling entry and bounded throttle controller. Measurements cover the common **13.12–26.25 foot** path window, with **66 spatial samples per pass**, and require travel beyond 34.45 feet. Forces and vehicle motion remain live after the initial rolling setup.

| Sand trial | PSI | Mean carcass patch | Mean tire load | Mean speed | Maximum retained rut | Rut coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Placard | 37 | 3.937 in | 1120.2 lbf | 4.46 mph | 1.214 in | 100% |
| Aired down | 20 | 4.977 in | 1116.9 lbf | 4.35 mph | 1.217 in | 100% |

The measured carcass patch grows **26.4%** at reduced pressure, with matched load/speed tolerances and zero object or terrain body impacts. Both paths remain bounded and conserve displaced/compacted soil volume. The accepted rolling contact arc can dominate the pressure patch, so this result does **not** establish a large rut-depth reduction. The dry-rut water correction keeps a zero source water depth dry instead of inventing a water plane at the former surface; native sand profiles reject unintended standing water. Existing genuinely wet ground still deepens its water layer as soil is excavated.

Pressure grip, squirm, steering stiffness, rolling loss, loaded target bounds and air rates are calibrated game estimates, not manufacturer load/inflation tables. Garage selection and resume provide a stationary tire service; trail hardware changes actual pressure at a finite rate. Conversion output, battery/donor mass and packaging are fictional simulator choices. A factory EV replacement removes its estimated original traction hardware rather than stacking another complete battery on top.

## Vehicles, terrain and rendered inspection

The review includes **90 model views**, **58 observed rollover/drop poses**, **18 stock/portal hardware images**, **21 electric/pressure images**, plus native terrain, ruts, movement, Winter Expedition, Full and preset frames. Every requested rollover pose was actually observed. Nine source bodies, actual custom rims, glazing and coachwork support remain covered; the separate new-expedition source suite has **88 checks**. The Mercedes rear header repair fills the diagnostic roof slit while a separate **89-check private source comparison** retains every prior mesh and exact overall bounds. Native capture review remains separate from those source checks.

All six legacy body OBJ files are byte-identical to the pre-pass checkpoint; this round adds three original bodies rather than remodelling the previous six. Shapes, interiors, fine optics, surfacing and mechanical assemblies remain procedural approximations below OEM CAD or production racing-game/Forza fidelity. Mechanical visuals are not a separate solved linkage simulation. The menu, configured previews and pressure/powertrain readouts appear in the reviewed native captures; there is no claim of a separate manual/controller play session.

The earlier isolated cook3 desktop inspection covered the expanded vehicle list, upgrade categories and conversion choices. The user stopped Computer Use with Escape when the optional cook4 desktop recheck began. Desktop interaction stopped at that point; the second isolated UI script was not launched. The final acceptance uses cook4 automated driving trials and actual rendered capture review. A separate final-cook interactive check of the garage pressure buttons is not claimed.

Full, Movement, Ruts, Mechanical, Spray and Rollover retain driving/contact, braking/reverse, stock/tuned hardware, soil accounting, material-specific ejection and recovery coverage for the expanded roster. The acquired Winter Expedition remains complete, with four short start/drive trials and internal-road-join queries. The whole road has not been driven continuously by this acceptance suite. Its authored landscape/road stay static; physical excavation remains the proving ground's bounded height field. Tire debris is a short-lived visual effect, not persistent loose rigid-body terrain.

## Exact package and preservation

Executable: `Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe`

Executable SHA-256: `aae82881c70ab24caa54dde45f7182e99c2f25ca417ae1c6c4444beee893a15e`

Accepted complete asset cook: **iteration 4**, completed **2026-10-28T01:08:16.3762976Z**. Log: `Saved/expedition14-build-4.log`.

Cook log SHA-256: `fff14cbc63e3e34db5a47c52433155e6bb3f7ab59afbea80c21df027cad8466c`

The compiled and staged executable bytes match. The accepted cook binds **272 source-derived meshes**, **108 body convex sections**, **eight NativeData files**, **five package containers** and **120 frozen Source/Tools/Config files**. Extracted packaged NativeData match the recorded source bytes. Reports and reviewed captures follow this producer; superseded diagnostics and the pre-header candidate are excluded from acceptance.

All **1,214 local browser files**, current player garage/graphics settings, original terrain data and both protected original Winter Scene maps match the fresh checkpoint. No older saves were restored. The source publication inventory preserves the previously approved 189 browser entries and 86 binary entries. Generated builds/UAssets, raw acquired Epic/Fab packs, manufacturer reference photos and private app/player files are excluded from publication.

## GPU scope and limits

There are **1824 recorded GPU samples** across the fourteen modes. The highest sampled temperature is **71°C**; Full averages **33.35% GPU utilization** and **11.07 W**, with a **64°C** peak. Driving, art, soil and QualitySmoke use a **20 FPS test cap**; brief Cool/Balanced runs exercise their 30/45 FPS settings. Every native wrapper retains the **77°C cutoff**. These short capped runs and static image reviews do not establish normal 60 FPS endurance, long-session thermal stability, or the cause of a PC crash/reboot.

Machine-readable evidence: [native-validation.json](native-validation.json). Implementation, controls and approximation boundaries: [pass 14](expedition-electric-14.md), [electric/pressure research](electric-pressure-research.md), [EarthCruiser research](earthcruiser-exp-research.md), [Mercedes research](mercedes-gclass-research.md). Prior pass-13 evidence is historical at [commit 62f17be](https://github.com/dmattgauthier/terradrive/blob/62f17be6595f7496f56b064747e0ad7e79201611/TerraDriveUnreal/docs/validation-native.md); its executable, counts and captures must not be substituted for this round.
