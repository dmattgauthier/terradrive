// Original V8 Urus Performante. Hand-authored reference reconstruction, not OEM CAD.
// Datum: tyre contact Y=0; axle midpoint Z=0; nose +Z. Units are metres.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {T,mesh,box,surface,polygon,mappedPolygon,line,curve,station,lerp,clamp,smooth} from './body-surface.mjs';
import {urusCabin} from './urus-cabin.mjs';
import {geometryText} from './vehicle-fidelity.mjs';
export const URUS_BODY_LANDMARKS={length:5.137,width:2.026,widthWithMirrors:2.181,height:1.618,wheelbase:3.006,
 roofFrontZ:-.06,roofRearZ:-1.12,cowlZ:.72,frontZ:2.5685,rearZ:-2.5685,beltFrontY:1.102,beltRearY:1.248,archRadius:.448};
export function urusView(spec){
 const view=new VehicleView(new T.Scene(),{...spec,bodyStyle:'sedan'}),g=view.body,m=view.materials;
 g.clear();g.position.set(0,-spec.cgHeight,(.5-spec.frontWeightFraction)*spec.wheelbase);
 const finish=(mat,role)=>{mat.userData.automotive=role;return mat;};
 const carbon=finish(new T.MeshPhysicalMaterial({color:'#15191b',roughness:.27,clearcoat:1,clearcoatRoughness:.16}),'carbon');carbon.userData.nativeRole='carbon';
 const black=finish(new T.MeshPhysicalMaterial({color:'#080a0b',roughness:.21,clearcoat:.7}),'black');
 const rubber=finish(new T.MeshStandardMaterial({color:'#101213',roughness:.66}),'rubber');
 const grille=finish(new T.MeshStandardMaterial({color:'#303337',roughness:.34,metalness:.9}),'metal');
 const dark=new T.MeshStandardMaterial({color:'#050708',roughness:.9});
 const drl=new T.MeshStandardMaterial({color:'#e2efff',emissive:'#d5e6ff',emissiveIntensity:.85,roughness:.2});
 finish(m.paint,'paint');finish(m.chrome,'metal');finish(m.interior,'plastic');finish(m.upholstery,'alcantara');
 m.paint.color.set('#f0c800');m.paint.metalness=0;m.paint.roughness=.22;m.paint.clearcoat=1;
 for(const mat of [m.glass,m.windscreen,m.privacyGlass]){mat.color.set('#172329');mat.opacity=mat===m.privacyGlass?.91:.64;mat.roughness=.10;}
 m.interior.color.set('#141618');m.upholstery.color.set('#17191c');m.headliner.color.set('#16191c');
 const front=2.5685,rear=-2.5685,wy=spec.tireRadius,arch=.448,axles=[-1.503,1.503];
 const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
 // Width, upper edge and shoulder are independent stations. The waist is
 // genuinely recessed; a material highlight cannot substitute for this shape.
 const rows=[[-2.48,.873,1.155],[-2.20,.951,1.239],[-1.80,.993,1.265],[-1.50,.998,1.256],[-1.12,.969,1.229],[-.55,.939,1.186],[.05,.931,1.144],[.72,.951,1.102],[1.22,.982,1.093],[1.54,.994,1.092],[1.92,.975,1.072],[2.26,.934,1.032],[2.48,.868,1.016]];
 const width=z=>station(rows,z,1),belt=z=>station(rows,z,2);
 const low=z=>Math.max(.27+.26*(1-smooth(z,-2.48,-2.05)),...axles.map(a=>Math.abs(z-a)<arch?wy+Math.sqrt(arch*arch-(z-a)**2):.27));
 const skinX=(y,z)=>{
  const h=belt(z),shoulder=h-.115,doors=smooth(z,-1.14,-.80)*(1-smooth(z,.70,1.01));
  const section=[[.24,.895],[.34,.940],[.45,.963],[.58,.956],[.73,.972],[shoulder-.055,.995],[shoulder,1],[h,.951]];
  const sorted=section.filter((p,i)=>i<5||p[0]>.74);
  return width(z)*station(sorted,y,1)-.008*doors*gauss(y,.57-.045*z,.105)+.008*gauss(z,-1.55,.55)*gauss(y,.91,.20);
 };
 const sidePoint=(s,z,y,offset=0)=>{
  const f=smooth(z,2.05,2.48),r=1-smooth(z,-2.48,-2.05);
  // Match the fascia's piecewise-linear boundary exactly. Smooth interpolation
  // here made a detached, curled strip along the bumper corners.
  const edge=[[.24,.89],[.261,.89],[.44,.977],[.883,.955],[1.016,.843],[1.04,.81]];
  const ei=Math.max(1,edge.findIndex(p=>p[0]>=y)),ea=edge[ei-1],eb=edge[ei];
  const nose=lerp(ea[1],eb[1],clamp((y-ea[0])/(eb[0]-ea[0]),0,1));
  const tail=station([[.25,.88],[.53,.938],[.76,.971],[1.04,.947],[1.155,.881]],y,1);
  const x=lerp(lerp(skinX(y,z),nose,f),tail,r);
  // Offset the original longitudinal coordinate toward the end boundary.
  // Blending the coordinate itself into an end point folded the last strips.
  const noseZ=front-.255*(x/.99)**2-.055*gauss(y,.66,.15),tailZ=rear+.245*(x/.99)**2;
  return[s*(x+offset),y,z+f*(noseZ-2.48)+r*(tailZ+2.48)];
 };
 const seam=(s,points)=>{const path=new T.CatmullRomCurve3(points.map(([z,y])=>new T.Vector3(z,y,0)));line(g,dark,Array.from({length:181},(_,i)=>{const p=path.getPoint(i/180);return sidePoint(s,p.x,p.y,.002);}),.0016);};
 const quad=(mat,a,b,c,d,nu=20,nv=12)=>surface(g,mat,nu,nv,(u,v)=>a.map((n,k)=>lerp(lerp(n,b[k],u),lerp(d[k],c[k],u),v)));
 function inset(points,scale){const center=points.reduce((a,p)=>a.map((v,k)=>v+p[k]/points.length),[0,0]);return points.map(p=>p.map((v,k)=>lerp(center[k],v,scale)));}
 function opening(contour,map,depth,lip=.005){
  mappedPolygon(g,dark,contour,(x,y)=>{const p=map(x,y);p[2]-=depth;return p;},[],false,12);
  const lipPoints=[];
  for(let j=0;j<contour.length;j++){
   const a=contour[j],b=contour[(j+1)%contour.length];
   surface(g,carbon,24,4,(u,v)=>{const p=map(lerp(a[0],b[0],u),lerp(a[1],b[1],u));p[2]-=depth*v;return p;});
   for(let k=0;k<24;k++)lipPoints.push(map(lerp(a[0],b[0],k/24),lerp(a[1],b[1],k/24)));
  }
  line(g,black,[...lipPoints,lipPoints[0]],lip);
 }
 for(const s of [-1,1]){
  surface(g,m.paint,260,60,(u,v)=>{const z=lerp(-2.48,2.48,u);return sidePoint(s,z,lerp(low(z),belt(z),v));},s>0);
  surface(g,carbon,45,16,(u,v)=>{const z=lerp(-2.48,-2.05,u);return sidePoint(s,z,lerp(.27,low(z)+.003,v),.001);},s>0);
  // Faceted, body-following carbon arch flares, including the nearly flat crown.
  for(const axle of axles){
   const rimPoint=(a,r,v)=>{const z=axle+r*Math.cos(a),y=wy+r*Math.sin(a),x=lerp(skinX(y,z)+.003,1.013,v);return[s*x,y,z];};
   surface(g,carbon,100,9,(u,v)=>{const a=lerp(-.28,Math.PI+.28,u),r=lerp(arch+.002,Math.min(.512,.487/Math.max(.01,Math.sin(a))),v);return rimPoint(a,r,1-v*.65);},s<0);
   surface(g,rubber,90,6,(u,v)=>{const a=lerp(-.27,Math.PI+.27,u),z=axle+arch*Math.cos(a),y=wy+arch*Math.sin(a);return[s*lerp(.76,1.013,v),y,z];},s<0);
  }
  // Sculpted rocker: broad carbon blade, raised leading arrow and a tucked sill.
  const rocker=[[-1.08,.266],[-.91,.382],[.66,.433],[1.04,.555],[.94,.357],[.79,.286]];
  mappedPolygon(g,carbon,rocker,(z,y)=>sidePoint(s,z,y,.014),[],s>0,16);
  line(g,black,rocker.map(([z,y])=>sidePoint(s,z,y,.016)),.004);
  seam(s,[[.70,1.10],[.69,.91],[.67,.66],[.60,.43],[.39,.331],[-.53,.337],[-.66,.45],[-.64,.85],[-.61,1.19]]);
  seam(s,[[-.61,1.19],[-.64,.91],[-.69,.62],[-.82,.405],[-1.00,.407],[-1.07,.67],[-1.27,1.235]]);
  for(const z of [-.37,-1.22]){
   const y=belt(z)-.077;box(g,black,sidePoint(s,z,y,.006),[.009,.026,.153],.003);
   box(g,m.paint,sidePoint(s,z,y+.004,.012),[.019,.018,.137],.004);
  }
  // Low front-fender outlet is recessed and finishes at the front door seam.
  const vent=[[.99,1.030],[.75,1.085],[.76,.965]];
  mappedPolygon(g,carbon,vent,(z,y)=>sidePoint(s,z,y,.008),[],s>0);
  for(let j=0;j<3;j++)line(g,grille,[[.77,.983+j*.019],[.87,1.007+j*.017]].map(([z,y])=>sidePoint(s,z,y,.013)),.002);
 }
 // A continuous painted greenhouse surround, with inset flush glass. The
 // previous independent rail tubes left gaps and looked like a roll cage.
 const roof=[[-2.20,1.252,.875],[-1.94,1.386,.835],[-1.53,1.555,.783],[-1.13,1.603,.748],[-.62,1.609,.734],[-.06,1.578,.735],[.24,1.438,.785],[.72,1.136,.855]];
 const sideGlass=[[[.636,1.143],[.006,1.534],[-.536,1.547],[-.586,1.217]],
  [[-.655,1.224],[-.607,1.548],[-1.170,1.521],[-1.360,1.284]],
  [[-1.413,1.287],[-1.255,1.494],[-1.470,1.431],[-1.700,1.348],[-1.840,1.316],[-1.860,1.298],[-1.730,1.285]]];
 const canopyPoint=(s,z,y,offset=0)=>{
  const h=station(roof,z,1),t=(y-belt(z))/(h-belt(z));
  const base=sidePoint(s,z,belt(z));
  return[s*(lerp(Math.abs(base[0]),station(roof,z,2),t)+.010*Math.sin(Math.PI*t)+offset),y,lerp(base[2],z,t)];
 };
 for(const s of [-1,1]){
  const silhouette=[...Array.from({length:100},(_,i)=>{const z=lerp(.72,-2.20,i/99);return[z,station(roof,z,1)];}),...Array.from({length:100},(_,i)=>{const z=lerp(-2.20,.72,i/99);return[z,belt(z)];})];
  mappedPolygon(g,m.paint,silhouette,(z,y)=>canopyPoint(s,z,y),sideGlass,s>0,16);
  // The inside of a pillar is trimmed, not the exterior body color. Keep
  // genuine window apertures and place the liner behind the exterior shell.
  mappedPolygon(g,m.interior,silhouette,(z,y)=>canopyPoint(s,z,y,-.014),sideGlass,s<0,16);
  for(const [i,contour]of sideGlass.entries()){
   const glass=inset(contour,.945),map=([z,y],off=0)=>canopyPoint(s,z,y,off);
   mappedPolygon(g,black,contour,(z,y)=>map([z,y],.002),[glass],s>0,12);
   // Fan patches curve into the center without stretching a single giant quad.
   const center=glass.reduce((c,p)=>c.map((v,k)=>v+p[k]/glass.length),[0,0]);
   for(let j=0;j<glass.length;j++)surface(g,i?m.privacyGlass:m.glass,16,16,(u,v)=>{
    const a=glass[j],b=glass[(j+1)%glass.length],p=center.map((n,k)=>lerp(n,lerp(a[k],b[k],u),v));return map(p,-.003+.006*(1-v*v));
   },s<0);
  }
  // Black B pillar and waist reveal. No tubes along the painted roof.
  mappedPolygon(g,black,[[-.536,1.547],[-.607,1.548],[-.655,1.224],[-.586,1.217]],(z,y)=>canopyPoint(s,z,y,.003),[],s>0);
  mappedPolygon(g,black,[[-1.170,1.521],[-1.255,1.494],[-1.413,1.287],[-1.360,1.284]],(z,y)=>canopyPoint(s,z,y,.003),[],s>0);
  curve(g,black,[[.64,1.135],[-.58,1.207],[-1.38,1.260],[-1.94,1.296]].map(([z,y])=>canopyPoint(s,z,y,.004)),.004);
  const stemA=canopyPoint(s,.49,1.162),stemB=[s*.965,1.207,.49];line(g,black,[stemA,stemB],.014);
  // Aerodynamic angular mirror cap and recessed reflecting face.
  const cap=mesh(g,new T.SphereGeometry(1,40,24),carbon,[s*.991,1.210,.48]);cap.scale.set(.0995,.057,.105);
  box(g,m.chrome,[s*.994,1.208,.394],[.152,.066,.006],.007);
 }
 const canopy=(u,z,off=0)=>{const t=u*2-1;return[t*station(roof,z,2),station(roof,z,1)+.009*(1-t*t)+off,z];};
 surface(g,carbon,72,76,(u,v)=>canopy(u,lerp(-1.13,-.06,v)),true);
 surface(g,m.headliner,64,64,(u,v)=>{const p=canopy(lerp(.025,.975,u),lerp(-1.13,-.06,v));p[1]-=.016;return p;});
 // Windshield lies within a black ceramic perimeter, with two physical wipers.
 surface(g,black,72,48,(u,v)=>canopy(u,lerp(-.06,.72,v)),true);
 surface(g,m.windscreen,72,48,(u,v)=>canopy(lerp(.025,.975,u),lerp(-.035,.695,v),.0025),true);
 for(const s of [-1,1])curve(g,rubber,[[s*.10,1.175,.68],[s*.31,1.189,.653],[s*.61,1.191,.647]],.005);
 // Rear hatch glass is bounded by a substantial painted D-pillar and spoiler.
 surface(g,m.paint,76,60,(u,v)=>canopy(u,lerp(-2.20,-1.13,v)),true);
 surface(g,black,68,48,(u,v)=>canopy(lerp(.095,.905,u),lerp(-2.12,-1.22,v),.003),true);
 surface(g,m.privacyGlass,64,44,(u,v)=>canopy(lerp(.112,.888,u),lerp(-2.093,-1.235,v),.006),true);
 for(let j=0;j<8;j++)curve(g,rubber,Array.from({length:24},(_,k)=>canopy(lerp(.13,.87,k/23),-2.04+j*.105,.008)),.0006);
 curve(g,black,[canopy(.49,-2.05,.011),canopy(.37,-2.01,.013),canopy(.24,-1.95,.013)],.005);
 // Bonnet: deep outer cooling apertures, raised fender ridges and a pointed
 // central carbon panel; the perimeter is crowned rather than a flat plane.
 const hoodRows=[[.72,1.156,.81],[1.08,1.128,.849],[1.50,1.104,.870],[1.93,1.073,.844],[2.27,1.033,.762],[2.48,.980,.64]];
 const hood=(x,z,off=0)=>{const t=x/station(hoodRows,z,2);return[x,station(hoodRows,z,1)+.022*(1-t*t)+.016*gauss(Math.abs(t),.79,.12)+off,z];};
 surface(g,m.paint,100,110,(u,v)=>{const z=lerp(.72,2.48,v);return hood((2*u-1)*station(hoodRows,z,2),z);},true);
 surface(g,carbon,80,100,(u,v)=>{const z=lerp(.75,2.30,v),w=station([[.75,.598],[1.22,.584],[1.82,.523],[2.14,.426],[2.25,.324],[2.30,.05]],z,1);return hood((u*2-1)*w,z,.002);},true);
 for(const s of [-1,1]){
  surface(g,m.paint,110,12,(u,v)=>{const z=lerp(.72,2.48,u),a=hood(s*station(hoodRows,z,2),z),b=sidePoint(s,z,belt(z));return a.map((n,k)=>lerp(n,b[k],v));},s<0);
  curve(g,dark,Array.from({length:65},(_,i)=>{const z=lerp(.74,2.34,i/64);return hood(s*(station(hoodRows,z,2)-.014),z,.002);}),.0014);
  const outline=[[.613,1.27],[.752,1.34],[.691,1.83],[.575,1.96],[.552,1.87]],vent=outline.map(([x,z])=>hood(s*x,z,.004));
  mappedPolygon(g,carbon,outline,(x,z)=>hood(s*x,z,.004),[],s>0,14);line(g,black,[...vent,vent[0]],.004);
  for(let j=0;j<9;j++){const z=1.37+j*.052;quad(grille,hood(s*(.612-.075*(z-1.37)),z,.009),hood(s*(.735-.130*(z-1.37)),z+.015,.009),hood(s*(.731-.130*(z-1.37)),z+.024,.011),hood(s*(.611-.075*(z-1.37)),z+.009,.011),8,2);}
 }
 // Wrapped front fascia. Real apertures, a broad splitter and boxed air
 // curtains replace the old flat hexagons and tubular bumper guard.
 const face=(x,y,d=0)=>[x,y,front-.255*(Math.abs(x)/.99)**2-.055*gauss(y,.66,.15)+d];
 const outline=[[-.977,.44],[-.955,.883],[-.843,1.016],[-.46,1.026],[0,.977],[.46,1.026],[.843,1.016],[.955,.883],[.977,.44],[.89,.261],[.53,.258],[.42,.309],[-.42,.309],[-.53,.258],[-.89,.261]];
 const openings=[[[-.443,.850],[-.354,.883],[.354,.883],[.443,.850],[.402,.736],[-.402,.736]],
  [[-.438,.616],[-.337,.694],[.337,.694],[.438,.616],[.614,.347],[-.614,.347]],
  [[-.918,.798],[-.562,.812],[-.479,.669],[-.739,.378],[-.896,.346],[-.951,.486]],
  [[.918,.798],[.562,.812],[.479,.669],[.739,.378],[.896,.346],[.951,.486]]];
 mappedPolygon(g,m.paint,outline,face,openings,false,16);
 for(const contour of openings)opening(contour,face,.105,.004);
 // Thin real horizontal bars over a recessed cellular radiator.
 for(let j=0;j<4;j++)quad(grille,face(-.36,.407+j*.065,-.060),face(.36,.407+j*.065,-.060),face(.36,.416+j*.065,-.062),face(-.36,.416+j*.065,-.062),30,2);
 for(const s of [-1,1])for(let j=0;j<4;j++)quad(black,face(s*.60,.465+j*.074,-.045),face(s*.883,.485+j*.070,-.045),face(s*.883,.498+j*.070,-.046),face(s*.60,.478+j*.074,-.046),20,2);
 for(let y=.40;y<.63;y+=.035)for(let x=-.31;x<.32;x+=.040){const cell=Array.from({length:7},(_,i)=>face(x+.018*Math.cos(i*Math.PI/3),y+.017*Math.sin(i*Math.PI/3),-.09));line(g,grille,cell,.0011);}
 surface(g,carbon,90,8,(u,v)=>{const x=(u*2-1)*.965,y=.246+.025*Math.abs(x)/.965;const a=face(x,y,.028),b=face(x,y+.012,-.18);return a.map((n,k)=>lerp(n,b[k],v));},true);
 surface(g,m.paint,72,8,(u,v)=>{const x=(u*2-1)*lerp(.64,.843,v),a=hood((u*2-1)*.64,2.48),b=face(x,station([[0,.977],[.46,1.026],[.843,1.016]],Math.abs(x),1));return a.map((n,k)=>lerp(n,b[k],v));},true);
 for(const s of [-1,1]){
  const outline=[[.434,.967],[.488,1.028],[.857,1.027],[.956,.958],[.882,.914],[.511,.921]];
  mappedPolygon(g,black,outline,(x,y)=>face(s*x,y,.009),[],s<0,12);
  const light=([x,y])=>face(s*x,y,.017);
  // Lamborghini Y light guide, individual projector lenses and dark surround.
  line(g,drl,[[.515,.943],[.806,.945],[.892,.978]].map(light),.0045);
  line(g,drl,[[.806,.945],[.914,.939]].map(light),.0045);
  for(let j=0;j<3;j++){const p=face(s*(.644+j*.076),.981,.015);box(g,grille,p,[.053,.026,.010],.004);box(g,m.headlampReflector,[p[0],p[1],p[2]+.007],[.032,.016,.007],.003);}
  // Long air curtain wraps around the outside of each side intake.
  mappedPolygon(g,carbon,[[.941,.818],[.987,.764],[.994,.441],[.921,.315],[.902,.374],[.953,.504]],(x,y)=>face(s*x,y,.006),[],s<0,12);
 }
 polygon(g,m.badge,[face(-.024,.944,.008),face(.024,.944,.008),face(.020,.908,.008),face(0,.891,.008),face(-.020,.908,.008)]);
 box(g,black,face(0,.800,.007),[.073,.027,.012],.003);
 // Full hatch, broad rear shoulders and recessed plate pocket. The rear
 // corners taper in plan view; exhaust outlets sit inside the diffuser.
 const tail=(x,y,d=0)=>[x,y,rear+.245*(Math.abs(x)/.99)**2+.055*gauss(y,.70,.16)*gauss(x,0,.41)+d];
 surface(g,m.paint,100,54,(u,v)=>{const y=lerp(.53,1.155,v),w=station([[.53,.938],[.76,.971],[1.04,.947],[1.155,.881]],y,1);return tail((u*2-1)*w,y);});
 surface(g,m.paint,90,28,(u,v)=>{const x=(2*u-1)*lerp(.881,.875,v),a=tail(x,1.155),b=canopy(u,-2.20);return a.map((n,k)=>lerp(n,b[k],v));},true);
 surface(g,carbon,90,28,(u,v)=>{const y=lerp(.252,.58,v),x=(2*u-1)*lerp(.88,.938,v);return tail(x,y,.06*(1-v));});
 const plateOutline=[[-.31,.858],[.31,.858],[.365,.754],[.291,.643],[-.291,.643],[-.365,.754]];
 mappedPolygon(g,black,[[-.37,1.145],[.37,1.145],[.37,1.044],[-.37,1.044]],(x,y)=>tail(x,y,-.008),[],true,12);
 mappedPolygon(g,black,plateOutline,(x,y)=>tail(x,y,-.006),[],true,14);
 const plate=finish(new T.MeshStandardMaterial({color:'#bfc5c7',roughness:.34}),'metal');
 box(g,plate,tail(0,.747,-.014),[.428,.101,.008],.004);
 const text=geometryText(g,'TD 2024',.31,.041,black);text.position.set(0,.727,rear+.025);text.rotation.y=Math.PI;
 for(const s of [-1,1]){
  const outline=[[.245,1.095],[.345,1.150],[.870,1.142],[.948,1.083],[.870,1.028],[.335,1.039]];
  mappedPolygon(g,black,outline,(x,y)=>tail(s*x,y,-.010),[],s>0,12);
  const light=([x,y])=>tail(s*x,y,-.020);
  line(g,m.red,[[.420,1.082],[.780,1.080],[.908,1.113]].map(light),.006);
  line(g,m.red,[[.780,1.080],[.908,1.050]].map(light),.005);
  box(g,m.reverse,tail(s*.814,1.045,-.021),[.107,.012,.009],.002);
  // Reflectors and parking sensors belong to the bumper, not the tail lamps.
  box(g,m.red,tail(s*.792,.577,-.011),[.175,.019,.009],.003);
  for(const x of [.45,.87]){const sensor=mesh(g,new T.CircleGeometry(.007,20),black,tail(s*x,.648,-.006));sensor.rotation.y=Math.PI;}
  for(const x of [.663,.811]){
   const p=tail(s*x,.414,-.010),tip=mesh(g,new T.CylinderGeometry(.051,.048,.108,48,1,true),m.chrome,[p[0],p[1],p[2]+.043]);tip.rotation.x=Math.PI/2;
   const bore=mesh(g,new T.CircleGeometry(.044,48),dark,[p[0],p[1],p[2]-.011]);bore.rotation.y=Math.PI;
  }
  const inlet=[[.56,.491],[.899,.499],[.905,.326],[.579,.323]];mappedPolygon(g,dark,inlet,(x,y)=>tail(s*x,y,-.003),[],s>0,10);
 }
 for(let j=-2;j<=2;j++)box(g,carbon,tail(j*.145,.303,.060),[.010,.094,.265],.002);
 const marque=geometryText(g,'LAMBORGHINI',.46,.028,m.chrome);marque.position.set(0,1.080,rear-.016);marque.rotation.y=Math.PI;
 const badge=geometryText(g,'URUS',.143,.025,m.chrome);badge.position.set(-.61,.909,rear+.075);badge.rotation.y=Math.PI;
 // Roof spoiler is a broad blade, with vertical end fins and a continuous
 // lower rear lip. The trailing edge follows the sloping hatch silhouette.
 surface(g,carbon,72,22,(u,v)=>{const x=(u*2-1)*lerp(.763,.855,v);return[x,1.608-.025*v-.012*(x/.855)**2,lerp(-1.20,-1.58,v)];},true);
 for(const s of [-1,1])polygon(g,carbon,[[s*.758,1.607,-1.20],[s*.855,1.578,-1.58],[s*.872,1.491,-1.65],[s*.799,1.512,-1.39]],0);
 box(g,m.red,[0,1.568,-1.582],[.466,.010,.009],.002);
 box(g,rubber,[0,.227,-.10],[1.46,.035,2.73]);
 urusCabin(g,m,carbon);
 view.root.userData.visualModel={type:'Reference-built continuous coachwork and cabin',version:5,importedManufacturerCAD:false,landmarks:URUS_BODY_LANDMARKS};return view;
}
