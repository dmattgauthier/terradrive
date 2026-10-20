/**
 * Replay actual VehicleView meshes/material shaders through native Mesa GLES.
 * No browser, preview server, replacement model, or simplified lighting shader.
 *
 * node tests/render-model.mjs --out /tmp/terra-model-qa
 *
 * Where child-process spawning is unavailable, supply a baseline directory
 * containing revision.txt and the complete relative source-module closure of
 * vehicle-view.js, exported with git show for that revision. Then run separately:
 * node tests/render-model.mjs --out /tmp/terra-model-qa --baseline-source /tmp/terra-model-baseline --export-only
 * python3 tests/render-model-native.py /tmp/terra-model-qa/model-scenes.json
 *
 * Current model modules and git HEAD modules are snapshotted separately. The
 * same current createShowroomPose() and framing are used for both revisions.
 * Actual shared studio radiance/PMREM, depth shadows and 2x antialiasing are replayed.
 * Real Canvas2D decals are rasterized by Skia. Orthographic views carry a metric scale.
 * Small spare-tire instance sets are expanded on the CPU with their exact matrices.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { VEHICLES } from '../dist/src/vehicles.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { createShowroomPose } from '../dist/src/garage.js';
import { deriveVehicle } from '../dist/src/upgrades.js';
import { createStudioEnvironmentTexture, addStudioLights, createShowroomShadow, measureShowroomVehicle, STUDIO_LIGHTING } from '../dist/src/render-lighting.js';
import { createTextureExporter, flattenUniform, exportPMREM } from './native-render-utils.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
let output, baselineSource, currentSource, studyLabel, selectedVehicle, viewFilter, exportOnly = false, diagnostics = false, baselineDetails = false, signals = false, interiors = false, brakeDetails = false, currentOnly = false, vehicleStates = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--out' && args[index + 1]) output = path.resolve(args[++index]);
  else if (args[index] === '--baseline-source' && args[index + 1]) baselineSource = path.resolve(args[++index]);
  else if (args[index] === '--current-source' && args[index + 1]) currentSource = path.resolve(args[++index]);
  else if (args[index] === '--study-label' && args[index + 1]) studyLabel = args[++index];
  else if (args[index] === '--vehicle' && args[index + 1]) selectedVehicle = args[++index];
  else if (args[index] === '--view-filter' && args[index + 1]) viewFilter = new RegExp(args[++index]);
  else if (args[index] === '--diagnostics') diagnostics = true;
  else if (args[index] === '--baseline-details') { baselineDetails = true; diagnostics = true; }
  else if (args[index] === '--signals') signals = true;
  else if (args[index] === '--brake-details') brakeDetails = true;
  else if (args[index] === '--interiors') interiors = true;
  else if (args[index] === '--current-only') currentOnly = true;
  else if (args[index] === '--vehicle-states') vehicleStates = true;
  else if (args[index] === '--export-only') exportOnly = true;
  else throw new Error('Usage: node tests/render-model.mjs [--out directory] [--baseline-source directory] [--current-source directory --study-label label] [--current-only] [--vehicle id] [--diagnostics] [--baseline-details] [--signals] [--brake-details] [--interiors] [--vehicle-states] [--view-filter expression] [--export-only]');
}
assert(!currentSource || studyLabel, 'A source-isolated control requires an explicit --study-label');
assert(!currentOnly || !baselineSource && !baselineDetails, '--current-only cannot request a baseline source or baseline details');
const selectedVehicles = selectedVehicle?.split(',');
assert(!selectedVehicles || selectedVehicles.every(id => VEHICLES.some(spec => spec.id === id)), 'Unknown selected vehicle');
const dir = output || fs.mkdtempSync(path.join(os.tmpdir(), 'terra-model-qa-'));
fs.mkdirSync(dir, { recursive: true });
const baselineRevision = currentOnly ? null : baselineSource ? fs.readFileSync(path.join(baselineSource, 'revision.txt'), 'utf8').trim()
  : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const hashes = {};
const digest = data => createHash('sha256').update(data).digest('hex');
const asURL = file => pathToFileURL(file).href;
let baselinePackageSource;
if (baselineSource) {
  const packagePath = [path.join(baselineSource, 'published-tree/package.json'), path.join(baselineSource, 'package.json')]
    .find(file => fs.existsSync(file));
  if (packagePath) baselinePackageSource = fs.readFileSync(packagePath, 'utf8');
} else if (!currentOnly) {
  try { baselinePackageSource = execFileSync('git', ['show', `${baselineRevision}:package.json`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { /* A source-only historical baseline may not contain package metadata. */ }
}
const baselineVersion = baselinePackageSource ? JSON.parse(baselinePackageSource).version : null;
const baselineLabel = currentOnly ? null : baselineVersion ? `Published v${baselineVersion}` : `Published ${baselineRevision.slice(0, 8)}`;
const baseline = currentOnly ? { status: 'none', reason: 'Current-model inspection; a newly added vehicle has no corresponding published model.' }
  : { status: 'included', revision: baselineRevision, label: baselineLabel };
if (baselinePackageSource) hashes['baseline/package.json'] = digest(baselinePackageSource);
const require = createRequire(import.meta.url), canvasModulePath = require.resolve('@napi-rs/canvas');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const canvasPackage = JSON.parse(fs.readFileSync(path.join(path.dirname(canvasModulePath), 'package.json'), 'utf8'));
const canvasBackend = { package: '@napi-rs/canvas', version: canvasPackage.version, fontAlias: 'Arial', fontFamily: 'Nimbus Sans',
  note: 'Actual application Canvas2D calls and texture pixels; deterministic Nimbus Sans substitution for Arial may differ from browser font rasterization.' };
for (const filename of ['NimbusSans-Regular.otf', 'NimbusSans-Bold.otf']) {
  const font = path.join('/usr/share/fonts/opentype/urw-base35', filename);
  assert(GlobalFonts.registerFromPath(font, 'Arial'), 'Register deterministic Canvas2D font');
  hashes['qa-font/' + filename] = digest(fs.readFileSync(font));
}
hashes['qa-dependency/@napi-rs/canvas/package.json'] = digest(fs.readFileSync(path.join(path.dirname(canvasModulePath), 'package.json')));
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas', 'Native model export supports real Canvas2D decals only, not a browser DOM');
  return createCanvas(1, 1);
} };

const assembler = fs.readFileSync(path.join(repo, 'dist/vendor/three.module.js'), 'utf8')
  .replaceAll("'./three.core.js'", JSON.stringify(asURL(path.join(repo, 'dist/vendor/three.core.js'))))
  + '\nexport { WebGLProgram as QA_WebGLProgram, WebGLPrograms as QA_WebGLPrograms, WebGLMaterials as QA_WebGLMaterials, WebGLLights as QA_WebGLLights };\n';
const assemblerPath = path.join(dir, 'three-model-qa.mjs');
fs.writeFileSync(assemblerPath, assembler);
const T = await import(asURL(assemblerPath));

async function snapshot(version) {
  const output = path.join(dir, version + '-source');
  const originalRoot = path.join(repo, 'dist/src');
  const sourceRoot = version === 'baseline' ? (baselineSource || originalRoot)
    : currentSource || originalRoot;
  const rawOutput = path.join(dir, version + '-raw-source');
  fs.mkdirSync(output, { recursive: true });
  const modules = new Map();
  const names = version === 'baseline' ? ['vehicle-view.js', 'vehicle-deformation.js', 'recovery-mount.js']
    : fs.readdirSync(sourceRoot).filter(name => /^vehicle-.*\.js$/.test(name) || name === 'recovery-mount.js');
  const readModule = name => version === 'baseline'
    ? baselineSource ? fs.readFileSync(path.join(baselineSource, name), 'utf8')
      : execFileSync('git', ['show', `${baselineRevision}:dist/src/${name}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    : fs.readFileSync(path.join(sourceRoot, name), 'utf8');
  for (const name of names) {
    const sourcePath = 'dist/src/' + name;
    let source;
    try { source = readModule(name); }
    catch (error) { if (version === 'baseline' && name === 'recovery-mount.js') continue; throw error; }
    hashes[`${version}/${sourcePath}`] = digest(source);
    modules.set(name, source);
  }
  // Body builders may acquire new geometry/tessellation helpers. Capture their
  // complete relative source-module closure for BOTH revisions. In particular,
  // a published baseline with extracted body builders must never resolve those
  // imports to a subsequently edited working tree.
  for (const [name, source] of modules) {
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const request = match[1].split(/[?#]/)[0];
      if (!request.startsWith('.')) continue;
      const resolved = path.resolve(sourceRoot, path.dirname(name), request);
      if (!resolved.startsWith(sourceRoot + path.sep) || !resolved.endsWith('.js')) continue;
      const relative = path.relative(sourceRoot, resolved);
      if (modules.has(relative)) continue;
      const dependency = readModule(relative);
      modules.set(relative, dependency);
      hashes[`${version}/dist/src/${relative}`] = digest(dependency);
    }
  }
  for (const [name, source] of modules) {
    const rawTarget = path.join(rawOutput, name);
    fs.mkdirSync(path.dirname(rawTarget), { recursive: true });
    fs.writeFileSync(rawTarget, source);
    const rewritten = source.replace(/(from\s+['"])([^'"]+)(['"])/g, (_, start, request, end) => {
      if (!request.startsWith('.')) return start + request + end;
      const pathname = request.split(/[?#]/)[0], dependency = path.resolve(sourceRoot, path.dirname(name), pathname);
      const relative = path.relative(sourceRoot, dependency);
      if (dependency.startsWith(sourceRoot + path.sep) && dependency.endsWith('.js')) {
        assert(modules.has(relative), `Uncaptured ${version} source dependency: ${name} -> ${request}`);
      }
      const resolved = modules.has(relative)
        ? path.join(output, relative.replace(/\.js$/, '.mjs'))
        : path.resolve(originalRoot, path.dirname(name), pathname);
      return start + asURL(resolved) + end;
    });
    const target = path.join(output, name.replace(/\.js$/, '.mjs'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rewritten);
  }
  return (await import(asURL(path.join(output, 'vehicle-view.mjs')))).VehicleView;
}
const classes = currentOnly ? { current: await snapshot('current') } : { baseline: await snapshot('baseline'), current: await snapshot('current') };
for (const file of ['dist/src/physics.js', 'dist/src/vehicles.js', 'dist/src/garage.js', 'dist/src/upgrades.js', 'dist/vendor/three.module.js', 'dist/vendor/three.core.js',
  'dist/src/render-lighting.js', 'tests/render-model.mjs', 'tests/render-model-native.py', 'tests/shader-compile-native.py', 'tests/native-render-utils.mjs']) {
  hashes[file] = digest(fs.readFileSync(path.join(repo, file)));
}

const capture = {
  VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
  createProgram: () => ({ shaders: [] }), createShader: type => ({ type }),
  shaderSource(shader, source) { shader.source = source; }, compileShader() {},
  attachShader(program, shader) { program.shaders.push(shader); }, linkProgram() {}, bindAttribLocation() {},
};
let activeTarget = null;
const renderer = {
  getContext: () => capture, getRenderTarget: () => activeTarget,
  state: { buffers: { depth: { getReversed: () => false } } },
  shadowMap: { enabled: true, type: STUDIO_LIGHTING.shadowMapType ?? T.PCFShadowMap },
  toneMapping: T.ACESFilmicToneMapping, outputColorSpace: T.SRGBColorSpace,
  debug: { checkShaderErrors: false },
};
const capabilities = { logarithmicDepthBuffer: false, vertexTextures: true, precision: 'highp', getMaxPrecision: value => value };
const programs = T.QA_WebGLPrograms(renderer, { get: value => value }, { get: value => value }, { has: () => false }, capabilities, {}, { numPlanes: 0, numIntersection: 0 });
const materialProperties = new WeakMap();
const refresh = T.QA_WebGLMaterials(renderer, { get: material => materialProperties.get(material) || {} });
const studio = exportPMREM(T, dir, createStudioEnvironmentTexture(), 'studio-environment');
const exportTexture = createTextureExporter(T, dir, 'model-texture');
const shaderCache = new Map(), geometryCache = new Map(), instanceCache = new WeakMap();
const cases = [], shaderManifest = [];

function flatten(value, name, target) {
  flattenUniform(value, name, target, exportTexture);
}

function expandInstances(mesh) {
  if (!mesh.isInstancedMesh) return mesh;
  if (instanceCache.has(mesh)) return instanceCache.get(mesh);
  const source = mesh.geometry, count = source.attributes.position.count;
  const arrays = Object.fromEntries(Object.entries(source.attributes).map(([name, attribute]) => [name, new Float32Array(attribute.count * attribute.itemSize * mesh.count)]));
  const original = source.index?.array || Array.from({ length: count }, (_, i) => i);
  const indices = new Uint32Array(original.length * mesh.count);
  const matrix = new T.Matrix4(), normal = new T.Matrix3(), vector = new T.Vector3();
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix); normal.getNormalMatrix(matrix);
    for (const [name, attribute] of Object.entries(source.attributes)) for (let i = 0; i < count; i++) {
      const offset = (instance * count + i) * attribute.itemSize;
      if (name === 'position' || name === 'normal') {
        vector.fromBufferAttribute(attribute, i);
        if (name === 'position') vector.applyMatrix4(matrix); else vector.applyMatrix3(normal).normalize();
        vector.toArray(arrays[name], offset);
      } else for (let k = 0; k < attribute.itemSize; k++) arrays[name][offset + k] = attribute.array[i * attribute.itemSize + k];
    }
    for (let i = 0; i < original.length; i++) indices[instance * original.length + i] = original[i] + instance * count;
  }
  const geometry = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, new T.BufferAttribute(arrays[name], attribute.itemSize));
  geometry.setIndex(new T.BufferAttribute(indices, 1));
  const proxy = new T.Mesh(geometry, mesh.material); proxy.matrixWorld.copy(mesh.matrixWorld); proxy.name = mesh.name || 'expanded-spare-tread';
  proxy.renderOrder = mesh.renderOrder;
  proxy.castShadow = mesh.castShadow; proxy.receiveShadow = mesh.receiveShadow;
  instanceCache.set(mesh, proxy);
  return proxy;
}

function exportGeometry(geometry) {
  if (geometryCache.has(geometry)) return geometryCache.get(geometry);
  const id = `geometry-${geometryCache.size}`, attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    assert(!attribute.isInterleavedBufferAttribute, 'Export interleaved attributes explicitly if a model starts using them');
    const array = new Float32Array(attribute.array), file = `${id}-${name}.bin`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(array.buffer));
    attributes[name] = { file, itemSize: attribute.itemSize, count: attribute.count };
  }
  const indices = new Uint32Array(geometry.index?.array || Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
  const index = id + '-index.bin'; fs.writeFileSync(path.join(dir, index), Buffer.from(indices.buffer));
  const output = { id, attributes, index, totalIndices: indices.length };
  geometryCache.set(geometry, output);
  return output;
}

function exportDraw(mesh, material, scene, camera, lights, range, side) {
  const originalSide = material.side; material.side = side;
  const parameters = programs.getParameters(material, lights.state, scene.userData.nativeShadowLights || [], scene, mesh);
  parameters.uniforms = T.UniformsUtils.clone(T.ShaderLib[parameters.shaderID].uniforms);
  material.onBeforeCompile(parameters, renderer);
  materialProperties.set(material, { envMap: material.isMeshStandardMaterial ? scene.environment : null, envMapRotation: scene.environmentRotation });
  refresh.refreshMaterialUniforms(parameters.uniforms, material, 1, 720, null);
  if (material.isMeshStandardMaterial) parameters.uniforms.envMapIntensity.value = scene.environmentIntensity;
  const assembled = new T.QA_WebGLProgram(renderer, 'model', parameters, {});
  const hash = digest(assembled.vertexShader.source + assembled.fragmentShader.source);
  let shader = shaderCache.get(hash);
  if (!shader) {
    shader = `model-program-${shaderCache.size}`;
    fs.writeFileSync(path.join(dir, shader + '.vert'), assembled.vertexShader.source);
    fs.writeFileSync(path.join(dir, shader + '.frag'), assembled.fragmentShader.source);
    shaderManifest.push({ name: shader, hash, vertex: shader + '.vert', fragment: shader + '.frag' });
    shaderCache.set(hash, shader);
  }
  const uniforms = {};
  for (const [name, entry] of Object.entries(parameters.uniforms)) flatten(entry.value, name, uniforms);
  flatten(lights.state.ambient, 'ambientLightColor', uniforms);
  flatten(lights.state.probe, 'lightProbe', uniforms);
  flatten(lights.state.directional, 'directionalLights', uniforms);
  flatten(lights.state.hemi, 'hemisphereLights', uniforms);
  flatten(lights.state.directionalShadow, 'directionalLightShadows', uniforms);
  flatten(lights.state.directionalShadowMap, 'directionalShadowMap', uniforms);
  flatten(lights.state.directionalShadowMatrix, 'directionalShadowMatrix', uniforms);
  const modelView = new T.Matrix4().multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
  Object.assign(uniforms, {
    modelMatrix: mesh.matrixWorld.toArray(), modelViewMatrix: modelView.toArray(),
    viewMatrix: camera.matrixWorldInverse.toArray(), projectionMatrix: camera.projectionMatrix.toArray(),
    normalMatrix: new T.Matrix3().getNormalMatrix(modelView).toArray(), cameraPosition: camera.position.toArray(),
    isOrthographic: !!camera.isOrthographicCamera, toneMappingExposure: STUDIO_LIGHTING.exposure, receiveShadow: mesh.receiveShadow,
  });
  const geometry = exportGeometry(mesh.geometry);
  material.side = originalSide;
  return {
    sourceMesh: mesh.name || 'vehicle-mesh', shader, geometry: geometry.id, ...geometry,
    start: range.start, count: range.count, uniforms,
    material: { type: material.type, name: material.name, surfaceTags: Object.keys(material.userData).filter(key => material.userData[key] === true), side, transparent: material.transparent, opacity: material.opacity,
      depthWrite: material.depthWrite, depthTest: material.depthTest, premultipliedAlpha: material.premultipliedAlpha,
      polygonOffset: material.polygonOffset, polygonOffsetFactor: material.polygonOffsetFactor, polygonOffsetUnits: material.polygonOffsetUnits,
      defaultAttributeValues: material.defaultAttributeValues || { color: [1, 1, 1], uv: [0, 0], uv1: [0, 0] } },
    mirrored: mesh.matrixWorld.determinant() < 0,
  };
}

function build(version, spec, pose) {
  const scene = new T.Scene(), model = new classes[version](scene, spec);
  scene.environment = studio.texture; scene.environmentIntensity = STUDIO_LIGHTING.environmentIntensity;
  const lightSet = addStudioLights(scene), lightArray = Array.isArray(lightSet) ? lightSet : Object.values(lightSet);
  scene.userData.nativeShadowLights = lightArray.filter(light => light.castShadow);
  model.update(pose, { paint: spec.color, headlights: false, brake: 0 });
  scene.updateMatrixWorld(true);
  const measured = measureShowroomVehicle(scene), bounds = measured.isBox3 ? measured : measured.bounds;
  const shadow = createShowroomShadow(scene, bounds); if (!shadow.parent) scene.add(shadow);
  scene.updateMatrixWorld(true);
  return { version, scene, model, lightArray };
}

// Fixed body-local QA cameras. Exterior views retain the actual glass and all
// bodywork; the last camera is deliberately inside the cabin for construction
// review and is not presented as an implemented gameplay camera.
const cabinViews = ['cabin-through-windscreen', 'cabin-through-side', 'cabin-interior'];
function cabinCamera(spec, view) {
  const van = spec.bodyStyle === 'van', sedan = spec.bodyStyle === 'sedan';
  const frontZ = van ? 1.224 : sedan ? .30 : .16, seatY = van ? .99 : sedan ? .64 : .90;
  if (view === 'cabin-through-windscreen') return {
    position: van ? [1.16, 1.88, 3.30] : sedan ? [.90, 1.30, 2.10] : [1.12, 1.66, 2.22],
    target: van ? [0, 1.44, 1.14] : sedan ? [0, 1.04, .10] : [0, 1.27, -.04], fov: 43,
    purpose: 'Exterior through the actual windscreen; every model mesh and glass surface retained.' };
  if (view === 'cabin-through-side') return {
    position: [van ? 2.40 : sedan ? 2.02 : 2.26, seatY + .66, frontZ - .05],
    target: [0, seatY + .40, frontZ - .10], fov: 42,
    purpose: 'Exterior through the actual driver-side glazing; every model mesh and glass surface retained.' };
  return {
    position: van ? [0, 1.93, .03] : sedan ? [0, 1.24, -.60] : [0, 1.65, -.74],
    target: van ? [0, 1.37, 1.93] : sedan ? [0, .93, .85] : [0, 1.08, .62], fov: van ? 72 : 76,
    purpose: 'Inside-cabin construction inspection; not a gameplay camera. Every model mesh and glass surface retained.' };
}

function take(entry, spec, pose, bounds, view, winch = false, signal = null) {
  const name = `${entry.version}-${spec.id}-${view}${winch ? '-winch' : ''}${signal ? '-' + signal.name : ''}`;
  if (viewFilter && !viewFilter.test(name)) return;
  if (signal) entry.model.update({ ...pose, brake: signal.brake, selector: signal.selector }, { paint: spec.color, headlights: signal.headlights, brake: signal.brake });
  entry.model.setWinchEnabled?.(winch); entry.scene.updateMatrixWorld(true);
  const width = 1100, height = 720, aspect = width / height;
  const size = bounds.getSize(new T.Vector3()), center = bounds.getCenter(new T.Vector3());
  const cabin = cabinViews.includes(view);
  const orthographic = view.startsWith('ortho-') || view.startsWith('detail-'), detail = view.startsWith('detail-') || cabin;
  const yaw = view === 'ortho-right' || view === 'detail-side-rear' ? Math.PI / 2 : view === 'ortho-left' ? -Math.PI / 2
    : view === 'ortho-front' ? 0 : view === 'ortho-rear' ? Math.PI : ['rear', 'detail-rear'].includes(view) ? Math.PI + .70 : .70;
  const elevation = view === 'underside' ? -.23 : view.startsWith('ortho-') || view === 'detail-side-rear' ? 0 : .28;
  const outward = new T.Vector3(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation));
  const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), up = outward.clone().cross(right);
  const target = center.clone();
  let camera, distance, inspection = null;
  if (cabin) {
    inspection = cabinCamera(spec, view);
    target.set(...inspection.target).applyMatrix4(entry.model.body.matrixWorld);
    camera = new T.PerspectiveCamera(inspection.fov, aspect, .025, 100);
    camera.position.set(...inspection.position).applyMatrix4(entry.model.body.matrixWorld);
  } else if (orthographic) {
    let horizontalExtent = 0, verticalExtent = 0;
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
      const corner = new T.Vector3(x * size.x, y * size.y, z * size.z);
      horizontalExtent = Math.max(horizontalExtent, Math.abs(corner.dot(right)) * 2);
      verticalExtent = Math.max(verticalExtent, Math.abs(corner.dot(up)) * 2);
    }
    let span = Math.max(verticalExtent, horizontalExtent / aspect) * 1.20;
    if (detail) {
      span = Math.max(1.2, size.y * .68);
      target.y += size.y * .12;
      target.z += size.z * (view === 'detail-side-rear' ? -.29 : view === 'detail-rear' ? -.32 : .32);
    }
    camera = new T.OrthographicCamera(-span * aspect / 2, span * aspect / 2, span / 2, -span / 2, .05, 100);
    distance = Math.max(10, size.length() * 2);
  } else {
    camera = new T.PerspectiveCamera(37, aspect, .05, 100);
    target.y -= size.y * .045;
    const tangent = Math.tan(camera.fov * Math.PI / 360);
    distance = 1;
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
      const point = new T.Vector3(x * size.x, (y + .045) * size.y, z * size.z);
      distance = Math.max(distance, point.dot(outward) + Math.max(Math.abs(point.dot(right)) / (tangent * camera.aspect * .89), Math.abs(point.dot(up)) / (tangent * .89)));
    }
  }
  if (!cabin) camera.position.copy(target).addScaledVector(outward, distance);
  camera.lookAt(target); camera.updateMatrixWorld(true);
  for (const light of entry.scene.userData.nativeShadowLights) {
    light.shadow.map = new T.WebGLRenderTarget(light.shadow.mapSize.x, light.shadow.mapSize.y, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    light.shadow.map.texture.userData.nativeTarget = 'studio-key-shadow';
    light.shadow.updateMatrices(light);
  }
  const lights = T.QA_WebGLLights({ has: () => false }); lights.setup(entry.lightArray); lights.setupView(entry.lightArray, camera);
  const items = []; let instancesExpanded = 0;
  entry.scene.traverseVisible(object => {
    if (!object.isMesh) return;
    if (view === 'underside' && object.userData.excludeFromVehicleBounds) return;
    if (object.isInstancedMesh) instancesExpanded += object.count;
    const mesh = expandInstances(object); mesh.matrixWorld.copy(object.matrixWorld);
    const geometry = mesh.geometry, total = geometry.index?.count || geometry.attributes.position.count;
    const groups = Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
    for (const group of groups) {
      const material = Array.isArray(mesh.material) ? mesh.material[group.materialIndex] : mesh.material;
      if (!material?.visible) continue;
      const start = Math.max(group.start, geometry.drawRange.start);
      const end = Math.min(total, group.start + group.count, geometry.drawRange.start + geometry.drawRange.count);
      if (end <= start) continue;
      geometry.computeBoundingSphere();
      const distance = geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
      let groupOrder = 0;
      for (let parent = object.parent; parent; parent = parent.parent) if (parent.isGroup) { groupOrder = parent.renderOrder; break; }
      items.push({ mesh, material, range: { start, count: end - start }, distance, groupOrder, objectId: object.id });
    }
  });
  const shadowItems = items.slice();
  items.sort((a, b) => Number(a.material.transparent) - Number(b.material.transparent)
    || a.groupOrder - b.groupOrder || a.mesh.renderOrder - b.mesh.renderOrder
    || (a.material.transparent ? a.distance - b.distance : a.material.id - b.material.id || b.distance - a.distance)
    || a.objectId - b.objectId);
  const draws = [];
  for (const { mesh, material, range } of items) {
    const sides = material.transparent && material.side === T.DoubleSide && !material.forceSinglePass ? [T.BackSide, T.FrontSide] : [material.side];
    for (const side of sides) draws.push(exportDraw(mesh, material, entry.scene, camera, lights, range, side));
  }
  const shadows = [];
  for (const light of entry.scene.userData.nativeShadowLights) {
    const shadowCamera = light.shadow.camera, shadowLights = T.QA_WebGLLights({ has: () => false }); shadowLights.setup(entry.lightArray); shadowLights.setupView(entry.lightArray, shadowCamera);
    const shadowDraws = []; activeTarget = light.shadow.map;
    for (const { mesh, material, range } of shadowItems) {
      if (!mesh.castShadow) continue;
      const depth = mesh.customDepthMaterial || new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
      Object.assign(depth, { map: material.map, alphaMap: material.alphaMap, alphaTest: material.alphaTest,
        displacementMap: material.displacementMap, displacementScale: material.displacementScale, displacementBias: material.displacementBias });
      const side = material.shadowSide ?? (material.side === T.FrontSide ? T.BackSide : material.side === T.BackSide ? T.FrontSide : T.DoubleSide);
      shadowDraws.push(exportDraw(mesh, depth, entry.scene, shadowCamera, shadowLights, range, side));
    }
    activeTarget = null;
    shadows.push({ target: { id: 'studio-key-shadow', width: light.shadow.mapSize.x, height: light.shadow.mapSize.y, minFilter: light.shadow.map.texture.minFilter, magFilter: light.shadow.map.texture.magFilter, depth: true }, draws: shadowDraws });
  }
  const actual = measureShowroomVehicle(entry.scene), actualBounds = actual.isBox3 ? actual : actual.bounds;
  const projectedModelBounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
  for (const x of [actualBounds.min.x, actualBounds.max.x]) for (const y of [actualBounds.min.y, actualBounds.max.y]) for (const z of [actualBounds.min.z, actualBounds.max.z]) {
    const point = new T.Vector3(x, y, z).project(camera), pixel = [(point.x + 1) * width / 2, (1 - point.y) * height / 2];
    for (let axis = 0; axis < 2; axis++) { projectedModelBounds.min[axis] = Math.min(projectedModelBounds.min[axis], pixel[axis]); projectedModelBounds.max[axis] = Math.max(projectedModelBounds.max[axis], pixel[axis]); }
  }
  cases.push({ name, vehicle: spec.id, version: entry.version, view, winch, width, height, supersample: 2, clearColor: [.70, .75, .78, 1], shadows, draws,
    metadata: { camera: { position: camera.position.toArray(), target: target.toArray(), fov: camera.fov, orthographic, verticalSpan: orthographic ? camera.top - camera.bottom : null }, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      actualBounds: { min: actualBounds.min.toArray(), max: actualBounds.max.toArray() },
      projectedModelBounds, intentionalDetailCrop: detail,
      cabinInspection: inspection ? { view, ...inspection, coordinates: 'body-local metres transformed through the actual settled body matrix', allModelMeshesRetained: true } : null,
      scaleBar: orthographic ? { metres: 1, pixels: height / (camera.top - camera.bottom) } : null,
      drawCalls: draws.length, triangles: draws.reduce((sum, draw) => sum + draw.count / 3, 0), instancesExpanded,
      wheels: pose.wheels.map(wheel => ({ load: wheel.load, pressure: wheel.pressure, deflection: wheel.deflection, radius: wheel.radius })),
      build: spec.upgrade?.build || null,
      signals: signal ? { headlights: signal.headlights, brake: signal.brake, selector: signal.selector, method: 'Actual VehicleView.update state/options; model light emitters only, no added world headlight beam.' } : null,
      winchAnchor: winch ? entry.model.getWinchAnchor?.().toArray() : null,
      vehicleState: { airSuspensionLift: pose.airSuspensionLift || 0, paint: spec.color, inspection: entry.stateInspection || 'Factory settled stance' },
      notes: 'Actual VehicleView meshes and shaders, actual settled suspension, shared runtime studio radiance/lights and Three PMREM/shadow passes. Native GLES render with 2x supersampling; not a browser screenshot. ' + (currentOnly ? 'Current vehicle only; no published comparison model.' : 'Current and baseline use identical current studio lighting/camera.') + ' Actual Canvas2D decals use Skia with a documented font substitution. Detail views intentionally crop the vehicle; orthographic pixels-per-metre is exact.' } });
  console.log('Exported', name, `${draws.length} draws`);
  if (signal) entry.model.update(pose, { paint: spec.color, headlights: false, brake: 0 });
}

for (const spec of VEHICLES.filter(spec => !selectedVehicles || selectedVehicles.includes(spec.id))) {
  const pose = createShowroomPose(spec);
  const entries = Object.keys(classes).map(version => build(version, spec, pose));
  const current = entries.find(entry => entry.version === 'current');
  const bounds = new T.Box3();
  for (const entry of entries) { const measured = measureShowroomVehicle(entry.scene); bounds.union(measured.isBox3 ? measured : measured.bounds); }
  current.model.setWinchEnabled(true); current.scene.updateMatrixWorld(true);
  const winchBounds = measureShowroomVehicle(current.scene); bounds.union(winchBounds.isBox3 ? winchBounds : winchBounds.bounds); current.model.setWinchEnabled(false);
  const baseViews = ['front', 'rear', ...(diagnostics ? ['ortho-right', 'ortho-left', 'ortho-front', 'ortho-rear'] : [])];
  for (const entry of entries) for (const view of baseViews) take(entry, spec, pose, bounds, view);
  if (diagnostics) for (const entry of baselineDetails ? entries : [current])
    for (const view of ['detail-front', 'detail-side-rear', 'detail-rear']) take(entry, spec, pose, bounds, view);
  if (interiors) for (const entry of entries) for (const view of cabinViews) take(entry, spec, pose, bounds, view);
  if (signals) for (const signal of [
    { name: 'headlights-off', view: 'detail-front', headlights: false, brake: 0, selector: 'D' },
    { name: 'headlights-on', view: 'detail-front', headlights: true, brake: 0, selector: 'D' },
    { name: 'lights-off', view: 'ortho-rear', headlights: false, brake: 0, selector: 'D' },
    { name: 'braking', view: 'ortho-rear', headlights: false, brake: 1, selector: 'D' },
    { name: 'reverse', view: 'ortho-rear', headlights: false, brake: 0, selector: 'R' },
  ]) take(current, spec, pose, bounds, signal.view, false, signal);
  if (brakeDetails) for (const view of ['detail-rear', 'detail-side-rear']) for (const brake of [0, 1])
    take(current, spec, pose, bounds, view, false, { name: brake ? 'braking' : 'lights-off', view, headlights: false, brake, selector: 'D' });
  take(current, spec, pose, bounds, 'front', true);
  if (['wrangler-rubicon', 'civic-sport', 'hummer-ev-suv-3x'].includes(spec.id)) take(current, spec, pose, bounds, 'underside');
  if (vehicleStates && spec.features.airSuspension) {
    const variations = [];
    for (const setting of ['normal', 'increased', 'extract', 'launch-lowered', 'blue-paint', 'articulated']) {
      const variantSpec = setting === 'blue-paint' ? {...spec, color:'#245c83'} : spec;
      const rockX = spec.trackFront/2, rockZ = spec.wheelbase*(1-spec.frontWeightFraction);
      const heightAt = (x,z) => setting === 'articulated' ? .28*Math.exp(-(((x-rockX)/.46)**2+((z-rockZ)/.48)**2)*1.5) : 0;
      const terrain = { sample(x,z) {
        const h=.001,dx=(heightAt(x+h,z)-heightAt(x-h,z))/(2*h),dz=(heightAt(x,z+h)-heightAt(x,z-h))/(2*h),n=new T.Vector3(-dx,1,-dz).normalize();
        return {height:heightAt(x,z),normal:{x:n.x,y:n.y,z:n.z},surface:'asphalt',mu:.94,rollingResistance:.014,softness:0,maxSink:0,waterDepth:0};
      } };
      const sim = new VehiclePhysics(terrain, variantSpec);sim.reset({x:0,z:0,heading:0});sim.setControl('selector','P');
      for(let i=0;i<300;i++)sim.step(1/120,{handbrake:true});
      if(setting==='extract')assert(sim.setControl('terrainProgram','Terrain').ok);
      if(['increased','extract'].includes(setting))assert(sim.setControl('rideHeight',setting).ok);
      if(setting==='launch-lowered'){assert(sim.setControl('selector','D').ok);assert(sim.setControl('wattsToFreedom',true).ok);}
      for(let i=0;i<1080;i++)sim.step(1/120,{brake:1,handbrake:setting!=='launch-lowered'});
      const state=structuredClone(sim.state),entry=build('current',variantSpec,state);entry.version='state-'+setting;
      entry.stateInspection=setting==='articulated'?'Actual settled physics on a 0.28m smooth single-wheel obstacle; obstacle omitted from studio for visibility':setting==='launch-lowered'?'Actual air-spring lowered launch preparation; −50.8mm target is a simulation estimate':setting;
      variations.push({entry,spec:variantSpec,pose:state});
    }
    const variantBounds=new T.Box3();
    for(const {entry} of variations){const measured=measureShowroomVehicle(entry.scene);variantBounds.union(measured.isBox3?measured:measured.bounds);}
    for(const variant of variations){for(const view of ['front','rear','ortho-right','underside'])take(variant.entry,variant.spec,variant.pose,variantBounds,view);variant.entry.model.dispose();}
  }
  for (const entry of entries) entry.model.dispose();

  const upgradedSpec = deriveVehicle(spec, {
    tires: spec.id === 'civic-sport' ? 'allTerrain' : spec.id === 'sprinter-2500' ? 'sand' : 'mud',
    size: 'large', suspension: 'trail',
    drivetrain: ['civic-sport', 'sprinter-2500'].includes(spec.id) ? 'conversion' : 'stock',
  });
  const upgradedPose = createShowroomPose(upgradedSpec);
  const upgraded = build('current', upgradedSpec, upgradedPose); upgraded.version = 'upgrade';
  const measuredUpgrade = measureShowroomVehicle(upgraded.scene), upgradedBounds = measuredUpgrade.isBox3 ? measuredUpgrade : measuredUpgrade.bounds;
  for (const view of ['front', 'rear', 'underside']) take(upgraded, upgradedSpec, upgradedPose, upgradedBounds, view);
  upgraded.model.dispose();
}

assert(cases.length, 'The view filter selected no model cases');
const sourceStudy = currentSource ? { label: studyLabel, sourceDirectory: currentSource, note: 'Explicit source-isolated QA control; this is not the live runtime source.' } : null;
if (sourceStudy) for (const entry of cases) entry.metadata.sourceStudy = sourceStudy;
const manifest = { baseline, baselineRevision, baselineLabel, sourceHashes: hashes, sourceStudy, canvasBackend, shaders: shaderManifest, cases, pmrem: [studio.recipe],
  method: 'Actual Three shaders, VehicleView body modules, settled suspension, shared runtime studio HDR radiance and lights, unchanged PMREM passes, depth/PCF shadows and 2x supersampling. ' + (currentOnly ? 'Current model only; no published comparison model.' : 'Baseline and current relit identically.') + ' Native GLES, not browser screenshots.' };
const manifestPath = path.join(dir, 'model-scenes.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest));
fs.writeFileSync(path.join(dir, 'model-source-manifest.json'), JSON.stringify({ baseline, baselineRevision, baselineLabel, sourceHashes: hashes, sourceStudy, canvasBackend, method: manifest.method, views: cases.map(item => item.name) }, null, 2));
if (exportOnly) console.log('Model buffers exported; run python3 tests/render-model-native.py', manifestPath);
else {
  const result = spawnSync('python3', [path.join(repo, 'tests/render-model-native.py'), manifestPath], {
    stdio: 'inherit', env: { ...process.env, EGL_PLATFORM: 'surfaceless', LIBGL_ALWAYS_SOFTWARE: '1', MESA_SHADER_CACHE_DISABLE: 'true' },
  });
  if (result.error) throw new Error('Native model renderer unavailable: ' + result.error.message);
  assert.equal(result.status, 0, `Native model QA failed. Artifacts: ${dir}`);
  console.log('Native model QA artifacts:', dir);
}
