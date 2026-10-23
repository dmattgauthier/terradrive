// Rebuild native coachwork with curved-surface normals and rounded solid parts.
// Mechanical hardpoints and the preserved browser implementation are untouched.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {buildNativeHummer} from './hummer-body.mjs';
import {buildCivic} from '../../TerraDrive-v1.13/dist/src/vehicle-civic.js';
import {buildSprinter} from '../../TerraDrive-v1.13/dist/src/vehicle-sprinter.js';
import {buildSUV} from '../../TerraDrive-v1.13/dist/src/vehicle-suv.js';
import {nativeGeometry as geo,mergeStaticMeshes} from './vehicle-geometry.mjs';
import {urusView} from './urus-body.mjs';
export function nativeVehicle(spec){
  if(spec.bodyStyle==='urus')return urusView(spec);
  const view=new VehicleView(new geo.THREE.Scene(),spec);
  const old=new Set();view.body.traverse(o=>{if(o.isMesh)old.add(o.geometry);});
  view.body.clear();old.forEach(g=>g.dispose());view.lamps=[];
  if(spec.bodyStyle==='hummer')buildNativeHummer(view,geo);
  else if(spec.bodyStyle==='sedan')buildCivic(view,geo);
  else if(spec.bodyStyle==='van')buildSprinter(view,geo);
  else buildSUV(view,geo,spec.bodyStyle==='bronco');
  view._underbody();mergeStaticMeshes(view.body);
  geo.roundBodyEnds(view.body,spec.bodyStyle);geo.roundRoofShoulders(view.body,spec.bodyStyle);
  view.root.userData.nativeConstruction={version:1,analyticSurfaceNormals:true,roundedSolidParts:true,thinnerWindowSeals:true};
  return view;
}
export function vehicleFinishes(view,spec){
  const m=view.materials;
  const roles={paint:'paint',glossBlack:'black',black:'plastic',dark:'plastic',hardtop:'plastic',chrome:'metal',satinMetal:'metal',badge:'metal',grille:'plastic',rubber:'rubber',tread:'rubber',interior:'plastic',upholstery:'alcantara',headliner:'alcantara',hummerAccent:'metal',hummerInteriorAccent:'plastic'};
  for(const [key,role]of Object.entries(roles))if(m[key]){
    m[key].userData.automotive=role;m[key].userData.automotiveOwner=spec.bodyStyle;
  }
  // Solid factory colors and road-car black window trim are dielectric.
  m.paint.metalness=0;
  for(const [key,mat]of Object.entries(m)){
    if(!mat?.isMaterial)continue;
    if(mat.userData.vehicleGlass){mat.color.set(key==='privacyGlass'?'#26343a':'#445359');mat.opacity=key==='privacyGlass'?.65:key==='windscreen'?.30:.38;mat.roughness=.045;}
    if(mat.userData.vehicleLampLens){mat.roughness=.075;mat.opacity=mat.userData.vehicleTintedLens?.42:.18;}
  }
  view.root.userData.nativeConstruction={...view.root.userData.nativeConstruction,version:1,automotiveFinishes:true};
}
