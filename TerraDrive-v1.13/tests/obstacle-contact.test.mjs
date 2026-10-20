import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from '../dist/vendor/cannon-es.js';
import { castObstacle, projectObstacleFootprint, ObstacleContactIndex } from '../dist/src/obstacle-contact.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { surfaceResponse } from '../dist/src/surface-response.js';
import { createTreeFall, syncTreeObstacle } from '../dist/src/tree-dynamics.js';
import { deriveVehicle } from '../dist/src/upgrades.js';

const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z), DOWN = V(0, -1, 0), UP = V(0, 1, 0);
const DT = 1 / 120, jeep = VEHICLES[0];
function box(extents = V(2, .2, .25), center = V(0, .2, 0), angle = 0) {
  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(extents), position: center });
  body.quaternion.setFromAxisAngle(UP, angle); body.terraObstacle = { id: 'finite-log', type: 'tree' };
  return body;
}
function flat(surface = 'asphalt') {
  const response = surfaceResponse(surface);
  return { sample: () => ({ ...response, height: 0, normal: { x: 0, y: 1, z: 0 }, surface, waterDepth: 0 }) };
}
function run(sim, seconds, input = {}) { for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT, input); }

test('suspension support follows an oriented finite log and its exposed rounded tire edge', () => {
  for (const angle of [0, .63, Math.PI / 2]) {
    const log = box(V(2, .2, .25), V(0, .2, 0), angle);
    const top = castObstacle(log, V(0, 1.1, 0), DOWN, .4, -.4, .6);
    assert(top && Math.abs(top.distance - .3) < 1e-8);
    assert(Math.abs(top.point.y - .4) < 1e-8 && top.normal.y > .999999);
    const localOrigin = V(0, 1.1, -.50), origin = log.quaternion.vmult(localOrigin);
    const edge = castObstacle(log, origin, DOWN, .4, -.4, .6);
    const lift = Math.sqrt(.4 ** 2 - .25 ** 2), expectedDistance = 1.1 - .4 - lift;
    assert(edge && Math.abs(edge.distance - expectedDistance) < 2e-5);
    assert(Math.abs(edge.point.y - .4) < 1e-8);
    assert(Math.abs(edge.normal.y - lift / .4) < 5e-5, 'The contact cone retains horizontal edge reaction');
    assert.equal(projectObstacleFootprint(log, log.quaternion.vmult(V(2.15, .4, 0)), UP), null,
      'An overhanging footprint cannot borrow an infinite timber plane');
  }
});

test('a stump beyond the actual sidewall width cannot carry a nearby tire', () => {
  const stump = box(V(.05, .15, .2), V(.36, .15, 0));
  const index = new ObstacleContactIndex(); index.setBodies([stump]);
  assert(castObstacle(stump, V(0, .9, 0), DOWN, .4, -.4, .6), 'The broad spherical envelope must intersect the control');
  assert.equal(index.castSuspension(V(0, .9, 0), DOWN, .4, -.4, .6, { axle: V(1, 0, 0), halfWidth: .15 }), null);
});

test('a cylinder stump supports its actual cap and has no support outside its edge', () => {
  const stump = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(.2, .2, .5, 12), position: V(0, .25, 0) });
  stump.terraObstacle = { id: 'stump', type: 'tree' };
  const hit = castObstacle(stump, V(0, 1.2, 0), DOWN, .4, -.4, .7);
  assert(hit && Math.abs(hit.distance - .3) < 1e-8 && Math.abs(hit.point.y - .5) < 1e-8);
  assert.equal(projectObstacleFootprint(stump, V(.25, .5, 0), UP), null);
});

test('only changed obstacle shapes are replaced; moving trunks and moved signs stay spatially current', () => {
  const terrain = flat(); terrain.obstacles = [
    { id: 'untouched-tree', type: 'tree', x: 30, z: 30, radius: .25, height: 10 },
    { id: 'cut-tree', type: 'tree', x: 0, z: 20, radius: .25, height: 10 },
    { id: 'sign', type: 'sign', shape: 'box', center: { x: 0, y: .2, z: 40 }, halfExtents: { x: 1, y: .2, z: .5 } },
  ];
  const sim = new VehiclePhysics(terrain, jeep); sim.reset({ x: 0, z: -20, heading: 0 }); run(sim, .1);
  const old = new Map(sim._obstacleBodyMap), standing = old.get('untouched-tree');
  terrain.obstacles[1].height = .65;
  const fall = createTreeFall({ pivot: { x: 0, y: .65, z: 20 }, push: { x: 0, z: 1 }, length: 8, radius: .25 });
  const log = { id: 'log', type: 'tree', shape: 'box', halfExtents: { x: .25, y: 4, z: .25 }, treeFall: fall };
  syncTreeObstacle(log); terrain.obstacles.push(log); terrain.obstacleRevision = 1; sim.step(DT);
  assert.equal(sim._obstacleBodyMap.get('untouched-tree'), standing);
  assert.notEqual(sim._obstacleBodyMap.get('cut-tree'), old.get('cut-tree'));
  const moving = sim._obstacleBodyMap.get('log'), firstCenter = moving.position.clone(); run(sim, 1);
  assert.equal(sim._obstacleBodyMap.get('log'), moving, 'A moving log keeps one collision body');
  assert(moving.position.distanceTo(firstCenter) > .1);
  assert(moving.position.distanceTo(V(fall.center.x, fall.center.y, fall.center.z)) < 1e-10);
  assert.equal(sim._obstacleBodyMap.get('untouched-tree'), standing);
  const oldSpot = V(0, 1.1, 40), down = DOWN;
  assert(sim._obstacleContacts.castSuspension(oldSpot, down, .4, -.4, .6));
  terrain.obstacles[2].center.x = 28; terrain.obstacleRevision++; sim.step(DT);
  assert.equal(sim._obstacleContacts.castSuspension(oldSpot, down, .4, -.4, .6), null);
  assert(sim._obstacleContacts.castSuspension(V(28, 1.1, 40), down, .4, -.4, .6));
});

test('vehicle/build contact envelopes preserve inertia and leave real space below both overhangs', () => {
  for (const base of VEHICLES) for (const spec of [base, deriveVehicle(base, { suspension: 'trail', size: 'large' })]) {
    const sim = new VehiclePhysics(flat(), spec), b = spec.visualBase || spec;
    const reference = new CANNON.Box(V(spec.width * .46, Math.min(b.height * .67, 1.65) * .5, spec.length * .44));
    const expected = reference.calculateLocalInertia(spec.mass);
    assert(sim.body.inertia.distanceTo(expected) < 1e-8, `${spec.id}: collision repair altered handling inertia`);
    const parts = sim.body.terraChassisEnvelope;
    const datum = (spec.visualBase ? spec.tireRadius - b.tireRadius + (spec.suspension.lift || 0) : 0) - spec.cgHeight;
    assert(Math.abs(parts[0].bottom - (b.clearance + datum)) < 1e-10);
    assert(parts[1].bottom > parts[0].bottom && parts[2].bottom > parts[0].bottom);
    const midpoint = spec.wheelbase * (.5 - spec.frontWeightFraction);
    assert(Math.abs((parts[0].from + parts[0].to) * .5 - midpoint) < 1e-10, 'Collision follows the actual CG/body datum');
  }
});

test('public reset, restart, vehicle changes and repair immediately discard removed timber support', () => {
  const spawn = { x: 0, z: 0, heading: 0 };
  const actions = [
    ['reset', sim => sim.reset(spawn)],
    ['restart', sim => sim.restart(spawn)],
    ['setVehicle', sim => sim.setVehicle(VEHICLES.find(vehicle => vehicle.id === 'hummer-ev-suv-3x'), spawn)],
    ['reconfigureVehicle', sim => sim.reconfigureVehicle(deriveVehicle(jeep, { suspension: 'trail' }))],
    ['repair', sim => sim.repair()],
  ];
  for (const [name, perform] of actions) {
    const terrain = flat(); terrain.obstacleRevision = 0;
    terrain.obstacles = [{ id: 'removed-board', type: 'tree', shape: 'box',
      center: { x: 0, y: .06, z: 0 }, halfExtents: { x: 2, y: .06, z: 3 } }];
    const sim = new VehiclePhysics(terrain, jeep); sim.reset(spawn);
    run(sim, 1.5, { brake: 1, handbrake: true });
    assert(sim.state.wheels.every(w => w.obstacleId === 'removed-board' && w.load > 40), `${name}: establish real support first`);
    terrain.obstacles.length = 0; terrain.obstacleRevision++;
    assert.notEqual(perform(sim)?.ok, false, `${name}: ordinary stopped-vehicle preconditions must pass`);
    assert(sim.state.wheels.every(w => w.obstacleId === null), `${name}: published contacts must not retain removed debris`);
    assert.equal(sim._obstacleBodies.length, 0, `${name}: collider removal must precede contact collection`);
  }
});

test('a low rock step clears both Sprinter overhangs until the full tire envelope reaches it', () => {
  const spec = VEHICLES.find(vehicle => vehicle.id === 'sprinter-2500');
  for (const direction of [1, -1]) {
    const response = surfaceResponse('rock');
    const terrain = { sample(x, z) {
      const u = direction * z, slope = u > 0 && u < .06 ? .25 / .06 : 0;
      const denominator = Math.hypot(1, slope);
      return { ...response, surface: 'rock', waterDepth: 0, height: .25 * Math.max(0, Math.min(1, u / .06)),
        normal: { x: 0, y: 1 / denominator, z: -direction * slope / denominator } };
    } };
    const sim = new VehiclePhysics(terrain, spec); sim.reset({ x: 0, z: -6 * direction, heading: 0 });
    run(sim, 1.5, { brake: 1, handbrake: true });
    assert(sim.setControl('selector', direction > 0 ? 'D' : 'R').ok);
    const apply = sim._applyChassisContacts, travel = V(0, 0, direction);
    let reachedTires = false, checked = 0;
    sim._applyChassisContacts = function(dt) {
      // Observe the actual pre-solver state. The entire unloaded cylinder is
      // conservative: this cannot mistake tire contact for a false bumper hit.
      const leadingTire = Math.max(...this._wheels.map(w => {
        const axle = this.body.quaternion.vmult(V(Math.cos(w.steer), 0, -Math.sin(w.steer)));
        const alignment = Math.max(-1, Math.min(1, axle.dot(travel)));
        const reach = spec.tireRadius * Math.sqrt(Math.max(0, 1 - alignment ** 2)) + spec.tireWidth * .5 * Math.abs(alignment);
        return w.position.dot(travel) + reach;
      }));
      const force = this.body.force.clone(); apply.call(this, dt);
      if (leadingTire >= 0) reachedTires = true;
      else {
        checked++;
        assert(this.body.force.distanceTo(force) < 1e-6, `${direction}: a step below the bumper must not produce premature chassis force`);
      }
    };
    for (let frame = 0; frame < 1440 && !reachedTires; frame++) sim.step(DT, { throttle: .16 });
    assert(reachedTires && checked > 100, 'Ordinary inputs must approach the declared feature from rest');
  }
});

test('ordinary driving crosses rigid timber without stamping mud underneath and resumes soil work afterward', () => {
  for (const pressure of [14, 42]) {
    const terrain = flat('mud'); terrain.wheelTrails = new Map(); let stampsUnderWood = 0, rigidFrames = 0, trailLeaks = 0;
    terrain.obstacles = [{ id: 'mud-board', type: 'tree', shape: 'box',
      center: { x: 0, y: .03, z: 0 }, halfExtents: { x: 2, y: .09, z: .45 } }];
    let sim;
    terrain.deform = (x, z, input) => { terrain.wheelTrails.set(input.wheelId, { x, z });
      if (Math.abs(x) < 2 && Math.abs(z) < .445 && sim._wheels[Number(input.wheelId.at(-1))].ground.y < .10) stampsUnderWood++; };
    terrain.releaseWheelContact = id => terrain.wheelTrails.delete(id);
    sim = new VehiclePhysics(terrain, jeep); sim.reset({ x: 0, z: -5, heading: 0 }); sim.setPressure(pressure, pressure);
    sim.setControl('driveMode', '4L'); run(sim, 1.5, { brake: 1, handbrake: true });
    const supported = new Set(), deformingAfter = new Set();
    for (let frame = 0; frame < 1200; frame++) {
      sim.step(DT, { throttle: .30 });
      for (const w of sim.state.wheels) if (w.contact && w.load > 40) {
        const id = `${jeep.id}-${w.index}`;
        if (w.obstacleId) { rigidFrames++; supported.add(w.index); assert.equal(w.sink, 0); assert.equal(w.surfaceDetail, 'wood');
          if (terrain.wheelTrails.has(id)) trailLeaks++; }
        if (w.ground.z > .5 && terrain.wheelTrails.has(id)) deformingAfter.add(w.index);
      }
    }
    assert.deepEqual([...supported].sort(), [0, 1, 2, 3]); assert(rigidFrames > 20);
    assert.equal(stampsUnderWood, 0); assert.equal(trailLeaks, 0);
    assert.deepEqual([...deformingAfter].sort(), [0, 1, 2, 3], 'All tires resume actual soil contact after leaving timber');
    assert(sim.state.position.z > 3 && sim.state.damage.condition > .99);
  }
});
