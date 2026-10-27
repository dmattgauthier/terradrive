// Bounded native convex coachwork, derived from the exact exported body mesh.
// Existing suspension/undertray handling remains separate from these surfaces.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import readline from 'node:readline';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const dot=(p,d)=>p[0]*d[0]+p[1]*d[1]+p[2]*d[2];
const directions=[];
for(let i=0;i<128;i++){const z=1-2*(i+.5)/128,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-z*z);directions.push([r*Math.cos(a),r*Math.sin(a),z]);}
directions.push([1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]);
const unique=points=>[...new Map(points.map(p=>[p.map(v=>v.toFixed(5)).join(','),p])).values()];
function hullPoints(points){
 const target=directions.map(d=>{let best=points[0],value=-Infinity;for(const p of points){const v=dot(p,d);if(v>value){value=v;best=p;}}return{d,best,value};});
 const chosen=unique(target.filter((_,i)=>i>=128||i%8===0).map(t=>t.best));
 let error=0;
 while(chosen.length<64){let worst=null;error=0;for(const t of target){const gap=t.value-Math.max(...chosen.map(p=>dot(p,t.d)));if(gap>error){error=gap;worst=t.best;}}if(error<=.25)break;chosen.push(worst);}
 error=Math.max(...target.map(t=>t.value-Math.max(...chosen.map(p=>dot(p,t.d)))));
 assert.ok(error<=1.25,'Bounded convex approximation within half an inch');
 const min=[0,1,2].map(k=>Math.min(...chosen.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...chosen.map(p=>p[k])));
 assert.ok(chosen.length>=4&&max.every((v,k)=>v-min[k]>1),'Nondegenerate solid convex section');
 return{points:chosen,maxSampledSupportErrorCM:error,boundsCM:{min,max}};
}
async function bodyPoints(file,spec,materials){
 let block=[],total=0,done=false;const points=[],hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',b=>hash.update(b));
 for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
  if(line.startsWith('v ')){if(done){block=[];done=false;}const p=line.slice(2).trim().split(/\s+/).map(Number);assert.ok(p.length===3&&p.every(Number.isFinite));block.push([p[0],-p[1],p[2]]);total++;}
  else if(line.startsWith('usemtl ')&&!done){
   const m=materials.get(line.slice(7).trim());assert.ok(m,'Known exported material');
   const solid=m.opacity>=.999&&!['glass','rubber','brake','reverse','sky'].includes(m.role)&&['paint','plastic','carbon','black',''].includes(m.automotive);
   if(solid)for(const p of block){
    // Flexible mirror tips, antennae and spare-wheel hardware are not the
    // structural shell. Catalogue width/height bound those accessories.
    if(Math.abs(p[1])<=spec.width*50+1.5&&p[2]<=(spec.height-spec.cgHeight)*100+2&&p[2]>=(spec.clearance-spec.cgHeight)*100-5)points.push(p);
   }
   done=true;
  }
 }
 assert.ok(points.length>1000,'Complete opaque structural body');return{points,sourceVertexCount:total,objSha256:hash.digest('hex')};
}
export async function bakeCoachworkCollision(output='Content/NativeData/vehicle-collision.json'){
 const manifest=read('SourceAssets/import.json'),materials=new Map(manifest.materials.map(m=>[m.id,m]));
 const data={version:1,algorithm:'opaque-coachwork-sections-1',coordinates:'Unreal mesh-local centimetres; already includes source body datum and longitudinal offset',maximumHulls:12,maximumHullVertices:64,vehicles:[]};
 for(const [index,spec]of manifest.vehicles.entries()){
  const name=spec.asset+'_body',source=await bodyPoints(path.join(root,'SourceAssets',name+'.obj'),spec,materials);assert.equal(source.objSha256,manifest.assets.find(a=>a.name===name).sha256);
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const p of source.points)for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}
  const hulls=[],probeCells=new Map(),length=bounds.max[0]-bounds.min[0],height=bounds.max[2]-bounds.min[2];
  for(let section=0;section<12;section++){
   const lo=bounds.min[0]+length*section/12,hi=bounds.min[0]+length*(section+1)/12;
   const points=source.points.filter(p=>p[0]>=lo-2&&p[0]<=hi+2);assert.ok(points.length>=8,'Covered longitudinal section');hulls.push({section,...hullPoints(points)});
  }
  for(const p of source.points){const x=Math.min(11,Math.floor((p[0]-bounds.min[0])/length*12)),z=Math.min(7,Math.floor((p[2]-bounds.min[2])/height*8)),key=x+':'+z;
   if(!probeCells.has(key))probeCells.set(key,[p,p,p,p]);const a=probeCells.get(key);if(p[1]<a[0][1])a[0]=p;if(p[1]>a[1][1])a[1]=p;if(p[2]<a[2][2])a[2]=p;if(p[2]>a[3][2])a[3]=p;
  }
  const probes=unique([...probeCells.values()].flat());assert.ok(probes.length>=64&&probes.length<=384);
  const record={index,id:spec.id,asset:name,objSha256:source.objSha256,sourceVertexCount:source.sourceVertexCount,structuralVertices:source.points.length,boundsCM:bounds,hulls,rolloverProbes:probes};data.vehicles.push(record);
  console.log(JSON.stringify({vehicle:spec.name,hulls:hulls.length,hullVertices:hulls.reduce((n,h)=>n+h.points.length,0),maxSampledSupportErrorCM:Math.max(...hulls.map(h=>h.maxSampledSupportErrorCM)),rolloverProbes:probes.length}));
 }
 const target=path.join(root,output);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n');return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const i=process.argv.indexOf('--output');await bakeCoachworkCollision(i>=0?process.argv[i+1]:undefined);}
