# Expedition vehicles, electric drive and tire air control — pass 14

**Historical pass-14 record.** Its 2,087 native checks, 1,393 portable checks and 279 reviewed captures belong to executable `aae82881c70ab24caa54dde45f7182e99c2f25ca417ae1c6c4444beee893a15e` and full asset cook4. The current pass15 [native validation](validation-native.md) supersedes that executable, the G-Class body/wheel selection, version4 saves and the factory-EV conversion semantics described here. Current factory EVs retain their motor layout when tuning and offer gasoline conversion kits; single/dual/quad EV swaps are for factory combustion donors.

This round expands the garage to **nine vehicles and twelve upgrade systems**. It adds original reference-built EarthCruiser EXP, Mercedes-Benz G 580 with EQ Technology and Mercedes-AMG G 63 bodies, distinct electric motor layouts, regenerative/service-brake blending, and finite-rate tire inflation/deflation. The preserved browser implementation remains unchanged.

## Three researched additions

| Vehicle | Configuration selected | Distinctive original geometry |
| --- | --- | --- |
| EarthCruiser EXP | 2022 EXP98 single-cab Isuzu NPR platform, GM 6.6-liter gasoline V8, six-speed automatic, roof down for driving | Cab-over nose and angled windscreen, molded camper with real window openings and pass-through, closed pop-top, five solar panels, rear covered spare/storage, leaf-sprung truck layout and 17-inch eight-window rims with 37-inch tires |
| Mercedes-Benz G 580 with EQ Technology | Modern 2025 four-motor electric G-Class; selected 20-inch wheels, optional Black Panel/LED grille and rear Design Box | Straight pillars and gutters, exposed hinges, separate indicator pods, sculpted bonnet, three side panes per side, electric grille, closed charging flap and battery shield; no exhaust tips |
| Mercedes-AMG G 63 | Modern 2025 4.0-liter V8 with nine-speed automatic, low range and factory mechanical locks | Vertical-bar AMG grille and deeper bumper openings, wider formed arches, four side exhaust tips, covered circular spare and 20-inch five-twin-spoke rims |

The EarthCruiser selection avoids mixing its later Isuzu/6.6-liter platform with older Fuso trucks, dual cabs or the fixed-roof FX. Its published roof-down dimensions, wheelbase and nominal tire size anchor an otherwise photo-fitted original model. Mass, axle ratios, pressure setup, suspension and CG include explicit simulator estimates. See [EarthCruiser research](earthcruiser-exp-research.md), the [manufacturer EXP98 flyer](https://earthcruiser.com/wp-content/uploads/2023/11/EC98_Sales_Flyer-1.pdf) and [platform announcement](https://earthcruiser.com/earthcruiser-announces-next-generation-overland-vehicle-platform/).

The Mercedes pair shares the sourced 113.8-inch wheelbase but retains different widths, rear attachments, propulsion and axle behavior. G 580 length figures differ among official publications; the chosen approximately 186.1-inch Design Box envelope and its evidence are documented rather than presented as a corrected US certification figure. US and EU curb/running-order mass definitions are kept separate. [Mercedes research and source links](mercedes-gclass-research.md), [2025 G 580 guide](https://media.mbusa.com/news/2025-mercedes-benz-g-580-with-eq-technology-quick-reference-guide), [2025 G 63 guide](https://media.mbusa.com/news/2025-mercedes-amg-g-63-quick-reference-guide).

These are **original procedural approximations**, with real openings, formed surfaces, interior fittings, separate tires/rims and dynamic lamp materials. They contain no manufacturer CAD, ripped meshes or reference-photo textures. Correct overall dimensions and glazing probes do not establish production panel curvature, factory optics, complete interiors, UV/normal baking or LOD quality. The existing [vehicle art production plan](vehicle-art-production.md) still describes the further work needed for a Forza-quality result. Native photos must be compared with the exact selected trims before a visual-accuracy claim.

## Electric topology and conversion stages

The native factory HUMMER EV 3X SUV retains **three motors: one front motor through a mechanical differential and separate rear motors**. The G 580 retains **four individually controlled wheel-motor channels** and its selectable two-speed reductions. Its differential function is virtual torque control; it does not weld left/right wheel speeds. These layouts differ from both a one-motor mechanical drivetrain and a two-motor vehicle with a motor per axle. [GMC factory layout](https://news.gmc.com/newsroom.detail.html/Pages/news/us/en/2023/apr/0421-hummer.html), [Mercedes electric drivetrain](https://media.mbusa.com/news/the-gelandewagen-electrified).

The appended **EV CONVERSION** category has stock, SINGLE, DUAL and QUAD stages:

| Selection | Simulated drive layout | Differential behavior |
| --- | --- | --- |
| STOCK | Factory combustion or actual factory EV topology | Existing factory capabilities retained |
| SINGLE | One rear motor; an equipped transfer drivetrain can connect front drive | Mechanical differential and locker behavior remain in the connected drivetrain |
| DUAL | One motor per axle | Each axle has its own motor limit and a mechanical differential between its wheels |
| QUAD | One independent motor request per wheel | Individual torque control, with independent wheel speeds |

The conversion kits are **fictional game hardware**. Their estimated 65/80/95 kWh packs, output, reduction, motor-speed limits and donor/kit mass changes are not manufacturer retrofit specifications or proof that those components fit any real body. An ICE conversion removes estimated combustion drivetrain mass and adds its kit. Replacing a factory EV removes its estimated original traction pack and drive hardware before adding the selected kit; it does not stack a second complete battery on top of the HUMMER or G 580. The garage's current powertrain, battery capacity/charge and running weight show the resulting configuration. Source behavior and approximation boundaries are detailed in [electric-pressure-research.md](electric-pressure-research.md).

Motor torque is limited by each channel's share of torque, available shaft power and motor speed. A spinning rear wheel cannot donate unlimited power to another motor or suppress every motor through a single average RPM. Low range and portals change wheel torque and shaft speed consistently. Battery charge is a bounded simulation state, not a cell-voltage, cooling or thermal-management model. Installing a conversion kit initializes its charge state; the garage describes the selected topology separately from the vehicle's factory-character notes.

Regeneration contributes to a brake request; friction braking supplies the remaining deceleration and stationary holding force. Generation fades near zero wheel speed and reduces when the simulated battery approaches full charge. Recovered energy is bounded by actual generating wheel work. It must not drive a stopped wheel backward or add a second full brake force on top of the requested service brake. **Space** remains the holding brake, while held **S/Down** or the gamepad left trigger brakes through a stop and then selects reverse according to the existing input behavior. Native trials cover real lift-off generation, configured drive layouts and service-brake stops; the 265 portable electric/pressure checks separately exercise battery energy limits, low-speed regenerative fade and brake capacities. This is not a detailed battery thermal model.

## Pressure targets and finite air flow

Open **Tab → Upgrades**. The scrollable build sheet shows actual **front/rear PSI**, the front pressure target, the current air-system status, its target range and a **ROAD PRESSURE** action. **−2 / +2** buttons change the target through the same request path used by **− / +** while driving; the equals/numpad-plus and hyphen/numpad-minus keys change it in two-PSI steps. Rear pressure follows the selected vehicle's axle-pressure ratio, which matters on heavier rear-loaded vehicles.

In the garage, pressure adjustment is an immediate service. Selecting a vehicle services its saved pressure target; it is not represented as a compressor completing the change instantaneously on the trail. Each vehicle remembers its own upgrade stages, pressure target and battery state. The save migration appends EV conversion and tire-air categories after the original ten slots; older seven- and ten-category builds retain their original category indices.

On the trail, target and actual pressure are distinct. The appended **TIRE AIR CONTROL** category selects bounded, fictional hardware:

| Stage | Menu label | Reference inflation rate | Reference deflation rate | Operating speed limit |
| --- | --- | --- | --- | --- |
| STOCK | STOCK | No driving inflation; garage service | 0.10 PSI/sec manual bleed | 0.5 mph, effectively stopped |
| I | BASIC | 0.08 PSI/sec | 0.20 PSI/sec | 5 mph |
| II | CTIS | 0.16 PSI/sec | 0.35 PSI/sec | 25 mph |
| III | FAST | 0.30 PSI/sec | 0.60 PSI/sec | 40 mph |

These are four-tire reference rates, scaled for the simulated tire's air volume. Larger/wider tires take longer. For reference-volume tires, a 20-PSI increase takes approximately **250, 125 or 67 seconds** in stages I–III while their operating conditions remain satisfied. Installed valves/compressors require control power and pause above their speed limit; stopped manual bleeding does not require electrical power. A better compressor changes flow, speed allowance and hardware mass, not the tire's carcass strength or a fictional beadlock capability. These game values are not rates for a named commercial compressor.

Pressure changes actual loaded footprints and tire response. Moderate airing down can help a soft surface, but it is not a universal grip bonus: it reduces paved-road longitudinal/lateral grip, softens steering response and increases squirm and rolling loss. Too much pressure also loses grip. Severe underinflation and speed consume the bounded soft-ground benefit. Matched native road trials measured 16.6% longer braking distance and 23.8% lower yaw response at half pressure. Matched sand samples measured a 26.4% larger carcass patch, with bounded physical ruts and conserved soil volume. The measured rut-depth result is reported separately; a larger patch is not presented as a large sink reduction.

The pressure limits and road target are load-relative simulator approximations, not real tire load tables. Existing load/PSI footprint calculations are used once; the informational footprint ratio is not applied a second time. The accepted soil solver can choose a rolling contact arc larger than the pressure-derived patch, so a larger carcass footprint does not guarantee a large change in rut depth. Ruts remain bounded to the native proving-ground height field; the acquired Winter Expedition landscape and road retain authored/static collision.

## Source checks and acceptance boundary

The new source validator reports **88 explicit checks**: 24 for the EXP and 32 per G-Class, including mechanical envelopes, nine Mercedes glazing sight lines each, formed bonnet/door/roof depth, genuine camper pass-through, solar panel placement, separate brake/reverse roles, variant hardware and tire/rim compatibility. The existing six vehicles' geometry/ray regressions remain in the combined nine-vehicle check. The running-gear suite now inspects the actual custom rims for all nine vehicles, including their interior-facing barrel walls. These source checks do not prove the native asset import, game rendering, pressure input, saves, battery/regen or handling.

The expanded garage uses scrollable vehicle and detail lists, so the EXP, G 580 and G 63 remain selectable at the fixed preview layout. The expanded garage, model previews and pressure/powertrain readouts are included in the actual native capture review. Automated trials separately exercise configured builds, service requests and save persistence. No new claim is made here about sustained GPU temperature, normal-60-FPS endurance, whole-PC crash causes or production visual fidelity. The acceptance record identifies the actual executable and asset cook; failed and superseded candidates remain separate diagnostic evidence.

## Native package verification

The final package passes **2,087 native checks** across fourteen modes and **1,393 portable checks**, with **279 fresh reviewed native PNGs**. This includes 245 native electric/pressure checks, 58 observed rollover poses, nine vehicles and twelve categories. The complete producer is cook 4, `Saved/expedition14-build-4.log`, SHA-256 `fff14cbc63e3e34db5a47c52433155e6bb3f7ab59afbea80c21df027cad8466c`. Executable SHA-256: `aae82881c70ab24caa54dde45f7182e99c2f25ca417ae1c6c4444beee893a15e`.

The HUMMER SUV uses the corrected 170 kWh C/3-rated simulation basis for its 20-module configuration. This is inferred from the MY2024 module specification and MY2025 rated-capacity certification evidence; it is not a precisely established MY2024 usable/net/gross figure. The fresh native checks independently require 170 kWh for the HUMMER and 116 kWh for the G 580. Primary links and the generic donor-mass estimate are retained in [electric/pressure research](electric-pressure-research.md).

The correction for dry ruts keeps absent standing water absent after excavation. The Mercedes pair includes a real rear roof/header closure; all six legacy body exports retain their checkpoint bytes. Factory electric topologies remain distinct from fictional conversions, pressure coefficients remain calibrated estimates, and the acquired Winter Expedition landscape/road remain static. See [validation-native.md](validation-native.md) for measured brake/steering/sand results, preservation, GPU scope and remaining limits.
