import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {T} from './reference-vehicle-kit.mjs';
import {prepareNativeVehicle} from './vehicle-realism.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {tireDiameterInches,resizeTireObj} from './tire-size-geometry.mjs';
export const addedReferenceStyle=s=>['monster','subaru22b'].includes(s.bodyStyle);

function* projectedTriangles(mesh,sideView=false){
 const {index,attributes:{uv,position}}=mesh.geometry;
 const point=i=>sideView?new T.Vector2(position.getZ(i),position.getY(i)):new T.Vector2().fromBufferAttribute(uv,i);
 for(let i=0;i<index.count;i+=3)yield [0,1,2].map(j=>point(index.getX(i+j)));
}

function insideContour(point,contour){
 let inside=false;
 for(let i=0,j=contour.length-1;i<contour.length;j=i++){
  const a=contour[j],b=contour[i];
  if((a.y>point.y)!==(b.y>point.y)&&point.x<a.x+(b.x-a.x)*(point.y-a.y)/(b.y-a.y))inside=!inside;
 }
 return inside;
}

// A separating edge excludes contact along the cut edge itself. The
// tolerance is for the float32 UVs of the generated render triangles.
function overlapsConvex(a,b){
 for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length];
  const normal=new T.Vector2(p.y-q.y,q.x-p.x).normalize();
  if(!normal.lengthSq())continue;
  const pa=a.map(v=>v.dot(normal)),pb=b.map(v=>v.dot(normal));
  if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=1e-6)return false;
 }
 return true;
}

export function inspectAddedReference(view,spec,parts){
 const checks=[];const test=(name,pass,data={})=>{checks.push({name,pass,...data});assert.ok(pass,spec.id+': '+name+' '+JSON.stringify(data));};
 const meshes=[];view.body.traverse(o=>{if(o.isMesh)meshes.push(o);});view.root.updateMatrixWorld(true);
 let vertices=0,bad=0;for(const o of meshes){const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;vertices+=p.count;for(let i=0;i<p.count;i++)if(![p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite))bad++;}
 test('finite bounded authored geometry',bad===0&&vertices>40000&&vertices<200000,{vertices,bad});
 const bodyBounds=new T.Box3().setFromObject(view.body),bodySize=bodyBounds.getSize(new T.Vector3());
 test('factory body height envelope',bodyBounds.max.y+spec.cgHeight<=spec.height+.035,{heightM:bodyBounds.max.y+spec.cgHeight});
 test('reference body length',bodySize.z>spec.length*(spec.bodyStyle==='monster'?.85:.98)&&bodySize.z<spec.length*1.04,{lengthM:bodySize.z});
 test('four separated wheel assemblies',view.wheels.length===4&&view.wheels.every(w=>w.tireSpin.children.length&&w.rimSpin.children.length));
 const tireBox=new T.Box3().setFromObject(parts.tire),tireSize=tireBox.getSize(new T.Vector3());
 test('physical tire radius preserved',Math.abs(Math.max(tireSize.y,tireSize.z)*.5-spec.tireRadius)<.004,{radiusM:Math.max(tireSize.y,tireSize.z)*.5});
 test('physical tire width',tireSize.x>spec.tireWidth*.99&&tireSize.x<spec.tireWidth*1.10,{widthM:tireSize.x});
 const rr=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254*.5,rb=new T.Box3().setFromObject(parts.rim).getSize(new T.Vector3());
 test('independent fixed rim diameter',Math.abs(Math.max(rb.y,rb.z)*.5-rr)<.012,{radiusM:Math.max(rb.y,rb.z)*.5});
 test('native brake and reverse emitters',meshes.some(o=>o.material.userData.nativeRole==='brake')&&meshes.some(o=>o.material.userData.nativeRole==='reverse'));
 test('brake emission is confined to rear lamps',meshes.filter(o=>o.material.userData.nativeRole==='brake').every(o=>new T.Box3().setFromObject(o).max.z< -spec.wheelbase*.4));
 test('clear reference glazing',meshes.some(o=>o.name==='reference-open-window'&&o.material.transparent));
 for(const pane of meshes.filter(o=>o.name==='reference-open-window')){pane.geometry.computeBoundingBox();const center=pane.geometry.boundingBox.getCenter(new T.Vector3());if(Math.abs(center.x)<.5)continue;let worst=1;const n=pane.geometry.attributes.normal;for(let i=0;i<n.count;i++)worst=Math.min(worst,n.getX(i)*Math.sign(center.x));test('side glass faces exterior '+Math.sign(center.x)+'/'+center.z.toFixed(2),worst>.7,{minimumNormalX:worst});}
 const cast=(start,dir,list=meshes,far=10)=>new T.Raycaster(view.body.localToWorld(new T.Vector3(...start)),new T.Vector3(...dir).transformDirection(view.body.matrixWorld),0,far).intersectObjects(list,false);
 if(spec.bodyStyle==='subaru22b'){
  test('1998 factory spec anchors',spec.wheelbase===2.52&&spec.width===1.77&&spec.height===1.39&&spec.mass===1270&&spec.tireSize==='235/40R17');
  const paint=meshes.filter(o=>o.material===view.materials.paint);
  for(const z of [-1.26,1.26])for(const side of [-1,1])test('real wheel opening '+z+'/'+side,cast([side*1.1,.48,z],[-side,0,0],paint,.28).length===0);
  for(const name of ['22b-crowned-bonnet','22b-open-scoop-roof','22b-adjustable-rear-wing','22b-gold-ten-paired-spoke-17in-wheel'])test(name+' present',!!view.body.getObjectByName(name)||!!parts.rim.getObjectByName(name));
  const roofPanel=view.body.getObjectByName('22b-crowned-short-coupe-roof');
  const roofHalfWidth=new T.Box3().setFromObject(roofPanel).max.x;
  const roof=cast([0,2,-.3],[0,-1,0],[roofPanel])[0];
  const flank=cast([roofHalfWidth*.92,2,-.3],[0,-1,0],[roofPanel])[0];
  test('roof is crowned within exact height',roof&&flank&&roof.point.y-flank.point.y>.016&&roof.point.y-flank.point.y<.045);
  const scoop=view.body.getObjectByName('22b-open-scoop-roof');
  const bonnet=view.body.getObjectByName('22b-crowned-bonnet');
  const crown=cast([0,2,1.399],[0,-1,0],[scoop])[0];
  const beneath=cast([0,2,1.399],[0,-1,0],[bonnet])[0];
  const scoopRise=crown&&beneath?crown.point.y-beneath.point.y:0;
  test('stock low scoop rises 45 to 80 mm above the bonnet',scoopRise>.045&&scoopRise<.080,{riseM:scoopRise});
  test('two coupe window openings each side',meshes.filter(o=>o.name==='reference-open-window').length===6);
  for(const boundary of view.root.userData.endClosureSamples??[]){
   const closure=view.body.getObjectByName(boundary.front?'22b-perforated-curved-front-bumper':'22b-formed-rear-closure');
   const gp=closure.geometry.attributes.position,gi=closure.geometry.index,triangles=[];
   for(let i=0;i<gi.count;i+=3)triangles.push(new T.Triangle(...[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(gp,gi.getX(i+j)))));
   let gap=0;for(const point of [...boundary.side,...boundary.upper]){const sample=new T.Vector3(...point);let nearest=Infinity;
    for(const triangle of triangles)nearest=Math.min(nearest,triangle.closestPointToPoint(sample,new T.Vector3()).distanceTo(sample));gap=Math.max(gap,nearest);
   }
   const trianglesOf=list=>list.flatMap(o=>{const p=o.geometry.attributes.position,ix=o.geometry.index,r=[];for(let i=0;i<ix.count;i+=3)r.push(new T.Triangle(...[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,ix.getX(i+j)))));return r;});
   const sideTriangles=trianglesOf(meshes.filter(o=>o.name==='22b-continuous-widebody-quarter'));
   const upperTriangles=trianglesOf([view.body.getObjectByName(boundary.front?'22b-crowned-bonnet':'22b-rounded-trunk-deck')]);
   let adjoiningGap=0;for(const [points,triangles]of [[boundary.side,sideTriangles],[boundary.upper,upperTriangles]])for(const point of points){const sample=new T.Vector3(...point);let nearest=Infinity;for(const triangle of triangles)nearest=Math.min(nearest,triangle.closestPointToPoint(sample,new T.Vector3()).distanceTo(sample));adjoiningGap=Math.max(adjoiningGap,nearest);}
   test((boundary.front?'front':'rear')+' curved closure meets side shell and crowned upper panel',gap<.0004&&adjoiningGap<.0004,{maximumClosureGapM:gap,maximumAdjoiningPanelGapM:adjoiningGap,probes:boundary.side.length+boundary.upper.length});
  }
  test('both end closure boundaries are covered',view.root.userData.endClosureSamples?.length===2);
  const fascia=view.body.getObjectByName('22b-perforated-curved-front-bumper');
  const outline=fascia.userData.contours.outline.map(p=>new T.Vector2(...p));
  const openings=fascia.userData.contours.openings.map(loop=>loop.map(p=>new T.Vector2(...p)));
  const area=polygon=>Math.abs(T.ShapeUtils.area(polygon));
  const outsideVertices=openings.flat().filter(point=>!insideContour(point,outline)).length;
  let coveredArea=0,strayTriangles=0,blockedTriangles=0;
  for(const triangle of projectedTriangles(fascia)){
   const center=triangle[0].clone().add(triangle[1]).add(triangle[2]).multiplyScalar(1/3);
   coveredArea+=area(triangle);
   if(!insideContour(center,outline))strayTriangles++;
   if(openings.some(hole=>overlapsConvex(triangle,hole)))blockedTriangles++;
  }
  const areaError=Math.abs(coveredArea-(area(outline)-openings.reduce((total,hole)=>total+area(hole),0)));
  test('fascia triangulates with all openings inside the panel and free of paint',outsideVertices===0&&strayTriangles===0&&blockedTriangles===0&&areaError<1e-6,{outsideVertices,strayTriangles,blockedTriangles,areaErrorM2:areaError});
  // Check actual triangle boundaries of both adjoining sheets. Named-patch
  // existence alone cannot catch an open strip or a mismatched roof edge.
  const triangleCache=new Map(),vector=new T.Vector3();
  const meshByName=name=>{const found=view.body.getObjectByName(name);assert.ok(found,spec.id+': missing seam sheet '+name);return found;};
  const trianglesFor=name=>{if(!triangleCache.has(name)){const o=meshByName(name),p=o.geometry.attributes.position,ix=o.geometry.index,out=[];
   for(let i=0;i<ix.count;i+=3)out.push(new T.Triangle(...[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,ix.getX(i+j)))));
   triangleCache.set(name,out);}return triangleCache.get(name);};
  const seam=(from,edge,to,tolerance=.0006,closed=false)=>{const o=meshByName(from),p=o.geometry.attributes.position,uv=o.geometry.attributes.uv,pts=[];
   for(let i=0;i<p.count;i++)if(edge(uv.getX(i),uv.getY(i)))pts.push(new T.Vector3().fromBufferAttribute(p,i));
   const unique=[...new Map(pts.map(p=>[p.toArray().map(v=>v.toFixed(7)).join(','),p])).values()];
   if(closed&&unique.length)unique.push(unique[0]);
   else{const bounds=new T.Box3().setFromPoints(unique),extent=bounds.getSize(new T.Vector3()),axis=['x','y','z'].sort((a,b)=>extent[b]-extent[a])[0];unique.sort((a,b)=>a[axis]-b[axis]);}
   const step=Math.max(1,Math.floor(unique.length/48)),probes=unique.filter((_,i)=>i%step===0);
   // Probe edge interiors too: coincident corners can conceal a bowed gap.
   for(let i=1;i<unique.length;i+=step)for(const t of [.25,.5,.75])probes.push(unique[i-1].clone().lerp(unique[i],t));
   const triangles=trianglesFor(to);let worst=0;
   for(const sample of probes){let closest=Infinity;for(const triangle of triangles)closest=Math.min(closest,triangle.closestPointToPoint(sample,vector).distanceTo(sample));worst=Math.max(worst,closest);}
   test(from+' closes against '+to,probes.length>=2&&worst<tolerance,{probes:probes.length,maximumActualTriangleGapM:worst});};
  const near=(a,b)=>Math.abs(a-b)<1e-6;
  for(const side of [-1,1]){
   seam('22b-rounded-mirror-shell-'+side,(u,v)=>near(v,1),'22b-crowned-mirror-cap-'+side,.00015,true);
   const shoulder='22b-rounded-quarter-shoulder-'+side,frame='22b-stamped-side-window-frame-'+side;
   for(const [patch,panel]of [['22b-bonnet-edge-return-','22b-crowned-bonnet'],['22b-boot-edge-return-','22b-rounded-trunk-deck']]){
    seam(patch+side,(u,v)=>near(v,0),shoulder);seam(patch+side,(u,v)=>near(v,1),panel);
   }
   seam('22b-greenhouse-belt-return-'+side,(u,v)=>near(v,0),shoulder);
   seam('22b-greenhouse-belt-return-'+side,(u,v)=>near(v,1),frame);
   seam('22b-crowned-short-coupe-roof',(u,v)=>near(u,(side+1)/2),frame);
   for(const front of [true,false]){
    const screen=front?'22b-formed-front-window-surround':'22b-formed-rear-window-surround',sill=front?'22b-closed-cowl':'22b-closed-rear-window-sill',corner=(front?'22b-cowl-corner-return-':'22b-rear-sill-corner-return-')+side;
    seam(screen,(u,v)=>near(u,side),frame);
    seam(corner,(u,v)=>near(v,0),shoulder);
    seam(corner,(u,v)=>near(v,1),sill);
   }
  }
  for(const front of [true,false]){
   const screen=front?'22b-formed-front-window-surround':'22b-formed-rear-window-surround',sill=front?'22b-closed-cowl':'22b-closed-rear-window-sill';
   seam(screen,(u,v)=>near(v,1),'22b-crowned-short-coupe-roof');
   seam(screen,(u,v)=>near(v,0),sill);
   seam(sill,(u,v)=>near(v,1),front?'22b-crowned-bonnet':'22b-rounded-trunk-deck');
  }
  const shelf=meshByName('22b-rear-parcel-shelf');let shelfRays=0,shelfMin=Infinity;
  for(const x of [-.60,-.30,0,.30,.60])for(const z of [-1.42,-1.30,-1.18]){const hit=cast([x,1.5,z],[0,-1,0],[shelf],1)[0];if(hit){shelfRays++;shelfMin=Math.min(shelfMin,view.body.worldToLocal(hit.point.clone()).y);}}
  test('opaque parcel shelf occludes rear axle through rear glazing',!shelf.material.transparent&&shelfRays===15&&shelfMin>.78,{occludedRays:shelfRays,minimumShelfHeightM:shelfMin});
  const pillarTubes=paint.filter(o=>['CylinderGeometry','TubeGeometry'].includes(o.geometry.type)).filter(o=>{const box=new T.Box3().setFromObject(o),size=box.getSize(new T.Vector3()),center=view.body.worldToLocal(box.getCenter(new T.Vector3()));return Math.abs(center.x)>.55&&center.y>1&&center.z> -1.5&&center.z<.9&&size.y>.20;});
  test('A and C pillars are formed sheet surrounds without exposed painted rods',pillarTubes.length===0,{externalPillarTubes:pillarTubes.length});
  for(const [name,axis,sign]of [['22b-formed-front-window-surround','z',1],['22b-formed-rear-window-surround','z',-1],['22b-stamped-side-window-frame--1','x',-1],['22b-stamped-side-window-frame-1','x',1]]){
   const o=meshByName(name),p=o.geometry.attributes.position,n=o.geometry.attributes.normal,ix=o.geometry.index;let minimumExteriorNormal=1,minimumWinding=1;
   for(let i=0;i<n.count;i++)minimumExteriorNormal=Math.min(minimumExteriorNormal,new T.Vector3().fromBufferAttribute(n,i)[axis]*sign);
   for(let i=0;i<ix.count;i+=3){const ids=[0,1,2].map(j=>ix.getX(i+j)),v=ids.map(j=>new T.Vector3().fromBufferAttribute(p,j)),face=v[1].sub(v[0]).cross(v[2].sub(v[0])).normalize(),normal=ids.reduce((sum,j)=>sum.add(new T.Vector3().fromBufferAttribute(n,j)),new T.Vector3()).normalize();minimumWinding=Math.min(minimumWinding,face.dot(normal));}
   // The 22B's backlight is shallow in profile. Check its upward/outward
   // cone as well as winding instead of using the front glass's Z cutoff.
   let exterior=minimumExteriorNormal>.45;
   if(name==='22b-formed-rear-window-surround'){
    let minimumUpward=1;
    for(let i=0;i<n.count;i++)minimumUpward=Math.min(minimumUpward,n.getY(i));
    exterior=minimumExteriorNormal>.36&&minimumUpward>.68;
   }
   test(name+' is opaque and outward facing',!o.material.transparent&&exterior&&minimumWinding>.85,{minimumExteriorNormal,minimumWinding});
  }


 }else{
  const headlights=meshes.filter(o=>o.name==='monster-constant-red-headlight');test('constant red headlights stay separate from brake circuit',headlights.length===2&&headlights.every(o=>!o.material.userData.nativeRole&&o.material.emissiveIntensity>.8));
  test('official monster class scale',Math.abs(spec.tireRadius*2/.0254-66)<1e-6&&Math.abs(spec.tireWidth/.0254-43)<1e-6&&Math.abs(spec.suspension.travel/.0254-30)<1e-6);
  test('stock monster tires are not shrunk to upgrade limit',tireDiameterInches(spec.tireRadius,3)>65.99);
  for(const name of ['grave-digger-domed-wagon-roof','grave-digger-domed-narrow-bonnet','monster-deep-25in-beadlock-wheel'])test(name+' present',!!view.body.getObjectByName(name)||!!parts.rim.getObjectByName(name));
  let lugs=0;parts.tire.traverse(o=>{if(o.name==='monster-directional-chevron-lug')lugs++;});test('48 full-width directional chevron half-lugs',lugs===48,{lugs});
  // Artwork used to be tubes and accidentally counted as chassis structure.
  // Inspect the actual structural rails, extent, and diagonal bracing.
  const frame=meshes.filter(o=>o.geometry.type==='CylinderGeometry'&&o.geometry.parameters.radiusTop>=.025&&o.material.userData.automotive==='paint'&&o.material.color.getHexString()==='39c413');
  const frameBounds=new T.Box3();let braces=0;
  for(const o of frame){frameBounds.union(new T.Box3().setFromObject(o));const d=new T.Vector3(0,1,0).transformDirection(o.matrixWorld);if(Math.abs(d.y)>.25&&Math.abs(d.z)>.25)braces++;}
  const frameSize=frameBounds.getSize(new T.Vector3());
  test('exposed triangulated tubular chassis',frame.length>=50&&braces>=12&&frameSize.x>1.5&&frameSize.y>2&&frameSize.z>4.2,{tubes:frame.length,diagonalBraces:braces,sizeM:frameSize.toArray()});
  // Interior probes catch paint triangles sinking through the curved body
  // between vertices, rather than merely checking their export metadata.
  let paintMeshes=0,paintSamples=0,minGap=Infinity,maxGap=-Infinity,minWinding=1,badPaint=0;
  for(const o of meshes.filter(o=>o.userData.gravePaint)){
   paintMeshes++;const {base,flip}=o.userData.gravePaint,g=o.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,ix=g.index;
   if(!ix||!uv){badPaint++;continue;}
   const point=i=>new T.Vector3().fromBufferAttribute(p,i);
   for(let i=0;i<ix.count;i+=3){const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)],v=ids.map(point);
    const cross=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
    const avg=ids.map(j=>new T.Vector3().fromBufferAttribute(n,j)).reduce((a,b)=>a.add(b),new T.Vector3()).normalize();
    if(cross.length()<1e-12)badPaint++;else minWinding=Math.min(minWinding,cross.normalize().dot(avg));
    for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
     let u=0,w=0;const sample=new T.Vector3();for(let j=0;j<3;j++){u+=uv.getX(ids[j])*weights[j];w+=uv.getY(ids[j])*weights[j];sample.addScaledVector(v[j],weights[j]);}
     const e=.00001,normal=new T.Vector3(...base(u+e,w)).sub(new T.Vector3(...base(u-e,w))).cross(new T.Vector3(...base(u,w+e)).sub(new T.Vector3(...base(u,w-e)))).normalize().multiplyScalar(flip?-1:1);
     const gap=sample.sub(new T.Vector3(...base(u,w))).dot(normal);minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);paintSamples++;
    }
   }
  }
  test('livery stays a thin painted layer above curved panels',paintMeshes>100&&paintSamples>1000&&minGap>.0001&&maxGap<.002,{meshes:paintMeshes,samples:paintSamples,minGapM:minGap,maxGapM:maxGap});
  test('painted livery triangles face outward without degeneracy',badPaint===0&&minWinding>.85,{badTriangles:badPaint,minimumWinding:minWinding});
  const window=view.body.getObjectByName('grave-digger-panel-wagon-side').userData.windowContour.map(p=>new T.Vector2(...p));
  const trails=meshes.filter(o=>o.name==='grave-painted-spectral-trail');
  const sideBases=new Set(trails.map(o=>o.userData.gravePaint.base));
  let windowOverlaps=0,sidePaintTriangles=0;
  for(const o of meshes.filter(o=>sideBases.has(o.userData.gravePaint?.base)))for(const triangle of projectedTriangles(o,true)){
   sidePaintTriangles++;
   if(overlapsConvex(triangle,window))windowOverlaps++;
  }
  test('both side windows stay clear of the side livery',trails.length===12&&sideBases.size===2&&sidePaintTriangles>1000&&windowOverlaps===0,{trails:trails.length,sidePaintTriangles,windowOverlaps});
  const hood=view.body.getObjectByName('grave-digger-domed-narrow-bonnet'),roof=view.body.getObjectByName('grave-digger-domed-wagon-roof');test('panel wagon has distinct low narrow bonnet',new T.Box3().setFromObject(roof).max.y-new T.Box3().setFromObject(hood).max.y>.55);
 }
 return {id:spec.id,checks:checks.length,vertices,bodySizeM:bodySize.toArray(),results:checks,pass:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const rows=[];for(const s of VEHICLES.filter(addedReferenceStyle)){const {view,parts}=prepareNativeVehicle(s);rows.push(inspectAddedReference(view,s,parts));view.dispose();}
 const sample='v 20 5 0\nv 48 7 0\nv 80 9 0\nvn 1 0 0\nvn 0.70710678 0.70710678 0\nvn 0 1 0\nf 1/1/1 2/2/2 3/3/3';const resized=resizeTireObj(sample,80,100,30).split('\n');assert.equal(resized[0],'v 20 5 0');assert.equal(resized[2],'v 100 9 0');assert.ok(Math.abs(Math.hypot(...resized[4].slice(3).split(' ').map(Number))-1)<1e-8);assert.equal(tireDiameterInches(.3099,3),50);
 const out={pass:true,vehicles:rows,checks:rows.reduce((n,r)=>n+r.checks,4),tireSizeChecks:4};fs.mkdirSync(new URL('../Saved/ExpandedRoster/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../Saved/ExpandedRoster/new-roster-geometry.json',import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
