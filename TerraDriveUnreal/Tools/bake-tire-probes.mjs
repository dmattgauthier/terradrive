// Independent rollover witnesses selected from actual exported tire vertices.
// No support/collision formula creates these points: the native fixture reads
// the mesh-derived witnesses and applies the tire component's real transform.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {tireDiameterInches} from './tire-size-geometry.mjs';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'SourceAssets','import.json'),'utf8'));
const assets=new Map(manifest.assets.map(a=>[a.name,a]));
const cached=new Map();
async function readTire(asset,radiusM){
 if(cached.has(asset.name))return cached.get(asset.name);
 const vertices=[],hash=crypto.createHash('sha256');
 const stream=fs.createReadStream(path.join(root,'SourceAssets',asset.name+'.obj'));stream.on('data',chunk=>hash.update(chunk));
 let maxAxial=0,maxRadial=0;
 for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity}))if(line.startsWith('v ')){
  const [x,y,z]=line.slice(2).split(/\s+/).map(Number);assert.ok([x,y,z].every(Number.isFinite),'finite exported vertex');
  vertices.push(x,-y,z);maxAxial=Math.max(maxAxial,Math.abs(y));maxRadial=Math.max(maxRadial,Math.hypot(x,z));
 }
 assert.equal(hash.digest('hex'),asset.sha256,'tire witness source matches export manifest: '+asset.name);
 assert.ok(vertices.length>300,'tire witness source contains geometry');
 const R=radiusM*100,choices=[],minRadius=R*.4;
 // Seven support directions sample both sidewalls, the shoulders, and crown.
 // Twelve radial sectors keep rollover witnesses independent of wheel spin.
 for(const angle of [-90,-60,-30,0,30,60,90])for(let sector=0;sector<12;sector++){
  const a=angle*Math.PI/180,phi=sector*Math.PI/6,ca=Math.cos(a),sa=Math.sin(a),cp=Math.cos(phi),sp=Math.sin(phi);
  let best=-Infinity,index=-1;
  for(let i=0;i<vertices.length;i+=3){const x=vertices[i],y=vertices[i+1],z=vertices[i+2];if(Math.hypot(x,z)<=minRadius)continue;
   const radial=x*cp+z*sp,score=sa*y+ca*radial+1e-8*radial;
   if(score>best){best=score;index=i/3;}
  }
  assert.ok(index>=0,'outer tire support witness exists');choices.push(index);
 }
 // Twelve inner-sidewall/bead-band samples detect a rolled tire passing
 // through ground between its outer shoulder and retained stock rim.
 for(const side of [-1,1])for(let sector=0;sector<6;sector++){
  const phi=sector*Math.PI/3;let best=Infinity,index=-1;
  for(let i=0;i<vertices.length;i+=3){const x=vertices[i],y=vertices[i+1],z=vertices[i+2],r=Math.hypot(x,z);if(side*y<maxAxial*.20||r<=minRadius)continue;
   const delta=Math.atan2(Math.sin(Math.atan2(z,x)-phi),Math.cos(Math.atan2(z,x)-phi));
   const score=Math.abs(r-R*.45)+R*Math.abs(delta)/3;
   if(score<best){best=score;index=i/3;}
  }
  assert.ok(index>=0,'inner tire sidewall witness exists');choices.push(index);
 }
 const sourceVertexIndices=[...new Set(choices)],pointsCm=sourceVertexIndices.map(i=>vertices.slice(i*3,i*3+3));
 assert.ok(pointsCm.length<=96&&pointsCm.length>=24,'bounded stratified witness set');
 assert.ok(pointsCm.every(p=>p.every(Number.isFinite)&&Math.hypot(p[0],p[2])>minRadius),'all probes are outside the excluded hub center');
 for(const side of [-1,1])assert.ok(pointsCm.some(p=>p[1]*side>=maxAxial*.98),'sidewall extremum represented');
 const result={asset:asset.name,sha256:asset.sha256,radiusM,maxAxialHalfWidthM:maxAxial/100,maxRadialM:maxRadial/100,
  sourceVertexCount:vertices.length/3,sourceVertexIndices,pointsCm};cached.set(asset.name,result);return result;
}
const vehicles=[];
for(const spec of manifest.vehicles){
 const stages=[];for(let stage=0;stage<=3;stage++){
  const largerStock=spec.tireRadius*2/.0254>=50,assetName=spec.asset+(stage===0||largerStock?'_tire':'_tire_size'+stage+'_0');
  const asset=assets.get(assetName);assert.ok(asset,'exported tire asset exists: '+assetName);
  const radiusM=stage===0||largerStock?spec.tireRadius:tireDiameterInches(spec.tireRadius,stage)*.0127;
  stages.push({stage,...await readTire(asset,radiusM)});
 }
 const compounds=[];
 for(let stage=1;stage<=3;stage++){
  const assetName=spec.asset+'_tire_'+stage,asset=assets.get(assetName);
  assert.ok(asset,'exported compound tire exists: '+assetName);
  compounds.push({stage,...await readTire(asset,spec.tireRadius)});
 }
 vehicles.push({id:spec.id,stages,compounds});
 console.log(JSON.stringify({tireProbes:spec.id,stages:stages.map(s=>({stage:s.stage,points:s.pointsCm.length,maxAxialHalfWidthM:s.maxAxialHalfWidthM,maxRadialM:s.maxRadialM})),
  compounds:compounds.map(s=>({stage:s.stage,asset:s.asset,points:s.pointsCm.length}))}));
}
const data={version:2,coordinateSystem:'Unreal imported tire-local centimeters (OBJ X,-Y,Z)',
 method:'Actual exported vertex witnesses: 7 support directions x 12 radial sectors plus 12 inner sidewall/bead samples, deduplicated; excludes radius <= 40 percent of physical tire radius',
 nativeAcceptance:false,vehicles};
fs.writeFileSync(path.join(root,'Content','NativeData','vehicle-tire-probes.json'),JSON.stringify(data));
console.log(JSON.stringify({vehicles:vehicles.length,stages:vehicles.length*4,compounds:vehicles.length*3,
 uniqueMeshes:cached.size,maxProbes:Math.max(...vehicles.flatMap(v=>[...v.stages,...v.compounds].map(s=>s.pointsCm.length)))}));
