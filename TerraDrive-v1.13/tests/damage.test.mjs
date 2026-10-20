import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics } from '../dist/src/physics.js';
import { applyImpactDamage, createDamage } from '../dist/src/damage.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { deriveVehicle } from '../dist/src/upgrades.js';

const jeep = VEHICLES[0], civic = VEHICLES.find(v => v.id === 'civic-sport');
const ORIGIN = { x: 0, z: 0, heading: 0 };
const flat = () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'asphalt', mu: 0.94, rollingResistance: 0.014, softness: 0, waterDepth: 0 });
function run(p, seconds, input = {}) { for (let n = 0; n < Math.round(seconds * 120); n++) p.step(1 / 120, input); return p.state; }
function create(terrain = { sample: flat }) { const p = new VehiclePhysics(terrain, jeep); p.reset(ORIGIN); run(p, 1); return p; }
function impactAt(speed, x = 0) {
  const terrain = { sample: flat, obstacles: [{ id: 'oak-1', type: 'tree', x, z: 10, radius: 0.35, height: 6 }] };
  const p = create(terrain); p.setControl('selector', 'N');
  p.body.velocity.z = speed;
  for (const w of p._wheels) w.omega = speed / w.radius;
  run(p, Math.max(1.5, 10 / speed + 1));
  return p;
}

test('installing and later selecting saved builds keeps dents fixed to the same body panels', () => {
  const bodyOffset = spec => ({
    y: (spec.visualBase ? spec.tireRadius - spec.visualBase.tireRadius + (spec.suspension.lift || 0) : 0) - spec.cgHeight,
    z: (0.5 - spec.frontWeightFraction) * spec.wheelbase,
  });
  const panelProfile = (physics, spec) => {
    const offset = bodyOffset(spec);
    return physics.getDamage(spec.id).dents.map(dent => ({ ...dent,
      point: { x: dent.point.x, y: dent.point.y - offset.y, z: dent.point.z - offset.z } }));
  };
  for (const base of VEHICLES.filter(spec => ['civic-sport', 'sprinter-2500'].includes(spec.id))) {
    const physics = new VehiclePhysics({ sample: flat }, base); physics.reset(ORIGIN); run(physics, 1);
    const offset = bodyOffset(base), speed = 8;
    assert(applyImpactDamage(physics.damage, {
      id: 901, obstacleType: 'tree', speed, energy: base.mass * speed * speed / 2,
      localPoint: { x: base.width * 0.42, y: 1.1 + offset.y, z: base.length * 0.25 + offset.z },
      localNormal: { x: 1, y: 0, z: 0 },
    }, base, physics._wheels.map(wheel => wheel.mount)));
    const original = panelProfile(physics, base), originalCondition = physics.getDamage().condition;
    const upgrade = deriveVehicle(base, { drivetrain: 'conversion', suspension: 'trail', size: 'large',
      tires: base.id === 'civic-sport' ? 'allTerrain' : 'sand' });
    const check = spec => {
      const actual = panelProfile(physics, spec);
      assert.equal(actual.length, original.length);
      for (let i = 0; i < actual.length; i++) {
        for (const axis of ['x', 'y', 'z']) assert(Math.abs(actual[i].point[axis] - original[i].point[axis]) < 1e-12,
          `${base.id}: installing parts moved a dent along panel ${axis}`);
        assert.deepEqual(actual[i].normal, original[i].normal);
        for (const field of ['radius', 'depth', 'severity']) assert.equal(actual[i][field], original[i][field]);
      }
      assert.equal(physics.getDamage(base.id).condition, originalCondition, 'A coordinate rebase must not repair or worsen damage');
    };
    assert.equal(physics.reconfigureVehicle(upgrade).ok, true); check(upgrade);
    physics.setVehicle(jeep, ORIGIN);
    const stored = physics.getDamage(base.id);
    const savedBuild = deriveVehicle(base, { engine: 'power', suspension: 'road' });
    physics.setVehicle(savedBuild, ORIGIN); check(savedBuild);
    assert(physics.getDamage().revision > stored.revision, 'The renderer must receive a revision when chassis coordinates change');
    physics.setVehicle(base, ORIGIN); check(base);
    assert.equal(physics.repair().ok, true); assert.deepEqual(physics.getDamage().dents, []);
  }
});

test('obstacle damage responds to normal collision energy, records a local dent, and localizes corner damage', () => {
  const light = impactAt(6), medium = impactAt(12), severe = impactAt(24);
  for (const p of [light, medium, severe]) {
    const s = p.state, impact = s.impacts.find(i => i.obstacleId === 'oak-1');
    assert(impact && impact.energy > 1000 && impact.speed > 1.6);
    assert.equal(impact.obstacleType, 'tree');
    assert(impact.normal.z < -0.9, 'World collision normal must point from obstacle toward vehicle');
    assert(impact.localPoint.z > 1.8, 'Head-on damage belongs at the chassis front');
    assert(s.damage.dents.some(d => d.normal.z > 0.9), 'Dent normal must point out of vehicle, so dent displacement is inward');
    assert(s.damage.body > 0 && s.damage.engine > 0 && s.damage.condition < 1);
    assert(s.damage.suspension[0] > s.damage.suspension[2]);
    assert(Math.abs(s.damage.suspension[0] - s.damage.suspension[1]) < 1e-6, 'Centered impact should not arbitrarily choose a damaged corner');
  }
  assert(light.state.damage.body < medium.state.damage.body && medium.state.damage.body < severe.state.damage.body);
  assert.equal(light.state.damage.disabled, false);
  assert.equal(severe.state.damage.disabled, true);
  const leftCorner = impactAt(16, 0.65).state.damage;
  assert(leftCorner.suspension[0] > leftCorner.suspension[1] * 1.4, 'Driver-left contact should preferentially damage the left front suspension');
  assert(leftCorner.tires[0] > leftCorner.tires[1] * 1.4);
});

test('a glancing bump can shake scenery without treating travel speed as a head-on crash', () => {
  const terrain = { sample: flat, obstacles: [{ id: 'side-oak', type: 'tree', x: jeep.width * 0.46 + 0.39, z: 0, radius: 0.35, height: 6 }] };
  const p = create(terrain); p.setControl('selector', 'N');
  p.body.velocity.set(1, 0, 14);
  for (const w of p._wheels) w.omega = 14 / w.radius;
  run(p, 1.5);
  const impact = p.state.impacts.find(i => i.obstacleId === 'side-oak');
  assert(impact && impact.speed > 0.25 && impact.speed < 1.6);
  assert(impact.energy < 1500);
  assert.equal(p.state.damage.revision, 0);
  assert.equal(p.state.damage.condition, 1);
  assert.equal(p.state.damage.dents.length, 0);
});

test('stationary support and ordinary small terrain undulations cannot accumulate damage', () => {
  const stationary = create({ sample: flat, obstacles: [{ id: 'resting-tree', type: 'tree', x: jeep.width * 0.46 + 0.35, z: 0, radius: 0.35, height: 6 }] });
  stationary.setControl('selector', 'P');
  run(stationary, 40, { handbrake: true });
  assert.equal(stationary.state.damage.condition, 1);
  assert.deepEqual(stationary.state.impacts, []);
  const terrain = { sample(x, z) {
    const grade = 0.035 * 2 * Math.cos(z * 2);
    return { ...flat(), height: 0.035 * Math.sin(z * 2), normal: { x: 0, y: 1 / Math.hypot(1, grade), z: -grade / Math.hypot(1, grade) } };
  } };
  const travel = create(terrain);
  for (let frame = 0; frame < 2400; frame++) travel.step(1 / 120, { throttle: Math.max(0, Math.min(0.6, 0.15 + (4 - travel.state.speedKmh / 3.6) * 0.35)) });
  assert(travel.state.position.z > 45);
  assert.equal(travel.state.damage.condition, 1, 'Routine suspension motion must not be classified as collision damage');
});

test('one obstacle contact cannot repeatedly damage a vehicle resting against it', () => {
  const p = impactAt(8), afterImpact = p.getDamage();
  p.setControl('selector', 'D');
  run(p, 5, { throttle: 0.4 });
  const events = p.state.impacts.filter(i => i.obstacleId === 'oak-1');
  for (let i = 1; i < events.length; i++) assert(events[i].time - events[i - 1].time >= 0.55 - 1e-6);
  assert(p.state.damage.body < afterImpact.body + 0.005, 'Static collision force and wheelspin must not become repeated crash energy');
});

test('small drops are absorbed by suspension, while hard landings damage corners and a severe fall disables', () => {
  const outcomes = [];
  for (const height of [0.25, 1, 2, 9]) {
    const p = create(); p.body.position.y += height; run(p, 5); outcomes.push(p.state);
  }
  assert.equal(outcomes[0].damage.condition, 1);
  assert.equal(outcomes[1].damage.condition, 1);
  assert(outcomes[2].damage.suspension.every(d => d > 0.05));
  assert(outcomes[2].impacts.some(i => i.obstacleType === 'landing' && i.speed > 4.6));
  assert.equal(outcomes[2].damage.disabled, false);
  assert.equal(outcomes[3].damage.disabled, true);
});

test('damage reduces engine output, leaks effective pressure, bends wheel alignment and changes suspension support', () => {
  const p = impactAt(16, 0.65), saved = p.getDamage();
  p.reset(ORIGIN); p.setControl('selector', 'D'); run(p, 2, { handbrake: true });
  const left = p.state.wheels[0], right = p.state.wheels[1];
  assert(left.damageTire > 0.18 && left.pressure < p.state.frontPSI * 0.95);
  assert(left.pressure < right.pressure);
  assert(Math.abs(left.steer) > Math.abs(right.steer));
  assert(p.state.position.y < jeep.cgHeight - 0.005, 'Damaged spring support should change physical ride height');
  const healthy = create();
  run(p, 0.6, { throttle: 0.65 }); run(healthy, 0.6, { throttle: 0.65 });
  assert(p.state.engineTorque < healthy.state.engineTorque * 0.85);
  assert.deepEqual(p.getDamage(), saved, 'Normal driving must not heal damage');
});

test('disabled vehicles lose propulsion and cannot restart the engine until repaired', () => {
  const p = impactAt(24);
  p.reset(ORIGIN); p.setControl('selector', 'D');
  const repairRequired = p.setControl('engineOn', true);
  assert.equal(repairRequired.ok, false);
  assert.match(repairRequired.message, /repair/i);
  run(p, 2, { throttle: 1, autoDirection: true });
  assert.equal(p.state.engineOn, false);
  assert.equal(p.state.engineTorque, 0);
  assert(p.state.wheels.every(w => w.driveTorque <= 0.01));
  assert.equal(p.state.directionChangePending, null);
});

test('recovery and vehicle switching preserve damage, snapshots are isolated, and stopped repair restores the selected vehicle', () => {
  const p = impactAt(16), stored = p.getDamage(), revision = stored.revision;
  p.reset({ x: 15, z: 0, heading: 0.4 });
  assert.deepEqual(p.getDamage(), stored);
  p.setVehicle(civic, ORIGIN);
  assert.equal(p.state.damage.condition, 1);
  assert.deepEqual(p.getDamage(jeep.id), stored);
  const untrusted = p.getDamage(jeep.id); untrusted.engine = 0; untrusted.suspension[0] = 0; untrusted.dents[0].point.z = 123;
  assert.deepEqual(p.getDamage(jeep.id), stored, 'Snapshot consumers must not mutate the persisted damage record');
  p.setVehicle(jeep, ORIGIN);
  assert.deepEqual(p.state.damage, stored);
  p.body.velocity.z = 0.7;
  assert.equal(p.repair().ok, false);
  p.body.velocity.setZero(); p.body.angularVelocity.y = 0.6;
  assert.equal(p.repair().ok, false);
  p.body.angularVelocity.setZero();
  const position = { ...p.body.position };
  assert.equal(p.repair().ok, true);
  assert.deepEqual({ ...p.body.position }, position, 'Repair must not silently teleport the vehicle');
  assert.equal(p.state.damage.condition, 1); assert.equal(p.state.damage.disabled, false);
  assert.deepEqual(p.state.damage.suspension, [0, 0, 0, 0]); assert.deepEqual(p.state.damage.tires, [0, 0, 0, 0]);
  assert.deepEqual(p.state.damage.dents, []); assert(p.state.damage.revision > revision);
  assert.equal(p.state.engineOn, true);
});

test('restart explicitly repairs and respawns the selected vehicle, while collider revisions refresh cached obstacles', () => {
  const p = impactAt(24), revision = p.state.damage.revision;
  p.restart({ x: 20, z: -10, heading: 1 });
  assert.equal(p.state.damage.condition, 1); assert.equal(p.state.damage.disabled, false);
  assert(p.state.damage.revision > revision); assert.equal(p.state.selector, 'D');
  assert.deepEqual(p.state.impacts, [], 'Restart must not replay pre-restart scenery impacts');
  assert.equal(p.state.position.x, 20); assert.equal(p.state.position.z, -10);
  p.step(1 / 120, {}); assert.equal(p._obstacleBodies.length, 1);
  p.terrain.obstacles[0].disabled = true;
  p.terrain.obstacleRevision = 1;
  p.step(1 / 120, {}); assert.equal(p._obstacleBodies.length, 0);
  p.terrain.obstacles[0].disabled = false; p.terrain.obstacles[0].height = 0.4;
  p.terrain.obstacleRevision++;
  p.step(1 / 120, {});
  assert.equal(p._obstacleBodies.length, 1);
  assert.equal(p._obstacleBodies[0].terraObstacle.id, 'oak-1');
  assert.equal(p._obstacleBodies[0].terraObstacle.height, 0.4);
  Object.assign(p.terrain.obstacles[0], { shape: 'box', halfExtents: { x: 0.18, y: 0.18, z: 2.5 }, center: { x: 0, y: 0.19, z: 10 }, quaternion: { x: 0, y: Math.sin(0.4), z: 0, w: Math.cos(0.4) } });
  p.terrain.obstacleRevision++; p.step(1 / 120, {});
  const box = p._obstacleBodies[0];
  assert.equal(box.shapes[0].halfExtents.z, 2.5);
  assert.equal(box.position.y, 0.19);
  assert(Math.abs(box.quaternion.y - Math.sin(0.4)) < 1e-10);
  const barrier = create({ sample: flat, obstacles: [{ id: 'fallen-log', type: 'log', shape: 'box',
    halfExtents: { x: 2.2, y: 0.4, z: 0.25 }, center: { x: 0, y: 0.7, z: 8 },
    quaternion: { x: 0, y: Math.sin(0.3), z: 0, w: Math.cos(0.3) } }] });
  barrier.setControl('selector', 'N'); barrier.body.velocity.z = 8;
  for (const wheel of barrier._wheels) wheel.omega = 8 / wheel.radius;
  run(barrier, 1.5);
  assert(barrier.state.impacts.some(i => i.obstacleId === 'fallen-log' && i.speed > 1.6), 'Rotated center-only box must physically collide and emit its stable ID');
});

test('persistent body dents consolidate without healing old deformation when the bounded profile fills', () => {
  const damage = createDamage();
  const wheels = [1, -1, 1, -1].map((x, i) => ({ x, y: -0.4, z: i < 2 ? 1.5 : -1.5 }));
  const hit = (id, point, normal) => applyImpactDamage(damage, { id, obstacleType: 'tree', speed: 8, energy: 15000, localPoint: point, localNormal: normal }, jeep, wheels);
  hit(0, { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 1 });
  const original = structuredClone(damage.dents[0]);
  for (let i = 1; i < 80; i++) {
    const angle = i * 2.39996;
    hit(i, { x: Math.sin(angle) * 1.1, y: ((i % 5) - 2) * 0.4, z: Math.cos(angle) * 2.3 }, { x: Math.sin(angle), y: 0, z: Math.cos(angle) });
  }
  assert(damage.dents.length <= 28);
  const retained = damage.dents.find(d => d.id === original.id);
  assert(retained, 'First collision must remain represented until repair');
  assert.deepEqual(retained.point, original.point);
  assert(retained.radius >= original.radius && retained.depth >= original.depth && retained.severity >= original.severity);
});
