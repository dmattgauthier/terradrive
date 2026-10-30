// Physical aperture/normal checks for the new reference detail. Native images
// still decide visual acceptance; these tests do not establish CAD accuracy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {VEHICLES} from './native-vehicles.mjs';
import {prepareNativeVehicle} from './vehicle-realism.mjs';
import {T} from './body-surface.mjs';
const checks=[],observed=[];
const check=(vehicle,name,pass,value)=>{checks.push({vehicle,name,pass,value});assert.ok(pass,vehicle+': '+name+' '+JSON.stringify(value));};
for(const i of [5,7,8]){
 const spec=VEHICLES[i],{view}=prepareNativeVehicle(spec);view.root.updateMatrixWorld(true);
 const ray=(origin,direction,target=view.body)=>new T.Raycaster(view.body.localToWorld(new T.Vector3(...origin)),new T.Vector3(...direction).transformDirection(view.body.matrixWorld),0,8).intersectObject(target,true);
 if(i===5){
  const points=(object,u=null,v=null)=>{const a=object.geometry.attributes.position,uv=object.geometry.attributes.uv;return Array.from({length:a.count},(_,k)=>k).filter(k=>(u===null||Math.abs(uv.getX(k)-u)<1e-6)&&(v===null||Math.abs(uv.getY(k)-v)<1e-6)).map(k=>view.body.worldToLocal(object.localToWorld(new T.Vector3().fromBufferAttribute(a,k))));};
  const crown=view.body.getObjectByName('urus-bonnet-to-fascia-crown');
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const hull=vertices=>{const p=[...new Map(vertices.map(v=>[v.x.toFixed(7)+','+v.y.toFixed(7),v])).values()].sort((a,b)=>a.x-b.x||a.y-b.y),a=[],b=[];for(const v of p){while(a.length>1&&cross(a.at(-2),a.at(-1),v)<=1e-10)a.pop();a.push(v);}for(const v of p.slice().reverse()){while(b.length>1&&cross(b.at(-2),b.at(-1),v)<=1e-10)b.pop();b.push(v);}return a.slice(0,-1).concat(b.slice(0,-1));};
  for(const side of [-1,1]){
   const edge=points(crown,side<0?0:1),shoulder=points(view.body.getObjectByName('urus-bonnet-shoulder-sheet-'+side),1);
   const gaps=edge.map(p=>Math.min(...shoulder.slice(1).map((b,k)=>p.distanceTo(new T.Line3(shoulder[k],b).closestPointToPoint(p,true,new T.Vector3())))));
   const gap=Math.max(...gaps);
   check(spec.id,'entire bonnet crown edge shares the actual shoulder boundary '+side,edge.length>=11&&gap<.0007,{maximumGapIn:gap/.0254,edgeSamples:edge.length});
   const front=points(crown,null,1).filter(p=>p.x*side>=-1e-7),fascia=view.body.getObjectByName('urus-perforated-front-fascia'),frontMisses=[],frontGaps=[];
   for(const p of front){const hit=ray([p.x,p.y-.0003,3],[0,0,-1],fascia)[0],distance=hit?p.distanceTo(view.body.worldToLocal(hit.point.clone())):Infinity;frontGaps.push(distance);if(distance>.0007)frontMisses.push({x:p.x,distanceIn:Number.isFinite(distance)?distance/.0254:null});}
   check(spec.id,'whole front crown edge meets the actual fascia sheet '+side,front.length>=37&&frontMisses.length===0,{samples:front.length,maximumGapIn:Math.max(...frontGaps)/.0254,misses:frontMisses});
   const covers=[];view.body.traverse(o=>{if(o.name==='urus-formed-clear-headlamp-cover')covers.push(o);});
   const coverMesh=covers.find(o=>points(o).reduce((n,p)=>n+p.x,0)*side>0),rim=hull(points(coverMesh)),misses=[];
   for(let k=0;k<rim.length;k++){
    const a=rim[k],b=rim[(k+1)%rim.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    const x=(a.x+b.x)*.5+dy/len*.008,y=(a.y+b.y)*.5-dx/len*.008;
    const hit=ray([x,y,3],[0,0,-1]).find(h=>!h.object.material.transparent);
    if(!hit||hit.object.material!==view.materials.paint||hit.distance>.95)misses.push({x,y,firstSolid:hit?.object.name});
   }
   check(spec.id,'formed lamp cover has a visible painted rim around its whole perimeter '+side,misses.length===0,{rimEdges:rim.length,misses});
   const hits=ray([side*.70,.981,3],[0,0,-1]);
   const cover=hits.find(h=>h.object.name==='urus-formed-clear-headlamp-cover');
   const opaque=hits.find(h=>!h.object.material.transparent);
   const depth=cover&&opaque?opaque.distance-cover.distance:0;
   check(spec.id,'clear lamp cover precedes actual recessed optics '+side,!!cover&&!!opaque&&opaque.object.material!==view.materials.paint&&depth>.010&&depth<.050,{depthIn:depth/.0254,firstSolid:opaque?.object.name});
   const rear=ray([side*.70,1.080,-3],[0,0,1]);
   check(spec.id,'rear molded lens covers the live red light guide '+side,rear.some(h=>h.object.name==='urus-moulded-tail-lamp-cover')&&rear.some(h=>h.object.material===view.materials.red),{hitLayers:rear.length});
  }
  const paintOverlap=[];
  for(const side of [-1,1])for(const x of [.57,.65,.72,.80,.86]){
   const hit=ray([side*x,.974,3],[0,0,-1]).find(h=>!h.object.material.transparent);
   if(!hit||hit.object.material===view.materials.paint)paintOverlap.push([side*x,.974]);
  }
  check(spec.id,'both open headlamp pods have no painted backing in their optical chambers',paintOverlap.length===0,{paintOverlap});
  const vents=[];view.body.traverse(o=>{if(o.name.startsWith('urus-hexagonal-dashboard-vent-'))vents.push(o);});
  check(spec.id,'four dashboard vents contain real open hexagonal rims',vents.length===4&&vents.every(o=>o.geometry.index.count>0),{vents:vents.length});
 }else{
  for(const side of [-1,1]){
   const bucket=view.body.getObjectByName('gclass-formed-black-headlamp-bucket-'+side);
   const origin=[side*(.635+.130),.909,3],hits=ray(origin,[0,0,-1],bucket);
   const b=bucket&&new T.Box3().setFromObject(bucket).getSize(new T.Vector3());
   check(spec.id,'formed headlamp surround is wider than the round lens '+side,!!hits.length&&b.x>.300&&b.y>.250,{widthIn:b?.x/.0254,heightIn:b?.y/.0254});
   const glass=view.body.getObjectByName('gclass-rear-facing-mirror-glass-'+side),n=glass?.geometry.attributes.normal;
   let minimumRearward=1;if(n)for(let k=0;k<n.count;k++)minimumRearward=Math.min(minimumRearward,-n.getZ(k));
   const mirrorCentre=glass&&view.body.worldToLocal(new T.Box3().setFromObject(glass).getCenter(new T.Vector3()));
   const mirrorHits=glass?ray([mirrorCentre.x,mirrorCentre.y,-.30],[0,0,1],glass):[];
   // Test the actual normal stream and visible glass, not an object flag. The
   // previous thin chrome rectangle faced sideways along the vehicle width.
   check(spec.id,'mirror optical face points toward the rear '+side,!!n&&minimumRearward>.98&&mirrorHits.length>0&&new T.Box3().setFromObject(glass).getSize(new T.Vector3()).x>.080,{minimumRearwardNormal:minimumRearward,probeHits:mirrorHits.length});
  }
  const grids=[0,1,2].map(k=>view.body.getObjectByName('gclass-recessed-lower-radiator-mesh-'+k));
  const cells=grids.map(o=>o?.userData.openCells||0);
  check(spec.id,'three lower intakes contain open radiator cells with physical walls',grids.every(o=>o?.geometry.index.count>0)&&cells[0]>35&&cells[1]>5&&cells[2]>5,{cells});
  let triangles=0;view.body.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  check(spec.id,'new detail retains the existing 450000-triangle exterior/cabin budget',triangles<=450000,{triangles});
 }
 observed.push({vehicle:spec.id,checks:checks.filter(x=>x.vehicle===spec.id).length});view.dispose();
}
const sourceFiles=['coachwork-craft.mjs','vehicle-cabin.mjs','vehicle-fidelity.mjs','vehicle-realism.mjs','suv-body.mjs','civic-body.mjs','urus-body.mjs','urus-cabin.mjs','hummer-body.mjs','sprinter-body.mjs','mercedes-gclass.mjs','earthcruiser-exp.mjs'].map(name=>({path:'Tools/'+name,sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL(name,import.meta.url))).digest('hex')}));
const report={revision:18,kind:'source-geometry',nativeAcceptance:false,displayUnits:'imperial',checksPassed:checks.length,checksTotal:checks.length,sourceFiles,observed,checks,pass:true};
fs.writeFileSync(new URL('../docs/coachwork-craft-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,checks:checks.length,vehicles:observed}));
