import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createTreeFall, stepTreeFall, applyTreeImpulse, applyTreeAngularImpulse, treeContactInverseMass, syncTreeObstacle, TREE_FALL_LIMITS } from '../dist/src/tree-dynamics.js';
import { OffroadWorld } from '../dist/src/world.js';

const flat = () => 0;
const defaults = { pivot: { x: 0, y: .65, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, push: { x: 0, z: 1 }, length: 12, radius: .26 };
const fall = overrides => createTreeFall({ ...defaults, ...overrides });
const vec = value => new THREE.Vector3(value.x, value.y, value.z);
const quat = value => new THREE.Quaternion(value.x, value.y, value.z, value.w);
function run(state, seconds, heightAt = flat, hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) stepTreeFall(state, 1 / hz, heightAt);
  return state;
}
function contactEnvelopeClearance(state, heightAt) {
  let minimum = Infinity;
  for (let i = 0; i <= 960; i++) for (const x of [-state.radius, 0, state.radius]) for (const z of [-state.radius, 0, state.radius]) {
    const p = new THREE.Vector3(x, state.length * i / 960, z).applyQuaternion(quat(state.quaternion)).add(vec(state.pivot));
    minimum = Math.min(minimum, p.y - heightAt(p.x, p.z));
  }
  return minimum;
}

test('a newly broken tree preserves its current lean, then falls continuously under gravity', () => {
  for (const heading of [0, .8, Math.PI / 2, Math.PI]) {
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.035, heading, -.025));
    const s = fall({ quaternion: orientation, push: { x: Math.sin(heading), z: Math.cos(heading) } });
    assert.equal(s.angle, 0);
    assert(quat(s.quaternion).angleTo(orientation) < 1e-7, 'A break must not impose a new visible tilt');
    const initialTip = vec(s.tip), fixedPivot = { ...s.pivot };
    stepTreeFall(s, 1 / 60, flat);
    assert(vec(s.tip).distanceTo(initialTip) < .05, 'A whole tree cannot move metres on the first break frame');
    assert(s.direction.y > .99);
    let firstContact = null, largestRotation = 0, previousQ = quat(s.quaternion), previousTip = vec(s.tip);
    for (let i = 0; i < 600; i++) {
      stepTreeFall(s, 1 / 60, flat);
      const q = quat(s.quaternion), tip = vec(s.tip);
      largestRotation = Math.max(largestRotation, q.angleTo(previousQ));
      assert(tip.distanceTo(previousTip) < .65, 'Every subsequent frame remains a finite rotation, including landing');
      assert(Math.abs(tip.distanceTo(vec(s.pivot)) - s.length) < 1e-8, 'The falling trunk cannot stretch or shorten');
      if (s.contactCount && firstContact === null) firstContact = s.time;
      previousQ = q; previousTip = tip;
    }
    assert(firstContact > 2 && firstContact < 6, `Finite unassisted fall time: ${firstContact}`);
    assert(largestRotation < .06, '60 Hz frames must not contain an instant quarter-turn');
    assert(s.settled && s.contactCount >= 2, 'The trunk should touch down, rebound, and then settle');
    assert.deepEqual(s.pivot, fixedPivot, 'Terrain contact cannot silently move the cut root');
    assert(s.tip.x * Math.sin(heading) + s.tip.z * Math.cos(heading) > s.length * .95, 'Fall direction follows the impact');
  }
});

test('gravity uses rigid-body inertia and conserves mechanical energy before terrain contact', () => {
  for (const length of [6, 12, 22]) {
    const s = fall({ length, angularSpeed: .16, damping: 0 });
    const energy = () => s.mass * 9.81 * s.centerOfMassDistance * s.direction.y + .5 * s.inertia * s.angularSpeed ** 2;
    const start = energy(); run(s, 2.1, () => -1000);
    assert(Math.abs(energy() - start) / start < .00015, `Gravity/rotation energy changed at length ${length}`);
  }
  const short = fall({ length: 7, angularSpeed: .15 }), tall = fall({ length: 16, angularSpeed: .15 });
  run(short, 2); run(tall, 2);
  assert(short.angle > tall.angle * 1.4, 'Taller trees must not reuse the same cosmetic fall-duration curve');
  const light = fall({ mass: 500, angularSpeed: .1 }), heavy = fall({ mass: 1000, angularSpeed: .1 });
  run(light, 1); run(heavy, 1);
  assert(Math.abs(light.angle - heavy.angle) < 1e-12, 'Changing mass alone changes both gravity torque and inertia equally');
  const point = { x: 0, y: 5, z: 0 }, impulse = { x: 0, y: 0, z: 700 };
  const lightResponse = applyTreeImpulse(light, point, impulse), heavyResponse = applyTreeImpulse(heavy, point, impulse);
  assert(Math.abs(lightResponse - heavyResponse * 2) < 1e-12, 'The same impact impulse rotates a heavier tree less');
});

test('terrain shape determines touchdown and a middle boulder is refined between contact samples', () => {
  const results = {};
  const surfaces = { flat, uphill: (x, z) => .15 * z, downhill: (x, z) => -.15 * z,
    boulder: (x, z) => 1.8 * Math.exp(-Math.pow((z - 6) / 1.1, 2)) };
  for (const [name, heightAt] of Object.entries(surfaces)) {
    const s = run(fall(), 10, heightAt); results[name] = s;
    assert(s.settled, name);
    assert.deepEqual(s.pivot, defaults.pivot, `${name}: no whole-log lift or foot relocation`);
    const clearance = contactEnvelopeClearance(s, heightAt);
    assert(clearance >= -.001 && clearance < .003, `${name}: independently sampled contact clearance ${clearance}`);
    assert.equal(s.angularSpeed, 0);
  }
  assert(results.uphill.angle < results.flat.angle && results.downhill.angle > results.flat.angle);
  assert(results.boulder.angle < results.uphill.angle, 'The rock must catch the trunk before a flat-ground final pose');
  assert(Math.abs(results.boulder.lastContact.z - 6) < .2, 'Landing should be supported at the actual middle obstacle');
  assert(results.boulder.tip.y > 2, 'The far end may remain above the ground when the middle rests on a boulder');
});

test('supported trunks carry downward tire impulses without endless bounce, but lifting impulses wake them', () => {
  const s = run(fall(), 8), original = { angle: s.angle, center: { ...s.center }, contacts: s.contactCount };
  for (let i = 0; i < 1200; i++) {
    const response = applyTreeImpulse(s, s.center, { x: 0, y: -6000 / 120, z: 0 });
    assert.equal(response, 0, 'Ground carries a downward wheel load');
    stepTreeFall(s, 1 / 120, flat);
  }
  assert.equal(s.settled, true); assert.equal(s.angle, original.angle);
  assert.deepEqual(s.center, original.center); assert.equal(s.contactCount, original.contacts);
  const beforeTip = s.tip.y;
  assert(applyTreeImpulse(s, s.center, { x: 0, y: 1500, z: 0 }) < 0);
  assert.equal(s.settled, false);
  run(s, .15);
  assert(s.tip.y > beforeTip + .15, 'Upward impulse actually lifts the rigid trunk');
  run(s, 5); assert(s.settled); assert(s.contactCount > original.contacts);
});

test('contact impulse follows its point and hinge direction and exposes finite effective mass', () => {
  const s = fall({ angularSpeed: 0 }), base = { ...s.pivot }, point = { x: 0, y: 5, z: 0 };
  assert.equal(applyTreeImpulse(s, base, { x: 0, y: 0, z: 1000 }), 0, 'An impulse at the hinge has no rotation lever');
  assert.equal(applyTreeImpulse(s, point, { x: 1000, y: 0, z: 0 }), 0, 'Torque outside the one retained hinge axis is constrained');
  const inverseMass = treeContactInverseMass(s, point, { x: 0, y: 0, z: 1 });
  assert(inverseMass > 0 && inverseMass < 1 / 10, 'The tree contact must not always behave as an infinite-mass wall');
  const delta = applyTreeImpulse(s, point, { x: 0, y: 0, z: 1000 });
  const lever = point.y - s.pivot.y;
  assert(Math.abs(delta * lever / 1000 - inverseMass) < 1e-12, 'Velocity response at the contact agrees with its effective mass');
  const before = s.angularSpeed; assert(applyTreeImpulse(s, point, { x: 0, y: 0, z: -500 }) < 0); assert(s.angularSpeed < before);
});

test('an already constrained solver aggregate changes angular momentum exactly once', () => {
  const s = fall({ angularSpeed: .12 }), initial = s.angularSpeed;
  const solvedAngularImpulses = [1400, -800, 350, -90];
  const total = solvedAngularImpulses.reduce((sum, impulse) => sum + impulse, 0);
  const delta = applyTreeAngularImpulse(s, total, { constrained: true });
  assert(Math.abs(s.inertia * (s.angularSpeed - initial) - total) < 1e-9);
  assert(Math.abs(delta - total / s.inertia) < 1e-12);
  const expectedVelocity = vec(s.axis).cross(vec(s.direction).multiplyScalar(s.length * .5)).multiplyScalar(s.angularSpeed);
  assert(vec(s.velocity).distanceTo(expectedVelocity) < 1e-12);
  const supported = run(fall(), 8), before = supported.angularSpeed;
  assert.equal(applyTreeAngularImpulse(supported, 900), 0, 'Ordinary callers still respect the ground constraint');
  const outwardAggregate = -370;
  applyTreeAngularImpulse(supported, outwardAggregate, { constrained: true });
  assert(Math.abs(supported.inertia * (supported.angularSpeed - before) - outwardAggregate) < 1e-9);
  assert.equal(supported.settled, false);
});

test('fixed substeps make tree motion independent of render cadence and bound a stalled frame', () => {
  const outcomes = [30, 60, 120].map(hz => run(fall(), 4.5, flat, hz));
  for (const state of outcomes.slice(1)) for (const key of ['angle', 'angularSpeed', 'time', 'contactCount']) {
    assert.equal(state[key], outcomes[0][key], key);
  }
  const stalled = fall(); stepTreeFall(stalled, 1000, flat);
  assert(stalled.time <= TREE_FALL_LIMITS.maxFrameTime + 1e-12);
  assert(stalled.direction.y > .999, 'Returning from a suspended tab cannot finish a fall in one frame');
  const before = structuredClone(stalled);
  for (const dt of [NaN, Infinity, -1, 0]) assert.equal(stepTreeFall(stalled, dt, flat), false);
  assert.deepEqual(stalled, before);
});

function createTestWorld() {
  const terrain = { obstacles: [], obstacleRevision: 0, heightAt: flat, surfaceAt: () => 'dirt', trailX: () => 0,
    _dirtCover: () => ({ grass: 1, hardpack: 0, gravel: 0 }), detailTiles: new Map(),
    sample: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'dirt', compaction: 0, waterDepth: 0 }) };
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, { terrain, scene: new THREE.Scene(), clock: 0, damageRecords: new Map(),
    _textureLoader: { load() { return new THREE.Texture(); } } });
  world._createVegetation();
  return world;
}
function matrixAt(mesh, index) { const m = new THREE.Matrix4(); mesh.getMatrixAt(index, m); return m; }
function matrixClose(a, b, tolerance = 3e-5) {
  for (let i = 0; i < 16; i++) assert(Math.abs(a.elements[i] - b.elements[i]) < tolerance, `Matrix component ${i}: ${a.elements[i]} vs ${b.elements[i]}`);
}

test('visible trunk, branches, crown, scars and the live collider share the continuously simulated pose', () => {
  const world = createTestWorld(), tree = world.treeRecords.at(-2);
  tree.push.set(.4, 0, 1).normalize(); world._poseTree(tree, .037);
  const before = matrixAt(world.trunks, tree.index), crownBefore = matrixAt(world.foliage, tree.index);
  const beforeTop = new THREE.Vector3(0, .5, 0).applyMatrix4(before);
  const barkPoint = new THREE.Vector3(.73, -.14, 0).applyMatrix4(before), barkNormal = new THREE.Vector3(1, 0, 0).transformDirection(before);
  const slot = world._addScuff(barkPoint, barkNormal, .14, '#ad885d', tree);
  const markBefore = matrixAt(world.damageMarks, slot), initialPose = new THREE.Quaternion(); before.decompose(new THREE.Vector3(), initialPose, new THREE.Vector3());
  const originalObstacles = world.terrain.obstacles.length;
  world._breakTree(tree, { speed: 15, energy: 170000, point: { x: tree.x, y: tree.y + .9, z: tree.z } });
  const log = tree.fallenObstacle;
  assert.equal(log.treeFall, tree.fall); assert.equal(log.shape, 'box');
  assert.equal(world.terrain.obstacles.length, originalObstacles + 1);
  assert.equal(world.stumps.count, 1); assert.equal(world.setWinchLoad(tree.id, { x: 1000, z: 0 }), false);
  const afterTop = new THREE.Vector3(0, .5, 0).applyMatrix4(matrixAt(world.trunks, tree.index));
  assert(afterTop.distanceTo(beforeTop) < 3e-5, 'Creating the fracture cannot move the top of the visible trunk');
  matrixClose(matrixAt(world.foliage, tree.index), crownBefore);
  matrixClose(matrixAt(world.damageMarks, slot), markBefore);
  const root = vec(tree.fall.pivot), initialInverse = new THREE.Matrix4().makeTranslation(root.x, root.y, root.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(initialPose)).invert();
  for (let i = 0; i < 660; i++) {
    stepTreeFall(tree.fall, 1 / 120, flat); syncTreeObstacle(log);
    world._updateObjectDamage(1 / 120, { impacts: [] });
    if (i % 30) continue;
    const trunk = matrixAt(world.trunks, tree.index), crown = matrixAt(world.foliage, tree.index), branches = matrixAt(world.branches, tree.index);
    matrixClose(crown, branches, 1e-8);
    assert(new THREE.Vector3().setFromMatrixPosition(trunk).distanceTo(vec(log.center)) < 2e-5, 'Rendered trunk center and collision center must agree during the fall');
    const shownDirection = new THREE.Vector3(0, 1, 0).transformDirection(trunk);
    assert(shownDirection.distanceTo(new THREE.Vector3(0, 1, 0).applyQuaternion(quat(log.quaternion))) < 1e-7);
    const delta = new THREE.Matrix4().makeTranslation(root.x, root.y, root.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(quat(log.quaternion))).multiply(initialInverse);
    matrixClose(crown, delta.clone().multiply(crownBefore));
    matrixClose(matrixAt(world.damageMarks, slot), delta.multiply(markBefore));
    assert.deepEqual(log.velocity, tree.fall.velocity); assert.deepEqual(log.angularVelocity, tree.fall.angularVelocity);
  }
  assert(tree.fall.settled);
  world.resetDamage();
  assert.equal(tree.broken, false); assert.equal(tree.fall, null); assert.equal(tree.fallenObstacle, null);
  assert.equal(world.terrain.obstacles.length, originalObstacles); assert.equal(world.stumps.count, 0); assert.equal(world.damageMarks.count, 0);
  assert.deepEqual(tree.obstacle, tree.originalObstacle, 'Reset removes all moving/stump-only collider properties');
  matrixClose(matrixAt(world.trunks, tree.index), tree.trunkMatrix);
  assert(world.getWinchAnchors().some(anchor => anchor.id === tree.id));
});
