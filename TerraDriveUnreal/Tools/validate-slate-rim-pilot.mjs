import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {slateRimCoverage,slateRimExtensionCoverage,slateRimRouteClearance,slateRimStoneRadius} from './slate-rim-pilot.mjs';

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
const extension=world.slateRimExtension;
assert.equal(extension.version,1);
assert.equal(extension.startM,pilot.endM);
assert.equal(extension.endM,world.quarryTrail.samples.at(-1).d);
const coverage=slateRimCoverage(world.quarryTrail.samples);
const extensionCoverage=slateRimExtensionCoverage(world.quarryTrail.samples);
const clear=slateRimRouteClearance(world);
const {perimeterTrail,...legacyWorld}=world;
legacyWorld.routes=world.routes.filter((_,i)=>i!==perimeterTrail?.routeIndex);
const legacyClear=slateRimRouteClearance(legacyWorld);
const quarryStart=world.quarryTrail.samples[0];
assert.ok(legacyClear(quarryStart.x,quarryStart.y)<=-4.1,'legacy refresh still protects the quarry spline');
const meshes=new Set();
function validatePlacements(key,report,footprint){
  const placed={shelves:0,scree:0,grass:0};
  let minimum=Infinity;
  for(const group of world.nativeDetails)for(const instance of group.instances){
    const kind=instance[key];
    if(!kind)continue;
    assert.ok(Object.hasOwn(placed,kind));
    const [x,y,z]=instance.p.map(v=>v/100);
    assert.ok(Number.isFinite(z)&&footprint(x,y),'transform is in its authored corridor');
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
  const {retiredScatter,...expected}=report.counts;
  assert.deepEqual(placed,expected);
  assert.equal(+minimum.toFixed(3),report.minimumClearanceM);
  return Object.values(placed).reduce((a,b)=>a+b,0);
}
const pilotPlaced=validatePlacements('slateRimPilot',pilot,coverage);
const extensionPlaced=validatePlacements('slateRimExtension',extension,extensionCoverage);
assert.ok(pilot.counts.shelves>=25&&pilot.counts.scree>=20&&pilot.counts.grass>=30);
assert.ok(extension.counts.shelves>=30&&extension.counts.scree>=35&&extension.counts.grass>=35);
assert.equal(extension.sections.length,4);
let from=extension.startM;
for(const section of extension.sections){
  assert.equal(section.fromM,from);
  assert.ok(section.toM>from);
  assert.ok(Object.values(section.counts).every(n=>n>0),section.name+' has each authored type');
  from=section.toM;
}
assert.equal(from,extension.endM);
for(const kind of ['shelves','scree','grass'])
  assert.equal(extension.sections.reduce((n,s)=>n+s.counts[kind],0),extension.counts[kind]);
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
  const wasPilot=Boolean(oldWorld.slateRimPilot);
  const ignored=new Set(['slateRimPilot','nativeDetails']);
  for(const [key,value] of Object.entries(oldWorld))
    if(!ignored.has(key)&&key!=='vehicles')assert.deepEqual(world[key],value,key);
  const instances=(w)=>w.nativeDetails.flatMap(g=>g.instances.map(p=>[g.asset,g.snapBoulder===true,p]));
  const old=instances(oldWorld), now=instances(world);
  const existing=new Set(now.filter(([,,p])=>!p.slateRimExtension&&(wasPilot||!p.slateRimPilot)).map(v=>JSON.stringify(v)));
  if(wasPilot){
    assert.deepEqual(pilot,oldWorld.slateRimPilot);
    assert.deepEqual(now.filter(([,,p])=>p.slateRimPilot),old.filter(([,,p])=>p.slateRimPilot),
      'pilot placements stay identical');
  }
  const changedFootprint=(x,y)=>extensionCoverage(x,y)??(wasPilot?null:coverage(x,y));
  let removed=0;
  for(const item of old){
    if(existing.has(JSON.stringify(item)))continue;
    const [asset,rock,p]=item,[x,y]=p.p.map(v=>v/100),where=changedFootprint(x,y);
    assert.match(asset,/^scan_(native_boulder|grass_medium_01)_/,'only native boulder and grass scatter can be retired');
    assert.ok(where&&Math.abs(where.side)>5.65,'no legacy instance removed from the drive line or another sector');
    if(rock)assert.ok(clear(x,y)-slateRimStoneRadius(p.s)>.15,
      'a retired rock also clears the complete drivable corridor with its bounding sphere');
    removed++;
  }
  assert.equal(removed,extension.counts.retiredScatter+(wasPilot?0:pilot.counts.retiredScatter));
  assert.equal(now.length,old.length-removed+extensionPlaced+(wasPilot?0:pilotPlaced));
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
    const p=changedFootprint(origin+Math.floor(i/n)*step,origin+i%n*step);
    assert.ok(p,'visual changes stay inside the newly authored footprint');
    if(delta)assert.ok(Math.abs(p.side)>3.55,'the worn tire lanes do not become bedrock');
    changed++;
  }
  const total=json(root,'Saved/terrain-transitions.json').slateRimVisualPixels;
  if(wasPilot)assert.ok(changed<total,'the pilot remains in the overall mask');
  else assert.equal(changed,total);
  assert.ok(changed>10000);
}
console.log(JSON.stringify({pilot,extension,reusedMeshVariants:meshes.size,baselineCompared:Boolean(baseline),pass:true}));
