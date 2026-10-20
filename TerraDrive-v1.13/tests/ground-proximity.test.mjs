import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { Terrain } from '../dist/src/terrain.js';
import { OffroadWorld } from '../dist/src/world.js';

// This is a cache-invalidation regression. Synthetic contact edits isolate
// one already allocated tile; ordinary VehiclePhysics -> soil rendering has
// separate retained driving and native pixel fixtures.
function makeWorld() {
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, {
    terrain: new Terrain(), scene: new THREE.Scene(), quality: 'high', clock: 0,
    _textureLoader: { load(url) { const texture = new THREE.Texture(); texture.userData.url = url; return texture; } },
  });
  world._createGroundDetails();
  return world;
}

test('existing-tile edits refresh supported vegetation without reseeding or unbounded rebuilds', () => {
  const world = makeWorld(), terrain = world.terrain, observer = { x: -51, z: 282 };
  world._updateGroundProximity(observer, true);
  const near = world.groundProximity;
  const seed = near.records.find(p => p.fade === 1 && Math.hypot(p.x - observer.x, p.z - observer.z) < 5);
  assert.ok(seed);
  const record = () => near.records.find(p => p.x === seed.x && p.z === seed.z && p.population === seed.population);
  const transform = () => { const p = record(), matrix = new THREE.Matrix4(); near[p.population].getMatrixAt(p.index, matrix); return matrix.elements; };
  const pristine = transform(), originalHeight = record().height;
  let rebuilds = 0;
  const rebuild = world._updateImportedRocks;
  world._updateImportedRocks = function(...args) { rebuilds++; return rebuild.apply(this, args); };
  const deform = () => terrain.deform(seed.x, seed.z, { load: 6000, pressure: 35, contactWidth: .285, contactLength: .28, slip: .4, dt: 1 / 120 });
  deform(); world.clock = .2; world._updateGroundProximity(observer);
  const first = transform(), allocation = terrain.detailRevision, tileCount = terrain.detailTiles.size;
  for (let i = 0; i < 89; i++) deform();
  assert.equal(terrain.detailRevision, allocation, 'This defect must be exercised without allocating a second tile');
  assert.equal(terrain.detailTiles.size, tileCount);
  world.clock = .21; world._updateGroundProximity(observer);
  assert.deepEqual(transform(), first, 'The local update cadence is bounded within the same observer region');
  world.clock = .4; world._updateGroundProximity(observer);
  const actual = terrain.sample(seed.x, seed.z), current = transform();
  assert.ok(Math.abs(record().height - seed.baseHeight * seed.fade * (1 - actual.compaction * .91)) < 1e-7);
  assert.ok(record().height < originalHeight * .20);
  assert.ok(Math.abs(current[13] + .012 - actual.height) < 1e-6);
  for (const component of [0, 2, 8, 10, 12, 14]) assert.equal(current[component], pristine[component], 'Soil edits preserve deterministic width, yaw and placement');
  assert.equal(rebuilds, 0, 'Already allocated soil edits cannot reseed the population or refit every imported model');
  assert.ok(world._nearSoilUpdate.sampledPlants < near.records.length / 10, 'A contact tile samples a local subset of stems');
  const versions = () => ['grass', 'sedge', 'dry', 'gravel', 'importedRocks'].map(name => near[name].instanceMatrix.version);
  const beforeIdle = versions(); world.clock = .6; world._updateGroundProximity(observer);
  assert.deepEqual(versions(), beforeIdle, 'A no-op frame cannot upload new instance matrices');
  // A physical tread-only channel edit is irrelevant to plant height/support.
  const tile = terrain.getDetailTile(seed.x, seed.z); tile.tread[0] = tile.tread[0] === 1 ? .9 : 1;
  tile.revision++; terrain.revision++; world.clock = .8; world._updateGroundProximity(observer);
  assert.deepEqual(versions(), beforeIdle, 'Tread-only tile revisions cannot upload identical Float32 transforms');
  world._updateGroundProximity({ x: 122, z: 122 }); world._updateGroundProximity(observer);
  assert.ok(Math.abs(record().height - seed.baseHeight * seed.fade * (1 - actual.compaction * .91)) < 1e-7, 'Leaving and reentering preserves compaction');
  terrain.resetDeformation(); world.clock = 1; world._updateGroundProximity(observer);
  assert.deepEqual(transform(), pristine, 'Reset restores exact deterministic placement on pristine soil');
});
