import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics } from '../dist/src/physics.js';
import { electricMotorOutput, electricRearSteer } from '../dist/src/electric-drive.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { SURFACES } from '../dist/src/terrain.js';

const spec = VEHICLES.find(vehicle => vehicle.id === 'hummer-ev-suv-3x');
const ratedPower = spec.powerHP * 745.699872, efficiency = spec.drivetrain?.efficiency ?? .94;
const report = {};
const ground = { sample() { return { ...SURFACES.asphalt, height: 0, normal: { x: 0, y: 1, z: 0 }, waterDepth: 0, softness: 0, maxSink: 0 }; } };
const run = (physics, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) physics.step(1 / 120, input);
  return physics.state;
};
function make() { const physics = new VehiclePhysics(ground, spec); physics.reset({ x: 0, z: 0, heading: 0 }); run(physics, 2); return physics; }
function rolling(speed = 12) {
  const physics = make(); physics.body.velocity.set(0, 0, speed);
  for (const wheel of physics._wheels) wheel.omega = speed / wheel.radius;
  return physics;
}
const wheelsAt = omegas => omegas.map((omega, index) => ({ omega, radius: spec.tireRadius, speedLong: omega * spec.tireRadius,
  contact: true, load: spec.mass * 9.81 / 4, capacity: spec.mass * 9.81 / 4 * .9, index }));
const sum = values => values.reduce((a, b) => a + b, 0);
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('three motor reductions apply once and the unequal-speed envelope respects shaft power', () => {
  const low = wheelsAt([2, 2, 2, 2]);
  const peak = electricMotorOutput(spec, low, { throttle: 1, launch: true });
  const normal = electricMotorOutput(spec, low, { throttle: 1 });
  near(sum(peak.wheelTorques), spec.wheelTorqueNm * efficiency, 1e-7, 'The advertised wheel torque must not be reduced again');
  assert.ok(sum(normal.wheelTorques) > .7 * sum(peak.wheelTorques) && sum(normal.wheelTorques) < sum(peak.wheelTorques));
  near(peak.wheelTorques[0], peak.wheelTorques[1], 1e-9, 'One front motor supplies equal open-differential torque');
  near(peak.wheelTorques[2], peak.wheelTorques[3], 1e-9, 'Equal rear speeds give equal rear output');
  let maximumPower = 0;
  for (let i = 0; i < 420; i++) {
    const wheels = wheelsAt([i * .42, i * .19, i * .36, i * .73]);
    for (const launch of [false, true]) {
      const output = electricMotorOutput(spec, wheels, { throttle: 1, launch });
      maximumPower = Math.max(maximumPower, output.positivePowerW);
      assert.ok(output.positivePowerW <= ratedPower + 1e-6);
      assert.ok(sum(output.wheelTorques.map((torque, j) => torque * wheels[j].omega)) <= ratedPower * efficiency + 1e-6);
      assert.ok(output.wheelTorques.every(torque => Number.isFinite(torque) && torque >= 0));
    }
  }
  const limit = spec.electric.maxMotorRPM * Math.PI / 30;
  const cutoff = electricMotorOutput(spec, wheelsAt([limit / spec.electric.frontReduction, limit / spec.electric.frontReduction, limit / spec.electric.rearReduction, limit / spec.electric.rearReduction]), { throttle: 1, launch: true });
  assert.ok(cutoff.wheelTorques.every(torque => Math.abs(torque) < 1e-7));
  report.motorEnvelope = { ratedShaftKW: ratedPower / 1000, maximumSampledKW: maximumPower / 1000, nominalWheelTorqueNm: spec.wheelTorqueNm,
    deliveredPeakWheelTorqueNm: sum(peak.wheelTorques), normalWheelTorqueNm: sum(normal.wheelTorques), frontReduction: spec.electric.frontReduction, rearReduction: spec.electric.rearReduction };
});

test('electric drive has no idle creep, Neutral power, or extra ICE reduction', () => {
  const physics = make(), original = { ...physics.body.position };
  run(physics, 3); assert.ok(physics.body.velocity.length() < .001); assert.ok(physics.state.rpm < .01);
  assert.ok(physics._wheels.every(wheel => Math.abs(wheel.driveTorque) < 1e-8));
  assert.equal(physics.setControl('selector', 'N').ok, true); run(physics, 2, { throttle: 1 });
  assert.equal(physics.state.powerKW, 0); assert.ok(physics.body.position.distanceTo(original) < .005);
  assert.ok(physics._wheels.every(wheel => Math.abs(wheel.driveTorque) < 1e-8));
  assert.equal(physics.setControl('selector', 'D').ok, true);
  for (let i = 0; i < 120; i++) {
    physics.step(1 / 120, { throttle: .4 });
    assert.ok(physics.state.powerKW * 1000 <= ratedPower + 1e-6);
    physics._wheels.forEach((wheel, j) => near(wheel.driveTorque, physics._evOutput.wheelTorques[j], 1e-8, 'Runtime must apply the computed wheel torque directly'));
  }
  assert.equal(physics.state.gear, 'D'); assert.equal(physics.state.gearRatio, 1); assert.ok(physics.body.velocity.z > .5);
  physics.setControl('engineOn', false); run(physics, .2, { throttle: 1 });
  assert.equal(physics.state.powerKW, 0); assert.ok(physics._wheels.every(wheel => Math.abs(wheel.driveTorque) < 1e-8));
});

test('regeneration is dissipative in both directions and bounded by generator and contact capacity', () => {
  let maximumMechanicalPower = 0;
  for (const sign of [-1, 1]) for (const speed of [.1, 1, 4, 15, 35, 65]) {
    const wheels = wheelsAt([speed, speed * .8, speed * 1.3, speed * .6].map(value => sign * value));
    const output = electricMotorOutput(spec, wheels, { throttle: 0, regenDeceleration: 3.2 });
    const powers = output.wheelTorques.map((torque, i) => torque * wheels[i].omega);
    assert.ok(powers[0] + powers[1] <= 1e-8 && powers[2] <= 1e-8 && powers[3] <= 1e-8);
    maximumMechanicalPower = Math.max(maximumMechanicalPower, -sum(powers));
    assert.ok(-sum(powers) <= 200000 + 1e-6); assert.ok(output.regenPowerW <= -sum(powers) + 1e-6); assert.equal(output.positivePowerW, 0);
    for (const disabled of [true, false]) {
      const unsupported = wheels.map(wheel => ({ ...wheel, contact: disabled ? wheel.contact : false }));
      const off = electricMotorOutput(spec, unsupported, { enabled: !disabled, throttle: 0, regenDeceleration: 3.2 });
      assert.ok(off.wheelTorques.every(torque => Math.abs(torque) < 1e-9));
    }
  }
  const still = electricMotorOutput(spec, wheelsAt([0, 0, 0, 0]), { regenDeceleration: 3.2 });
  assert.ok(still.wheelTorques.every(torque => torque === 0));
  report.regeneration = { maximumSampledMechanicalKW: maximumMechanicalPower / 1000 };
});

test('One-Pedal and Regen on Demand slow and hold the actual vehicle without reverse creep', () => {
  const distances = {};
  for (const mode of ['coast', 'onePedal', 'regenOnDemand']) {
    const physics = rolling(), start = physics.body.position.z;
    if (mode !== 'coast') assert.equal(physics.setControl(mode, true).ok, true);
    let maximumRegen = 0;
    for (let i = 0; i < 12 * 120; i++) {
      physics.step(1 / 120, {}); maximumRegen = Math.max(maximumRegen, physics.state.regenerativePowerKW);
      assert.equal(physics.state.powerKW, 0);
    }
    distances[mode] = { distanceM: physics.body.position.z - start, finalSpeedMS: physics.body.velocity.length(), maximumRegenKW: maximumRegen };
    if (mode !== 'coast') {
      assert.ok(physics.body.velocity.length() < .02); assert.equal(physics.controls.selector, 'D');
      const held = physics.body.position.z; run(physics, 2); assert.ok(Math.abs(physics.body.position.z - held) < .015);
    }
  }
  assert.ok(distances.regenOnDemand.distanceM < distances.onePedal.distanceM && distances.onePedal.distanceM < distances.coast.distanceM * .5);
  report.stoppingFrom12MS = distances;
});

test('Off, automatic phase changes and CrabWalk use actual four-wheel geometry', () => {
  const auto = make(); run(auto, 2, { steer: .55 });
  assert.ok(auto._wheels.slice(0, 2).every(wheel => wheel.steer < -.2));
  assert.ok(auto._wheels.slice(2).every(wheel => wheel.steer > .1));
  assert.ok(auto._wheels.slice(2).every(wheel => Math.abs(wheel.steer) <= spec.steering.rearMaxAngle + 1e-6), 'Ackermann geometry must respect the physical rear wheel limit');
  const off = make(); assert.equal(off.setControl('rearSteer', 'off').ok, false);
  off.setControl('selector', 'N'); assert.equal(off.setControl('rearSteer', 'off').ok, true); run(off, 2, { steer: .55 });
  assert.ok(off._wheels.slice(2).every(wheel => Math.abs(wheel.steer) < 1e-9));
  const crab = make(); assert.equal(crab.setControl('rearSteer', 'crab').ok, true); run(crab, 2, { steer: 1 });
  const angles = crab._wheels.map(wheel => wheel.steer);
  assert.ok(Math.max(...angles) - Math.min(...angles) < .00003); assert.ok(angles.every(angle => Math.abs(angle) <= spec.steering.rearMaxAngle + .0001));
  const start = { ...crab.body.position }; run(crab, 3, { steer: 1, throttle: .15 });
  assert.ok(crab.body.position.x - start.x < -.5 && crab.body.position.z - start.z > 3);
  assert.ok(Math.abs(crab.body.quaternion.y) < .015, 'CrabWalk should translate diagonally with little yaw');
  for (const speed of [20, 25, 35, 45]) {
    const rear = electricRearSteer(spec, .30, speed, 'auto');
    assert.ok(rear > 0 && rear < .30); assert.ok(Math.tan(rear) * speed ** 2 / spec.wheelbase <= .12 * 9.81 + 1e-9);
  }
  assert.equal(electricRearSteer(spec, .4, 8, 'off'), 0);
  report.steering = { lowSpeedFrontAngles: auto._wheels.slice(0, 2).map(wheel => wheel.steer), lowSpeedRearAngles: auto._wheels.slice(2).map(wheel => wheel.steer), crabTranslationM: { x: crab.body.position.x - start.x, z: crab.body.position.z - start.z }, crabQuaternionY: crab.body.quaternion.y };
});

test('rear-steer transitions enforce crawl speed, centered steering and overspeed timing', () => {
  const physics = make(); physics.body.velocity.set(0, 0, .8);
  assert.equal(physics.setControl('rearSteer', 'crab').ok, false);
  physics.body.velocity.setZero(); run(physics, 1, { steer: .2 });
  assert.equal(physics.setControl('rearSteer', 'crab').ok, false);
  run(physics, 1); assert.equal(physics.setControl('rearSteer', 'crab').ok, true);
  // This is the elapsed-time interlock in isolation; the live geometry is
  // separately tested above. No vehicle path or wheel force is constrained.
  physics._updateElectricSystems(9.9, 12); assert.equal(physics.controls.rearSteer, 'crab');
  physics._updateElectricSystems(.2, 12); assert.equal(physics.controls.rearSteer, 'auto');
  physics.body.velocity.setZero(); assert.equal(physics.setControl('rearSteer', 'crab').ok, true);
  physics.body.velocity.set(0, 0, 10); for (const wheel of physics._wheels) wheel.omega = 10 / wheel.radius;
  run(physics, .25, { steer: .5 });
  assert.equal(physics.controls.rearSteer, 'crab'); assert.ok(Math.abs(physics._rearSteer - physics._steer) > .015, 'Above 20 mph, parallel CrabWalk steering must temporarily yield to automatic steering');
});

test('air suspension changes physical equilibrium progressively and Extract respects its limits', () => {
  const physics = make(), normal = physics.body.position.y;
  assert.equal(physics.setControl('rideHeight', 'extract').ok, false);
  assert.equal(physics.setControl('rideHeight', 'increased').ok, true);
  near(physics.body.position.y, normal, 1e-12, 'The button must not teleport the body'); run(physics, .4);
  assert.ok(physics._airSuspensionLift > .009 && physics._airSuspensionLift < .011); run(physics, 3.6);
  const increased = physics.body.position.y; near(increased - normal, .046, .003, 'Increased physical ride height');
  physics.setControl('terrainProgram', 'Terrain'); assert.equal(physics.setControl('rideHeight', 'extract').ok, true); run(physics, 6);
  const extract = physics.body.position.y; near(extract - normal, .149, .004, 'Extract physical ride height');
  physics._wheels.forEach(wheel => near(wheel.rest - wheel.baseRest, .149, 1e-9, 'Air extension must alter the suspension rest length'));
  assert.equal(physics.state.groundedWheels, 4); near(sum(physics._wheels.map(wheel => wheel.load)) / (spec.mass * 9.81), 1, .02, 'Suspension supports the actual weight');
  physics.body.velocity.set(0, 0, 8); for (const wheel of physics._wheels) wheel.omega = 8 / wheel.radius;
  assert.equal(physics.setControl('rideHeight', 'extract').ok, false); run(physics, .4, { throttle: 1 });
  assert.equal(physics.state.powerKW, 0); assert.ok(physics.body.velocity.length() < 8, 'Extract limits traction demand and slows an overspeed vehicle');
  physics.setControl('rideHeight', 'normal'); physics.setControl('selector', 'P'); run(physics, 10, { brake: 1 });
  near(physics._airSuspensionLift, 0, 1e-9, 'Normal setting returns extension to zero'); near(physics.body.position.y, normal, .004, 'Physical body returns to normal equilibrium');
  report.airSuspensionM = { normalCG: normal, increasedCG: increased, extractCG: extract, returnedCG: physics.body.position.y };
});

function armLaunch() {
  const physics = make(); assert.equal(physics.setControl('wattsToFreedom', true).ok, true); assert.equal(physics._launchPhase, 'lowering');
  run(physics, 3); assert.equal(physics._launchPhase, 'brake'); near(physics._airSuspensionLift, -.0508, 1e-9, 'Launch physically lowers the air springs');
  run(physics, .1, { brake: 1 }); assert.equal(physics._launchPhase, 'throttle');
  run(physics, .1, { brake: 1, throttle: 1 }); assert.equal(physics._launchPhase, 'release'); assert.equal(physics.state.powerKW, 0);
  return physics;
}

test('Watts to Freedom requires its sequence and returns to normal drive after significant steering', () => {
  const physics = armLaunch(), before = physics.body.position.z;
  run(physics, .35, { throttle: 1 }); assert.equal(physics._launchPhase, 'launch');
  assert.ok(physics.body.position.z > before + .2 && physics.state.powerKW > 0); assert.ok(physics.state.powerKW * 1000 <= ratedPower + 1e-6);
  run(physics, 1 / 120, { throttle: 1, steer: .3 }); assert.equal(physics._launchPhase, 'launch', 'The smoothed wheel angle has not reached a significant turn on the first input step');
  run(physics, .3, { throttle: 1, steer: .3 }); assert.equal(physics._launchPhase, 'standby');
  assert.equal(physics.state.driverInput.throttle, 1, 'Leaving peak boost must preserve ordinary accelerator authority');
  assert.ok(physics.state.powerKW > 0, 'The normal motor envelope must still drive the vehicle while turning');
  physics.setControl('wattsToFreedom', false); assert.equal(physics._launchPhase, 'off');
  const neutral = armLaunch(); run(neutral, .3, { throttle: 1 });
  assert.equal(neutral.setControl('selector', 'N').ok, true); assert.equal(neutral.controls.wattsToFreedom, false); assert.equal(neutral._launchPhase, 'off');
  run(neutral, .1, { throttle: 1 }); assert.equal(neutral.state.powerKW, 0);
  assert.equal(neutral.setControl('selector', 'D').ok, true); run(neutral, .1, { throttle: 1 });
  assert.equal(neutral._launchPhase, 'off', 'Selecting Drive again must not silently resume launch output');
  const program = armLaunch(); assert.equal(program.setControl('terrainProgram', 'Off-Road').ok, true); assert.equal(program.controls.wattsToFreedom, false);
  const powerOff = armLaunch(); powerOff.setControl('engineOn', false); assert.equal(powerOff._launchPhase, 'off'); assert.equal(powerOff.controls.wattsToFreedom, false);
  report.launch = { peakEnabledOnlyAfterBrakeRelease: true, selectorCancellation: true, significantSteeringReturnsNormalDrive: true, driveModeCancellation: true, drivePowerCancellation: true };
});

test('launch entry rejects motion, Neutral, incompatible steering and axle locks', () => {
  const physics = make(); physics.body.velocity.set(0, 0, 1); assert.equal(physics.setControl('wattsToFreedom', true).ok, false);
  physics.body.velocity.setZero(); physics.setControl('selector', 'N'); assert.equal(physics.setControl('wattsToFreedom', true).ok, false);
  physics.setControl('selector', 'D'); physics.setControl('rearSteer', 'crab'); assert.equal(physics.setControl('wattsToFreedom', true).ok, false);
  physics.setControl('rearSteer', 'auto'); physics.setControl('rearLocked', true); assert.equal(physics.setControl('wattsToFreedom', true).ok, false);
  physics.setControl('rearLocked', false); physics.body.position.y = 5; physics._collectContacts(1 / 120);
  assert.equal(physics.setControl('wattsToFreedom', true).ok, false);
});

test('front and virtual rear locks enforce speed, Terrain and ABS behavior', () => {
  const physics = make(); assert.equal(physics.setControl('frontLocked', true).ok, false); assert.equal(physics.setControl('driveMode', '4L').ok, false);
  physics.setControl('terrainProgram', 'Terrain'); assert.equal(physics.setControl('frontLocked', true).ok, true);
  assert.equal(physics.controls.rearLocked, true, 'The front/both-axles action engages the rear locker too'); assert.equal(physics.controls.abs, false);
  physics.body.velocity.set(0, 0, 16 * .44704); run(physics, 1 / 120);
  assert.equal(physics.controls.frontLocked, false); assert.equal(physics.controls.rearLocked, true); assert.equal(physics.controls.abs, true);
  assert.equal(physics.setControl('frontLocked', true).ok, false);
  physics.body.velocity.set(0, 0, 51 * .44704); run(physics, 1 / 120); assert.equal(physics.controls.rearLocked, false);
  physics.body.velocity.setZero(); run(physics, 3 / 120);
  assert.equal(physics.controls.frontLocked, true); assert.equal(physics.controls.rearLocked, true); assert.equal(physics.controls.abs, false);
  physics._wheels.forEach((wheel, i) => { wheel.omega = [4, 10, 5, 13][i]; }); run(physics, 1 / 120);
  near(physics._wheels[0].omega, physics._wheels[1].omega, 1e-7, 'Front mechanical lock constrains wheel rates');
  near(physics._wheels[2].omega, physics._wheels[3].omega, 1e-7, 'Rear virtual lock constrains wheel rates');
  physics.setControl('rearLocked', false); assert.equal(physics.controls.frontLocked, false); assert.equal(physics.controls.abs, true);
  physics.setControl('terrainProgram', 'Normal'); physics.body.velocity.set(0, 0, 26 * .44704); assert.equal(physics.setControl('rearLocked', true).ok, false);
  report.locking = { bothAxleButtonEngagesRear: true, frontUnlockMPH: 15, terrainRearUnlockMPH: 50, normalRearEngageLimitMPH: 25, frontLockSuspendsABS: true };
});

if (process.argv.includes('--report')) after(() => console.log(JSON.stringify(report, null, 2)));
