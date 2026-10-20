import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { subdivideBendRegions } from '../dist/src/vehicle-tessellation.js';

// ABC is wholly in the bent nose region, whereas ACD crosses its boundary.
// A third-vertex region test previously split AC only on the ABC side. Mapping
// that hanging midpoint onto a curved body opened visible triangular holes.
const corners = [[0, 0, 2.35], [2.7, 0, 2.9], [2.4, 2, 2.70], [0, 2, 1.4]];
const makeGeometry = order => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(order.flatMap(i => corners[i]), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(order.flatMap((_, i) => i < 3 ? [0, 0, 1] : [0, 1, 0]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(order.flatMap((_, i) => i < 3 ? [0, 0] : [1, 1]), 2));
  return geometry;
};
const point = (attribute, i) => new THREE.Vector3().fromBufferAttribute(attribute, i);
const onSegment = (p, a, b) => {
  const first = new THREE.Vector3(...a), direction = new THREE.Vector3(...b).sub(first);
  const t = p.clone().sub(first).dot(direction) / direction.lengthSq();
  return t > -1e-5 && t < 1 + 1e-5 && first.addScaledVector(direction, t).distanceTo(p) < 1e-5;
};

test('body tessellation keeps a curved sheet closed across duplicated normal and UV seams', () => {
  const input = makeGeometry([0, 1, 2, 0, 2, 3]);
  let disposed = 0;
  input.addEventListener('dispose', () => disposed++);
  const refined = subdivideBendRegions(input, 2.2, .20);
  assert.equal(disposed, 1, 'the consumed input geometry is disposed once');
  assert.equal(refined.userData.tessellation.limited, false);
  const p = refined.attributes.position, n = refined.attributes.normal, uv = refined.attributes.uv;
  assert.equal(p.count, n.count); assert.equal(p.count, uv.count);
  const beforeBend = p.clone();
  for (let i = 0; i < p.count; i++) {
    const firstSide = Math.abs(n.getZ(i) - 1) < 1e-6 && uv.getX(i) === 0 && uv.getY(i) === 0;
    const secondSide = Math.abs(n.getY(i) - 1) < 1e-6 && uv.getX(i) === 1 && uv.getY(i) === 1;
    assert.ok(firstSide || secondSide, 'hard normals and UVs remain on their original side of the seam');
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + .037 * Math.sin(y * 2), y, z - .13 * Math.sin(x * .7) * Math.max(0, z - 2.02) ** 2);
  }
  const key = i => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
  const edges = new Map();
  for (let i = 0; i < refined.index.count; i += 3) {
    const a = refined.index.getX(i), b = refined.index.getX(i + 1), c = refined.index.getX(i + 2);
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const edgeKey = [key(x), key(y)].sort().join('|');
      if (!edges.has(edgeKey)) edges.set(edgeKey, {count: 0, x, y});
      edges.get(edgeKey).count++;
    }
  }
  const cracks = [...edges.values()].filter(edge => edge.count === 1 && !corners.some((a, i) => {
    const b = corners[(i + 1) % corners.length];
    return onSegment(point(beforeBend, edge.x), a, b) && onSegment(point(beforeBend, edge.y), a, b);
  }));
  assert.equal(cracks.length, 0, 'every one-sided edge remains on the original sheet boundary after the bend');
  assert.ok([...edges.values()].every(edge => edge.count <= 2), 'the result has no overlaid faces');
  refined.dispose();
  assert.equal(disposed, 1, 'disposing the result does not redispose its consumed input');
});

test('matching edges in separate trim and body meshes receive matching subdivision stations', () => {
  const meshes = [[0, 1, 2], [0, 2, 3]].map(order => subdivideBendRegions(makeGeometry(order), 2.2, .20));
  const edgeStations = mesh => {
    const p = mesh.attributes.position;
    const values = new Set();
    for (let i = 0; i < p.count; i++) if (onSegment(point(p, i), corners[0], corners[2])) values.add(Math.round(p.getY(i) * 1e6));
    return [...values].sort((a, b) => a - b);
  };
  assert.deepEqual(edgeStations(meshes[0]), edgeStations(meshes[1]));
  assert.ok(edgeStations(meshes[0]).length > 2, 'the shared edge was actually refined');
  for (const mesh of meshes) mesh.dispose();
});
