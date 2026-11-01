// Regressions found by direct inspection of Candidate2 native hero captures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {prepareNativeVehicle} from './vehicle-realism.mjs';
import {VEHICLES} from './native-vehicles.mjs';
const results=[];
for(const spec of VEHICLES.filter(s=>['sedan','van','urus','earthcruiser'].includes(s.bodyStyle))){
 const {view}=prepareNativeVehicle(spec);view.root.updateMatrixWorld(true);const bodyInverse=view.body.matrixWorld.clone().invert(),tests=[];
 const check=(name,pass,data={})=>{assert.ok(pass,spec.id+': '+name+' '+JSON.stringify(data));tests.push({case:name,pass,...data});};
 const meshes=[];view.body.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const point=(o,p)=>p.clone().applyMatrix4(bodyInverse.clone().multiply(o.matrixWorld));
 const ray=(p,d,list=meshes,far=10)=>new T.Raycaster(view.body.localToWorld(p.clone()),d.clone().transformDirection(view.body.matrixWorld),0,far).intersectObjects(list,false);
 if(spec.bodyStyle==='sedan'){
  const paint=meshes.filter(o=>o.material===view.materials.paint);
  for(const name of ['civic-fitted-civic-badge','civic-fitted-sport-badge']){
   const group=view.body.getObjectByName(name);check('native badge exists '+name,!!group);
   let worst=0,minimum=1,samples=0;
   group.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const p=point(o,o.geometry.boundingBox.getCenter(new T.Vector3())),h=ray(new T.Vector3(p.x,p.y,-spec.length),new T.Vector3(0,0,1),paint)[0];assert.ok(h,'badge has painted mounting sheet');const q=view.body.worldToLocal(h.point.clone()),gap=q.z-p.z;worst=Math.max(worst,gap);minimum=Math.min(minimum,gap);samples++;});
   check('badge follows formed trunk with millimetre attachment clearance '+name,samples>10&&minimum>-.0005&&worst<.006,{samples,minimumGapM:minimum,maximumGapM:worst});
  }
 }
 if(spec.bodyStyle==='van'){
  const walls=meshes.filter(o=>o.name==='sprinter-rear-door-aperture-return');check('both rear door apertures have continuous depth returns',walls.length===2);
  let targets=0;
  for(const wall of walls){const p=wall.geometry.attributes.position,n=wall.geometry.attributes.normal;wall.geometry.computeBoundingBox();const b=wall.geometry.boundingBox;check('door returns bridge header to sill and full frame depth',b.max.y-b.min.y>1.70&&b.max.z-b.min.z>.027,{bounds:[b.min.toArray(),b.max.toArray()]});
   const ids=wall.geometry.index;
   for(let i=0;i<ids.count;i+=3*23){const a=point(wall,new T.Vector3().fromBufferAttribute(p,ids.getX(i))),b=point(wall,new T.Vector3().fromBufferAttribute(p,ids.getX(i+1))),c=point(wall,new T.Vector3().fromBufferAttribute(p,ids.getX(i+2))),q=a.clone().add(b).add(c).multiplyScalar(1/3),nn=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(nn.lengthSq()<.1)continue;const start=q.clone().addScaledVector(nn,.020),h=ray(start,nn.clone().negate(),meshes,.045).find(h=>!h.object.material.transparent);check('oblique seam probe meets opaque jamb '+targets,!!h,{point:q.toArray(),opaqueDistanceM:h?.distance});targets++;}
  }
 }
 if(spec.bodyStyle==='urus'){
  const louvers=meshes.filter(o=>o.name==='urus-bonnet-vent-recessed-louver'),floors=meshes.filter(o=>o.name==='urus-bonnet-vent-floor'),lips=meshes.filter(o=>o.name==='urus-bonnet-vent-lip');
  check('two recessed vent floors and eighteen inset blades remain',floors.length===2&&lips.length===2&&louvers.length===18,{floors:floors.length,louvers:louvers.length});
  let proud=0,probes=0;
  for(const o of louvers){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i+=9){const q=point(o,new T.Vector3().fromBufferAttribute(p,i)),h=ray(new T.Vector3(q.x,2,q.z),new T.Vector3(0,-1,0),meshes,2)[0];assert.ok(h);const first=view.body.worldToLocal(h.point.clone());proud=Math.max(proud,first.y-q.y);probes++;}}
  check('louvers occupy the actual aperture rather than hiding under intact painted bonnet',probes>40&&proud<.015,{probes,maximumFirstHitOffsetM:proud});
  for(const x of [-.647,.647]){const h=ray(new T.Vector3(x,1.6,1.6),new T.Vector3(0,-1,0),meshes,1)[0],p=view.body.worldToLocal(h.point.clone());check('cooling slot remains a genuine recess '+x,p.y<1.102&&h.object.material!==view.materials.paint,{heightM:p.y});}
 }
 if(spec.bodyStyle==='earthcruiser'){
  // Native side supplied by the old common hatch must no longer carry two
  // overlapping frame outlines; count the actual rear hinge positions.
  let commonHinges=0;
  for(const o of meshes){o.geometry.computeBoundingBox();const p=point(o,o.geometry.boundingBox.getCenter(new T.Vector3()));if(p.x>1&&p.y>1.40&&p.y<1.45&&(Math.abs(p.z+3.04)<.015||Math.abs(p.z+2.35)<.015))commonHinges++;}
  check('specific utility-hatch side has no second common-hatch hinge pair',commonHinges===0,{commonHinges});
 }
 results.push({id:spec.id,checks:tests.length,tests,pass:true});view.dispose();
}
const report={revision:24,sourceOnly:true,pass:true,checks:results.reduce((n,r)=>n+r.checks,0),vehicles:results};fs.writeFileSync(new URL('../docs/visual-attachments-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:true,checks:report.checks,vehicles:results.map(v=>({id:v.id,checks:v.checks}))}));
