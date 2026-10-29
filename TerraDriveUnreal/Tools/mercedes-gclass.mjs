// Original, reference-built 2025 W465 / N465 coachwork. No manufacturer mesh.
// Metres: Y up, nose +Z; contact plane Y=0; axle midpoint Z=0.
// Sources, variant choices and estimated quantities: docs/mercedes-gclass-research.md.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {T,mesh,box,surface,mappedPolygon,line,lerp,smooth,clamp,station} from './body-surface.mjs';
import {nativeInterior} from './vehicle-cabin.mjs';
import {geometryText,refineFactoryWheel} from './vehicle-fidelity.mjs';

export const GCLASS_LANDMARKS=Object.freeze({
  wheelbase:2.890,frontAxleZ:1.445,rearAxleZ:-1.445,
  frontZ:2.332,rearBumperZ:-2.292,rearWallZ:-2.217,
  bareLength:4.624,g580LengthWithDesignBox:4.728,g63LengthWithSpare:4.873,
  g580Width:1.931,g63Width:1.984,widthWithMirrors:2.187,
  g580Height:1.986,g63Height:1.979,
  beltY:1.185,roofFrontZ:.465,roofRearZ:-2.163,
  windscreenBottomZ:.725,windscreenTopZ:.460,
  frontDoorRearZ:-.270,rearDoorRearZ:-1.150,
  sideGlassWidths:[.870,.707,.772],sideGlassBottomY:1.270,sideGlassTopY:1.785,
  rearGlassY:[1.365,1.845],tireRadius:.3915,
  // Raster measurements of the manufacturer's March 2025 brochure p84 front
  // drawing, scaled by its explicit 1.979 m height; estimates, not CAD sizes.
  headlampDiameter:.218,headlampSpacing:1.270,headlampCenterY:.909,grilleOpeningWidth:.876,
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
    wheelbase:2.890,trackFront:1.651,trackRear:1.656,tireSize:'295/40R22',tireWidth:.295,tireRadius:.3974,
    forwardRatios:[5.354,3.243,2.252,1.636,1.211,1,.865,.717,.601],reverseRatio:4.798,
    lowRangeRatio:2.93,frontTorqueFraction:.40,topSpeedMPH:137,
    frontSuspension:'independent double wishbone',rearSuspension:'live rear axle, coil springs',
    differentialControl:'selectable mechanical center, rear and front locks',
    simulated:{cgHeight:.80,frontWeightFraction:.54,suspensionTravel:.22,suspensionRestLength:.34,
      note:'CG, static axle distribution and wheel travel/rest length are calibration estimates. Do not add ISG torque continuously to peak V8 torque.'}}
});

const isEV=spec=>spec.bodyStyle==='g580'||/g[-_ ]?580/i.test(spec.id||spec.name||'');
function named(object,name){object.name=name;return object;}
function rigid(object){object.userData.gClassRigidDetail=true;return object;}
function rigidRange(g,start,centre,name){
  const group=rigid(new T.Group());group.position.set(...centre);group.name=name;
  for(const o of g.children.slice(start)){g.remove(o);o.position.sub(group.position);group.add(o);}g.add(group);return group;
}
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
// Circular tangent fillets for the real glazing holes, rather than small
// quadratic corner chamfers. The pane, seal and metal opening share a curve.
function glazingContour(points,r=.075,n=12){
  return points.flatMap((p,i)=>{
    const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
    const la=Math.hypot(a[0]-p[0],a[1]-p[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]);
    const u=a.map((x,k)=>(x-p[k])/la),v=b.map((x,k)=>(x-p[k])/lb),angle=Math.acos(clamp(u[0]*v[0]+u[1]*v[1],-.999999,.999999));
    const distance=Math.min(r/Math.tan(angle/2),la*.24,lb*.24),radius=distance*Math.tan(angle/2);
    const bisector=u.map((x,k)=>x+v[k]),length=Math.hypot(...bisector),centre=p.map((x,k)=>x+bisector[k]/length*radius/Math.sin(angle/2));
    const q=p.map((x,k)=>x+u[k]*distance),s=p.map((x,k)=>x+v[k]*distance),first=Math.atan2(q[1]-centre[1],q[0]-centre[0]);
    const sweep=Math.atan2((q[0]-centre[0])*(s[1]-centre[1])-(q[1]-centre[1])*(s[0]-centre[0]),(q[0]-centre[0])*(s[0]-centre[0])+(q[1]-centre[1])*(s[1]-centre[1]));
    return Array.from({length:n+1},(_,j)=>[centre[0]+radius*Math.cos(first+sweep*j/n),centre[1]+radius*Math.sin(first+sweep*j/n)]);
  });
}
function inset(points,amount){const c=points.reduce((a,p)=>a.map((v,k)=>v+p[k]/points.length),[0,0]);return points.map(p=>p.map((v,k)=>lerp(c[k],v,amount)));}
function tube(g,mat,a,b,r=.004,n=10){
  const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av),o=mesh(g,new T.CylinderGeometry(r,r,delta.length(),n),mat,av.clone().add(bv).multiplyScalar(.5).toArray());
  o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o;
}
function disc(g,mat,p,r,d=.008,n=64){const o=rigid(mesh(g,new T.CylinderGeometry(r,r,d,n),mat,p));o.rotation.x=Math.PI/2;return o;}
function ring(g,mat,p,r,t=.003,n=64){return rigid(mesh(g,new T.TorusGeometry(r,t,6,n),mat,p));}
function badge(g,mat,p,r=.115,rear=false){
  const group=rigid(new T.Group());group.name='gclass-rigid-star-badge';group.position.set(...p);if(rear)group.rotation.y=Math.PI;g.add(group);
  ring(group,mat,[0,0,0],r,.0035);
  for(let i=0;i<3;i++){
    const a=Math.PI/2+i*2*Math.PI/3,point=[Math.cos(a)*r*.97,Math.sin(a)*r*.97,.002];
    tube(group,mat,[0,0,.007],point,.008,8);
  }return group;
}
function perimeter(g,mat,contour,map,r=.0025){return line(g,mat,[...contour,contour[0]].map(p=>map(...p)),r);}
function mappedJoint(g,mat,points,map,r,closed=true){
  // Sample the panel BEFORE mapping its depth. Connecting only the corner
  // points ran a straight chord from the tucked roof to the lower door,
  // hiding the middle of the shut line inside the painted body.
  const boundary=closed?[...points,points[0]]:points,vertices=[];
  for(let i=1;i<boundary.length;i++){
    const a=boundary[i-1],b=boundary[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.012));
    for(let j=0;j<steps;j++)vertices.push(new T.Vector3(...map(lerp(a[0],b[0],j/steps),lerp(a[1],b[1],j/steps))));
  }
  vertices.push(new T.Vector3(...map(...boundary.at(-1))));
  const path=new T.CurvePath();for(let i=1;i<vertices.length;i++)path.add(new T.LineCurve3(vertices[i-1],vertices[i]));
  return mesh(g,new T.TubeGeometry(path,Math.max(8,Math.ceil(path.getLength()/.016)),r,8,false),mat);
}
function glassOpening(g,glass,trim,contour,map,side){
  // Glass and its returns occupy genuine holes in the cab skin. No opaque
  // full-size backing sheet is allowed behind a window.
  const inner=inset(contour,.965),depth=.010;
  const pane=mappedPolygon(g,glass,inner,(u,v)=>{const p=map(u,v);p[0]-=side*depth;return p;},[],side>0,4);
  const strip=[];
  for(let i=0;i<contour.length;i++){
    const a=contour[i],b=contour[(i+1)%contour.length],c=inner[i],d=inner[(i+1)%contour.length];
    surface(g,trim,1,1,(u,v)=>{const q=[lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v)],p=map(...q);p[0]-=side*depth*v;return p;},side>0);
    strip.push(map(...a));
  }
  line(g,trim,[...strip,strip[0]],.0032);
  return pane;
}
function paintedGlazingReturn(g,paint,contour,map,side){
  const outer=inset(contour,1.035),group=named(new T.Group(),'gclass-radiused-painted-window-return');g.add(group);
  for(let i=0;i<contour.length;i++){
    const j=(i+1)%contour.length;
    surface(group,paint,2,4,(u,v)=>{
      const q=contour[i].map((x,k)=>lerp(lerp(outer[i][k],outer[j][k],u),lerp(x,contour[j][k],u),v)),p=map(...q);
      p[0]+=side*(.001+.0045*Math.sin(v*Math.PI));return p;
    },side>0);
  }
}
function endWindow(g,glass,trim,contour,map,flip=false){
  const inner=inset(contour,.976);
  mappedPolygon(g,trim,contour,map,[inner],flip,3);
  mappedPolygon(g,glass,inner,map,[],flip,7);
  perimeter(g,trim,contour,map,.0032);
}
function headlight(g,m,x,y,z){
  const group=rigid(new T.Group());g.add(group);group.position.set(x,y,z);
  // Uniformly resize the whole optical unit, including bezel/seals/lens, so
  // the independent circular components retain their relative shape/depth.
  group.scale.setScalar(GCLASS_LANDMARKS.headlampDiameter/.302);
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

// Contact-datum fit to the manufacturer's 2025 side drawing (brochure p84).
// Roof, ground and wheel centres remain fixed; the formerly high front sheet
// and glazing are lowered coherently, including lens/trim/cabin geometry.
// Axle-centred openings retain their original lower contours and clearance.
const SIDE_HEIGHTS=[[0,0],[.94,.94],[1.08,.995],[1.285,1.185],[1.342,1.270],[1.858,1.785],[1.947,1.947],[2.2,2.2]];
const WING_HEIGHTS=[[0,0],[.94,.94],[1.08,.980],[1.285,1.080],[1.342,1.160],[1.858,1.675],[1.947,1.947],[2.2,2.2]];
const NOSE_HEIGHTS=[[0,0],[.40,.34],[.47,.393],[.925,.730],[1.08,.804],[1.189,.880],[1.285,.965],[1.342,1.050],[1.858,1.565],[1.947,1.947],[2.2,2.2]];
export function gClassCoachworkPoint(x,y,z){
  const fittedY=y<=.94||y>=1.947?y:station(SIDE_HEIGHTS,y,1);
  const wingY=y<=.94||y>=1.947?y:station(WING_HEIGHTS,y,1),noseY=y<0||y>=1.947?y:station(NOSE_HEIGHTS,y,1);
  // Blending monotonic complete sections prevents a folded sheet between the
  // fixed wheel opening and lowered hood; all local vertical Jacobians stay
  // positive. The very front drops only beyond the tire's leading extent.
  const frontY=lerp(wingY,noseY,smooth(z,1.940,2.145));
  return[x,lerp(fittedY,frontY,smooth(z,.730,1.445)),z+.083*(smooth(z,1.445,2.249)+1-smooth(z,-2.30,-1.445))];
}
function coachworkSourceY(finalY,z){
  // The front section changes along Z. Author long panel joints in final
  // contact space, then invert only their Y coordinate before the common fit.
  let lo=0,hi=2.2;for(let i=0;i<27;i++){const mid=(lo+hi)/2;if(gClassCoachworkPoint(0,mid,z)[1]<finalY)lo=mid;else hi=mid;}return(lo+hi)/2;
}
function fitCoachworkToReference(g){
  g.updateWorldMatrix(true,true);const bodyInverse=g.matrixWorld.clone().invert(),h=.00001;
  const rigidParent=o=>{for(let p=o.parent;p&&p!==g;p=p.parent)if(p.userData.gClassRigidDetail)return true;return false;};
  const features=[];g.traverse(o=>{if(o.userData.gClassRigidDetail&&!rigidParent(o))features.push(o);});
  for(const o of features){
    const old=new T.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(bodyInverse),target=new T.Vector3(...gClassCoachworkPoint(...old.toArray()));
    target.applyMatrix4(g.matrixWorld).applyMatrix4(o.parent.matrixWorld.clone().invert());o.position.copy(target);
  }
  g.updateWorldMatrix(true,true);
  g.traverse(o=>{
    if(!o.isMesh||o.userData.gClassRigidDetail||o.userData.gClassReferenceSpace||rigidParent(o))return;
    const fittedPoint=o.userData.gClassLevelMolding?(x,y,z)=>{const q=gClassCoachworkPoint(x,y,z);q[1]=.995+(y-1.080)*.65;return q;}:gClassCoachworkPoint;
    const rel=bodyInverse.clone().multiply(o.matrixWorld),inv=rel.clone().invert(),toWorld=new T.Matrix3().getNormalMatrix(rel),toLocal=new T.Matrix3().setFromMatrix4(rel).transpose();
    const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,q=new T.Vector3(),normal=new T.Vector3();
    for(let i=0;i<p.count;i++){
      q.fromBufferAttribute(p,i).applyMatrix4(rel);normal.fromBufferAttribute(n,i).applyMatrix3(toWorld).normalize();
      const [x,y,z]=q.toArray(),a=fittedPoint(x,y-h,z),b=fittedPoint(x,y+h,z),c=fittedPoint(x,y,z-h),d=fittedPoint(x,y,z+h);
      const fy=(b[1]-a[1])/(2*h),fz=(d[1]-c[1])/(2*h),zz=(d[2]-c[2])/(2*h);
      // Inverse-transpose of the deformation Jacobian preserves smooth
      // analytic normals instead of recomputing large polygon-fan shading.
      normal.set(normal.x,normal.y/fy,(normal.z-fz*normal.y/fy)/zz).normalize().applyMatrix3(toLocal).normalize();
      q.set(...fittedPoint(x,y,z)).applyMatrix4(inv);p.setXYZ(i,q.x,q.y,q.z);n.setXYZ(i,normal.x,normal.y,normal.z);
    }
    p.needsUpdate=n.needsUpdate=true;o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
  });
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
  make('gIndicatorLens',{color:'#8b979a',roughness:.14,metalness:.12,clearcoat:1,clearcoatRoughness:.08},'lens');m.gIndicatorLens.userData.nativeRole='lens';
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
  // The press-side photograph and the manufacturer's orthographic drawing
  // show shallow drawn door pans, rounded shoulder breaks and turned-in end
  // corners. A single flat wall made the correctly sized chassis look long.
  const doorDraw=z=>smooth(Math.min(...[.693,-.270,-.309,-1.150].map(j=>Math.abs(z-j))),.006,.040);
  const bodyX=(y,z)=>halfCab+doorDraw(z)*(-.013*Math.exp(-(((y-.83)/.23)**2))+.010*Math.exp(-(((y-1.238)/.065)**2))
    -.011*(1-smooth(y,.47,.62)))-.027*(Math.abs(z)/2.30)**18;
  const jointStartZ=.737,jointEndZ=gClassCoachworkPoint(0,0,2.145)[2];
  const wingJointY=z=>lerp(1.200,1.045,clamp((gClassCoachworkPoint(0,0,z)[2]-jointStartZ)/(jointEndZ-jointStartZ),0,1));
  const wingTop=z=>z<=.730?1.285:coachworkSourceY(lerp(1.185,wingJointY(z)-.012,smooth(z,.730,.747)),z);
  const cabX=y=>halfCab-.043*smooth(y,1.285,1.947);
  const windows=[
    glazingContour([[-.221,1.342],[.649,1.342],[.408,1.858],[-.221,1.858]],.080),
    glazingContour([[-1.067,1.342],[-.360,1.342],[-.360,1.858],[-1.067,1.858]],.078),
    glazingContour([[-2.105,1.342],[-1.270,1.342],[-1.270,1.858],[-2.055,1.858]],.084)
  ];
  for(const side of [-1,1]){
    named(surface(g,paint,192,22,(u,v)=>{const z=lerp(-2.287,2.145,u),y=lerp(archLow(z),wingTop(z),v);return[side*bodyX(y,z),y,z];},side>0),'gclass-drawn-lower-door-sheet-'+side);
    const sideMap=(z,y)=>[side*cabX(y),y,z];
    named(mappedPolygon(g,paint,rounded([[-2.287,1.285],[-2.287,1.913],[-2.217,1.947],[.441,1.947],[.719,1.285]],.018),sideMap,windows,side>0,5),'gclass-cab-skin-with-three-open-windows-'+side);
    windows.forEach((w,i)=>{paintedGlazingReturn(g,paint,w,sideMap,side);named(glassOpening(g,i===0?m.glass:m.privacyGlass,trim,w,sideMap,side),'gclass-side-glass-'+side+'-'+i);});
    // One complete shut line per door. Closing a partial vertical stroke
    // used to draw a second, diagonal line back up the door. Author these in
    // the final contact datum so the lower sheet / cab join cannot kink them.
    const doors=[
      [[.423,1.917],[-.270,1.917],[-.270,.560],[-.222,.520],[.655,.520],[.693,.560],[.693,1.185]],
      [[-.309,1.917],[-1.150,1.917],[-1.150,.900],[-.925,.540],[-.895,.520],[-.353,.520],[-.309,.560]]
    ];
    doors.forEach((points,i)=>{
      const contour=rounded(points,.020,8),joint=mappedJoint(g,trim,contour,(z,y)=>{
        const sy=coachworkSourceY(y,z),x=y>=1.185?cabX(sy):bodyX(sy,z);
        return[side*(x+.0022),y,z];
      },.00135);
      joint.name='gclass-continuous-door-shut-line-'+side+'-'+i;
      joint.userData.gClassReferenceSpace=true;
    });
    // Characteristic proud hinges and push-button pull handles.
    for(const z of [.646,-.330])for(const y of [.705,1.187]){
      box(g,paint,[side*.915,y,z],[.025,.055,.070],.006);
      const hinge=tube(g,metal,[side*.934,y-.032,z],[side*.934,y+.032,z],.009,12);hinge.name='gclass-exposed-door-hinge';
    }
    for(const z of [-.095,-.989]){
      const handleStart=g.children.length;
      box(g,trim,[side*.913,1.185,z],[.023,.037,.167],.009);
      box(g,black,[side*.934,1.186,z],[.024,.030,.132],.008);
      const button=disc(g,metal,[side*.950,1.188,z+.060],.007,.005,12);button.rotation.set(0,0,Math.PI/2);
      rigidRange(g,handleStart,[side*.930,1.186,z],'gclass-rigid-door-handle');
    }
    // A full-length protective band, with clear seams at both doors.
    for(const [za,zb]of [[-2.25,-1.162],[-1.138,-.288],[-.258,.697],[.728,2.05]]){
      const band=box(g,trim,[side*.918,1.080,(za+zb)/2],[.025,.049,zb-za],.007),inlay=box(g,ev?m.gBlue:metal,[side*.932,1.083,(za+zb)/2],[.003,.009,Math.max(.02,zb-za-.028)],.001);
      band.userData.gClassLevelMolding=inlay.userData.gClassLevelMolding=true;
      band.name='gclass-level-protective-molding';inlay.name='gclass-level-molding-inlay';
    }
    // Rain gutters follow the straight roof flange and the upright D pillar.
    named(line(g,trim,[[side*.878,1.939,.442],[side*.882,1.943,.382],[side*.882,1.943,-2.20],[side*.881,1.920,-2.269]],.0045),'gclass-thin-roof-gutter-'+side);
    // Mirror stalks, rounded housings and actual reflective faces.
    const mirrorStart=g.children.length;
    tube(g,trim,[side*.906,1.373,.579],[side*1.016,1.407,.529],.023,12);
    box(g,paint,[side*1.032,1.426,.498],[.123,.133,.230],.034);
    box(g,m.chrome,[side*1.094,1.426,.503],[.004,.096,.167],.022);
    box(g,m.drl,[side*1.038,1.408,.615],[.107,.009,.009],.003);
    rigidRange(g,mirrorStart,[side*1.032,1.426,.498],'gclass-rigid-mirror');
    // Wing-top indicators retain the G's recognizable separate raised pods.
    const indicatorStart=g.children.length,indicatorY=coachworkSourceY(wingJointY(1.969)+.024,1.969);
    box(g,black,[side*.812,indicatorY,1.969],[.178,.032,.125],.013);
    named(box(g,m.gIndicatorLens,[side*.813,indicatorY+.022,1.972],[.156,.022,.108],.010),'gclass-neutral-wing-indicator-'+side);
    for(let i=0;i<6;i++)box(g,m.chrome,[side*(.751+i*.024),indicatorY+.023,2.027],[.002,.014,.002],.0005);
    rigidRange(g,indicatorStart,[side*.812,indicatorY,1.969],'gclass-seated-wing-indicator-'+side);
    // Wide horizontal arch shoulders and beveled diagonal ends, not round
    // semicircular bicycle mudguards. EV flares have a softer rolled crown.
    for(const axle of [-1.445,1.445]){
      const outer=ev?.9655:.992;
      const arch=(a,v)=>[axle+Math.cos(a)*(archRadius+.019+.071*v),wy+Math.sin(a)**lerp(.72,.48,v)*(archRadius+.005+.085*v)];
      // A broad outward-facing painted face, a separate upper return and a
      // dark inner wheelwell. The former single rising sheet faced inward
      // and reflected the ground across the visible flare like bare metal.
      named(surface(g,paint,64,5,(u,v)=>{
        const a=u*Math.PI,[z,y]=arch(a,v),crown=(ev?.006:.003)*(1-Math.sin(v*Math.PI));
        return[side*(outer-crown),y,z];
      },side<0),'gclass-box-shouldered-fender-'+side+'-'+axle);
      named(surface(g,paint,64,4,(u,v)=>{const a=u*Math.PI,[z,y]=arch(a,1);return[side*lerp(bodyX(y,z),outer,v),y+.006*Math.sin(v*Math.PI),z];},side>0),'gclass-fender-upper-return-'+side+'-'+axle);
      named(surface(g,paint,64,3,(u,v)=>{const a=u*Math.PI,[z,y]=arch(a,0);return[side*lerp(outer-.004,outer-.022,v),y-.010*v,z-Math.cos(a)*.008*v];},side>0),'gclass-folded-arch-edge-'+side+'-'+axle);
      for(const dz of [-1,1])box(g,paint,[side*(outer-.022),.434,axle+dz*(archRadius+.070)],[.055,.086,.043],.010);
      // Join the new shaped opening to the circular inner wheelwell. Its
      // normals face the tire cavity, independently of the painted face.
      named(surface(g,trim,64,4,(u,v)=>{
        const a=u*Math.PI,[zo,yo]=arch(a,0),zi=axle+Math.cos(a)*(archRadius+.002),yi=wy+Math.sin(a)*(archRadius+.002);
        return[side*lerp(.735,outer-.022,v),lerp(yi,yo-.010,v),lerp(zi,zo-Math.cos(a)*.008,v)];
      },side<0),'gclass-closed-inner-wheelwell-'+side+'-'+axle);
      if(ev&&axle<0){
        named(box(g,black,[side*.961,.726,-.938],[.012,.194,.033],.010),'g580-rear-arch-air-curtain-'+side);
        named(surface(g,paint,18,6,(u,v)=>{const y=lerp(.623,.833,u);return[side*lerp(.903,.966,Math.sin(v*Math.PI/2)),y,lerp(-.882,-.962,v)-.015*Math.sin(u*Math.PI)];},side>0),'g580-rounded-air-curtain-fairing-'+side);
      }
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
  // Raised compound bonnet: its centre swells aft, shoulders turn down into
  // the clamshell seam, and the nose rolls over instead of ending as a slab.
  // The EV uses the smoother, higher aerodynamic pressing; AMG keeps sharper
  // twin power ribs and a lower centre. These are actual surfaces, not lines.
  // The side drawing's 49-inch front-axle hood datum and front/three-quarter
  // press photos define a shallow continuous cap. The former pre-fit crown
  // became a broad trough with a steep raised lip after the nonlinear fit.
  const hoodStations=[[.737,1.290],[1.10,1.283],[1.445,1.254],[1.85,1.190],[2.145,1.125]];
  const hoodCentre=z=>{
    let i=0;while(i<hoodStations.length-2&&z>hoodStations[i+1][0])i++;
    const a=hoodStations[i],b=hoodStations[i+1],h=b[0]-a[0],t=clamp((z-a[0])/h,0,1);
    const slope=k=>k===0?(hoodStations[1][1]-hoodStations[0][1])/(hoodStations[1][0]-hoodStations[0][0]):k===hoodStations.length-1?(hoodStations[k][1]-hoodStations[k-1][1])/(hoodStations[k][0]-hoodStations[k-1][0]):(hoodStations[k+1][1]-hoodStations[k-1][1])/(hoodStations[k+1][0]-hoodStations[k-1][0]);
    return(2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*h*slope(i)+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*h*slope(i+1);
  };
  const hoodY=(x,z)=>{
    const ax=Math.abs(x),across=ax/.758,edge=wingJointY(z)+(ev?.045:.027);
    const rib=(ev?.0045:.010)*Math.exp(-(((ax-.397)/(ev?.125:.055))**2))*smooth(z,.80,1.06)*(1-smooth(z,1.94,2.14));
    const crown=hoodCentre(z)+(ev?.032:0)+.006*(1-across*across)+rib;
    // Roll only the outer shoulder. A broad crown keeps the EV hood smooth
    // without dropping the flank into a deep gutter alongside the centre.
    return coachworkSourceY(lerp(crown,edge,smooth(across,ev?.77:.76,1)),z);
  };
  const wingHeight=(x,z)=>{
    const edge=bodyX(wingTop(z),z),ledge=coachworkSourceY(wingJointY(z),z),ax=Math.abs(x),foldEnd=ev?.795:.787;
    if(ax<=foldEnd)return lerp(hoodY(.758,z),ledge,smooth(ax,.758,foldEnd));
    return coachworkSourceY(wingJointY(z)-.012*smooth(ax,edge-.017,edge),z);
  };
  named(surface(g,paint,64,48,(u,v)=>{const z=lerp(.737,2.145,v),x=lerp(-.758,.758,u);return[x,hoodY(x,z),z];},true),'gclass-sculpted-clamshell-bonnet');
  for(const side of [-1,1]){
    named(surface(g,paint,48,20,(u,v)=>{
      const z=lerp(.737,2.145,u),edge=bodyX(wingTop(z),z),x=lerp(.758,edge,v);
      return[side*x,wingHeight(x,z),z];
    },side<0),ev?'g580-soft-bonnet-shoulder-'+side:'g63-pressed-wing-shoulder-'+side);
    named(line(g,trim,Array.from({length:65},(_,i)=>{const z=lerp(.746,2.14,i/64),x=ev?.795:.787;return[side*x,wingHeight(x,z)+.001,z];}),.0016),'gclass-low-clamshell-hood-seam-'+side);
    // A distinct front wing joint and cowl return interrupt the long flat
    // nose-side sheet while retaining the manufacturer's axle locations.
    const wingJoint=named(mappedJoint(g,trim,[[.731,1.185],[.825,.995],[.945,.880]],(z,y)=>[side*(bodyX(coachworkSourceY(y,z),z)+.002),y,z],.0015,false),'gclass-cowl-wing-joint-'+side);
    wingJoint.userData.gClassReferenceSpace=true;
  }
  named(surface(g,paint,56,8,(u,v)=>{
    const x=lerp(-.758,.758,u),z=2.145+.012*Math.sin(v*Math.PI/2),top=gClassCoachworkPoint(x,hoodY(x,2.145),2.145)[1];
    return[x,coachworkSourceY(top-.024*v,z),z];
  },true),'gclass-rolled-bonnet-nose');
  // Cowl and upright windshield share straight side boundaries.
  box(g,paint,[0,1.321,.703],[1.785,.062,.115],.014);
  const windshield=glazingContour([[-.824,1.345],[.824,1.345],[.797,1.897],[-.797,1.897]],.055),windMap=(x,y)=>[x,y,lerp(.727,.458,(y-1.345)/.552)+.006*(1-(x/.824)**2)];
  const windOuter=rounded([[-.890,1.286],[.890,1.286],[.858,1.947],[-.858,1.947]],.022);
  mappedPolygon(g,paint,windOuter,windMap,[windshield],false,5);endWindow(g,m.windscreen,trim,windshield,windMap);
  for(const side of [-1,1]){
    const a=[side*.80,1.354,.737],b=[side*.778,1.891,.467];line(g,trim,[a,b],.006);
    tube(g,black,[side*.334,1.323,.772],[side*.502,1.444,.678],.005);
    tube(g,trim,[side*.236,1.426,.686],[side*.685,1.447,.677],.007);
    if(ev){
      named(surface(g,paint,32,8,(u,v)=>{
        const y=lerp(1.311,1.940,u),p=windMap(side*lerp(.826,.881,v),y),bulge=.020*Math.sin(v*Math.PI)*Math.sin(u*Math.PI*.90);
        return[p[0]+side*bulge,y,p[2]+.015*Math.sin(v*Math.PI)];
      },side>0),'g580-aerodynamic-a-pillar-fairing-'+side);
    }
  }
  // The crown rolls down into a thin formed flange. The previous deep
  // vertical return was enlarged by the fit and read as a projecting visor.
  const roofContour=rect(-.874,.874,-2.257,.471,.055),sunroof=rect(-.520,.520,-.50,.274,.035),roofMap=(x,z)=>[x,height-.018+.018*(1-(x/.874)**4)*(1-.10*((z+.9)/1.4)**2)-.018*(1-.30*(x/.874)**4)*smooth(z,.330,.471),z];
  named(mappedPolygon(g,paint,roofContour,roofMap,[sunroof],true,7),'gclass-rounded-roof-crown');
  const roofFlange=named(new T.Group(),'gclass-rolled-roof-flange');g.add(roofFlange);
  for(let i=0;i<roofContour.length;i++){
    const a=roofContour[i],b=roofContour[(i+1)%roofContour.length];
    surface(roofFlange,paint,3,8,(u,v)=>{
      const p=roofMap(lerp(a[0],b[0],u),lerp(a[1],b[1],u)),turn=Math.sin(v*Math.PI/2),drop=1-Math.cos(v*Math.PI/2);
      p[1]=lerp(p[1],1.947,drop);p[0]*=lerp(1,.981,turn);
      p[2]-=.030*smooth(p[2],.360,.471)*turn;return p;
    });
  }
  const roofInner=inset(sunroof,.973);mappedPolygon(g,trim,sunroof,roofMap,[roofInner],true,3);mappedPolygon(g,m.privacyGlass,roofInner,roofMap,[],true,5);
  perimeter(g,trim,sunroof,roofMap,.0025);
  box(g,paint,[0,height-.025,-2.221],[1.74,ev?.052:.044,ev?.175:.118],ev?.024:.018);
  // Front outer ring has real circular lamp and grille apertures.
  const frontMap=(x,y)=>{
    const hood=Math.abs(x)<=.758?hoodY(x,2.145):wingHeight(Math.abs(x),2.145);
    const top=coachworkSourceY(gClassCoachworkPoint(x,hood,2.145)[1]-.030,2.143);
    return[x,y+smooth(y,1.205,1.398)*(top-1.398),2.143-.021*(Math.abs(x)/.91)**4];
  };
  for(const side of [-1,1])named(surface(g,paint,24,8,(u,v)=>{
    const x=side*lerp(.758,.899,u),front=frontMap(x,1.398),z=lerp(2.145,front[2],v);
    const top=gClassCoachworkPoint(x,wingHeight(Math.abs(x),2.145),2.145)[1],bottom=gClassCoachworkPoint(...front)[1];
    return[x,coachworkSourceY(lerp(top,bottom,v),z),z];
  },side>0),'gclass-formed-front-wing-nose-return-'+side);
  // Triangulate this sheet in its FINAL X/Y plane. Deforming triangles after
  // cutting a pre-fit hole could fold a few narrow triangles into the lamp.
  // The formed silhouette and depth are retained, while the holes are true
  // circles around the rigid hardware and every triangle faces outward.
  const finalBoundary=contour=>contour.flatMap((a,i)=>{
    const b=contour[(i+1)%contour.length],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025));
    return Array.from({length:steps},(_,j)=>gClassCoachworkPoint(...frontMap(lerp(a[0],b[0],j/steps),lerp(a[1],b[1],j/steps))).slice(0,2));
  });
  const lampCenters=[-GCLASS_LANDMARKS.headlampSpacing/2,GCLASS_LANDMARKS.headlampSpacing/2];
  const lampSourceY=coachworkSourceY(GCLASS_LANDMARKS.headlampCenterY,2.151);
  const lampHoles=lampCenters.map(cx=>circle(cx,GCLASS_LANDMARKS.headlampCenterY,GCLASS_LANDMARKS.headlampDiameter/2+.002,96));
  const grille=finalBoundary(rect(-.438,.438,1.015,1.365,.039));
  const panelOutline=rect(-.865,.865,.991,1.390,.105),frontDepth=(x,y)=>[x,y,gClassCoachworkPoint(x,0,frontMap(x,0)[2])[2]];
  const frontSheet=named(mappedPolygon(g,ev?black:paint,finalBoundary(ev?panelOutline:rect(-.899,.899,.880,1.398,.025)),(x,y)=>{const p=frontDepth(x,y);if(ev)p[2]+=.0015;return p;},[...lampHoles,grille],false,3),'gclass-front-sheet-with-round-apertures');
  if(ev){
    // A formed painted fascia sits beneath the separate applied Black Panel.
    // Both share the real lamp/grille holes; overlapping coplanar contour
    // boundaries must not triangulate into spikes at the bonnet corners.
    const surround=named(mappedPolygon(g,paint,finalBoundary(rect(-.899,.899,.880,1.398,.025)),frontDepth,[...lampHoles,grille],false,3),'g580-painted-fascia-under-black-panel');
    surround.userData.gClassReferenceSpace=true;
  }
  // Dense contour edges can leave float-rounding slivers on a collinear
  // boundary. Remove only triangles below 0.000000005 m² in the X/Y
  // triangulation plane; their curved Z samples do not define sheet area.
  const frontPositions=frontSheet.geometry.attributes.position,frontIndices=frontSheet.geometry.index,usableTriangles=[];
  for(let i=0;i<frontIndices.count;i+=3){
    const ids=[frontIndices.getX(i),frontIndices.getX(i+1),frontIndices.getX(i+2)],a=new T.Vector3().fromBufferAttribute(frontPositions,ids[0]),b=new T.Vector3().fromBufferAttribute(frontPositions,ids[1]),c=new T.Vector3().fromBufferAttribute(frontPositions,ids[2]);
    if(Math.abs(b.sub(a).cross(c.sub(a)).z)>1e-8)usableTriangles.push(...ids);
  }
  frontSheet.geometry.setIndex(usableTriangles);
  frontSheet.userData.gClassReferenceSpace=true;
  for(const x of lampCenters)headlight(g,m,x,lampSourceY,2.151);
  box(g,black,[0,1.190,2.100],[.874,.344,.040],.029);
  if(ev){
    // Optional factory Black Panel / LED surround, selected deliberately.
    perimeter(g,m.drl,panelOutline,(x,y)=>[x,y,frontMap(x,y)[2]+.008],.0048);
    for(const y of [1.105,1.271])box(g,metal,[0,y,2.142],[.824,.019,.015],.005);
  }else{
    for(let i=0;i<13;i++)box(g,metal,[(i-6)*.068,1.190,2.143],[.011,.294,.032],.004);
    box(g,trim,[0,1.190,2.158],[.266,.267,.012],.050);
  }
  badge(g,m.chrome,[0,1.19,2.174],.112);
  const crest=disc(g,m.chrome,[0,1.361,2.047],.018,.002,24);crest.rotation.x=0;
  // Closed formed bumper around genuine recessed lower openings.
  const lowerOuter=rounded([[-.940,.470],[.940,.470],[.958,.799],[.875,.925],[-.875,.925],[-.958,.799]],.038);
  const lowerHoles=ev?[rect(-.488,.488,.596,.746,.030),rect(-.832,-.632,.590,.778,.060),rect(.632,.832,.590,.778,.060)]:[rect(-.472,.472,.555,.747,.035),rect(-.854,-.530,.557,.831,.055),rect(.530,.854,.557,.831,.055)];
  const bumperMap=(x,y)=>[x,y,2.249-.065*(Math.abs(x)/.96)**3-.036*smooth(y,.77,.93)];
  mappedPolygon(g,paint,lowerOuter,bumperMap,lowerHoles,false,5);
  // Closed rounded bumper corners carry the front face back into each wing.
  // The previous face had almost no side depth when seen in three quarters.
  for(const side of [-1,1])named(surface(g,paint,20,16,(u,v)=>{
    const y=lerp(.492,.823,v),a=u*Math.PI/2,front=bumperMap(side*.936,y);
    return[side*(.936+.023*Math.sin(a)),y,front[2]-.220*(1-Math.cos(a))];
  },side<0),'gclass-formed-bumper-corner-'+side);
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
  const rearMap=(x,y)=>[x,y,-2.300+.015*(Math.abs(x)/.90)**4],rearOpening=glazingContour([[-.725,1.354],[.725,1.354],[.725,1.849],[-.725,1.849]],.065),rearOutline=rect(-.896,.896,.515,1.924,.032);
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
    const designBoxStart=g.children.length;
    named(box(g,paint,[0,1.207,-2.3675],[.785,.759,.188],.061),'g580-rear-design-box');
    box(g,black,[0,1.211,-2.4625],[.705,.668,.010],.050);
    perimeter(g,metal,rect(-.335,.335,.899,1.523,.049),(x,y)=>[x,y,-2.4695],.0023);
    badge(g,m.chrome,[0,1.219,-2.4745],.108,true);
    box(g,black,[.004,1.570,-2.4485],[.151,.039,.042],.010);
    rigidRange(g,designBoxStart,[0,1.207,-2.3675],'g580-rigid-design-box-assembly');
    // Closed charging door on the rear passenger-side quarter; connector
    // internals are not exposed or represented as a permanently open flap.
    const charge=rect(-2.048,-1.852,.996,1.202,.024);
    perimeter(g,trim,charge,(z,y)=>[-bodyX(y,z)-.0015,y,z],.0012);
    const label=geometryText(g,'G 580',.180,.030,metal);label.position.set(.486,1.153,-2.324);label.rotation.y=Math.PI;
  }else{
    const cover=rigid(new T.Group());cover.position.set(0,1.218,-2.4775);g.add(cover);
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
  fitCoachworkToReference(g);
  view.root.userData.visualModel={type:'Original photo/reference reconstruction, no imported manufacturer CAD',version:16,modelYear:2025,variant:owner,
    selectedEquipment:ev?'20in AMG10spoke wheels, optional Black Panel/LED outline, Design Box':'Optional R20 22in AMG forged multi-spoke wheels / 295/40R22 road tires, stainless covered spare, side exhaust',
    dimensions:GCLASS_LANDMARKS,limitations:['photo-estimated panel curvature and interior','no production UV/normal bake or bespoke LOD authored here','native rendering requires integration verification']};
  view.root.userData.nativeConstruction={version:3,bodySurfaceRevision:16,straightPillars:true,realWindowOpenings:true,glazingReturns:true,formedBonnet:true,variantSpecificGrille:true,measuredWindowHierarchy:true,compoundWingShoulders:true,rolledBumperCorners:true,evAeroFairings:ev,
    separateRearDesignBox:ev,coveredFactorySpare:!ev,amgSideExhaust:!ev,originalGeometry:true,importedManufacturerCAD:false};
  view.root.userData.bodyRefinement={version:16,variant:owner,windowOpenings:9,frontLampApertures:2,exposedDoorHinges:8,continuousDoorJoints:true,seatedWingIndicators:true};
  return view;
}

/** Selected factory20/22in designs on the X-axis hub with open spoke gaps. */
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
    const count=10;
    for(let i=0;i<count;i++)for(const branch of ev?[0]:[-1,1]){
      const angle=i*2*Math.PI/count,positions=[],indices=[],steps=8;
      for(let j=0;j<=steps;j++){
        const t=j/steps,rad=r*lerp(.23,.958,t),offset=branch*r*(.020+.079*t),half=r*(ev?.062:.023)*(1-.13*t),dish=side*(.012+.028*Math.sin(t*Math.PI*.65));
        for(const [across,depth]of [[-1,0],[1,0],[1,-.021],[-1,-.021]])positions.push(face+dish+side*depth,Math.cos(angle)*rad-Math.sin(angle)*(offset+across*half),Math.sin(angle)*rad+Math.cos(angle)*(offset+across*half));
      }
      for(let j=0;j<steps;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4,c=a+4,d=b+4;indices.push(a,c,b,b,c,d);}
      indices.push(0,1,2,0,2,3,steps*4,steps*4+2,steps*4+1,steps*4,steps*4+3,steps*4+2);
      if(side<0)for(let n=0;n<indices.length;n+=3)[indices[n+1],indices[n+2]]=[indices[n+2],indices[n+1]];
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();named(mesh(g,geo,dark),'gclass-'+(ev?'ten':'ten-twin')+'-spoke');
      // Thin machined leading edge is restrained, rather than a solid silver disc.
      tube(g,bright,[face+side*.030,Math.cos(angle)*r*.36-Math.sin(angle)*(branch*r*.035-r*.020),Math.sin(angle)*r*.36+Math.cos(angle)*(branch*r*.035-r*.020)],[face+side*.028,Math.cos(angle)*r*.93-Math.sin(angle)*(branch*r*.097-r*.019),Math.sin(angle)*r*.93+Math.cos(angle)*(branch*r*.097-r*.019)],ev?.0030:.0022,6);
    }
    const cap=mesh(g,new T.CylinderGeometry(r*.225,r*.225,.021,48),dark,[face+side*.026,0,0]);cap.rotation.z=Math.PI/2;
    const em=new T.Group();em.position.set(face+side*.039,0,0);em.rotation.y=side*Math.PI/2;g.add(em);badge(em,bright,[0,0,0],r*.135);
    for(let i=0;i<5;i++){
      const a=i*2*Math.PI/5,bolt=mesh(g,new T.CylinderGeometry(.0075,.0085,.013,6),bright,[face+side*.035,Math.cos(a)*r*.276,Math.sin(a)*r*.276]);bolt.rotation.z=Math.PI/2;
    }
  }g.name=ev?'g580-amg20-ten-spoke-rim':'g63-amg22-forged-multispoke-rim';return g;
}

/** Use instead of generic refineVehicle, which assumes an older body roster. */
export function refineGClass(view,spec){
  for(const wheel of view.wheels){
    refineFactoryWheel(wheel,spec,view.materials);
    const discarded=new Set();wheel.rimSpin.traverse(o=>{if(o.geometry)discarded.add(o.geometry);});wheel.rimSpin.clear();discarded.forEach(geometry=>geometry.dispose());wheel.rimSpin.add(gClassRim(spec));
    wheel.root.userData.factoryWheelRevision=15;
  }
  view.root.userData.nativeFidelity={version:3,bodySurfaceRevision:16,splitTireAndRim:true,factorySpokeProfile:isEV(spec)?'g580-20-10spoke':'g63-22-forged-multispoke',formedCarcass:true,beveledTread:true,coveredSpare:!isEV(spec),rearDesignBox:isEV(spec),geometryLettering:true,bodyClearcoat:true};
  return{tire:view.wheels[0].tireShape,rim:view.wheels[0].rimSpin};
}
