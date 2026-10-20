import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLES } from '../dist/src/vehicles.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { deriveVehicle } from '../dist/src/upgrades.js';
import { DT, jeep, flatSurface, rolling, steerPulse, constantTurn } from './handling-metrics.mjs';

test('ordinary digital corrections recover without sustained drifting on all six surfaces in both directions', () => {
  for (const surface of ['asphalt', 'dirt', 'rock', 'mud', 'wetland', 'sand']) {
    for (const speed of [8, 15, 25]) {
      const turns = [-1, 1].map(sign => steerPulse({ surface, speed, sign }));
      for (const row of turns) {
        const label = `${surface} at ${speed} m/s`;
        assert(row.peakSlip < 6, `${label}: ordinary correction produced ${row.peakSlip}° body slip`);
        assert(row.recoverySlip < 4.1, `${label}: steering release left ${row.recoverySlip}° body slip after 1 s`);
        assert(row.finalSlip < 0.35, `${label}: the released vehicle failed to recover`);
        assert(row.peakYaw > 0.10, `${label}: stability must not remove the requested turn`);
        assert(row.peakUtilization <= 1 + 1e-9, `${label}: the tire exceeded its friction budget`);
        assert(row.minimumUp > 0.98, `${label}: normal steering caused excessive chassis roll`);
        assert.equal(row.condition, 1, label);
      }
      assert(Math.abs(turns[0].peakSlip - turns[1].peakSlip) < 1e-5, `${surface}: left/right handling changed`);
    }
  }
});

test('moderate analog front-steered road turns settle with measured positive understeer on every catalogue chassis', () => {
  for (const spec of VEHICLES) for (const steer of [0.05, 0.09]) {
    const row = constantTurn({ spec, steer });
    assert(row.understeerDegPerG > 1 && row.understeerDegPerG < 4, `${spec.id}: ${row.understeerDegPerG}°/g understeer`);
    assert(row.lateralG > 0.12 && row.lateralG < 0.4, `${spec.id}: fixture did not sustain a moderate turn`);
    assert(row.meanSlip < 0.6, `${spec.id}: a normal turn retained excessive body sideslip`);
    assert(row.finalSpeed > 14.8 && row.yaw < -0.08, `${spec.id}: a stable result must continue moving and turning`);
    assert(row.peakUtilization <= 1 + 1e-9);
    assert.equal(row.condition, 1);
  }
  const left = constantTurn({ steer: 0.09, sign: -1 });
  const right = constantTurn({ steer: 0.09, sign: 1 });
  assert(Math.abs(left.understeerDegPerG - right.understeerDegPerG) < 1e-5);
  assert(Math.abs(left.yaw + right.yaw) < 1e-5);
});

test('rolling tire forces build progressively, and a longer carcass relaxation length delays that response', () => {
  const results = [];
  for (const scale of [1, 2]) {
    const physics = rolling({ ...jeep, tire: { relaxationLengthScale: scale } }, 15);
    physics.body.velocity.x = 0.5;
    const forces = [];
    for (let frame = 0; frame < 6; frame++) {
      physics.step(DT);
      forces.push(physics.state.wheels.reduce((sum, wheel) => sum + Math.abs(wheel.lateralForce), 0));
      for (const wheel of physics.state.wheels) assert(wheel.frictionUtilization <= 1 + 1e-9);
    }
    assert(forces[0] > 0 && forces[0] < forces[5] * 0.5, 'A new slip disturbance must build force over tire travel');
    assert(physics.body.velocity.x < 0.5, 'The modeled carcass force must act on the chassis');
    results.push(forces);
  }
  assert(results[1][0] < results[0][0] * 0.65, 'A more compliant rolling carcass must respond more gradually');
});

test('road wetness reduces peak grip separately from stiffness, while airing down changes the loaded carcass', () => {
  const dry = rolling(jeep, 15), wet = rolling(jeep, 15, 'asphalt', { mu: 0.47 });
  dry.step(DT); wet.step(DT);
  for (let i = 0; i < 4; i++) {
    assert(wet.state.wheels[i].frictionCoefficient < dry.state.wheels[i].frictionCoefficient * 0.51);
    assert(Math.abs(wet.state.wheels[i].corneringStiffness / dry.state.wheels[i].corneringStiffness - 1) < 0.01,
      'A lower friction ceiling must not directly halve carcass stiffness');
  }
  const inflated = new VehiclePhysics(flatSurface(), jeep), airedDown = new VehiclePhysics(flatSurface(), jeep);
  airedDown.setPressure(18);
  for (let frame = 0; frame < 360; frame++) { inflated.step(DT); airedDown.step(DT); }
  for (let i = 0; i < 4; i++) {
    const normal = inflated.state.wheels[i], low = airedDown.state.wheels[i];
    assert(low.corneringStiffness < normal.corneringStiffness * 0.85);
    assert(low.deflection > normal.deflection * 1.5 && low.contactLength > normal.contactLength);
    assert(low.frictionCoefficient < normal.frictionCoefficient, 'Lower pressure must not create a universal paved-grip bonus');
  }
});

test('installing parts preserves deliberate Reverse, auto-Reverse and supported hardware interlocks', () => {
  const physics = new VehiclePhysics(flatSurface(), jeep);
  for (let frame = 0; frame < 240; frame++) physics.step(DT);
  physics.setControl('selector', 'N');
  physics.setControl('driveMode', '4L');
  physics.setControl('rearLocked', true); physics.setControl('frontLocked', true);
  physics.setControl('swayDisconnected', true); physics.setControl('selector', 'R');
  physics.setControl('engineOn', false);
  assert.equal(physics.reconfigureVehicle(deriveVehicle(jeep, { engine: 'tune' })).ok, true);
  assert.equal(physics.state.selector, 'R'); assert.equal(physics.state.manualReverse, true);
  assert.equal(physics.state.driveMode, '4L');
  assert.equal(physics.state.rearLocked, true); assert.equal(physics.state.frontLocked, true);
  assert.equal(physics.state.swayDisconnected, true); assert.equal(physics.state.engineOn, false);
  physics.setControl('selector', 'D'); physics.setControl('engineOn', true);
  for (let frame = 0; frame < 90; frame++) physics.step(DT, { brake: 1, autoDirection: true });
  assert.equal(physics.state.selector, 'R'); assert.equal(physics.state.manualReverse, false);
  physics.body.velocity.setZero(); physics.body.angularVelocity.setZero();
  assert.equal(physics.reconfigureVehicle(deriveVehicle(jeep, { engine: 'power' })).ok, true);
  assert.equal(physics.state.selector, 'R'); assert.equal(physics.state.manualReverse, false);
  physics.step(DT, { brake: 0.4, autoDirection: true });
  assert(physics.state.driverInput.throttle > 0 && physics.state.driverInput.brake === 0, 'Automatically selected R must retain reverse-pedal semantics after install');
  physics.body.velocity.setZero(); physics.body.angularVelocity.setZero();
  physics.damage.disabled = true; physics.controls.engineOn = false;
  assert.equal(physics.reconfigureVehicle(deriveVehicle(jeep, { engine: 'tune' })).ok, true);
  assert.equal(physics.state.engineOn, false); assert.equal(physics.state.damage.disabled, true);
});
