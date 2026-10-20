import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { surfaceResponse } from '../dist/src/surface-response.js';
import { TireSpray } from '../dist/src/tire-spray.js';

const DT = 1 / 120;
const jeep = VEHICLES.find(spec => spec.id === 'wrangler-rubicon');
function fixture(waterLevel = 0, rain = 0, floorMoisture = 1) {
  const response = surfaceResponse('mud', { moisture: floorMoisture });
  const terrain = {
    moisture: rain,
    sample: () => ({ ...response, height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'mud', waterDepth: waterLevel }),
    obstacles: [{ id: 'timber', type: 'log', shape: 'box',
      center: { x: 0, y: .06, z: 0 }, halfExtents: { x: 5, y: .06, z: 40 } }],
    stamps: 0,
    deform() { this.stamps++; },
  };
  return { terrain, sim: new VehiclePhysics(terrain, jeep) };
}
function material(sim, type = 'log', height = .12) {
  return sim._obstacleMaterial({ point: { x: 0, y: height, z: 0 }, normal: { x: 0, y: 1, z: 0 },
    obstacleId: 'timber', obstacle: { type } });
}

test('submerged timber and rigid rock use wet grip even under a clear sky', () => {
  for (const type of ['tree', 'log', 'stump', 'sign', 'rock']) {
    const { sim } = fixture(.15);
    const wet = material(sim, type);
    const reference = material(fixture(.15, 1).sim, type);
    assert.deepEqual(wet, reference, `${type}: actual water coverage must reach the existing rain-wet response`);
    assert.equal(wet.moisture, 1);
    assert(Math.abs(wet.waterDepth - .03) < 1e-12);
    assert.equal(wet.softness, 0);
    assert.equal(wet.sink, 0);
    assert.equal(wet.soil.rollingResistance, 0, 'Submerged rigid support must not inherit buried soil drag');
  }
});

test('wet soil below exposed timber does not wet the support; weather endpoints and partial rain stay intact', () => {
  for (const rain of [0, .35, 1]) {
    const { sim } = fixture(.10, rain, 1);
    const exposed = material(sim);
    assert.deepEqual(exposed, material(fixture(0, rain, 0).sim), 'Water below the timber top cannot supply contact moisture');
    assert.equal(exposed.mu, .66 - .30 * rain);
    assert.equal(exposed.waterDepth, 0);
    assert.equal(exposed.moisture, rain);
    // The same timber spans the waterline: evaluate bearing points on either
    // side rather than assigning the wetness of one point to the whole log.
    const covered = material(sim, 'log', .09);
    assert.equal(covered.moisture, 1);
    assert(Math.abs(covered.mu - .36) < 1e-12);
  }
});

function drive(waterLevel) {
  const { terrain, sim } = fixture(waterLevel);
  const spray = new TireSpray();
  sim.reset({ x: 0, z: -12, heading: 0 });
  for (let frame = 0; frame < 180; frame++) sim.step(DT, { brake: 1, handbrake: true });
  let grip = 0, count = 0, peakUse = 0;
  for (let frame = 0; frame < 240; frame++) {
    sim.step(DT, { throttle: .55 });
    spray.update(DT, sim.state, terrain);
    for (const wheel of sim.state.wheels) {
      assert(wheel.contact && wheel.obstacleId === 'timber' && wheel.load > 0);
      assert.equal(wheel.surfaceDetail, 'wood');
      assert.equal(wheel.sink, 0);
      assert.equal(wheel.soilDragForce, 0);
      assert.equal(wheel.moisture, waterLevel > .12 ? 1 : 0);
      grip += wheel.peakFrictionCoefficient; count++;
      peakUse = Math.max(peakUse, wheel.frictionUtilization);
    }
  }
  assert.equal(terrain.stamps, 0);
  assert(sim.state.damage.condition > .999);
  assert(Number.isFinite(sim.state.speed) && sim.state.position.z > -11);
  assert(peakUse <= 1 + 1e-9, 'Traction must stay within the actual wet or dry force budget');
  return { meanGrip: grip / count, water: spray.emitted.water, mud: spray.emitted.mud };
}

test('ordinary acceleration publishes reduced underwater timber grip and water-only tire spray', t => {
  const dry = drive(0), wet = drive(.15);
  assert(wet.meanGrip < dry.meanGrip * .75, 'The driving solver must actually use the reduced wet support grip');
  assert(wet.water > 0 && wet.mud === 0, 'Loaded submerged timber throws water without excavating the mud below');
  assert.equal(dry.water + dry.mud, 0);
  t.diagnostic(JSON.stringify({ dry, wet }));
});

test('a partly submerged tilted board retains separate dry and wet loaded tire contacts', () => {
  const { terrain, sim } = fixture(.12);
  const angle = .04;
  terrain.obstacles[0].quaternion = { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
  terrain.obstacleRevision = 1;
  sim.reset({ x: 0, z: 0, heading: 0 });
  for (let frame = 0; frame < 180; frame++) sim.step(DT, { brake: 1, handbrake: true });
  const wet = sim.state.wheels.filter(wheel => wheel.waterDepth > .01);
  const dry = sim.state.wheels.filter(wheel => wheel.waterDepth === 0);
  assert.equal(wet.length, 2);
  assert.equal(dry.length, 2);
  assert(sim.state.wheels.every(wheel => wheel.contact && wheel.load > 0 && wheel.obstacleId === 'timber'));
  assert(wet.every(wheel => wheel.moisture > .99));
  assert(dry.every(wheel => wheel.moisture === 0));
  assert(Math.max(...wet.map(wheel => wheel.peakFrictionCoefficient)) < Math.min(...dry.map(wheel => wheel.peakFrictionCoefficient)) * .8);
  assert.equal(terrain.stamps, 0);
});
