import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../dist/src/terrain.js';
import { depositSoil } from '../dist/src/soil-flow.js';
import { TireSpray } from '../dist/src/tire-spray.js';
import { TireSprayView } from '../dist/src/tire-spray-view.js';
import * as THREE from '../dist/vendor/three.module.js';

function nodes(terrain) {
  const out = new Map();
  for (const tile of terrain.detailTiles.values()) for (let i = 0; i < tile.delta.length; i++) {
    const x = tile.minX + i % (tile.nx + 1) * tile.step, z = tile.minZ + Math.floor(i / (tile.nx + 1)) * tile.step;
    out.set(Math.round(x * 10) + ',' + Math.round(z * 10), { x, z, delta: tile.delta[i] });
  }
  return [...out.values()];
}

test('loaded rolling tires form a direction-aware end wedge in addition to shoulders, including reverse', () => {
  for (const [x, z] of [[48, -130], [204, -110], [-265, 280]]) {
    const terrain = new Terrain(), outcomes = [];
    for (const direction of [-1, 1]) {
      terrain.resetDeformation();
      terrain.deform(x, z, { load: 6000, contactWidth: .30, contactLength: .28, pressure: 35,
        slip: .15, speed: 2, longitudinalSpeed: direction * 2, dt: .08 });
      const state = nodes(terrain), end = state.filter(n => Math.abs(n.z - z) > .15 && Math.abs(n.x - x) < .2 && n.delta > 0);
      assert(end.length > 0, 'An end pile must exist in the real displacement grid');
      const ahead = end.filter(n => (n.z - z) * direction > 0).reduce((sum, n) => sum + n.delta, 0);
      const behind = end.filter(n => (n.z - z) * direction < 0).reduce((sum, n) => sum + n.delta, 0);
      assert(ahead > behind * 1.25, 'Ordinary rolling pushes a larger wedge ahead of travel');
      assert(state.every(n => n.delta <= .160001));
      const volume = terrain.soilVolumes;
      assert(Math.abs(volume.depressed - volume.compacted - volume.displaced) < 1e-9);
      outcomes.push(state.filter(n => n.delta < 0).map(n => [n.x, n.z, n.delta]));
    }
    assert.deepEqual(outcomes[0], outcomes[1], 'Travel direction changes pile placement without inventing excavation');
  }
});

test('deposition redistributes a full shoulder node into remaining capacity without creating volume', () => {
  const heights = [0, 0, 0], receiver = [
    { index: 0, weight: 100, maxBerm: .001 },
    { index: 1, weight: 1, maxBerm: .05 }, { index: 2, weight: 1, maxBerm: .05 },
  ];
  const raised = depositSoil(receiver, .065, item => heights[item.index], (item, h) => { heights[item.index] = h; });
  assert(Math.abs(raised - .065) < 1e-10);
  assert(heights[0] <= .001 && heights[1] > .03 && heights[2] > .03);
  assert(Math.abs(heights.reduce((a, b) => a + b) - .065) < 1e-10);
});

test('powder compresses more of its removed bulk than sand while both retain bounded real piles', () => {
  const output = [];
  for (const [x, z] of [[-265, 280], [204, -110]]) {
    const terrain = new Terrain();
    terrain.deform(x, z, { load: 5000, contactWidth: .3, contactLength: .3, slip: .25, dt: .07 });
    const v = terrain.soilVolumes;
    assert(v.depressed > 0 && v.displaced > 0);
    output.push(v.displaced / v.depressed);
  }
  assert(output[0] < output[1] * .5, 'Fresh powder consumes more pore volume instead of producing mud-like heaps');
});

const ground = (surface, moisture = 0) => ({ sample: () => ({ surface, height: 0, moisture,
  waterDepth: surface === 'water' ? .12 : 0, snowDepth: .4 }) });
function snapshot(surface, extra = {}) {
  return { position: { x: 0, y: 1, z: 0 }, speed: 7, velocity: { x: 0, y: 0, z: 7 }, wheels: [{
    index: 0, surface: surface === 'water' ? 'rock' : surface, contact: true, load: 5500,
    ground: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: 1 }, right: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 },
    velocity: { x: 0, y: 0, z: 7 }, speedLong: 7, speedLat: 0, radius: .4, omega: 20, slip: .2, snowDepth: .4,
    contactWidth: .28, contactLength: .24, ...extra,
  }] };
}

test('mud, sand, standing water and snow produce distinct bounded coarse and fine tire wakes at consistent rates', () => {
  for (const surface of ['mud', 'sand', 'water', 'snow']) {
    const outcomes = [];
    for (const hz of [30, 60, 120]) {
      const spray = new TireSpray({ capacity: 180 }), terrain = ground(surface);
      for (let f = 0; f < hz * 2; f++) spray.update(1 / hz, snapshot(surface), terrain);
      const kind = surface === 'water' ? 'water' : surface;
      assert(spray.emitted[kind] > 20 && spray.fineEmitted[kind] > 0);
      assert(spray.particles.filter(p => p.active).length <= 180 && spray.fines.filter(p => p.active).length <= 180);
      for (const p of [...spray.particles, ...spray.fines].filter(p => p.active)) {
        assert(['x', 'y', 'z', 'vx', 'vy', 'vz'].every(key => Number.isFinite(p[key])));
        assert.equal(p.sourceWheel, 0); assert(p.y >= 0);
      }
      outcomes.push({ emitted: spray.emitted, fines: spray.fineEmitted });
    }
    assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
  }
});

test('water suppresses sand dust and rigid or unloaded support cannot emit hidden sand', () => {
  const dry = new TireSpray(), wet = new TireSpray();
  for (let i = 0; i < 60; i++) {
    dry.update(1 / 60, snapshot('sand'), ground('sand'));
    wet.update(1 / 60, snapshot('sand', { moisture: 1 }), ground('sand', 1));
  }
  assert(wet.emitted.sand < dry.emitted.sand * .5);
  for (const extra of [{ constructed: true, waterDepth: 0 }, { contact: false }, { load: 0 }]) {
    const spray = new TireSpray();
    for (let i = 0; i < 30; i++) spray.update(1 / 60, snapshot('sand', extra), ground('sand'));
    assert.equal(spray.emitted.sand, undefined); assert.equal(spray.fineEmitted.sand, undefined);
  }
});

test('fine parcels retain swept panel collision and never add muddy deposits or modify soil', () => {
  const spray = new TireSpray(), p = spray.fines[0];
  Object.assign(p, { active: true, fine: true, kind: 'sand', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 20,
    age: 0, life: 2, size: .04, aspect: 1, angle: 0, spin: 0 });
  let crossed = false;
  spray.collider = { sweep(from, to) { if (from.z < .05 && to.z >= .05) { crossed = true; return {
    fraction: (.05 - from.z) / (to.z - from.z), point: { x: 0, y: 1, z: .05 }, normal: { x: 0, y: 0, z: -1 },
  }; } } };
  spray._advance(p, .01, 0, 1, ground('sand'));
  assert(crossed && !p.active); assert.equal(spray.fineBodyCollisions, 1);
  assert.equal(spray.bodyImpacts.length, 0);
});

test('fine wake rendering uses soft camera-facing bounded instances and no sand-to-mud panel marks', () => {
  const scene = new THREE.Scene(), view = new TireSprayView(scene, ground('sand')), camera = new THREE.PerspectiveCamera();
  camera.rotation.set(.2, .5, 0);
  for (let i = 0; i < 30; i++) view.update(1 / 60, snapshot('sand'), 'high', camera);
  assert(view.sand.count > 0 && view.fine.count > 0 && view.mud.count === 0);
  assert(view.fine.instanceMatrix.array.every(Number.isFinite));
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  view.fine.material.onBeforeCompile(shader);
  assert(shader.fragmentShader.includes('1.-puffRadius*puffRadius') && shader.vertexShader.includes('vPuffUV=uv'));
  assert(view.fine.geometry.attributes.aPuffAlpha.array.some(value => value > 0));
  view.clear(); assert.equal(view.fine.count + view.sand.count, 0); assert(view.simulation.fines.every(p => !p.active));
  view.dispose(); assert.equal(scene.children.length, 0);
});
