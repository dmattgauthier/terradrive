// Rebuild native coachwork with curved-surface normals and rounded solid parts.
// Mechanical hardpoints and the preserved browser implementation are untouched.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {buildNativeHummer} from './hummer-body.mjs';
import {buildCivic} from './civic-body.mjs';
import {buildSprinter} from './sprinter-body.mjs';
import {buildSUV} from './suv-body.mjs';
import {nativeGeometry as geo,mergeStaticMeshes} from './vehicle-geometry.mjs';
import {nativeInterior} from './vehicle-cabin.mjs';
import {nativeFender} from './vehicle-fenders.mjs';
import {urusView} from './urus-body.mjs';
import {refineFactoryWheel} from './vehicle-fidelity.mjs';
export function nativeVehicle(spec){
  if(spec.bodyStyle==='urus')return urusView(spec);
  const view=new VehicleView(new geo.THREE.Scene(),spec);
  const originalWheel=view._wheel.bind(view);
  view._wheel=function(spare=false){const wheel=originalWheel(spare);if(spare)refineFactoryWheel(wheel,spec,view.materials);return wheel;};
  const old=new Set();view.body.traverse(o=>{if(o.isMesh)old.add(o.geometry);});
  view.body.clear();old.forEach(g=>g.dispose());view.lamps=[];
  view._interior=nativeInterior;view._fender=nativeFender;
  const palette={jeep:['#252a2c','#303335'],bronco:['#292d30','#3d4448'],sedan:['#202428','#2d3136'],van:['#303538','#363c40'],hummer:['#202529','#343a3d']}[spec.bodyStyle];
  view.materials.interior.color.set(palette[0]);view.materials.upholstery.color.set(palette[1]);
  if(spec.bodyStyle==='hummer')buildNativeHummer(view,geo);
  else if(spec.bodyStyle==='sedan')buildCivic(view,geo);
  else if(spec.bodyStyle==='van')buildSprinter(view,geo);
  else buildSUV(view,geo,spec.bodyStyle==='bronco');
  view._underbody();mergeStaticMeshes(view.body);
  geo.roundBodyEnds(view.body,spec.bodyStyle);geo.roundRoofShoulders(view.body,spec.bodyStyle);
  view.root.userData.nativeConstruction={version:3,bodySurfaceRevision:8,analyticSurfaceNormals:true,roundedSolidParts:true,thinnerWindowSeals:true,glazingReturns:true,continuousUpholsteryNormals:true,nativeFenders:['jeep','bronco'].includes(spec.bodyStyle),formedCowls:['jeep','bronco'].includes(spec.bodyStyle),formedCabSheets:['sedan','van'].includes(spec.bodyStyle),recessedMeshGrilles:spec.bodyStyle==='sedan',recessedBonnetVents:spec.bodyStyle==='hummer'};
  return view;
}
export function vehicleFinishes(view,spec){
  const m=view.materials;
  const roles={paint:'paint',glossBlack:'black',black:'plastic',dark:'plastic',hardtop:'plastic',chrome:'metal',satinMetal:'satinMetal',badge:'metal',grille:'plastic',rubber:'rubber',tread:'rubber',interior:'plastic',upholstery:'alcantara',headliner:'alcantara',hummerAccent:'satinMetal',hummerInteriorAccent:'plastic'};
  for(const [key,role]of Object.entries(roles))if(m[key]){
    m[key].userData.automotive=role;m[key].userData.automotiveOwner=spec.bodyStyle;
  }
  // Solid factory colors and road-car black window trim are dielectric.
  m.paint.metalness=0;
  for(const [key,mat]of Object.entries(m)){
    if(!mat?.isMaterial)continue;
    if(mat.userData.vehicleGlass){mat.color.set(key==='privacyGlass'?'#202c31':'#3d4c50');mat.opacity=key==='privacyGlass'?.79:key==='windscreen'?.40:.47;mat.roughness=.035;}
    if(mat.userData.vehicleLampLens){mat.roughness=.075;mat.opacity=mat.userData.vehicleTintedLens?.42:.18;}
  }
  view.root.userData.nativeConstruction={...view.root.userData.nativeConstruction,version:3,automotiveFinishes:true};
}
