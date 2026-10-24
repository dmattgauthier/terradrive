// Geometry and visibility regressions for the native coachwork pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeVehicle,vehicleFinishes} from './vehicle-realism.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {nativeGeometry as geo} from './vehicle-geometry.mjs';
import {refineVehicle} from './vehicle-fidelity.mjs';
const results=[];
for(const spec of VEHICLES){
 const view=nativeVehicle(spec);vehicleFinishes(view,spec);const wheelParts=refineVehicle(view,spec);view.root.updateMatrixWorld(true);
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
  assert.equal(view.root.userData.visualModel.version,7);
  // Above the vent's center, the first solid surface is below the bonnet
  // skin. This fails for the former opaque hood with a black patch on top.
  const ventRay=new geo.THREE.Raycaster(view.body.localToWorld(new geo.THREE.Vector3(.647,1.6,1.6)),new geo.THREE.Vector3(0,-1,0),0,1);
  const ventHit=ventRay.intersectObject(view.body,true).find(h=>!h.object.material.transparent);
  assert.ok(ventHit,'bonnet vent has an inset floor');const ventDepth=view.body.worldToLocal(ventHit.point.clone()).y;
  assert.ok(ventDepth<1.102,'bonnet vent is a genuine recess');visibility.push({pane:'bonnet vent',firstSurfaceYM:ventDepth});
  const hatchRay=new geo.THREE.Raycaster(view.body.localToWorld(new geo.THREE.Vector3(.28,.75,-3)),new geo.THREE.Vector3(0,0,1),0,1);
  const hatchHit=hatchRay.intersectObject(view.body,true).find(h=>!h.object.material.transparent);
  assert.ok(hatchHit,'plate well floor');const hatchZ=view.body.worldToLocal(hatchHit.point.clone()).z;
  assert.ok(hatchZ>-2.505,'hatch plate well has physical depth');visibility.push({pane:'hatch plate well',firstSurfaceZM:hatchZ});
 }else assert.equal(view.root.userData.nativeConstruction.version,3);
 assert.equal(view.root.userData.nativeFidelity.version,3);
 const tireBox=new geo.THREE.Box3().setFromObject(wheelParts.tire),size=tireBox.getSize(new geo.THREE.Vector3());
 assert.ok(Math.abs(Math.max(size.y,size.z)/2-spec.tireRadius)<.004,spec.name+' tread matches mechanical radius');
 assert.ok(size.x>=spec.tireWidth*.99&&size.x<spec.tireWidth*1.10,spec.name+' tire shoulder width');
 assert.equal(view.wheels[0].root.userData.factoryWheelRevision,3);
 results.push({vehicle:spec.name,vertices,normalizedFraction:unitNormals/vertices,visibility,tire:{revision:3,type:spec.tireType,diameterM:Math.max(size.y,size.z),widthM:size.x},pass:true});view.dispose();
}
const report={revision:'winter-models-7',vehicles:results,pass:true};
fs.writeFileSync(new URL('../docs/model-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
