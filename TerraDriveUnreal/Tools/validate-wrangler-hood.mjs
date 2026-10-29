// Reference silhouette checks, independent of the builder's width variables.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {T} from './body-surface.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {prepareNativeVehicle} from './vehicle-realism.mjs';
const spec=VEHICLES[0],{view}=prepareNativeVehicle(spec),stations=[.82,1.40,2.10],widths=stations.map(()=>0);
view.body.updateWorldMatrix(true,true);
const inverse=view.body.matrixWorld.clone().invert(),point=new T.Vector3();
view.body.traverse(o=>{
 if(!o.isMesh||o.material!==view.materials.paint)return;const m=inverse.clone().multiply(o.matrixWorld),p=o.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  point.fromBufferAttribute(p,i).applyMatrix4(m);
  if(point.y<1.21||point.y>1.36)continue;
  for(let j=0;j<stations.length;j++)if(Math.abs(point.z-stations[j])<.026)widths[j]=Math.max(widths[j],Math.abs(point.x)*2);
 }
});
const tests=[];const check=(name,pass,value)=>{tests.push({name,pass,value});assert.ok(pass,name+': '+value);};
check('bonnet is broad where it meets the cowl',widths[0]>1.53&&widths[0]<1.60,widths[0]);
check('middle of bonnet keeps the broad Rubicon planform',widths[1]>1.515&&widths[1]<1.59,widths[1]);
check('grille end stays within the established nose envelope',widths[2]>1.50&&widths[2]<1.58,widths[2]);
check('bonnet no longer pinches at the cowl relative to the nose',widths[0]>=widths[2]-.025,widths[0]-widths[2]);
check('matching side-sheet draw avoids an hourglass through the middle',widths[1]>=Math.min(widths[0],widths[2])-.025,widths[1]);
check('mechanical wheelbase is preserved',spec.wheelbase===3.008,spec.wheelbase);
for(const side of [-1,1]){
 const label=view.body.getObjectByName('wrangler-rubicon-bonnet-label-'+side);assert.ok(label,'Rubicon label group');
 let witness=null,unit=true;label.traverse(o=>{
  if(!o.isMesh)return;const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,toBody=inverse.clone().multiply(o.matrixWorld),nm=new T.Matrix3().getNormalMatrix(toBody),ix=o.geometry.index;
  for(let i=0;i<n.count;i++)unit&&=Math.abs(new T.Vector3().fromBufferAttribute(n,i).length()-1)<.001;
  for(let i=0;!witness&&i<(ix?ix.count:p.count);i+=3){
   const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),normal=new T.Vector3().fromBufferAttribute(n,ids[0]).applyMatrix3(nm).normalize();
   if(normal.x*side<.99)continue;
   const q=new T.Vector3();for(const id of ids)q.add(new T.Vector3().fromBufferAttribute(p,id).applyMatrix4(toBody));witness={point:q.multiplyScalar(1/3),object:o};
  }
 });
 assert.ok(witness,'outward label face');
 const origin=view.body.localToWorld(witness.point.clone().add(new T.Vector3(side*.05,0,0))),dir=new T.Vector3(-side,0,0).transformDirection(view.body.matrixWorld),hit=new T.Raycaster(origin,dir,0,.2).intersectObject(view.body,true)[0];
 check('Rubicon lettering remains visible outside the widened bonnet '+side,hit?.object===witness.object,hit?.distance??null);
 check('projected label retains unit shading normals '+side,unit,unit);
}
const report={revision:16,checks:tests.length,pass:true,stationsM:stations,widthsM:widths,tests,referenceStatus:'Original photo-based shape estimates; panel widths are not OEM measurements.'};
fs.writeFileSync(new URL('../docs/wrangler-hood-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
view.dispose();console.log(JSON.stringify(report));
