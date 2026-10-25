// Independent projected-hole coverage checks for the reconstructed front face.
// This is source geometry evidence, not a substitute for the cooked art review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {T} from './body-surface.mjs';
import {urusView} from './urus-body.mjs';
import {URUS} from './native-vehicles.mjs';
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
const view=urusView(URUS);view.root.updateMatrixWorld(true);let fascia;
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
const report={kind:'source-geometry',nativeAcceptance:false,revision:10,intakeGridProbes:counts.reduce((a,b)=>a+b,0),perOpening:counts,bonnetGridProbes,paintedIntrusions:0,pass:true};
fs.writeFileSync(new URL('../docs/urus-panel-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));view.dispose();
