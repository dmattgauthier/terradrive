/**
 * Native fork: circular loop. The preserved browser course is not modified.
 * Constructed challenge surfaces in metres, Y up. Rendering, suspension casts
 * and solid chassis colliders share these vertices. There is no path follower,
 * adhesion force, launch impulse or invisible support across a jump gap.
 */
export const CHALLENGE_VERSION = '1.15.0';
export const CHALLENGE_PAD = Object.freeze({ minX: -256, maxX: -142, minZ: -202, maxZ: 168, height: 4.60, shoulder: 12 });
export const CHALLENGE_ZONE = Object.freeze({ id: 'challenge', name: 'Summit Challenge Park', short: 'Challenge', description: 'A long loop run-up, tabletop and gap jumps, and articulation obstacles.', spawn: Object.freeze({ x: -236, z: -169, heading: 0 }), color: '#d0a961' });
export const CHALLENGE_LOOP = Object.freeze({ x: -236, z: 58, y: 4.72, lateralOffset: 14, width: 8.8, height: 40, longitudinalRadius: 20, shoulderHarmonic: 0, segments: 720 });
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (lo, hi, x) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, k) => v(a.x * k, a.y * k, a.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => { const l = length(a); return l > 1e-12 ? mul(a, 1 / l) : v(0, 1, 0); };
const finiteVector = a => a && [a.x, a.y, a.z].every(Number.isFinite);
const rectangleDistance = (x, z, minX, maxX, minZ, maxZ) => Math.hypot(Math.max(minX - x, 0, x - maxX), Math.max(minZ - z, 0, z - maxZ));

/** Pad and entrance masks are shared by the physical ground and its material. */
export function challengeGroundMask(x, z) {
  const p = CHALLENGE_PAD;
  const pad = 1 - smooth(0, p.shoulder, rectangleDistance(x, z, p.minX, p.maxX, p.minZ, p.maxZ));
  const access = (1 - smooth(5, 12, Math.abs(z + 150))) * (1 - smooth(0, 8, Math.max(-151 - x, x + 108, 0)));
  return Math.max(pad, access);
}

export function challengeGroundHeight(x, z, naturalHeight) {
  const mask = challengeGroundMask(x, z);
  if (mask === 0) return naturalHeight;
  // The access strip meets the existing tarmac's 3.675 m grade at x = -108.
  const t = smooth(-151, -108, x), accessHeight = CHALLENGE_PAD.height * (1 - t) + (3.60 + (z + 180) * .0025) * t;
  return naturalHeight + (accessHeight - naturalHeight) * mask;
}

export function challengeGroundCoverAt(x, z) {
  const mask = challengeGroundMask(x, z);
  if (mask <= 0) return null;
  const hardpack = smooth(.38, .93, mask), gravel = (1 - hardpack) * smooth(0, .35, mask);
  return { hardpack, gravel, grass: 1 - hardpack - gravel };
}

export function challengeReservedAt(x, z, margin = 0) {
  const p = CHALLENGE_PAD;
  return rectangleDistance(x, z, p.minX, p.maxX, p.minZ, p.maxZ) <= p.shoulder + Math.max(0, margin)
    || x > -159 - margin && x < -100 + margin && Math.abs(z + 150) < 12 + margin;
}

// Used by the base-ground shader; it deliberately matches the JS masks above.
export const CHALLENGE_GLSL = `
float tdChallengeMask(vec2 p){
  vec2 q=max(max(vec2(-256.,-202.)-p,p-vec2(-142.,168.)),vec2(0.));
  float pad=1.-smoothstep(0.,12.,length(q));
  float access=(1.-smoothstep(5.,12.,abs(p.y+150.)))*(1.-smoothstep(0.,8.,max(max(-151.-p.x,p.x+108.),0.)));
  return max(pad,access);
}
vec3 tdChallengeCover(vec2 p){
  float m=tdChallengeMask(p),h=smoothstep(.38,.93,m),g=(1.-h)*smoothstep(0.,.35,m);
  return vec3(h,g,1.-h-g);
}`;

/** Exact circular side elevation; smooth lateral entry/exit separation. */
export function challengeLoopFrame(theta) {
  const a = clamp(theta, 0, TAU), c = Math.cos(a), s = Math.sin(a), p = CHALLENGE_LOOP;
  const point = v(p.x + p.lateralOffset * (a - s) / TAU, p.y + p.height / 2 * (1 - c), p.z + p.longitudinalRadius * s + p.shoulderHarmonic * Math.sin(a * 2));
  const first = v(p.lateralOffset * (1 - c) / TAU, p.height / 2 * s, p.longitudinalRadius * c + 2 * p.shoulderHarmonic * Math.cos(a * 2));
  const second = v(p.lateralOffset * s / TAU, p.height / 2 * c, -p.longitudinalRadius * s - 4 * p.shoulderHarmonic * Math.sin(a * 2));
  const tangent = unit(first), normal = unit(sub(second, mul(tangent, dot(second, tangent)))), across = unit(cross(normal, tangent));
  const curvature = length(cross(first, second)) / length(first) ** 3;
  return { point, tangent, normal, across, curvature, radius: 1 / curvature, theta: a };
}

function triangle(a, b, c, featureId, materialKey, vertexNormals) {
  const ab = sub(b, a), ac = sub(c, a), n = unit(cross(ab, ac));
  const aa = dot(ab, ab), bb = dot(ac, ac), cc = dot(ab, ac), det = aa * bb - cc * cc;
  if (!(det > 1e-12)) throw new Error(`Degenerate challenge face in ${featureId}`);
  return { a, b, c, ab, ac, normal: n, aa, bb, cc, invDet: 1 / det, featureId, materialKey, vertexNormals: vertexNormals || [n, n, n] };
}

function withinTriangle(point, t, tolerance = 1e-5) {
  const ap = sub(point, t.a), pa = dot(ap, t.ab), pb = dot(ap, t.ac);
  const u = (t.bb * pa - t.cc * pb) * t.invDet, w = (t.aa * pb - t.cc * pa) * t.invDet;
  return u >= -tolerance && w >= -tolerance && u + w <= 1 + tolerance;
}

function prism(t, thickness, groundBase = null) {
  const bottom = p => groundBase === null ? sub(p, mul(t.normal, thickness)) : v(p.x, groundBase, p.z);
  const points = [t.a, t.b, t.c, bottom(t.a), bottom(t.b), bottom(t.c)];
  const center = mul(points.reduce(add, v()), 1 / points.length);
  return { kind: 'convex', center, vertices: points.map(p => sub(p, center)), faces: [[0, 1, 2], [5, 4, 3], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]], featureId: t.featureId,
    triangleIndex: t.index, exposedFaces: [0, 1, ...(t.exteriorEdges || [true, true, true]).flatMap((exposed, i) => exposed ? [i + 2] : [])] };
}

function quaternionFromY(direction) {
  const d = unit(direction), w = 1 + d.y;
  if (w < 1e-8) return { x: 1, y: 0, z: 0, w: 0 };
  const q = { x: d.z, y: 0, z: -d.x, w }, l = Math.hypot(q.x, q.z, q.w);
  return { x: q.x / l, y: 0, z: q.z / l, w: q.w / l };
}

class ChallengeCourse {
  constructor() {
    this.version = CHALLENGE_VERSION; this.loop = CHALLENGE_LOOP; this.zone = CHALLENGE_ZONE;
    this.triangles = []; this.features = []; this.boxes = []; this.colliderGroups = []; this._cells = new Map(); this._cellSize = 3;
    this._build(); this._index();
  }

  _addFeature(id, label, profiles, width, { materialKey = 'asphalt', thickness = .26, loop = false } = {}) {
    const groundBase = materialKey === 'concrete' ? CHALLENGE_PAD.height - .12 : null;
    const feature = { id, label, materialKey, width, thickness, groundBase, profiles, triangles: [], loop };
    let pending = [];
    const flush = () => {
      if (!pending.length) return;
      const center = mul(pending.reduce((sum, shape) => add(sum, shape.center), v()), 1 / pending.length);
      this.colliderGroups.push({ id: `${id}-deck-${this.colliderGroups.length}`, featureId: id, type: 'challenge', hardness: 1, center,
        shapes: pending.map(shape => ({ kind: shape.kind, offset: sub(shape.center, center), vertices: shape.vertices, faces: shape.faces, triangleIndex: shape.triangleIndex, exposedFaces: shape.exposedFaces })) });
      pending = [];
    };
    let distance = 0;
    for (let i = 0; i < profiles.length - 1; i++) {
      const p = profiles[i], q = profiles[i + 1];
      const next = distance + length(sub(q.point, p.point)), acrossSegments = loop ? 4 : 1;
      for (let j = 0; j < acrossSegments; j++) {
        const u = -width / 2 + j * width / acrossSegments, w = u + width / acrossSegments;
        const a = add(p.point, mul(p.across, u)), b = add(p.point, mul(p.across, w));
        const c = add(q.point, mul(q.across, u)), d = add(q.point, mul(q.across, w));
        const faces = [triangle(a, c, b, id, materialKey, [p.normal, q.normal, p.normal]), triangle(b, c, d, id, materialKey, [p.normal, q.normal, q.normal])];
        const startExposed = i === 0 && id !== 'loop' && id !== 'loop-exit', endExposed = i === profiles.length - 2 && id !== 'loop' && id !== 'loop-runup';
        faces[0].exteriorEdges = [j === 0, false, startExposed];
        faces[1].exteriorEdges = [false, endExposed, j === acrossSegments - 1];
        faces[0].uv = [[u / 3, distance / 3], [u / 3, next / 3], [w / 3, distance / 3]];
        faces[1].uv = [[w / 3, distance / 3], [u / 3, next / 3], [w / 3, next / 3]];
        for (const face of faces) {
          face.index = this.triangles.length; this.triangles.push(face); feature.triangles.push(face); pending.push(prism(face, thickness, groundBase));
        }
      }
      if (pending.length >= 32) flush();
      distance = next;
    }
    flush(); this.features.push(feature); return feature;
  }

  _lane(id, label, x, samples, width, options) {
    const profiles = samples.map(([z, y], i) => {
      const before = samples[Math.max(0, i - 1)], after = samples[Math.min(samples.length - 1, i + 1)];
      const tangent = unit(v(0, after[1] - before[1], after[0] - before[0]));
      return { point: v(x, y, z), tangent, across: v(1, 0, 0), normal: unit(cross(tangent, v(1, 0, 0))) };
    });
    return this._addFeature(id, label, profiles, width, options);
  }

  _box(id, center, size, materialKey = 'steel', quaternion = { x: 0, y: 0, z: 0, w: 1 }) {
    const box = { id, featureId: id.startsWith('loop-') ? 'loop' : id, center, size, materialKey, quaternion }; this.boxes.push(box);
    this.colliderGroups.push({ id, featureId: box.featureId, type: 'challenge', hardness: .95, center,
      shapes: [{ kind: 'box', offset: v(), halfExtents: mul(size, .5), quaternion }] });
    return box;
  }

  _beam(id, a, b, width = .32, depth = width, materialKey = 'steel') {
    return this._box(id, mul(add(a, b), .5), v(width, length(sub(b, a)), depth), materialKey, quaternionFromY(sub(b, a)));
  }

  _build() {
    const p = CHALLENGE_LOOP, y = p.y;
    this._lane('loop-runup', 'Loop run-up · 238 m', p.x, [[-192, CHALLENGE_PAD.height], [-180, y], [p.z, y]], p.width);
    this._addFeature('loop', '40 m loop', Array.from({ length: p.segments + 1 }, (_, i) => challengeLoopFrame(i / p.segments * TAU)), p.width, { loop: true, thickness: .80 });
    this._lane('loop-exit', 'Loop exit and braking area', p.x + p.lateralOffset, [[p.z, y], [153, y], [163, CHALLENGE_PAD.height]], p.width);
    // Two independent lanes retain genuine unsupported space under a jump.
    this._lane('tabletop', 'Progressive tabletop', -183, [[-134, 4.60], [-130, 4.72], [-126, 4.76], [-121, 5.03], [-115, 5.74], [-108, 6.85], [-106, 7.15], [-94, 7.15], [-74, 4.78], [-70, 4.60]], 9.2, { materialKey: 'concrete', thickness: .30 });
    this._lane('gap-launch', 'Gap jump · take-off', -183, [[-28, 4.60], [-24, 4.72], [-20, 4.81], [-16, 5.02], [-12, 5.41], [-8, 6.02], [-4, 6.96], [0, 8.10]], 9.2, { materialKey: 'concrete', thickness: .32 });
    this._lane('gap-landing', 'Gap jump · landing', -183, [[10, 7.10], [15, 6.62], [23, 5.58], [30, 4.92], [36, 4.72], [41, 4.60]], 11.2, { materialKey: 'concrete', thickness: .32 });
    this._lane('balance-ramp', 'Narrow balance ramp', -157, [[-123, 4.60], [-119, 4.70], [-112, 5.22], [-105, 5.96], [-100, 6.15], [-78, 6.15], [-73, 5.96], [-66, 5.22], [-59, 4.70], [-55, 4.60]], 3.5, { materialKey: 'concrete', thickness: .36 });
    // Alternating rigid wedges: exact top triangles support individual wheels.
    for (let i = 0; i < 7; i++) {
      const z = -27 + i * 10.5, h = .26 + (i % 3) * .11, x = -157 + (i % 2 ? -1.0 : 1.0);
      this._lane(`articulation-${i}`, 'Alternating articulation wedge', x, [[z - 3, 4.60], [z - 1.3, 4.72 + h], [z + .65, 4.72 + h], [z + 2.75, 4.60]], 2.2, { materialKey: 'concrete', thickness: .22 });
    }
    // Low speed slalom: physical marker blocks, with a clear bypass on each side.
    for (let i = 0; i < 5; i++) this._box(`slalom-${i}`, v(-181 + (i % 2 ? -2.8 : 2.8), 5.02, 67 + i * 13), v(.70, .84, .70), 'orange');
    // Extra loop-side rhythm lane: progressive curvature, real unsupported
    // gaps and broad descending landings. No launch impulses or hidden decks.
    for(const [i,z] of [-118,-58,5].entries()){
      const h=[1.6,2.1,2.5][i],samples=[];
      for(let j=0;j<=12;j++){
        const t=j/12;samples.push([z-22+22*t,4.60+h*t*t]);
      }
      this._lane(`rhythm-launch-${i}`,'Progressive rhythm take-off',-202,samples,6.6,{materialKey:'concrete',thickness:.28});
      const landing=[];
      for(let j=0;j<=12;j++){
        // Drop the receiving lip below a long truck's departing front end;
        // the broad slope then catches the tires instead of the bumper.
        const t=j/12;landing.push([z+8+21*t,4.60+(h*.35)*(1-t)*(1-t)]);
      }
      this._lane(`rhythm-landing-${i}`,'Broad rhythm landing',-202,landing,8.0,{materialKey:'concrete',thickness:.28});
    }
    // Two staggered wheel lines require diagonal articulation rather than
    // repeating the existing single alternating wedge exercise.
    for(const side of [-1,1]){
      const samples=[[-44,4.60]];
      for(let i=0;i<6;i++){
        const z=-32+i*11+(side>0?4:0),h=.24+i*.045;
        // Keep the valleys clear of the coplanar terrain surface. Entry and
        // exit grade smoothly back to ground without a visible raised seam.
        samples.push([z-3.5,4.64],[z-.9,4.64+h],[z+1.1,4.64+h],[z+4.0,4.64]);
      }
      samples.push([43,4.60]);
      this._lane(`crossaxle-${side}`,'Cross-axle staircase',-170+side*1.05,samples,1.85,{materialKey:'concrete',thickness:.24});
    }
    this._lane('hairpin-entry','Banked hairpin approach',-202,[[112,4.60],[126,4.72],[135,4.72]],6.6,{materialKey:'concrete'});
    const hairpin=Array.from({length:97},(_,i)=>{
      const a=i/96*Math.PI,bank=.30*Math.sin(a),tangent=unit(v(17*Math.sin(a),0,26*Math.cos(a)));
      const horizontal=unit(cross(v(0,1,0),tangent)),across=add(mul(horizontal,Math.cos(bank)),v(0,-Math.sin(bank),0));
      return {point:v(-185-17*Math.cos(a),4.72+.95*Math.sin(a),135+26*Math.sin(a)),tangent,across,normal:unit(cross(tangent,across))};
    });
    this._addFeature('banked-hairpin','Raised banked hairpin',hairpin,6.6,{materialKey:'concrete',thickness:.30});
    this._lane('hairpin-exit','Hairpin return',-168,[[118,4.60],[126,4.72],[135,4.72]],6.6,{materialKey:'concrete'});
    // The loop shifts 14 m sideways. A post beside one elevated section can
    // therefore pierce a different, lower section or the approach/exit. Put
    // the complete portal bents on fixed outboard planes instead, including
    // every brace and footing. The high transverse beams join the outer shell
    // above the entire road/vehicle sweep, not merely above its centerline.
    for (const [j, theta] of [1.45, 2.35, 3.92, 4.88].entries()) {
      const f = challengeLoopFrame(theta), under = add(f.point, mul(f.normal, -1.05)), caps = [];
      for (const [side, x] of [[-1, -246.5], [1, -211.5]]) {
        const top = add(under, mul(f.across, (x - under.x) / f.across.x));
        const foot = v(x, CHALLENGE_PAD.height + .32, top.z);
        const braceFoot = v(x, CHALLENGE_PAD.height + .24, top.z + (j % 2 ? -5.8 : 5.8));
        this._box(`loop-foundation-${j}-${side}`, v(x, CHALLENGE_PAD.height + .16, top.z), v(2.4, .32, 2.4), 'concrete');
        this._box(`loop-brace-foundation-${j}-${side}`, v(x, CHALLENGE_PAD.height + .12, braceFoot.z), v(1.3, .24, 1.3), 'concrete');
        this._beam(`loop-pylon-${j}-${side}`, foot, top, .44, .64);
        this._beam(`loop-brace-${j}-${side}`, braceFoot, top, .30, .34);
        caps.push(top);
      }
      this._beam(`loop-support-crossbeam-${j}`, caps[0], caps[1], .42, .52);
    }
    // Frames are buried into the deeper outer shell. Their inner faces stay
    // behind the unchanged driving surface throughout the Frenet banking.
    for (let i = 0; i < 48; i++) {
      const f = challengeLoopFrame(i / 48 * TAU), a = add(f.point, mul(f.normal, -.96));
      this._beam(`loop-crossmember-${i}`, add(a, mul(f.across, -5.1)), add(a, mul(f.across, 5.1)), .34, .34);
    }
  }

  _index() {
    const s = this._cellSize;
    for (const t of this.triangles) {
      const lo = v(Math.min(t.a.x, t.b.x, t.c.x), Math.min(t.a.y, t.b.y, t.c.y), Math.min(t.a.z, t.b.z, t.c.z));
      const hi = v(Math.max(t.a.x, t.b.x, t.c.x), Math.max(t.a.y, t.b.y, t.c.y), Math.max(t.a.z, t.b.z, t.c.z));
      for (let x = Math.floor((lo.x - .001) / s); x <= Math.floor((hi.x + .001) / s); x++) for (let y = Math.floor((lo.y - .001) / s); y <= Math.floor((hi.y + .001) / s); y++) for (let z = Math.floor((lo.z - .001) / s); z <= Math.floor((hi.z + .001) / s); z++) {
        const key = `${x},${y},${z}`; let list = this._cells.get(key); if (!list) this._cells.set(key, list = []); list.push(t.index);
      }
    }
  }

  _candidates(origin, direction, minDistance, maxDistance, radius) {
    const a = add(origin, mul(direction, minDistance)), b = add(origin, mul(direction, maxDistance)), s = this._cellSize, ids = new Set();
    for (let x = Math.floor((Math.min(a.x, b.x) - radius - .01) / s); x <= Math.floor((Math.max(a.x, b.x) + radius + .01) / s); x++) for (let y = Math.floor((Math.min(a.y, b.y) - radius - .01) / s); y <= Math.floor((Math.max(a.y, b.y) + radius + .01) / s); y++) for (let z = Math.floor((Math.min(a.z, b.z) - radius - .01) / s); z <= Math.floor((Math.max(a.z, b.z) + radius + .01) / s); z++) {
      for (const id of this._cells.get(`${x},${y},${z}`) || []) ids.add(id);
    }
    return ids;
  }

  _cast(origin, direction, radius, minDistance, maxDistance, featureId, nearestAbsolute) {
    if (!finiteVector(origin) || !finiteVector(direction) || length(direction) < 1e-9 || ![radius, minDistance, maxDistance].every(Number.isFinite) || radius < 0 || minDistance > maxDistance) return null;
    const dir = unit(direction); let best = null;
    const consider = (distance, point, normal, t, id) => {
      if (distance < minDistance - 1e-7 || distance > maxDistance + 1e-7 || dot(dir, normal) > -.12 || dot(normal, t.normal) < .015) return;
      const ranking = nearestAbsolute ? Math.abs(distance) : distance;
      if (best && ranking > best.ranking + 1e-8) return;
      if (best && Math.abs(ranking - best.ranking) < 1e-8 && dot(dir, normal) >= dot(dir, best.normal)) return;
      best = { distance, point, normal: { ...normal }, featureId: t.featureId, materialKey: t.materialKey, surface: 'asphalt', constructed: true, triangleIndex: id, ranking };
    };
    const roots = (aa, bb, cc) => {
      if (aa < 1e-12) return [];
      const discriminant = bb * bb - 4 * aa * cc;
      if (discriminant < -1e-10) return [];
      const root = Math.sqrt(Math.max(0, discriminant));
      return [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)];
    };
    for (const id of this._candidates(origin, dir, minDistance, maxDistance, radius)) {
      const t = this.triangles[id]; if (featureId && t.featureId !== featureId) continue;
      const denom = dot(dir, t.normal);
      if (denom < -.12) {
        const distance = (radius - dot(sub(origin, t.a), t.normal)) / denom;
        if (distance >= minDistance - 1e-7 && distance <= maxDistance + 1e-7) {
          const center = add(origin, mul(dir, distance)), point = sub(center, mul(t.normal, radius));
          if (withinTriangle(point, t)) consider(distance, point, t.normal, t, id);
        }
      }
      if (radius <= 0) continue;
      // A sphere can contact a triangle edge even when its plane projection
      // falls outside that triangle. These exact capsule/sphere roots prevent
      // holes at a banked ribbon seam, without extending the deck itself.
      for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const edge = sub(b, a), edge2 = dot(edge, edge), rel = sub(origin, a), m = dot(rel, edge) / edge2, n = dot(dir, edge) / edge2;
        const base = sub(rel, mul(edge, m)), slope = sub(dir, mul(edge, n));
        for (const distance of roots(dot(slope, slope), 2 * dot(base, slope), dot(base, base) - radius * radius)) {
          if (distance < minDistance - 1e-7 || distance > maxDistance + 1e-7) continue;
          const u = m + n * distance; if (u < 0 || u > 1) continue;
          const point = add(a, mul(edge, u)), center = add(origin, mul(dir, distance));
          consider(distance, point, unit(sub(center, point)), t, id);
        }
      }
      for (const point of [t.a, t.b, t.c]) {
        const rel = sub(origin, point);
        for (const distance of roots(1, 2 * dot(rel, dir), dot(rel, rel) - radius * radius)) {
          if (distance < minDistance - 1e-7 || distance > maxDistance + 1e-7) continue;
          const center = add(origin, mul(dir, distance));
          consider(distance, point, unit(sub(center, point)), t, id);
        }
      }
    }
    if (best) delete best.ranking; return best;
  }

  /** Sphere-offset support distance along the unit suspension direction. */
  castSuspension(origin, down, radius = 0, minDistance = -.35, maxDistance = 1.5) {
    return this._cast(origin, down, radius, minDistance, maxDistance, null, false);
  }

  /** Project a contact-patch point along the existing contact normal. A null
   * result denotes an actual edge/gap; callers must not invent a hidden deck. */
  projectFootprint(point, normal, featureId, reach = .65) {
    return this._cast(point, mul(unit(normal), -1), 0, -reach, reach, featureId, true);
  }
}

export function createChallengeCourse() { return new ChallengeCourse(); }
