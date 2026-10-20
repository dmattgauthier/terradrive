import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../dist/src/terrain.js';
import { OffroadWorld } from '../dist/src/world.js';
import * as THREE from '../dist/vendor/three.module.js';

// Integrate unique physical heightfield nodes, not duplicate tile-edge copies.
function footprint(terrain, x, z, heading) {
  const nodes = new Map();
  for (const p of terrain.detailTiles.values()) for (let i = 0; i < p.delta.length; i++) {
    const wx = p.minX + i % (p.nx + 1) * p.step;
    const wz = p.minZ + Math.floor(i / (p.nx + 1)) * p.step;
    nodes.set(Math.round(wx * 10) + ',' + Math.round(wz * 10), { x: wx, z: wz, delta: p.delta[i] });
  }
  const result = { down: 0, up: 0, acrossMoment: 0, radiusMoment: 0, peak: 0, negative: [] };
  for (const [key, node] of [...nodes].sort(([a], [b]) => a.localeCompare(b))) {
    const across = (node.x - x) * Math.cos(heading) - (node.z - z) * Math.sin(heading);
    if (node.delta < 0) { result.down -= node.delta * .01; result.negative.push([key, node.delta]); }
    else {
      const volume = node.delta * .01; result.up += volume;
      result.acrossMoment += across * volume; result.radiusMoment += Math.abs(across) * volume;
      result.peak = Math.max(result.peak, node.delta);
    }
  }
  result.centroid = result.acrossMoment / result.up;
  result.meanRadius = result.radiusMoment / result.up;
  return result;
}

test('sideways shearing moves the shoulder to the advancing side without excavating extra soil', () => {
  const terrain = new Terrain();
  for (const [surface, x, z] of [['mud', 48, -130], ['sand', 204, -110]]) for (const heading of [0, .61, Math.PI / 2]) {
    const runs = [];
    for (const lateralSlip of [.75, -.75]) {
      terrain.resetDeformation();
      // One actual physics step keeps the receiving shoulders below their
      // capacity, so the comparison isolates direction from saturated fill.
      terrain.deform(x, z, { load: 4500, pressure: 35, contactWidth: .30, contactLength: .28, slip: .3, lateralSlip, heading, dt: 1 / 120 });
      const result = footprint(terrain, x, z, heading); runs.push(result);
      assert.ok(result.up > .0001 && result.down > result.up);
      // Vehicle right is forward cross up: positive lateral slip advances
      // opposite the positive across coordinate of this measured section.
      assert.ok(result.centroid * Math.sign(lateralSlip) < -.12, `${surface} shoulder direction at heading ${heading}`);
      assert.ok(result.peak <= (surface === 'sand' ? .16 : .13) + 1e-6, 'Existing material-specific shoulder height caps remain in force');
      const volumes = terrain.soilVolumes;
      assert.ok(Math.abs(volumes.displaced + volumes.compacted - volumes.depressed) < 1e-10);
      assert.ok(Math.abs(result.up - volumes.displaced) < 2e-8, 'Visible raised volume matches the soil accounting');
    }
    assert.deepEqual(runs[0].negative, runs[1].negative, 'Changing shear direction alone does not create a deeper trench');
    assert.ok(Math.abs(runs[0].up - runs[1].up) < 2e-8, 'Only deposition direction changes');
  }
});

test('dry sand has a wider lower normalized shoulder than cohesive wet sand', () => {
  const terrain = new Terrain(), runs = [];
  for (const moisture of [0, 1]) {
    terrain.resetDeformation(); terrain.setMoisture(moisture);
    terrain.deform(204, -110, { load: 4500, pressure: 35, contactWidth: .30, contactLength: .28, slip: .3, dt: .08 });
    runs.push(footprint(terrain, 204, -110, 0));
  }
  assert.ok(runs[0].meanRadius > runs[1].meanRadius * 1.08);
  assert.ok(runs[0].peak / runs[0].up < runs[1].peak / runs[1].up, 'Compare profile spread independently of different wet-soil volume');
  for (const run of runs) assert.ok(Math.abs(run.centroid) < .02, 'Ordinary rolling does not acquire a spurious sideways pile');
});

function worldFor(terrain) {
  globalThis.document = { createElement() {
    const context = { fillRect() {}, fillText() {}, putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) };
    return { width: 0, height: 0, getContext: () => context };
  } };
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, { terrain, scene: new THREE.Scene(), quality: 'high', clock: 0, groundMeshes: new Map(), _textureLoader: { load: () => new THREE.Texture() } });
  world._createTerrain(); return world;
}

function renderedNormal(world, tile, x, z) {
  const record = world.detailMeshes.get(tile.key);
  const index = record.offset + Math.round((z - tile.minZ) / tile.step) * (tile.nx + 1) + Math.round((x - tile.minX) / tile.step);
  return Array.from(record.chunk.mesh.geometry.attributes.normal.array.slice(index * 3, index * 3 + 3));
}

test('an existing tile refreshes its shared normal when only its neighbor interior is deformed', () => {
  const terrain = new Terrain(), world = worldFor(terrain);
  for (const [x, z] of [[46, -130], [50, -130], [46, -126], [50, -126]]) terrain._ensureDetailTile(Math.floor(x / 4), Math.floor(z / 4));
  world._syncDeformation();
  const cases = [
    { point: [48, -126], stamp: [47.5, -126], tiles: [[47.9, -126], [48.1, -126]] },
    { point: [48, -130], stamp: [48.5, -130], tiles: [[47.9, -130], [48.1, -130]] },
    { point: [46, -128], stamp: [46, -128.5], heading: Math.PI / 2, tiles: [[46, -128.1], [46, -127.9]] },
    { point: [50, -128], stamp: [50, -127.5], heading: Math.PI / 2, tiles: [[50, -128.1], [50, -127.9]] },
  ];
  for (const { point: [x, z], stamp: [sx, sz], heading = 0, tiles } of cases) {
    const pair = tiles.map(([px, pz]) => terrain.getDetailTile(px, pz));
    const beforeHeight = terrain.heightAt(x, z), beforeNormal = renderedNormal(world, pair[0], x, z);
    for (let step = 0; step < 90; step++) terrain.deform(sx, sz, { load: 6000, pressure: 35, contactWidth: .285, contactLength: .28, slip: .4, heading, dt: 1 / 120 });
    world._syncDeformation();
    const normals = pair.map(tile => renderedNormal(world, tile, x, z));
    assert.equal(terrain.heightAt(x, z), beforeHeight, 'The shared vertex itself was not excavated');
    assert.deepEqual(normals[0], normals[1], 'Both rendered copies have the same new normal');
    assert.notDeepEqual(normals[0], beforeNormal, 'The test must actually change the neighboring normal sample');
    const nx = (terrain.heightAt(x - .1, z) - terrain.heightAt(x + .1, z)) / .2;
    const nz = (terrain.heightAt(x, z - .1) - terrain.heightAt(x, z + .1)) / .2, length = Math.hypot(nx, 1, nz);
    const expected = [nx / length, 1 / length, nz / length];
    assert.ok(normals[0].every((value, i) => Math.abs(value - expected[i]) < 1e-7));
  }
});
