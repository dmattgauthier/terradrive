import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {perimeterMask,trailLookup} from './perimeter-trail.mjs';
import {slateRimCoverage} from './slate-rim-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=p=>fs.readFileSync(path.join(root,p)),report=JSON.parse(read('Saved/terrain-transitions.json'));
const raw=read('Content/NativeData/terrain-blend.bin'),terrain=read('Content/NativeData/terrain.bin'),n=raw.readUInt32LE(4),step=raw.readFloatLE(8),origin=raw.readFloatLE(12);
assert.equal(raw.readUInt32LE(0),0x54425731);assert.equal(raw.length,16+n*n*7);assert.equal(n,1601);
assert.equal(crypto.createHash('sha256').update(terrain).digest('hex'),report.sourceTerrainSHA256);
const pure=Array(7).fill(0);let mixed=0;
for(let i=0;i<n*n;i++){let sum=0,active=0;for(let s=0;s<7;s++){const w=raw[16+i*7+s];sum+=w;if(w)active++;if(w===255)pure[s]++;}assert.equal(sum,255,'coverage normalization '+i);if(active>1)mixed++;}
assert.equal(mixed,report.boundaryPixels);assert.ok(pure.every(x=>x>1000),'all seven interiors remain identifiable');
const world=JSON.parse(read('Content/NativeData/world.json'));
const locate=world.perimeterTrail?trailLookup(world.perimeterTrail.samples):()=>null;
const quarry=world.slateRimPilot?.visualCoverage?slateRimCoverage(world.quarryTrail.samples):()=>null;
const masks=['A','B'].map(c=>read('SourceAssets/TerrainBlend'+c+'.tga'));
for(const mask of masks){assert.equal(mask.readUInt16LE(12),n);assert.equal(mask[17],0x28);}
let visualOverrides=0;
for(let i=0;i<n*n;i++){
 const x=origin+Math.floor(i/n)*step,y=origin+i%n*step,at=16+i*7;
 const surface=terrain[16+i*9+8],p=surface===0||surface===4?quarry(x,y):null;
 const lane=perimeterMask(locate,x,y),worn=p?Math.round(lane*p.wornLane):lane;
 const rock=p?Math.round(raw[at]*p.rock):0;
 if(rock||lane!==worn)visualOverrides++;
 for(let s=0;s<8;s++){
  const stored=masks[s>>2][18+i*4+[2,1,0,3][s%4]];
  const expected=s===0?raw[at]-rock:s===4?raw[at+4]+rock:s===7?worn:raw[at+s];
  assert.equal(stored,expected,'authored visual terrain channel '+s+' at pixel '+i);
 }
}
assert.equal(visualOverrides,report.slateRimVisualPixels??0);
function sample(x,y){const gx=Math.max(0,Math.min(n-1.0001,(x/100-origin)/step)),gy=Math.max(0,Math.min(n-1.0001,(y/100-origin)/step)),i=Math.floor(gx),j=Math.floor(gy),u=gx-i,v=gy-j;
 return Array.from({length:7},(_,s)=>{const at=(r,c)=>raw[16+(r*n+c)*7+s]/255;return(at(i,j)*(1-u)+at(i+1,j)*u)*(1-v)+(at(i,j+1)*(1-u)+at(i+1,j+1)*u)*v;});}
const lines=[];for(const fixture of report.fixtures){let maxJump=0,mixedSamples=0,previous=null;
 for(let k=-80;k<=80;k++){const t=k*fixture.halfWidthM*100/40,w=sample(fixture.p[0]+fixture.normal[0]*t,fixture.p[1]+fixture.normal[1]*t);assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<.00001);if(w[fixture.pair[0]]>.05&&w[fixture.pair[1]]>.05)mixedSamples++;if(previous)maxJump=Math.max(maxJump,...w.map((q,s)=>Math.abs(q-previous[s])));previous=w;}
 assert.ok(mixedSamples>3,'visible mixed fringe '+fixture.name);assert.ok(maxJump<.3,'no hard coverage seam '+fixture.name);lines.push({surfacePair:fixture.name,mixedSamples,maxJump,pass:true});}
const output={pass:true,n,coverageSamples:n*n,mixedPixels:mixed,pureInteriorPixels:pure,visualMaskValidated:true,slateRimVisualPixels:visualOverrides,sourceTerrainSHA256:report.sourceTerrainSHA256,lines};
fs.writeFileSync(path.join(root,'docs/terrain-transition-validation.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
