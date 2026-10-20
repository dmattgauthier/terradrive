import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import * as CANNON from '../dist/vendor/cannon-es.js';
import { CHALLENGE_PAD, CHALLENGE_LOOP, CHALLENGE_ZONE, createChallengeCourse, challengeLoopFrame, challengeGroundHeight, challengeGroundCoverAt, challengeReservedAt } from '../dist/src/challenge-course.js';
import { createChallengeView } from '../dist/src/challenge-view.js';

const course = createChallengeCourse(), view = createChallengeView(course);
view.group.updateMatrixWorld(true);
const add = (p, n, scale) => ({ x: p.x + n.x * scale, y: p.y + n.y * scale, z: p.z + n.z * scale });
const negative = n => ({ x: -n.x, y: -n.y, z: -n.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test('challenge grading joins the existing road and leaves distant natural terrain untouched', () => {
  assert.equal(challengeGroundHeight(-230, -150, 14), CHALLENGE_PAD.height);
  assert.equal(challengeGroundHeight(0, 0, 7.215), 7.215);
  assert.equal(challengeGroundHeight(120, 120, 8.4), 8.4);
  assert.ok(Math.abs(challengeGroundHeight(-108, -150, 9) - 3.675) < 1e-10);
  for (let x = -276; x <= -88; x += 2) for (let z = -220; z <= 184; z += 4) {
    const cover = challengeGroundCoverAt(x, z);
    if (cover) { assert.ok(Object.values(cover).every(value => value >= -1e-12 && value <= 1)); assert.ok(Math.abs(cover.hardpack + cover.gravel + cover.grass - 1) < 1e-12); }
  }
  assert.ok(challengeReservedAt(CHALLENGE_ZONE.spawn.x, CHALLENGE_ZONE.spawn.z));
  assert.ok(challengeReservedAt(-125, -150)); assert.equal(challengeReservedAt(110, 110), false);
});

test('loop separates entrance and exit and has smooth upright, wall and inverted frames', () => {
  const entry = challengeLoopFrame(0), top = challengeLoopFrame(Math.PI), exit = challengeLoopFrame(Math.PI * 2);
  assert.equal(top.point.y - entry.point.y, 40);
  assert.ok(exit.point.x - entry.point.x > CHALLENGE_LOOP.width + 4);
  assert.ok(Math.abs(entry.radius - 45) < 1e-10); assert.ok(top.radius > 10 && top.radius < 12);
  assert.ok(entry.tangent.z > .999 && exit.tangent.z > .999); assert.ok(top.normal.y < -.999);
  let horizontalNormals = 0;
  for (let i = 0; i <= 720; i++) {
    const f = challengeLoopFrame(i * Math.PI / 360);
    for (const n of [f.tangent, f.normal, f.across]) assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-10);
    assert.ok(Math.abs(dot(f.normal, f.tangent)) < 1e-10 && Math.abs(dot(f.normal, f.across)) < 1e-10 && Math.abs(dot(f.across, f.tangent)) < 1e-10);
    assert.ok(f.curvature > 0 && Number.isFinite(f.curvature)); if (Math.abs(f.normal.y) < .1) horizontalNormals++;
  }
  assert.ok(horizontalNormals > 10);
});

test('swept tires retain support across every loop seam and radius without artificial underside adhesion', () => {
  for (const radius of [.28, .45, .62]) for (let i = 0; i < 360; i++) {
    const f = challengeLoopFrame(i * Math.PI / 180), origin = add(f.point, f.normal, radius + .50);
    const hit = course.castSuspension(origin, negative(f.normal), radius, -.20, 1.2);
    assert.ok(hit, `${i} degrees, radius ${radius}: missing sphere contact`);
    assert.ok(Math.abs(hit.distance - .50) < .002, `${i} degrees: radius-offset distance`);
    assert.ok(dot(hit.normal, f.normal) > .999);
    assert.ok(['loop', 'loop-runup', 'loop-exit'].includes(hit.featureId)); assert.equal(hit.constructed, true);
    const backside = course.castSuspension(add(f.point, f.normal, -radius - .4), f.normal, radius, 0, .9);
    assert.equal(backside, null, `${i} degrees: road underside must not support tires`);
  }
});

test('the gap is truly unsupported and footprint projection ends at deck edges', () => {
  for (const z of [1.5, 3, 5, 7, 8.5]) assert.equal(course.castSuspension({ x: -183, y: 10, z }, { x: 0, y: -1, z: 0 }, .45, 0, 7), null);
  const f = challengeLoopFrame(Math.PI), center = course.projectFootprint(f.point, f.normal, 'loop');
  assert.ok(center && center.normal.y < -.99);
  assert.equal(course.projectFootprint(add(f.point, f.across, CHALLENGE_LOOP.width / 2 + .35), f.normal, 'loop'), null);
  const landing = course.castSuspension({ x: -183, y: 10, z: 14 }, { x: 0, y: -1, z: 0 }, .45, 0, 7);
  assert.equal(landing?.featureId, 'gap-landing');
});

test('Three ray hits agree with contact faces throughout the vertical loop', () => {
  const deck = view.records.get('loop').deck;
  for (let i = 1; i < 72; i++) {
    const f = challengeLoopFrame(i / 72 * Math.PI * 2 + .0013), point = add(f.point, f.across, i % 2 ? .83 : -1.13), origin = add(point, f.normal, 1.2), direction = negative(f.normal);
    const hit = course.castSuspension(origin, direction, 0, 0, 2);
    const ray = new THREE.Raycaster(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(direction.x, direction.y, direction.z), 0, 2);
    const intersections = ray.intersectObject(deck);
    assert.ok(hit && intersections.length, `${i}: both render and contact geometry must be present`);
    assert.ok(intersections[0].point.distanceTo(new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)) < .000035, `${i}: visual/physics surface mismatch`);
  }
});

test('all rigid deck volumes are valid outward Cannon convexes with the same visible top vertices', () => {
  let convexCount = 0, warnings = 0;
  const oldError = console.error; console.error = () => { warnings++; };
  try {
    for (const group of course.colliderGroups) for (const source of group.shapes) {
      if (source.kind !== 'convex') continue;
      const shape = new CANNON.ConvexPolyhedron({ vertices: source.vertices.map(p => new CANNON.Vec3(p.x, p.y, p.z)), faces: source.faces });
      assert.ok(shape.boundingSphereRadius > 0 && Number.isFinite(shape.boundingSphereRadius));
      for (let j = 0; j < shape.faces.length; j++) {
        const normal = shape.faceNormals[j], anchor = shape.vertices[shape.faces[j][0]];
        for (const point of shape.vertices) assert.ok(point.vsub(anchor).dot(normal) <= 2e-7, `${group.id}: nonconvex or inward face`);
      }
      convexCount++;
    }
  } finally { console.error = oldError; }
  assert.equal(warnings, 0); assert.equal(convexCount, course.triangles.length);
  for (const feature of course.features) {
    const positions = view.records.get(feature.id).deck.geometry.getAttribute('position');
    assert.equal(positions.count, feature.triangles.length * 3);
    feature.triangles.forEach((t, i) => [t.a, t.b, t.c].forEach((p, j) => {
      assert.ok(Math.abs(positions.getX(i * 3 + j) - p.x) < .000016 && Math.abs(positions.getY(i * 3 + j) - p.y) < .000004 && Math.abs(positions.getZ(i * 3 + j) - p.z) < .000016);
    }));
  }
});

test('course complexity is bounded and invalid cast inputs fail cleanly', () => {
  assert.ok(course.triangles.length <= 5000); assert.ok(course.colliderGroups.length <= 260); assert.ok(course.boxes.length <= 90);
  assert.equal(course.castSuspension({ x: NaN, y: 4, z: 0 }, { x: 0, y: -1, z: 0 }), null);
  assert.equal(course.castSuspension({ x: 0, y: 4, z: 0 }, { x: 0, y: 0, z: 0 }), null);
  assert.equal(course.castSuspension({ x: 0, y: 4, z: 0 }, { x: 0, y: -1, z: 0 }, -.2), null);
});
