// Native-only scenic trail. Coordinates are Unreal metres: X forward, Y right.
// The path follows the existing deformable terrain, with no rigid overlay.
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {geometryText} from './vehicle-fidelity.mjs';
import {inQuarry} from './offroad-courses.mjs';
export const QUARRY_TRAIL_POINTS=[[90,-325],[120,-340],[155,-345],[190,-335],[225,-320],[260,-295],[275,-265],[270,-230],[255,-200],[270,-170]];
export function quarryTrail(terrain,scans,quarryBase){
 const curve=new T.CatmullRomCurve3(QUARRY_TRAIL_POINTS.map(([x,y])=>new T.Vector3(x,y,0)),false,'centripetal');
 const length=curve.getLength(),samples=Array.from({length:121},(_,i)=>{
  const p=curve.getPointAt(i/120),t=curve.getTangentAt(i/120).normalize();return {x:p.x,y:p.y,z:terrain.heightAt(-p.y,p.x),tx:t.x,ty:t.y,d:length*i/120};
 });
 const groups=scans.placements,rock=groups.find(p=>p.asset==='scan_boulder_01_0'),cliff=groups.find(p=>p.asset==='scan_mountainside_0');
 const grasses=groups.filter(p=>/^scan_grass_medium_01_(3|4|5|11|12|13|14|15|16)$/.test(p.asset));
 const hash=(i,s)=>{const a=Math.sin(i*127.1+s*311.7)*43758.5453;return a-Math.floor(a);};
 function put(group,x,y,scale,yaw,embed,color=[1,1,1]){
  let z=terrain.heightAt(-y,x);
  if(inQuarry(x,y,0)){
   const edge=T.MathUtils.clamp(Math.min((x-100)/15,(250-x)/15,(y+300)/12,(-175-y)/12),0,1);
   z=T.MathUtils.lerp(z,quarryBase,edge*edge*(3-2*edge));
  }
  z-=embed;
  group.instances.push({p:[x*100,y*100,z*100],q:[0,0,Math.sin(yaw/2),Math.cos(yaw/2)],s:[scale,scale,scale],color});
 }
 // One coherent seam of rock, broken by gaps and pockets of grasses. Never
 // enlarge the scans into mountains; keep their recognizable physical scale.
 for(let i=8;i<114;i+=5){const p=samples[i],offset=11+hash(i,3)*7,size=.55+hash(i,8)*.35;
  const yaw=Math.atan2(p.tx,-p.ty)+(hash(i,22)-.5)*.28;
  put(cliff,p.x+p.ty*offset,p.y-p.tx*offset,size,yaw,1.6*size);
  // A scan of a cliff face is an open patch, not a freestanding monolith.
  // Lay it into the hillside so its lower/back edges disappear into earth.
  cliff.instances.at(-1).q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-(.96+hash(i,23)*.28))).toArray();
 }
 for(let i=0;i<420;i++){
  const p=samples[2+Math.floor(hash(i,1)*117)],side=hash(i,2)>.48?1:-1,offset=3.5+hash(i,3)*17;
  put(rock,p.x-p.ty*side*offset,p.y+p.tx*side*offset,.13+hash(i,4)*.65,hash(i,5)*Math.PI*2,.055+hash(i,6)*.09,[.94,.92,.86]);
 }
 // Low stones leave a central line, while an optional rough wheel line makes
 // axle articulation visible. The scanned mesh itself supplies tire contact.
 for(const [i,side]of [[29,-1],[32,1],[36,-1],[68,1],[72,-1]]){
  const p=samples[i],offset=side*1.55;put(rock,p.x-p.ty*offset,p.y+p.tx*offset,.28,.4*i,.07);
 }
 for(let i=0;i<3300;i++){
  const p=samples[1+Math.floor(hash(i,12)*118)],side=hash(i,13)>.5?1:-1,offset=2.9+Math.pow(hash(i,14),1.7)*13;
  if(hash(Math.floor(p.d/8),9)<.20)continue;
  put(grasses[i%grasses.length],p.x-p.ty*side*offset,p.y+p.tx*side*offset,.85+hash(i,15)*1.2,hash(i,16)*Math.PI*2,.005,[.78+hash(i,17)*.16,.78+hash(i,18)*.13,.53+hash(i,19)*.16]);
 }
 const wood=new T.MeshStandardMaterial({color:'#554637',roughness:.91}),paint=new T.MeshStandardMaterial({color:'#344b42',roughness:.81}),letter=new T.MeshStandardMaterial({color:'#e3d9b5',roughness:.84});
 const sign=new T.Group();
 const block=(group,mat,p,size)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.position.set(...p);group.add(m);};
 for(const x of [-.79,.79])block(sign,wood,[x,.98,0],[.12,1.96,.12]);
 block(sign,paint,[0,1.77,.005],[2.05,.39,.10]);block(sign,wood,[0,1.43,.005],[1.85,.19,.09]);
 const title=geometryText(sign,'SLATE RIM',1.71,.16,letter);title.position.set(0,1.70,.060);
 const distance=geometryText(sign,'1065 FT',.89,.075,letter);distance.position.set(0,1.395,.056);
 scans.assets.push({name:'quarry_trail_sign',group:sign});
 const signGroup={asset:'quarry_trail_sign',solid:true,surface:4,instances:[]};groups.push(signGroup);put(signGroup,92,-318,1,-1.85,.12);
 const stake=new T.Group();block(stake,wood,[0,.40,0],[.065,.80,.065]);block(stake,letter,[0,.69,.037],[.070,.075,.009]);
 scans.assets.push({name:'quarry_trail_stake',group:stake});
 const stakeGroup={asset:'quarry_trail_stake',solid:true,surface:4,instances:[]};groups.push(stakeGroup);
 for(let i=6;i<=120;i+=6)for(const side of [-1,1]){const p=samples[i];put(stakeGroup,p.x-p.ty*side*3.5,p.y+p.tx*side*3.5,1,Math.atan2(-p.ty,-p.tx),.06);}
 const first=samples[0],gates=samples.filter((_,i)=>i>0&&i%6===0).map(p=>[p.x*100,p.y*100,p.z*100]);
 const route={name:'Slate Rim quarry trail',hint:'Follow the pale track around the quarry. Light throttle through the rock garden; use low range in vehicles that support it.',zone:8,yaw:Math.atan2(first.ty,first.tx)*180/Math.PI,spawn:[first.x*100,first.y*100,first.z*100],gateWidth:7,gates};
 return {route,samples,lengthM:length,widthM:5.6,assetCounts:{cliffs:cliff.instances.length,boulders:rock.instances.length,grass:grasses.reduce((n,g)=>n+g.instances.length,0)}};
}
