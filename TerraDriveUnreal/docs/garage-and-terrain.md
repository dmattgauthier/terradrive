# Garage and terrain update

The game opens in a native Slate garage. Choose one of five vehicles, inspect its live model and build sheet, then select **Let's drive**. Tab or V opens the garage while stopped; Tab or Escape returns to driving. Opening the garage returns the vehicle to the current route/region start. Physics and route timing stop for that vehicle while the garage is open.

The Vehicles tab has direct selection cards. The Upgrades tab has seven categories with Stock, I (Trail), II (Expedition) and III (Competition). All stages are available immediately; there is no currency or progression grind. Changes apply immediately and each vehicle keeps its own build. Reset to Stock affects only the selected vehicle.

## What stages change

| Category | Stage I / II / III | Effect in the simulation |
|---|---|---|
| Suspension | +70 / 140 / 210 mm droop travel; +35 / 70 / 105 mm lift; +18 / 40 / 65% damping | Longer contact reach, controlled suspension movement and clearance; modest spring-rate increases |
| Engine / motor | +18 / 40 / 68% output | Increased delivered driveline torque and usable power; existing tire grip and rev limits still apply |
| Tires | +4 / 8 / 12% radius; +7 / 14 / 21% width; +13 / 28 / 46% base grip | Larger visible tires, increased friction budget and wider soil footprint |
| Wheels | 18 / 35 / 50% lower rotational inertia; +35 / 70 / 105 mm track | Quicker wheel response, wider stance and an additional 2.5 / 5 / 7.5% grip multiplier |
| Frame | +30 / 60 / 90% angular damping; lowered center of mass | More controlled chassis rotation and reduced collision damage, at a 1.4 / 2.8 / 4.2% mass cost |
| Body | 3 / 7 / 12% lower mass; 7 / 14 / 21% lower drag | Better power-to-weight ratio and protective-panel damage reduction |
| Electrical | +30 / 60 / 90% winch capacity/reel speed; +20 / 40 / 60 cm water tolerance | Stronger recovery and less power loss in deep water; the EV also gains 8 / 17 / 28% battery/inverter output |

Frame and body protection combine. The electrical package is available on the off-road vehicles and expedition van; the Civic has no auxiliary package. EV electrical output stacks with motor upgrades. These are game tuning stages, not manufacturer-approved modifications or calibrated real-world specifications. Larger tires change effective gearing; more engine power does not override limited traction.

Builds are saved atomically to Saved/garage-builds.json for the running project/package. The format has a version, selected vehicle and independent stage arrays. Invalid saves do not replace an existing build; stage values are clamped and unavailable hardware is sanitized. Native tests use separate files under Saved/Validation and never overwrite the player's build.

## Terrain

Seven ground materials now combine three photographic surface layers. Forest dirt blends with sparse grass and gravel; mud includes riverbed deposits; wetland combines wet soil and vegetation; rock includes exposed mineral, moss and gravel; sand has stony patches; snow has frost and exposed ground.

World-space coordinates keep terrain detail and coarse mesh boundaries aligned. Triplanar projection limits stretching on steep rock. Rotated samples at different scales and irregular patches at several spatial scales reduce conspicuous repetition. Slope influences moss/vegetation, broad mineral tint varies over the landscape, and wet patches alter color and roughness. Supplied normal maps add small-scale light response. These remain textures on the existing physical surface types.

The photographic maps were already vendored with the browser source. None of those source files is modified. The native importer builds material graphs from Tools/terrain-materials.py and Tools/terrain-surface.hlsl, including the quarry rock material. Colored course posts retain their materials. The material signature changes when the shader changes, making reimport resumable.

Rebuild material assets and perform a full cook after shader edits:

    .\Tools\build-native.ps1 -ImportAssets -SkipExport -Package
    .\Tools\verify-native.ps1

See validation-native.md and native-validation.json for the verified package rather than treating source changes as a passing build.
