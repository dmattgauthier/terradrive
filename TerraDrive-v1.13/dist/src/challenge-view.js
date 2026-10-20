import * as THREE from '../vendor/three.module.js';
import { CHALLENGE_VERSION, CHALLENGE_LOOP } from './challenge-course.js?v=1.15.0';

const vector = p => new THREE.Vector3(p.x, p.y, p.z);
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const flat = points => points.flatMap(p => [p.x, p.y, p.z]);

function geometry(positions, normals = null, uv = null) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); else g.computeVertexNormals();
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

function topGeometry(feature) {
  const positions = [], normals = [], uv = [];
  for (const t of feature.triangles) {
    positions.push(...flat([t.a, t.b, t.c])); normals.push(...flat(feature.loop ? t.vertexNormals : [t.normal, t.normal, t.normal])); uv.push(...t.uv.flat());
  }
  return geometry(positions, normals, uv);
}

function solidGeometry(course, featureId) {
  const positions = [];
  for (const group of course.colliderGroups.filter(g => g.featureId === featureId)) for (const shape of group.shapes) {
    if (shape.kind !== 'convex') continue;
    const origin = add(group.center, shape.offset), points = shape.vertices.map(p => add(origin, p));
    for (const face of shape.faces.slice(1)) for (let j = 1; j < face.length - 1; j++) positions.push(...flat([points[face[0]], points[face[j]], points[face[j + 1]]]));
  }
  return geometry(positions);
}

function ribbon(feature, start, end, offset = .008) {
  const positions = [], normals = [];
  for (let i = 0; i < feature.profiles.length - 1; i++) {
    const p = feature.profiles[i], q = feature.profiles[i + 1];
    const corner = (f, u) => add(add(f.point, mul(f.across, u)), mul(f.normal, offset));
    positions.push(...flat([corner(p, start), corner(q, start), corner(p, end), corner(p, end), corner(q, start), corner(q, end)]));
    normals.push(...flat([p.normal, q.normal, p.normal, p.normal, q.normal, q.normal]));
  }
  return geometry(positions, normals);
}

function addMesh(parent, name, geo, material, { shadow = true, paint = false } = {}) {
  const mesh = new THREE.Mesh(geo, material); mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = true;
  mesh.userData.challenge = true; mesh.userData.challengePaint = paint; parent.add(mesh); return mesh;
}

/** Build the visible course from the data used by tire/chassis physics.
 * `texture(filename,color)` is optional and may use the world's existing cache.
 * No additional network request or document/canvas dependency is required. */
export function createChallengeView(course, { texture } = {}) {
  const group = new THREE.Group(); group.name = 'summit-challenge-park';
  group.userData.challengeVersion = CHALLENGE_VERSION;
  const surfaceTextures = texture ? { map: texture('asphalt_02_diff_1k.jpg', true), normalMap: texture('asphalt_02_nor_gl_1k.jpg'), roughnessMap: texture('asphalt_02_rough_1k.jpg') } : {};
  const asphalt = new THREE.MeshStandardMaterial({ color: '#a4a9a5', roughness: .88, normalScale: new THREE.Vector2(.52, .52), ...surfaceTextures });
  const concrete = new THREE.MeshStandardMaterial({ color: '#ada99e', roughness: .92, normalScale: new THREE.Vector2(.23, .23), ...surfaceTextures });
  const concreteSide = new THREE.MeshStandardMaterial({ color: '#88897e', roughness: .95 });
  const steel = new THREE.MeshStandardMaterial({ color: '#637773', metalness: .62, roughness: .53 });
  const orange = new THREE.MeshStandardMaterial({ color: '#d78635', metalness: .17, roughness: .64 });
  const white = new THREE.MeshStandardMaterial({ color: '#e2dccc', roughness: .82, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const black = new THREE.MeshStandardMaterial({ color: '#293631', roughness: .86, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const materials = { asphalt, concrete, concreteSide, steel, orange, white, black }, records = new Map();
  for (const feature of course.features) {
    const part = new THREE.Group(); part.name = `challenge-feature-${feature.id}`; part.userData.featureId = feature.id; group.add(part);
    const deck = addMesh(part, `challenge-${feature.id}-contact-deck`, topGeometry(feature), feature.materialKey === 'concrete' ? concrete : asphalt);
    deck.userData.contactFeatureId = feature.id; deck.userData.contactTriangles = feature.triangles.length;
    const sides = addMesh(part, `challenge-${feature.id}-solid-sides`, solidGeometry(course, feature.id), feature.loop ? orange : concreteSide);
    const paint = feature.loop ? orange : white;
    if (!feature.id.startsWith('articulation-')) for (const side of [-1, 1]) {
      const outer = feature.width / 2 - .12, inner = outer - (feature.loop ? .22 : .10);
      addMesh(part, `challenge-${feature.id}-edge-${side}`, ribbon(feature, side > 0 ? inner : -outer, side > 0 ? outer : -inner), paint, { shadow: false, paint: true });
    }
    records.set(feature.id, { feature, group: part, deck, sides });
  }
  // Structural members share the same rigid boxes as their Cannon colliders.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
  for (const materialKey of ['steel', 'concrete', 'orange']) {
    const boxes = course.boxes.filter(box => box.materialKey === materialKey); if (!boxes.length) continue;
    const mesh = new THREE.InstancedMesh(boxGeometry, materials[materialKey], boxes.length); mesh.name = `challenge-${materialKey}-structure`; mesh.castShadow = mesh.receiveShadow = true; mesh.userData.challenge = true;
    boxes.forEach((box, i) => {
      dummy.position.copy(vector(box.center)); dummy.quaternion.set(box.quaternion.x, box.quaternion.y, box.quaternion.z, box.quaternion.w); dummy.scale.set(box.size.x, box.size.y, box.size.z); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
  }
  const whitePositions = [], blackPositions = [];
  const quad = (array, x, z, w, d, y) => array.push(x, y, z, x, y, z + d, x + w, y, z, x + w, y, z, x, y, z + d, x + w, y, z + d);
  const p = CHALLENGE_LOOP;
  for (const [x, z] of [[p.x, -167], [p.x + p.lateralOffset, 143]]) for (let row = 0; row < 2; row++) for (let col = 0; col < 14; col++) quad((row + col) % 2 ? blackPositions : whitePositions, x - 4.2 + col * .6, z + row * .6, .6, .6, p.y + .012);
  // Simple direction arrows are paint, and occupy the actual solid runway.
  for (const z of [-151, -112, -73, -34, 9]) {
    const x = p.x, y = p.y + .014;
    quad(whitePositions, x - .14, z, .28, 2.15, y);
    whitePositions.push(x - .87, y, z + 1.95, x, y, z + 3.45, x + .87, y, z + 1.95);
  }
  if (whitePositions.length) addMesh(group, 'challenge-white-markings', geometry(whitePositions), white, { shadow: false, paint: true });
  if (blackPositions.length) addMesh(group, 'challenge-black-markings', geometry(blackPositions), black, { shadow: false, paint: true });
  group.userData.contactTriangles = course.triangles.length;
  return { group, records, materials };
}
