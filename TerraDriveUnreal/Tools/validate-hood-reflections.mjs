// Measure the shading error introduced by triangulation against the smooth
// physical bonnet. This reproduces the old diagonal-ridge highlight scallops.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {T} from './body-surface.mjs';
import {carbonBonnet,carbonPanel,uniformCarbonPanel,hoodNormal} from './urus-bonnet.mjs';
const inspect=(map,nu,nv)=>{
 const object=carbonBonnet(new T.Group(),new T.MeshStandardMaterial(),map,nu,nv),g=object.geometry;
 const n=g.attributes.normal,uv=g.attributes.uv,idx=g.index,errors=[];
 for(let face=0;face<idx.count;face+=3){
  const ids=[idx.getX(face),idx.getX(face+1),idx.getX(face+2)];
  for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
   const normal=new T.Vector3(),q=[0,0];
   ids.forEach((id,i)=>{normal.addScaledVector(new T.Vector3().fromBufferAttribute(n,id),weights[i]);q[0]+=uv.getX(id)*weights[i];q[1]+=uv.getY(id)*weights[i];});
   // The broad carbon field is deliberately smooth; inspect the fully formed
   // portion of both diagonal ridges rather than dilute error with flat area.
   if(q[1]<1.04||q[1]>2.02||Math.abs(q[0])<.25||Math.abs(q[0])>.60)continue;
   const angle=Math.acos(T.MathUtils.clamp(normal.normalize().dot(hoodNormal(...q)),-1,1))*180/Math.PI;errors.push(angle);
  }
 }
 errors.sort((a,b)=>a-b);const sum=errors.reduce((a,b)=>a+b,0),result={triangles:idx.count/3,samples:errors.length,meanDegrees:sum/errors.length,p95Degrees:errors[Math.floor(errors.length*.95)],maxDegrees:errors.at(-1)};
 g.dispose();object.material.dispose();return result;
};
const before=inspect(uniformCarbonPanel,72,60),after=inspect(carbonPanel,200,80);
assert.ok(before.p95Degrees>1.2,'fixture must reproduce old interpolation rippling');
assert.ok(after.p95Degrees<.35,'ridge normals must interpolate smoothly below 0.35 degree p95');
assert.ok(after.p95Degrees<before.p95Degrees*.15,'ridge-aligned sampling removes at least 85% of p95 normal error');
const report={kind:'source-geometry',nativeAcceptance:false,before,after,pass:true};
fs.writeFileSync(new URL('../docs/hood-reflection-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
