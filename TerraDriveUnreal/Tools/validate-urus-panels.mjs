// Independent projected coverage checks for the reconstructed coachwork.
// This is source geometry evidence, not a substitute for the cooked art review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {T} from './body-surface.mjs';
import {urusView} from './urus-body.mjs';
import {URUS} from './native-vehicles.mjs';
import {bodyRefinement} from './body-refinement.mjs';
const openings=[
 [[-.443,.850],[-.354,.883],[.354,.883],[.443,.850],[.402,.736],[-.402,.736]],
 [[-.438,.616],[-.337,.694],[.337,.694],[.438,.616],[.614,.347],[-.614,.347]],
 [[-.918,.798],[-.562,.812],[-.479,.669],[-.739,.378],[-.896,.346],[-.951,.486]],
 [[.918,.798],[.562,.812],[.479,.669],[.739,.378],[.896,.346],[.951,.486]]
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
const view=urusView(URUS);bodyRefinement(view,URUS);view.root.updateMatrixWorld(true);let fascia;
view.body.traverse(object=>{if(object.name==='urus-perforated-front-fascia')fascia=object;});assert.ok(fascia);
const counts=[0,0,0,0];
for(let row=0;row<=24;row++)for(let col=0;col<=76;col++){
 const x=-.95+col*.025,y=.34+row*.025,index=openings.findIndex(h=>inside(h,x,y)&&edgeDistance(h,x,y)>.008);if(index<0)continue;
 const origin=view.body.localToWorld(new T.Vector3(x,y,3)),direction=new T.Vector3(0,0,-1).transformDirection(view.body.matrixWorld);
 const hits=new T.Raycaster(origin,direction,0,2).intersectObject(fascia,true);
 assert.equal(hits.length,0,`painted triangle intrudes into intake ${index} at ${x},${y}`);counts[index]++;
}
assert.ok(counts.every(n=>n>80),'all four intake apertures sampled densely');
const paintMeshes=[];view.body.traverse(object=>{if(object.isMesh&&object.material===view.materials.paint)paintMeshes.push(object);});
let bonnetGridProbes=0;
for(const [z,half]of [[.80,.52],[1.0,.52],[1.2,.52],[1.4,.50],[1.6,.48],[1.8,.47],[2.0,.40],[2.2,.30],[2.26,.16],[2.28,.07]])for(let i=-4;i<=4;i++){
 const x=half*i/4,origin=view.body.localToWorld(new T.Vector3(x,2,z)),direction=new T.Vector3(0,-1,0).transformDirection(view.body.matrixWorld);
 const paintHits=new T.Raycaster(origin,direction,0,2).intersectObjects(paintMeshes,true).filter(h=>view.body.worldToLocal(h.point.clone()).y>.94);
 assert.equal(paintHits.length,0,`hidden painted bonnet overlaps carbon at ${x},${z}`);bonnetGridProbes++;
}
const probe=(start,dir,target=view.body)=>new T.Raycaster(view.body.localToWorld(new T.Vector3(...start)),new T.Vector3(...dir).transformDirection(view.body.matrixWorld),0,1.25).intersectObject(target,true);
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
const report={kind:'source-geometry',nativeAcceptance:false,revision:12,artPilot:1,intakeGridProbes:counts.reduce((a,b)=>a+b,0),perOpening:counts,bonnetGridProbes,paintedIntrusions:0,opticalDepthM,exhaustDepthM,pass:true};
fs.writeFileSync(new URL('../docs/urus-panel-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));view.dispose();
