// The exposed bonnet and surrounding paint share this physical surface.
// Conforming parameter lines follow each pressed ridge, keeping specular
// interpolation stable as it sweeps diagonally across the front bonnet.
import {T,mesh,station,smooth,lerp} from './body-surface.mjs';
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
export const hoodRows=[[.72,1.156,.81],[1.08,1.125,.849],[1.50,1.091,.870],[1.93,1.055,.844],[2.27,1.017,.762],[2.48,.976,.64]];
export const hood=(x,z,off=0)=>{
  const t=x/station(hoodRows,z,2),a=Math.abs(t),fade=smooth(z,.72,1.03)*(1-smooth(z,2.05,2.40));
  const ridge=.42+.24*smooth(z,.75,2.15);
  // The brochure shows a shallow pressed brow. Widen the shoulder of
  // each ridge and roll into the trough instead of two peaked channels.
  const blade=.022*gauss(a,ridge,.065)-.005*gauss(a,ridge+.103,.071);
  const shoulder=.034*gauss(a,.86,.075)+.008*gauss(a,.98,.13);
  const sweep=.122*smooth(z,1.84,2.48)*Math.abs(t)**1.85;
  return[x,station(hoodRows,z,1)+.039*(1-t*t)+fade*(blade+shoulder)+off,z-sweep];
 };
const carbonSides=[[.730,.665],[1.05,.644],[1.44,.618],[1.90,.594],[2.265,.572]];
export const uniformCarbonPanel=(u,v)=>{
  const t=2*u-1,a=Math.abs(t),z=lerp(.730,2.265-.148*a**8,v);
  // Spread the taper so neighboring columns keep their order at the nose.
  return[t*(station(carbonSides,z,1)-.035*v**6*a**8),z];
 };

export function carbonPanel(u,v){
 const sign=u<.5?-1:1,q=Math.abs(u*2-1);
 // The narrow crest and neighboring trough get most of the samples; the
 // broad central field and outer border need far fewer. All rows retain
 // the same exact perimeter as the original rounded carbon cut line.
 const anchors=[0,.20,.28,.36,.44,.52,.60,.68,.76,.84,1];
 const offsets=[null,-.18,-.12,-.075,-.04,0,.04,.075,.12,.18,null];
 const at=i=>{
  if(i===0)return 0;if(i===anchors.length-1)return 1;
  const [edgeX,edgeZ]=uniformCarbonPanel(1,v);
  const edgeSpace=edgeX/station(hoodRows,edgeZ,2)-(.42+.24*smooth(edgeZ,.75,2.15));
  const offset=offsets[i]>0?offsets[i]*Math.min(1,Math.max(.01,edgeSpace)*.88/.18):offsets[i];
  let lo=0,hi=1;
  for(let iteration=0;iteration<24;iteration++){
   const t=(lo+hi)/2,[x,z]=uniformCarbonPanel((t+1)/2,v);
   const error=x/station(hoodRows,z,2)-(.42+.24*smooth(z,.75,2.15)+offset);
   if(error<0)lo=t;else hi=t;
  }
  return (lo+hi)/2;
 };
 let i=1;while(q>anchors[i]&&i<anchors.length-1)i++;
 const t=lerp(at(i-1),at(i),(q-anchors[i-1])/(anchors[i]-anchors[i-1]));
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
