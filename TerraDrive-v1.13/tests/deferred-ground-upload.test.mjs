import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { Terrain } from '../dist/src/terrain.js';
import { OffroadWorld } from '../dist/src/world.js';

// Use the actual vendored Three upload function. The GL buffer stand-in keeps
// the same typed-array bytes, exposing stale uploads that a CPU geometry test
// or a native snapshot of final mesh arrays cannot detect. It makes no claim
// of drawing a GPU frame or measuring browser performance.
function uploader() {
  const source = readFileSync(new URL('../dist/vendor/three.module.js', import.meta.url), 'utf8');
  const start = source.indexOf('function WebGLAttributes( gl ) {'), end = source.indexOf('\n}\n', start) + 3;
  assert.ok(start >= 0 && end > start, 'The byte contract must use the unchanged vendored uploader');
  const WebGLAttributes = Function(source.slice(start, end) + '\nreturn WebGLAttributes;')();
  let bound;
  const gl = {
    FLOAT: 0x1406, ARRAY_BUFFER: 0x8892,
    createBuffer() { return {}; }, bindBuffer(_type, buffer) { bound = buffer; },
    bufferData(_type, array) { bound.data = array.slice(); },
    bufferSubData(_type, offset, array, start = 0, count = array.length) {
      bound.data.set(array.subarray(start, start + count), offset / array.BYTES_PER_ELEMENT);
    }, deleteBuffer() {},
  };
  const attributes = WebGLAttributes(gl);
  return {
    upload(attribute) { attributes.update(attribute, gl.ARRAY_BUFFER); },
    data(attribute) { return attributes.get(attribute).buffer.data; },
  };
}

function makeWorld() {
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, {
    terrain: new Terrain(), scene: new THREE.Scene(), quality: 'high', clock: 0, groundMeshes: new Map(),
    _textureLoader: { load(url) { const texture = new THREE.Texture(); texture.userData.url = url; return texture; } },
  });
  return world;
}

function stamp(terrain, point, count = 20) {
  for (let i = 0; i < count; i++) terrain.deform(point.x, point.z, {
    load: 6000, pressure: 35, contactWidth: .285, contactLength: .28, slip: .4, dt: 1 / 120,
  });
}

test('separated soil edits survive multiple CPU syncs while the shared rut chunk is not drawn', () => {
  const world = makeWorld(), terrain = world.terrain, points = [{ x: -51, z: 282 }, { x: -43, z: 282 }];
  world._createTerrain();
  for (const point of points) stamp(terrain, point, 1);
  world._syncDeformation();
  const records = points.map(point => world.detailMeshes.get(terrain.getDetailTile(point.x, point.z).key));
  assert.equal(records[0].chunk, records[1].chunk, 'The fixture requires two separated real tiles in one production draw');
  const attributes = records[0].chunk.mesh.geometry.attributes, gpu = uploader();
  const names = ['position', 'normal', 'aSoil', 'color', 'uv', 'aGeology'];
  for (const name of names) {
    gpu.upload(attributes[name]); attributes[name].needsUpdate = true; gpu.upload(attributes[name]);
    assert.equal(attributes[name].updateRanges.length, 0, 'Drain allocation ranges before the observed two-edit failure');
  }
  const original = attributes.position.array.slice();
  // No intervening uploader call: this is the real contract when a draw is
  // culled or the application has not rendered between simulation updates.
  for (const point of points) { stamp(terrain, point); world._syncDeformation(); }
  assert.ok(attributes.position.array.some((value, index) => value !== original[index]));
  for (const name of names) {
    assert.ok(attributes[name].updateRanges.length <= 64, 'Pending spans stay bounded while a chunk is unseen');
    gpu.upload(attributes[name]);
    assert.deepEqual(gpu.data(attributes[name]), attributes[name].array,
      'Every stored ' + name + ' component must reach the actual Three buffer updater after deferred draws');
    assert.equal(attributes[name].updateRanges.length, 0, 'Three drains pending ranges after uploading them');
  }
});

test('deferred near vegetation edits and a later region rebuild both reach the Three buffer intact', () => {
  const world = makeWorld(), terrain = world.terrain, observer = { x: -51, z: 282 };
  world._createGroundDetails(); world._updateGroundProximity(observer, true);
  const near = world.groundProximity;
  const first = near.records.find(record => record.population === 'grass' && record.fade === 1 && Math.hypot(record.x - observer.x, record.z - observer.z) < 5);
  const second = near.records.find(record => record.population === 'grass' && record.fade === 1 && Math.hypot(record.x - first.x, record.z - first.z) > 8);
  assert.ok(first && second);
  const attribute = near.grass.instanceMatrix, gpu = uploader(); gpu.upload(attribute);
  attribute.needsUpdate = true; gpu.upload(attribute);
  assert.equal(attribute.updateRanges.length, 0);
  for (const [index, point] of [first, second].entries()) {
    stamp(terrain, point); world.clock = (index + 1) * .2; world._updateGroundProximity(observer);
  }
  gpu.upload(attribute);
  assert.deepEqual(gpu.data(attribute), attribute.array, 'Both earlier and later pending stems must reach the buffer');
  stamp(terrain, first); world.clock = .6; world._updateGroundProximity(observer);
  world._updateGroundProximity({ x: -19, z: 282 });
  gpu.upload(attribute);
  assert.deepEqual(gpu.data(attribute).slice(0, near.grass.count * 16), attribute.array.slice(0, near.grass.count * 16),
    'A complete population rebuild cannot be restricted to an older partial update range');
});
