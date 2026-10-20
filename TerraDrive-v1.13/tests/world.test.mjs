import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { HDRLoader } from '../dist/vendor/HDRLoader.js';
import { Terrain } from '../dist/src/terrain.js';
import { OffroadWorld } from '../dist/src/world.js';
import { VehicleView, mergeStaticMeshes } from '../dist/src/vehicle-view.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { WinchRecovery } from '../dist/src/winch.js';

// Canvas stand-in covers procedural texture authoring only. This does not claim
// GPU rendering or a browser screenshot test.
globalThis.document = {
  createElement() {
    const context = { fillRect() {}, fillText() {}, putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) };
    return { width: 0, height: 0, getContext: () => context };
  },
};

const terrain = new Terrain();
for (const zone of terrain.zones) {
  const sample = terrain.sample(zone.spawn.x, zone.spawn.z);
  assert.ok(Number.isFinite(sample.height));
  assert.ok(Math.abs(Math.hypot(sample.normal.x, sample.normal.y, sample.normal.z) - 1) < 1e-7);
}
for (let i = 0; i < terrain.patches.length; i++) for (let j = i + 1; j < terrain.patches.length; j++) {
  const a = terrain.patches[i], b = terrain.patches[j];
  assert.ok(Math.min(a.maxX, b.maxX) <= Math.max(a.minX, b.minX) || Math.min(a.maxZ, b.maxZ) <= Math.max(a.minZ, b.minZ), 'Terrain patches cannot overlap');
}

const depths = [];
for (const pressure of [14, 37]) {
  terrain.resetDeformation();
  for (let t = 0; t < 120; t++) terrain.deform(48, -115, { load: 4500, slip: .8, pressure, width: .285, dt: 1 / 120 });
  depths.push(terrain.sample(48, -115).sink);
}
assert.ok(depths[0] > 0 && depths[0] < depths[1], 'Lower pressure should reduce sinkage for identical load and slip');
assert.ok(depths[1] < terrain.sample(48, -115).maxSink);
terrain.resetDeformation();
assert.equal(terrain.sample(48, -115).sink, 0);
const dry = terrain.sample(-108, -160).mu; terrain.setWeather('rain');
assert.ok(terrain.sample(-108, -160).mu < dry); terrain.setWeather('dry');

const world = Object.create(OffroadWorld.prototype);
Object.assign(world, { terrain, scene: new THREE.Scene(), groundMeshes: new Map(), spec: VEHICLES[0], clock: 0, _textureLoader: { load(url) { const texture = new THREE.Texture(); texture.userData = { url }; return texture; } } });
terrain.obstacles = [];
world._createTerrain(); world._createMountains(); world._createRoad(); world._createVegetation(); world._createWater(); world._createLandmarks(); world._createParticles();
for (const record of world.groundMeshes.values()) {
  const soil = record.mesh.geometry.attributes.aSoil;
  assert.equal(soil.itemSize, 4, 'Pristine coarse terrain explicitly supplies all four soil channels');
  assert.ok(soil.array.every(value => value === 0), 'Pristine ground cannot inherit an implicit churn channel of one');
}
mergeStaticMeshes(world.scene, object => !!object.userData.staticScenery);
assert.ok(terrain.obstacles.length > 100, 'Visible forest must expose its obstacle geometry to the physics world');
const mud = terrain.patches.find(p => p.id === 'mud');
for (let t = 0; t < 20; t++) terrain.deform(48, -115, { load: 4500, slip: 1.1, pressure: 37, dt: 1 / 120 });
world._syncDeformation();
const mudPosition = world.groundMeshes.get('mud').mesh.geometry.attributes.position;
for (let i = 0; i < mud.base.length; i++) assert.ok(Math.abs(mudPosition.getY(i) - mud.base[i] - mud.delta[i]) < 0.000001, 'Visible rut vertices must equal physical contact heights');
assert.equal(mud.dirty, null);
assert.equal(world.detailMeshes.size, terrain.detailTiles.size);
for (const tile of terrain.detailTiles.values()) {
  const record = world.detailMeshes.get(tile.key), geo = record.chunk.mesh.geometry;
  assert.equal(geo.attributes.aSoil.itemSize, 4);
  for (let i = 0; i < tile.base.length; i++) {
    assert.ok(Math.abs(geo.attributes.position.getY(record.offset + i) - tile.base[i] - tile.delta[i]) < 1e-6, 'Fine rendered rut/berm vertex must equal physical height');
    assert.equal(geo.attributes.aSoil.getX(record.offset + i), tile.compaction[i]);
    assert.equal(geo.attributes.aSoil.getY(record.offset + i), tile.tread[i]);
    assert.equal(geo.attributes.aSoil.getZ(record.offset + i), tile.delta[i], 'Shading retains the physical signed displacement, including negative sink');
    assert.equal(geo.attributes.aSoil.getW(record.offset + i), tile.churn[i], 'Slip disturbance reaches the actual material without a default or proxy');
  }
  const x = tile.minX + 1.731, z = tile.minZ + 2.261;
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0), 0, 150);
  const hits = ray.intersectObject(record.chunk.mesh);
  assert.ok(hits.length > 0 && Math.abs(hits[0].point.y - terrain.heightAt(x, z)) < 1e-6, 'Actual render-triangle ray hit must match the wheel contact sampler');
}
const crossingRay = new THREE.Raycaster(new THREE.Vector3(48.027, 100, -115.019), new THREE.Vector3(0, -1, 0), 0, 150);
assert.equal(crossingRay.intersectObject(world.groundMeshes.get('mud').mesh).length, 0, 'Old coarse triangles must be absent under fine ruts');

for (const patch of terrain.patches) {
  const x = patch.minX + patch.step * 11.31, z = patch.minZ + patch.step * 14.22, stride = patch.nx + 1, a = 14 * stride + 11;
  const ha = patch.base[a] + patch.delta[a], hb = patch.base[a + 1] + patch.delta[a + 1], hc = patch.base[a + stride] + patch.delta[a + stride];
  assert.ok(Math.abs(terrain.sample(x, z).height - (ha + .31 * (hb - ha) + .22 * (hc - ha))) < 0.000001, 'Contact interpolation must match the rendered triangle');
}

// Firm dirt uses base-grid tiles too. Base indices are compressed around the
// biome rectangles, so grid-cell offsets must be explicit rather than inferred.
const baseRecord = world.groundMeshes.get('base'), base = terrain.baseGrid;
assert.equal(baseRecord.cellIndexOffsets.length, base.nx * base.nz);
assert.ok(baseRecord.cellIndexOffsets.some(offset => offset < 0), 'The base index map must retain omitted biome cells');
for (let i = 0; i < 160; i++) terrain.deform(-51, 282, { load: 4500, pressure: 35, slip: .3, width: .30, wheelId: 'world-dirt', dt: 1 / 120 });
world._syncDeformation();
const dirtTile = terrain.getDetailTile(-51, 282); assert.ok(dirtTile && dirtTile.parentId === 'base', 'Firm dirt must allocate a base-parent detail tile');
assert.ok(terrain.sample(-51, 282).sink > 0 && terrain.sample(-51, 282).sink <= .012001);
const dirtRecord = world.detailMeshes.get(dirtTile.key); assert.equal(dirtRecord.chunk.mesh.material, world.terrainMaterials.base);
for (let i = 0; i < dirtTile.base.length; i++) assert.ok(Math.abs(dirtRecord.chunk.mesh.geometry.attributes.position.getY(dirtRecord.offset + i) - dirtTile.base[i] - dirtTile.delta[i]) < 2e-6);
for (let z = 0; z < base.nz; z++) for (let x = 0; x < base.nx; x++) {
  const k = baseRecord.cellIndexOffsets[z * base.nx + x]; if (k < 0) continue;
  const wx = base.minX + (x + .5) * base.step, wz = base.minZ + (z + .5) * base.step, tile = terrain.getDetailTile(wx, wz), current = baseRecord.mesh.geometry.index.array;
  if (tile?.parentId === 'base') for (let j = 1; j < 6; j++) assert.equal(current[k + j], current[k], 'Only the covered base cell should be removed');
  else for (let j = 0; j < 6; j++) assert.equal(current[k + j], baseRecord.fullIndices[k + j], 'Uncovered base cells must retain every original triangle');
}
function renderedHeight(x, z) {
  const meshes = [...world.groundMeshes.values()].map(r => r.mesh).concat(world.detailChunks.map(c => c.mesh));
  const hits = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0), 0, 150).intersectObjects(meshes);
  assert.ok(hits.length > 0, `No visible ground hole at ${x}, ${z}`);
  return hits[0].point.y;
}
assert.ok(Math.abs(renderedHeight(-51.027, 282.019) - terrain.heightAt(-51.027, 282.019)) < 3e-6, 'Actual dirt render triangles equal tire contact');
// A footprint spanning x=8 must allocate the correct base and mud parents.
for (let i = 0; i < 120; i++) terrain.deform(7.98, -115.07, { load: 4500, pressure: 35, slip: .35, width: .3, dt: 1 / 120, wheelId: 'world-biome-edge' });
const asphaltBefore = terrain.heightAt(-100.05, -115);
for (let i = 0; i < 120; i++) terrain.deform(-99.95, -115, { load: 4500, pressure: 35, slip: .35, width: .3, dt: 1 / 120, wheelId: 'world-road-edge' });
world._syncDeformation();
assert.equal(terrain.getDetailTile(7.99, -115.07).parentId, 'base'); assert.equal(terrain.getDetailTile(8.01, -115.07).parentId, 'mud');
for (const x of [7.93, 7.997, 8.003, 8.073]) assert.ok(Math.abs(renderedHeight(x, -115.07) - terrain.heightAt(x, -115.07)) < 3e-6, 'Both sides of a base/biome boundary use visible contact geometry');
assert.ok(Math.abs(terrain.heightAt(7.999999, -115.07) - terrain.heightAt(8.000001, -115.07)) < 2e-5, 'Adjacent base/biome detail tiles are stitched');
assert.ok(Math.abs(terrain.heightAt(-100.05, -115) - asphaltBefore) < 2e-6, 'Dirt impressions cannot excavate the adjacent pavement');
assert.ok(Math.abs(renderedHeight(-100.05, -115) - asphaltBefore) < 3e-6, 'Pavement remains visibly intact beside new dirt marks');

const standard = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
world.waterMaterial.onBeforeCompile(standard);
assert.ok(standard.vertexShader.includes('vWaterWorld=(modelMatrix*vec4(position,1.)).xyz;'));
assert.ok(standard.fragmentShader.includes('normal=normalize(normal+mat3(viewMatrix)*waterRipple)'));
assert.ok(standard.fragmentShader.includes('if(tdWaterDepth<=.003||tdShoreEllipse>=1.)discard;'), 'Water only covers submerged terrain inside its actual biome');
assert.equal(world.waterBodies.length, 2);
world._syncWaterDepth();
for (const body of world.waterBodies) {
  for (const [x, z] of [[19, 29], [Math.floor(body.width / 2), Math.floor(body.height / 2)]]) {
    const i = (z * body.width + x) * 4, decoded = ((body.bytes[i] << 8) | body.bytes[i + 1]) / 65535 * 64 - 8;
    assert.ok(Math.abs(decoded - terrain.heightAt(body.patch.minX + x * body.step, body.patch.minZ + z * body.step)) <= 64 / 65535 / 2 + 1e-8, 'The water bed map samples the actual current contact mesh, including ruts');
  }
}
const waterState = { vehicleId: 'water-test', velocity: { x: 0, z: 2 }, heading: 0, wheels: [{ contact: true, ground: { x: -24, y: terrain.heightAt(-24, 148), z: 148 }, slip: .1 }] };
world.clock = 1; world._updateWater(.016, waterState); assert.ok(world._waterRipples.some(p => p.w > 0), 'Moving immersed wheels generate local water ripples');
const cursor = world._waterRippleCursor; world.clock = 1.5; world._updateWater(.016, { ...waterState, velocity: { x: 0, z: 0 } }); assert.equal(world._waterRippleCursor, cursor, 'Resting tires cannot emit endless wake rings');
const waterCamera = new THREE.PerspectiveCamera(51, 1.6, .12, 900); waterCamera.position.set(-24, 7, 120); waterCamera.lookAt(-24, 3.18, 148);
const mirror = world._waterReflectionCamera(world.waterBodies[0], waterCamera);
assert.ok(Math.abs(mirror.position.y - (2 * world.waterBodies[0].level - waterCamera.position.y)) < 1e-9, 'Reflection camera mirrors the actual water elevation');
const imagePoint = new THREE.Vector4(-24, world.waterBodies[0].level, 148, 1).applyMatrix4(world.waterBodies[0].reflectionMatrix); assert.ok(Math.abs(imagePoint.x / imagePoint.w - .5) < 1e-7, 'Reflected world-center projective lookup is horizontally aligned');
for (const value of mirror.projectionMatrix.elements) assert.ok(Number.isFinite(value), 'Oblique shoreline clipping must remain finite');
let mirrorCalls = 0, activeTarget = null;
const fakeRenderer = { getRenderTarget: () => activeTarget, setRenderTarget: target => { activeTarget = target; }, shadowMap: { autoUpdate: true }, xr: { enabled: false }, state: { buffers: { depth: { setMask() {} } } }, clear() {}, render(scene, camera) { mirrorCalls++; assert.ok(world.waterBodies.every(body => body.mesh.visible === false), 'Reflection pass excludes water to prevent feedback'); assert.ok(camera.position.y < world.waterBodies[0].level, 'Scene reflections use the mirrored viewpoint'); } };
world.camera = waterCamera; world.renderer = fakeRenderer; world.clock = 4; world._renderWaterReflections(); assert.equal(mirrorCalls, 1); assert.equal(activeTarget, null); assert.equal(fakeRenderer.shadowMap.autoUpdate, true); assert.ok(world.waterBodies.every(body => body.mesh.visible));
world._renderWaterReflections(); assert.equal(mirrorCalls, 1, 'Reflection updates are bounded between frames');
world.clock += 1; fakeRenderer.render = () => { throw new Error('test framebuffer failure'); }; assert.doesNotThrow(() => world._renderWaterReflections()); assert.equal(activeTarget, null); assert.ok(world.waterBodies.every(body => body.mesh.visible), 'A failed reflection cannot hide the water or retain its render target'); assert.equal(world.waterBodies[0].reflectionFailed, true); world.waterBodies[0].reflectionFailed = false; world.renderer = undefined;
assert.ok(world.pebbles.count > 400 && world.dryTufts.count > 100 && world.reeds.count > 40, 'Ground detail is distributed through terrain-specific populations');
// Local detail is denser at driving distance, bounded in shared instance batches,
// stable in world coordinates, and tied to the existing physical soil surface.
world._updateGroundProximity({ x: -51, z: 282 }, true);
const near = world.groundProximity, nearMatrix = new THREE.Matrix4();
assert.ok(near.records.filter(p => Math.hypot(p.x + 51, p.z - 282) < 12).length > 100, 'The nearby verge must contain visibly dense grass, rather than distant isolated clumps');
assert.ok(near.grass.count + near.sedge.count + near.dry.count <= near.maxGrass && near.gravel.count <= near.maxGravel);
const beforeWalk = Array.from(near.grass.instanceMatrix.array.slice(0, near.grass.count * 16));
world._updateGroundProximity({ x: 122, z: 122 }, true); const rockGrit = near.gravel.count;
assert.ok(near.importedRocks.count > 0 && near.importedRocks.count <= 24, 'A bounded population uses the imported textured rock model on rocky ground');
const importedPosition = near.importedRocks.geometry.attributes.position, importedVertex = new THREE.Vector3();
for (const record of near.rockRecords) {
  near.importedRocks.getMatrixAt(record.index, nearMatrix);
  let highest = -Infinity;
  for (let i = 0; i < importedPosition.count; i++) {
    importedVertex.fromBufferAttribute(importedPosition, i).applyMatrix4(nearMatrix);
    highest = Math.max(highest, importedVertex.y - terrain.heightAt(importedVertex.x, importedVertex.z));
  }
  assert.ok(highest > 0 && highest <= .044001, 'Imported micro-stones are buried into the actual ground, with less than 4.4 cm of exposed relief');
}
assert.equal(near.importedRocks.geometry.index.count / 3, 600);
for (const map of ['map', 'normalMap', 'roughnessMap']) { assert.equal(near.importedRocks.material[map].flipY, false, 'Source glTF UV convention must be preserved'); assert.match(near.importedRocks.material[map].userData.source, /_1k\.jpg$/); }
world._updateGroundProximity({ x: 195, z: -140 }, true); assert.ok(near.gravel.count < rockGrit / 3, 'The dunes have sparse grit while rock terrain retains a dense scree population');
assert.ok(near.dry.count > 0 && near.sedge.count === 0, 'Dunes use curled dry stems rather than marsh sedges');
world._updateGroundProximity({ x: 6, z: 160 }, true);
assert.ok(near.sedge.count > 0 && near.records.some(p => p.population === 'sedge' && p.surface === 'wetland'), 'Marsh banks use a separate slender sedge mesh');
world._updateGroundProximity({ x: -51, z: 282 }, true);
assert.deepEqual(Array.from(near.grass.instanceMatrix.array.slice(0, near.grass.count * 16)), beforeWalk, 'Leaving and returning cannot rearrange local vegetation');
const stem = near.records.find(p => p.fade === 1 && Math.hypot(p.x + 51, p.z - 282) < 5);
assert.ok(stem);
for (let i = 0; i < 90; i++) terrain.deform(stem.x, stem.z, { load: 6000, pressure: 35, contactWidth: .285, contactLength: .28, slip: .4, dt: 1 / 120 });
world._updateGroundProximity({ x: -51, z: 282 }, true);
const flattened = near.records.find(p => p.x === stem.x && p.z === stem.z); near.grass.getMatrixAt(flattened.index, nearMatrix);
assert.ok(flattened.height < stem.height * .55, 'Existing tire compaction visibly flattens local stems');
assert.ok(Math.abs(nearMatrix.elements[13] + .012 - terrain.heightAt(stem.x, stem.z)) < 1e-6, 'Grass roots follow the actual deformed contact surface');
world._syncDeformation();
world._updateGroundProximity({ x: terrain.trailX(-82), z: -82 }, true);
assert.ok(near.gravel.count > 100, 'The worn trail has actual near-field loose grit');
assert.ok(near.records.every(p => p.surface !== 'asphalt' && (Math.abs(p.z) >= 260 || p.surface !== 'dirt' || Math.abs(p.x - terrain.trailX(p.z)) > 3.7)), 'The road and hardpack driving ribbon remain visibly open');
world.quality = 'low'; world._updateGroundProximity({ x: 0, z: 0 }); assert.equal(near.grass.visible, false); assert.equal(near.gravel.visible, false); world.quality = 'high';
for (const rock of terrain.rocks.filter(r => r.slab).slice(0, 8)) { const x = rock.x + .137, z = rock.z + .227; assert.ok(Math.abs(renderedHeight(x, z) - terrain.heightAt(x, z)) < 3e-6, 'Rock shelf render triangles remain exactly driveable contact surfaces'); }
for (const rock of terrain.rockOutcrops) { const x = rock.x + .173, z = rock.z + .127; assert.ok(Math.abs(renderedHeight(x, z) - terrain.heightAt(x, z)) < 3e-6, 'Large outcrop roofs use the same rendered and physical heightfield'); }
// The contact-aware wake replaced the independent point-dust emitter. Assemble
// its actual lit instanced material and retain the include-resolution gate.
const point = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
world.particles.material.onBeforeCompile(point);
assert.equal(world.particles, world.tireSpray.fine, 'The scene uses the same contact-aware fine wake, with no independent dust emitter');
assert.equal(world.particles.geometry.attributes.aPuffAlpha.count, world.tireSpray.simulation.capacity + world.tireSpray.simulation.fines.length, 'Fine opacity storage is bounded by the live particle pools');
assert.equal(world.particles.material.transparent, true);
assert.equal(world.particles.material.depthWrite, false, 'Transparent wake edges cannot write opaque depth');
function resolveIncludes(shader) {
  return shader.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_match, name) => {
    assert.ok(THREE.ShaderChunk[name], `Shader include ${name} must exist in the vendored Three.js version`);
    return resolveIncludes(THREE.ShaderChunk[name]);
  });
}
[standard.vertexShader, standard.fragmentShader, point.vertexShader, point.fragmentShader].forEach(resolveIncludes);

// PBR assets are real local bytes with verified source hashes. These checks do
// not substitute for visual QA, but catch missing/corrupted deployment files.
const manifest = JSON.parse(readFileSync(new URL('../dist/assets/terrain/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.license, 'CC0-1.0');
assert.equal(manifest.assets.length, 51);
for (const asset of manifest.assets) {
  const url = new URL('../dist/assets/terrain/' + asset.filename, import.meta.url), bytes = readFileSync(url);
  assert.equal(statSync(url).size, asset.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.filename} asset checksum`);
  assert.equal(asset.license, 'CC0-1.0');
}
const hdrBytes = readFileSync(new URL('../dist/assets/terrain/syferfontein_18d_clear_1k.hdr', import.meta.url));
const hdr = new HDRLoader().parse(hdrBytes.buffer.slice(hdrBytes.byteOffset, hdrBytes.byteOffset + hdrBytes.byteLength));
assert.equal(hdr.width, 1024); assert.equal(hdr.height, 512);
for (const value of hdr.data) assert.ok(Number.isFinite(THREE.DataUtils.fromHalfFloat(value)), 'HDR radiance must decode to finite values');
assert.equal(world._textures.size, 29, 'Terrain and foliage texture files should be cached and reused, including the three 1K imported-rock maps');
assert.equal(world.terrainMaterials.mud.map, world.terrainMaterials.wetland.map, 'Mud and marsh must reuse one high-resolution albedo allocation');
assert.match(world.terrainMaterials.mud.map.userData.source, /_diff_2k\.jpg$/);
assert.equal(world.terrainMaterials.rock.map.userData.source, 'mossy_rock_diff_1k.jpg');
for (const [kind, material] of Object.entries(world.terrainMaterials)) {
  assert.ok(material.map && material.normalMap && material.roughnessMap, `${kind} needs complete PBR maps`);
  assert.equal(material.map.colorSpace, THREE.SRGBColorSpace, 'Albedo must be decoded from sRGB');
  assert.equal(material.normalMap.colorSpace, THREE.NoColorSpace, 'Normal maps are linear data');
  const library = material.isMeshPhysicalMaterial ? THREE.ShaderLib.physical : THREE.ShaderLib.standard;
  const shader = { uniforms: {}, vertexShader: library.vertexShader, fragmentShader: library.fragmentShader };
  material.onBeforeCompile(shader);
  // This exact illegal identifier blanked every ground mesh in v1.2. These
  // declarations are invalid under r180's generated #version 300 es shader.
  const codeWithoutComments = shader.fragmentShader.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.doesNotMatch(codeWithoutComments, /\b(?:float|int|uint|bool|[biu]?vec[234]|mat[234])\s+(?:patch|sample|common|partition|active|input|output|filter|resource|atomic_uint)\b/, 'GLSL ES reserved words cannot be custom variable names');
  assert.ok(shader.fragmentShader.includes('tdWeights(vGroundXZ)'), 'Surface blending must use world position, not patch texture coordinates');
  assert.ok(shader.fragmentShader.includes('roughnessFactor=clamp'), 'Wetness needs to affect physical surface roughness');
  assert.ok(shader.fragmentShader.includes('normal=normalize(mix(tdPhotoNormal,tdSurfaceNormal'), 'Photographic normal maps must reach lighting');
  assert.equal(shader.uniforms.tdSoilNormal.value.colorSpace, THREE.NoColorSpace);
  assert.equal(shader.uniforms.tdGravelColor.value.userData.source, 'gravel_floor_02_diff_1k.jpg');
  assert.equal(shader.uniforms.tdWet.value, terrain.moisture);
  [shader.vertexShader, shader.fragmentShader].forEach(resolveIncludes);
}
Object.assign(world, { sky: { material: { uniforms: { wet: { value: 0 } } } }, sun: new THREE.DirectionalLight(), hemisphere: new THREE.HemisphereLight(), timeOfDay: 'day' });
world.scene.fog = new THREE.FogExp2('#bccbd0', .00132);
world.setWeather('rain');
for (const shader of world._terrainShaders) assert.equal(shader.uniforms.tdWet.value, 1, 'Every photographic surface must respond to rain');
world.setWeather('dry');
for (const shader of world._terrainShaders) assert.equal(shader.uniforms.tdWet.value, 0, 'Dry weather must restore every surface roughness response');
assert.equal(world.groundMeshes.size, terrain.patches.length + 1, 'Every base/biome contact mesh, including snow, has its matching PBR surface');
assert.ok(world.foliage.material.alphaMap && world.foliage.material.alphaTest > 0, 'Tree needles should use the real twig cutout rather than solid triangles');
const twigUVs = world.foliage.geometry.attributes.uv.array;
for (let i = 0; i < twigUVs.length; i += 2) { assert.ok(twigUVs[i] >= 0 && twigUVs[i] <= .245); assert.ok(twigUVs[i + 1] >= .556 && twigUVs[i + 1] <= 1); }
const grassShader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
world.grass.material.onBeforeCompile(grassShader); resolveIncludes(grassShader.vertexShader);
for (const plant of [near.grass, near.sedge, near.dry, world.reeds, world.seedheads]) {
  assert.ok(plant.geometry.attributes.aPlantBend && plant.customDepthMaterial, 'Flexible leaves and seed heads require matching visible/shadow wind data');
  const visible = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  const depth = { uniforms: {}, vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader };
  plant.material.onBeforeCompile(visible); plant.customDepthMaterial.onBeforeCompile(depth);
  assert.equal(visible.uniforms.tdWindStrength.value, depth.uniforms.tdWindStrength.value, 'Shadow and visible foliage must bend by the same world distance');
  [visible.vertexShader, depth.vertexShader].forEach(resolveIncludes);
}
function assertAttachedTreeBranches(record) {
  const crown = new THREE.Matrix4(), branch = new THREE.Matrix4();
  const meshes = world._treeMeshes(record);
  meshes.foliage.getMatrixAt(meshes.index, crown); meshes.branches.getMatrixAt(meshes.index, branch);
  assert.deepEqual(branch.elements, crown.elements, 'Modeled woody branches must follow their needle crown throughout tree movement');
}
for (const record of world.treeRecords) {
  assertAttachedTreeBranches(record);
  const trunkRoot = new THREE.Vector3(0, -.5, 0).applyMatrix4(record.trunkMatrix);
  assert.ok(trunkRoot.distanceTo(new THREE.Vector3(record.x, record.y, record.z)) < 1e-8, 'Leaning trunks must be planted at the same root as the crown and winch anchor');
}

// Scenery consumes unique events, flexes on a gentle bump, and updates solid
// shapes when a sign bends or a tree breaks. Ordinary frames retain the scars.
const ids = terrain.obstacles.map(o => o.id);
assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every(id => typeof id === 'string' && id.length));
const mudAnchors = world.getWinchAnchors().filter(tree => Math.hypot(tree.x - 48, tree.z + 163) < 23);
assert.ok(mudAnchors.length >= 2, 'Mud approach exposes at least two reachable mature tree anchors');
const mudPhysics = new VehiclePhysics(terrain, VEHICLES.find(vehicle => vehicle.id === 'wrangler-rubicon')); mudPhysics.reset(terrain.zones.find(zone => zone.id === 'mud').spawn);
for (let i = 0; i < 180; i++) mudPhysics.step(1 / 120, {});
const actualWinch = new WinchRecovery(mudPhysics, terrain, () => world.treeRecords); assert.equal(actualWinch.setEquipped(true).ok, true);
const actualCandidates = actualWinch.candidates().filter(candidate => candidate.available && mudAnchors.some(tree => tree.id === candidate.id));
assert.ok(actualCandidates.length >= 2, 'Both mud anchors pass the real winch forward-cone, terrain-clearance and usable-cable checks after actual vehicle settling');
for (const candidate of actualCandidates) { const attached = actualWinch.attach(candidate.id); assert.equal(attached.ok, true, attached.message); actualWinch.detach(); }
const pullingTree = world.damageRecords.get(mudAnchors[0].id), pullBefore = new THREE.Matrix4(); world.trunks.getMatrixAt(pullingTree.index, pullBefore);
assert.equal(world.setWinchLoad(pullingTree.id, { x: 18000, y: 0, z: -5000 }), true); world._updateObjectDamage(.15, { impacts: [] });
const pullAfter = new THREE.Matrix4(); world.trunks.getMatrixAt(pullingTree.index, pullAfter); assert.notDeepEqual(pullAfter.elements, pullBefore.elements, 'Loaded tree flexes elastically during a winch pull');
assertAttachedTreeBranches(pullingTree);
world.setWinchLoad(null); for (let i = 0; i < 140; i++) world._updateObjectDamage(.05, { impacts: [] }); assert.equal(pullingTree.winchForce.lengthSq(), 0); assert.ok(pullingTree.winchBend.length() < .00002, 'Released tree returns from its winch bend');
const tree = world.treeRecords[0], trunkBefore = new THREE.Matrix4(); world.trunks.getMatrixAt(tree.index, trunkBefore);
const gentle = { id: 'test-gentle', obstacleId: tree.id, obstacleType: 'tree', speed: .4, energy: 45, point: { x: tree.x, y: tree.y + .8, z: tree.z - .25 }, normal: { x: 0, y: 0, z: -1 }, strength: .001 };
world._updateObjectDamage(.08, { impacts: [gentle] });
const trunkSway = new THREE.Matrix4(); world.trunks.getMatrixAt(tree.index, trunkSway);
assert.notDeepEqual(trunkSway.elements, trunkBefore.elements, 'A low-speed bump must visibly shake the tree without car damage'); assert.equal(tree.damage, 0); assert.ok(tree.push.z > 0, 'Tree initial deflection follows the incoming vehicle push');
const age = tree.shakeAge; world._updateObjectDamage(.08, { impacts: [gentle] }); assert.ok(tree.shakeAge > age, 'The same history event must not reset sway each frame');
world._updateObjectDamage(.02, { impacts: [{ ...gentle, id: 'test-bark-scar', speed: 1.8, energy: 100 }] });
const barkSlot = [...tree.scars][0], barkMark = new THREE.Matrix4(); world.damageMarks.getMatrixAt(barkSlot, barkMark);
const markPoint = new THREE.Vector3().setFromMatrixPosition(barkMark), markNormal = new THREE.Vector3(0, 0, 1).transformDirection(barkMark);
const barkRay = new THREE.Raycaster(markPoint, markNormal.negate(), 0, .15), barkHits = barkRay.intersectObject(world.trunks);
assert.ok(barkHits.length > 0 && barkHits[0].distance > .004, 'Bark scar must sit in front of the actual tapered trunk surface');
const hard = { ...gentle, id: 'test-break', speed: 18, energy: 180000, strength: .9 };
const obstacleCount = terrain.obstacles.length, revision = terrain.obstacleRevision;
world._updateObjectDamage(.08, { impacts: [gentle, hard] });
assert.equal(tree.broken, true); assert.equal(tree.obstacle.height, .65); assert.equal(world.stumps.count, 1); assert.ok(terrain.obstacleRevision > revision); assert.equal(terrain.obstacles.length, obstacleCount + 1);
assertAttachedTreeBranches(tree);
assert.ok(!world.getWinchAnchors().some(anchor => anchor.id === tree.id)); assert.equal(world.setWinchLoad(tree.id, { x: 10000, z: 0 }), false, 'A broken tree immediately ceases to be a valid anchor');
const log = terrain.obstacles.find(o => o.id === tree.id + '-fallen-log'); assert.equal(log.shape, 'box');
const fallenMatrix = new THREE.Matrix4(); world.trunks.getMatrixAt(tree.index, fallenMatrix);
for (const [axis, index] of [['x', 12], ['y', 13], ['z', 14]]) assert.ok(Math.abs(fallenMatrix.elements[index] - log.center[axis]) < 1e-5, 'Fallen visual trunk and collider share their center');
const sign = world.signRecords[0];
world._updateObjectDamage(.05, { impacts: [{ ...gentle, id: 'test-sign', obstacleId: sign.obstacles[0].obstacle.id, obstacleType: 'sign', point: { x: sign.x, y: sign.y + 1.9, z: sign.z - .1 }, speed: 5, energy: 3900 }] });
assert.ok(sign.damage > .5 && Math.abs(sign.group.quaternion.x) > .1);
assert.ok(Math.abs(sign.obstacles[0].obstacle.quaternion.x) > .1, 'Bent sign physics must rotate with its permanent visible bend');
const signMark = new THREE.Matrix4(); world.damageMarks.getMatrixAt([...sign.scars][0], signMark);
const signMarkLocal = new THREE.Vector3().setFromMatrixPosition(signMark).sub(sign.group.position).applyQuaternion(sign.group.quaternion.clone().invert());
assert.ok(signMarkLocal.z < -.095, 'Front sign scar must be outside the visible plane at z=-.09, not behind it');
assert.ok(world.damageMarks.count > 0); const marks = world.damageMarks.count; world._updateObjectDamage(.1, { impacts: [] }); assert.equal(world.damageMarks.count, marks, 'Scars persist after the event leaves the state snapshot');
const originalIndices = world.groundMeshes.get('mud').fullIndices;
terrain.resetDeformation(); world.resetDamage(); world._syncDeformation();
assert.equal(world.detailMeshes.size, 0); assert.equal(world.detailChunks.length, 0); assert.equal(world.damageMarks.count, 0); assert.equal(world.stumps.count, 0); assert.equal(tree.broken, false); assert.equal(tree.obstacle.height, tree.originalObstacle.height); assert.equal(terrain.obstacles.length, obstacleCount);
assertAttachedTreeBranches(tree);
assert.deepEqual(world.groundMeshes.get('mud').mesh.geometry.index.array, originalIndices, 'Reset restores the covered coarse ground');
world._updateObjectDamage(.08, { impacts: [hard] }); assert.equal(tree.broken, false, 'Reset must not replay an old physics event');

// The camera uses +Z forward/+Y up: screen-right is local -X.
for (const [key, sign] of [['KeyL', -1], ['KeyJ', 1]]) {
  const cameraWorld = Object.create(OffroadWorld.prototype);
  Object.assign(cameraWorld, { spec: VEHICLES[0], terrain, cameraMode: 'free', freeYaw: 0, freePitch: 0, camera: new THREE.PerspectiveCamera(51, 1.6, .12, 1900), _forward: new THREE.Vector3(), _look: new THREE.Vector3(), _freeKeys: new Set([key]) });
  cameraWorld.camera.position.set(0, 12, 0);
  cameraWorld._updateCamera(.1, { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }, {});
  assert.ok(cameraWorld.camera.position.x * sign > 0, `${key} should move toward the matching screen side`);
}

const modelResults = [];
for (const spec of VEHICLES) {
  const scene = new THREE.Scene(), view = new VehicleView(scene, spec);
  let meshes = 0, triangles = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    triangles += (geometry.index?.count || geometry.attributes.position.count) / 3 * (object.count || 1);
    for (const n of geometry.attributes.position.array) assert.ok(Number.isFinite(n));
  });
  assert.ok(meshes < 100, 'Static body and wheel meshes should be batched');
  const cameraWorld = Object.create(OffroadWorld.prototype);
  Object.assign(cameraWorld, { spec, terrain, cameraMode: 'hood', camera: new THREE.PerspectiveCamera(51, 1.6, .12, 1900), _forward: new THREE.Vector3(), _look: new THREE.Vector3() });
  cameraWorld._updateCamera(1 / 60, { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }, {});
  assert.ok(cameraWorld.camera.position.x > 0, 'Left-hand-drive hood view belongs on local +X');
  scene.updateMatrixWorld(true);
  const direction = cameraWorld.camera.getWorldDirection(new THREE.Vector3());
  const hits = new THREE.Raycaster(cameraWorld.camera.position, direction, .12, 8).intersectObjects(scene.children, true);
  assert.equal(hits.length, 0, `${spec.name} hood camera centerline must clear bodywork`);
  modelResults.push({ id: spec.id, meshes, triangles: Math.round(triangles) });
  view.dispose(); assert.equal(scene.children.length, 0);
}
let sceneryMeshes = 0, sceneryTriangles = 0;
world.scene.traverse(object => { if (object.isMesh) { sceneryMeshes++; sceneryTriangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3 * (object.count || 1); for (const attr of Object.values(object.geometry.attributes)) for (const value of attr.array) assert.ok(Number.isFinite(value), 'All environment geometry attributes must remain finite'); } });
const newSceneryBatches = [...Object.values(world.birch), ...world.understory, world.tireSpray.sand, world.tireSpray.fine];
assert.equal(newSceneryBatches.length, 8, 'New species, understory and wake phases use a fixed number of batches');
assert.ok(newSceneryBatches.every(mesh => mesh.isInstancedMesh && mesh.parent), 'Diversity must use instanced batches rather than a mesh per plant or parcel');
assert.ok(sceneryMeshes - newSceneryBatches.length < 80, 'The pre-existing scenery keeps its original batching budget; the eight new batches are bounded separately');

// Shader failure handling is a real callback contract, exercised here with GL
// log/source stand-ins. Native EGL compilation is validated separately.
world.renderer = { debug: {} }; world._setupRenderingDiagnostics();
terrain.deform(-51, 282, { load: 4500, pressure: 35, slip: .3, dt: 1 / 120 }); world._syncDeformation();
const detailBeforeFallback = [...world.detailMeshes.values()].map(record => ({ mesh: record.chunk.mesh, geometry: record.chunk.mesh.geometry, material: record.chunk.mesh.material }));
const mapsBeforeFallback = new Map(Object.values(world.terrainMaterials).map(material => [material, [material.map, material.normalMap, material.roughnessMap]]));
let terrainFailure = true;
const gl = { getShaderSource: () => terrainFailure ? 'vec3 tdWeights(vec2 p) { return vec3(1.); }' : '#define SHADER_NAME OtherMaterial\nvoid main() {}', getProgramInfoLog: () => 'Mock shader link failed', getShaderInfoLog: () => 'Mock driver compile diagnostic' };
const groundKeyBefore = world.groundMaterial.customProgramCacheKey();
assert.doesNotThrow(() => world.renderer.debug.onShaderError(gl, {}, {}, {}));
assert.equal(world.renderingIssues[0].kind, 'shader'); assert.equal(world.renderingIssues[0].material, 'Terrain'); assert.equal(world._pendingTerrainFallback, true); assert.equal(world.terrainFallbackActive, false); assert.equal(world.groundMaterial.customProgramCacheKey(), groundKeyBefore, 'A compile callback cannot mutate the active material');
world._applyRenderingFallbacks(); assert.equal(world.terrainFallbackActive, true); assert.equal(world._pendingTerrainFallback, false);
for (const [material, maps] of mapsBeforeFallback) {
  assert.deepEqual([material.map, material.normalMap, material.roughnessMap], maps, 'Stock fallback retains local PBR textures');
  if (material.isMeshPhysicalMaterial) assert.equal(material.clearcoat, 0, 'Fallback cannot spread the custom wet-film coat across a whole rectangular terrain patch');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; material.onBeforeCompile(shader); assert.equal(shader.fragmentShader, THREE.ShaderLib.standard.fragmentShader, 'Fallback must use the stock compatible fragment shader');
}
for (const record of world.groundMeshes.values()) assert.equal(record.mesh.material, world.terrainMaterials[record.mesh.name.slice('ground-'.length)], 'Fallback updates coarse material references in place');
for (const { mesh, geometry, material } of detailBeforeFallback) { assert.equal(mesh.material, material); assert.equal(mesh.geometry, geometry, 'Fallback retains visible fine rut geometry'); assert.equal(material.customProgramCacheKey(), 'terra-stock-ground-fallback-v1'); }
terrainFailure = false; for (let i = 0; i < 12; i++) { gl.getProgramInfoLog = () => 'Independent failure ' + i; world.renderer.debug.onShaderError(gl, {}, {}, {}); }
assert.equal(world.renderingIssues.length, 6, 'Rendering issue storage is bounded'); assert.equal(world._pendingTerrainFallback, false, 'Non-terrain shader failures do not repeatedly trigger terrain fallback');
gl.getShaderSource = () => 'vec3 tdWaterWaves(vec2 p) { return vec3(0.); }'; world.renderer.debug.onShaderError(gl, {}, {}, {}); assert.equal(world._pendingWaterFallback, true); world._applyRenderingFallbacks(); assert.equal(world.waterFallbackActive, true);
for (const body of world.waterBodies) { const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }; body.material.onBeforeCompile(shader); assert.equal(shader.fragmentShader, THREE.ShaderLib.physical.fragmentShader, 'Water driver failure keeps a stock PBR surface without invalid custom GLSL'); }
console.log(JSON.stringify({ result: 'pass', contactAndRutChecks: 'pass', hoodCameraCenterlines: 'clear', cameraDirectionChecks: 'pass', shaderIncludes: 'resolved', localPBRAssets: manifest.assets.length, sceneryMeshes, sceneryTriangles: Math.round(sceneryTriangles), obstacleCount: terrain.obstacles.length, models: modelResults, limitation: 'Structural checks only; no GPU/browser rendering is claimed.' }, null, 2));
