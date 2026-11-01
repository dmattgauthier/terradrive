// Factory-envelope, cavity and shading checks for the original portal models.
// These complement native photographs; they do not establish CAD precision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {VEHICLES} from './native-vehicles.mjs';
import {prepareNativeVehicle} from './vehicle-realism.mjs';
export const portalStyle=s=>s.bodyStyle==='g63six'||s.gClassVariant==='squared';
export function inspectGVariant(view,spec,parts){
 const six=spec.bodyStyle==='g63six',tests=[],check=(name,pass,observed={})=>{tests.push({case:name,pass,...observed});assert.ok(pass,spec.id+': '+name+' '+JSON.stringify(observed));};
 view.root.updateMatrixWorld(true);const inv=view.body.matrixWorld.clone().invert(),bounds=new T.Box3();let vertices=0,triangles=0,bad=0,nonunit=0;const names=[];
 view.body.traverse(o=>{if(!o.isMesh)return;names.push(o.name);const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,rel=inv.clone().multiply(o.matrixWorld);vertices+=p.count;triangles+=(o.geometry.index?.count??p.count)/3;
  for(let i=0;i<p.count;i++){const q=new T.Vector3().fromBufferAttribute(p,i);bad+=![q.x,q.y,q.z,n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite);nonunit+=Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)>.001;bounds.expandByPoint(q.applyMatrix4(rel));}});
 const size=bounds.getSize(new T.Vector3());
 check('finite source positions and normals',bad===0,{vertices,nonfinite:bad});
 check('unit shading normals',nonunit/vertices<.001,{nonunit,normalizedFraction:1-nonunit/vertices});
 check('bounded triangle budget without cab duplication',triangles<(six?450000:460000),{triangles,vertices});
 check('roof height follows the selected reference envelope within one inch',Math.abs(bounds.max.y-(six?2.210:2.250))<.0254,{actualM:bounds.max.y,referenceStatus:'Variant dimension estimate; first-party dimension sheet unavailable.'});
 check('body length follows the selected reference envelope',Math.abs(size.z-(six?5.875:4.873))<.065,{actualM:size.z,referenceStatus:six?'Variant dimension estimate.':'Retained modern-G donor envelope.'});
 check('mirror envelope is bounded while factory flares span the catalog width',size.x>2.10&&size.x<2.25,{actualM:size.x});
 check('body uses the actual simulator CG',Math.abs(view.body.position.y+spec.cgHeight)<1e-7,{bodyY:view.body.position.y,cg:spec.cgHeight});
 check('detached wheel assets are centred at their export hubs',view.wheels.length===(six?6:4)&&view.wheels.every(w=>w.root.position.length()<1e-8),{wheelCount:view.wheels.length});
 const tire=new T.Box3().setFromObject(parts.tire).getSize(new T.Vector3()),rim=new T.Box3().setFromObject(parts.rim).getSize(new T.Vector3()),rimR=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254/2;
 check('tire outer radius agrees with the physical tire',Math.abs(Math.max(tire.y,tire.z)/2-spec.tireRadius)<.004,{renderM:Math.max(tire.y,tire.z)/2,physicsM:spec.tireRadius});
 check('tire section width retains its source dimension',tire.x>=spec.tireWidth*.99&&tire.x<spec.tireWidth*1.10,{renderM:tire.x,physicsM:spec.tireWidth});
 check('bead-seat wheel size is independent of the larger tire',Math.abs(Math.max(rim.y,rim.z)/2-rimR)<.006,{renderRadiusM:Math.max(rim.y,rim.z)/2,beadRadiusM:rimR});
 const ray=(a,d)=>new T.Raycaster(view.body.localToWorld(new T.Vector3(...a)),new T.Vector3(...d).transformDirection(view.body.matrixWorld),0,12).intersectObject(view.body,true);
 const mat=h=>Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;
 function glass(name,a,d){const h=ray(a,d)[0];check(name+' is actual first-hit glazing',!!h&&!!mat(h).userData.vehicleGlass,{firstDistanceM:h?.distance});}
 const rise=six?.231:.271,shift=six?.655:0;
 for(const s of [-1,1])for(const [label,z]of [['front door',.15],['rear door',-.70]])glass(label+' '+s,[s*3,1.61+rise,z+shift],[-s,0,0]);
 glass('windshield',[0,1.61+rise,4],[0,0,-1]);
 if(six){
  check('all three axle positions retain the selected 123-inch first wheelbase and 43-inch tandem spacing',spec.axleOffsetsM?.length===3&&Math.abs(spec.axleOffsetsM[0]-spec.axleOffsetsM[1]-3.12)<.001&&Math.abs(spec.axleOffsetsM[1]-spec.axleOffsetsM[2]-1.10)<.001,{axles:spec.axleOffsetsM,referenceStatus:'Variant wheelbase estimates.'});
  check('six-wheel geometry uses explicit CG-relative hardpoints',Math.abs(view.body.position.z)<1e-7,{offsetZ:view.body.position.z});
  glass('rear cab window',[0,1.8,-1.25],[0,0,1]);
  for(const z of [-1.85,-2.35]){const h=ray([0,3,z],[0,-1,0]).find(h=>!mat(h).transparent),y=h&&view.body.worldToLocal(h.point.clone()).y;check('cargo bed is open over its ribbed floor '+z,!!h&&y>.85&&y<1.0,{firstSurfaceM:y});}
  check('pickup has distinct tailgate and closed cab back',names.includes('g63-six-sculpted-tailgate')&&names.includes('g63-six-closed-cab-rear-wall'),{});
  check('classic AMG front uses twin blades instead of thirteen modern slats',names.filter(n=>n==='g63-six-twin-blade-grille').length===2&&!names.includes('g63-panamericana-grille-bar'),{});
  check('classic front retains two projector assemblies',view.body.getObjectsByProperty('name','g63-six-classic-projector-headlamp').length===2,{});
  check('classic cabin has separate analogue binnacle and tablet',names.includes('g63-six-analogue-instrument-binnacle')&&names.includes('g63-six-separate-command-tablet')&&!names.includes('gclass-modern-widescreen-frame'),{});
  check('factory front roof spoiler has two recessed LED housings',names.filter(n=>n.startsWith('g63-six-roof-carbon-light-housing-')).length===2,{});
  for(const s of [-1,1]){const o=view.body.getObjectByName('g63-six-cab-lower-rear-closure-'+s),n=o.geometry.attributes.normal;let facing=0;for(let i=0;i<n.count;i++)facing+=n.getX(i)*s;check('lower cab repair faces outward '+s,facing/n.count>.95,{meanNormalX:facing/n.count});}
  let face=0;parts.rim.traverse(o=>{if(o.name==='g63-six-beadlock-perforated-face')face++;});check('both faces have original perforated beadlock wheel plates',face===2,{faces:face});
 }else{
  check('squared conversion retains the 113.8-inch wheelbase',Math.abs(spec.wheelbase-2.89)<1e-6,{wheelbaseM:spec.wheelbase});
  check('newer 4x4 squared uses 22-inch wheels with 325/55 tires',spec.tireSize==='325/55R22'&&spec.rimDiameterInches===22,{tireSize:spec.tireSize});
  check('squared has four wide carbon arch faces',names.filter(n=>n.startsWith('g63-squared-carbon-extension-outer-')).length===4,{});
  check('roof lamps are two separate recessed factory modules',names.filter(n=>n.startsWith('g63-squared-roof-carbon-light-housing-')).length===2,{});
  const spare=view.body.getObjectByName('g63-covered-factory-spare'),box=spare&&new T.Box3().setFromObject(spare).getSize(new T.Vector3());check('covered spare remains round and matches the larger tires',!!box&&Math.abs(box.x-box.y)<.002&&Math.abs(box.x/2-spec.tireRadius)<.003,{diametersM:box?.toArray()});
  const badge=view.body.getObjectByName('g63-squared-visible-variant-badge'),badgeBox=new T.Box3().setFromObject(badge),spareBox=new T.Box3().setFromObject(spare);
  check('variant badge has clear space beside the enlarged spare',badgeBox.max.x<spareBox.min.x-.015||badgeBox.min.x>spareBox.max.x+.015,{badgeX:[badgeBox.min.x,badgeBox.max.x],spareX:[spareBox.min.x,spareBox.max.x]});
 }
 const archNames=names.filter(n=>/-outer-/.test(n)&&/carbon-(arch|extension)/.test(n));
 check('every physical axle has two explicit outward fender faces',archNames.length===(six?6:4),{faces:archNames.length});
 for(const name of archNames){const o=view.body.getObjectByName(name),n=o.geometry.attributes.normal,mid=Math.floor(n.count/2),s=name.includes('outer--1-')?-1:1;check('fender exterior faces out '+name,n.getX(mid)*s>.9,{normal:[n.getX(mid),n.getY(mid),n.getZ(mid)]});}
 check('brake and reverse remain distinct exported dynamic materials',view.materials.red!==view.materials.reverse&&names.some(n=>n.includes('rear-brake-lamp'))||(!six&&view.materials.red!==view.materials.reverse),{});
 return{vehicle:spec.name,id:spec.id,style:spec.bodyStyle,checks:tests.length,pass:true,sourceOnly:true,geometry:{vertices,triangles,bounds:[bounds.min.toArray(),bounds.max.toArray()]},tests,limitations:['Original photographic reconstruction, not manufacturer CAD or production-game scan.','Variant dimension and axle envelopes are reference estimates; a first-party dimension sheet was not inspectable.','Native collision, six-wheel behavior and rendering require separate integration verification.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const rows=[];for(const s of VEHICLES.filter(portalStyle)){const {view,parts}=prepareNativeVehicle(s);try{rows.push(inspectGVariant(view,s,parts));}finally{view.dispose();}}
 assert.equal(rows.length,2);const report={revision:24,sourceOnly:true,pass:true,checks:rows.reduce((n,r)=>n+r.checks,0),vehicles:rows};fs.writeFileSync(new URL('../docs/gclass-variants-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:true,checks:report.checks,vehicles:rows.map(r=>({id:r.id,checks:r.checks,vertices:r.geometry.vertices,triangles:r.geometry.triangles}))}));
}
