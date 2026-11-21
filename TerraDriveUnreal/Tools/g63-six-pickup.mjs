// Original 2014 six-wheeler pickup details, reconstructed from factory photos.
// Contact-plane metres; Y up, +Z forward. Panel/bar stations are estimates.
import {T,box,mesh,surface,line,station,lerp,smooth} from './body-surface.mjs';
import {geometryText} from './vehicle-fidelity.mjs';
import {moldedOptic,opticFace} from './vehicle-optics.mjs';

export const SIX_PICKUP=Object.freeze({
 revision:26,height:2.326,width:2.185,length:5.875,bodyRise:.281,cabRoofY:2.260,
 axles:Object.freeze([2.100,-1.020,-2.120]),tireRadius:.4699,rimInches:18,
 cabRearZ:-.895,bedFrontZ:-.925,bedRearZ:-2.750,bedTopY:1.515,bedFloorY:.985,
 stepRearZ:-.390,stepFrontZ:1.465,
 mainHoopRadius:.0335,braceRadius:.030,hoopTopY:2.2925,hoopTopZ:-1.095,
 // The original rounded arches falsely suggested three small wheel openings.
 // A long, joined rear pressing follows both real tandem tire centres.
 frontOpening:Object.freeze([[1.460,.680],[1.790,1.285],[1.900,1.315],[2.360,1.315],[2.475,1.270],[2.680,.680]]),
 rearOpening:Object.freeze([[-2.775,.680],[-2.575,1.250],[-2.435,1.300],[-1.950,1.300],[-1.775,1.225],[-1.460,1.225],[-1.285,1.300],[-.765,1.300],[-.430,.680]])
});
const named=(o,n)=>{o.name=n;return o;};
export const sixOpeningY=z=>station(z>0?SIX_PICKUP.frontOpening:SIX_PICKUP.rearOpening,z,1);
function tube(g,m,points,r,name){
 // Tangent line/arc bends keep the hoop shoulders round without overshooting
 // its measured envelope or turning straight uprights into bowed splines.
 const path=new T.CurvePath(),v=points.map(p=>new T.Vector3(...p));
 let start=v[0];
 for(let i=1;i<v.length-1;i++){
  const p=v[i],a=v[i-1].clone().sub(p),b=v[i+1].clone().sub(p),d=Math.min(.075,a.length()*.28,b.length()*.28),q=p.clone().add(a.normalize().multiplyScalar(d)),s=p.clone().add(b.normalize().multiplyScalar(d));
  path.add(new T.LineCurve3(start,q));path.add(new T.QuadraticBezierCurve3(q,p,s));start=s;
 }
 path.add(new T.LineCurve3(start,v.at(-1)));
 const geo=new T.TubeGeometry(path,Math.max(48,points.length*18),r,16,false);
 // Welded tubes terminate inside cast feet / joined tubes, never open in air.
 const o=named(mesh(g,geo,m),name);o.userData.centreline=points.map(p=>[...p]);o.userData.radiusM=r;return o;
}
function arch(g,m,s,profile,name){
 const a=profile[0][0],b=profile.at(-1)[0],outer=SIX_PICKUP.width/2;
 const at=(u,v)=>{
  const z=lerp(a,b,u),end=1-Math.sin(Math.PI*u),top=.095+.039*end;
  const x=outer-.033*end**2-.013*(1-Math.sin(Math.PI*v));
  return[z,station(profile,z,1)+top*v,x,top];
 };
 named(surface(g,m,112,8,(u,v)=>{const[z,y,x]=at(u,v);return[s*x,y,z];},s>0),name+'-outer-'+s);
 named(surface(g,m,112,5,(u,v)=>{const[z,y,x,top]=at(u,1);return[s*lerp(x,.886,v),y-((top-.095)*v)+.014*Math.sin(v*Math.PI),z];},s>0),name+'-crown-'+s);
 named(surface(g,m,112,4,(u,v)=>{const[z,y,x]=at(u,0);return[s*lerp(x,.883,v),y-.012*v,z];},s<0),name+'-inner-return-'+s);
 for(const u of [0,1])named(surface(g,m,5,5,(v,w)=>{const[z,y,x,top]=at(u,v);return[s*lerp(.886,x,w),y-v*(top-.095)*(1-w),z];},s*(u?1:-1)<0),name+'-closed-end-'+s+'-'+u);
}
function woodMaterial(i){
 const colors=['#d6b897','#d9be9e','#dfc5a6','#d5b393'];
 const m=new T.MeshStandardMaterial({color:colors[i%colors.length],roughness:.64,metalness:0});
 m.userData.automotive='wood';m.userData.automotiveOwner='g63six';return m;
}
export function buildSixPickup(g,m){
 const r=SIX_PICKUP,front=r.bedFrontZ,rear=r.bedRearZ,top=r.bedTopY,floor=r.bedFloorY;
 const paint=m.paint,trim=m.gTrim,metal=m.gSatin,carbon=new T.MeshPhysicalMaterial({color:'#171d20',roughness:.32,clearcoat:.7});
 carbon.userData.automotive='carbon';carbon.userData.automotiveOwner='g63six';
 const cage=new T.MeshStandardMaterial({color:'#aeb8bb',metalness:.96,roughness:.20});
 cage.userData.automotive='metal';cage.userData.automotiveOwner='g63six';cage.userData.nativeRole='structural';
 const wood=Array.from({length:4},(_,i)=>woodMaterial(i));
 const liner=trim.clone();liner.userData={...trim.userData,automotiveOwner:'g63six',nativeRole:'wheelLiner'};
 // The central floor clears the tires' inboard faces. The old full-width
 // rectangular bed floor and side slabs intersected their upper travel.
 named(box(g,trim,[0,floor-.037,(front+rear)/2],[1.410,.050,front-rear],.010),'g63-six-central-load-floor');
 for(let i=0;i<12;i++)named(box(g,wood[i%4],[-.638+i*.116,floor,(front+rear)/2],[.113,.022,front-rear-.035]),'g63-six-bamboo-floor-board-'+i);
 for(const s of [-1,1]){
  const low=z=>Math.max(.825,sixOpeningY(z)+.096);
  // The pickup bed has a shallow outward draw, a rolled top flange and
  // a wrap into the tailgate. Use the same section for skin and rail.
  const sideX=(z,t)=>.939+.019*Math.sin(Math.PI*t)-.025*(1-smooth(z,rear,rear+.24))*(.55+.45*t);
  named(surface(g,paint,112,16,(u,v)=>{const z=lerp(rear,front,u);return[s*sideX(z,v),lerp(low(z),top,v),z];},s>0),'g63-six-scalloped-bed-side-'+s);
  named(surface(g,paint,112,7,(u,v)=>{const z=lerp(rear,front,u);return[s*.887,lerp(low(z),top,v),z];},s<0),'g63-six-double-wall-bed-inner-'+s);
  named(surface(g,paint,112,5,(u,v)=>{const z=lerp(rear,front,u);return[s*lerp(.887,sideX(z,1),v),top+.009*Math.sin(v*Math.PI),z];},s<0),'g63-six-painted-bed-rail-'+s);
  for(const z of [front,rear])named(surface(g,paint,6,16,(u,v)=>[s*lerp(.887,sideX(z,v),u),lerp(low(z),top,v),z],s*(z===rear?1:-1)>0),'g63-six-bed-rail-closed-end-'+s+'-'+z);
  arch(g,carbon,s,r.frontOpening,'g63-six-carbon-front-arch');
  arch(g,carbon,s,r.rearOpening,'g63-six-carbon-tandem-arch');
  // A dark flexible liner closes the upper engine-side cavity. It remains
  // inboard of the tire and joins the same folded front opening; it does not
  // introduce a second painted arch or a structural collision plate.
  named(surface(g,liner,36,3,(u,v)=>{const z=lerp(1.72,2.50,u);return[s*.705,lerp(.96,sixOpeningY(z)-.010,v),z];},s>0),'g63-six-front-inner-liner-wall-'+s);
  named(surface(g,liner,48,3,(u,v)=>{const z=lerp(r.frontOpening[0][0],r.frontOpening.at(-1)[0],u);return[s*lerp(.705,.884,v),sixOpeningY(z)-.010,z];},s>0),'g63-six-front-inner-liner-ceiling-'+s);
  // One continuous formed inner wheel housing spans the tandem, as in the
  // factory cargo-bed photograph; its crown leaves real tire clearance.
  const za=-2.65,zb=-.55,tubY=z=>Math.max(floor,station(r.rearOpening,z,1)-.035);
  named(surface(g,trim,96,5,(u,v)=>{const z=lerp(za,zb,u);return[s*.706,lerp(floor-.015,tubY(z),v),z];},s<0),'g63-six-tandem-inner-tub-wall-'+s);
  named(surface(g,trim,96,5,(u,v)=>{const z=lerp(za,zb,u);return[s*lerp(.706,.887,v),tubY(z),z];},s<0),'g63-six-tandem-inner-tub-crown-'+s);
  for(const z of [za,zb])named(box(g,trim,[s*.795,(floor+tubY(z))/2,z],[.183,Math.max(.02,tubY(z)-floor),.035],.008),'g63-six-tandem-tub-end-'+s+'-'+z);
  for(let i=0;i<3;i++)named(box(g,wood[(i+1)%4],[s*.879,1.300+i*.071,(front+rear)/2],[.012,.068,front-rear-.045]),'g63-six-bamboo-inner-side-'+s+'-'+i);
  // Proper full-height front hoop plus short, dog-legged rear braces.
  tube(g,cage,[[s*.950,1.455,-1.005],[s*.894,2.2925,-1.095],[s*.765,2.2925,-1.095]],r.mainHoopRadius,'g63-six-hoop-upright-'+s);
  tube(g,cage,[[s*.825,2.2925,-1.095],[s*.923,1.920,-2.340],[s*.950,1.455,-2.505]],r.braceRadius,'g63-six-rear-stay-'+s);
  for(const z of [-1.005,-2.505])named(box(g,cage,[s*.950,1.472,z],[.075,.055,.115],.018),'g63-six-cast-rollbar-foot-'+s+'-'+z);
  // Straight lower cabin repair matches the *new* tandem opening, without
  // the old SUV notch/paint triangle between the middle tire and rear door.
  named(surface(g,paint,64,10,(u,v)=>{const z=lerp(-.895,-.30,u),low=Math.max(.731,sixOpeningY(z)+.096);return[s*.910,lerp(low,1.566,v),z];},s>0),'g63-six-cab-lower-rear-closure-'+s);
  // Fit the closed running board between the two wheel openings, with
  // room for the larger garage tires to move vertically past its ends.
  const step=new T.Group();step.name='g63-six-double-cab-step-'+s;g.add(step);
  const stepLength=r.stepFrontZ-r.stepRearZ,stepCenter=(r.stepFrontZ+r.stepRearZ)/2;
  box(step,metal,[s*.965,.718,stepCenter],[.165,.057,stepLength],.016);
  box(step,trim,[s*.961,.747,stepCenter],[.128,.009,stepLength-.072],.004);
  for(let i=0;i<4;i++){
   box(step,trim,[s*(.920+i*.027),.753,stepCenter],[.008,.005,stepLength-.130],.002);
  }
  // Seat the straight pickup strip above the tandem wheel openings.
  named(surface(g,trim,80,7,(u,v)=>{
   const z=lerp(rear+.028,front-.018,u),y=1.435+.040*(v-.5),t=(y-low(z))/(top-low(z));
   return[s*(sideX(z,t)+.002+.011*Math.sin(Math.PI*v)),y,z];
  },s>0),'g63-six-bed-protective-molding-'+s);
  for(const z of [-1.85,-2.40])box(g,m.gReflector,[s*.966,1.085,z],[.010,.032,.065],.005);
 }
 tube(g,cage,[[-.765,r.hoopTopY,r.hoopTopZ],[.765,r.hoopTopY,r.hoopTopZ]],r.mainHoopRadius,'g63-six-transverse-main-hoop');
 named(box(g,paint,[0,(floor+top)/2,front-.008],[1.400,top-floor,.058],.018),'g63-six-bed-front-bulkhead');
 named(box(g,paint,[0,(1.397+top)/2,front-.008],[1.775,top-1.397,.058],.018),'g63-six-bed-front-bulkhead-shoulders');
 for(let i=0;i<6;i++)box(g,wood[i%4],[0,floor+.045+i*.075,front-.041],[1.395,.072,.014]);
 const gateBottom=.927,gateWidth=y=>.916-.026*(1-smooth(y,gateBottom,gateBottom+.062));
 const gate=(u,y)=>{
  const x=lerp(-gateWidth(y),gateWidth(y),u),ends=Math.abs(x)/gateWidth(y);
  const pressing=(.010*Math.exp(-(((y-1.103)/.027)**2))+.008*Math.exp(-(((y-1.402)/.024)**2)))*(1-ends**8);
  return[x,y,rear-.063+.034*ends**6+.015*(1-smooth(y,gateBottom,gateBottom+.076))+pressing];
 };
 named(surface(g,paint,58,36,(u,v)=>gate(u,lerp(gateBottom,top,v)),true),'g63-six-sculpted-tailgate');
 named(surface(g,paint,58,15,(u,v)=>{const y=lerp(gateBottom,top,v);return[lerp(-gateWidth(y),gateWidth(y),u),y,rear+.029];}),'g63-six-tailgate-inner-sheet');
 for(const u of [0,1])named(surface(g,paint,28,5,(v,d)=>{const p=gate(u,lerp(gateBottom,top,v));p[2]=lerp(p[2],rear+.029,d);return p;},u===0),'g63-six-tailgate-side-return-'+u);
 for(const y of [gateBottom,top])named(surface(g,paint,58,6,(u,v)=>{const p=gate(u,y);p[2]=lerp(p[2],rear+.029,v);return p;},y===top),'g63-six-tailgate-horizontal-return-'+y);
 for(const x of [-.72,.72])box(g,metal,[x,.944,rear-.062],[.065,.037,.021],.006);
 box(g,trim,[0,1.256,rear-.062],[.138,.094,.016],.008);
 box(g,metal,[0,1.274,rear-.072],[.103,.020,.008],.003);
 for(const s of [-1,1]){
  const x=s*.813,z=rear-.079;
  named(box(g,trim,[x,.967,z],[.281,.135,.042],.015),'g63-six-horizontal-rear-lamp-housing-'+s);
  // Period horizontal clusters use folded reflector optics and a divided
  // clear reversing cell, distinct from the modern wagon's LED light guide.
  moldedOptic(g,m.red,'g63-six-rear-brake-lamp-'+s,
    opticFace([x,.970,z-.024],.246,.100,.011,.004),
    {cells:9,rows:10,horizontal:true,relief:.0015});
  moldedOptic(g,m.reverse,'g63-six-clear-reverse-cell',
    opticFace([x-s*.084,.964,z-.032],.051,.047,.005,.0018),
    {cells:6,rows:5,relief:.0013});
  moldedOptic(g,m.gReflector,'g63-six-passive-ruby-cell',
    opticFace([x+s*.079,.964,z-.032],.055,.046,.005,.0015),
    {cells:8,rows:6,relief:.0011});
  const cover=opticFace([x,.966,z-.035],.253,.108,.014,.0033);
  surface(g,m.lens,22,12,(u,v)=>cover(u,v,0),true).name='g63-six-molded-clear-cover';
  const label=geometryText(g,s<0?'6X6':'G63',.13,.026,metal);label.position.set(x-s*.02,1.250,rear-.063);label.rotation.y=Math.PI;
 }
 named(box(g,paint,[0,.822,rear-.061],[2.015,.145,.174],.036),'g63-six-independent-rear-bumper');
 box(g,trim,[0,.838,rear-.155],[.490,.112,.012],.005);
 const plate=box(g,metal,[0,.838,rear-.164],[.405,.095,.009],.005);plate.name='g63-six-rear-license-plate';
 box(g,metal,[0,.714,rear-.057],[1.47,.090,.135],.012);
 for(const x of [-.49,-.245,0,.245,.49]){
  const hole=mesh(g,new T.CircleGeometry(.040,20),trim,[x,.706,rear-.127]);hole.rotation.y=Math.PI;
 }
}
export function buildSixRoof(g,m){
 const r=SIX_PICKUP;
 named(surface(g,m.paint,48,40,(u,v)=>{const x=lerp(-.861,.861,u),z=lerp(-.889,1.115,v);return[x,2.254+.006*(1-(x/.861)**4),z];},true),'g63-six-solid-ribbed-metal-roof');
 for(let i=-3;i<=3;i++){
  const rib=named(mesh(g,new T.CylinderGeometry(.006,.006,1.695,12),m.paint,[i*.190,2.257,.10]),'g63-six-longitudinal-roof-pressing-'+i);rib.rotation.x=Math.PI/2;
 }
 const c=new T.MeshPhysicalMaterial({color:'#141b20',roughness:.30,clearcoat:.6});c.userData.automotive='carbon';c.userData.automotiveOwner='g63six';
 named(box(g,c,[0,2.270,1.105],[1.735,.079,.171],.026),'g63-six-full-width-roof-spoiler');
 for(const s of [-1,1]){
  named(box(g,m.gTrim,[s*.605,2.267,1.194],[.355,.036,.014],.008),'g63-six-roof-carbon-light-housing-'+s);
  for(let i=0;i<8;i++)box(g,m.drl,[s*.605+(i-3.5)*.040,2.268,1.203],[.030,.017,.004]);
 }
}
