import * as THREE from '../vendor/three.module.js';
import { ROAD } from './terrain.js?v=1.15.0';
import { DIRT_COVER_GLSL } from './surface-response.js?v=1.15.0';
import { CHALLENGE_GLSL } from './challenge-course.js?v=1.15.0';

// Physical scan widths, in metres. Color/normal/roughness always use the same
// coordinates; changing apparent material scale must never change contact data.
export const TERRAIN_TEXTURE_SCALE = Object.freeze({ hardpack: 3.15, grass: 2, gravel: 2 });
export const TERRAIN_TEXTURE_RESOLUTION = Object.freeze({ forest_ground_04: '2k', brown_mud_02: '2k' });
export const TERRAIN_GRASS_SOURCE = 'leafy_grass';
const GRASS_GRADE = [.48,.72,.66];

const COMMON = /* glsl */`
varying vec2 vGroundXZ;
varying vec4 vSoilState;
varying vec3 vGeology;
varying float vGroundY;
varying vec3 vGroundNormal;
uniform sampler2D tdSoilColor, tdSoilNormal, tdSoilRough;
uniform sampler2D tdGrassColor, tdGrassNormal, tdGrassRough;
uniform sampler2D tdGravelColor, tdGravelNormal, tdGravelRough;
uniform vec4 tdEllipse, tdRoadBounds, tdBiome;
uniform vec3 tdBiomeGrade, tdSoilGrade, tdGrassGrade, tdGravelGrade, tdScanWidths;
uniform float tdTile, tdNativeWet, tdWet, tdRoad, tdWaterLevel, tdDetail, tdSnow, tdBoundaryWarp;
${DIRT_COVER_GLSL}
${CHALLENGE_GLSL}

vec3 tdGroundCover(vec2 p) {
  vec3 cover=terraDirtCover(p);
  return mix(cover,tdChallengeCover(p),step(.00001,tdChallengeMask(p)));
}

float tdNoise(vec2 p) {
  vec2 cell=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  vec4 h=fract(sin(vec4(dot(cell,vec2(127.1,311.7)),dot(cell+vec2(1.,0.),vec2(127.1,311.7)),
    dot(cell+vec2(0.,1.),vec2(127.1,311.7)),dot(cell+vec2(1.),vec2(127.1,311.7))))*43758.5453);
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}

// Material estimates, not a second soil simulation. Every term is bounded by
// a real contact channel. Compression erases the intact scan's clods; shearing
// replaces them with disturbed fine aggregates instead of restoring that scan.
// Positive displacement identifies loose shoulders without painting new ruts.
struct TDWorkedSoil { float rolled; float sheared; float spoil; float scanFlatten; float grainRetain; float looseGrain; float cavity; };
TDWorkedSoil tdWorkedSoil(vec4 contact) {
  float compression=clamp(contact.x,0.,1.), tread=clamp(contact.y,0.,1.);
  float shear=clamp(contact.w,0.,1.), sink=1.-exp(-max(0.,-contact.z)*42.);
  TDWorkedSoil worked;
  worked.rolled=clamp(compression*(1.-shear*.82)+tread*.10*(1.-shear),0.,1.);
  worked.sheared=shear;
  worked.spoil=1.-exp(-max(0.,contact.z)*26.);
  worked.scanFlatten=clamp(worked.rolled*.74+shear*.83+worked.spoil*.24,0.,.94);
  worked.grainRetain=clamp(1.-worked.rolled*.84-shear*.93,0.,1.);
  worked.looseGrain=max(shear,worked.spoil);
  // Actual groove geometry supplies most cavity shadow. A tread print should
  // not become a second, uniformly black stripe simply because it is compact.
  worked.cavity=clamp(1.-compression*.08-tread*.045-sink*.10+worked.spoil*.095,.70,1.095);
  return worked;
}

// Domain-warped patches use independent scan translations and quarter turns.
// All PBR channels share coordinates; sampled normal vectors are rotated back
// into the original tangent basis. Explicit gradients prevent mip seams.
struct TDTile { vec2 firstUV; vec2 secondUV; vec2 dx; vec2 dy; vec2 r0; vec2 r1; float blend; };
vec2 tdRotate(vec2 p,vec2 r) { return vec2(r.x*p.x-r.y*p.y,r.y*p.x+r.x*p.y); }
TDTile tdTileCoordinates(vec2 uv, float scatter) {
  TDTile tile;
  vec2 warp=vec2(tdNoise(uv*.19+vec2(17.,3.)),tdNoise(uv*.17-vec2(9.,21.)))-.5;
  uv+=warp*.63*scatter;
  tile.dx=dFdx(uv); tile.dy=dFdy(uv);
  float field=tdNoise(uv*.18+warp*1.7+vec2(4.73,19.19))*9.;
  float band=floor(field), part=fract(field);
  vec2 first=fract(sin(vec2(17.17,41.73)*(band+1.))*vec2(143.37,217.19));
  vec2 second=fract(sin(vec2(17.17,41.73)*(band+2.))*vec2(143.37,217.19));
  float a0=floor(first.x*4.)*1.57079632679*step(.001,scatter);
  float a1=floor(second.x*4.)*1.57079632679*step(.001,scatter);
  tile.r0=vec2(cos(a0),sin(a0)); tile.r1=vec2(cos(a1),sin(a1));
  tile.firstUV=tdRotate(uv,tile.r0)+first*scatter*7.31;
  tile.secondUV=tdRotate(uv,tile.r1)+second*scatter*7.31;
  tile.blend=smoothstep(.18,.82,part)*step(.001,scatter);
  return tile;
}
vec4 tdScan(sampler2D photograph, TDTile tile) {
  vec4 first=texture2DGradEXT(photograph,tile.firstUV,tdRotate(tile.dx,tile.r0),tdRotate(tile.dy,tile.r0));
  if(tile.blend<.001) return first;
  vec4 second=texture2DGradEXT(photograph,tile.secondUV,tdRotate(tile.dx,tile.r1),tdRotate(tile.dy,tile.r1));
  return mix(first,second,tile.blend);
}
vec4 tdScanNormal(sampler2D photograph,TDTile tile) {
  vec4 a=texture2DGradEXT(photograph,tile.firstUV,tdRotate(tile.dx,tile.r0),tdRotate(tile.dy,tile.r0));
  a.xy=tdRotate(a.xy*2.-1.,vec2(tile.r0.x,-tile.r0.y))*.5+.5;
  if(tile.blend<.001) return a;
  vec4 b=texture2DGradEXT(photograph,tile.secondUV,tdRotate(tile.dx,tile.r1),tdRotate(tile.dy,tile.r1));
  b.xy=tdRotate(b.xy*2.-1.,vec2(tile.r1.x,-tile.r1.y))*.5+.5;
  return mix(a,b,tile.blend);
}
vec3 tdWeights(vec2 p) {
  float roadDistance=max(max(tdRoadBounds.x-p.x,p.x-tdRoadBounds.y),max(tdRoadBounds.z-p.y,p.y-tdRoadBounds.w));
  float road=1.-smoothstep(-.10,.10,roadDistance);
  vec2 ellipseLocal=(p-tdEllipse.xy)/tdEllipse.zw;
  float edge=mix(length(ellipseLocal),tdRegionDistance(p,tdEllipse),tdBoundaryWarp), edgeGradient=length(ellipseLocal/(tdEllipse.zw*max(length(ellipseLocal),.0001)));
  float edgeDistance=(edge-1.)/max(.001,edgeGradient);
  float tdTransition=mix(.16,5.,tdSnow);
  float tdPatchWeight=1.-smoothstep(-tdTransition,tdTransition,edgeDistance);
  float primary=mix(tdPatchWeight,road,tdRoad);
  vec3 cover=tdGroundCover(p);
  return vec3(primary,(1.-primary)*(cover.x+cover.y),(1.-primary)*cover.z);
}
float tdGrainHeight(vec2 p) {
  // Millimetre relief is shading only; driveable ripples, shelves and ruts
  // continue to come from the actual shared contact heightfield.
  float rippleDirection=p.x*.92+p.y*.31;
  float waviness=tdNoise(p*.39)*2.1+tdNoise(p*.11+6.7)*4.0;
  float ripple=sin(rippleDirection*25.+waviness);
  float brokenCrest=.30+.70*tdNoise(vec2(rippleDirection*.49,p.y*.71));
  float sand=ripple*(.0015+.0032*brokenCrest);
  float grit=(tdNoise(p*21.7)-.5)*.003+(tdNoise(p*6.1)-.5)*.003;
  return mix(grit,sand,tdBiome.y)+tdBiome.x*(tdNoise(p*4.1)-.5)*.003;
}
`;

const COLOR = /* glsl */`
vec3 tdBlend=tdWeights(vGroundXZ);
vec3 tdCover=tdGroundCover(vGroundXZ);
float tdGravelShare=tdCover.y/max(.0001,tdCover.x+tdCover.y);
float tdGravelWeight=tdBlend.y*tdGravelShare, tdSoilWeight=tdBlend.y-tdGravelWeight;
// Live contact channels retain the actual signed displacement in metres.
// Rolling compression flattens surface relief; slip-driven churn exposes soil
// and leaves a rougher finish. Neither changes the contact geometry here.
float tdTread=clamp(vSoilState.y,0.,1.);
float tdSink=max(0.,-vSoilState.z);
float tdChurn=clamp(vSoilState.w,0.,1.);
float tdSinkResponse=1.-exp(-tdSink*42.);
float tdTurnedGrass=tdBlend.z*tdChurn*.78;
tdBlend.z-=tdTurnedGrass; tdSoilWeight+=tdTurnedGrass;

// Authored geology describes actual rigid rock and old ruts. It is separate
// from aSoil, which records only deformation made by live tire contacts.
float tdAuthoredStone=clamp(vGeology.x,0.,1.);
float tdAuthoredRut=clamp(vGeology.y,0.,1.);
float tdAuthoredShoulder=clamp(vGeology.z,0.,1.);
float tdInterstice=tdBiome.x*tdBlend.x*(1.-(.08+.92*tdAuthoredStone));
tdBlend.x-=tdInterstice; tdSoilWeight+=tdInterstice*.31; tdGravelWeight+=tdInterstice*.69;
float tdEmbeddedStone=max(tdBiome.z,tdBiome.w)*tdBlend.x*smoothstep(.22,.82,tdAuthoredStone);
tdBlend.x-=tdEmbeddedStone; tdGravelWeight+=tdEmbeddedStone;

// Texture-sized fragments within the existing transition zone retain the
// physical boundaries while avoiding perfectly airbrushed vegetation edges.
float tdEdgeBreak=(tdNoise(vGroundXZ*6.7)-.5)*.80;
float tdBare=tdSoilWeight+tdGravelWeight;
float tdGrassTransfer=tdEdgeBreak*tdBlend.z*tdBare/max(.0001,tdBlend.z+tdBare);
if(tdBare>.0001) {
  tdSoilWeight-=tdGrassTransfer*tdSoilWeight/tdBare;
  tdGravelWeight-=tdGrassTransfer*tdGravelWeight/tdBare;
  tdBlend.z+=tdGrassTransfer;
}
tdBare=tdSoilWeight+tdGravelWeight;
float tdAggregateTransfer=(tdNoise(vGroundXZ*5.3+7.1)-.5)*.70*tdSoilWeight*tdGravelWeight/max(.0001,tdBare);
tdGravelWeight+=tdAggregateTransfer; tdSoilWeight-=tdAggregateTransfer;

vec2 tdPrimaryUV=vGroundXZ/tdTile, tdSoilUV=vGroundXZ/tdScanWidths.x;
vec2 tdGrassUV=vGroundXZ/tdScanWidths.y, tdGravelUV=vGroundXZ/tdScanWidths.z;
vec2 tdStoneXUV=vec2(vGroundXZ.y,vGroundY)/tdTile, tdStoneZUV=vec2(vGroundXZ.x,vGroundY)/tdTile;
TDTile tdPrimaryTile=tdTileCoordinates(tdPrimaryUV,1.0-tdRoad);
TDTile tdSoilTile=tdTileCoordinates(tdSoilUV,1.);
TDTile tdGrassTile=tdTileCoordinates(tdGrassUV,1.);
TDTile tdGravelTile=tdTileCoordinates(tdGravelUV,1.);
TDTile tdStoneXTile=tdTileCoordinates(tdStoneXUV,1.);
TDTile tdStoneZTile=tdTileCoordinates(tdStoneZUV,1.);
vec3 tdStoneWeights=pow(abs(normalize(vGroundNormal)),vec3(4.));
tdStoneWeights/=max(.0001,dot(tdStoneWeights,vec3(1.)));
vec3 tdPrimaryPhoto=vec3(0.), tdSoilPhoto=vec3(0.), tdGrassPhoto=vec3(0.), tdGravelPhoto=vec3(0.);
if(tdBlend.x>.0001) {
  tdPrimaryPhoto=tdScan(map,tdPrimaryTile).rgb;
  if(tdBiome.x>.5) tdPrimaryPhoto=tdPrimaryPhoto*tdStoneWeights.y
    +tdScan(map,tdStoneXTile).rgb*tdStoneWeights.x+tdScan(map,tdStoneZTile).rgb*tdStoneWeights.z;
}
if(tdSoilWeight>.0001) tdSoilPhoto=tdScan(tdSoilColor,tdSoilTile).rgb;
if(tdBlend.z>.0001) tdGrassPhoto=tdScan(tdGrassColor,tdGrassTile).rgb;
if(tdGravelWeight>.0001) tdGravelPhoto=tdScan(tdGravelColor,tdGravelTile).rgb;
vec3 tdAlbedo=tdPrimaryPhoto*tdBiomeGrade*tdBlend.x+tdSoilPhoto*tdSoilGrade*tdSoilWeight
  +tdGrassPhoto*tdGrassGrade*tdBlend.z+tdGravelPhoto*tdGravelGrade*tdGravelWeight;

TDWorkedSoil tdWork=tdWorkedSoil(vSoilState);
// Fixed world-space aggregates follow the existing imprint. Filter their
// contrast before they become subpixel; there is no temporal randomization.
float tdGroundFootprint=max(length(dFdx(vGroundXZ)),length(dFdy(vGroundXZ)));
float tdAggregateVisibility=(1.-smoothstep(.018,.12,tdGroundFootprint))*tdDetail;
float tdAggregateField=.5;
if(tdDetail>.5 && tdWork.looseGrain>.0001) tdAggregateField=tdNoise(vGroundXZ*13.7+4.9);
float tdAggregateContrast=(tdAggregateField-.5)*tdAggregateVisibility*tdWork.looseGrain;
tdAlbedo*=1.+tdAggregateContrast*.18;

float tdMottle=tdNoise(vGroundXZ*.49)*.6+tdNoise(vGroundXZ*2.7)*.4;
float tdAboveWater=vGroundY-tdWaterLevel-tdWet*(.05+.01*tdBiome.w);
float tdEmergent=smoothstep(-.018,.009,tdAboveWater);
float tdSubmerged=(1.-tdEmergent)*tdBlend.x*min(1.,tdNativeWet*1.7);
float tdFilm=tdBlend.x*min(1.,tdNativeWet*1.7)*(1.-smoothstep(.006,.12,tdAboveWater))*tdEmergent;
// Depressions expose wetter mud. Raised spoil is less coated while emerged,
// but it cannot dry out below the water surface or remain dry during rain.
float tdRutDamp=tdSinkResponse*(.14+tdWork.rolled*.12)*tdNativeWet*tdBlend.x;
float tdShoulderDry=tdWork.spoil*.28*tdEmergent*(1.-tdWet*.78);
float tdDamp=clamp(tdNativeWet*tdBlend.x*(.58+tdMottle*.62)+tdWet*(.36+.51*tdMottle)
  +(tdWork.rolled*.25+tdTread*.07+tdAuthoredRut*.17)*tdNativeWet*tdBlend.x+tdRutDamp
  +tdFilm*.36+tdSubmerged*.50-tdShoulderDry-tdAuthoredShoulder*.10,0.,1.);
float tdCoating=clamp(smoothstep(.49,.95,tdDamp)*(.45+.55*tdMottle)*.62+tdFilm*.75,0.,1.)*tdEmergent;

float tdTrailX=tdTrailCenter(vGroundXZ.y);
float tdOldLane=exp(-pow((abs(vGroundXZ.x-tdTrailX)-.96)/.36,2.))*(1.-smoothstep(250.,260.,abs(vGroundXZ.y)));
float tdStrata=.94+.10*tdNoise(vec2(vGroundY*2.3,tdNoise(vGroundXZ*.18)*4.));
float tdExposedFace=smoothstep(.10,.46,1.-abs(normalize(vGroundNormal).y));
tdAlbedo*=mix(vec3(1.),mix(vec3(1.03,1.01,.97),vec3(.82,.87,.92),tdExposedFace)*tdStrata,tdBiome.x*tdBlend.x);
tdAlbedo*=1.-tdOldLane*tdSoilWeight*(.08+.08*tdNoise(vGroundXZ*.9));
float tdWoodCover=tdWoodland(vGroundXZ);
float tdMacro=.76+.30*tdNoise(vGroundXZ*.037)+.16*tdNoise(vGroundXZ*.137);
vec3 tdNaturalGrade=mix(vec3(1.10,1.03,.86),vec3(.76,.88,.81),tdWoodCover);
tdAlbedo*=mix(vec3(1.),tdNaturalGrade,tdSoilWeight+tdBlend.z);
// Shallow firm marks stay shallow. Their material response is bounded, while
// deeper real cavities gain contact occlusion without a universal black stripe.
float tdCavity=clamp(tdWork.cavity-tdAuthoredRut*.11+tdAuthoredShoulder*.065,.62,1.16);
diffuseColor.rgb*=tdAlbedo*tdMacro*mix(1.,.58,tdDamp)*tdCavity;
float tdSnowPack=max(tdSnowPacking(vGroundXZ),clamp(vSoilState.x,0.,1.));
float tdSnowGrain=tdNoise(vGroundXZ*9.7)*.045+tdNoise(vGroundXZ*.23)*.07;
vec3 tdSnowColor=mix(vec3(.76,.86,.93),vec3(.94,.965,.98),.43+tdNoise(vGroundXZ*.047)*.38);
tdSnowColor*=1.-tdSnowGrain-tdSnowPack*.095;
// Clean powder, blue compacted grooves and bright displaced shoulders remain
// tied to the actual snow mesh and deformation channels, never painted ruts.
tdSnowColor=mix(tdSnowColor,vec3(.62,.76,.84),clamp(tdSinkResponse*.32+tdTread*.15,0.,.42));
tdSnowColor+=tdWork.spoil*vec3(.055,.055,.05);
diffuseColor.rgb=mix(diffuseColor.rgb,tdSnowColor,tdSnow*tdBlend.x);
`;

const ROUGHNESS = /* glsl */`
float tdRough=0.;
if(tdBlend.x>.0001) {
  float primaryRough=tdScan(roughnessMap,tdPrimaryTile).g;
  if(tdBiome.x>.5) primaryRough=primaryRough*tdStoneWeights.y
    +tdScan(roughnessMap,tdStoneXTile).g*tdStoneWeights.x+tdScan(roughnessMap,tdStoneZTile).g*tdStoneWeights.z;
  tdRough+=primaryRough*tdBlend.x;
}
if(tdSoilWeight>.0001) tdRough+=tdScan(tdSoilRough,tdSoilTile).g*tdSoilWeight;
if(tdBlend.z>.0001) tdRough+=tdScan(tdGrassRough,tdGrassTile).g*tdBlend.z;
if(tdGravelWeight>.0001) tdRough+=(.65+.30*tdScan(tdGravelRough,tdGravelTile).g)*tdGravelWeight;
float tdDryRough=clamp(tdRough*.84+.13-tdWork.rolled*.065+tdWork.looseGrain*.085+tdAggregateContrast*.10,.45,.98);
float roughnessFactor=clamp(mix(tdDryRough,max(.28,tdDryRough*.61),tdDamp)
  -tdFilm*.13-tdWork.rolled*tdNativeWet*tdBlend.x*.065+tdWork.spoil*.085,.15,.99);
roughnessFactor=mix(roughnessFactor,max(.76,roughnessFactor),tdSubmerged);
roughnessFactor=mix(roughnessFactor,.94-tdSnowPack*.31,tdSnow*tdBlend.x);
`;

const NORMAL = /* glsl */`
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 tdSurfaceNormal=normal;
  vec3 tdPhotoNormal=vec3(0.);
  mat3 tdXTBN=tbn, tdZTBN=tbn;
  if(tdBiome.x>.5) { tdXTBN=getTangentFrame(-vViewPosition,tdSurfaceNormal,tdStoneXUV); tdZTBN=getTangentFrame(-vViewPosition,tdSurfaceNormal,tdStoneZUV); }
  if(tdBlend.x>.0001) {
    vec3 tdTopN=tdScanNormal(normalMap,tdPrimaryTile).xyz*2.-1.;
    tdTopN.xy*=normalScale;
    vec3 tdPrimaryN=normalize(tbn*tdTopN);
    if(tdBiome.x>.5) {
      vec3 tdXN=tdScanNormal(normalMap,tdStoneXTile).xyz*2.-1.;
      vec3 tdZN=tdScanNormal(normalMap,tdStoneZTile).xyz*2.-1.;
      tdXN.xy*=normalScale; tdZN.xy*=normalScale;
      tdPrimaryN=normalize(tdPrimaryN*tdStoneWeights.y+normalize(tdXTBN*tdXN)*tdStoneWeights.x
        +normalize(tdZTBN*tdZN)*tdStoneWeights.z);
    }
    tdPhotoNormal+=tdPrimaryN*tdBlend.x;
  }
  if(tdSoilWeight>.0001) { vec3 n=tdScanNormal(tdSoilNormal,tdSoilTile).xyz*2.-1.; n.xy*=normalScale; tdPhotoNormal+=normalize(tbn*n)*tdSoilWeight; }
  if(tdBlend.z>.0001) { vec3 n=tdScanNormal(tdGrassNormal,tdGrassTile).xyz*2.-1.; n.xy*=normalScale*.82; tdPhotoNormal+=normalize(tbn*n)*tdBlend.z; }
  if(tdGravelWeight>.0001) { vec3 n=tdScanNormal(tdGravelNormal,tdGravelTile).xyz*2.-1.; n.xy*=normalScale; tdPhotoNormal+=normalize(tbn*n)*tdGravelWeight; }
  normal=normalize(mix(tdPhotoNormal,tdSurfaceNormal,clamp(tdFilm*.66+tdDamp*.08+tdWork.scanFlatten,0.,.94)));
  normal=normalize(mix(normal,tdSurfaceNormal,tdSnow*tdBlend.x*.88));
  float tdMicroFade=(1.-smoothstep(.018,.16,tdGroundFootprint))*tdDetail*(1.-tdFilm*.85);
  // Millimetre aggregate relief replaces erased scan detail only where soil
  // was sheared or displaced. Wind ripples do not survive inside a tire path.
  float tdLooseHeight=(tdAggregateField*tdAggregateField-.30)*mix(.0045,.0018,tdBiome.y*tdBlend.x);
  float tdGrain=tdGrainHeight(vGroundXZ)*tdWork.grainRetain+tdLooseHeight*tdWork.looseGrain;
  vec3 tdEyeX=dFdx(-vViewPosition), tdEyeY=dFdy(-vViewPosition);
  vec3 tdCrossX=cross(tdEyeY,normal), tdCrossY=cross(normal,tdEyeX);
  float tdDet=dot(tdEyeX,tdCrossX);
  vec3 tdGradient=(tdCrossX*dFdx(tdGrain)+tdCrossY*dFdy(tdGrain))*sign(tdDet)*tdMicroFade;
  if(abs(tdDet)>1.e-8) normal=normalize(abs(tdDet)*normal-tdGradient);
#endif
`;

export function createTerrainMaterial(world, kind, primary, ellipse, tileMetres, nativeWet=0) {
  const soil=world._surfaceTextures('forest_ground_04'), grass=world._surfaceTextures(TERRAIN_GRASS_SOURCE);
  const gravel=world._surfaceTextures('gravel_floor_02');
  const coated=kind==='mud'||kind==='wetland';
  const Material=coated?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial;
  const material=new Material({ ...world._surfaceTextures(primary), color:'#ffffff', vertexColors:true,
    roughness:1, normalScale:new THREE.Vector2(.92,.92), metalness:0,
    ...(coated?{clearcoat:1,clearcoatRoughness:.16}:{}) });
  material.name='Photographic terrain / '+kind;
  material.userData={terrainKind:kind,source:primary,nativeWet,tileMetres,materialVersion:14,
    detailMethod:'Domain-warped stochastic PBR rotations with inverse normal transforms; woodland variation and deformable powder'};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{
      tdSoilColor:{value:soil.map},tdSoilNormal:{value:soil.normalMap},tdSoilRough:{value:soil.roughnessMap},
      tdGrassColor:{value:grass.map},tdGrassNormal:{value:grass.normalMap},tdGrassRough:{value:grass.roughnessMap},
      tdGravelColor:{value:gravel.map},tdGravelNormal:{value:gravel.normalMap},tdGravelRough:{value:gravel.roughnessMap},
      tdEllipse:{value:new THREE.Vector4(...ellipse)},tdRoadBounds:{value:new THREE.Vector4(ROAD.minX,ROAD.maxX,ROAD.minZ,ROAD.maxZ)},
      tdTile:{value:tileMetres},tdScanWidths:{value:new THREE.Vector3(TERRAIN_TEXTURE_SCALE.hardpack,TERRAIN_TEXTURE_SCALE.grass,TERRAIN_TEXTURE_SCALE.gravel)},
      tdNativeWet:{value:nativeWet},tdWet:{value:world.terrain.moisture},tdRoad:{value:kind==='base'?1:0},tdDetail:{value:world.quality==='low'?0:1},
      tdSnow:{value:kind==='snow'?1:0},
      tdBoundaryWarp:{value:kind==='rock'?0:1},
      tdWaterLevel:{value:kind==='wetland'?world.terrain.waterLevel:3.265},
      tdBiome:{value:new THREE.Vector4(kind==='rock'?1:0,kind==='sand'?1:0,kind==='mud'?1:0,kind==='wetland'?1:0)},
      tdBiomeGrade:{value:new THREE.Vector3(...({base:[.82,.86,.9],mud:[1.03,.96,.86],sand:[1.04,1.0,.93],wetland:[.83,.91,.78],rock:[.92,1.05,1.42],snow:[1,1,1]}[kind]))},
      tdSoilGrade:{value:new THREE.Vector3(1.08,1.01,.94)},tdGrassGrade:{value:new THREE.Vector3(...GRASS_GRADE)},
      tdGravelGrade:{value:new THREE.Vector3(.38,.40,.42)},
    });
    shader.vertexShader='attribute vec4 aSoil; attribute vec3 aGeology; varying vec4 vSoilState; varying vec3 vGeology; varying vec2 vGroundXZ; varying float vGroundY; varying vec3 vGroundNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vGroundXZ=position.xz; vGroundY=position.y; vGroundNormal=normal; vSoilState=aSoil; vGeology=aGeology;');
    shader.fragmentShader=COMMON+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',COLOR)
      .replace('#include <roughnessmap_fragment>',ROUGHNESS)
      .replace('#include <normal_fragment_maps>',NORMAL);
    if(coated) shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',
      '#include <lights_physical_fragment>\n #ifdef USE_CLEARCOAT\n material.clearcoat*=tdCoating*tdBlend.x; material.clearcoatF0=vec3(.02037); material.clearcoatRoughness=min(1.,clamp(.10+.18*(1.-tdMottle)+tdWork.looseGrain*.12+tdWork.spoil*.08,.10,.46)+geometryRoughness); clearcoatNormal=normalize(mix(normal,nonPerturbedNormal,tdFilm*.80));\n #endif');
    world._terrainShaders||=[];world._terrainShaders.push(shader);
  };
  material.customProgramCacheKey=()=>`terra-ground-v14-diversity-snow-${coated?'coated':'standard'}`;
  return material;
}

export function createRidgeMaterial(world) {
  const material=new THREE.MeshStandardMaterial({...world._surfaceTextures('mossy_rock'),
    color:'#ffffff',roughness:.94,normalScale:new THREE.Vector2(.58,.58)});
  const grass=world._surfaceTextures(TERRAIN_GRASS_SOURCE);
  material.name='Distant exposed stone and vegetated slopes';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{tdTile:{value:3},tdDetail:{value:world.quality==='low'?0:1},tdWet:{value:world.terrain.moisture},
      tdGrassColor:{value:grass.map},tdGrassGrade:{value:new THREE.Vector3(...GRASS_GRADE)}});
    shader.vertexShader='varying vec2 vGroundXZ; varying float vGroundY; varying vec3 vGroundNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vGroundXZ=position.xz;vGroundY=position.y;vGroundNormal=normal;');
    shader.fragmentShader=COMMON+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',/*glsl*/`
      vec2 tdRidgeUV=vGroundXZ/tdTile,tdRidgeXUV=vec2(vGroundXZ.y,vGroundY)/tdTile,tdRidgeZUV=vec2(vGroundXZ.x,vGroundY)/tdTile;
      TDTile tdRidgeTop=tdTileCoordinates(tdRidgeUV,1.),tdRidgeX=tdTileCoordinates(tdRidgeXUV,1.),tdRidgeZ=tdTileCoordinates(tdRidgeZUV,1.);
      TDTile tdRidgeGrass=tdTileCoordinates(vGroundXZ/2.,1.);
      vec3 tdRidgeWeights=pow(abs(normalize(vGroundNormal)),vec3(4.));tdRidgeWeights/=dot(tdRidgeWeights,vec3(1.));
      vec3 tdRidgeStone=tdScan(map,tdRidgeTop).rgb*tdRidgeWeights.y+tdScan(map,tdRidgeX).rgb*tdRidgeWeights.x+tdScan(map,tdRidgeZ).rgb*tdRidgeWeights.z;
      // At ridge distance the metre-scale moss patches are smaller than a
      // useful screen footprint. Fade their contrast into the measured linear
      // texture mean, retaining larger strata and the actual mountain form.
      // This also prevents the repeating scan from becoming rows of spots.
      vec3 tdRidgePosition=vec3(vGroundXZ.x,vGroundY,vGroundXZ.y);
      float tdRidgeFootprint=max(length(dFdx(tdRidgePosition)),length(dFdy(tdRidgePosition)));
      float tdRidgePhotoVisibility=1.-smoothstep(.10,.65,tdRidgeFootprint);
      tdRidgeStone=mix(vec3(.16533,.15820,.10318),tdRidgeStone,tdRidgePhotoVisibility);
      float tdIncline=1.-abs(normalize(vGroundNormal).y);
      float tdRidgeLayers=tdNoise(vec2(vGroundY*.038+tdNoise(vGroundXZ*.018)*2.,vGroundXZ.x*.010+vGroundXZ.y*.006));
      float tdExposed=clamp(smoothstep(.09,.36,tdIncline)*.78+smoothstep(82.,182.,vGroundY)*.60+(tdRidgeLayers-.5)*.30,0.,1.);
      vec3 tdRidgeCover=mix(vec3(.31976,.23574,.10614),tdScan(tdGrassColor,tdRidgeGrass).rgb,tdRidgePhotoVisibility)*tdGrassGrade;
      float tdRidgeMacro=.80+.22*tdNoise(vGroundXZ*.007)+.18*tdRidgeLayers;
      vec3 tdGeology=mix(vec3(.93,.96,1.04),vec3(1.08,1.,.86),tdRidgeLayers);
      diffuseColor.rgb*=mix(tdRidgeCover,tdRidgeStone*vec3(.92,1.05,1.42)*tdGeology,tdExposed)*tdRidgeMacro*(1.-tdWet*.23);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',/*glsl*/`
      float tdRidgeRough=tdScan(roughnessMap,tdRidgeTop).g*tdRidgeWeights.y+tdScan(roughnessMap,tdRidgeX).g*tdRidgeWeights.x+tdScan(roughnessMap,tdRidgeZ).g*tdRidgeWeights.z;
      tdRidgeRough=mix(.80,tdRidgeRough,tdRidgePhotoVisibility);
      float roughnessFactor=clamp(mix(.96,tdRidgeRough*.81+.16,tdExposed)-tdWet*.12,.64,.99);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',/*glsl*/`
      #ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 tdRidgeGeometryNormal=normal;
        mat3 tdRidgeXTBN=getTangentFrame(-vViewPosition,normal,tdRidgeXUV),tdRidgeZTBN=getTangentFrame(-vViewPosition,normal,tdRidgeZUV);
        vec3 tdRidgeTN=tdScanNormal(normalMap,tdRidgeTop).xyz*2.-1.,tdRidgeXN=tdScanNormal(normalMap,tdRidgeX).xyz*2.-1.,tdRidgeZN=tdScanNormal(normalMap,tdRidgeZ).xyz*2.-1.;
        tdRidgeTN.xy*=normalScale;tdRidgeXN.xy*=normalScale;tdRidgeZN.xy*=normalScale;
        vec3 tdRidgeN=normalize(tbn*tdRidgeTN)*tdRidgeWeights.y+normalize(tdRidgeXTBN*tdRidgeXN)*tdRidgeWeights.x+normalize(tdRidgeZTBN*tdRidgeZN)*tdRidgeWeights.z;
        normal=normalize(mix(tdRidgeGeometryNormal,tdRidgeN,(.32+tdExposed*.68)*tdRidgePhotoVisibility));
      #endif
    `);
    world._terrainShaders||=[];world._terrainShaders.push(shader);
  };
  material.customProgramCacheKey=()=> 'terra-ridge-v14-natural-topography';
  return material;
}
