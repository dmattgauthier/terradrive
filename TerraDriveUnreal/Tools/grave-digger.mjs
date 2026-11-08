// Original contemporary Grave Digger interpretation from Monster Jam photographs.
// Official class dimensions and tires anchor scale; chassis/body stations are estimates.
import {T,mesh,box,surface,mappedPolygon,line,curve,lerp,G,newReferenceView,finishMaterial,rod,cylinder,ring,label,pane,rimBarrel,refineReferenceWheel} from './reference-vehicle-kit.mjs';
export const GRAVE_DIGGER_SPEC={id:'grave-digger',name:'Grave Digger',brand:'Monster Jam',year:2024,trim:'Supercharged methanol V8 / tube chassis / 66-inch tires',bodyStyle:'monster',monsterTruck:1,droopTravel:.42,wheelInertia:48,color:'#111518',powertrain:'combustion',fuelCapacityGallons:30,bodyWidthM:2.0,powerHP:1500,torqueNm:2000,torqueLbFt:2000/1.3558179483,mass:12000*.45359237,curbMass:12000*.45359237,length:17*.3048,width:12.5*.3048,height:10.5*.3048,wheelbase:3.50,track:2.72,trackFront:2.72,trackRear:2.72,frontWeightFraction:.5,cgHeight:1.45,clearance:.65,tireSize:'66X43R25',tireRadius:66*.0254/2,tireWidth:43*.0254,rearTireWidth:43*.0254,tireType:'mud-terrain',rimDiameterInches:25,stockPSI:23,stockPSIFront:23,stockPSIRear:23,transmissionType:'automatic',transmissionName:'Two-speed racing automatic',gears:[1.8,1],reverseRatio:1.8,finalDrive:12,lowRatio:1,defaultMode:'4H',driveModes:['4H'],frontTorqueFraction:.5,dragCoefficient:.70,topSpeedMPH:75,features:{frontLocker:true,rearLocker:true,swayDisconnect:false,tractionControl:false,abs:false,hillDescent:false},engine:{idleRPM:1200,redlineRPM:8500,peakTorqueRPM:5000,peakPowerRPM:7500,curve:[[1200,550],[2500,1250],[4000,1800],[5000,2000],[6500,1820],[7500,1424.2],[8500,1050]],curveStatus:'Simulator curve through representative 1500 hp class output, not a measured Grave Digger dyno'},suspension:{travel:.762,droopTravel:.42,restLength:.94,springRate:105000,damping:12000,antiRoll:14000,frontType:'four-link solid axle with nitrogen shocks',rearType:'four-link solid axle with nitrogen shocks',parameterStatus:'Official class 30-inch travel; estimated spring/damper calibration'},notes:['Reference reconstruction of the modern black/green 1951 Chevy-panel-wagon-inspired body with exposed green tube cage, rear engine and red headlights.','Official class approximate envelope, 12000-pound mass, 1500 hp, 66x43-inch tires and 30-inch travel. Exact chassis number, wheelbase, track, CG, torque, fuel capacity and gearing are estimates.','Stock 66-inch monster tires are retained; the passenger/off-road 50-inch conversion limit does not shrink this truck. Independent rear-steer control is simplified to speed-sensitive coordinated rear steering.'],sources:['https://www.monsterjam.com/en-us/truck/grave-digger/','https://www.monsterjam.com/en-gb/monster-jam-101/']};
export const GRAVE_DIGGER_LANDMARKS={overallLength:5.1816,overallWidth:3.81,height:3.2004,wheelbase:3.50,tireDiameter:1.6764,tireWidth:1.0922,bodyFrontZ:2.32,bodyRearZ:-2.25,bodyWidth:1.90,estimated:true};

const wagonRows=[[-2.25,.86,2.99],[-2.12,.94,3.13],[-1.65,.95,3.19],[-.48,.94,3.20],[.03,.88,3.14],[.22,.83,3.02]];
const sideLow=z=>1.81+.20*Math.exp(-(((z+1.75)/.58)**2));
const sideTop=z=>G.interpolate(wagonRows,z,2)-.16;
export function graveSidePaintBase(side,z,y){const t=(y-sideLow(z))/(sideTop(z)-sideLow(z));return[side*(G.interpolate(wagonRows,z,1)+.013*Math.sin(t*Math.PI)),y,z];}
export function graveHoodPaintBase(x,z){const t=(z-.69)/1.63,w=lerp(.70,.55,t);return[x,lerp(2.43,2.31,t)+.14*(1-(x/w)**2),z];}
function cleanContour(points){const p=points.filter((q,i)=>!i||Math.hypot(q[0]-points[i-1][0],q[1]-points[i-1][1])>1e-8);if(p.length>2&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<1e-8)p.pop();return p;}
function paintNormal(base,u,v,flip){const e=.00001,du=new T.Vector3(...base(u+e,v)).sub(new T.Vector3(...base(u-e,v))),dv=new T.Vector3(...base(u,v+e)).sub(new T.Vector3(...base(u,v-e)));return du.cross(dv).normalize().multiplyScalar(flip?-1:1);}
function paintPatch(g,material,outline,base,flip,name,layer=0){
 // Paint follows the very same panel surface and normal. A 0.8 mm base
 // offset (0.2 mm between ink layers) replaces centimetre-thick tubes.
 const offset=.0008+layer*.0002,map=(u,v)=>new T.Vector3(...base(u,v)).addScaledVector(paintNormal(base,u,v,flip),offset).toArray();
 const o=mappedPolygon(g,material,cleanContour(outline),map,[],flip,12);o.name='grave-painted-'+name;o.castShadow=false;
 o.userData.gravePaint={base,offset,flip};return o;
}
function smoothPath(points,steps=32,closed=false){const c=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0],p[1],0)),closed,'centripetal');return Array.from({length:steps+(closed?0:1)},(_,i)=>{const p=c.getPoint(i/steps);return[p.x,p.y];});}
function paintStroke(g,m,points,width,base,flip,name,layer=0){
 // A conforming ribbon grid avoids the long, near-collinear ear triangles
 // produced by triangulating a thin curved outline as one large polygon.
 const rows=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.014));for(let j=0;j<steps;j++)rows.push({q:a.map((v,k)=>lerp(v,b[k],j/steps)),t:(i+j/steps)/(points.length-1)});}rows.push({q:points.at(-1),t:1});
 const widest=Math.max(...rows.map(row=>typeof width==='function'?width(row.t):width)),columns=Math.max(1,Math.ceil(widest/.018)),stride=columns+1;
 const offset=.0008+layer*.0002,p=[],n=[],uv=[],ix=[];
 for(let i=0;i<rows.length;i++){const a=rows[Math.max(0,i-1)].q,b=rows[Math.min(rows.length-1,i+1)].q,d=Math.hypot(b[0]-a[0],b[1]-a[1]),r=(typeof width==='function'?width(rows[i].t):width)*.5;
  for(let column=0;column<=columns;column++){const side=lerp(-1,1,column/columns),q=[rows[i].q[0]-side*(b[1]-a[1])/d*r,rows[i].q[1]+side*(b[0]-a[0])/d*r],normal=paintNormal(base,...q,flip),v=new T.Vector3(...base(...q)).addScaledVector(normal,offset);p.push(...v.toArray());n.push(...normal.toArray());uv.push(...q);}
 }
 for(let i=0;i<rows.length-1;i++)for(let column=0;column<columns;column++)for(const ids of [[i*stride+column,i*stride+column+1,(i+1)*stride+column],[i*stride+column+1,(i+1)*stride+column+1,(i+1)*stride+column]]){const[a,b,c]=ids.map(j=>uv.slice(j*2,j*2+2)),det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(det)<1e-12)continue;if((det>0)===flip)[ids[1],ids[2]]=[ids[2],ids[1]];ix.push(...ids);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(n,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);
 const o=mesh(g,geo,m);o.name='grave-painted-'+name;o.castShadow=false;o.userData.gravePaint={base,offset,flip};return o;
}
const titleGlyphs={
 A:[[[0,0],[.5,1],[1,0]],[[.23,.43],[.77,.43]]],D:[[[0,0],[0,1],[.62,1],[1,.75],[1,.25],[.62,0],[0,0]]],
 E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.52],[.78,.52]]],G:[[[1,.82],[.8,1],[.2,1],[0,.75],[0,.25],[.2,0],[1,0],[1,.48],[.57,.48]]],
 I:[[[.5,0],[.5,1]]],R:[[[0,0],[0,1],[.75,1],[1,.78],[.75,.55],[0,.55]],[[.50,.55],[1,0]]],V:[[[0,1],[.5,0],[1,1]]]
};
function paintTitle(g,side,base,red,white){const text='GRAVE DIGGER',width=1.05,height=.132,step=width/text.length;
 for(const [ink,stroke,layer]of [[red,.028,1],[white,.019,2]])for(const [i,ch]of [...text].entries())for(const path of titleGlyphs[ch]||[]){
  const points=path.map(([x,y])=>[-1.52-side*(-width*.5+(i+x*.77)*step),2.79+y*height]);paintStroke(g,ink,points,stroke,base,side>0,'title-'+side,layer);
 }
}

function tire(spec,m){const g=new T.Group(),r=spec.tireRadius,w=spec.tireWidth,bead=25*.0254/2,depth=.042;const pr=[[bead*.97,-w*.41],[bead*1.10,-w*.46],[r*.68,-w*.51],[r*.85,-w*.52],[r*.94,-w*.47],[r-depth,-w*.35],[r-depth,0],[r-depth,w*.35],[r*.94,w*.47],[r*.85,w*.52],[r*.68,w*.51],[bead*1.10,w*.46],[bead*.97,w*.41]];const o=mesh(g,new T.LatheGeometry(pr.map(p=>new T.Vector2(...p)),96),m.rubber);o.rotation.z=Math.PI/2;o.name='monster-bulged-66in-carcass';
 for(let i=0;i<24;i++)for(const side of [-1,1]){const a=i*2*Math.PI/24+(side>0?.026:0);surface(g,m.tread,8,6,(u,t)=>{const x=side*lerp(.025,w*.45,u),angle=a+.28*u+lerp(-.033,.033,t),rr=r-.011*u*u;return[x,Math.cos(angle)*rr,Math.sin(angle)*rr];},side>0).name='monster-directional-chevron-lug';for(const e of [0,1])surface(g,m.tread,8,3,(u,t)=>{const x=side*lerp(.025,w*.45,u),angle=a+.28*u+(e? .033:-.033),rr=r-.011*u*u-t*depth;return[x,Math.cos(angle)*rr,Math.sin(angle)*rr];},(side>0)!==!!e);}
 for(const s of [-1,1]){ring(g,m.rubber,[s*w*.46,0,0],bead*1.08,.009);for(const rad of [.68,.82])ring(g,m.rubber,[s*w*.514,0,0],r*rad,.003);for(let i=0;i<24;i++){const a=i*Math.PI/12;rod(g,m.tread,[s*w*.50,Math.cos(a)*r*.86,Math.sin(a)*r*.86],[s*w*.47,Math.cos(a+.02)*r*.94,Math.sin(a+.02)*r*.94],.012);}label(g,m.white,'66 X 43 - 25',.36,.043,[s*w*.521,r*.67,0],s*Math.PI/2);}return g;}
function wheel(spec,m){const g=new T.Group(),r=25*.0254/2,w=spec.tireWidth,green=finishMaterial('#48e414','paint',.35);rimBarrel(g,m.dark,r,w);for(const s of [-1,1]){const x=s*w*.42;ring(g,green,[x,0,0],r*.95,.018);ring(g,m.satinMetal,[x-s*.022,0,0],r*.86,.008);cylinder(g,m.dark,[x-s*.11,0,0],r*.79,.045,'x');cylinder(g,m.chrome,[x-s*.085,0,0],r*.30,.06,'x');for(let i=0;i<32;i++){const a=i*Math.PI/16;cylinder(g,m.chrome,[x+s*.013,Math.cos(a)*r*.95,Math.sin(a)*r*.95],.006,.011,'x',6);}for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(g,m.chrome,[x-s*.04,Math.cos(a)*r*.26,Math.sin(a)*r*.26],.012,.028,'x',6);}}g.name='monster-deep-25in-beadlock-wheel';return g;}
export function graveDiggerView(spec=GRAVE_DIGGER_SPEC){const v=newReferenceView(spec),g=v.body,m=v.materials,green=finishMaterial('#39c413','paint',.35),purple=finishMaterial('#61218d','paint',.35),ghost=finishMaterial('#e4e7d8','paint',.49),yellow=finishMaterial('#c8ed37','paint',.4),liveryRed=finishMaterial('#c42a27','paint',.36);m.paint.color.set('#0b1012');
 // Three-dimensional tube chassis and triangulated side bays, with clear air
 // through the frame rather than a black slab below the lightweight shell.
 for(const s of [-1,1]){const x=s*.68;for(const y of [.81,1.32,1.78]){rod(g,green,[x,y,-2.13],[x,y,2.08],.038);}
 for(const z of [-2.1,-1.18,-.2,.72,1.65,2.06])rod(g,green,[x,.81,z],[x,1.78,z],.034);
 for(const [a,b]of [[-2.1,-1.18],[-1.18,-.2],[-.2,.72],[.72,1.65]]){rod(g,green,[x,.82,a],[x,1.77,b],.032);rod(g,green,[x,1.77,a],[x,.82,b],.032);}
 rod(g,green,[x,1.32,-2.13],[s*.83,2.97,-1.30],.038);rod(g,green,[s*.83,2.97,-1.30],[s*.80,3.09,.02],.038);rod(g,green,[s*.80,3.09,.02],[x,1.32,1.12],.038);rod(g,green,[x,1.78,-.38],[s*.79,3.08,-.32],.035);
 // Exposed engine-side zoomie headers, distinct four pipes per bank.
 for(let j=0;j<4;j++)curve(g,m.chrome,[[s*.28,1.47,-.62+j*.16],[s*.56,1.35,-.57+j*.16],[s*.83,1.24,-.72+j*.16],[s*.96,1.32,-.77+j*.16]],.034);
 }
 for(const z of [-2.1,-1.18,-.2,.72,1.65,2.06])for(const y of [.81,1.78])rod(g,green,[-.68,y,z],[.68,y,z],.033);for(const z of [-1.3,-.32,.02])rod(g,green,[-.81,3.04,z],[.81,3.04,z],.035);rod(g,green,[-.68,.81,-2.1],[.68,.81,-.2],.034);rod(g,green,[.68,.81,-2.1],[-.68,.81,-.2],.034);
 box(g,m.dark,[0,1.19,-.43],[.62,.60,.86],.08);for(const s of [-1,1]){const bank=box(g,m.satinMetal,[s*.26,1.54,-.43],[.25,.22,.81],.035);bank.rotation.z=s*.38;}box(g,m.chrome,[0,1.77,-.43],[.36,.25,.61],.035);for(let i=0;i<11;i++)box(g,m.satinMetal,[0,1.781,-.69+i*.052],[.37,.26,.012],.004);box(g,m.black,[0,1.97,-.43],[.39,.15,.43],.025);box(g,m.dark,[0,1.13,-1.54],[.85,.50,.50],.07);
 // The contemporary panel-wagon silhouette: high long rounded rear roof,
 // short upright cab, domed narrow hood and separate bulbous front fenders.
 const rows=wagonRows;
 surface(g,m.paint,52,82,(u,t)=>{const z=lerp(-2.25,.22,t),w=G.interpolate(rows,z,1),y=G.interpolate(rows,z,2),a=(u*2-1)*Math.PI/2;return[Math.sin(a)*w,y-.17*(1-Math.cos(a)),z];},true).name='grave-digger-domed-wagon-roof';
 for(const s of [-1,1]){surface(g,m.paint,95,30,(u,t)=>{const z=lerp(-2.25,.19,u);const low=1.81+.20*Math.exp(-(((z+1.75)/.58)**2)),top=G.interpolate(rows,z,2)-.16;return[s*(G.interpolate(rows,z,1)+.013*Math.sin(t*Math.PI)),lerp(low,top,t),z];},s>0,(u,t)=>{const z=lerp(-2.25,.19,u),y=lerp(1.81+.20*Math.exp(-(((z+1.75)/.58)**2)),G.interpolate(rows,z,2)-.16,t);return z>-.44&&z<.15&&y>2.42;}).name='grave-digger-panel-wagon-side';
 // Cab opening has visible cage and seat, not an opaque painted rectangle.
 const cab=[[-.44,2.39],[-.44,2.99],[.10,2.98],[.68,2.40]],map=(z,y)=>[s*(.91-.10*(y-2.4)),y,z];pane(g,m,cab,map,s>0);line(g,green,cab.concat([cab[0]]).map(p=>map(...p)),.020);
 for(const z of [-.36,-.12,.12])rod(g,green,[s*.82,2.40,z],[s*.82,2.99,z],.024);
 // Original flat-painted interpretation of the photographed graveyard art.
 // All artwork stops behind the cab opening or below its sill, and follows
 // the same bulged panel used above instead of floating on a separate plane.
 const sideMap=(z,y)=>graveSidePaintBase(s,z,y),flip=s>0;
 const mist=finishMaterial('#275c31','paint',.31),mistLight=finishMaterial('#497b49','paint',.31);
 const cloudZ=Array.from({length:45},(_,i)=>lerp(-2.16,-.50,i/44));
 paintPatch(g,mist,[...cloudZ.map(z=>[z,sideLow(z)+.025]),...cloudZ.slice().reverse().map((z,i)=>[z,sideLow(z)+.20+.025*Math.sin(i*.51)])],sideMap,flip,'graveyard-mist-'+s);
 for(let j=0;j<3;j++)paintStroke(g,mistLight,cloudZ.map((z,i)=>[z,sideLow(z)+.052+j*.043+.012*Math.sin(i*.6+j)]),.016,sideMap,flip,'mist-wisp-'+s,1);
 for(let i=0;i<9;i++){const z=-2.06+i*.17,y=sideLow(z)+.047,h=.10+(i%3)*.025;const grave=[[z-.047,y],[z+.047,y],[z+.047,y+h-.03],[z+.020,y+h],[z-.020,y+h],[z-.047,y+h-.03]];
  paintPatch(g,green,grave,sideMap,flip,'gravestone-'+s,1);
  paintStroke(g,m.black,[[z-.023,y+.048],[z+.023,y+.048]],.006,sideMap,flip,'grave-cross-'+s,2);
  paintStroke(g,m.black,[[z,y+.018],[z,y+h-.015]],.006,sideMap,flip,'grave-cross-'+s,2);
 }
 for(let j=0;j<6;j++){
  const points=smoothPath([[-2.16,2.24+j*.058],[-1.86,2.20+j*.064],[-1.57,2.28+j*.050],[-1.31,2.21+j*.055],[-1.02,2.30+j*.044],[-.75,2.25+j*.046],[-.51,2.34+j*.039]],40);
  paintStroke(g,purple,points,t=>(.045+.012*Math.sin(j*1.3))*(.4+.6*Math.sin(Math.PI*t))*(1-.78*t**7),sideMap,flip,'purple-flow-'+s);
 }
 const skull=smoothPath([[-.95,2.66],[-.96,2.82],[-.91,2.94],[-.83,2.99],[-.72,3.00],[-.61,2.96],[-.55,2.86],[-.56,2.73],[-.61,2.65],[-.63,2.53],[-.69,2.60],[-.72,2.52],[-.77,2.61],[-.81,2.55],[-.85,2.64]],72,true);
 paintPatch(g,purple,skull.map(([z,y])=>[-.75+(z+.75)*1.06,2.76+(y-2.76)*1.04]),sideMap,flip,'ghost-outline-'+s,1);
 paintPatch(g,ghost,skull,sideMap,flip,'ghost-face-'+s,2);
 for(const eye of [[[-.90,2.80],[-.86,2.89],[-.78,2.85],[-.79,2.75],[-.85,2.74]],[[-.71,2.85],[-.63,2.91],[-.59,2.82],[-.62,2.75],[-.70,2.77]]])paintPatch(g,m.black,smoothPath(eye,24,true),sideMap,flip,'ghost-eye-'+s,3);
 paintPatch(g,m.black,[[-.77,2.69],[-.735,2.77],[-.70,2.68]],sideMap,flip,'ghost-nose-'+s,3);
 for(let j=0;j<5;j++)paintStroke(g,m.black,[[-.82+j*.036,2.61],[-.812+j*.036,2.69]],.008,sideMap,flip,'ghost-teeth-'+s,3);
 paintTitle(g,s,sideMap,liveryRed,ghost);
 }
 surface(g,m.paint,42,32,(u,t)=>{const y=lerp(1.84,3.00,t),x=(u*2-1)*(.86+.07*Math.sin(t*Math.PI));return[x,y,-2.25-.024*Math.sin(u*Math.PI)*Math.sin(t*Math.PI)];},true).name='grave-digger-rounded-rear-panel';
 pane(g,m,[[-.81,2.41],[.81,2.41],[.79,3.01],[-.79,3.01]],(x,y)=>[x,y,.71-(y-2.41)*.83]);
 const hood=(u,t)=>{const z=lerp(.69,2.32,t),x=(u*2-1)*lerp(.70,.55,t);return[x,lerp(2.43,2.31,t)+.14*(1-(u*2-1)**2),z];};surface(g,m.paint,50,54,hood,true).name='grave-digger-domed-narrow-bonnet';
 for(const s of [-1,1]){surface(g,m.paint,50,16,(u,t)=>{const z=lerp(.70,2.32,u),top=hood((s+1)/2,u);return[s*lerp(.70,.55,u),lerp(2.04,top[1],t),z];},s>0);surface(g,m.paint,50,28,(u,t)=>{const z=lerp(.91,2.39,u),a=lerp(-.36,Math.PI/2,t),rise=.20*Math.sin(u*Math.PI);return[s*(.68+.32*Math.sin(a)),2.11+rise+.11*Math.cos(a),z];},s<0).name='grave-digger-separate-rounded-front-fender';
 // Wide green tongues with flat yellow edges replace raised hood wires.
 const flames=[];
 for(let j=0;j<3;j++){const x=.115+j*.16,tip=[1.13,.91,1.08][j],points=smoothPath([[s*x,2.29],[s*(x+.025),2.06],[s*(x-.032),1.87],[s*(x+.030),1.64],[s*(x-.026),1.39],[s*(x+.014),tip]],40);flames.push({points,width:t=>(.12-j*.009)*(1-t)**.72});
  if(j>0){const branch=smoothPath([[s*(x-.025),1.88],[s*(x-.103),1.65],[s*(x-.091),1.37],[s*(x-.126),1.20]],28);flames.push({points:branch,width:t=>.075*(1-t)**.75});}
 }
 for(const [ink,extra,layer]of [[yellow,.009,0],[green,0,1]])for(const flame of flames)paintStroke(g,ink,flame.points,t=>flame.width(t)+extra*(1-t),graveHoodPaintBase,true,'bonnet-flame-'+s,layer);
 // The front fenders have their own curved surface; their paint follows it.
 const fenderMap=(u,t)=>{const z=lerp(.91,2.39,u),a=lerp(-.36,Math.PI/2,t);return[s*(.68+.32*Math.sin(a)),2.11+.20*Math.sin(u*Math.PI)+.11*Math.cos(a),z];};
 const fenderFlame=smoothPath([[.95,.65],[.74,.59],[.61,.68],[.44,.47],[.21,.40],[.09,.28]],34);
 for(const [ink,width,layer]of [[yellow,.13,0],[green,.10,1]])paintStroke(g,ink,fenderFlame,t=>width*(1-t)**.65,fenderMap,s<0,'fender-flame-'+s,layer);
 const lightPos=[s*.76,2.19,2.37];cylinder(g,m.chrome,lightPos,.10,.055,'z');const red=new T.MeshStandardMaterial({color:'#e81b11',emissive:'#ff1a0a',emissiveIntensity:.9,roughness:.18});red.userData.nativeRole='';red.userData.automotiveOwner='monster';cylinder(g,red,[s*.76,2.19,2.403],.080,.008,'z').name='monster-constant-red-headlight';ring(g,green,[s*.76,2.19,2.414],.092,.010,'z');}
 surface(g,green,42,22,(u,t)=>{const x=(u*2-1)*.60,y=lerp(2.04,2.36,t);return[x,y,2.33-.06*(x/.60)**2];},false);for(let j=0;j<4;j++)rod(g,m.chrome,[-.52,2.065+j*.063,2.337],[.52,2.065+j*.063,2.337],.009);box(g,m.black,[0,2.175,2.343],[.058,.23,.016],.01);
 // Separate contemporary safety lamps retain native brake/reverse semantics.
 for(const s of [-1,1]){cylinder(g,m.red,[s*.63,1.70,-2.18],.045,.018,'z');cylinder(g,m.reverse,[s*.49,1.70,-2.18],.035,.018,'z');}
 box(g,m.interior,[0,2.11,.08],[.53,.14,.57],.05);box(g,m.interior,[0,2.40,-.17],[.49,.60,.14],.05);box(g,m.interior,[0,2.76,-.18],[.27,.17,.13],.04);for(const x of [-.11,.11])rod(g,green,[x,2.67,-.095],[x,2.13,.04],.018);ring(g,m.black,[0,2.43,.48],.19,.017,'z');rod(g,m.dark,[0,2.28,.65],[0,2.43,.49],.034);
 v.root.userData.nativeConstruction={version:3,bodySurfaceRevision:2,paintedLivery:true,originalReferenceGeometry:true,realWindowApertures:true,exposedTubeChassis:true,geometryLettering:true};v.root.userData.bodyRefinement={version:2,style:'monster',method:'Photo-fitted panel-wagon skin, flat mapped painted livery, exposed tubular cage, V8 and chevron tires',preservedHardpoints:true};v.root.userData.visualModel={version:1,landmarks:GRAVE_DIGGER_LANDMARKS};v.root.userData.nativeFidelity={version:3,bodyClearcoat:true,geometryLettering:true,factorySpokeProfile:'monster-deep-beadlock',monsterChevronTread:true,flatPaintedLivery:true};return v;
}
export const refineGraveDigger=(view,spec=view.spec)=>refineReferenceWheel(view,spec,wheel,tire);
