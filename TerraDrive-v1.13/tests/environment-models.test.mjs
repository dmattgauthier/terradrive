import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { createPineFoliageGeometry, createPineBranchGeometry, createPineTrunkGeometry, createBrokenStumpGeometry, createMeadowGrassGeometry, createMarshSedgeGeometry, createDryTussockGeometry, createScreeGeometry, REED_SEEDHEAD_ANCHOR, PINE_TWIG_UV_CROP } from '../dist/src/environment-models.js';
import { createImportedGroundRockGeometry, IMPORTED_GROUND_ROCK } from '../dist/src/imported-ground-rock.js';

const factories = {
  pineFoliage: createPineFoliageGeometry, pineBranches: createPineBranchGeometry,
  pineTrunk: createPineTrunkGeometry, brokenStump: createBrokenStumpGeometry, meadowNear: createMeadowGrassGeometry,
  meadowDistant: () => createMeadowGrassGeometry({ detail: 'distant' }),
  marshSedge: createMarshSedgeGeometry, dryTussock: createDryTussockGeometry, scree: createScreeGeometry, screeDistant: () => createScreeGeometry({ detail: 'distant' }),
};

test('Scenery meshes remain finite, nondegenerate, correctly bounded, and inexpensive to instance', () => {
  const budgets = { pineFoliage: 1800, pineBranches: 490, pineTrunk: 160, brokenStump: 96, meadowNear: 108, meadowDistant: 42, marshSedge: 84, dryTussock: 84, scree: 80, screeDistant: 20 };
  for (const [name, factory] of Object.entries(factories)) {
    const geometry = factory(), position = geometry.attributes.position, normal = geometry.attributes.normal;
    const index = geometry.index?.array || Array.from({ length: position.count }, (_, i) => i);
    assert.ok(index.length / 3 <= budgets[name], `${name}: bounded per-instance triangle count`);
    for (const attribute of Object.values(geometry.attributes)) {
      assert.equal(attribute.count, position.count, `${name}: every field has the same vertex count`);
      assert.ok(Array.from(attribute.array).every(Number.isFinite), `${name}: all fields are finite`);
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let triangle = 0; triangle < index.length; triangle += 3) {
      a.fromBufferAttribute(position, index[triangle]); b.fromBufferAttribute(position, index[triangle + 1]); c.fromBufferAttribute(position, index[triangle + 2]);
      assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-20, `${name}: triangles have actual area`);
    }
    for (let vertex = 0; vertex < normal.count; vertex++) assert.ok(Math.abs(Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)) - 1) < 1e-5, `${name}: finite unit lighting normal`);
    assert.ok(Number.isFinite(geometry.boundingSphere.radius) && geometry.boundingSphere.radius > 0);
    assert.equal(geometry.groups.length, 0, `${name}: no hidden additional material draws`);
    geometry.dispose();
  }
});

test('Pine branches and foliage share deterministic anatomy without sampling cones or bark from the atlas', () => {
  const foliage = createPineFoliageGeometry(), branches = createPineBranchGeometry();
  assert.equal(foliage.userData.seed, branches.userData.seed);
  assert.equal(foliage.userData.branchCount, branches.userData.branchCount);
  assert.equal(foliage.userData.coordinateSystem, branches.userData.coordinateSystem);
  const repeat = createPineFoliageGeometry();
  assert.deepEqual(foliage.attributes.position.array, repeat.attributes.position.array, 'Reloads retain branch placement');
  assert.notDeepEqual(foliage.attributes.position.array, createPineFoliageGeometry(9127).attributes.position.array, 'A variant seed changes the actual crown geometry');
  const uv = foliage.attributes.uv;
  for (let vertex = 0; vertex < uv.count; vertex++) {
    assert.ok(uv.getX(vertex) >= PINE_TWIG_UV_CROP.uMin && uv.getX(vertex) <= PINE_TWIG_UV_CROP.uMax, 'Twig UV stays inside the audited needle crop');
    assert.ok(uv.getY(vertex) >= PINE_TWIG_UV_CROP.vMin && uv.getY(vertex) <= PINE_TWIG_UV_CROP.vMax, 'Twig UV cannot enter opaque atlas background, bark or cones');
  }
  const audit = JSON.parse(readFileSync(new URL('../docs/pine-atlas-v1.8-uv-audit.json', import.meta.url)));
  assert.equal(createHash('sha256').update(readFileSync(new URL(`../${audit.source.path}`, import.meta.url))).digest('hex'), audit.source.sha256, 'The audited alpha image is the actual runtime source');
  assert.deepEqual(PINE_TWIG_UV_CROP, audit.safeCrop.uvPixelCenters, 'Geometry uses the exact background-free crop audited offline');
  assert.equal(audit.safeCrop.connectedBackgroundPixels, 0);
  assert.ok(audit.safeCrop.retainedNeedleFraction > .90 && audit.safeCrop.minimumBackgroundDistancePixels >= 8);
  // Every main woody branch starts at the crown axis and leaves a nonzero
  // visible bough. If foliage uses a different seed, the contract above fails.
  const positions = branches.attributes.position;
  for (let branch = 0; branch < branches.userData.branchCount; branch++) {
    const root = new THREE.Vector3(), tip = new THREE.Vector3();
    for (let ringVertex = 0; ringVertex < 3; ringVertex++) {
      root.add(new THREE.Vector3().fromBufferAttribute(positions, branch * 12 + ringVertex));
      tip.add(new THREE.Vector3().fromBufferAttribute(positions, branch * 12 + 8 + ringVertex));
    }
    root.multiplyScalar(1 / 3); tip.multiplyScalar(1 / 3);
    assert.ok(Math.hypot(root.x, root.z) < 1e-7, 'A bough joins the trunk instead of floating beside it');
    assert.ok(tip.distanceTo(root) > .025, 'Bough has a real length');
  }
  assert.ok(createPineTrunkGeometry().userData.triangles + branches.userData.triangles <= 650, 'All woody tree geometry remains within the combined budget');
});

test('Ridged trunk preserves collision and impact-scar envelopes with outward-facing surfaces', () => {
  const geometry = createPineTrunkGeometry(), position = geometry.attributes.position;
  assert.equal(geometry.boundingBox.min.y, -.5); assert.equal(geometry.boundingBox.max.y, .5);
  for (let vertex = 0; vertex < position.count; vertex++) {
    const y = position.getY(vertex), radius = Math.hypot(position.getX(vertex), position.getZ(vertex));
    if (y >= -.493001) assert.ok(radius <= 1 - (y + .5) * .75 + 1e-6, 'Scar projection remains outside the bark ridges');
    for (const height of [7.4, 12, 18.2]) assert.ok(radius * (.19 + height * .005) <= .24 + height * .005 + 1e-6, 'Root flare fits the existing trunk collider at every supported height');
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ side: THREE.FrontSide }));
  mesh.scale.set(.255, 12, .255); mesh.position.y = 6; mesh.updateMatrixWorld(true);
  for (const height of [.35, 1.0, 2.0, 5.0]) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
    const radial = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const origin = radial.clone().multiplyScalar(.5); origin.y = height;
    const ray = new THREE.Raycaster(origin, radial.clone().negate(), 0, .6), hit = ray.intersectObject(mesh)[0];
    assert.ok(hit, 'Outward bark triangles are visible and can receive an impact mark');
    const expected = (1 - height / 12 * .75) * .255;
    assert.ok(Math.abs(Math.hypot(hit.point.x, hit.point.z) - expected) < .020, 'Bark stays close enough to the analytic scar surface for marks to remain attached');
  }
});

test('Plant detail levels retain the shared leaf silhouette and anchored wind weights', () => {
  const near = createMeadowGrassGeometry(), distant = createMeadowGrassGeometry({ detail: 'distant' });
  const key = (geometry, vertex) => ['X', 'Y', 'Z'].map(axis => geometry.attributes.position[`get${axis}`](vertex)).concat(geometry.attributes.aPlantBend.getX(vertex)).join('|');
  const nearEdges = new Set(Array.from({ length: near.attributes.position.count }, (_, vertex) => key(near, vertex)));
  for (let vertex = 0; vertex < distant.attributes.position.count; vertex++) assert.ok(nearEdges.has(key(distant, vertex)), 'The distant leaf edges retain exact positions and wind weights in the fuller close clump');
  assert.equal(distant.userData.bladeCount, 7); assert.equal(near.userData.bladeCount, 14);
  for (const geometry of [near, distant, createMarshSedgeGeometry(), createDryTussockGeometry()]) {
    const position = geometry.attributes.position, bend = geometry.attributes.aPlantBend;
    assert.ok(position.count === bend.count);
    let fixedRoots = 0, flexibleTips = 0;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const weight = bend.getX(vertex);
      assert.ok(weight >= 0 && weight <= 1, 'Wind response stays normalized after scene batching');
      if (position.getY(vertex) < .004 && weight === 0) fixedRoots++;
      if (weight === 1 && position.getY(vertex) > .2) flexibleTips++;
    }
    assert.ok(fixedRoots >= 10, 'Plant bases remain fixed in the ground');
    assert.ok(flexibleTips >= 5, 'Leaf tips retain flexibility even after instance geometry is baked');
  }
  const p = distant.attributes.position;
  for (let blade = 0; blade < 7; blade++) {
    const a = new THREE.Vector3().fromBufferAttribute(p, blade * 8), b = new THREE.Vector3().fromBufferAttribute(p, blade * 8 + 1);
    assert.ok(a.distanceTo(b) < .0245, 'Meadow leaves are narrow blades rather than broad polygon fans');
  }
});

test('Marsh seed heads have a modeled stalk endpoint and dry plants use a distinct curled silhouette', () => {
  const sedge = createMarshSedgeGeometry(), anchor = new THREE.Vector3(REED_SEEDHEAD_ANCHOR.x, REED_SEEDHEAD_ANCHOR.y, REED_SEEDHEAD_ANCHOR.z), p = sedge.attributes.position;
  const tip = new THREE.Vector3();
  // The final five vertices are the closed-UV ring at the actual stalk tip.
  for (let vertex = p.count - 5; vertex < p.count - 1; vertex++) tip.add(new THREE.Vector3().fromBufferAttribute(p, vertex));
  tip.multiplyScalar(.25);
  assert.ok(tip.distanceTo(anchor) < 1e-6, 'Seed-head anchor exactly equals the modeled stem tip');
  const meadow = createMeadowGrassGeometry(), dry = createDryTussockGeometry();
  assert.ok(dry.boundingBox.max.x - dry.boundingBox.min.x > (meadow.boundingBox.max.x - meadow.boundingBox.min.x) * 1.1, 'Dry vegetation actually curls outward, not just a recolor of green grass');
  const stone = createScreeGeometry();
  assert.ok(stone.boundingBox.min.y > -.6 && stone.boundingBox.max.y <= 1, 'Clipped underside retains the sub-6 cm ground-detail placement contract');
});

test('Broken stump retains the old collider envelope and an actual irregular break surface', () => {
  const geometry = createBrokenStumpGeometry(), position = geometry.attributes.position;
  for (let vertex = 0; vertex < position.count; vertex++) {
    assert.ok(Math.hypot(position.getX(vertex), position.getZ(vertex)) <= 1 + 1e-7);
    assert.ok(position.getY(vertex) >= -.5 && position.getY(vertex) <= .5);
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true })); mesh.updateMatrixWorld(true);
  const heights = [];
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
    const ray = new THREE.Raycaster(new THREE.Vector3(Math.sin(angle) * .76, 1, Math.cos(angle) * .76), new THREE.Vector3(0, -1, 0), 0, 2);
    const hit = ray.intersectObject(mesh)[0]; assert.ok(hit, 'Break cap is closed and visible from above'); heights.push(hit.point.y);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > .07, 'Broken edge has geometric splinter relief');
});

test('Imported rock LOD preserves original UV/normal vertices, exact bounds, and a small runtime payload', () => {
  const sourceUrl = new URL('../dist/assets/terrain/rock_moss_set_01/rock_moss_set_01_2k.gltf', import.meta.url), gltf = JSON.parse(readFileSync(sourceUrl));
  const buffers = gltf.buffers.map(buffer => readFileSync(new URL(buffer.uri, sourceUrl))), primitive = gltf.meshes[2].primitives[0];
  const accessor = index => {
    const record = gltf.accessors[index], view = gltf.bufferViews[record.bufferView], source = buffers[view.buffer], size = { VEC2: 2, VEC3: 3 }[record.type];
    assert.equal(record.componentType, 5126);
    return new Float32Array(source.buffer, source.byteOffset + (view.byteOffset || 0) + (record.byteOffset || 0), record.count * size);
  };
  const original = [accessor(primitive.attributes.POSITION), accessor(primitive.attributes.NORMAL), accessor(primitive.attributes.TEXCOORD_0)], sizes = [3, 3, 2];
  const vertexKey = (arrays, vertex) => arrays.flatMap((array, field) => Array.from(array.subarray(vertex * sizes[field], (vertex + 1) * sizes[field]))).join('|');
  const sourceVertices = new Set(Array.from({ length: original[0].length / 3 }, (_, vertex) => vertexKey(original, vertex)));
  const geometry = createImportedGroundRockGeometry(), arrays = [geometry.attributes.position.array, geometry.attributes.normal.array, geometry.attributes.uv.array];
  for (let vertex = 0; vertex < arrays[0].length / 3; vertex++) assert.ok(sourceVertices.has(vertexKey(arrays, vertex)), 'Every retained position, normal and UV tuple exists unchanged in the original CC0 model');
  assert.equal(geometry.index.count / 3, 600); assert.equal(geometry.attributes.position.count, 414);
  assert.equal(createHash('sha256').update(Buffer.from(arrays[0].buffer)).digest('hex'), IMPORTED_GROUND_ROCK.payloadSha256, 'Embedded geometry payload matches its preparation record');
  assert.deepEqual(geometry.boundingBox.min.toArray(), IMPORTED_GROUND_ROCK.bounds.min); assert.deepEqual(geometry.boundingBox.max.toArray(), IMPORTED_GROUND_ROCK.bounds.max);
  assert.equal(IMPORTED_GROUND_ROCK.textureFlipY, false, 'Imported UVs retain the source glTF texture orientation');
  assert.ok(arrays[0].buffer.byteLength < 18000, 'Reduced model remains a small self-contained payload');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let triangle = 0; triangle < geometry.index.count; triangle += 3) {
    a.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(triangle)); b.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(triangle + 1)); c.fromBufferAttribute(geometry.attributes.position, geometry.index.getX(triangle + 2));
    assert.ok(b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16, 'Simplified imported rock has no collapsed triangles');
  }
});
