// Small native validation data derived from the actual exported coachwork.
// Streaming reads keep this safe alongside the editor on a 16 GB machine.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const script=fileURLToPath(import.meta.url);
const project=path.resolve(path.dirname(script),'..');
const NX=12,NY=6,MAX_PROBES=60,MIN_PROBES=32;
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');

function nativePoint(line){
  if(!line.startsWith('v '))return null;
  const p=line.slice(2).trim().split(/\s+/).map(Number);
  assert.equal(p.length,3,'OBJ position must contain three coordinates');
  assert.ok(p.every(Number.isFinite),'finite OBJ position');
  // export-source emits (source Z,source X,source Y). Interchange reflects
  // OBJ Y during import; validation probes must use that same final basis.
  return [p[0],-p[1],p[2]];
}
async function scanBounds(file){
  const stream=fs.createReadStream(file),sha=crypto.createHash('sha256');
  stream.on('data',bytes=>sha.update(bytes));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let count=0;
  for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
    const p=nativePoint(line);if(!p)continue;++count;
    for(let axis=0;axis<3;++axis){min[axis]=Math.min(min[axis],p[axis]);max[axis]=Math.max(max[axis],p[axis]);}
  }
  assert.ok(count>1000,'complete coachwork vertex stream');
  assert.ok(max[0]-min[0]>200&&max[1]-min[1]>100,'vehicle dimensions are centimetres');
  return {min,max,count,objSha256:sha.digest('hex')};
}
function region(x,y){
  if(x>=NX-2)return 'front';
  if(x<2)return 'rear';
  if(y===0)return 'right-skirt';
  if(y===NY-1)return 'left-skirt';
  return 'underbody';
}
async function selectProbes(file,bounds){
  const cells=new Map();let vertex=0;
  for await(const line of readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity})){
    const p=nativePoint(line);if(!p)continue;++vertex;
    const x=Math.min(NX-1,Math.max(0,Math.floor((p[0]-bounds.min[0])/(bounds.max[0]-bounds.min[0])*NX)));
    const y=Math.min(NY-1,Math.max(0,Math.floor((p[1]-bounds.min[1])/(bounds.max[1]-bounds.min[1])*NY)));
    const key=x*NY+y,previous=cells.get(key);
    if(!previous||p[2]<previous.point[2])cells.set(key,{region:region(x,y),cell:[x,y],sourceVertex:vertex,point:p});
  }
  const lowLimit=bounds.min[2]+Math.max(40,(bounds.max[2]-bounds.min[2])*.30);
  const all=[...cells.values()],low=all.filter(p=>p.point[2]<=lowLimit);
  // Keep the bumper/outer-skirt coverage first; fill remaining capacity with
  // low underbody samples. Every probe remains an actual surface vertex.
  const priority=p=>p.region==='underbody'?1:0;
  low.sort((a,b)=>priority(a)-priority(b)||a.point[2]-b.point[2]||a.cell[0]-b.cell[0]||a.cell[1]-b.cell[1]);
  const selected=low.slice(0,MAX_PROBES);
  if(selected.length<MIN_PROBES){
    const used=new Set(selected.map(p=>p.sourceVertex));
    for(const p of all.sort((a,b)=>a.point[2]-b.point[2])){
      if(!used.has(p.sourceVertex)){selected.push(p);used.add(p.sourceVertex);}
      if(selected.length>=MIN_PROBES)break;
    }
  }
  selected.sort((a,b)=>a.cell[0]-b.cell[0]||a.cell[1]-b.cell[1]);
  assert.ok(selected.length>=MIN_PROBES&&selected.length<=MAX_PROBES,'32–60 body surface probes');
  for(const expected of ['front','rear','left-skirt','right-skirt','underbody'])
    assert.ok(selected.some(p=>p.region===expected),'body coverage includes '+expected);
  assert.equal(vertex,bounds.count,'unchanged source during both passes');
  return selected;
}

export async function bakeVehicleGroundProbes(root=project){
  const world=JSON.parse(fs.readFileSync(path.join(root,'Content','NativeData','world.json'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'SourceAssets','import.json'),'utf8'));
  assert.equal(manifest.meshSchema,2,'known Interchange coordinate basis');
  const output={version:1,algorithm:'lower-body-spatial-minima-v1',
    algorithmSha256:hash(fs.readFileSync(script)),
    coordinates:'Unreal mesh-local centimetres: OBJ X,-Y,Z; transform with the Body component',
    grid:[NX,NY],vehicles:[]};
  for(const [index,vehicle] of world.vehicles.entries()){
    const obj=vehicle.asset+'_body.obj',file=path.join(root,'SourceAssets',obj);
    const before=fs.statSync(file),bounds=await scanBounds(file),probes=await selectProbes(file,bounds),after=fs.statSync(file);
    assert.equal(after.size,before.size,'unchanged model length during extraction');
    assert.equal(after.mtimeMs,before.mtimeMs,'unchanged model during extraction');
    const exported=manifest.assets.find(a=>a.name===vehicle.asset+'_body');
    assert.equal(exported?.sha256,bounds.objSha256,'probe source matches the imported model manifest');
    output.vehicles.push({index,id:vehicle.id,asset:vehicle.asset+'_body',objSource:obj,
      objSha256:bounds.objSha256,sourceVertexCount:bounds.count,
      boundsCM:{min:bounds.min,max:bounds.max},probeCount:probes.length,probes});
  }
  const target=path.join(root,'Content','NativeData','vehicle-ground-probes.json');
  const bytes=JSON.stringify(output,null,2)+'\n';fs.writeFileSync(target,bytes);
  const report={path:target,sha256:hash(bytes),vehicles:output.vehicles.map(v=>({
    index:v.index,id:v.id,objSha256:v.objSha256,sourceVertexCount:v.sourceVertexCount,
    probeCount:v.probeCount,regions:Object.fromEntries([...new Set(v.probes.map(p=>p.region))].map(r=>[r,v.probes.filter(p=>p.region===r).length]))})),pass:true};
  console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===script)await bakeVehicleGroundProbes();
