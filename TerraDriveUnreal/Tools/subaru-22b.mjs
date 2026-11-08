// Original 1998 JDM 22B STI. Published anchors: STI heritage spec; photo-fitted panels.
import {T,mesh,box,surface,mappedPolygon,line,curve,lerp,G,newReferenceView,finishMaterial,rod,cylinder,ring,label,pane,rimBarrel,refineReferenceWheel,simpleCabin} from './reference-vehicle-kit.mjs';
export const SUBARU_22B_SPEC={id:'subaru-22b-sti',name:'Subaru Impreza 22B STI',brand:'Subaru',year:1998,trim:'2.2 turbo boxer / 5-speed / DCCD AWD',bodyStyle:'subaru22b',color:'#075da8',powertrain:'combustion',fuelCapacityGallons:60/3.785411784,powerHP:206000/745.699872,torqueNm:363,torqueLbFt:363/1.3558179483,mass:1270,curbMass:1270,length:4.365,width:1.770,height:1.390,wheelbase:2.520,track:1.49,trackFront:1.48,trackRear:1.50,frontWeightFraction:.58,cgHeight:.50,clearance:.14,tireSize:'235/40R17',tireRadius:.3099,tireWidth:.235,rearTireWidth:.235,tireType:'road-performance',rimDiameterInches:17,stockPSI:32,stockPSIFront:32,stockPSIRear:30,transmissionType:'manual',transmissionName:'5-speed close-ratio manual (automatic shifting in simulator)',gears:[3.083,2.062,1.545,1.151,.825],reverseRatio:3.416,finalDrive:4.444,lowRatio:1,defaultMode:'AWD',driveModes:['AWD'],frontTorqueFraction:.35,dragCoefficient:.36,features:{frontLocker:false,rearLocker:false,centerLocker:true,swayDisconnect:false,tractionControl:false,abs:false,hillDescent:false},engine:{idleRPM:850,redlineRPM:7900,peakTorqueRPM:3200,peakPowerRPM:6000,curve:[[850,90],[1800,190],[2800,350],[3200,363],[5200,350],[6000,327.86],[7200,252],[7900,205]],curveStatus:'Estimated interpolation through manufacturer output peaks'},suspension:{travel:.18,restLength:.30,springRate:29000,damping:3200,antiRoll:16000,frontType:'independent inverted MacPherson struts',rearType:'independent MacPherson struts',parameterStatus:'Simulation rates, damping, rest and travel; not measured Bilstein/Eibach data'},notes:['Original two-door 1998 JDM 22B, distinct from later WRX STI sedans. Driver-adjustable centre coupling is simplified as a centre-lock control.','Factory dimensions, 17-inch BBS wheel/tire designation, rated output and curb mass. Panel coordinates, CG, pressure, torque interpolation and suspension coefficients are photo/simulation estimates.'],sources:['https://www.subaru.co.jp/news/archives/98_1_3/3_16_1.html','https://www.sti.jp/brand/heritage/1998/impreza-22b/','https://collectingcars.com/for-sale/1998-subaru-impreza-sti-22b-5']};
export const SUBARU_22B_LANDMARKS={length:4.365,width:1.77,height:1.39,wheelbase:2.52,axles:[-1.26,1.26],archRadius:.355,roofFrontZ:.13,roofRearZ:-.72,cowlZ:.72,frontZ:2.1825,rearZ:-2.1825};
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
const width=z=>.805+.080*gauss(z,1.26,.49)+.080*gauss(z,-1.26,.49)+.034*gauss(z,2.1825,.30)+.033*gauss(z,-2.1825,.30);
const endSetback=(x,y,front)=>front?.12*(Math.abs(x)/.86)**2+.045*((y-.55)/.34)**2:.105*(Math.abs(x)/.86)**2+.035*((y-.53)/.35)**2;
// Share the end curvature with the side shell, bonnet and boot. Previously
// only the closing face curved away, leaving straight side panels protruding.
const endContour=p=>{const [x,y,z]=p,t=T.MathUtils.smoothstep(Math.abs(z),1.80,2.1825);return[x,y,z-Math.sign(z)*endSetback(x,y,z>0)*t];};
const belt=z=>.806+.062*gauss(z,-1.2,.9)+.085*gauss(z,.65,.65)-.047*gauss(z,2.2,.35);
const sidePoint=(s,z,y,offset=0)=>endContour([s*(width(z)-.025*(1-Math.min(1,Math.max(0,(y-.21)/.63)))+.009*Math.sin((y-.21)/.65*Math.PI)+offset),y,z]);
// The greenhouse shares one roof edge and one belt datum. Glass, stamped
// pillar strips and shoulder returns meet those same boundaries.
const roofPoint=(u,t)=>{const z=lerp(-.75,.14,t),x=(u*2-1)*(.682-.013*Math.cos(t*Math.PI));return[x,1.39-.028*(u*2-1)**2-.014*(2*t-1)**2,z];};
const cabinBase=z=>lerp(.881,.90,(z+1.42)/2.13);
const sideCabin=(s,z,y)=>{const rz=T.MathUtils.clamp(z,-.75,.14),r=roofPoint(1,(rz+.75)/.89),slope=(.784-r[0])/(r[1]-cabinBase(rz));return[s*(.784-(y-cabinBase(z))*slope),y,z];};
const screenPoint=(front,u,t)=>{const roof=roofPoint((u+1)/2,front?1:0);return[lerp(u*.784,roof[0],t),lerp(front?.90:.881,roof[1],t),lerp(front?.71:-1.42,roof[2],t)];};
const shoulder=(s,z)=>endContour([s*(width(z)-.040),belt(z),z]);
const blendPoints=(a,b,t)=>a.map((v,k)=>lerp(v,b[k],t));
function alloy(spec,m){const g=new T.Group(),r=17*.0254/2,w=spec.tireWidth,gold=finishMaterial('#ba9851','wheel',.29,.75);rimBarrel(g,gold,r,w);for(const s of [-1,1]){const x=s*w*.425;for(let i=0;i<10;i++){const a=i*Math.PI/5;for(const branch of [-1,1]){const pts=[.25,.46,.69,.95].map((v,j)=>[x+s*(.01-.026*(1-v)),Math.cos(a+branch*[0,.045,.11,.16][j])*r*v,Math.sin(a+branch*[0,.045,.11,.16][j])*r*v]);curve(g,gold,pts,.0065);} }cylinder(g,gold,[x,0,0],r*.27,.022,'x');cylinder(g,m.black,[x+s*.018,0,0],r*.13,.012,'x');for(let i=0;i<5;i++){const a=i*2*Math.PI/5;cylinder(g,m.chrome,[x+s*.025,Math.cos(a)*r*.20,Math.sin(a)*r*.20],.0065,.016,'x',6);}ring(g,gold,[x,0,0],r*.95,.006);label(g,m.chrome,'BBS',.039,.015,[x+s*.025,-.006,0],s*Math.PI/2);}g.name='22b-gold-ten-paired-spoke-17in-wheel';return g;}
export function subaru22bView(spec=SUBARU_22B_SPEC){const v=newReferenceView(spec),g=v.body,m=v.materials,front=2.1825,rear=-2.1825;
 m.paint.metalness=.30;
 // Continuous broad blisters taper into the door, with empty wheel apertures.
 for(const s of [-1,1]){surface(g,m.paint,160,20,(u,t)=>{const z=lerp(rear,front,u);let low=.21;for(const a of [-1.26,1.26])if(Math.abs(z-a)<.355)low=Math.max(low,spec.tireRadius+Math.sqrt(.355**2-(z-a)**2));return sidePoint(s,z,lerp(low,belt(z),t));},s>0).name='22b-continuous-widebody-quarter';surface(g,m.paint,120,10,(u,t)=>{const z=lerp(rear,front,u),a=t*Math.PI/2;return endContour([s*(width(z)-.040+.040*Math.sin(a)),belt(z)-.040+.040*Math.cos(a),z]);},s<0).name='22b-rounded-quarter-shoulder-'+s;
 for(const a of [-1.26,1.26]){surface(g,m.paint,64,5,(u,t)=>{const ang=lerp(-.10,Math.PI+.10,u),r=.356+t*.022,z=a+Math.cos(ang)*r,y=spec.tireRadius+Math.sin(ang)*r;return sidePoint(s,z,y,.006*(1-t));},s<0).name='22b-rolled-open-arch';surface(g,m.dark,64,5,(u,t)=>{const ang=u*Math.PI,z=a+Math.cos(ang)*.354,y=spec.tireRadius+Math.sin(ang)*.354;return[s*(width(z)-t*.10),y,z];},s>0);}
 surface(g,m.paint,54,7,(u,t)=>{const z=lerp(-.88,.86,u);return[s*(.810+.018*Math.sin(t*Math.PI)),lerp(.18,.26,t),z];},s>0).name='22b-molded-side-skirt';
 const joint=[[-.48,.835],[-.50,.74],[-.50,.31],[-.43,.245],[.68,.245],[.78,.33],[.81,.78],[.70,.89]];line(g,m.black,joint.map(([z,y])=>sidePoint(s,z,y,.002)),.0022);const handle=box(g,m.paint,sidePoint(s,-.30,.744,.010),[.026,.046,.128],.014);box(g,m.black,sidePoint(s,-.30,.744,.026),[.004,.019,.082],.005);
 const outline=[[-1.42,.881],...Array.from({length:33},(_,i)=>{const r=roofPoint((s+1)/2,i/32);return[r[2],r[1]];}),[.71,.90]],map=(z,y)=>sideCabin(s,z,y);
 const main=[[-.49,.903],[-.50,1.334],[.045,1.330],[.625,.911]],quarter=[[-1.16,.914],[-.82,1.273],[-.70,1.327],[-.535,1.334],[-.525,.903]];
 mappedPolygon(g,m.paint,outline,map,[main,quarter],s>0,8).name='22b-stamped-side-window-frame-'+s;pane(g,m,main,map,s>0);pane(g,m,quarter,map,s>0);
 surface(g,m.paint,96,8,(u,t)=>{const z=lerp(-1.42,.71,u);return blendPoints(shoulder(s,z),sideCabin(s,z,cabinBase(z)),t);},s>0).name='22b-greenhouse-belt-return-'+s;
 const mirror=box(g,m.paint,[s*.884,.934,.65],[.155,.101,.19],.035);box(g,m.glossBlack,[s*.898,.939,.562],[.126,.076,.008],.018);rod(g,m.black,[s*.76,.921,.66],[s*.87,.922,.65],.021);
 cylinder(g,m.amber,sidePoint(s,1.05,.748,.009),.024,.013,'x');
 }
 const hood=(u,t)=>{const z=lerp(.72,front,t),x=(u*2-1)*(width(z)-.040);return endContour([x,belt(z)+.012+.029*(1-(x/.84)**2)+.015*gauss(Math.abs(x),.47,.09)*Math.sin(t*Math.PI),z]);};surface(g,m.paint,66,54,hood,true).name='22b-crowned-bonnet';
 for(const s of [-1,1]){
  surface(g,m.paint,110,4,(u,t)=>blendPoints(shoulder(s,lerp(.72,front,u)),hood((s+1)/2,u),t),s>0).name='22b-bonnet-edge-return-'+s;
  surface(g,m.black,110,2,(u,t)=>{const a=hood((s+1)/2,u),b=shoulder(s,lerp(.72,front,u)),p=blendPoints(a,b,t*Math.min(.3,.0018/Math.max(.001,Math.hypot(...a.map((n,k)=>n-b[k])))));p[0]+=s*.0003;return p;},s<0).name='22b-bonnet-reveal-'+s;
  const map=(x,z)=>[s*x,belt(z)+.037,z];mappedPolygon(g,m.black,[[.43,1.28],[.63,1.28],[.65,1.64],[.46,1.69]],map,[],s>0,5);for(let i=0;i<5;i++)rod(g,m.dark,[s*.455,belt(1.32+i*.065)+.045,1.32+i*.065],[s*.626,belt(1.32+i*.065)+.045,1.32+i*.065],.008);}
 // The scoop has an open mouth, separate side returns and a curved upper skin.
 const scoop=(u,t)=>{const x=(u*2-1)*lerp(.245,.302,t),z=lerp(.88,1.43,t);return[x,belt(z)+.045+.102*Math.sin(t*Math.PI/2)*(1-.14*(u*2-1)**2),z];};surface(g,m.paint,32,22,scoop,true).name='22b-open-scoop-roof';for(const s of [-1,1])surface(g,m.paint,22,7,(u,t)=>{const p=scoop((s+1)/2,u);p[1]=lerp(belt(p[2])+.035,p[1],t);return p;},s>0);box(g,m.black,[0,belt(1.39)+.084,1.407],[.53,.068,.012]);for(const x of [-.17,0,.17])box(g,m.dark,[x,belt(1.39)+.09,1.434],[.009,.073,.018]);
 surface(g,m.paint,50,44,roofPoint,true).name='22b-crowned-short-coupe-roof';
 for(const frontScreen of [true,false]){
  const outline=[[-1,0],[1,0],[1,1],[-1,1]],hole=[[-.945,.025],[.945,.025],[.965,.075],[.955,.95],[.90,.977],[-.90,.977],[-.955,.95],[-.965,.075]],map=(u,t)=>screenPoint(frontScreen,u,t);
  mappedPolygon(g,m.paint,outline,map,[hole],!frontScreen,12).name=frontScreen?'22b-formed-front-window-surround':'22b-formed-rear-window-surround';
  const glass=pane(g,m,hole,map,!frontScreen);glass.userData.screenSide=frontScreen?'front':'rear';
 }
 const trunk=(u,t)=>{const z=lerp(rear,-1.4,t),x=(u*2-1)*(width(z)-.040);return endContour([x,belt(z)+.025*(1-(x/.86)**2),z]);};
 surface(g,m.paint,56,25,trunk,true).name='22b-rounded-trunk-deck';
 for(const frontScreen of [true,false]){
  const panel=frontScreen?hood:trunk,end=frontScreen?0:1;
  surface(g,m.paint,64,5,(u,t)=>blendPoints(screenPoint(frontScreen,u*2-1,0),panel(u,end),t),true).name=frontScreen?'22b-closed-cowl':'22b-closed-rear-window-sill';
  for(const s of [-1,1])surface(g,m.paint,12,5,(u,t)=>{const a=screenPoint(frontScreen,s,0),b=panel((s+1)/2,end),z=lerp(a[2],b[2],u);return blendPoints(shoulder(s,z),blendPoints(a,b,u),t);},s>0).name=(frontScreen?'22b-cowl-corner-return-':'22b-rear-sill-corner-return-')+s;
 }
 // An opaque parcel shelf and rear bench close the cabin above the axle.
 box(g,m.interior,[0,.788,-1.275],[1.45,.030,.38],.014).name='22b-rear-parcel-shelf';
 box(g,m.upholstery,[0,.43,-.90],[1.26,.13,.43],.035).name='22b-rear-bench-seat';
 box(g,m.upholstery,[0,.64,-1.09],[1.25,.34,.13],.035).name='22b-rear-bench-back';
 for(const s of [-1,1])surface(g,m.paint,72,4,(u,t)=>blendPoints(shoulder(s,lerp(rear,-1.4,u)),trunk((s+1)/2,u),t),s>0).name='22b-boot-edge-return-'+s;
 const nose=(x,y,d=0)=>[x,y,front-endSetback(x,y,true)-d];
 // The perimeter follows the actual side sheet and hood/boot edge, including
 // the curved shoulder return. These are shared physical points, not a wider
 // rectangular plate laid across the body.
 const closureOutline=(z,top)=>{const right=Array.from({length:17},(_,i)=>sidePoint(1,z,lerp(.21,belt(z),i/16)).slice(0,2));const crown=Array.from({length:65},(_,i)=>{const x=lerp(width(z)-.040,-width(z)+.040,i/64);return[x,top(x)];});return[...right,...crown,...right.slice().reverse().map(([x,y])=>[-x,y])];};
 const lamp=s=>[[s*.315,.636],[s*.804,.622],[s*.815,.748],[s*.343,.782]],grill=[[-.29,.642],[.29,.642],[.31,.785],[-.31,.785]],lower=[[-.40,.286],[.40,.286],[.44,.477],[-.44,.477]];
 const outline=closureOutline(front,x=>belt(front)+.012+.029*(1-(x/.84)**2)),vents=[-1,1].map(s=>[[s*.744,.32],[s*.821,.34],[s*.835,.487],[s*.751,.487]]);
 mappedPolygon(g,m.paint,outline,(x,y)=>nose(x,y),[lamp(-1),lamp(1),grill,lower,...vents],false,10).name='22b-perforated-curved-front-bumper';
 for(const vent of vents)mappedPolygon(g,m.black,vent,(x,y)=>nose(x,y,.045),[],false,3);
 for(const hole of [grill,lower]){mappedPolygon(g,m.black,hole,(x,y)=>nose(x,y,.055),[],false,4);for(let x=-.35;x<=.35;x+=.045)if(hole===lower||Math.abs(x)<.28)rod(g,m.grille,nose(x,hole[0][1]+.01,.025),nose(x,hole[2][1]-.01,.025),.004);}
 for(const s of [-1,1]){const shape=lamp(s);mappedPolygon(g,m.chrome,shape,(x,y)=>nose(x,y,.018),[],false,6);mappedPolygon(g,m.lens,shape,(x,y)=>nose(x,y,-.002),[],false,8);for(let i=0;i<20;i++){const x=s*(.34+i*.022);rod(g,m.satinMetal,nose(x,.644,.007),nose(x,.748,.007),.0011);}box(g,m.chrome,nose(s*.79,.687,-.006),[.034,.105,.008],.007);cylinder(g,m.paint,nose(s*.632,.417,-.008),.133,.022,'z',64);label(g,m.white,'STI',.145,.047,nose(s*.632,.394,-.025));box(g,m.amber,nose(s*.650,.578,-.008),[.19,.035,.012],.008);}
 const pink=finishMaterial('#d96389','paint',.4);box(g,pink,nose(0,.718,-.009),[.055,.035,.008],.012);
 const back=(x,y,d=0)=>[x,y,rear+endSetback(x,y,false)+d];
 mappedPolygon(g,m.paint,closureOutline(rear,x=>belt(rear)+.025*(1-(x/.86)**2)),(x,y)=>back(x,y),[],true,14).name='22b-formed-rear-closure';
 for(const s of [-1,1]){const tail=[[.40,.575],[.81,.575],[.83,.728],[.72,.791],[.42,.782]];mappedPolygon(g,m.red,tail,(x,y)=>back(s*x,y,-.009),[],s>0,7);mappedPolygon(g,m.reverse,[[.415,.582],[.806,.582],[.812,.642],[.415,.642]],(x,y)=>back(s*x,y,-.011),[],s>0,5);line(g,m.black,[[s*.40,.57],[s*.40,.805],[s*.34,.865]].map(([x,y])=>back(x,y,-.004)),.002);}
 box(g,m.black,[0,.392,rear-.005],[.51,.145,.013],.010);box(g,m.white,[0,.397,rear-.015],[.46,.108,.006],.004);label(g,m.black,'22B STI',.31,.045,[0,.374,rear-.020],Math.PI);
 for(const s of [-1,1]){const section=[[-1.48,.885],[-1.94,.885],[-2.035,1.204],[-1.77,1.213]];for(const offset of [-.010,.010])mappedPolygon(g,m.paint,section,(z,y)=>[s*(.702+offset),y,z],[],s>0,6).name='22b-wing-endplate';line(g,m.paint,section.concat([section[0]]).map(([z,y])=>[s*.702,y,z]),.011);}
 const foil=(u,t,under=false)=>{const x=(u*2-1)*.747,z=lerp(-1.75,-2.045,t);return[x,1.202+.023*Math.sin(t*Math.PI)-.008*(u*2-1)**2-(under?.021:0),z];};surface(g,m.paint,48,14,(u,t)=>foil(u,t),false).name='22b-adjustable-rear-wing';surface(g,m.paint,48,14,(u,t)=>foil(u,t,true),true);for(const t of [0,1])surface(g,m.paint,48,3,(u,w)=>{const a=foil(u,t),b=foil(u,t,true);return a.map((n,k)=>lerp(n,b[k],w));},t===1);
 box(g,m.red,[0,.929,-1.934],[.30,.018,.017],.005);cylinder(g,m.chrome,[-.49,.23,-2.13],.055,.18,'z');cylinder(g,m.black,[-.49,.23,-2.224],.045,.005,'z');box(g,m.dark,[0,.17,0],[1.37,.04,3.57],.02);simpleCabin(g,m,{rhd:true});
 v.root.userData.nativeConstruction={version:3,endClosureRevision:2,greenhouseClosureRevision:2,bodySurfaceRevision:1,automotiveFinishes:true,originalReferenceGeometry:true,realWindowApertures:true,geometryLettering:true};v.root.userData.bodyRefinement={version:2,style:'subaru22b',method:'Photo-fitted two-door widebody, bonnet intake and adjustable wing',preservedHardpoints:true};v.root.userData.visualModel={version:1,landmarks:SUBARU_22B_LANDMARKS};v.root.userData.nativeFidelity={version:3,factorySpokeProfile:'22b-17in-gold-BBS',bodyClearcoat:true,geometryLettering:true};v.root.userData.endClosureSamples=[front,rear].map(z=>({front:z>0,side:[-1,1].flatMap(side=>Array.from({length:17},(_,i)=>sidePoint(side,z,lerp(.21,belt(z),i/16)))),upper:Array.from({length:65},(_,i)=>{const x=lerp(width(z)-.040,-width(z)+.040,i/64),y=belt(z)+(z>0?.012+.029*(1-(x/.84)**2):.025*(1-(x/.86)**2));return endContour([x,y,z]);})}));return v;
}
export const refineSubaru22b=(view,spec=view.spec)=>refineReferenceWheel(view,spec,alloy);
