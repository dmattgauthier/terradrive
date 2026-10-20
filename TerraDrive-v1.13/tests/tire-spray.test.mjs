import test from 'node:test';
import assert from 'node:assert/strict';
import { TireSpray } from '../dist/src/tire-spray.js';
import { TireSprayView } from '../dist/src/tire-spray-view.js';
import * as THREE from '../dist/vendor/three.module.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { Terrain } from '../dist/src/terrain.js';
import { VEHICLES } from '../dist/src/vehicles.js';

const ground = (surface = 'mud', waterDepth = .08, moisture = .6) => ({ sample: () => ({ surface, height: 0, waterDepth, moisture }) });
const state = (surface = 'mud', extra = {}) => ({ speed: 8, velocity: { x: 0, y: 0, z: 8 }, wheels: Array.from({ length: 4 }, (_, index) => ({
  index, contact: true, constructed: false, load: 6000, surface, omega: 20, radius: .4, speedLong: 8, slip: .15,
  ground: { x: index % 2 ? -.9 : .9, y: 0, z: index < 2 ? 1.4 : -1.4 },
  normal: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, ...extra,
})) });

test('wheel loads emit distinct mud clods and water drops at caller-independent rates', () => {
  const outputs = [];
  for (const hz of [30, 60, 120]) {
    const spray = new TireSpray();
    for (let i = 0; i < hz * 2; i++) spray.update(1 / hz, state(), ground());
    outputs.push(spray.emitted);
    assert(spray.emitted.water > spray.emitted.mud && spray.emitted.mud > 100);
    assert(spray.particles.filter(p => p.active).length <= spray.capacity);
    for (const p of spray.particles.filter(p => p.active)) for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'size']) assert(Number.isFinite(p[key]));
  }
  assert.deepEqual(outputs[0], outputs[1]); assert.deepEqual(outputs[1], outputs[2]);
});

test('consecutive emitting frames handle omitted and partial wheel bases like explicit default vectors', () => {
  for (const mode of ['missing-right', 'missing-all', 'partial-vectors']) {
    const sparse = new TireSpray(), explicit = new TireSpray();
    for (let frame = 0; frame < 3; frame++) {
      const full = state('mud', { forward: { x: 0, y: 0, z: 1 }, right: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } });
      for (const wheel of full.wheels) wheel.ground.z += frame * .8;
      const input = structuredClone(full);
      for (const wheel of input.wheels) {
        if (mode === 'missing-right') delete wheel.right;
        else if (mode === 'missing-all') for (const name of ['forward', 'right', 'normal']) delete wheel[name];
        else { wheel.forward = { z: 1 }; wheel.right = { x: -1 }; wheel.normal = { y: 1 }; }
      }
      sparse.update(.1, input, ground()); explicit.update(.1, full, ground());
      assert.ok(sparse.emitted.mud > 0 && sparse.emitted.water > 0, 'Each case must really enter emission and history interpolation');
      assert.deepEqual(sparse.emitted, explicit.emitted);
      assert.deepEqual(sparse.particles, explicit.particles, 'Sparse history must give finite, identical releases and flights to its documented defaults');
    }
  }
});

test('dry rock, airborne wheels, unloaded tires and constructed decks do not eject soil', () => {
  for (const [surface, extra, terrain] of [
    ['rock', {}, ground('rock', 0, 0)], ['mud', { contact: false }, ground()],
    ['mud', { load: 0 }, ground()], ['mud', { constructed: true }, ground()],
  ]) {
    const spray = new TireSpray();
    for (let i = 0; i < 120; i++) spray.update(1 / 120, state(surface, extra), terrain);
    assert.deepEqual(spray.emitted, { water: 0, mud: 0 });
  }
});

test('submerged rigid supports throw only the explicitly published water above the support, never soil below it', () => {
  const terrain = ground('mud', .8, .9), dry = new TireSpray(), submerged = new TireSpray();
  for (let i = 0; i < 60; i++) {
    dry.update(1 / 60, state('rock', { constructed: true, waterDepth: 0, ground: { x: 0, y: .9, z: 0 } }), terrain);
    submerged.update(1 / 60, state('rock', { constructed: true, obstacleId: 'fallen-log', waterDepth: .1,
      ground: { x: 0, y: .7, z: 0 } }), terrain);
  }
  assert.deepEqual(dry.emitted, { mud: 0, water: 0 });
  assert.equal(submerged.emitted.mud, 0); assert.ok(submerged.emitted.water > 100);
  for (const p of submerged.particles) if (p.sourcePosition) assert.ok(p.sourcePosition.y >= .8,
    'The emitter water plane must be measured from the log support, not from terrain below it');
});

test('four tire origins remain distinct through steering, reverse rotation, rolling and a stuck wheel', () => {
  for (const direction of [-1, 1]) for (const stopped of [false, true]) {
    const spray = new TireSpray(), snapshot = state('mud');
    snapshot.velocity = { x: 0, y: 0, z: stopped ? 0 : direction * 8 };
    for (const wheel of snapshot.wheels) {
      const steer = wheel.index < 2 ? .48 : 0;
      wheel.forward = { x: Math.sin(steer), y: 0, z: Math.cos(steer) };
      wheel.right = { x: -Math.cos(steer), y: 0, z: Math.sin(steer) };
      wheel.velocity = snapshot.velocity; wheel.speedLong = stopped ? 0 : direction * 8 * Math.cos(steer);
      wheel.speedLat = stopped ? 0 : direction * 8 * Math.sin(steer); wheel.omega = direction * 20;
    }
    const sources = [], emit = spray._emit.bind(spray);
    spray._emit = (kind, wheel, ...args) => { const p = emit(kind, wheel, ...args); sources.push({ ...p,
      ground: { ...wheel.ground }, forward: { ...wheel.forward } }); return p; };
    for (let i = 0; i < 20; i++) spray.update(1 / 60, snapshot, ground());
    assert.equal(new Set(sources.map(p => p.sourceWheel)).size, 4);
    assert.ok(sources.some(p => p.release === 'side') && sources.some(p => p.release === 'tread'));
    for (const p of sources) {
      assert.ok(Math.hypot(p.sourcePosition.x - p.ground.x, p.sourcePosition.z - p.ground.z) < .55);
      if (p.release === 'tread') assert.ok(((p.sourcePosition.x - p.ground.x) * p.forward.x
        + (p.sourcePosition.z - p.ground.z) * p.forward.z) * direction < 0,
      'The actual steered tire arc, including reverse rotation, determines its tread release position');
    }
  }
});

test('spinning tires churn while stuck; resting tires do not; rain film can spray on pavement', () => {
  const spin = new TireSpray(), rest = new TireSpray(), road = new TireSpray();
  for (let i = 0; i < 60; i++) {
    spin.update(1 / 60, { ...state('mud', { speedLong: 0, slip: 1, omega: 24 }), speed: 0, velocity: { x: 0, y: 0, z: 0 } }, ground('mud', 0));
    rest.update(1 / 60, { ...state('mud', { speedLong: 0, slip: 0, omega: 0 }), speed: 0 }, ground());
    road.update(1 / 60, state('asphalt'), ground('asphalt', 0, 1));
  }
  assert(spin.emitted.mud > 0); assert.equal(spin.emitted.water, 0);
  assert.deepEqual(rest.emitted, { water: 0, mud: 0 });
  assert(road.emitted.water > 0); assert.equal(road.emitted.mud, 0);
});

test('gravity returns ejected matter to terrain and reports real water landings', () => {
  const spray = new TireSpray();
  for (let i = 0; i < 30; i++) spray.update(1 / 60, state('wetland', { omega: 8, speedLong: 3 }), ground('wetland', .12));
  const first = spray.particles.find(p => p.active), vertical = first.vy;
  spray.update(1 / 120, { wheels: [] }, ground('wetland', .12));
  assert(first.vy < vertical, 'Gravity/drag must change the actual ballistic velocity');
  let landings = spray.impacts.length;
  for (let i = 0; i < 120; i++) { spray.update(1 / 60, { wheels: [] }, ground('wetland', .12)); landings += spray.impacts.length; }
  assert(landings > 0); assert.equal(spray.particles.filter(p => p.active).length, 0);
});

test('sideways sliding ejects wet material in the contact direction even with locked wheel rotation', () => {
  for (const heading of [0, Math.PI / 2]) for (const sign of [-1, 1]) {
    const forward = { x: Math.sin(heading), y: 0, z: Math.cos(heading) };
    const right = { x: -Math.cos(heading), y: 0, z: Math.sin(heading) };
    const velocity = { x: right.x * sign * 8, y: 0, z: right.z * sign * 8 };
    const snapshot = { ...state('mud', { forward, right, velocity, speedLong: 0, speedLat: sign * 8,
      omega: 0, slip: 0 }), speed: 0, velocity };
    const spray = new TireSpray(); spray.update(.1, snapshot, ground());
    assert.ok(spray.emitted.water > 0 && spray.emitted.mud > 0,
      'A loaded tire crossing water and mud sideways must still displace both');
    const parcels = spray.particles.filter(p => p.active);
    const lateral = parcels.reduce((sum, p) => sum + (p.vx * right.x + p.vz * right.z) * sign, 0) / parcels.length;
    const longitudinal = parcels.reduce((sum, p) => sum + p.vx * forward.x + p.vz * forward.z, 0) / parcels.length;
    assert.ok(lateral > 3, 'Side plume momentum must follow the sliding contact, including after a world-axis rotation');
    assert.ok(Math.abs(longitudinal) < .01, 'A locked tire sliding sideways must not invent a rotating rearward rooster tail');
  }
});

test('rotating tread throws stuck-wheel material backward in both driving directions', () => {
  for (const direction of [-1, 1]) {
    const spray = new TireSpray(), velocity = { x: 0, y: 0, z: 0 };
    spray.update(.1, { ...state('mud', { omega: direction * 20, slip: direction, speedLong: 0, speedLat: 0, velocity }),
      speed: 0, velocity }, ground('mud', .04));
    const clods = spray.particles.filter(p => p.active && p.kind === 'mud');
    assert.ok(clods.length > 0);
    assert.ok(clods.reduce((sum, p) => sum + p.vz * direction, 0) / clods.length < -1,
      'Reversing wheel rotation must reverse the entrained tread plume');
  }
});

function ballisticParcel(kind, values = {}) {
  const spray = new TireSpray({ capacity: 1 });
  Object.assign(spray.particles[0], { active: true, kind, age: 0, life: 5,
    x: 0, y: .7, z: 0, vx: 0, vy: -2, vz: 0, size: .04, angle: 0, spin: 0, ...values });
  return spray;
}

test('mud clods and droplets stop at standing water and each create a landing ripple without depositing soil', () => {
  for (const kind of ['mud', 'water']) for (const waterDepth of [0, .4]) {
    const terrain = ground('wetland', waterDepth);
    terrain.deform = () => assert.fail('Cosmetic ejecta must not invent permanent soil volume');
    const spray = ballisticParcel(kind); let impacts = 0;
    for (let frame = 0; frame < 90; frame++) {
      spray.update(1 / 60, { wheels: [] }, terrain);
      for (const impact of spray.impacts) { assert.equal(impact.y, waterDepth); impacts++; }
      assert.ok(!spray.particles[0].active || spray.particles[0].y > waterDepth,
        'A visible airborne parcel must not fly through the water surface');
    }
    assert.equal(spray.particles[0].active, false);
    assert.equal(impacts, waterDepth ? 1 : 0, `${kind}: only a water landing creates a water ripple`);
  }
});

test('fast droplets land at the crossed water surface instead of the dry endpoint beyond its edge', () => {
  const terrain = { sample(x) { return { surface: 'mud', height: 0, waterDepth: x < .75 ? .2 : 0 }; } };
  const spray = ballisticParcel('water', { y: .3, vx: 10, vy: -4 });
  spray.update(.1, { wheels: [] }, terrain);
  assert.equal(spray.particles[0].active, false);
  assert.equal(spray.impacts.length, 1, 'The trajectory crosses water before its frame endpoint reaches dry ground');
  assert.equal(spray.impacts[0].y, .2);
  assert.ok(spray.impacts[0].x > 0 && spray.impacts[0].x < .4, 'The ripple must stay near the actual early crossing');
});

test('fast ejecta cannot tunnel through a narrow raised terrain crest between two clear endpoints', () => {
  const terrain = { sample(x) { return { surface: 'rock', height: Math.max(0, .3 * (1 - Math.abs(x - .04) / .045)), waterDepth: 0 }; } };
  const spray = ballisticParcel('mud', { x: -.0625, y: .15, vx: 30, vy: 0, size: .015 });
  spray.update(1 / 120, { wheels: [] }, terrain);
  assert.equal(spray.particles[0].active, false, 'Both step endpoints clear the ground but the actual crossed crest must intercept the clod');
  assert.ok(spray.particles[0].x > -.01 && spray.particles[0].x < .04);
  assert.equal(spray.impacts.length, 0, 'A dry rock impact must not invent a water ripple');
});

test('normal Hummer acceleration and steering feed real loaded wheel contacts into the spray', t => {
  const terrain = new Terrain(), physics = new VehiclePhysics(terrain, VEHICLES.find(v => v.id === 'hummer-ev-suv-3x'));
  const spray = new TireSpray(); let emittedContacts = 0, lateralContacts = 0, landingCount = 0;
  const emit = spray._emit.bind(spray);
  spray._emit = (kind, wheel, ...args) => {
    assert.ok(wheel.contact && wheel.load > 0 && !wheel.constructed);
    assert.ok(wheel.contactWidth > .20 && wheel.contactWidth < .5);
    assert.ok(Number.isFinite(wheel.speedLong) && Number.isFinite(wheel.speedLat));
    emittedContacts++; if (Math.abs(wheel.speedLat) > .4) lateralContacts++;
    emit(kind, wheel, ...args);
  };
  // Actual map, normal reset and pedal/steering input. No injected body or
  // wheel velocities, prescribed tire paths or direct soil deformation.
  physics.reset({ x: 33, z: -114, heading: 0 });
  for (let frame = 0; frame < 120; frame++) physics.step(1 / 60, { brake: 1 });
  for (let frame = 0; frame < 300; frame++) {
    const current = physics.step(1 / 60, { throttle: .8, steer: frame > 60 ? .45 : 0, steerSource: 'analog' });
    spray.update(1 / 60, current, terrain); landingCount += spray.impacts.length;
  }
  assert.ok(physics.state.odometer > 5, 'The Hummer must actually drive from rest through the authored mud');
  assert.ok(emittedContacts > 100 && lateralContacts > 20, 'Real turning-wheel lateral motion must reach the emitter');
  assert.ok(spray.emitted.mud > 100 && spray.emitted.water > 100 && landingCount > 20);
  assert.ok(terrain.soilVolumes.depressed > 0, 'Real tire contact must deform the ground independently of its cosmetic spray');
  t.diagnostic(JSON.stringify({ fixture: 'normal-Hummer-mud-drive-and-turn-from-rest', emittedContacts,
    lateralEmissionsAbovePoint4Mps: lateralContacts, emitted: spray.emitted, landingCount,
    finalSpeedKmh: physics.state.speedKmh, finalPosition: physics.state.position,
    soilVolumesM3: terrain.soilVolumes }));
});

test('rendered instanced clods/drops follow bounded live simulation and clear on reset', () => {
  const view = new TireSprayView(new THREE.Scene(), ground());
  for (let i = 0; i < 30; i++) view.update(1 / 60, state(), 'high');
  assert(view.mud.count > 0 && view.water.count > 0);
  assert.equal(view.mud.count + view.water.count, view.simulation.particles.filter(p => p.active).length);
  assert.equal(view.water.material.depthWrite, false);
  for (const mesh of [view.mud, view.water]) for (const value of mesh.instanceMatrix.array.subarray(0, mesh.count * 16)) assert(Number.isFinite(value));
  view.clear(); assert.equal(view.mud.count + view.water.count, 0); view.dispose();
});
