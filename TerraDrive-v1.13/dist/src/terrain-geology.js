import { GEOLOGY_PROFILES, geologyProfileAt } from './geology-profiles.js?v=1.15.0';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123; return n - Math.floor(n); };
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

export const MUD_RUT_ROUTES = Object.freeze([
  { id: 'main', seed: 71, track: 1.84, depth: 1, nodes: [[-175,48],[-157,47.2],[-137,51.8],[-115,52.8],[-97,46.9],[-77,46],[-58,49.5]] },
  { id: 'western-bypass', seed: 113, track: 1.71, depth: .82, nodes: [[-149,48.1],[-137,43.8],[-121,36.6],[-107,28.1],[-91,25.5],[-74,34.3],[-62,40]] },
  { id: 'eastern-fork', seed: 173, track: 1.91, depth: .92, nodes: [[-144,51],[-128,58],[-112,66.6],[-94,63.5],[-72,58]] },
  { id: 'crossing', seed: 229, track: 1.76, depth: .61, nodes: [[-111,32],[-98,45],[-81,58],[-67,66]] },
].map(route => Object.freeze({ ...route, nodes: Object.freeze(route.nodes.map(point => Object.freeze(point))) })));

const POOLS = Object.freeze([
  { x: 51.9, z: -133.7, rx: 3.1, rz: 5.4, depth: .190, seed: 17 },
  { x: 49.1, z: -103.7, rx: 3.8, rz: 4.6, depth: .240, seed: 37 },
  { x: 64.1, z: -94.8, rx: 3.6, rz: 6.7, depth: .220, seed: 61 },
  { x: 32.6, z: -113.4, rx: 3.5, rz: 4.2, depth: .205, seed: 97 },
  { x: 45.7, z: -79.9, rx: 2.9, rz: 4.5, depth: .205, seed: 131 },
].map(pool => Object.freeze(pool)));

/** Cubic route center and its slope, with shared derivatives at every join. */
export function mudRouteAt(route, z) {
  const points = route.nodes, last = points.length - 1;
  if (z <= points[0][0]) return { x: points[0][1], slope: (points[1][1] - points[0][1]) / (points[1][0] - points[0][0]) };
  if (z >= points[last][0]) return { x: points[last][1], slope: (points[last][1] - points[last - 1][1]) / (points[last][0] - points[last - 1][0]) };
  let i = 0; while (z > points[i + 1][0]) i++;
  const a = points[i], b = points[i + 1], previous = points[Math.max(0, i - 1)], next = points[Math.min(last, i + 2)];
  const span = b[0] - a[0], t = (z - a[0]) / span, t2 = t * t, t3 = t2 * t;
  const ma = (b[1] - previous[1]) / (b[0] - previous[0]), mb = (next[1] - a[1]) / (next[0] - a[0]);
  const x = (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * span * ma
    + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * span * mb;
  const slope = ((6 * t2 - 6 * t) * a[1] + (3 * t2 - 4 * t + 1) * span * ma
    + (-6 * t2 + 6 * t) * b[1] + (3 * t2 - 2 * t) * span * mb) / span;
  return { x, slope };
}

/** The two wheels keep a coherent route, but do not share width, wear or depth. */
export function mudWheelPathAt(route, side, z) {
  const center = mudRouteAt(route, z), seed = route.seed + (side > 0 ? 41 : 0);
  const wander = (noise(z * .135 + 7.1, seed + 5) - .5) * .34;
  const halfTrack = route.track * .5 + (noise(z * .061, seed + 3) - .5) * .16;
  const width = .29 + noise(z * .103 - 19, seed + 13) * .31;
  const activity = .24 + .76 * smooth(.21, .76, noise(z * .054, seed + 23));
  const endFade = smooth(0, 6, z - route.nodes[0][0]) * smooth(0, 7, route.nodes.at(-1)[0] - z);
  return { x: center.x + (side * halfTrack + wander) * Math.sqrt(1 + center.slope * center.slope),
    slope: center.slope, width, depth: (.069 + .185 * noise(z * .082 + 11, seed + 37)) * activity * route.depth * endFade,
    seed, endFade };
}

function makeStone(x, z, profile, scale, angle, options = {}) {
  const source = GEOLOGY_PROFILES.profiles[profile], bury = options.bury || 0;
  const shape = { x, z, profile, rx: source.sourceXZHalfExtent[0] * scale,
    rz: source.sourceXZHalfExtent[1] * scale, h: source.peakMetres * scale * (1 - bury),
    angle, cos: Math.cos(angle), sin: Math.sin(angle), bury, ...options };
  return shape;
}

function stoneRelief(shape, x, z) {
  const lx = (x - shape.x) * shape.cos + (z - shape.z) * shape.sin;
  const lz = -(x - shape.x) * shape.sin + (z - shape.z) * shape.cos;
  const dx = lx / shape.rx, dz = lz / shape.rz;
  if (Math.abs(dx) >= 1 || Math.abs(dz) >= 1) return 0;
  const value = geologyProfileAt(shape.profile, dx, dz);
  let height = Math.max(0, (value - shape.bury) / (1 - shape.bury)) * shape.h;
  if (shape.edgeTrim) {
    // Eroded fines no longer make every exposed block rise through a broad
    // skirt. Trim only the lowest source relief; retain its upper silhouette.
    height *= smooth(0, shape.edgeTrim, height);
  }
  if (shape.joint) {
    const joint = shape.joint;
    // A weathered parting plane separates rounded source lobes into blocks.
    // Its shoulder is wide enough for the shared 0.5 m terrain triangles;
    // this is authored topography, not a texture crack or an undercut mesh.
    const along = -lx * joint.sin + lz * joint.cos;
    const wander = Math.sin(along * .73 + joint.phase) * .045;
    const across = Math.abs(lx * joint.cos + lz * joint.sin - joint.offset + wander);
    const opening = 1 - smooth(joint.halfGap, joint.halfGap + joint.shoulder, across);
    height *= 1 - opening;
  }
  return height;
}

function makeJoint(shape, seed) {
  const angle = (hash(seed, 617) - .5) * .64;
  return Object.freeze({ cos: Math.cos(angle), sin: Math.sin(angle),
    offset: (hash(seed, 619) - .5) * Math.min(shape.rx, shape.rz) * .23,
    halfGap: .22 + hash(seed, 631) * .07,
    shoulder: .24 + hash(seed, 641) * .12, phase: hash(seed, 643) * Math.PI * 2 });
}

function addToSpatial(spatial, shapes, field) {
  for (const shape of shapes) {
    const reach = Math.hypot(shape.rx, shape.rz);
    for (let z = Math.floor((shape.z - reach) / 8); z <= Math.floor((shape.z + reach) / 8); z++) {
      for (let x = Math.floor((shape.x - reach) / 8); x <= Math.floor((shape.x + reach) / 8); x++) {
        const key = x + ',' + z;
        if (!spatial.has(key)) spatial.set(key, { stones: [], outcrops: [] });
        spatial.get(key)[field].push(shape);
      }
    }
  }
}

const EMPTY_STONE = Object.freeze({ stone: 0, stoneHeight: 0 });
const EMPTY_MUD = Object.freeze({ stone: 0, rut: 0, shoulder: 0, stoneHeight: 0, rutDepth: 0, offset: 0 });

/** Authored geology uses real source shapes; no separate tall collision mesh. */
export class TerrainGeology {
  constructor() {
    this.rocks = []; this.rockOutcrops = []; this.mudStones = [];
    // Separate, differently proportioned blocks leave gravel-filled gaps. The
    // long central approach remains open for a choice of difficulty and line.
    const groups = [
      { x: 135, z: 118, seed: 11, angle: .27, profile: 0, count: 5 },
      { x: 145, z: 143, seed: 31, angle: -1.10, profile: 2, count: 4 },
      { x: 88, z: 156, seed: 53, angle: -.46, profile: 3, count: 4 },
      { x: 139, z: 177, seed: 79, angle: .89, profile: 1, count: 4 },
      { x: 91, z: 99, seed: 101, angle: .35, profile: 2, count: 3 },
      { x: 149, z: 82, seed: 127, angle: -1.35, profile: 0, count: 3 },
    ];
    for (const group of groups) for (let i = 0; i < group.count; i++) {
      const a = group.angle + i * 2.399963 + (hash(i, group.seed) - .5) * .75;
      const reach = i ? 2.5 + Math.sqrt(i) * 2.1 + hash(i, group.seed + 1) * 1.9 : 0;
      const profile = i === 0 ? group.profile : Math.floor(hash(i, group.seed + 3) * 4);
      const scale = i === 0 ? 1.90 + hash(i, group.seed + 5) * .45 : .84 + hash(i, group.seed + 7) * 1.12;
      const orientation = i === 0 ? group.angle - .42 : a + hash(i, group.seed + 11) * 2.1;
      const block = makeStone(group.x + Math.cos(a) * reach, group.z + Math.sin(a) * reach,
        profile, scale, orientation, { group: group.seed, slab: false, edgeTrim: .15 });
      // Broad parent blocks keep a coherent joint direction, while detached
      // smaller pieces retain the four uncut original scan silhouettes.
      if (i === 0 || (i === 2 && scale > 1.45)) block.joint = makeJoint(block, group.seed + i * 19);
      this.rockOutcrops.push(block);
    }
    // Smaller detached blocks and rubble surround the main clusters without
    // inheriting a rectangular or equally-spaced slab layout.
    for (let i = 0; i < 74; i++) {
      const parent = this.rockOutcrops[i % this.rockOutcrops.length];
      const a = hash(i, 401) * Math.PI * 2, reach = .88 + hash(i, 409) * 1.25;
      this.rocks.push(makeStone(parent.x + Math.cos(a) * (parent.rx + .6) * reach,
        parent.z + Math.sin(a) * (parent.rz + .6) * reach, i % 4,
        .24 + hash(i, 419) * .51, a, { slab: i % 5 === 0, bury: .16 + hash(i, 421) * .21 }));
    }
    // Broken fragments accumulate unevenly beside an exposed group. Separate
    // short fans replace a uniform halo: close fragments are larger, distant
    // ones partly buried. Each remains an actual shared contact-height shape.
    // Leave the existing central articulation route and arrival unobstructed.
    for (const group of groups) {
      const direction = group.angle + .9 + (hash(group.seed, 653) - .5) * .8;
      for (let i = 0; i < 13; i++) {
        const run = hash(i, group.seed + 659), spread = (hash(i, group.seed + 661) - .5) * 1.6;
        const a = direction + spread, reach = 3.4 + run * 7.5;
        const x = group.x + Math.cos(a) * reach, z = group.z + Math.sin(a) * reach;
        if (z < 132 && Math.abs(x - 112) < 4.5) continue;
        const scale = (.43 + hash(i, group.seed + 673) * .48) * (1 - run * .20);
        this.rocks.push(makeStone(x, z, (i + group.profile) % 4, scale,
          group.angle + (hash(i, group.seed + 677) - .5) * 2.1,
          { slab: i % 3 === 0, bury: .24 + run * .28, edgeTrim: .045,
            fragment: true, group: group.seed }));
      }
    }
    // Offset, unequal articulation stones preserve a traversable central line.
    for (let i = 0; i < 10; i++) {
      this.rocks.push(makeStone(112 + (i % 2 ? -1 : 1) * (.75 + hash(i, 431) * .67),
        70 + i * 5.9 + (hash(i, 433) - .5) * 2.3, i % 4, .39 + hash(i, 439) * .33,
        hash(i, 443) * Math.PI * 2, { slab: i % 3 === 0, bury: .38 }));
    }
    for (let i = 0; i < 55; i++) {
      const route = MUD_RUT_ROUTES[i % MUD_RUT_ROUTES.length];
      const start = Math.max(-153, route.nodes[0][0] + 8), end = Math.min(-70, route.nodes.at(-1)[0] - 7);
      const z = mix(start, end, hash(i, 571)), center = mudRouteAt(route, z), side = i % 2 ? -1 : 1;
      const x = center.x + side * (1.25 + hash(i, 577) * 2.55) * Math.sqrt(1 + center.slope * center.slope);
      this.mudStones.push(makeStone(x, z, i % 4, .40 + hash(i, 587) * .45,
        hash(i, 593) * Math.PI * 2, { slab: false, bury: .66 + hash(i, 599) * .12 }));
    }
    this.rockSpatial = new Map(); this.mudSpatial = new Map();
    addToSpatial(this.rockSpatial, this.rocks, 'stones'); addToSpatial(this.rockSpatial, this.rockOutcrops, 'outcrops');
    addToSpatial(this.mudSpatial, this.mudStones, 'stones');
  }

  stoneAt(x, z, mud = false) {
    const neighborhood = (mud ? this.mudSpatial : this.rockSpatial).get(Math.floor(x / 8) + ',' + Math.floor(z / 8));
    if (!neighborhood) return EMPTY_STONE;
    let stoneHeight = 0;
    for (const shape of neighborhood.stones) stoneHeight = Math.max(stoneHeight, stoneRelief(shape, x, z));
    for (const shape of neighborhood.outcrops) stoneHeight = Math.max(stoneHeight, stoneRelief(shape, x, z));
    return { stoneHeight, stone: smooth(.009, mud ? .063 : .15, stoneHeight) };
  }

  mudAt(x, z) {
    if (x < 8 || x > 88 || z < -184 || z > -48) return EMPTY_MUD;
    let rutDepth = 0, rut = 0, shoulder = 0, spoil = 0;
    for (const route of MUD_RUT_ROUTES) {
      if (z < route.nodes[0][0] || z > route.nodes.at(-1)[0]) continue;
      for (const side of [-1, 1]) {
        const path = mudWheelPathAt(route, side, z), across = (x - path.x) / Math.sqrt(1 + path.slope * path.slope);
        if (Math.abs(across) > path.width * 4.5) continue;
        const q = across / path.width, groove = Math.exp(-q * q * 1.35);
        const brokenEdge = .77 + .23 * noise(x * 2.8 + path.seed, z * 2.3);
        const depth = path.depth * groove * brokenEdge;
        rutDepth = Math.max(rutDepth, depth); rut = Math.max(rut, groove * path.endFade * smooth(.009, .065, path.depth));
        const rimDistance = (Math.abs(across) - path.width * 1.67) / (path.width * .76);
        const rim = Math.exp(-rimDistance * rimDistance) * path.endFade;
        const chunks = .28 + .72 * Math.pow(noise(x * 2.1 + path.seed, z * 1.63), .85);
        const lift = rim * (.018 + .095 * noise(z * .47, path.seed + 73)) * chunks;
        spoil = Math.max(spoil, lift); shoulder = Math.max(shoulder, rim * chunks);
      }
    }
    let poolDepth = 0;
    for (const pool of POOLS) {
      const dx = (x - pool.x) / pool.rx, dz = (z - pool.z) / pool.rz;
      const d = Math.hypot(dx, dz) + (noise(x * .83 + pool.seed, z * .68) - .5) * .19;
      if (d < 1.25) poolDepth = Math.max(poolDepth, (1 - smooth(.18, 1.16, d)) * pool.depth);
    }
    const stone = this.stoneAt(x, z, true);
    // Authored wear does not populate live compaction/sink buffers. New tracks
    // deform this uneven starting bed and can still be reset independently.
    const poolRut = smooth(.009, .1, poolDepth) * .52;
    const depression = rutDepth + poolDepth * (1 - rut * .24);
    const clearing = smooth(6, 13, Math.hypot(x - 48, z + 163));
    const clods = (noise(x * 1.67 + 11.3, z * 1.59) - .5) * (.027 + shoulder * .061);
    return { ...stone, rut: Math.max(rut, poolRut) * clearing, shoulder: shoulder * clearing,
      rutDepth: depression * clearing, offset: (-depression + spoil + clods) * clearing + stone.stoneHeight };
  }
}
