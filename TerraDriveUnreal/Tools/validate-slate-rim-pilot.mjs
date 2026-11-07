import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {slateRimCoverage,slateRimRouteClearance,slateRimStoneRadius} from './slate-rim-pilot.mjs';

const root=path.resolve(import.meta.dirname,'..');
const baseline=process.argv[2]&&path.resolve(process.argv[2]);
const read=(root,file)=>fs.readFileSync(path.join(root,file));
const json=(root,file)=>JSON.parse(read(root,file));
const data='Content/NativeData/';
const world=json(root,data+'world.json');
const {assets,materials,...imported}=json(root,'SourceAssets/import.json');
assert.deepEqual(imported,world,'import and runtime manifests agree');
assert.ok(assets.length&&materials.length);
const pilot=world.slateRimPilot;
assert.equal(pilot.version,1);
assert.equal(pilot.endM-pilot.startM,122);
const coverage=slateRimCoverage(world.quarryTrail.samples);
const clear=slateRimRouteClearance(world);
const placed={shelves:0,scree:0,grass:0},meshes=new Set();
let minimum=Infinity;
for(const group of world.nativeDetails)for(const instance of group.instances){
  const kind=instance.slateRimPilot;
  if(!kind)continue;
  assert.ok(Object.hasOwn(placed,kind));
  const [x,y,z]=instance.p.map(v=>v/100);
  assert.ok(Number.isFinite(z)&&coverage(x,y),'pilot transform is in the authored corridor');
  assert.ok(instance.s.every(v=>Number.isFinite(v)&&v>0));
  assert.ok(Math.abs(Math.hypot(...instance.q)-1)<1e-6);
  placed[kind]++;
  if(kind==='grass'){
    assert.equal(group.solid,false);
    continue;
  }
  assert.ok(group.solid&&group.snapBoulder,'existing grounded collision policy');
  meshes.add(group.asset);
  const margin=clear(x,y)-slateRimStoneRadius(instance.s);
  assert.ok(margin>=.15,'complete bounding sphere clears both drivable corridors');
  minimum=Math.min(minimum,margin);
}
const {retiredScatter,...newCounts}=pilot.counts;
assert.deepEqual(placed,newCounts);
assert.ok(placed.shelves>=25&&placed.scree>=20&&placed.grass>=30);
assert.equal(+minimum.toFixed(3),pilot.minimumClearanceM);
for(const name of meshes){
  const vertices=read(root,'SourceAssets/'+name+'.obj').toString().split('\n')
    .filter(l=>l.startsWith('v ')).map(l=>l.trim().split(/\s+/).slice(1).map(Number));
  assert.ok(vertices.length>0);
  const extents=[0,1,2].map(axis=>{
    const values=vertices.map(v=>v[axis]);
    return Math.max(...values)-Math.min(...values);
  });
  assert.ok(extents[0]<=206&&extents[1]<=206&&extents[2]<=135,
    'source bounds fit the centred and grounded collision envelope');
}

if(baseline){
  const oldWorld=json(baseline,data+'world.json');
  const ignored=new Set(['slateRimPilot','nativeDetails']);
  for(const [key,value] of Object.entries(oldWorld))
    if(!ignored.has(key)&&key!=='vehicles')assert.deepEqual(world[key],value,key);
  const instances=(w)=>w.nativeDetails.flatMap(g=>g.instances.map(p=>[g.asset,g.snapBoulder===true,p]));
  const old=instances(oldWorld), now=instances(world);
  const existing=new Set(now.filter(([,,p])=>!p.slateRimPilot).map(v=>JSON.stringify(v)));
  let removed=0;
  for(const item of old){
    if(existing.has(JSON.stringify(item)))continue;
    const [,rock,p]=item,[x,y]=p.p.map(v=>v/100),where=coverage(x,y);
    assert.ok(where&&Math.abs(where.side)>5.65,'no legacy instance removed from the drive line or another sector');
    if(rock)assert.ok(clear(x,y)-slateRimStoneRadius(p.s)>.15,
      'a retired rock also clears the complete drivable corridor with its bounding sphere');
    removed++;
  }
  assert.equal(removed,retiredScatter);
  assert.equal(now.length,old.length-removed+Object.values(placed).reduce((a,b)=>a+b,0));
  for(const file of ['terrain.bin','terrain-blend.bin','terrain-transitions.json'])
    assert.ok(read(root,data+file).equals(read(baseline,data+file)),file+' stays byte-identical');
  const field=read(root,data+'terrain.bin'), n=field.readUInt32LE(4);
  const step=field.readFloatLE(8),origin=field.readFloatLE(12);
  const masks=base=>['A','B'].map(x=>read(base,'SourceAssets/TerrainBlend'+x+'.tga'));
  const [a,b]=masks(root),[oldA,oldB]=masks(baseline);
  let changed=0;
  for(let i=0;i<n*n;i++){
    const at=18+i*4,delta=b[at+2]-oldB[at+2];
    assert.ok(delta>=0&&oldA[at+2]-a[at+2]===delta,'only transfer dirt to visual rock');
    assert.ok(a[at]===oldA[at]&&a[at+1]===oldA[at+1]&&a[at+3]===oldA[at+3]);
    assert.ok(b[at]===oldB[at]&&b[at+1]===oldB[at+1]&&b[at+3]<=oldB[at+3]);
    if(!delta&&b[at+3]===oldB[at+3])continue;
    const p=coverage(origin+Math.floor(i/n)*step,origin+i%n*step);
    assert.ok(p,'visual changes stay inside the pilot');
    if(delta)assert.ok(Math.abs(p.side)>3.55,'the worn tire lanes do not become bedrock');
    changed++;
  }
  assert.equal(changed,json(root,'Saved/terrain-transitions.json').slateRimVisualPixels);
  assert.ok(changed>10000);
}
console.log(JSON.stringify({...pilot,reusedMeshVariants:meshes.size,baselineCompared:Boolean(baseline),pass:true}));
