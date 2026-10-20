import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics, engineTorqueAtRPM } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { Terrain, SURFACES } from '../dist/src/terrain.js';
import { surfaceResponse } from '../dist/src/surface-response.js';
import { PerspectiveCamera, Quaternion, Vector3 } from '../dist/vendor/three.module.js';

const jeep = VEHICLES.find(v => v.id === 'wrangler-rubicon');
const civic = VEHICLES.find(v => v.id === 'civic-sport');
const sprinter = VEHICLES.find(v => v.id === 'sprinter-2500');
const ORIGIN = { x: 0, z: 0, heading: 0 };

function ground(options = {}) {
  const grade = options.grade || 0;
  return {
    sample(x, z) {
      return {
        height: grade * z,
        normal: { x: 0, y: 1 / Math.hypot(1, grade), z: -grade / Math.hypot(1, grade) },
        surface: 'asphalt', mu: 1, rollingResistance: 0.012,
        softness: 0, maxSink: 0, waterDepth: 0,
        ...options,
        ...(options.at ? options.at(x, z) : {}),
      };
    },
  };
}

function create(spec = jeep, terrain = ground()) {
  const physics = new VehiclePhysics(terrain, spec);
  physics.reset(ORIGIN);
  return physics;
}

function run(physics, seconds, input = {}, hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) physics.step(1 / hz, input);
  return physics.state;
}

function rollingFixture(spec, speed, terrain = ground({ ...SURFACES.asphalt }), controls = {}) {
  const physics = create(spec, terrain);
  run(physics, 1);
  physics.setControl('selector', 'N');
  for (const [name, value] of Object.entries(controls)) physics.setControl(name, value);
  physics.body.velocity.set(0, 0, speed);
  for (const wheel of physics._wheels) wheel.omega = speed / wheel.radius;
  return physics;
}

function assertTireBudget(state, label) {
  for (const wheel of state.wheels) {
    assert(Math.hypot(wheel.longitudinalForce, wheel.lateralForce) <= wheel.frictionCoefficient * wheel.load + 1e-6,
      `${label}: a tire exceeded its own load-dependent friction budget`);
  }
}

function bodySlipDegrees(physics) {
  const local = physics.body.vectorToLocalFrame(physics.body.velocity);
  return Math.atan2(Math.abs(local.x), Math.max(0.1, Math.abs(local.z))) * 180 / Math.PI;
}

function lowRange(physics, locks = false) {
  assert.equal(physics.setControl('selector', 'N').ok, true);
  assert.equal(physics.setControl('driveMode', '4L').ok, true);
  if (locks) {
    assert.equal(physics.setControl('rearLocked', true).ok, true);
    assert.equal(physics.setControl('frontLocked', true).ok, true);
  }
  assert.equal(physics.setControl('selector', 'D').ok, true);
}

function finiteState(state) {
  for (const vector of [state.position, state.velocity, state.quaternion]) assert(Object.values(vector).every(Number.isFinite));
  for (const wheel of state.wheels) {
    assert([wheel.load, wheel.slip, wheel.omega, wheel.compression, wheel.radius].every(Number.isFinite));
    assert(wheel.load >= 0);
  }
}

for (const spec of VEHICLES) {
  test(`${spec.id}: settles under its weight without a launch impulse`, () => {
    const state = run(create(spec), 5);
    finiteState(state);
    assert(Math.abs(state.position.y - spec.cgHeight) < 0.015);
    assert(state.speedKmh < 0.01);
    assert(Math.abs(state.velocity.y) < 0.001);
    assert.equal(state.groundedWheels, 4);
    const total = state.wheels.reduce((sum, w) => sum + w.load, 0);
    const front = state.wheels[0].load + state.wheels[1].load;
    assert(Math.abs(total / (spec.mass * 9.81) - 1) < 0.02);
    assert(Math.abs(front / total - spec.frontWeightFraction) < 0.01);
  });

  test(`${spec.id}: engine accelerates and service brakes remove speed`, () => {
    const physics = create(spec);
    run(physics, 1);
    const accelerated = run(physics, 10, { throttle: 1 });
    finiteState(accelerated);
    // Broad plausibility bounds, deliberately not a claimed manufacturer 0–60 test.
    assert(accelerated.speedKmh > 55 && accelerated.speedKmh < 165);
    assert(accelerated.position.z > 70);
    const beforeBrake = accelerated.position.z;
    // Equal deceleration bounds, rather than a six-second deadline from very
    // different entry speeds: the EV is substantially faster after 10 seconds.
    const brakingSpeed = accelerated.speedKmh / 3.6;
    const stopped = run(physics, Math.max(6, brakingSpeed / (.55 * 9.81) + 1), { brake: 1 });
    finiteState(stopped);
    assert(stopped.speedKmh < 0.5, `brake residual speed ${stopped.speedKmh}`);
    assert(stopped.position.z > beforeBrake);
    assert(stopped.position.z - beforeBrake < brakingSpeed ** 2 / (2 * .55 * 9.81) + 5);
  });
}

test('factory peak torque and horsepower constrain every estimated engine curve', () => {
  for (const spec of VEHICLES.filter(vehicle => vehicle.powertrain !== 'electric')) {
    const torque = engineTorqueAtRPM(spec, spec.engine.peakTorqueRPM);
    assert(Math.abs(torque - spec.torqueNm) < 1e-6);
    const powerTorque = engineTorqueAtRPM(spec, spec.engine.peakPowerRPM);
    const hp = powerTorque * spec.engine.peakPowerRPM * Math.PI / 30 / 745.6998715822702;
    assert(Math.abs(hp - spec.powerHP) < 1e-6);
    for (let rpm = spec.engine.idleRPM; rpm <= spec.engine.redlineRPM; rpm += 25) {
      const sampledTorque = engineTorqueAtRPM(spec, rpm);
      const sampledHP = sampledTorque * rpm * Math.PI / 30 / 745.6998715822702;
      assert(sampledTorque <= spec.torqueNm * 1.005);
      assert(sampledHP <= spec.powerHP * 1.01);
    }
  }
});

test('60 Hz and 120 Hz callers produce the same fixed-step trajectory', () => {
  const a = create(), b = create();
  const input = { throttle: 0.32, steer: 0.18 };
  run(a, 8, input, 60);
  run(b, 8, input, 120);
  assert(Math.abs(a.state.position.x - b.state.position.x) < 1e-7);
  assert(Math.abs(a.state.position.z - b.state.position.z) < 1e-7);
  assert(Math.abs(a.state.speedKmh - b.state.speedKmh) < 1e-7);
});

test('a resumed browser tab cannot apply a multi-second physics jump', () => {
  const physics = create();
  const before = physics.state.simTime;
  physics.step(5, { throttle: 1 });
  finiteState(physics.state);
  assert(physics.state.simTime - before <= 0.10001);
  assert(physics.state.position.z < 0.5);
});

test('FWD, RWD and the true continuously variable transmission behave distinctly', () => {
  const frontDrive = create(civic);
  run(frontDrive, 10, { throttle: 0.65 });
  assert.equal(frontDrive.state.gear, 'CVT');
  assert(frontDrive.state.gearRatio < civic.cvtRatios.max - 0.2);
  assert(frontDrive.state.gearRatio >= civic.cvtRatios.min);
  assert(frontDrive.state.wheels[0].driveTorque > 0);
  assert.equal(frontDrive.state.wheels[2].driveTorque, 0);
  const rearDrive = create(sprinter);
  run(rearDrive, 1, { throttle: 0.5 });
  assert.equal(rearDrive.state.wheels[0].driveTorque, 0);
  assert(rearDrive.state.wheels[2].driveTorque > 0);
  assert.equal(frontDrive.setControl('driveMode', '4L').ok, false);
  assert.equal(rearDrive.setControl('rearLocked', true).ok, false);
});

test('range shifts and differential controls enforce hardware interlocks', () => {
  const physics = create();
  assert.equal(physics.setControl('driveMode', '4L').ok, false);
  assert.equal(physics.setControl('rearLocked', true).ok, false);
  lowRange(physics);
  assert.equal(physics.setControl('frontLocked', true).ok, false);
  assert.equal(physics.setControl('rearLocked', true).ok, true);
  assert.equal(physics.setControl('frontLocked', true).ok, true);
  assert.equal(physics.setControl('swayDisconnected', true).ok, true);
  assert.equal(physics.setControl('rearLocked', false).ok, true);
  assert.equal(physics.state.frontLocked, false);
  run(physics, 2, { throttle: 0.8 });
  assert.equal(physics.setControl('selector', 'P').ok, false);
  assert.equal(physics.setControl('selector', 'N').ok, true);
  assert.equal(physics.setControl('selector', 'R').ok, false);
  assert.equal(physics.setControl('driveMode', '4H').ok, false);
});

test('4 Low changes wheel torque by the physical transfer reduction', () => {
  const high = create(), low = create();
  high.setControl('driveMode', '4H');
  lowRange(low);
  run(high, 1 / 120, { throttle: 0.5 });
  run(low, 1 / 120, { throttle: 0.5 });
  const highTorque = high.state.wheels.reduce((sum, w) => sum + w.driveTorque, 0);
  const lowTorque = low.state.wheels.reduce((sum, w) => sum + w.driveTorque, 0);
  assert(Math.abs(lowTorque / highTorque - jeep.lowRatio) < 0.001);
});

test('open axles lose propulsion on split grip; locks constrain wheel speeds and recover it', () => {
  const split = ground({ at: (x) => x < 0 ? { mu: 0.01 } : {} });
  const open = create(jeep, split), locked = create(jeep, split);
  lowRange(open);
  lowRange(locked, true);
  open.setControl('tractionControl', false);
  locked.setControl('tractionControl', false);
  run(open, 3, { throttle: 0.5 });
  run(locked, 3, { throttle: 0.5 });
  assert(locked.state.position.z > open.state.position.z * 3 + 2);
  assert(Math.abs(open.state.wheels[0].omega - open.state.wheels[1].omega) > 5);
  assert(Math.abs(locked.state.wheels[0].omega - locked.state.wheels[1].omega) < 1e-7);
  assert(Math.abs(locked.state.wheels[2].omega - locked.state.wheels[3].omega) < 1e-7);
  const frontMean = (locked.state.wheels[0].omega + locked.state.wheels[1].omega) / 2;
  const rearMean = (locked.state.wheels[2].omega + locked.state.wheels[3].omega) / 2;
  assert(Math.abs(frontMean - rearMean) < 1e-7);
});

test('gravity rolls Neutral downhill while parking brakes hold a 25 percent grade', () => {
  const slope = ground({ grade: 0.25 });
  const parked = create(jeep, slope), neutral = create(jeep, slope);
  parked.setControl('selector', 'P');
  neutral.setControl('selector', 'N');
  parked.setControl('engineOn', false);
  neutral.setControl('engineOn', false);
  run(parked, 5);
  run(neutral, 5);
  assert(Math.abs(parked.state.position.z) < 0.10);
  assert(parked.state.speedKmh < 0.03);
  assert(neutral.state.position.z < -10);
  assert(neutral.state.velocity.z < -3);
});

test('right steering creates right yaw and transfers load to the driver-left wheels', () => {
  const physics = create();
  run(physics, 5, { throttle: 0.30, steer: 0.45 });
  finiteState(physics.state);
  assert(physics.state.position.x < -4);
  assert(physics.state.heading < -0.3);
  const outside = physics.state.wheels[0].load + physics.state.wheels[2].load;
  const inside = physics.state.wheels[1].load + physics.state.wheels[3].load;
  assert(outside > inside * 1.1);
  assert(Math.abs(physics.state.roll) > 0.02);
});

test('front stabilizer disconnect changes cross-axle wheel loading', () => {
  const uneven = ground({ at: (x, z) => ({ height: x > 0.2 && z > 0.5 ? -0.35 : 0 }) });
  const connected = create(jeep, uneven), disconnected = create(jeep, uneven);
  for (const physics of [connected, disconnected]) {
    physics.setControl('driveMode', '4H');
    physics.setControl('selector', 'P');
  }
  disconnected.setControl('swayDisconnected', true);
  run(connected, 4);
  run(disconnected, 4);
  assert(disconnected.state.wheels[0].load > connected.state.wheels[0].load * 1.10);
  assert(disconnected.state.wheels[3].load > connected.state.wheels[3].load * 1.15);
});

test('airing down enlarges the footprint and improves traction on soft mud', () => {
  const mud = ground({ surface: 'mud', mu: 0.28, rollingResistance: 0.08, softness: 0.92 });
  const roadPressure = create(jeep, mud), lowPressure = create(jeep, mud);
  roadPressure.setPressure(37, 37);
  lowPressure.setPressure(18, 18);
  roadPressure.setControl('tractionControl', false);
  lowPressure.setControl('tractionControl', false);
  run(roadPressure, 4, { throttle: 0.8 });
  run(lowPressure, 4, { throttle: 0.8 });
  // The footprint is now the ellipse of the loaded tire geometry. Its area
  // grows with carcass travel; it is no longer assumed to equal load/pressure.
  assert(lowPressure.state.wheels[2].contactArea > roadPressure.state.wheels[2].contactArea * 1.25);
  assert(lowPressure.state.wheels[2].deflection > roadPressure.state.wheels[2].deflection * 1.5);
  assert(lowPressure.state.position.z > roadPressure.state.position.z * 1.1);
  assert(lowPressure.state.speedKmh > roadPressure.state.speedKmh * 1.1);
});

test('actual map soil retains ruts, with deeper sinkage at higher pressure', () => {
  function driveAtPressure(pressure) {
    const terrain = new Terrain();
    const physics = new VehiclePhysics(terrain, jeep);
    physics.reset(terrain.zones.find(zone => zone.id === 'mud').spawn);
    physics.setPressure(pressure, pressure);
    lowRange(physics, true);
    let totalSink = 0;
    for (let i = 0; i < 600; i++) {
      physics.step(1 / 120, { throttle: 0.45 });
      totalSink += physics.state.wheels.reduce((sum, w) => sum + w.sink, 0);
    }
    let deepestRut = 0;
    for (const tile of terrain.detailTiles.values()) for (const delta of tile.delta) deepestRut = Math.max(deepestRut, -delta);
    return { meanSink: totalSink / 2400, distance: physics.state.odometer, deepestRut,
      excavatedVolumePerMeter: terrain.soilVolumes.depressed / physics.state.odometer };
  }
  const road = driveAtPressure(37), airedDown = driveAtPressure(18);
  assert(road.meanSink > 0.015);
  // A hard tire may bridge its own deepest rut. Its bearing-weighted contact
  // sink is therefore not the amount of earth excavated. Measure the real
  // displaced geometry per metre driven; the fixed-footprint soil test also
  // isolates pressure at identical load/travel.
  assert(airedDown.excavatedVolumePerMeter < road.excavatedVolumePerMeter,
    'Lower pressure must reduce actual excavated volume per metre on this mud route');
  assert(airedDown.deepestRut < road.deepestRut * .8, 'The high-pressure tire must leave the deeper physical rut');
  assert(airedDown.distance > road.distance * 1.2);
});

test('a rendered tree trunk collider stops the chassis instead of allowing pass-through', () => {
  const terrain = ground();
  terrain.obstacles = [{ x: 0, z: 10, radius: 0.30, height: 8, type: 'tree' }];
  const physics = create(jeep, terrain);
  let furthest = 0;
  for (let i = 0; i < 720; i++) {
    physics.step(1 / 120, { throttle: 0.3 });
    furthest = Math.max(furthest, physics.state.position.z);
  }
  finiteState(physics.state);
  assert(furthest > 6 && furthest < 9);
  assert(physics.state.speedKmh < 1);
});

test('all six actual map surfaces can be driven without invalid or explosive states', () => {
  const terrain = new Terrain();
  for (const zone of terrain.zones) {
    const physics = new VehiclePhysics(terrain, jeep);
    physics.reset(zone.spawn);
    lowRange(physics, true);
    let maxVerticalSpeed = 0;
    for (let i = 0; i < 960; i++) {
      physics.step(1 / 120, { throttle: 0.35 });
      maxVerticalSpeed = Math.max(maxVerticalSpeed, Math.abs(physics.state.velocity.y));
      finiteState(physics.state);
    }
    assert(maxVerticalSpeed < 10, `${zone.id}: excessive vertical speed ${maxVerticalSpeed}`);
    assert(physics.state.odometer > 3, `${zone.id}: no usable forward movement`);
  }
});

test('HDC regulates a reverse descent as well as a forward descent', () => {
  function descend(enabled, reverse) {
    const physics = create(jeep, ground({ grade: reverse ? 0.30 : -0.30 }));
    lowRange(physics);
    if (reverse) physics.setControl('selector', 'R');
    physics.setControl('hillDescent', enabled);
    run(physics, 10);
    return physics.state;
  }
  const free = descend(false, true);
  const reverse = descend(true, true);
  const forward = descend(true, false);
  assert(free.speedKmh > 15);
  assert(reverse.speedKmh < 9 && reverse.speedKmh > 3);
  assert(forward.speedKmh < 9 && forward.speedKmh > 3);
  assert(reverse.velocity.z < 0);
  assert(forward.velocity.z > 0);
});

test('terrain programs select compatible hardware modes and retain low-range interlocks', () => {
  const bronco = VEHICLES.find(v => v.id === 'bronco-badlands');
  const physics = create(bronco);
  assert.equal(physics.state.terrainProgram, 'Normal');
  assert.equal(physics.setControl('terrainProgram', 'Slippery').ok, true);
  assert.equal(physics.state.driveMode, '4A');
  assert.equal(physics.setControl('terrainProgram', 'Sand').ok, true);
  assert.equal(physics.state.driveMode, '4H');
  assert.equal(physics.setControl('terrainProgram', 'Rock Crawl').ok, false);
  assert.equal(physics.state.terrainProgram, 'Sand');
  physics.setControl('selector', 'N');
  assert.equal(physics.setControl('terrainProgram', 'Rock Crawl').ok, true);
  assert.equal(physics.state.driveMode, '4L');
  assert.equal(physics.state.selector, 'N');
  assert.equal(physics.state.frontLocked, false);
  assert.equal(physics.state.rearLocked, false);
  assert.equal(physics.setControl('terrainProgram', 'Eco').ok, true);
  assert.equal(physics.state.driveMode, '2H');
  assert.equal(physics.setControl('terrainProgram', 'Sport').ok, false);
  assert.equal(create(civic).setControl('terrainProgram', 'Sand').ok, false);
});

test('ECON and Sport change pedal response while preserving full-pedal engine output', () => {
  function response(program, throttle) {
    const physics = create(civic);
    physics.setControl('selector', 'N');
    assert.equal(physics.setControl('terrainProgram', program).ok, true);
    return run(physics, 2, { throttle });
  }
  const ecoPart = response('ECON', 0.35), sportPart = response('Sport', 0.35);
  assert(sportPart.rpm > ecoPart.rpm * 1.15);
  assert(sportPart.engineTorque > ecoPart.engineTorque);
  const ecoFull = response('ECON', 1), sportFull = response('Sport', 1);
  assert(Math.abs(ecoFull.rpm - sportFull.rpm) < 1e-7);
  assert(Math.abs(ecoFull.engineTorque - sportFull.engineTorque) < 1e-7);
});

test('every catalogue vehicle tolerates actual map contacts and pressure changes in motion', () => {
  for (const spec of VEHICLES) {
    const terrain = new Terrain();
    for (const zone of terrain.zones) {
      const physics = new VehiclePhysics(terrain, spec);
      physics.reset(zone.spawn);
      if (spec.driveModes.includes('4L')) lowRange(physics);
      for (let i = 0; i < 600; i++) {
        if (i === 240) assert.equal(physics.setPressure(18, 20).ok, true);
        physics.step(1 / 120, { throttle: 0.35 });
        finiteState(physics.state);
        assert(Math.abs(physics.state.velocity.y) < 18, `${spec.id}/${zone.id}: unstable vertical contact`);
      }
      assert.equal(physics.state.frontPSI, 18);
      assert.equal(physics.state.rearPSI, 20);
      // Low-clearance road vehicles may physically high-center; finite contact
      // dynamics are required, universal off-road success is intentionally not.
      assert(physics.state.position.y > terrain.sample(physics.state.position.x, physics.state.position.z).height - spec.height);
    }
  }
});

test('Trail Control and one-pedal drive cannot fight each other', () => {
  const physics = create(VEHICLES.find(v => v.id === 'bronco-badlands'));
  physics.setControl('driveMode', '4H');
  assert.equal(physics.setControl('trailOnePedal', true).ok, true);
  assert.equal(physics.state.trailOnePedal, true);
  assert.equal(physics.setControl('trailControl', true).ok, true);
  assert.equal(physics.state.trailControl, true);
  assert.equal(physics.state.trailOnePedal, false);
  run(physics, 4);
  assert(physics.state.speedKmh > 3);
  assert.equal(physics.setControl('trailOnePedal', true).ok, true);
  assert.equal(physics.state.trailControl, false);
  assert.equal(physics.state.trailOnePedal, true);
  run(physics, 4);
  assert(physics.state.speedKmh < 0.5);
});

test('pending auto-reconnected stabilizer and auto-unlocked lockers remain explicitly cancelable', () => {
  const physics = create();
  lowRange(physics, true);
  physics.setControl('swayDisconnected', true);
  physics.body.velocity.z = 16; // Above Jeep's automatic reconnection/unlock limits.
  physics.step(1 / 120);
  for (const name of ['frontLocked', 'rearLocked', 'swayDisconnected']) {
    assert.equal(physics.state[name], false);
    assert.equal(physics.state.requestedControls[name], true);
  }
  // This is the requested-aware UI toggle, including while above the limit.
  for (const name of ['frontLocked', 'rearLocked', 'swayDisconnected']) {
    assert.equal(physics.setControl(name, !physics.state.requestedControls[name]).ok, true);
    assert.equal(physics.state.requestedControls[name], false);
  }
  physics.body.velocity.setZero();
  run(physics, 0.1);
  assert.equal(physics.state.frontLocked, false);
  assert.equal(physics.state.rearLocked, false);
  assert.equal(physics.state.swayDisconnected, false);
});

test('left and right steer every vehicle to the matching side of a rear camera at multiple headings', () => {
  for (const spec of VEHICLES) for (const heading of [0, Math.PI / 2]) for (const steer of [-0.55, 0.55]) {
    const physics = create(spec);
    physics.reset({ x: 0, z: 0, heading });
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading);
    const forward = new Vector3(0, 0, 1).applyQuaternion(rotation);
    const right = new Vector3(-1, 0, 0).applyQuaternion(rotation);
    const frontLeft = new Vector3(...Object.values(physics.state.wheels[0].position));
    const frontRight = new Vector3(...Object.values(physics.state.wheels[1].position));
    assert(frontRight.sub(frontLeft).dot(right) > spec.track * 0.9, 'FL / FR must match the driver viewpoint');
    run(physics, 2, { throttle: 0.35 });
    const start = new Vector3(...Object.values(physics.state.position));
    const camera = new PerspectiveCamera(51, 16 / 9, 0.1, 500);
    camera.position.copy(start).addScaledVector(forward, -12).add(new Vector3(0, 4, 0));
    camera.lookAt(start.clone().addScaledVector(forward, 15));
    camera.updateMatrixWorld(true);
    run(physics, 1.5, { throttle: 0.25, steer });
    const destination = new Vector3(...Object.values(physics.state.position));
    const sideDistance = destination.clone().sub(start).dot(right);
    const screen = destination.clone().project(camera);
    const label = `${spec.id}, heading ${heading}, steer ${steer}`;
    assert(sideDistance * Math.sign(steer) > 0.15, `${label}: trajectory must turn to the requested driver side`);
    assert(screen.x * Math.sign(steer) > 0, `${label}: rear camera must show the matching screen direction`);
    const q = physics.state.quaternion;
    const bodyRotation = new Quaternion(q.x, q.y, q.z, q.w);
    const bodyRight = new Vector3(-1, 0, 0).applyQuaternion(bodyRotation);
    for (const wheel of physics.state.wheels.slice(0, 2)) {
      // This is the same physical yaw quaternion consumed by VehicleView.
      const wheelRotation = bodyRotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), wheel.steer));
      const wheelForward = new Vector3(0, 0, 1).applyQuaternion(wheelRotation);
      assert(wheelForward.dot(bodyRight) * Math.sign(steer) > 0.05, `${label}: visible front wheels must point into the turn`);
    }
    const inside = steer > 0 ? 1 : 0, outside = 1 - inside;
    assert(Math.abs(physics.state.wheels[inside].steer) > Math.abs(physics.state.wheels[outside].steer), 'Ackermann must turn the inside wheel farther');
  }
});

test('holding brake stops every vehicle before Reverse, and forward pedal stops reverse before Drive', () => {
  for (const spec of VEHICLES) {
    const physics = create(spec);
    run(physics, 4, { throttle: 0.5, autoDirection: true });
    assert(physics.state.speed > 3, `${spec.id}: starts moving forward`);
    let reverseShifts = 0;
    for (let frame = 0; frame < 720; frame++) {
      const previous = physics.state;
      physics.step(1 / 120, { brake: 0.7, autoDirection: true });
      const state = physics.state;
      if (previous.selector !== state.selector) {
        reverseShifts++;
        assert.equal(state.selector, 'R');
        assert(Math.hypot(...Object.values(previous.velocity)) < 0.10, `${spec.id}: must stop before selecting R`);
        assert(previous.directionChangeHold > 0.95, 'Stop must be held continuously before shifting');
      }
      if (state.selector === 'D') {
        assert.equal(state.driverInput.throttle, 0);
        assert.equal(state.driverInput.brake, 0.7);
      }
    }
    assert.equal(reverseShifts, 1, `${spec.id}: exactly one D to R shift`);
    assert(physics.state.speed < -3, `${spec.id}: same held brake drives backward`);
    assert.equal(physics.state.driverInput.throttle, 0.7);
    assert.equal(physics.state.driverInput.brake, 0);
    assert.equal(physics.state.manualReverse, false);
    let driveShifts = 0;
    for (let frame = 0; frame < 960; frame++) {
      const previous = physics.state;
      physics.step(1 / 120, { throttle: 0.7, autoDirection: true });
      if (previous.selector !== physics.state.selector) {
        driveShifts++;
        assert.equal(physics.state.selector, 'D');
        assert(Math.hypot(...Object.values(previous.velocity)) < 0.10, `${spec.id}: must stop before selecting D`);
      }
      if (physics.state.selector === 'R') assert.equal(physics.state.driverInput.throttle, 0, 'Forward pedal brakes backward motion first');
    }
    assert.equal(driveShifts, 1);
    assert(physics.state.speed > 3, `${spec.id}: same held forward pedal drives forward`);
  }
});

test('releasing the direction pedal cancels a pending shift and removes reverse power immediately', () => {
  const physics = create();
  run(physics, 1);
  run(physics, 0.15, { brake: 1, autoDirection: true });
  assert.equal(physics.state.directionChangePending, 'R');
  assert.equal(physics.state.selector, 'D');
  run(physics, 0.8, { autoDirection: true });
  assert.equal(physics.state.selector, 'D');
  assert.equal(physics.state.directionChangePending, null);
  assert.equal(physics.state.directionChangeHold, 0);
  run(physics, 2, { brake: 1, autoDirection: true });
  assert(physics.state.speed < -1);
  const reversingSpeed = Math.abs(physics.state.speed);
  physics.step(1 / 120, { autoDirection: true });
  assert.equal(physics.state.selector, 'R');
  assert.equal(physics.state.driverInput.throttle, 0);
  assert.equal(physics.state.driverInput.brake, 0);
  assert.equal(physics.state.directionChangePending, null);
  run(physics, 1, { autoDirection: true });
  assert.equal(physics.state.selector, 'R');
  assert(Math.abs(physics.state.speed) < reversingSpeed * 0.99, 'Engine braking and rolling resistance must slow released reverse travel');
});

test('manual Reverse, Neutral, Park, both pedals and parking brake retain deliberate control', () => {
  for (const selector of ['N', 'P']) {
    const physics = create();
    physics.setControl('selector', selector);
    run(physics, 1.5, { brake: 1, autoDirection: true });
    assert.equal(physics.state.selector, selector);
    run(physics, 1.5, { throttle: 1, autoDirection: true });
    assert.equal(physics.state.selector, selector);
    assert(physics.state.speedKmh < 0.1);
  }
  const manual = create();
  assert.equal(manual.setControl('selector', 'R').ok, true);
  run(manual, 2, { throttle: 0.6, autoDirection: true });
  assert(manual.state.speed < -2);
  assert.equal(manual.state.manualReverse, true);
  run(manual, 3, { brake: 1, autoDirection: true });
  assert.equal(manual.state.selector, 'R');
  assert(manual.state.speedKmh < 0.1);
  assert.equal(manual.setControl('selector', 'D').ok, true);
  assert.equal(manual.state.manualReverse, false);
  run(manual, 2, { brake: 1, autoDirection: true });
  assert(manual.state.speed < -1);
  const both = create();
  run(both, 2, { throttle: 0.6, autoDirection: true });
  run(both, 4, { throttle: 1, brake: 1, autoDirection: true });
  assert.equal(both.state.selector, 'D');
  assert.equal(both.state.driverInput.throttle, 0);
  assert(both.state.speedKmh < 0.1);
  run(both, 1, { brake: 1, handbrake: true, autoDirection: true });
  assert.equal(both.state.selector, 'D');
  assert.equal(both.state.directionChangePending, null);
  run(both, 0.5, { throttle: 0.6, handbrake: true, autoDirection: true });
  assert(both.state.engineTorque > 20, 'Parking-brake use must still allow the accelerator in the selected direction');
});

test('direction assistance does not shift during lateral slides, flight, or with the engine off', () => {
  const sliding = create(jeep, ground({ mu: 0, rollingResistance: 0 }));
  sliding.body.velocity.x = 3;
  run(sliding, 1, { brake: 1, autoDirection: true });
  assert.equal(sliding.state.selector, 'D');
  assert(sliding.state.speed > 2);
  assert.equal(sliding.state.directionChangeHold, 0);
  const airborne = create();
  airborne.body.position.y += 10;
  run(airborne, 0.5, { brake: 1, autoDirection: true });
  assert.equal(airborne.state.selector, 'D');
  assert.equal(airborne.state.groundedWheels, 0);
  const off = create();
  off.setControl('engineOn', false);
  run(off, 1, { brake: 1, autoDirection: true });
  assert.equal(off.state.selector, 'D');
  assert.equal(off.state.directionChangePending, null);
});

test('forward pedal brakes an uphill rollback before applying forward engine torque', () => {
  const physics = create(jeep, ground({ grade: 0.25 }));
  physics.body.velocity.set(0, -0.5, -2);
  physics.step(1 / 120, { throttle: 1, autoDirection: true });
  assert.equal(physics.state.directionChangePending, 'D');
  assert.equal(physics.state.driverInput.throttle, 0);
  assert.equal(physics.state.driverInput.brake, 1);
  let sawStop = false, powered = false;
  for (let frame = 0; frame < 960; frame++) {
    const previous = physics.state;
    if (previous.speedKmh < 0.36) sawStop = true;
    physics.step(1 / 120, { throttle: 1, autoDirection: true });
    if (physics.state.driverInput.throttle > 0) {
      assert(sawStop, 'Rollback must reach a stop before forward power resumes');
      powered = true;
    }
  }
  assert(powered);
  assert(physics.state.velocity.z > 1, 'Vehicle should pull uphill after the stopped transition');
});

test('automatic pedal direction changes remain identical at 60 and 120 Hz render rates', () => {
  const a = create(), b = create();
  for (const [seconds, input] of [
    [3, { throttle: 0.6, autoDirection: true }],
    [5, { brake: 0.8, autoDirection: true }],
    [6, { throttle: 0.65, autoDirection: true }],
  ]) {
    run(a, seconds, input, 60); run(b, seconds, input, 120);
    assert.equal(a.state.selector, b.state.selector);
    assert(Math.abs(a.state.position.z - b.state.position.z) < 1e-7);
    assert(Math.abs(a.state.speed - b.state.speed) < 1e-7);
  }
});

test('ordinary terrain-specific constant turns settle with partial steering in both directions', () => {
  for (const [surface, material] of Object.entries(SURFACES)) {
    const outcomes = [];
    for (const steer of [-1, 1]) {
      const physics = create(jeep, ground({ ...material, surface }));
      run(physics, 1);
      // Match entry speed so this is a cornering check. A 2H launch through
      // marsh now spends real traction overcoming soil compaction and can take
      // much longer than the same launch on pavement or with 4WD engaged.
      physics.body.velocity.set(0, 0, 8);
      for (const wheel of physics._wheels) wheel.omega = 8 / wheel.radius;
      physics.step(1 / 120);
      // Request a normal turn below the surface's available lateral force.
      // Full driver input is tested separately as a deliberate limit maneuver;
      // physics no longer reduces that input to guarantee a safe corner.
      const steeringFraction = Math.atan(jeep.wheelbase * material.mu * 9.81 * 0.55 / (8 * 8)) / 0.59;
      const slip = [], yaw = [];
      for (let frame = 0; frame < 2040; frame++) {
        const speed = physics.state.speedKmh / 3.6;
        physics.step(1 / 120, { throttle: Math.max(0, Math.min(0.85, 0.18 + (8 - speed) * 0.3)), steer: frame > 600 ? steer * steeringFraction : 0 });
        if (frame > 1440) {
          slip.push(physics.state.wheels.reduce((sum, w) => sum + Math.abs(w.lateralSlip), 0) / 4);
          yaw.push(physics.state.angularVelocity.y);
          for (const w of physics.state.wheels) {
            assert(Math.hypot(w.longitudinalForce, w.lateralForce) <= w.frictionCoefficient * w.load + 1e-6,
              `${surface}: contact force exceeded its load-dependent friction budget`);
          }
        }
      }
      const meanSlip = slip.reduce((a, b) => a + b, 0) / slip.length;
      const meanYaw = yaw.reduce((a, b) => a + b, 0) / yaw.length;
      assert(meanSlip < 0.125, `${surface}: sustained mean tire slip ${meanSlip * 180 / Math.PI} degrees`);
      const nominalYaw = 8 * Math.tan(steeringFraction * 0.59) / jeep.wheelbase;
      assert(meanYaw * steer < -nominalYaw * 0.5, `${surface}: inadequate yaw response to ordinary steering`);
      assert(Math.max(...yaw) - Math.min(...yaw) < 0.04, `${surface}: turn did not settle`);
      assert(physics.state.speedKmh > 23, `${surface}: excessive tire scrub removed driving speed`);
      assert.equal(physics.state.steeringAssist.limited, false);
      assert.equal(physics.state.steeringAssist.limit, 0.59);
      assert.equal(physics.state.steeringAssist.mode, 'direct-analog');
      assert.equal(physics.state.damage.condition, 1, `${surface}: ordinary turning must not create damage`);
      outcomes.push({ meanSlip, meanYaw });
      run(physics, 3);
      assert(Math.abs(physics.state.angularVelocity.y) < 0.03, `${surface}: released steering left a yaw oscillation`);
    }
    assert(Math.abs(outcomes[0].meanSlip - outcomes[1].meanSlip) < 0.0001, `${surface}: asymmetric slip`);
    assert(Math.abs(outcomes[0].meanYaw + outcomes[1].meanYaw) < 0.0001, `${surface}: asymmetric cornering`);
  }
});

test('equal-speed coasting and braking retain the expected differences across all six materials', () => {
  const results = {};
  for (const [surface, material] of Object.entries(SURFACES)) {
    const initialize = () => {
      const physics = create(jeep, ground({ ...material, surface }));
      run(physics, 1); physics.setControl('selector', 'N');
      physics.body.velocity.set(0, 0, 12);
      for (const w of physics._wheels) w.omega = 12 / w.radius;
      return physics;
    };
    const coast = initialize();
    run(coast, 2);
    assert(Math.abs(coast.state.position.x) < 0.01, `${surface}: straight coasting acquired lateral drift`);
    const brake = initialize();
    const start = brake.body.position.z;
    run(brake, 6, { brake: 1 });
    assert(brake.state.speedKmh < 0.3, `${surface}: brakes failed to stop`);
    assert(Math.abs(brake.state.position.x) < 0.01, `${surface}: straight braking acquired lateral drift`);
    results[surface] = { coast: coast.state.speedKmh, stopping: brake.state.position.z - start };
  }
  assert(results.asphalt.coast > results.dirt.coast && results.dirt.coast > results.rock.coast);
  assert(results.rock.coast > results.sand.coast && results.sand.coast > results.mud.coast);
  assert(results.mud.coast > results.wetland.coast);
  assert(results.mud.stopping > results.asphalt.stopping * 1.7);
  assert(results.wetland.stopping > results.dirt.stopping * 1.3);
  assert(results.sand.stopping > results.rock.stopping * 1.05);
});

test('tire forces arrest a sideways slide according to terrain grip but do not cancel airborne velocity', () => {
  const slides = {};
  for (const surface of ['asphalt', 'mud']) {
    const physics = create(jeep, ground({ ...SURFACES[surface], surface }));
    run(physics, 1); physics.setControl('selector', 'N');
    physics.body.velocity.set(5, 0, 0);
    run(physics, 0.5);
    slides[surface] = Math.abs(physics.state.velocity.x);
  }
  assert(slides.asphalt < slides.mud * 0.65, 'Paved grip should remove lateral sliding faster than mud');
  const airborne = create();
  airborne.body.position.y += 20; airborne.body.velocity.set(5, 0, 0);
  run(airborne, 0.5, { steer: 1, brake: 1 });
  assert.equal(airborne.state.groundedWheels, 0);
  assert(airborne.state.velocity.x > 4.9, 'Contact-free motion must retain lateral momentum');
});

test('loaded tire geometry grows with lower pressure and reports the terrain support under each tread', () => {
  const observations = [];
  for (const pressure of [37, 18, 8]) {
    const physics = create(); physics.setPressure(pressure); run(physics, 4);
    const wheel = physics.state.wheels[0];
    observations.push(wheel);
    assert(Math.abs(wheel.radius + wheel.deflection - wheel.unloadedRadius) < 1e-10);
    assert(Math.abs(wheel.contactArea - wheel.contactLength * wheel.contactWidth * Math.PI / 4) < 1e-10);
    assert.equal(wheel.contactProfile.length, 9);
    assert(wheel.normal.y > 0.999);
    for (const point of wheel.contactProfile) assert.equal(point.y, 0);
    assert(wheel.contactProfile[0].z < wheel.contactProfile[3].z && wheel.contactProfile[3].z < wheel.contactProfile[6].z);
    assert(wheel.contactProfile[0].x > wheel.contactProfile[1].x && wheel.contactProfile[1].x > wheel.contactProfile[2].x);
    physics.body.position.y += 5; physics.step(1 / 120, {});
    for (const lifted of physics.state.wheels) {
      assert.equal(lifted.contact, false); assert.equal(lifted.deflection, 0);
      assert.equal(lifted.radius, lifted.unloadedRadius); assert.equal(lifted.contactArea, 0);
      assert.deepEqual(lifted.contactProfile, []);
    }
  }
  assert(observations[1].deflection > observations[0].deflection * 1.5);
  assert(observations[2].deflection > observations[1].deflection * 1.5);
  assert(observations[2].contactLength > observations[1].contactLength && observations[1].contactLength > observations[0].contactLength);
  assert(observations[2].contactWidth > observations[0].contactWidth);
});

test('a ridge under the edge of the footprint physically supports the tire even when its center ray misses', () => {
  let ridge = false;
  const physics = create(jeep, ground({ at(x, z) {
    return ridge && x > 0.88 && x < 1.02 && z > 1.2 && z < 1.65 ? { height: 0.07 } : {};
  } }));
  run(physics, 2);
  const before = physics.state.wheels[0];
  ridge = true;
  physics._collectContacts(1 / 120); physics._publishState();
  const after = physics.state.wheels[0];
  assert.equal(physics.terrain.sample(before.ground.x, before.ground.z).height, 0, 'Center ray fixture should miss the ridge');
  assert(after.contactProfile.some(point => point.y > 0.05));
  assert(after.ground.y > before.ground.y + 0.02, 'The sampled ridge must raise support, not just the visual mesh');
  assert(after.load > before.load + 500, 'Ridge must compress the physical suspension');
});

test('high-speed front-steering racks retain authority while saturated tires limit the actual turn', () => {
  for (const spec of VEHICLES) {
    for (const sign of [-1, 1]) {
      const physics = rollingFixture(spec, 25, undefined, spec.features?.fourWheelSteer ? { rearSteer: 'off' } : {});
      for (let frame = 0; frame < 120; frame++) {
        physics.step(1 / 120, { steer: sign });
        assertTireBudget(physics.state, spec.id);
      }
      const state = physics.state;
      assert.equal(state.steeringAssist.limited, false);
      assert.equal(state.steeringAssist.limit, 0.59);
      assert(state.steeringAssist.angle * sign < -0.55, `${spec.id}: the analog rack command was silently capped`);
      assert(state.wheels.slice(0, 2).every(wheel => (wheel.steer - wheel.complianceSteer) * sign < -0.45), `${spec.id}: the full rack command did not reach the physical steering geometry`);
      assert(state.wheels.slice(0, 2).every(wheel => wheel.steer * sign < -0.40), `${spec.id}: loaded steering compliance removed excessive driver authority`);
      assert(state.wheels.slice(0, 2).every(wheel => Math.abs(wheel.lateralSlip) > 0.4), `${spec.id}: a full-lock highway turn should exceed front grip`);
      const nominalYaw = state.speedKmh / 3.6 * Math.tan(Math.abs(state.steeringAssist.angle)) / spec.wheelbase;
      assert(state.angularVelocity.y * sign < -0.2, `${spec.id}: the vehicle must still respond in the requested direction`);
      assert(Math.abs(state.angularVelocity.y) < nominalYaw * 0.4, `${spec.id}: saturation must prevent a kinematic full-lock turn at highway speed`);
      finiteState(state);
    }
  }
});

test('full low-speed steering does not spontaneously overturn or damage any catalogue vehicle', () => {
  for (const spec of VEHICLES) {
    const physics = create(spec, ground({ ...SURFACES.asphalt }));
    run(physics, 1);
    let maxRoll = 0;
    for (let frame = 0; frame < 1200; frame++) {
      const speed = physics.state.speedKmh / 3.6;
      physics.step(1 / 120, { throttle: Math.max(0, Math.min(0.5, 0.12 + (3 - speed) * 0.35)), steer: 1 });
      maxRoll = Math.max(maxRoll, Math.abs(physics.state.roll));
      assertTireBudget(physics.state, spec.id);
    }
    assert(maxRoll < 0.1, `${spec.id}: ordinary low-speed cornering produced ${maxRoll * 180 / Math.PI} degrees of roll`);
    assert.equal(physics.state.groundedWheels, 4, spec.id);
    assert.equal(physics.state.damage.condition, 1, spec.id);
    assert(physics.state.speedKmh > 9, `${spec.id}: stability must not come from stopping the car`);
  }
});

test('a fast steering reversal can physically overturn the tall van in either direction', () => {
  for (const sign of [-1, 1]) {
    const physics = rollingFixture(sprinter, 25);
    let minUp = 1, minContacts = 4, maxRoll = 0;
    for (let frame = 0; frame < 480; frame++) {
      physics.step(1 / 120, { steer: frame < 72 ? sign : -sign });
      const q = physics.state.quaternion;
      minUp = Math.min(minUp, 1 - 2 * (q.x * q.x + q.z * q.z));
      maxRoll = Math.max(maxRoll, Math.abs(physics.state.roll));
      minContacts = Math.min(minContacts, physics.state.groundedWheels);
      assertTireBudget(physics.state, 'Sprinter steering reversal');
      finiteState(physics.state);
    }
    assert(minUp < -0.25 && maxRoll > Math.PI / 2, 'The chassis must pass vertical through its integrated rigid-body motion');
    assert.equal(minContacts, 0, 'Overturning must unload the physical tire contacts');
  }
});

test('a low obstacle can trip a sideways slide into rollover while an unobstructed slide stays upright', () => {
  for (const direction of [-1, 1]) {
    for (const hasCurb of [false, true]) {
      const terrain = ground({ ...SURFACES.asphalt });
      if (hasCurb) terrain.obstacles = [{ id: 'side-curb', type: 'rock', shape: 'box', center: { x: direction * 2, y: 0.22, z: 0 }, halfExtents: { x: 0.18, y: 0.22, z: 7 } }];
      const physics = rollingFixture(jeep, 0, terrain);
      physics.body.velocity.set(direction * 12, 0, 0);
      let minUp = 1, maxRoll = 0, minContacts = 4, overturnedSubsteps = 0, maxHeight = 0;
      for (let frame = 0; frame < 480; frame++) {
        physics.step(1 / 120, {});
        const q = physics.state.quaternion;
        minUp = Math.min(minUp, 1 - 2 * (q.x * q.x + q.z * q.z));
        maxRoll = Math.max(maxRoll, Math.abs(physics.state.roll));
        minContacts = Math.min(minContacts, physics.state.groundedWheels);
        if (1 - 2 * (q.x * q.x + q.z * q.z) < 0) overturnedSubsteps++;
        maxHeight = Math.max(maxHeight, physics.state.position.y);
        finiteState(physics.state);
      }
      if (hasCurb) {
        // Raised bumper/finite sidewall geometry changes the precise final
        // angle. Gate a sustained physical overturn, not the old box's120°.
        assert(minUp < -0.25 && maxRoll > Math.PI / 2 + .2, 'An actual low contact impulse should overturn the chassis');
        assert.equal(minContacts, 0, 'The trip must unload the real tire contacts');
        assert(overturnedSubsteps > 12 && maxHeight < 2.5, 'A sustained trip must replace the erroneous vertical launch');
        assert(physics.state.impacts.some(impact => impact.obstacleId === 'side-curb' && impact.speed > 8));
        assert(physics.state.damage.condition < 1);
      } else {
        assert(maxRoll < 0.2 && minUp > 0.98, 'Sideways speed alone must not trigger rollover');
        assert.equal(physics.state.damage.condition, 1);
      }
    }
  }
});

test('held parking brakes distinguish mechanical rear lock from electronic all-wheel dynamic braking and release', () => {
  for (const spec of VEHICLES) {
    const physics = rollingFixture(spec, 15);
    run(physics, 0.5, { handbrake: true });
    const state = physics.state;
    assert.equal(state.selector, 'N', 'The parking brake must not invoke automatic Reverse');
    assert.equal(state.parkingBrake.active, true);
    assert(state.speedKmh > 30, 'Check wheel locking while the chassis is still moving');
    if (spec.parkingBrake.type === 'mechanical') {
      assert.equal(state.parkingBrake.mode, 'rear-mechanical');
      assert.deepEqual(state.parkingBrake.wheels, [false, false, true, true]);
      assert(state.wheels.slice(0, 2).every(wheel => wheel.omega > 20 && Math.abs(wheel.slip) < 0.02));
      assert(state.wheels.slice(2).every(wheel => Math.abs(wheel.omega) < 0.05 && wheel.slip < -0.98), `${spec.id}: service ABS incorrectly prevented the mechanical rear lock`);
    } else {
      assert.equal(state.parkingBrake.mode, 'all-wheel-abs');
      assert.deepEqual(state.parkingBrake.wheels, [true, true, true, true]);
      assert(state.wheels.every(wheel => wheel.omega > 15 && wheel.slip > -0.3 && wheel.slip < -0.05
        && wheel.longitudinalForce < -wheel.load * 0.3), `${spec.id}: electronic emergency braking must brake all four wheels without locking them`);
      // A high-grip, heavily loaded front contact may carry the requested
      // brake torque without reaching intervention. ABS need only reduce the
      // channels that would exceed available grip; it must not pulse them all.
      assert(state.wheels.some(wheel => wheel.absActive), `${spec.id}: the limiting contacts should receive ABS modulation`);
    }
    assertTireBudget(state, spec.id);
    run(physics, 0.5);
    assert.equal(physics.state.parkingBrake.active, false);
    assert.equal(physics.state.parkingBrake.mode, 'released');
    assert.deepEqual(physics.state.parkingBrake.wheels, [false, false, false, false]);
    assert(physics.state.wheels.every(wheel => wheel.omega > 15 && Math.abs(wheel.slip) < 0.03), `${spec.id}: a released brake remained locked`);
    run(physics, 6, { handbrake: true });
    assert(physics.state.speedKmh < 0.1, `${spec.id}: parking brake did not come to rest`);
    if (spec.parkingBrake.type === 'electronic') assert.equal(physics.state.parkingBrake.mode, 'rear-hold');
  }
});

test('mechanical rear-wheel locking consumes cornering grip and produces physical oversteer', () => {
  const outcomes = [];
  for (const handbrake of [false, true]) {
    const physics = rollingFixture(jeep, 15);
    run(physics, 1, { steer: 0.2 });
    for (let frame = 0; frame < 96; frame++) {
      physics.step(1 / 120, { steer: 0.2, handbrake });
      assertTireBudget(physics.state, 'Rear lock in a turn');
    }
    const angle = Math.atan2(physics.state.velocity.x, physics.state.velocity.z) - physics.state.heading;
    const bodySlip = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    if (handbrake) assert(physics.state.wheels.slice(2).every(wheel => Math.abs(wheel.omega) < 0.06));
    outcomes.push({ bodySlip, yaw: Math.abs(physics.state.angularVelocity.y) });
  }
  assert(outcomes[0].bodySlip < 0.15, 'The same partial turn without the brake should be stable');
  assert(outcomes[1].bodySlip > 0.4, 'Locked rear tires must not retain their full lateral cornering grip');
  assert(outcomes[1].yaw > outcomes[0].yaw * 2, 'The changed yaw must arise from rear tire force loss');
});

test('normal traction control preserves powered steering on grass and mud without stopping the vehicle', () => {
  for (const spec of VEHICLES) for (const surface of ['grass', 'mud']) for (const sign of [-1, 1]) {
    const material = surface === 'grass'
      ? { ...surfaceResponse('dirt', { grassFraction: 1 }), surface: 'dirt', surfaceDetail: 'grass', grassFraction: 1 }
      : { ...SURFACES.mud, surface: 'mud' };
    const physics = rollingFixture(spec, 6, ground(material));
    physics.setControl('selector', 'D');
    let maximumSlip = 0, minimumScale = 1;
    for (let frame = 0; frame < 720; frame++) {
      const state = physics.step(1 / 120, { throttle: 0.7, steer: frame >= 120 ? 0.12 * sign : 0 });
      maximumSlip = Math.max(maximumSlip, bodySlipDegrees(physics));
      minimumScale = Math.min(minimumScale, state.tractionIntervention.torqueScale);
      assertTireBudget(state, `${spec.id}/${surface}`);
      assert(state.engineTorque <= state.requestedEngineTorque + 1e-9);
    }
    assert(maximumSlip < 10, `${spec.id}/${surface}: normal powered input produced ${maximumSlip} degrees of sustained side slip`);
    assert(physics.state.speed > 6, `${spec.id}/${surface}: stability was achieved by stopping acceleration`);
    assert(minimumScale < 0.98, `${spec.id}/${surface}: common wheelspin did not engage engine torque control`);
    assert(physics.state.angularVelocity.y * sign < -0.06, `${spec.id}/${surface}: a stable car must still execute the turn`);
    assert.equal(physics.state.damage.condition, 1);
    run(physics, 2);
    assert(bodySlipDegrees(physics) < 1.5, `${spec.id}/${surface}: release did not recover the rolling tires`);
  }
});

test('traction control reduces common wheelspin rather than changing available road grip or hiding driver-requested power', () => {
  const bronco = VEHICLES.find(spec => spec.id === 'bronco-badlands');
  const material = { ...surfaceResponse('dirt', { grassFraction: 1 }), surface: 'dirt', grassFraction: 1 };
  const outcomes = [];
  for (const enabled of [false, true]) {
    const physics = rollingFixture(bronco, 6, ground(material));
    physics.setControl('selector', 'D'); physics.setControl('tractionControl', enabled);
    let slip = 0, samples = 0, maximumBodySlip = 0, minScale = 1;
    for (let frame = 0; frame < 720; frame++) {
      const state = physics.step(1 / 120, { throttle: 0.7, steer: frame >= 120 ? 0.12 : 0 });
      if (frame > 240) {
        slip += state.wheels.slice(2).reduce((sum, wheel) => sum + Math.abs(wheel.slip), 0) * 0.5; samples++;
      }
      maximumBodySlip = Math.max(maximumBodySlip, bodySlipDegrees(physics));
      minScale = Math.min(minScale, state.tractionIntervention.torqueScale);
      if (!enabled) assert.equal(state.engineTorque, state.requestedEngineTorque);
    }
    outcomes.push({ slip: slip / samples, maximumBodySlip, minScale });
  }
  assert(outcomes[1].slip < outcomes[0].slip * 0.45, 'Engine traction control must reduce actual powered wheelspin');
  assert(outcomes[0].maximumBodySlip > 20 && outcomes[1].maximumBodySlip < 10,
    'Turning off traction assistance must retain deliberate loss of grip');
  assert.equal(outcomes[0].minScale, 1);

  const free = rollingFixture(bronco, 12), controlled = rollingFixture(bronco, 12);
  free.setControl('tractionControl', false);
  free.setControl('selector', 'D'); controlled.setControl('selector', 'D');
  for (let frame = 0; frame < 360; frame++) {
    free.step(1 / 120, { throttle: 0.3, steer: 0.035 });
    controlled.step(1 / 120, { throttle: 0.3, steer: 0.035 });
    assert.equal(controlled.state.tractionIntervention.torqueScale, 1, 'A normally rolling road tire must retain full requested torque');
    assert.equal(controlled.state.engineTorque, controlled.state.requestedEngineTorque);
    assert(Math.abs(free.body.position.x - controlled.body.position.x) < 1e-8);
    assert(Math.abs(free.body.position.z - controlled.body.position.z) < 1e-8);
  }
});

test('traction torque control clears its state on neutral, engine stop, assist disable and reset', () => {
  const bronco = VEHICLES.find(spec => spec.id === 'bronco-badlands');
  const grass = ground({ ...surfaceResponse('dirt', { grassFraction: 1, moisture: 1 }), surface: 'dirt', grassFraction: 1 });
  for (const action of ['neutral', 'engine', 'disabled', 'reset']) {
    const physics = rollingFixture(bronco, 4, grass);
    physics.setControl('selector', 'D'); run(physics, 2, { throttle: 1 });
    assert(physics.state.tractionIntervention.torqueScale < 0.8, 'Fixture must establish an active power cut');
    if (action === 'neutral') physics.setControl('selector', 'N');
    if (action === 'engine') physics.setControl('engineOn', false);
    if (action === 'disabled') physics.setControl('tractionControl', false);
    if (action === 'reset') physics.reset(ORIGIN);
    assert.equal(physics.state.tractionIntervention.torqueScale, 1, `${action}: old wheelspin retained an engine cut`);
    assert.equal(physics.state.tractionIntervention.active, false);
    physics.step(1 / 120, {});
    assert.equal(physics.state.tractionIntervention.active, false, 'Coasting/engine braking must not engage a positive-power controller');
  }
});

test('a straddling tire shares footprint materials and soil resistance remains separate and dissipative', () => {
  const seam = ground({ at(x) {
    return x > 0.81 ? { ...surfaceResponse('asphalt'), surface: 'asphalt', surfaceDetail: 'asphalt' }
      : { ...surfaceResponse('dirt', { grassFraction: 1 }), surface: 'dirt', surfaceDetail: 'grass', grassFraction: 1 };
  } });
  const mixed = create(jeep, seam); run(mixed, 1);
  const wheel = mixed.state.wheels[0];
  assert(wheel.surfaceMix.asphalt > 0 && wheel.surfaceMix.asphalt < 1);
  assert(wheel.surfaceMix.grass > 0 && wheel.surfaceMix.grass < 1);
  assert(Math.abs(Object.values(wheel.surfaceMix).reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
  const contactMu = mixed._wheels[0].data.mu;
  assert(contactMu > surfaceResponse('dirt', { grassFraction: 1 }).mu && contactMu < SURFACES.asphalt.mu,
    'A material edge must not switch the entire contact to its center-ray category');

  const material = { ...SURFACES.mud, surface: 'mud', sink: 0.13 };
  const drag = create(jeep, ground(material)), noDrag = create(jeep, ground({ ...material, soil: { ...material.soil, lateralScale: 0 } }));
  for (const physics of [drag, noDrag]) { run(physics, 1); physics.setControl('selector', 'N'); physics.body.velocity.set(4, 0, 3); }
  let work = 0, active = 0;
  for (let frame = 0; frame < 45; frame++) {
    drag.step(1 / 120); noDrag.step(1 / 120);
    for (const raw of drag._wheels) {
      assert(raw.soilLateralForce * raw.speedLat <= 1e-9, 'Passive rut-wall resistance cannot propel a lateral slide');
      work += raw.soilLateralForce * raw.speedLat / 120;
      if (Math.abs(raw.soilLateralForce) > 1) active++;
    }
    assertTireBudget(drag.state, 'Tread shear excludes passive soil resistance');
  }
  assert(active > 0 && work < -30);
  assert(drag.body.velocity.length() < noDrag.body.velocity.length(), 'Buried sidewall resistance must remove actual chassis energy');
  drag.body.position.y += 10; drag.step(1 / 120);
  assert(drag.state.wheels.every(wheel => !wheel.contact && wheel.soilLateralForce === 0), 'Airborne tires must not retain soil drag');
});

test('soft-ground resistance remains passive with locked tires and does not defeat service ABS', () => {
  for (const materialId of ['mud', 'gravel']) {
    const base = materialId === 'mud' ? surfaceResponse('mud') : surfaceResponse('dirt', { gravelFraction: 1 });
    const results = {};
    for (const direction of [-1, 1]) for (const rollingResistance of [0.02, 0.20]) for (const mode of ['abs', 'locked', 'rear']) {
      const terrain = ground({ ...base, surface: materialId === 'mud' ? 'mud' : 'dirt',
        sink: materialId === 'mud' ? 0.12 : 0.025, rollingResistance,
        soil: { ...base.soil, rollingResistance: rollingResistance * (materialId === 'mud' ? 0.85 : 0.65) } });
      const physics = rollingFixture(jeep, direction * 8, terrain);
      if (mode === 'locked') physics.controls.abs = false;
      let soilWork = 0;
      for (let frame = 0; frame < 60; frame++) {
        physics.step(1 / 120, mode === 'rear' ? { handbrake: true } : { brake: 1 });
        assertTireBudget(physics.state, `${materialId}/${mode}: soil resistance is separate from tread friction`);
        for (const wheel of physics._wheels) {
          const workRate = wheel.soilLongitudinalForce * wheel.speedLong + wheel.soilLateralForce * wheel.speedLat;
          assert(workRate <= 1e-8, 'Neither soil component may propel its contact point');
          soilWork += workRate / 120;
        }
      }
      assert(soilWork < -100, 'Ground deformation must dissipate energy even when a wheel is locked');
      const wheels = physics.state.wheels;
      if (mode === 'abs') {
        assert(wheels.every(wheel => Math.abs(wheel.omega) > 8 && Math.abs(wheel.slip) > 0.08 && Math.abs(wheel.slip) < 0.23),
          `${materialId}: soil resistance bypassed ABS and locked a modulated tire`);
        assert(wheels.some(wheel => wheel.absActive));
      } else {
        const locked = mode === 'rear' ? wheels.slice(2) : wheels;
        assert(locked.every(wheel => Math.abs(wheel.omega) < 0.05 && Math.abs(wheel.slip) > 0.98));
        if (mode === 'rear') assert(wheels.slice(0, 2).every(wheel => Math.abs(wheel.omega) > 10), 'A rear cable must leave the fronts free to roll');
      }
      results[`${direction}/${rollingResistance}/${mode}`] = Math.abs(physics.state.speed);
    }
    for (const direction of [-1, 1]) for (const mode of ['abs', 'locked', 'rear']) {
      assert(results[`${direction}/0.2/${mode}`] < results[`${direction}/0.02/${mode}`] - 0.25,
        `${materialId}/${mode}: increased ground resistance disappeared once the wheel stopped rotating`);
    }
    // The chassis has a real fore/aft weight bias. All-wheel braking should
    // nevertheless preserve the same longitudinal soil law in either travel
    // direction; rear-only braking need not have identical load transfer.
    for (const resistance of [0.02, 0.20]) for (const mode of ['abs', 'locked']) {
      assert(Math.abs(results[`1/${resistance}/${mode}`] - results[`-1/${resistance}/${mode}`]) < 0.05);
    }
  }
});

test('soil drag decays safely through zero speed and clears when its tire leaves the ground', () => {
  const material = { ...SURFACES.mud, surface: 'mud', sink: 0.18, rollingResistance: 0.20,
    soil: { ...SURFACES.mud.soil, rollingResistance: 0.17 } };
  for (const direction of [-1, 0, 1]) {
    const physics = rollingFixture(jeep, direction * 0.01, ground(material));
    let maximumSpeed = Math.abs(physics.state.speed);
    for (let frame = 0; frame < 600; frame++) {
      physics.step(1 / 120);
      maximumSpeed = Math.max(maximumSpeed, Math.abs(physics.state.speed));
      finiteState(physics.state);
      for (const wheel of physics._wheels) {
        assert(wheel.soilLongitudinalForce * wheel.speedLong <= 1e-9);
        assert(wheel.soilLateralForce * wheel.speedLat <= 1e-9);
      }
    }
    assert(maximumSpeed < 0.0101, 'The soil contact impulse created speed while crossing standstill');
    assert(Math.abs(physics.state.speed) < 0.0001, 'A settled vehicle must not retain soil-induced creep');
    physics.body.velocity.set(1, 0, 3); physics.step(1 / 120);
    assert(physics.state.wheels.some(wheel => wheel.soilDragForce > 1));
    physics.body.position.y += 10; physics.step(1 / 120);
    assert(physics.state.wheels.every(wheel => !wheel.contact && wheel.soilLongitudinalForce === 0
      && wheel.soilLateralForce === 0 && wheel.soilDragForce === 0));
  }
});

test('large tire slip reduces contact retention and releasing it restores peak grip without an artificial velocity reset', () => {
  const physics = rollingFixture(jeep, 15);
  run(physics, 0.5, { handbrake: true });
  assert(physics.state.wheels.slice(2).every(wheel => wheel.slidingGripRetention < 0.94));
  assert(physics.state.wheels.slice(0, 2).every(wheel => wheel.slidingGripRetention > 0.995));
  assert(physics.state.speed > 10, 'The test must measure sliding while still moving');
  for (const wheel of physics.state.wheels) {
    assert(wheel.frictionCoefficient <= wheel.peakFrictionCoefficient + 1e-10);
    assert(Math.abs(wheel.frictionCoefficient / wheel.peakFrictionCoefficient - wheel.slidingGripRetention) < 1e-10);
  }
  run(physics, 1);
  assert(physics.state.wheels.every(wheel => Math.abs(wheel.slip) < 0.02 && wheel.slidingGripRetention > 0.995));
  assert(physics.state.speed > 10, 'Tire recovery must come from rolling contact, not stopping the chassis');
});

test('external force providers run with the live pose every fixed substep and persist across vehicle resets', () => {
  const physics = create(jeep);
  physics.body.position.y += 20;
  const calls = [];
  const provider = (dt, livePhysics) => {
    assert.equal(dt, 1 / 120);
    assert.equal(livePhysics, physics);
    calls.push({ x: livePhysics.body.position.x, id: livePhysics.spec.id });
    livePhysics.body.applyForce(livePhysics.body.position.clone().set(livePhysics.spec.mass * 3, 0, 0));
  };
  physics.setExternalForceProvider(provider);
  physics.step(1 / 60, {});
  assert.equal(calls.length, 2);
  assert(calls[1].x > calls[0].x, 'The provider must see the new substep pose, not a cached frame force');
  assert(Math.abs(physics.state.velocity.x - 3 / 60) < 1e-5, 'Force must be applied before integration on both ticks');
  physics.reset(ORIGIN);
  physics.step(1 / 120, {});
  assert.equal(calls.length, 3);
  physics.setVehicle(civic, ORIGIN);
  physics.step(1 / 120, {});
  assert.equal(calls.length, 4);
  assert.equal(calls.at(-1).id, civic.id);
  physics.setExternalForceProvider(null);
  physics.step(1 / 60, {});
  assert.equal(calls.length, 4);
  assert.throws(() => physics.setExternalForceProvider({}), TypeError);
});

test('a pose-dependent external hook force has fixed-step parity at 30, 60 and 120 Hz', () => {
  const outcomes = [];
  for (const hz of [30, 60, 120]) {
    const physics = create(jeep);
    physics.body.position.y += 20;
    let calls = 0, peakYawRate = 0;
    physics.setExternalForceProvider((dt, livePhysics) => {
      calls++;
      const body = livePhysics.body;
      peakYawRate = Math.max(peakYawRate, Math.abs(body.angularVelocity.y));
      const localHook = body.position.clone().set(0, -0.2, 1.5);
      const relativeHook = body.quaternion.vmult(localHook);
      const hook = body.position.vadd(relativeHook);
      const force = body.position.clone().set((8 - hook.x) * 1800, 0, (12 - hook.z) * 1800);
      body.applyForce(force, relativeHook);
    });
    run(physics, 1, {}, hz);
    assert.equal(calls, 120);
    assert(peakYawRate > 0.1, 'An offset live hook must generate chassis torque as the chassis turns toward the pull');
    outcomes.push(physics.state);
  }
  for (const state of outcomes.slice(1)) {
    for (const property of ['position', 'velocity', 'quaternion', 'angularVelocity']) {
      for (const axis of Object.keys(state[property])) assert(Math.abs(state[property][axis] - outcomes[0][property][axis]) < 1e-10, `${property}.${axis}: external forces depended on render rate`);
    }
  }
});
