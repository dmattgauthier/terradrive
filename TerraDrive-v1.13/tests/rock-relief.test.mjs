import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { ROCK_RELIEF, rockReliefAt } from '../dist/src/rock-relief.js';

const report = JSON.parse(readFileSync(new URL('../docs/rock-relief-v1.8-preparation.json', import.meta.url)));
const size = ROCK_RELIEF.gridSize;
const coordinate = index => index * 2 / (size - 1) - 1;

test('Source-derived outcrop relief has a finite, bounded, connected footprint and exact exterior zero', () => {
  const values = new Uint16Array(size * size), packed = Buffer.alloc(size * size * 2);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const height = rockReliefAt(coordinate(x), coordinate(z));
    assert.ok(Number.isFinite(height) && height >= 0 && height <= 1);
    const quantized = Math.round(height * 65535), index = z * size + x;
    assert.ok(Math.abs(height * 65535 - quantized) < 1e-7, 'Grid samples retain the exact quantized values');
    values[index] = quantized; packed.writeUInt16LE(quantized, index * 2);
    if (!x || !z || x === size - 1 || z === size - 1) assert.equal(height, 0, 'The complete border has no raised rim');
  }
  assert.equal(packed.length, 8450);
  assert.equal(createHash('sha256').update(packed).digest('hex'), ROCK_RELIEF.payloadSha256);
  const positiveCount = values.reduce((count, value) => count + (value > 0), 0);
  assert.equal(positiveCount, report.measurements.positiveGridSamples);
  assert.ok(positiveCount > values.length * .5 && positiveCount < values.length * .8, 'Rock footprint occupies an irregular subset of its bounded square');
  for (const positive of [true, false]) {
    const start = values.findIndex(value => (value > 0) === positive), queue = [start], visited = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor], x = current % size, z = Math.floor(current / size);
      for (const neighbor of [x ? current - 1 : -1, x < size - 1 ? current + 1 : -1, z ? current - size : -1, z < size - 1 ? current + size : -1]) {
        if (neighbor >= 0 && !visited.has(neighbor) && (values[neighbor] > 0) === positive) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    assert.equal(visited.size, positive ? positiveCount : values.length - positiveCount,
      positive ? 'No isolated raised pixels or detached pieces' : 'No interior ray-miss holes in the upper surface');
  }
  for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1.1, .2], [.2, 1.1], [100, -100], [NaN, 0], [0, Infinity], [-Infinity, NaN]]) assert.equal(rockReliefAt(x, z), 0);
});

test('Bilinear relief keeps the existing peak multiplier and remains continuous through grid seams', () => {
  assert.equal(rockReliefAt(ROCK_RELIEF.peak.x, ROCK_RELIEF.peak.z), 1);
  for (const peakMetres of [1.15, 1.4, 2.2, 2.6, 2.7, 3.5]) {
    assert.equal(peakMetres * rockReliefAt(ROCK_RELIEF.peak.x, ROCK_RELIEF.peak.z), peakMetres, 'Existing outcrop peak multipliers need no extra normalization');
  }
  for (let z = 0; z < size - 1; z++) for (let x = 0; x < size - 1; x++) {
    const x0 = coordinate(x), x1 = coordinate(x + 1), z0 = coordinate(z), z1 = coordinate(z + 1);
    const cornerValues = [rockReliefAt(x0, z0), rockReliefAt(x1, z0), rockReliefAt(x0, z1), rockReliefAt(x1, z1)];
    const interior = rockReliefAt(x0 * .63 + x1 * .37, z0 * .28 + z1 * .72);
    assert.ok(Number.isFinite(interior) && interior >= Math.min(...cornerValues) - 1e-12 && interior <= Math.max(...cornerValues) + 1e-12, 'Interpolation never overshoots or dips beneath its physical samples');
    if (x) assert.ok(Math.abs(rockReliefAt(x0 - 1e-10, (z0 + z1) / 2) - rockReliefAt(x0 + 1e-10, (z0 + z1) / 2)) < 1e-7, 'Neighboring X cells meet without a step');
    if (z) assert.ok(Math.abs(rockReliefAt((x0 + x1) / 2, z0 - 1e-10) - rockReliefAt((x0 + x1) / 2, z0 + 1e-10)) < 1e-7, 'Neighboring Z cells meet without a step');
  }
  assert.ok(rockReliefAt(-1 + 1e-10, .1) < 1e-7 && rockReliefAt(1 - 1e-10, .1) < 1e-7, 'Height converges to zero continuously at exterior boundaries');
  // The documented peak lies away from the center, and the two center axes
  // have different profiles: this is the source rock's asymmetry.
  assert.ok(Math.abs(ROCK_RELIEF.peak.x) > .4);
  assert.ok(Math.abs(rockReliefAt(.6, 0) - rockReliefAt(0, .6)) > .4);
});

test('Independent rays against the original mesh reproduce representative relief samples', () => {
  const sourceUrl = new URL(`../${report.source.gltf.path}`, import.meta.url), sourceBytes = readFileSync(sourceUrl);
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), report.source.gltf.sha256);
  const gltf = JSON.parse(sourceBytes), buffers = gltf.buffers.map((record, index) => {
    const bytes = readFileSync(new URL(record.uri, sourceUrl));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), report.source.buffers[index].sha256);
    return bytes;
  });
  const accessor = index => {
    const record = gltf.accessors[index], view = gltf.bufferViews[record.bufferView], buffer = buffers[view.buffer];
    const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[record.componentType], width = { SCALAR: 1, VEC3: 3 }[record.type];
    assert.ok(!view.byteStride || view.byteStride === width * Type.BYTES_PER_ELEMENT);
    return new Type(buffer.buffer, buffer.byteOffset + (view.byteOffset || 0) + (record.byteOffset || 0), record.count * width);
  };
  const primitive = gltf.meshes[report.source.sourceMeshIndex].primitives[0], positions = accessor(primitive.attributes.POSITION), indices = accessor(primitive.indices);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld(true);
  assert.equal(indices.length / 3, 5000);
  for (const [ix, iz] of [[13, 33], [32, 32], [16, 16], [48, 48], [2, 32], [60, 32], [32, 10], [32, 53], [4, 4], [58, 58]]) {
    const x = coordinate(ix), z = coordinate(iz);
    const sourceX = ROCK_RELIEF.sourceXZCenter[0] + ROCK_RELIEF.sourceXZHalfExtent[0] * x;
    const sourceZ = ROCK_RELIEF.sourceXZCenter[1] + ROCK_RELIEF.sourceXZHalfExtent[1] * z;
    const ray = new THREE.Raycaster(new THREE.Vector3(sourceX, 2, sourceZ), new THREE.Vector3(0, -1, 0), 0, 4);
    const hit = ray.intersectObject(mesh)[0], sourceHeight = hit ? Math.max(0, hit.point.y - ROCK_RELIEF.cutoffSourceY) / ROCK_RELIEF.sampledPeakAboveCutoff : 0;
    assert.ok(Math.abs(rockReliefAt(x, z) - sourceHeight) <= .5 / 65535 + 1e-8, `Relief (${ix}, ${iz}) agrees with an actual source-mesh ray within quantization`);
  }
  geometry.dispose(); material.dispose();
});
