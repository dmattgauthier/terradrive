# Oversized-tire fitting

The garage lists each vehicle’s factory tire and the larger diameters that its wheelhouses can accommodate. The compound setting changes grip and width at the selected diameter. Larger diameters require increasingly capable suspension, and the kit retains the factory rim bead. Selected trucks can reach 50 inches. Tandem axle spacing limits the G63 6×6 to 46 inches, and Grave Digger keeps its 66-inch factory tires.

## Wheelhouse and suspension clearance

The tire radius and selected suspension determine ride height. A fitted tire adds no separate body or chassis lift. Clearance comes from reshaped wheel openings, recessed liners, moderate track widening, and bump and steering stops sized to the kit. Trucks with a wide range of options have separate wheelhouse geometry for moderate and extreme sizes. On the 6×6, only the trailing axle moves as needed to keep 80 mm between the tandem tires.

The source export cuts the wheelhouses around the actual tire envelopes at full bump and steering. It accounts for Ackermann steering, factory rear steering, every wheel-offset stage, the widest compound and staggered rear tires. The selected body variant gets its own ground probes and convex coachwork collision data. Older builds migrate to the closest supported diameter at or below their previous selection.

## Verification

After the complete asset export and tire-probe bake, run:

~~~powershell
node Tools/validate-tire-fit.mjs --expect-vehicles=12
~~~

The validator samples the exported body surfaces on a 25 mm grid and uses the measured tire meshes. It checks full bump at the minimum required suspension stage, one-degree steering samples and all wheel offsets. The report at [tire-fit-validation.json](tire-fit-validation.json) identifies the body mesh hashes and limiting samples for every diameter. The source report measures sampled clearance. The native fixture separately checks loading, driving and recovery on the cooked build.

The rollover fixture uses real mesh vertices from the tread, shoulders, sidewalls and bead area. It verifies the installed mesh and applies the actual tire component transform, including width and rear-tire scaling. Build and package with [build-native.ps1](../Tools/build-native.ps1) to generate matching source and cooked witness sets.
