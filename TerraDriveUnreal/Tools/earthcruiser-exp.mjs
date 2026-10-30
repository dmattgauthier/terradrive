// Original reconstruction of the single-cab 2022 EarthCruiser EXP98.
// Reference: the manufacturer's EC98 sales flyer and April 2022 platform release.
// No downloaded vehicle mesh, image texture, manufacturer CAD or browser edit.
// Source axes: X width, Y up from the ground, +Z forward; axle midpoint Z=0.
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {VEHICLES as BrowserVehicles} from '../../TerraDrive-v1.13/dist/src/vehicles.js';
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {nativeGeometry as G,mergeStaticMeshes} from './vehicle-geometry.mjs';
import {box,mesh,surface,mappedPolygon,polygon,line,curve,station,lerp,clamp} from './body-surface.mjs';
import {refineFactoryWheel,geometryText} from './vehicle-fidelity.mjs';

const IN=.0254,LB=.45359237,LBFT=1.3558179483;
export const EARTHCRUISER_EXP_LANDMARKS=Object.freeze({
  length:254*IN,width:83*IN,height:109*IN,roofRaisedHeight:133*IN,wheelbase:132.5*IN,
  tireRadius:37*IN/2,rimDiameter:17*IN,
  // Asymmetric overhangs and all sub-panel landmarks below are photo-fitted.
  frontZ:2.70,rearZ:2.70-254*IN,cabFrontZ:2.50,cabRearZ:.96,cabRoofY:2.53,
  houseFrontZ:.99,houseRearZ:-3.30,houseFloorY:.86,houseWallTopY:2.615,
  frontAxleZ:132.5*IN/2,rearAxleZ:-132.5*IN/2,
  cabHalfWidth:.997,houseHalfWidth:83*IN/2,estimatedMirrorWidth:2.50,
  drivingRoof:'closed',parameterStatus:'Published overall envelope/WB/tire/rim dimensions; body panel positions and overhang split are fitted estimates.'
});
export const EARTHCRUISER_EXP_SPEC={
  ...BrowserVehicles[3],id:'earthcruiser-exp',name:'EarthCruiser EXP',brand:'EarthCruiser',year:2022,
  trim:'EXP98 single cab / Isuzu NPR / 6.6 V8 / roof down',bodyStyle:'earthcruiser',color:'#e5e4dc',
  powertrain:'combustion',powerHP:350,torqueLbFt:425,torqueNm:425*LBFT,
  mass:5600,curbMass:5600,massStatus:'5600kg simulator operating-mass estimate; EC98 flyer supplies no curb weight.',
  length:254*IN,width:83*IN,height:109*IN,wheelbase:132.5*IN,track:1.78,trackFront:1.78,trackRear:1.78,
  tireSize:'37X13.50R17',tireRadius:37*IN/2,tireWidth:13.5*IN,tireType:'mud-terrain',stockPSI:55,stockPSIFront:55,stockPSIRear:60,
  pressureStatus:'Simulation cold-pressure setup for estimated axle loads, not a verified EC98 tire placard.',
  transmissionType:'automatic',transmissionName:'GM 6L90 6-speed automatic',gears:[4.027,2.364,1.532,1.152,.852,.667],reverseRatio:3.064,finalDrive:5.38,lowRatio:3.0,
  gearingStatus:'6L90 family ratios; final-drive and Atlas low ratio are simulator calibration, unverified for EXP98.',
  defaultMode:'2H',driveModes:['2H','4H','4L'],frontTorqueFraction:.5,
  features:{frontLocker:true,rearLocker:true,swayDisconnect:false,tractionControl:false,abs:true,hillDescent:false,winch:true},
  interlocks:{lowRangeMaxSpeed:1.34,lowRangeRequiresNeutral:true,lockerMaxSpeed:4.47,frontLockerModes:['4L'],rearLockerModes:['4L'],frontLockerRequiresRear:false},
  engine:{idleRPM:650,redlineRPM:5400,peakTorqueRPM:3800,peakPowerRPM:4500,curve:[[650,200],[1200,365],[2000,490],[3000,555],[3800,425*LBFT],[4500,350*745.699872/(4500*Math.PI/30)],[5400,350]],curveStatus:'Estimated interpolation through published350hp/425lb-ft; RPM landmarks are simulation estimates.'},
  suspension:{travel:.27,restLength:.48,springRate:78000,damping:9500,antiRoll:28000,frontType:'solid axle with leaf springs',rearType:'solid axle with leaf springs',parameterStatus:'Simulation wheel-rate/rest/travel/damping calibration, not measured EC98 suspension.'},
  frontWeightFraction:.45,cgHeight:1.12,clearance:.32,dragCoefficient:.66,
  geometryStatus:'Overall83x254x109in roof-down and132.5in WB are official; track, overhang split, CG and clearance are photo/physics estimates.',
  sources:['https://earthcruiser.com/wp-content/uploads/2023/11/EC98_Sales_Flyer-1.pdf','https://earthcruiser.com/earthcruiser-announces-next-generation-overland-vehicle-platform/'],
  notes:['2022 EXP98 Isuzu NPR/GM6.6L configuration; not the older Fuso/6.0L truck, dual cab or fixed-roof FX.','Atlas two-speed transfer case and Fusion axles with electronically locking differentials; manual locking front hubs.','Roof remains down for driving. Mass, pressure, CG, tire width, axle ratios and chassis responses are estimates, not real vehicle setup advice.']
};

function material(color,role,roughness=.5,metalness=0){
  const m=new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:role==='paint'?1:0,clearcoatRoughness:.14,side:T.DoubleSide});
  m.userData.automotive=role;m.userData.automotiveOwner='earthcruiser';return m;
}
function palette(color){
  const m={paint:material(color||'#e5e4dc','paint',.25),whiteShell:material('#e6e5dd','paint',.40),black:material('#111719','plastic',.69),dark:material('#1d2426','plastic',.65),
    glossBlack:material('#11191d','black',.24),redPaint:material('#a92522','plastic',.65),chrome:material('#adb6b8','metal',.30,.84),satinMetal:material('#8b9599','satinMetal',.43,.73),grille:material('#292f32','plastic',.68),
    rubber:material('#101516','rubber',.94),tread:material('#171c1d','rubber',.97),rim:material('#141b20','wheel',.31,.65),brakeDisc:material('#687175','metal',.45,.80),
    interior:material('#444e53','plastic',.85),upholstery:material('#555e62','alcantara',.94),headliner:material('#a5aaa6','alcantara',.96),hardtop:material('#24292b','plastic',.83),badge:material('#c5c9c5','metal',.35,.64),
    screen:material('#14262d','black',.30),solar:material('#152838','plastic',.36),solarGrid:material('#667781','metal',.60,.35),canvas:material('#bebeb2','plastic',.97),wood:material('#948773','plastic',.84)};
  for(const key of ['glass','windscreen','privacyGlass']){m[key]=new T.MeshPhysicalMaterial({color:key==='privacyGlass'?'#263338':'#3d4e55',roughness:.045,transparent:true,opacity:key==='privacyGlass'?.78:.40,depthWrite:false,side:T.DoubleSide,clearcoat:.45});m[key].userData.vehicleGlass=true;m[key].userData.nativeRole='glass';}
  for(const key of ['lens','redLens']){m[key]=new T.MeshPhysicalMaterial({color:key==='redLens'?'#a22529':'#9cb0b7',roughness:.07,transparent:true,opacity:key==='redLens'?.42:.16,depthWrite:false,side:T.DoubleSide,clearcoat:.7});m[key].userData.vehicleLampLens=true;m[key].userData.vehicleTintedLens=key==='redLens';}
  const emit=(color,intensity,role)=>{const x=new T.MeshStandardMaterial({color,roughness:.27,emissive:color,emissiveIntensity:intensity});x.userData.nativeRole=role;return x;};
  m.red=emit('#b82d27',.25,'brake');m.reverse=emit('#d4e1df',0,'reverse');m.white=emit('#dce3d6',.18,'');m.amber=emit('#dc9d31',.28,'');m.headlampCore=emit('#dce4df',0,'');m.headlampReflector=m.chrome.clone();
  for(const key of ['interior','upholstery','headliner','screen','wood'])m[key].userData.vehicleInterior=true;
  return m;
}
function rod(g,m,a,b,r=.008,n=12){const A=new T.Vector3(...a),B=new T.Vector3(...b),v=B.clone().sub(A),o=mesh(g,new T.CylinderGeometry(r,r,v.length(),n),m,A.clone().add(B).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;}
function cylinder(g,m,p,r,d,axis='y',n=32){const o=mesh(g,new T.CylinderGeometry(r,r,d,n),m,p);if(axis==='x')o.rotation.z=Math.PI/2;if(axis==='z')o.rotation.x=Math.PI/2;return o;}
function round(points,r=.025,n=5){return G.roundedOutline(points.map(p=>[...p,0]),r,n).map(p=>p.slice(0,2));}
function inset(points,amount){const c=points.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(x=>x/points.length);return points.map(p=>p.map((v,i)=>lerp(v,c[i],amount)));}
function trimRing(g,m,outer,inner,map,flip=false){mappedPolygon(g,m,outer,map,[inner],flip,2);}
function aperture(g,m,contour,map,{flip=false,depth=.016,glass=m.glass,frame=.12}={}){
  const inner=inset(contour,frame),back=(u,v)=>{const p=map(u,v);return[p[0],p[1],p[2]];};
  trimRing(g,m.black,contour,inner,map,flip);
  const geo=mappedPolygon(g,glass,inner,back,[],flip,5);geo.name='exp98-real-glass-opening';return geo;
}
function oval(g,m,x,y,z,w,h,reverse=true){const o=mesh(g,new T.CircleGeometry(1,40),m,[x,y,z]);o.scale.set(w/2,h/2,1);if(reverse)o.rotation.y=Math.PI;return o;}
function label(g,m,text,w,h,p,side=0){const o=geometryText(g,text,w,h,m);o.position.set(...p);if(side)o.rotation.y=side*Math.PI/2;return o;}
function bolt(g,m,p,r=.004,axis='x'){return cylinder(g,m,p,r,.004,axis,6);}

// Eight-window satin-black Method-style truck wheel, with machined fasteners,
// a closed thin barrel and an extended front locking hub. No functional beadlock.
export function earthCruiserRim(spec=EARTHCRUISER_EXP_SPEC){
  const g=new T.Group(),w=spec.tireWidth,r=17*IN/2,m=palette(spec.color);
  const profile=[[.96,-.455],[1.0,-.440],[1.01,-.405],[.955,-.365],[.93,-.335],[.93,-.15],[.86,-.10],[.86,.10],[.93,.15],[.93,.335],[.955,.365],[1.01,.405],[1.0,.440],[.96,.455],[.941,.41],[.912,.33],[.912,.15],[.842,.105],[.842,-.105],[.912,-.15],[.912,-.33],[.941,-.41],[.96,-.455]];
  const barrel=mesh(g,new T.LatheGeometry(profile.map(([a,b])=>new T.Vector2(a*r,b*w)),72),m.rim);barrel.rotation.z=Math.PI/2;
  for(const side of [-1,1]){
    const face=side*w*.43,shape=new T.Shape();shape.absarc(0,0,r*.945,0,Math.PI*2,false);
    for(let j=0;j<8;j++){
      const a=j*Math.PI/4,h=new T.Path(),q=[[.42,-.15],[.79,-.16],[.86,-.10],[.86,.10],[.79,.16],[.42,.15],[.37,.08],[.37,-.08]];
      q.forEach(([rr,da],i)=>h[i?'lineTo':'moveTo'](Math.cos(a+da)*rr*r,Math.sin(a+da)*rr*r));h.closePath();shape.holes.push(h);
    }
    const geo=new T.ExtrudeGeometry(shape,{depth:.009,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,curveSegments:56}),p=geo.attributes.position;
    for(let i=0;i<p.count;i++){const y=p.getX(i),z=p.getY(i),rr=Math.hypot(y,z)/r;p.setXYZ(i,face+side*(.012-.033*(1-rr*rr)+p.getZ(i)),y,z);}geo.computeVertexNormals();mesh(g,geo,m.rim);
    const lip=mesh(g,new T.TorusGeometry(r*.973,.0042,8,72),m.rim,[face+side*.008,0,0]);lip.rotation.y=Math.PI/2;
    cylinder(g,m.rim,[face+side*.013,0,0],r*.315,.046,'x',40);
    cylinder(g,m.satinMetal,[face+side*.041,0,0],r*.155,.062,'x',32);
    cylinder(g,m.black,[face+side*.075,0,0],r*.100,.012,'x',24);
    for(let j=0;j<6;j++){const a=j*Math.PI/3;bolt(g,m.satinMetal,[face+side*.037,Math.cos(a)*r*.25,Math.sin(a)*r*.25],.009);}
    for(let j=0;j<24;j++){const a=j*Math.PI/12;bolt(g,m.satinMetal,[face+side*.014,Math.cos(a)*r*.897,Math.sin(a)*r*.897],.0034);}
    cylinder(g,m.black,[face+side*.018,r*.72,r*.48],.005,.022,'x',8);
  }
  mergeStaticMeshes(g);
  const barrelMesh=g.children.find(o=>o.isMesh&&o.material===m.rim);
  if(barrelMesh){barrelMesh.name='earthcruiser-rim-with-closed-inner-barrel';barrelMesh.userData.innerBarrelProfile=true;}
  g.userData.runningGearRevision=14;g.userData.wheelDesign='17in black eight-window Method-style truck rim';return g;
}

function cab(view){
  const g=view.body,m=view.materials,L=EARTHCRUISER_EXP_LANDMARKS,half=L.cabHalfWidth,frontAxle=L.frontAxleZ,wy=view.spec.tireRadius;
  const frontZ=(x,y)=>station([[.70,2.47],[1.02,2.50],[1.40,2.47],[1.58,2.44],[2.43,2.18],[2.53,2.14]],y,1)-.055*(Math.abs(x)/half)**4
    +.015*(1-(x/half)**2)*Math.exp(-(((y-1.43)/.13)**2));
  const face=(x,y,off=0)=>[x,y,frontZ(x,y)+off];
  const frontEdge=round([[-.98,.73],[-.995,1.40],[-.965,2.42],[-.86,2.52],[.86,2.52],[.965,2.42],[.995,1.40],[.98,.73]],.065,7);
  const windshield=round([[-.88,1.59],[-.85,2.40],[-.78,2.46],[.78,2.46],[.85,2.40],[.88,1.59],[.78,1.54],[-.78,1.54]],.035,6);
  const grille=round([[-.51,.984],[-.53,1.232],[.53,1.232],[.51,.984]],.024,5);
  const lamps=[-1,1].map(s=>round([[s*.56,.94],[s*.91,.94],[s*.94,1.365],[s*.81,1.430],[s*.58,1.337]],.023,5));
  mappedPolygon(g,m.paint,frontEdge,(x,y)=>face(x,y),[windshield,grille,...lamps],false,8).name='exp98-perforated-isuzu-cab-front';
  aperture(g,m,windshield,(x,y)=>face(x,y,-.002),{glass:m.windscreen,frame:.055});
  // Window reveal thickness, dashboard and a narrow painted cowl remain
  // separated; there is no opaque body panel behind the windscreen.
  for(let j=0;j<windshield.length;j++){const a=windshield[j],b=windshield[(j+1)%windshield.length];surface(g,m.black,4,2,(u,v)=>face(lerp(a[0],b[0],u),lerp(a[1],b[1],u),-.002-v*.028));}
  mappedPolygon(g,m.dark,grille,(x,y)=>face(x,y,-.045),[],false,4);
  for(const y of [1.02,1.09,1.16]){const p=face(0,y,-.022);box(g,m.grille,p,[1.0,.029,.018],.008);}
  label(g,m.chrome,'ISUZU',.38,.070,face(0,1.325,.016));label(g,m.black,'EXP',.115,.052,face(-.71,1.455,.009));
  for(const [idx,s]of [-1,1].entries()){
    const outline=lamps[idx],map=(u,v)=>face(u,v,-.017);aperture(g,m,outline,map,{glass:m.lens,frame:.07});
    const cy=1.087,cx=s*.765,p=face(cx,cy,-.035);
    const bowl=round([[cx-.133,cy-.104],[cx-.133,cy+.104],[cx+.133,cy+.104],[cx+.133,cy-.104]],.019,5);
    const opticOpening=round([[cx-.107,cy-.080],[cx-.107,cy+.080],[cx+.107,cy+.080],[cx+.107,cy-.080]],.014,5);
    mappedPolygon(g,m.chrome,bowl,(x,y)=>face(x,y,-.033),[],false,5);
    trimRing(g,m.satinMetal,bowl,opticOpening,(x,y)=>face(x,y,-.027));
    const reflector=mesh(g,new T.CircleGeometry(.080,40),m.chrome,[p[0],p[1],p[2]+.002]);reflector.scale.x=1.22;
    const optic=mesh(g,new T.CircleGeometry(.049,32),m.headlampCore,[p[0],p[1],p[2]+.003]);optic.scale.y=.87;
    const lip=mesh(g,new T.TorusGeometry(.078,.004,8,48),m.satinMetal,[p[0],p[1],p[2]+.004]);lip.scale.x=1.22;
    box(g,m.amber,face(s*.786,1.357,-.026),[.19,.042,.012],.008);
    box(g,m.chrome,face(s*.785,1.278,-.031),[.22,.055,.010],.009);
  }
  // Cab side sheets have a real open front arch and the NPR's downward
  // sweeping window sill. Their door seams run into the separate front cowl.
  for(const side of [-1,1]){
    const sx=(z,y)=>side*(half-.025*clamp((y-1.55)/.98,0,1)-.018*clamp((z-2.1)/.4,0,1)
      +.010*Math.exp(-(((y-1.39)/.27)**2))*Math.sin(clamp((z-.96)/1.52,0,1)*Math.PI));
    const sideMap=(z,y,off=0)=>[sx(z,y)+side*off,y,z];
    const lower=Array.from({length:65},(_,i)=>{const z=lerp(.96,2.46,i/64),d=z-frontAxle;return[z,Math.max(.70,Math.abs(d)<.555?wy+Math.sqrt(Math.max(0,.555**2-d*d)):.70)];});
    const outline=[...lower,[2.48,1.40],[2.43,1.58],[2.16,2.49],[1.03,2.52],[.96,2.43]];
    const window=round([[1.075,1.820],[1.075,2.393],[1.16,2.436],[2.05,2.407],[2.265,1.690],[1.57,1.738]],.022,5);
    mappedPolygon(g,m.paint,outline,(z,y)=>sideMap(z,y),[window],side>0,5).name='exp98-open-arch-cab-side';
    // Turn the NPR's steel cheeks into the side skin. A front plate and a
    // separate side plate previously left a sharp, open seam at this corner.
    surface(g,m.paint,14,56,(u,v)=>{
      const y=lerp(.74,2.42,v),z=station([[.74,2.46],[1.40,2.48],[1.58,2.43],[2.42,2.183]],y,1);
      const fx=station([[.74,.981],[1.40,.995],[2.42,.965]],y,1),a=face(side*fx,y),b=sideMap(z,y),control=[b[0],y,a[2]];
      return a.map((value,k)=>(1-u)**2*value+2*u*(1-u)*control[k]+u*u*b[k]);
    },side>0).name='exp98-formed-cab-corner-'+side;
    aperture(g,m,window,(z,y)=>sideMap(z,y,.002),{flip:side>0,glass:m.glass,frame:.07});
    const seam=round([[1.020,1.175],[1.020,2.450],[2.10,2.465],[2.395,1.585],[2.37,1.115],[2.20,1.07],[1.88,1.13],[1.52,1.18]],.035,5);
    line(g,m.dark,[...seam,seam[0]].map(([z,y])=>sideMap(z,y,.002)),.0021);
    box(g,m.dark,sideMap(1.115,1.425,.007),[.018,.205,.077],.016);
    box(g,m.black,sideMap(1.111,1.438,.018),[.019,.151,.038],.010);
    label(g,m.dark,'NPR HD',.24,.027,sideMap(1.74,.995,.007),side);
    box(g,m.black,sideMap(2.222,.904,.009),[.012,.075,.175],.009);
    box(g,m.white,sideMap(2.222,.907,.017),[.009,.039,.118],.004);
    // Steel arch lips follow the void without crossing the tire's sweep.
    const arc=Array.from({length:43},(_,i)=>{const a=lerp(-.12,Math.PI+.12,i/42);return sideMap(frontAxle+.565*Math.cos(a),wy+.565*Math.sin(a),.009);});
    curve(g,m.black,arc,.013);
    for(const yy of [.585,.698])box(g,m.dark,[side*.99,yy,1.019],[.22,.032,.34],.009);
    for(let j=0;j<5;j++)box(g,m.satinMetal,[side*1.024,.715,1.02+(j-2)*.050],[.145,.008,.020],.003);
    // Long twin-arm mirrors and a glass mirror backing are separate parts.
    rod(g,m.black,sideMap(2.22,1.57,.01),[side*1.228,1.66,1.87],.017);
    rod(g,m.black,[side*1.228,1.66,1.87],[side*1.228,2.22,1.87],.015);
    rod(g,m.black,sideMap(1.83,2.37,.01),[side*1.228,2.25,1.87],.013);
    box(g,m.black,[side*1.17,2.035,1.87],[.154,.351,.10],.028);
    box(g,m.chrome,[side*1.17,2.035,1.813],[.123,.300,.010],.020);
    // Scrub bars protect the front corners and cross over the cab roof.
    curve(g,m.black,[[side*1.015,1.48,2.47],[side*1.015,2.37,2.24],[side*1.00,2.64,2.18],[side*.99,2.683,1.98],[side*.99,2.683,1.02]],.024);
    box(g,m.amber,[side*.823,2.556,1.95],[.068,.040,.044],.015);
  }
  surface(g,m.paint,30,20,(u,v)=>{const x=lerp(-.963,.963,u),z=lerp(.97,2.15,v);return[x,2.514+.016*(1-(x/.963)**2),z];},true);
  box(g,m.headliner,[0,2.491,1.58],[1.80,.025,1.11],.035);
  // Rear cab wall has a real crawl-through opening into the house.
  const pass=round([[-.51,1.18],[-.51,1.92],[.51,1.92],[.51,1.18]],.055,6);
  mappedPolygon(g,m.paint,[[-.965,.83],[-.965,2.50],[.965,2.50],[.965,.83]],(x,y)=>[x,y,.97],[pass],true,4);
  trimRing(g,m.dark,pass,inset(pass,.08),(x,y)=>[x,y,.964],true);
  // Broad frontal roof rack rails stay below the closed camper roof.
  for(const z of [1.09,1.46,1.85,2.18])rod(g,m.black,[-.985,2.65,z],[.985,2.65,z],.019);
  for(const x of [-.95,.95])rod(g,m.black,[x,2.69,1.02],[x,2.69,2.18],.018);
  // Washer jets and articulated wipers sit on the glass rather than float.
  for(const s of [-1,1]){line(g,m.black,[face(s*.37,1.568,.017),face(s*.47,1.710,.018)],.006);line(g,m.black,[face(s*.17,1.628,.020),face(s*.75,1.691,.020)],.004);}
  // Tubular front bull bar, true winch opening and a folded lower bumper.
  box(g,m.dark,[0,.792,2.558],[1.98,.296,.266],.045);
  const apron=mesh(g,new T.BoxGeometry(1.32,.035,.38),m.satinMetal,[0,.557,2.36]);apron.rotation.x=-.34;
  for(const s of [-1,1]){
    curve(g,m.black,[[s*.89,.716,2.64],[s*.89,1.38,2.65],[s*.80,1.49,2.65],[s*.46,1.44,2.65]],.034);
    rod(g,m.black,[s*.45,.85,2.652],[s*.45,1.30,2.652],.032);
    oval(g,m.black,s*.77,.787,2.665,.12,.12,false);
    box(g,m.satinMetal,[s*.485,.764,2.675],[.035,.068,.017],.007);
    const shackle=mesh(g,new T.TorusGeometry(.027,.007,8,24,Math.PI*1.70),m.satinMetal,[s*.485,.740,2.676]);shackle.rotation.z=.27;
  }
  curve(g,m.black,[[-.45,1.30,2.652],[-.37,1.42,2.652],[0,1.44,2.652],[.37,1.42,2.652],[.45,1.30,2.652]],.034);
  for(const y of [.981,1.120])rod(g,m.black,[-.89,y,2.655],[.89,y,2.655],.025);
  box(g,m.black,[0,1.192,2.643],[.555,.086,.075],.014);
  for(let j=0;j<12;j++)box(g,m.white,[(j-5.5)*.039,1.191,2.686],[.027,.047,.006],.004);
  box(g,m.black,[0,.740,2.670],[.27,.070,.012],.015);trimRing(g,m.satinMetal,round([[-.15,.699],[-.15,.780],[.15,.780],[.15,.699]],.02,5),round([[-.105,.722],[-.105,.756],[.105,.756],[.105,.722]],.013,5),(x,y)=>[x,y,2.682]);
  curve(g,m.redPaint||m.red,[[-.14,.741,2.691],[-.25,.741,2.691],[-.27,.684,2.691],[-.21,.664,2.691]],.009);
  // Visible cab interior follows the large NPR glazing: two high-back seats,
  // low horizontal dash, steering wheel, console/cupholders and door cards.
  box(g,m.interior,[0,1.457,2.093],[1.77,.242,.34],.035);
  box(g,m.dark,[0,1.552,2.038],[.40,.099,.014],.008);
  box(g,m.screen,[0,1.553,2.024],[.228,.071,.009],.005);
  for(const x of [-.70,-.50,.49,.70])box(g,m.black,[x,1.553,2.025],[.125,.057,.012],.006);
  for(const s of [-1,1]){
    box(g,m.upholstery,[s*.507,1.135,1.480],[.449,.110,.50],.045);
    surface(g,m.upholstery,32,28,(u,v)=>{
      const x=(u*2-1)*.222,bolster=.034*Math.exp(-(((Math.abs(x)-.178)/.043)**2));
      return[s*.507+x,1.187+.017*Math.sin(v*Math.PI)+bolster,lerp(1.25,1.73,v)];
    },true).name='exp98-contoured-seat-cushion-'+s;
    const seat=mesh(g,new T.SphereGeometry(1,44,32),m.upholstery),p=seat.geometry.attributes.position;
    const signed=(x,p)=>Math.sign(x)*Math.abs(x)**p;
    for(let i=0;i<p.count;i++){
      const qx=p.getX(i),qy=p.getY(i),qz=p.getZ(i),t=(signed(qy,.64)+1)*.5,x=signed(qx,.60)*(.224-.030*t),front=qz>0?.040*Math.exp(-(((Math.abs(x)-.165)/.046)**2))*Math.sin(t*Math.PI):0;
      p.setXYZ(i,s*.507+x,1.195+t*.645,1.187-.070*t+signed(qz,.67)*.071+front);
    }
    seat.geometry.computeVertexNormals();seat.name='exp98-formed-scheel-mann-seat-'+s;
    box(g,m.upholstery,[s*.507,1.928,1.115],[.268,.190,.136],.044);
    for(const dx of [-.073,.073])cylinder(g,m.satinMetal,[s*.507+dx,1.833,1.119],.005,.085,'y',12);
    box(g,m.dark,[s*.507,.942,1.45],[.32,.30,.39],.030);
    box(g,m.interior,[s*.926,1.455,1.58],[.049,.299,.77],.020);
    box(g,m.dark,[s*.873,1.570,1.44],[.07,.055,.30],.018);
    for(const y of [1.36,1.48,1.60])line(g,m.interior,[[s*.507-.135,y,1.258-(y-1.195)*.11],[s*.507+.135,y,1.258-(y-1.195)*.11]],.0008);
  }
  box(g,m.interior,[0,1.230,1.382],[.358,.29,.79],.045);
  box(g,m.dark,[0,1.410,1.372],[.258,.021,.42],.023);
  for(const z of [1.58,1.76])cylinder(g,m.black,[0,1.386,z],.050,.012,'y',32);
  rod(g,m.dark,[.15,1.32,1.63],[.15,1.48,1.66],.013);cylinder(g,m.black,[.15,1.49,1.66],.027,.045,'y',20);
  const steering=new T.Group();steering.position.set(.51,1.564,1.901);steering.rotation.x=-.35;g.add(steering);
  mesh(steering,new T.TorusGeometry(.156,.017,10,48),m.dark);box(steering,m.interior,[0,0,0],[.113,.095,.040],.018);
  for(const a of [.40,Math.PI-.40,Math.PI*1.5])rod(steering,m.dark,[0,0,0],[Math.cos(a)*.145,Math.sin(a)*.145,0],.014);
}

function house(view){
  const g=view.body,m=view.materials,L=EARTHCRUISER_EXP_LANDMARKS,half=L.houseHalfWidth,rear=L.houseRearZ,front=L.houseFrontZ,wy=view.spec.tireRadius,axle=L.rearAxleZ;
  const w=(z,y)=>half-.027*clamp((y-2.52)/.12,0,1)-.022*clamp((Math.abs(z+1.15)-2.03)/.10,0,1);
  for(const side of [-1,1]){
    const map=(z,y,off=0)=>[side*(w(z,y)+off),y,z];
    const bottom=Array.from({length:105},(_,i)=>{const z=lerp(rear,front,i/104),dz=z-axle;return[z,Math.max(.865,Math.abs(dz)<.545?wy+Math.sqrt(Math.max(0,.545**2-dz*dz)):.865)];});
    const outline=[...bottom,[front,2.555],[front-.04,2.615],[rear+.06,2.615],[rear,2.555]];
    const windows=[round([[-2.99,1.985],[-2.99,2.400],[-1.97,2.400],[-1.97,1.985]],.027,6),round([[.08,1.985],[.08,2.400],[.79,2.400],[.79,1.985]],.027,6)];
    const door=round([[-1.36,.947],[-1.36,2.375],[-.73,2.375],[-.73,.947]],.026,6);
    mappedPolygon(g,m.whiteShell,outline,(z,y)=>map(z,y),side<0?[...windows,door]:windows,side>0,4).name='exp98-camper-wall-with-real-openings';
    for(const contour of windows){
      aperture(g,m,contour,(z,y)=>map(z,y,.003),{flip:side>0,glass:m.privacyGlass,frame:.10});
      const outer=inset(contour,.03),inner=inset(contour,.075);trimRing(g,m.satinMetal,outer,inner,(z,y)=>map(z,y,.007),side>0);
      const c=contour.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/contour.length);box(g,m.black,map(c[0],c[1]-.34,.008),[.019,.040,.093],.008);
    }
    // Kinetic-mount skirts sit below the molded house; the rear tire has
    // an open arch and a flexible mudflap, never an opaque rectangular cover.
    const skirtBottom=Array.from({length:105},(_,i)=>{const z=lerp(rear+.06,front-.03,i/104),d=z-axle;return[z,Math.abs(d)<.565?wy+Math.sqrt(Math.max(0,.565**2-d*d)):.648];});
    const skirtTop=[...bottom].reverse().map(([z,y])=>[z,y+.005]);
    mappedPolygon(g,m.dark,[...skirtBottom,...skirtTop],(z,y)=>map(z,y,.004),[],side>0,2);
    const arc=Array.from({length:41},(_,i)=>{const a=lerp(.00,Math.PI,i/40);return map(axle+.552*Math.cos(a),wy+.552*Math.sin(a),.010);});curve(g,m.black,arc,.010);
    box(g,m.rubber,map(axle-.51,.436,-.03),[.029,.386,.333],.011).rotation.z=side*.04;
    if(side<0){
      aperture(g,m,door,(z,y)=>map(z,y,.002),{flip:false,glass:m.whiteShell,frame:.022});
      box(g,m.black,map(-1.305,1.857,.016),[.018,.129,.059],.009);
      box(g,m.chrome,map(-1.305,1.874,.027),[.009,.035,.034],.005);
      for(const y of [1.05,1.38,1.71,2.09])box(g,m.satinMetal,map(-.743,y,.009),[.020,.035,.048],.006);
      // The entry steps are folded up for travel, with real tread channels.
      box(g,m.dark,[-half-.021,.764,-1.03],[.072,.240,.52],.014);
      for(const z of [-1.23,-1.13,-1.03,-.93,-.83])box(g,m.satinMetal,[-half-.063,.779,z],[.012,.181,.022],.004);
    }else{
      for(const [z,y,ww,hh]of [[-.89,1.390,1.14,.51],[-2.57,1.330,.83,.47]]){
        const c=round([[z-ww/2,y-hh/2],[z-ww/2,y+hh/2],[z+ww/2,y+hh/2],[z+ww/2,y-hh/2]],.022,4);
        trimRing(g,m.dark,c,inset(c,.018),(zz,yy)=>map(zz,yy,.003),true);
        for(const zz of [z-ww*.36,z+ww*.36])box(g,m.black,map(zz,y+hh*.31,.009),[.017,.045,.027],.005);
      }
    }
    // Compartment hatch and service fillers differ from side to side.
    const h=round([[-3.09,1.063],[-3.09,1.506],[-2.30,1.506],[-2.30,1.063]],.021,4);
    trimRing(g,m.dark,h,inset(h,.016),(z,y)=>map(z,y,.004),side>0);
    for(const z of [-3.04,-2.35])box(g,m.black,map(z,1.423,.012),[.014,.066,.026],.004);
    for(const z of [-.38,.35])cylinder(g,m.black,map(z,1.484,.005),.017,.012,'x',16);
    const service=round([[-2.13,1.078],[-2.13,1.402],[-1.80,1.402],[-1.80,1.078]],.025,4);trimRing(g,m.whiteShell,service,inset(service,.07),(z,y)=>map(z,y,.009),side>0);
    cylinder(g,m.chrome,map(-1.855,1.122,.015),.008,.008,'x',10);
    box(g,m.amber,map(-3.233,.801,.012),[.020,.043,.082],.007);
    for(const z of [-2.99,-.48,.79])bolt(g,m.satinMetal,map(z,.803,.014),.006);
    // Front ladder/rack on driver side and two utility air tanks behind cab.
    if(side>0){
      for(const z of [.79,1.06])rod(g,m.black,[half+.012,1.25,z],[half+.012,2.65,z],.013);
      for(const y of [1.40,1.66,1.92,2.18,2.44])rod(g,m.black,[half+.012,y,.79],[half+.012,y,1.06],.011);
    }
  }
  // Molded end walls and roof returns close the shell around the side sheets.
  box(g,m.whiteShell,[0,1.725,rear+.014],[2.065,1.716,.034],.035);
  const pass=round([[-.51,1.18],[-.51,1.92],[.51,1.92],[.51,1.18]],.055,6);
  mappedPolygon(g,m.whiteShell,[[-1.03,.985],[-1.03,2.555],[1.03,2.555],[1.03,.985]],(x,y)=>[x,y,front-.012],[pass],false,4);
  trimRing(g,m.dark,pass,inset(pass,.08),(x,y)=>[x,y,front-.028]);
  box(g,m.interior,[0,.888,-1.15],[1.98,.056,4.18],.012);
  // The closed pop-top has an inset seam/gasket and a softly cambered cap,
  // not the tall fixed roof or raised fabric canopy of the FX/camping view.
  box(g,m.black,[0,2.625,-1.15],[2.084,.020,4.30],.035);
  box(g,m.whiteShell,[0,2.6825,-1.15],[2.1082,.125,4.322],.048);
  for(const side of [-1,1]){
    rod(g,m.whiteShell,[side*1.042,2.720,rear+.06],[side*1.042,2.720,front-.05],.013);
    for(const z of [-3.19,.875])box(g,m.dark,[side*1.05,2.554,z],[.028,.117,.060],.008);
  }
  // Five flush solar panels with bounded geometric cells, no photograph.
  for(let j=0;j<5;j++){
    const z=-2.83+j*.778;box(g,m.satinMetal,[0,2.752,z],[1.78,.012,.68],.010);box(g,m.solar,[0,2.762,z],[1.742,.008,.642],.005);
    for(let c=1;c<12;c++)box(g,m.solarGrid,[-.871+c*1.742/12,2.768,z],[.0017,.001,.636]);
    for(let r=1;r<4;r++)box(g,m.solarGrid,[0,2.768,z-.321+r*.642/4],[1.735,.001,.0017]);
  }
  // Rear utilities are asymmetric: storage box to vehicle left, covered
  // spare to vehicle right, paired upper brake/reverse/indicator lamps.
  const rearFace=rear-.026;
  box(g,m.whiteShell,[.497,1.380,rearFace-.105],[.833,.991,.206],.023);
  trimRing(g,m.dark,round([[.100,.960],[.100,1.808],[.894,1.808],[.894,.960]],.022,4),round([[.112,.973],[.112,1.795],[.882,1.795],[.882,.973]],.020,4),(x,y)=>[x,y,rearFace-.212],true);
  for(const x of [.17,.82])box(g,m.black,[x,1.055,rearFace-.222],[.035,.126,.018],.006);
  const spare=mesh(g,new T.CylinderGeometry(.493,.487,.377,80),m.rubber,[-.529,1.409,L.rearZ+.1885]);spare.rotation.x=Math.PI/2;spare.name='exp98-roof-down-covered-rear-spare';
  const cover=mesh(g,new T.CircleGeometry(.487,80),m.dark,[-.529,1.409,L.rearZ-.002]);cover.rotation.y=Math.PI;
  for(const x of [-.754,-.309])line(g,m.rubber,[[x,1.012,L.rearZ+.006],[x,1.80,L.rearZ+.006]],.006);
  const coverSeam=mesh(g,new T.TorusGeometry(.469,.003,6,72),m.black,[-.529,1.409,L.rearZ+.005]);coverSeam.rotation.y=Math.PI;
  box(g,m.dark,[-.529,1.004,rear-.196],[.148,.529,.102],.015);
  for(const s of [-1,1]){
    oval(g,m.reverse,s*.729,2.366,rearFace-.005,.186,.081);
    oval(g,m.red,s*.729,2.236,rearFace-.007,.186,.085);
    oval(g,m.amber,s*.729,2.104,rearFace-.009,.186,.085);
    box(g,m.black,[s*.806,.755,rearFace-.101],[.279,.092,.105],.015);
    box(g,m.red,[s*.826,.756,rearFace-.158],[.158,.056,.012],.005);
    box(g,m.amber,[s*.713,.756,rearFace-.159],[.060,.056,.012],.005);
  }
  box(g,m.black,[0,.686,rearFace-.123],[2.075,.164,.245],.025);
  box(g,m.satinMetal,[0,.609,rearFace-.173],[.207,.035,.247],.008);
  box(g,m.black,[0,.611,rearFace-.158],[.072,.066,.231],.006);
  for(const x of [-.32,.32]){const shackle=mesh(g,new T.TorusGeometry(.025,.007,8,24,Math.PI*1.8),m.satinMetal,[x,.650,rearFace-.266]);shackle.rotation.y=Math.PI;}
  box(g,m.black,[0,2.272,rearFace-.016],[.244,.112,.018],.012);label(g,m.satinMetal,'EXP',.15,.043,[0,2.256,rearFace-.029]).rotation.y=Math.PI;
  // Camper fittings seen through the genuine side apertures. No raised-roof
  // headroom is invented while the vehicle is in its driving configuration.
  box(g,m.headliner,[0,2.555,-1.15],[1.93,.028,4.13],.012);
  box(g,m.whiteShell,[.72,1.237,-1.955],[.47,.62,1.94],.026);
  box(g,m.wood,[.72,1.565,-1.955],[.54,.040,1.96],.017);
  box(g,m.glossBlack,[.72,1.590,-1.78],[.44,.012,.45],.011);
  for(const z of [-1.65,-1.90])cylinder(g,m.grille,[.72,1.600,z],.068,.005,'y',32);
  box(g,m.chrome,[.72,1.588,-2.485],[.35,.013,.35],.022);
  curve(g,m.chrome,[[.86,1.59,-2.58],[.86,1.78,-2.58],[.81,1.82,-2.58],[.73,1.78,-2.58]],.009);
  for(const s of [-1,1]){box(g,m.whiteShell,[s*.72,1.132,.30],[.46,.50,1.13],.025);box(g,m.upholstery,[s*.72,1.403,.30],[.46,.101,1.14],.028);box(g,m.upholstery,[s*.925,1.598,.30],[.09,.40,1.14],.025);}
  box(g,m.wood,[0,1.51,.20],[.53,.040,.82],.020);cylinder(g,m.chrome,[0,1.18,.20],.035,.60,'y',16);
  box(g,m.upholstery,[0,1.607,-2.94],[1.89,.12,.57],.030);
}

function underbody(view){
  const g=view.body,m=view.materials;
  for(const x of [-.43,.43]){box(g,m.dark,[x,.545,-.25],[.105,.21,5.63],.006);for(const z of [-2.9,-1.8,-.7,.4,1.5,2.2])box(g,m.satinMetal,[x,.445,z],[.14,.013,.048],.002);}
  for(const z of [-2.95,-2.15,-1.01,.1,1.12,2.16])box(g,m.dark,[0,.553,z],[.86,.077,.078],.005);
  box(g,m.satinMetal,[-.70,.575,-.25],[.48,.343,1.15],.065);box(g,m.dark,[.70,.585,-.25],[.45,.36,1.04],.035);
  for(const z of [-.66,.15])box(g,m.dark,[-.70,.574,z],[.49,.358,.032],.008);
  box(g,m.dark,[0,.644,1.61],[.63,.34,.65],.050);
  for(const x of [-.58,.58])cylinder(g,m.black,[x,.612,.70],.09,.37,'z',24);
  // Cab/house isolation blocks expose the kinetic mounting interface.
  for(const x of [-.63,.63])for(const z of [-2.9,-1.6,-.22,.78]){box(g,m.dark,[x,.765,z],[.15,.095,.23],.008);box(g,m.rubber,[x,.831,z],[.16,.036,.24],.008);}
}

/** Export adapter. Do not run generic bodyRefinement on this new style. */
export function buildEarthCruiser(spec=EARTHCRUISER_EXP_SPEC){
  const scene=new T.Scene(),root=new T.Group(),body=new T.Group(),materials=palette(spec.color);
  root.name='vehicle-chassis-earthcruiser-exp98';body.name='earthcruiser-exp98-original-body';scene.add(root);root.add(body);
  body.position.set(0,-spec.cgHeight,(.5-spec.frontWeightFraction)*spec.wheelbase);
  const view={spec,scene,root,body,materials,wheels:[],links:[],driveLinks:[],lamps:[],_wheel:VehicleView.prototype._wheel};
  for(let i=0;i<4;i++){const wheel=view._wheel();scene.add(wheel.root);view.wheels.push(wheel);}
  cab(view);house(view);underbody(view);
  // Batch by material only after openings, split body seams and trim are built.
  mergeStaticMeshes(body);
  root.userData.nativeConstruction={version:3,bodySurfaceRevision:14,automotiveFinishes:true,originalReferenceGeometry:true,sourceConfiguration:'2022 EXP98 single-cab Isuzu NPR GM6.6V8',cabOver:true,closedPopTop:true,asymmetricOverhangs:true,realWindowApertures:true,geometryLettering:true};
  root.userData.bodyRefinement={version:14,style:'earthcruiser',method:'Original unwarped formed cab-over and molded camper shell',preservedHardpoints:true};
  root.userData.visualModel={type:'Original primary-reference reconstruction; no OEM CAD',version:14,landmarks:EARTHCRUISER_EXP_LANDMARKS};
  root.userData.nativeFidelity={version:3,splitTireAndRim:true,factorySpokeProfile:'Method-style eight-window',bodyClearcoat:true,geometryLettering:true,matchingCoveredSpare:true,measuredManufacturerCAD:false};
  view.dispose=()=>{const gs=new Set(),ms=new Set();for(const group of [root,...view.wheels.map(w=>w.root)])group.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)for(const mat of Array.isArray(o.material)?o.material:[o.material])ms.add(mat);});view.wheels.forEach(w=>w.deformation?.dispose?.());gs.forEach(x=>x.dispose());ms.forEach(x=>x.dispose());scene.clear();};
  return view;
}

/** Use instead of refineVehicle: preserve the original cab and Method wheel. */
export function refineEarthCruiser(view,spec=view.spec){
  // Reuse the established native mud carcass/bead compensation, but replace
  // its generic rim with the EarthCruiser's separately authored truck rim.
  for(const wheel of view.wheels){refineFactoryWheel(wheel,{...spec,bodyStyle:'jeep'},view.materials);const old=new Set();wheel.rimSpin.traverse(o=>{if(o.geometry)old.add(o.geometry);});wheel.rimSpin.clear();old.forEach(x=>x.dispose());wheel.rimSpin.add(earthCruiserRim(spec));}
  for(const [key,mat]of Object.entries(view.materials)){if(!mat?.isMaterial)continue;mat.userData.nativeRole=key==='red'?'brake':key==='reverse'?'reverse':mat.userData.vehicleGlass?'glass':mat.userData.vehicleLampLens?'lens':['paint','whiteShell'].includes(key)?'paint':['rubber','tread'].includes(key)?'rubber':mat.userData.nativeRole||'';}
  Object.assign(view.root.userData.nativeFidelity,{upgradeTireBeads:true,formedCarcass:true,beveledTread:true});
  return{tire:view.wheels[0].tireShape,rim:view.wheels[0].rimSpin};
}
