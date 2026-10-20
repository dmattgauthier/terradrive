import { NATURAL_GLSL, SNOW_REGION } from './terrain-diversity.js?v=1.15.0';

/** Preserve the existing needle alpha/wind shader and dust upward boughs.
 * This coating is appearance only; the shared terrain owns all snow contact. */
export function coatBorealScenery(material, foliage = false) {
  const compile = material.onBeforeCompile, oldKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = 'varying vec3 vBorealWorld; varying float vBorealUp;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 borealPosition=vec4(transformed,1.); vec3 borealNormal=normal;
      #ifdef USE_INSTANCING
        borealPosition=instanceMatrix*borealPosition; borealNormal=mat3(instanceMatrix)*borealNormal;
      #endif
      vBorealWorld=(modelMatrix*borealPosition).xyz;
      vBorealUp=inverseTransformDirection(transformedNormal,viewMatrix).y;
      #include <project_vertex>`);
    shader.fragmentShader = 'varying vec3 vBorealWorld; varying float vBorealUp;\n' + NATURAL_GLSL + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float borealMask=1.-smoothstep(.89,1.03,tdRegionDistance(vBorealWorld.xz,vec4(${SNOW_REGION.cx.toFixed(1)},${SNOW_REGION.cz.toFixed(1)},${SNOW_REGION.rx.toFixed(1)},${SNOW_REGION.rz.toFixed(1)})));
      float borealGrain=tdNaturalNoise(vBorealWorld.xz*3.7+vBorealWorld.y*.21);
      float borealCoat=borealMask*smoothstep(${foliage ? '-.15,.58' : '.04,.80'},vBorealUp)*(.58+borealGrain*.34);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.80,.88,.94),borealCoat);`);
  };
  const cacheKey = oldKey();
  material.customProgramCacheKey = () => cacheKey + '-boreal-snow-v14-' + foliage;
  return material;
}
