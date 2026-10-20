import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { GroundCoverContact } from '../dist/src/ground-cover-contact.js';
import { Terrain } from '../dist/src/terrain.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';

function population(terrain, points, { height = 1, rootOffset = -.02 } = {}) {
  const geometry = new THREE.BoxGeometry(.08, 1, .08);
  geometry.translate(0, .5, 0);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), points.length);
  const transform = new THREE.Object3D();
  points.forEach((point, index) => {
    transform.position.set(point.x, terrain.heightAt(point.x, point.z) + rootOffset, point.z);
    transform.rotation.set(0, .37 + index * .23, 0);
    transform.scale.set(.7, height, .8); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
  });
  return mesh;
}

let driven;
function actualContactFixture() {
  if (driven) return driven;
  const terrain = new Terrain(), spec = VEHICLES.find(vehicle => vehicle.id === 'wrangler-rubicon');
  const physics = new VehiclePhysics(terrain, spec);
  physics.reset({ x: -51, z: 282, heading: 0 });
  assert(physics.setControl('selector', 'P').ok);
  const root = { ...physics.state.wheels[0].ground };
  const points = [root, { x: root.x + 3, z: root.z }, { x: root.x + 80, z: root.z }];
  const grass = population(terrain, points), heads = population(terrain, points, { height: .12, rootOffset: 1.45 });
  const pebbles = population(terrain, points, { height: .025, rootOffset: .012 });
  const original = grass.instanceMatrix.array.slice(), originalHeads = heads.instanceMatrix.array.slice(), originalPebbles = pebbles.instanceMatrix.array.slice();
  const contact = new GroundCoverContact(terrain, [
    { mesh: grass, rootOffset: -.02, companion: heads },
    { mesh: pebbles, plant: false, rootOffset: .012 },
  ]);
  let maximumSampled = 0, realContacts = 0;
  const deform = terrain.deform.bind(terrain);
  terrain.deform = (x, z, options) => { assert(options.supportPlane); realContacts++; return deform(x, z, options); };
  for (let frame = 0; frame < 240; frame++) {
    physics.step(1 / 120);
    maximumSampled = Math.max(maximumSampled, contact.update().sampled);
  }
  terrain.deform = deform;
  assert(realContacts > 0, 'The positive fixture must use loaded VehiclePhysics contacts');
  driven = { terrain, physics, root, points, grass, heads, pebbles, contact, original, originalHeads, originalPebbles, maximumSampled };
  return driven;
}

test('ordinary tire contact crushes static cover, seats grit and keeps cattail heads attached', () => {
  const f = actualContactFixture(), sample = f.terrain.sample(f.root.x, f.root.z);
  assert(sample.compaction > .2 && sample.sink > .0001, 'Actual loaded tires must work the grass-covered soil');
  const compression = 1 - sample.compaction * .91;
  assert(Math.abs(f.grass.instanceMatrix.array[5] - f.original[5] * compression) < 1e-6);
  assert(Math.abs(f.grass.instanceMatrix.array[13] - sample.height + .02) < 1e-6);
  const attachment = f.originalHeads[13] - f.original[13];
  assert(Math.abs(f.heads.instanceMatrix.array[13] - (sample.height - .02 + attachment * compression)) < 1e-6,
    'A compressed marsh stalk must not leave its seed head suspended at the old height');
  assert(Math.abs(f.pebbles.instanceMatrix.array[13] - sample.height - .012) < 1e-6);
  assert.equal(f.pebbles.instanceMatrix.array[5], f.originalPebbles[5], 'Rigid grit does not shrink with the grass');
  for (const index of [0, 1, 2, 3, 8, 9, 10, 11, 12, 14, 15]) assert.equal(f.grass.instanceMatrix.array[index], f.original[index],
    'Compaction preserves the deterministic placement, width and yaw');
  for (let index = 16; index < f.original.length; index++) assert.equal(f.grass.instanceMatrix.array[index], f.original[index],
    'The neighboring untouched plants retain their exact transforms');
  assert(f.maximumSampled < f.points.length * 2, 'Soil updates must not resample every distant instance');
  const version = f.grass.instanceMatrix.version;
  assert.equal(f.contact.update().sampled, 0);
  assert.equal(f.grass.instanceMatrix.version, version, 'An unchanged terrain does not upload instance matrices');
});

test('tread-only changes do not upload cover transforms and the bounds include compressed tips', () => {
  const f = actualContactFixture(), tile = f.terrain.getDetailTile(f.root.x, f.root.z);
  const versions = [f.grass, f.heads, f.pebbles].map(mesh => mesh.instanceMatrix.version);
  tile.tread[0] = tile.tread[0] === 1 ? .5 : 1; tile.revision++;
  const update = f.contact.update();
  assert(update.sampled > 0 && update.changed === 0 && update.uploads === 0);
  assert.deepEqual([f.grass, f.heads, f.pebbles].map(mesh => mesh.instanceMatrix.version), versions);
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const mesh of [f.grass, f.heads, f.pebbles]) for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
      point.fromBufferAttribute(mesh.geometry.attributes.position, vertex).applyMatrix4(matrix);
      assert(mesh.boundingBox.containsPoint(point));
      assert(point.distanceTo(mesh.boundingSphere.center) <= mesh.boundingSphere.radius);
    }
  }
});

test('a late-created cover batch follows existing ruts and reset restores its original ground', () => {
  const f = actualContactFixture();
  const grass = population(f.terrain, [f.root]);
  const oldRoot = grass.instanceMatrix.array[13];
  const contact = new GroundCoverContact(f.terrain, [{ mesh: grass, rootOffset: -.02 }]);
  assert(grass.instanceMatrix.array[5] < .8, 'Existing compaction applies immediately to a newly created batch');
  const pristine = new Terrain().heightAt(f.root.x, f.root.z);
  f.terrain.resetDeformation(); contact.update(); f.contact.update();
  assert(Math.abs(grass.instanceMatrix.array[13] - (pristine - .02)) < 1e-6);
  assert(grass.instanceMatrix.array[13] > oldRoot + .0001, 'Reset lifts the root out of the old rut');
  assert.equal(grass.instanceMatrix.array[5], 1);
  for (const [mesh, original] of [[f.grass, f.original], [f.heads, f.originalHeads], [f.pebbles, f.originalPebbles]]) {
    for (let index = 0; index < original.length; index++) {
      // Rendered X/Z are Float32. Re-sampling those coordinates on the grade
      // can shift Y by one ULP from the initial double-precision placement.
      if (index % 16 === 13) assert(Math.abs(mesh.instanceMatrix.array[index] - original[index]) < 2e-6);
      else assert.equal(mesh.instanceMatrix.array[index], original[index]);
    }
  }
  assert.equal(contact.update().uploads, 0, 'Restored batches settle without repeated uploads');
});

test('hidden cover preserves every pending edit until the actual Three buffer upload', () => {
  // Run the vendored upload implementation, with GL calls retaining exact
  // buffer bytes. Synthetic soil edits isolate a draw-skipping contract that
  // CPU-only geometry tests and native scene extraction cannot observe.
  const source = readFileSync(new URL('../dist/vendor/three.module.js', import.meta.url), 'utf8');
  const begin = source.indexOf('function WebGLAttributes( gl ) {');
  const end = source.indexOf('\n}\n', begin) + 3;
  assert(begin >= 0 && end > begin, 'The test must use the actual vendored Three uploader');
  const WebGLAttributes = Function(source.slice(begin, end) + '\nreturn WebGLAttributes;')();
  let bound;
  const gl = {
    FLOAT: 0x1406, ARRAY_BUFFER: 0x8892,
    createBuffer: () => ({}), bindBuffer: (_, buffer) => { bound = buffer; },
    bufferData: (_, array) => { bound.data = array.slice(); },
    bufferSubData: (_, byteOffset, array, start = 0, count = array.length) => {
      bound.data.set(array.subarray(start, start + count), byteOffset / array.BYTES_PER_ELEMENT);
    },
    deleteBuffer() {},
  };
  const uploader = WebGLAttributes(gl), terrain = new Terrain();
  const points = [{ x: -51, z: 282 }, { x: -43, z: 282 }];
  const grass = population(terrain, points);
  const heads = population(terrain, points, { height: .12, rootOffset: 1.45 });
  const contact = new GroundCoverContact(terrain, [{ mesh: grass, rootOffset: -.02, companion: heads }]);
  for (const mesh of [grass, heads]) {
    uploader.update(mesh.instanceMatrix, gl.ARRAY_BUFFER);
    mesh.visible = false;
  }
  for (const point of points) {
    for (let pass = 0; pass < 20; pass++) terrain.deform(point.x, point.z,
      { load: 6000, pressure: 35, contactWidth: .285, contactLength: .28, slip: .4, dt: 1 / 120 });
    contact.update();
  }
  assert(grass.instanceMatrix.array[5] < .5 && grass.instanceMatrix.array[21] < .5);
  for (const mesh of [grass, heads]) {
    mesh.visible = true;
    uploader.update(mesh.instanceMatrix, gl.ARRAY_BUFFER);
    assert.deepEqual(uploader.get(mesh.instanceMatrix).buffer.data, mesh.instanceMatrix.array,
      'Every earlier off-screen matrix edit must reach the GPU buffer when the batch returns');
    assert.equal(mesh.instanceMatrix.updateRanges.length, 0, 'Three drains pending spans after upload');
  }
  // Reset and re-work the second stem before another draw. Restoring the first
  // stem is still a pending edit and must not be erased by the later contact.
  terrain.resetDeformation(); contact.update();
  terrain.deform(points[1].x, points[1].z,
    { load: 6000, pressure: 35, contactWidth: .285, contactLength: .28, slip: .4, dt: 1 / 120 });
  contact.update();
  for (const mesh of [grass, heads]) {
    uploader.update(mesh.instanceMatrix, gl.ARRAY_BUFFER);
    assert.deepEqual(uploader.get(mesh.instanceMatrix).buffer.data, mesh.instanceMatrix.array,
      'A skipped reset draw must preserve the full restoration as well as later compression');
  }
});
