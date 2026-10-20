import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from '../dist/vendor/cannon-es.js';
import { createTreeFall, stepTreeFall, syncTreeObstacle, applyTreeAngularImpulse } from '../dist/src/tree-dynamics.js';
import { installTreeCollision } from '../dist/src/tree-collision.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';

const dt = 1 / 120, V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const vector = p => V(p.x, p.y, p.z);
const quaternion = q => new CANNON.Quaternion(q.x, q.y, q.z, q.w);
const near = (actual, expected, tolerance, why) => assert(Math.abs(actual - expected) <= tolerance, `${why}: ${actual} vs ${expected}`);
const sameQuaternion = (a, b, tolerance = 1e-10) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w) < tolerance;
function makeFall(options = {}) {
  return createTreeFall({ pivot: { x: 0, y: .65, z: 0 }, length: 12, radius: .26, mass: 1000, angularSpeed: 0, damping: 0, ...options });
}
function settle(state) {
  state.angularSpeed = .10;
  for (let i = 0; i < 1200; i++) stepTreeFall(state, dt, () => 0);
  assert(state.settled); return state;
}
function collisionFixture({ state = makeFall(), friction = 0, gravity = V(), ordinary = false } = {}) {
  const world = new CANNON.World({ gravity }); world.allowSleep = false;
  world.solver.iterations = 50; world.solver.tolerance = 1e-12;
  // Use the stiff, zero-restitution limit for the analytic point-impact test.
  // Ordinary production contacts retain the application's normal tuning.
  Object.assign(world.defaultContactMaterial, { friction, restitution: 0,
    contactEquationStiffness: 1e12, contactEquationRelaxation: 1e7 });
  const obstacle = { id: ordinary ? 'test-rock' : 'test-log', type: ordinary ? 'rock' : 'tree', shape: 'box',
    halfExtents: { x: state.radius, y: state.length * .5, z: state.radius }, treeFall: state };
  syncTreeObstacle(obstacle); if (ordinary) delete obstacle.treeFall;
  const trunk = new CANNON.Body({ mass: 0, type: ordinary ? CANNON.Body.STATIC : CANNON.Body.KINEMATIC,
    position: vector(state.center), quaternion: quaternion(state.quaternion), shape: new CANNON.Box(vector(obstacle.halfExtents)),
    collisionFilterGroup: 2, collisionFilterMask: 1 });
  trunk.terraObstacle = obstacle;
  // This fixture follows the production ownership contract: the hinge owns
  // pose integration. Cannon owns the actual narrowphase and contact solve.
  if (!ordinary) trunk.integrate = () => {};
  world.addBody(trunk);
  const bridge = installTreeCollision(world);
  return { world, state, obstacle, trunk, bridge };
}
function sphere(fixture, position, velocity, mass = 1000) {
  const body = new CANNON.Body({ mass, position: vector(position), shape: new CANNON.Sphere(.5),
    linearDamping: 0, angularDamping: 0, collisionFilterGroup: 1, collisionFilterMask: 2 });
  body.velocity.copy(velocity); fixture.world.addBody(body); return body;
}
function tick(fixture) { fixture.world.step(dt); fixture.bridge.finish(dt); }

test('a real sphere/trunk contact shares finite impact momentum according to the contact lever', () => {
  for (const contactHeight of [.95, 5, 9]) {
    const fixture = collisionFixture(), { state } = fixture;
    const vehicle = sphere(fixture, V(0, contactHeight, -state.radius - .5 + 1e-7), V(0, 0, 8));
    const lever = contactHeight - state.pivot.y;
    const expectedImpulse = 8 / (1 / vehicle.mass + lever * lever / state.inertia);
    const initialPosition = vector(state.center), initialQuaternion = quaternion(state.quaternion);
    tick(fixture);
    assert.equal(fixture.world.contacts.length, 1, 'The fixture must produce one actual narrowphase contact');
    const vehicleImpulse = vehicle.mass * (8 - vehicle.velocity.z);
    near(vehicleImpulse, expectedImpulse, expectedImpulse * 2e-6, 'Inelastic point-impact impulse');
    near(state.inertia * state.angularSpeed, vehicleImpulse * lever, 1e-7, 'Equal and opposite generalized angular momentum');
    assert(vehicle.velocity.z > .001 && state.angularSpeed > 0, 'A finite tree moves and lets the impactor retain momentum');
    const contactVelocity = state.angularSpeed * lever;
    near(vehicle.velocity.z, contactVelocity, 3e-6, 'Separating normal velocities agree in the stiff inelastic limit');
    assert(fixture.trunk.position.almostEquals(initialPosition, 1e-12), 'The contact solver cannot separately integrate the tree pose');
    assert(sameQuaternion(fixture.trunk.quaternion, initialQuaternion, 1e-12));
    near(fixture.trunk.angularVelocity.x, state.angularSpeed, 1e-12, 'The next contact sees the solved tree velocity');
  }
});

test('a resting log carries inward impacts, while a real underside impact can lift it', () => {
  for (const lift of [false, true]) {
    const state = settle(makeFall()), fixture = collisionFixture({ state });
    const q = quaternion(state.quaternion), up = q.vmult(V(0, 0, -1));
    const side = lift ? -1 : 1;
    const position = vector(state.center).vadd(up.scale(side * (state.radius + .5 - 1e-7)));
    const incoming = up.scale(-side * 3), impactor = sphere(fixture, position, incoming);
    const beforeAngle = state.angle;
    tick(fixture);
    assert.equal(fixture.world.contacts.length, 1);
    if (!lift) {
      assert.equal(state.settled, true, `Supported log should stay at rest; residual angular speed ${state.angularSpeed}`); assert.equal(state.angularSpeed, 0);
      near(impactor.velocity.dot(up), 0, 1e-6, 'Ground-supported inward impact stops at the log');
    } else {
      assert.equal(state.settled, false); assert(state.angularSpeed < 0);
      const impulse = incoming.vsub(impactor.velocity).scale(impactor.mass);
      const contactPoint = vector(state.center).vsub(up.scale(state.radius));
      const arm = contactPoint.vsub(vector(state.pivot));
      near(state.inertia * state.angularSpeed, arm.cross(impulse).dot(vector(state.axis)), 1e-6, 'The lifting impact transfers its angular impulse');
      stepTreeFall(state, dt, () => 0); assert(state.angle < beforeAngle, 'The solved impulse produces actual upward rotation next substep');
    }
  }
});

test('a log lifted under a simultaneous downward load shares momentum with both actual contacts', () => {
  const state = settle(makeFall()), fixture = collisionFixture({ state });
  const up = quaternion(state.quaternion).vmult(V(0, 0, -1));
  const offset = state.radius + .5 - 1e-7;
  const aboveIncoming = up.scale(-2);
  const above = sphere(fixture, vector(state.center).vadd(up.scale(offset)), aboveIncoming, 800);
  const belowIncoming = up.scale(3);
  const below = sphere(fixture, vector(state.center).vsub(up.scale(offset)), belowIncoming, 1000);
  tick(fixture);
  assert.equal(fixture.world.contacts.length, 2);
  assert.equal(state.settled, false); assert(state.angularSpeed < 0);
  // A positive combined upward momentum releases the ground constraint. At
  // this common axial station the hinge is equivalent to I / lever^2, so both
  // impactors and the lifted trunk have the same inelastic normal velocity.
  const lever = state.length * .5, expectedVelocity = (below.mass * 3 - above.mass * 2)
    / (above.mass + below.mass + state.inertia / (lever * lever));
  near(above.velocity.dot(up), expectedVelocity, 3e-6, 'The lifted log must carry its downward load');
  near(below.velocity.dot(up), expectedVelocity, 3e-6, 'The lifting body shares momentum with both loaded masses');
  near(-state.angularSpeed * lever, expectedVelocity, 3e-6, 'Rigid trunk contact-point velocity');
  const liftingImpulse = belowIncoming.vsub(below.velocity).scale(below.mass);
  const lowerContact = vector(state.center).vsub(up.scale(state.radius));
  const downwardImpulse = aboveIncoming.vsub(above.velocity).scale(above.mass);
  const upperContact = vector(state.center).vadd(up.scale(state.radius));
  const expectedMomentum = lowerContact.vsub(vector(state.pivot)).cross(liftingImpulse).dot(vector(state.axis))
    + upperContact.vsub(vector(state.pivot)).cross(downwardImpulse).dot(vector(state.axis));
  near(state.inertia * state.angularSpeed, expectedMomentum, 1e-6, 'All accepted contact reactions contribute equal and opposite hinge momentum');
});

test('the shared solver supports repeated tire-load impulses even without chassis contact equations', () => {
  const state = settle(makeFall()), fixture = collisionFixture({ state });
  const initial = { angle: state.angle, contactCount: state.contactCount, center: { ...state.center } };
  for (let i = 0; i < 1200; i++) {
    stepTreeFall(state, dt, () => 0);
    const loadImpulse = V(0, -6000 * dt, 0);
    const angularImpulse = vector(state.center).vsub(vector(state.pivot)).cross(loadImpulse).dot(vector(state.axis));
    applyTreeAngularImpulse(state, angularImpulse, { constrained: true });
    syncTreeObstacle(fixture.obstacle);
    fixture.trunk.velocity.copy(state.velocity); fixture.trunk.angularVelocity.copy(state.angularVelocity);
    tick(fixture);
    assert.equal(fixture.world.contacts.length, 0, 'Ground support must exist when only tires load the trunk');
    assert.equal(state.settled, true, `Ground support iteration ${i}: ${state.angularSpeed}`);
    assert.equal(state.angularSpeed, 0);
  }
  assert.equal(state.angle, initial.angle); assert.equal(state.contactCount, initial.contactCount);
  assert.deepEqual(state.center, initial.center, 'Sustained wheel load cannot repeatedly sink or bounce a supported trunk');
});

test('pooled contact and friction equations behave normally when reused on a rock', () => {
  const fixture = collisionFixture({ friction: .5, gravity: V(0, -9.81, 0) });
  const position = V(0, 5, -.26 - .5 + 1e-7), velocity = V(2, -.4, 8);
  const vehicle = sphere(fixture, position, velocity);
  tick(fixture);
  const previousContact = fixture.world.contacts[0], previousFriction = new Set(fixture.world.frictionEquations);
  const treeAngularSpeed = fixture.state.angularSpeed;
  delete fixture.obstacle.treeFall; fixture.obstacle.type = 'rock'; fixture.trunk.type = CANNON.Body.STATIC;
  fixture.trunk.velocity.setZero(); fixture.trunk.angularVelocity.setZero();
  vehicle.position.copy(position); vehicle.velocity.copy(velocity); vehicle.angularVelocity.setZero(); vehicle.quaternion.set(0, 0, 0, 1);
  vehicle.aabbNeedsUpdate = true; fixture.world.broadphase.dirty = true;
  const clean = collisionFixture({ ordinary: true, friction: .5, gravity: V(0, -9.81, 0) });
  const reference = sphere(clean, position, velocity);
  tick(fixture); tick(clean);
  assert(fixture.world.contacts.includes(previousContact), 'This check must actually exercise Cannon contact pooling');
  assert(fixture.world.frictionEquations.some(equation => previousFriction.has(equation)), 'This check must exercise friction pooling too');
  assert(vehicle.velocity.almostEquals(reference.velocity, 1e-8), `Old tree response must not leak into rock velocity: ${vehicle.velocity} vs ${reference.velocity}`);
  assert(vehicle.angularVelocity.almostEquals(reference.angularVelocity, 1e-8));
  assert.equal(fixture.state.angularSpeed, treeAngularSpeed, 'An unrelated later obstacle contact cannot modify the old tree');
});

test('production physics integrates a remote falling tree once and keeps its collider at that pose', () => {
  const state = makeFall({ pivot: { x: 50, y: .65, z: 40 }, angularSpeed: .17 });
  const descriptor = { id: 'remote-log', type: 'tree', shape: 'box', halfExtents: { x: state.radius, y: state.length * .5, z: state.radius }, treeFall: state };
  syncTreeObstacle(descriptor);
  const sample = () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'asphalt', mu: .94,
    rollingResistance: .014, softness: 0, waterDepth: 0 });
  const terrain = { sample, heightAt: () => 0, obstacles: [descriptor], obstacleRevision: 0 };
  const physics = new VehiclePhysics(terrain, VEHICLES[0]); physics.reset({ x: 0, z: 0, heading: 0 });
  const reference = makeFall({ pivot: { x: 50, y: .65, z: 40 }, angularSpeed: .17 });
  for (let i = 0; i < 120; i++) {
    physics.step(1 / 60, { brake: 1, handbrake: true });
    stepTreeFall(reference, 1 / 60, () => 0);
    near(state.angle, reference.angle, 1e-12, 'Fixed physics clock advances exactly the expected rotation');
    const body = physics._obstacleBodies.find(body => body.terraObstacle.id === descriptor.id);
    assert(body, 'The simulated tree must retain its live collision body');
    assert(body.position.almostEquals(vector(state.center), 1e-10));
    assert(sameQuaternion(body.quaternion, quaternion(state.quaternion)), 'Cannon cannot advance the externally integrated hinge quaternion again');
  }
});
