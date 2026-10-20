import * as THREE from '../vendor/three.module.js';

/** One-way collision for visual tire ejecta, against the selected vehicle's
 * actual exterior/underbody triangles. This is deliberately separate from the
 * chassis dynamics collider: wheel openings are not filled by a coarse box.
 * The hierarchy is built once per model and refitted only after body damage.
 */
const EPS = 1e-8;
const point = p => new THREE.Vector3(p.x, p.y, p.z);
const copyPose = state => ({
  position: point(state.position || { x: 0, y: 0, z: 0 }),
  quaternion: new THREE.Quaternion(state.quaternion?.x || 0, state.quaternion?.y || 0,
    state.quaternion?.z || 0, state.quaternion?.w ?? 1).normalize(),
});

// Segment against an expanded box. A miss here avoids all triangle work.
function boxEntry(start, delta, bounds, radius, limit = 1) {
  let low = 0, high = limit;
  for (let axis = 0; axis < 3; axis++) {
    const s = start[axis], d = delta[axis], lo = bounds[axis] - radius, hi = bounds[axis + 3] + radius;
    if (Math.abs(d) < EPS) { if (s < lo || s > hi) return Infinity; continue; }
    let a = (lo - s) / d, b = (hi - s) / d;
    if (a > b) [a, b] = [b, a];
    low = Math.max(low, a); high = Math.min(high, b);
    if (low > high) return Infinity;
  }
  return low;
}

function firstRoot(a, b, c, limit) {
  if (c <= 0) return 0;
  if (a < EPS || b >= 0) return Infinity;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= limit ? t : Infinity;
}

/** Earliest sphere/triangle contact: faces, finite edges and vertices. All
 * faces are two-sided, including wheel-arch liners viewed from underneath.
 */
function sweepTriangle(start, delta, radius, triangle, limit) {
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangle;
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz); if (nl < EPS) return null;
  nx /= nl; ny /= nl; nz /= nl;
  const sx = start[0], sy = start[1], sz = start[2], dx = delta[0], dy = delta[1], dz = delta[2];
  const plane = (sx - ax) * nx + (sy - ay) * ny + (sz - az) * nz;
  const motion = dx * nx + dy * ny + dz * nz;
  let best = limit, result = null;
  const accept = (t, px, py, pz, hnX, hnY, hnZ) => {
    if (t < -EPS || t > best || dx * hnX + dy * hnY + dz * hnZ >= -EPS) return;
    best = Math.max(0, t); result = { fraction: best, point: [px, py, pz], normal: [hnX, hnY, hnZ] };
  };
  // The plane projection must lie inside the actual triangle, not its box.
  const uu = ux * ux + uy * uy + uz * uz, uv = ux * vx + uy * vy + uz * vz, vv = vx * vx + vy * vy + vz * vz;
  const determinant = uu * vv - uv * uv;
  if (Math.abs(motion) > EPS && determinant > EPS * EPS) {
    const side = Math.abs(plane) > EPS ? Math.sign(plane) : -Math.sign(motion);
    const t = Math.abs(plane) <= radius ? 0 : (side * radius - plane) / motion;
    if (t >= -EPS && t <= best) {
      const distance = plane + motion * t;
      const px = sx + dx * t - nx * distance, py = sy + dy * t - ny * distance, pz = sz + dz * t - nz * distance;
      const wx = px - ax, wy = py - ay, wz = pz - az;
      const wu = wx * ux + wy * uy + wz * uz, wv = wx * vx + wy * vy + wz * vz;
      const b = (wu * vv - wv * uv) / determinant, c = (wv * uu - wu * uv) / determinant;
      if (b >= -EPS && c >= -EPS && b + c <= 1 + EPS) accept(t, px, py, pz, nx * side, ny * side, nz * side);
    }
  }
  if (radius <= 0) return result;
  const r2 = radius * radius;
  for (let edge = 0; edge < 3; edge++) {
    const ia = edge * 3, ib = ((edge + 1) % 3) * 3;
    const ex = triangle[ia], ey = triangle[ia + 1], ez = triangle[ia + 2];
    const fx = triangle[ib] - ex, fy = triangle[ib + 1] - ey, fz = triangle[ib + 2] - ez;
    const wx = sx - ex, wy = sy - ey, wz = sz - ez;
    // Finite cylinder around the edge, with the endpoint spheres below.
    const length2 = fx * fx + fy * fy + fz * fz;
    if (length2 > EPS * EPS) {
      const wd = (wx * fx + wy * fy + wz * fz) / length2, dd = (dx * fx + dy * fy + dz * fz) / length2;
      const qx = wx - fx * wd, qy = wy - fy * wd, qz = wz - fz * wd;
      const rx = dx - fx * dd, ry = dy - fy * dd, rz = dz - fz * dd;
      const t = firstRoot(rx * rx + ry * ry + rz * rz, 2 * (qx * rx + qy * ry + qz * rz), qx * qx + qy * qy + qz * qz - r2, best);
      const along = wd + dd * t;
      if (t <= best && along >= 0 && along <= 1) {
        const px = ex + fx * along, py = ey + fy * along, pz = ez + fz * along;
        const hnX = sx + dx * t - px, hnY = sy + dy * t - py, hnZ = sz + dz * t - pz;
        const length = Math.hypot(hnX, hnY, hnZ);
        if (length > EPS) accept(t, px, py, pz, hnX / length, hnY / length, hnZ / length);
      }
    }
    const t = firstRoot(dx * dx + dy * dy + dz * dz, 2 * (wx * dx + wy * dy + wz * dz), wx * wx + wy * wy + wz * wz - r2, best);
    if (t <= best) {
      const hnX = wx + dx * t, hnY = wy + dy * t, hnZ = wz + dz * t;
      const length = Math.hypot(hnX, hnY, hnZ);
      if (length > EPS) accept(t, ex, ey, ez, hnX / length, hnY / length, hnZ / length);
    }
  }
  return result;
}

/** Public small geometry kernel also used for isolated collision verification.
 * Triangle vertices are packed xyz/xyz/xyz; the hierarchy never modifies them.
 */
export class ParticleTriangleHierarchy {
  constructor(vertices = []) {
    this.vertices = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
    this.triangleCount = Math.floor(this.vertices.length / 9);
    this.order = Int32Array.from({ length: this.triangleCount }, (_, i) => i);
    this.bounds = new Float32Array(this.triangleCount * 6);
    this.nodes = []; this.metrics = { sweeps: 0, nodes: 0, triangles: 0 };
    this._refreshBounds(); if (this.triangleCount) this._build(0, this.triangleCount);
  }

  _refreshBounds() {
    for (let i = 0; i < this.triangleCount; i++) for (let axis = 0; axis < 3; axis++) {
      const p = i * 9 + axis;
      this.bounds[i * 6 + axis] = Math.min(this.vertices[p], this.vertices[p + 3], this.vertices[p + 6]);
      this.bounds[i * 6 + axis + 3] = Math.max(this.vertices[p], this.vertices[p + 3], this.vertices[p + 6]);
    }
  }

  _rangeBounds(start, end) {
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const offset = this.order[i] * 6;
      for (let axis = 0; axis < 3; axis++) { bounds[axis] = Math.min(bounds[axis], this.bounds[offset + axis]); bounds[axis + 3] = Math.max(bounds[axis + 3], this.bounds[offset + axis + 3]); }
    }
    return bounds;
  }

  _build(start, end, depth = 0) {
    const index = this.nodes.length, bounds = this._rangeBounds(start, end);
    const node = { bounds, start, count: end - start, left: -1, right: -1 }; this.nodes.push(node);
    if (end - start <= 12 || depth >= 24) return index;
    const axis = bounds[3] - bounds[0] > bounds[4] - bounds[1] ? (bounds[3] - bounds[0] > bounds[5] - bounds[2] ? 0 : 2) : (bounds[4] - bounds[1] > bounds[5] - bounds[2] ? 1 : 2);
    const center = bounds[axis] + bounds[axis + 3];
    let middle = start;
    for (let i = start; i < end; i++) {
      const offset = this.order[i] * 6;
      if (this.bounds[offset + axis] + this.bounds[offset + axis + 3] < center) {
        const old = this.order[middle]; this.order[middle++] = this.order[i]; this.order[i] = old;
      }
    }
    if (middle === start || middle === end) middle = (start + end) >>> 1;
    node.left = this._build(start, middle, depth + 1); node.right = this._build(middle, end, depth + 1);
    return index;
  }

  /** Positions can deform while vertex/triangle identity and mark anchors stay
   * stable. Refit is O(triangles + nodes), without repartitioning or new buffers.
   */
  refit() {
    this._refreshBounds();
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (node.left < 0) node.bounds = this._rangeBounds(node.start, node.start + node.count);
      else for (let axis = 0; axis < 3; axis++) {
        node.bounds[axis] = Math.min(this.nodes[node.left].bounds[axis], this.nodes[node.right].bounds[axis]);
        node.bounds[axis + 3] = Math.max(this.nodes[node.left].bounds[axis + 3], this.nodes[node.right].bounds[axis + 3]);
      }
    }
  }

  sweep(start, end, radius = 0) {
    if (!this.nodes.length) return null;
    const a = Array.isArray(start) ? start : [start.x, start.y, start.z];
    const b = Array.isArray(end) ? end : [end.x, end.y, end.z];
    const delta = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    if (delta.every(d => Math.abs(d) < EPS)) return null;
    let best = 1, result = null;
    this.metrics.sweeps++;
    const stack = [0];
    while (stack.length) {
      const node = this.nodes[stack.pop()]; this.metrics.nodes++;
      if (boxEntry(a, delta, node.bounds, radius, best) === Infinity) continue;
      if (node.left >= 0) { stack.push(node.left, node.right); continue; }
      for (let i = node.start; i < node.start + node.count; i++) {
        const id = this.order[i];
        if (boxEntry(a, delta, this.bounds.subarray(id * 6, id * 6 + 6), radius, best) === Infinity) continue;
        this.metrics.triangles++;
        const hit = sweepTriangle(a, delta, radius, this.vertices.subarray(id * 9, id * 9 + 9), best);
        if (hit && hit.fraction <= best) { result = { ...hit, triangleId: id }; best = hit.fraction; }
      }
    }
    return result;
  }

  /** Small bounded neighborhood for a splat clipped onto actual panel faces. */
  near(point, radius, limit = 256) {
    if (!this.nodes.length) return [];
    const center = [point.x, point.y, point.z], r2 = radius * radius, candidates = [];
    const distance2 = bounds => {
      let d = 0; for (let axis = 0; axis < 3; axis++) {
        const gap = Math.max(bounds[axis] - center[axis], 0, center[axis] - bounds[axis + 3]); d += gap * gap;
      }
      return d;
    };
    const stack = [0];
    while (stack.length) {
      const node = this.nodes[stack.pop()]; if (distance2(node.bounds) > r2) continue;
      if (node.left >= 0) { stack.push(node.left, node.right); continue; }
      for (let i = node.start; i < node.start + node.count; i++) {
        const id = this.order[i], bounds = this.bounds.subarray(id * 6, id * 6 + 6), d = distance2(bounds);
        if (d <= r2) candidates.push({ id, distance: d });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.id - b.id);
    return candidates.slice(0, limit).map(candidate => candidate.id);
  }
}

export class VehicleSprayCollider {
  constructor(vehicle) {
    this.vehicle = vehicle; this.entries = []; this.previous = null; this.current = null;
    this.damageRevision = vehicle.damageView?.revision; this.refits = 0;
    this.damageSignature = vehicle.damageView && 'lastProfile' in vehicle.damageView ? JSON.stringify(vehicle.damageView.lastProfile?.dents || []) : null;
    const root = vehicle.root, body = vehicle.body;
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert(), vertex = new THREE.Vector3();
    let count = 0;
    body.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || !object.visible || !object.geometry?.attributes.position) return;
      const material = object.material;
      if (Array.isArray(material) || material?.userData?.vehicleInterior) return;
      // Scuffs, wet marks and cracks are visual overlays, not extra collision
      // surfaces. The separate road wheels intentionally never enter this tree.
      for (let parent = object; parent && parent !== body; parent = parent.parent) {
        if (parent.name === 'permanent-impact-scuffs' || parent.userData?.tireImpactOverlay) return;
      }
      const geometry = object.geometry, indices = geometry.index?.array;
      const size = Math.floor((indices?.length || geometry.attributes.position.count) / 3);
      this.entries.push({ mesh: object, geometry, matrix: inverse.clone().multiply(object.matrixWorld), start: count, count: size }); count += size;
    });
    this.vertices = new Float32Array(count * 9);
    for (const entry of this.entries) this._writeEntry(entry, vertex);
    this.hierarchy = new ParticleTriangleHierarchy(this.vertices);
    this.triangleCount = count;
  }

  _writeEntry(entry, vertex = new THREE.Vector3()) {
    const positions = entry.geometry.attributes.position, indices = entry.geometry.index?.array;
    for (let i = 0; i < entry.count * 3; i++) {
      vertex.fromBufferAttribute(positions, indices ? indices[i] : i).applyMatrix4(entry.matrix);
      const j = entry.start * 9 + i * 3; this.vertices[j] = vertex.x; this.vertices[j + 1] = vertex.y; this.vertices[j + 2] = vertex.z;
    }
  }

  reset() { this.previous = this.current = null; }

  beginFrame(state, dt) {
    if (!state.position) return false;
    const next = copyPose(state);
    const displaced = this.current && this.current.position.distanceTo(next.position) > Math.max(6, Math.hypot(state.velocity?.x || 0, state.velocity?.y || 0, state.velocity?.z || 0) * dt * 3 + 1);
    const reset = !this.current || displaced || state.simTime < this.simTime;
    this.previous = reset ? next : this.current; this.current = next;
    this.dt = dt; this.simTime = state.simTime;
    this.velocity = point(state.velocity || { x: 0, y: 0, z: 0 });
    this.angularVelocity = point(state.angularVelocity || { x: 0, y: 0, z: 0 });
    this.angle = this.previous.quaternion.angleTo(this.current.quaternion);
    // VehicleView.update has already applied this profile to the live mesh.
    // Tire/engine health can advance a damage revision without changing any
    // panel vertices; only the geometric dent profile requires a full refit.
    const revision = this.vehicle.damageView?.revision ?? state.damage?.revision;
    const signature = this.damageSignature === null ? null : JSON.stringify(this.vehicle.damageView?.lastProfile?.dents || []);
    const changed = signature === null ? revision !== this.damageRevision : signature !== this.damageSignature;
    if (changed) {
      const vertex = new THREE.Vector3(); for (const entry of this.entries) this._writeEntry(entry, vertex);
      this.hierarchy.refit(); this.refits++;
    }
    this.damageRevision = revision; this.damageSignature = signature;
    return reset;
  }

  _pose(fraction) {
    return { position: this.previous.position.clone().lerp(this.current.position, fraction),
      quaternion: this.previous.quaternion.clone().slerp(this.current.quaternion, fraction) };
  }

  /** Fractions locate the segment within the current frame. Translation is
   * exact; angular motion is subdivided and conservatively padded by its
   * chord-error bound, so a moving panel cannot tunnel across a still droplet.
   */
  sweep(from, to, radius = 0, startFraction = 0, endFraction = 1) {
    if (!this.current || !this.hierarchy.nodes.length) return null;
    const start = point(from), end = point(to), duration = Math.max(0, endFraction - startFraction);
    const steps = Math.min(16, Math.max(1, Math.ceil(this.angle * duration / .025)));
    for (let step = 0; step < steps; step++) {
      const u = step / steps, v = (step + 1) / steps;
      const fractionA = startFraction + duration * u, fractionB = startFraction + duration * v;
      const poseA = this._pose(fractionA), poseB = this._pose(fractionB);
      const worldA = start.clone().lerp(end, u), worldB = start.clone().lerp(end, v);
      const relativeA = worldA.clone().sub(poseA.position), relativeB = worldB.clone().sub(poseB.position);
      const theta = poseA.quaternion.angleTo(poseB.quaternion);
      const padding = (2 * theta * relativeA.distanceTo(relativeB) + theta * theta * Math.max(relativeA.length(), relativeB.length())) / 8;
      const a = relativeA.clone().applyQuaternion(poseA.quaternion.clone().conjugate());
      const b = relativeB.clone().applyQuaternion(poseB.quaternion.clone().conjugate());
      const hit = this.hierarchy.sweep(a, b, radius + padding);
      if (!hit) continue;
      const fraction = u + (v - u) * hit.fraction, frameFraction = startFraction + duration * fraction;
      const pose = this._pose(frameFraction), localPoint = new THREE.Vector3(...hit.point), localNormal = new THREE.Vector3(...hit.normal);
      const contact = localPoint.clone().applyQuaternion(pose.quaternion).add(pose.position);
      const normal = localNormal.clone().applyQuaternion(pose.quaternion);
      const surfaceVelocity = this.angularVelocity.clone().cross(contact.clone().sub(pose.position)).add(this.velocity);
      const entry = this.entries.find(e => hit.triangleId >= e.start && hit.triangleId < e.start + e.count);
      return { fraction, frameFraction, point: contact, normal, localPoint, localNormal, surfaceVelocity,
        triangleId: hit.triangleId, mesh: entry?.mesh, padding };
    }
    return null;
  }

  dispose() { this.entries.length = 0; this.vertices = null; this.hierarchy = null; this.vehicle = null; this.reset(); }
}
