import fs from 'node:fs';
import path from 'node:path';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {inQuarry} from './offroad-courses.mjs';
// Public code contains placement recipes/IDs only. Raw licensed assets stay in
// Epic's cache and generated Content; no Fab mesh or texture enters Vendor.
export function fabScenery(root,terrain,routes,quarryBase){
 const recipe=JSON.parse(fs.readFileSync(path.join(root,'Tools/fab-scenery.json'))),groups=recipe.assets.map(a=>({asset:a.id,kind:a.kind,solid:true,instances:[]}));
 let seed=815427;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const dist=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=T.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);};
 const clear=(x,y)=>{
  if(x> -195&&x<175&&y>140&&y<255)return false;
  for(const z of terrain.zones)if(Math.hypot(x-z.spawn.z,y+z.spawn.x)<19)return false;
  for(const r of routes){const points=[r.spawn,...r.gates].map(p=>p.slice(0,2).map(c=>c/100));for(let i=1;i<points.length;i++)if(dist([x,y],points[i-1],points[i])<10)return false;}
  const sample=terrain.sample(-y,x);return sample.surface==='rock'||sample.surface==='dirt';
 };
 const ground=(x,y)=>{
  const natural=terrain.heightAt(-y,x);
  if(!inQuarry(x,y,0))return natural;
  const edge=Math.min((x-100)/15,(250-x)/15,(y+300)/12,(-175-y)/12),t=T.MathUtils.clamp(edge,0,1);
  return T.MathUtils.lerp(natural,quarryBase,t*t*(3-2*t));
 };
 // Distinct formations beside Granite Trials and the natural rocky foothills.
 const clusters=[[110,-310],[145,-316],[190,-313],[232,-288],[233,-235],[106,-220],[-158,-225],[-205,-211],[-225,-167],[-175,-154],[29,42],[76,57],[93,14],[45,-8]];
 for(const [ci,center]of clusters.entries())for(let i=0;i<25;i++){
  const a=random()*Math.PI*2,r=Math.sqrt(random())*(i<5?7:17),x=center[0]+Math.cos(a)*r,y=center[1]+Math.sin(a)*r;if(!clear(x,y))continue;
  const index=i<3?(ci+i)%4:i<11?4+(i%2):i<19?6:7,g=groups[index];
  const size=index<4?.70+random()*.55:index<6?.60+random()*.65:index===6?.45+random()*.55:.75+random()*1.10;
  const e=.20,dx=(ground(x+e,y)-ground(x-e,y))/(2*e),dy=(ground(x,y+e)-ground(x,y-e))/(2*e);
  const n=new T.Vector3(-dx,-dy,1).normalize(),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),n).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),random()*Math.PI*2));
  const embed=index<4?18:index<7?8:2;
  g.instances.push({p:[x*100,y*100,ground(x,y)*100-embed],q:q.toArray(),s:[size,size,size]});
 }
 // Imported authored formations supplement the slate biome; icy cliffs stay
 // at the edge of Snow Basin and foliage grows in coherent meadow clusters.
 for(const entry of recipe.unrealAssets){
  const group={asset:entry.id,kind:entry.kind,solid:entry.solid!==false,instances:[]};groups.push(group);
  const grass=entry.kind==='grass',ice=entry.id.includes('Ice'),snow=entry.kind==='snowbank';
  const centers=grass?[[-40,-15],[-73,35],[-12,38],[95,53],[-50,9],[-92,-32],[-10,-46],[10,18]]:snow?[[244,163],[215,183],[282,189],[286,235],[231,268],[311,228]]:ice?[[203,260],[273,241],[268,181]]:[[59,-91],[12,-121],[-33,-111]];
  for(const center of centers)for(let i=0;i<(grass?90:snow?10:8);i++){
   const a=random()*Math.PI*2,r=Math.sqrt(random())*(grass?22:snow?9:13),x=center[0]+Math.cos(a)*r,y=center[1]+Math.sin(a)*r;
   let allowed=true;
   for(const z of terrain.zones)if(Math.hypot(x-z.spawn.z,y+z.spawn.x)<19)allowed=false;
   for(const route of routes){const p=[route.spawn,...route.gates].map(v=>v.slice(0,2).map(c=>c/100));for(let j=1;j<p.length;j++)if(dist([x,y],p[j-1],p[j])<10)allowed=false;}
   const sample=terrain.sample(-y,x);
   if(!allowed||grass&&sample.surface!=='dirt'||(ice||snow)&&sample.surface!=='snow'||!grass&&!ice&&!snow&&!['dirt','rock'].includes(sample.surface))continue;
   const size=grass?.55+random()*.6:snow?.55+random()*.9:ice?.75+random()*.8:.35+random()*.45;
   group.instances.push({p:[x*100,y*100,ground(x,y)*100],q:new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),random()*Math.PI*2).toArray(),s:snow?[size*(1.4+random()),size,size*.55]:[size,size,size]});
  }
 }
 const cache=process.env.TERRA_FAB_CACHE||path.join(process.env.ProgramData||'C:/ProgramData','Epic/EpicGamesLauncher/VaultCache/FabLibrary',recipe.cacheFolder);
 return {pack:recipe.pack+' / Automotive Winter Scene / MW Landscape',enabled:fs.existsSync(cache),groups};
}
