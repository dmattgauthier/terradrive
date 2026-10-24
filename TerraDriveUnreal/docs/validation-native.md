# Native model and rut validation

Verified October 24, 2026 at 12:18 AM America/New_York (2026-10-24T04:18:03.772Z), Unreal Engine 5.8.3, Windows Development, DX12 SM6, RTX 4060 Laptop GPU. Launch `Build/Windows/TerraDrive.exe` with its complete Windows folder. This is the current model and rut acceptance; earlier reports remain historical evidence.

Current executable SHA-256: `f4aeb5e4d05f23647a25bea5361c3654eb12335ba60fcc87e527df2a6edda446`. Native code stage: `Saved/models-ruts-code-5.log`, SHA-256 `46ce1927c3a0233aca91a593d541855df970b3d2bfe304032e712454480a7c99`, completed 2026-10-24T03:54:29.4307177Z. Its receipt verifies that the compiled and packaged executables match.

The reused full asset cook is `Saved/models-ruts-build-2.log`, SHA-256 `3fae99dd9baec0b3e91fc9680442ad485e603338587ea81963c58b5b7455d65b`. Its original producing executable was `80a9013a24fc6a044924cc0803ab9c6288a162227a94789af602376a029e1ce3`; that producer is retained as asset provenance and is superseded for runtime acceptance. All 5 package files retain their pre-stage SHA-256, size and timestamp. Asset recipes, configuration and native data remain matched to the asset baseline. The separate native code stage does not claim to have recooked those assets.

| Native check | Passed | Process exit |
|---|---:|---:|
| Full | 287/287 | 0 |
| Ruts | 101/101 | 0 |
| Art | 42/42 | 0 |
| Movement | 84/84 | 0 |
| Detail | 15/15 | 0 |
| Winter | 46/46 | 0 |
| Transitions | 53/53 | 0 |
| Cool | 16/16 | 0 |
| Balanced | 16/16 | 0 |
| QualitySmoke | 16/16 | 0 |

Every listed native report starts after the accepted native code stage and final source freeze, belongs to the current executable and contains only passing cases. Source, tool and configuration fingerprints remained unchanged through acceptance. The independent core passes **382/382**. All six source geometry audits pass; the separate Urus panel audit covers 1,134 intake rays and 90 bonnet probes with zero painted intrusions. These source probes complement the rendered review rather than establishing visual quality by themselves.

The review records identify **116 unique current PNGs** by hash. Vehicle reviewers compare all six stock bodies with the prior native views and retained manufacturer references. The repaired Urus bonnet and intakes, HUMMER rear frame and satin skid, Civic mesh/bumper and Sprinter/SUV surfaces are visible in the final native images. Rejected candidates include visible art defects and actual-driving rut failures that earlier focused checks did not expose. Their original reports, failures and captures remain separate in the diagnostic history; they are not relabeled as final acceptance.

## Controlled rolling profiles

The 101-case rut suite combines 85 controlled profile checks with 16 actual mud/snow driving checks. The controlled profiles are two synthetic straight tire paths approximately 19.7 feet long, using a 12.6-inch-wide footprint at about 4.5 mph and 1,236 pounds-force per tire. They establish physical shape, continuity, bounded shoulders, repeated contact, repair and volume accounting. They are separate from the actual driven-vehicle soil passes in the full suite.

| Surface | Maximum groove depth, inches | Maximum side bank, inches |
|---|---:|---:|
| firm dirt | 0.11 | 0.02 |
| mud | 1.54 | 0.96 |
| snow | 2.03 | 0.75 |
| wet grass | 2.05 | 1.14 |
| sand | 1.20 | 0.69 |
| loose dirt | 1.13 | 0.68 |

All six paths retain continuous physical grooves, appropriate packing, smooth longitudinal profiles, finite wall slopes and accounted excavation. Rock and pavement do not excavate; no off-road rubber geometry is added. Actual full-suite vehicle passes separately exercise firm/loose dirt, mud, snow, wetland and sand, plant crushing, persistent/cached soil and repair.

## Actual motor-driven mud and snow

A stock Jeep drives each pure, gentle and unobstructed mud/snow corridor using the normal motor and wheel/soil simulation, 20% throttle, 24 PSI, 4WD low range and both axle lockers. After initial placement and settling, the driving phase lasts up to 16 seconds of simulation time, ending earlier at 32.8 feet of displacement, then brakes. It requires at least **19.7 feet of signed forward progress** and less than 9.8 inches of rollback. The driving phase uses no teleport, velocity reset, winch, recovery or synthetic deformation stamps.

Both rear tire trails must provide eligible forward profiles, more than 90% depressed coverage, bounded depth and bank slopes, smooth longitudinal samples and accounted soil volume. Profiles begin beyond the initial wheelbase; a turning-back or ineligible trail fails rather than being replaced by convenient samples. These 16 checks complement the six controlled profiles and the actual driven-soil passes in the full suite.

| Actual surface | Signed forward progress, feet | Maximum groove depth, inches | Maximum side bank, inches | Rear-trail coverage |
|---|---:|---:|---:|---:|
| mud | 32.8 | 1.81 | 0.83 | 100.0% |
| snow | 32.8 | 1.55 | 0.49 | 100.0% |

The movement suite crosses seven real coverage boundaries without throttle or braking, drives all six stock vehicles over a rounded 5.5-inch rise and brakes afterward, and checks a real solid barrier. Lower coachwork clearance uses 337 points selected from the actual current model vertices. The full driving suite retains the original braking, reverse, locker, upgrade, rollover, ground-contact and continuous 20-gate Slate Rim requirements. These are sampled fixtures and routes rather than proof of every triangle or hill.

## Rendering and thermal scope

Art and rut captures use the Quality preset at a 20 FPS test cap and 1600 × 900 output. Full driving uses 1280 × 720 output; movement/detail/winter use 1600 × 900, and transitions/preset samples use 1920 × 1080. PNG dimensions are checked from their headers. Output resolution and the preset's internal rendering scale are distinct.

The full capped run recorded a maximum 59°C, mean 28.5% GPU utilization and 9.2 W over 367 observations. Short monitored Cool/Balanced/Quality-smoke runs peaked at 64/69/66°C. Quality smoke uses a 20 FPS cap; it is not a 60 FPS endurance result. All wrappers retain a 77°C cutoff. These short automated sessions do not establish long-session stability or explain the prior PC reboots.

All 1,214 local browser hashes match the preserved baseline; publication also preserves all 189 browser files and 86 prior binary assets. The player's current garage and Quality graphics preference are unchanged. Original `IceRoad`, `IceRoad_Lighting` and source `terrain.bin` hashes match. No separate manual/controller play session is claimed.

The bodies remain reference reconstructions below production racing-game precision, especially in interiors, small trim, lighting optics and fine surface matching. Rut shoulders are a bounded height field; tread detail is filtered shading rather than exact physical lug geometry or granular/liquid simulation. The authored Winter Expedition landscape and road remain static. Physical excavation applies to the proving ground, including its snow region.

The exact current tests, source/package/report hashes, review records and monitored samples are in [native-validation.json](native-validation.json). Feature details are in [model-refinement-8.md](model-refinement-8.md), [suv-refinement-8.md](suv-refinement-8.md) and [rut-refinement.md](rut-refinement.md).
