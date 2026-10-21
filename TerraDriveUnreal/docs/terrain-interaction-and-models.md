# Imperial displays, terrain interaction and model update

The game displays speed in mph, small lengths in inches, larger distances in feet, weight in pounds and winch force in pounds-force. Tire pressure stays in PSI and power in horsepower. The simulation, engine geometry and explicitly labeled diagnostic JSON fields retain SI units internally; conversion happens at the display boundary.

## Terrain interaction

Tires sample a circular rolling envelope at three positions across the tread width. The closest valid support bridges a small rut or meets a bump before the axle passes over it. Finite suspension limits and normal checks still prevent roof-down and airborne driving. Rigid-surface contacts outside the actual tread width are rejected, so a tire cannot borrow grip from a rock beside it. Constructed surfaces, trunks and logs remain rigid supports and do not excavate the ground below them.

Pressure changes the actual contact length used for soil deformation and alters loose-ground grip. Airing down trades road precision and rolling efficiency for a larger footprint. Tracks keep their longer contact patch. These are simulator tuning choices rather than real-vehicle pressure guidance.

The wheel solver limits reaction torque to available combined tire grip, allowing excess torque to produce wheelspin. Locked axles solve a common shaft speed against both tires' limited contacts. Combustion drive torque is capped against the next wheel-speed solution at engine redline, preventing powered low-range wheelspin from overshooting the limiter. Load sensitivity, loose-soil churning, packed soil and standing water affect available friction. Friction velocity is sampled at the ground contact while suspension damping uses mount velocity.

Rut depth adds bulldozing resistance. Compaction reduces that resistance on repeated passes. Area-weighted soil cells preserve short contact footprints as they move between grid nodes. Deforming tiles share border samples, removing the old undeformed strips at tile edges. Displaced/compacted volume is still accounted for once per owned soil node. The terrain material uses packing to darken compressed tracks.

## Models

Nineteen additional mesh sources provide vehicle armor, recovery/sport equipment, coil and air struts, four irregular boulder shapes, detailed deadwood, shrubs with thin curved leaves, and marsh reeds. Native model generation lives in Tools/native-models.mjs. The original browser models and source assets remain unchanged.

Twenty live suspension components show dampers, pistons, springs/control arms and solid axles where appropriate. Their positions follow wheel travel and steering. Body/frame upgrades reveal belly protection and tubular rock sliders. Electrical upgrades reveal an off-road fairlead/drum, recovery shackles and roof light bar; the Civic has separate sport trim. The light bar uses each body model's roof position, body-to-CG offset and visible mounting brackets. A live driving-view inspection caught the earlier shared position projecting the SUV bar ahead of its roof; the native generator corrects that placement while preserving the browser models.

The world adds 2,645 deterministic detail instances, including 645 solid rocks/logs. Solid geometry supplies wheel and chassis collision. Vegetation remains nonblocking. Placement keeps the tarmac, known starts and marked park/quarry areas clear. A small boulder/log line lies beside Pine Ridge's start, roughly 60–140 feet forward and 35–45 feet to the side.

Individual source instance colors are now preserved, including earth-toned scree and varied foliage that previously imported as pale uniform geometry. Only the 13 scenery materials that use varied instance colors receive the vertex-interpolated color path. Ordinary vehicle materials retain their simpler original graphs. Per-mesh source hashes trigger reimport when generated geometry changes.

## Reproduce and evidence

    .\Tools\test-core.cmd
    .\Tools\build-native.ps1 -ImportAssets -Package
    .\Tools\verify-native.ps1

A full cook is required for this material/model update. See validation-native.md and native-validation.json for the final packaged results and practical limits. This pass improves the existing simulation; it does not establish calibrated tire mechanics, flexible frames, fluid simulation or full browser parity.
