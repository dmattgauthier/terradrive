import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { Terrain } from '../dist/src/terrain.js';
import { OffroadWorld } from '../dist/src/world.js';
import { GEOLOGY_PROFILES, geologyProfileAt } from '../dist/src/geology-profiles.js';
import { MUD_RUT_ROUTES, mudRouteAt, mudWheelPathAt } from '../dist/src/terrain-geology.js';

const report = JSON.parse(readFileSync(new URL('../docs/geology-profiles-v1.9-preparation.json', import.meta.url)));
const coordinate = index => index * 2 / (GEOLOGY_PROFILES.gridSize - 1) - 1;

test('The actual sun projection includes the declared boulder shadow coverage', () => {
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, {timeOfDay: 'day', scene: new THREE.Scene()});
  world._createLighting();
  const camera = world.sun.shadow.camera;
  // LightShadow.updateMatrices only updates the view. Merely assigning camera
  // bounds leaves Three's default 10 m projection in place until it is rebuilt.
  // Check transformed points, not only the nominal frustum properties.
  for (const [x, expectedX] of [[camera.left, -1], [camera.right, 1]]) {
    for (const [y, expectedY] of [[camera.bottom, -1], [camera.top, 1]]) {
      for (const [z, expectedZ] of [[-camera.near, -1], [-camera.far, 1]]) {
        const clip = new THREE.Vector3(x, y, z).applyMatrix4(camera.projectionMatrix);
        assert.ok(clip.distanceTo(new THREE.Vector3(expectedX, expectedY, expectedZ)) < 1e-12,
          'All declared sun-frustum corners must reach the actual clip-space boundary');
      }
    }
  }
  const neighboringBoulder = new THREE.Vector3(20, 15, -100).applyMatrix4(camera.projectionMatrix);
  assert.ok(Math.abs(neighboringBoulder.x) < 1 && Math.abs(neighboringBoulder.y) < 1
    && Math.abs(neighboringBoulder.z) < 1, 'A nearby off-center boulder remains inside real shadow coverage');
});

test('The four boulder profiles retain bounded original-source geometry and independently reproducible bytes', () => {
  const hashes = new Set();
  for (const profile of GEOLOGY_PROFILES.profiles) {
    const size = GEOLOGY_PROFILES.gridSize, bytes = Buffer.alloc(size * size * 2);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const value = geologyProfileAt(profile.id, coordinate(x), coordinate(z));
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
      const quantized = Math.round(value * 65535);
      assert.ok(Math.abs(value * 65535 - quantized) < 1e-7);
      bytes.writeUInt16LE(quantized, (z * size + x) * 2);
      if (!x || !z || x === size - 1 || z === size - 1) assert.equal(value, 0, 'The padded source domain has no raised outer rim');
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, profile.payloadSha256); hashes.add(digest);
    assert.equal(geologyProfileAt(profile.id, ...profile.peak), 1);
    for (const [x, z] of [[1.1, 0], [0, -1.1], [NaN, 0], [0, Infinity]]) assert.equal(geologyProfileAt(profile.id, x, z), 0);
    for (let x = 1; x < size - 1; x++) {
      const seam = coordinate(x);
      assert.ok(Math.abs(geologyProfileAt(profile.id, seam - 1e-10, .17) - geologyProfileAt(profile.id, seam + 1e-10, .17)) < 1e-7);
    }
  }
  assert.equal(hashes.size, 4, 'Four source shapes must not be rotations of one shared payload');
  assert.equal(geologyProfileAt(99, 0, 0), 0);
  assert.equal(geologyProfileAt(.5, 0, 0), 0);

  const sourceUrl = new URL(`../${report.source.gltf.path}`, import.meta.url), sourceBytes = readFileSync(sourceUrl);
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), report.source.gltf.sha256);
  const gltf = JSON.parse(sourceBytes), buffers = gltf.buffers.map((record, i) => {
    const bytes = readFileSync(new URL(record.uri, sourceUrl));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), report.source.buffers[i].sha256);
    return bytes;
  });
  const accessor = index => {
    const record = gltf.accessors[index], view = gltf.bufferViews[record.bufferView], buffer = buffers[view.buffer];
    const Type = {5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}[record.componentType];
    const width = {SCALAR: 1, VEC3: 3}[record.type];
    assert.ok(!view.byteStride || view.byteStride === width * Type.BYTES_PER_ELEMENT);
    return new Type(buffer.buffer, buffer.byteOffset + (view.byteOffset || 0) + (record.byteOffset || 0), record.count * width);
  };
  for (const profile of GEOLOGY_PROFILES.profiles) {
    const primitive = gltf.meshes[profile.sourceMeshIndex].primitives[0], geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(accessor(primitive.attributes.POSITION), 3));
    geometry.setIndex(new THREE.BufferAttribute(accessor(primitive.indices), 1));
    const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide}), mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    for (const [ix, iz] of [[4,4],[17,18],[25,39],[32,32],[43,24],[48,46],[61,32],[32,3]]) {
      const x = coordinate(ix), z = coordinate(iz);
      const sourceX = profile.sourceXZCenter[0] + x * profile.sourceXZHalfExtent[0];
      const sourceZ = profile.sourceXZCenter[1] + z * profile.sourceXZHalfExtent[1];
      const hit = new THREE.Raycaster(new THREE.Vector3(sourceX, 3, sourceZ), new THREE.Vector3(0, -1, 0), 0, 6).intersectObject(mesh)[0];
      const height = hit ? Math.max(0, hit.point.y - profile.cutoffSourceY) / profile.peakMetres : 0;
      assert.ok(Math.abs(geologyProfileAt(profile.id, x, z) - height) <= .5 / 65535 + 1e-8,
        `${profile.name} agrees with independent actual source-mesh rays`);
    }
    geometry.dispose(); material.dispose();
  }
});

test('Granite has separated, differently proportioned boulders and a traversable central line', () => {
  const terrain = new Terrain(), outcrops = terrain.rockOutcrops;
  assert.ok(outcrops.length >= 20 && outcrops.length <= 30);
  assert.equal(new Set(outcrops.map(shape => shape.profile)).size, 4);
  assert.ok(new Set(outcrops.map(shape => shape.group)).size >= 5);
  assert.ok(Math.max(...outcrops.map(shape => shape.h)) > 3 && Math.max(...outcrops.map(shape => shape.h)) < 4.2);
  const ratios = outcrops.map(shape => shape.h / (2 * Math.sqrt(shape.rx * shape.rz)));
  assert.ok(Math.min(...ratios) > .31 && Math.max(...ratios) > .65, 'Boulders retain source-like vertical proportions rather than being flattened into wide hills');
  let bare = 0, stone = 0;
  for (let z = 74; z <= 184; z += 1) for (let x = 77; x <= 164; x += 1) {
    const field = terrain.geologyAt(x, z);
    bare += field.stone < .01; stone += field.stone > .7;
    for (const key of ['stone', 'rut', 'shoulder']) assert.ok(Number.isFinite(field[key]) && field[key] >= 0 && field[key] <= 1);
  }
  assert.ok(bare > stone * 2 && stone > 250, 'Visible stone clusters have substantial interstitial ground and are not one continuous blanket');
  let maximumCentralStep = 0;
  for (let z = 48; z < 129; z += .5) maximumCentralStep = Math.max(maximumCentralStep, Math.abs(terrain.heightAt(112, z + .5) - terrain.heightAt(112, z)));
  assert.ok(maximumCentralStep < .55, 'The central approach remains an articulation line instead of an unavoidable tall boulder wall');
});

test('Weathered partings survive the actual contact grid and rendered granite triangles', () => {
  const terrain = new Terrain(), world = Object.create(OffroadWorld.prototype);
  Object.assign(world, { terrain, scene: new THREE.Scene(), groundMeshes: new Map(),
    _terrainMaterial: () => new THREE.MeshBasicMaterial() });
  world._createTerrain();
  const mesh = world.groundMeshes.get('rock').mesh;
  mesh.updateMatrixWorld(true);
  // Fixed map-space transects cross the six parent blocks. These assertions
  // use the public contact sampler, not the analytic profile or joint mask.
  // They also fail on the previous unbroken mounds with the same source scans.
  const sections = [
    { center: [134.6839, 117.9998], across: [1, .000621] },
    { center: [143.9931, 143.0955], across: [.055487, -.998459] },
    { center: [87.4435, 155.1207], across: [.664088, -.747654] },
    { center: [138.9560, 176.7761], across: [.952937, .303169] },
    { center: [91.1457, 98.4065], across: [.998747, .050041] },
    { center: [149.2071, 81.9756], across: [-.393857, -.919172] },
  ];
  for (const { center: [x, z], across: [dx, dz] } of sections) {
    const center = terrain.heightAt(x, z), left = terrain.heightAt(x - dx * .9, z - dz * .9);
    const right = terrain.heightAt(x + dx * .9, z + dz * .9);
    assert.ok(Math.min(left, right) - center > .7,
      'Two exposed banks must be separated by real low terrain, not a painted line');
    for (const offset of [-.9, -.63, -.27, 0, .19, .58, .9]) {
      const px = x + dx * offset, pz = z + dz * offset, contact = terrain.sample(px, pz);
      const hit = new THREE.Raycaster(new THREE.Vector3(px, 30, pz), new THREE.Vector3(0, -1, 0), 0, 40).intersectObject(mesh)[0];
      assert.ok(hit && Math.abs(hit.point.y - contact.height) < 2e-6,
        'Parting floors, shoulders and crests use the same visible and physical triangles');
      assert.equal(contact.maxSink, 0, 'The jointed rock area remains rigid');
      assert.ok(Math.abs(Math.hypot(contact.normal.x, contact.normal.y, contact.normal.z) - 1) < 1e-7);
    }
  }
  for (const record of world.groundMeshes.values()) { record.mesh.geometry.dispose(); record.mesh.material.dispose(); }
});

test('Detached granite fragments remain physical relief at the terrain grid scale', () => {
  const terrain = new Terrain();
  const fragments = terrain.rocks.filter(shape => shape.fragment);
  assert.ok(fragments.length >= 60 && fragments.length <= 90);
  assert.equal(new Set(fragments.map(shape => shape.group)).size, 6);
  // Actual grid vertices at separately authored fragment fans, well away from
  // the central line. A below-grid-size decorative point cannot satisfy this.
  for (const [x, z] of [[136,122],[151.5,138],[98,153],[140.5,181],[95.5,100],[153,79.5]]) {
    const field = terrain.geologyAt(x, z), sample = terrain.sample(x, z);
    assert.ok(field.stoneHeight > .3 && field.stone > .8, 'Fragments emerge as rigid stone, including the northern fan inside the regional blend');
    assert.equal(sample.surface, 'rock'); assert.equal(sample.maxSink, 0);
    const initial = sample.height;
    terrain.deform(x, z, { load: 15000, pressure: 55, slip: 2, dt: .3 });
    assert.equal(terrain.heightAt(x, z), initial, 'A large tire load cannot excavate a detached fragment');
  }
  for (let z = 42; z < 129; z += .5) for (let x = 109.5; x <= 114.5; x += .5) {
    assert.ok(Math.abs(terrain.heightAt(x, z + .5) - terrain.heightAt(x, z)) < .55,
      'The usable central route retains several metres of clearance beside the new groups');
  }
});

test('Authored mud routes branch smoothly with asymmetric changing widths, depths, pools and spoil', () => {
  const terrain = new Terrain();
  assert.ok(MUD_RUT_ROUTES.length >= 3);
  for (const route of MUD_RUT_ROUTES) for (const [z] of route.nodes.slice(1, -1)) {
    const before = mudRouteAt(route, z - 1e-7), after = mudRouteAt(route, z + 1e-7);
    assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.slope - after.slope) < 1e-6, 'Branches have continuous position and tangent at authored joins');
  }
  const route = MUD_RUT_ROUTES[0], widths = [], depths = [], asymmetry = [];
  let wet = 0, shoulders = 0;
  for (let z = -148; z <= -73; z += .5) {
    const left = mudWheelPathAt(route, -1, z), right = mudWheelPathAt(route, 1, z);
    widths.push(left.width, right.width); depths.push(left.depth, right.depth); asymmetry.push(Math.abs(left.depth - right.depth));
    assert.ok(right.x - left.x > 1.35 && right.x - left.x < 2.7, 'Independent wear does not turn one vehicle route into unrelated wandering grooves');
    wet += terrain.sample(left.x, z).waterDepth > .012;
    shoulders += terrain.geologyAt(left.x - left.width * 1.67, z).shoulder > .15;
  }
  assert.ok(Math.max(...widths) - Math.min(...widths) > .20);
  assert.ok(Math.max(...depths) > Math.min(...depths) * 3);
  assert.ok(asymmetry.filter(value => value > .025).length > asymmetry.length * .4, 'Left and right wear are not identical');
  assert.ok(wet > 6 && shoulders > 50, 'The actual contact ground has discontinuous standing water and displaced shoulders');
  const point = {x: 49.2, z: -104.1}, initial = terrain.heightAt(point.x, point.z), authored = terrain.geologyAt(point.x, point.z);
  assert.ok(authored.rutDepth > .08);
  for (let i = 0; i < 30; i++) terrain.deform(point.x, point.z, {load: 6000, pressure: 35, slip: 1.5, dt: 1 / 60});
  assert.ok(terrain.heightAt(point.x, point.z) < initial && terrain.sample(point.x, point.z).sink > 0);
  assert.deepEqual(terrain.geologyAt(point.x, point.z), authored, 'Authored wear and live tire state remain separate');
  terrain.resetDeformation(); assert.equal(terrain.heightAt(point.x, point.z), initial);
  assert.equal(terrain.sample(point.x, point.z).sink, 0, 'Reset clears new tracks but keeps the authored terrain');
});

test('Embedded mudstones remain rigid while neighboring mud can deform', () => {
  const terrain = new Terrain();
  const shape = terrain.mudStones.toSorted((a, b) => b.h - a.h)[0], profile = GEOLOGY_PROFILES.profiles[shape.profile];
  const dx = profile.peak[0] * shape.rx, dz = profile.peak[1] * shape.rz;
  const cx = shape.x + dx * shape.cos - dz * shape.sin, cz = shape.z + dx * shape.sin + dz * shape.cos;
  assert.equal(terrain.surfaceAt(cx, cz), 'rock');
  const points = [];
  for (let z = cz - .6; z <= cz + .6; z += .04) for (let x = cx - .6; x <= cx + .6; x += .04) {
    if (terrain.surfaceAt(x, z) === 'rock') points.push({x, z, height: terrain.heightAt(x, z)});
  }
  assert.ok(points.length > 20, 'The test uses a real exposed footprint');
  for (const side of [-1, 1]) for (let z = cz - 1.3; z <= cz + 1.3; z += .13) {
    terrain.deform(cx + side * .65, z, {load: 10000, pressure: 55, width: .45, slip: 2.2, speed: 3,
      dt: 1 / 30, wheelId: 'beside-stone-' + side});
  }
  for (const point of points) {
    assert.ok(Math.abs(terrain.heightAt(point.x, point.z) - point.height) < 2e-6, 'A neighboring wheel footprint cannot excavate any part of rigid exposed stone');
    assert.equal(terrain.sample(point.x, point.z).maxSink, 0);
  }
  assert.ok(terrain.soilVolumes.depressed > .002, 'Neighboring soil actually changed during the protection check');
  terrain.setWeather('rain');
  for (const point of points.slice(0, 10)) {
    const sample = terrain.sample(point.x, point.z);
    assert.equal(sample.waterDepth, Math.max(0, 3.315 - sample.height), 'Water is determined by the mud basin even when contact material is rock');
  }
});
