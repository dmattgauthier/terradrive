// The exposed bonnet and surrounding paint share this physical surface.
// Conforming parameter lines follow each pressed ridge, keeping specular
// interpolation stable as it sweeps diagonally across the front bonnet.
import {T,mesh,station,smooth,lerp} from './body-surface.mjs';
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
export const URUS_COWL=.86;
export const hoodRows=[[URUS_COWL,1.145,.825],[1.12,1.132,.854],[1.50,1.101,.867],[1.92,1.069,.845],[2.20,1.034,.802],[2.39,.997,.729],[2.48,.969,.64]];
const ridgeAt=z=>.432+.244*smooth(z,URUS_COWL,2.20);
export const hood=(x,z,off=0)=>{
  const t=x/station(hoodRows,z,2),a=Math.abs(t),fade=smooth(z,URUS_COWL,1.10)*(1-smooth(z,2.06,2.43));
  const ridge=ridgeAt(z);
  // Top view: a shallow central plane with two creases that diverge toward
  // the grille. The outer vent shoulders are a different, broader pressing.
  const blade=.032*gauss(a,ridge,.082)-.0045*gauss(a,ridge+.126,.079);
  const shoulder=.032*gauss(a,.89,.105)+.005*gauss(a,.99,.14);
  const sweep=.154*smooth(z,1.84,2.48)*t*t;
  return[x,station(hoodRows,z,1)+.027*(1-t*t)+fade*(blade+shoulder)+off,z-sweep];
 };
const carbonSides=[[URUS_COWL,.685],[1.11,.652],[1.48,.619],[1.90,.578],[2.265,.531]];
export const uniformCarbonPanel=(u,v)=>{
  const t=2*u-1,a=Math.abs(t);
  const z=lerp(URUS_COWL+.01,2.265-.121*t*t-.099*a**8,v);
  return[t*(station(carbonSides,z,1)-.030*v**6*a**8),z];
};

// Follow the press lines where possible. At the narrow tip several lines
// leave the cut edge, so reserve space for each adjoining column.
const anchors=[0,.20,.28,.36,.44,.52,.60,.68,.76,.84,1];
const offsets=[0,-.18,-.12,-.075,-.04,0,.04,.075,.12,.18,0];
const anchorRows=new Map();
export function carbonPanel(u,v){
 const sign=u<.5?-1:1,q=Math.abs(u*2-1);
 let row=anchorRows.get(v);
 if(!row){
  const [edgeX,edgeZ]=uniformCarbonPanel(1,v);
  const edgeSpace=edgeX/station(hoodRows,edgeZ,2)-ridgeAt(edgeZ);
  row=offsets.map((offset,i)=>{
   if(i===0)return 0;
   if(i===anchors.length-1)return 1;
   const target=offset>0?offset*Math.min(1,Math.max(.01,edgeSpace)*.88/.18):offset;
   let lo=0,hi=1;
   for(let iteration=0;iteration<24;iteration++){
    const t=(lo+hi)/2,[x,z]=uniformCarbonPanel((t+1)/2,v);
    if(x/station(hoodRows,z,2)<ridgeAt(z)+target)lo=t;
    else hi=t;
   }
   return T.MathUtils.clamp((lo+hi)/2,i*.007,1-(anchors.length-1-i)*.007);
  });
  anchorRows.set(v,row);
 }
 let i=1;while(q>anchors[i]&&i<anchors.length-1)i++;
 const t=lerp(row[i-1],row[i],(q-anchors[i-1])/(anchors[i]-anchors[i-1]));
 return uniformCarbonPanel((1+sign*t)/2,v);
}
export const carbonNu=200,carbonNv=80;

// Differentiate in physical x/z coordinates, independent of the adaptive
// lookup. Differentiating its numerical root finder would reintroduce noise.
export function hoodNormal(x,z){
 const e=.00001;
 const dx=new T.Vector3(...hood(x+e,z)).sub(new T.Vector3(...hood(x-e,z)));
 const dz=new T.Vector3(...hood(x,z+e)).sub(new T.Vector3(...hood(x,z-e)));
 return dz.cross(dx).normalize();
}
export function carbonBonnet(g,material,map=carbonPanel,nu=carbonNu,nv=carbonNv){
 const p=[],n=[],uv=[],ix=[];
 for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
  const q=map(i/nu,j/nv);p.push(...hood(...q));n.push(...hoodNormal(...q).toArray());uv.push(...q);
 }
 for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
  const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;ix.push(a,c,b,b,c,d);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(n,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(ix);
 return mesh(g,geometry,material);
}
