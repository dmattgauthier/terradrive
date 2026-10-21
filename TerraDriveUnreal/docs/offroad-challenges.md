# Native off-road challenges

The native course export restores the source Summit Challenge Park, including its 40 m full loop, long run-up, tabletop, 10 m gap, narrow balance ramp and seven alternating articulation bumps. An additional Granite Trials Arena has four marked routes: Axlebreaker ledges, Granite staircase, Off-camber ridge and Brake-control descent. Orange and blue posts mark the rocky routes. These are competition-inspired driving exercises, not a replica of a sanctioned event or its scoring rules.

## Driving

Use 7 to start the Summit loop route and 9 to start Axlebreaker in Granite Trials. J cycles the eight challenge routes and R restarts the current route. The route display tracks gate progress and elapsed time.

The Jeep is the default vehicle. Stop before selecting low range with L. Low range selects 4WD automatically. Z locks the rear differential; U locks the front. The Jeep requires the rear lock before the front. Shift+W provides a gentler throttle for crawling. K enables brake-controlled descent assist on the Jeep, Bronco and EV. The assist targets about 7 km/h; traction still limits braking. Use straight wheels, low range and measured braking for the descent.

The front/rear locker indicators show the actual axle state. Available hardware follows each source vehicle specification. Lockers disengage above 40 km/h. Open axles share equal torque, so the lightly loaded wheel limits both sides. A locked axle can send more of the requested torque to the loaded tire; the tire friction budget still limits the resulting force. Locked wheels also share one shaft speed, solved with both tire contacts and both wheel inertias. This is a simplified axle model; detailed transfer-case and driveline compliance are not simulated.

## Contact and debris

Suspension support must lie within the wheel's finite travel and face the tire. A roof-down vehicle cannot invent ground grip through the chassis. Drive and steering input are suppressed while overturned without tire support. A vehicle on the inside ceiling of the loop can retain real contact; inversion alone does not disable legitimate loop driving.

Tire debris uses moving world-space instances with velocity, gravity, drag and a short lifetime. Impacts end particles. Permanent spheres attached behind the wheels have been removed. Terrain deformation remains separate from airborne debris.

## Validation

The native regression suite checks roof-down driving, airborne forces, debris travel/expiry/render positions, actual imported loop collision at five positions including its ceiling, the unsupported jump gap, eight route spawns, locked/open climbing and a controlled descent. These checks supplement the earlier vehicle, soil, region and camera scenarios. See validation-native.md and native-validation.json for the latest recorded outcome; source changes alone are not proof of a passing packaged build.
