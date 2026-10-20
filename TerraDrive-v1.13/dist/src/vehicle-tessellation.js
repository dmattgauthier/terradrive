import * as THREE from '../vendor/three.module.js';

/**
 * Refine edges before a nonlinear body bend without opening T-junction cracks.
 * A geometric edge receives the same split on every incident face, including
 * duplicated vertices at a normal/UV seam. Attribute midpoints stay per-index,
 * so hard edges and texture seams are not welded together.
 *
 * The input geometry is consumed and disposed, matching the model helpers'
 * existing contract. A size limit stops only at a complete, conforming pass.
 */
export function subdivideBendRegions(geometry, start, maxEdge = .12) {
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) throw new RangeError('A positive finite model tessellation edge length is required');
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const attributes = geometry.attributes;
  const copy = (attribute, size, fallback = 0) => {
    if (!attribute) return Array(attributes.position.count * size).fill(fallback);
    if (!attribute.isInterleavedBufferAttribute) return Array.from(attribute.array);
    const values = [];
    for (let i = 0; i < attribute.count; i++) {
      values.push(attribute.getX(i), attribute.getY(i));
      if (size === 3) values.push(attribute.getZ(i));
    }
    return values;
  };
  const p = copy(attributes.position, 3), n = copy(attributes.normal, 3), uv = copy(attributes.uv, 2);
  let ids = geometry.index ? Array.from(geometry.index.array) : Array.from({length: attributes.position.count}, (_, i) => i);
  const coordinateIds = new Map(), coordinates = [];
  const coordinateId = i => {
    // Float32 authoring coordinates that coincide to a tenth of a micron are
    // the same boundary. This only identifies edges; it never snaps vertices.
    const key = `${Math.round(p[i * 3] * 1e7)},${Math.round(p[i * 3 + 1] * 1e7)},${Math.round(p[i * 3 + 2] * 1e7)}`;
    if (!coordinateIds.has(key)) coordinateIds.set(key, coordinateIds.size);
    return coordinateIds.get(key);
  };
  for (let i = 0; i < p.length / 3; i++) coordinates.push(coordinateId(i));
  const edgeKey = (a, b) => {
    const x = coordinates[a], y = coordinates[b];
    return x < y ? `${x}:${y}` : `${y}:${x}`;
  };
  const indexKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const length2 = (a, b) => (p[a * 3] - p[b * 3]) ** 2 + (p[a * 3 + 1] - p[b * 3 + 1]) ** 2 + (p[a * 3 + 2] - p[b * 3 + 2]) ** 2;
  const selected = (a, b) => Math.max(p[a * 3 + 2], p[b * 3 + 2]) > start - .18 || Math.min(p[a * 3 + 2], p[b * 3 + 2]) < -start + .18;
  const threshold = maxEdge * maxEdge * (1 + 1e-12), maxVertices = 750000, maxIndices = 4500000, maxPasses = 20;
  let passes = 0, limited = false;
  for (; passes < maxPasses; passes++) {
    const marked = new Set();
    for (let i = 0; i < ids.length; i += 3) {
      const a = ids[i], b = ids[i + 1], c = ids[i + 2];
      for (const [x, y] of [[a, b], [b, c], [c, a]]) if (selected(x, y) && length2(x, y) > threshold) marked.add(edgeKey(x, y));
    }
    if (!marked.size) break;
    // Count the full pass before mutating anything. Abandoning a split in the
    // middle of a pass would reintroduce the very cracks this helper prevents.
    const newEdges = new Set();
    let nextIndexCount = 0;
    for (let i = 0; i < ids.length; i += 3) {
      const a = ids[i], b = ids[i + 1], c = ids[i + 2];
      let splits = 0;
      for (const [x, y] of [[a, b], [b, c], [c, a]]) if (marked.has(edgeKey(x, y))) { splits++; newEdges.add(indexKey(x, y)); }
      nextIndexCount += (splits + 1) * 3;
    }
    if (p.length / 3 + newEdges.size > maxVertices || nextIndexCount > maxIndices) { limited = true; break; }
    const mids = new Map(), next = [];
    const midpoint = (a, b) => {
      const key = indexKey(a, b);
      if (mids.has(key)) return mids.get(key);
      const i = p.length / 3;
      for (let k = 0; k < 3; k++) { p.push((p[a * 3 + k] + p[b * 3 + k]) * .5); n.push((n[a * 3 + k] + n[b * 3 + k]) * .5); }
      const magnitude = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1;
      for (let k = 0; k < 3; k++) n[i * 3 + k] /= magnitude;
      uv.push((uv[a * 2] + uv[b * 2]) * .5, (uv[a * 2 + 1] + uv[b * 2 + 1]) * .5);
      coordinates.push(coordinateId(i)); mids.set(key, i); return i;
    };
    for (let i = 0; i < ids.length; i += 3) {
      const a = ids[i], b = ids[i + 1], c = ids[i + 2];
      const ab = marked.has(edgeKey(a, b)), bc = marked.has(edgeKey(b, c)), ca = marked.has(edgeKey(c, a));
      const m = ab ? midpoint(a, b) : -1, q = bc ? midpoint(b, c) : -1, r = ca ? midpoint(c, a) : -1;
      switch ((ab ? 1 : 0) | (bc ? 2 : 0) | (ca ? 4 : 0)) {
        case 0: next.push(a, b, c); break;
        case 1: next.push(a, m, c, m, b, c); break;
        case 2: next.push(b, q, a, q, c, a); break;
        case 4: next.push(c, r, b, r, a, b); break;
        case 3: next.push(b, q, m, a, m, c, m, q, c); break;
        case 6: next.push(c, r, q, b, q, a, q, r, a); break;
        case 5: next.push(a, m, r, c, r, b, r, m, b); break;
        case 7: next.push(a, m, r, m, b, q, r, q, c, m, q, r); break;
      }
    }
    ids = next;
  }
  if (passes === maxPasses) limited = true;
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  result.setIndex(ids);
  result.userData = { ...geometry.userData, tessellation: { passes, limited, maxEdge } };
  geometry.dispose();
  return result;
}
