import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { createTerrainMaterial } from '../dist/src/terrain-shading.js';

// Compile the production material hook, then evaluate its actual scalar GLSL
// statements. Native EGL compilation/rendering is a separate release gate.
// These tests check bounded material behavior rather than maintaining a second
// hand-written implementation of the soil response.
function productionShader() {
  const textures = new Map(), world = {
    terrain: { moisture: 0, waterLevel: 3.18 }, quality: 'high',
    _surfaceTextures(name) {
      if (!textures.has(name)) textures.set(name, {
        map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture(),
      });
      return textures.get(name);
    },
  };
  const material = createTerrainMaterial(world, 'mud', 'brown_mud_02', [48, -122, 32, 68], 1.4, .6);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader);
  material.dispose();
  for (const maps of textures.values()) for (const texture of Object.values(maps)) texture.dispose();
  return shader;
}
const shader = productionShader(), source = shader.fragmentShader;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const scalar = glsl => glsl.replace(/\bfloat\s+/g, 'let ');
const functionMatch = source.match(/TDWorkedSoil tdWorkedSoil\(vec4 contact\)\s*\{([\s\S]*?)\n\}/);
assert.ok(functionMatch, 'Extract the live material response from the assembled runtime hook');
const workCode = scalar(functionMatch[1]).replace('TDWorkedSoil worked;', 'let worked = {};');
const evaluateWork = new Function('contact', 'clamp', 'max', 'exp', workCode);
const work = contact => evaluateWork(contact, clamp, Math.max, Math.exp);
const responseMatch = source.match(/float tdRutDamp=[\s\S]*?float tdCoating=[^;]+;/);
assert.ok(responseMatch, 'Extract the runtime floor/shoulder moisture response');
const evaluateDamp = new Function('tdWork', 'tdSinkResponse', 'tdTread', 'tdNativeWet', 'tdBlend', 'tdEmergent', 'tdWet',
  'tdMottle', 'tdAuthoredRut', 'tdFilm', 'tdSubmerged', 'tdAuthoredShoulder', 'clamp', 'smoothstep',
  scalar(responseMatch[0]) + '\nreturn { damp: tdDamp, coating: tdCoating, floor: tdRutDamp, shoulder: tdShoulderDry };');
const roughMatch = source.match(/float tdDryRough=[\s\S]*?roughnessFactor=mix\([^;]+;/);
assert.ok(roughMatch, 'Extract the runtime scalar PBR roughness response');
const evaluateRough = new Function('tdWork', 'tdRough', 'tdAggregateContrast', 'tdDamp', 'tdFilm', 'tdNativeWet', 'tdBlend',
  'tdSubmerged', 'clamp', 'max', 'mix', scalar(roughMatch[0]) + '\nreturn { dry: tdDryRough, roughness: roughnessFactor };');
function response(contact, { nativeWet = .6, rain = 0, emerged = 1, film = 0, submerged = 0, primary = 1,
  mottle = .5, oldRut = 0, oldShoulder = 0, scanRoughness = .7, aggregate = 0 } = {}) {
  const worked = work(contact), blend = { x: primary };
  const damp = evaluateDamp(worked, 1 - Math.exp(-Math.max(0, -contact.z) * 42), clamp(contact.y, 0, 1),
    nativeWet, blend, emerged, rain, mottle, oldRut, film, submerged, oldShoulder, clamp, smoothstep);
  const rough = evaluateRough(worked, scanRoughness, aggregate * worked.looseGrain, damp.damp,
    film, nativeWet, blend, submerged, clamp, Math.max, mix);
  return { worked, ...damp, ...rough };
}
const pristine = { x: 0, y: 0, z: 0, w: 0 };
const rolled = { x: 1, y: .8, z: -.08, w: 0 };
const sheared = { ...rolled, y: 0, w: 1 };

test('untouched ground has no invented worked relief, shoulder or contact darkening', () => {
  assert.deepEqual(work(pristine), { rolled: 0, sheared: 0, spoil: 0, scanFlatten: 0,
    grainRetain: 1, looseGrain: 0, cavity: 1 });
  const drySand = response(pristine, { nativeWet: 0 });
  assert.equal(drySand.damp, 0); assert.equal(drySand.coating, 0);
  assert.equal(drySand.floor, 0); assert.equal(drySand.shoulder, 0);
});

test('high-slip disturbance erases intact scan clods while retaining its own loose aggregates', () => {
  const rolling = work(rolled), scraping = work(sheared);
  // The published material relaxed scan flattening as churn increased. That
  // made the intact photographed clods return inside a sheared wheel path.
  const oldFlatten = contact => clamp(contact.x * (1 - contact.w * .62) + contact.y * .08, 0, 1) * .68;
  assert.ok(oldFlatten(sheared) < oldFlatten(rolled) * .5, 'The captured old rule reproduces restored intact scan relief');
  assert.ok(scraping.scanFlatten >= rolling.scanFlatten, 'Scraping cannot restore the intact unworked scan');
  assert.ok(scraping.grainRetain < rolling.grainRetain, 'Wind ripples and intact grain relief are removed by scraping');
  assert.equal(rolling.looseGrain, 0, 'Rolling alone does not invent churned aggregates');
  assert.equal(scraping.looseGrain, 1, 'Sheared material keeps its own bounded fine relief');
  assert.ok(response(sheared).dry > response(rolled).dry, 'Loose worked soil stays rougher than the rolled surface');
});

test('real signed displacement produces damp mud floors and exposed rough shoulders without wetting dry sand', () => {
  const floor = { x: .75, y: .5, z: -.08, w: .1 }, shoulder = { x: .22, y: 0, z: .03, w: .1 };
  const bottom = response(floor), bank = response(shoulder);
  assert.ok(bottom.damp > bank.damp + .2);
  assert.ok(bottom.roughness < bank.roughness);
  assert.ok(bottom.coating > bank.coating);
  assert.equal(bottom.shoulder, 0); assert.equal(bank.floor, 0);
  assert.ok(bank.worked.spoil > 0 && bank.worked.looseGrain > 0);
  for (const contact of [floor, shoulder, rolled, sheared]) {
    const sand = response(contact, { nativeWet: 0 });
    assert.equal(sand.damp, 0); assert.equal(sand.coating, 0);
    assert.ok(sand.roughness >= .45, 'A dry sand imprint cannot turn into a glossy wet stripe');
  }
  const rainyBank = response(shoulder, { rain: 1 }), underwaterBank = response(shoulder, { emerged: 0, submerged: 1 });
  assert.ok(rainyBank.shoulder < bank.shoulder * .25, 'Rain suppresses the exposed-shoulder dryness estimate');
  assert.equal(underwaterBank.shoulder, 0, 'Submerged spoil cannot receive an emerged drying term');
  assert.equal(underwaterBank.coating, 0, 'Submerged soil cannot add a second exposed clearcoat surface');
  assert.ok(underwaterBank.roughness >= .76);
});

test('worked material coefficients stay finite and bounded across contact, weather and sample extremes', t => {
  let states = 0;
  for (const compression of [0, .2, .7, 1]) for (const tread of [0, .3, 1]) {
    for (const displacement of [-1, -.08, -.002, 0, .002, .03, 1]) for (const shear of [0, .1, .5, 1]) {
      const contact = { x: compression, y: tread, z: displacement, w: shear };
      const state = work(contact);
      for (const [name, value] of Object.entries(state)) {
        assert.ok(Number.isFinite(value), `${name} is finite`);
        assert.ok(value >= 0 && value <= (name === 'cavity' ? 1.095 : 1), `${name} is bounded`);
      }
      assert.ok(state.cavity >= .70, 'Contact shading cannot manufacture black trenches');
      for (const nativeWet of [0, .6, .9]) for (const rain of [0, 1]) for (const mottle of [0, 1]) {
        for (const scanRoughness of [0, 1]) for (const aggregate of [-.5, .5]) {
          const result = response(contact, { nativeWet, rain, mottle, scanRoughness, aggregate });
          for (const name of ['damp', 'coating', 'dry', 'roughness']) {
            assert.ok(Number.isFinite(result[name]) && result[name] >= 0 && result[name] <= 1, `${name} remains a bounded material coefficient`);
          }
          assert.ok(result.roughness >= .15); states++;
        }
      }
    }
  }
  t.diagnostic(`${states} evaluations of the actual runtime GLSL scalar response; native pixels are verified separately`);
});
