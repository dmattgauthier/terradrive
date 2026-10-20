/**
 * Assemble the app's real terrain shaders with its vendored Three.js internals,
 * then compile/link them using native Mesa EGL/OpenGL ES. No browser or server.
 *
 *   node tests/shader-compile.mjs
 *   node tests/shader-compile.mjs --render --out /tmp/terra-shader-qa
 *
 * Python 3 + libEGL/Mesa are required. Optional pixels require Pillow. Missing
 * native support fails the gate explicitly; it is never reported as a pass.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createLegacyWaterReflectionCamera } from './fixtures/water-reflection-v1.3.mjs';
import { RUT_DRIVING_STUDY } from './fixtures/rut-driving-v1.11.mjs';
import { TERRAIN_DRIVING_FIXTURES, WORKED_SOIL_CAMERAS, controlsAt } from './fixtures/terrain-driving-v1.12.mjs';
import { TIRE_SPRAY_DRIVING_SCENARIOS, runTireSprayDrivingScenario } from './fixtures/tire-spray-driving-v1.13.mjs';
import { TREE_NATIVE_STUDY, treeNativeInput, createTreeNativeCaptureSequence } from '../docs/tree-dynamics-v1.13/native-fixture.mjs';
import { createOrdinaryInput } from '../docs/collision-terrain-v1.13/ordinary-input.mjs';
import { createTextureExporter, exportPMREM } from './native-render-utils.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
let output, sourceRoot = repo, render = false, hdr = false, importedRockStudy = false, rutDrivingStudy = false, workedSoilStudy = false, treeDrivingStudy = false, sprayDrivingStudy = false, sprayPanelStudy = false, viewFilter = null, rutPreset = 'day-high', rutRoutes = null, exportSelected = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--render') render = true;
  else if (args[i] === '--hdr') { hdr = true; render = true; }
  else if (args[i] === '--imported-rock-study') { importedRockStudy = true; hdr = true; render = true; }
  else if (args[i] === '--rut-driving-study') { rutDrivingStudy = true; hdr = true; render = true; }
  else if (args[i] === '--worked-soil-study') { workedSoilStudy = true; rutDrivingStudy = true; hdr = true; render = true; }
  else if (args[i] === '--tree-driving-study') { treeDrivingStudy = true; hdr = true; render = true; }
  else if (args[i] === '--spray-driving-study') { sprayDrivingStudy = true; hdr = true; render = true; }
  else if (args[i] === '--spray-panel-study') { sprayPanelStudy = true; sprayDrivingStudy = true; hdr = true; render = true; }
  else if (args[i] === '--rut-preset' && args[i + 1]) rutPreset = args[++i];
  else if (args[i] === '--rut-routes' && args[i + 1]) rutRoutes = args[++i].split(',');
  else if (args[i] === '--source-root' && args[i + 1]) sourceRoot = path.resolve(args[++i]);
  else if (args[i] === '--export-selected') exportSelected = true;
  else if (args[i] === '--views' && args[i + 1]) viewFilter = new RegExp(args[++i]);
  else if (args[i] === '--out' && args[i + 1]) output = path.resolve(args[++i]);
  else throw new Error('Usage: node tests/shader-compile.mjs [--render] [--hdr] [--imported-rock-study] [--rut-driving-study | --worked-soil-study | --tree-driving-study | --spray-driving-study | --spray-panel-study] [--rut-preset day-high|app-default] [--rut-routes route,route] [--source-root directory] [--views regex] [--export-selected] [--out directory]');
}
const focusedDrivingStudy = rutDrivingStudy || treeDrivingStudy || sprayDrivingStudy;
assert(Number(rutDrivingStudy) + Number(treeDrivingStudy) + Number(sprayDrivingStudy) <= 1, 'Select one focused driving study per invocation');
const activeRutStudy = workedSoilStudy ? { ...TERRAIN_DRIVING_FIXTURES,
  routes: TERRAIN_DRIVING_FIXTURES.scenarios.filter(route => WORKED_SOIL_CAMERAS[route.id]).map(route => ({ ...route, ...WORKED_SOIL_CAMERAS[route.id] })) } : RUT_DRIVING_STUDY;
assert(!exportSelected || viewFilter, '--export-selected requires an explicit camera/dependency selector');
assert(['day-high', 'app-default'].includes(rutPreset), 'Rut lighting must use a declared production preset');
assert(!rutRoutes || rutRoutes.every(id => activeRutStudy.routes.some(route => route.id === id)), 'Rut routes must use immutable fixture coordinates');
const { OffroadWorld, WORLD_VISIBILITY = { farClip: 1900, dryFog: .00132, wetFog: .0032 } } = await import(pathToFileURL(path.join(sourceRoot, 'dist/src/world.js')).href);
const { Terrain } = await import(pathToFileURL(path.join(sourceRoot, 'dist/src/terrain.js')).href);
const { VEHICLES } = await import(pathToFileURL(path.join(sourceRoot, 'dist/src/vehicles.js')).href);
const { VehiclePhysics } = await import(pathToFileURL(path.join(sourceRoot, 'dist/src/physics.js')).href);
const { DrivingInput } = await import(pathToFileURL(path.join(sourceRoot, 'dist/src/input.js')).href);
const sprayModulePath = path.join(sourceRoot, 'dist/src/tire-spray-view.js');
const { TireSprayView } = fs.existsSync(sprayModulePath) ? await import(pathToFileURL(sprayModulePath).href) : {};
const importedRock = importedRockStudy ? await import(pathToFileURL(path.join(sourceRoot, 'dist/src/imported-ground-rock.js')).href) : null;
const dir = output || fs.mkdtempSync(path.join(os.tmpdir(), 'terra-shader-compile-'));
fs.mkdirSync(dir, { recursive: true });
const vendor = path.join(sourceRoot, 'dist/vendor/three.module.js');
// Export private assembler functions from an otherwise unchanged temporary copy.
// They still import the original core; runtime source files are never modified.
const internals = fs.readFileSync(vendor, 'utf8').replaceAll("'./three.core.js'", JSON.stringify(pathToFileURL(path.join(sourceRoot, 'dist/vendor/three.core.js')).href))
  + '\nexport { WebGLProgram as QA_WebGLProgram, WebGLPrograms as QA_WebGLPrograms, WebGLMaterials as QA_WebGLMaterials, WebGLLights as QA_WebGLLights };\n';
const internalPath = path.join(dir, 'three-shader-internals.mjs');
fs.writeFileSync(internalPath, internals);
const T = await import(pathToFileURL(internalPath).href);
const runtimeT = await import(pathToFileURL(vendor).href);
const canvasRuntime = hdr ? createRequire(import.meta.url)('@napi-rs/canvas') : null;

// This sink captures shaderSource only. Python performs the real compile/link.
const capture = {
  VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
  createProgram: () => ({ shaders: [] }), createShader: type => ({ type }),
  shaderSource: (shader, source) => { shader.source = source; }, compileShader() {},
  attachShader: (program, shader) => program.shaders.push(shader), linkProgram() {}, bindAttribLocation() {},
};
const renderer = {
  getContext: () => capture, getRenderTarget: () => null,
  state: { buffers: { depth: { getReversed: () => false } } },
  shadowMap: { enabled: true, type: T.PCFSoftShadowMap },
  toneMapping: T.ACESFilmicToneMapping, outputColorSpace: T.SRGBColorSpace,
  debug: { checkShaderErrors: false },
};
const capabilities = { logarithmicDepthBuffer: false, vertexTextures: true, precision: 'highp', getMaxPrecision: value => value };
const programs = T.QA_WebGLPrograms(renderer, { get: x => x }, { get: x => x }, { has: () => false }, capabilities, {}, { numPlanes: 0, numIntersection: 0 });
const lights = {
  directional: [{}], point: [], spot: [{}], spotLightMap: [], rectArea: [], hemi: [{}],
  directionalShadowMap: [{}], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0, numLightProbes: 0,
};
function makeWorld() {
  const world = Object.create(OffroadWorld.prototype);
  Object.assign(world, {
    terrain: new Terrain(), scene: new T.Scene(), groundMeshes: new Map(), _textures: new Map(),
    _textureLoader: { load(url) { const texture = new T.Texture(); texture.userData.url = url; return texture; } },
  });
  world._createTerrain(); world._createWater();
  return world;
}
const world = makeWorld(), manifest = [], sceneShaderSources = new Map();
const environments = [
  ['noenv', null],
  // Three PMREM allocates 3*cubeSize by 4*cubeSize for these source images.
  ['startup-env', { width: 384, height: 512 }],
  ['hdr-env', { width: 768, height: 1024 }],
];
function emit(material, geometry, name, imageSize, negative = false, actualMesh = null, deduplicate = false) {
  const scene = new T.Scene(); scene.fog = new T.FogExp2('#bccbd0', .00132);
  if (imageSize) { const environment = new T.Texture(imageSize); environment.mapping = T.CubeUVReflectionMapping; scene.environment = environment; }
  const mesh = actualMesh || new T.Mesh(geometry, material);
  const parameters = programs.getParameters(material, lights, [{}], scene, mesh);
  parameters.uniforms = parameters.shaderID ? T.UniformsUtils.clone(T.ShaderLib[parameters.shaderID].uniforms) : T.UniformsUtils.clone(material.uniforms);
  material.onBeforeCompile(parameters, renderer);
  if (negative) {
    assert.match(parameters.fragmentShader, /\btdPatchWeight\b/, 'The original-token regression fixture must match the current terrain injection.');
    parameters.fragmentShader = parameters.fragmentShader.replace(/\btdPatchWeight\b/g, 'patch');
  }
  const assembled = new T.QA_WebGLProgram(renderer, name, parameters, {});
  assert.match(assembled.fragmentShader.source, /^#version 300 es\n/, 'The native test must compile the actual WebGL2 dialect.');
  const compact = Object.fromEntries(Object.entries(parameters).filter(([key]) => !['vertexShader', 'fragmentShader', 'uniforms'].includes(key)));
  const sourceKey = createHash('sha256').update(assembled.vertexShader.source + '\0' + assembled.fragmentShader.source).digest('hex');
  const existing = sceneShaderSources.get(sourceKey);
  if(deduplicate && existing) return {...compact,nativeProgram:existing};
  fs.writeFileSync(path.join(dir, name + '.vert'), assembled.vertexShader.source);
  fs.writeFileSync(path.join(dir, name + '.frag'), assembled.fragmentShader.source);
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(compact, null, 2));
  manifest.push({ name, vertex: name + '.vert', fragment: name + '.frag', shaderSourceHash:sourceKey, expected: negative ? 'reserved-patch-failure' : 'pass' });
  sceneShaderSources.set(sourceKey,name);
  return {...compact,nativeProgram:name};
}
for (const [kind, material] of Object.entries(world.terrainMaterials)) {
  const geometry = world.groundMeshes.get(kind).mesh.geometry;
  for (const [environment, size] of environments) {
    emit(material, geometry, `current-${kind}-${environment}`, size);
    emit(material, geometry, `original-token-${kind}-${environment}`, size, true);
    // The driver's emergency fallback must also be a real compiling PBR program.
    const fallback = material.clone(); fallback.onBeforeCompile = () => {};
    emit(fallback, geometry, `stock-fallback-${kind}-${environment}`, size);
  }
}
for (const body of world.waterBodies) for (const [environment, size] of environments) {
  emit(body.material, body.mesh.geometry, `current-water-${body.id}-${environment}`, size);
  const fallback = body.material.clone(); fallback.onBeforeCompile = () => {};
  emit(fallback, body.mesh.geometry, `stock-water-${body.id}-${environment}`, size);
}
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function treeFiles(relative) {
  return fs.readdirSync(path.join(sourceRoot, relative), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? treeFiles(path.join(relative, entry.name)) : [path.join(relative, entry.name)]).sort();
}
const sourceFiles = ['package.json', ...treeFiles('dist/src'), ...treeFiles('dist/assets/terrain'), ...treeFiles('dist/vendor')];
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, digest(path.join(sourceRoot, file))]));
const harnessFiles = ['tests/shader-compile.mjs', 'tests/shader-compile-native.py', 'tests/native-render-utils.mjs', 'tests/fixtures/water-reflection-v1.3.mjs', 'tests/fixtures/rut-driving-v1.11.mjs', 'tests/fixtures/terrain-driving-v1.12.mjs', 'tests/fixtures/tire-spray-driving-v1.13.mjs', 'docs/tree-dynamics-v1.13/native-fixture.mjs', 'docs/collision-terrain-v1.13/tree-driving-probe.mjs', 'docs/collision-terrain-v1.13/probe-common.mjs', 'docs/collision-terrain-v1.13/ordinary-input.mjs'];
const harnessHashes = Object.fromEntries(harnessFiles.map(file => [file, digest(path.join(repo, file))]));
if (render) writeRenderScenes();
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ sourceRoot, version: JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'))).version, cases: manifest, sourceHashes, harnessHashes }, null, 2));
const native = path.join(repo, 'tests/shader-compile-native.py');
const command = [native, path.join(dir, 'manifest.json'), ...(render ? ['--render', path.join(dir, 'render-scenes.json')] : [])];
const result = spawnSync('python3', command, { stdio: 'inherit', env: { ...process.env, EGL_PLATFORM: 'surfaceless', LIBGL_ALWAYS_SOFTWARE: '1', MESA_SHADER_CACHE_DISABLE: 'true' } });
if (result.error) throw new Error('Native shader gate unsupported: Python 3 could not be launched. ' + result.error.message);
const changedSources = sourceFiles.filter(file => digest(path.join(sourceRoot, file)) !== sourceHashes[file]);
const changedHarnesses = harnessFiles.filter(file => digest(path.join(repo, file)) !== harnessHashes[file]);
fs.writeFileSync(path.join(dir, 'source-stability.json'), JSON.stringify({ sourceRoot, sourceHashes, harnessHashes, sourceStable: !changedSources.length, harnessStable: !changedHarnesses.length, changedSources, changedHarnesses }, null, 2));
assert.equal(changedSources.length, 0, 'Runtime/assets changed during native capture: ' + changedSources.join(', '));
assert.equal(changedHarnesses.length, 0, 'Harness changed during native capture: ' + changedHarnesses.join(', '));
if (result.status !== 0) throw new Error(`Native shader gate failed or is unsupported (exit ${result.status}). See compiler diagnostics above. Artifacts: ${dir}`);
console.log('Native shader artifacts:', dir);

/** Replay real mesh buffers under a fixed, documented terrain-only camera. */
function writeRenderScenes() {
  const world = makeWorld();
  world.clock = 4; world.weather = 'dry'; world.timeOfDay = 'day'; world.quality = 'high';
  world.scene.fog=new T.FogExp2('#bccbd0',WORLD_VISIBILITY.dryFog);world._createLighting();world.scene.updateMatrixWorld(true);
  const renderCases=[], pmrem=[];
  const exportTexture = createTextureExporter(T, dir, 'terrain-native-texture');
  function flat(value,name,dest){
   if(value==null)return;
   if(value.isTexture){
    if(value.userData.reflectionBody)dest[name]={textureFile:`native-water-${value.userData.reflectionBody}-reflection.png`,colorSpace:T.LinearSRGBColorSpace,clamp:true};
    else dest[name]=exportTexture(value);return;
   }
   if(value.toArray){dest[name]=value.toArray();return;}
   if(Array.isArray(value)||ArrayBuffer.isView(value)){
    if(value.every(x=>typeof x==='number'))dest[name]=Array.from(value);
    else if(value.every(x=>x?.toArray))dest[name]=value.flatMap(x=>x.toArray());
    else value.forEach((v,i)=>flat(v,`${name}[${i}]`,dest));return;
   }
   if(typeof value==='object'){for(const[k,v]of Object.entries(value))flat(v,name?`${name}.${k}`:k,dest);return;}
   dest[name]=value;
  }
  // Keep this refresh-only mock distinct from the outer program assembler.
  // Shadowing `renderer` here previously left reflection fixtures display-
  // tone-mapped even though their filenames said linear; runtime was correct.
  const refreshRenderer={getRenderTarget:()=>null,outputColorSpace:T.SRGBColorSpace};
  const materialProperties=new WeakMap();
  const refresh=T.QA_WebGLMaterials(refreshRenderer,{get:material=>materialProperties.get(material)||{}});
  function take(name,x,z,kind,phase){
   const sampledY=world.terrain.heightAt(x,z);
   // Keep the published mud inspection pose after changing the authored bed.
   // Ground geometry moves independently below this fixed camera datum.
   const y=kind==='mud'?3.439816474914551:sampledY,camera=new T.PerspectiveCamera(46,1100/720,.1,250);
   camera.position.set(x+3.3,y+4.7,z-5.5);camera.lookAt(x,y-.03,z+.3);camera.updateMatrixWorld(true);
   const lights=T.QA_WebGLLights({has:()=>false}),lightArray=[world.sun,world.hemisphere,world.headlight];lights.setup(lightArray);lights.setupView(lightArray,camera);
   const mat=world.terrainMaterials[kind],shader={uniforms:T.UniformsUtils.clone(T.ShaderLib.physical.uniforms),vertexShader:T.ShaderLib.physical.vertexShader,fragmentShader:T.ShaderLib.physical.fragmentShader};mat.onBeforeCompile(shader);refresh.refreshMaterialUniforms(shader.uniforms,mat,1,720,null);refresh.refreshFogUniforms(shader.uniforms,world.scene.fog);
   const values={};for(const[key,{value}]of Object.entries(shader.uniforms))flat(value,key,values);
   flat(lights.state.ambient,'ambientLightColor',values);flat(lights.state.directional,'directionalLights',values);flat(lights.state.hemi,'hemisphereLights',values);flat(lights.state.spot,'spotLights',values);flat(lights.state.directionalShadow,'directionalLightShadows',values);
   Object.assign(values,{modelMatrix:new T.Matrix4().toArray(),modelViewMatrix:camera.matrixWorldInverse.toArray(),viewMatrix:camera.matrixWorldInverse.toArray(),normalMatrix:new T.Matrix3().getNormalMatrix(camera.matrixWorldInverse).toArray(),projectionMatrix:camera.projectionMatrix.toArray(),cameraPosition:camera.position.toArray(),isOrthographic:false,toneMappingExposure:1.02,receiveShadow:false,'directionalShadowMatrix[0]':new T.Matrix4().toArray()});
   const meshes=[...world.groundMeshes.values()].map(r=>r.mesh).concat(world.detailChunks.map(r=>r.mesh)).filter(m=>m.material===mat),draws=[];
   for(const [mi,mesh]of meshes.entries()){
    const geo=mesh.geometry,index=geo.index.array,pos=geo.attributes.position,needed=[],vertexMap=new Map(),oldIDs=[];
    const start=geo.drawRange.start||0,end=Math.min(index.length,start+geo.drawRange.count);
    for(let i=start;i<end;i+=3){const ids=[index[i],index[i+1],index[i+2]];if(ids[0]===ids[1]||ids[1]===ids[2])continue;
     if(!ids.some(n=>Math.abs(pos.getX(n)-x)<21&&Math.abs(pos.getZ(n)-z)<21))continue;
     for(const n of ids){if(!vertexMap.has(n)){vertexMap.set(n,oldIDs.length);oldIDs.push(n);}needed.push(vertexMap.get(n));}
    }
    if(!needed.length)continue;
    const attributes={};for(const[attrName,attr]of Object.entries(geo.attributes)){
     const array=new Float32Array(oldIDs.length*attr.itemSize);oldIDs.forEach((old,newid)=>{for(let k=0;k<attr.itemSize;k++)array[newid*attr.itemSize+k]=attr.array[old*attr.itemSize+k];});
     const file=`${name}-${mi}-${attrName}.bin`;fs.writeFileSync(`${dir}/${file}`,Buffer.from(array.buffer));attributes[attrName]={file,itemSize:attr.itemSize,count:oldIDs.length};
    }
    const indices=new Uint32Array(needed),indexfile=`${name}-${mi}-indices.bin`;fs.writeFileSync(`${dir}/${indexfile}`,Buffer.from(indices.buffer));draws.push({sourceMesh:mesh.name,attributes,index:indexfile,count:indices.length});
   }
   const tiles=[...world.terrain.detailTiles.values()],maxSink=Math.max(0,...tiles.map(t=>Math.max(0,...t.delta.map(n=>-n))));
   renderCases.push({name,kind,phase,x,z,shader:`current-${kind}-noenv`,width:1100,height:720,clearColor:[.73,.72,.64,1],uniforms:values,draws,metadata:{coordinate:{x,z,y},fineTiles:world.terrain.detailTiles.size,maxSink,soilVolumes:{...world.terrain.soilVolumes},notes:'Actual OffroadWorld ground triangle/normal/color/UV/aSoil buffers, cropped by index only; actual local photographs; actual light uniforms from Three; controlled terrain-only native software render. Environment IBL and cast shadows omitted.'}});
  }
  if(!focusedDrivingStudy) for(const[kind,x,z,label]of[['base',-51,282,'dirt'],['mud',48,-115,'mud']]){
   world.terrain.resetDeformation();world._syncDeformation();take(`native-${label}-undisturbed`,x,z,kind,'undisturbed');
   for(let pass=0;pass<4;pass++)for(let i=0;i<=140;i++)for(const side of[-1,1])world.terrain.deform(x+side*.83,z-3.5+i*.05,{load:5430,pressure:37,contactWidth:.285,contactLength:.27,slip:kind==='mud'?.65:.28,speed:1.25,dt:.04,heading:0,wheelId:`qa-${pass}-${side}`});
   world._syncDeformation();take(`native-${label}-rutted`,x,z,kind,'rutted');
  }
  if(!focusedDrivingStudy) renderCases.push({...renderCases[0],name:'native-dirt-original-error',shader:'original-token-base-noenv',expectedCompileFailure:true});
  // Native scene evidence includes the real mirrored scene, depth mask and
  // contact wake shader. Instanced scenery is baked without changing positions,
  // normals, photographed UVs or per-instance colors; no stand-in artwork.
  world.terrain.resetDeformation();world._syncDeformation();world._syncWaterDepth(true);
  world._createSkyMesh();world.terrain.obstacles=[];world._createChallenge?.();world._createVegetation();world._createMountains();world._createRoad();world.scene.updateMatrixWorld(true);
  const emitted=new Set(manifest.map(item=>item.name)),sceneProgramAliases=new Map();
  function materialProgram(material,geometry,key,reflection=false,useHDR=false){
    const name=`native-scene-${key}-${reflection?'linear':'display'}${useHDR?'-hdr':''}`;
    if(!emitted.has(name)){
      const original=renderer.getRenderTarget;renderer.getRenderTarget=()=>reflection?{}:null;
      try{
        const parameters=emit(material,geometry,name,useHDR?world.scene.environment.image:null,false,null,true);
        sceneProgramAliases.set(name,parameters.nativeProgram);
        if(reflection){assert.equal(parameters.toneMapping,T.NoToneMapping,'An offscreen mirror must stay linear, without display tone mapping');assert.equal(parameters.outputColorSpace,T.LinearSRGBColorSpace);}
      }finally{renderer.getRenderTarget=original;}
      emitted.add(name);
    }
    return sceneProgramAliases.get(name)||name;
  }
  function nativeUniforms(mat,camera,modelMatrix=new T.Matrix4(),useHDR=false,receiveShadow=false){
    const library=mat.isMeshDepthMaterial?T.ShaderLib.depth:mat.isMeshBasicMaterial?T.ShaderLib.basic:T.ShaderLib.physical;
    const shader=mat.isShaderMaterial?{uniforms:T.UniformsUtils.clone(mat.uniforms),vertexShader:mat.vertexShader,fragmentShader:mat.fragmentShader}:{uniforms:T.UniformsUtils.clone(library.uniforms),vertexShader:library.vertexShader,fragmentShader:library.fragmentShader};
    mat.onBeforeCompile(shader);materialProperties.set(mat,{envMap:useHDR&&mat.isMeshStandardMaterial?world.scene.environment:null,envMapRotation:world.scene.environmentRotation});if(!mat.isShaderMaterial){refresh.refreshMaterialUniforms(shader.uniforms,mat,1,720,null);if(useHDR&&mat.isMeshStandardMaterial)shader.uniforms.envMapIntensity.value=world.scene.environmentIntensity;}if(mat.fog)refresh.refreshFogUniforms(shader.uniforms,world.scene.fog);
    const values={};for(const[key,{value}]of Object.entries(shader.uniforms))flat(value,key,values);
    const lightState=T.QA_WebGLLights({has:()=>false}),lightArray=[world.sun,world.hemisphere,world.headlight];lightState.setup(lightArray);lightState.setupView(lightArray,camera);
    flat(lightState.state.ambient,'ambientLightColor',values);flat(lightState.state.directional,'directionalLights',values);flat(lightState.state.hemi,'hemisphereLights',values);flat(lightState.state.spot,'spotLights',values);flat(lightState.state.directionalShadow,'directionalLightShadows',values);
    if(receiveShadow){flat(lightState.state.directionalShadowMap,'directionalShadowMap',values);flat(lightState.state.directionalShadowMatrix,'directionalShadowMatrix',values);}
    const mv=camera.matrixWorldInverse.clone().multiply(modelMatrix);
    Object.assign(values,{modelMatrix:modelMatrix.toArray(),modelViewMatrix:mv.toArray(),viewMatrix:camera.matrixWorldInverse.toArray(),normalMatrix:new T.Matrix3().getNormalMatrix(mv).toArray(),projectionMatrix:camera.projectionMatrix.toArray(),cameraPosition:camera.position.toArray(),isOrthographic:!!camera.isOrthographicCamera,toneMappingExposure:world._nativeExposure??1.02,receiveShadow,'directionalShadowMatrix[0]':receiveShadow?world.sun.shadow.matrix.toArray():new T.Matrix4().toArray()});
    return values;
  }
  function bakeMesh(mesh,x,z,reach){
    const geo=mesh.geometry,source=geo.index?.array||Uint32Array.from({length:geo.attributes.position.count},(_,i)=>i),attributes={},indices=[],matrices=[];
    const backdrop=mesh===world.sky||mesh.name==='distant-ridge';
    if(mesh.isInstancedMesh){
      for(let i=0;i<mesh.count;i++){
        const matrix=new T.Matrix4();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);const p=new T.Vector3().setFromMatrixPosition(matrix);
        if(Math.abs(p.x-x)>reach||Math.abs(p.z-z)>reach)continue;
        const color=new T.Color('#ffffff');if(mesh.instanceColor)mesh.getColorAt(i,color);matrices.push({matrix,color});
      }
    }else matrices.push({matrix:mesh.matrixWorld,color:new T.Color('#ffffff')});
    for(const name of Object.keys(geo.attributes))attributes[name]={data:[],itemSize:geo.attributes[name].itemSize};
    if(mesh.instanceColor&&!attributes.color)attributes.color={data:[],itemSize:3};
    for(const {matrix,color}of matrices){
      const normal=new T.Matrix3().getNormalMatrix(matrix),map=new Map(),start=geo.drawRange.start||0,end=Math.min(source.length,start+geo.drawRange.count);
      for(let i=start;i<end;i+=3){
        const ids=[source[i],source[i+1],source[i+2]];if(ids[0]===ids[1]||ids[1]===ids[2])continue;
        if(!mesh.isInstancedMesh&&!backdrop&&!ids.some(j=>{const point=new T.Vector3().fromBufferAttribute(geo.attributes.position,j).applyMatrix4(matrix);return Math.abs(point.x-x)<reach&&Math.abs(point.z-z)<reach;}))continue;
        for(const old of ids){
          if(!map.has(old)){
            const index=attributes.position.data.length/3;map.set(old,index);
            for(const[name,attr]of Object.entries(geo.attributes)){
              let value=Array.from(attr.array.subarray(old*attr.itemSize,(old+1)*attr.itemSize));
              if(name==='position')value=new T.Vector3(...value).applyMatrix4(matrix).toArray();
              else if(name==='normal')value=new T.Vector3(...value).applyMatrix3(normal).normalize().toArray();
              else if(name==='color'&&mesh.instanceColor)value=[value[0]*color.r,value[1]*color.g,value[2]*color.b];
              attributes[name].data.push(...value);
            }
            if(mesh.instanceColor&&!geo.attributes.color)attributes.color.data.push(color.r,color.g,color.b);
          }
          indices.push(map.get(old));
        }
      }
    }
    if(!indices.length)return null;
    const baked=new T.BufferGeometry();for(const[name,attr]of Object.entries(attributes))baked.setAttribute(name,new T.Float32BufferAttribute(attr.data,attr.itemSize));baked.setIndex(indices);baked.userData.nativeInstances=mesh.isInstancedMesh?matrices.length:0;return baked;
  }
  function writeScene(name,camera,body,{reflection=false,water=false,reach=150,phase='still',nearDetail=true,useHDR=false,scenery=true,shadows=useHDR,hiddenMeshes=[],refreshProximity=true,shadowAnchor=null}={}){
    // Bounded studies need not bake gigabytes of unrelated camera geometry.
    // Callers still receive a metadata holder; selected cameras and all their
    // mirror dependencies must be explicitly exported and are checked below.
    if(exportSelected&&!viewFilter.test(name)){
      renderCases.push({name,draws:[],metadata:{exportSkipped:true}});return;
    }
    if(refreshProximity) world._updateGroundProximity({x:body.cx,z:body.cz},true);
    world.scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    let shadowTarget=null;
    if(shadows){
      const center=shadowAnchor?new T.Vector3(shadowAnchor.x,shadowAnchor.y,shadowAnchor.z):new T.Vector3(body.cx,world.terrain.heightAt(body.cx,body.cz),body.cz);
      world.sun.position.copy(center).add(world.sunOffset);world.sun.target.position.copy(center);world.scene.updateMatrixWorld(true);
      const shadow=world.sun.shadow;shadow.map=new T.WebGLRenderTarget(shadow.mapSize.x,shadow.mapSize.y,{minFilter:T.NearestFilter,magFilter:T.NearestFilter});
      shadow.map.texture.userData.nativeTarget=name+'-sun-shadow';shadow.updateMatrices(world.sun);
      shadowTarget={id:shadow.map.texture.userData.nativeTarget,width:shadow.mapSize.x,height:shadow.mapSize.y,minFilter:shadow.map.texture.minFilter,magFilter:shadow.map.texture.magFilter,depth:true};
    }
    const candidates=[],waterMeshes=new Set(world.waterBodies.map(entry=>entry.mesh)),groundMeshes=new Set([...world.groundMeshes.values(),...world.detailChunks].map(entry=>entry.mesh));
    const nearDetailMeshes=new Set(Object.values(world.groundProximity).filter(value=>value?.isMesh));
    // Every visible runtime scenery mesh participates, including newly added
    // branch, rock and understory batches. No manually maintained allow-list.
    world.scene.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      if(reflection && world.tireSpray && (mesh===world.tireSpray.mud || mesh===world.tireSpray.water))return;
      if(hiddenMeshes.includes(mesh.name))return;
      if(waterMeshes.has(mesh)&&(!water||mesh!==body.mesh))return;
      if(!nearDetail&&nearDetailMeshes.has(mesh))return;
      if(!scenery&&mesh!==world.sky&&!groundMeshes.has(mesh)&&!waterMeshes.has(mesh)&&mesh.name!=='distant-ridge')return;
      assert(!Array.isArray(mesh.material),'Native terrain export needs explicit material groups for '+mesh.name);
      candidates.push(mesh);
    });
    candidates.sort((a,b)=>Number(a.material.transparent)-Number(b.material.transparent)||a.renderOrder-b.renderOrder);
    const draws=[],shadowDraws=[];
    for(const mesh of candidates.filter(Boolean)){
      if(mesh.isInstancedMesh){
        const key=(mesh.name||mesh.material.name||'scenery-'+mesh.id).replace(/[^a-zA-Z0-9_-]/g,'_'),name=`native-instanced-${key}${useHDR?'-hdr':'-noenv'}`;
        if(!emitted.has(name)){emit(mesh.material,mesh.geometry,name,useHDR?world.scene.environment.image:null,false,mesh,true);emitted.add(name);}
      }
      // Full terrain connects the near study to its real distant ridges. A
      // cropped ground patch plus retained mountains creates a false sky gap.
      const geometry=bakeMesh(mesh,body.cx,body.cz,groundMeshes.has(mesh)?Infinity:reach);if(!geometry)continue;
      let material=mesh.material;
      if(mesh.isInstancedMesh&&mesh.instanceColor&&!material.vertexColors){material=material.clone();material.vertexColors=true;material.onBeforeCompile=mesh.material.onBeforeCompile;}
      const key=(mesh.name||material.name||'scenery-'+mesh.id).replace(/[^a-zA-Z0-9_-]/g,'_'),shader=materialProgram(material,geometry,key,reflection,useHDR),attributes={};
      for(const[attrName,attr]of Object.entries(geometry.attributes)){const file=`${name}-${draws.length}-${attrName}.bin`;fs.writeFileSync(path.join(dir,file),Buffer.from(attr.array.buffer));attributes[attrName]={file,itemSize:attr.itemSize,count:attr.count};}
      const array=new Uint32Array(geometry.index.array),index=`${name}-${draws.length}-indices.bin`;fs.writeFileSync(path.join(dir,index),Buffer.from(array.buffer));
      const draw={sourceMesh:mesh.name||material.name||key,shader,uniforms:nativeUniforms(material,camera,new T.Matrix4(),useHDR,shadows&&mesh.receiveShadow),attributes,index,count:array.length,instances:geometry.userData.nativeInstances,side:material.side,transparent:material.transparent,depthWrite:material.depthWrite,depthTest:material.depthTest,alphaToCoverage:material.alphaToCoverage,polygonOffset:material.polygonOffset,polygonOffsetFactor:material.polygonOffsetFactor,polygonOffsetUnits:material.polygonOffsetUnits};
      draws.push(draw);
      if(shadows&&mesh.castShadow){
        const depthMaterial=mesh.customDepthMaterial||new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
        Object.assign(depthMaterial,{map:material.map,alphaMap:material.alphaMap,alphaTest:material.alphaTest,displacementMap:material.displacementMap,displacementScale:material.displacementScale,displacementBias:material.displacementBias});
        depthMaterial.side=material.shadowSide??(material.side===T.FrontSide?T.BackSide:material.side===T.BackSide?T.FrontSide:T.DoubleSide);
        const depthShader=materialProgram(depthMaterial,geometry,key+'-sun-depth',true,false);
        shadowDraws.push({...draw,shader:depthShader,uniforms:nativeUniforms(depthMaterial,world.sun.shadow.camera),side:depthMaterial.side,transparent:false,depthWrite:true,alphaToCoverage:false});
      }
    }
    renderCases.push({name,kind:body.id,phase,width:1100,height:720,samples:useHDR?4:0,clearColor:reflection?[.52,.62,.65,1]:[.73,.78,.79,1],draws,shadows:shadows?[{target:shadowTarget,draws:shadowDraws}]:[],metadata:{camera:camera.position.toArray(),cameraMatrix:camera.matrixWorld.toArray(),projectionMatrix:camera.projectionMatrix.toArray(),waterLevel:body.level,reflection,hdr:useHDR,shadows:shadows?{mapSize:world.sun.shadow.mapSize.toArray(),normalBias:world.sun.shadow.normalBias,bias:world.sun.shadow.bias,type:renderer.shadowMap.type,drawCalls:shadowDraws.length}:null,environmentIntensity:useHDR?world.scene.environmentIntensity:0,environmentRotation:useHDR?world.scene.environmentRotation.toArray():null,activeRipples:world._waterRipples.filter(p=>p.w>0).length,fineTiles:world.terrain.detailTiles.size,nearGrass:nearDetail?world.groundProximity.grass.count:0,nearGravel:nearDetail?world.groundProximity.gravel.count:0,productionImportedRockCount:world.groundProximity.importedRocks?.count||0,hiddenMeshes,drawCalls:draws.length,triangles:draws.reduce((sum,draw)=>sum+draw.count/3,0),instancesBaked:draws.reduce((sum,draw)=>sum+draw.instances,0),notes:'Actual world geometry, materials, photographs and lights. Native Mesa software image, not a browser screenshot. '+(useHDR?'Runtime outdoor HDR and unchanged Three floating PMREM included; native 4-sample antialiasing. ':'Environment IBL omitted. ')+(shadows?'Runtime sun shadow settings and real depth draws included. ':'Cast shadows omitted. ')+'Planar reflection reference uses linear RGBA8. Replay counts are not browser draw-call or performance measurements.'}});
    Object.assign(renderCases.at(-1).metadata,{timeOfDay:world.timeOfDay,toneMappingExposure:world._nativeExposure??1.02,sunOffset:world.sunOffset.toArray(),sunColor:world.sun.color.toArray(),sunIntensity:world.sun.intensity,hemisphereIntensity:world.hemisphere.intensity,outdoorRadiance:world.environment?.outdoorRadiance||null,farClip:camera.far,fogDensity:world.scene.fog.density});
  }
  if(focusedDrivingStudy){writeHDRStudies();finishRenderScenes();return;}
  for(const[id,cameraPosition,target]of[
    ['wetland',[-38,5.5,112],[-24,3.18,139]],
    ['mud',[52.4,4.7,-136],[48,3.265,-127]],
  ]){
    const body=world.waterBodies.find(b=>b.id===id);world.clock=4;world._updateWater(0,{wheels:[],velocity:{x:0,z:0}});
    const camera=new T.PerspectiveCamera(51,1100/720,.12,500);camera.position.set(...cameraPosition);camera.lookAt(...target);camera.updateMatrixWorld(true);
    const mirrored=world._waterReflectionCamera(body,camera);body.reflectionReady=1;
    writeScene(`native-water-${id}-reflection`,mirrored,body,{reflection:true,reach:160});
    writeScene(`native-water-${id}-still`,camera,body,{water:true,phase:'still',reach:160});
    if(id==='wetland')writeTemporalReplay(body,camera);
    if(id==='wetland'){body.reflectionReady=0;writeScene('native-water-wetland-no-reflection',camera,body,{water:true,phase:'reflection-disabled-control',reach:160});body.reflectionReady=1;}
    const cx=id==='mud'?48:-24,cz=id==='mud'?-130:134;
    for(let pass=0;pass<4;pass++)for(let i=0;i<=110;i++)for(const side of[-1,1])world.terrain.deform(cx+side*.83,cz-3+i*.055,{load:5430,pressure:37,contactWidth:.285,contactLength:.27,slip:.7,speed:1.5,dt:.037,heading:0,wheelId:`native-water-${id}-${pass}-${side}`});
    world._syncDeformation();world._syncWaterDepth();
    for(let i=0;i<12;i++){
      world.clock=4+i*.14;const z=cz-1.1+i*.23;
      world._updateWater(.14,{vehicleId:'native-water',velocity:{x:0,z:2.8},heading:0,wheels:[-1,1].map(side=>({contact:true,ground:{x:cx+side*.83,y:world.terrain.heightAt(cx+side*.83,z),z},slip:.5}))});
    }
    world.clock+=.12;world._updateWater(.12,{wheels:[],velocity:{x:0,z:0}});
    writeScene(`native-water-${id}-wake`,camera,body,{water:true,phase:'rutted-with-wakes',reach:160});
    if(id==='wetland'){
      const saved=world._waterRipples.map(p=>p.clone());world._waterRipples.forEach(p=>p.w=0);
      writeScene('native-water-wetland-wake-off',camera,body,{water:true,phase:'same-time-geometry-wake-disabled-control',reach:160});
      world._waterRipples.forEach((p,i)=>p.copy(saved[i]));
    }
    world.terrain.resetDeformation();world._syncDeformation();world._syncWaterDepth();
  }
  // Additional close-range actual terrain views make the different physical
  // surfaces readable without relying on a flat palette or scalar-only test.
  take('native-rock-shelves',112,101,'rock','physical-ledges');
  take('native-trail-erosion',world.terrain.trailX(-82),-82,'base','worn-trail');
  take('native-sand-ripples',195,-140,'sand','dune-ripples');
  // Keep this published-v1.7 camera fixed while the actual outcrop heightfield
  // improves. Deriving the target from the new terrain would change the view.
  const outcropCamera=new T.PerspectiveCamera(54,1100/720,.12,500);outcropCamera.position.set(124,6.471017074584961,105);outcropCamera.lookAt(141,7.578592014312744,125);outcropCamera.updateMatrixWorld(true);
  writeScene('native-rock-outcrops',outcropCamera,{id:'rock',cx:140,cz:124,level:0},{reach:90,phase:'stacked-contact-shelves-and-talus'});
  const trailZ=-82,trailX=world.terrain.trailX(trailZ),trailCamera=new T.PerspectiveCamera(54,1100/720,.12,500);
  trailCamera.position.set(trailX+5,world.terrain.heightAt(trailX+5,trailZ-9)+2.3,trailZ-9);trailCamera.lookAt(trailX,world.terrain.heightAt(trailX,trailZ)+.25,trailZ+12);trailCamera.updateMatrixWorld(true);
  const trailBody={id:'trail',cx:trailX,cz:trailZ,level:0};
  writeScene('native-trail-dense-verge',trailCamera,trailBody,{reach:105,phase:'local-grass-and-loose-grit'});
  writeScene('native-trail-distant-detail-control',trailCamera,trailBody,{reach:105,phase:'same-camera-local-detail-disabled',nearDetail:false});

  if(hdr)writeHDRStudies();

  finishRenderScenes();
  function finishRenderScenes(){
  let selectedCases=renderCases;
  if(viewFilter){
    const selected=new Set(renderCases.filter(record=>viewFilter.test(record.name)).map(record=>record.name));
    assert(selected.size>0,'Focused native selector matched no cameras');
    // Retain captured mirror-image dependencies when a selected water camera
    // references them; the focused report never substitutes unrelated old PNGs.
    for(let changed=true;changed;){
      changed=false;
      for(const record of renderCases.filter(record=>selected.has(record.name)))for(const draw of record.draws)for(const value of Object.values(draw.uniforms||{})){
        if(value?.textureFile){const dependency=value.textureFile.replace(/\.png$/,'');if(!selected.has(dependency)&&renderCases.some(other=>other.name===dependency)){selected.add(dependency);changed=true;}}
      }
    }
    selectedCases=renderCases.filter(record=>selected.has(record.name));
  }
  assert(selectedCases.every(record=>!record.metadata?.exportSkipped),'A requested frame or reflection dependency was not exported; include its source camera in --views');
  fs.writeFileSync(`${dir}/render-scenes.json`,JSON.stringify({assets:path.join(sourceRoot,'dist/assets/terrain'),pmrem,focusedViews:viewFilter?.source||(focusedDrivingStudy?'focused-driving-study':null),study:treeDrivingStudy?TREE_NATIVE_STUDY:sprayDrivingStudy?TIRE_SPRAY_DRIVING_SCENARIOS:rutDrivingStudy?activeRutStudy:null,cases:selectedCases},null,2));
  }

  function writeHDRStudies(){
    // Execute the actual _createSky method. Only synchronous local file loading
    // and GPU work are intercepted: runtime Canvas2D/HDR parsing and its chosen
    // environment rotation/intensity are retained, then exact PMREM passes are
    // replayed in floating native targets by the Python companion.
    function captureSkyOperation(operation){
      const savedDocument=globalThis.document,originalLoad=T.FileLoader.prototype.load,originalPMREM=runtimeT.PMREMGenerator.prototype.fromEquirectangular,savedRenderer=world.renderer;
      globalThis.document={createElement(tag){assert.equal(tag,'canvas');return canvasRuntime.createCanvas(1,1);}};
      T.FileLoader.prototype.load=function(url,onLoad){const file=fileURLToPath(url);assert(file.startsWith(path.join(sourceRoot,'dist/assets/terrain')+path.sep),'HDR fixture reads only local runtime terrain assets');const bytes=fs.readFileSync(file);onLoad(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));return {};};
      runtimeT.PMREMGenerator.prototype.fromEquirectangular=function(texture){
        const source=texture.userData.outdoorRadiance?.source;
        const name=texture.isCanvasTexture?'runtime-startup-environment':source?'runtime-outdoor-'+source.replace(/[^a-zA-Z0-9_-]/g,'_'):'runtime-outdoor-environment';
        assert(!pmrem.some(recipe=>recipe.name===name),'Each captured environment preset needs a unique PMREM recipe name');
        const result=exportPMREM(T,dir,texture,name);pmrem.push({...result.recipe,outdoorRadiance:texture.userData.outdoorRadiance||null});return {texture:result.texture,dispose(){}};
      };
      world.renderer={...renderer,toneMappingExposure:world._nativeExposure??1.02,compile(){}};
      try{operation();world._nativeExposure=world.renderer.toneMappingExposure;}finally{globalThis.document=savedDocument;T.FileLoader.prototype.load=originalLoad;runtimeT.PMREMGenerator.prototype.fromEquirectangular=originalPMREM;world.renderer=savedRenderer;}
    }
    world.scene.remove(world.sky);
    captureSkyOperation(()=>world._createSky());
    assert(world._hasPhotoEnvironment,'Actual local outdoor HDR must load for the HDR study');
    const cameraAt=(position,target,fov=51)=>{const camera=new T.PerspectiveCamera(fov,1100/720,.12,WORLD_VISIBILITY.farClip);camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld(true);return camera;};
    const local=(x,z,above)=>[x,world.terrain.heightAt(x,z)+above,z];
    const study=(name,camera,body,options={})=>{camera.far=WORLD_VISIBILITY.farClip;camera.updateProjectionMatrix();return writeScene('native-hdr-'+name,camera,body,{reach:110,phase:'production-HDR-material-study',useHDR:true,...options});};
    if(focusedDrivingStudy){
      const savedWindow=globalThis.window,savedCanvas=world.canvas,savedCamera=world.camera;
      globalThis.window={devicePixelRatio:1,innerWidth:1100,innerHeight:720};
      world.canvas={clientWidth:1100,clientHeight:720};world.camera=cameraAt([0,8,0],[0,0,1]);world.rain||={visible:false};
      try{captureSkyOperation(()=>{
        // Output resolution stays fixed for comparison; these no-op surface
        // calls let the real preset setter control materials and populations.
        world.renderer.setPixelRatio=()=>{};world.renderer.setSize=()=>{};
        world.setQuality(rutPreset==='app-default'?'medium':'high');
        if(rutPreset==='app-default')world.setTimeOfDay('sunset');
      });}finally{globalThis.window=savedWindow;world.canvas=savedCanvas;world.camera=savedCamera;}
      if(treeDrivingStudy)writeTreeDrivingStudies(cameraAt,study);
      else if(sprayDrivingStudy)writeSprayDrivingStudies(cameraAt,study);
      else writeRutDrivingStudies(cameraAt,study);
      return;
    }
    study('trail-verge',trailCamera,trailBody);
    study('rock-outcrops',outcropCamera,{id:'rock',cx:140,cz:124,level:0});
    // Fixed higher quarter view supplements the unchanged low published-source
    // camera, showing block top faces, cast shadows and interstitial ground.
    const boulderQuarterCamera=cameraAt([124,10.2,105],[137,7.4,122],54);
    study('granite-boulders',boulderQuarterCamera,{id:'rock',cx:137,cz:122,level:0},{reach:105,phase:'fixed-granite-boulder-quarter-view'});
    const graniteShadowCamera=cameraAt([151,10.8,137],[135,6.8,118],54),graniteBody={id:'rock',cx:135,cz:118,level:0};
    study('granite-reverse-quarter',graniteShadowCamera,graniteBody,{reach:105,phase:'fixed-reverse-quarter-showing-sunward-faces-and-ground-shadows'});
    study('granite-reverse-quarter-no-shadows',graniteShadowCamera,graniteBody,{reach:105,shadows:false,phase:'same-reverse-quarter-with-sun-shadow-receiving-disabled'});
    study('challenge-loop',cameraAt([-204,16,18],[-229,22,60],58),{id:'challenge',cx:-231,cz:54,level:4.6},{reach:190,phase:'fixed-challenge-loop-and-runway'});
    // Fixed driver-height upward views expose the published support columns
    // crossing the lower loop/approach and the laterally separated exit. Keep
    // these datums identical in before/after replays; a distant overview can
    // conceal the obstruction where elevated supports pass through a lane.
    study('challenge-loop-driver',cameraAt([-236,6.45,25],[-233,22,63],58),{id:'challenge',cx:-231,cz:54,level:4.6},{reach:150,phase:'fixed-driver-height-upward-loop-roadway-clearance'});
    study('challenge-loop-exit-driver',cameraAt([-222,6.45,97],[-226,23,57],58),{id:'challenge',cx:-226,cz:66,level:4.6},{reach:150,phase:'fixed-driver-height-upward-offset-exit-clearance'});
    study('challenge-jumps',cameraAt([-158,19,-98],[-185,7,10],58),{id:'challenge',cx:-188,cz:-35,level:4.6},{reach:220,phase:'fixed-challenge-jump-and-obstacle-lanes'});
    study('long-valley',cameraAt([-74,14,-185],[-56,12,200],58),{id:'distance',cx:-65,cz:20,level:0},{reach:410,phase:'fixed-long-valley-with-runtime-far-clip-and-atmosphere'});
    study('sand-dunes',cameraAt(local(183,-159,1.7),local(200,-132,.7)),{id:'sand',cx:195,cz:-140,level:0},{reach:120});
    // The source v1.7 atmosphere is a finite world-origin sphere. This exact
    // inward view near a playable corner exposes its 1,900 m far-plane clip;
    // the current source's camera-relative sky must cover the same horizon.
    const cornerCamera=cameraAt([390,23.34546203613281,390],[-100,35,-100],58);
    study('corner-inward',cornerCamera,{id:'corner',cx:390,cz:390,level:0},{reach:150,phase:'fixed-playable-corner-inward-horizon-coverage'});
    // Fixed published-ground camera at a verified production scatter location.
    // The old source renders the same location without the newly added batch.
    const stoneCamera=cameraAt([11.383019462287193,3.892466463606982,-66.30986539845762],[10.603019462287193,3.453080258952011,-65.20986539845762],48);
    const stoneBody={id:'ground-detail',cx:10.603019462287193,cz:-65.20986539845762,level:0};
    study('ground-stone-detail',stoneCamera,stoneBody,{reach:35,phase:'actual-runtime-imported-stone-batch-at-fixed-close-inspection-camera'});
    study('ground-stone-detail-no-imported-rocks',stoneCamera,stoneBody,{reach:35,hiddenMeshes:['near-ground-imported-rocks'],phase:'identical-camera-with-production-imported-rock-batch-hidden'});
    // Freeze the published v1.8 eye/target datums, independently reproduced from
    // heightAt(24,-160)+1.65 and heightAt(35,-145)+5.8 in the retained baseline.
    // New mud relief changes both anchors: deriving them from each source would
    // tilt the bank and sunset comparisons by about half a degree.
    const bankCamera=cameraAt([24,5.584820413589478,-160],[35,9.072847890853883,-145],55),bankBody={id:'forest',cx:35,cz:-145,level:0};
    study('bank-tree',bankCamera,bankBody,{reach:95});
    study('bank-tree-no-shadows',bankCamera,bankBody,{reach:95,shadows:false,phase:'identical-HDR-camera-with-sun-shadow-receiving-disabled-control'});
    study('bank-tree-no-scenery',bankCamera,bankBody,{reach:95,scenery:false,nearDetail:false,phase:'identical-HDR-camera-with-scenery-disabled-control'});
    const wetBody=world.waterBodies.find(body=>body.id==='wetland'),wetCamera=cameraAt([-38,5.5,112],[-24,3.18,139]);
    world.clock=4;world._updateWater(0,{wheels:[],velocity:{x:0,z:0}});
    const mirrored=world._waterReflectionCamera(wetBody,wetCamera);wetBody.reflectionReady=1;
    const reflectionName='native-hdr-water-wetland-reflection';
    writeScene(reflectionName,mirrored,wetBody,{reflection:true,reach:160,useHDR:true});
    study('wetland-shore',wetCamera,wetBody,{water:true,reach:160});
    const shore=renderCases.at(-1);for(const draw of shore.draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=reflectionName+'.png';
    const mudBody=world.waterBodies.find(body=>body.id==='mud'),mudCamera=cameraAt([52.4,4.7,-136],[48,3.265,-127]);
    const mudMirror=world._waterReflectionCamera(mudBody,mudCamera);mudBody.reflectionReady=1;
    const mudReflectionName='native-hdr-water-mud-reflection';
    writeScene(mudReflectionName,mudMirror,mudBody,{reflection:true,reach:140,useHDR:true});
    study('mud-bank',mudCamera,mudBody,{water:true,reach:140});
    const mud=renderCases.at(-1);for(const draw of mud.draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=mudReflectionName+'.png';
    const mudOverviewCamera=cameraAt([78,15.5,-156],[43,3.3,-111],58);
    const mudOverviewMirror=world._waterReflectionCamera(mudBody,mudOverviewCamera);mudBody.reflectionReady=1;
    const mudOverviewReflection='native-hdr-water-mud-overview-reflection';
    writeScene(mudOverviewReflection,mudOverviewMirror,mudBody,{reflection:true,reach:145,useHDR:true});
    study('mud-rut-overview',mudOverviewCamera,mudBody,{water:true,reach:145,phase:'fixed-mud-branching-ruts-and-pools-overview'});
    const mudOverviewScene=renderCases.at(-1);for(const draw of mudOverviewScene.draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=mudOverviewReflection+'.png';
    if(TireSprayView && VEHICLES.some(spec=>spec.id==='hummer-ev-suv-3x')) {
      const savedDocument=globalThis.document;
      globalThis.document={createElement(tag){assert.equal(tag,'canvas');return canvasRuntime.createCanvas(1,1);}};
      try { world.setVehicle(VEHICLES.find(spec=>spec.id==='hummer-ev-suv-3x')); }
      finally { globalThis.document=savedDocument; }
      const simulation=new VehiclePhysics(world.terrain,world.spec);
      simulation.reset({x:33,z:-114,heading:0});
      for(let frame=0;frame<180;frame++)simulation.step(1/120);
      // A rolling water-entry fixture: settle real suspension, then initialize
      // consistent body/wheel speed. Subsequent movement and spray are live
      // physics; this is not represented as acceleration from a standing start.
      simulation.body.velocity.set(0,0,8);for(const wheel of simulation._wheels)wheel.omega=8/wheel.radius;
      world.tireSpray=new TireSprayView(world.scene,world.terrain);
      world.tireSpray.setVehicle?.(world.vehicle);
      for(let frame=0;frame<96;frame++) {
        const state=simulation.step(1/120,{throttle:.35});world.clock=4+frame/120;
        world.vehicle.update(state,{});world._syncDeformation();world._updateWater(1/120,state);world.tireSpray.update(1/120,state,'high');
      }
      const state=simulation.state;world.vehicle.update(state,{});world._syncDeformation();world._syncWaterDepth(true);
      const p=state.position,sprayCamera=cameraAt([p.x+5.2,p.y+1.9,p.z-5.8],[p.x,p.y+.05,p.z-.1],48);
      const sprayReflection='native-hdr-tire-spray-reflection';
      writeScene(sprayReflection,world._waterReflectionCamera(mudBody,sprayCamera),mudBody,{reflection:true,reach:95,useHDR:true});
      study('hummer-tire-spray',sprayCamera,mudBody,{water:true,reach:95,phase:'actual-Hummer-water-entry-at-8mps-initial-speed-after-0.8-seconds'});
      const sprayScene=renderCases.at(-1);
      for(const draw of sprayScene.draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=sprayReflection+'.png';
      Object.assign(sprayScene.metadata,{physicsDrivenPose:true,cameraTracksVehicle:true,comparisonNote:'Each source runs the same rolling water-entry inputs. Its vehicle pose and tracking camera follow its own physics; do not use this frame for a fixed-camera before/after pixel comparison.',vehicle:state.vehicleId,position:state.position,initialRollingSpeedMPS:8,speedKmh:state.speedKmh,activeMudClods:world.tireSpray.mud.count,activeWaterDrops:world.tireSpray.water.count,emitted:{...world.tireSpray.simulation.emitted}});
      assert(world.tireSpray.mud.count>0 && world.tireSpray.water.count>0,'Actual tire contacts must produce both solid clods and water in the spray fixture');
      world.tireSpray.group.visible=false;
      study('hummer-tire-spray-no-ejecta',sprayCamera,mudBody,{water:true,reach:95,phase:'same-live-vehicle-pose-with-only-ballistic-ejecta-hidden-control'});
      for(const draw of renderCases.at(-1).draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=sprayReflection+'.png';
      world.tireSpray.dispose();world.tireSpray=null;world.vehicle.dispose();world.vehicle=null;
      world.terrain.resetDeformation();world._syncDeformation();world._syncWaterDepth(true);world.clock=4;
      for(const ripple of world._waterRipples)ripple.set(0,0,0,0);world._waterWheelHistory.clear();
    }
    if(importedRock){
      const x=world.terrain.trailX(-82)+4.1,z=-82,geometry=importedRock.createImportedGroundRockGeometry();geometry.computeBoundingBox();
      const asset='rock_moss_set_01/textures/rock_moss_set_01';
      const material=new T.MeshStandardMaterial({map:world._texture(asset+'_diff_2k.jpg',true),normalMap:world._texture(asset+'_nor_gl_2k.jpg'),roughnessMap:world._texture(asset+'_rough_2k.jpg'),normalScale:new T.Vector2(.7,.7),roughness:1});
      for(const texture of[material.map,material.normalMap,material.roughnessMap])texture.flipY=false;
      const group=new T.Group();group.name='proposed-imported-ground-stones';
      for(const[dx,dz,scale,angle]of[[-.30,.08,.12,.2],[.10,.18,.15,2.3],[.40,-.12,.10,4.7]]){
        const mesh=new T.Mesh(geometry,material);mesh.name='proposed-imported-stone';mesh.rotation.y=angle;mesh.scale.setScalar(scale);
        mesh.position.set(x+dx,world.terrain.heightAt(x+dx,z+dz)+.050-geometry.boundingBox.max.y*scale,z+dz);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
      }
      const camera=cameraAt(local(x+.78,z-1.10,.47),local(x,z+.05,.035),48),body={id:'imported-rock-study',cx:x,cz:z,level:0};
      world.scene.add(group);study('imported-rock-proposal',camera,body,{reach:35,nearDetail:false,phase:'proposal-only-imported-CC0-rock-at-five-centimetres-relief'});
      renderCases.at(-1).metadata.proposalOnly=true;
      renderCases.at(-1).metadata.geometryModule='dist/src/imported-ground-rock.js';
      world.scene.remove(group);study('imported-rock-proposal-control',camera,body,{reach:35,nearDetail:false,phase:'identical-ground-with-proposed-imported-stones-removed'});
      renderCases.at(-1).metadata.proposalOnly=true;
    }
    // Exercise the actual preset switch, including new cached HDR selection,
    // sky colors, fog, sun offset/intensity, and runtime exposure. Dry weather
    // does not display rain particles; its visibility holder is enough here.
    world.rain||={visible:false};
    captureSkyOperation(()=>world.setTimeOfDay('sunset'));
    study('sunset-trail-verge',trailCamera,trailBody);
    study('sunset-bank-tree',bankCamera,bankBody,{reach:95});
    world.clock=4;world._updateWater(0,{wheels:[],velocity:{x:0,z:0}});
    const sunsetMirror=world._waterReflectionCamera(wetBody,wetCamera);wetBody.reflectionReady=1;
    const sunsetReflectionName='native-hdr-sunset-water-wetland-reflection';
    writeScene(sunsetReflectionName,sunsetMirror,wetBody,{reflection:true,reach:160,useHDR:true});
    study('sunset-wetland-shore',wetCamera,wetBody,{water:true,reach:160});
    for(const draw of renderCases.at(-1).draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=sunsetReflectionName+'.png';
  }

  function prepareNativeVehicle(spec){
    const savedDocument=globalThis.document;
    globalThis.document={createElement(tag){assert.equal(tag,'canvas');return canvasRuntime.createCanvas(1,1);}};
    try{world.setVehicle(spec);}finally{globalThis.document=savedDocument;}
  }

  function writeTreeDrivingStudies(cameraAt,study){
    const fixture=TREE_NATIVE_STUDY.fixture,spec=VEHICLES.find(vehicle=>vehicle.id===fixture.vehicle);
    assert(spec,'The tree study requires its real catalogue vehicle');
    const tree=world.damageRecords.get(fixture.treeId);
    assert(tree,'The unchanged generated forest must contain the fixture tree');
    prepareNativeVehicle(spec);
    const globals=Object.fromEntries(['window','document','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
    const controller=createOrdinaryInput(DrivingInput),simulation=new VehiclePhysics(world.terrain,spec);
    simulation.reset(fixture.spawn);
    const observer=createTreeNativeCaptureSequence(),camera=cameraAt(TREE_NATIVE_STUDY.camera.eye,TREE_NATIVE_STUDY.camera.target,TREE_NATIVE_STUDY.fieldOfViewDegrees);
    const body={id:'tree-impact',cx:tree.x,cz:tree.z+4,level:0},captures=[];
    const settleFrames=Math.round(fixture.settleSeconds/fixture.frameDT);
    try{
      for(let frame=-settleFrames;frame<Math.round(fixture.seconds/fixture.frameDT);frame++){
        const driveTime=frame*fixture.frameDT,requested=treeNativeInput(driveTime),input=controller.set(requested);
        const state=simulation.step(fixture.frameDT,input);
        world.clock=(frame+settleFrames+1)*fixture.frameDT;
        world.vehicle.update(state,{});world._syncDeformation();world._updateObjectDamage(fixture.frameDT,state);world._updateWater(fixture.frameDT,state);
        world._updateGroundProximity(state.position);
        for(const capture of observer.observe({driveTime,tree,vehiclePosition:state.position})){
          world.scene.updateMatrixWorld(true);
          const matrix=new T.Matrix4();world.trunks.getMatrixAt(tree.index,matrix);
          const root=new T.Vector3(0,-.5,0).applyMatrix4(matrix),tip=new T.Vector3(0,.5,0).applyMatrix4(matrix);
          const metadata={...capture,fixture:fixture.id,vehicle:spec.id,preset:rutPreset,quality:world.quality,
            publicDrivingInput:true,syntheticImpacts:0,syntheticPoseWrites:0,directTerrainStampCalls:0,
            requestedInput:requested,deliveredInput:input,spawn:fixture.spawn,settleSeconds:fixture.settleSeconds,
            frameDT:fixture.frameDT,position:{...state.position},quaternion:{...state.quaternion},speedKmh:state.speedKmh,
            condition:state.damage.condition,treeId:tree.id,treeRoot:root.toArray(),treeTip:tip.toArray(),
            treeAngleDegrees:Math.acos(Math.max(-1,Math.min(1,tip.clone().sub(root).normalize().y)))*180/Math.PI,
            hinge:tree.fall?{angle:tree.fall.angle,angularSpeed:tree.fall.angularSpeed,settled:tree.fall.settled}:null,
            cameraTracksVehicle:false,omittedTransientParticles:'This focused tree geometry study omits airborne dust and rain; tree, vehicle damage, terrain and actual scenery are retained.',
            observedBreakTime:observer.brokenTime};
          study('tree-driving-'+capture.id,camera,body,{reach:90,refreshProximity:false,shadowAnchor:state.position,phase:'ordinary-public-input-tree-'+capture.id});
          Object.assign(renderCases.at(-1).metadata,metadata);captures.push(metadata);
        }
      }
      assert(observer.brokenTime!==null,'The actual collision must break the selected tree');
      if(tree.fall)assert(observer.captured.includes('settled'),'The driven tree must reach a resting pose during the fixture');
      console.log('Ordinary tree captures:',JSON.stringify(captures.map(({id,driveTime,treeAngleDegrees,condition})=>({id,driveTime,treeAngleDegrees,condition}))));
    }finally{
      for(const[name,descriptor]of Object.entries(globals)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
      world.vehicle.dispose();world.vehicle=null;simulation.dispose?.();
    }
  }

  function writeSprayDrivingStudies(cameraAt,study){
    assert(TireSprayView,'The source-selected runtime must expose actual tire ejecta');
    for(const scenario of TIRE_SPRAY_DRIVING_SCENARIOS.filter(scenario=>!sprayPanelStudy||scenario.id==='hummer-mud-turn')){
      const spec=VEHICLES.find(vehicle=>vehicle.id===scenario.vehicle);
      runTireSprayDrivingScenario({world,scenario,VehiclePhysics,TireSprayView,spec,prepareVehicle:prepareNativeVehicle,
        capture({state,cameras,metadata}){
          const waterBody=world.waterBodies.find(body=>body.id==='mud');
          assert(waterBody,'The real authored mud water body must remain present');
          // This extra view was chosen from the unchanged six-second run's
          // actual deposit/opaque-body triangles. The original rear camera's
          // deposits are occluded by its tire; it cannot prove panel appearance.
          // Eye and sightline remain above the actual worked terrain. Keep the
          // same production preset, control history and unmodified hit geometry.
          const rigs=sprayPanelStudy?[{id:'sunward-front-liner-low',eye:[11.1,4.12,-105.3],target:[12.95,3.99,-106.52],fov:36}]:cameras;
          for(const rig of rigs){
            const camera=cameraAt(rig.eye,rig.target,rig.fov);
            for(const phase of sprayPanelStudy?['driven','deposits-only','clean-control']:['driven','no-ejecta']){
              world.tireSpray.group.visible=phase==='driven';
              const depositsVisible=phase==='driven'||phase==='deposits-only';
              if(world.tireSpray.impactMarks)world.tireSpray.impactMarks.group.visible=depositsVisible;
              const prefix='spray-driving-'+scenario.id+'-'+rig.id+'-'+phase,reflectionName='native-hdr-'+prefix+'-reflection';
              const options={reach:75,refreshProximity:false,shadowAnchor:state.position,phase:'service-brake-settled-direct-controls-'+phase};
              waterBody.reflectionReady=1;
              writeScene(reflectionName,world._waterReflectionCamera(waterBody,camera),waterBody,{...options,reflection:true,useHDR:true});
              study(prefix,camera,waterBody,{...options,water:true});
              const record=renderCases.at(-1);
              for(const draw of record.draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=reflectionName+'.png';
              Object.assign(record.metadata,metadata,{preset:rutPreset,quality:world.quality,cameraRig:rig.id,ejectaAndDepositsHidden:!depositsVisible,
                airborneEjectaHidden:phase!=='driven',panelDepositsHidden:!depositsVisible,panelVisibilityStudy:sprayPanelStudy,
                ...(sprayPanelStudy?{cameraSelection:'Fixed camera from actual retained six-second panel hits and opaque mesh visibility, with unchanged ordinary controls and preset. Eye is 0.465 m above actual exported soil; 81 eye-to-target samples remain at least 0.373 m above the ground.'}:{}),
                comparisonNote:'Same integrated vehicle pose, terrain, water, lighting and camera. Visibility controls separately hide airborne tire ejecta and panel deposits, including deposits in the reflected scene.'});
            }
          }
          console.log('Ordinary spray capture:',JSON.stringify({fixture:scenario.id,position:metadata.position,speedKmh:metadata.speedKmh,emitted:metadata.emitted,bodyCollisions:metadata.bodyCollisions,retainedDeposits:metadata.retainedDeposits,activeMud:metadata.activeMud,activeWater:metadata.activeWater}));
        }});
      world.tireSpray.dispose();world.tireSpray=null;world.vehicle.dispose();world.vehicle=null;
    }
  }

  function writeRutDrivingStudies(cameraAt,study){
    const spec=VEHICLES.find(vehicle=>vehicle.id===activeRutStudy.vehicle);
    assert(spec,'The actual-driving rut study requires its declared production vehicle');
    const sceneBeforeVehicle=new Set(world.scene.children),savedDocument=globalThis.document;
    globalThis.document={createElement(tag){assert.equal(tag,'canvas');return canvasRuntime.createCanvas(1,1);}};
    try{world.setVehicle(spec);}finally{globalThis.document=savedDocument;}
    const vehicleObjects=world.scene.children.filter(object=>!sceneBeforeVehicle.has(object));
    for(const route of activeRutStudy.routes.filter(route=>!rutRoutes||rutRoutes.includes(route.id))){
      const fixture=workedSoilStudy?{...activeRutStudy,...route}:activeRutStudy;
      world.terrain.resetDeformation();world._syncDeformation();world._syncWaterDepth(true);
      for(const ripple of world._waterRipples)ripple.set(0,0,-100,0);
      world._waterWheelHistory.clear();world._nearDetailState=null;
      const simulation=new VehiclePhysics(world.terrain,spec);
      simulation.reset(route.spawn);simulation.setPressure(fixture.pressurePSI);
      assert(simulation.setControl('driveMode',fixture.driveMode).ok);
      if(workedSoilStudy)assert(simulation.setControl('tractionControl',route.tractionControl).ok);
      Object.assign(world,{camera:new T.PerspectiveCamera(51,1100/720,.12,WORLD_VISIBILITY.farClip),cameraMode:'chase',orbitYaw:-.28,orbitPitch:.38,cameraDistance:9.5,
        _look:new T.Vector3(),_desired:new T.Vector3(),_forward:new T.Vector3(),_cameraLook:new T.Vector3(0,4.5,-42),_freeKeys:new Set(),_snapCamera:true,_loopCameraHold:0});
      let loadedCalls=0,imprintingCalls=0,supportPlaneCalls=0;
      const originalDeform=world.terrain.deform;
      world.terrain.deform=function(x,z,options){loadedCalls++;if(options.supportPlane)supportPlaneCalls++;const result=originalDeform.call(this,x,z,options);if(result>0)imprintingCalls++;return result;};
      try{
        const frames=Math.round((fixture.seconds+(workedSoilStudy?fixture.settleSeconds:0))/fixture.frameDT),settleFrames=Math.round(fixture.settleSeconds/fixture.frameDT);
        for(let frame=0;frame<frames;frame++){
          const requested=workedSoilStudy?(frame<settleFrames?fixture.settleInput:controlsAt(route,(frame-settleFrames)*fixture.frameDT)):{throttle:frame>=settleFrames?fixture.throttle:0};
          const state=simulation.step(fixture.frameDT,requested);
          world.clock=(frame+1)*fixture.frameDT;
          world._syncDeformation();world._updateWater(fixture.frameDT,state);
          world._updateCamera(fixture.frameDT,state,{});
          // Match the ordinary frame path. A forced refresh at capture would
          // conceal stale props above edits to an already allocated soil tile.
          world._updateGroundProximity(state.position);
        }
      }finally{world.terrain.deform=originalDeform;}
      const state=simulation.state;world.vehicle.update(state,{});world._syncWaterDepth(true);
      const transientWater={clock:world.clock,ripples:world._waterRipples.map(p=>p.toArray()),motions:world._waterMotions.map(p=>p.toArray())};
      const soil=soilMetrics(),metadata={rutDriving:true,workedSoilStudy,route:route.id,preset:rutPreset,quality:world.quality,vehicle:spec.id,physicsDrivenPose:true,directStampCalls:0,
        input:{seconds:fixture.seconds,settleSeconds:fixture.settleSeconds,frameDT:fixture.frameDT,throttle:fixture.throttle,pressurePSI:fixture.pressurePSI,driveMode:fixture.driveMode,spawn:route.spawn,
          ...(workedSoilStudy?{settleInput:fixture.settleInput,phases:route.phases,tractionControl:route.tractionControl,secondsExcludesSettle:true}: {})},
        physics:{loadedCalls,imprintingCalls,supportPlaneCalls,position:state.position,quaternion:state.quaternion,speedKmh:state.speedKmh,condition:state.damage.condition},soil,
        propUpdateMethod:'Actual per-frame _updateGroundProximity without forced refresh; reset controls use the ordinary epoch invalidation.',
        omittedTransientParticles:true};
      assert(loadedCalls>0&&supportPlaneCalls===loadedCalls&&soil.maxSink>0,'Ordinary loaded finite-footprint tires must produce the captured tracks');
      assert(soil.maximumRenderHeightError<2e-6,'Actual fine render vertices must equal the driven physical heightfield');
      const cameras=[{id:'chase',camera:world.camera.clone(),tracksVehicle:true,vehicleVisible:true},
        {id:'ground',camera:cameraAt(route.eye,route.target,46),tracksVehicle:false,vehicleVisible:false}];
      for(const phase of ['driven','reset-control']){
        if(phase==='reset-control'){
          world.terrain.resetDeformation();world._syncDeformation();world._syncWaterDepth(true);
          // Reset updates the physical bed and persistent cover. Preserve the
          // exact transient wake inputs, so disappearing ripples cannot make
          // a rut visibility control pass independently of soil appearance.
          world._waterRipples.forEach((p,i)=>p.fromArray(transientWater.ripples[i]));
          world._waterMotions.forEach((p,i)=>p.fromArray(transientWater.motions[i]));
          world._updateGroundProximity(state.position);
        }
        for(const rig of cameras){
          for(const object of vehicleObjects)object.visible=rig.vehicleVisible;
          const waterBody=world.waterBodies.find(body=>body.id===(route.surface||route.id)),body=waterBody||{id:route.id,cx:route.spawn.x,cz:route.spawn.z+6,level:0};
          const prefix=`${workedSoilStudy?'worked-soil':'rut-driving'}-${route.id}-${rig.id}-${phase}`;
          const options={water:!!waterBody,reach:85,refreshProximity:false,shadowAnchor:state.position,phase:'ordinary-driving-'+phase};
          let reflectionName=null;
          if(waterBody){
            reflectionName='native-hdr-'+prefix+'-reflection';waterBody.reflectionReady=1;
            writeScene(reflectionName,world._waterReflectionCamera(waterBody,rig.camera),body,{...options,water:false,reflection:true,useHDR:true});
          }
          study(prefix,rig.camera,body,options);
          const captured=renderCases.at(-1);
          if(reflectionName)for(const draw of captured.draws)if(draw.uniforms.tdWaterReflection)draw.uniforms.tdWaterReflection.textureFile=reflectionName+'.png';
          Object.assign(captured.metadata,metadata,{cameraTracksVehicle:rig.tracksVehicle,cameraRig:rig.id,terrainResetControl:phase==='reset-control',vehicleVisible:rig.vehicleVisible,
            sourceSoilState:phase==='reset-control'?soilMetrics():soil,
            transientWaterState:{clock:world.clock,ripples:world._waterRipples.map(p=>p.toArray()),motions:world._waterMotions.map(p=>p.toArray())},
            comparisonNote:rig.tracksVehicle?'Actual runtime chase camera follows integrated physics; compare only to its same-source, same-camera terrain-reset control.':'Fixed published-source ground inspection camera; exact datums shared across source versions.',
            shadowAnchor:{...state.position}});
        }
      }
      for(const object of vehicleObjects)object.visible=true;
      simulation.dispose?.();
      console.log('Ordinary driving fixture:',JSON.stringify({route:route.id,loadedCalls,imprintingCalls,...soil,speedKmh:state.speedKmh}));
    }
    world.vehicle.dispose();world.vehicle=null;
  }

  function soilMetrics(){
    const nodes=new Map();let maximumRenderHeightError=0;
    for(const tile of world.terrain.detailTiles.values()){
      const record=world.detailMeshes.get(tile.key),position=record.chunk.mesh.geometry.attributes.position;
      for(let i=0;i<tile.base.length;i++){
        const x=Math.round(tile.minX/tile.step)+i%(tile.nx+1),z=Math.round(tile.minZ/tile.step)+Math.floor(i/(tile.nx+1));
        nodes.set(x+','+z,{sink:Math.max(0,-tile.delta[i]),berm:Math.max(0,tile.delta[i]),compaction:tile.compaction[i],tread:tile.tread[i],churn:tile.churn[i]});
        maximumRenderHeightError=Math.max(maximumRenderHeightError,Math.abs(position.getY(record.offset+i)-tile.base[i]-tile.delta[i]));
      }
    }
    const result={tiles:world.terrain.detailTiles.size,tileCapacity:world.terrain.maxDetailTiles,budgetFull:!!world.terrain.detailBudgetFull,renderTiles:world.detailMeshes.size,maximumRenderHeightError,soilVolumes:{...world.terrain.soilVolumes},maxSink:0,maxBerm:0,maxCompaction:0,maxTread:0,maxChurn:0,areaAtLeast1mm:0,areaAtLeast10mm:0,areaAtLeast30mm:0};
    for(const node of nodes.values()){
      for(const key of ['sink','berm','compaction','tread','churn']){const target='max'+key[0].toUpperCase()+key.slice(1);result[target]=Math.max(result[target],node[key]);}
      for(const[threshold,key]of [[.001,'areaAtLeast1mm'],[.01,'areaAtLeast10mm'],[.03,'areaAtLeast30mm']])if(node.sink>=threshold)result[key]+=world.terrain.detailStep**2;
    }
    return result;
  }

  function writeTemporalReplay(body,camera){
    // Reuse the exact baked scene buffers/material uniforms. Only the mirror
    // clipping matrix changes between captures; camera, light and water time
    // remain fixed, isolating the actual v1.3 temporal defect from wave motion.
    const reflectionSource=renderCases.find(c=>c.name==='native-water-wetland-reflection'),waterSource=renderCases.find(c=>c.name==='native-water-wetland-still');
    const legacy=createLegacyWaterReflectionCamera(T);
    for(const variant of['legacy','fixed']){
      const replayBody={level:body.level,reflectionCamera:new T.PerspectiveCamera(),reflectionMatrix:new T.Matrix4()};
      for(let frame=0;frame<4;frame++){
        const mirrored=variant==='legacy'?legacy(replayBody,camera):world._waterReflectionCamera(replayBody,camera);
        const captureName=`native-temporal-${variant}-reflection-${String(frame).padStart(2,'0')}`,waterName=`native-temporal-${variant}-water-${String(frame).padStart(2,'0')}`;
        const metadata={...reflectionSource.metadata,temporalVariant:variant,frame,stationary:true,waterTime:4,clipRow:[2,6,10,14].map(i=>mirrored.projectionMatrix.elements[i]),notes:'Actual scene replay with a stationary camera and frozen water time. Legacy uses the isolated original shared-normal bug; fixed uses current runtime. Geometry buffers are reused. Linear mirror capture has no display tone mapping.'};
        const reflectedDraws=reflectionSource.draws.map(draw=>({...draw,uniforms:{...draw.uniforms,projectionMatrix:mirrored.projectionMatrix.toArray()}}));
        renderCases.push({...reflectionSource,name:captureName,width:384,height:384,phase:'stationary-temporal-reflection',draws:reflectedDraws,metadata});
        const mainDraws=waterSource.draws.map(draw=>draw.uniforms.tdWaterReflection?{...draw,uniforms:{...draw.uniforms,tdWaterReflection:{...draw.uniforms.tdWaterReflection,textureFile:captureName+'.png'},tdWaterReflectionMatrix:replayBody.reflectionMatrix.toArray()}}:draw);
        renderCases.push({...waterSource,name:waterName,width:640,height:419,phase:'stationary-temporal-water',draws:mainDraws,metadata:{...metadata,reflection:false}});
      }
    }
  }
}
