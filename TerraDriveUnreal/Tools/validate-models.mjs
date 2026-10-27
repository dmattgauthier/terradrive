// Geometry and visibility regressions for the native coachwork pipeline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bodyRefinement} from './body-refinement.mjs';
import {nativeVehicle,vehicleFinishes} from './vehicle-realism.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {nativeGeometry as geo} from './vehicle-geometry.mjs';
import {refineVehicle} from './vehicle-fidelity.mjs';
const results=[];
for(const spec of VEHICLES){
 const view=nativeVehicle(spec);bodyRefinement(view,spec);vehicleFinishes(view,spec);const wheelParts=refineVehicle(view,spec);view.root.updateMatrixWorld(true);
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
 const firstSolid=(start,dir)=>{
  const origin=view.body.localToWorld(new geo.THREE.Vector3(...start)),direction=new geo.THREE.Vector3(...dir).transformDirection(view.body.matrixWorld);
  const hit=new geo.THREE.Raycaster(origin,direction,0,6).intersectObject(view.body,true).find(h=>{const mat=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;return !mat.transparent;});
  assert.ok(hit,spec.name+' coachwork probe hits an opaque surface');const point=view.body.worldToLocal(hit.point.clone());
  point.material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
  const intoBody=view.body.matrixWorld.clone().invert().multiply(hit.object.matrixWorld);point.surfaceNormal=hit.face.normal.clone().applyMatrix3(new geo.THREE.Matrix3().getNormalMatrix(intoBody)).normalize();return point;
 };
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
  assert.equal(view.root.userData.visualModel.version,12);
  assert.ok(view.root.userData.visualModel.camberedClosedSpoiler&&view.root.userData.visualModel.crownedGreenhouse&&view.root.userData.visualModel.sculptedDoorCups,'Urus compound coachwork revision');
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
  const roofMiddle=firstSolid([0,2,-.62],[0,-1,0]),roofSide=firstSolid([.65,2,-.62],[0,-1,0]);
  assert.ok(roofMiddle.y-roofSide.y>.018&&roofMiddle.y<1.625,'Urus roof has transverse crown within factory height');
  visibility.push({pane:'roof crown',centreHeightM:roofMiddle.y,transverseCrownM:roofMiddle.y-roofSide.y});
  const spoilerTop=firstSolid([0,1.75,-1.48],[0,-1,0]),spoilerLower=firstSolid([0,1.51,-1.48],[0,1,0]);
  assert.ok(spoilerTop.y-spoilerLower.y>.012&&spoilerTop.y-spoilerLower.y<.035,'Urus spoiler has a real airfoil underside');
  visibility.push({pane:'closed spoiler',thicknessM:spoilerTop.y-spoilerLower.y});
  const waist=firstSolid([1.4,.65,0],[-1,0,0]),shoulder=firstSolid([1.4,.98,0],[-1,0,0]);
  assert.ok(shoulder.x-waist.x>.025,'Urus door sheet has a pronounced shoulder-to-waist section');
  visibility.push({pane:'sculpted door',shoulderOutsetM:shoulder.x-waist.x});
  let handles=0,returns=0;
  view.body.traverse(object=>{
   if(object.name==='urus-sculpted-door-handle'){
    const bounds=new geo.THREE.Box3().setFromObject(object),centre=bounds.getCenter(new geo.THREE.Vector3()),side=Math.sign(centre.x),origin=centre.clone();origin.x=side*2;
    const hit=new geo.THREE.Raycaster(origin,new geo.THREE.Vector3(-side,0,0),0,3).intersectObject(object,true)[0],edge=side>0?bounds.max.x:bounds.min.x;
    assert.ok(hit&&Math.abs(edge-hit.point.x)<.006,'Urus handle outer shell faces outward');handles++;
   }
   if(object.name==='urus-intake-return'){
    const p=object.geometry.attributes.position,n=object.geometry.attributes.normal,i=2*13+6,point=new geo.THREE.Vector3().fromBufferAttribute(p,i),normal=new geo.THREE.Vector3().fromBufferAttribute(n,i),centre=object.userData.apertureCentre;
    assert.ok(normal.dot(new geo.THREE.Vector3(centre[0]-point.x,centre[1]-point.y,0).normalize())>.20,'Urus return faces the open duct');returns++;
   }
  });assert.equal(handles,4);assert.equal(returns,24);
  let carbonProbes=0;
  for(const [z,half]of [[.80,.52],[1.0,.52],[1.2,.52],[1.4,.50],[1.6,.48],[1.8,.47],[2.0,.40],[2.2,.30],[2.26,.16],[2.28,.07]])for(let i=-4;i<=4;i++){
   const x=half*i/4,hit=firstSolid([x,2,z],[0,-1,0]);assert.equal(hit.material.userData.automotive,'carbon','Urus carbon bonnet contains no painted overlap');carbonProbes++;
  }
  for(const side of [-1,1])for(const [x,y]of [[.70,.70],[.70,.65],[.73,.60],[.76,.54],[.80,.46]]){
   const hit=firstSolid([side*x,y,3],[0,0,-1]);assert.notEqual(hit.material,view.materials.paint,'Urus side intake contains no painted triangle');
  }
  for(const side of [-1,1])for(const [x,z]of [[.65,1.4],[.65,1.6],[.63,1.8],[.59,1.88]]){
   const hit=firstSolid([side*x,2,z],[0,-1,0]);assert.notEqual(hit.material,view.materials.paint,'Urus bonnet cooling aperture contains no painted fill');
  }
  visibility.push({pane:'partitioned bonnet and open intakes',carbonProbes,handles,returns,paintedIntakeProbes:10});
 }else assert.equal(view.root.userData.nativeConstruction.version,3);
 if(spec.bodyStyle==='sedan'){
  const detail=view.root.userData.coachworkDetail;assert.ok(detail.openHexMeshCells>100,'Civic molded open mesh cells');
  const hole=firstSolid([...detail.lowerGrilleProbe.hole,3],[0,0,-1]),web=firstSolid([...detail.lowerGrilleProbe.web,3],[0,0,-1]);
  assert.ok(web.z-hole.z>.010,'Civic grille ray passes through a real cell to the recessed backing');
  const cellWall=firstSolid([detail.lowerGrilleProbe.hole[0],detail.lowerGrilleProbe.hole[1],web.z-.0045],[1,0,0]);
  assert.ok(cellWall.x-detail.lowerGrilleProbe.hole[0]>.008&&cellWall.x-detail.lowerGrilleProbe.hole[0]<.020,'Civic cell returns face into the open hole');
  visibility.push({pane:'open lower mesh',cells:detail.openHexMeshCells,backingSetbackM:web.z-hole.z});
 }
 if(spec.bodyStyle==='van'){
  assert.ok(view.root.userData.coachworkDetail.formedWaistSwage&&view.root.userData.coachworkDetail.pressedHandleCups,'Sprinter continuous formed sheets');
  const crest=firstSolid([1.4,1.050,-.40],[-1,0,0]),trough=firstSolid([1.4,1.167,-.40],[-1,0,0]);
  assert.ok(crest.x-trough.x>.012,'Sprinter waist swage has physical relief');visibility.push({pane:'waist swage',reliefM:crest.x-trough.x});
 }
 if(spec.bodyStyle==='jeep'||spec.bodyStyle==='bronco'){
  const z=spec.bodyStyle==='jeep'?.684:.655,floor=firstSolid([.017,1.6,z],[0,-1,0]),rim=firstSolid([.42,1.6,z],[0,-1,0]);
  // Compare the formed surfaces together; an absolute unwarped Y threshold
  // incorrectly rejects the same open cowl after body-wide refinement.
  assert.ok(rim.y-floor.y>.002,'SUV cowl contains a genuine inset floor');assert.equal(floor.material,view.materials.black,'cowl ray reaches its dark floor through the painted sheet');visibility.push({pane:'recessed cowl',floorHeightM:floor.y,rimClearanceM:rim.y-floor.y});
  if(spec.bodyStyle==='bronco'){
   const plateau=firstSolid([0,1.6,1.4],[0,-1,0]),flank=firstSolid([.60,1.6,1.4],[0,-1,0]);
   assert.ok(plateau.y-flank.y>.015,'Bronco bonnet has formed plateau relief');visibility.push({pane:'bonnet plateau',reliefM:plateau.y-flank.y});
  }
 }
 if(spec.bodyStyle==='hummer'){
  const floor=firstSolid([.754,1.7,1.038],[0,-1,0]),crest=firstSolid([.722,1.7,1.6],[0,-1,0]),well=firstSolid([0,1.7,1.6],[0,-1,0]);
  assert.ok(floor.y<1.457,'HUMMER bonnet vent contains a genuine inset floor');assert.equal(floor.material,view.materials.black,'HUMMER vent ray reaches the dark floor through the painted sheet');assert.ok(crest.y-well.y>.040,'HUMMER twin crest has a physical centre well');
  visibility.push({pane:'recessed bonnet vent',floorHeightM:floor.y},{pane:'bonnet crest',reliefM:crest.y-well.y});
  for(const side of [-1,1])for(const [x,y]of [[.94,1.66],[.96,1.52],[.91,1.44]]){
   const frame=firstSolid([side*x,y,-3],[0,0,1]);assert.ok(frame.z<-2.30&&[view.materials.paint,view.materials.black,view.materials.glossBlack].includes(frame.material),'HUMMER rear glazing has an opaque physical frame');
  }
  const skid=firstSolid([0,.64,3],[0,0,-1]);assert.equal(skid.material,view.materials.hummerAccent);assert.ok(skid.surfaceNormal.z>.4,'HUMMER front skid faces forward');
 }
 assert.equal(view.root.userData.nativeFidelity.version,3);
 const tireBox=new geo.THREE.Box3().setFromObject(wheelParts.tire),size=tireBox.getSize(new geo.THREE.Vector3());
 assert.ok(Math.abs(Math.max(size.y,size.z)/2-spec.tireRadius)<.004,spec.name+' tread matches mechanical radius');
 assert.ok(size.x>=spec.tireWidth*.99&&size.x<spec.tireWidth*1.10,spec.name+' tire shoulder width');
 assert.equal(view.wheels[0].root.userData.factoryWheelRevision,3);
 results.push({vehicle:spec.name,vertices,normalizedFraction:unitNormals/vertices,visibility,tire:{revision:3,type:spec.tireType,diameterM:Math.max(size.y,size.z),widthM:size.x},pass:true});view.dispose();
}
const report={revision:'rollover-coachwork-12',vehicles:results,pass:true};
fs.writeFileSync(new URL('../docs/model-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
