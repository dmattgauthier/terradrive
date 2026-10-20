import * as THREE from '../vendor/three.module.js';
import { VehicleView } from './vehicle-view.js?v=1.15.0';
import { VehiclePhysics } from './physics.js?v=1.15.0';
import { STUDIO_LIGHTING, createStudioEnvironmentTexture, addStudioLights, createShowroomShadow, measureShowroomVehicle } from './render-lighting.js?v=1.15.0';

const clamp = THREE.MathUtils.clamp;
const cleanColor = (value, fallback = '#a6afa5') => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
const geometryKey = spec => JSON.stringify([
  spec.id, spec.bodyStyle, spec.wheelbase, spec.trackFront, spec.trackRear, spec.width, spec.height,
  spec.clearance, spec.mass, spec.cgHeight, spec.frontWeightFraction, spec.tireRadius, spec.tireWidth,
  spec.tireSize, spec.rimDiameter, spec.tireType, spec.stockPSIFront, spec.stockPSIRear,
  spec.suspension, spec.driveModes, spec.visualBase,
]);

export const PAINTS = Object.freeze([
  { name: 'Glacier', color: '#dedfd8' }, { name: 'Graphite', color: '#323a40' },
  { name: 'Alpine', color: '#617669' }, { name: 'Copper', color: '#bf7246' },
  { name: 'Signal red', color: '#b93d36' }, { name: 'Deep blue', color: '#37658f' },
  { name: 'Sandstone', color: '#c1aa7f' }, { name: 'Sunburst', color: '#d09c37' },
]);

/** Settle the actual suspension on a flat surface for a clean showroom pose. */
export function createShowroomPose(spec) {
  const flat = { sample: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, surface: 'asphalt', mu: .94, rollingResistance: .014, softness: 0, maxSink: 0, waterDepth: 0 }) };
  const simulation = new VehiclePhysics(flat, spec);
  simulation.reset({ x: 0, z: 0, heading: 0 });
  simulation.setControl('selector', 'P');
  for (let i = 0; i < 240; i++) simulation.step(1 / 120, { handbrake: true });
  return structuredClone(simulation.state);
}

/**
 * All cards share one offscreen WebGL context. Each card receives an immediate
 * 2D copy of its actual VehicleView render. No photographs, scenery, or other
 * vehicles are added to its scene; rendering happens only on demand.
 */
export class GaragePreview {
  constructor() {
    this.entries = new Map(); this.pending = new Set(); this.frame = 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = STUDIO_LIGHTING.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(37, 1.6, .05, 90);
    this.environment = this._studioEnvironment();
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.redraw()) : null;
    this.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault(); this.contextLost = true;
      for (const entry of this.entries.values()) this._message(entry, 'Model preview paused. Reopen the garage to retry.');
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.redraw(); });
  }

  _studioEnvironment() {
    const map = createStudioEnvironmentTexture();
    const generator = new THREE.PMREMGenerator(this.renderer), target = generator.fromEquirectangular(map);
    generator.dispose(); map.dispose(); return target;
  }

  mount(container, vehicles, paints, vehicleWinches = {}) {
    this.resizeObserver?.disconnect();
    for (const entry of this.entries.values()) entry.canvas = null;
    for (const spec of vehicles) {
      const canvas = container.querySelector(`[data-garage-model="${spec.id}"]`);
      if (!canvas) continue;
      let entry = this.entries.get(spec.id);
      if (!entry) {
        entry = { spec, specKey: geometryKey(spec), yaw: .68, elevation: .20, paint: cleanColor(paints[spec.id], spec.color), winchEnabled: !!vehicleWinches[spec.id], scene: null, model: null, canvas: null };
        this.entries.set(spec.id, entry);
      }
      const nextKey = geometryKey(spec);
      if (entry.specKey !== nextKey) {
        this._releaseScene(entry);
        entry.specKey = nextKey;
      }
      entry.spec = spec;
      entry.canvas = canvas; entry.paint = cleanColor(paints[spec.id], spec.color);
      entry.winchEnabled = !!vehicleWinches[spec.id];
      if (entry.model) { entry.model.setWinchEnabled(entry.winchEnabled); this._measure(entry); }
      this._bind(entry); this.resizeObserver?.observe(canvas); this.queue(spec.id);
    }
  }

  _build(entry) {
    const scene = new THREE.Scene(); scene.environment = this.environment.texture; scene.environmentIntensity = STUDIO_LIGHTING.environmentIntensity;
    entry.lights = addStudioLights(scene);
    entry.scene = scene; entry.model = new VehicleView(scene, entry.spec);
    entry.state = createShowroomPose(entry.spec);
    entry.model.update(entry.state, { paint: entry.paint, headlights: false, brake: 0 });
    entry.model.setPaint?.(entry.paint);
    entry.model.setWinchEnabled(!!entry.winchEnabled); this._measure(entry);
    entry.ground = createShowroomShadow(scene, entry.bounds);
  }

  _measure(entry) {
    Object.assign(entry, measureShowroomVehicle(entry.scene));
    if (entry.ground) entry.ground.position.y = Math.min(0, entry.bounds.min.y) - .004;
  }

  _releaseScene(entry) {
    entry.model?.dispose();
    entry.ground?.geometry.dispose(); entry.ground?.material.dispose();
    for (const light of Object.values(entry.lights || {})) light.shadow?.dispose();
    entry.model = entry.scene = entry.state = entry.ground = entry.lights = null;
  }

  setWinchEnabled(id, enabled) {
    const entry = this.entries.get(id); if (!entry) return;
    entry.winchEnabled = !!enabled;
    if (entry.model) { entry.model.setWinchEnabled(entry.winchEnabled); this._measure(entry); }
    this.queue(id);
  }

  _bind(entry) {
    const canvas = entry.canvas; let dragging = false, lastX = 0, lastY = 0;
    entry.boundCanvases ||= new WeakSet();
    if (entry.boundCanvases.has(canvas)) return;
    entry.boundCanvases.add(canvas);
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      dragging = true; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId); canvas.classList.add('dragging');
      canvas.focus({ preventScroll: true }); event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      if (!dragging) return;
      entry.yaw -= (event.clientX - lastX) * .009;
      entry.elevation = clamp(entry.elevation + (event.clientY - lastY) * .004, -.02, .55);
      lastX = event.clientX; lastY = event.clientY; this.queue(entry.spec.id);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { dragging = false; canvas.classList.remove('dragging'); });
    canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Home') { entry.yaw = .68; entry.elevation = .20; }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') entry.yaw += event.key === 'ArrowLeft' ? -.25 : .25;
      else entry.elevation = clamp(entry.elevation + (event.key === 'ArrowUp' ? .08 : -.08), -.02, .55);
      this.queue(entry.spec.id);
    });
  }

  setPaint(id, color) {
    const entry = this.entries.get(id); if (!entry) return;
    entry.paint = cleanColor(color, entry.paint); entry.model?.setPaint?.(entry.paint); this.queue(id);
  }

  rotate(id) {
    const entry = this.entries.get(id); if (!entry) return;
    entry.yaw += Math.PI / 2; this.queue(id);
  }

  redraw() { for (const [id, entry] of this.entries) if (entry.canvas?.isConnected) this.queue(id); }

  queue(id) {
    this.pending.add(id);
    if (!this.frame) this.frame = requestAnimationFrame(() => this._flush());
  }

  _flush() {
    this.frame = 0;
    if (this.contextLost) return;
    const id = this.pending.values().next().value;
    if (!id) return;
    this.pending.delete(id); const entry = this.entries.get(id);
    if (entry?.canvas?.isConnected && entry.canvas.closest('dialog')?.open) {
      try { this._render(entry); } catch (error) { this._message(entry, 'Model preview unavailable. You can still select paint and drive.'); console.warn('Garage preview', error); }
    }
    if (this.pending.size) this.frame = requestAnimationFrame(() => this._flush());
  }

  _message(entry, text) {
    const message = entry.canvas?.parentElement.querySelector('.garage-model-status');
    if (message) { message.hidden = false; message.textContent = text; }
  }

  _render(entry) {
    if (!entry.scene) this._build(entry);
    const canvas = entry.canvas, rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2), width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const tangent = Math.tan(this.camera.fov * Math.PI / 360);
    const target = entry.center.clone(); target.y -= entry.size.y * .045;
    const outward = new THREE.Vector3(Math.sin(entry.yaw) * Math.cos(entry.elevation), Math.sin(entry.elevation), Math.cos(entry.yaw) * Math.cos(entry.elevation));
    const right = new THREE.Vector3(Math.cos(entry.yaw), 0, -Math.sin(entry.yaw));
    const up = outward.clone().cross(right);
    // Fit all eight corners in perspective, including their different depths.
    // A single diagonal estimate clips long vehicles when viewed from above.
    let distance = 1;
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
      const point = new THREE.Vector3(x * entry.size.x, (y + .045) * entry.size.y, z * entry.size.z);
      const framing = Math.max(Math.abs(point.dot(right)) / (tangent * this.camera.aspect * .89), Math.abs(point.dot(up)) / (tangent * .89));
      distance = Math.max(distance, point.dot(outward) + framing);
    }
    this.camera.position.copy(target).addScaledVector(outward, distance);
    this.camera.lookAt(target); this.camera.updateProjectionMatrix();
    entry.model.update(entry.state, { paint: entry.paint, headlights: false, brake: 0 });
    this.renderer.render(entry.scene, this.camera);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d', { alpha: true });
    context.clearRect(0, 0, width, height); context.drawImage(this.renderer.domElement, 0, 0, width, height);
    const message = canvas.parentElement.querySelector('.garage-model-status'); if (message) message.hidden = true;
    canvas.setAttribute('aria-label', `${entry.spec.name}, ${entry.paint} paint. Drag or use arrow keys to rotate; Home resets the view.`);
  }

  dispose() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect(); this.pending.clear();
    for (const entry of this.entries.values()) this._releaseScene(entry);
    this.entries.clear(); this.environment.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
