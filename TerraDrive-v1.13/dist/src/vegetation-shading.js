import * as THREE from '../vendor/three.module.js';

// Opaque alpha-tested needles need a small thin-leaf response on their unlit
// side. Use the stock, already shadowed incident light and photographic diffuse
// color. This is a bounded foliage approximation, not an emissive fill or a
// replacement for the ordinary PBR response. Bark remains fully opaque.
const NEEDLE_LIGHTING = /* glsl */`
uniform float tdNeedleTransmission;
void tdNeedleDirect(const in IncidentLight light,
  const in vec3 position, const in vec3 normal, const in vec3 view,
  const in vec3 coatNormal, const in PhysicalMaterial material,
  inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(light,position,normal,view,coatNormal,material,reflectedLight);
  float backFacing=clamp((.3-dot(normal,light.direction))/1.3,0.,1.);
  float throughLeaf=max(dot(view,-light.direction),0.);
  float lobe=backFacing*(.68+.32*throughLeaf*throughLeaf);
  reflectedLight.directDiffuse+=BRDF_Lambert(material.diffuseColor)
    *light.color*(tdNeedleTransmission*lobe);
}
#undef RE_Direct
#define RE_Direct tdNeedleDirect
`;

export function createNeedleMaterial(properties={}) {
  const material=new THREE.MeshStandardMaterial(properties);
  const transmission={value:.62};
  material.userData.needleTransmission=transmission;
  material.onBeforeCompile=shader=>{
    shader.uniforms.tdNeedleTransmission=transmission;
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      '#include <lights_physical_pars_fragment>\n'+NEEDLE_LIGHTING);
  };
  material.customProgramCacheKey=()=> 'terra-thin-needle-v8';
  return material;
}

// Bend in world metres, after instance scaling. The same projection is used
// for visible leaves and shadow casters; roots have exactly zero bend weight.
const PLANT_PROJECTION = /* glsl */`
vec4 tdPlantWorld=vec4(transformed,1.);
#ifdef USE_BATCHING
  tdPlantWorld=batchingMatrix*tdPlantWorld;
#endif
#ifdef USE_INSTANCING
  tdPlantWorld=instanceMatrix*tdPlantWorld;
#endif
tdPlantWorld=modelMatrix*tdPlantWorld;
float tdGust=sin(tdPlantWorld.x*.17+tdPlantWorld.z*.11+tdWindTime*1.7)*.67
  +sin(tdWindTime*.69+tdPlantWorld.z*.23)*.33;
tdPlantWorld.xz+=vec2(1.,.4)*tdGust*aPlantBend*tdWindStrength;
vec4 mvPosition=viewMatrix*tdPlantWorld;
gl_Position=projectionMatrix*mvPosition;
`;

function installWind(world, material, strength) {
  const priorCompile=material.onBeforeCompile, priorKey=material.customProgramCacheKey();
  material.onBeforeCompile=shader=>{
    priorCompile.call(material,shader);
    shader.uniforms.tdWindTime={value:world.clock||0};
    shader.uniforms.tdWindStrength={value:strength};
    shader.vertexShader='attribute float aPlantBend; uniform float tdWindTime, tdWindStrength;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',PLANT_PROJECTION)
      .replace('#include <worldpos_vertex>','vec4 worldPosition=tdPlantWorld;');
    world._grassShaders||=[];world._grassShaders.push(shader);
  };
  material.customProgramCacheKey=()=>`terra-rooted-plant-v15-${material.type}-${priorKey}`;
  material.userData.windStrength=strength;
  return material;
}

export function createPlantMaterial(world,{wind=.055,...properties}={}) {
  return installWind(world,new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,
    side:THREE.DoubleSide,roughness:.94,...properties}),wind);
}

export function createLeafMaterial(world,{wind=.065,...properties}={}) {
  const material=createNeedleMaterial({color:'#ffffff',vertexColors:true,side:THREE.DoubleSide,roughness:.92,...properties});
  material.userData.needleTransmission.value=.42;
  return installWind(world,material,wind);
}

export function plantShadowMaterial(world,material) {
  return installWind(world,new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,
    side:THREE.DoubleSide}),material.userData.windStrength||.055);
}
