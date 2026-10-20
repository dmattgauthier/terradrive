import * as THREE from '../vendor/three.module.js';
import { HDRLoader } from '../vendor/HDRLoader.js';
import { VehicleView, mergeStaticMeshes } from './vehicle-view.js?v=1.15.0';
import { terrainHash as hash, terrainNoise as noise, ROAD, SURFACE_REGIONS } from './terrain.js?v=1.15.0';
import { createTerrainMaterial, createRidgeMaterial, TERRAIN_TEXTURE_RESOLUTION } from './terrain-shading.js?v=1.15.0';
import { createPineFoliageGeometry, createPineBranchGeometry, createPineTrunkGeometry, createBrokenStumpGeometry, createMeadowGrassGeometry, createMarshSedgeGeometry, createDryTussockGeometry, createScreeGeometry, REED_SEEDHEAD_ANCHOR } from './environment-models.js?v=1.15.0';
import { createNeedleMaterial, createPlantMaterial, createLeafMaterial, plantShadowMaterial } from './vegetation-shading.js?v=1.15.0';
import { createMountainGeometry } from './landscape-models.js?v=1.15.0';
import { createImportedGroundRockGeometry, IMPORTED_GROUND_ROCK } from './imported-ground-rock.js?v=1.15.0';
import { outdoorPreset, outdoorSunOffset, outdoorEnvironmentYaw, prepareOutdoorRadiance } from './outdoor-lighting.js?v=1.15.0';
import { createChallengeCourse, challengeReservedAt } from './challenge-course.js?v=1.15.0';
import { createChallengeView } from './challenge-view.js?v=1.15.0';
import { TireSprayView } from './tire-spray-view.js?v=1.15.0';
import { GroundCoverContact } from './ground-cover-contact.js?v=1.15.0';
import { createTreeFall, syncTreeObstacle } from './tree-dynamics.js?v=1.15.0';
import { woodlandCover } from './terrain-diversity.js?v=1.15.0';
import { createBroadleafTree, createFernGeometry, createShrubGeometry, createBirchBarkMaterial } from './biome-scenery.js?v=1.15.0';
import { coatBorealScenery } from './snow-view.js?v=1.15.0';

const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Object3D();
export const WORLD_VISIBILITY = Object.freeze({ farClip: 2800, dryFog: .00072, wetFog: .00175, detailHigh: 54, detailMedium: 44 });

function queueAttributeRange(attribute, start, count) {
  // Three drains these ranges only after a real upload. Culled meshes can
  // collect several CPU edits first; retain that pending union, bounded even
  // when a long-unseen region accumulates many disjoint contact updates.
  const ranges = attribute.updateRanges;
  let end = start + count;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    if (range.start <= end && range.start + range.count >= start) {
      start = Math.min(start, range.start); end = Math.max(end, range.start + range.count); ranges.splice(i, 1);
    }
  }
  if (ranges.length >= 63) {
    for (const range of ranges) { start = Math.min(start, range.start); end = Math.max(end, range.start + range.count); }
    attribute.clearUpdateRanges();
  }
  attribute.addUpdateRange(start, end - start);
}

function meshBox(parent, material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.staticScenery = true; parent.add(mesh); return mesh;
}

export class OffroadWorld {
  constructor(canvas, terrain) {
    this.canvas = canvas; this.terrain = terrain;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#bccbd0'); this.scene.fog = new THREE.FogExp2('#bccbd0', WORLD_VISIBILITY.dryFog);
    this.camera = new THREE.PerspectiveCamera(51, 1, 0.12, WORLD_VISIBILITY.farClip); this.camera.position.set(8, 10, -59);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65)); this.renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.02;
    this._setupRenderingDiagnostics();
    this.clock = 0; this.cameraMode = 'chase'; this.orbitYaw = -0.28; this.orbitPitch = 0.38; this.cameraDistance = 9.5; this.weather = 'dry'; this.timeOfDay = 'day'; this.quality = 'high';
    this._look = new THREE.Vector3(); this._desired = new THREE.Vector3(); this._forward = new THREE.Vector3(); this._cameraLook = new THREE.Vector3(0, 4.5, -42); this._freeKeys = new Set();
    this.groundMeshes = new Map(); this.terrain.obstacles = []; this._textureLoader = new THREE.TextureLoader(); this._textures = new Map(); this._terrainShaders = []; this.damageRecords = new Map(); this.seenImpacts = new Set();
    this._createSky(); this._createLighting(); this._createTerrain(); this._createMountains(); this._createRoad(); this._createChallenge(); this._createVegetation(); this._createWater(); this._createLandmarks(); mergeStaticMeshes(this.scene, object => !!object.userData.staticScenery); this._createParticles(); this._bindCamera();
    this.resize();
  }

  _setupRenderingDiagnostics() {
    this.renderingIssues = []; this.terrainFallbackActive = false; this._pendingTerrainFallback = false;
    this.renderer.debug ||= {}; this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      // Three calls this while linking. Record the failure now, and change
      // material programs only at the start of the following update.
      try {
        const fragment = gl.getShaderSource(fragmentShader) || '', terrainProgram = fragment.includes('tdWeights('), waterProgram = fragment.includes('tdWaterWaves(');
        const material = terrainProgram ? 'Terrain' : waterProgram ? 'Water' : (fragment.match(/#define\s+SHADER_NAME\s+([^\n]+)/)?.[1]?.trim() || 'Scene material').slice(0, 120);
        const logs = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(fragmentShader), gl.getShaderInfoLog(vertexShader)].filter(Boolean).join('\n');
        const message = (logs || 'The graphics driver could not compile this material.').slice(0, 4000);
        if (!this.renderingIssues.some(issue => issue.material === material && issue.message === message)) { this.renderingIssues.push({ kind: 'shader', material, message }); if (this.renderingIssues.length > 6) this.renderingIssues.shift(); }
        if (terrainProgram && !this.terrainFallbackActive) this._pendingTerrainFallback = true;
        if (waterProgram && !this.waterFallbackActive) this._pendingWaterFallback = true;
      } catch {
        if (this.renderingIssues.length < 6) this.renderingIssues.push({ kind: 'shader', material: 'Scene material', message: 'The graphics driver reported a shader compilation failure.' });
      }
    };
  }

  _applyRenderingFallbacks() {
    if (this._pendingWaterFallback && !this.waterFallbackActive && this.waterBodies) {
      this._pendingWaterFallback = false; this.waterFallbackActive = true;
      for (const body of this.waterBodies) { body.material.onBeforeCompile = () => {}; body.material.customProgramCacheKey = () => 'terra-stock-water-fallback-v1'; body.material.opacity = .42; body.material.needsUpdate = true; body.shaders = []; }
    }
    if (!this._pendingTerrainFallback || this.terrainFallbackActive || !this.terrainMaterials) return;
    this._pendingTerrainFallback = false; this.terrainFallbackActive = true;
    for (const material of [...Object.values(this.terrainMaterials), this.ridgeMaterial].filter(Boolean)) {
      // Stock Three.js PBR retains local color/normal/roughness textures and
      // every coarse/fine mesh reference. Real rut geometry remains intact.
      material.onBeforeCompile = () => {}; material.customProgramCacheKey = () => 'terra-stock-ground-fallback-v1'; if (material.isMeshPhysicalMaterial) material.clearcoat = 0; material.needsUpdate = true;
    }
    this._terrainShaders = [];
  }

  _createSkyMesh() {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1700, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { upper: { value: new THREE.Color('#619aca') }, horizon: { value: new THREE.Color('#d5e2e7') }, wet: { value: 0 }, sunDirection: { value: outdoorSunOffset(this.timeOfDay).normalize() } },
      // The atmosphere is infinitely distant. Removing view translation and
      // writing far depth prevents a clipped sky band at the map corners, and
      // uses the correct camera rotation in both normal and mirror passes.
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position.z=gl_Position.w;}',
      fragmentShader: `varying vec3 vPosition; uniform vec3 upper; uniform vec3 horizon; uniform float wet; uniform vec3 sunDirection;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.)),f.x),f.y);}
        void main(){vec3 d=normalize(vPosition);float elev=max(d.y,0.);vec3 c=mix(horizon,upper,pow(elev,.52));
          vec2 uv=d.xz/(max(.12,d.y)+.24)*2.7;float f=n(uv)*.54+n(uv*2.1)*.26+n(uv*4.4)*.13+n(uv*8.7)*.07;
          float cloud=smoothstep(.51,.70,f)*smoothstep(.01,.24,elev);c=mix(c,vec3(.88,.89,.87),cloud*.68);
          float sun=max(0.,dot(d,sunDirection));c+=vec3(1.,.87,.67)*(pow(sun,16.)*.10+pow(sun,512.)*.45+pow(sun,16000.)*4.)*(1.-wet*.9);
          c=mix(c,mix(vec3(.46,.53,.52),vec3(.69,.72,.66),1.-elev),wet*.65);gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })); this.sky.frustumCulled = false; this.scene.add(this.sky); this.sky.name = 'procedural-atmosphere';
  }

  _createSky() {
    this._createSkyMesh();
    // A small procedural lighting environment supplies believable paint/glass reflections.
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256; const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256); gradient.addColorStop(0, '#779da5'); gradient.addColorStop(0.43, '#e3e7d9'); gradient.addColorStop(0.50, '#a6aa90'); gradient.addColorStop(0.57, '#64674e'); gradient.addColorStop(1, '#42422f'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 256);
    const sun = outdoorSunOffset(this.timeOfDay).normalize(), glowX = (Math.atan2(sun.z, sun.x) / (2 * Math.PI) + .5) * canvas.width, glowY = (.5 - Math.asin(sun.y) / Math.PI) * canvas.height;
    const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, 36); glow.addColorStop(0, '#fffce8'); glow.addColorStop(.3, '#fffce8'); glow.addColorStop(1, 'rgba(255,255,238,0)'); ctx.fillStyle = glow; ctx.fillRect(glowX - 40, glowY - 40, 80, 80);
    const map = new THREE.CanvasTexture(canvas); map.mapping = THREE.EquirectangularReflectionMapping; map.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer); this.environment = pmrem.fromEquirectangular(map); this._startupEnvironment = this.environment; this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .75; pmrem.dispose(); map.dispose();
    this._loadOutdoorEnvironment();
  }

  _loadOutdoorEnvironment() {
    const preset = outdoorPreset(this.timeOfDay); this._outdoorEnvironments ||= new Map(); this._outdoorLoads ||= new Set();
    if (this._outdoorEnvironments.has(preset.id)) { this._applyOutdoorEnvironment(preset); return; }
    if (this._outdoorLoads.has(preset.id) || this._disposed) return;
    this._outdoorLoads.add(preset.id);
    const markFailure = () => { if (!this._disposed && outdoorPreset(this.timeOfDay).id === preset.id) this.environmentFallback = true; };
    // The original local HDR is decoded without clipping, its small solar
    // core is conditioned once, and the normal Three PMREM path does the
    // filtering. Each daylight preset is loaded only when first selected.
    new HDRLoader().setDataType(THREE.FloatType).load(new URL('../assets/terrain/' + preset.filename, import.meta.url).href, hdr => {
      this._outdoorLoads.delete(preset.id);
      if (this._disposed) { hdr.dispose(); return; }
      let generator;
      try {
        const radiance = prepareOutdoorRadiance(hdr, preset); hdr.mapping = THREE.EquirectangularReflectionMapping;
        generator = new THREE.PMREMGenerator(this.renderer);
        const environment = generator.fromEquirectangular(hdr); environment.outdoorRadiance = radiance;
        this._outdoorEnvironments.set(preset.id, environment);
        // A slower previous selection must never replace the current preset.
        if (outdoorPreset(this.timeOfDay).id === preset.id) this._applyOutdoorEnvironment(preset);
      } catch { markFailure(); }
      finally { generator?.dispose(); hdr.dispose(); }
    }, undefined, () => { this._outdoorLoads.delete(preset.id); markFailure(); });
  }

  _applyOutdoorEnvironment(preset) {
    this.environment = this._outdoorEnvironments.get(preset.id); this.scene.environment = this.environment.texture;
    this._hasPhotoEnvironment = true; this.environmentFallback = false;
    this.scene.environmentRotation.set(0, outdoorEnvironmentYaw(preset, outdoorSunOffset(preset.id)), 0);
    this.scene.environmentIntensity = this.weather === 'rain' || this.weather === 'wet' ? .38 : .65;
    this._startupEnvironment?.dispose(); this._startupEnvironment = null;
    for (const body of this.waterBodies || []) body.lastReflection = -100;
  }

  _createLighting() {
    this.hemisphere = new THREE.HemisphereLight('#c9dce9', '#6d6651', 1.30); this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight('#fff2de', 3.2); this.sunOffset = outdoorSunOffset(this.timeOfDay); this.sun.position.copy(this.sunOffset); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.camera.left = -43; this.sun.shadow.camera.right = 43; this.sun.shadow.camera.top = 43; this.sun.shadow.camera.bottom = -43; this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 330;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.normalBias = 0.055; this.sun.shadow.bias = -0.00015; this.sun.shadow.radius = 2;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.headlight = new THREE.SpotLight('#ffe9bb', 0, 46, Math.PI / 5, 0.58, 1.1); this.scene.add(this.headlight); this.scene.add(this.headlight.target);
  }

  _texture(filename, color = false) {
    this._textures ||= new Map(); this._textureLoader ||= new THREE.TextureLoader();
    if (this._textures.has(filename)) return this._textures.get(filename);
    const texture = this._textureLoader.load(new URL('../assets/terrain/' + filename, import.meta.url).href, undefined, undefined, () => { this.textureFailures ||= []; this.textureFailures.push(filename); });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 4); texture.userData.source = filename;
    this._textures.set(filename, texture); return texture;
  }

  _surfaceTextures(asset) {
    const resolution = TERRAIN_TEXTURE_RESOLUTION[asset] || '1k';
    return { map: this._texture(asset + '_diff_' + resolution + '.jpg', true), normalMap: this._texture(asset + '_nor_gl_' + resolution + '.jpg'), roughnessMap: this._texture(asset + '_rough_1k.jpg') };
  }

  _terrainMaterial(kind, primary, ellipse, tileMetres, nativeWet = 0) {
    return createTerrainMaterial(this, kind, primary, ellipse, tileMetres, nativeWet);
  }

  _createTerrain() {
    const ellipseFor = id => { const region = SURFACE_REGIONS.find(region => region.surface === id); return [region.cx, region.cz, region.rx, region.rz]; };
    this.terrainMaterials = {
      base: this._terrainMaterial('base', 'asphalt_02', [0, 0, 1, 1], 3),
      mud: this._terrainMaterial('mud', 'brown_mud_02', ellipseFor('mud'), 1.3, .48),
      sand: this._terrainMaterial('sand', 'sand_03', ellipseFor('sand'), 2),
      wetland: this._terrainMaterial('wetland', 'brown_mud_02', ellipseFor('wetland'), 1.3, .72),
      rock: this._terrainMaterial('rock', 'mossy_rock', ellipseFor('rock'), 3),
      snow: this._terrainMaterial('snow', 'mossy_rock', ellipseFor('snow'), 3),
    };
    this.groundMaterial = this.terrainMaterials.base; this.rockMaterial = this.terrainMaterials.rock; this.groundTexture = this.groundMaterial.map;
    // The contact terrain is a single upward-facing sheet. Closed-mesh
    // back-face shadow defaults would discard it from the sun depth pass.
    this.rockMaterial.shadowSide = THREE.FrontSide;
    for (const material of Object.values(this.terrainMaterials)) material.shadowSide = THREE.FrontSide;
    for (const p of [this.terrain.baseGrid, ...this.terrain.patches]) {
      const count = p.base.length, positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), geology = new Float32Array(count * 3), uv = new Float32Array(count * 2), indices = [], cellIndexOffsets = new Int32Array(p.nx * p.nz).fill(-1);
      for (let z = 0; z <= p.nz; z++) for (let x = 0; x <= p.nx; x++) {
        const i = z * (p.nx + 1) + x, wx = p.minX + x * p.step, wz = p.minZ + z * p.step, shade = .91 + noise(wx * .08, wz * .08) * .12;
        positions[i * 3] = wx; positions[i * 3 + 1] = p.base[i]; positions[i * 3 + 2] = wz;
        const features = this.terrain.geologyAt?.(wx, wz);
        if (features) { geology[i * 3] = features.stone; geology[i * 3 + 1] = features.rut; geology[i * 3 + 2] = features.shoulder; }
        colors[i * 3] = shade; colors[i * 3 + 1] = shade; colors[i * 3 + 2] = shade; uv[i * 2] = wx / 3; uv[i * 2 + 1] = wz / 3;
        if (x === p.nx || z === p.nz) continue;
        if (p.id === 'base' && this.terrain.getPatch(wx + p.step / 2, wz + p.step / 2)) continue;
        cellIndexOffsets[z * p.nx + x] = indices.length;
        const a = i, b = i + 1, cc = i + p.nx + 1, d = cc + 1; indices.push(a, cc, b, b, cc, d);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(p.deformable ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage)); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('aSoil', new THREE.BufferAttribute(new Float32Array(count * 4), 4)); geo.setIndex(indices); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.terrainMaterials[p.id]); mesh.receiveShadow = true; mesh.castShadow = ['rock', 'snow', 'sand', 'mud', 'wetland'].includes(p.id); mesh.name = 'ground-' + p.id; this.scene.add(mesh);
      geo.setAttribute('aGeology', new THREE.BufferAttribute(geology, 3));
      this.groundMeshes.set(p.id, { mesh, revision: p.revision, baseColors: colors.slice(), fullIndices: geo.index.array.slice(), cellIndexOffsets });
    }
    this.detailMeshes = new Map(); this.detailChunks = []; this._detailEpoch = this.terrain.detailEpoch;
  }

  _createMountains() {
    const material = createRidgeMaterial(this);
    this.ridgeMaterial = material;
    for (let layer = 0; layer < 2; layer++) {
      const mesh = new THREE.Mesh(createMountainGeometry(this.terrain, layer), material);
      mesh.name = 'distant-ridge'; this.scene.add(mesh);
    }
  }

  _createChallenge() {
    this.terrain.course ||= createChallengeCourse();
    this.challenge = createChallengeView(this.terrain.course, { texture: this._texture.bind(this) });
    this.scene.add(this.challenge.group);
  }

  _roadStripe(x, z, width, length, material) {
    const p = [[x - width / 2, z - length / 2], [x + width / 2, z - length / 2], [x + width / 2, z + length / 2], [x - width / 2, z + length / 2]];
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap(([xx, zz]) => [xx, this.terrain.heightAt(xx, zz) + .026, zz]), 3)); geo.setIndex([0, 2, 1, 0, 3, 2]); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; mesh.userData.staticScenery = true; this.scene.add(mesh);
  }

  _createRoad() {
    const stripe = new THREE.MeshStandardMaterial({ color: '#d4cc9c', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    const edge = new THREE.MeshStandardMaterial({ color: '#c6c8bb', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    for (let z = -228; z < 236; z += 14) this._roadStripe(-108, z, .14, 5.4, stripe);
    for (let z = -228; z < 236; z += 4) for (const x of [-114.9, -101.1]) this._roadStripe(x, z, .12, 4, edge);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#cecebd', roughness: .83 }), black = new THREE.MeshStandardMaterial({ color: '#353c36', roughness: .9 });
    for (let z = -225; z <= 235; z += 30) for (const x of [-117, -99]) {
      const y = this.terrain.heightAt(x, z); meshBox(this.scene, poleMat, x, y + .48, z, .12, .96, .10); meshBox(this.scene, black, x, y + .74, z - .058, .125, .18, .018);
    }
  }

  _createVegetation() {
    this.damageRecords ||= new Map();
    const trees = [];
    for (let i = 0; i < 2000 && trees.length < 470; i++) {
      const x = (hash(i, 7) - .5) * 652, z = (hash(i, 29) - .5) * 660, r = Math.hypot(x, z);
      if (challengeReservedAt(x, z, 2)) continue;
      const treeSurface = this.terrain.surfaceAt(x, z);
      if (r > 379 || r < 26 || !['dirt', 'snow'].includes(treeSurface)) continue;
      if (Math.abs(x - this.terrain.trailX(z)) < 12 || (Math.abs(z + 32) < 13 && x > -120 && x < 224) || (Math.abs(z - 40) < 10 && x > -15 && x < 120)) continue;
      if (Math.abs(x + 108) < 24 || (x > -94 && x < -47 && z > -198 && z < -143)) continue;
      if (x > 60 && z < 40 && r < 260) continue;
      if (hash(i, 66) > (x < -130 || z > 215 || r > 255 ? .95 : .42) * (.18 + woodlandCover(x, z) * .98)) continue;
      trees.push({ x, z, y: this.terrain.heightAt(x, z), height: 7.4 + hash(i, 43) * 10.8, radius: 1.7 + hash(i, 88) * 1.4, angle: hash(i, 31) * Math.PI * 2 });
    }
    // Two mature bank trees provide visible, reachable anchors from the mud
    // approach; their trunks stay outside the twin driving ruts.
    for (const [x, z, height, radius] of [[35, -145, 14.2, 2.5], [63, -147, 13.3, 2.3]]) trees.push({ x, z, y: this.terrain.heightAt(x, z), height, radius, angle: .6 });
    const foliageMaterial = createNeedleMaterial({ color: '#ffffff', map: this._texture('pine_tree_01_twig_diff_1k.jpg', true), normalMap: this._texture('pine_tree_01_twig_nor_gl_1k.jpg'), normalScale: new THREE.Vector2(.48, .48), alphaMap: this._texture('pine_tree_01_twig_alpha_1k.jpg'), alphaTest: .38, alphaToCoverage: true, vertexColors: true, roughness: .91, side: THREE.DoubleSide });
    const foliage = new THREE.InstancedMesh(createPineFoliageGeometry(), foliageMaterial, trees.length);
    coatBorealScenery(foliageMaterial, true);
    const bark = new THREE.MeshStandardMaterial({ color: '#f0ece2', vertexColors: true, map: this._texture('pine_tree_01_bark_diff_1k.jpg', true), normalMap: this._texture('pine_tree_01_bark_nor_gl_1k.jpg'), normalScale: new THREE.Vector2(.75, .75), roughness: .96 });
    bark.map.repeat.set(1, 5); bark.normalMap.repeat.set(1, 5);
    const trunks = new THREE.InstancedMesh(createPineTrunkGeometry(), bark, trees.length);
    const branches = new THREE.InstancedMesh(createPineBranchGeometry(), bark, trees.length);
    coatBorealScenery(bark);
    const broadleaf = trees.filter((tree, i) => i > 0 && i !== 137 && i < trees.length - 2 && i % 5 === 0 && this.terrain.surfaceAt(tree.x, tree.z) !== 'snow');
    const birchGeometry = createBroadleafTree();
    const birchLeaves = createLeafMaterial(this, { wind: .065, color: '#ffffff' });
    const birchWood = createBirchBarkMaterial();
    const birch = { foliage: new THREE.InstancedMesh(birchGeometry.foliage, birchLeaves, broadleaf.length),
      branches: new THREE.InstancedMesh(birchGeometry.branches, birchWood, broadleaf.length),
      trunks: new THREE.InstancedMesh(createPineTrunkGeometry(), birchWood, broadleaf.length) };
    birch.foliage.customDepthMaterial = plantShadowMaterial(this, birchLeaves);
    let birchIndex = 0;
    const hiddenTree = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = new THREE.Color();
    trees.forEach((tree, i) => {
      tmp.position.set(tree.x, tree.y, tree.z); tmp.rotation.set((hash(i, 901) - .5) * .035, tree.angle, (hash(i, 904) - .5) * .035); tmp.scale.set(tree.radius, tree.height, tree.radius); tmp.updateMatrix(); foliage.setMatrixAt(i, tmp.matrix); foliage.setColorAt(i, c.setHSL(.21 + hash(i, 110) * .10, .04 + hash(i, 101) * .08, .77 + hash(i, 133) * .21));
      branches.setMatrixAt(i, tmp.matrix); branches.setColorAt(i, new THREE.Color('#ffffff'));
      const trunkRadius = .19 + tree.height * .005;
      const trunkMatrix = tmp.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, .46, 0)).multiply(new THREE.Matrix4().makeScale(trunkRadius / tree.radius, .92, trunkRadius / tree.radius));
      trunks.setMatrixAt(i, trunkMatrix);
      const obstacle = { id: 'tree-' + i, x: tree.x, z: tree.z, radius: .24 + tree.height * .005, height: tree.height * .90, type: 'tree' };
      this.terrain.obstacles.push(obstacle);
      tree.id = obstacle.id; tree.type = 'tree'; tree.index = i; tree.obstacle = obstacle; tree.originalObstacle = { ...obstacle }; tree.energy = 0; tree.damage = 0; tree.shakeAge = 10; tree.shakeAmplitude = 0; tree.push = new THREE.Vector3(0, 0, 1); tree.scars = new Set();
      tree.foliageMatrix = new THREE.Matrix4(); foliage.getMatrixAt(i, tree.foliageMatrix); tree.trunkMatrix = trunkMatrix; tree.foliageColor = c.clone(); trunks.setColorAt(i, new THREE.Color('#ffffff')); this.damageRecords.set(obstacle.id, tree);
      tree.species = 'pine'; tree.meshes = { foliage, branches, trunks, index: i };
      if (broadleaf.includes(tree)) {
        tree.species = 'birch'; tree.meshes = { ...birch, index: birchIndex };
        birch.foliage.setMatrixAt(birchIndex, tree.foliageMatrix); birch.branches.setMatrixAt(birchIndex, tree.foliageMatrix); birch.trunks.setMatrixAt(birchIndex, trunkMatrix);
        birch.foliage.setColorAt(birchIndex, new THREE.Color('#cbd8a6')); birch.branches.setColorAt(birchIndex, new THREE.Color('#ffffff')); birch.trunks.setColorAt(birchIndex, new THREE.Color('#ffffff'));
        foliage.setMatrixAt(i, hiddenTree); branches.setMatrixAt(i, hiddenTree); trunks.setMatrixAt(i, hiddenTree); birchIndex++;
      }
    });
    foliage.name = 'pine-needle-crowns'; trunks.name = 'pine-ridged-trunks'; branches.name = 'pine-connected-boughs';
    for (const mesh of [foliage, trunks, branches]) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh); }
    this.foliage = foliage; this.trunks = trunks; this.branches = branches; this.treeRecords = trees;
    this.birch = birch;
    for (const [name, mesh] of Object.entries(birch)) { mesh.name = 'birch-' + name; mesh.castShadow = mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh); }
    this.stumps = new THREE.InstancedMesh(createBrokenStumpGeometry(), new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .97 }), trees.length); this.stumps.count = 0; this.stumps.castShadow = true; this.stumps.receiveShadow = true; this.stumps.frustumCulled = false; this.stumps.name = 'broken-tree-stumps'; this.scene.add(this.stumps);
    const blades = [];
    for (let i = 0; i < 12500; i++) {
      const x = (hash(i, 301) - .5) * 570, z = (hash(i, 302) - .5) * 578, surface = this.terrain.surfaceAt(x, z);
      if (challengeReservedAt(x, z)) continue;
      if (surface !== 'dirt' || Math.abs(x - this.terrain.trailX(z)) < 6 || Math.abs(x + 108) < 13 || (Math.abs(z + 32) < 5 && x > -115 && x < 211) || (Math.abs(z - 40) < 5 && x > -3 && x < 121)) continue;
      if (hash(i, 316) > .12 + woodlandCover(x + 19, z - 8) * .84) continue;
      blades.push({ x, z, y: this.terrain.heightAt(x, z), h: .25 + hash(i, 311) * .48 });
    }
    const grassMaterial = createPlantMaterial(this, { color: '#e3dfba', wind: .055 });
    const grass = new THREE.InstancedMesh(createMeadowGrassGeometry({ detail: 'distant' }), grassMaterial, blades.length);
    blades.forEach((b, i) => { tmp.position.set(b.x, b.y - .02, b.z); tmp.rotation.set(0, hash(i, 23) * 6.28, 0); tmp.scale.set(1.0 + hash(i, 31) * .7, b.h, 1.0 + hash(i, 36) * .7); tmp.updateMatrix(); grass.setMatrixAt(i, tmp.matrix); grass.setColorAt(i, c.setHSL(.19 + hash(i, 77) * .055, .26 + hash(i, 73) * .16, .41 + hash(i, 99) * .16)); });
    grass.name = 'distant-fine-meadow-grass'; grass.receiveShadow = true; this.scene.add(grass); this.grass = grass;
    const reeds = [];
    for (let i = 0; i < 1050; i++) {
      const x = -79 + hash(i, 811) * 111, z = 72 + hash(i, 818) * 151, sample = this.terrain.sample(x, z);
      if (sample.surface !== 'wetland' || sample.waterDepth > .28 || Math.abs(x + 24) < 4 && z < 146) continue;
      reeds.push({ x, z, y: sample.height, h: .65 + hash(i, 822) * 1.0 });
    }
    const reedMaterial = createPlantMaterial(this, { color: '#ddd8b0', wind: .075 });
    const reed = new THREE.InstancedMesh(createMarshSedgeGeometry(), reedMaterial, reeds.length);
    reed.customDepthMaterial = plantShadowMaterial(this, reedMaterial); reed.castShadow = true; reed.receiveShadow = true;
    reeds.forEach((r, i) => { tmp.position.set(r.x, r.y, r.z); tmp.rotation.set(0, hash(i, 813) * 6.28, 0); tmp.scale.set(1.0, r.h, 1.0); tmp.updateMatrix(); reed.setMatrixAt(i, tmp.matrix); reed.setColorAt(i, c.setHSL(.18 + hash(i, 871) * .05, .24, .45 + hash(i, 878) * .15)); }); reed.name = 'marsh-sedges'; this.scene.add(reed); this.reeds = reed;
    const seedGeometry = new THREE.CapsuleGeometry(.018, .12, 2, 5);
    seedGeometry.setAttribute('aPlantBend', new THREE.Float32BufferAttribute(new Float32Array(seedGeometry.attributes.position.count).fill(1), 1));
    const seedMaterial = createPlantMaterial(this, { color: '#675039', vertexColors: false, wind: .075 });
    const seedheads = new THREE.InstancedMesh(seedGeometry, seedMaterial, reeds.length);
    const stalkMatrix = new THREE.Matrix4(), seedAnchor = new THREE.Vector3(REED_SEEDHEAD_ANCHOR.x, REED_SEEDHEAD_ANCHOR.y, REED_SEEDHEAD_ANCHOR.z);
    reeds.forEach((r, i) => { reed.getMatrixAt(i, stalkMatrix); tmp.position.copy(seedAnchor).applyMatrix4(stalkMatrix); const heightScale = .85 + hash(i, 836) * .35; tmp.position.y += .078 * heightScale; tmp.rotation.set(0, hash(i, 831) * 6.28, 0); tmp.scale.set(1, heightScale, 1); tmp.updateMatrix(); seedheads.setMatrixAt(i, tmp.matrix); });
    seedheads.name = 'attached-cattail-seedheads'; seedheads.castShadow = true; seedheads.receiveShadow = true; seedheads.customDepthMaterial = plantShadowMaterial(this, seedMaterial); this.seedheads = seedheads; this.scene.add(seedheads);
    this._createBiomeUnderstory();
    this._createGroundDetails();
  }

  _treeMeshes(tree) { return tree.meshes || { foliage: this.foliage, branches: this.branches, trunks: this.trunks, index: tree.index }; }

  _tintTree(tree, color) {
    const { branches, trunks, index } = this._treeMeshes(tree);
    for (const mesh of [branches, trunks]) { mesh.setColorAt(index, color); mesh.instanceColor.needsUpdate = true; }
  }

  _createBiomeUnderstory() {
    const geometries = [createFernGeometry(), createFernGeometry(7517), createShrubGeometry()];
    this.understory = geometries.map((geometry, type) => {
      const material = createPlantMaterial(this, { wind: type === 2 ? .035 : .045 });
      const mesh = new THREE.InstancedMesh(geometry, material, 180); mesh.count = 0;
      mesh.name = geometry.name; mesh.castShadow = mesh.receiveShadow = true;
      mesh.customDepthMaterial = plantShadowMaterial(this, material); this.scene.add(mesh); return mesh;
    });
    for (const [i, tree] of this.treeRecords.entries()) for (let j = 0; j < 5; j++) {
      const seed = i * 7 + j, angle = hash(seed, 1851) * Math.PI * 2, distance = 2.2 + hash(seed, 1853) * 5.2;
      const x = tree.x + Math.sin(angle) * distance, z = tree.z + Math.cos(angle) * distance;
      if (challengeReservedAt(x, z, 1) || Math.abs(x + 108) < 14 || Math.abs(x - this.terrain.trailX(z)) < 6
        || Math.abs(z + 32) < 5 && x > -120 && x < 224 || Math.abs(z - 40) < 4 && x > -15 && x < 120) continue;
      const sample = this.terrain.sample(x, z);
      if (!['dirt', 'wetland'].includes(sample.surface) || sample.waterDepth > .08 || sample.normal.y < .82) continue;
      const type = sample.surface === 'wetland' || hash(seed, 1857) > .60 ? 2 : seed % 2;
      const mesh = this.understory[type]; if (mesh.count >= 180) continue;
      tmp.position.set(x, sample.height - .015, z); tmp.rotation.set(0, angle, 0);
      const size = .65 + hash(seed, 1861) * .65; tmp.scale.setScalar(size); tmp.updateMatrix();
      mesh.setMatrixAt(mesh.count++, tmp.matrix);
    }
    for (const mesh of this.understory) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.computeBoundingSphere(); }
  }

  _createGroundDetails() {
    const pebbleGeometry = createScreeGeometry(), distantPebbleGeometry = createScreeGeometry({ detail: 'distant' });
    const stones = [], tufts = [];
    for (let i = 0; i < 14000; i++) {
      const x = (hash(i, 2501) - .5) * 560, z = (hash(i, 2503) - .5) * 560, surface = this.terrain.surfaceAt(x, z), path = Math.abs(x - this.terrain.trailX(z));
      if (challengeReservedAt(x, z)) continue;
      const rocky = surface === 'rock', trail = surface === 'dirt' && (path < 8 || Math.abs(z + 32) < 4.2 && x > -112 && x < 211 || Math.abs(x + 108) > 8.5 && Math.abs(x + 108) < 12);
      if ((rocky || trail || surface === 'sand' && hash(i, 2507) < .13) && stones.length < 2600) stones.push({ x, z, y: this.terrain.heightAt(x, z), surface, scale: .075 + hash(i, 2511) * .16 });
      const exposedStone = surface === 'rock' ? this.terrain.geologyAt?.(x, z)?.stone || 0 : 0;
      if ((surface === 'sand' && hash(i, 2513) < .11 || surface === 'rock' && hash(i, 2517) < .15 || surface === 'dirt' && path > 6 && hash(i, 2518) < .075) && exposedStone < .16 && tufts.length < 900) tufts.push({ x, z, y: this.terrain.heightAt(x, z), surface });
    }
    // Sub-6 cm stones are visual microdetail, below meaningful obstacle size.
    // The larger rock slabs and ledges are wholly in Terrain's contact mesh.
    const pebbles = new THREE.InstancedMesh(distantPebbleGeometry, new THREE.MeshStandardMaterial({ color: '#f1eee5', vertexColors: true, roughness: .92, flatShading: true }), stones.length), color = new THREE.Color();
    stones.forEach((s, i) => { tmp.position.set(s.x, s.y + .012, s.z); tmp.rotation.set(0, hash(i, 2521) * 6.28, 0); tmp.scale.set(s.scale, .025 + hash(i, 2522) * .020, s.scale * (.65 + hash(i, 2523) * .7)); tmp.updateMatrix(); pebbles.setMatrixAt(i, tmp.matrix); pebbles.setColorAt(i, color.set(s.surface === 'sand' ? '#c6b899' : s.surface === 'rock' ? '#a7abad' : '#8a8174').multiplyScalar(.65 + hash(i, 2527) * .50)); });
    pebbles.name = 'trail-gravel-and-rock-scree'; pebbles.receiveShadow = true; this.scene.add(pebbles); this.pebbles = pebbles;
    const dry = new THREE.InstancedMesh(createDryTussockGeometry(), createPlantMaterial(this, { color: '#eee5c9', roughness: .98, wind: .035 }), tufts.length);
    tufts.forEach((s, i) => { tmp.position.set(s.x, s.y - .012, s.z); tmp.rotation.set(0, hash(i, 2531) * 6.28, 0); tmp.scale.set(.9 + hash(i, 2533), .17 + hash(i, 2537) * .33, .9 + hash(i, 2539)); tmp.updateMatrix(); dry.setMatrixAt(i, tmp.matrix); dry.setColorAt(i, color.set(s.surface === 'sand' ? '#c4b17f' : '#a69d68').multiplyScalar(.74 + hash(i, 2541) * .25)); }); dry.name = 'dry-tussock-clusters'; dry.receiveShadow = true; this.scene.add(dry); this.dryTufts = dry;
    // Dense local populations make verges, sedge banks and loose grit readable
    // at driving distance. Distant vegetation remains in the static batches.
    // These are flexible stems and sub-6 cm grit, not rigid contact obstacles.
    const closeGrassMaterial = createPlantMaterial(this, { color: '#e3dfba', wind: .055 });
    const closeGrass = new THREE.InstancedMesh(createMeadowGrassGeometry(), closeGrassMaterial, 4096);
    const closeSedge = new THREE.InstancedMesh(createMarshSedgeGeometry(), createPlantMaterial(this, { color: '#ddd8b0', wind: .075 }), 4096);
    const closeDry = new THREE.InstancedMesh(createDryTussockGeometry(), dry.material, 512);
    const closeGravel = new THREE.InstancedMesh(pebbleGeometry, pebbles.material, 2048);
    // Original model UVs and official 1K maps retain the photographed detail
    // without loading the much larger source model or its 2K texture set.
    const rockMaps = {
      map: this._texture('rock_moss_set_01/textures/rock_moss_set_01_diff_1k.jpg', true),
      normalMap: this._texture('rock_moss_set_01/textures/rock_moss_set_01_nor_gl_1k.jpg'),
      roughnessMap: this._texture('rock_moss_set_01/textures/rock_moss_set_01_rough_1k.jpg'),
    };
    for (const texture of Object.values(rockMaps)) texture.flipY = false;
    const importedRocks = new THREE.InstancedMesh(createImportedGroundRockGeometry(), new THREE.MeshStandardMaterial({ ...rockMaps, color: '#ffffff', roughness: 1, normalScale: new THREE.Vector2(.72, .72) }), 24);
    importedRocks.name = 'near-ground-imported-rocks'; importedRocks.userData.sourceModel = IMPORTED_GROUND_ROCK.name;
    importedRocks.count = 0; importedRocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); importedRocks.castShadow = true; importedRocks.receiveShadow = true; this.scene.add(importedRocks);
    closeGrass.name = 'near-ground-fine-meadow-grass'; closeSedge.name = 'near-ground-marsh-sedges'; closeDry.name = 'near-ground-dry-tussocks'; closeGravel.name = 'near-ground-loose-grit';
    for (const mesh of [closeGrass, closeSedge, closeDry, closeGravel]) { mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.receiveShadow = true; this.scene.add(mesh); }
    for (const mesh of [closeGrass, closeSedge, closeDry]) { mesh.castShadow = true; mesh.customDepthMaterial = plantShadowMaterial(this, mesh.material); }
    this.groundProximity = { grass: closeGrass, sedge: closeSedge, dry: closeDry, gravel: closeGravel, importedRocks, radius: 54, maxGrass: 4096, maxGravel: 2048, records: [], rockRecords: [] };
    this._updateGroundProximity({ x: -3, z: -44 }, true);
    this.groundCoverContact = new GroundCoverContact(this.terrain, [
      { mesh: this.grass, rootOffset: -.02 },
      { mesh: this.reeds, rootOffset: 0, companion: this.seedheads },
      { mesh: this.dryTufts, rootOffset: -.012 },
      { mesh: this.pebbles, plant: false, rootOffset: .012 },
      ...(this.understory || []).map(mesh => ({ mesh, rootOffset: -.015 })),
    ]);
  }

  _updateGroundProximity(position, force = false) {
    const detail = this.groundProximity; if (!detail || !position) return;
    for (const mesh of this.understory || []) mesh.visible = this.quality !== 'low';
    const enabled = this.quality !== 'low'; for (const mesh of [detail.grass, detail.sedge, detail.dry, detail.gravel, detail.importedRocks]) mesh.visible = enabled; if (!enabled) return;
    const cx = Math.round(position.x / 8) * 8, cz = Math.round(position.z / 8) * 8, clock = this.clock || 0, previous = this._nearDetailState;
    const sameRegion = previous && previous.cx === cx && previous.cz === cz;
    const sameLayout = sameRegion && previous.epoch === this.terrain.detailEpoch && previous.moisture === this.terrain.moisture && previous.quality === this.quality;
    if (!force && sameLayout) {
      if (previous.revision === this.terrain.detailRevision && previous.soilRevision === this.terrain.revision || clock - previous.clock < .14) return;
      previous.revision = this.terrain.detailRevision; previous.soilRevision = this.terrain.revision; previous.clock = clock;
      // Tire edits do not reseed vegetation or refit every imported model.
      // Only existing props touching changed soil tiles need fresh support.
      this._updateGroundSoil(); return;
    }
    this._nearDetailState = { cx, cz, epoch: this.terrain.detailEpoch, revision: this.terrain.detailRevision, soilRevision: this.terrain.revision, moisture: this.terrain.moisture, quality: this.quality, clock };
    const color = new THREE.Color(), normal = new THREE.Vector3(), rotation = new THREE.Quaternion(), cell = this.quality === 'medium' ? 1.55 : 1.5, reach = Math.ceil(detail.radius / cell);
    let grassCount = 0, gravelCount = 0; const plantCounts = { grass: 0, sedge: 0, dry: 0 }; detail.records = []; detail.gravelRecords = [];
    for (let iz = Math.floor(cz / cell) - reach; iz <= Math.floor(cz / cell) + reach; iz++) for (let ix = Math.floor(cx / cell) - reach; ix <= Math.floor(cx / cell) + reach; ix++) for (let j = 0; j < 2; j++) {
      const seed = ix * 2 + j * 7919, x = (ix + hash(seed, iz + 7103)) * cell, z = (iz + hash(seed, ix + 7109)) * cell;
      const distance = Math.hypot(x - cx, z - cz), edge = clamp((detail.radius - distance) / 8, 0, 1), fade = edge * edge * (3 - 2 * edge);
      if (fade < .025 || Math.abs(x) > 396 || Math.abs(z) > 396) continue;
      if (challengeReservedAt(x, z)) continue;
      const surface = this.terrain.surfaceAt(x, z); if (surface === 'asphalt') continue;
      const cover = surface === 'dirt' ? this.terrain._dirtCover(x, z) : null, mottle = noise(x * .18, z * .18);
      let density = surface === 'snow' ? .014 + mottle * .022 : surface === 'dirt' ? (.25 + mottle * .60) * (.17 + woodlandCover(x + 19, z - 8) * 1.08) : surface === 'wetland' ? .34 + mottle * .36 : surface === 'rock' ? .035 + mottle * .07 : surface === 'sand' ? Math.max(0, mottle - .48) * .20 : .12;
      // Retain the established grassy comparison clearing while the wider
      // landscape gains sparse gaps and clustered understory.
      if (surface === 'dirt') density = Math.max(density, .74 * (1 - THREE.MathUtils.smoothstep(Math.hypot(x + 51, z - 282), 10, 25)));
      if (cover) density *= cover.grass;
      const geology = this.terrain.geologyAt?.(x, z);
      if (geology) density *= (1 - geology.rut) * (1 - geology.stone);
      const grassCandidate = hash(seed + 7133, iz) < density;
      const gritDensity = surface === 'rock' ? .36 + mottle * .28 : cover ? (.14 + mottle * .16) * cover.hardpack + (.62 + mottle * .32) * cover.gravel : surface === 'sand' ? Math.max(0, mottle - .56) * .11 : 0;
      const gritCandidate = hash(seed, iz + 7151) < gritDensity;
      if (!grassCandidate && !gritCandidate) continue;
      const sample = this.terrain.sample(x, z);
      if (grassCandidate && grassCount < detail.maxGrass && sample.normal.y > .72 && sample.waterDepth < (surface === 'wetland' ? .28 : .025)) {
        const dry = surface === 'sand' || surface === 'rock' || surface === 'snow', wet = surface === 'wetland', baseHeight = wet ? .54 + hash(seed, iz + 7159) * .93 : dry ? .15 + hash(seed, iz + 7159) * .31 : .22 + hash(seed, iz + 7159) * .48;
        const height = baseHeight * fade * (1 - sample.compaction * .91), width = (wet ? .80 : dry ? .80 : 1.05) + hash(seed, iz + 7177) * .55;
        const population = wet ? 'sedge' : dry ? 'dry' : 'grass', mesh = detail[population], index = plantCounts[population];
        if (index < mesh.instanceMatrix.count) {
          tmp.position.set(x, sample.height - .012, z); tmp.rotation.set(0, hash(seed, iz + 7187) * Math.PI * 2, 0); tmp.scale.set(width * fade, height, width * fade); tmp.updateMatrix(); mesh.setMatrixAt(index, tmp.matrix);
          color.set(wet ? '#9ba56b' : dry ? '#c6b183' : mottle < .31 ? '#a89e70' : '#819451').multiplyScalar(.82 + hash(seed, iz + 7193) * .30); mesh.setColorAt(index, color);
          detail.records.push({ index, population, x, z, surface, surfaceDetail: sample.surfaceDetail, grassFraction: sample.grassFraction || 0, rootY: sample.height, compaction: sample.compaction, baseHeight, height, fade });
          plantCounts[population]++; grassCount++;
        }
      }
      if (gritCandidate && gravelCount < detail.maxGravel && sample.normal.y > .58 && sample.waterDepth < .006) {
        const scale = .032 + hash(seed, iz + 7211) * .092;
        const yaw = hash(seed, iz + 7213) * Math.PI * 2, size = [scale * fade, (.012 + hash(seed, iz + 7219) * .033) * fade, scale * (.60 + hash(seed, iz + 7229) * .75) * fade];
        normal.set(sample.normal.x, sample.normal.y, sample.normal.z); rotation.setFromAxisAngle(UP, yaw);
        tmp.quaternion.setFromUnitVectors(UP, normal).multiply(rotation); tmp.position.set(x, sample.height + .005, z); tmp.scale.set(...size); tmp.updateMatrix(); detail.gravel.setMatrixAt(gravelCount, tmp.matrix);
        detail.gravelRecords.push({ index: gravelCount, x, z, yaw, size, rootY: sample.height });
        color.set(surface === 'rock' ? '#b2b4ac' : surface === 'sand' ? '#c9b99b' : cover?.gravel > .5 ? '#b6b0a2' : '#8c8170').multiplyScalar(.68 + hash(seed, iz + 7237) * .59); detail.gravel.setColorAt(gravelCount++, color);
      }
    }
    for (const [mesh, count] of [[detail.grass, plantCounts.grass], [detail.sedge, plantCounts.sedge], [detail.dry, plantCounts.dry], [detail.gravel, gravelCount]]) {
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    this._updateImportedRocks(cx, cz);
    detail.soilTileRevisions = new Map([...this.terrain.detailTiles].map(([key, tile]) => [key, tile.revision]));
  }

  _updateGroundSoil() {
    const detail = this.groundProximity, revisions = detail.soilTileRevisions ||= new Map(), changed = new Set();
    for (const [key, tile] of this.terrain.detailTiles) if (revisions.get(key) !== tile.revision) { changed.add(key); revisions.set(key, tile.revision); }
    const stats = { changedTiles: changed.size, sampledPlants: 0, sampledGravel: 0, reprojectedRocks: 0, matrixUpdates: 0 };
    this._nearSoilUpdate = stats; if (!changed.size) return;
    const tileSize = this.terrain.detailSize, halo = this.terrain.detailStep, dirty = new Set();
    const matrix = new THREE.Matrix4(), normal = new THREE.Vector3(), rotation = new THREE.Quaternion();
    const touches = (record, radius = 0) => {
      radius += halo;
      for (let tz = Math.floor((record.z - radius) / tileSize); tz <= Math.floor((record.z + radius) / tileSize); tz++)
        for (let tx = Math.floor((record.x - radius) / tileSize); tx <= Math.floor((record.x + radius) / tileSize); tx++) if (changed.has(tx + ',' + tz)) return true;
      return false;
    };
    const write = (mesh, index, value) => {
      const array = mesh.instanceMatrix.array, offset = index * 16;
      // A tile revision can contain tread-only changes or sub-float movement.
      // Do not upload a matrix whose actual stored Float32 values are unchanged.
      if (!value.elements.some((component, i) => array[offset + i] !== Math.fround(component))) return;
      dirty.add(mesh);
      mesh.setMatrixAt(index, value); queueAttributeRange(mesh.instanceMatrix, offset, 16); stats.matrixUpdates++;
    };
    for (const record of detail.records) {
      if (!touches(record)) continue;
      stats.sampledPlants++; const sample = this.terrain.sample(record.x, record.z), mesh = detail[record.population];
      const visible = sample.normal.y > .72 && sample.waterDepth < (record.population === 'sedge' ? .28 : .025);
      const height = visible ? record.baseHeight * record.fade * (1 - sample.compaction * .91) : 0;
      record.rootY = sample.height; record.compaction = sample.compaction; record.height = height;
      mesh.getMatrixAt(record.index, matrix);
      // Existing plants rotate only about Y. Preserve their original yaw and
      // width; compression changes upright height and the actual root support.
      matrix.elements[5] = height; matrix.elements[13] = sample.height - .012;
      write(mesh, record.index, matrix);
    }
    for (const record of detail.gravelRecords || []) {
      if (!touches(record, Math.max(record.size[0], record.size[2]))) continue;
      stats.sampledGravel++; const sample = this.terrain.sample(record.x, record.z), visible = sample.normal.y > .58 && sample.waterDepth < .006;
      normal.set(sample.normal.x, sample.normal.y, sample.normal.z); rotation.setFromAxisAngle(UP, record.yaw);
      tmp.quaternion.setFromUnitVectors(UP, normal).multiply(rotation); tmp.position.set(record.x, sample.height + .005, record.z);
      tmp.scale.set(...record.size).multiplyScalar(visible ? 1 : 0); tmp.updateMatrix(); record.rootY = sample.height;
      write(detail.gravel, record.index, tmp.matrix);
    }
    const rockGeometry = detail.importedRocks.geometry;
    if (!rockGeometry.boundingSphere) rockGeometry.computeBoundingSphere();
    const rockRadius = rockGeometry.boundingSphere.radius + rockGeometry.boundingSphere.center.length();
    for (const record of detail.rockRecords) {
      // The fitted model can cross a tile boundary even when its center does
      // not. Include its complete rotated footprint and one sampling cell.
      if (!touches(record, rockRadius * record.scale)) continue;
      const sample = this.terrain.sample(record.x, record.z);
      if (sample.normal.y < .95 || sample.waterDepth > .004) {
        detail.importedRocks.getMatrixAt(record.index, matrix); matrix.scale(new THREE.Vector3(0, 0, 0));
        write(detail.importedRocks, record.index, matrix); continue;
      }
      stats.reprojectedRocks++;
      write(detail.importedRocks, record.index, this._fitImportedGroundRock(record, sample));
    }
    for (const mesh of dirty) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }

  _updateImportedRocks(cx, cz) {
    const detail = this.groundProximity, mesh = detail.importedRocks, candidates = [], cell = 6, radius = this.quality === 'high' ? 52 : 42;
    for (let iz = Math.floor((cz - radius) / cell); iz <= Math.floor((cz + radius) / cell); iz++) for (let ix = Math.floor((cx - radius) / cell); ix <= Math.floor((cx + radius) / cell); ix++) {
      const x = (ix + hash(ix + 16001, iz)) * cell, z = (iz + hash(ix, iz + 16007)) * cell, distance = Math.hypot(x - cx, z - cz);
      if (distance > radius || Math.abs(x) > 395 || Math.abs(z) > 395) continue;
      if (challengeReservedAt(x, z)) continue;
      const surface = this.terrain.surfaceAt(x, z); if (surface !== 'dirt' && surface !== 'rock') continue;
      const cover = surface === 'dirt' ? this.terrain._dirtCover(x, z) : null;
      const density = surface === 'rock' ? .25 : .20 * (1 - cover.hardpack);
      if (hash(ix + 16033, iz) > density || cover?.hardpack > .20) continue;
      const sample = this.terrain.sample(x, z); if (sample.normal.y < .95 || sample.waterDepth > .004) continue;
      candidates.push({ x, z, ix, iz, sample, surface, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
    detail.rockRecords = [];
    for (const candidate of candidates.slice(0, mesh.instanceMatrix.count)) {
      const { x, z, ix, iz, sample, surface, distance } = candidate;
      const edge = clamp((radius - distance) / 10, 0, 1), fade = edge * edge * (3 - 2 * edge), scale = .075 + hash(ix + 16057, iz) * .080;
      const relief = (.028 + hash(ix + 16063, iz) * .016) * fade, index = detail.rockRecords.length;
      const record = { index, x, z, surface, scale, relief, fade, yaw: hash(ix + 16061, iz) * Math.PI * 2 };
      mesh.setMatrixAt(index, this._fitImportedGroundRock(record, sample)); detail.rockRecords.push(record);
    }
    mesh.count = detail.rockRecords.length; mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  }

  _fitImportedGroundRock(record, sample) {
    const mesh = this.groundProximity.importedRocks, position = mesh.geometry.attributes.position, indices = mesh.geometry.index.array;
    const offsets = this._groundRockOffsets ||= new Float64Array(position.count * 3), vertex = new THREE.Vector3();
    const normal = new THREE.Vector3(sample.normal.x, sample.normal.y, sample.normal.z), yaw = new THREE.Quaternion().setFromAxisAngle(UP, record.yaw);
    tmp.quaternion.setFromUnitVectors(UP, normal).multiply(yaw); tmp.scale.setScalar(record.scale);
    // Reuse the exact original buried fit, including triangle-center probes.
    // The exposed tip remains at most 4.4 cm above the actual sampled earth.
    let support = Infinity;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).multiplyScalar(record.scale).applyQuaternion(tmp.quaternion);
      offsets[i * 3] = vertex.x; offsets[i * 3 + 1] = vertex.y; offsets[i * 3 + 2] = vertex.z;
      support = Math.min(support, this.terrain.heightAt(record.x + vertex.x, record.z + vertex.z) - vertex.y);
    }
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const x = (offsets[a] + offsets[b] + offsets[c]) / 3, y = (offsets[a + 1] + offsets[b + 1] + offsets[c + 1]) / 3, z = (offsets[a + 2] + offsets[b + 2] + offsets[c + 2]) / 3;
      support = Math.min(support, this.terrain.heightAt(record.x + x, record.z + z) - y);
    }
    tmp.position.set(record.x, support + record.relief, record.z); tmp.updateMatrix();
    return tmp.matrix;
  }

  _createWater() {
    this.waterBodies = []; this._waterRipples = Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, -100, 0));
    this._waterMotions = Array.from({ length: 24 }, () => new THREE.Vector4(0, 1, 0, 0));
    this._waterWheelHistory = new Map(); this._waterRippleCursor = 0; this._waterDepthSyncTime = -10;
    for (const config of [
      { id: 'wetland', cx: -24, cz: 148, rx: 53, rz: 71, step: .4, level: this.terrain.waterLevel, sediment: .28, color: '#4d685c' },
      { id: 'mud', cx: 48, cz: -115, rx: 40, rz: 62, step: .1, level: 3.265, sediment: .86, color: '#756044' },
    ]) {
      const patch = this.terrain.patches.find(p => p.id === config.id), width = Math.round((patch.maxX - patch.minX) / config.step) + 1, height = Math.round((patch.maxZ - patch.minZ) / config.step) + 1;
      // Linear, 16-bit packed bed elevations: <1 mm quantization over 64 m.
      // The map is refreshed from the same triangle sampler used by the tires.
      const bytes = new Uint8Array(width * height * 4), depthTexture = new THREE.DataTexture(bytes, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
      depthTexture.minFilter = depthTexture.magFilter = THREE.LinearFilter; depthTexture.generateMipmaps = false; depthTexture.flipY = false;
      depthTexture.userData.waterDepth = config.id;
      const body = { ...config, baseLevel: config.level, patch, width, height, bytes, depthTexture, depthTileRevisions: new Map(), depthEpoch: -1, shaders: [], reflectionMatrix: new THREE.Matrix4(), reflectionCamera: new THREE.PerspectiveCamera(), reflectionReady: 0, lastReflection: -100 };
      const canFloat = this.renderer?.extensions?.has?.('EXT_color_buffer_float');
      body.reflectionTarget = new THREE.WebGLRenderTarget(384, 384, { type: canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      body.reflectionTarget.texture.colorSpace = THREE.LinearSRGBColorSpace; body.reflectionTarget.texture.userData.reflectionBody = body.id;
      const vertices = [], indices = [], nx = Math.ceil((patch.maxX - patch.minX) / 2), nz = Math.ceil((patch.maxZ - patch.minZ) / 2);
      for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) vertices.push(patch.minX + x * 2, config.level, patch.minZ + z * 2);
      for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
        const wx = patch.minX + (x + .5) * 2, wz = patch.minZ + (z + .5) * 2;
        if (Math.hypot((wx - config.cx) / config.rx, (wz - config.cz) / config.rz) > 1.04) continue;
        const a = z * (nx + 1) + x; indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      body.material = this._waterMaterial(body); body.mesh = new THREE.Mesh(geometry, body.material); body.mesh.name = 'depth-masked-water-' + body.id; body.mesh.renderOrder = 2; this.scene.add(body.mesh); this.waterBodies.push(body);
    }
    this.water = this.waterBodies[0].mesh; this.waterMaterial = this.waterBodies[0].material;
    this._syncWaterDepth(true);
  }

  _waterMaterial(body) {
    const material = new THREE.MeshPhysicalMaterial({ color: body.color, metalness: 0, roughness: .085, ior: 1.333, clearcoat: 0, transparent: true, opacity: .78, depthWrite: false, side: THREE.DoubleSide });
    // A water sheet has no separate back/front volume to sort and blend twice.
    material.forceSinglePass = true;
    material.name = 'Shoreline water / ' + body.id;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, {
        tdWaterTime: { value: this.clock || 0 }, tdWaterLevel: { value: body.level }, tdWaterBed: { value: body.depthTexture },
        tdWaterBounds: { value: new THREE.Vector4(body.patch.minX, body.patch.minZ, body.patch.maxX - body.patch.minX, body.patch.maxZ - body.patch.minZ) },
        tdWaterTexels: { value: new THREE.Vector2(body.width, body.height) }, tdWaterEllipse: { value: new THREE.Vector4(body.cx, body.cz, body.rx, body.rz) },
        tdWaterSediment: { value: body.sediment }, tdWaterRain: { value: this.terrain.moisture }, tdWaterRipples: { value: this._waterRipples }, tdWaterMotions: { value: this._waterMotions },
        tdWaterReflection: { value: body.reflectionTarget.texture }, tdWaterReflectionMatrix: { value: body.reflectionMatrix }, tdWaterReflectionReady: { value: body.reflectionReady },
      });
      shader.vertexShader = 'varying vec3 vWaterWorld; varying vec4 vWaterReflection; uniform mat4 tdWaterReflectionMatrix;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterWorld=(modelMatrix*vec4(position,1.)).xyz; vWaterReflection=tdWaterReflectionMatrix*vec4(vWaterWorld,1.);');
      shader.fragmentShader = `varying vec3 vWaterWorld; varying vec4 vWaterReflection;
        uniform float tdWaterTime; uniform float tdWaterLevel; uniform float tdWaterSediment; uniform float tdWaterRain; uniform float tdWaterReflectionReady;
        uniform sampler2D tdWaterBed; uniform sampler2D tdWaterReflection; uniform vec4 tdWaterBounds; uniform vec4 tdWaterEllipse; uniform vec2 tdWaterTexels;
        uniform vec4 tdWaterRipples[24]; uniform vec4 tdWaterMotions[24];
        float tdWaterBedHeight(vec2 uv){
          vec2 cell=clamp(uv,vec2(0.),vec2(.999999))*(tdWaterTexels-1.),grid=floor(cell),part=fract(cell);
          vec2 a=(grid+.5)/tdWaterTexels,stepUV=1./tdWaterTexels;
          vec2 codeA=texture2D(tdWaterBed,a).rg,codeB=texture2D(tdWaterBed,a+vec2(stepUV.x,0.)).rg,codeC=texture2D(tdWaterBed,a+vec2(0.,stepUV.y)).rg,codeD=texture2D(tdWaterBed,a+stepUV).rg;
          vec2 code=part.x+part.y<=1.?codeA+part.x*(codeB-codeA)+part.y*(codeC-codeA):codeD+(1.-part.x)*(codeC-codeD)+(1.-part.y)*(codeB-codeD);
          return dot(code,vec2(65280.,255.))*(64./65535.)-8.;
        }
        vec3 tdWaterWaves(vec2 p){
          vec2 slope=vec2(sin(p.x*2.4+tdWaterTime*.85)*.023+cos(p.y*7.1+p.x*4.3+tdWaterTime*.61)*.011,cos(p.y*2.8-tdWaterTime*.73)*.020+sin(p.x*6.3-p.y*3.7-tdWaterTime*.82)*.010);
          slope*=1.+tdWaterRain*.55;float foam=0.;
          for(int i=0;i<24;i++){
            vec4 pulse=tdWaterRipples[i];float age=tdWaterTime-pulse.z;
            if(age<0.||age>5.5||pulse.w<=0.)continue;
            vec2 delta=p-pulse.xy;float distanceToPulse=length(delta)+.001;
            float waveRadius=.16+age*1.14,width=.085+age*.027;
            float ring=exp(-pow((distanceToPulse-waveRadius)/width,2.));float fade=exp(-age*.73)*pulse.w;
            slope+=delta/distanceToPulse*ring*sin((distanceToPulse-waveRadius)*21.)*fade*.24;
            vec4 motion=tdWaterMotions[i];float along=dot(delta,motion.xy),across=abs(delta.x*motion.y-delta.y*motion.x);
            float wake=exp(-pow((across-(-along)*.34-.13)/.14,2.))*smoothstep(.10,.75,-along)*(1.-smoothstep(.3,2.5,-along))*exp(-age*1.8)*pulse.w;
            slope+=vec2(-motion.y,motion.x)*sign(delta.x*motion.y-delta.y*motion.x)*wake*.11;
            foam+=ring*fade*clamp((motion.z-.9)*.13,0.,.44)+wake*clamp(motion.z*.06,0.,.30);
          }
          return vec3(slope,clamp(foam,0.,.58));
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        vec2 tdBedUV=(vWaterWorld.xz-tdWaterBounds.xy)/tdWaterBounds.zw;
        float tdBedHeight=tdWaterBedHeight(tdBedUV);
        float tdWaterDepth=tdWaterLevel-tdBedHeight;
        float tdShoreEllipse=length((vWaterWorld.xz-tdWaterEllipse.xy)/tdWaterEllipse.zw);
        if(tdWaterDepth<=.003||tdShoreEllipse>=1.)discard;
        float tdShoreFade=smoothstep(.003,.047,tdWaterDepth)*(1.-smoothstep(.985,1.,tdShoreEllipse));
        float tdAbsorption=1.-exp(-tdWaterDepth*(2.4+tdWaterSediment*5.0));
        vec3 tdWaterMotion=tdWaterWaves(vWaterWorld.xz);
        float tdShoreFoam=(1.-smoothstep(.035,.085,tdWaterDepth))*smoothstep(.004,.025,tdWaterDepth)*(.5+.5*sin(vWaterWorld.x*9.+vWaterWorld.z*7.+tdWaterTime))*.035;
        float tdFoam=clamp(tdWaterMotion.z+tdShoreFoam,0.,.6);
        diffuseColor.rgb*=mix(vec3(1.15,1.14,1.02),vec3(.62,.81,.78),tdAbsorption*(1.-tdWaterSediment*.68));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.54,.56,.45),tdFoam);
        diffuseColor.a=tdShoreFade*mix(.12,.83,tdAbsorption);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor=clamp(.055+tdWaterSediment*.06+tdWaterRain*.045+tdFoam*.22,.065,.31);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n vec3 waterRipple=vec3(tdWaterMotion.x,0.,tdWaterMotion.y)*smoothstep(.003,.09,tdWaterDepth); normal=normalize(normal+mat3(viewMatrix)*waterRipple);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\n #ifdef USE_CLEARCOAT\n clearcoatNormal=normalize(clearcoatNormal+mat3(viewMatrix)*waterRipple);\n #endif');
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n vec3 tdWaveDerivative=max(abs(dFdx(normal)),abs(dFdy(normal))); material.roughness=min(1.,material.roughness+max(max(tdWaveDerivative.x,tdWaveDerivative.y),tdWaveDerivative.z)*.5);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec2 tdReflectionUV=vWaterReflection.xy/max(.001,vWaterReflection.w)+tdWaterMotion.xy*.032;
        vec2 tdReflectionEdge=min(tdReflectionUV,vec2(1.)-tdReflectionUV);
        float tdReflectionValid=smoothstep(0.,.018,min(tdReflectionEdge.x,tdReflectionEdge.y))*smoothstep(.001,.025,vWaterReflection.w);
        float tdFresnel=.025+.975*pow(1.-abs(dot(normal,normalize(vViewPosition))),5.);
        vec3 tdReflectionColor=texture2D(tdWaterReflection,clamp(tdReflectionUV,.001,.999)).rgb;
        outgoingLight=mix(outgoingLight,tdReflectionColor,tdWaterReflectionReady*tdReflectionValid*clamp(.12+tdFresnel*.86,0.,.94)*(1.-tdFoam*.6));
        diffuseColor.a=max(diffuseColor.a,tdShoreFade*tdFresnel*.93);
        #include <opaque_fragment>
      `);
      body.shaders.push(shader); if (body.id === 'wetland') this.waterShader = shader;
    };
    material.customProgramCacheKey = () => 'terra-depth-shoreline-water-v3-single-dielectric';
    return material;
  }

  _syncWaterDepth(force = false) {
    if (this._waterDepthEpoch !== this.terrain.detailEpoch) { this._waterDepthEpoch = this.terrain.detailEpoch; for (const pulse of this._waterRipples || []) pulse.set(0, 0, -100, 0); this._waterWheelHistory?.clear(); }
    for (const body of this.waterBodies || []) {
      const reset = force || body.depthEpoch !== this.terrain.detailEpoch;
      const rects = [];
      if (reset) { rects.push([0, body.width - 1, 0, body.height - 1]); body.depthTileRevisions.clear(); body.depthEpoch = this.terrain.detailEpoch; }
      for (const tile of this.terrain.detailTiles.values()) {
        if (tile.parentId !== body.id || body.depthTileRevisions.get(tile.key) === tile.revision) continue;
        if (!reset) rects.push([Math.max(0, Math.floor((tile.minX - body.patch.minX) / body.step) - 1), Math.min(body.width - 1, Math.ceil((tile.maxX - body.patch.minX) / body.step) + 1), Math.max(0, Math.floor((tile.minZ - body.patch.minZ) / body.step) - 1), Math.min(body.height - 1, Math.ceil((tile.maxZ - body.patch.minZ) / body.step) + 1)]);
        body.depthTileRevisions.set(tile.key, tile.revision);
      }
      for (const [x0, x1, z0, z1] of rects) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const h = this.terrain.heightAt(body.patch.minX + x * body.step, body.patch.minZ + z * body.step), code = Math.round(clamp((h + 8) / 64, 0, 1) * 65535), i = (z * body.width + x) * 4;
        body.bytes[i] = code >> 8; body.bytes[i + 1] = code & 255; body.bytes[i + 2] = 0; body.bytes[i + 3] = 255;
      }
      if (rects.length) body.depthTexture.needsUpdate = true;
    }
  }

  _updateWater(dt, state) {
    if (!this.waterBodies) return;
    if (this.clock - this._waterDepthSyncTime >= .10 || this.waterBodies.some(body => body.depthEpoch !== this.terrain.detailEpoch)) { this._syncWaterDepth(); this._waterDepthSyncTime = this.clock; }
    const velocity = state.velocity || { x: 0, z: 0 }, speed = Math.hypot(velocity.x || 0, velocity.z || 0);
    for (const [index, wheel] of (state.wheels || []).entries()) {
      const point = wheel.ground || wheel.position; if (!wheel.contact || !point) continue;
      const ground = this.terrain.sample(point.x, point.z); if (ground.waterDepth < .012) continue;
      const key = (state.vehicleId || this.spec?.id || '') + '-' + index, previous = this._waterWheelHistory.get(key), moved = previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0;
      if (previous && this.clock - previous.time < .11 || previous && moved < .18 && Math.abs(wheel.slip || 0) < .28 || !previous && speed < .25) continue;
      const direction = speed > .1 ? new THREE.Vector2(velocity.x / speed, velocity.z / speed) : new THREE.Vector2(Math.sin(state.heading || 0), Math.cos(state.heading || 0));
      const strength = clamp((speed * .13 + Math.abs(wheel.slip || 0) * .17) * Math.min(1, ground.waterDepth * 8), .025, 1);
      if (!previous || moved < 4) { const slot = this._waterRippleCursor++ % this._waterRipples.length; this._waterRipples[slot].set(point.x, point.z, this.clock, strength); this._waterMotions[slot].set(direction.x, direction.y, speed, ground.waterDepth); }
      this._waterWheelHistory.set(key, { x: point.x, z: point.z, time: this.clock });
    }
    if (this._waterWheelHistory.size > 24) this._waterWheelHistory.delete(this._waterWheelHistory.keys().next().value);
    for (const body of this.waterBodies) {
      body.level = body.baseLevel + this.terrain.moisture * (body.id === 'wetland' ? .06 : .05); body.mesh.position.y = body.level - body.baseLevel;
      for (const shader of body.shaders) { shader.uniforms.tdWaterTime.value = this.clock; shader.uniforms.tdWaterLevel.value = body.level; shader.uniforms.tdWaterRain.value = this.terrain.moisture; shader.uniforms.tdWaterReflectionReady.value = body.reflectionReady; }
    }
  }

  _waterReflectionCamera(body, camera) {
    // Horizontal mirror and oblique clipping follow Three r180 Water's MIT
    // implementation. Reflections use the real scene, including the vehicle.
    camera.updateMatrixWorld(true); const mirror = body.reflectionCamera, direction = new THREE.Vector3(); camera.getWorldDirection(direction);
    mirror.position.copy(camera.position); mirror.position.y = 2 * body.level - camera.position.y;
    const target = camera.position.clone().add(direction); target.y = 2 * body.level - target.y;
    mirror.up.set(0, 1, 0).applyQuaternion(camera.quaternion); mirror.up.y *= -1; mirror.lookAt(target); mirror.far = camera.far; mirror.near = camera.near; mirror.updateMatrixWorld(true); mirror.projectionMatrix.copy(camera.projectionMatrix);
    body.reflectionMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    // Plane's constructor retains a supplied normal by reference. Transforming
    // a Plane(UP, ...) mutated shared world-up every capture in v1.3, producing
    // wildly different clip matrices even for an entirely stationary camera.
    // Own and reset the plane normal; no capture may depend on the last one.
    const plane = new THREE.Plane().setComponents(0, 1, 0, -body.level).applyMatrix4(mirror.matrixWorldInverse), clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), p = mirror.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    const denominator = clip.dot(q); if (Math.abs(denominator) > 1e-7) { clip.multiplyScalar(2 / denominator); p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1 - .002; p[14] = clip.w; }
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert(); return mirror;
  }

  _renderWaterReflections() {
    if (!this.waterBodies || !this.renderer?.setRenderTarget) return;
    const candidates = this.waterBodies.filter(body => !body.reflectionFailed && this.camera.position.y > body.level + .05 && Math.hypot((this.camera.position.x - body.cx) / (body.rx + 35), (this.camera.position.z - body.cz) / (body.rz + 35)) < 1.7);
    const body = candidates.sort((a, b) => a.lastReflection - b.lastReflection)[0]; if (!body || this.clock - body.lastReflection < (this.quality === 'low' ? .23 : .12)) return;
    const renderer = this.renderer, target = renderer.getRenderTarget(), shadow = renderer.shadowMap.autoUpdate, shadowPending = renderer.shadowMap.needsUpdate, xr = renderer.xr.enabled, hidden = [];
    const face = renderer.getActiveCubeFace?.() || 0, mip = renderer.getActiveMipmapLevel?.() || 0;
    const viewport = renderer.getViewport?.(new THREE.Vector4()), scissor = renderer.getScissor?.(new THREE.Vector4()), scissorTest = renderer.getScissorTest?.();
    const mirror = this._waterReflectionCamera(body, this.camera);
    for (const object of this.waterBodies.map(item => item.mesh).concat([this.particles, this.rain, this.tireSpray?.group]).filter(Boolean)) { hidden.push([object, object.visible]); object.visible = false; }
    try {
      // A pending main-view shadow refresh must not be consumed from the mirror
      // camera: Three updates shadows when either of these two flags is true.
      renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(body.reflectionTarget); renderer.setScissorTest?.(false); renderer.state.buffers.depth.setMask(true); renderer.clear(); renderer.render(this.scene, mirror);
      body.reflectionReady = 1; body.lastReflection = this.clock;
      for (const shader of body.shaders) shader.uniforms.tdWaterReflectionReady.value = 1;
    } catch (error) {
      body.reflectionReady = 0; body.reflectionFailed = true;
      this.renderingIssues ||= []; this.renderingIssues.push({ kind: 'reflection', material: 'Water', message: String(error?.message || 'The scene reflection could not be rendered.').slice(0, 4000) }); if (this.renderingIssues.length > 6) this.renderingIssues.shift();
      for (const shader of body.shaders) shader.uniforms.tdWaterReflectionReady.value = 0;
    } finally {
      hidden.forEach(([object, visible]) => { object.visible = visible; }); renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadow; renderer.shadowMap.needsUpdate = shadowPending;
      if (viewport) renderer.setViewport(viewport); if (scissor) renderer.setScissor(scissor); if (scissorTest !== undefined) renderer.setScissorTest(scissorTest);
      // Bind last so a prior render target also recovers its own viewport,
      // scissor and face/mipmap rather than inheriting the reflection target's.
      renderer.setRenderTarget(target, face, mip);
    }
  }

  _sign(text, sub, x, z, number, size = 1) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#223e36'; ctx.fillRect(0, 0, 768, 256); ctx.fillStyle = '#d6cf9a'; ctx.fillRect(0, 0, 8, 256); ctx.fillStyle = '#d9dfca'; ctx.font = '600 46px Arial'; ctx.fillText(text.toUpperCase(), 44, 94); ctx.fillStyle = '#aabfa9'; ctx.font = '24px Arial'; ctx.fillText(sub, 46, 147); ctx.fillStyle = '#d2c387'; ctx.font = '600 20px Arial'; ctx.fillText(`TERRA DRIVE  /  ${String(number).padStart(2, '0')}`, 46, 212);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .90 });
    const groundY = this.terrain.heightAt(x, z), black = new THREE.MeshStandardMaterial({ color: '#303e35', roughness: .95 });
    const group = new THREE.Group(); group.position.set(x, groundY, z); group.name = 'damageable-sign-' + number; this.scene.add(group);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6 * size, 1.2 * size), material); sign.position.set(0, 1.93 * size, -.09); sign.rotation.y = Math.PI; sign.castShadow = true; group.add(sign);
    meshBox(group, black, 0, 1.93 * size, 0, 3.64 * size, 1.24 * size, .15);
    this.damageRecords ||= new Map(); this.signRecords ||= [];
    const record = { id: 'sign-' + number, type: 'sign', x, z, y: groundY, group, material, damage: 0, energy: 0, shakeAge: 10, shakeAmplitude: 0, push: new THREE.Vector3(0, 0, 1), obstacles: [], scars: new Set() }; this.signRecords.push(record);
    const addCollider = (part, localCenter, halfExtents) => {
      const obstacle = { id: record.id + '-' + part, x: x + localCenter.x, z: z + localCenter.z, type: 'sign', shape: 'box', center: { x: x + localCenter.x, y: groundY + localCenter.y, z: z + localCenter.z }, halfExtents, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
      record.obstacles.push({ obstacle, localCenter: new THREE.Vector3(localCenter.x, localCenter.y, localCenter.z) }); this.terrain.obstacles.push(obstacle); this.damageRecords.set(obstacle.id, record);
    };
    addCollider('board', { x: 0, y: 1.93 * size, z: 0 }, { x: 1.82 * size, y: .62 * size, z: .075 });
    for (const side of [-1, 1]) { meshBox(group, black, side * 1.29 * size, .98 * size, 0, .095, 1.97 * size, .095); addCollider(side < 0 ? 'left' : 'right', { x: side * 1.29 * size, y: .98 * size, z: 0 }, { x: .0475, y: .985 * size, z: .0475 }); }
    // These few meshes must remain movable after the static scenery merge.
    group.traverse(object => { object.userData.staticScenery = false; });
  }

  _createLandmarks() {
    this.terrain.zones.forEach((zone, i) => this._sign(zone.name, ['HARDPACK  /  OPEN TERRAIN', 'ACCELERATE  /  BRAKE  /  COMPARE', 'BOULDERS  /  ARTICULATION', 'SOFT SOIL  /  PERSISTENT RUTS', 'SHALLOW WATER  /  SOFT GROUND', 'LOOSE SAND  /  DUNES', 'LOOP  /  JUMPS  /  OBSTACLES'][i] || 'EXPLORE  /  COMPARE', zone.spawn.x - 6.3, zone.spawn.z + 7, i + 1));
    const building = new THREE.Group(), bx = -79, bz = -171, by = this.terrain.heightAt(bx, bz); building.position.set(bx, by, bz); this.scene.add(building);
    const charcoal = new THREE.MeshStandardMaterial({ color: '#36483e', roughness: .79, metalness: .12 }), roof = new THREE.MeshStandardMaterial({ color: '#282f2a', roughness: .64, metalness: .40 }), window = new THREE.MeshStandardMaterial({ color: '#8bafad', roughness: .18, metalness: .75 }), wood = new THREE.MeshStandardMaterial({ color: '#9f8759', roughness: .92 });
    meshBox(building, charcoal, 0, 1.6, 0, 10.5, 3.2, 6.3); meshBox(building, roof, 0, 3.29, 0, 11.4, .20, 7.1);
    for (let x = -4.9; x <= 4.95; x += .30) meshBox(building, wood, x, 1.58, -3.175, .041, 2.96, .045);
    for (const x of [-3.3, 0, 3.3]) meshBox(building, window, x, 1.80, -3.211, 2.58, 1.46, .055);
    meshBox(building, charcoal, 0, .80, -3.30, 1.07, 1.60, .075);
    const deck = new THREE.MeshStandardMaterial({ color: '#8d8063', roughness: .97 }); meshBox(building, deck, 0, .13, -4.05, 11.2, .26, 2.0);
    for (const x of [-5.0, 5.0]) meshBox(building, charcoal, x, 1.56, -4.56, .15, 3.12, .15);
    const canopy = meshBox(building, roof, 0, 3.13, -3.8, 11.4, .13, 2.4); canopy.rotation.x = .025;
    this._sign('Field Station', 'VEHICLE TESTING  /  PINE RIDGE', -78, -184, 0, 1.12);
    const obstacle = { id: 'building-field-station', x: bx, z: bz, radius: 6.0, height: 3.5, type: 'building', shape: 'box', center: { x: bx, y: by + 1.6, z: bz }, halfExtents: { x: 5.25, y: 1.6, z: 3.15 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
    this.terrain.obstacles.push(obstacle); this.damageRecords.set(obstacle.id, { id: obstacle.id, type: 'building', x: bx, y: by, z: bz, energy: 0, damage: 0, material: charcoal, originalColor: charcoal.color.clone() });
    // Boundary markers supply scale and a readable route at the approach to each zone.
    const post = new THREE.MeshStandardMaterial({ color: '#85816a', roughness: .94 }), stripe = new THREE.MeshStandardMaterial({ color: '#d1b774', roughness: .93 });
    for (const zone of this.terrain.zones.filter(z => z.id !== 'asphalt')) for (const side of [-1, 1]) {
      const x = zone.spawn.x + side * 3.8, z = zone.spawn.z + 2, y = this.terrain.heightAt(x, z);
      meshBox(this.scene, post, x, y + .41, z, .15, .82, .15); meshBox(this.scene, stripe, x, y + .74, z, .157, .10, .157);
    }
  }

  _createParticles() {
    this.tireSpray = new TireSprayView(this.scene, this.terrain);
    this.particles = this.tireSpray.fine;
    const rainPos = new Float32Array(720 * 6); this.rainSeeds = [];
    for (let i = 0; i < 720; i++) this.rainSeeds.push({ x: (hash(i, 1910) - .5) * 54, z: (hash(i, 1922) - .5) * 54, y: hash(i, 1933) * 32 });
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage)); this.rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#c8d4d1', transparent: true, opacity: .20, depthWrite: false })); this.rain.visible = false; this.rain.frustumCulled = false; this.scene.add(this.rain);
  }

  _addScuff(point, normal, size, color, anchor = null) {
    if (!this.damageMarks) {
      const geometry = new THREE.CircleGeometry(1, 12), position = geometry.attributes.position;
      for (let i = 1; i < position.count; i++) { const scale = .73 + hash(i, 614) * .27; position.setXY(i, position.getX(i) * scale, position.getY(i) * scale); }
      this.damageMarks = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .97, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }), 192);
      this.damageMarks.count = 0; this.damageMarks.frustumCulled = false; this.damageMarks.name = 'persistent-impact-scars'; this.scene.add(this.damageMarks); this._markData = []; this._markCursor = 0;
    }
    const slot = this._markCursor++ % 192, previous = this._markData[slot]; previous?.anchor?.scars?.delete(slot);
    const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize(), p = new THREE.Vector3(point.x, point.y, point.z).addScaledVector(n, .009);
    const data = { point: p, normal: n, size, anchor };
    if (anchor) {
      const q = (anchor.type === 'sign' ? anchor.group.quaternion : anchor.bendQuaternion || new THREE.Quaternion()).clone().invert();
      data.point.sub(new THREE.Vector3(anchor.x, anchor.y, anchor.z)).applyQuaternion(q); data.normal.applyQuaternion(q); anchor.scars.add(slot);
    }
    this._markData[slot] = data; this.damageMarks.count = Math.min(192, this._markCursor); this.damageMarks.setColorAt(slot, new THREE.Color(color)); this.damageMarks.instanceColor.needsUpdate = true; this._syncScuff(slot); return slot;
  }

  _impactMarkSurface(record, point, normal, obstacleId) {
    if (record.type === 'tree') {
      // Project onto the actual tapered trunk at the impact height, including
      // its existing lean; the trunk is narrower above its root.
      const matrix = new THREE.Matrix4(), meshes = this._treeMeshes(record); meshes.trunks.getMatrixAt(meshes.index, matrix);
      const inverse = matrix.clone().invert(), p = new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(inverse), toward = new THREE.Vector3(normal.x, normal.y, normal.z).transformDirection(inverse);
      p.y = clamp(p.y, -.49, .44); toward.y = 0; if (toward.lengthSq() < .001) toward.set(0, 0, 1); toward.normalize();
      const radius = 1 - (p.y + .5) * .75; p.x = toward.x * radius; p.z = toward.z * radius;
      const n = new THREE.Vector3(toward.x, .75, toward.z).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
      return { point: p.applyMatrix4(matrix), normal: n };
    }
    if (record.type === 'sign') {
      const entry = record.obstacles.find(item => item.obstacle.id === String(obstacleId)) || record.obstacles[0], q = record.group.quaternion, inverse = q.clone().invert();
      const p = new THREE.Vector3(point.x, point.y, point.z).sub(record.group.position).applyQuaternion(inverse), n = new THREE.Vector3(normal.x, normal.y, normal.z).applyQuaternion(inverse), extent = entry.obstacle.halfExtents, center = entry.localCenter;
      const axis = Math.abs(n.x) > Math.abs(n.z) && Math.abs(n.x) > Math.abs(n.y) ? 'x' : Math.abs(n.y) > Math.abs(n.z) ? 'y' : 'z', sign = Math.sign(n[axis]) || 1;
      for (const key of ['x', 'y', 'z']) p[key] = clamp(p[key], center[key] - extent[key] + .003, center[key] + extent[key] - .003);
      // The painted front plane sits 15 mm beyond the board collider face.
      const face = axis === 'z' && sign < 0 && entry === record.obstacles[0] ? .092 : extent[axis] + .002;
      p[axis] = center[axis] + sign * face; n.set(0, 0, 0); n[axis] = sign;
      return { point: p.applyQuaternion(q).add(record.group.position), normal: n.applyQuaternion(q) };
    }
    return { point, normal };
  }

  _syncScuff(slot) {
    const data = this._markData[slot]; if (!data) return;
    const p = data.point.clone(), n = data.normal.clone(), anchor = data.anchor;
    if (anchor) {
      const q = anchor.type === 'sign' ? anchor.group.quaternion : data.treeFallLocal ? anchor.fallQuaternion : anchor.bendQuaternion || new THREE.Quaternion();
      p.applyQuaternion(q).add(data.treeFallLocal ? anchor.fallRoot : new THREE.Vector3(anchor.x, anchor.y, anchor.z)); n.applyQuaternion(q);
    }
    tmp.position.copy(p);
    if (data.treeFallLocal && data.treeFallRotation) tmp.quaternion.copy(anchor.fallQuaternion).multiply(data.treeFallRotation);
    else { tmp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.normalize()); tmp.rotateZ(hash(slot, 621) * 2.1); }
    tmp.scale.set(data.size * .72, data.size, 1); tmp.updateMatrix(); this.damageMarks.setMatrixAt(slot, tmp.matrix); this.damageMarks.instanceMatrix.needsUpdate = true;
  }

  _poseTree(tree, angle = 0) {
    const { foliage, branches, trunks, index } = this._treeMeshes(tree);
    if (tree.broken) {
      const fall = tree.fall; if (!fall) return;
      syncTreeObstacle(tree.fallenObstacle);
      tree.fallRoot.set(fall.pivot.x, fall.pivot.y, fall.pivot.z);
      tree.fallQuaternion.set(fall.quaternion.x, fall.quaternion.y, fall.quaternion.z, fall.quaternion.w);
      const transform = new THREE.Matrix4().makeTranslation(fall.pivot.x, fall.pivot.y, fall.pivot.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(tree.fallQuaternion));
      const crownMatrix = transform.multiply(tree.fallCrownLocal);
      foliage.setMatrixAt(index, crownMatrix); branches.setMatrixAt(index, crownMatrix);
      tmp.position.set(fall.center.x, fall.center.y, fall.center.z); tmp.quaternion.copy(tree.fallQuaternion); tmp.scale.set(fall.radius, fall.length, fall.radius); tmp.updateMatrix(); trunks.setMatrixAt(index, tmp.matrix);
      foliage.instanceMatrix.needsUpdate = true; branches.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true;
      tree._fallPoseRevision = fall.revision;
      for (const slot of tree.scars) this._syncScuff(slot);
      return;
    }
    const axis = new THREE.Vector3(tree.push.z, 0, -tree.push.x), q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    if (tree.winchBend?.lengthSq() > 1e-10) { const magnitude = tree.winchBend.length(), winchAxis = new THREE.Vector3(tree.winchBend.z, 0, -tree.winchBend.x).normalize(); q.multiply(new THREE.Quaternion().setFromAxisAngle(winchAxis, magnitude)); }
    tree.bendQuaternion = q;
    const transform = new THREE.Matrix4().makeTranslation(tree.x, tree.y, tree.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-tree.x, -tree.y, -tree.z));
    const crownMatrix = transform.clone().multiply(tree.foliageMatrix);
    foliage.setMatrixAt(index, crownMatrix); branches.setMatrixAt(index, crownMatrix); trunks.setMatrixAt(index, transform.multiply(tree.trunkMatrix)); foliage.instanceMatrix.needsUpdate = true; branches.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true;
    for (const slot of tree.scars) this._syncScuff(slot);
  }

  getWinchAnchors() {
    return (this.treeRecords || []).filter(tree => !tree.broken).map(tree => ({ id: tree.id, x: tree.x, y: tree.y + .7, z: tree.z, radius: tree.obstacle.radius, height: tree.height, damage: tree.damage, standing: true }));
  }

  setWinchLoad(anchorId, force = null) {
    if (this._winchLoadedTree && this._winchLoadedTree.id !== anchorId) this._winchLoadedTree.winchForce?.set(0, 0, 0);
    const tree = anchorId ? this.damageRecords?.get(String(anchorId)) : null;
    this._winchLoadedTree = tree?.type === 'tree' && !tree.broken ? tree : null;
    if (!this._winchLoadedTree) return false;
    tree.winchForce ||= new THREE.Vector3(); tree.winchBend ||= new THREE.Vector3();
    tree.winchForce.set(Number.isFinite(force?.x) ? clamp(force.x, -100000, 100000) : 0, 0, Number.isFinite(force?.z) ? clamp(force.z, -100000, 100000) : 0);
    return true;
  }

  _breakTree(tree, impact = null) {
    if (tree.broken) return; tree.broken = true; tree.winchForce?.set(0, 0, 0); tree.winchBend?.set(0, 0, 0);
    if (this._winchLoadedTree === tree) this._winchLoadedTree = null;
    const radius = .19 + tree.height * .005, stumpHeight = .65;
    const trunkMatrix = new THREE.Matrix4(), crownMatrix = new THREE.Matrix4();
    const meshes = this._treeMeshes(tree);
    meshes.trunks.getMatrixAt(meshes.index, trunkMatrix); meshes.foliage.getMatrixAt(meshes.index, crownMatrix);
    const q = new THREE.Quaternion(), center = new THREE.Vector3(), scale = new THREE.Vector3(); trunkMatrix.decompose(center, q, scale);
    const direction = UP.clone().applyQuaternion(q), base = new THREE.Vector3(0, -.5, 0).applyMatrix4(trunkMatrix);
    const root = base.clone().addScaledVector(direction, stumpHeight), length = scale.y - stumpHeight;
    // Start at the exact existing crown/root orientation. The cut replaces
    // only the lower 65 cm with a stationary stump; no part jumps to the floor.
    tree.fall = createTreeFall({ pivot: root, quaternion: q, push: tree.push, length, radius, impact });
    tree.fallRoot = root; tree.fallQuaternion = q.clone();
    const referenceInverse = new THREE.Matrix4().makeTranslation(root.x, root.y, root.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).invert();
    tree.fallCrownLocal = referenceInverse.multiply(crownMatrix);
    const inverse = q.clone().invert(), bend = tree.bendQuaternion || new THREE.Quaternion();
    for (const slot of [...tree.scars]) {
      const data = this._markData[slot]; if (!data) continue;
      const worldPoint = data.point.clone().applyQuaternion(bend).add(new THREE.Vector3(tree.x, tree.y, tree.z));
      const worldNormal = data.normal.clone().applyQuaternion(bend), local = worldPoint.clone().sub(root).applyQuaternion(inverse);
      if (local.y < 0) { data.anchor = null; data.point.copy(worldPoint); data.normal.copy(worldNormal); tree.scars.delete(slot); }
      else {
        const markMatrix = new THREE.Matrix4(), markQ = new THREE.Quaternion(); this.damageMarks.getMatrixAt(slot, markMatrix); markMatrix.decompose(new THREE.Vector3(), markQ, new THREE.Vector3());
        data.point.copy(local); data.normal.copy(worldNormal.applyQuaternion(inverse)); data.treeFallLocal = true; data.treeFallRotation = inverse.clone().multiply(markQ);
      }
    }
    tmp.position.copy(base).addScaledVector(direction, stumpHeight * .5); tmp.quaternion.copy(q); tmp.scale.set(radius, stumpHeight, radius); tmp.updateMatrix(); this.stumps.setMatrixAt(this.stumps.count++, tmp.matrix); this.stumps.instanceMatrix.needsUpdate = true;
    tree.obstacle.height = stumpHeight; tree.obstacle.radius = radius;
    tree.obstacle.center = { x: tmp.position.x, y: tmp.position.y, z: tmp.position.z }; tree.obstacle.quaternion = { x: q.x, y: q.y, z: q.z, w: q.w };
    const log = { id: tree.id + '-fallen-log', type: 'tree', damageDebris: true, shape: 'box',
      halfExtents: { x: radius, y: length * .5, z: radius }, hardness: .7, treeFall: tree.fall };
    tree.fallenObstacle = log; syncTreeObstacle(log);
    this.terrain.obstacles.push(log); this.damageRecords.set(log.id, tree); this.terrain.obstacleRevision++;
    const cutSlot = this._addScuff(root, direction.clone().negate(), radius * .92, '#d5ad72');
    const cut = this._markData[cutSlot]; cut.anchor = tree; cut.treeFallLocal = true; cut.point.set(0, -.009, 0); cut.normal.set(0, -1, 0);
    cut.treeFallRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), cut.normal).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), hash(cutSlot, 621) * 2.1)); tree.scars.add(cutSlot);
    this._poseTree(tree);
  }

  _poseSign(record, angle, updateColliders = false) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(record.push.z, 0, -record.push.x), angle); record.group.quaternion.copy(q);
    if (updateColliders) {
      for (const entry of record.obstacles) {
        const center = entry.localCenter.clone().applyQuaternion(q).add(record.group.position); entry.obstacle.center = { x: center.x, y: center.y, z: center.z }; entry.obstacle.x = center.x; entry.obstacle.z = center.z; entry.obstacle.quaternion = { x: q.x, y: q.y, z: q.z, w: q.w };
      }
      this.terrain.obstacleRevision++;
    }
    for (const slot of record.scars) this._syncScuff(slot);
  }

  _updateObjectDamage(dt, state) {
    this.seenImpacts ||= new Set(); this.damageRecords ||= new Map();
    for (const impact of state.impacts || []) {
      if (this.seenImpacts.has(impact.id)) continue; this.seenImpacts.add(impact.id);
      if (this.seenImpacts.size > 1024) this.seenImpacts.delete(this.seenImpacts.values().next().value);
      const record = this.damageRecords.get(String(impact.obstacleId)), speed = Math.max(0, impact.speed || 0), energy = Math.max(0, impact.energy || 0), point = impact.point, normal = impact.normal;
      if (!point || !normal) continue;
      if (!record) {
        if (['rock', 'landing', 'terrain'].includes(impact.obstacleType) && this.terrain.surfaceAt(point.x, point.z) === 'rock' && speed > 2) { const sample = this.terrain.sample(point.x, point.z); this._addScuff({ x: point.x, y: sample.height + .008, z: point.z }, sample.normal, clamp(.12 + energy / 65000, .12, .48), '#d0cbc0'); }
        continue;
      }
      if (record.type === 'tree' || record.type === 'sign') {
        if (record.broken) continue;
        record.push.set(-normal.x, 0, -normal.z); if (record.push.lengthSq() < .001) record.push.set(0, 0, 1); else record.push.normalize();
        record.shakeAmplitude = Math.max(record.shakeAmplitude * Math.exp(-record.shakeAge * 2.3), clamp(speed * .014 + .005, .008, record.type === 'tree' ? .16 : .12)); record.shakeAge = 0;
        if (speed > 1.25) record.energy += energy;
        const threshold = record.type === 'tree' ? 65000 + record.height * 3500 : 5200;
        record.damage = clamp(record.energy / threshold, 0, 1);
        if (speed > .8) {
          const projected = this._impactMarkSurface(record, point, normal, impact.obstacleId);
          this._addScuff(projected.point, projected.normal, clamp(.08 + speed * .035, .10, .42), record.type === 'tree' ? '#b68c59' : '#92948c', record);
        }
        if (record.type === 'tree') {
          const damagedBark = new THREE.Color('#ffffff').lerp(new THREE.Color('#95725a'), record.damage * .65);
          this._tintTree(record, damagedBark);
          if (record.damage >= 1) this._breakTree(record, impact);
        } else { record.material.color.setRGB(1 - record.damage * .30, 1 - record.damage * .32, 1 - record.damage * .34); this._poseSign(record, record.damage * 1.22, true); }
      } else if (record.type === 'building' && speed > .8) {
        record.energy += energy; record.damage = clamp(record.energy / 250000, 0, 1);
        const n = new THREE.Vector3(normal.x, 0, normal.z), p = new THREE.Vector3(point.x, clamp(point.y, record.y + .2, record.y + 3.0), point.z);
        if (Math.abs(n.x) > Math.abs(n.z)) { n.set(Math.sign(n.x) || 1, 0, 0); p.x = record.x + n.x * 5.255; p.z = clamp(p.z, record.z - 3.10, record.z + 3.10); }
        else { n.set(0, 0, Math.sign(n.z) || 1); p.z = record.z + n.z * 3.218; p.x = clamp(p.x, record.x - 5.20, record.x + 5.20); }
        this._addScuff(p, n, clamp(.12 + speed * .045, .16, .65), '#8c8e82'); record.material.color.copy(record.originalColor).multiplyScalar(1 - record.damage * .10);
      }
    }
    // Elastic motion decays while the accumulated scar and permanent bend stay.
    for (const record of this.treeRecords || []) {
      if (record.broken) {
        if (record.fall && record._fallPoseRevision !== record.fall.revision) this._poseTree(record);
        continue;
      }
      const pulling = record.winchForce?.lengthSq() > .01 || record.winchBend?.lengthSq() > 1e-10;
      if (record.shakeAge > 5 && !pulling) continue;
      record.shakeAge += dt;
      if (pulling) { const target = (record.winchForce || new THREE.Vector3()).clone().multiplyScalar(.00000065 * Math.pow(.30 / record.obstacle.radius, 3)); target.clampLength(0, .038); record.winchBend.lerp(target, 1 - Math.exp(-Math.max(0, dt) * 6)); if (record.winchBend.lengthSq() < 1e-10) record.winchBend.set(0, 0, 0); }
      this._poseTree(record, record.damage * .045 + record.shakeAmplitude * Math.exp(-record.shakeAge * 2.3) * Math.sin(record.shakeAge * 9));
    }
    for (const record of this.signRecords || []) {
      if (record.shakeAge > 5) continue; record.shakeAge += dt;
      this._poseSign(record, record.damage * 1.22 + record.shakeAmplitude * Math.exp(-record.shakeAge * 3.1) * Math.sin(record.shakeAge * 12));
    }
  }

  resetDamage() {
    // IDs remain seen across resets; a frame with an old physics snapshot must
    // not repaint its old impact. Physics restart also clears its event history.
    for (const record of this.treeRecords || []) {
      if (record.broken) this.damageRecords.delete(record.id + '-fallen-log');
      for (const key of Object.keys(record.obstacle)) if (!(key in record.originalObstacle)) delete record.obstacle[key];
      Object.assign(record.obstacle, record.originalObstacle); record.energy = 0; record.damage = 0; record.broken = false; record.fall = null; record.fallenObstacle = null; record._fallPoseRevision = null; record.fallCrownLocal = null; record.shakeAge = 10; record.shakeAmplitude = 0; record.winchForce?.set(0, 0, 0); record.winchBend?.set(0, 0, 0); record.scars.clear(); this._poseTree(record, 0); this._tintTree(record, new THREE.Color('#ffffff'));
    }
    for (const record of this.signRecords || []) { record.energy = 0; record.damage = 0; record.shakeAge = 10; record.shakeAmplitude = 0; record.scars.clear(); record.material.color.set('#ffffff'); this._poseSign(record, 0, true); }
    for (const record of this.damageRecords?.values() || []) if (record.type === 'building') { record.energy = 0; record.damage = 0; record.material.color.copy(record.originalColor); }
    this.terrain.obstacles = (this.terrain.obstacles || []).filter(obstacle => !obstacle.damageDebris); this.terrain.obstacleRevision++;
    if (this.stumps) this.stumps.count = 0; if (this.damageMarks) { this.damageMarks.count = 0; this._markCursor = 0; this._markData = []; } if (this.trunks?.instanceColor) this.trunks.instanceColor.needsUpdate = true; if (this.branches?.instanceColor) this.branches.instanceColor.needsUpdate = true;
  }

  _updateParticles(dt, state) {
    if (dt <= 0) return;
    this.tireSpray?.update(dt, state, this.quality, this.camera);
    for (const impact of this.tireSpray?.simulation.impacts || []) {
      if (!this._waterRipples?.length) break;
      const slot = this._waterRippleCursor++ % this._waterRipples.length;
      this._waterRipples[slot].set(impact.x, impact.z, this.clock, impact.strength);
      this._waterMotions[slot].set(0, 0, 0, .06);
    }
    // Fine dust, sand, mist and powder now share contact interpolation and
    // collision handling in TireSpray; the old uncoupled dust pool stays empty.
    if (this.rain.visible) {
      const arr = this.rain.geometry.attributes.position.array;
      this.rainSeeds.forEach((p, i) => { const y = ((p.y - this.clock * 17) % 32 + 32) % 32; const offset = i * 6; arr[offset] = state.position.x + p.x; arr[offset + 1] = state.position.y + y - 2; arr[offset + 2] = state.position.z + p.z; arr[offset + 3] = arr[offset] - .10; arr[offset + 4] = arr[offset + 1] - .85; arr[offset + 5] = arr[offset + 2] + .06; }); this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  _syncDeformation() {
    for (const p of this.terrain.patches) {
      const record = this.groundMeshes.get(p.id); if (!p.dirty) continue;
      if (record.revision === p.revision) { p.dirty = null; continue; }
      const geo = record.mesh.geometry, positions = geo.attributes.position.array, colors = geo.attributes.color.array, normals = geo.attributes.normal.array, stride = p.nx + 1, d = p.dirty;
      const x0 = Math.max(0, d.x0 - 1), x1 = Math.min(p.nx, d.x1 + 1), z0 = Math.max(0, d.z0 - 1), z1 = Math.min(p.nz, d.z1 + 1);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = z * stride + x; positions[i * 3 + 1] = p.base[i] + p.delta[i]; const shade = clamp(1 + p.delta[i] * 1.15, .53, 1);
        colors[i * 3] = record.baseColors[i * 3] * shade; colors[i * 3 + 1] = record.baseColors[i * 3 + 1] * shade; colors[i * 3 + 2] = record.baseColors[i * 3 + 2] * shade;
      }
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = z * stride + x, l = z * stride + Math.max(0, x - 1), r = z * stride + Math.min(p.nx, x + 1), a = Math.max(0, z - 1) * stride + x, b = Math.min(p.nz, z + 1) * stride + x;
        const nx = (p.base[l] + p.delta[l] - p.base[r] - p.delta[r]) / ((x > 0 && x < p.nx ? 2 : 1) * p.step), nz = (p.base[a] + p.delta[a] - p.base[b] - p.delta[b]) / ((z > 0 && z < p.nz ? 2 : 1) * p.step), inv = 1 / Math.hypot(nx, 1, nz);
        normals[i * 3] = nx * inv; normals[i * 3 + 1] = inv; normals[i * 3 + 2] = nz * inv;
      }
      const first = (z0 * stride + x0) * 3, length = ((z1 - z0) * stride + x1 - x0 + 1) * 3;
      for (const name of ['position', 'normal', 'color']) { const attr = geo.attributes[name]; queueAttributeRange(attr, first, length); attr.needsUpdate = true; }
      record.revision = p.revision; p.dirty = null;
    }
    this._syncDetailTerrain();
    this.groundCoverContact?.update();
  }

  _detailChunk(parentId) {
    // Sixteen local tiles share one draw call. A hard tile budget also bounds
    // geometry storage; old tracks are never silently evicted.
    let chunk = this.detailChunks.find(c => c.parentId === parentId && c.count < 16);
    if (chunk) return chunk;
    const n = this.terrain.detailDivisions, vertices = (n + 1) ** 2, indicesPerTile = n * n * 6, capacity = 16;
    const geo = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2], ['aSoil', 4], ['aGeology', 3]]) geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(vertices * capacity * size), size).setUsage(THREE.DynamicDrawUsage));
    const indices = new Uint16Array(indicesPerTile * capacity);
    for (let slot = 0; slot < capacity; slot++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const a = slot * vertices + z * (n + 1) + x, c = a + n + 1, k = slot * indicesPerTile + (z * n + x) * 6;
      indices.set([a, c, a + 1, a + 1, c, c + 1], k);
    }
    geo.setIndex(new THREE.BufferAttribute(indices, 1)); geo.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(geo, this.terrainMaterials[parentId]); mesh.name = 'persistent-soil-' + parentId; mesh.receiveShadow = mesh.castShadow = true;
    this.scene.add(mesh); chunk = { mesh, parentId, vertices, indicesPerTile, count: 0, bounds: new THREE.Box3() }; this.detailChunks.push(chunk); return chunk;
  }

  _syncDetailTerrain() {
    this.detailMeshes ||= new Map(); this.detailChunks ||= [];
    if (this._detailEpoch !== this.terrain.detailEpoch) {
      for (const chunk of this.detailChunks) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); }
      this.detailChunks.length = 0; this.detailMeshes.clear(); this._detailEpoch = this.terrain.detailEpoch;
      for (const record of this.groundMeshes.values()) { record.mesh.geometry.index.array.set(record.fullIndices); record.mesh.geometry.index.needsUpdate = true; }
    }
    const dirtyChunks = new Set();
    for (const p of this.terrain.detailTiles.values()) {
      let record = this.detailMeshes.get(p.key);
      if (!record) {
        const chunk = this._detailChunk(p.parentId), offset = chunk.count++ * chunk.vertices;
        record = { chunk, offset, revision: -1 }; this.detailMeshes.set(p.key, record);
        chunk.mesh.geometry.setDrawRange(0, chunk.count * chunk.indicesPerTile);
        // Remove the coarse triangles covered by this fine patch. The same
        // triangle winding/interpolation is used by Terrain.heightAt().
        const parent = p.parentId === 'base' ? this.terrain.baseGrid : this.terrain.patches.find(q => q.id === p.parentId), coarseRecord = this.groundMeshes.get(p.parentId), coarse = coarseRecord.mesh.geometry;
        const x0 = Math.round((p.minX - parent.minX) / parent.step), z0 = Math.round((p.minZ - parent.minZ) / parent.step), cells = Math.round(this.terrain.detailSize / parent.step);
        for (let z = z0; z < z0 + cells; z++) for (let x = x0; x < x0 + cells; x++) { const k = coarseRecord.cellIndexOffsets[z * parent.nx + x]; if (k < 0 || k === undefined) continue; const a = coarse.index.array[k]; coarse.index.array.fill(a, k, k + 6); }
        coarse.index.needsUpdate = true;
        p.dirty = { x0: 0, x1: p.nx, z0: 0, z1: p.nz };
      }
      if (record.revision === p.revision && !p.dirty) continue;
      const geo = record.chunk.mesh.geometry, stride = p.nx + 1, d = p.dirty || { x0: 0, x1: p.nx, z0: 0, z1: p.nz };
      const x0 = Math.max(0, d.x0 - 1), x1 = Math.min(p.nx, d.x1 + 1), z0 = Math.max(0, d.z0 - 1), z1 = Math.min(p.nz, d.z1 + 1);
      dirtyChunks.add(record.chunk);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = z * stride + x, j = record.offset + i, wx = p.minX + x * p.step, wz = p.minZ + z * p.step, h = p.base[i] + p.delta[i];
        geo.attributes.position.setXYZ(j, wx, h, wz); geo.attributes.uv.setXY(j, wx / 3, wz / 3);
        const shade = .91 + noise(wx * .08, wz * .08) * .12; geo.attributes.color.setXYZ(j, shade, shade, shade);
        geo.attributes.aSoil.setXYZW(j, p.compaction[i], p.tread[i], p.delta[i], p.churn[i]);
        const features = this.terrain.geologyAt?.(wx, wz);
        geo.attributes.aGeology.setXYZ(j, features?.stone || 0, features?.rut || 0, features?.shoulder || 0);
        const nx = (this.terrain.heightAt(wx - p.step, wz) - this.terrain.heightAt(wx + p.step, wz)) / (2 * p.step), nz = (this.terrain.heightAt(wx, wz - p.step) - this.terrain.heightAt(wx, wz + p.step)) / (2 * p.step), inv = 1 / Math.hypot(nx, 1, nz);
        geo.attributes.normal.setXYZ(j, nx * inv, inv, nz * inv);
        record.chunk.bounds.expandByPoint(new THREE.Vector3(wx, h, wz));
      }
      const first = record.offset + z0 * stride + x0, length = (z1 - z0) * stride + x1 - x0 + 1;
      for (const attr of Object.values(geo.attributes)) { queueAttributeRange(attr, first * attr.itemSize, length * attr.itemSize); attr.needsUpdate = true; }
      record.revision = p.revision; p.dirty = null;
    }
    for (const chunk of dirtyChunks) { chunk.mesh.geometry.boundingBox = chunk.bounds.clone(); chunk.mesh.geometry.boundingSphere = chunk.bounds.getBoundingSphere(new THREE.Sphere()); }
  }

  _bindCamera() {
    let down = false, lastX = 0, lastY = 0;
    this.canvas.addEventListener('pointerdown', event => { if (this._paused || document.querySelector('dialog[open]') || event.button !== 0 && event.button !== 2) return; down = true; lastX = event.clientX; lastY = event.clientY; this.canvas.setPointerCapture?.(event.pointerId); });
    this.canvas.addEventListener('pointermove', event => { if (!down || this._paused || document.querySelector('dialog[open]')) return; const dx = event.clientX - lastX, dy = event.clientY - lastY; lastX = event.clientX; lastY = event.clientY; this.orbitYaw -= dx * .006; this.orbitPitch = clamp(this.orbitPitch + dy * .004, -.1, 1.14); if (this.cameraMode === 'free') { this.freeYaw -= dx * .004; this.freePitch = clamp(this.freePitch - dy * .003, -1.45, 1.45); } });
    const release = () => { down = false; }; this.canvas.addEventListener('pointerup', release); this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('wheel', event => { this.cameraDistance = clamp(this.cameraDistance + event.deltaY * .007, 4.4, 28); event.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', event => { if (this._paused || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || event.target?.matches?.('input,textarea,select')) return; this._freeKeys.add(event.code); }); window.addEventListener('keyup', event => this._freeKeys.delete(event.code)); window.addEventListener('blur', () => this._freeKeys.clear());
  }

  setVehicle(spec) { this.vehicle?.dispose(); this.vehicle = new VehicleView(this.scene, spec); this.tireSpray?.setVehicle(this.vehicle); this.spec = spec; this.cameraDistance = spec.bodyStyle === 'van' ? 11.8 : 9.5; this._snapCamera = true; }
  setCameraMode(mode) { if (mode !== this.cameraMode) { this.cameraMode = mode; this._cameraChanged = true; } }
  resetCamera() { this.orbitYaw = -.28; this.orbitPitch = .38; this.cameraDistance = this.spec?.bodyStyle === 'van' ? 11.8 : 9.5; this._snapCamera = true; this._loopCameraHold = 0; this.tireSpray?.clear(); }
  setWeather(weather) {
    this.weather = weather; this.terrain.setWeather(weather); const wet = weather === 'rain' || weather === 'wet';
    this.sky.material.uniforms.wet.value = wet ? 1 : weather === 'overcast' ? .65 : 0; this.sun.intensity = wet ? .8 : weather === 'overcast' ? 1.7 : this.timeOfDay === 'sunset' ? 3.0 : 3.2; this.hemisphere.intensity = wet ? 1.7 : this.timeOfDay === 'sunset' ? 1.05 : 1.30;
    this.scene.fog.density = wet ? WORLD_VISIBILITY.wetFog : WORLD_VISIBILITY.dryFog; this.scene.fog.color.set(wet ? '#a7b4b6' : this.timeOfDay === 'sunset' ? '#c5c7b9' : '#bccbd0'); this.rain.visible = weather === 'rain';
    for (const shader of this._terrainShaders || []) shader.uniforms.tdWet.value = this.terrain.moisture;
    this.scene.environmentIntensity = this._hasPhotoEnvironment ? wet ? .38 : .65 : wet ? .48 : .75;
    this.water.position.y = this.terrain.moisture * .06;
  }

  setTimeOfDay(time) {
    this.timeOfDay = time; const sunset = time === 'sunset';
    this.sky.material.uniforms.upper.value.set(sunset ? '#759cac' : '#619aca'); this.sky.material.uniforms.horizon.value.set(sunset ? '#e9d3ad' : '#d5e2e7');
    this.sun.color.set(sunset ? '#ffd2a0' : '#fff2de'); this.sunOffset.copy(outdoorSunOffset(time));
    this.sky.material.uniforms.sunDirection.value.copy(this.sunOffset).normalize();
    this.renderer.toneMappingExposure = sunset ? 1.08 : 1.02;
    this._loadOutdoorEnvironment();
    this.setWeather(this.weather);
  }

  setQuality(quality) {
    this.quality = quality; if (this.groundProximity) { this.groundProximity.radius = quality === 'high' ? 54 : 44; this._nearDetailState = null; } this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'medium' ? 1.25 : 1.65)); this.renderer.shadowMap.enabled = quality !== 'low'; this.grass.visible = quality !== 'low';
    if (this.groundProximity) for (const mesh of [this.groundProximity.grass, this.groundProximity.sedge, this.groundProximity.dry, this.groundProximity.gravel, this.groundProximity.importedRocks]) mesh.visible = quality !== 'low';
    for (const shader of this._terrainShaders || []) if (shader.uniforms.tdDetail) shader.uniforms.tdDetail.value = quality === 'low' ? 0 : 1; this.resize();
  }

  _updateCamera(dt, state, opts) {
    const p = state.position, q = state.quaternion || { x: 0, y: 0, z: 0, w: 1 };
    const orientation = new THREE.Quaternion(q.x, q.y, q.z, q.w), bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation);
    this._forward.set(0, 0, 1).applyQuaternion(orientation); const heading = Math.atan2(this._forward.x, this._forward.z);
    const onLoop = (state.wheels || []).some(w => w.contact && w.featureId === 'loop');
    this._loopCameraHold = onLoop ? .85 : Math.max(0, (this._loopCameraHold || 0) - dt);
    const trackLoop = this.cameraMode === 'chase' && this._loopCameraHold > 0;
    if (this.cameraMode === 'hood' || this.cameraMode === 'driver' || trackLoop) this.camera.up.copy(bodyUp);
    else {
      const recovery = new THREE.Quaternion().setFromUnitVectors(this.camera.up, UP);
      const rotation = new THREE.Quaternion().slerp(recovery, 1 - Math.exp(-Math.max(dt, .001) * 4));
      this.camera.up.applyQuaternion(rotation).normalize();
    }
    if (this.cameraMode === 'free') {
      if (this._cameraChanged || this.freeYaw === undefined) { this.freeYaw = heading; this.freePitch = -.15; this._cameraChanged = false; }
      const speed = (this._freeKeys.has('ShiftLeft') ? 45 : 15) * dt, forward = new THREE.Vector3(Math.sin(this.freeYaw), 0, Math.cos(this.freeYaw)), right = new THREE.Vector3(-Math.cos(this.freeYaw), 0, Math.sin(this.freeYaw));
      if (this._freeKeys.has('KeyI')) this.camera.position.addScaledVector(forward, speed); if (this._freeKeys.has('KeyK')) this.camera.position.addScaledVector(forward, -speed); if (this._freeKeys.has('KeyL')) this.camera.position.addScaledVector(right, speed); if (this._freeKeys.has('KeyJ')) this.camera.position.addScaledVector(right, -speed); if (this._freeKeys.has('KeyU')) this.camera.position.y += speed; if (this._freeKeys.has('KeyO')) this.camera.position.y -= speed;
      this.camera.position.y = Math.max(this.terrain.heightAt(this.camera.position.x, this.camera.position.z) + .6, this.camera.position.y);
      this._look.set(Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), Math.cos(this.freeYaw) * Math.cos(this.freePitch)).add(this.camera.position); this.camera.lookAt(this._look); return;
    }
    if (this.cameraMode === 'hood' || this.cameraMode === 'driver') {
      // Camera sits outside the windscreen, above the hood; no opaque cabin panels obstruct it.
      const van = this.spec.bodyStyle === 'van', sedan = this.spec.bodyStyle === 'sedan', hummer = this.spec.bodyStyle === 'hummer', zOffset = (.5 - this.spec.frontWeightFraction) * this.spec.wheelbase;
      const local = new THREE.Vector3(.28, (van ? 1.68 : sedan ? 1.07 : hummer ? 1.72 : 1.45) - this.spec.cgHeight, (van ? 2.44 : sedan ? 1.30 : hummer ? 1.44 : 1.12) + zOffset), quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      local.applyQuaternion(quat).add(new THREE.Vector3(p.x, p.y, p.z)); this.camera.position.copy(local); this._look.copy(local).addScaledVector(this._forward, 18).addScaledVector(bodyUp, -.5); this.camera.lookAt(this._look); return;
    }
    if (trackLoop) {
      // A short body-relative camera stays inside the crown. World-horizontal
      // yaw is undefined at a vertical climb and used to flip at the top.
      this._desired.set(0, 2.7, -5.8).applyQuaternion(orientation).add(new THREE.Vector3(p.x, p.y, p.z));
      this._look.set(p.x, p.y, p.z).addScaledVector(this._forward, 2.5).addScaledVector(bodyUp, .4);
      const factor = this._snapCamera ? 1 : 1 - Math.exp(-dt * 13);
      this.camera.position.lerp(this._desired, factor); this._cameraLook.lerp(this._look, factor); this.camera.lookAt(this._cameraLook);
      this._snapCamera = false; this._cameraChanged = false; return;
    }
    const yaw = (this.cameraMode === 'orbit' ? 0 : heading) + this.orbitYaw, distance = this.cameraDistance;
    this._look.set(p.x, p.y + .50, p.z).addScaledVector(this._forward, this.cameraMode === 'chase' ? 1.85 : 0);
    this._desired.set(p.x - Math.sin(yaw) * distance * Math.cos(this.orbitPitch), p.y + Math.sin(this.orbitPitch) * distance + 1.15, p.z - Math.cos(yaw) * distance * Math.cos(this.orbitPitch));
    this._desired.y = Math.max(this._desired.y, this.terrain.heightAt(this._desired.x, this._desired.z) + 1.0);
    const snap = this._snapCamera || this.camera.position.distanceTo(this._desired) > 44, factor = snap ? 1 : 1 - Math.exp(-dt * 5.6);
    this.camera.position.lerp(this._desired, factor); this._cameraLook.lerp(this._look, snap ? 1 : 1 - Math.exp(-dt * 8)); this.camera.lookAt(this._cameraLook); this._snapCamera = false; this._cameraChanged = false;
  }

  update(dt, state, opts = {}) {
    if (!state?.position) return; dt = clamp(dt, 0, .08); this._paused = dt === 0; if (this._paused) this._freeKeys.clear(); this.clock += dt;
    this._applyRenderingFallbacks();
    const cameraMode = opts.camera || opts.cameraMode; if (cameraMode) this.setCameraMode(cameraMode);
    if (opts.weather && opts.weather !== this.weather) this.setWeather(opts.weather); if (opts.quality && opts.quality !== this.quality) this.setQuality(opts.quality);
    if (opts.timeOfDay && opts.timeOfDay !== this.timeOfDay) this.setTimeOfDay(opts.timeOfDay);
    this.vehicle?.update(state, opts); this._syncDeformation(); this._updateObjectDamage(dt, state); this._updateWater(dt, state); this._updateCamera(dt, state, opts); this._updateParticles(dt, state);
    const p = state.position; this.sun.position.set(p.x + this.sunOffset.x, p.y + this.sunOffset.y, p.z + this.sunOffset.z); this.sun.target.position.set(p.x, p.y, p.z);
    this.headlight.intensity = opts.headlights ? 38 : 0; this.headlight.position.set(p.x + this._forward.x * 1.8, p.y + .30, p.z + this._forward.z * 1.8); this.headlight.target.position.set(p.x + this._forward.x * 25, p.y - 1, p.z + this._forward.z * 25);
    this._updateGroundProximity(this.cameraMode === 'free' ? this.camera.position : state.position);
    for (const shader of this._grassShaders || []) shader.uniforms.tdWindTime.value = this.clock;
    this._renderWaterReflections();
    this.renderer.render(this.scene, this.camera);
  }

  resize() { const width = this.canvas.clientWidth || window.innerWidth, height = this.canvas.clientHeight || window.innerHeight; this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); }

  dispose() {
    this._disposed = true; this.vehicle?.dispose();
    const geometries = new Set(), materials = new Set(), textures = new Set(this._textures?.values() || []);
    this.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); const objectMaterials = [...(Array.isArray(object.material) ? object.material : object.material ? [object.material] : []), object.customDepthMaterial, object.customDistanceMaterial].filter(Boolean); for (const material of objectMaterials) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); } });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    for (const body of this.waterBodies || []) { body.depthTexture.dispose(); body.reflectionTarget.dispose(); }
    const environments = new Set([this.environment, this._startupEnvironment, ...(this._outdoorEnvironments?.values() || [])]);
    for (const environment of environments) environment?.dispose();
    this.scene.clear(); this.renderer.dispose();
  }
}
