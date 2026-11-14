// Derive oversized-tire fitting kits from the exact exported opaque body.
// Units here are source metres: X lateral, Y contact-plane up, Z forward.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {tireDiameterInches} from './tire-size-geometry.mjs';
import {beginSourceExport,publishSourceExport,verifySourceExport} from './source-export-state.mjs';
const rootDefault=path.resolve(import.meta.dirname,'..');
const spacing=.025,margin=.040,stepAngle=2*Math.PI/180;
export function fitAxles(spec,radius){
 const a=spec.axleOffsetsM?[...spec.axleOffsetsM]:[spec.wheelbase*(1-spec.frontWeightFraction),-spec.wheelbase*spec.frontWeightFraction];
 if(a.length===3)a[2]-=Math.max(0,2*radius+.08-(a[1]-a[2]));
 return a;
}
const range=spec=>{
 const r=.635,a=fitAxles(spec,r),b=spec.tireRadius+Math.max(.055,spec.suspension.travel*.58)+r+.07;
 return {axles:a,minZ:Math.min(...a)-r-.40,maxZ:Math.max(...a)+r+.40,maxY:b};
};
async function bodySamples(file,spec,materials){
 const rows=[],cells=new Map(),bounds=range(spec),sha=crypto.createHash('sha256');let material=null,faces=0,selectedFaces=0,sampled=0;
 const include=p=>Math.abs(p[0])<spec.width*.5+.30&&p[1]<bounds.maxY&&p[1]>-.12&&p[2]>bounds.minZ&&p[2]<bounds.maxZ;
 const insert=p=>{
  if(!include(p))return;sampled++;
  // Keep the lowest actual surface sample in each X/Z cell. Lower sheets
  // are the limiting contact for a tire swept upward through suspension.
  const key=Math.round(p[0]/spacing)+':'+Math.round(p[2]/spacing),old=cells.get(key);
  if(!old||p[1]<old[1])cells.set(key,p);
 };
 const stream=fs.createReadStream(file);stream.on('data',b=>sha.update(b));
 for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
  if(line.startsWith('v ')){const p=line.slice(2).trim().split(/\s+/).map(Number);rows.push([p[1]/100,p[2]/100+spec.cgHeight,p[0]/100]);}
  else if(line.startsWith('usemtl '))material=materials.get(line.slice(7).trim());
  else if(line.startsWith('f ')){
   faces++;
   // Ignore transparent optics and the remotely mounted spare tire. All
   // opaque skirts, fender liners, steps and underbody hardware are retained.
   if(!material||material.opacity<.995||['glass','brake','reverse','sky'].includes(material.role))continue;
   const ids=line.slice(2).trim().split(/\s+/).map(v=>Number(v.split('/')[0])-1),p=ids.map(i=>rows[i]);
   if(p.length!==3||p.some(v=>!v))throw Error('Expected indexed triangle OBJ');
   if(Math.min(...p.map(v=>v[1]))>bounds.maxY||Math.max(...p.map(v=>v[1]))<-.12||Math.max(...p.map(v=>v[2]))<bounds.minZ||Math.min(...p.map(v=>v[2]))>bounds.maxZ)continue;
   selectedFaces++;for(const q of p)insert(q);
   const edge=Math.max(...[[0,1],[1,2],[2,0]].map(([a,b])=>Math.hypot(p[a][0]-p[b][0],p[a][2]-p[b][2])));
   const divisions=Math.ceil(edge/spacing);
   if(divisions>1)for(let i=0;i<=divisions;i++)for(let j=0;j<=divisions-i;j++){
    const u=i/divisions,v=j/divisions;insert(p[0].map((n,k)=>n+(p[1][k]-n)*u+(p[2][k]-n)*v));
   }
  }
 }
 const samples=[...cells.values()];assert.ok(samples.length>500,'opaque wheel-area surface coverage');
 return {samples,bodySha256:sha.digest('hex'),sourceVertices:rows.length,sourceFaces:faces,selectedFaces,rawSamples:sampled,coverageCells:samples.length};
}
function poses(spec,radius,widthScale,trackExtra){
 const axles=fitAxles(spec,radius),span=axles.length===3?axles[0]-(axles[1]+axles[2])*.5:spec.wheelbase;
 const rearFactor=spec.bodyStyle==='hummer'?-.25:spec.bodyStyle==='urus'?-.12:0;
 const front=34*Math.PI/180,rear=front*rearFactor,out=[];
 for(let axle=0;axle<axles.length;axle++){
  const bump=Math.max(.055,(spec.suspension[axle?'travelRear':'travelFront']??spec.suspension.travel)*.58);
  const halfWidth=(axle?(spec.rearTireWidth??spec.tireWidth):spec.tireWidth)*widthScale*.5+margin;
  for(let wheelStage=0;wheelStage<=3;wheelStage++){
   const track=spec.track+trackExtra+.035*wheelStage,angle=axle?rear:front,other=axle?front:rear;
   const curvature=(Math.tan(angle)-Math.tan(other))/(axle?-span:span);
   const maxAngle=Math.atan(Math.abs(Math.tan(angle))/Math.max(.35,1-track*.5*Math.abs(curvature)));
   const count=Math.max(1,Math.ceil(maxAngle/stepAngle));
   for(const side of [-1,1])for(let k=-count;k<=count;k++){
    const theta=maxAngle*k/count;out.push({x:side*track*.5,z:axles[axle],c:Math.cos(theta),s:Math.sin(theta),bump,halfWidth,axle,side,theta});
   }
  }
 }
 return out;
}
export function requiredTireLift(samples,spec,radius,widthScale,trackExtra,cutoff=Infinity){
 const r=radius+margin,r2=r*r;let lift=0,limiting=null;
 for(const pose of poses(spec,radius,widthScale,trackExtra))for(const p of samples){
  const dx=p[0]-pose.x,dz=p[2]-pose.z;
  if(Math.abs(dx)>r+pose.halfWidth||Math.abs(dz)>r+pose.halfWidth)continue;
  const axial=dx*pose.c-dz*pose.s;if(Math.abs(axial)>pose.halfWidth)continue;
  const along=dx*pose.s+dz*pose.c;if(Math.abs(along)>=r)continue;
  const needed=spec.tireRadius+pose.bump+Math.sqrt(r2-along*along)-p[1];
  if(needed>lift){lift=needed;limiting={surfaceM:p,axle:pose.axle,side:pose.side,steerDegrees:pose.theta*180/Math.PI};if(lift>cutoff)return {lift,limiting};}
 }
 return {lift:Math.max(0,lift),limiting};
}
export function deriveTireFits(spec,samples){
 if(spec.tireRadius*2/.0254>=50)return [];
 const fits=[];
 for(let stage=1;stage<=3;stage++){
  const diameter=tireDiameterInches(spec.tireRadius,stage),radius=diameter*.0127,widthScale=1.21*Math.sqrt(radius/spec.tireRadius);
  let best=null;
  const minimumTrack=Math.ceil(Math.max(0,radius-spec.tireRadius)*.55/.025)*.025;
  for(let i=0;i<=18;i++){
   const trackExtra=i*.025;if(trackExtra<minimumTrack-1e-9)continue;
   // Penalize both vertical and lateral departures from the stock stance.
   // The minimum is selected from the actual local body, never a global
   // body-height bound that needlessly puts the whole vehicle above its tires.
   const scoreTrack=(trackExtra/.45)**2,cutoff=best?Math.sqrt(Math.max(0,best.score-scoreTrack))*.55:Infinity;
   if(best&&scoreTrack>=best.score)continue;
   const fit=requiredTireLift(samples,spec,radius,widthScale,trackExtra,cutoff);
   const lift=Math.ceil((fit.lift+.008)*1000)/1000,score=(lift/.55)**2+scoreTrack;
   if(!best||score<best.score)best={score,lift,trackExtra,...fit};
  }
  const liftM=Math.ceil((best.lift+.008)*1000)/1000;
  assert.ok(liftM<1.25&&best.trackExtra<=.45,'bounded tire fitting kit');
  fits.push({stage,diameterInches:diameter,liftM,trackExtraM:best.trackExtra,axleOffsetsM:fitAxles(spec,radius),
   marginM:margin,maximumWidthScale:widthScale,maximumSuspensionStage:3,maximumWheelStage:3,
   clearanceM:liftM-best.lift,limiting:best.limiting});
 }
 return fits;
}
export async function bakeTireFits(root,manifest){
 const materials=new Map(manifest.materials.map(m=>[m.id,m])),evidence=path.join(root,'Saved','ExpandedRosterFidelity','TireFit');fs.mkdirSync(evidence,{recursive:true});
 const results=[];
 for(const spec of manifest.vehicles){
  if(spec.tireRadius*2/.0254>=50){spec.tireFits=[];continue;}
  const name=spec.asset+'_body',asset=manifest.assets.find(a=>a.name===name),cache=path.join(evidence,name+'.json');let data;
  if(fs.existsSync(cache)){const old=JSON.parse(fs.readFileSync(cache,'utf8'));if(old.bodySha256===asset.sha256&&old.version===2)data=old;}
  if(!data){
   data={version:2,...await bodySamples(path.join(root,'SourceAssets',name+'.obj'),spec,materials)};
   assert.equal(data.bodySha256,asset.sha256,'tire fitting mesh matches export manifest');
   const pending=`${cache}.${process.pid}.tmp`;
   try{fs.writeFileSync(pending,JSON.stringify(data));fs.renameSync(pending,cache);}
   finally{fs.rmSync(pending,{force:true});}
  }
  const tireFits=deriveTireFits(spec,data.samples);spec.tireFits=tireFits;
  results.push({id:spec.id,bodySha256:data.bodySha256,sourceVertices:data.sourceVertices,selectedFaces:data.selectedFaces,coverageCells:data.coverageCells,tireFits});
  console.log(JSON.stringify({tireFit:spec.id,coverageCells:data.coverageCells,fits:tireFits.map(f=>({stage:f.stage,inches:f.diameterInches,liftM:f.liftM,trackExtraM:f.trackExtraM}))}));
 }
 const report={revision:2,kind:'source-geometry',nativeAcceptance:false,sampleSpacingM:spacing,marginM:margin,
  steering:'Full 34-degree input with Ackermann and factory rear steering; two-degree angular sampling',
  suspension:'Complete upward sweep through stock bump; every upgraded suspension has greater lift than its additional bump',
  wheels:'All four wheel-width/track stages; worst tire compound width; trailing tandem axle extended for an 80 mm gap',vehicles:results};
 fs.writeFileSync(path.join(evidence,'fit-report.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 verifySourceExport(rootDefault);
 const manifest=JSON.parse(fs.readFileSync(path.join(rootDefault,'SourceAssets','import.json'),'utf8'));
 const terrain=fs.readFileSync(path.join(rootDefault,'Content','NativeData','terrain.bin'));
 beginSourceExport(rootDefault);
 await bakeTireFits(rootDefault,manifest);
 publishSourceExport(rootDefault,manifest,terrain);
}
