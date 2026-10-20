import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { SURFACES } from '../dist/src/terrain.js';

export const DT = 1 / 120;
export const radToDeg = 180 / Math.PI;
export const jeep = VEHICLES.find(v => v.id === 'wrangler-rubicon');

export function flatSurface(surface = 'asphalt', overrides = {}) {
  return { sample() { return { height: 0, normal: { x: 0, y: 1, z: 0 }, surface,
    ...SURFACES[surface], waterDepth: 0, ...overrides }; } };
}

export function rolling(spec = jeep, speed = 15, surface = 'asphalt', overrides = {}, controls = {}) {
  const physics = new VehiclePhysics(flatSurface(surface, overrides), spec);
  physics.reset({ x: 0, z: 0, heading: 0 });
  for (let i = 0; i < 120; i++) physics.step(DT);
  physics.setControl('selector', 'N');
  for (const [name, value] of Object.entries(controls)) physics.setControl(name, value);
  physics.body.velocity.set(0, 0, speed);
  for (const wheel of physics._wheels) wheel.omega = speed / wheel.radius;
  return physics;
}

export function bodySlip(physics) {
  const local = physics.body.vectorToLocalFrame(physics.body.velocity);
  return Math.atan2(Math.abs(local.x), Math.max(0.01, Math.abs(local.z))) * radToDeg;
}

export function steerPulse({ spec = jeep, speed = 15, surface = 'asphalt', steer = 1,
  steerSource = 'digital', hold = 0.5, duration = 4, sign = 1 } = {}) {
  const physics = rolling(spec, speed, surface);
  let peakSlip = 0, peakTireSlip = 0, peakYaw = 0, peakRoll = 0, peakSteer = 0;
  let recoverySlip = 0, peakUtilization = 0, minimumUp = 1;
  for (let i = 0; i < duration / DT; i++) {
    const state = physics.step(DT, { steer: i * DT < hold ? steer * sign : 0, steerSource });
    peakSlip = Math.max(peakSlip, bodySlip(physics));
    peakYaw = Math.max(peakYaw, Math.abs(state.angularVelocity.y));
    peakRoll = Math.max(peakRoll, Math.abs(state.roll) * radToDeg);
    minimumUp = Math.min(minimumUp, 1 - 2 * (state.quaternion.x ** 2 + state.quaternion.z ** 2));
    peakSteer = Math.max(peakSteer, Math.abs(state.steeringAssist.angle) * radToDeg);
    for (const w of state.wheels) {
      peakTireSlip = Math.max(peakTireSlip, Math.abs(w.lateralSlip) * radToDeg);
      if (w.load > 1) peakUtilization = Math.max(peakUtilization,
        Math.hypot(w.lateralForce, w.longitudinalForce) / (w.load * w.frictionCoefficient));
    }
    if (Math.abs((i + 1) * DT - hold - 1) < DT * 0.5) recoverySlip = bodySlip(physics);
  }
  return { vehicle: spec.id, surface, speed, steer, steerSource, hold, peakSlip, peakTireSlip,
    peakYaw, peakRoll, peakSteer, recoverySlip, finalSlip: bodySlip(physics),
    finalSpeed: physics.state.speedKmh, finalYaw: physics.state.angularVelocity.y,
    peakUtilization, minimumUp, condition: physics.state.damage.condition };
}

/** Constant-speed axle/rack response. The provider supplies forward force only;
 * lateral force, yaw, tire saturation and roll remain fully simulated. */
export function constantTurn({ spec = jeep, speed = 15, steer = 0.05, sign = 1,
  surface = 'asphalt', duration = 10, rearSteer = 'off' } = {}) {
  const physics = rolling(spec, speed, surface, {}, spec.features?.fourWheelSteer ? { rearSteer } : {});
  physics.setExternalForceProvider((dt, simulation) => {
    const forward = simulation.body.vectorToWorldFrame({ x: 0, y: 0, z: 1 });
    const speedError = speed - simulation.body.velocity.dot(forward);
    simulation.body.applyForce(forward.scale(speedError * spec.mass * 8));
  });
  let sumGradient = 0, sumSlip = 0, sumG = 0, samples = 0, peakUtilization = 0;
  for (let i = 0; i < Math.round(duration / DT); i++) {
    const state = physics.step(DT, { steer: steer * sign, steerSource: 'analog' });
    for (const wheel of state.wheels) peakUtilization = Math.max(peakUtilization, wheel.frictionUtilization);
    if ((i + 1) * DT > duration - 2) {
      const actualSpeed = Math.abs(state.speed), yaw = Math.abs(state.angularVelocity.y);
      const g = actualSpeed * yaw / 9.81;
      const geometricSteer = Math.abs(Math.atan(Math.tan(state.steeringAssist.angle) - Math.tan(state.rearSteerAngle || 0)));
      sumGradient += (geometricSteer - Math.atan(spec.wheelbase * yaw / actualSpeed)) / g * radToDeg;
      sumG += g; sumSlip += bodySlip(physics); samples++;
    }
  }
  return { vehicle: spec.id, surface, speed, steer, sign, rearSteer,
    understeerDegPerG: sumGradient / samples, meanSlip: sumSlip / samples, lateralG: sumG / samples,
    finalSpeed: physics.state.speed, yaw: physics.state.angularVelocity.y,
    peakUtilization, condition: physics.state.damage.condition };
}

export function metrics() {
  const rows = [];
  for (const surface of Object.keys(SURFACES)) {
    for (const speed of [8, 15, 25]) rows.push(steerPulse({ surface, speed }));
    rows.push(steerPulse({ surface, speed: 25, steer: 0.07, steerSource: 'analog' }));
    rows.push(steerPulse({ surface, speed: 25, hold: 3, duration: 6 }));
  }
  return rows;
}

export function measurementReport() {
  const files = ['dist/src/physics.js', 'dist/src/input.js', 'dist/src/vehicles.js', 'dist/src/terrain.js',
    'dist/src/upgrades.js', 'tests/handling-metrics.mjs', 'tests/handling.test.mjs', 'tests/fixtures/handling-v1.3-baseline.json'];
  const sourceHashes = Object.fromEntries(files.map(file => [file,
    createHash('sha256').update(fs.readFileSync(new URL('../' + file, import.meta.url))).digest('hex')]));
  return {
    schema: 1, version: '1.4', sourceHashes,
    method: {
      fixedStepSeconds: DT,
      surface: 'Flat SURFACES constants, zero water depth, no terrain deformation. Dirt here is hardpack; real map grass is separately blended by Terrain.sample.',
      pulse: 'Stock Wrangler: settle 1 s, selector N, initialize matched wheel rolling speed, hold steering 0.5 s then release 3.5 s; additional analog 0.07 and digital 3 s hold cases. Body slip is atan2(abs(local lateral velocity), abs(local forward velocity)) in degrees.',
      recovery: 'Measured 1 s after release; speed in input rows is m/s, finalSpeed in pulse rows is km/h.',
      constantTurn: 'Each stock chassis: hold raw analog 0.05/0.09 for 10 s at 15 m/s. Only forward speed is maintained by force provider; average last 2 s. K=(rackAngle−atan(wheelbase*yaw/speed))/(speed*yaw/g) in degrees/g. finalSpeed is m/s.',
      limits: 'CPU integrated simulation measurements; no browser steering-feel or OEM full-vehicle validation claim. Baseline measured against git 9673997 before dynamics edits.',
    },
    baseline: JSON.parse(fs.readFileSync(new URL('./fixtures/handling-v1.3-baseline.json', import.meta.url), 'utf8')),
    pulses: metrics(),
    steadyTurns: VEHICLES.flatMap(spec => [0.05, 0.09].map(steer => constantTurn({ spec, steer }))),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(process.argv.includes('--report') ? measurementReport() : metrics(), null, 2));
}
