# Electric conversions and tire-air physics

This pass adds portable, standard C++ helpers in `TerraElectric.h` and `TerraPressure.h`. They contain no Unreal dependency, state persistence, UI, asset generation, or browser changes. Native integration, save migration and game validation belong to the calling vehicle implementation. The numerical kit specifications and tire coefficients below are simulation estimates, distinguished from the manufacturer facts used to choose their behavior.

## Primary research

The factory Hummer EV 3X SUV has three motors, one front and two rear. GMC publishes this layout alongside its rated outputs; the helper therefore preserves a mechanical front differential and independent rear motor requests at factory stage zero. [GMC model specifications](https://news.gmc.com/newsroom.detail.html/Pages/news/us/en/2023/apr/0421-hummer.html)

GMC's MY2024 SUV brochure specifies a **20-module** battery for the 3X SUV. GM's MY2025 EPA certification application, PDF page 18, rates the 20-module pack at **170 kWh at C/3**. The simulation uses 170 kWh as its factory SUV state-of-charge energy basis, inferring the same rated capacity for the MY2024 20-module configuration. This is not a claim of a precisely established MY2024 usable, net or gross capacity. The stock operating mass, motor power and torque remain their separate roster values. The donor-pack mass used for conversions still comes from a generic 185 Wh/kg estimate; the capacity reference does not establish a measured Hummer pack weight. [GMC MY2024 SUV features and specifications, pages 8 and 15](https://www.gmc.com/content/dam/gmc/na/us/english/index/about/download-brochures/2024-models/GMTH23CT000-2024-HUMMER-EV-SUV-FO-031924.pdf), [GM MY2025 EPA certification application](https://dis.epa.gov/otaqpub/display_file.jsp?docid=61422&flag=1)

The G580 with EQ Technology has an independently driven motor and selectable two-speed reduction for each wheel. Its virtual differential function is controlled through motor torque. The helper preserves four independent requests; a virtual lock must not set both wheel angular speeds to the same value. Mercedes describes a 2:1 low reduction and a 53 mph low-range speed limit; those factory metadata belong to the vehicle integration. [Mercedes-Benz electric G-Class technical release](https://media.mbusa.com/news/the-gelandewagen-electrified)

EV motors typically provide a constant-torque region up to base speed and a constant-power region above it. That supports a torque cap plus `power / angularSpeed` rather than the old fleet-wide power calculation using one mean wheel speed. [Nidec motor characteristics](https://www.nidec.com/en/products/small-precision-motors/technology/motor/glossary/item/constant_power_characteristics/)

Regeneration converts wheel kinetic energy into electrical energy. Friction brakes supplement the generator, including at very low speed and while stationary. The helpers consequently return positive braking capacities, taper generation near zero speed, and leave the mechanical holding brake in place. [Bosch regenerative braking](https://www.bosch-mobility.com/en/solutions/braking-systems/regenerative-braking-systems/)

Battery availability can limit regeneration, especially with a cold or full battery. `ElectricRegen` accepts an explicit acceptance fraction; zero acceptance produces no regenerative braking or recovered power. A caller without a battery simulation must describe its chosen fixed acceptance as an approximation. [Tesla braking and stopping manual](https://www.tesla.com/ownersmanual/modely/en_pr/GUID-3DFFB071-C0F6-474D-8A45-17BE1A006365.html)

Continental links underinflation to delayed steering/braking response, sidewall flex, heat, and increased rolling resistance; overinflation reduces contact grip and increases braking distance. Pressure selection also depends on the supported vehicle load. These support distinct steering stiffness, response, rolling-loss and grip effects rather than a universal low-pressure grip bonus. [Continental tire pressure technical guide](https://www.continental-tires.com/tire-knowledge/tire-pressure/)

BFGoodrich describes moderate airing down as helpful for some low-traction surfaces through a larger contact patch, provided sufficient load capacity remains. Reduced pressure requires reduced speed and reinflation for paved travel. This supports a small bounded soft-soil benefit and a speed-dependent carcass penalty; it does not support treating every off-road surface as sand. [BFGoodrich pressure advice](https://www.bfgoodrich.co.uk/auto/tips-and-advices/general/tyre-pressure)

Manufacturer road pressure comes from the vehicle placard, with possible separate loaded and axle-specific values. The maximum printed on a sidewall is not the recommended road pressure. The game uses a load-relative approximation until full tire load tables are available. [Michelin car pressure guide](https://www.michelinman.com/auto/auto-tips-and-advice/tire-pressure)

Dana's CTIS offers driver-selectable modes based on terrain and load, pressure monitoring and remote wheel-end venting. This establishes a distinct hardware feature, rather than turning every stock manual tire valve into a moving compressor. [Dana central tire inflation](https://www.dana.com/product/central-tire-inflation-system/)

Compressor air supply is finite. ARB specifies 131.8 liters/minute at 200 kPa for its CKMTA12 twin unit, with flow depending on delivery pressure. That demonstrates why tire volume and elapsed time matter. The game tiers below are fictional central systems; their PSI rates are not an ARB product rating or a conversion of that specification. [ARB compressor specifications](https://www.arb.com.au/product/ckmta12-arb-on-board-air-compressor-brushed-twin-12-volt)

## Topology and torque interface

`ResolveMotorLayout(swapStage, factoryMotorCount)` maps stage zero to the actual factory metadata. Stages 1, 2 and 3 explicitly choose single, dual and quad layouts. Invalid factory counts resolve to no electric drive. The requested persisted slots append `EVSwap` and `TireAir` after the existing ten parts; original indices must not move. The integration should write version 4 and accept old version 1/2 seven-slot and version 3 ten-slot saves with new stages zero.

`FactoryElectricConfig(motors, powerW, wheelTorqueNm, reduction, maxMotorRPM)` preserves the factory power and summed launch wheel-torque ceiling and adds no mass. `PeakWheelTorqueNm` already includes the nominal reduction; integration must not multiply it by `Reduction` again. The reduction still determines shaft RPM, the maximum usable wheel speed, and low/portal multiplication.

`MakeElectricSwap(stage, stockPowerW, stockMassKg)` describes fictional conversion hardware. Power scales with bounded vehicle size and stock performance, with maxima of 300/480/650 kW across the three stages. Nominal reduction is 9.2/9.5/9.8, with 14,500/16,000/17,500 rpm motor limits. Constant wheel-torque capacity follows the chosen power and base motor speed. Output is not an unlimited launch-torque multiplier.

The estimated conversion batteries are 65/80/95 kWh. Net mass relative to an ICE donor is +573/+794/+1,036 lb. `KitMassKg`, `BatteryMassKg` and `RemovedDrivelineMassKg` expose the estimate so factory EV replacement can subtract its actual removed hardware. Do not add a complete second battery on top of the stock Hummer or G580 pack. These are game estimates, not validated retrofit designs or a packaging claim about any vehicle body.

`ElectricDriveTorque` takes four actual wheel angular speeds and returns `ElectricTorqueOutput`:

| Layout | `Axle` output | `Wheel` output | Required contact integration |
| --- | --- | --- | --- |
| Single | Rear; half front/rear if the transfer drive is connected | None | Existing differential, LSD and selectable locker behavior; transfer hardware remains necessary for 4WD |
| Dual | One independently limited motor per axle | None | Separate front/rear motor power limits, mechanical differential within each axle |
| Triple | Front motor | Each rear wheel | Front differential; rear wheel motor limits and traction control |
| Quad | None | Each wheel | Individual torque/traction control; no shared axle-speed constraint |

Each motor channel has a fixed fraction of total torque and power and its own shaft-speed limit. A free-spinning motor cannot suppress the others through mean RPM or donate unlimited output to another motor. `MechanicalPowerW` is signed propulsion power; it can be negative if the requested direction opposes actual rotation. Direction selection remains the caller's driver-control responsibility.

`ElectricRegen` returns the same output channels as **positive brake-torque capacities**, not signed driving torques. Feed them to the implicit brake solve. Fade begins below 2.5 rad/s and reaches zero at 0.5 rad/s (roughly 2.3 to 0.5 mph for a 33-inch tire). The brakes must supply the remainder of a requested stop rather than adding generator braking on top of a complete existing pedal brake. An unloaded wheel supplies no chassis braking force. Oppositely rotating half shafts on a mechanical motor channel defer braking to friction; that state cannot be represented faithfully as two independent positive generator brakes. Independent wheel motors can generate in different directions. `RecoveredPowerW` is mechanical generator power times an estimated 0.82 charging efficiency; it must not be reported as actual stored energy unless integrated over time into a battery state.

The maximum-speed taper occupies the final 8% of the shaft range. Torque, power, mass, battery capacity, taper width, generator fractions, and charging efficiency are explicit bounded simulation parameters. Continuous thermal derating, charge depletion, cooling, voltage sag, mechanical conversion fitment and individual tire thermal failures are not simulated by these helpers.

## Pressure target, actual state and physical response

Keep **actual PSI** separate from **target PSI**. Driver buttons change the target. `AdvanceTirePressure` changes actual PSI at the hardware's finite rate and pauses outside the permitted speed or without electrical control power. A garage service may deliberately set actual pressure immediately; normal driving must not call a garage-service shortcut. Persisting a target alone must not cause a physical pressure jump on resume.

| Air stage | Hardware estimate | Inflate, PSI/sec | Deflate, PSI/sec | Operating limit |
| --- | --- | --- | --- | --- |
| 0 | Manual stopped bleed, garage air service | None while driving | 0.10 | 0.5 mph |
| 1 | Basic CTIS | 0.08 | 0.20 | 5 mph |
| 2 | Trail CTIS | 0.16 | 0.35 | 25 mph |
| 3 | High-flow CTIS | 0.30 | 0.60 | 40 mph |

Rates describe all four tires together at reference volume. A 20 PSI increase takes about 250/125/67 seconds for fitted tiers before volume scaling. `TireAirVolumeScale(radius,width)` approximates carcass air volume using radius times width squared, bounded from 0.3 to 4 times a 33-inch all-terrain reference. It changes elapsed inflation time, not physical contact width. All fitted tiers operate while moving slowly; stock manual bleeding requires a stop. Installed electronic valves require power for inflation and deflation.

`LoadedRoadPressure` uses the stock placard and stock static per-wheel load as the reference. The current static load includes conversion/upgrades/payload and front/rear weight distribution. Do not pass the instantaneous suspension force as that static load: it would make optimum pressure oscillate through a bump. The estimate scales pressure with static load ratio to the power 0.8, with bounded ratio and a 20–65 PSI road range. This is not a substitute for a real tire manufacturer's load/inflation table. The game target bounds are a load-relative minimum of `max(10, 0.35 * roadPSI)` and a 65 PSI maximum. Better compressors do not lower the minimum, which would falsely imply beadlock or carcass upgrades.

`EvaluateTirePressure(actual, placard, currentStaticLoad, stockStaticLoad, speed, softness, tracks)` returns independent multipliers. At stock load/placard it is neutral. At half road pressure the road longitudinal grip is 0.84 and lateral grip 0.80; steering stiffness and response also fall while rolling loss rises. Too much pressure loses road grip too. The soft-soil grip benefit peaks at 1.165, then declines with severe underinflation or speed. Terrain softness blends the road and soft responses continuously; firm dirt/rock must not be given maximum sand benefit. Tracks remain pressure-neutral.

Keep the actual supported load and actual PSI in `FootprintLength`, `SoftSoilFootprint`, and soil deformation. Those already calculate the larger supported area and reduced soil stress when aired down. `FootprintMultiplier` is informational and must **not** enlarge that patch a second time. The existing pressure factor inside `TerrainGrip` must also be neutralized when applying the new multipliers to avoid double counting. The lateral response belongs in the tire force/stiffness calculation; a pressure-dependent steering rate alone cannot model both lateral grip and squirm.

## Validation and integration boundaries

`Tools/test-electric-pressure.cmd` compiled cleanly with MSVC C++17 and `/W4` and passed **265 standalone checks**. It checks preserved factory topology, per-motor power conservation across disparate wheel speeds, gearing and RPM tradeoffs, regenerative energy and stationary brake behavior, load-relative pressure, actual soil-area coupling, road braking distance consequences, blending, rate/frame independence, volume scaling and hardware interlocks. This suite does not prove the native vehicle, menu, save or input integration.

`TerraElectricPressureValidation.h/.cpp` provides the separate native `Tick` harness for the parent report dispatcher. Its trials configure and settle all nine vehicles at factory plus three conversion layouts, migrate legacy saves and round-trip all twelve new slots, operate three fitted air systems while moving, launch/turn/coast/brake the three Civic conversions and three new factory vehicles, and perform paired road braking, steering and sand drives. The final integrated package requires a fresh native receipt; the harness description and standalone results are not a claim that the final native queue has passed. The harness snapshots/restores the builds and active vehicle state and only writes fixture saves under `Saved/Validation`.

The paired brake trials use a 27 mph rolling initial condition with wheel speed matched to road speed, then the real service brake until stopped. The steering pair uses an 18 mph entry and the same steering step for 1.2 seconds.

The sand pair uses the same stock Jeep, mass, suspension, tire dimensions and verified natural-sand corridor, comparing the roster's placard pressure with 20 PSI. A bounded search checks a gentle, unobstructed lane in the basin interior before physics resumes. Both passes use that same lane after resetting its soil. If no lane is verified, the vehicle remains stationary and the fixture/drive checks fail. The harness does not substitute a constructed surface or drive an unverified location.

Both passes enter at **5.6 mph (2.5 m/s)** with wheel rotation matched to road speed. The same bounded throttle-only controller targets that speed through the real engine, tire contacts and Chaos response; after the rolling initial condition it does not overwrite forces, pose or velocity. The vehicle must travel at least 34.4 feet (10.5 m), while comparison uses the common **13.1–26.2-foot (4–8 m)** portion of the rear-tire paths. Each recorded path is resampled every 4.9 inches (0.125 m): **33 samples per rear wheel, 66 total**, at corresponding distances in both passes. Actual mean supported load must match within 10% and actual mean speed within 15% before the pressure/contact comparison can pass.

The sand checks require natural sand with more than 97% sand blend weight throughout the sampled window, more than 90% continuous rut coverage and loaded frames, finite contact data, and no object or terrain-body collisions. Retained rut depth must remain within the local sink limit plus 0.12 inches (3 mm). The depressed soil volume must equal displaced plus compacted volume within the explicit numerical tolerance. These are acceptance conditions enforced by the harness; final native results are reported separately.

The accepted soil solver's `max(carcassPatch, rollingArc)` often makes the soil's rolling arc larger than either pressure patch. Modest airing down can therefore enlarge the supported carcass patch without greatly changing the final rut depth. This pass retains that accepted soil algorithm, measures both values in native trials, and does not claim a large sink reduction that has not been demonstrated. Pressure's road grip, braking, steering response, rolling loss and soft-surface grip behavior remain separate effects.

The portable helpers do not modify acquired assets or the preserved browser source. Their native integration and version-4 save migration are separate project changes described above. This pressure pass retains the existing terrain geometry and soil solver; it adds no per-frame terrain rebuilds, finer rut geometry or render passes. Final game acceptance depends on the integrated native receipts and visual review.
