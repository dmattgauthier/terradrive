import * as CANNON from '../vendor/cannon-es.js';

// Tire suspension contacts against the SAME oriented primitives that collide
// with the chassis. The finite closest-point sweep rounds a tire over exposed
// edges; footprint projections stop at the actual log/stump/board boundary.
// No height is baked into the soil and no infinite support plane is introduced.
const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CELL = 8, EPSILON = 1e-5;

function localDistance(point, shape) {
  const normal = V(), closest = V();
  let distance;
  if (shape.halfExtents) {
    const e = shape.halfExtents;
    closest.set(clamp(point.x, -e.x, e.x), clamp(point.y, -e.y, e.y), clamp(point.z, -e.z, e.z));
    point.vsub(closest, normal); distance = normal.length();
    if (distance > 1e-10) normal.scale(1 / distance, normal);
    else {
      const gaps = [e.x - Math.abs(point.x), e.y - Math.abs(point.y), e.z - Math.abs(point.z)];
      const axis = gaps.indexOf(Math.min(...gaps)), name = ['x', 'y', 'z'][axis];
      normal[name] = point[name] < 0 ? -1 : 1;
      distance = -gaps[axis]; point.addScaledVector(-distance, normal, closest);
    }
  } else {
    // Generated tree/stump cylinders are aligned with local Y in cannon-es.
    const radius = shape.radiusTop ?? shape.radiusBottom ?? .25, half = (shape.height || 8) * .5;
    const radial = Math.hypot(point.x, point.z), dr = radial - radius, dy = Math.abs(point.y) - half;
    const sx = radial > 1e-10 ? point.x / radial : 1, sz = radial > 1e-10 ? point.z / radial : 0;
    const signY = point.y < 0 ? -1 : 1;
    if (dr > 0 || dy > 0) {
      const r = Math.max(0, dr), y = Math.max(0, dy); distance = Math.hypot(r, y);
      normal.set(sx * r / distance, signY * y / distance, sz * r / distance);
    } else if (dr > dy) { distance = dr; normal.set(sx, 0, sz); }
    else { distance = dy; normal.set(0, signY, 0); }
    point.addScaledVector(-distance, normal, closest);
  }
  return { distance, normal, closest };
}

function boundsInterval(origin, direction, extents, radius, low, high) {
  for (const axis of ['x', 'y', 'z']) {
    const extent = extents[axis] + radius, speed = direction[axis];
    if (Math.abs(speed) < 1e-10) { if (Math.abs(origin[axis]) > extent) return null; continue; }
    let a = (-extent - origin[axis]) / speed, b = (extent - origin[axis]) / speed;
    if (a > b) [a, b] = [b, a];
    low = Math.max(low, a); high = Math.min(high, b);
    if (low > high) return null;
  }
  return { low, high };
}

export function castObstacle(body, origin, direction, radius = 0, minimum = 0, maximum = 1) {
  const shape = body.shapes[0];
  if (!shape || maximum < minimum) return null;
  const start = body.pointToLocalFrame(origin), down = body.vectorToLocalFrame(direction);
  const extents = shape.halfExtents || V(shape.radiusTop || .25, (shape.height || 8) * .5, shape.radiusTop || .25);
  const interval = boundsInterval(start, down, extents, radius, minimum, maximum);
  if (!interval) return null;
  let distance = interval.low, result = null;
  // Signed distance is 1-Lipschitz. Advancing by the clearance cannot tunnel
  // through a corner. A bounded final bisection resolves near-tangent contacts.
  for (let iteration = 0; iteration < 40 && distance <= interval.high + EPSILON; iteration++) {
    const point = start.addScaledVector(distance, down), value = localDistance(point, shape);
    const gap = value.distance - radius;
    if (gap <= EPSILON) { result = value; break; }
    distance += Math.max(gap, EPSILON);
  }
  if (!result) return null;
  const normal = body.vectorToWorldFrame(result.normal), point = body.pointToWorldFrame(result.closest);
  // Only the side facing the suspension can support it; sidewalls remain
  // ordinary chassis collisions and never become a phantom horizontal floor.
  if (direction.dot(normal) >= -.20) return null;
  return { distance, point, normal, body, obstacle: body.terraObstacle,
    obstacleId: body.terraObstacle?.id, featureId: body.terraObstacle?.id };
}

export function projectObstacleFootprint(body, point, normal, reach = .45) {
  const origin = point.addScaledVector(reach, normal), direction = normal.scale(-1);
  const hit = castObstacle(body, origin, direction, 0, 0, reach * 2);
  if (!hit || hit.normal.dot(normal) < .20) return null;
  return hit;
}

export function obstaclePointVelocity(hit, point = hit.point) {
  const state = hit?.obstacle?.treeFall;
  if (state) {
    const arm = V(point.x - state.pivot.x, point.y - state.pivot.y, point.z - state.pivot.z);
    return V(state.angularVelocity.x, state.angularVelocity.y, state.angularVelocity.z).cross(arm);
  }
  return hit?.body?.getVelocityAtWorldPoint(point, V()) || V();
}

/** Static trees are indexed once; fallen trunks stay in a small live list.
 * A falling tree updates its pose without reconstructing hundreds of bodies
 * or regenerating the whole spatial index on every 120 Hz physics step. */
export class ObstacleContactIndex {
  constructor() { this.bodies = null; this.cells = new Map(); this.moving = []; this.stats = { candidates: 0, casts: 0 }; }
  setBodies(bodies) {
    if (bodies === this.bodies) return;
    this.bodies = bodies; this.cells.clear(); this.moving.length = 0;
    for (const body of bodies) {
      if (body.terraObstacle?.treeFall) { this.moving.push(body); continue; }
      body.updateAABB();
      const min = body.aabb.lowerBound, max = body.aabb.upperBound;
      for (let x = Math.floor(min.x / CELL); x <= Math.floor(max.x / CELL); x++) {
        for (let z = Math.floor(min.z / CELL); z <= Math.floor(max.z / CELL); z++) {
          const key = `${x}:${z}`; let list = this.cells.get(key);
          if (!list) this.cells.set(key, list = []); list.push(body);
        }
      }
    }
  }
  castSuspension(origin, down, radius, minimum, maximum, footprint = null) {
    const a = origin.addScaledVector(minimum, down), b = origin.addScaledVector(maximum, down);
    const candidates = new Set(this.moving);
    for (let x = Math.floor((Math.min(a.x, b.x) - radius) / CELL); x <= Math.floor((Math.max(a.x, b.x) + radius) / CELL); x++) {
      for (let z = Math.floor((Math.min(a.z, b.z) - radius) / CELL); z <= Math.floor((Math.max(a.z, b.z) + radius) / CELL); z++) {
        for (const body of this.cells.get(`${x}:${z}`) || []) candidates.add(body);
      }
    }
    this.stats.candidates += candidates.size;
    let best = null;
    for (const body of candidates) {
      this.stats.casts++;
      const hit = castObstacle(body, origin, down, radius, minimum, best?.distance ?? maximum);
      if (!hit) continue;
      if (footprint?.axle) {
        const center = origin.addScaledVector(hit.distance, down), offset = hit.point.vsub(center);
        // A suspension sphere is a rolling-plane approximation, not permission
        // for a tire to bear on a stump beyond its real tread/sidewall width.
        if (Math.abs(offset.dot(footprint.axle)) > footprint.halfWidth + .008) continue;
      }
      if (!best || hit.distance < best.distance) best = hit;
    }
    return best;
  }
}
