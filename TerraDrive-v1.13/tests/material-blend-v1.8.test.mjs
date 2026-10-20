import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { createTerrainMaterial } from '../dist/src/terrain-shading.js';

// Exercise the material's actual onBeforeCompile output. Empty Three textures
// let us assemble the runtime shader without a DOM, image decoder or GPU.
function runtimeBlendSource() {
  const textures = new Map();
  const world = {
    terrain: { moisture: 0, waterLevel: 3.18 }, quality: 'high',
    _surfaceTextures(asset) {
      if (!textures.has(asset)) textures.set(asset, {
        map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture(),
      });
      return textures.get(asset);
    },
  };
  const material = createTerrainMaterial(world, 'wetland', 'brown_mud_02', [-24, 148, 53, 71], 1.3, .6);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader);
  const start = /\bvec3\s+tdBlend\s*=\s*tdWeights\(vGroundXZ\);/.exec(shader.fragmentShader);
  assert.ok(start, 'The runtime shader must expose the primary/cover blend entry point');
  const following = shader.fragmentShader.slice(start.index);
  const end = /\bvec2\s+tdPrimaryUV\s*=/.exec(following);
  assert.ok(end, 'The scalar weight calculation must precede texture-coordinate construction');
  const source = following.slice(0, end.index);
  material.dispose();
  for (const set of textures.values()) for (const texture of Object.values(set)) texture.dispose();
  return source;
}

// The extracted block uses scalar arithmetic and vec3 component access only.
// Converting declarations is sufficient to execute those same statements in
// JavaScript. The two noise samples are supplied independently across [0, 1]:
// the conservation invariant must hold at every position, not only a few tiles.
// This is a CPU algebra regression; the native shader tests cover GPU compile.
function blendEvaluator(glsl) {
  const body = glsl.replace(/\b(?:vec3|float)\s+/g, 'let ');
  const evaluate = new Function('tdWeights', 'terraDirtCover', 'tdGroundCover', 'tdNoise', 'vGroundXZ', 'max', 'clamp', 'smoothstep', 'vGeology', 'tdBiome', 'vSoilState', 'exp',
    '"use strict";\n' + body + '\nreturn { primary: tdBlend.x, soil: tdSoilWeight, gravel: tdGravelWeight, grass: tdBlend.z };');
  return (weights, cover, grassNoise, aggregateNoise, geology = { x: 0, y: 0, z: 0 }, biome = { x: 0, y: 0, z: 1, w: 0 }, soil = { x: 0, y: 0, z: 0, w: 0 }) => {
    const samples = [grassNoise, aggregateNoise];
    let calls = 0;
    // The coordinate only reaches stubbed functions in this scalar block.
    // Supplying zero keeps its vector/scalar argument expressions harmless.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const result = evaluate(() => ({ ...weights }), () => ({ ...cover }), () => ({ ...cover }),
      () => samples[calls++], 0, Math.max, clamp,
      (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); }, geology, biome, soil, Math.exp);
    assert.equal(calls, samples.length, 'A changed runtime noise contract needs an explicit test adapter update');
    return result;
  };
}

const runtimeBlend = blendEvaluator(runtimeBlendSource());

// Captured from the pre-fix v1.8 candidate, before the grass transfer was
// bounded by the remaining bare coverage. Keep this historical implementation
// separate: proving that it fails the observed fixture gives the regression a
// concrete failure mode instead of merely checking another copy of the fix.
const originalBlend = blendEvaluator(`
vec3 tdBlend=tdWeights(vGroundXZ);
vec3 tdCover=terraDirtCover(vGroundXZ);
float tdGravelShare=tdCover.y/max(.0001,tdCover.x+tdCover.y);
float tdGravelWeight=tdBlend.y*tdGravelShare, tdSoilWeight=tdBlend.y-tdGravelWeight;
float tdEdgeBreak=(tdNoise(vGroundXZ*6.7)-.5)*.80;
float tdGrassTransfer=tdEdgeBreak*tdBlend.z*(1.-tdBlend.z);
float tdBare=tdSoilWeight+tdGravelWeight;
if(tdBare>.0001) {
  tdSoilWeight-=tdGrassTransfer*tdSoilWeight/tdBare;
  tdGravelWeight-=tdGrassTransfer*tdGravelWeight/tdBare;
  tdBlend.z+=tdGrassTransfer;
}
float tdAggregateTransfer=(tdNoise(vGroundXZ*5.3+7.1)-.5)*.70*tdGravelShare*(1.-tdGravelShare)*tdBlend.y;
tdGravelWeight+=tdAggregateTransfer; tdSoilWeight-=tdAggregateTransfer;
`);

const sum = weights => Object.values(weights).reduce((total, weight) => total + weight, 0);
const tolerance = 2e-12;

function assertConserved(result, primary, context) {
  const valid = Object.values(result).every(weight => Number.isFinite(weight) && weight >= -tolerance && weight <= 1 + tolerance)
    && Math.abs(sum(result) - 1) <= tolerance && (primary === null || result.primary === primary);
  if (!valid) assert.fail('Invalid photographic material weights: ' + JSON.stringify({ ...context, result, sum: sum(result) }));
}

test('the captured wetland edge reproduces negative gravel in the original candidate and conserves the runtime blend', () => {
  // Actual map point (11.92550851126105, 200.1605633907684). Inputs were
  // captured from the shared dirt cover, ellipse blend and scalar GLSL noise.
  const weights = { x: .6150291752523033, y: .000271911462910814, z: .3846989132847859 };
  const cover = { x: 0, y: .0007063170646477435, z: .9992936829353523 };
  const noises = [.9623686157017649, .5804072891770492];
  const old = originalBlend(weights, cover, ...noises);
  assert.ok(Math.abs(old.gravel - (-.08728430299037766)) < tolerance,
    'The historical fixture must reproduce the observed excessive grass transfer');
  assert.ok(Object.values(old).filter(weight => weight > .0001).reduce((a, b) => a + b, 0) > 1.08,
    'Skipping negative texture branches leaves excess effective albedo/roughness weight');
  const current = runtimeBlend(weights, cover, ...noises);
  assertConserved(current, weights.x, { weights, cover, noises });
  assert.ok(current.gravel > 0 && current.gravel < weights.y,
    'A grass-favoring edge may reduce this narrow gravel sliver without removing more material than exists');
});

test('exposed granite and embedded mud stones conserve material coverage without inventing negative soil', () => {
  for (const biome of [{ x: 1, y: 0, z: 0, w: 0 }, { x: 0, y: 0, z: 1, w: 0 }, { x: 0, y: 0, z: 0, w: 1 }]) {
    for (const stone of [0, .1, .22, .5, .82, .99, 1]) for (const primary of [0, .0001, .4, .9999, 1]) {
      for (const soil of [0, .1, .5, 1]) for (const grass of [0, .01, .5, 1]) {
        const cover = { x: soil * (1 - grass), y: (1 - soil) * (1 - grass), z: grass };
        const weights = { x: primary, y: (1 - primary) * (1 - grass), z: (1 - primary) * grass };
        for (const a of [0, .5, 1]) for (const b of [0, .5, 1]) {
          const result = runtimeBlend(weights, cover, a, b, { x: stone, y: .7, z: .4 }, biome);
          assertConserved(result, null, { biome, stone, primary, cover, a, b });
        }
      }
    }
  }
});

test('runtime blend preserves nonnegative unit-sum weights across primary coverage, cover mixtures and edge noise', t => {
  // Include pure materials, typical blends, the observed gravel sliver and
  // points immediately either side of the shader's small-denominator guard.
  const fractions = [0, 1e-10, 1e-6, .000099, .0001, .000101, .0007063170646477435,
    .001, .01, .05, .1, .25, .5, .75, .9, .99, .999, .9999, 1 - 1e-6, 1];
  const noises = [0, .01, .25, .5, .75, .99, 1];
  let checked = 0;
  for (const grass of fractions) for (const gravelShare of fractions) {
    const cover = { x: (1 - grass) * (1 - gravelShare), y: (1 - grass) * gravelShare, z: grass };
    for (const primary of fractions) {
      const weights = { x: primary, y: (1 - primary) * (cover.x + cover.y), z: (1 - primary) * cover.z };
      for (const grassNoise of noises) for (const aggregateNoise of noises) {
        const result = runtimeBlend(weights, cover, grassNoise, aggregateNoise);
        assertConserved(result, primary, { weights, cover, grassNoise, aggregateNoise });
        checked++;
      }
    }
  }
  t.diagnostic(`${checked.toLocaleString('en-US')} deterministic cover/noise combinations; CPU scalar shader evaluation`);
});

test('pristine pure background materials and full biome coverage keep their own material at every noise extreme', () => {
  const covers = [
    { cover: { x: 1, y: 0, z: 0 }, expected: { primary: 0, soil: 1, gravel: 0, grass: 0 } },
    { cover: { x: 0, y: 1, z: 0 }, expected: { primary: 0, soil: 0, gravel: 1, grass: 0 } },
    { cover: { x: 0, y: 0, z: 1 }, expected: { primary: 0, soil: 0, gravel: 0, grass: 1 } },
  ];
  for (const { cover, expected } of covers) for (const a of [0, .5, 1]) for (const b of [0, .5, 1]) {
    const weights = { x: 0, y: cover.x + cover.y, z: cover.z };
    assert.deepEqual(runtimeBlend(weights, cover, a, b), expected,
      'Edge breakup cannot invent a material absent from a pure background');
    assert.deepEqual(runtimeBlend({ x: 1, y: 0, z: 0 }, cover, a, b),
      { primary: 1, soil: 0, gravel: 0, grass: 0 },
      'Full biome coverage must suppress every background material');
  }
});

test('live rolling compression and slip disturbance preserve bounded material coverage', () => {
  const geology = { x: 0, y: 0, z: 0 }, biome = { x: 0, y: 0, z: 0, w: 0 };
  for (const grass of [0, .01, .25, .5, .9, 1]) for (const primary of [0, .2, .8, 1]) {
    const cover = { x: (1 - grass) * .7, y: (1 - grass) * .3, z: grass };
    const weights = { x: primary, y: (1 - primary) * (1 - grass), z: (1 - primary) * grass };
    for (const a of [0, .5, 1]) for (const b of [0, .5, 1]) for (const churn of [0, .05, .5, 1]) {
      const soil = { x: 1, y: .8, z: -.08, w: churn };
      assertConserved(runtimeBlend(weights, cover, a, b, geology, biome, soil), primary, { weights, cover, a, b, soil });
    }
  }
  const fullGrass = { x: 0, y: 0, z: 1 };
  const rolled = runtimeBlend(fullGrass, fullGrass, .5, .5, geology, biome, { x: 1, y: .8, z: -.003, w: 0 });
  const churned = runtimeBlend(fullGrass, fullGrass, .5, .5, geology, biome, { x: 1, y: .8, z: -.003, w: 1 });
  assert.equal(rolled.grass, 1, 'Pure rolling compression bends cover without inventing churned bare earth');
  assert.ok(churned.soil > 0 && churned.grass > 0 && churned.grass < rolled.grass, 'Slip disturbance exposes some soil while retaining material coverage');
});
