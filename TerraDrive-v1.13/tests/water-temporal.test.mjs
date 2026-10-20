import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { OffroadWorld } from '../dist/src/world.js';
import { createLegacyWaterReflectionCamera } from './fixtures/water-reflection-v1.3.mjs';

function body(id = 'wetland', level = 3.18) {
  return { id, level, cx: -24, cz: 148, rx: 53, rz: 71, reflectionMatrix: new THREE.Matrix4(), reflectionCamera: new THREE.PerspectiveCamera(), reflectionTarget: { id }, reflectionReady: 0, lastReflection: -100, shaders: [{ uniforms: { tdWaterReflectionReady: { value: 0 } } }], mesh: { visible: true } };
}
function camera(position = [-38, 5.5, 112], target = [-24, 3.18, 139]) {
  const result = new THREE.PerspectiveCamera(51, 1100 / 720, .12, 500);
  result.position.set(...position); result.lookAt(...target); result.updateMatrixWorld(true); return result;
}
const projectionDelta = (a, b) => Math.max(...a.map((n, i) => Math.abs(n - b[i])));
const snapshot = (world, water, view) => {
  const mirror = world._waterReflectionCamera(water, view);
  return { projection: mirror.projectionMatrix.toArray(), inverse: mirror.projectionMatrixInverse.toArray(), view: mirror.matrixWorldInverse.toArray(), texture: water.reflectionMatrix.toArray(), up: mirror.up.toArray() };
};

test('stationary captures reproduce v1.3 flashing but the fixed clip plane has no temporal drift', () => {
  const world = Object.create(OffroadWorld.prototype), view = camera(), water = body();
  const legacy = createLegacyWaterReflectionCamera(THREE), oldBody = body();
  const old = Array.from({ length: 6 }, () => legacy(oldBody, view).projectionMatrix.toArray());
  assert.ok(projectionDelta(old[0], old[1]) > 20, 'The original alias fixture must exhibit the reported stationary-camera failure');
  assert.ok(Math.max(...old.slice(1).map((p, i) => projectionDelta(p, old[i]))) > 1000, 'Legacy clipping becomes severely corrupted over successive frames');
  const expected = snapshot(world, water, view), mainProjection = view.projectionMatrix.toArray(), mainUp = view.up.toArray();
  for (let i = 0; i < 240; i++) assert.deepEqual(snapshot(world, water, view), expected, `Stationary capture ${i} cannot change view/projection/texture coordinates`);
  assert.deepEqual(view.projectionMatrix.toArray(), mainProjection); assert.deepEqual(view.up.toArray(), mainUp);
});

test('alternating water bodies, camera pitch and roll cannot contaminate a later reflection', () => {
  const world = Object.create(OffroadWorld.prototype), wetland = body(), mud = body('mud', 3.265), home = camera();
  const expected = snapshot(world, wetland, home);
  for (let i = 0; i < 48; i++) {
    const view = camera([48 + Math.sin(i) * 12, 3.34 + i * .07, -133 + i], [48, 3.265, -111]);
    view.rotateZ(Math.sin(i * .7) * .21); snapshot(world, mud, view);
    assert.deepEqual(snapshot(world, wetland, home), expected, 'The world-up normal belongs to each capture, not the previous water body/camera');
  }
  const reflected = new THREE.Vector4(-24, wetland.level, 139, 1).applyMatrix4(wetland.reflectionMatrix);
  assert.ok(reflected.w > 0 && reflected.x / reflected.w > 0 && reflected.x / reflected.w < 1);
});

function renderFixture() {
  const world = Object.create(OffroadWorld.prototype), water = body(), captures = [];
  const priorTarget = { id: 'prior-target' }, viewport = new THREE.Vector4(13, 17, 1100, 720), scissor = new THREE.Vector4(21, 23, 1060, 690);
  let active = priorTarget, face = 3, mip = 2, scissorTest = true;
  const renderer = {
    shadowMap: { autoUpdate: true, needsUpdate: true }, xr: { enabled: true },
    toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace,
    getRenderTarget: () => active, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    getViewport: target => target.copy(viewport), setViewport: value => viewport.copy(value),
    getScissor: target => target.copy(scissor), setScissor: value => scissor.copy(value),
    getScissorTest: () => scissorTest, setScissorTest: value => { scissorTest = value; },
    setRenderTarget(target, nextFace = 0, nextMip = 0) { active = target; face = nextFace; mip = nextMip; },
    state: { buffers: { depth: { setMask() {} } } }, clear() {},
    render(scene, mirror) {
      assert.equal(this.shadowMap.autoUpdate, false); assert.equal(this.shadowMap.needsUpdate, false, 'Pending main-view shadow work cannot execute in a reflection');
      assert.equal(this.xr.enabled, false); assert.equal(scissorTest, false); assert.ok(world.waterBodies.every(b => !b.mesh.visible));
      captures.push({ target: active, projection: mirror.projectionMatrix.toArray(), texture: world.waterBodies.find(b => b.reflectionTarget === active).reflectionMatrix.toArray() });
    },
  };
  Object.assign(world, { renderer, camera: camera(), scene: new THREE.Scene(), waterBodies: [water], clock: 1, quality: 'high', particles: { visible: false }, rain: { visible: true } });
  function restored() {
    assert.equal(active, priorTarget); assert.equal(face, 3); assert.equal(mip, 2);
    assert.deepEqual(viewport.toArray(), [13, 17, 1100, 720]); assert.deepEqual(scissor.toArray(), [21, 23, 1060, 690]); assert.equal(scissorTest, true);
    assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(renderer.shadowMap.needsUpdate, true); assert.equal(renderer.xr.enabled, true);
    assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping); assert.equal(renderer.outputColorSpace, THREE.SRGBColorSpace);
    assert.equal(world.particles.visible, false); assert.equal(world.rain.visible, true); assert.ok(world.waterBodies.every(b => b.mesh.visible));
  }
  return { world, water, renderer, captures, restored };
}

test('reflection cadence holds texture and projection together and restores renderer state on every capture', () => {
  const { world, water, captures, restored } = renderFixture();
  world._renderWaterReflections(); restored();
  assert.equal(captures.length, 1); assert.equal(water.reflectionReady, 1);
  const matrix = water.reflectionMatrix.toArray();
  world.camera.position.x += .2; world.camera.lookAt(-24, 3.18, 139); world.clock += .06;
  world._renderWaterReflections(); assert.equal(captures.length, 1); assert.deepEqual(water.reflectionMatrix.toArray(), matrix, 'Noncapture frames must use the texture matrix of the retained image'); restored();
  world.clock += .07; world._renderWaterReflections(); assert.equal(captures.length, 2); restored();
  const current = captures.at(-1);
  for (let i = 0; i < 16; i++) { world.clock += .13; world._renderWaterReflections(); restored(); assert.deepEqual(captures.at(-1), current); }
});

test('reflection scheduling alternates bodies without reusing another body texture matrix', () => {
  const { world, water, captures, restored } = renderFixture(), other = body('mud', 3.265);
  world.waterBodies.push(other);
  const expected = new Map(world.waterBodies.map(b => [b.id, snapshot(world, b, world.camera)]));
  for (let i = 0; i < 12; i++) {
    world.clock += .13; world._renderWaterReflections(); restored();
    const capture = captures.at(-1), id = i % 2 ? 'mud' : 'wetland';
    assert.equal(capture.target.id, id); assert.deepEqual(capture.texture, expected.get(id).texture); assert.deepEqual(capture.projection, expected.get(id).projection);
  }
  assert.equal(water.reflectionReady, 1); assert.equal(other.reflectionReady, 1);
});

test('a failed mirror render restores state and disables the incomplete image without hiding the water', () => {
  const { world, water, renderer, restored } = renderFixture();
  renderer.render = () => { throw new Error('Controlled reflection framebuffer failure'); };
  assert.doesNotThrow(() => world._renderWaterReflections()); restored();
  assert.equal(water.reflectionReady, 0); assert.equal(water.reflectionFailed, true); assert.equal(water.shaders[0].uniforms.tdWaterReflectionReady.value, 0);
  assert.equal(world.renderingIssues[0].kind, 'reflection'); assert.match(world.renderingIssues[0].message, /Controlled reflection/);
});
