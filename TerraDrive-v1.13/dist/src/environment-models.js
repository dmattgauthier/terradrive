import * as THREE from '../vendor/three.module.js';

// Procedural meshes use the same coordinate conventions as the original
// scenery instances: crowns/branches grow from y=0 to y=1; trunks are centered
// on y=0 with a unit height. They add visual detail without adding colliders.
export const ENVIRONMENT_MODEL_VERSION = '1.9.0';
export const REED_SEEDHEAD_ANCHOR = Object.freeze({ x: 0, y: .86, z: 0 });
// Pixel-center crop verified against the source alpha atlas. The atlas is
// opaque outside each black-backed twig island, so its outer white corners
// cannot be used as a rectangular card. This inner crop keeps 91.7% of the
// original needle/stem mask with an eight-pixel guard from that background.
export const PINE_TWIG_UV_CROP = Object.freeze({
  uMin: 33.5 / 1024, uMax: 227.5 / 1024,
  vMin: 1 - 326.5 / 1024, vMax: 1 - 44.5 / 1024,
});
const TAU = Math.PI * 2;
const TREE_ASPECT = 5.2;
const DEFAULT_PINE_SEED = 18107;

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

class GeometryBuilder {
  constructor() { this.positions = []; this.uvs = []; this.colors = []; this.indices = []; this.bendWeights = []; }
  vertex(point, u = 0, v = 0, color = [1, 1, 1], bendWeight = 0) {
    const index = this.positions.length / 3;
    this.positions.push(point.x, point.y, point.z); this.uvs.push(u, v); this.colors.push(...color); this.bendWeights.push(bendWeight);
    return index;
  }
  triangle(a, b, c) { this.indices.push(a, b, c); }
  finish(name, metadata = {}) {
    const geometry = new THREE.BufferGeometry();
    geometry.name = name;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('aPlantBend', new THREE.Float32BufferAttribute(this.bendWeights, 1));
    geometry.setIndex(this.indices); geometry.computeVertexNormals();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData = { ...metadata, modelVersion: ENVIRONMENT_MODEL_VERSION, triangles: this.indices.length / 3 };
    return geometry;
  }
}

function pineStructure(seed) {
  const rng = random(seed), branches = [];
  const heights = [.20, .29, .385, .47, .555, .65, .745, .83, .905, .965];
  const counts = [4, 5, 5, 5, 4, 4, 3, 3, 2, 1];
  for (let layer = 0; layer < heights.length; layer++) {
    const phase = layer * 2.399963 + (rng() - .5) * .55;
    for (let slot = 0; slot < counts[layer]; slot++) {
      const angle = phase + slot / counts[layer] * TAU + (rng() - .5) * .39;
      const height = heights[layer] + (rng() - .5) * (layer === 9 ? .009 : .025);
      // Independent bough reach and asymmetry make actual gaps in the crown;
      // rotating an instance no longer rotates a regular eight-spoke outline.
      const reach = Math.pow(1 - height, .79) * 1.42 * (.66 + rng() * .37) * (1 + .08 * Math.sin(angle + 1.2));
      branches.push({ layer, angle, height, reach, droop: (.011 + rng() * .017) * (1 - height), sweep: (rng() - .5) * .23, twigCount: layer < 4 ? 11 : layer < 7 ? 10 : 8, seed: Math.floor(rng() * 4294967295) });
    }
  }
  return branches;
}

function branchPoint(branch, t) {
  const angle = branch.angle + branch.sweep * Math.sin(Math.PI * t);
  return new THREE.Vector3(Math.sin(angle) * branch.reach * t,
    branch.height - branch.droop * Math.sin(Math.PI * t * .8) + .008 * t * t * t,
    Math.cos(angle) * branch.reach * t);
}

function addTwig(builder, root, tip, width, roll, shade) {
  // Build the card in nominal physical aspect before returning to the crown's
  // normalized height. The photographed twig stays a narrow needle spray.
  const start = root.clone(); start.y *= TREE_ASPECT;
  const end = tip.clone(); end.y *= TREE_ASPECT;
  const forward = end.clone().sub(start).normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(forward).normalize();
  const normal = forward.clone().cross(side).normalize();
  side.multiplyScalar(Math.cos(roll)).addScaledVector(normal, Math.sin(roll)).multiplyScalar(width);
  const points = [start.clone().sub(side), start.clone().add(side), end.clone().addScaledVector(side, .72), end.clone().addScaledVector(side, -.72)];
  points.forEach(point => { point.y /= TREE_ASPECT; });
  // Stay inside the twig's black-backed mask island. A wider crop includes
  // the atlas's opaque white background and makes visible card-shaped fans.
  const { uMin, uMax, vMin, vMax } = PINE_TWIG_UV_CROP;
  const uvs = [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]];
  const ids = points.map((point, index) => builder.vertex(point, ...uvs[index], [shade * .94, shade, shade * .88]));
  builder.triangle(ids[0], ids[1], ids[2]); builder.triangle(ids[0], ids[2], ids[3]);
}

export function createPineFoliageGeometry(seed = DEFAULT_PINE_SEED) {
  const builder = new GeometryBuilder(), branches = pineStructure(seed);
  for (const branch of branches) {
    const rng = random(branch.seed);
    for (let twig = 0; twig < branch.twigCount; twig++) {
      const t = .14 + twig / (branch.twigCount - 1) * .78;
      const root = branchPoint(branch, t), side = twig % 2 ? 1 : -1;
      const twigAngle = branch.angle + side * (.32 + rng() * .52) + branch.sweep;
      const length = branch.reach * (.29 + rng() * .19) * (1 - .23 * t);
      const tip = root.clone().add(new THREE.Vector3(Math.sin(twigAngle) * length, (.026 + rng() * .046) * (1 - .26 * t), Math.cos(twigAngle) * length));
      const width = length * (.32 + rng() * .085), roll = .12 + rng() * .82;
      const shade = .78 + branch.height * .16 + rng() * .08;
      addTwig(builder, root, tip, width, roll, shade);
      // Crossed, upturned needle sprays keep the crown alive and voluminous
      // from driving height. A flat card-only tier projects to almost nothing
      // from below, even if it has a high triangle count in plan view.
      addTwig(builder, root, tip, width * .92, roll + 1.32, shade * .97);
      if ((twig + branch.layer) % 3 === 1) {
        const infillTip = root.clone().add(new THREE.Vector3(Math.sin(twigAngle - side * .46) * length * .77, (.045 + rng() * .018) * (1 - .24 * t), Math.cos(twigAngle - side * .46) * length * .77));
        addTwig(builder, root, infillTip, width * .82, roll - .85, shade * .99);
      }
    }
  }
  const rng = random(seed + 183);
  for (let twig = 0; twig < 9; twig++) {
    const angle = twig * 2.399963, root = new THREE.Vector3(0, .925 + twig * .006, 0);
    const tip = new THREE.Vector3(Math.sin(angle) * (.032 + rng() * .037), .982 + rng() * .014, Math.cos(angle) * (.032 + rng() * .037));
    addTwig(builder, root, tip, .028 + rng() * .012, angle, .98);
  }
  return builder.finish('irregular-needle-pine-crown', { seed, branchCount: branches.length, coordinateSystem: 'rooted-crown', foliageAtlas: 'pine_tree_01 vertical twig' });
}

function addTube(builder, points, radii, sides = 3, aspect = 1, shade = 1, bendHeight = 0) {
  const physical = points.map(point => new THREE.Vector3(point.x, point.y * aspect, point.z));
  let along = 0;
  const rings = physical.map((center, ring) => {
    const direction = physical[Math.min(ring + 1, physical.length - 1)].clone().sub(physical[Math.max(ring - 1, 0)]).normalize();
    const axis = Math.abs(direction.y) < .96 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const side = axis.cross(direction).normalize(), normal = direction.clone().cross(side).normalize();
    if (ring) along += center.distanceTo(physical[ring - 1]);
    const ids = [];
    for (let radial = 0; radial <= sides; radial++) {
      const angle = radial / sides * TAU;
      const point = center.clone().addScaledVector(side, Math.cos(angle) * radii[ring]).addScaledVector(normal, Math.sin(angle) * radii[ring]);
      point.y /= aspect;
      const bendWeight = bendHeight ? Math.pow(THREE.MathUtils.clamp(center.y / aspect / bendHeight, 0, 1), 2) : 0;
      ids.push(builder.vertex(point, radial / sides, along * .20, [shade, shade * .96, shade * .88], bendWeight));
    }
    return ids;
  });
  for (let ring = 0; ring + 1 < rings.length; ring++) for (let radial = 0; radial < sides; radial++) {
    builder.triangle(rings[ring][radial], rings[ring][radial + 1], rings[ring + 1][radial]);
    builder.triangle(rings[ring][radial + 1], rings[ring + 1][radial + 1], rings[ring + 1][radial]);
  }
}

export function createPineBranchGeometry(seed = DEFAULT_PINE_SEED) {
  const builder = new GeometryBuilder(), branches = pineStructure(seed);
  for (const branch of branches) {
    const radius = .028 * (1 - branch.height * .67);
    addTube(builder, [branchPoint(branch, 0), branchPoint(branch, .56), branchPoint(branch, 1)], [radius, radius * .56, .0028], 3, TREE_ASPECT, .82 + branch.height * .15);
  }
  // A few bare lower limbs make the trunk/crown transition legible up close.
  // Their small reach remains well inside the surrounding needle silhouette.
  const rng = random(seed + 791);
  for (let i = 0; i < 4; i++) {
    const angle = i * 2.399963 + .4, y = .13 + i * .018, reach = .16 + rng() * .18;
    addTube(builder, [new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.sin(angle) * reach, y - .014, Math.cos(angle) * reach)], [.018, .004], 3, TREE_ASPECT, .72);
  }
  addTube(builder, [new THREE.Vector3(0, .91, 0), new THREE.Vector3(.007, .954, -.005), new THREE.Vector3(0, .992, 0)], [.009, .005, .0018], 3, TREE_ASPECT, .89);
  return builder.finish('connected-pine-boughs', { seed, branchCount: branches.length, coordinateSystem: 'rooted-crown', sharedStructure: 'irregular-needle-pine-crown' });
}

export function createPineTrunkGeometry() {
  const builder = new GeometryBuilder(), rings = [], sides = 16;
  const levels = [-.5, -.493, -.475, -.13, .5];
  for (let ring = 0; ring < levels.length; ring++) {
    const y = levels[ring], envelope = 1 - (y + .5) * .75, ids = [];
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * TAU;
      const ridge = .95 + .05 * (.5 + .5 * Math.cos(angle * 7 + .23));
      // The flare occupies only the lowest ~5–11 cm of the real instance.
      // Above it every vertex is within the analytic impact-mark taper.
      const radius = envelope * ridge * (ring === 0 ? 1.135 : 1);
      ids.push(builder.vertex(new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius), side / sides, y + .5, [ring === 0 ? .62 : .94, ring === 0 ? .59 : .92, ring === 0 ? .51 : .86]));
    }
    rings.push(ids);
  }
  for (let ring = 0; ring + 1 < rings.length; ring++) for (let side = 0; side < sides; side++) {
    builder.triangle(rings[ring][side], rings[ring][side + 1], rings[ring + 1][side]);
    builder.triangle(rings[ring][side + 1], rings[ring + 1][side + 1], rings[ring + 1][side]);
  }
  for (const ring of [0, rings.length - 1]) {
    const center = builder.vertex(new THREE.Vector3(0, levels[ring], 0), .5, .5, [.67, .61, .48]);
    for (let side = 0; side < sides; side++) {
      if (ring === 0) builder.triangle(center, rings[ring][side + 1], rings[ring][side]);
      else builder.triangle(center, rings[ring][side], rings[ring][side + 1]);
    }
  }
  return builder.finish('ridged-pine-trunk-and-root-collar', { coordinateSystem: 'centered-trunk', contactEnvelope: '1 - (y + .5) * .75 above y=-.493', maximumRootRadius: 1.135 });
}

export function createBrokenStumpGeometry(seed = 18119) {
  const builder = new GeometryBuilder(), rng = random(seed), sides = 12, rings = [];
  const edgeHeights = Array.from({ length: sides }, () => .27 + rng() * .22);
  for (let ring = 0; ring < 4; ring++) {
    const ids = [];
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, ridge = .96 + .035 * Math.sin(angle * 5 + .21);
      const radius = [1, .95, .88, .56][ring] * ridge;
      const y = ring === 0 ? -.5 : ring === 1 ? -.02 : ring === 2 ? edgeHeights[side] : .20 + .035 * Math.sin(angle * 4);
      const color = ring < 2 ? [.35, .24, .14] : ring === 2 ? [.55, .38, .21] : [.77, .57, .33];
      ids.push(builder.vertex(new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius), (Math.sin(angle) + 1) * .5, (Math.cos(angle) + 1) * .5, color));
    }
    rings.push(ids);
  }
  for (let ring = 0; ring < 3; ring++) for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    builder.triangle(rings[ring][side], rings[ring][next], rings[ring + 1][side]);
    builder.triangle(rings[ring][next], rings[ring + 1][next], rings[ring + 1][side]);
  }
  const bottom = builder.vertex(new THREE.Vector3(0, -.5, 0), .5, .5, [.31, .21, .12]);
  const breakCenter = builder.vertex(new THREE.Vector3(.025, .165, -.018), .5, .5, [.64, .44, .24]);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    builder.triangle(bottom, rings[0][next], rings[0][side]);
    builder.triangle(breakCenter, rings[3][side], rings[3][next]);
  }
  return builder.finish('splintered-tree-stump', { seed, coordinateSystem: 'centered-stump', colliderRadius: 1, colliderHalfHeight: .5 });
}

function addFoldedBlade(builder, { angle, height, width, lean, baseX = 0, baseZ = 0, curl = 0, shade = 1, dry = false, folded = true }) {
  const rows = [], along = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
  for (let row = 0; row <= 3; row++) {
    const t = row / 3, extent = Math.max(.025, 1 - Math.pow(t, 1.25));
    const bend = lean * t * t;
    const center = new THREE.Vector3(baseX + along.x * bend + side.x * curl * t * t * t, height * (t - .12 * Math.max(0, lean - .18) * t * t), baseZ + along.z * bend + side.z * curl * t * t * t);
    const light = (.48 + t * .50) * shade;
    const color = dry ? [light, light * .88, light * .58] : [light * .91, light, light * .74];
    rows.push((folded ? [-1, 0, 1] : [-1, 1]).map(edge => {
      const point = center.clone().addScaledVector(side, edge * width * extent);
      if (!edge) point.y += width * .33 * extent;
      return builder.vertex(point, (edge + 1) * .5, t, color, t * t);
    }));
  }
  for (let row = 0; row < 3; row++) for (let column = 0; column < (folded ? 2 : 1); column++) {
    builder.triangle(rows[row][column], rows[row][column + 1], rows[row + 1][column]);
    builder.triangle(rows[row][column + 1], rows[row + 1][column + 1], rows[row + 1][column]);
  }
}

export function createMeadowGrassGeometry({ seed = 18121, detail = 'near' } = {}) {
  const builder = new GeometryBuilder(), rng = random(seed);
  const bladeCount = detail === 'distant' ? 7 : 14;
  for (let blade = 0; blade < bladeCount; blade++) {
    const angle = blade * 2.399963 + (rng() - .5) * .55, radius = .025 + rng() * .065;
    addFoldedBlade(builder, { angle, height: .41 + rng() * .57, width: .0065 + rng() * .0055, lean: .13 + rng() * .21, baseX: Math.sin(blade * 7.31) * radius, baseZ: Math.cos(blade * 5.77) * radius, curl: (rng() - .5) * .10, shade: .87 + rng() * .13, folded: detail !== 'distant' && blade % 4 === 0 });
  }
  return builder.finish('fine-folded-meadow-grass', { seed, detail, bladeCount, coordinateSystem: 'rooted-plant', flexible: true });
}

export function createMarshSedgeGeometry(seed = 18127) {
  const builder = new GeometryBuilder(), rng = random(seed);
  for (let blade = 0; blade < 9; blade++) {
    const angle = blade * 2.399963 + rng() * .30;
    addFoldedBlade(builder, { angle, height: .50 + rng() * .37, width: .009 + rng() * .005, lean: .13 + rng() * .18, baseX: Math.sin(angle) * .025, baseZ: Math.cos(angle) * .025, curl: (rng() - .5) * .035, shade: .93, folded: blade % 4 === 0 });
  }
  // The seed head attaches to this modeled central stalk in world.js. Its
  // endpoint is shared rather than guessed separately from the leaf heights.
  addTube(builder, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, REED_SEEDHEAD_ANCHOR.y, 0)], [.0055, .0032], 4, 1, .91, REED_SEEDHEAD_ANCHOR.y);
  return builder.finish('marsh-sedge-leaves-and-seed-stalk', { seed, bladeCount: 9, seedheadAnchor: REED_SEEDHEAD_ANCHOR, coordinateSystem: 'rooted-plant', flexible: true });
}

export function createDryTussockGeometry(seed = 18133) {
  const builder = new GeometryBuilder(), rng = random(seed);
  for (let blade = 0; blade < 7; blade++) {
    const angle = blade * 2.399963 + (rng() - .5) * .85;
    addFoldedBlade(builder, { angle, height: .32 + rng() * .63, width: .0028 + rng() * .0034, lean: .25 + rng() * .33, baseX: Math.sin(angle) * .035, baseZ: Math.cos(angle) * .035, curl: (rng() - .5) * .25, shade: .90 + rng() * .10, dry: true });
  }
  return builder.finish('curled-dry-tussock', { seed, bladeCount: 7, coordinateSystem: 'rooted-plant', flexible: true });
}

export function createScreeGeometry({ seed = 18141, detail = 'near' } = {}) {
  const geometry = new THREE.IcosahedronGeometry(1, detail === 'distant' ? 0 : 1), positions = geometry.attributes.position, rng = random(seed), phases = [rng() * TAU, rng() * TAU, rng() * TAU];
  const colors = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex), y = positions.getY(vertex), z = positions.getZ(vertex);
    // Continuous deformation keeps coincident face vertices coincident. This
    // gives chips and a fractured underside without opening mesh cracks.
    const warp = .86 + .08 * Math.sin(x * 4.7 + phases[0]) * Math.cos(z * 3.9 + phases[1]) + .045 * Math.sin(y * 6.1 + phases[2]);
    positions.setXYZ(vertex, x * warp * (1 + .075 * z), Math.max(-.58, y * warp) * .92, z * warp * (1 - .06 * x));
    const shade = .79 + .14 * (y + 1) * .5 + .07 * Math.sin(x * 9 + z * 7);
    colors.set([shade * .97, shade, shade * .98], vertex * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.name = 'fractured-low-profile-scree'; geometry.userData = { seed, detail, modelVersion: ENVIRONMENT_MODEL_VERSION, triangles: positions.count / 3, visualMicrodetail: true };
  return geometry;
}
