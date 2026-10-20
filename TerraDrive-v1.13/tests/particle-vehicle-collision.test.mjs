import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--source-root'),
  'Usage: node tests/particle-vehicle-collision.test.mjs [--source-root immutable-runtime-directory]');
const sourceRoot = args.length ? resolve(args[1]) : fileURLToPath(new URL('../', import.meta.url));
const runtime = file => import(pathToFileURL(resolve(sourceRoot, 'dist', file)).href);
const [THREE, { ParticleTriangleHierarchy, VehicleSprayCollider }, { TireSpray }, { TireSprayView },
  { VehicleView }, { VEHICLES }, { VehiclePhysics }, { Terrain }, { deriveVehicle }, { TireImpactMarks, clippedTireImpact }] = await Promise.all([
  runtime('vendor/three.module.js'), runtime('src/particle-vehicle-collision.js'), runtime('src/tire-spray.js'),
  runtime('src/tire-spray-view.js'), runtime('src/vehicle-view.js'), runtime('src/vehicles.js'), runtime('src/physics.js'),
  runtime('src/terrain.js'), runtime('src/upgrades.js'), runtime('src/tire-impact-marks.js'),
]);

const pose = (position = { x: 0, y: 0, z: 0 }, quaternion = { x: 0, y: 0, z: 0, w: 1 }, extra = {}) => ({ position, quaternion, wheels: [], ...extra });
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} should equal ${b} within ${tolerance}`);
const flat = { sample: () => ({ surface: 'asphalt', height: -20, waterDepth: 0, moisture: 0 }) };
const square = [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1];

function mockVehicle(vertices) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })); body.add(mesh);
  return { root, body, mesh, damageView: { revision: 0 } };
}

function parcel(kind, values = {}) {
  const spray = new TireSpray({ capacity: 1 });
  Object.assign(spray.particles[0], { active: true, kind, age: 0, life: 5, x: 0, y: 1, z: 0,
    vx: 0, vy: -12, vz: 0, size: .02, aspect: 1, angle: 0, spin: 0, ...values });
  return spray;
}

test('continuous particle collision catches two-sided faces, thin-panel tunneling, finite edges and vertices', () => {
  const hierarchy = new ParticleTriangleHierarchy(square);
  for (const direction of [-1, 1]) {
    const hit = hierarchy.sweep([0, direction * 100, 0], [0, direction * -100, 0], .05);
    assert.ok(hit); near(hit.fraction, .49975); near(hit.normal[1], direction); near(hit.point[1], 0);
  }
  const edge = hierarchy.sweep([1.03, 1, 0], [1.03, -1, 0], .05);
  assert.ok(edge); near(edge.point[0], 1); near(edge.fraction, .48);
  const corner = hierarchy.sweep([1.02, 1, 1.02], [1.02, -1, 1.02], .05);
  assert.ok(corner); near(corner.point[0], 1); near(corner.point[2], 1);
  assert.equal(hierarchy.sweep([1.20, 1, 0], [1.20, -1, 0], .05), null);
  assert.equal(hierarchy.sweep([0, .05, 0], [0, .2, 0], .05), null, 'Touching material moving away must not be trapped by a sticky overlap');
});

test('an actual opening remains empty instead of becoming a filled collision box', () => {
  const geometry = new THREE.RingGeometry(.45, 1, 20); geometry.rotateX(Math.PI / 2);
  const vertices = [], position = geometry.attributes.position;
  for (const index of geometry.index.array) vertices.push(position.getX(index), position.getY(index), position.getZ(index));
  const hierarchy = new ParticleTriangleHierarchy(vertices);
  assert.equal(hierarchy.sweep([0, -.8, 0], [0, .8, 0], .04), null);
  assert.ok(hierarchy.sweep([.75, -.8, 0], [.75, .8, 0], .04));
  geometry.dispose();
});

test('a translating or rotating panel sweeps across a stationary droplet, including between both endpoint poses', () => {
  const vertical = square.map((value, i) => i % 3 === 0 ? square[i + 1] : i % 3 === 1 ? square[i - 1] : value);
  const vehicle = mockVehicle(vertical), collider = new VehicleSprayCollider(vehicle);
  collider.beginFrame(pose({ x: -.4, y: 0, z: 0 }), .1);
  collider.beginFrame(pose({ x: .4, y: 0, z: 0 }, undefined, { velocity: { x: 8, y: 0, z: 0 } }), .1);
  const hit = collider.sweep({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, .02);
  assert.ok(hit); near(hit.fraction, .475); near(hit.surfaceVelocity.x, 8); near(hit.normal.x, 1);
  const rotating = mockVehicle(vertical.map((value, i) => i % 3 === 0 ? value + 1 : value));
  const turn = new VehicleSprayCollider(rotating), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  turn.beginFrame(pose(), .1); turn.beginFrame(pose(undefined, q, { angularVelocity: { x: 0, y: Math.PI * 5, z: 0 } }), .1);
  const droplet = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 };
  const sweep = turn.sweep(droplet, droplet, .015);
  assert.ok(sweep && sweep.fraction > .1 && sweep.fraction < .9, 'The panel must hit during its arc although it misses at both frame endpoints');
  assert.ok(sweep.padding >= 0 && sweep.padding < .004);
  const farther = { x: 2, y: 0, z: -2 };
  assert.equal(turn.sweep(farther, farther, .015), null);
});

test('body interception precedes ground hits, clods stop, and glancing water keeps damped panel-relative velocity', () => {
  const vehicle = mockVehicle(square), collider = new VehicleSprayCollider(vehicle);
  for (const kind of ['mud', 'water']) {
    collider.reset(); const spray = parcel(kind);
    spray.update(.1, pose(), flat, 'high', collider);
    assert.equal(spray.particles[0].active, false); assert.equal(spray.bodyCollisions[kind], 1);
    assert.equal(spray.bodyImpacts.length, 1); assert.equal(spray.impacts.length, 0);
    assert.ok(spray.particles[0].y > 0, 'The visible sphere must stop in front of the actual panel');
  }
  collider.reset();
  const glance = parcel('water', { x: -.8, y: .03, vx: 8, vy: -1 });
  glance.update(1 / 60, pose(), flat, 'high', collider);
  assert.equal(glance.bodyCollisions.deflected, 1); assert.ok(glance.particles[0].active);
  assert.ok(glance.particles[0].vx > 3 && glance.particles[0].vx < 5);
  assert.ok(glance.particles[0].y > 0);
  const groundFirst = { sample: () => ({ surface: 'wetland', height: .7, waterDepth: .2 }) };
  collider.reset(); const landing = parcel('mud'); landing.update(.1, pose(), groundFirst, 'high', collider);
  assert.equal(landing.bodyCollisions.mud, 0); assert.equal(landing.impacts.length, 1); near(landing.particles[0].y, .9);
});

test('analytic drag and bounded sweeps preserve an actual body interception at 30, 60 and 120 Hz', () => {
  const outputs = [];
  for (const hz of [30, 60, 120]) {
    const collider = new VehicleSprayCollider(mockVehicle(square)), spray = parcel('mud', { x: -.7, vx: 2, vy: -4 });
    let event;
    for (let i = 0; i < hz; i++) { spray.update(1 / hz, pose(), flat, 'high', collider); event ||= spray.bodyImpacts[0]; }
    assert.ok(event); assert.equal(spray.bodyCollisions.mud, 1); outputs.push(event.point);
  }
  for (const result of outputs.slice(1)) for (const axis of ['x', 'y', 'z']) near(result[axis], outputs[0][axis], .0002);
});

test('only a changed damage revision refits the triangles; marks and interior remain excluded', () => {
  const vehicle = mockVehicle(square), interior = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial());
  interior.material.userData.vehicleInterior = true; vehicle.body.add(interior);
  const marks = new THREE.Group(); marks.name = 'permanent-impact-scuffs'; marks.add(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3))); vehicle.body.add(marks);
  const collider = new VehicleSprayCollider(vehicle); assert.equal(collider.triangleCount, 2);
  collider.beginFrame(pose(), 1 / 60);
  for (let frame = 0; frame < 10; frame++) collider.beginFrame(pose(), 1 / 60);
  assert.equal(collider.refits, 0);
  const p = vehicle.mesh.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, .25);
  vehicle.damageView.revision++;
  collider.beginFrame(pose(), 1 / 60); assert.equal(collider.refits, 1);
  const hit = collider.sweep({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, .02);
  near(hit.point.y, .25);
  collider.beginFrame(pose(), 1 / 60); assert.equal(collider.refits, 1);
});

test('pickup-to-release collision stops material from being born above a submerged floor panel', () => {
  const vehicle = mockVehicle(square.map((value, i) => i % 3 === 1 ? value + .08 : value));
  const collider = new VehicleSprayCollider(vehicle), spray = new TireSpray();
  const wheel = { index: 0, contact: true, load: 6000, ground: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: 1 }, right: { x: -1, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 8 }, radius: .4, omega: 20, speedLong: 8, speedLat: 0, slip: .2,
    contactWidth: .25, contactLength: .2, surface: 'mud', waterDepth: .1 };
  const terrain = { sample: () => ({ surface: 'mud', height: 0, waterDepth: .1, moisture: .6 }) };
  for (let i = 0; i < 30; i++) spray.update(1 / 60, pose(undefined, undefined, { wheels: [wheel] }), terrain, 'high', collider);
  assert.ok(spray.bodyCollisions.atRelease > 20);
  assert.equal(spray.bodyCollisions.atRelease, spray.emitted.mud + spray.emitted.water);
  assert.ok(spray.particles.every(p => !p.active), 'No particle may materialize beyond a solid floor it crossed during pickup');
});

test('actual impact marks are clipped to their struck panel and remain on its deformed triangles', () => {
  const vehicle = mockVehicle(square), collider = new VehicleSprayCollider(vehicle), scene = new THREE.Scene();
  collider.beginFrame(pose(), 1 / 60);
  const hit = collider.sweep({ x: .99, y: 1, z: 0 }, { x: .99, y: -1, z: 0 }, .015);
  assert.ok(hit);
  const impact = { ...hit, kind: 'mud', dirty: true, size: .06, strength: 1 };
  const bindings = clippedTireImpact(collider, impact, .09); assert.ok(bindings.length > 0 && bindings.length <= 64);
  for (const binding of bindings) for (const anchor of binding.anchors) {
    near(anchor.reduce((sum, value) => sum + value, 0), 1); assert.ok(anchor.every(value => value >= -1e-7 && value <= 1 + 1e-7));
  }
  const marks = new TireImpactMarks(scene, 4); marks.setCollider(collider); marks.update(1 / 60, pose(), [impact]);
  const geometry = marks.mud.geometry; assert.ok(geometry.drawRange.count > 0);
  for (let i = 0; i < geometry.drawRange.count; i++) {
    near(geometry.attributes.position.getY(i), .0009, 1e-7);
    assert.ok(geometry.attributes.position.getX(i) <= 1.000001, 'No mark may extend past the actual panel edge');
  }
  const positions = vehicle.mesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, .25);
  vehicle.damageView.revision++; collider.beginFrame(pose(), 1 / 60); marks.update(1 / 60, pose(), []);
  for (let i = 0; i < geometry.drawRange.count; i++) near(geometry.attributes.position.getY(i), .2509, 1e-7);
  const next = { ...impact, ...collider.sweep({ x: .99, y: 1, z: 0 }, { x: .99, y: -1, z: 0 }, .015) };
  for (let i = 0; i < 20; i++) marks.update(.1, pose(), [next]);
  assert.equal(marks.records.filter(Boolean).length, 4); assert.ok(geometry.drawRange.count <= 4 * 64 * 3);
  marks.clear(); assert.equal(geometry.drawRange.count, 0); marks.dispose(); assert.equal(scene.children.length, 0);
});

test('fine deposit coordinates remain attached to the same hit footprint as its panel dents and film ages', () => {
  const vehicle = mockVehicle(square), collider = new VehicleSprayCollider(vehicle), scene = new THREE.Scene();
  collider.beginFrame(pose(), 1 / 60);
  const hit = collider.sweep({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, .015);
  const marks = new TireImpactMarks(scene, 4); marks.setCollider(collider);
  const impacts = ['mud', 'water'].map(kind => ({ ...hit, kind, size: .06, strength: 1, dirty: true }));
  marks.update(1 / 60, pose(), impacts);
  const before = new Map();
  for (const kind of ['mud', 'water']) {
    const geometry = marks[kind].geometry, count = geometry.drawRange.count, detail = geometry.attributes.impactDetail;
    assert.ok(count > 0 && count <= 64 * 3);
    const tuples = [];
    for (let i = 0; i < count; i++) {
      const uv = [detail.getX(i), detail.getY(i)], p = [geometry.attributes.position.getX(i), geometry.attributes.position.getY(i), geometry.attributes.position.getZ(i)];
      assert.ok(uv.every(value => Number.isFinite(value) && Math.abs(value) <= 1.000001));
      assert.ok(detail.getW(i) > 0 && detail.getW(i) <= 1);
      // The actual planar hit frame is tangent +Z, bitangent +X. Fine detail
      // must agree across the two independent clipped panel triangles.
      near(uv[0] * .09, p[2], 2e-8); near(uv[1] * .09, p[0], 2e-8);
      tuples.push({ detail: [detail.getX(i), detail.getY(i), detail.getZ(i), detail.getW(i)], p });
    }
    before.set(kind, tuples);
  }
  const positions = vehicle.mesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, .25);
  vehicle.damageView.revision++; collider.beginFrame(pose(), 1 / 60); marks.update(.5, pose(), []);
  for (const [kind, tuples] of before) {
    const geometry = marks[kind].geometry, detail = geometry.attributes.impactDetail;
    assert.equal(geometry.drawRange.count, tuples.length, 'Appearance detail must not create new footprint geometry');
    for (let i = 0; i < tuples.length; i++) {
      assert.deepEqual([detail.getX(i), detail.getY(i), detail.getZ(i)], tuples[i].detail.slice(0, 3));
      assert.ok(detail.getW(i) > 0 && detail.getW(i) < tuples[i].detail[3]);
      near(geometry.attributes.position.getY(i), tuples[i].p[1] + .25, 2e-8);
    }
    assert.equal(marks.records.find(record => record?.kind === kind).life, kind === 'water' ? 7 : 100);
  }
  marks.dispose(); collider.dispose();
});

test('all five production exteriors match independent Three ray intersections and leave road-wheel openings unfilled', t => {
  const report = [];
  for (const spec of VEHICLES) {
    const vehicle = new VehicleView(new THREE.Scene(), spec), collider = new VehicleSprayCollider(vehicle);
    const current = pose({ x: 0, y: spec.cgHeight, z: 0 }); vehicle.update(current); vehicle.root.updateWorldMatrix(true, true); collider.beginFrame(current, 1 / 60);
    const probes = [[new THREE.Vector3(0, .02, 0), new THREE.Vector3(0, spec.height + .4, 0)],
      [new THREE.Vector3(spec.width, spec.height * .59, -.15), new THREE.Vector3(0, spec.height * .59, -.15)]];
    for (const [from, to] of probes) {
      const direction = to.clone().sub(from), length = direction.length(); direction.normalize();
      const ray = new THREE.Raycaster(from, direction, 0, length);
      const reference = ray.intersectObjects(collider.entries.map(e => e.mesh), false)[0];
      const hit = collider.sweep(from, to, 0);
      assert.ok(reference && hit, `${spec.id} must have an actual physical panel in this probe`);
      near(hit.fraction * length, reference.distance, .00002);
    }
    const z = spec.wheelbase * (1 - spec.frontWeightFraction);
    const opening = collider.sweep({ x: spec.width / 2 + .25, y: spec.tireRadius, z },
      { x: spec.track / 2 + .025, y: spec.tireRadius, z }, .012);
    assert.ok(opening === null, `${spec.id}: a lateral release through the front wheel opening must not hit a filled body box (hit ${opening?.point?.toArray()})`);
    report.push({ vehicle: spec.id, triangles: collider.triangleCount, hierarchyNodes: collider.hierarchy.nodes.length, wheelOpening: 'clear', referencePanels: probes.length });
    collider.dispose(); vehicle.dispose();
  }
  t.diagnostic(JSON.stringify(report));
});

test('normal accelerator/steering input on all five models emits at actual tire contacts and produces body interception', t => {
  const reports = [];
  for (const spec of VEHICLES) {
    const scene = new THREE.Scene(), terrain = new Terrain(), physics = new VehiclePhysics(terrain, spec);
    const vehicle = new VehicleView(scene, spec), view = new TireSprayView(scene, terrain); view.setVehicle(vehicle);
    physics.reset({ x: 33, z: -114, heading: 0 });
    for (let frame = 0; frame < 120; frame++) physics.step(1 / 60, { brake: 1 });
    let births = 0, supportedBirths = 0, maxRadius = 0; const emit = view.simulation._emit.bind(view.simulation);
    const wheels = new Set();
    view.simulation._emit = (kind, wheel, ...args) => {
      const p = emit(kind, wheel, ...args); births++; wheels.add(wheel.index);
      if (wheel.contact && wheel.load > 0 && !wheel.constructed) supportedBirths++;
      const distance = Math.hypot(p.sourcePosition.x - wheel.ground.x, p.sourcePosition.z - wheel.ground.z);
      maxRadius = Math.max(maxRadius, distance);
      assert.ok(distance < spec.tireRadius * 1.3, 'Every release must stay at its own tire, rather than a common rear outlet');
      assert.equal(p.sourceWheel, wheel.index); return p;
    };
    let impactEvents = 0;
    for (let frame = 0; frame < 360; frame++) {
      const current = physics.step(1 / 60, { throttle: .8, steer: frame > 60 ? .45 : 0, steerSource: 'analog' });
      vehicle.update(current); view.update(1 / 60, current, 'high');
      impactEvents += view.simulation.bodyImpacts.length;
      assert.ok(view.simulation.bodyImpacts.length <= 16 && view.simulation.impacts.length <= 16);
      assert.ok(view.water.count + view.mud.count <= 960);
    }
    assert.ok(births > 20 && supportedBirths === births); assert.ok(wheels.size >= 2,
      `${spec.id}: its real wet supported contacts must emit; dry/unloaded wheels must not be forced to emit`);
    assert.ok(impactEvents > 0, `${spec.id}: tire ejecta must meet the real liners/panels while driving`);
    assert.equal(view.collider.refits, 0, 'A damage-free drive must not rebuild/refit the exterior hierarchy every frame');
    reports.push({ vehicle: spec.id, births, supportedBirths, wheels: [...wheels], maxReleaseOffsetM: maxRadius,
      bodyCollisions: view.simulation.bodyCollisions, impactEvents, travelledM: physics.state.odometer,
      finalSpeedKmh: physics.state.speedKmh, triangleTests: view.collider.hierarchy.metrics.triangles });
    view.dispose(); vehicle.dispose();
  }
  t.diagnostic(JSON.stringify(reports));
});

test('larger tires and lifted suspension keep collision panels at the rendered body datum', () => {
  const spec = deriveVehicle(VEHICLES[0], { tires: 'allTerrain', suspension: 'trail', size: 'large' });
  const vehicle = new VehicleView(new THREE.Scene(), spec), collider = new VehicleSprayCollider(vehicle);
  const current = pose({ x: 0, y: spec.cgHeight, z: 0 }); vehicle.update(current); vehicle.root.updateWorldMatrix(true, true); collider.beginFrame(current, 1 / 60);
  const from = new THREE.Vector3(0, -.1, 0), to = new THREE.Vector3(0, spec.height + .4, 0);
  const direction = to.clone().sub(from), length = direction.length(); direction.normalize();
  const reference = new THREE.Raycaster(from, direction, 0, length).intersectObjects(collider.entries.map(e => e.mesh), false)[0];
  const hit = collider.sweep(from, to, 0); assert.ok(hit && reference); near(hit.fraction * length, reference.distance, .00002);
  collider.dispose(); vehicle.dispose();
});
