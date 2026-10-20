/** Export actual Three texture data and PMREM operations for native GLES replay.
 * No substitute environment, material or model is introduced by this helper.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function createTextureExporter(T, dir, prefix = 'texture') {
  const exported = new WeakMap();
  let sequence = 0;
  return function exportTexture(texture) {
    if (texture.userData.nativeTarget) return { renderTarget: texture.userData.nativeTarget };
    const previous = exported.get(texture);
    if (previous?.version === texture.version) return previous.result;
    const result = { colorSpace: texture.colorSpace, clamp: texture.wrapS === T.ClampToEdgeWrapping,
      wrapS: texture.wrapS, wrapT: texture.wrapT,
      repeat: texture.wrapS === T.RepeatWrapping, minFilter: texture.minFilter, magFilter: texture.magFilter,
      flipY: texture.flipY, generateMipmaps: texture.generateMipmaps, anisotropy: texture.anisotropy };
    if (texture.isCanvasTexture) {
      // Execute the application's real Canvas2D commands with the supplied
      // Skia canvas, then preserve their unpremultiplied RGBA pixel output.
      const canvas = texture.image, pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const filename = `${prefix}-canvas-${sequence++}.bin`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength));
      Object.assign(result, { rawTexture: filename, width: canvas.width, height: canvas.height, channels: 4, component: 'uint8',
        canvasBackend: 'Skia Canvas2D / @napi-rs/canvas' });
    } else if (texture.isDataTexture) {
      assert([T.RGBAFormat, T.RedFormat].includes(texture.format), 'Export new DataTexture formats explicitly');
      assert([T.UnsignedByteType, T.HalfFloatType, T.FloatType].includes(texture.type), 'Export new component types explicitly');
      const raw = texture.image.data, filename = `${prefix}-${sequence++}.bin`;
      fs.writeFileSync(path.join(dir, filename), Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
      Object.assign(result, { rawTexture: filename, width: texture.image.width, height: texture.image.height,
        channels: texture.format === T.RedFormat ? 1 : 4,
        component: texture.type === T.FloatType ? 'float32' : texture.type === T.HalfFloatType ? 'float16' : 'uint8' });
    } else if (texture.userData.source) result.texture = texture.userData.source;
    else if (texture.userData.url) result.textureFile = new URL(texture.userData.url).pathname;
    else throw new Error('Native texture needs an explicit buffer, local file or native render target');
    exported.set(texture, { version: texture.version, result });
    return result;
  };
}

export function flattenUniform(value, name, target, exportTexture) {
  if (value == null) return;
  if (value.isTexture) { target[name] = exportTexture(value); return; }
  if (value.toArray) { target[name] = value.toArray(); return; }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.every(item => typeof item === 'number')) target[name] = Array.from(value);
    else if (value.every(item => item?.toArray)) target[name] = value.flatMap(item => item.toArray());
    else value.forEach((item, index) => flattenUniform(item, `${name}[${index}]`, target, exportTexture));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) flattenUniform(item, name ? `${name}.${key}` : key, target, exportTexture);
    return;
  }
  target[name] = value;
}

export function exportPMREM(T, dir, source, name = 'environment') {
  const targets = [], passes = [], shaders = [], exportedTargets = new WeakMap(), exportedGeometry = new WeakMap(), shaderCache = new Map();
  const exportTexture = createTextureExporter(T, dir, name + '-texture');
  let target = null, geometrySequence = 0;
  const capture = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    createProgram: () => ({ shaders: [] }), createShader: type => ({ type }),
    shaderSource(shader, source) { shader.source = source; }, compileShader() {},
    attachShader(program, shader) { program.shaders.push(shader); }, linkProgram() {}, bindAttribLocation() {},
  };
  const renderer = {
    getContext: () => capture, getRenderTarget: () => target,
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    xr: { enabled: false }, autoClear: true,
    state: { buffers: { depth: { getReversed: () => false } } },
    shadowMap: { enabled: false, type: T.PCFShadowMap },
    toneMapping: T.NoToneMapping, outputColorSpace: T.LinearSRGBColorSpace,
    debug: { checkShaderErrors: false }, compile() {},
    setRenderTarget(value) {
      target = value;
      if (target && !exportedTargets.has(target)) {
        const id = `${name}-target-${targets.length}`;
        target.texture.userData.nativeTarget = id;
        exportedTargets.set(target, id);
        targets.push({ id, width: target.width, height: target.height, component: 'float16', depth: false });
      }
    },
    render(mesh, camera) {
      mesh.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const parameters = programs.getParameters(mesh.material, lights.state, [], new T.Scene(), mesh);
      const assembled = new T.QA_WebGLProgram(renderer, 'pmrem', parameters, {});
      const hash = createHash('sha256').update(assembled.vertexShader.source + assembled.fragmentShader.source).digest('hex');
      let shader = shaderCache.get(hash);
      if (!shader) {
        shader = `${name}-program-${shaders.length}`;
        fs.writeFileSync(path.join(dir, shader + '.vert'), assembled.vertexShader.source);
        fs.writeFileSync(path.join(dir, shader + '.frag'), assembled.fragmentShader.source);
        shaders.push({ name: shader, vertex: shader + '.vert', fragment: shader + '.frag', hash }); shaderCache.set(hash, shader);
      }
      let geometry = exportedGeometry.get(mesh.geometry);
      if (!geometry) {
        const id = `${name}-geometry-${geometrySequence++}`, attributes = {};
        for (const [key, attribute] of Object.entries(mesh.geometry.attributes)) {
          const file = `${id}-${key}.bin`, data = new Float32Array(attribute.array);
          fs.writeFileSync(path.join(dir, file), Buffer.from(data.buffer));
          attributes[key] = { file, itemSize: attribute.itemSize, count: attribute.count };
        }
        const indices = Uint32Array.from(mesh.geometry.index?.array || Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => i));
        const index = id + '-index.bin'; fs.writeFileSync(path.join(dir, index), Buffer.from(indices.buffer));
        geometry = { id, attributes, index, count: indices.length }; exportedGeometry.set(mesh.geometry, geometry);
      }
      const uniforms = {};
      for (const [key, entry] of Object.entries(mesh.material.uniforms)) flattenUniform(entry.value, key, uniforms, exportTexture);
      Object.assign(uniforms, { modelMatrix: mesh.matrixWorld.toArray(), modelViewMatrix: camera.matrixWorldInverse.clone().multiply(mesh.matrixWorld).toArray(),
        projectionMatrix: camera.projectionMatrix.toArray(), viewMatrix: camera.matrixWorldInverse.toArray(), cameraPosition: camera.position.toArray(),
        toneMappingExposure: 1, isOrthographic: true });
      passes.push({ target: exportedTargets.get(target), viewport: target.viewport.toArray(), scissor: target.scissor.toArray(),
        clear: renderer.autoClear, shader, uniforms, ...geometry });
    },
  };
  const capabilities = { logarithmicDepthBuffer: false, vertexTextures: true, precision: 'highp', getMaxPrecision: value => value };
  const programs = T.QA_WebGLPrograms(renderer, { get: value => value }, { get: value => value }, { has: () => false }, capabilities, {}, { numPlanes: 0, numIntersection: 0 });
  const lights = T.QA_WebGLLights({ has: () => false }); lights.setup([]);
  const generator = new T.PMREMGenerator(renderer), output = generator.fromEquirectangular(source);
  generator.dispose();
  return { texture: output.texture, recipe: { name, targets, passes, shaders, output: output.texture.userData.nativeTarget,
    method: 'Unchanged Three PMREMGenerator equirectangular conversion and paired spherical Gaussian convolution passes, replayed into RGBA16F native render targets.' } };
}
