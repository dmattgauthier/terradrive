// Geometry and visibility regressions for the native coachwork pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeVehicle,vehicleFinishes} from './vehicle-realism.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {nativeGeometry as geo} from './vehicle-geometry.mjs';
const results=[];
for(const spec of VEHICLES){
 const view=nativeVehicle(spec);vehicleFinishes(view,spec);view.root.updateMatrixWorld(true);
 let vertices=0,unitNormals=0,flanges=0;
 view.body.traverse(o=>{
  if(!o.isMesh)return;
  const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;
  assert.ok(n&&p.count===n.count,spec.id+' normal stream');
  for(let i=0;i<p.count;i++){
   assert.ok([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite),spec.id+' finite surface');
   const len=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
   if(len>.999&&len<1.001)unitNormals++;
  }
  vertices+=p.count;if(o.name==='glazing-inset-flange')flanges++;
 });
 assert.ok(vertices>200000,spec.id+' complete coachwork');
 assert.ok(unitNormals/vertices>.995,spec.id+' normalized shading');
 const visibility=[];
 if(spec.bodyStyle==='urus'){
  // Rays pass through each actual pane toward a seat headrest. An opaque
  // backing within 6 inches of the glass reproduces the old hidden-cabin bug.
  for(const [label,start,dir] of [['windshield',[.40,1.38,1.5],[0,0,-1]],['hatch',[.40,1.38,-2.5],[0,0,1]]]){
   const origin=view.body.localToWorld(new geo.THREE.Vector3(...start));
   const direction=new geo.THREE.Vector3(...dir).transformDirection(view.body.matrixWorld);
   const hits=new geo.THREE.Raycaster(origin,direction,0,5).intersectObject(view.body,true);
   const mat=hit=>Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
   const pane=hits.find(h=>mat(h).userData.vehicleGlass);assert.ok(pane,label+' actual glass');
   const backing=hits.find(h=>!mat(h).transparent&&h.distance>=pane.distance-.005);
   const gap=backing?backing.distance-pane.distance:5;
   assert.ok(gap>.1524,label+' has no opaque sheet behind the pane');visibility.push({pane:label,clearDepthM:gap});
  }
  assert.equal(view.root.userData.visualModel.version,6);
 }else assert.equal(view.root.userData.nativeConstruction.version,2);
 results.push({vehicle:spec.name,vertices,normalizedFraction:unitNormals/vertices,visibility,pass:true});view.dispose();
}
const report={revision:'all-models-6',vehicles:results,pass:true};
fs.writeFileSync(new URL('../docs/model-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
