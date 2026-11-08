import assert from 'node:assert/strict';
import fs from 'node:fs';
import {graniteApron,quarryLaneMask} from './granite-ground.mjs';
const world=JSON.parse(fs.readFileSync(new URL('../Content/NativeData/world.json',import.meta.url)));
const lookup=quarryLaneMask(world.quarryTrail.samples),points=world.quarryTrail.samples.filter((_,i)=>i%6===0);
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
function reference(x,y){
 let distance=Infinity;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
  distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}
 return 1-smooth(2.25,3.8,distance);
}
let exactSamples=0,filteredSamples=0,maxMaskError=0,maxApronStep=0;
for(let x=75;x<290;x+=.71)for(let y=-360;y< -155;y+=.73){
 assert.ok(Math.abs(reference(x,y)-lookup(x,y))<1e-12,'bounded lookup exactly reproduces prior shader path');exactSamples++;
 const ix=Math.floor(x*2)/2,iy=Math.floor(y*2)/2,u=(x-ix)*2,v=(y-iy)*2;
 const sample=(x,y)=>Math.round(lookup(x,y)*255)/255;
 const filtered=(sample(ix,iy)*(1-u)+sample(ix+.5,iy)*u)*(1-v)+(sample(ix,iy+.5)*(1-u)+sample(ix+.5,iy+.5)*u)*v;
 maxMaskError=Math.max(maxMaskError,Math.abs(filtered-reference(x,y)));filteredSamples++;
}
assert.ok(maxMaskError<.08,'half-metre UNorm8 atlas retains smooth lane shoulder within eight percent');
for(const axis of ['x','y'])for(const edge of axis==='x'?[100,250]:[-300,-175]){
 const from=axis==='x'?-310:90,to=axis==='x'?-165:260;
 for(let along=from;along<to;along+=.2){
  const value=t=>axis==='x'?graniteApron(edge+t,along):graniteApron(along,edge+t);
  const jump=Math.abs(value(.01)-value(-.01));maxApronStep=Math.max(maxApronStep,jump);
  assert.ok(jump<.003,'no authored coverage discontinuity at the constructed rectangle');
  assert.ok(value(0)>=0&&value(0)<=1,'bounded cover');
 }
}
assert.equal(graniteApron(70,-230),0);assert.equal(graniteApron(270,-230),0);
assert.ok(graniteApron(180,-230)>.80,'trial interiors retain rock dominance');
const hlsl=fs.readFileSync(new URL('./terrain-surface.hlsl',import.meta.url),'utf8');
assert.ok(!hlsl.includes('trailDistance')&&!hlsl.includes('/*QUARRY_TRAIL*/'),'no per-pixel route loop remains');
const report={pass:true,exactSamples,filteredSamples,maxMaskError,maxApronStep,
 scope:'Coverage math only. Native material binding and final appearance require the packaged game.'};
console.log(JSON.stringify(report));
