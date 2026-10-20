import * as THREE from '../vendor/three.module.js';

/** Four independent rubber conversion modules, each steered with its hub.
 * Belt motion follows integrated drive rotation, never wall-clock animation. */
export function createTrackModule(spec, materials) {
  const root = new THREE.Group(), tireSpin = new THREE.Group(), rimSpin = new THREE.Group();
  const { length, width } = spec.tracks, r = spec.tireRadius;
  root.name = 'snow-flotation-track';
  const outline = [[-length / 2, -r + .028], [length / 2, -r + .028],
    [length / 2 + .06, -r + .20], [.19, .21], [-.19, .21], [-length / 2 - .06, -r + .20]];
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const cy = -.12;
  const hole = new THREE.Path(outline.slice().reverse().map(([z, y]) => new THREE.Vector2(z * .85, cy + (y - cy) * .80)));
  shape.holes.push(hole);
  const beltGeometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: .008, bevelThickness: .008, bevelSegments: 1, steps: 1 });
  beltGeometry.translate(0, 0, -width / 2); beltGeometry.rotateY(Math.PI / 2);
  const belt = new THREE.Mesh(beltGeometry, materials.rubber); belt.name = 'continuous-rubber-belt';
  belt.castShadow = belt.receiveShadow = true; root.add(belt);
  const rollerGroup = new THREE.Group(); root.add(rollerGroup);
  const roller = (z, y, radius) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width * .78, 16), materials.dark);
    mesh.rotation.z = Math.PI / 2; mesh.position.set(0, y, z); mesh.castShadow = true; rollerGroup.add(mesh);
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * .59, radius * .59, .015, 12), materials.rim);
      cap.rotation.z = Math.PI / 2; cap.position.set(side * width * .405, y, z); rollerGroup.add(cap);
    }
  };
  for (const fraction of [-.39, -.19, 0, .19, .39]) roller(length * fraction, -r + .14, .105);
  roller(0, .025, .17);
  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(.024, .08, length * .78), materials.dark);
    frame.position.set(side * width * .39, -r + .21, 0); frame.castShadow = true; root.add(frame);
  }
  const count = 52;
  const lugs = new THREE.InstancedMesh(new THREE.BoxGeometry(width + .035, .052, .067), materials.tread, count);
  lugs.name = 'circulating-track-grousers'; lugs.castShadow = lugs.receiveShadow = true;
  lugs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(lugs);
  const segments = outline.map((p, i) => {
    const q = outline[(i + 1) % outline.length]; return { p, q, length: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
  const perimeter = segments.reduce((sum, segment) => sum + segment.length, 0), dummy = new THREE.Object3D();
  let previousPhase = NaN;
  function update(data = {}) {
    const phase = ((data.rotation || 0) * r % perimeter + perimeter) % perimeter;
    if (phase === previousPhase) return;
    previousPhase = phase;
    for (let index = 0; index < count; index++) {
      let distance = (index / count * perimeter + phase) % perimeter, segment = segments[0];
      for (const candidate of segments) { segment = candidate; if (distance <= candidate.length) break; distance -= candidate.length; }
      const t = Math.min(1, distance / segment.length), [z0, y0] = segment.p, [z1, y1] = segment.q;
      dummy.position.set(0, y0 + (y1 - y0) * t, -(z0 + (z1 - z0) * t));
      dummy.rotation.set(Math.atan2(-(y1 - y0), -(z1 - z0)), 0, 0); dummy.updateMatrix(); lugs.setMatrixAt(index, dummy.matrix);
    }
    lugs.instanceMatrix.needsUpdate = true; lugs.computeBoundingSphere();
  }
  update();
  root.userData.track = { length, width, areaM2: length * width, grouserCount: count, perimeter };
  return { root, tireShape: new THREE.Group(), tireSpin, rimSpin, deformation: { update() {} },
    rimRadius: .17, spare: false, track: { update, lugs, perimeter } };
}
