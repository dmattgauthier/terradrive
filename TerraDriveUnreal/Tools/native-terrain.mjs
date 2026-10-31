// The browser terrain is preserved. This native-only grading pass cuts/fills a
// narrow quarry service trail into the same height field used by tire physics.
import {Terrain as BrowserTerrain} from '../../TerraDrive-v1.13/dist/src/terrain.js';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {QUARRY_TRAIL_POINTS} from './quarry-trail.mjs';
import {deepMudWeight,deepMudHeight,DEEP_MUD} from './deep-mud.mjs';
export class Terrain extends BrowserTerrain {
 constructor(){
  super();
  const raw=(x,y)=>BrowserTerrain.prototype.heightAt.call(this,-y,x);
  const curve=new T.CatmullRomCurve3(QUARRY_TRAIL_POINTS.map(([x,y])=>new T.Vector3(x,y,0)),false,'centripetal');
  const points=Array.from({length:181},(_,i)=>curve.getPointAt(i/180));
  const a=points[0],b=points.at(-1),ta=curve.getTangentAt(0),tb=curve.getTangentAt(1);
  for(let i=1;i<=6;i++)points.unshift(a.clone().addScaledVector(ta,-i*2));
  for(let i=1;i<=6;i++)points.push(b.clone().addScaledVector(tb,i*2));
  const heights=points.map(p=>raw(p.x,p.y));
  this.gradeLine=points.map((p,i)=>{
   let sum=0,weight=0;
   for(let j=Math.max(0,i-12);j<Math.min(points.length,i+13);j++){
    const d=p.distanceTo(points[j]),w=Math.exp(-d*d/(2*5.5*5.5));sum+=heights[j]*w;weight+=w;
   }
   return {x:p.x,y:p.y,h:sum/weight};
  });
  this.gradeVersion='slate-rim-heightfield-1';
 }
 heightAt(x,z){
  let original=super.heightAt(x,z);const px=z,py=-x;
  if(px> -149&&px< -65&&py> -77&&py< -25)original=deepMudHeight(px,py,original);
  if(!this.gradeLine||px<70||px>300||py< -375||py> -140)return original;
  let best=Infinity,grade=original,along=0,index=0;
  for(let i=1;i<this.gradeLine.length;i++){
   const a=this.gradeLine[i-1],b=this.gradeLine[i],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
   const t=T.MathUtils.clamp(((px-a.x)*dx+(py-a.y)*dy)/l2,0,1),qx=a.x+t*dx,qy=a.y+t*dy,d2=(px-qx)**2+(py-qy)**2;
   if(d2<best){best=d2;index=i;along=t;
    // A gentle two-percent crossfall drains the driving line.
    const side=((px-qx)*-dy+(py-qy)*dx)/Math.sqrt(l2);
    grade=T.MathUtils.lerp(a.h,b.h,t)-Math.abs(side)*.02;
   }
  }
  const distance=Math.sqrt(best),across=1-T.MathUtils.smoothstep(distance,3.6,6.0);
  const end= Math.min(index-1+along,this.gradeLine.length-1-(index-1+along));
  const blend=across*T.MathUtils.smoothstep(end,0,5);
  return T.MathUtils.lerp(original,grade,blend);
 }
 sample(x,z){
  const sample=super.sample(x,z);
  const wet=deepMudWeight(z,-x);
  if(wet>0){
   sample.height=this.heightAt(x,z);sample.surface='mud';
   sample.waterDepth=Math.max(sample.waterDepth||0,(DEEP_MUD.waterLevel-sample.height)*wet);
  }
  if(!this.gradeLine||z<70||z>300||x<140||x>375)return sample;
  sample.height=this.heightAt(x,z);
  const e=.20,dx=(this.heightAt(x+e,z)-this.heightAt(x-e,z))/(2*e),dz=(this.heightAt(x,z+e)-this.heightAt(x,z-e))/(2*e),length=Math.hypot(dx,1,dz);
  sample.normal={x:-dx/length,y:1/length,z:-dz/length};return sample;
 }
}
