import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { GaragePreview, createShowroomPose } from '../dist/src/garage.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { deriveVehicle } from '../dist/src/upgrades.js';
import { measureShowroomVehicle } from '../dist/src/render-lighting.js';

// Exercise the real pose, model builder and camera without claiming WebGL QA.
// Only the final GPU draw and 2D copy are replaced with no-op stand-ins.
function previewHarness() {
  const preview = Object.create(GaragePreview.prototype);
  preview.camera = new THREE.PerspectiveCamera(37, 1.6, .05, 90);
  preview.environment = { texture: null };
  preview.renderer = { setSize() {}, render(scene) { scene.updateMatrixWorld(true); }, domElement: {} };
  return preview;
}

test('each pristine showroom vehicle rests on four loaded tires with independent state', () => {
  for (const spec of VEHICLES) {
    const pose = createShowroomPose(spec);
    assert.equal(pose.damage.condition, 1);
    assert.equal(pose.damage.disabled, false);
    assert.equal(pose.selector, 'P');
    assert.ok(Math.abs(pose.speed) < .02, `${spec.id} must be stationary in the garage`);
    const supported = pose.wheels.reduce((load, wheel) => load + wheel.load, 0);
    assert.ok(Math.abs(supported / (spec.mass * 9.81) - 1) < .02, `${spec.id} showroom load must support the actual vehicle mass`);
    for (const wheel of pose.wheels) {
      assert.ok(wheel.contact && wheel.deflection > 0, `${spec.id} showroom tires must visibly carry load`);
      assert.ok(Math.abs(wheel.position.y - wheel.radius) < .025, `${spec.id} tire must rest at the common ground plane`);
    }
    pose.damage.body = .9;
    assert.equal(createShowroomPose(spec).damage.body, 0, 'Preview state must not persist damage into a different instance');
  }
});

test('actual garage camera keeps all four vehicle bounds in frame through rotation and elevation', () => {
  globalThis.window = { devicePixelRatio: 1 };
  try {
    for (const spec of VEHICLES) {
      const preview = previewHarness();
      const context = { clearRect() {}, drawImage() {} };
      const canvas = { width: 640, height: 400, getBoundingClientRect: () => ({ width: 640, height: 400 }), getContext: () => context, parentElement: { querySelector: () => null }, setAttribute() {} };
      const entry = { spec, paint: '#b93d36', canvas, yaw: .68, elevation: .20 };
      preview._build(entry);
      assert.equal(entry.scene.background, null, 'A garage scene must remain isolated on a transparent background');
      assert.equal(entry.model.materials.paint.color.getHexString(), 'b93d36');
      const bounds = measureShowroomVehicle(entry.scene).bounds;
      for (const elevation of [-.02, .20, .55]) for (let angle = 0; angle < 12; angle++) {
        entry.yaw = angle * Math.PI / 6; entry.elevation = elevation;
        preview._render(entry); preview.camera.updateMatrixWorld(true);
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(preview.camera);
          assert.ok(Math.abs(point.x) < .98 && Math.abs(point.y) < .98 && point.z > -1 && point.z < 1, `${spec.id} must stay in frame at yaw ${entry.yaw.toFixed(2)}, elevation ${elevation}: ${point.toArray()}`);
        }
      }
      preview._releaseScene(entry);
    }
  } finally { delete globalThis.window; }
});

test('garage winch equipment persists across rebuilds and refits camera bounds when attached or removed', () => {
  globalThis.window = { devicePixelRatio: 1 };
  try {
    for (const spec of VEHICLES) {
      const preview = previewHarness(), context = { clearRect() {}, drawImage() {} };
      const canvas = { width: 640, height: 400, getBoundingClientRect: () => ({ width: 640, height: 400 }), getContext: () => context, parentElement: { querySelector: () => null }, setAttribute() {} };
      const entry = { spec, paint: '#527967', canvas, yaw: .68, elevation: .20, winchEnabled: true };
      preview.entries = new Map([[spec.id, entry]]); preview.queue = () => {};
      preview._build(entry);
      assert.ok(entry.model.winchEnabled, 'A saved garage equipment choice must configure the actual model');
      const fitted = entry.size.clone();
      preview.setWinchEnabled(spec.id, false);
      assert.ok(entry.size.z <= fitted.z + 1e-10, `${spec.id} removing hardware must not expand the camera bounds`);
      assert.equal(entry.model.winchKit.parent, null, 'A removed kit must not contribute hidden geometry to studio framing');
      preview.setWinchEnabled(spec.id, true);
      assert.ok(entry.size.distanceTo(fitted) < 1e-10);
      assert.equal(entry.model.materials.paint.color.getHexString(), '527967');
      const bounds = measureShowroomVehicle(entry.scene).bounds;
      for (const elevation of [-.02, .20, .55]) for (const yaw of [0, .70, Math.PI / 2, Math.PI]) {
        entry.yaw = yaw; entry.elevation = elevation; preview._render(entry); preview.camera.updateMatrixWorld(true);
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(preview.camera);
          assert.ok(Math.abs(p.x) < .98 && Math.abs(p.y) < .98 && p.z > -1 && p.z < 1, `${spec.id} fitted winch must stay in the studio frame`);
        }
      }
      preview._releaseScene(entry);
    }
  } finally { delete globalThis.window; }
});

test('workshop draft remount rebuilds the effective model and pose while preserving paint, equipment, rotation and single input handlers', () => {
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const preview = previewHarness(), context = { clearRect() {}, drawImage() {} };
    preview.entries = new Map(); preview.queue = () => {};
    const makeCanvas = () => {
      const listeners = new Map();
      return {
        listeners, width: 640, height: 400,
        getBoundingClientRect: () => ({ width: 640, height: 400 }), getContext: () => context,
        parentElement: { querySelector: () => null }, setAttribute() {},
        addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
      };
    };
    const garageCanvas = makeCanvas(), workshopCanvas = makeCanvas(); let canvas = garageCanvas;
    const container = { querySelector: () => canvas }, base = VEHICLES.find(v => v.bodyStyle === 'sedan');
    const factory = deriveVehicle(base), colors = { [base.id]: '#37658f' }, kits = { [base.id]: true };
    preview.mount(container, [factory], colors, kits);
    const entry = preview.entries.get(base.id); preview._render(entry);
    entry.yaw = .91; entry.elevation = .34;
    const oldModel = entry.model, oldState = entry.state, oldGeometry = oldModel.wheels[0].tireSpin.children.find(object => object.isMesh).geometry;
    let released = 0; oldGeometry.addEventListener('dispose', () => released++);
    const effective = deriveVehicle(base, { size: 'large', tires: 'allTerrain', suspension: 'trail', drivetrain: 'conversion' });
    preview.mount(container, [effective], colors, kits);
    assert.equal(released, 1, 'Replacing a live workshop draft must release its previous model buffers');
    assert.equal(entry.model, null); assert.equal(entry.state, null);
    assert.equal(entry.spec, effective); assert.equal(entry.yaw, .91); assert.equal(entry.elevation, .34);
    preview._render(entry);
    assert.notEqual(entry.model, oldModel); assert.notEqual(entry.state, oldState);
    assert.equal(entry.model.wheels[0].root.userData.tire.radius, effective.tireRadius);
    assert.equal(entry.model.wheels[0].root.userData.tire.profile, 'all-terrain');
    assert.equal(entry.model.materials.paint.color.getHexString(), '37658f');
    assert.equal(entry.model.winchEnabled, true);
    assert.equal(entry.model.driveLinks.filter(link => link.target.wheel !== undefined).length, 4);
    const totalLoad = entry.state.wheels.reduce((sum, wheel) => sum + wheel.load, 0);
    assert.ok(Math.abs(totalLoad / (effective.mass * 9.81) - 1) < .02, 'Draft pose must settle the newly installed mass and suspension');
    const rebuilt = entry.model;
    preview.mount(container, [structuredClone(effective)], colors, kits);
    assert.equal(entry.model, rebuilt, 'An equivalent immutable record must reuse the existing mesh');
    canvas = workshopCanvas; preview.mount(container, [effective], colors, kits);
    canvas = garageCanvas; preview.mount(container, [effective], colors, kits);
    for (const surface of [garageCanvas, workshopCanvas]) for (const [type, handlers] of surface.listeners) {
      assert.equal(handlers.length, 1, `Returning to an existing ${type} surface must not stack input handlers`);
    }
    entry.model.dispose();
  } finally { delete globalThis.window; }
});
