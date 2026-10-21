import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Terrain} from '../../TerraDrive-v1.13/dist/src/terrain.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const b=fs.readFileSync(path.join(root,'Content/NativeData/terrain.bin'));
const data=JSON.parse(fs.readFileSync(path.join(root,'SourceAssets/import.json')));
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
assert.ok(maxError<1e-4);assert.equal(data.vehicles.length,5);assert.equal(data.zones.length,8);
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
for(const a of data.assets){assert.ok(fs.statSync(path.join(root,'SourceAssets',a.name+'.obj')).size>50);for(const slot of a.slots)assert.ok(data.materials.some(m=>m.id===slot));}
for(const group of data.placements)for(const i of group.instances){assert.ok([...i.p,...i.q,...i.s].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...i.q)-1)<1e-5);}
for(const t of data.trees)for(const p of t.parts){assert.ok(data.placements[p.group].instances.some(i=>i.index===p.index));}
const report={terrainSamples:1000,maximumHeightExportErrorM:maxError,vehicles:data.vehicles.length,zones:data.zones.length,zoneSamples,meshSources:data.assets.length,trees:data.trees.length,placements:data.placements.reduce((n,g)=>n+g.instances.length,0),pass:true};
fs.mkdirSync(path.join(root,'docs'),{recursive:true});fs.writeFileSync(path.join(root,'docs/export-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
