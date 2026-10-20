import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { WinchRecovery, WINCH_SPEC } from '../dist/src/winch.js';
import { WinchView } from '../dist/src/winch-view.js';
import { VehicleView } from '../dist/src/vehicle-view.js';
import { Scene, Vector3 } from '../dist/vendor/three.module.js';

const jeep = VEHICLES.find(vehicle => vehicle.id === 'wrangler-rubicon');
const tree = (id, x, z) => ({ id, x, y: 0, z, height: 12, obstacle: { radius: .34, height: 11 }, broken: false });
function setup({ terrain: overrides = {}, anchors = [tree('ahead', 0, 18)], spec = jeep } = {}) {
  const terrain = {
    heightAt: (x, z) => overrides.heightAt?.(x, z) ?? 0,
    sample: (x, z) => ({ height: overrides.heightAt?.(x, z) ?? 0, normal: { x: 0, y: 1, z: 0 }, surface: 'mud', mu: .05,
      rollingResistance: .12, softness: .7, maxSink: 0, waterDepth: 0, ...overrides }),
  };
  const physics = new VehiclePhysics(terrain, spec);
  physics.reset({ x: 0, z: 0, heading: 0 });
  for (let i = 0; i < 120; i++) physics.step(1 / 120, {});
  physics.setControl('selector', 'N');
  const winch = new WinchRecovery(physics, terrain, () => anchors);
  physics.setExternalForceProvider(dt => winch.step(dt));
  return { terrain, physics, winch, anchors };
}
function run(physics, seconds, hz = 120, input = {}) {
  for (let i = 0; i < Math.round(seconds * hz); i++) physics.step(1 / hz, input);
}
function attach(setup, id = 'ahead') {
  assert.equal(setup.winch.setEquipped(true).ok, true);
  const result = setup.winch.attach(id);
  assert.equal(result.ok, true, result.message);
}

test('winch mounting and attachment enforce a standing, reachable, unobstructed front anchor', () => {
  const s = setup({ anchors: [tree('ahead', 0, 18), tree('behind', 0, -12), tree('far', 0, 40), { ...tree('broken', 4, 14), broken: true }] });
  assert.equal(s.winch.attach('ahead').ok, false);
  s.physics.body.velocity.z = 2;
  assert.equal(s.winch.setEquipped(true).ok, false);
  s.physics.body.velocity.set(0, 0, 0);
  assert.equal(s.winch.setEquipped(true).ok, true);
  assert.deepEqual(s.winch.candidates().map(candidate => candidate.id), ['ahead']);
  s.physics.body.velocity.z = 2;
  assert.equal(s.winch.attach('ahead').ok, false);
  s.physics.body.velocity.set(0, 0, 0);
  assert.equal(s.winch.attach('ahead').ok, true);
  assert.equal(s.winch.attach('ahead').ok, false);
  assert(s.winch.state.ropeLength <= WINCH_SPEC.usableLength);
  s.winch.detach();
  s.anchors.push(tree('blocking', 0, 9));
  assert.equal(s.winch.attach('ahead').ok, false);
  assert.match(s.winch.candidates().find(candidate => candidate.id === 'ahead').reason, /tree blocks/);
  const ridge = setup({ terrain: { heightAt: (x, z) => z > 7 && z < 8 ? 2 : 0 } });
  ridge.winch.setEquipped(true);
  assert.equal(ridge.winch.attach('ahead').ok, false);
  const log = setup();
  log.terrain.obstacles = [{ id: 'fallen-log', shape: 'box', center: { x: 0, y: .7, z: 8 }, halfExtents: { x: 3, y: .3, z: .3 } }];
  log.winch.setEquipped(true);
  assert.equal(log.winch.attach('ahead').ok, false, 'separate collision objects must also block cable attachment');
});

test('slack rope has no pushing force; a taut cable pulls at the fairlead and yaws the chassis', () => {
  const s = setup({ anchors: [tree('side', 8, 18)] });
  attach(s, 'side');
  s.physics.body.force.set(0, 0, 0); s.physics.body.torque.set(0, 0, 0);
  s.winch.step(1 / 120);
  assert.equal(s.winch.state.tension, 0);
  assert.equal(s.physics.body.force.length(), 0);
  s.winch.ropeLength -= .22;
  s.winch.step(1 / 120);
  const state = s.winch.state;
  assert(state.tension > 0);
  assert(s.physics.body.force.x > 0 && s.physics.body.force.z > 0);
  assert(s.physics.body.torque.y > 0, 'off-center fairlead force must produce a real yaw moment');
  assert.equal(state.anchorForce.x, -s.physics.body.force.x);
  assert.equal(state.anchorForce.z, -s.physics.body.force.z);
  assert(Math.abs(state.hook.z - s.physics.body.position.z) > 2);
});

test('reeling recovers a vehicle against soft-ground resistance through physical motion', () => {
  const s = setup(); attach(s);
  const before = s.physics.body.position.clone(), length = s.winch.ropeLength;
  s.winch.setCommand(1);
  run(s.physics, 16);
  assert(s.winch.state.attached, s.winch.state.status);
  assert(s.winch.ropeLength < length - .6);
  assert(s.physics.body.position.z > before.z + .5, `actual recovery displacement ${s.physics.body.position.z - before.z}`);
  assert(Math.abs(s.physics.body.position.x - before.x) < .2);
  assert(Math.abs(s.physics.body.velocity.z) < .18, 'recovery must follow the motor speed, without teleporting or launching');
  assert(s.winch.tension > 100, 'resistance creates line load');
  const heldLength = s.winch.ropeLength;
  s.winch.setCommand(0); run(s.physics, 2);
  assert.equal(s.winch.ropeLength, heldLength, 'released remote applies the drum brake');
  s.winch.setCommand(-1); run(s.physics, 2);
  assert(s.winch.ropeLength > heldLength + .20);
  assert(s.winch.tension < 100, 'paying out makes a stationary cable slack');
});

test('winch applies its force every fixed substep, independent of render cadence', () => {
  const a = setup(), b = setup(); attach(a); attach(b);
  a.winch.setCommand(1); b.winch.setCommand(1);
  run(a.physics, 7, 30); run(b.physics, 7, 120);
  assert(Math.abs(a.physics.body.position.z - b.physics.body.position.z) < 1e-8);
  assert(Math.abs(a.winch.ropeLength - b.winch.ropeLength) < 1e-10);
  assert(Math.abs(a.winch.tension - b.winch.tension) < 1e-5);
});

test('detaching, a broken tree and shock overload leave no stale pulling force', () => {
  const s = setup(); attach(s);
  s.winch.setCommand(1); run(s.physics, 3);
  s.anchors[0].broken = true;
  s.physics.body.force.set(0, 0, 0); s.winch.step(1 / 120);
  assert.equal(s.winch.state.attached, false);
  assert.equal(s.winch.state.tension, 0);
  assert.equal(s.physics.body.force.length(), 0);
  assert.match(s.winch.state.status, /Anchor tree failed/);
  s.anchors[0].broken = false; s.physics.body.velocity.set(0, 0, 0); attach(s);
  s.winch.ropeLength -= 2;
  for (let i = 0; i < 20; i++) s.winch.step(1 / 120);
  assert.equal(s.winch.state.attached, false);
  assert.match(s.winch.state.status, /overloaded/);
  s.physics.body.force.set(0, 0, 0); s.winch.step(1 / 120);
  assert.equal(s.physics.body.force.length(), 0);
  assert.deepEqual(s.winch.state.anchorForce, { x: -0, y: -0, z: -0 });
});

test('rope renderer shares the actual model fairlead and a finite, grounded cable path', () => {
  for (const spec of VEHICLES) {
    const s = setup({ spec }); attach(s);
    const scene = new Scene(), view = new VehicleView(scene, spec), cable = new WinchView(scene, s.terrain);
    view.setWinchEnabled(true); view.update(s.physics.state);
    view.root.updateMatrixWorld(true);
    const modelAnchor = view.getWinchAnchor(new Vector3()), hook = s.winch.hookPoint();
    assert(modelAnchor.distanceTo(new Vector3(hook.x, hook.y, hook.z)) < 1e-6, spec.id);
    cable.update(s.winch.state);
    assert.equal(cable.group.visible, true);
    assert(cable.points[0].distanceTo(modelAnchor) < 1e-6);
    assert(cable.points.at(-1).distanceTo(new Vector3(s.winch.state.anchor.x, s.winch.state.anchor.y, s.winch.state.anchor.z)) < 1e-6);
    assert([...cable.geometry.attributes.position.array].every(Number.isFinite));
    const position = cable.geometry.attributes.position, normal = cable.geometry.attributes.normal;
    const [a, b, c] = [...cable.geometry.index.array].slice(0, 3);
    const pa = new Vector3().fromBufferAttribute(position, a), pb = new Vector3().fromBufferAttribute(position, b), pc = new Vector3().fromBufferAttribute(position, c);
    const faceNormal = pb.sub(pa).cross(pc.sub(pa));
    assert(faceNormal.dot(new Vector3().fromBufferAttribute(normal, a)) > 0, 'steel tube faces must face outwards for normal backface culling');
    assert(cable.points.every(p => p.y >= 0));
    s.winch.detach(); cable.update(s.winch.state); assert.equal(cable.group.visible, false);
    cable.dispose(); view.dispose();
  }
});
