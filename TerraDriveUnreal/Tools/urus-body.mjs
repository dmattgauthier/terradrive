// Original V8 Performante, authored from Lamborghini's 2024 brochure plates.
// Ground datum Y=0, axle midpoint Z=0. No manufacturer CAD or purchased mesh.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {T,mesh,box,surface,polygon,line,curve,station,lerp,clamp,smooth} from './body-surface.mjs';
export const URUS_BODY_LANDMARKS={length:5.137,width:2.026,height:1.618,wheelbase:3.006,
 roofFrontZ:-.06,roofRearZ:-1.12,cowlZ:.69,frontZ:2.5685,rearZ:-2.5685,beltFrontY:1.074,beltRearY:1.205,archRadius:.438};
export function urusView(spec){
 const view=new VehicleView(new T.Scene(),{...spec,bodyStyle:'sedan'}),g=view.body,m=view.materials;
 g.clear();g.position.set(0,-spec.cgHeight,(.5-spec.frontWeightFraction)*spec.wheelbase);
 const carbon=new T.MeshPhysicalMaterial({color:'#111719',roughness:.44,metalness:.03,clearcoat:.24,clearcoatRoughness:.15});
 const dark=new T.MeshStandardMaterial({color:'#080b0c',roughness:.79}),grille=new T.MeshStandardMaterial({color:'#293031',roughness:.47,metalness:.25});
 const drl=new T.MeshStandardMaterial({color:'#d5e5eb',emissive:'#c8eaff',emissiveIntensity:1.15,roughness:.18});
 const tint=m.privacyGlass;tint.opacity=.70;tint.color.set('#263941');
 m.interior.color.set('#151b1e');m.upholstery.color.set('#12171b');m.windscreen.color.set('#485962');m.windscreen.opacity=.54;
 const front=2.5685,rear=-2.5685,axles=[-spec.wheelbase/2,spec.wheelbase/2],wy=spec.tireRadius,arch=.438,bottom=.268;
 // Z, sheet half-width, shoulder height: broad haunches, tapered nose/tail.
 const rows=[[rear,.855,1.055],[-2.43,.947,1.119],[-2.08,.982,1.193],[-1.58,.996,1.213],[-1.02,.958,1.183],[-.30,.945,1.128],[.46,.952,1.076],[1.15,.985,1.045],[1.52,.996,1.035],[1.93,.979,1.021],[2.29,.949,.990],[2.47,.877,.964],[front,.62,.946]];
 const belt=z=>station(rows,z,2),width=z=>station(rows,z,1);
 const low=z=>{let y=bottom;for(const a of axles){const d=Math.abs(z-a);if(d<arch)y=Math.max(y,wy+Math.sqrt(arch*arch-d*d));}return y;};
 const skinX=(y,z)=>{const high=belt(z),t=clamp((y-bottom)/(high-bottom),0,1),doors=smooth(z,-1.06,-.80)*(1-smooth(z,.74,.99)),rising=.40-.060*z;
  return width(z)-.048*(1-t)+.009*Math.sin(t*Math.PI)-.032*doors*Math.exp(-(((y-rising-.075)/.125)**2))-.015*doors*Math.exp(-(((y-high+.10)/.038)**2))+.009*Math.exp(-(((y-high+.02)/.025)**2));};
 const noseOutline=[[.268,.81],[.291,.83],[.45,.98],[.89,.95],[.964,.879],[1.01,.84]],tailOutline=[[.268,.88],[.56,.943],[1.08,.943],[1.20,.94]];
 const sidePoint=(s,z,y,off=0)=>{
  const f=smooth(z,2.18,2.41),r=1-smooth(z,-2.42,-2.22);
  let x=lerp(skinX(y,z),station(noseOutline,y,1),f);x=lerp(x,station(tailOutline,y,1),r);
  const zz=lerp(lerp(z,front-.18*(x/.99)**2,f),rear+.168*(x/.99)**2,r);
  return[s*(x+off),y,zz];
 };
 for(const s of [-1,1]){
  // Side sheets stop at the wrapped fascia. Extending both sheets all the
  // way to the centre-line nose/tail creates opaque pillars over the lamps.
  surface(g,m.paint,240,40,(u,v)=>{const z=lerp(-2.42,2.41,u),y=lerp(low(z),belt(z),v);return sidePoint(s,z,y);},s>0);
  surface(g,m.paint,160,16,(u,v)=>{const z=lerp(-2.04,.69,u),w=width(z);return[s*lerp(.872,w,v),belt(z)+.025*Math.sin(v*Math.PI/2),z];},s<0);
  for(const a of axles){
   surface(g,carbon,84,10,(u,v)=>{const angle=lerp(-.23,Math.PI+.23,u),outer=angle>1.19&&angle<1.95?.483/Math.sin(angle):.492,r=lerp(arch+.002,outer,v),z=a+r*Math.cos(angle),y=wy+r*Math.sin(angle);return[s*(Math.min(1.013,width(z)+.022)+.007*Math.sin(v*Math.PI)),y,z];},s<0);
   surface(g,dark,72,5,(u,v)=>{const angle=lerp(-.22,Math.PI+.22,u),z=a+arch*Math.cos(angle),y=wy+arch*Math.sin(angle);return[s*lerp(.80,Math.min(1.007,width(z)+.019),v),y,z];},s<0);
  }
  // The rear quarter narrows to a point and climbs with the beltline. All
  // pillars are physical painted/black surfaces, not one rectangular window.
  const win=[[.67,1.104,.864],[.045,1.547,.739],[-.73,1.559,.747],[-1.28,1.493,.784],[-1.95,1.234,.907],[-1.75,1.208,.919]];
  const point=([z,y,x],off=0)=>[s*(x+off),y,z];polygon(g,dark,win.map(p=>point(p)),0);
  const windows=[[[.60,1.131,.875],[.002,1.536,.749],[-.54,1.551,.752],[-.57,1.161,.916]],[[-.64,1.166,.919],[-.61,1.549,.755],[-1.22,1.486,.795],[-1.62,1.213,.920]],[[-1.69,1.219,.924],[-1.34,1.444,.814],[-1.87,1.248,.909]]];
  for(const [i,pts]of windows.entries())polygon(g,i?tint:m.glass,pts.map(p=>point(p,.003)),0);
  curve(g,m.paint,[[s*.878,1.105,.71],[s*.752,1.558,.04],[s*.751,1.595,-.62],[s*.792,1.530,-1.28],[s*.920,1.225,-2.01]],.019);
  curve(g,carbon,[[s*.870,1.108,.67],[s*.916,1.153,-.56],[s*.932,1.197,-1.29],[s*.924,1.221,-1.79],[s*.916,1.239,-1.94]],.009);
  for(const pts of [[[.64,1.075],[.64,.74],[.63,.44],[.45,.316],[-.48,.316],[-.62,.40],[-.63,1.15]],[[-.63,1.15],[-.65,.70],[-.65,.39],[-.84,.32],[-.98,.34],[-1.02,.65],[-1.19,1.18]]])curve(g,dark,pts.map(([z,y])=>sidePoint(s,z,y,.0017)),.0018);
  for(const z of [-.38,-1.19]){const y=belt(z)-.070;box(g,dark,sidePoint(s,z,y,.004),[.009,.025,.142],.004);box(g,carbon,sidePoint(s,z,y+.002,.010),[.017,.014,.128],.003);}
  surface(g,carbon,70,8,(u,v)=>{const z=lerp(-1.02,1.01,u),y=.258+v*.091;return[s*(.910+.056*Math.sin(v*Math.PI/2)),y,z];},s>0);
  curve(g,m.paint,[[-1.03,.354],[-.66,.368],[.15,.422],[.91,.470]].map(([z,y])=>sidePoint(s,z,y,.003)),.007);
  polygon(g,dark,[[s*.971,.86,.87],[s*.966,1.009,.89],[s*.962,1.011,.70]],0);
  for(let i=0;i<4;i++)line(g,grille,[[s*.976,.894+i*.025,.854],[s*.973,.902+i*.024,.756+i*.025]],.003);
  curve(g,carbon,[[s*.892,1.135,.50],[s*.971,1.172,.50],[s*1.015,1.185,.49]],.016);
  const mirror=mesh(g,new T.SphereGeometry(1,40,20),carbon,[s*1.034,1.195,.47]);mirror.scale.set(.056,.055,.125);
  box(g,m.chrome,[s*1.087,1.194,.459],[.006,.065,.161],.013);
 }
 // Crowned bonnet and exposed-carbon inset follow the same curved surface.
 const hoodRows=[[.69,1.163,.77],[1.12,1.118,.84],[1.57,1.083,.85],[2.02,1.044,.81],[2.32,1.002,.73],[2.47,.982,.60]];
 const hood=(x,z,off=0)=>{const w=station(hoodRows,z,2),t=x/w;return[x,station(hoodRows,z,1)+.026*(1-t*t)+.017*Math.exp(-(((Math.abs(t)-.77)/.105)**2))+off,z];};
 surface(g,m.paint,72,90,(u,v)=>{const z=lerp(.69,2.47,v);return hood((u*2-1)*station(hoodRows,z,2),z);},true);
 for(const s of [-1,1])surface(g,m.paint,110,16,(u,v)=>{
  const z=lerp(.69,2.41,u),w=station(hoodRows,z,2),a=hood(s*w,z),b=sidePoint(s,z,belt(z));
  return[lerp(a[0],b[0],v),lerp(a[1],b[1],v)+.009*Math.sin(v*Math.PI),lerp(a[2],b[2],v)];
 },s<0);
 const noseTop=[[0,.950],[.48,1.003],[.84,.991]];
 surface(g,m.paint,72,12,(u,v)=>{const x=(u*2-1)*lerp(.60,.84,v),a=hood((u*2-1)*.60,2.47),y=station(noseTop,Math.abs(x),1),z=front-.18*(Math.abs(x)/.99)**2;return[x,lerp(a[1],y,v),lerp(a[2],z,v)];},true);
 surface(g,carbon,56,72,(u,v)=>{const z=lerp(.73,2.20,v);return hood((u*2-1)*lerp(.605,.43,smooth(v,.10,1)),z,.0015);},true);
 for(const s of [-1,1]){
  curve(g,dark,Array.from({length:65},(_,i)=>{const z=lerp(.72,2.29,i/64);return hood(s*(station(hoodRows,z,2)-.023),z,.002);}),.0017);
  polygon(g,dark,[[.615,1.30],[.75,1.43],[.651,2.004],[.571,1.947]].map(([x,z])=>hood(s*x,z,.003)),1);
  for(let i=0;i<8;i++){const z=1.42+i*.062;line(g,grille,[hood(s*(.640-.045*(z-1.42)),z,.006),hood(s*(.724-.152*(z-1.42)),z+.015,.006)],.003);}
 }
 const canopy=[[-2.04,1.214,.885],[-1.80,1.341,.843],[-1.35,1.522,.781],[-1.12,1.589,.752],[-.70,1.603,.742],[-.06,1.577,.730],[.69,1.155,.843]];
 const glassRail=[[-2.04,1.227,.916],[-1.95,1.234,.907],[-1.28,1.493,.784],[-.73,1.559,.747],[.045,1.547,.739],[.67,1.104,.864],[.69,1.103,.868]];
 // Continuous roof rails/A and D pillars close the strips between the bowed
 // canopy and the side glazing. Tubes alone leave daylight through the body.
 for(const s of [-1,1])surface(g,m.paint,180,10,(u,v)=>{const z=lerp(-2.04,.69,u);return[s*lerp(station(canopy,z,2),station(glassRail,z,2),v),lerp(station(canopy,z,1),station(glassRail,z,1),v)+.004*Math.sin(v*Math.PI),z];},s>0);
 for(const [a,b,mat,bow,nu,nv]of [[-.06,.69,m.windscreen,.021,64,46],[-1.12,-.06,carbon,.015,64,58],[-2.04,-1.12,tint,.012,64,44]])surface(g,mat,nu,nv,(u,v)=>{const z=lerp(a,b,v),t=u*2-1;return[t*station(canopy,z,2),station(canopy,z,1)+bow*(1-t*t),z];},true);
 surface(g,m.paint,64,36,(u,v)=>{const z=lerp(rear,-2.04,v),t=u*2-1,x=t*(width(z)-.03);return[x,belt(z)+.016*(1-t*t),lerp(rear+.168*(x/.99)**2,-2.04,v)];},true);
 // Cut the distinct hexagonal intakes into a wrapped nose sheet. Carbon
 // reveals and deeply recessed louvres make the painted bridges legible.
 const face=(x,y,d=0)=>[x,y,front-.18*(Math.abs(x)/.99)**2+d];
 const outline=[[-.98,.45],[-.95,.89],[-.84,.991],[-.48,1.003],[0,.950],[.48,1.003],[.84,.991],[.95,.89],[.98,.45],[.83,.291],[.57,.300],[.44,.365],[-.44,.365],[-.57,.300],[-.83,.291]];
 const openings=[[[-.49,.809],[-.40,.852],[.40,.852],[.49,.809],[.43,.718],[-.43,.718]],[[-.43,.633],[-.34,.686],[.34,.686],[.43,.633],[.62,.386],[-.62,.386]],[[-.92,.768],[-.55,.806],[-.47,.668],[-.74,.407],[-.88,.373],[-.95,.479]],[[.92,.768],[.55,.806],[.47,.668],[.74,.407],[.88,.373],[.95,.479]]];
 polygon(g,m.paint,outline.map(p=>face(...p)),2,openings.map(h=>h.map(p=>face(...p))));
 for(const h of openings){const pts=h.map(p=>face(...p)),inner=h.map(([x,y])=>face(x*.98,y,-.065));polygon(g,dark,inner,2);for(let j=0;j<h.length;j++)polygon(g,carbon,[pts[j],pts[(j+1)%h.length],inner[(j+1)%h.length],inner[j]],2);line(g,carbon,[...pts,pts[0]],.008);}
 for(let j=0;j<4;j++)line(g,grille,[face(-.36,.437+j*.059,-.042),face(.36,.437+j*.059,-.042)],.009);
 for(const s of [-1,1])for(let j=0;j<4;j++)line(g,grille,[face(s*.61,.454+j*.072,-.038),face(s*.88,.471+j*.069,-.038)],.006);
 curve(g,carbon,[face(-.97,.305,.005),face(-.81,.251,.019),face(-.57,.265,.034),face(0,.307,.031),face(.57,.265,.034),face(.81,.251,.019),face(.97,.305,.005)],.021);
 polygon(g,m.badge,[face(-.026,.921,.010),face(.026,.921,.010),face(.020,.880,.011),face(0,.866,.011),face(-.020,.880,.011)]);box(g,dark,face(0,.789,.010),[.074,.029,.013],.004);
 // Continuous rear face sits behind the lamp shells and number-plate recess.
 surface(g,m.paint,100,40,(u,v)=>{const x=(u*2-1)*.943;return[x,lerp(.56,1.083,v),rear+.168*(Math.abs(x)/.99)**2];},true);
 surface(g,carbon,80,22,(u,v)=>{const x=(u*2-1)*.936;return[x,lerp(.275,.57,v),rear+.13*(Math.abs(x)/.99)**2+.08*(1-v)];},true);
 for(const s of [-1,1]){
  const lamp=[[s*.43,.928],[s*.48,1.009],[s*.89,1.002],[s*.957,.943],[s*.887,.898],[s*.52,.886]];polygon(g,dark,lamp.map(([x,y])=>face(x,y,.012)),2);
  const l=([x,y])=>face(s*x,y,.022);curve(g,drl,[[.91,.933],[.83,.918],[.60,.912],[.51,.944]].map(l),.006);line(g,drl,[[.60,.912],[.52,.899]].map(l),.005);
  for(let j=0;j<3;j++)box(g,m.headlampReflector,face(s*(.64+j*.074),.956,.021),[.044,.021,.015],.005);
  const tf=(x,y,d=0)=>[s*x,y,rear+.17*(x/.99)**2-d];
  polygon(g,dark,[[.21,1.042],[.33,1.110],[.89,1.104],[.955,1.026],[.88,.975],[.32,.987]].map(p=>tf(...p,.009)));
  curve(g,m.red,[[.91,1.063],[.77,1.046],[.54,1.051],[.42,1.082]].map(p=>tf(...p,.019)),.008);line(g,m.red,[[.54,1.051],[.43,1.013]].map(p=>tf(...p,.019)),.006);box(g,m.reverse,tf(.81,.991,.024),[.119,.016,.012],.003);
  for(const x of [.682,.838]){const tip=mesh(g,new T.CylinderGeometry(.047,.051,.16,40,1,true),m.chrome,[s*x,.393,rear+.081]);tip.rotation.x=Math.PI/2;const inner=mesh(g,new T.CircleGeometry(.040,40),dark,[s*x,.393,rear]);inner.rotation.y=Math.PI;}
  curve(g,carbon,[[s*.74,1.586,-1.10],[s*.84,1.550,-1.36],[s*.89,1.497,-1.48]],.018);
 }
 box(g,dark,[0,.756,rear-.012],[.52,.166,.024],.018);box(g,m.badge,[0,.752,rear-.030],[.395,.093,.008],.003);
 for(let i=-3;i<=3;i++)box(g,carbon,[i*.18,.296,rear+.07],[.013,.108,.34],.005);
 surface(g,carbon,64,20,(u,v)=>{const x=(u*2-1)*lerp(.82,.88,v);return[x,1.590-.045*v+.018*Math.sin(v*Math.PI)-.013*(x/.88)**2,lerp(-1.20,-1.47,v)];},true);
 box(g,m.red,[0,1.541,-1.477],[.47,.012,.012],.003);box(g,carbon,[0,.224,-.12],[1.46,.04,2.72]);
 box(g,m.interior,[0,.779,-.55],[1.52,.07,2.07]);box(g,m.interior,[0,1.002,.42],[1.49,.15,.30],.025);
 for(const s of [-1,1])for(const z of [-.42,-1.31]){box(g,m.upholstery,[s*.43,.72,z],[.46,.17,.46],.025);const seat=box(g,m.upholstery,[s*.43,.982,z-.19],[.43,.43,.10],.025);seat.rotation.x=-.16;box(g,m.upholstery,[s*.43,1.253,z-.23],[.235,.16,.10],.026);}
 view.root.userData.visualModel={type:'Manufacturer-reference compound-surface reconstruction',version:2,importedManufacturerCAD:false,landmarks:URUS_BODY_LANDMARKS};return view;
}
