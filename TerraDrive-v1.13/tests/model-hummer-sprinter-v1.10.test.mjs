import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { VehicleView } from '../dist/src/vehicle-view.js';
import { VEHICLES } from '../dist/src/vehicles.js';

function build(id) {
  const scene = new THREE.Scene(), spec = VEHICLES.find(vehicle => vehicle.id === id);
  const view = new VehicleView(scene, spec); scene.updateMatrixWorld(true);
  return { scene, spec, view };
}
function cast(view, point, direction) {
  const origin = view.body.localToWorld(new THREE.Vector3(...point));
  const hit = new THREE.Raycaster(origin, new THREE.Vector3(...direction), 0, 10).intersectObject(view.body, true)[0];
  return hit ? { material: hit.object.material, point: view.body.worldToLocal(hit.point.clone()) } : null;
}

test('Hummer and Sprinter curved doors stay outside their trim and retain real near-side glazing', () => {
  for (const id of ['hummer-ev-suv-3x', 'sprinter-2500']) {
    const { view, spec, scene } = build(id), hummer = spec.bodyStyle === 'hummer';
    try {
      const paintPoints = hummer ? [[.73, .40], [.91, .40], [1.12, .40], [1.30, .40], [.83, -.55], [1.18, -.55]]
        : [[1.12, .72], [1.32, 1.50], [1.05, -.30], [1.80, -2.10]];
      const glassPoints = hummer ? [[1.65, .10], [1.65, -.60], [1.70, -1.80]] : [[1.80, 1.10], [1.80, -.30]];
      for (const side of [-1, 1]) {
        for (const [y, z] of paintPoints) {
          const hit = cast(view, [side * 3, y, z], [-side, 0, 0]);
          assert.equal(hit?.material, view.materials.paint, `${id}: interior trim must not emerge through the near-side sheet at ${side}, ${y}, ${z}`);
          assert.ok(hit.point.x * side > .94);
        }
        for (const [y, z] of glassPoints) {
          const hit = cast(view, [side * 3, y, z], [-side, 0, 0]);
          assert.ok(hit?.material.userData.vehicleGlass, `${id}: glazing must close the actual near-side aperture at ${side}, ${y}, ${z}`);
          assert.ok(hit.point.x * side > .94);
        }
      }
      const bounds = new THREE.Box3().setFromObject(view.body), size = bounds.getSize(new THREE.Vector3());
      const mirrorSpan = hummer ? spec.widthWithMirrors : 2.426; // Mercedes standard-roof Crew bodybuilder drawing.
      assert.ok(Math.abs(size.x - mirrorSpan) < .002, `${id}: preserve the standard-mirror span`);
      assert.ok(Math.abs(size.z - spec.length) < (hummer ? .04 : .002), `${id}: preserve the catalogued package length`);
      const fixedMaterials = [view.materials.black, view.materials.glass, view.materials.privacyGlass, view.materials.interior];
      const fixedColors = fixedMaterials.map(material => material.color.getHexString());
      view.setPaint(hummer ? '#245c83' : '#d9dfe2');
      assert.deepEqual(fixedMaterials.map(material => material.color.getHexString()), fixedColors, 'Paint must leave glass and molded cabin/outer trim independent');
    } finally { view.dispose(); assert.equal(scene.children.length, 0); }
  }
});

test('Hummer door shut lines remain visible across the broad curved middle of both front doors', () => {
  const { view } = build('hummer-ev-suv-3x');
  try {
    // The former long parameter-space chords sank behind the door between
    // 1.0 and 1.2 m even though the seam vertices at its ends were outside it.
    for (const side of [-1, 1]) for (const y of [.68, .75, .83, .91, 1.01, 1.09, 1.17, 1.25, 1.31]) {
      let seamHits = 0;
      for (let offset = -10; offset <= 10; offset++) {
        const hit = cast(view, [side * 3, y, -.197 + offset * .001], [-side, 0, 0]);
        if (hit?.material === view.materials.dark) {
          seamHits++;
          assert.ok(hit.point.x * side > .96, 'Count the exterior shut line, not a dark part inside the cabin');
        }
      }
      assert.ok(seamHits >= 2, `The near-side seam must cross every inspected row: side ${side}, height ${y}`);
    }
  } finally { view.dispose(); }
});

test('Hummer formed bumper retains open optics and its front wheel flares terminate at the bumper', () => {
  const { view, spec } = build('hummer-ev-suv-3x');
  try {
    for (const side of [-1, 1]) {
      const lamp = cast(view, [side * .847, .94, 4], [0, 0, -1]);
      assert.equal(lamp?.material, view.materials.lens, 'Separate clear headlamp covers must be visible inside the real fascia openings');
      const formerFin = cast(view, [side * 3, .55, spec.wheelbase / 2 + .68], [-side, 0, 0]);
      assert.ok(!formerFin || formerFin.point.x * side < .95, 'The forward wheel flare must not hang outside the formed bumper as a broad unsupported fin');
    }
  } finally { view.dispose(); }
});
