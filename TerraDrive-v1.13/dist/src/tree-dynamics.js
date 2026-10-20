// A broken pine is a rigid body rotating about the remaining stump fibers.
// Gravity and contact impulses act through its inertia; this is not a timed
// interpolation to a preselected horizontal pose. Species/material numbers
// below are bounded game estimates, documented in docs/tree-dynamics-v1.13/.
const G = 9.81;
const FIXED_STEP = 1 / 120;
const MAX_FRAME_TIME = .1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const vector = (value, fallback = {}) => ({ x: finite(value?.x, fallback.x || 0), y: finite(value?.y, fallback.y || 0), z: finite(value?.z, fallback.z || 0) });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
function normalize(value, fallback = { x: 0, y: 1, z: 0 }) {
  const v = vector(value), length = Math.hypot(v.x, v.y, v.z);
  return length > 1e-9 ? { x: v.x / length, y: v.y / length, z: v.z / length } : { ...fallback };
}
function normalizedQuaternion(value) {
  const q = { ...vector(value), w: finite(value?.w, 1) }, length = Math.hypot(q.x, q.y, q.z, q.w);
  return length > 1e-9 ? { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length } : { x: 0, y: 0, z: 0, w: 1 };
}
function rotate(q, v) {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return { x: ix * q.w - iw * q.x - iy * q.z + iz * q.y,
    y: iy * q.w - iw * q.y - iz * q.x + ix * q.z,
    z: iz * q.w - iw * q.z - ix * q.y + iy * q.x };
}
function quaternionAt(state, angle) {
  const sine = Math.sin(angle / 2), cosine = Math.cos(angle / 2);
  const a = state.axis, b = state.initialQuaternion;
  return { x: a.x * sine * b.w + cosine * b.x + a.y * sine * b.z - a.z * sine * b.y,
    y: a.y * sine * b.w + cosine * b.y + a.z * sine * b.x - a.x * sine * b.z,
    z: a.z * sine * b.w + cosine * b.z + a.x * sine * b.y - a.y * sine * b.x,
    w: cosine * b.w - sine * (a.x * b.x + a.y * b.y + a.z * b.z) };
}

export const TREE_FALL_LIMITS = Object.freeze({ fixedStep: FIXED_STEP, maxFrameTime: MAX_FRAME_TIME,
  maxSteps: 12, maximumAngularSpeed: 4, contactSpacing: .45, maximumSections: 42 });

/** Tapered trunk + distributed crown mass, integrated once when a tree breaks. */
function massProperties(length, radius, requestedMass) {
  // The modeled trunk tapers to one quarter of its cut radius. Crown/bough
  // mass is spread along the upper half, rather than concentrated at its tip.
  let trunkMass = 0, firstMoment = 0, secondMoment = 0;
  for (let i = 0; i < 32; i++) {
    const t = (i + .5) / 32, r = radius * (1 - .75 * t), distance = t * length;
    const mass = Math.PI * r * r * length / 32 * 650;
    trunkMass += mass; firstMoment += mass * distance;
    secondMoment += mass * (distance * distance + r * r / 4);
  }
  const crownMass = trunkMass * .18, mass = trunkMass + crownMass;
  const crownCenter = length * .66, crownVariance = Math.pow(length * .34, 2) / 12;
  firstMoment += crownMass * crownCenter;
  secondMoment += crownMass * (crownCenter * crownCenter + crownVariance);
  const actualMass = Number.isFinite(requestedMass) ? clamp(requestedMass, 40, 6000) : mass;
  return { mass: actualMass, centerOfMassDistance: firstMoment / mass, inertia: secondMoment * actualMass / mass };
}

/**
 * Initial pose is the already visible upper trunk. `pivot` is its cut root,
 * `quaternion` its current world orientation, and `push` the incoming impact
 * direction. The returned plain object is shared by renderer and physics.
 */
export function createTreeFall({ pivot, quaternion, push, length = 12, radius = .25, mass,
  impact, angularSpeed, damping = .11, restitution = .10 } = {}) {
  length = clamp(finite(length, 12), 2, 24); radius = clamp(finite(radius, .25), .08, .7);
  const initialQuaternion = normalizedQuaternion(quaternion), initialUp = rotate(initialQuaternion, { x: 0, y: 1, z: 0 });
  const forward = normalize({ x: push?.x, y: 0, z: push?.z }, { x: 0, y: 0, z: 1 });
  const axis = normalize(cross(initialUp, forward), { x: forward.z, y: 0, z: -forward.x });
  const properties = massProperties(length, radius, mass);
  const state = { pivot: vector(pivot), initialQuaternion, initialUp, axis, push: forward, length, radius,
    ...properties, angle: 0, angularSpeed: 0, damping: clamp(finite(damping, .11), 0, 4), restitution: clamp(finite(restitution, .10), 0, .4),
    time: 0, accumulator: 0, revision: 0, settled: false, settlingAge: 0, contactCount: 0,
    contactAngle: null, contactDirection: 0, lastContact: null, lastImpactSpeed: 0, _clearance: null, _restCheck: 0,
    center: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 }, tip: { x: 0, y: 0, z: 0 } };
  if (Number.isFinite(angularSpeed)) state.angularSpeed = clamp(angularSpeed, -4, 4);
  else {
    // The impact energy already includes crushing/breakage. Only a small
    // estimated part of its normal impulse remains as upper-trunk rotation.
    const momentum = 2 * Math.max(0, finite(impact?.energy)) / Math.max(1, finite(impact?.speed, 1));
    const point = vector(impact?.point, { x: state.pivot.x, y: state.pivot.y + .4, z: state.pivot.z });
    const arm = { x: point.x - state.pivot.x, y: point.y - state.pivot.y, z: point.z - state.pivot.z };
    const impulse = { x: forward.x * momentum * .20, y: 0, z: forward.z * momentum * .20 };
    const transferredSpeed = dot(axis, cross(arm, impulse)) / state.inertia;
    // A tiny release motion gets a nearly vertical broken tree beyond its
    // original lean, including an initial lean opposite to the impact. It
    // changes velocity only; the visible tree never jumps to an artificial tilt.
    const tangentY = cross(axis, initialUp).y;
    const climb = tangentY > 0 ? Math.max(0, Math.hypot(initialUp.y, tangentY) - initialUp.y) : 0;
    const escapeSpeed = Math.sqrt(2 * state.mass * G * state.centerOfMassDistance * climb / state.inertia) + .055;
    state.angularSpeed = clamp(Math.max(escapeSpeed, transferredSpeed), .055, .70);
  }
  updatePose(state);
  return state;
}

function updatePose(state) {
  Object.assign(state.quaternion, quaternionAt(state, state.angle));
  Object.assign(state.direction, rotate(state.quaternion, { x: 0, y: 1, z: 0 }));
  const p = state.pivot, d = state.direction, half = state.length * .5;
  Object.assign(state.center, { x: p.x + d.x * half, y: p.y + d.y * half, z: p.z + d.z * half });
  Object.assign(state.tip, { x: p.x + d.x * state.length, y: p.y + d.y * state.length, z: p.z + d.z * state.length });
  Object.assign(state.angularVelocity, { x: state.axis.x * state.angularSpeed, y: state.axis.y * state.angularSpeed, z: state.axis.z * state.angularSpeed });
  const tangent = cross(state.axis, d), speed = half * state.angularSpeed;
  Object.assign(state.velocity, { x: tangent.x * speed, y: tangent.y * speed, z: tangent.z * speed });
}

function clearanceAt(state, angle, heightAt) {
  const q = quaternionAt(state, angle), up = rotate(q, { x: 0, y: 1, z: 0 });
  const across = rotate(q, { x: state.radius, y: 0, z: 0 }), side = rotate(q, { x: 0, y: 0, z: state.radius });
  const sections = Math.min(TREE_FALL_LIMITS.maximumSections, Math.max(8, Math.ceil(state.length / TREE_FALL_LIMITS.contactSpacing)));
  let clearance = Infinity, point = null, distance = 0, closestSection = 0;
  // Match the conservative square trunk contact envelope used by the live
  // collider. Its four corners and middle are sampled along the whole trunk,
  // so a middle boulder can stop the fall before either end reaches the soil.
  for (let section = 0; section <= sections; section++) {
    const along = state.length * section / sections;
    const cx = state.pivot.x + up.x * along, cy = state.pivot.y + up.y * along, cz = state.pivot.z + up.z * along;
    for (let sample = 0; sample < 5; sample++) {
      const u = sample === 0 ? 0 : sample <= 2 ? -1 : 1;
      const v = sample === 0 ? 0 : sample % 2 ? -1 : 1;
      const x = cx + across.x * u + side.x * v, y = cy + across.y * u + side.y * v, z = cz + across.z * u + side.z * v;
      const ground = finite(heightAt(x, z), -1e6), gap = y - ground;
      if (gap < clearance) { clearance = gap; point = { x, y: ground, z }; distance = along; closestSection = section; }
    }
  }
  if (clearance < .30 && closestSection > 0 && closestSection < sections) {
    // A coarse node on either side of a rounded rock misses its actual crest.
    // Refine the nearest longitudinal interval before deciding contact, while
    // retaining a bounded number of terrain samples and no cached final pose.
    const begin = state.length * (closestSection - 1) / sections;
    const end = state.length * (closestSection + 1) / sections;
    for (let sample = 0; sample < 5; sample++) {
      const u = sample === 0 ? 0 : sample <= 2 ? -1 : 1, v = sample === 0 ? 0 : sample % 2 ? -1 : 1;
      const evaluate = along => {
        const x = state.pivot.x + up.x * along + across.x * u + side.x * v;
        const y = state.pivot.y + up.y * along + across.y * u + side.y * v;
        const z = state.pivot.z + up.z * along + across.z * u + side.z * v;
        const ground = finite(heightAt(x, z), -1e6), gap = y - ground;
        if (gap < clearance) { clearance = gap; point = { x, y: ground, z }; distance = along; }
        return gap;
      };
      let low = begin, high = end, left = high - (high - low) * .61803398875, right = low + (high - low) * .61803398875;
      let leftGap = evaluate(left), rightGap = evaluate(right);
      for (let i = 0; i < 20; i++) {
        if (leftGap < rightGap) { high = right; right = left; rightGap = leftGap; left = high - (high - low) * .61803398875; leftGap = evaluate(left); }
        else { low = left; left = right; leftGap = rightGap; right = low + (high - low) * .61803398875; rightGap = evaluate(right); }
      }
    }
  }
  return { clearance, point, distance };
}

function gravityAcceleration(state, angle) {
  const direction = rotate(quaternionAt(state, angle), { x: 0, y: 1, z: 0 });
  return -state.mass * G * state.centerOfMassDistance / state.inertia * cross(state.axis, direction).y;
}

/** Constrained inverse mass for one unit normal impulse at a world point. */
export function treeContactInverseMass(state, point, normal) {
  if (!state || !point || !normal) return 0;
  const arm = { x: point.x - state.pivot.x, y: point.y - state.pivot.y, z: point.z - state.pivot.z };
  const lever = dot(state.axis, cross(arm, normal));
  return Number.isFinite(lever) ? lever * lever / state.inertia : 0;
}

/**
 * Apply hinge momentum after a coupled solver has summed its contact impulses.
 * With constrained=true that solver has already accounted for the ground's
 * unilateral support; preserve its aggregate exactly except the numerical cap.
 */
export function applyTreeAngularImpulse(state, angularImpulse, { constrained = false } = {}) {
  if (!state) return 0;
  const change = angularImpulse / state.inertia;
  if (!Number.isFinite(change) || Math.abs(change) < 1e-12) return 0;
  // A landed trunk is supported by the earth. Downward tire loads are carried
  // through that support; they must not restart an endless restitution bounce.
  // An opposing impulse can still lift the log and release the ground contact.
  if (!constrained && state.settled && change * state.contactDirection > 0) return 0;
  const before = state.angularSpeed;
  state.angularSpeed = clamp(before + change, -TREE_FALL_LIMITS.maximumAngularSpeed, TREE_FALL_LIMITS.maximumAngularSpeed);
  if (Math.abs(state.angularSpeed) > 1e-12) { state.settled = false; state.settlingAge = 0; }
  updatePose(state);
  return state.angularSpeed - before;
}

/** Apply an actual external point impulse; renderer code must never call this. */
export function applyTreeImpulse(state, point, impulse) {
  if (!state || !point || !impulse) return 0;
  const arm = { x: point.x - state.pivot.x, y: point.y - state.pivot.y, z: point.z - state.pivot.z };
  return applyTreeAngularImpulse(state, dot(state.axis, cross(arm, impulse)));
}

/**
 * Advance before vehicle contact collection. The fixed hinge is the explicit
 * approximation: residual stump fibers stay attached after landing. Ground
 * contact uses the current physical terrain, never a precomputed end height.
 */
export function stepTreeFall(state, dt, heightAt) {
  if (!state || typeof heightAt !== 'function' || !Number.isFinite(dt) || dt <= 0) return false;
  state.accumulator = Math.min(MAX_FRAME_TIME + FIXED_STEP, state.accumulator + Math.min(dt, MAX_FRAME_TIME));
  let changed = false, steps = 0;
  while (state.accumulator + 1e-12 >= FIXED_STEP && steps++ < TREE_FALL_LIMITS.maxSteps) {
    state.accumulator = Math.max(0, state.accumulator - FIXED_STEP); state.time += FIXED_STEP;
    if (state.settled) {
      state._restCheck += FIXED_STEP;
      if (state._restCheck < .25) continue;
      state._restCheck = 0;
      const resting = clearanceAt(state, state.angle, heightAt);
      state._clearance = resting.clearance;
      if (resting.clearance <= .012) continue;
      // Removing support beneath an old log lets gravity act again.
      state.settled = false;
    }
    const oldAngle = state.angle;
    const halfDamping = Math.exp(-state.damping * FIXED_STEP * .5);
    const halfSpeed = state.angularSpeed * halfDamping + gravityAcceleration(state, oldAngle) * FIXED_STEP * .5;
    const nextAngle = oldAngle + halfSpeed * FIXED_STEP;
    let nextSpeed = (halfSpeed + gravityAcceleration(state, nextAngle) * FIXED_STEP * .5) * halfDamping;
    const contact = clearanceAt(state, nextAngle, heightAt);
    if (contact.clearance < 0) {
      const previous = state._clearance ?? clearanceAt(state, oldAngle, heightAt).clearance;
      if (previous >= -1e-7) {
        // Bisect the swept angular interval to the actual first contact. No
        // translation or terrain-wide lift is introduced at the collision.
        let low = oldAngle, high = nextAngle, touch = contact;
        for (let iteration = 0; iteration < 15; iteration++) {
          const middle = (low + high) * .5, trial = clearanceAt(state, middle, heightAt);
          if (trial.clearance >= 0) low = middle;
          else { high = middle; touch = trial; }
        }
        state.angle = low;
        state._clearance = Math.max(0, clearanceAt(state, low, heightAt).clearance);
        state.contactAngle = low; state.contactDirection = Math.sign(nextAngle - oldAngle); state.lastContact = touch.point;
        state.lastImpactSpeed = Math.abs(nextSpeed) * touch.distance;
        state.contactCount++;
        nextSpeed *= -state.restitution;
        if (Math.abs(nextSpeed) * state.length < .065) { nextSpeed = 0; state.settled = true; }
      } else {
        // Terrain can change under an existing log. Do not drive farther into
        // newly raised ground; preserve the last finite pose and dissipate the
        // attempted inward motion instead of teleporting its root elsewhere.
        state.angle = oldAngle; nextSpeed = 0; state.settled = true;
      }
    } else { state.angle = nextAngle; state._clearance = contact.clearance; }
    state.angularSpeed = clamp(nextSpeed, -TREE_FALL_LIMITS.maximumAngularSpeed, TREE_FALL_LIMITS.maximumAngularSpeed);
    if (state.angle !== oldAngle) { state.revision++; changed = true; }
  }
  updatePose(state);
  return changed;
}

/** Copy shared state into the existing obstacle without rebuilding the forest. */
export function syncTreeObstacle(obstacle) {
  const state = obstacle?.treeFall; if (!state) return false;
  obstacle.center ||= {}; obstacle.quaternion ||= {}; obstacle.velocity ||= {}; obstacle.angularVelocity ||= {};
  Object.assign(obstacle.center, state.center); Object.assign(obstacle.quaternion, state.quaternion);
  Object.assign(obstacle.velocity, state.velocity); Object.assign(obstacle.angularVelocity, state.angularVelocity);
  obstacle.x = state.center.x; obstacle.z = state.center.z;
  obstacle.mass = state.mass; obstacle.poseRevision = state.revision; obstacle.moving = !state.settled;
  return true;
}
