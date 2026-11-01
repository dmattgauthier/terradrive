# EV axle locks and energy service

Quad-motor conversions previously kept each wheel in the independent motor
solver even when a front or rear lock was selected. The lock state therefore
did not constrain wheel speed. Mechanical and virtual axle locks now solve
the two tire contacts together at one signed angular speed, including their
combined inertia, tire reactions and brakes. Turning creates the expected
tire slip instead of letting a locked inside wheel rotate independently.

Independent wheel motors expose a virtual lock on their axle: both axles for
quad motors, the rear axle for the factory tri-motor HUMMER. The HUD identifies
these as **FRONT V-LOCK** and **REAR V-LOCK**, with their current keyboard keys.
The motor layout retains independent left/right behavior when unlocked.
Separate axle motors still have no mechanical center differential or shaft
lock; front and rear axle speeds can differ.

Stop before selecting a lock. Vehicles with low range retain the existing
low-range interlock for the front lock. Axle locks automatically release above
about 25 mph. Default keys are **Z** for rear lock, **U** for front lock and
**L** for range; the HUD follows customized controls.

## Charging, fuel and unlimited driving

Open the garage with **V** / **Tab**, or stop upright and press **Esc**.
Use **CHARGE TO 100%** for an EV or **FILL FUEL TANK** for an ICE vehicle.
This is an instant service action. The pause menu disables service while the
vehicle still has linear/angular motion or is overturned; pausing does not
turn a moving vehicle into a stopped one.

The top status bar shows battery or fuel percentage and the garage service
key. The garage/pause service row shows battery capacity in kWh or fuel in
US gallons. Low energy is highlighted, and an empty vehicle shows the
service instruction. Empty vehicles retain steering and brakes but lose
propulsion while consumption is enabled.

The **FUEL / CHARGE USE: ON** button toggles to **UNLIMITED FUEL / CHARGE**.
Unlimited driving disables both consumption and battery regeneration, keeps
the stored level unchanged, and permits propulsion and tire-air operation
even from an empty battery/tank. Re-enabling usage resumes from that stored
level. This setting is separate from damage/free-run settings and is available
in both menus.

Fuel use is a gameplay estimate based on delivered wheel work and idle demand,
with an assumed engine/driveline efficiency. Tank capacities are chassis-specific
gameplay estimates, including tanks for factory-EV gasoline conversions;
these are not certified economy/range figures. EVs retain the existing battery
capacities, motor efficiency and bounded regenerative power. Fractional energy
remainders preserve small accessory/idle loads at normal frame rates.

Save format **7** adds nine fuel profiles and the consumption setting while
retaining all 13 upgrade slots, pressure targets, charge profiles and damage
mode. Versions 1–6 migrate without changing their supported fields. Legacy
fuel defaults to 75%; consumption defaults on. Changing an EV conversion's
motor count does not refill its battery. Service, vehicle/setup changes,
pausing, clean exit and a 30-second driving checkpoint preserve energy state.
Garage and pause time do not consume energy.

## Verification

Run the portable checks with `Tools/test-energy.cmd`,
`Tools/test-electric-pressure.cmd`, `Tools/test-core.cmd` and
`Tools/test-center.cmd`. After compiling/staging the game, run
`Tools/verify-energy.ps1`; its other modes cover `Interface`,
`ElectricPressure` and `Mechanical` regressions. Runs isolate player settings,
pace simulation at 20 Hz, cap rendering and stop at a sampled GPU temperature
of 77°C. These runs prove function, not uncapped performance.

Both the game and editor targets compile successfully. The final packaged
executable passes **1,050 native checks**: 135 energy/locker checks, 133
interface checks, 502 mechanical checks and 280 electric/pressure checks.
Locked axle speed differences record zero through forward/reverse turns,
airborne wheel spin, service braking and regeneration. Unlocked quad motors
retain different wheel speeds. The native tests also exercise depleted EV/ICE
propulsion, unlimited driving from empty, real Slate service buttons, all nine
service profiles, legacy saves and atomic rejection of malformed version-7
energy fields. Gauge and button bounds are checked at 1280×720.

The four portable suites pass **1,158 checks**. They ran before the final build;
all tested source/header inputs match the final source. All **94 native captures**
were reviewed in contact sheets, with key gauge/service views inspected at
full resolution. The maximum sampled GPU temperature across the final suites
was **55°C**. The existing cooked content is reused unchanged; no assets were
imported or recooked. Browser source, player files, acquired content and the
retained rollback pass the preservation audit.

The tested executable SHA256 is
`e58224805564a3f3cd93737b9f21fe532e593697cfe917f808d7f41565d55eba`.
Exact run times, source/input hashes, capture counts and preservation details
are in [the validation record](ev-lockers-energy-validation.json). These bounded
checks do not establish uncapped performance or long-session PC stability.
