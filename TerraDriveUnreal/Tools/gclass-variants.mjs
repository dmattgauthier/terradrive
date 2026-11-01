// Original variant coachwork. Factory photographs/dimensions are references,
// never redistributed meshes. Y up, +Z nose, metres above tyre contact plane.
import {T,box,mesh,surface,mappedPolygon,line,lerp,smooth} from './body-surface.mjs';
import {gClassView,gClassRim} from './mercedes-gclass.mjs';
import {geometryText,refineFactoryWheel} from './vehicle-fidelity.mjs';

// Selected dimension/axle envelopes. Unlike the retained modern-G donor
// brochure, an inspectable first-party variant dimension table was not found;
// these remain reference estimates rather than certified OEM measurements.
export const G_VARIANTS=Object.freeze({
 squared:{height:2.250,width:2.100,wheelbase:2.890,bodyRise:.271,tireRadius:.45815,rimInches:22},
 six:{height:2.210,width:2.110,length:5.875,bodyRise:.231,axles:[2.100,-1.020,-2.120],tireRadius:.4699,rimInches:18,
  cabRearZ:-.895,bedFrontZ:-.925,bedRearZ:-2.750}
});
const named=(o,n)=>{o.name=n;return o;};
function rod(g,m,a,b,r=.012,n=12){const p=new T.Vector3(...a),q=new T.Vector3(...b),o=mesh(g,new T.CylinderGeometry(r,r,p.distanceTo(q),n),m,p.clone().add(q).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.sub(p).normalize());return o;}
function moveChildren(g,offset){const inner=new T.Group();for(const child of [...g.children]){g.remove(child);inner.add(child);}inner.position.set(...offset);g.add(inner);return inner;}
function markMaterial(m,role){m.userData.automotive=role;m.userData.nativeRole=role;return m;}
function carbon(){return markMaterial(new T.MeshPhysicalMaterial({color:'#171d20',roughness:.32,metalness:0,clearcoat:.7,clearcoatRoughness:.24}),'carbon');}

// Cut triangles, not their bounding boxes: roof/cab side sheets cross the
// pickup's rear wall and must terminate exactly at that wall without spikes.
function clipCabAtZ(body,cut){
 body.updateWorldMatrix(true,true);const inverse=body.matrixWorld.clone().invert();
 body.traverse(o=>{
  if(!o.isMesh)return;
  const g=o.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,idx=g.index;
  const rel=inverse.clone().multiply(o.matrixWorld),back=rel.clone().invert(),P=[],N=[],UV=[],groups=[];
  const sample=i=>({p:new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(rel),n:new T.Vector3().fromBufferAttribute(n,i),uv:uv?[uv.getX(i),uv.getY(i)]:[0,0]});
  const mix=(a,b,t)=>({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.map((v,k)=>lerp(v,b.uv[k],t))});
  const push=v=>{const q=v.p.clone().applyMatrix4(back);P.push(...q.toArray());N.push(...v.n.toArray());UV.push(...v.uv);};
  for(let i=0;i<(idx?.count??p.count);i+=3){
   const polygon=[0,1,2].map(k=>sample(idx?idx.getX(i+k):i+k)),out=[];
   for(let j=0;j<3;j++){const a=polygon[j],b=polygon[(j+1)%3],insideA=a.p.z>=cut,insideB=b.p.z>=cut;if(insideA)out.push(a);if(insideA!==insideB)out.push(mix(a,b,(cut-a.p.z)/(b.p.z-a.p.z)));}
   if(out.length<3)continue;
   const start=P.length/3;for(let j=1;j<out.length-1;j++){push(out[0]);push(out[j]);push(out[j+1]);}
   const mat=g.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex??0;
   if(P.length/3>start)groups.push({start,count:P.length/3-start,materialIndex:mat});
  }
  // Reuse identical position/normal/UV tuples after clipping. Flattening the
  // entire cab into unindexed triangles tripled vertex storage needlessly.
  const VP=[],VN=[],VT=[],indices=[],seen=new Map();
  for(let i=0;i<P.length/3;i++){
   const values=[...P.slice(i*3,i*3+3),...N.slice(i*3,i*3+3),...UV.slice(i*2,i*2+2)],key=values.map(v=>Math.round(v*1e7)).join(',');let at=seen.get(key);
   if(at===undefined){at=VP.length/3;seen.set(key,at);VP.push(...values.slice(0,3));VN.push(...values.slice(3,6));VT.push(...values.slice(6));}indices.push(at);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(VP,3));geo.setAttribute('normal',new T.Float32BufferAttribute(VN,3));geo.setAttribute('uv',new T.Float32BufferAttribute(VT,2));geo.setIndex(indices);
  if(Array.isArray(o.material))for(const group of groups)geo.addGroup(group.start,group.count,group.materialIndex);
  o.geometry=geo;g.dispose();if(!P.length)o.visible=false;
 });
}
function wideArch(g,m,side,axle,centreY,radius,outer,name){
 // Broad flattened arch cap, outward face, folded inside edge, and a dark
 // return into the wheel cavity. End walls prevent angle-dependent holes.
 const curve=(u,v)=>{const a=lerp(-.10,Math.PI+.10,u),r=radius+.075*v,s=Math.sin(a);return[axle+Math.cos(a)*r,centreY+Math.sign(s)*Math.abs(s)**.58*r];};
 named(surface(g,m,40,3,(u,v)=>{const[z,y]=curve(u,v);return[side*(outer-.010*Math.sin(v*Math.PI)),y,z];},side<0),name+'-outer-'+side+'-'+axle);
 named(surface(g,m,40,2,(u,v)=>{const[z,y]=curve(u,1);return[side*lerp(.88,outer,v),y+.008*Math.sin(v*Math.PI),z];},side>0),name+'-crown-'+side+'-'+axle);
 named(surface(g,m,40,2,(u,v)=>{const[z,y]=curve(u,0);return[side*lerp(outer,.87,v),y-.014*v,z];},side>0),name+'-inner-return-'+side+'-'+axle);
 for(const u of [0,1])named(surface(g,m,2,2,(v,w)=>{const[z,y]=curve(u,v);return[side*lerp(.88,outer,w),y,z];},side*(u?1:-1)>0),name+'-closed-end-'+side+'-'+axle+'-'+u);
}

export function gClassSquaredView(spec){
 const view=gClassView({...spec,gClassVariant:'standard',tireRadius:.3974,height:1.979}),g=view.body,m=view.materials;
 view.spec=spec;
 const cab=moveChildren(g,[0,G_VARIANTS.squared.bodyRise,0]);cab.name='g63-squared-raised-production-coachwork';
 const oldFlares=[];cab.traverse(o=>{if(/gclass-(box-shouldered-fender|fender-upper-return|folded-arch-edge|closed-inner-wheelwell)/.test(o.name))oldFlares.push(o);});for(const o of oldFlares)o.removeFromParent();
 const spare=cab.getObjectByName('g63-covered-factory-spare');if(spare)spare.scale.set(.45815/.397,.45815/.397,1);
 const c=carbon(),black=m.gTrim,metal=m.gSatin;
 for(const s of [-1,1]){
  for(const axle of [-1.445,1.445])wideArch(g,c,s,axle,.3974+.271,.455,1.050,'g63-squared-carbon-extension');
  // Width/height come from the actual variant rather than globally scaling
  // the cabin, glass or doors. Rock rails sit beneath the raised body.
  named(box(g,metal,[s*.985,.655,-.08],[.21,.036,2.04],.012),'g63-squared-wide-stainless-step-'+s);
  for(const z of [-.84,.66])rod(g,black,[s*.70,.62,z],[s*1.00,.62,z],.025);
  for(let i=0;i<8;i++)box(g,black,[s*(.90+i*.023),.676,-.08],[.009,.007,1.92]);
  // Carbon roof blade with two recessed factory LED modules, not an
  // oversized off-road rack floating above the windscreen.
  named(box(g,c,[s*.61,2.245,.418],[.42,.041,.105],.019),'g63-squared-roof-carbon-light-housing-'+s);
  box(g,black,[s*.61,2.244,.474],[.356,.024,.009],.006);
  for(let i=0;i<8;i++)box(g,m.drl,[s*.61+(i-3.5)*.040,2.244,.480],[.031,.012,.004]);
 }
 const label=geometryText(g,'4X4/2',.240,.027,metal);label.name='g63-squared-visible-variant-badge';label.position.set(-.721,1.550,-2.405);label.rotation.y=Math.PI;
 view.root.userData.nativeConstruction={...view.root.userData.nativeConstruction,bodySurfaceRevision:24,factoryPortalVariant:true,raisedBodyM:.271,wideCarbonArches:true,roofLEDModules:2};
 view.root.userData.visualModel={...view.root.userData.visualModel,version:24,modelYear:2022,variant:'G63 4x4 squared',dimensions:G_VARIANTS.squared,selectedEquipment:'Factory portal stance, 325/55R22 off-road tires, wider carbon arch extensions and recessed roof LEDs'};
 view.root.userData.bodyRefinement={version:24,variant:'g63squared',factoryPortalBodyRiseM:.271,closedArchReturns:true};
 return view;
}

export function gClassSixView(spec){
 const donor={...spec,bodyStyle:'g63',gClassVariant:'standard',height:1.979,wheelbase:2.89,frontWeightFraction:.5,tireRadius:.3974,cgHeight:spec.cgHeight};
 const view=gClassView(donor),g=view.body,m=view.materials;view.spec=spec;
 const headlamps=[];g.traverse(o=>{if(o.name==='gclass-round-multibeam-headlight')headlamps.push(o);});
 for(const lamp of headlamps){
  lamp.clear();lamp.name='g63-six-classic-projector-headlamp';lamp.scale.setScalar(.230/.302);
  const housing=mesh(lamp,new T.CylinderGeometry(.151,.151,.030,64),m.gTrim);housing.rotation.x=Math.PI/2;
  const bezel=mesh(lamp,new T.TorusGeometry(.135,.009,8,64),m.chrome,[0,0,.017]);
  surface(lamp,m.chrome,48,9,(u,v)=>{const a=u*Math.PI*2,r=.112*v;return[Math.cos(a)*r,Math.sin(a)*r,.003+.021*(1-v*v)];},true);
  const projector=mesh(lamp,new T.CircleGeometry(.063,48),m.optic,[0,0,.029]);
  const rim=mesh(lamp,new T.TorusGeometry(.065,.005,8,48),m.chrome,[0,0,.030]);
  surface(lamp,m.lens,48,9,(u,v)=>{const a=u*Math.PI*2,r=.125*v;return[Math.cos(a)*r,Math.sin(a)*r,.035+.007*(1-v*v)];},true);
 }
 // Retain the front double cab's formed skins, doors, seals, actual glazing
 // holes and cabin. The rear SUV closure/spare are removed, not buried.
 const drop=[];g.traverse(o=>{if(/gclass-(box-shouldered-fender|fender-upper-return|folded-arch-edge|closed-inner-wheelwell)|g63-panamericana-grille-bar|gclass-rear-roof-header/.test(o.name)||o.name==='gclass-rigid-star-badge'||o.name==='gclass-modern-widescreen-frame'||o.isMesh&&o.material===m.screen)drop.push(o);});
 for(const o of drop)o.removeFromParent();clipCabAtZ(g,-1.55);
 const cab=moveChildren(g,[0,.231,.655]);cab.name='g63-six-double-cab';g.position.set(0,-spec.cgHeight,0);
 const c=carbon(),trim=m.gTrim,metal=m.gSatin,paint=m.paint,red=m.red;
 // Factory front roof spoiler contains two recessed LED units. The housings
 // follow the leading roof edge without inflating the published roof height.
 for(const s of [-1,1]){
  named(box(g,c,[s*.605,2.191,1.123],[.420,.034,.111],.014),'g63-six-roof-carbon-light-housing-'+s);
  box(g,trim,[s*.605,2.190,1.183],[.355,.022,.009],.004);
  for(let i=0;i<8;i++)box(g,m.drl,[s*.605+(i-3.5)*.040,2.190,1.189],[.031,.012,.004]);
 }
 // The 2014 truck predates the full-width digital dashboard. Its two
 // circular analogue instruments and separate central tablet remain visibly
 // distinct through the actual cab glazing.
 named(box(g,trim,[-.435,1.435,1.100],[.475,.224,.092],.035),'g63-six-analogue-instrument-binnacle');
 for(const x of [-.550,-.335]){
  const dial=mesh(g,new T.CircleGeometry(.079,48),m.gBlackPanel,[x,1.439,1.047]);dial.rotation.y=Math.PI;
  const rim=mesh(g,new T.TorusGeometry(.081,.0035,8,48),metal,[x,1.439,1.043]);
  for(let i=0;i<12;i++){const a=i*Math.PI*2/12;rod(g,metal,[x+Math.cos(a)*.068,1.439+Math.sin(a)*.068,1.041],[x+Math.cos(a)*.075,1.439+Math.sin(a)*.075,1.041],.0012,6);}
  rod(g,red,[x,1.439,1.038],[x-.035,1.477,1.038],.0025,6);
 }
 named(box(g,trim,[.12,1.545,1.080],[.315,.180,.038],.014),'g63-six-separate-command-tablet');
 const screen=box(g,m.screen,[.12,1.545,1.057],[.286,.148,.004]);
 const front=G_VARIANTS.six.bedFrontZ,rear=G_VARIANTS.six.bedRearZ,wall=.895,top=1.285;
 // The pickup cab has a real rear wall and independent rear glazing.
 const window=[[-.665,1.494],[.665,1.494],[.665,2.040],[-.665,2.040]];
 named(mappedPolygon(g,paint,[[-.89,.755],[.89,.755],[.89,2.174],[-.89,2.174]],(x,y)=>[x,y,-wall],[window],true,6),'g63-six-closed-cab-rear-wall');
 named(mappedPolygon(g,m.privacyGlass,window,(x,y)=>[x,y,-wall-.006],[],true,5),'g63-six-rear-cab-glass');
 line(g,trim,[...window,window[0]].map(([x,y])=>[x,y,-wall-.012]),.007);
 // Close the roof section created by the exact mesh cut, including its
 // narrow rounded header flange instead of leaving an open SUV cross section.
 box(g,paint,[0,2.185,-wall+.016],[1.73,.046,.060],.016);
 named(box(g,trim,[0,.855,(front+rear)/2],[1.825,.085,front-rear],.020),'g63-six-cargo-bed-floor');
 for(let i=-6;i<=6;i++)named(box(g,metal,[i*.116,.903,(front+rear)/2],[.022,.012,front-rear-.08]),'g63-six-longitudinal-bed-floor-rib');
 for(const s of [-1,1]){
  // Formed double-wall bed rails and inner wheel tubs. Bed floor, front
  // bulkhead and tailgate remain separate visible solids from above/rear.
  named(box(g,paint,[s*.947,(.855+top)/2,(front+rear)/2],[.111,top-.855,front-rear],.026),'g63-six-formed-bed-side-'+s);
  box(g,c,[s*.954,top+.008,(front+rear)/2],[.126,.029,front-rear+.012],.010);
  for(const axle of G_VARIANTS.six.axles)wideArch(g,c,s,axle,.6284,.455,1.055,'g63-six-carbon-arch');
  for(const axle of G_VARIANTS.six.axles.slice(1))box(g,trim,[s*.792,.947,axle],[.232,.185,.740],.073);
  // Repair the old SUV rear-wheel notch inside the shortened rear door with
  // a panel that follows the actual middle-axle clearance envelope.
  surface(g,paint,36,10,(u,v)=>{const z=lerp(-.895,-.30,u),d=Math.abs(z+1.02),low=d<.50?.4699+Math.sqrt(.50*.50-d*d):.68;return[s*.910,lerp(Math.max(.68,low),1.226,v),z];},s>0).name='g63-six-cab-lower-rear-closure-'+s;
  named(box(g,metal,[s*.972,.665,.60],[.170,.035,2.13],.010),'g63-six-double-cab-step-'+s);
  rod(g,metal,[s*.725,top+.025,front-.13],[s*.725,1.695,front-.47],.043,20);
  rod(g,metal,[s*.725,1.695,front-.47],[s*.725,top+.025,rear+.30],.043,20);
  for(const z of [front-.18,rear+.28])box(g,metal,[s*.72,top+.030,z],[.15,.025,.17],.007);
 }
 rod(g,metal,[-.725,1.695,front-.47],[.725,1.695,front-.47],.043,20);
 box(g,paint,[0,1.063,front-.035],[1.80,.42,.075],.018);
 named(box(g,paint,[0,1.063,rear-.017],[1.80,.420,.069],.025),'g63-six-sculpted-tailgate');
 line(g,trim,[[-.858,.883,rear-.055],[-.858,1.255,rear-.055],[.858,1.255,rear-.055],[.858,.883,rear-.055]],.003);
 box(g,trim,[0,1.165,rear-.056],[.227,.033,.019],.006);
 for(const s of [-1,1]){
  box(g,trim,[s*.892,.795,rear-.040],[.142,.295,.062],.025);
  named(box(g,red,[s*.892,.844,rear-.076],[.115,.116,.015],.012),'g63-six-rear-brake-lamp-'+s);
  box(g,m.reverse,[s*.892,.750,rear-.078],[.115,.043,.015],.007);
  box(g,red,[s*.892,.684,rear-.078],[.115,.050,.015],.007);
  for(const z of [front-.05,rear+.24])box(g,m.gReflector,[s*1.007,.93,z],[.012,.037,.070],.006);
 }
 named(box(g,trim,[0,.612,rear-.034],[1.92,.139,.163],.025),'g63-six-independent-rear-bumper');
 box(g,metal,[0,.618,rear-.122],[.543,.045,.030],.008);
 const plate=box(g,metal,[0,.757,rear-.071],[.405,.095,.012],.006);plate.name='g63-six-rear-license-plate';
 const label=geometryText(g,'G63 6X6',.32,.032,metal);label.position.set(-.48,1.160,rear-.057);label.rotation.y=Math.PI;
 // Correct-era AMG twin-blade grille, replacing modern vertical bars.
 box(g,trim,[0,1.140,2.890],[.876,.285,.022],.025);
 for(const y of [1.100,1.191])named(box(g,metal,[0,y,2.907],[.846,.025,.025],.006),'g63-six-twin-blade-grille');
 const star=new T.Group();star.position.set(0,1.145,2.925);g.add(star);
 const ring=mesh(star,new T.TorusGeometry(.112,.006,8,64),metal);
 for(let i=0;i<3;i++){const a=Math.PI/2+i*2*Math.PI/3;rod(star,metal,[0,0,.002],[Math.cos(a)*.108,Math.sin(a)*.108,.002],.010);}
 for(const x of [-.595,.595])box(g,trim,[x,.665,-.15],[.10,.13,5.30],.010);
 for(const z of [1.60,.62,-.55,-1.55,-2.55])box(g,trim,[0,.645,z],[1.29,.080,.095],.009);
 while(view.wheels.length<6){const w=view._wheel();view.scene.add(w.root);view.wheels.push(w);}
 view.root.userData.nativeConstruction={version:4,bodySurfaceRevision:24,originalGeometry:true,importedManufacturerCAD:false,doubleCabPickup:true,closedCargoBed:true,threeAxleBody:true,frontAxleZ:2.10,middleAxleZ:-1.02,rearAxleZ:-2.12,openGlazing:true,formedBonnet:true,closedArchReturns:true};
 view.root.userData.visualModel={type:'Original reference reconstruction; not OEM CAD',version:24,modelYear:2014,variant:'G63 AMG 6x6',dimensions:G_VARIANTS.six,selectedEquipment:'37in mud tires / 18in beadlock wheels, twin-blade AMG grille, double cab, ribbed open bed and stainless rollover bar'};
 view.root.userData.bodyRefinement={version:24,variant:'g63six',wheelCount:6,closedDoubleCab:true,closedCargoBed:true,continuousDoorJoints:true};
 return view;
}

function sixRim(spec){
 const g=new T.Group(),r=.2286,w=spec.tireWidth,m=new T.MeshStandardMaterial({color:'#747b78',metalness:.80,roughness:.34}),dark=new T.MeshStandardMaterial({color:'#111719',roughness:.52}),edge=new T.MeshStandardMaterial({color:'#993326',metalness:.55,roughness:.38});
 markMaterial(m,'wheel');markMaterial(dark,'black');markMaterial(edge,'wheel');
 const profile=[[r*.96,-w*.43],[r,-w*.40],[r*.95,-w*.35],[r*.88,-w*.31],[r*.88,w*.31],[r*.95,w*.35],[r,w*.40],[r*.96,w*.43],[r*.85,w*.39],[r*.82,-w*.39],[r*.96,-w*.43]];
 const barrel=mesh(g,new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),80),m);barrel.geometry.normalizeNormals();barrel.rotation.z=Math.PI/2;
 for(const s of [-1,1]){
  const face=s*w*.40,shape=new T.Shape();shape.absarc(0,0,r*.88,0,Math.PI*2,false);
  for(let i=0;i<12;i++){const a=i*Math.PI/6,h=new T.Path();h.absarc(Math.cos(a)*r*.63,Math.sin(a)*r*.63,r*.092,0,Math.PI*2,true);shape.holes.push(h);}
  const plate=new T.ExtrudeGeometry(shape,{depth:.015,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.003,bevelThickness:.003,curveSegments:32});const p=plate.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,face+s*z,x,y);}
  if(s<0)for(let i=0;i<p.count;i+=3){const a=new T.Vector3().fromBufferAttribute(p,i+1),b=new T.Vector3().fromBufferAttribute(p,i+2);p.setXYZ(i+1,b.x,b.y,b.z);p.setXYZ(i+2,a.x,a.y,a.z);}
  plate.computeVertexNormals();named(mesh(g,plate,m),'g63-six-beadlock-perforated-face');
  const bead=mesh(g,new T.TorusGeometry(r*.925,.008,8,80),edge,[face+s*.015,0,0]);bead.rotation.y=Math.PI/2;
  for(let i=0;i<24;i++){const a=i*Math.PI/12,o=mesh(g,new T.CylinderGeometry(.0055,.006,.009,6),m,[face+s*.021,Math.cos(a)*r*.925,Math.sin(a)*r*.925]);o.rotation.z=Math.PI/2;}
  const hub=mesh(g,new T.CylinderGeometry(r*.30,r*.30,.038,48),dark,[face+s*.022,0,0]);hub.rotation.z=Math.PI/2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3,o=mesh(g,new T.CylinderGeometry(.008,.0085,.013,6),m,[face+s*.046,Math.cos(a)*r*.36,Math.sin(a)*r*.36]);o.rotation.z=Math.PI/2;}
 }
 g.name='g63-six-hutchinson-style-18in-beadlock';return g;
}
export function refineGVariant(view,spec){
 for(const w of view.wheels){refineFactoryWheel(w,spec,view.materials);w.rimSpin.clear();w.rimSpin.add(spec.bodyStyle==='g63six'?sixRim(spec):gClassRim(spec));w.root.userData.factoryWheelRevision=24;}
 view.root.userData.nativeFidelity={version:4,referenceCraftRevision:24,splitTireAndRim:true,formedCarcass:true,beveledTread:true,geometryLettering:true,factoryPortalStance:true,wheelCount:spec.bodyStyle==='g63six'?6:4};
 return{tire:view.wheels[0].tireShape,rim:view.wheels[0].rimSpin};
}
