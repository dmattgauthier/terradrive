import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from '../dist/vendor/cannon-es.js';
import * as THREE from '../dist/vendor/three.module.js';
import { Terrain } from '../dist/src/terrain.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { createChallengeCourse, challengeLoopFrame, CHALLENGE_ZONE } from '../dist/src/challenge-course.js';

const course = createChallengeCourse(), profiles = course.features.find(feature => feature.id === 'loop').profiles;
const arc = [0];
for (let i = 1; i < profiles.length; i++) arc.push(arc.at(-1) + Math.hypot(profiles[i].point.x - profiles[i - 1].point.x, profiles[i].point.y - profiles[i - 1].point.y, profiles[i].point.z - profiles[i - 1].point.z));
const v = a => new THREE.Vector3(a.x, a.y, a.z);

function make(id = 'wrangler-rubicon', spawn = { x: -236, z: 35, heading: 0 }) {
  const terrain = new Terrain(); terrain.course = course;
  const physics = new VehiclePhysics(terrain, VEHICLES.find(spec => spec.id === id)); physics.reset(spawn);
  assert.ok(physics.world._terraChallengeCollisionFilter, 'The actual physics constructor must install the collision filter');
  assert.ok(physics._courseBodies.some(body => body.shapes.some(shape => shape.terraCourse?.exposedFaces)), 'Core integration must retain exterior-face metadata');
  return physics;
}

function settle(physics) { for (let i = 0; i < 120; i++) physics.step(1 / 120, {}); }

function placeOnFrame(physics, angle, normalOffset = physics.spec.cgHeight) {
  const frame = challengeLoopFrame(angle), rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(frame.across), v(frame.normal), v(frame.tangent)));
  physics.body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  physics.body.position.set(frame.point.x + frame.normal.x * normalOffset, frame.point.y + frame.normal.y * normalOffset, frame.point.z + frame.normal.z * normalOffset);
  physics.body.velocity.setZero(); physics.body.angularVelocity.setZero(); physics.controls.selector = 'N';
  physics.body.aabbNeedsUpdate = true; return frame;
}

/** Test driver only: ordinary steering input follows a marked lane. It never
 * sets position, orientation or velocity after the initial fixture launch. */
function driveLoop(physics, { initialSpeed = 0, poweredRunup = false, seconds = 18 } = {}) {
  settle(physics);
  if (initialSpeed) {
    physics.controls.selector = 'N'; physics.body.velocity.set(0, 0, initialSpeed);
    for (const wheel of physics._wheels) wheel.omega = initialSpeed / wheel.radius;
  }
  let nearest = 0, maxIndex = 0, peakHeight = physics.body.position.y, entered = false, lifted = false, entrySpeed = 0;
  let returned = false, crownGrounded = 0, crownDownwardNormals = 0, maxContacts = 0, maxTireBudgetRatio = 0;
  for (let tick = 0; tick < seconds * 120; tick++) {
    let distance = Infinity;
    for (let j = Math.max(0, nearest - 60); j <= Math.min(profiles.length - 1, nearest + 60); j++) {
      const point = profiles[j].point, d = Math.hypot(physics.body.position.x - point.x, physics.body.position.y - point.y, physics.body.position.z - point.z);
      if (d < distance) { nearest = j; distance = d; }
    }
    const lookahead = 6 + physics.body.velocity.length() * .16;
    let target = nearest; while (target < profiles.length - 1 && arc[target] - arc[nearest] < lookahead) target++;
    const frame = profiles[target];
    let point = new CANNON.Vec3(frame.point.x + frame.normal.x * physics.spec.cgHeight, frame.point.y + frame.normal.y * physics.spec.cgHeight, frame.point.z + frame.normal.z * physics.spec.cgHeight);
    if (physics.body.position.z < 50 && maxIndex < 50) point.set(-236, 5.5, physics.body.position.z + lookahead);
    else if (nearest >= profiles.length - 3) point.set(-222, 5.5, physics.body.position.z + lookahead);
    const local = physics.body.pointToLocalFrame(point), angle = Math.atan2(2 * physics.spec.wheelbase * local.x, Math.max(1, local.x ** 2 + local.z ** 2));
    const steer = Math.max(-.6, Math.min(.6, -angle / .59));
    if (physics.body.position.z >= 58) lifted = true;
    physics.step(1 / 120, { steer, throttle: poweredRunup && !lifted ? 1 : 0 });
    maxIndex = Math.max(maxIndex, nearest); peakHeight = Math.max(peakHeight, physics.body.position.y);
    maxContacts = Math.max(maxContacts, physics.world._terraChallengeCollisionFilter.stats.retained);
    if (physics.body.position.z > 58 && !entered) { entered = true; entrySpeed = physics.body.velocity.length(); }
    if (nearest > 290 && nearest < 310) {
      crownGrounded = Math.max(crownGrounded, physics.state.groundedWheels);
      crownDownwardNormals = Math.max(crownDownwardNormals, physics._wheels.filter(wheel => wheel.contact && wheel.normal.y < -.95).length);
    }
    for (const wheel of physics.state.wheels) if (wheel.load > 1) maxTireBudgetRatio = Math.max(maxTireBudgetRatio, Math.hypot(wheel.longitudinalForce, wheel.lateralForce) / (wheel.frictionCoefficient * wheel.load));
    if (maxIndex > 560 && physics.body.position.y < 8 && physics.body.position.z > 62 && physics.state.groundedWheels > 1) { returned = true; break; }
    if (physics.damage.disabled && physics.body.velocity.length() < 3) break;
  }
  return { returned, maxIndex, peakHeight, entrySpeed, exitSpeed: physics.body.velocity.length(), crownGrounded, crownDownwardNormals, maxContacts, maxTireBudgetRatio };
}

test('ordinary six-axis wheel contacts support walls and an inverted crown', () => {
  const physics = make();
  for (const angle of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    placeOnFrame(physics, angle); physics._collectContacts(1 / 120);
    assert.equal(physics._wheels.filter(wheel => wheel.contact && wheel.constructed).length, 4);
    assert.ok(physics._wheels.every(wheel => wheel.data.softness === 0 && wheel.data.sink === 0));
    if (angle === Math.PI) assert.ok(physics._wheels.every(wheel => wheel.normal.y < -.95), 'The crown support force points downward in world coordinates');
  }
});

test('a Wrangler can traverse the full loop under gravity with ordinary steering and coasting', () => {
  const physics = make(), result = driveLoop(physics, { initialSpeed: 40, seconds: 14 });
  if (process.argv.includes('--report')) console.log('Wrangler loop', JSON.stringify(result));
  assert.equal(result.returned, true, JSON.stringify(result));
  assert.ok(result.peakHeight > 43 && result.peakHeight < 44.5); assert.equal(result.crownGrounded, 4); assert.equal(result.crownDownwardNormals, 4);
  assert.ok(result.maxContacts <= 12, 'Tessellation must not multiply chassis contact/friction');
  assert.ok(result.maxTireBudgetRatio <= 1.00001); assert.equal(physics.damage.disabled, false);
  assert.ok(physics.body.velocity.length() > 15 && physics.body.velocity.length() < 32);
});

test('the Hummer reaches and completes the loop from the actual park spawn', () => {
  const physics = make('hummer-ev-suv-3x', CHALLENGE_ZONE.spawn), result = driveLoop(physics, { poweredRunup: true, seconds: 30 });
  if (process.argv.includes('--report')) console.log('Hummer loop', JSON.stringify(result));
  assert.equal(result.returned, true, JSON.stringify(result));
  assert.ok(result.entrySpeed > 36 && result.entrySpeed < 46); assert.equal(result.crownGrounded, 4); assert.equal(result.crownDownwardNormals, 4);
  assert.equal(physics.damage.disabled, false); assert.ok(result.maxContacts <= 12 && result.maxTireBudgetRatio <= 1.00001);
});

test('insufficient entry energy loses contact and falls instead of following a forced loop', () => {
  const physics = make(), result = driveLoop(physics, { initialSpeed: 22, seconds: 12 });
  if (process.argv.includes('--report')) console.log('Failed-speed loop', JSON.stringify(result));
  assert.equal(result.returned, false); assert.ok(result.peakHeight < 30); assert.equal(result.crownGrounded, 0);
  assert.ok(physics.body.position.y < 12, 'Gravity brings the failed attempt back down');
});

test('the actual gap has airborne travel and gravity, with no invisible wheel support', () => {
  const physics = make(); physics.controls.selector = 'N'; physics.body.position.set(-183, 9.4, 4.7); physics.body.velocity.set(0, 0, 0); physics.body.angularVelocity.setZero();
  physics._collectContacts(1 / 120); assert.equal(physics._wheels.filter(wheel => wheel.contact).length, 0);
  const start = physics.body.position.y;
  for (let i = 0; i < 36; i++) physics.step(1 / 120, {});
  assert.equal(physics.state.groundedWheels, 0); assert.ok(physics.body.position.y < start - .4 && physics.body.velocity.y < -2.7);
});

test('the gap jump can be taken with a real chassis and ordinary forward momentum', () => {
  const physics = make('wrangler-rubicon', { x: -183, z: -43, heading: 0 }); settle(physics);
  physics.controls.selector = 'N'; physics.body.velocity.set(0, 0, 18);
  for (const wheel of physics._wheels) wheel.omega = 18 / wheel.radius;
  let airborne = 0, peakHeight = physics.body.position.y, landed = false;
  for (let i = 0; i < 900; i++) {
    physics.step(1 / 120, {}); peakHeight = Math.max(peakHeight, physics.body.position.y);
    if (physics.body.position.z > 2 && physics.body.position.z < 8 && physics.state.groundedWheels === 0) airborne++;
    if (physics.body.position.z > 25 && physics.state.groundedWheels > 1) { landed = true; break; }
  }
  assert.ok(airborne > 30, 'All four wheels must leave the surface across the actual opening');
  assert.ok(peakHeight > 9.3 && peakHeight < 10.5); assert.equal(landed, true);
  assert.equal(physics.damage.disabled, false); assert.ok(physics.body.velocity.z > 10);
});

test('exposed loop sidewalls and underside still collide with a real chassis', () => {
  const underside = make(), top = challengeLoopFrame(Math.PI);
  // Isolate the deck's exterior face: the real crossmembers would correctly
  // catch a falling chassis first. Their unfiltered contact is checked below.
  for (const body of underside._courseBodies) if (body.terraObstacle.id.startsWith('loop-crossmember')) underside.world.removeBody(body);
  underside.body.quaternion.set(0, 0, 0, 1); underside.body.position.set(top.point.x, top.point.y + course.features.find(feature => feature.id === 'loop').thickness + 1.65, top.point.z); underside.body.velocity.set(0, -6, 0); underside.controls.selector = 'N';
  let undersideContact = false;
  for (let i = 0; i < 42; i++) {
    underside.step(1 / 120, {});
    for (const c of underside.world.contacts) {
      const force = c.ni.scale(c.bi === underside.body ? -1 : 1);
      if ((c.si?.terraCourse || c.sj?.terraCourse) && force.y > .8) undersideContact = true;
    }
  }
  assert.equal(undersideContact, true, 'The deck underside must remain a solid exterior face'); assert.ok(underside.body.position.y > top.point.y + .35);
  const sideways = make(), side = placeOnFrame(sideways, Math.PI / 2, -.10);
  for (const body of sideways._courseBodies) if (body.terraObstacle.id.startsWith('loop-crossmember')) sideways.world.removeBody(body);
  sideways.body.position.x -= side.across.x * 6.15; sideways.body.position.y -= side.across.y * 6.15; sideways.body.position.z -= side.across.z * 6.15;
  sideways.body.velocity.set(side.across.x * 8, side.across.y * 8, side.across.z * 8);
  let sideContact = false;
  for (let i = 0; i < 42; i++) {
    sideways.step(1 / 120, {});
    for (const c of sideways.world.contacts) {
      const force = c.ni.scale(c.bi === sideways.body ? -1 : 1);
      if ((c.si?.terraCourse || c.sj?.terraCourse) && force.x * side.across.x + force.y * side.across.y + force.z * side.across.z < -.65) sideContact = true;
    }
  }
  assert.equal(sideContact, true, 'The exposed deck edge must oppose a sideways chassis impact'); assert.ok(sideways.body.velocity.dot(new CANNON.Vec3(side.across.x, side.across.y, side.across.z)) < 5.5);
});

test('ordinary steel crossmember contacts remain solid and bypass the deck filter', () => {
  const physics = make(), frame = challengeLoopFrame(Math.PI);
  physics.body.quaternion.set(0, 0, 0, 1); physics.body.position.set(frame.point.x, frame.point.y + course.features.find(feature => feature.id === 'loop').thickness + 1.65, frame.point.z); physics.body.velocity.set(0, -6, 0); physics.controls.selector = 'N';
  let beamContact = false;
  for (let i = 0; i < 42; i++) {
    physics.step(1 / 120, {});
    for (const contact of physics.world.contacts) {
      const fixed = contact.bi === physics.body ? contact.bj : contact.bi, force = contact.ni.scale(contact.bi === physics.body ? -1 : 1);
      if (fixed.terraObstacle?.id.startsWith('loop-crossmember') && force.y > .8) beamContact = true;
    }
  }
  assert.equal(beamContact, true); assert.ok(physics.body.position.y > frame.point.y + .65);
});

test('relocated outboard pylons still stop an actual vehicle through ordinary solid collision', () => {
  const pylon = course.boxes.find(box => box.id === 'loop-pylon-0--1');
  const physics = make('hummer-ev-suv-3x', { x: pylon.center.x - 5.5, z: pylon.center.z, heading: Math.PI / 2 });
  settle(physics); physics.controls.selector = 'N';
  // Start a short airborne impact above the solid footing, which would catch
  // a ground-level bumper before it could reach the column. Keep all runtime
  // structures present, and let the body fall normally during the approach.
  physics.body.position.x = pylon.center.x - 4.1; physics.body.position.y += 1.1;
  physics.body.velocity.set(8, 0, 0); physics.body.angularVelocity.setZero(); physics.body.aabbNeedsUpdate = true;
  for (const wheel of physics._wheels) wheel.omega = 8 / wheel.radius;
  let columnImpact = false, peakOpposingForce = 0;
  for (let i = 0; i < 100; i++) {
    physics.step(1 / 120, {});
    for (const contact of physics.world.contacts) {
      const fixed = contact.bi === physics.body ? contact.bj : contact.bi;
      if (fixed.terraObstacle?.id !== pylon.id) continue;
      const force = contact.ni.scale(contact.bi === physics.body ? -1 : 1);
      columnImpact ||= force.x < -.8; peakOpposingForce = Math.max(peakOpposingForce, contact.multiplier);
    }
  }
  assert.equal(columnImpact, true, 'The relocated visible column must remain a real collider');
  assert.ok(peakOpposingForce > 1000 && physics.body.velocity.x < 2);
  assert.ok(physics.body.position.x < pylon.center.x - .8, 'The chassis must not pass through the support plane');
});

test('a light chassis scrape has a timestep-scaled, shared friction impulse budget', () => {
  const physics = make(); settle(physics); physics.controls.selector = 'N';
  // Place the actual underbody 8 mm into the deck. Its offset and the settled
  // chassis orientation matter now that the bumper is a separate shape.
  const index = physics.body.shapes.findIndex(shape => shape.terraChassisPart === 'underbody');
  const shape = physics.body.shapes[index], offset = physics.body.shapeOffsets[index];
  let lowestCorner = Infinity;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const local = shape.halfExtents.clone(); local.x *= x; local.y *= y; local.z *= z;
    physics.body.shapeOrientations[index].vmult(local, local); local.vadd(offset, local);
    lowestCorner = Math.min(lowestCorner, physics.body.quaternion.vmult(local).y);
  }
  physics.body.position.y = 4.72 - lowestCorner - .008;
  physics.body.velocity.set(0, 0, 20); for (const wheel of physics._wheels) wheel.omega = 20 / wheel.radius;
  let sawContact = false;
  for (let i = 0; i < 6; i++) {
    physics.step(1 / 120, {});
    const equations = physics.world.frictionEquations.filter(eq => eq.bi.shapes.some(shape => shape.terraCourse) || eq.bj.shapes.some(shape => shape.terraCourse));
    if (equations.length) {
      sawContact = true;
      const budget = equations.reduce((sum, eq) => sum + eq.maxForce, 0);
      assert.ok(budget <= 2 * physics.world.defaultContactMaterial.friction * physics.spec.mass * 9.81 / 120 + .001);
    }
  }
  assert.equal(sawContact, true); assert.ok(physics.body.velocity.z > 19.2, 'A small scrape must not remove mu*g metres/second every physics tick');
});
