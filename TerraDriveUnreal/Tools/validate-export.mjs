import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Terrain} from './native-terrain.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const b=fs.readFileSync(path.join(root,'Content/NativeData/terrain.bin'));
const data=JSON.parse(fs.readFileSync(path.join(root,'SourceAssets/import.json')));
// Circularity is tested against a fixed centre/radius, independently of the
// course generator. Both axial extrema and intermediate profile points matter.
assert.equal(data.loopFrames.length,25);
for(const f of data.loopFrames){assert.ok(Math.abs(Math.hypot(f.p[0]-5800,f.p[2]-2472)-2000)<1e-6);assert.ok(Math.abs(Math.hypot(...f.n)-1)<1e-6);}
assert.ok(Math.abs(data.loopFrames[6].p[0]-7800)<1e-6);
assert.ok(Math.abs(data.loopFrames[18].p[0]-3800)<1e-6);
assert.equal(data.vehicles[5].nativeModel.bodyShape.version,10);
assert.ok(data.vehicles[5].nativeModel.bodyShape.physicalHeightDoorGrid&&data.vehicles[5].nativeModel.bodyShape.continuousDoorSections);
assert.ok(data.vehicles[5].nativeModel.bodyShape.camberedClosedSpoiler&&data.vehicles[5].nativeModel.bodyShape.crownedGreenhouse);
assert.equal(data.vehicles[5].nativeModel.bodyShape.landmarks.wheelbase,3.006);
for(const v of data.vehicles.slice(0,5)){assert.ok(v.nativeModel.bodyShape.vertices>10000);assert.ok(v.nativeModel.bodyShape.maximumSurfaceChangeM>.01&&v.nativeModel.bodyShape.maximumSurfaceChangeM<.12);}
assert.equal(data.fabScenery.groups.length,19);
for(const asset of ['Snow_Chunk03','Snow_Chunk05','Snow_Chunk07'])assert.ok(data.fabScenery.groups.some(g=>g.asset===asset&&g.kind==='snowbank'&&!g.solid&&g.instances.length>0));
assert.ok(data.fabScenery.groups.filter(g=>g.kind==='grass').reduce((n,g)=>n+g.instances.length,0)>=1000);
assert.ok(data.fabScenery.groups.reduce((sum,g)=>sum+g.instances.length,0)>100);
assert.equal(b.readUInt32LE(0),0x54445256);assert.equal(b.readUInt32LE(4),1601);
assert.equal(b.length,16+1601*1601*9);
const terrain=new Terrain();let maxError=0;
for(let i=0;i<1000;i++){
 const row=(i*383+19)%1601,col=(i*701+31)%1601,offset=16+(row*1601+col)*9;
 const x=400-col*.5,z=-400+row*.5,s=terrain.sample(x,z);
 maxError=Math.max(maxError,Math.abs(b.readFloatLE(offset)-s.height));
 assert.equal(data.surfaces[b[offset+8]],s.surface);
 assert.ok(Math.abs(b.readFloatLE(offset+4)-s.waterDepth)<1e-5);
}
assert.ok(maxError<1e-4);assert.equal(data.vehicles.length,6);assert.equal(data.zones.length,9);
assert.equal(data.routes.length,9);assert.equal(data.constructed.length,2);
assert.ok(data.quarryTrail.lengthM>280&&data.quarryTrail.lengthM<420);
assert.equal(data.quarryTrail.routeIndex,8);assert.equal(data.routes[8].gates.length,20);
assert.ok(data.quarryTrail.assetCounts.cliffs>=20&&data.quarryTrail.assetCounts.boulders>=400&&data.quarryTrail.assetCounts.grass>2000);
const trailReference=new Terrain();
for(const p of data.quarryTrail.samples){assert.ok([p.x,p.y,p.z,p.tx,p.ty,p.d].every(Number.isFinite));assert.ok(Math.abs(p.z-trailReference.heightAt(-p.y,p.x))<1e-5);}
// Cover the narrow graded corridor explicitly: the broad random sample can
// miss it, and physics reads terrain.bin rather than route metadata.
assert.equal(data.terrainGrade,'slate-rim-heightfield-1');
let gradedSamples=0;
for(const p of data.quarryTrail.samples)for(const side of [-2,0,2]){
 const row=Math.round((p.x-p.ty*side+400)*2),col=Math.round((p.y+p.tx*side+400)*2);
 const ux=-400+row*.5,uy=-400+col*.5,offset=16+(row*1601+col)*9;
 assert.ok(Math.abs(b.readFloatLE(offset)-terrain.heightAt(-uy,ux))<1e-4,'staged quarry grade');
 gradedSamples++;
}
assert.equal(data.routes[0].gateDirections[2],-1);assert.ok(data.routes[0].gates[2][2]>4400);
for(const route of data.routes){assert.ok(route.spawn.every(Number.isFinite));assert.ok(route.gates.length>=3);assert.ok(route.gates.every(g=>g.every(Number.isFinite)));}
for(const id of ['loop','tabletop','gap-launch','gap-landing'])assert.ok(data.challengeFeatures.some(f=>f.id===id&&f.triangles>0),id);
// Exercise the native addressing convention in world coordinates, not just
// the export loop's row/column convention. Source Z maps to Unreal X (row).
const zoneSamples=data.zones.map(zone=>{
 const {x,z}=zone.spawn,ux=z,uy=-x;
 const row=Math.round((ux+400)/.5),col=Math.round((uy+400)/.5);
 const offset=16+(row*1601+col)*9,reference=terrain.sample(x,z);
 assert.equal(data.surfaces[b[offset+8]],reference.surface,zone.name+' surface');
 assert.ok(Math.abs(b.readFloatLE(offset)-reference.height)<1e-4,zone.name+' height');
 return {name:zone.name,unrealXM:ux,unrealYM:uy,surface:reference.surface,heightM:reference.height};
});
for(const a of data.assets){const obj=fs.readFileSync(path.join(root,'SourceAssets',a.name+'.obj'));assert.ok(obj.length>50);assert.ok(/^f /m.test(obj.toString()),a.name+' contains renderable triangles');assert.ok(!/\b(?:NaN|Infinity)\b/.test(obj.toString()),a.name+' has finite geometry');assert.ok(a.slots.length>0,a.name+' has material slots');assert.equal(crypto.createHash('sha256').update(obj).digest('hex'),a.sha256);for(const slot of a.slots)assert.ok(data.materials.some(m=>m.id===slot));}
for(const group of data.placements)for(const i of group.instances){assert.ok([...i.p,...i.q,...i.s].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...i.q)-1)<1e-5);}
for(const t of data.trees)for(const p of t.parts){assert.ok(data.placements[p.group].instances.some(i=>i.index===p.index));}
assert.equal(data.displayUnits,'imperial');
for(const v of data.vehicles)for(const part of ['armor','equipment'])assert.ok(data.assets.some(a=>a.name===v.asset+'_'+part));
for(const v of data.vehicles){
 assert.equal(v.nativeModel.version,3);assert.equal(v.nativeModel.splitTireAndRim,true);assert.equal(v.nativeModel.beveledTread,true);
 for(const part of ['tire','rim'])assert.ok(data.assets.some(a=>a.name===v.asset+'_'+part));
 const rimRadius=Number(v.tireSize.match(/R(\d+)/)[1])*.0254*.5*100;
 const vertices=fs.readFileSync(path.join(root,'SourceAssets',v.asset+'_rim.obj'),'utf8').split('\n').filter(l=>l.startsWith('v ')).map(l=>l.slice(2).split(' ').map(Number));
 const maximum=vertices.reduce((maximum,p)=>Math.max(maximum,Math.hypot(p[0],p[2])),0);
 assert.ok(maximum>rimRadius*.97&&maximum<rimRadius*1.06,v.name+' rim matches its factory diameter');
 assert.equal(v.nativeModel.upgradeTireBeads,true);
 const stockTire=fs.readFileSync(path.join(root,'SourceAssets',v.asset+'_tire.obj'),'utf8').split('\n').filter(l=>l.startsWith('v ')).map(l=>l.slice(2).split(' ').map(Number));
 const stockMin=stockTire.reduce((n,p)=>Math.min(n,Math.hypot(p[0],p[2])),Infinity),stockMax=stockTire.reduce((n,p)=>Math.max(n,Math.hypot(p[0],p[2])),0);
 for(let stage=1;stage<=3;stage++){
  const scale=1+.04*stage,upgraded=fs.readFileSync(path.join(root,'SourceAssets',v.asset+'_tire_'+stage+'.obj'),'utf8').split('\n').filter(l=>l.startsWith('v ')).map(l=>l.slice(2).split(' ').map(Number));
  const minimum=upgraded.reduce((n,p)=>Math.min(n,Math.hypot(p[0],p[2])*scale),Infinity),maximum=upgraded.reduce((n,p)=>Math.max(n,Math.hypot(p[0],p[2])*scale),0);
  assert.ok(Math.abs(minimum-stockMin)<.05,v.name+' upgraded bead stays seated at stage '+stage);
  assert.ok(Math.abs(maximum/stockMax-scale)<.005,v.name+' tread reaches physical size at stage '+stage);
 }
}
assert.ok(data.assets.some(a=>a.name==='detail_brake_caliper'));
// Civic's coachwork already owns its molded front lip. The separate equipment
// component must not reintroduce a straight bar ahead of the bumper.
const civicEquipment=fs.readFileSync(path.join(root,'SourceAssets/civic_sport_equipment.obj'),'utf8').split('\n').filter(l=>l.startsWith('v ')).map(l=>Number(l.split(' ')[1]));
assert.ok(civicEquipment.length>0&&Math.max(...civicEquipment)<0,'Civic equipment has no duplicate front strip');
assert.ok(data.materials.filter(m=>m.role==='paint'&&m.clearcoat>0).length>=5);
assert.ok(data.materials.filter(m=>m.role==='glass'&&m.opacity<.95).length>=10);
assert.ok(data.materials.some(m=>m.emissive?.some(v=>v>0)));
for(const group of [...data.placements,...data.nativeDetails])for(const i of group.instances){assert.equal(i.color.length,3);assert.ok(i.color.every(c=>Number.isFinite(c)&&c>=0));}
const details=data.nativeDetails.reduce((n,g)=>n+g.instances.length,0),solid=data.nativeDetails.filter(g=>g.solid).reduce((n,g)=>n+g.instances.length,0);
const tinted=new Set();for(const group of [...data.placements,...data.nativeDetails])
 if(group.instances.some(i=>i.color.some(c=>Math.abs(c-1)>.00001)))for(const slot of data.assets.find(a=>a.name===group.asset).slots)tinted.add(slot);
for(const m of data.materials)assert.equal(m.instanceTint,tinted.has(m.id));
assert.ok(details>500&&solid>20);
for(const group of data.nativeDetails)for(const i of group.instances){assert.ok([...i.p,...i.q,...i.s].every(Number.isFinite));assert.ok(i.s.every(s=>s>0));assert.ok(Math.abs(Math.hypot(...i.q)-1)<1e-5);}
const report={terrainSamples:1000,maximumHeightExportErrorM:maxError,vehicles:data.vehicles.length,zones:data.zones.length,zoneSamples,meshSources:data.assets.length,constructedGroups:data.constructed.length,challengeRoutes:data.routes.length,quarryDeckHeightM:data.quarryBaseM,trees:data.trees.length,placements:data.placements.reduce((n,g)=>n+g.instances.length,0),detailInstances:details,solidDetailInstances:solid,tintedMaterials:tinted.size,preservedInstanceColors:true,pass:true};
report.gradedTrailSamples=gradedSamples;report.terrainGrade=data.terrainGrade;
fs.mkdirSync(path.join(root,'docs'),{recursive:true});fs.writeFileSync(path.join(root,'docs/export-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
