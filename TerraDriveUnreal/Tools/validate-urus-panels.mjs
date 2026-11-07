// Independent projected coverage checks for the reconstructed coachwork.
// This is source geometry evidence, not a substitute for the cooked art review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {T} from './body-surface.mjs';
import {urusView} from './urus-body.mjs';
import {URUS} from './native-vehicles.mjs';
import {bodyRefinement} from './body-refinement.mjs';
// Insets sample each region of the connected mouth without grazing its rim.
const mouthRegions=[
 [[-.35,.831],[.35,.831],[.43,.748],[-.43,.748]],
 [[-.44,.625],[.44,.625],[.39,.302],[-.39,.302]],
 [[-.89,.811],[-.54,.786],[-.49,.64],[-.77,.418],[-.882,.404],[-.918,.493]],
 [[.89,.811],[.54,.786],[.49,.64],[.77,.418],[.882,.404],[.918,.493]]
];
const inside=(polygon,x,y)=>{
 let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }return hit;
};
const edgeDistance=(polygon,x,y)=>Math.min(...polygon.map((a,i)=>{
 const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],u=T.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy),0,1);
 return Math.hypot(x-a[0]-dx*u,y-a[1]-dy*u);
}));
const view=urusView(URUS);bodyRefinement(view,URUS);view.root.updateMatrixWorld(true);
const fascia=view.body.getObjectByName('urus-perforated-front-fascia'),frame=view.body.getObjectByName('urus-lower-composite-intake-frame');
assert.ok(fascia&&frame);
const counts=[0,0,0,0];
for(let row=0;row<=30;row++)for(let col=0;col<=95;col++){
 const x=-.95+col*.020,y=.30+row*.020,index=mouthRegions.findIndex(h=>inside(h,x,y)&&edgeDistance(h,x,y)>.008);if(index<0)continue;
 const origin=view.body.localToWorld(new T.Vector3(x,y,3)),direction=new T.Vector3(0,0,-1).transformDirection(view.body.matrixWorld);
 const hits=new T.Raycaster(origin,direction,0,2).intersectObjects([fascia,frame],true);
 assert.equal(hits.length,0,`solid outer skin intrudes into the intake at ${x},${y}`);counts[index]++;
}
assert.ok(counts.every(n=>n>65),`all four regions of the intake sampled densely: ${counts}`);
const paintMeshes=[];view.body.traverse(object=>{if(object.isMesh&&object.material===view.materials.paint)paintMeshes.push(object);});
let bonnetGridProbes=0;
for(const [z,half]of [[.80,.60],[1.0,.58],[1.2,.57],[1.4,.56],[1.6,.54],[1.8,.54],[2.0,.53],[2.14,.50],[2.20,.35],[2.245,.20]])for(let i=-4;i<=4;i++){
 const x=half*i/4,origin=view.body.localToWorld(new T.Vector3(x,2,z)),direction=new T.Vector3(0,-1,0).transformDirection(view.body.matrixWorld);
 const paintHits=new T.Raycaster(origin,direction,0,2).intersectObjects(paintMeshes,true).filter(h=>view.body.worldToLocal(h.point.clone()).y>.94);
 assert.equal(paintHits.length,0,`hidden painted bonnet overlaps carbon at ${x},${z}`);bonnetGridProbes++;
}
const probe=(start,dir,target=view.body)=>new T.Raycaster(view.body.localToWorld(new T.Vector3(...start)),new T.Vector3(...dir).transformDirection(view.body.matrixWorld),0,1.25).intersectObject(target,true);
const firstSolid=(start,dir)=>probe(start,dir).find(h=>!h.object.material.transparent)?.object;
const paint=view.materials.paint;
assert.equal(firstSolid([0,2,2.285],[0,-1,0])?.material,paint,'body-color panel closes the leading nose beyond the exposed carbon');
assert.equal(firstSolid([.12,.36,3],[0,0,-1])?.name,'urus-main-intake-back','the lower opening exposes a recessed backing behind the beam');
assert.equal(firstSolid([.46,.69,3],[0,0,-1])?.name,'urus-swept-grille-blade','a continuous blade crosses the old inlet divider');
const duct=view.body.getObjectByName('urus-open-vent-bonnet');
for(const s of [-1,1]){
 for(const [x,z] of [[.72,1.20],[.70,1.40],[.69,1.60],[.675,1.82]]){
  assert.equal(probe([s*x,2,z],[0,-1,0],duct).length,0,'both cooling outlets are cut out of the bonnet skin');
  assert.ok(firstSolid([s*x,2,z],[0,-1,0])?.name.startsWith('urus-bonnet-vent-'),'the cooling opening has a physical return');
 }
 for(const [x,y] of [[.55,.55],[.70,.40],[.90,.38]])assert.equal(firstSolid([s*x,y,3],[0,0,-1])?.name,'urus-painted-chin-hook','the colored chin hook is uninterrupted on each side');
 assert.equal(firstSolid([s*.938,.70,3],[0,0,-1])?.name,'urus-air-curtain-upright','vertical air curtain wraps the side intake');
 assert.equal(firstSolid([s*.165,.36,3],[0,0,-1])?.name,'urus-splitter-vertical-strake','splitter fins have a closed front edge');
}
const hatch=view.body.getObjectByName('urus-sculpted-hatch-sheet'),diffuser=view.body.getObjectByName('urus-open-outlet-diffuser');
assert.ok(hatch&&diffuser,'painted hatch and diffuser are independently formed');
const opticalDepthM=[],exhaustDepthM=[];
for(const s of [-1,1]){
 for(const x of [.12,.28,.46,.61,.70,.82])assert.equal(probe([s*x,1.08,-3],[0,0,1],hatch).length,0,'paint is cut away throughout the rear light bridge');
 const optics=probe([s*.70,1.08,-3],[0,0,1]),cover=optics.find(h=>h.object.name==='urus-moulded-tail-lamp-cover'),emitter=optics.find(h=>h.object.material===view.materials.red),housing=optics.find(h=>h.object.name==='urus-recessed-full-width-lamp-housing');
 assert.ok(cover&&emitter&&housing&&cover.distance<emitter.distance&&emitter.distance<housing.distance,'each Y guide is recessed behind its lens and in front of a closed housing');
 opticalDepthM.push(emitter.distance-cover.distance);
 for(const x of [.647,.799]){
  assert.equal(probe([s*x,.421,-3],[0,0,1],diffuser).length,0,'each exhaust throat is open through the diffuser skin');
  const bore=probe([s*x,.421,-3],[0,0,1])[0],rim=probe([s*x,.463,-3],[0,0,1]).find(h=>h.object.name==='urus-oval-titanium-tip-rim');
  assert.ok(bore&&rim&&bore.distance-rim.distance>.040,'oval rolled tips have visible depth to their backing');
  exhaustDepthM.push(bore.distance-rim.distance);
 }
 for(const axle of [-1.503,1.503]){
  const flare=probe([s*1.6,URUS.tireRadius+.460,axle],[-s,0,0])[0];
  assert.equal(flare?.object.name,'urus-formed-carbon-wheel-arch','each flare faces outward and is fitted to its wheel well');
  const bounds=new T.Box3().setFromBufferAttribute(flare.object.geometry.attributes.position);
  const halfWidth=s<0?-bounds.min.x:bounds.max.x;
  assert.ok(Math.abs(halfWidth-URUS.width*.5)<.007,`finished flare matches factory half-width within 7 mm: ${halfWidth}`);
 }
}
const report={kind:'source-geometry',nativeAcceptance:false,revision:12,artPilot:2,intakeGridProbes:counts.reduce((a,b)=>a+b,0),perRegion:counts,bonnetGridProbes,paintedIntrusions:0,opticalDepthM,exhaustDepthM,pass:true};
fs.writeFileSync(new URL('../docs/urus-panel-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));view.dispose();
