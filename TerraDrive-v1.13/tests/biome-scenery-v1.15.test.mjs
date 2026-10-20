import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createBroadleafTree, createFernGeometry, createShrubGeometry } from '../dist/src/biome-scenery.js';
import { Terrain } from '../dist/src/terrain.js';
import { OffroadWorld } from '../dist/src/world.js';
import { stepTreeFall } from '../dist/src/tree-dynamics.js';

test('broadleaf crowns, connected twigs, arching ferns and multistem shrubs use diverse finite physical geometry', () => {
  const birch = createBroadleafTree(), again = createBroadleafTree(), varied = createBroadleafTree(8197);
  const fern = createFernGeometry(), shrub = createShrubGeometry();
  assert.deepEqual(birch.foliage.attributes.position.array, again.foliage.attributes.position.array);
  assert.notDeepEqual(birch.foliage.attributes.position.array, varied.foliage.attributes.position.array);
  for (const mesh of [birch.foliage, birch.branches, fern, shrub]) {
    assert(mesh.attributes.position.array.every(Number.isFinite));
    assert(mesh.attributes.normal.array.every(Number.isFinite));
    assert(mesh.userData.triangles < 2400);
    assert.equal(mesh.attributes.aPlantBend.count, mesh.attributes.position.count);
    assert(mesh.boundingBox.max.y > .5 && mesh.boundingBox.min.y >= -.04);
  }
  assert.notEqual(fern.attributes.position.count, shrub.attributes.position.count);
  for (const mesh of [birch.foliage, birch.branches, again.foliage, again.branches, varied.foliage, varied.branches, fern, shrub]) mesh.dispose();
});

function worldFixture() {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return {
    fillRect() {}, fillText() {}, putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }),
  }; } }; } };
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, { terrain: new Terrain(), scene: new THREE.Scene(), clock: 0, quality: 'high',
    _textureLoader: { load: () => new THREE.Texture() }, groundMeshes: new Map() });
  world.terrain.obstacles = []; world._createVegetation(); return world;
}

test('actual forest contains grounded birches, distinct understory and matching wind/shadow displacement', () => {
  const world = worldFixture(), birches = world.treeRecords.filter(t => t.species === 'birch');
  assert(birches.length > 20 && world.treeRecords.some(t => t.species === 'pine'));
  assert.equal(world.birch.foliage.count, birches.length);
  assert.equal(world.treeRecords.find(t => t.id === 'tree-137')?.species, 'pine', 'Retain the original impact regression tree');
  assert(world.understory.every(m => m.count > 30 && m.count <= 180));
  assert(world.groundCoverContact.populations.filter(p => world.understory.includes(p.mesh)).length === 3);
  const crown = new THREE.Matrix4(), branches = new THREE.Matrix4(), trunk = new THREE.Matrix4();
  for (const tree of birches) {
    const meshes = world._treeMeshes(tree);
    meshes.foliage.getMatrixAt(meshes.index, crown); meshes.branches.getMatrixAt(meshes.index, branches); meshes.trunks.getMatrixAt(meshes.index, trunk);
    assert.deepEqual(crown.elements, branches.elements);
    assert(Math.abs(trunk.determinant()) > .01);
    const root = new THREE.Vector3(0, -.5, 0).applyMatrix4(trunk);
    assert(root.distanceTo(new THREE.Vector3(tree.x, tree.y, tree.z)) < 5e-5);
    assert(world.getWinchAnchors().some(a => a.id === tree.id));
    assert.notEqual(world.terrain.surfaceAt(tree.x, tree.z), 'snow');
  }
  const material = world.birch.foliage.material, shadow = world.birch.foliage.customDepthMaterial;
  const make = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader });
  const visible = make(), depth = make(); material.onBeforeCompile(visible); shadow.onBeforeCompile(depth);
  assert.equal(visible.uniforms.tdWindStrength.value, depth.uniforms.tdWindStrength.value);
  assert(visible.vertexShader.includes('aPlantBend*tdWindStrength'));
});

test('a birch preserves gradual falling, collider alignment and reset through its own mesh batches', () => {
  const world = worldFixture(), tree = world.treeRecords.find(t => t.species === 'birch');
  const meshes = world._treeMeshes(tree), original = new THREE.Matrix4(); meshes.trunks.getMatrixAt(meshes.index, original);
  tree.push.set(0, 0, 1); world._breakTree(tree);
  assert(tree.broken && tree.fallenObstacle && !world.getWinchAnchors().some(a => a.id === tree.id));
  const before = new THREE.Matrix4(); meshes.foliage.getMatrixAt(meshes.index, before);
  for (let i = 0; i < 150; i++) { stepTreeFall(tree.fall, 1 / 120, world.terrain.heightAt.bind(world.terrain)); world._poseTree(tree); }
  const crown = new THREE.Matrix4(), branch = new THREE.Matrix4(), trunk = new THREE.Matrix4();
  meshes.foliage.getMatrixAt(meshes.index, crown); meshes.branches.getMatrixAt(meshes.index, branch); meshes.trunks.getMatrixAt(meshes.index, trunk);
  assert.notDeepEqual(crown.elements, before.elements); assert.deepEqual(crown.elements, branch.elements);
  const center = new THREE.Vector3().setFromMatrixPosition(trunk);
  assert(center.distanceTo(new THREE.Vector3(tree.fall.center.x, tree.fall.center.y, tree.fall.center.z)) < 5e-5);
  world.resetDamage(); meshes.trunks.getMatrixAt(meshes.index, trunk);
  assert.deepEqual(trunk.elements, original.elements);
  assert(!tree.broken && world.getWinchAnchors().some(a => a.id === tree.id));
});
