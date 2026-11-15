# Oversized-tire fitting

The garage lists each vehicle’s factory tire and the larger diameters that its wheelhouses can accommodate. The compound setting changes grip and width at the selected diameter. Larger diameters require increasingly capable suspension, and the kit retains the factory rim bead. Selected trucks can reach 50 inches. Tandem axle spacing limits the G63 6×6 to 46 inches, and Grave Digger keeps its 66-inch factory tires.

## Wheelhouse and suspension clearance

The tire radius and selected suspension determine ride height. A fitted tire adds no separate body or chassis lift. Clearance comes from reshaped wheel openings, recessed liners, moderate track widening, and bump and steering stops sized to the kit. Trucks with a wide range of options have separate wheelhouse geometry for moderate and extreme sizes. On the 6×6, only the trailing axle moves as needed to keep 80 mm between the tandem tires.

The source export cuts the wheelhouses around the actual tire envelopes at full bump and steering. It accounts for Ackermann steering, factory rear steering, every wheel-offset stage, the widest compound and staggered rear tires. The selected body variant gets its own ground probes and convex coachwork collision data. Older builds migrate to the closest supported diameter at or below their previous selection.

## Loaded pressure and underbody

The pressure and corner load determine how far the carcass deflects. The contact solve combines the tire with the suspension in series, so a tire can absorb part of a ledge before the suspension reaches its bump stops. The rendered tread flattens at the contact plane, the lower sidewall bulges, and the bead stays seated at the rim. At full bump, the tire also deforms under the additional load from the suspension stop. On steep rock, large tires use the actual terrain triangles across the tread and shoulder. After the physics step, the presentation tick uses the current hub and steering pose. A small terrain patch lets the tread flex against adjacent faces and raised rut edges, with the extra compression limited to the available rubber sidewall. The model uses a bounded stiffness and sidewall height for each installed tire, with scale checked against published radial stiffness data. [SAE force–deflection and footprint test](https://saemobilus.sae.org/standards/j2704_200501-tire-normal-force-deflection-gross-footprint-dimension-test) · [Published static radial stiffness measurements](https://www.mdpi.com/2624-8921/6/1/16)

The selected build determines the visible frame reinforcements, skid plates, exhaust and fuel hardware, transfer case, motor housings and battery protection. Shaft angles, hoses, steering links and wheel-end parts follow the actual running gear as it moves.

## Verification

After the complete asset export and tire-probe bake, run:

~~~powershell
node Tools/validate-tire-fit.mjs --expect-vehicles=12
~~~

The validator samples the exported body surfaces on a 25 mm grid and uses the measured tire meshes. It checks full bump at the minimum required suspension stage, one-degree steering samples and all wheel offsets. The report at [tire-fit-validation.json](tire-fit-validation.json) identifies the body mesh hashes and limiting samples for every diameter. The source report measures sampled clearance. The native fixture separately checks loading, driving and recovery on the cooked build.

The rollover fixture uses real mesh vertices from the tread, shoulders, sidewalls and bead area. It verifies the installed mesh and applies the actual tire component transform, including width and rear-tire scaling. Build and package with [build-native.ps1](../Tools/build-native.ps1) to generate matching source and cooked witness sets.

The Granite fixture installs each 40-inch-or-larger option through the garage and runs a moving left and right steering sweep. It then drives two rocky ledges under its own power. The EarthCruiser, G63 6×6, and Grave Digger engage their available axle and center lockers while stopped for the ledge run. The matrix includes the 66-inch factory Grave Digger fit. The 50-inch Hummer and Wrangler have rendered tests that apply both steering stops while the suspension is articulated on the ledge. The Hummer test measures the closest deformed tread vertices at 16 PSI.

~~~powershell
.\Tools\verify-fidelity.ps1 -Mode GraniteFit
.\Tools\verify-fidelity.ps1 -Mode GraniteFit -GraniteLedgeLocks -GraniteVehicle 4 -GranitePSI 16
.\Tools\verify-fidelity.ps1 -Mode GraniteFit -GraniteVehicle 4 -GraniteStage 6 -GranitePSI 16
.\Tools\verify-fidelity.ps1 -Mode Carcass
~~~

Run the matrix after exporting the source that matches the package. The headless fixture generates a clearance witness file in `Saved` on first use. When comparing a separate archive, pass its matching witness file with `-GraniteBodyWitnesses`. The Carcass check uses the same 42-inch Wrangler at three pressures on flat pavement and inspects the underbody before and after selected upgrades.

The [native Granite pressure verification](granite-pressure-native.json) records the original Windows package results. The [sharp-ledge retest](granite-ledge-native.json) records the Hummer repro and the corrected package.
