import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import { Terrain } from '../dist/src/terrain.js';
import { OffroadWorld, WORLD_VISIBILITY } from '../dist/src/world.js';
import { createMountainGeometry } from '../dist/src/landscape-models.js';
import { challengeLoopFrame, challengeReservedAt } from '../dist/src/challenge-course.js';

// These stand-ins cover canvas texture authoring and renderer state contracts.
// Native shader captures remain the graphics check; no browser/GPU is claimed.
globalThis.window = {devicePixelRatio: 2, innerWidth: 1100, innerHeight: 720};
globalThis.document = {createElement() {
  const context = {fillRect() {}, createRadialGradient: () => ({addColorStop() {}})};
  return {width: 64, height: 64, getContext: () => context};
}};
const terrain = new Terrain();
const vec = p => new THREE.Vector3(p.x, p.y, p.z);
const finiteCamera = camera => {
  camera.updateMatrixWorld(true);
  for (const values of [camera.position.toArray(), camera.up.toArray(), camera.quaternion.toArray(),
    camera.matrixWorld.elements, camera.matrixWorldInverse.elements]) assert.ok(values.every(Number.isFinite));
  assert.ok(Math.abs(camera.up.length() - 1) < 1e-10);
  assert.ok(Math.abs(camera.quaternion.length() - 1) < 1e-10);
};

test('Visibility covers the actual mountain envelope and weather applies distinct fog', () => {
  let longestView = 0;
  for (const layer of [0, 1]) {
    const geometry = createMountainGeometry(terrain, layer), position = geometry.attributes.position;
    for (const x of [-400, 400]) for (const z of [-400, 400]) for (let i = 0; i < position.count; i++) {
      longestView = Math.max(longestView, Math.hypot(position.getX(i) - x, position.getY(i) - 5, position.getZ(i) - z));
    }
    geometry.dispose();
  }
  assert.ok(WORLD_VISIBILITY.farClip > longestView + 100, 'The far clip must retain the mountain envelope from driveable map corners');
  const dryTransmission = Math.exp(-((WORLD_VISIBILITY.dryFog * 1000) ** 2));
  const wetTransmission = Math.exp(-((WORLD_VISIBILITY.wetFog * 1000) ** 2));
  assert.ok(dryTransmission > .45 && wetTransmission < .10, 'Clear air preserves the kilometre horizon while wet weather still limits visibility');
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, {terrain, timeOfDay: 'day', scene: new THREE.Scene(),
    sky: {material: {uniforms: {wet: {value: 0}}}}, rain: new THREE.Object3D(), water: new THREE.Object3D()});
  world.scene.fog = new THREE.FogExp2('#bccbd0', WORLD_VISIBILITY.dryFog); world._createLighting();
  for (const [weather, density, rain] of [['rain', WORLD_VISIBILITY.wetFog, true], ['wet', WORLD_VISIBILITY.wetFog, false], ['dry', WORLD_VISIBILITY.dryFog, false]]) {
    world.setWeather(weather); assert.equal(world.scene.fog.density, density); assert.equal(world.rain.visible, rain);
  }
});

test('High and Medium detail radii keep actual instance populations bounded', () => {
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, {terrain, scene: new THREE.Scene(), clock: 0, quality: 'high',
    camera: new THREE.PerspectiveCamera(51, 1, .12, WORLD_VISIBILITY.farClip),
    canvas: {clientWidth: 1100, clientHeight: 720}, grass: new THREE.Object3D(),
    renderer: {setPixelRatio() {}, setSize() {}, shadowMap: {}},
    _textureLoader: {load() { return new THREE.Texture(); }}});
  world._createGroundDetails();
  const populations = ['grass', 'sedge', 'dry', 'gravel', 'importedRocks'], totals = {};
  for (const [quality, radius] of [['high', WORLD_VISIBILITY.detailHigh], ['medium', WORLD_VISIBILITY.detailMedium]]) {
    world.setQuality(quality); assert.equal(world.groundProximity.radius, radius); totals[quality] = 0;
    let furthestPlant = 0;
    for (const position of [{x: 0, z: -44}, {x: -24, z: 145}, {x: 112, z: 132}]) {
      world._updateGroundProximity(position, true);
      const detail = world.groundProximity, cx = Math.round(position.x / 8) * 8, cz = Math.round(position.z / 8) * 8;
      assert.ok(detail.records.length > 0 && detail.records.length <= 4096);
      assert.equal(detail.records.length, detail.grass.count + detail.sedge.count + detail.dry.count);
      assert.ok(detail.gravel.count <= 2048 && detail.importedRocks.count <= 24);
      for (const name of populations) {
        const mesh = detail[name]; assert.ok(mesh.visible && mesh.count <= mesh.instanceMatrix.count);
        for (const value of mesh.instanceMatrix.array.subarray(0, mesh.count * 16)) assert.ok(Number.isFinite(value));
      }
      for (const record of detail.records) {
        const distance = Math.hypot(record.x - cx, record.z - cz);
        assert.ok(distance < radius && record.fade > 0 && record.fade <= 1);
        assert.equal(challengeReservedAt(record.x, record.z), false, 'The challenge pad is excluded from flexible ground detail');
        furthestPlant = Math.max(furthestPlant, distance);
      }
      totals[quality] += detail.records.length + detail.gravel.count;
    }
    assert.ok(furthestPlant > radius - 4, 'The added radius must actually contain visible detail, not only enlarge a stored setting');
  }
  assert.ok(totals.high > totals.medium, 'The same three terrain studies receive more detail at High');
  world.setQuality('low'); world._updateGroundProximity({x: 0, z: -44}, true);
  for (const name of populations) assert.equal(world.groundProximity[name].visible, false);
});

function cameraWorld() {
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, {terrain: {heightAt: () => 4.6}, cameraMode: 'chase', orbitYaw: -.28, orbitPitch: .38,
    cameraDistance: 9.5, camera: new THREE.PerspectiveCamera(51, 1.6, .12, WORLD_VISIBILITY.farClip),
    _forward: new THREE.Vector3(), _look: new THREE.Vector3(), _desired: new THREE.Vector3(),
    _cameraLook: new THREE.Vector3(), _snapCamera: true, _freeKeys: new Set()});
  return world;
}

function loopState(theta) {
  const frame = challengeLoopFrame(theta), orientation = new THREE.Matrix4().makeBasis(vec(frame.across), vec(frame.normal), vec(frame.tangent));
  return {position: vec(frame.point).addScaledVector(vec(frame.normal), 1),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(orientation), wheels: [{contact: true, featureId: 'loop'}]};
}

test('Chase camera remains finite and continuously oriented through the loop crown', () => {
  const world = cameraWorld(); let previous = null;
  for (let i = 0; i <= 360; i++) {
    const state = loopState(i / 360 * Math.PI * 2);
    world._updateCamera(1 / 60, state, {}); finiteCamera(world.camera);
    if (previous) assert.ok(previous.angleTo(world.camera.quaternion) < .30, 'Vertical loop tangents cannot cause a horizontal-heading camera flip');
    previous = world.camera.quaternion.clone();
    if (i === 180) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
      assert.ok(world.camera.up.dot(up) > .99999 && world.camera.up.y < -.99);
      assert.ok(world.camera.position.y < state.position.y, 'The crown camera stays on the inside below the inverted vehicle');
    }
  }
});

test('Loss of loop contact while inverted recovers a normal chase-camera up direction', () => {
  const world = cameraWorld(), state = {position: {x: -230, y: 40, z: 58},
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
    wheels: [{contact: true, featureId: 'loop'}]};
  world._updateCamera(1 / 60, state, {}); assert.ok(world.camera.up.y < -.999);
  state.wheels = [];
  for (let i = 0; i < 240; i++) {
    const before = world.camera.up.clone(); world._updateCamera(1 / 60, state, {}); finiteCamera(world.camera);
    assert.ok(before.angleTo(world.camera.up) < .25, 'Recovery rotates smoothly rather than normalizing through an antipodal zero');
  }
  assert.equal(world._loopCameraHold, 0); assert.ok(world.camera.up.y > .999);
});

test('Reflections mirror actual rotated camera axes and retain the long far clip', () => {
  for (const up of [[.5, .7, .5], [1, 0, 0], [0, -1, 0]]) {
    const world = cameraWorld(), camera = world.camera;
    camera.position.set(7, 15, -10); camera.up.set(...up).normalize(); camera.lookAt(0, 0, 0);
    const body = {level: 0, reflectionCamera: new THREE.PerspectiveCamera(), reflectionMatrix: new THREE.Matrix4()};
    const mirror = world._waterReflectionCamera(body, camera); finiteCamera(mirror);
    const expectedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion); expectedUp.y *= -1;
    const expectedForward = camera.getWorldDirection(new THREE.Vector3()); expectedForward.y *= -1;
    assert.ok(expectedUp.dot(new THREE.Vector3(0, 1, 0).applyQuaternion(mirror.quaternion)) > .999999);
    assert.ok(expectedForward.dot(mirror.getWorldDirection(new THREE.Vector3())) > .999999);
    assert.equal(mirror.far, WORLD_VISIBILITY.farClip);
    assert.ok(mirror.projectionMatrix.elements.every(Number.isFinite) && mirror.projectionMatrixInverse.elements.every(Number.isFinite));
  }
});

test('Actual tire spray is hidden only for the mirror pass and restored after success or failure', () => {
  for (const fail of [false, true]) for (const initialVisible of [false, true]) {
    const world = cameraWorld(); world.scene = new THREE.Scene(); world.clock = 2; world.quality = 'high';
    world.terrain = {sample: () => ({height: 0, surface: 'mud', moisture: .7, waterDepth: .10})};
    world._createParticles(); world.tireSpray.group.visible = initialVisible;
    world._waterRipples = Array.from({length: 24}, () => new THREE.Vector4());
    world._waterMotions = Array.from({length: 24}, () => new THREE.Vector4()); world._waterRippleCursor = 0;
    const state = {position: {x: 0, y: 1, z: 0}, speed: 8, velocity: {x: 0, y: 0, z: 8},
      wheels: [{index: 0, contact: true, surface: 'mud', load: 6000, omega: 20, radius: .4, speedLong: 8,
        slip: .2, ground: {x: 0, y: 0, z: 0}, normal: {x: 0, y: 1, z: 0}, forward: {x: 0, y: 0, z: 1}}]};
    for (let i = 0; i < 30; i++) world._updateParticles(1 / 60, state);
    assert.ok(world.tireSpray.water.count > 0 && world.tireSpray.mud.count > 0, 'World particle updates reach the actual ejecta simulation/view');
    const body = {mesh: new THREE.Object3D(), level: 0, cx: 0, cz: 0, rx: 20, rz: 20,
      lastReflection: -100, reflectionTarget: {}, reflectionCamera: new THREE.PerspectiveCamera(),
      reflectionMatrix: new THREE.Matrix4(), shaders: []};
    world.waterBodies = [body]; world.camera.position.set(7, 12, -10); world.camera.lookAt(0, 0, 0);
    const originalTarget = {}; let target = originalTarget, renders = 0;
    world.renderer = {shadowMap: {autoUpdate: true, needsUpdate: true}, xr: {enabled: true},
      state: {buffers: {depth: {setMask() {}}}}, getRenderTarget: () => target,
      setRenderTarget(value) {target = value;}, clear() {}, render() {
        renders++; assert.equal(world.tireSpray.group.visible, false); assert.equal(body.mesh.visible, false);
        assert.equal(world.particles.visible, false); assert.equal(world.rain.visible, false);
        assert.equal(this.shadowMap.needsUpdate, false);
        if (fail) throw new Error('Deliberate reflection failure');
      }};
    world._renderWaterReflections();
    assert.equal(renders, 1); assert.equal(world.tireSpray.group.visible, initialVisible);
    assert.equal(body.mesh.visible, true); assert.equal(world.particles.visible, true); assert.equal(world.rain.visible, false);
    assert.equal(world.renderer.shadowMap.autoUpdate, true); assert.equal(world.renderer.shadowMap.needsUpdate, true);
    assert.equal(world.renderer.xr.enabled, true); assert.equal(target, originalTarget);
    assert.equal(body.reflectionReady, fail ? 0 : 1);
    if (fail) assert.equal(world.renderingIssues.at(-1).message, 'Deliberate reflection failure',
      'The failure case must reach the deliberate renderer exception rather than swallow a failed visibility assertion');
    world.resetCamera(); assert.equal(world.tireSpray.mud.count + world.tireSpray.water.count, 0);
  }
});
