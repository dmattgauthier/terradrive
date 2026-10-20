import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { HDRLoader } from '../dist/vendor/HDRLoader.js';
import { OUTDOOR_LIGHTING, outdoorSunOffset, outdoorEnvironmentYaw, prepareOutdoorRadiance } from '../dist/src/outdoor-lighting.js';
import { OffroadWorld } from '../dist/src/world.js';

for (const preset of Object.values(OUTDOOR_LIGHTING)) {
  const sun = outdoorSunOffset(preset.id).normalize(), yaw = outdoorEnvironmentYaw(preset, sun);
  const lookup = new THREE.Matrix4().makeRotationY(-yaw);
  const direction = sun.clone().transformDirection(lookup);
  assert.ok(direction.distanceTo(new THREE.Vector3(...preset.sourceSun)) < 1e-12, 'The sky, directional sun and HDR solar centroid share one direction');
  assert.equal(new THREE.Vector3(.6, 0, .8).transformDirection(lookup).y, 0, 'Environment alignment leaves the photographed horizon horizontal');

  const file = new URL('../dist/assets/terrain/' + preset.filename, import.meta.url), bytes = readFileSync(file);
  const parsed = new HDRLoader().setDataType(THREE.FloatType).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const original = parsed.data;
  const texture = new THREE.DataTexture(original, parsed.width, parsed.height, THREE.RGBAFormat, THREE.FloatType);
  const result = prepareOutdoorRadiance(texture, preset), output = texture.image.data;
  assert.ok(result.adjustedPixels > 0 && result.adjustedPixels < result.pixels * .001, 'Only a tiny high-radiance solar core is conditioned');
  assert.ok(result.peakLuminanceBefore > 100000 && result.peakLuminanceAfter <= 128.001, 'Unclipped solar radiance is bounded before PMREM and half-float conversion');
  assert.equal(texture.type, THREE.HalfFloatType);
  let changedPixels = 0;
  for (let i = 0; i < original.length; i += 4) {
    const beforeY = .2126 * original[i] + .7152 * original[i + 1] + .0722 * original[i + 2];
    if (beforeY <= 32) for (let k = 0; k < 3; k++) assert.equal(output[i + k], THREE.DataUtils.toHalfFloat(original[i + k]), 'Ordinary sky and landscape radiance remains unchanged apart from ordinary half-float precision');
    const decoded = [0, 1, 2].map(k => THREE.DataUtils.fromHalfFloat(output[i + k]));
    for (const value of decoded) assert.ok(Number.isFinite(value) && value >= 0);
    if (beforeY > 32 && Math.abs(decoded[0] - original[i]) > .1) {
      changedPixels++;
      const ratio = original[i] / original[i + 1], after = decoded[0] / decoded[1];
      assert.ok(Math.abs(after / ratio - 1) < .0015, 'Solar compression preserves channel ratios instead of clipping channels independently');
    }
    assert.equal(output[i + 3], THREE.DataUtils.toHalfFloat(original[i + 3]));
  }
  assert.ok(changedPixels > result.adjustedPixels * .8 && changedPixels <= result.adjustedPixels, 'The measured large solar changes agree with the bounded conditioning population');
  texture.dispose();
}

// Exercise the real asynchronous loader callbacks, switching presets before
// completion, cached reuse, and late completion after world disposal.
const pending = [], originalLoad = THREE.FileLoader.prototype.load, originalPMREM = THREE.PMREMGenerator.prototype.fromEquirectangular;
let conversions = 0, startupDisposals = 0;
THREE.FileLoader.prototype.load = function(url, onLoad, onProgress, onError) { pending.push({ url, onLoad, onError }); return {}; };
THREE.PMREMGenerator.prototype.fromEquirectangular = function(texture) {
  conversions++; return { texture: new THREE.Texture(), dispose() {} };
};
try {
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, { timeOfDay: 'day', weather: 'dry', scene: new THREE.Scene(), renderer: { compile() {} }, waterBodies: [{ lastReflection: 8 }], _startupEnvironment: { dispose() { startupDisposals++; } } });
  world._loadOutdoorEnvironment(); world._loadOutdoorEnvironment();
  assert.equal(pending.length, 1, 'Repeated frame/setup requests cannot issue duplicate HDR loads');
  world.timeOfDay = 'sunset'; world._loadOutdoorEnvironment();
  assert.equal(pending.length, 2);
  const finish = request => { const bytes = readFileSync(new URL(request.url)); request.onLoad(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); };
  finish(pending[0]);
  assert.equal(world._hasPhotoEnvironment, undefined, 'A slower previous selection cannot replace the requested environment');
  finish(pending[1]);
  assert.equal(world.environment, world._outdoorEnvironments.get('sunset'));
  assert.equal(startupDisposals, 1); assert.equal(world.waterBodies[0].lastReflection, -100);
  world.timeOfDay = 'day'; world._loadOutdoorEnvironment();
  assert.equal(world.environment, world._outdoorEnvironments.get('day')); assert.equal(pending.length, 2); assert.equal(conversions, 2);
  const late = Object.create(OffroadWorld.prototype); Object.assign(late, { timeOfDay: 'day', scene: new THREE.Scene(), renderer: { compile() {} } });
  late._loadOutdoorEnvironment(); late._disposed = true; finish(pending[2]);
  assert.equal(late._outdoorEnvironments.size, 0); assert.equal(conversions, 2, 'Late texture completion cannot create GPU resources on a disposed world');
  const stale = Object.create(OffroadWorld.prototype); Object.assign(stale, { timeOfDay: 'day', weather: 'dry', scene: new THREE.Scene(), renderer: { compile() {} } });
  stale._loadOutdoorEnvironment(); stale.timeOfDay = 'sunset'; stale._loadOutdoorEnvironment();
  finish(pending[4]); assert.equal(stale.environmentFallback, false);
  pending[3].onError(new Error('The previous daylight request failed'));
  assert.equal(stale.environmentFallback, false, 'A stale request failure must not mark a healthy active preset as fallback');
  assert.equal(stale.environment, stale._outdoorEnvironments.get('sunset'));
} finally { THREE.FileLoader.prototype.load = originalLoad; THREE.PMREMGenerator.prototype.fromEquirectangular = originalPMREM; }
