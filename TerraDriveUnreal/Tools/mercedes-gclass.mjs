// Original, reference-built 2025 W465 / N465 coachwork. No manufacturer mesh.
// Metres: Y up, nose +Z; contact plane Y=0; axle midpoint Z=0.
// Sources, variant choices and estimated quantities: docs/mercedes-gclass-research.md.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {T,mesh,box,surface,mappedPolygon,line,lerp,smooth,clamp} from './body-surface.mjs';
import {nativeInterior} from './vehicle-cabin.mjs';
import {geometryText,refineFactoryWheel} from './vehicle-fidelity.mjs';

export const GCLASS_LANDMARKS=Object.freeze({
  wheelbase:2.890,frontAxleZ:1.445,rearAxleZ:-1.445,
  frontZ:2.249,rearBumperZ:-2.375,rearWallZ:-2.300,
  bareLength:4.624,g580LengthWithDesignBox:4.728,g63LengthWithSpare:4.873,
  g580Width:1.931,g63Width:1.984,widthWithMirrors:2.187,
  g580Height:1.986,g63Height:1.979,
  beltY:1.285,roofFrontZ:.465,roofRearZ:-2.245,
  windscreenBottomZ:.725,windscreenTopZ:.460,
  frontDoorRearZ:-.185,rearDoorRearZ:-1.185,
  rearGlassY:[1.365,1.845],tireRadius:.3915,
  notice:'Overall dimensions are sourced; panel stations and overhang distribution are original photo-based reconstruction, not OEM CAD.'
});

// Published SI mechanical values are separate from estimated simulator tuning.
export const GCLASS_REFERENCE_SPECS=Object.freeze({
  g580:{modelYear:2025,name:'Mercedes-Benz G 580 with EQ Technology',powerKW:432,torqueNm:1164,
    electric:true,electricMotors:4,batteryKWh:116,curbMassUSKG:3059.93,curbMassEUKG:3085,
    wheelbase:2.890,trackFront:1.638,trackRear:1.637,tireSize:'275/50R20',tireWidth:.275,tireRadius:.3915,
    lowRangeRatio:2,topSpeedMPH:112,frontSuspension:'independent double wishbone',rearSuspension:'De-Dion',
    differentialControl:'four individually controlled motors; virtual differential locks, no mechanical axle locker',
    simulated:{cgHeight:.73,frontWeightFraction:.50,suspensionTravel:.24,suspensionRestLength:.36,
      note:'CG, static axle distribution and wheel travel/rest length are calibration estimates, not published Mercedes measurements.'}},
  g63:{modelYear:2025,name:'Mercedes-AMG G 63',powerKW:430,torqueNm:850,electric:false,
    transientISGPowerKW:15,transientISGTorqueNm:200,curbMassUSKG:2649.88,curbMassEUKG:2640,
    wheelbase:2.890,trackFront:1.651,trackRear:1.656,tireSize:'275/50R20',tireWidth:.275,tireRadius:.3915,
    forwardRatios:[5.354,3.243,2.252,1.636,1.211,1,.865,.717,.601],reverseRatio:4.798,
    lowRangeRatio:2.93,frontTorqueFraction:.40,topSpeedMPH:137,
    frontSuspension:'independent double wishbone',rearSuspension:'live rear axle, coil springs',
    differentialControl:'selectable mechanical center, rear and front locks',
    simulated:{cgHeight:.80,frontWeightFraction:.54,suspensionTravel:.22,suspensionRestLength:.34,
      note:'CG, static axle distribution and wheel travel/rest length are calibration estimates. Do not add ISG torque continuously to peak V8 torque.'}}
});

const isEV=spec=>spec.bodyStyle==='g580'||/g[-_ ]?580/i.test(spec.id||spec.name||'');
function named(object,name){object.name=name;return object;}
function finish(mat,role,owner){mat.userData.automotive=role==='lens'?'':role;mat.userData.automotiveOwner=owner;return mat;}
function circle(cx,cy,r,n=64){return Array.from({length:n},(_,i)=>{const a=i*2*Math.PI/n;return[cx+Math.cos(a)*r,cy+Math.sin(a)*r];});}
function rounded(points,r=.025,n=6){
  return points.flatMap((p,i)=>{
    const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],la=Math.hypot(a[0]-p[0],a[1]-p[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]),rr=Math.min(r,la*.24,lb*.24);
    const q=p.map((v,k)=>v+(a[k]-v)*rr/la),s=p.map((v,k)=>v+(b[k]-v)*rr/lb);
    return Array.from({length:n+1},(_,j)=>{const t=j/n;return p.map((v,k)=>(1-t)**2*q[k]+2*(1-t)*t*v+t*t*s[k]);});
  });
}
function rect(a,b,c,d,r=.02){return rounded([[a,c],[b,c],[b,d],[a,d]],r);}
function inset(points,amount){const c=points.reduce((a,p)=>a.map((v,k)=>v+p[k]/points.length),[0,0]);return points.map(p=>p.map((v,k)=>lerp(c[k],v,amount)));}
function tube(g,mat,a,b,r=.004,n=10){
  const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av),o=mesh(g,new T.CylinderGeometry(r,r,delta.length(),n),mat,av.clone().add(bv).multiplyScalar(.5).toArray());
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o;
}
function disc(g,mat,p,r,d=.008,n=64){const o=mesh(g,new T.CylinderGeometry(r,r,d,n),mat,p);o.rotation.x=Math.PI/2;return o;}
function ring(g,mat,p,r,t=.003,n=64){return mesh(g,new T.TorusGeometry(r,t,6,n),mat,p);}
function badge(g,mat,p,r=.115,rear=false){
  const group=new T.Group();group.position.set(...p);if(rear)group.rotation.y=Math.PI;g.add(group);
  ring(group,mat,[0,0,0],r,.0035);
  for(let i=0;i<3;i++){
    const a=Math.PI/2+i*2*Math.PI/3,point=[Math.cos(a)*r*.97,Math.sin(a)*r*.97,.002];
    tube(group,mat,[0,0,.007],point,.008,8);
  }return group;
}
function perimeter(g,mat,contour,map,r=.0025){return line(g,mat,[...contour,contour[0]].map(p=>map(...p)),r);}
function glassOpening(g,glass,trim,contour,map,side){
  // Glass and its returns occupy genuine holes in the cab skin. No opaque
  // full-size backing sheet is allowed behind a window.
  const inner=inset(contour,.965),depth=.010;
  mappedPolygon(g,glass,inner,(u,v)=>{const p=map(u,v);p[0]-=side*depth;return p;},[],side>0,4);
  const strip=[];
  for(let i=0;i<contour.length;i++){
    const a=contour[i],b=contour[(i+1)%contour.length],c=inner[i],d=inner[(i+1)%contour.length];
    surface(g,trim,1,1,(u,v)=>{const q=[lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v)],p=map(...q);p[0]-=side*depth*v;return p;},side>0);
    strip.push(map(...a));
  }
  line(g,trim,[...strip,strip[0]],.0032);
}
function endWindow(g,glass,trim,contour,map,flip=false){
  const inner=inset(contour,.976);
  mappedPolygon(g,trim,contour,map,[inner],flip,3);
  mappedPolygon(g,glass,inner,map,[],flip,7);
  perimeter(g,trim,contour,map,.0032);
}
function headlight(g,m,x,y,z){
  const group=new T.Group();g.add(group);group.position.set(x,y,z);
  disc(group,m.black,[0,0,-.017],.151,.035);
  ring(group,m.satinMetal,[0,0,-.003],.145,.004);
  ring(group,m.drl,[0,0,.003],.130,.0065);
  disc(group,m.chrome,[0,.010,-.001],.058,.014);
  disc(group,m.optic,[0,.011,.009],.048,.010);
  // MULTIBEAM optics sit within the circular daytime signature.
  for(const sx of [-1,1])box(group,m.optic,[sx*.081,-.014,.001],[.024,.033,.015],.005);
  box(group,m.chrome,[0,-.074,0],[.087,.012,.014],.003);
  disc(group,m.lens,[0,0,.018],.139,.003);
  group.name='gclass-round-multibeam-headlight';
}

/** A complete native view, keeping the established wheel/export interfaces. */
export function gClassView(spec){
  // Construct only the established rig/material/wheel interface, then replace
  // its temporary native-independent donor coachwork with original G geometry.
  const view=new VehicleView(new T.Scene(),{...spec,bodyStyle:'jeep'});
  view.damageView?.dispose();view.damageView=null;
  const geometries=new Set();view.body.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});view.body.clear();geometries.forEach(g=>g.dispose());
  view.spec=spec;view.lamps=[];view.body.position.set(0,-spec.cgHeight,(.5-(spec.frontWeightFraction??.5))*spec.wheelbase);
  buildGClass(view,spec);
  return view;
}

/** Build into an empty VehicleView body; does not move physical hardpoints. */
export function buildGClass(view,spec=view.spec){
  const ev=isEV(spec),owner=ev?'g580':'g63',g=view.body,m=view.materials,height=ev?1.986:1.979;
  finish(m.paint,'paint',owner);m.paint.color.set(spec.color||(ev?'#557b91':'#536562'));m.paint.metalness=0;m.paint.roughness=.24;m.paint.clearcoat=1;
  const make=(name,config,role='plastic')=>m[name]=finish(new T.MeshPhysicalMaterial(config),role,owner);
  make('gTrim',{color:'#10161a',roughness:.45},'plastic');make('gSatin',{color:'#929a9d',metalness:.82,roughness:.35},'satinMetal');
  make('gBlackPanel',{color:'#080e12',roughness:.17,clearcoat:1,clearcoatRoughness:.12},'black');
  make('gGrille',{color:'#171d22',metalness:.43,roughness:.28},'black');make('gBlue',{color:'#207aa2',roughness:.30},'paint');
  make('gReflector',{color:'#8d101b',roughness:.18,clearcoat:.7},'lens');m.gReflector.userData.nativeRole='lens';
  make('drl',{color:'#ecf5ff',emissive:'#dcecff',emissiveIntensity:.65,roughness:.18},'lens');
  make('optic',{color:'#293c4a',metalness:.55,roughness:.10},'metal');
  const trim=m.gTrim,metal=m.gSatin,black=m.gBlackPanel,paint=m.paint;
  for(const [key,material]of Object.entries(m))if(material?.isMaterial){
    material.userData.nativeRole=key==='red'?'brake':key==='reverse'?'reverse':material.userData.vehicleGlass?'glass':material.userData.vehicleLampLens?'lens':key==='rubber'||key==='tread'?'rubber':key==='paint'?'paint':material.userData.nativeRole||'';
  }
  m.red.emissiveIntensity=.09;m.reverse.emissiveIntensity=0;
  m.interior.color.set('#151b1f');m.upholstery.color.set(ev?'#646b6b':'#282c30');m.headliner.color.set('#252a2d');
  for(const glass of [m.glass,m.windscreen,m.privacyGlass]){glass.roughness=.045;glass.color.set('#273c42');glass.opacity=glass===m.privacyGlass?.74:glass===m.windscreen?.36:.43;}
  const wy=spec.tireRadius,halfCab=.899,archRadius=wy+.058;
  const archLow=z=>Math.max(.465,...[-1.445,1.445].map(a=>Math.abs(z-a)<archRadius?wy+Math.sqrt(Math.max(0,archRadius**2-(z-a)**2)):.465));
  const bodyX=(y,z)=>halfCab-.008*Math.exp(-(((y-.88)/.27)**2))+.008*Math.exp(-(((y-1.235)/.060)**2))-.008*(Math.abs(z)/2.30)**12;
  const cabX=y=>halfCab-.043*smooth(y,1.285,1.947);
  const windows=[
    rounded([[-.145,1.333],[.651,1.333],[.410,1.860],[-.145,1.860]],.027),
    rect(-1.131,-.238,1.333,1.860,.029),
    rect(-2.159,-1.222,1.333,1.860,.032)
  ];
  for(const side of [-1,1]){
    named(surface(g,paint,192,22,(u,v)=>{const z=lerp(-2.287,2.145,u),y=lerp(archLow(z),1.285,v);return[side*bodyX(y,z),y,z];},side>0),'gclass-drawn-lower-door-sheet-'+side);
    const sideMap=(z,y)=>[side*cabX(y),y,z];
    named(mappedPolygon(g,paint,rounded([[-2.287,1.285],[-2.287,1.913],[-2.217,1.947],[.441,1.947],[.719,1.285]],.018),sideMap,windows,side>0,5),'gclass-cab-skin-with-three-open-windows-'+side);
    windows.forEach((w,i)=>glassOpening(g,i===0?m.glass:m.privacyGlass,trim,w,sideMap,side));
    // Door seams continue into separately modeled thin, straight pillars.
    for(const z of [-.190,-1.184]){
      const pts=rounded([[z,1.292],[z,.610],[z-.030,.540],[z-.090,.515]],.022);
      perimeter(g,trim,pts,(zz,y)=>[side*(bodyX(y,zz)+.002),y,zz],.0014);
    }
    for(const [zFront,zBack]of [[.713,-.185],[-.218,-1.185]]){
      const contour=rounded([[zFront,1.287],[zBack,1.287],[zBack,.56],[zBack+.07,.52],[zFront-.04,.52]],.028);
      perimeter(g,trim,contour,(z,y)=>[side*(bodyX(y,z)+.0012),y,z],.00125);
    }
    // Characteristic proud hinges and push-button pull handles.
    for(const z of [.646,-.252])for(const y of [.705,1.187]){
      box(g,paint,[side*.915,y,z],[.025,.055,.070],.006);
      const hinge=tube(g,metal,[side*.934,y-.032,z],[side*.934,y+.032,z],.009,12);hinge.name='gclass-exposed-door-hinge';
    }
    for(const z of [-.017,-1.023]){
      box(g,trim,[side*.913,1.185,z],[.023,.037,.167],.009);
      box(g,black,[side*.934,1.186,z],[.024,.030,.132],.008);
      const button=disc(g,metal,[side*.950,1.188,z+.060],.007,.005,12);button.rotation.set(0,0,Math.PI/2);
    }
    // A full-length protective band, with clear seams at both doors.
    for(const [za,zb]of [[-2.25,-1.191],[-1.171,-.208],[-.181,.697],[.728,2.05]]){
      box(g,trim,[side*.918,1.080,(za+zb)/2],[.025,.049,zb-za],.007);
      box(g,ev?m.gBlue:metal,[side*.932,1.083,(za+zb)/2],[.003,.009,Math.max(.02,zb-za-.028)],.001);
    }
    // Rain gutters follow the straight roof flange and the upright D pillar.
    line(g,paint,[[side*.878,1.913,.466],[side*.887,1.931,.38],[side*.887,1.931,-2.20],[side*.884,1.89,-2.269]],.010);
    line(g,trim,[[side*.884,1.917,.46],[side*.893,1.925,-2.20]],.0024);
    // Mirror stalks, rounded housings and actual reflective faces.
    tube(g,trim,[side*.906,1.373,.579],[side*1.016,1.407,.529],.023,12);
    box(g,paint,[side*1.032,1.426,.498],[.123,.133,.230],.034);
    box(g,m.chrome,[side*1.094,1.426,.503],[.004,.096,.167],.022);
    box(g,m.drl,[side*1.038,1.408,.615],[.107,.009,.009],.003);
    // Wing-top indicators retain the G's recognizable separate raised pods.
    box(g,black,[side*.812,1.397,1.969],[.178,.039,.125],.015);
    box(g,m.amber,[side*.813,1.421,1.972],[.156,.027,.108],.012);
    for(let i=0;i<6;i++)box(g,m.chrome,[side*(.751+i*.024),1.422,2.027],[.002,.018,.002],.0005);
    // Squared, projecting wheel-arch extensions with formed upper corners.
    for(const axle of [-1.445,1.445]){
      const outer=ev?.9655:.992,lip=.030;
      named(surface(g,paint,64,5,(u,v)=>{
        const a=u*Math.PI,z=axle+Math.cos(a)*(archRadius+.027+.030*v),y=wy+Math.sin(a)**.72*(archRadius+.008+.055*v);
        return[side*lerp(.904,outer,v),y,z];
      },side>0),'gclass-box-shouldered-fender-'+side+'-'+axle);
      surface(g,trim,64,2,(u,v)=>{const a=u*Math.PI;return[side*(outer+.001),wy+Math.sin(a)**.72*(archRadius+.012-lip*v),axle+Math.cos(a)*(archRadius+.030-lip*v)];},side<0);
      for(const dz of [-1,1])box(g,paint,[side*(outer-.018),.455,axle+dz*(archRadius+.038)],[.084,.125,.055],.010);
      // Inner return is dark and does not fill the wheel opening.
      surface(g,trim,64,2,(u,v)=>{const a=u*Math.PI;return[side*lerp(.735,.912,v),wy+Math.sin(a)*(archRadius+.002),axle+Math.cos(a)*(archRadius+.002)];},side>0);
    }
    box(g,trim,[side*.946,.427,-.08],[.115,.068,2.005],.015);
    box(g,metal,[side*.965,.467,-.08],[.145,.018,1.957],.006);
    for(let i=0;i<5;i++)box(g,trim,[side*(.925+i*.023),.478,-.08],[.007,.003,1.883],.001);
    if(!ev){
      for(const z of [-.963,-1.077]){
        const tail=mesh(g,new T.CylinderGeometry(.037,.037,.19,24,true),metal,[side*1.00,.414,z]);tail.rotation.z=Math.PI/2;tail.name='amg-functional-side-exhaust-tip';
        const inner=mesh(g,new T.CylinderGeometry(.029,.029,.006,24),trim,[side*1.095,.414,z]);inner.rotation.z=Math.PI/2;
      }
      const label=geometryText(g,'V8 BITURBO',.194,.020,metal);label.position.set(side*.921,1.175,1.001);label.rotation.y=side*Math.PI/2;
    }
  }
  // Bonnet with separate shoulders, clamshell seam and restrained pressed ribs.
  const hoodY=(x,z)=>1.332+(ev?.035:0)+.024*(1-(x/.756)**2)+.020*Math.exp(-(((Math.abs(x)-.385)/.075)**2))*smooth(z,.81,1.12)*(1-smooth(z,1.91,2.12))-.021*smooth(z,2.04,2.15);
  named(surface(g,paint,64,48,(u,v)=>{const z=lerp(.737,2.145,v),x=lerp(-.758,.758,u);return[x,hoodY(x,z),z];},true),'gclass-sculpted-clamshell-bonnet');
  for(const side of [-1,1]){
    surface(g,paint,48,8,(u,v)=>{const z=lerp(.737,2.145,u);return[side*lerp(.758,.895,v),lerp(hoodY(side*.758,z),1.280,v),z];},side>0);
    line(g,trim,Array.from({length:65},(_,i)=>{const z=lerp(.746,2.14,i/64);return[side*.759,hoodY(.759,z)+.001,z];}),.0015);
  }
  // Cowl and upright windshield share straight side boundaries.
  box(g,paint,[0,1.321,.703],[1.785,.062,.115],.014);
  const windshield=rounded([[-.824,1.345],[.824,1.345],[.797,1.897],[-.797,1.897]],.025),windMap=(x,y)=>[x,y,lerp(.727,.458,(y-1.345)/.552)+.006*(1-(x/.824)**2)];
  const windOuter=rounded([[-.890,1.286],[.890,1.286],[.858,1.947],[-.858,1.947]],.022);
  mappedPolygon(g,paint,windOuter,windMap,[windshield],false,5);endWindow(g,m.windscreen,trim,windshield,windMap);
  for(const side of [-1,1]){
    const a=[side*.80,1.354,.737],b=[side*.778,1.891,.467];line(g,trim,[a,b],.006);
    tube(g,black,[side*.334,1.323,.772],[side*.502,1.444,.678],.005);
    tube(g,trim,[side*.236,1.426,.686],[side*.685,1.447,.677],.007);
  }
  // A shallow crowned metal roof, real sunroof opening, and rear aero lip.
  const roofContour=rect(-.874,.874,-2.257,.471,.055),sunroof=rect(-.520,.520,-.50,.274,.035),roofMap=(x,z)=>[x,height-.018+.018*(1-(x/.874)**4)*(1-.10*((z+.9)/1.4)**2),z];
  mappedPolygon(g,paint,roofContour,roofMap,[sunroof],true,7);
  for(let i=0;i<roofContour.length;i++){
    const a=roofContour[i],b=roofContour[(i+1)%roofContour.length];
    surface(g,paint,1,2,(u,v)=>{const p=roofMap(lerp(a[0],b[0],u),lerp(a[1],b[1],u));p[1]=lerp(p[1],1.919,v);return p;});
  }
  const roofInner=inset(sunroof,.973);mappedPolygon(g,trim,sunroof,roofMap,[roofInner],true,3);mappedPolygon(g,m.privacyGlass,roofInner,roofMap,[],true,5);
  perimeter(g,trim,sunroof,roofMap,.0025);
  box(g,paint,[0,height-.025,-2.221],[1.74,.044,.118],.018);
  // Front outer ring has real circular lamp and grille apertures.
  const frontMap=(x,y)=>[x,y,2.143-.021*(Math.abs(x)/.91)**4],lampHoles=[circle(-.709,1.189,.153),circle(.709,1.189,.153)],grille=rect(-.539,.539,1.015,1.365,.039);
  mappedPolygon(g,paint,rect(-.899,.899,.948,1.398,.025),frontMap,[...lampHoles,grille],false,5);
  for(const x of [-.709,.709])headlight(g,m,x,1.189,2.151);
  box(g,black,[0,1.190,2.100],[1.076,.344,.040],.029);
  if(ev){
    // Optional factory Black Panel / LED surround, selected deliberately.
    const outline=rect(-.865,.865,.991,1.390,.105);
    perimeter(g,m.drl,outline,(x,y)=>[x,y,frontMap(x,y)[2]+.008],.0048);
    for(const y of [1.105,1.271])box(g,metal,[0,y,2.142],[.983,.019,.015],.005);
  }else{
    for(let i=0;i<13;i++)box(g,metal,[(i-6)*.079,1.190,2.143],[.011,.294,.032],.004);
    box(g,trim,[0,1.190,2.158],[.266,.267,.012],.050);
  }
  badge(g,m.chrome,[0,1.19,2.174],.112);
  const crest=disc(g,m.chrome,[0,1.361,2.047],.018,.002,24);crest.rotation.x=0;
  // Closed formed bumper around genuine recessed lower openings.
  const lowerOuter=rounded([[-.940,.470],[.940,.470],[.958,.799],[.875,.925],[-.875,.925],[-.958,.799]],.038);
  const lowerHoles=ev?[rect(-.488,.488,.596,.746,.017),rect(-.820,-.650,.601,.758,.028),rect(.650,.820,.601,.758,.028)]:[rect(-.472,.472,.555,.747,.020),rect(-.839,-.551,.567,.819,.025),rect(.551,.839,.567,.819,.025)];
  const bumperMap=(x,y)=>[x,y,2.249-.065*(Math.abs(x)/.96)**3-.036*smooth(y,.77,.93)];
  mappedPolygon(g,paint,lowerOuter,bumperMap,lowerHoles,false,5);
  box(g,black,[0,.940,2.130],[1.788,.036,.096],.006);
  for(const opening of lowerHoles){
    const inner=inset(opening,.88);mappedPolygon(g,trim,inner,(x,y)=>{const p=bumperMap(x,y);p[2]-=.080;return p;},[],false,3);
    for(let i=0;i<opening.length;i++){
      const a=opening[i],b=opening[(i+1)%opening.length];surface(g,black,1,3,(u,v)=>{const p=bumperMap(lerp(a[0],b[0],u),lerp(a[1],b[1],u));p[2]-=.080*v;return p;});
    }
    perimeter(g,black,opening,bumperMap,.005);
  }
  for(const x of [-.740,.740])for(let i=0;i<(ev?2:3);i++)box(g,black,[x+(i-(ev?.5:1))*.075,.689,2.207],[.012,.194,.035],.003);
  for(let i=0;i<4;i++)box(g,trim,[0,.585+i*.042,2.191],[.91,.009,.023],.002);
  box(g,metal,[0,.504,2.183],[1.20,.065,.104],.012);box(g,trim,[0,.832,2.227],[.47,.103,.022],.010);
  const plate=geometryText(g,ev?'G 580':'AMG G 63',.317,.034,metal);plate.position.set(0,.817,2.241);
  for(const x of [-.606,0,.606])disc(g,trim,[x,.521,bumperMap(x,.521)[2]+.002],.009,.002,16);
  // Rear side-hinged door and glass; low-mounted lamps are a key distinction
  // from the tall lamps on the existing Bronco and HUMMER reconstructions.
  const rearMap=(x,y)=>[x,y,-2.300+.015*(Math.abs(x)/.90)**4],rearOpening=rect(-.725,.725,1.354,1.849,.031),rearOutline=rect(-.896,.896,.515,1.924,.032);
  mappedPolygon(g,paint,rearOutline,rearMap,[rearOpening],true,6);endWindow(g,m.privacyGlass,trim,rearOpening,rearMap,true);
  // Close the real rear header beneath the existing roof lip. The old rear
  // sheet stopped below, and 2 cm behind, that lip, leaving a visible slit.
  // Reuse its complete rounded upper boundary: the new sheet shares edges
  // without overlaying the door, glazing, or the original roof surfaces.
  const headerY=height-.030,headerBoundary=rearOutline.slice(14);
  const headerBottom=x=>{
    for(let i=1;i<headerBoundary.length;i++){
      const a=headerBoundary[i-1],b=headerBoundary[i];
      if(x<=a[0]&&x>=b[0])return lerp(a[1],b[1],(a[0]-x)/(a[0]-b[0]));
    }
    return headerBoundary[x>0?0:headerBoundary.length-1][1];
  };
  // A regular width grid resolves the same quartic rear plane as the door.
  // A fan across the long, narrow strip visibly faceted its shallow crown.
  named(surface(g,paint,128,4,(u,v)=>{
    const x=lerp(-.896,.896,u),top=lerp(headerY,1.924,clamp((Math.abs(x)-.870)/.026,0,1));
    return rearMap(x,lerp(headerBottom(x),top,v));
  },true),'gclass-rear-roof-header-closure');
  // The top web and end returns terminate inside the existing formed lip;
  // their faces are not coplanar with its exterior and do not move its shape.
  named(surface(g,paint,32,3,(u,v)=>{const x=lerp(-.870,.870,u);return[x,headerY,lerp(rearMap(x,headerY)[2],-2.247,v)];},true),'gclass-rear-roof-header-top-web');
  for(const side of [-1,1])named(surface(g,paint,3,2,(u,v)=>[side*.870,lerp(1.919,headerY,v),lerp(rearMap(side*.870,headerY)[2],-2.247,u)],side>0),'gclass-rear-roof-header-return-'+side);
  for(let i=0;i<8;i++)line(g,metal,[rearMap(-.70,1.405+i*.052).map((n,k)=>k===2?n-.001:n),rearMap(.70,1.405+i*.052).map((n,k)=>k===2?n-.001:n)],.0006);
  perimeter(g,trim,rect(-.782,.782,.535,1.910,.025),(x,y)=>[x,y,rearMap(x,y)[2]-.002],.0015);
  for(const y of [.744,1.373])box(g,paint,[.816,y,-2.319],[.077,.085,.029],.008);
  box(g,black,[-.724,1.210,-2.329],[.044,.145,.035],.011);
  box(g,trim,[0,.462,-2.310],[1.813,.174,.129],.021);box(g,paint,[0,.570,-2.302],[1.830,.112,.132],.022);
  box(g,metal,[0,.409,-2.317],[1.167,.060,.097],.012);
  for(const side of [-1,1]){
    box(g,black,[side*.689,.765,-2.329],[.303,.108,.023],.019);
    box(g,m.red,[side*.689,.770,-2.344],[.274,.075,.009],.014);
    box(g,m.reverse,[side*.689,.746,-2.350],[.146,.018,.007],.004);
    box(g,trim,[side*.689,.770,-2.351],[.208,.031,.004],.006);
    box(g,m.gReflector,[side*.741,.482,-2.372],[.108,.021,.004],.004);
  }
  box(g,m.red,[0,1.896,-2.323],[.285,.018,.014],.004);
  if(ev){
    named(box(g,paint,[0,1.207,-2.3675],[.785,.759,.188],.061),'g580-rear-design-box');
    box(g,black,[0,1.211,-2.4625],[.705,.668,.010],.050);
    perimeter(g,metal,rect(-.335,.335,.899,1.523,.049),(x,y)=>[x,y,-2.4695],.0023);
    badge(g,m.chrome,[0,1.219,-2.4745],.108,true);
    box(g,black,[.004,1.570,-2.4485],[.151,.039,.042],.010);
    // Closed charging door on the rear passenger-side quarter; connector
    // internals are not exposed or represented as a permanently open flap.
    const charge=rect(-2.048,-1.852,.996,1.202,.024);
    perimeter(g,trim,charge,(z,y)=>[-bodyX(y,z)-.0015,y,z],.0012);
    const label=geometryText(g,'G 580',.180,.030,metal);label.position.set(.486,1.153,-2.324);label.rotation.y=Math.PI;
  }else{
    const cover=new T.Group();cover.position.set(0,1.218,-2.4775);g.add(cover);
    disc(cover,m.chrome,[0,0,0],.397,.250,96);disc(cover,paint,[0,0,-.128],.370,.009,96);
    ring(cover,m.chrome,[0,0,-.136],.374,.008,96);badge(cover,m.chrome,[0,0,-.143],.141,true);
    cover.name='g63-covered-factory-spare';
    const amg=geometryText(g,'AMG',.136,.029,metal);amg.position.set(.56,1.128,-2.325);amg.rotation.y=Math.PI;
    const label=geometryText(g,'G 63',.151,.030,metal);label.position.set(-.49,1.128,-2.325);label.rotation.y=Math.PI;
    perimeter(g,trim,rect(-2.048,-1.852,.996,1.202,.024),(z,y)=>[-bodyX(y,z)-.0015,y,z],.0012);
  }
  const rearPlate=box(g,trim,[0,.659,-2.333],[.405,.101,.014],.009);rearPlate.name='gclass-rear-license-recess';
  // Five-seat cabin, square dashboard and paired screens. The original mesh
  // detail is bounded and remains independent of any browser canvas font.
  nativeInterior.call(view,{frontZ:.095,rearZ:-.954,floor:.513,dashY:1.177,dashZ:.545,width:1.48,seatY:.751,roofY:1.910,rearSeatY:.758,dashboard:false,centerConsole:true,doorCards:true});
  box(g,m.interior,[0,1.135,.518],[1.575,.190,.291],.027);
  box(g,black,[.10,1.296,.451],[1.012,.239,.026],.018);
  for(const x of [-.132,.332])box(g,m.screen,[x,1.296,.432],[.427,.196,.004],.012);
  for(const x of [-.683,.672]){
    const vent=ring(g,metal,[x,1.175,.364],.060,.005);vent.rotation.x=.12;
    disc(g,trim,[x,1.175,.369],.055,.008,32);
    for(let i=-2;i<=2;i++)box(g,metal,[x+i*.016,1.175,.356],[.003,.086,.005],.001);
  }
  tube(g,metal,[-.665,1.082,.363],[-.215,1.082,.363],.017,12);
  for(const x of [-.664,-.216])tube(g,trim,[x,1.082,.363],[x,1.111,.456],.020,12);
  // Frame rails and flat EV shield avoid fictitious exhausts on the G580.
  for(const x of [-.611,.611])box(g,trim,[x,.386,-.063],[.081,.114,3.790],.007);
  for(const z of [-1.25,-.35,.80,1.40])box(g,trim,[0,.369,z],[1.244,.082,.065],.008);
  if(ev)box(g,trim,[0,.305,-.085],[1.507,.109,2.732],.014);
  else{box(g,trim,[0,.444,.890],[.520,.227,.920],.042);box(g,metal,[0,.341,.859],[.565,.045,.739],.009);}
  box(g,m.interior,[0,.522,-.580],[1.694,.071,2.604],.010);
  view.root.userData.visualModel={type:'Original photo/reference reconstruction, no imported manufacturer CAD',version:14,modelYear:2025,variant:owner,
    selectedEquipment:ev?'US20in AMG10spoke wheels, optional Black Panel/LED outline, Design Box':'US20in AMG5twinspoke wheels, stainless covered spare, side exhaust',
    dimensions:GCLASS_LANDMARKS,limitations:['photo-estimated panel curvature and interior','no production UV/normal bake or bespoke LOD authored here','native rendering requires integration verification']};
  view.root.userData.nativeConstruction={version:3,bodySurfaceRevision:14,straightPillars:true,realWindowOpenings:true,glazingReturns:true,formedBonnet:true,variantSpecificGrille:true,
    separateRearDesignBox:ev,coveredFactorySpare:!ev,amgSideExhaust:!ev,originalGeometry:true,importedManufacturerCAD:false};
  view.root.userData.bodyRefinement={version:14,variant:owner,windowOpenings:9,frontLampApertures:2,exposedDoorHinges:8};
  return view;
}

/** Factory20in designs on the established X-axis hub, with open spoke gaps. */
export function gClassRim(spec){
  const ev=isEV(spec),g=new T.Group(),r=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254*.5,w=spec.tireWidth;
  const dark=finish(new T.MeshPhysicalMaterial({color:'#171d21',metalness:.7,roughness:.25,clearcoat:.6}),'wheel',ev?'g580':'g63'),bright=finish(new T.MeshStandardMaterial({color:'#bbc2c4',metalness:.88,roughness:.25}),'metal',ev?'g580':'g63');
  const profile=[[r*.94,-w*.445],[r*.998,-w*.440],[r*1.006,-w*.402],[r*.965,-w*.361],[r*.915,-w*.310],[r*.883,-w*.09],[r*.883,w*.09],[r*.915,w*.31],[r*.965,w*.361],[r*1.006,w*.402],[r*.998,w*.440],[r*.94,w*.445],[r*.934,w*.379],[r*.877,w*.302],[r*.851,w*.075],[r*.851,-w*.075],[r*.877,-w*.302],[r*.934,-w*.379],[r*.94,-w*.445]];
  const barrel=named(mesh(g,new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),72),dark),'gclass-closed-drop-centre-barrel');barrel.rotation.z=Math.PI/2;
  // The closed profile repeats its first point. Rebuild the final seam's
  // generated normals, as the established factory barrel does, so every
  // inner/outer wall normal is unit length instead of the lathe endpoint sum.
  barrel.geometry.computeVertexNormals();
  for(const side of [-1,1]){
    const face=side*w*.43;
    const faceRing=mesh(g,new T.TorusGeometry(r*.983,.0045,6,72),bright,[face,0,0]);faceRing.rotation.y=Math.PI/2;
    const count=ev?10:5;
    for(let i=0;i<count;i++)for(const branch of ev?[0]:[-1,1]){
      const angle=i*2*Math.PI/count,positions=[],indices=[],steps=8;
      for(let j=0;j<=steps;j++){
        const t=j/steps,rad=r*lerp(.23,.958,t),offset=branch*r*.116*t,half=r*(ev?.062:.037)*(1-.20*t),dish=side*(.012+.028*Math.sin(t*Math.PI*.65));
        for(const [across,depth]of [[-1,0],[1,0],[1,-.021],[-1,-.021]])positions.push(face+dish+side*depth,Math.cos(angle)*rad-Math.sin(angle)*(offset+across*half),Math.sin(angle)*rad+Math.cos(angle)*(offset+across*half));
      }
      for(let j=0;j<steps;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4,c=a+4,d=b+4;indices.push(a,c,b,b,c,d);}
      indices.push(0,1,2,0,2,3,steps*4,steps*4+2,steps*4+1,steps*4,steps*4+3,steps*4+2);
      if(side<0)for(let n=0;n<indices.length;n+=3)[indices[n+1],indices[n+2]]=[indices[n+2],indices[n+1]];
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();named(mesh(g,geo,dark),'gclass-'+(ev?'ten':'five-twin')+'-spoke');
      // Thin machined leading edge is restrained, rather than a solid silver disc.
      tube(g,bright,[face+side*.030,Math.cos(angle)*r*.36-Math.sin(angle)*(branch*r*.04-r*.025),Math.sin(angle)*r*.36+Math.cos(angle)*(branch*r*.04-r*.025)],[face+side*.028,Math.cos(angle)*r*.93-Math.sin(angle)*(branch*r*.108-r*.020),Math.sin(angle)*r*.93+Math.cos(angle)*(branch*r*.108-r*.020)],.0030,6);
    }
    const cap=mesh(g,new T.CylinderGeometry(r*.225,r*.225,.021,48),dark,[face+side*.026,0,0]);cap.rotation.z=Math.PI/2;
    const em=new T.Group();em.position.set(face+side*.039,0,0);em.rotation.y=side*Math.PI/2;g.add(em);badge(em,bright,[0,0,0],r*.135);
    for(let i=0;i<5;i++){
      const a=i*2*Math.PI/5,bolt=mesh(g,new T.CylinderGeometry(.0075,.0085,.013,6),bright,[face+side*.035,Math.cos(a)*r*.276,Math.sin(a)*r*.276]);bolt.rotation.z=Math.PI/2;
    }
  }g.name=ev?'g580-amg20-ten-spoke-rim':'g63-amg20-five-twin-spoke-rim';return g;
}

/** Use instead of generic refineVehicle, which assumes an older body roster. */
export function refineGClass(view,spec){
  for(const wheel of view.wheels){
    refineFactoryWheel(wheel,spec,view.materials);
    const discarded=new Set();wheel.rimSpin.traverse(o=>{if(o.geometry)discarded.add(o.geometry);});wheel.rimSpin.clear();discarded.forEach(geometry=>geometry.dispose());wheel.rimSpin.add(gClassRim(spec));
    wheel.root.userData.factoryWheelRevision=14;
  }
  view.root.userData.nativeFidelity={version:3,bodySurfaceRevision:14,splitTireAndRim:true,factorySpokeProfile:isEV(spec)?'g580-20-10spoke':'g63-20-5twinspoke',formedCarcass:true,beveledTread:true,coveredSpare:!isEV(spec),rearDesignBox:isEV(spec),geometryLettering:true,bodyClearcoat:true};
  return{tire:view.wheels[0].tireShape,rim:view.wheels[0].rimSpin};
}
