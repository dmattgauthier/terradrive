// Original variant coachwork. Factory photographs/dimensions are references,
// never redistributed meshes. Y up, +Z nose, metres above tyre contact plane.
import {T,box,mesh,surface,mappedPolygon,line,lerp,smooth,station} from './body-surface.mjs';
import {cellularGrille,panelJoint} from './coachwork-craft.mjs';
import {gClassSteering,instrumentDial,instrumentDisplay} from './cabin-controls.mjs';
import {gClassView,gClassRim} from './mercedes-gclass.mjs';
import {geometryText,refineFactoryWheel} from './vehicle-fidelity.mjs';
import {SIX_PICKUP,sixOpeningY,buildSixPickup,buildSixRoof} from './g63-six-pickup.mjs';

// Selected dimension/axle envelopes. Unlike the retained modern-G donor
// brochure, an inspectable first-party variant dimension table was not found;
// these remain reference estimates rather than certified OEM measurements.
export const G_VARIANTS=Object.freeze({
 squared:{height:2.250,width:2.100,wheelbase:2.890,bodyRise:.271,tireRadius:.45815,rimInches:22},
 six:SIX_PICKUP
});
const named=(o,n)=>{o.name=n;return o;};
function rod(g,m,a,b,r=.012,n=12){const p=new T.Vector3(...a),q=new T.Vector3(...b),o=mesh(g,new T.CylinderGeometry(r,r,p.distanceTo(q),n),m,p.clone().add(q).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.sub(p).normalize());return o;}
function moveChildren(g,offset){const inner=new T.Group();for(const child of [...g.children]){g.remove(child);inner.add(child);}inner.position.set(...offset);g.add(inner);return inner;}
function markMaterial(m,role){m.userData.automotive=role;m.userData.nativeRole=role;return m;}
function carbon(){return markMaterial(new T.MeshPhysicalMaterial({color:'#171d20',roughness:.32,metalness:0,clearcoat:.7,clearcoatRoughness:.24}),'carbon');}

// Cut triangles, not their bounding boxes: roof/cab side sheets cross the
// pickup's rear wall and must terminate exactly at that wall without spikes.
function clipCabAtZ(body,cut,select=()=>true,keepField=null){
 body.updateWorldMatrix(true,true);const inverse=body.matrixWorld.clone().invert();
 body.traverse(o=>{
  if(!o.isMesh||!select(o))return;
  const g=o.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,idx=g.index;
  const rel=inverse.clone().multiply(o.matrixWorld),back=rel.clone().invert(),P=[],N=[],UV=[],groups=[];
  const sample=i=>({p:new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(rel),n:new T.Vector3().fromBufferAttribute(n,i),uv:uv?[uv.getX(i),uv.getY(i)]:[0,0]});
  const mix=(a,b,t)=>({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.map((v,k)=>lerp(v,b.uv[k],t))});
  const push=v=>{const q=v.p.clone().applyMatrix4(back);P.push(...q.toArray());N.push(...v.n.toArray());UV.push(...v.uv);};
  for(let i=0;i<(idx?.count??p.count);i+=3){
   const polygon=[0,1,2].map(k=>sample(idx?idx.getX(i+k):i+k)),out=[];
   for(let j=0;j<3;j++){
    const a=polygon[j],b=polygon[(j+1)%3],da=keepField?keepField(a.p):a.p.z-cut,db=keepField?keepField(b.p):b.p.z-cut,insideA=da>=0,insideB=db>=0;
    if(insideA)out.push(a);
    if(insideA!==insideB){
     let t=da/(da-db);
     if(keepField){let lo=0,hi=1;for(let k=0;k<18;k++){const mid=(lo+hi)/2;if((keepField(a.p.clone().lerp(b.p,mid))>=0)===insideA)lo=mid;else hi=mid;}t=(lo+hi)/2;}
     out.push(mix(a,b,t));
    }
   }
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
function wideArch(g,m,liner,side,axle,outer,name){
 // A high, almost level crown and angled legs follow the carbon moulding.
 // The fender extends into the surrounding body behind the visible edge.
 const profile=[[-.578,.607],[-.492,.902],[-.403,1.064],[-.332,1.145],[-.234,1.174],
   [.229,1.174],[.330,1.150],[.420,1.070],[.503,.925],[.569,.602]];
 const arch=(u,v)=>{
   const z=lerp(profile[0][0],profile.at(-1)[0],u);
   const end=1-smooth(Math.abs(z),.31,.55);
   return[axle+z,station(profile,z,1)+v*(.056+.023*end),end];
 };
 named(surface(g,m,56,4,(u,v)=>{
   const [z,y,end]=arch(u,v);
   return[side*(outer-.019*(1-end)-.007*(1-Math.sin(v*Math.PI))),y,z];
 },side>0),name+'-outer-'+side+'-'+axle);
 for(const [v,material,key] of [[1,m,'crown'],[0,liner,'inner-return']]){
   named(surface(g,material,56,3,(u,w)=>{
     const [z,y,end]=arch(u,v),lip=outer-.019*(1-end)-.007;
     return[side*lerp(.884,lip,w),y+(v?.009:-.012)*Math.sin(w*Math.PI),z];
   },side*(v?1:-1)<0),name+'-'+key+'-'+side+'-'+axle);
 }
 for(const u of [0,1])named(surface(g,m,2,2,(v,w)=>{
   const [z,y,end]=arch(u,v);
   return[side*lerp(.884,outer-.019*(1-end)-.007*(1-Math.sin(v*Math.PI)),w),y,z];
 },side*(u?1:-1)>0),name+'-closed-end-'+side+'-'+axle+'-'+u);
}

function squaredSpare(g,m,carbon){
 const holder=named(new T.Group(),'g63-squared-rear-wheel-carrier');
 holder.position.set(0,1.489,-2.447);
 g.add(holder);
 box(holder,m.gTrim,[0,0,.053],[.565,.515,.110],.031);
 const spare=named(new T.Group(),'g63-squared-exposed-spare');
 holder.add(spare);
 const r=G_VARIANTS.squared.tireRadius;
 const sidewall=[[.285,.097],[.311,.117],[r*.86,.121],[r*.95,.105],[r,.072],
   [r,-.066],[r*.95,-.098],[r*.86,-.119],[.311,-.115],[.285,-.092],[.285,.097]];
 const carcass=mesh(spare,new T.LatheGeometry(sidewall.map(p=>new T.Vector2(...p)),72),m.rubber);
 carcass.rotation.x=Math.PI/2;
 for(let i=0;i<32;i++){
   const a=i*2*Math.PI/32;
   const shoulder=box(spare,m.tread,[Math.cos(a)*(r-.016),Math.sin(a)*(r-.016),-.042],
     [.023,.051,.073]);
   shoulder.rotation.z=a;
 }
 const wheel=mesh(spare,new T.CylinderGeometry(.285,.285,.083,52),m.gTrim,[0,0,-.050]);
 wheel.rotation.x=Math.PI/2;
 mesh(spare,new T.TorusGeometry(.270,.008,7,52),m.gSatin,[0,0,-.095]);
 for(let i=0;i<10;i++){
   const a=i*Math.PI/5;
   const spoke=box(spare,m.gSatin,[Math.cos(a)*.148,Math.sin(a)*.148,-.092],[.215,.016,.017]);
   spoke.rotation.z=a;
 }
 // The carbon carrier cuts across the lower wheel face on the production SUV.
 const cover=[[-.429,-.204],[-.378,-.345],[-.286,-.417],[.286,-.417],[.378,-.345],[.429,-.204],
   [.301,-.156],[-.301,-.156]];
 const carrierMap=(x,y)=>[x,y,-.121-.016*(1-(x/.429)**2)];
 named(mappedPolygon(holder,carbon,cover,carrierMap,[],true,4),'g63-squared-lower-carbon-spare-cover');
 const joint=panelJoint(cover.map(p=>carrierMap(...p)),.018,true);
 const edge=mesh(holder,new T.TubeGeometry(joint,48,.006,5,false),carbon);
 edge.name='g63-squared-turned-spare-cover-edge';
 const label=geometryText(holder,'4X4',.208,.075,m.gSatin);
 label.name='g63-squared-visible-variant-badge';
 label.position.set(-.016,-.284,-.141);
 label.rotation.y=Math.PI;
 const exponent=geometryText(holder,'2',.041,.036,m.gSatin);
 exponent.name='g63-squared-raised-exponent';
 exponent.position.set(-.141,-.246,-.141);
 exponent.rotation.y=Math.PI;
}

export function gClassSquaredView(spec){
 const view=gClassView({...spec,gClassVariant:'standard',tireRadius:.3974,height:1.979}),g=view.body,m=view.materials;
 view.spec=spec;
 const cab=moveChildren(g,[0,G_VARIANTS.squared.bodyRise,0]);cab.name='g63-squared-raised-production-coachwork';
 const donorParts=[];
 cab.traverse(o=>{
   if(o.userData.gClassRunningBoard||
     /gclass-(box-shouldered-fender|fender-upper-return|folded-arch-edge|closed-inner-wheelwell|fender-tip-cap|backlight-roof-lip)|g63-covered-factory-spare/.test(o.name)){
     donorParts.push(o);
   }
 });
 for(const o of donorParts)o.removeFromParent();
 const c=carbon(),black=m.gTrim,metal=m.gSatin;
 squaredSpare(g,m,c);
 named(box(g,c,[0,2.209,-2.233],[1.748,.065,.194],.027),'g63-squared-rear-carbon-roof-spoiler');
 named(box(g,black,[0,.591,-2.191],[1.626,.123,.137],.026),'g63-squared-rear-underride-guard');
 for(const s of [-1,1]){
  for(const axle of [-1.445,1.445])wideArch(g,c,black,s,axle,1.050,'g63-squared-carbon-extension');
  named(box(g,c,[s*.924,1.269,-.697],[.018,.011,.828],.003),'g63-squared-carbon-door-strip-'+s);
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
 view.root.userData.nativeConstruction={...view.root.userData.nativeConstruction,bodySurfaceRevision:31,factoryPortalVariant:true,raisedBodyM:.271,wideCarbonArches:true,roofLEDModules:2,coveredFactorySpare:false,exposedFactorySpare:true};
 view.root.userData.visualModel={...view.root.userData.visualModel,version:31,modelYear:2022,variant:'G63 4x4 squared',dimensions:G_VARIANTS.squared,selectedEquipment:'Factory portal stance, 325/55R22 off-road tires, boxed carbon fenders and lower carbon spare-wheel carrier'};
 view.root.userData.bodyRefinement={version:31,variant:'g63squared',factoryPortalBodyRiseM:.271,closedArchReturns:true};
 return view;
}

export function gClassSixView(spec){
 const donor={...spec,bodyStyle:'g63',gClassVariant:'standard',height:1.979,wheelbase:2.89,frontWeightFraction:.5,tireRadius:.3974,cgHeight:spec.cgHeight};
 const view=gClassView(donor,{classicCabin:true}),g=view.body,m=view.materials;view.spec=spec;
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
 const drop=[];g.traverse(o=>{
  if(o.userData.gClassRunningBoard){drop.push(o);return;}
  if(/gclass-(box-shouldered-fender|fender-upper-return|folded-arch-edge|closed-inner-wheelwell|fender-tip-cap|front-protection-trim|front-plate-plinth|front-plate-lettering)|g63-panamericana-grille-bar|gclass-rear-roof-header/.test(o.name)||['gclass-rounded-roof-crown','gclass-rigid-star-badge','gclass-modern-widescreen-frame'].includes(o.name)){drop.push(o);return;}
  if(!o.isMesh)return;
  o.geometry.computeBoundingBox();const b=o.geometry.boundingBox,roofInsert=!o.name&&b.min.y>1.93&&b.min.z>-.65&&b.max.z<.35;
  if(roofInsert||o.material===m.screen)drop.push(o);
 });
 for(const o of drop)o.removeFromParent();clipCabAtZ(g,-1.55);
 const cab=moveChildren(g,[0,SIX_PICKUP.bodyRise,.655]);cab.name='g63-six-double-cab';g.position.set(0,-spec.cgHeight,0);
 // Discard the old SUV quarter's lower arch sheet; the replacement follows
 // the shared tandem opening rather than overlapping a second wheel notch.
 clipCabAtZ(g,-.30,o=>o.name.startsWith('gclass-drawn-lower-door-sheet-'));
 // The front donor sheet still had a round cut-out behind the new boxed
 // fender. Trim its actual triangles to the shared opening's upper fold,
 // rather than leaving a bright crescent in the wheel well.
 clipCabAtZ(g,0,o=>o.name.startsWith('gclass-drawn-lower-door-sheet-'),p=>Math.max(SIX_PICKUP.frontOpening[0][0]-p.z,p.z-SIX_PICKUP.frontOpening.at(-1)[0],p.y-sixOpeningY(p.z)-.095));
 // The SUV donor also carried a full-width cabin floor and rear-quarter
 // door-card slabs through the middle tire's travel. Keep the floor between
 // the tires and terminate the inner cards at the actual rear-door edge.
 g.updateWorldMatrix(true,true);const bodyInverse=g.matrixWorld.clone().invert();
 g.traverse(o=>{
  if(!o.isMesh)return;
  const b=new T.Box3().setFromObject(o).applyMatrix4(bodyInverse);
  if(o.material?.userData.vehicleInterior&&b.max.y<1&&b.min.x<-.80&&b.max.x>.80&&b.min.z<-.55&&b.max.z>.5){o.scale.x*=.82;o.name='g63-six-narrowed-cabin-floor';}
  if(!o.name&&Math.abs((b.min.x+b.max.x)*.5)>.70&&b.min.y<1&&b.max.y<1.40&&b.min.z<-.55&&b.max.z>.5)o.name='g63-six-trimmed-inner-door-card';
 });
 clipCabAtZ(g,-.48,o=>o.name==='g63-six-trimmed-inner-door-card');
 const trim=m.gTrim,metal=m.gSatin,paint=m.paint,red=m.red;
 // Factory front roof spoiler contains two recessed LED units. The housings
 // follow the leading roof edge without inflating the published roof height.
 buildSixRoof(g,m);
 // The 2014 truck predates the full-width digital dashboard. Its two
 // circular analogue instruments and separate central tablet remain visibly
 // distinct through the actual cab glazing.
 named(box(g,trim,[.402,1.435,1.100],[.443,.212,.092],.035),'g63-six-analogue-instrument-binnacle');
 for(const [x,angle] of [[.306,-.87],[.499,-1.47]]){
  instrumentDial(g,{face:m.gBlackPanel,bezel:metal,marks:m.headliner,needle:metal,center:[x,1.439,1.048],radius:.073,angle});
 }
 named(box(g,trim,[-.045,1.545,1.080],[.315,.180,.038],.014),'g63-six-separate-command-tablet');
 box(g,m.screen,[-.045,1.545,1.057],[.286,.148,.004]);
 instrumentDisplay(g,metal,[-.045,1.545,1.053],[.286,.148],'navigation');
 gClassSteering(g,m,[.400,1.335,.869],[.400,1.326,1.091],true);
 const wall=.895;
 // The pickup cab has a real rear wall and independent rear glazing.
 const window=[[-.665,1.544],[.665,1.544],[.665,2.090],[-.665,2.090]];
 named(mappedPolygon(g,paint,[[-.89,1.397],[-.700,1.397],[-.700,.805],[.700,.805],[.700,1.397],[.89,1.397],[.89,2.224],[-.89,2.224]],(x,y)=>[x,y,-wall],[window],true,6),'g63-six-closed-cab-rear-wall');
 named(mappedPolygon(g,m.privacyGlass,window,(x,y)=>[x,y,-wall-.006],[],true,5),'g63-six-rear-cab-glass');
 line(g,trim,[...window,window[0]].map(([x,y])=>[x,y,-wall-.012]),.007);
 // Close the roof section created by the exact mesh cut, including its
 // narrow rounded header flange instead of leaving an open SUV cross section.
 box(g,paint,[0,2.235,-wall+.016],[1.73,.046,.060],.016);
 buildSixPickup(g,m);
 // Open mesh and paired bright blades on the classic W463 fascia.
 const grille=[[-.425,1.075],[.425,1.075],[.425,1.296],[-.425,1.296]];
 box(g,trim,[0,1.185,2.856],[.875,.254,.035],.020);
 for(const [y,w] of [[1.058,.859],[1.309,.865]])box(g,metal,[0,y,2.875],[w,.018,.018]);
 for(const side of [-1,1]){
   box(g,metal,[side*.429,1.183,2.878],[.015,.247,.019]);
   const bezel=box(g,trim,[side*.632,1.073,2.877],[.239,.045,.030],.006);
   bezel.name='g63-six-separate-lower-drl-housing';
   for(let i=0;i<6;i++)box(g,m.drl,[side*.632+(i-2.5)*.032,1.073,2.895],[.017,.010,.006]);
 }
 cellularGrille(g,m.gGrille,grille,(x,y)=>[x,y,2.884],{
   pitch:.047,web:.0023,depth:.007,name:'g63-six-open-upper-grille'});
 for(const y of [1.146,1.216])named(box(g,metal,[0,y,2.907],[.844,.013,.022]),'g63-six-twin-blade-grille');
 const star=named(new T.Group(),'g63-six-classic-star-badge');
 star.position.set(0,1.184,2.929);
 g.add(star);
 mesh(star,new T.TorusGeometry(.108,.006,8,48),metal);
 for(let i=0;i<3;i++){
   const a=Math.PI/2+i*2*Math.PI/3;
   rod(star,metal,[0,0,.003],[Math.cos(a)*.104,Math.sin(a)*.104,.003],.008);
 }
 // The front shield wraps below the bumper and has actual slots, visible
 // from the low front quarter. Leave the wheel throats and portal stance open.
 const skidSource=[[-.642,.639],[.642,.639],[.601,.545],[-.601,.545]];
 const vents=Array.from({length:10},(_,i)=>{
   const x=(i-4.5)*.116,y=.594;
   return Array.from({length:12},(_,j)=>{
     const a=2*Math.PI*j/12;
     return[x+.041*Math.cos(a),y+.020*Math.sin(a)];
   });
 });
 const skidMap=(x,y)=>[x,y,2.867-.077*(.639-y)/.094-.029*(x/.642)**2];
 named(mappedPolygon(g,metal,skidSource,skidMap,vents,false,3),'g63-six-vented-front-skid-plate');
 for(const vent of vents)named(mappedPolygon(g,trim,vent,(x,y)=>{
   const p=skidMap(x,y);p[2]-=.024;return p;
 },[],false,1),'g63-six-skid-vent-recess');
 named(box(g,trim,[0,.944,2.970],[.397,.085,.025],.008),'g63-six-factory-plate-plinth');
 const plate=geometryText(g,'6X6',.171,.040,metal);
 plate.position.set(0,.944,2.986);
 for(const x of [-.595,.595])box(g,trim,[x,.665,-.15],[.10,.13,5.30],.010);
 for(const z of [1.60,.62,-.55,-1.55,-2.55])box(g,trim,[0,.645,z],[1.29,.080,.095],.009);
 while(view.wheels.length<6){const w=view._wheel();view.scene.add(w.root);view.wheels.push(w);}
 view.root.userData.nativeConstruction={version:4,bodySurfaceRevision:31,originalGeometry:true,importedManufacturerCAD:false,doubleCabPickup:true,closedCargoBed:true,threeAxleBody:true,frontAxleZ:2.10,middleAxleZ:-1.02,rearAxleZ:-2.12,openGlazing:true,formedBonnet:true,closedArchReturns:true,joinedTandemFenders:true,fullHeightHoop:true};
 view.root.userData.visualModel={type:'Original reference reconstruction; not OEM CAD',version:31,modelYear:2014,variant:'G63 AMG 6x6',dimensions:G_VARIANTS.six,selectedEquipment:'37in tires / 18in beadlock wheels, classic twin-blade grille, bamboo-lined open bed, joined tandem fenders and full-height stainless roll bar'};
 view.root.userData.bodyRefinement={version:31,variant:'g63six',wheelCount:6,closedDoubleCab:true,closedCargoBed:true,continuousDoorJoints:true};
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
