import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bakeLandform} from './terrain-landform.mjs';

const size = 121, middle = (size-1)/2;
function field(elevation) {
  const height = Float32Array.from({length:size*size}, (_,i) =>
    elevation(Math.floor(i/size)-middle, i%size-middle));
  return bakeLandform(height,size,.5);
}
const middleIndex = middle*size+middle;
const plane = field((x,y) => 100+x*.0625-y*.03125);
assert.ok(plane.position.every(v => v===128), 'uniform inclines stay neutral, including at edges');
const flat = field(() => 12);
assert.ok(flat.position.every(v => v===128) && flat.shelter.every(v => v===0), 'flat tarmac has no invented relief');

const hill=(x,y)=>Math.exp(-(x*x/95+y*y/62))*1.65;
const hilltop=field(hill), bowl=field((x,y)=>-hill(x,y));
assert.ok(hilltop.position[middleIndex]<60 && bowl.position[middleIndex]>196, 'crests and hollow floors remain distinguishable');
assert.equal(hilltop.position[middleIndex]+bowl.position[middleIndex],256,'inverting a feature reverses its landform');
const raised=field((x,y)=>hill(x,y)+120);
assert.ok(raised.position.every((v,i)=>Math.abs(v-hilltop.position[i])<=1), 'elevation datum independent');
const upwind=field((x,y)=>3.2*hill(x-8,y-3));
const downwind=field((x,y)=>3.2*hill(x+8,y+3));
assert.ok(upwind.shelter[middleIndex]>230 && downwind.shelter[middleIndex]===0, 'wind horizon follows the authored world direction');
assert.throws(()=>bakeLandform([0],3,0),RangeError);

const terrain=fs.readFileSync(new URL('../Content/NativeData/terrain.bin',import.meta.url));
const atlas=fs.readFileSync(new URL('../SourceAssets/TerrainTrail.tga',import.meta.url));
const n=terrain.readUInt32LE(4),step=terrain.readFloatLE(8);
assert.equal(atlas.readUInt16LE(12),n);
assert.equal(atlas.readUInt16LE(14),n);
const heights=Float32Array.from({length:n*n},(_,i)=>terrain.readFloatLE(16+i*9));
const result=bakeLandform(heights,n,step);
const distribution=Array.from({length:7},()=>({crest:0,hollow:0,lee:0,area:0}));
for(let i=0;i<n*n;i++){
  const at=18+i*4;
  if(atlas[at]!==result.shelter[i] || atlas[at+1]!==result.position[i])
    throw Error('Baked BGRA atlas mismatch at terrain sample '+i);
  const biome=distribution[terrain[24+i*9]];
  biome.area++;
  if(result.position[i]<96)biome.crest++;
  if(result.position[i]>160)biome.hollow++;
  if(result.shelter[i]>128)biome.lee++;
}
assert.ok(distribution.every(v=>v.crest>0&&v.hollow>0&&v.lee>0), 'all biomes contain distinct landforms');
console.log(JSON.stringify({pass:true,verifiedSamples:n*n,distribution}));
