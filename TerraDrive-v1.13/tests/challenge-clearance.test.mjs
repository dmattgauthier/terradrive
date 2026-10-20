import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { createChallengeView } from '../dist/src/challenge-view.js';

// The same gate can be replayed against an immutable published geometry module
// without changing the working source or replacing the renderer/collision test.
const sourceArgument = process.argv.indexOf('--course-module');
const courseSource = sourceArgument >= 0 ? pathToFileURL(resolve(process.argv[sourceArgument + 1]))
  : new URL('../dist/src/challenge-course.js', import.meta.url);
const { createChallengeCourse, challengeLoopFrame, CHALLENGE_LOOP } = await import(courseSource.href);
const courseModuleSHA256 = createHash('sha256').update(readFileSync(courseSource)).digest('hex');

const add = (a, b) => a.map((value, i) => value + b[i]);
const sub = (a, b) => a.map((value, i) => value - b[i]);
const mul = (a, s) => a.map(value => value * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => mul(a, 1 / Math.hypot(...a));
const xyz = p => [p.x, p.y, p.z];
const course = createChallengeCourse();
const largest = {
  length: Math.max(...VEHICLES.map(vehicle => vehicle.length)),
  height: Math.max(...VEHICLES.map(vehicle => vehicle.height)),
  width: Math.max(...VEHICLES.map(vehicle => vehicle.widthWithMirrors || vehicle.width)),
};
// A conservative combined envelope includes the longest/tallest catalogue
// vehicle and the widest mirrors. Its center can occupy every lateral position
// of the 8.8 m lane; the body and mirrors may extend beyond the painted edge.
// Extra height/width allow suspension motion and sampling/orientation error.
const envelope = { halfWidth: CHALLENGE_LOOP.width / 2 + largest.width / 2 + .2,
  halfLength: largest.length / 2 + .25, bottom: .1, top: largest.height + .55 };

function boxOBB(box) {
  const q = new THREE.Quaternion(box.quaternion.x, box.quaternion.y, box.quaternion.z, box.quaternion.w);
  return { center: xyz(box.center), axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(axis => new THREE.Vector3(...axis).applyQuaternion(q).toArray()),
    half: xyz(box.size).map(value => value / 2), id: box.id };
}

/** Exact separating-axis test for two oriented boxes. A positive result is
 * a separation lower bound in metres; a negative value denotes overlap. */
function separation(a, b) {
  const delta = sub(a.center, b.center), axes = [...a.axes, ...b.axes];
  for (const u of a.axes) for (const v of b.axes) axes.push(cross(u, v));
  let best = -Infinity;
  for (const axis of axes) {
    const length = Math.hypot(...axis); if (length < 1e-10) continue;
    const radius = (box) => box.axes.reduce((sum, direction, i) => sum + Math.abs(dot(axis, direction)) * box.half[i], 0);
    best = Math.max(best, (Math.abs(dot(delta, axis)) - radius(a) - radius(b)) / length);
  }
  return best;
}

function frameOBB(frame, featureId, station) {
  const normal = xyz(frame.normal);
  return { id: `${featureId}:${station}`, featureId, station,
    center: add(xyz(frame.point), mul(normal, (envelope.top + envelope.bottom) / 2)),
    axes: [xyz(frame.across), normal, xyz(frame.tangent)],
    half: [envelope.halfWidth, (envelope.top - envelope.bottom) / 2, envelope.halfLength] };
}

function drivingEnvelopes() {
  const volumes = [];
  for (let i = 0; i <= 1200; i++) volumes.push(frameOBB(challengeLoopFrame(i / 1200 * Math.PI * 2), 'loop', i));
  for (const id of ['loop-runup', 'loop-exit']) {
    const profiles = course.features.find(feature => feature.id === id).profiles;
    for (let i = 0; i < profiles.length - 1; i++) {
      const a = xyz(profiles[i].point), b = xyz(profiles[i + 1].point), tangent = unit(sub(b, a)), across = [1, 0, 0], normal = unit(cross(tangent, across));
      const count = Math.ceil(Math.hypot(...sub(b, a)) / .5);
      for (let j = 0; j <= count; j++) {
        const point = add(a, mul(sub(b, a), j / count));
        volumes.push(frameOBB({ point: { x: point[0], y: point[1], z: point[2] },
          tangent: { x: tangent[0], y: tangent[1], z: tangent[2] }, across: { x: 1, y: 0, z: 0 },
          normal: { x: normal[0], y: normal[1], z: normal[2] } }, id, `${i}-${j}`));
      }
    }
  }
  return volumes;
}

function audit() {
  const structures = course.boxes.filter(box => box.id.startsWith('loop-')).map(boxOBB), volumes = drivingEnvelopes();
  const overlaps = new Map(), byRoad = {}, byStructure = {}; let minimumSeparation = Infinity, closest;
  for (const structure of structures) for (const volume of volumes) {
    const distance = separation(structure, volume);
    if (distance < minimumSeparation) { minimumSeparation = distance; closest = { structure: structure.id, envelope: volume.id }; }
    const category = structure.id.startsWith('loop-crossmember-') ? 'deckFrames'
      : structure.id.startsWith('loop-support-crossbeam-') ? 'portalCrossbeams' : 'outboardPostsBracesFootings';
    for (const [summary, key] of [[byRoad, volume.featureId], [byStructure, category]]) {
      if (!summary[key] || distance < summary[key].separation) summary[key] = { separation: distance, structure: structure.id, envelope: volume.id };
    }
    if (distance < -1e-7) {
      const key = `${structure.id}/${volume.featureId}`, previous = overlaps.get(key);
      if (!previous || distance < previous.separation) overlaps.set(key, { structure: structure.id, feature: volume.featureId, station: volume.station, separation: distance });
    }
  }
  return { courseModuleSHA256, largest, envelope, samples: volumes.length, structures: structures.length, minimumSeparation, closest, byRoad, byStructure, overlaps: [...overlaps.values()] };
}

test('loop structures clear the entire lane and largest-vehicle headroom on approach, loop and exit', () => {
  const result = audit();
  if (process.argv.includes('--report')) console.log(JSON.stringify(result, null, 2));
  assert.equal(result.overlaps.length, 0, `Roadway obstruction: ${JSON.stringify(result.overlaps)}`);
  assert.ok(result.minimumSeparation >= .06, 'Keep at least 60 mm separation beyond the already expanded full-lane vehicle envelope');
});

test('oriented-envelope test detects side intrusion, overhead intrusion and clearance', () => {
  const road = { center: [0, 1.5, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], half: [4.4, 1.5, 3] };
  const box = (center, half) => ({ center, half, axes: road.axes });
  assert.ok(separation(road, box([4.3, 1, 0], [.3, 2, .3])) < 0);
  assert.ok(separation(road, box([0, 2.9, 0], [6, .2, .2])) < 0);
  assert.ok(separation(road, box([6, 1, 0], [.3, 2, .3])) > 1);
  assert.ok(separation(road, box([0, 3.5, 0], [6, .2, .2])) > .2);
});

test('all moved structural boxes retain exactly matching visible and collision transforms', () => {
  const view = createChallengeView(course), matrix = new THREE.Matrix4(), expected = new THREE.Matrix4(), dummy = new THREE.Object3D();
  for (const materialKey of ['steel', 'concrete', 'orange']) {
    const mesh = view.group.getObjectByName(`challenge-${materialKey}-structure`), boxes = course.boxes.filter(box => box.materialKey === materialKey);
    assert.equal(mesh.count, boxes.length);
    boxes.forEach((box, i) => {
      const collider = course.colliderGroups.find(group => group.id === box.id), shape = collider.shapes[0];
      assert.equal(shape.kind, 'box'); assert.deepEqual(collider.center, box.center); assert.deepEqual(shape.quaternion, box.quaternion);
      near(xyz(shape.halfExtents).map(value => value * 2), xyz(box.size), 1e-12);
      dummy.position.set(...xyz(box.center)); dummy.scale.set(...xyz(box.size)); dummy.quaternion.set(box.quaternion.x, box.quaternion.y, box.quaternion.z, box.quaternion.w); dummy.updateMatrix(); expected.copy(dummy.matrix);
      mesh.getMatrixAt(i, matrix); near(matrix.elements, expected.elements, 2e-5);
    });
  }
});

function near(a, b, tolerance) { a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) <= tolerance)); }
