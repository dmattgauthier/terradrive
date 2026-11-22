// Original V8 Urus Performante. Hand-authored reference reconstruction, not OEM CAD.
// Datum: tyre contact Y=0; axle midpoint Z=0; nose +Z. Units are metres.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {T,mesh,box,surface,polygon,mappedPolygon,line,curve,station,lerp,clamp,smooth} from './body-surface.mjs';
import {urusCabin} from './urus-cabin.mjs';
import {geometryText} from './vehicle-fidelity.mjs';
import {cellularGrille,panelJoint} from './coachwork-craft.mjs';
import {URUS_COWL,hoodRows,hood,carbonPanel,carbonNu,carbonNv,carbonBonnet} from './urus-bonnet.mjs';
export const URUS_BODY_LANDMARKS={length:5.137,width:2.026,widthWithMirrors:2.181,height:1.618,wheelbase:3.006,
 roofFrontZ:.30,roofRearZ:-1.23,cowlZ:URUS_COWL,frontZ:2.5685,rearZ:-2.5685,beltFrontY:1.114,beltRearY:1.248,archRadius:.448};
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
const bumperJoinY=x=>.548+.112*smooth(Math.abs(x),.47,.94);
export function urusRearSurface(x,y){
 const a=Math.abs(x),section=a/.99;
 const shoulder=1-smooth(a,.49,.95);
 const foldY=1.004-.112*section*section;
 // The hatch drops from the high lamp shelf into the tilted plate plane.
 // Broad successive surfaces carry a horizon reflection across the gate.
 const fold=.049*(1-smooth(y,foldY-.091,foldY+.076))*shoulder;
 const lowerRoll=.021*smooth(y,.55,.72)*(1-smooth(y,.73,.92));
 const sill=.015*gauss(y,bumperJoinY(x)+.024,.099);
 // The lamp shelf sits proud of the tapered bumper corners. Carry the
 // rounded return through the outer sheet, optics and exhaust shroud.
 const quarterRelief=.041*gauss(y,.83,.147)*smooth(a,.53,.94);
 return URUS_BODY_LANDMARKS.rearZ+.249*section*section+fold+lowerRoll+sill+quarterRelief;
}
export function urusView(spec){
 const view=new VehicleView(new T.Scene(),{...spec,bodyStyle:'sedan'}),g=view.body,m=view.materials;
 g.clear();g.position.set(0,-spec.cgHeight,(.5-spec.frontWeightFraction)*spec.wheelbase);
 const finish=(mat,role)=>{mat.userData.automotive=role;return mat;};
 const carbon=finish(new T.MeshPhysicalMaterial({color:'#15191b',roughness:.27,clearcoat:1,clearcoatRoughness:.16}),'carbon');carbon.userData.nativeRole='carbon';
 const black=finish(new T.MeshPhysicalMaterial({color:'#080a0b',roughness:.21,clearcoat:.7}),'black');
 const rubber=finish(new T.MeshStandardMaterial({color:'#101213',roughness:.66}),'rubber');
 const grille=finish(new T.MeshStandardMaterial({color:'#303337',roughness:.34,metalness:.9}),'metal');
 const dark=new T.MeshStandardMaterial({color:'#050708',roughness:.9});
 const passiveReflector=new T.MeshPhysicalMaterial({color:'#7a0c0a',roughness:.28,clearcoat:.7});
 const frit=new T.MeshStandardMaterial({color:'#080d10',roughness:.44,side:T.DoubleSide});frit.userData.nativeRole='glazingFrit';
 const drl=new T.MeshStandardMaterial({color:'#e2efff',emissive:'#d5e6ff',emissiveIntensity:.85,roughness:.2});
 finish(m.paint,'paint');finish(m.chrome,'metal');finish(m.interior,'plastic');finish(m.upholstery,'alcantara');
 m.paint.color.set('#eeb000');m.paint.metalness=0;m.paint.roughness=.25;m.paint.clearcoat=1;
 for(const mat of [m.glass,m.windscreen,m.privacyGlass]){mat.color.set('#172329');mat.opacity=mat===m.privacyGlass?.91:.64;mat.roughness=.10;}
 m.interior.color.set('#141618');m.upholstery.color.set('#17191c');m.headliner.color.set('#16191c');
 const front=URUS_BODY_LANDMARKS.frontZ,wy=spec.tireRadius,arch=.448,axles=[-1.503,1.503];
 // The two end closures and their side returns share their longitudinal
 // contour. This keeps a more deeply formed fascia/hatch closed at oblique
 // angles, including seals, lamps, plate returns and the bumper corners.
 const frontSurface=(x,y)=>{
  const a=Math.abs(x),outside=smooth(a,.56,.96);
  const recede=(.060-.034*outside)*gauss(y,.635,.181);
  const upperRake=.048*smooth(y,.902,1.075)*(1-smooth(a,.30,.85));
  const bumperTip=.014*gauss(y,.382,.093)*outside;
  return front-.243*(a/.99)**2-recede-upperRake+bumperTip;
 };
 // Rounded parameter contours keep the cut sheet, seal and glass on the same
 // boundary. The former four straight window corners made the greenhouse
 // read as a collection of flat plates even with a finely sampled surface.
 const roundContour=(points,radius=.024,steps=8)=>points.flatMap((p,i)=>{
  const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],la=Math.hypot(a[0]-p[0],a[1]-p[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]),r=Math.min(radius,la*.24,lb*.24);
  const start=p.map((n,k)=>n+(a[k]-n)*r/la),end=p.map((n,k)=>n+(b[k]-n)*r/lb);
  return Array.from({length:steps+1},(_,j)=>{const t=j/steps,s=1-t;return p.map((n,k)=>s*s*start[k]+2*s*t*n+t*t*end[k]);});
 });
 // Width, upper edge and shoulder are independent stations. The waist is
 // genuinely recessed; a material highlight cannot substitute for this shape.
 const rows=[[-2.48,.873,1.155],[-2.20,.951,1.239],[-1.80,.993,1.265],[-1.50,.998,1.256],[-1.12,.969,1.229],[-.55,.939,1.186],[.05,.931,1.151],[.54,.940,1.129],[URUS_COWL,.955,1.114],[1.22,.982,1.098],[1.54,.994,1.092],[1.92,.975,1.072],[2.26,.934,1.036],[2.48,.868,1.025]];
 const doorWidths=[[-2.48,.873],[-2.20,.951],[-1.80,.993],[-1.50,.998],[-1.12,.977],[-.55,.958],[.05,.956],[.72,.966],[1.22,.982],[1.54,.994],[1.92,.975],[2.26,.934],[2.48,.868]];
 const width=z=>station(rows,z,1),belt=z=>station(rows,z,2);
 const tailEdge=y=>station([[.25,.88],[.53,.938],[.76,.971],[1.04,.947],[1.155,.881]],y,1);
 const low=z=>Math.max(.27+.26*(1-smooth(z,-2.48,-2.05)),...axles.map(a=>Math.abs(z-a)<arch?wy+Math.sqrt(arch*arch-(z-a)**2):.27));
 // Fixed section stations run from the tucked rocker through the lower door
 // crown and the high shoulder, then turn back into the greenhouse. Keep
 // their order fixed as the belt rises from the nose into the rear haunch.
 const lowerSection=[[0,.853],[.14,.893],[.29,.930],[.39,.934],[.51,.931],[.64,.963],[.76,.988],[.86,.998],[.94,.978],[1,.950]];
 const creaseLine=[[-2.20,1.073],[-1.64,1.113],[-1.19,1.098],[-.48,1.038],[-.12,1.006],[.40,.935],[.83,.854],[1.25,.940],[1.65,1.020],[2.08,.970]];
 const sillFold=[[-1.44,.472],[-.82,.495],[-.06,.417],[.48,.370],[1.01,.440],[1.26,.493]];
 const pulls=[-.035,-1.187];
 const skinX=(y,z)=>{
  const h=belt(z),section=(y-.24)/(h-.24),doors=smooth(z,-1.50,-1.09)*(1-smooth(z,.66,1.22));
  const envelope=lerp(width(z),station(doorWidths,z,1),smooth(section,.19,.75));
  const shoulderY=station(creaseLine,z,1),foldY=station(sillFold,z,1);
  // Raised beltline above a broad inward draw splits the real car's door
  // reflections. The lower crease climbs toward the rear wheel opening.
  const shoulder=.031*gauss(y,shoulderY,.024)-.020*gauss(y,shoulderY-.084,.100);
  const heel=.022*gauss(y,foldY,.035)-.011*gauss(y,foldY+.065,.053);
  const rearHaunch=.036*gauss(z,-1.54,.46)*gauss(y,1.071,.118);
  const frontFender=.014*gauss(z,1.62,.43)*gauss(y,.947,.087);
  let x=envelope*station(lowerSection,section,1)+(shoulder+heel)*doors+rearHaunch+frontFender;
  // Handle cups are pressed into the continuous door sheet. They cannot be
  // represented by a black rectangle sitting proud of an unchanged panel.
  for(const centre of pulls){
   const dy=y-(belt(centre)-.077),dz=z-centre;
   const cup=Math.hypot(dy/.046,dz/.126);
   x-=.012*(1-smooth(cup,.12,1));
   // Both door pressings run forward and downward out of the handle pocket.
   // A broad draw below the fold carries the reflection into the door skin.
   const run=clamp(dz/.43,0,1);
   const draw=smooth(dz,-.06,.07)*(1-smooth(dz,.25,.44));
   const fold=dy+.030+.143*run;
   x+=draw*(.011*gauss(fold,0,.035)-.019*gauss(fold,-.056,.083));
  }
  return x;
 };
 // The fender and fascia share this piecewise-linear corner. The lens
 // and both cutout boundaries use it at the same lamp seam heights.
 const noseEdge=[[.24,.89],[.261,.89],[.44,.977],[.883,.955],[1.025,.843],[1.04,.81]];
 const noseEdgeX=y=>{
  const i=noseEdge.findIndex(p=>p[0]>=y),end=i<0?noseEdge.length-1:Math.max(1,i);
  const a=noseEdge[end-1],b=noseEdge[end];
  return lerp(a[1],b[1],clamp((y-a[0])/(b[0]-a[0]),0,1));
 };
 const sidePoint=(s,z,y,offset=0)=>{
  const f=smooth(z,2.05,2.48),r=1-smooth(z,-2.48,-2.05);
  const x=lerp(lerp(skinX(y,z),noseEdgeX(y),f),tailEdge(y),r);
  // Offset the original longitudinal coordinate toward the end boundary.
  // Blending the coordinate itself into an end point folded the last strips.
  const noseZ=frontSurface(x,y),tailZ=urusRearSurface(x,y);
  return[s*(x+offset),y,z+f*(noseZ-2.48)+r*(tailZ+2.48)];
 };
 const seam=(s,points)=>{const path=panelJoint(points,.028);line(g,dark,Array.from({length:111},(_,i)=>{const p=path.getPoint(i/110);return sidePoint(s,p.x,p.y,.0013);}),.00115);};
 const quad=(mat,a,b,c,d,nu=20,nv=12,flip=false)=>surface(g,mat,nu,nv,(u,v)=>a.map((n,k)=>lerp(lerp(n,b[k],u),lerp(d[k],c[k],u),v)),flip);
 function inset(points,scale){const center=points.reduce((a,p)=>a.map((v,k)=>v+p[k]/points.length),[0,0]);return points.map(p=>p.map((v,k)=>lerp(center[k],v,scale)));}
 function opening(contour,map,depth,lip=.005,kind='intake',openSeam=false){
  const inner=inset(contour,.935);
  const reverseReturn=contour.reduce((area,p,i)=>{const q=contour[(i+1)%contour.length];return area+p[0]*q[1]-q[0]*p[1];},0)<0;
  mappedPolygon(g,dark,inner,(x,y)=>map(x,y,-depth),[],false,8).name='urus-'+kind+'-back';
  const lipPoints=[];
  const walls=contour.length-(openSeam?1:0);
  for(let j=0;j<walls;j++){
   const a=contour[j],b=contour[(j+1)%contour.length],c=inner[j],d=inner[(j+1)%inner.length];
   const divisions=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.013));
   const wall=surface(g,carbon,divisions,5,(u,v)=>{const p=map(lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v));p[2]-=depth*(v*.32+v*v*.68);return p;},reverseReturn);
   wall.name='urus-'+kind+'-return';
   for(let k=0;k<divisions;k++)lipPoints.push(map(lerp(a[0],b[0],k/divisions),lerp(a[1],b[1],k/divisions)));
  }
  line(g,black,[...lipPoints,openSeam?map(...contour.at(-1)):lipPoints[0]],lip);
 }
 // A physical-height grid keeps shoulder and handle detail on coherent rows.
 // The former wheel-arch-following parameter rows cut those thin features
 // diagonally, making highlights pinch even with analytic source normals.
 const samples=(a,b,step,extra=[])=>{
  const count=Math.ceil((b-a)/step),values=[...Array.from({length:count+1},(_,i)=>lerp(a,b,i/count)),...extra];
  return values.filter(x=>x>=a&&x<=b).sort((x,y)=>x-y).filter((x,i,all)=>!i||x-all[i-1]>.00001);
 };
 // The front wheel opening ends before this section, so the remaining
 // fender can be triangulated around true apertures in its curved return.
 const fenderStart=2.018,fenderEnd=2.48;
 const sideZ=samples(-2.48,fenderStart,.022,pulls.flatMap(z=>samples(z-.145,z+.145,.008)));
 const sideY=samples(.24,1.28,.018,[...samples(.32,.53,.010),...samples(.84,1.27,.006)]);
 const lampSeamLow=.931,lampSeamHigh=.974;
 // Round the body stamping inside each sheet and retain the exact two
 // joining endpoints. Both openings are notches in their painted edges.
 const lampEdge=points=>[points[0],...roundContour(points,.012,4).slice(5,-5),points.at(-1)];
 const lampPocket=lampEdge([[fenderEnd,lampSeamLow],[2.385,.919],[2.253,.899],
  [2.082,.916],[2.199,.974],[2.344,.987],[fenderEnd,lampSeamHigh]]);
 const frontLampEdge=lampEdge([[noseEdgeX(lampSeamHigh),lampSeamHigh],[.840,1.012],[.799,1.013],
  [.515,.996],[.459,.957],[.521,.926],[.579,.922],[.612,.927],[.820,.924],[noseEdgeX(lampSeamLow),lampSeamLow]]);
 const airCurtain=roundContour([[2.166,.718],[2.407,.739],[2.443,.696],[2.384,.422],
  [2.286,.357],[2.227,.383]],.015,4);
 const returnOutline=[
  ...sideY.filter(y=>y>low(fenderStart)&&y<belt(fenderStart)).reverse().map(y=>[fenderStart,y]),
  [fenderStart,low(fenderStart)],[fenderEnd,low(fenderEnd)],
  ...samples(low(fenderEnd),lampSeamLow,.014,[.44,.883]).slice(1).map(y=>[fenderEnd,y]),
  ...lampPocket.slice(1),
  ...samples(lampSeamHigh,belt(fenderEnd),.014).slice(1).map(y=>[fenderEnd,y]),
  ...samples(fenderStart,fenderEnd,.014).slice(0,-1).reverse().map(z=>[z,belt(z)])
 ];
 for(const s of [-1,1]){
  const positions=[],normals=[],uv=[],indices=[],stride=sideZ.length,epsilon=.00002;
  for(const level of sideY)for(const z of sideZ){
   const y=clamp(level,low(z),belt(z)),point=sidePoint(s,z,y);
   const dy=new T.Vector3(...sidePoint(s,z,y+epsilon)).sub(new T.Vector3(...sidePoint(s,z,y-epsilon)));
   const dz=new T.Vector3(...sidePoint(s,z+epsilon,y)).sub(new T.Vector3(...sidePoint(s,z-epsilon,y)));
   const normal=dz.cross(dy).normalize().multiplyScalar(s>0?-1:1);
   positions.push(...point);normals.push(...normal.toArray());uv.push((z+2.48)/4.96,(y-.24)/1.04);
  }
  const emit=(a,b,c)=>{
   const ay=positions[a*3+1],az=positions[a*3+2],by=positions[b*3+1],bz=positions[b*3+2],cy=positions[c*3+1],cz=positions[c*3+2];
   if(Math.abs((bz-cz)*(ay-cy)+(cy-by)*(az-cz))>1.e-12)indices.push(...(s>0?[a,c,b]:[a,b,c]));
  };
  for(let y=0;y<sideY.length-1;y++)for(let z=0;z<stride-1;z++){const a=y*stride+z,b=a+1,c=a+stride,d=c+1;emit(a,b,c);emit(b,d,c);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  mesh(g,geometry,m.paint).name='urus-continuous-door-sheet-'+(s>0?'left':'right');
  const forwardSide=(z,y,offset=0)=>sidePoint(s,z,y,offset);
  mappedPolygon(g,m.paint,returnOutline,forwardSide,[airCurtain],s>0,12).name='urus-perforated-fender-return';
  // Form the returns from the same aperture edges as the painted fender.
  // The black surfaces sit inside the body, with an open air curtain.
  for(const [name,contour,depth] of [['outboard-headlamp',lampPocket,.034],['front-air-curtain',airCurtain,.069]]){
   const inner=inset(contour,.84);
   const ccw=contour.reduce((area,p,i)=>{const q=contour[(i+1)%contour.length];return area+p[0]*q[1]-q[0]*p[1];},0)>0;
   mappedPolygon(g,dark,inner,(z,y)=>forwardSide(z,y,-depth),[],s>0,10).name='urus-'+name+'-recess';
   const walls=contour.length-(contour===lampPocket?1:0);
   for(let j=0;j<walls;j++)surface(g,carbon,8,5,(u,v)=>{
    const a=contour[j],b=contour[(j+1)%contour.length],c=inner[j],d=inner[(j+1)%inner.length];
    const z=lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),y=lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v);
    return forwardSide(z,y,-depth*v);
   },ccw?s>0:s<0).name='urus-'+name+'-return';
  }
  mappedPolygon(g,m.lens,lampPocket,(z,y)=>forwardSide(z,y,.002*(1-smooth(z,2.453,fenderEnd))),[],s>0,12).name='urus-outboard-lamp-lens';
  curve(g,drl,[[2.148,.925],[2.255,.923],[2.367,.935],[2.428,.950]].map(([z,y])=>forwardSide(z,y,-.010)),.0028);
  surface(g,carbon,45,16,(u,v)=>{const z=lerp(-2.48,-2.05,u);return sidePoint(s,z,lerp(.27,low(z)+.003,v),.001);},s>0);
  // The widened composite flares have a squared outer shoulder and a return
  // into the well. Their visible profile tapers near each end of the arch.
  for(const axle of axles){
   const flareProfile=[[0,.978],[.16,1],[.44,.997],[.64,.940],[.84,.440],[1,0]];
   const flare=(u,v)=>{
    const a=lerp(-.26,Math.PI+.26,u),crown=Math.max(0,Math.sin(a)),width=.027+.032*crown;
    const r=arch+.001+width*v,z=axle+r*Math.cos(a),y=wy+r*Math.sin(a)-.019*crown**5*v;
    const p=sidePoint(s,z,y),outer=1.013-.025*(1-crown)**1.8;
    p[0]=s*lerp(Math.abs(p[0])+.003,outer,station(flareProfile,v,1));return p;
   };
   surface(g,carbon,92,14,flare,s<0).name='urus-formed-carbon-wheel-arch';
   surface(g,rubber,92,5,(u,v)=>{const p=flare(u,0);p[0]=lerp(p[0],s*.76,v);return p;},s>0);
  }
  // A slim shaped sill blade carries the rocker line to both carbon flares.
  const sill=[[-1.092,.290,.425],[-.88,.274,.368],[-.25,.273,.320],[.50,.273,.329],[.87,.282,.363],[1.090,.304,.419]];
  const rocker=(u,v)=>{const z=lerp(sill[0][0],sill.at(-1)[0],u),y=lerp(station(sill,z,1),station(sill,z,2),v);return sidePoint(s,z,y,.005+.017*Math.sin(Math.PI*v));};
  surface(g,carbon,86,10,rocker,s>0).name='urus-formed-carbon-sill';
  line(g,black,Array.from({length:33},(_,i)=>rocker(i/32,.04)),.0017);
  seam(s,[[.835,1.115],[.806,.927],[.774,.669],[.729,.443],[.645,.355]]);
  seam(s,[[-.228,1.172],[-.256,.947],[-.287,.626],[-.341,.365]]);
  seam(s,[[-1.378,1.249],[-1.323,1.143],[-1.309,.945],[-1.197,.674],[-1.008,.471],[-.890,.369],[.645,.355]]);
  for(const z of pulls){
   const y=belt(z)-.077;
   surface(g,black,48,12,(u,v)=>{
    const a=u*Math.PI*2,t=v*2-1,zz=z+t*.084,end=clamp((Math.abs(t)-.77)/.23,0,1),r=Math.sqrt(Math.max(0,1-end*end)),yy=y+Math.sin(a)*.012*r,p=sidePoint(s,zz,yy,0);
    p[0]+=s*(.008+.020*Math.sin(v*Math.PI)+Math.cos(a)*.010*r);return p;
   },s<0).name='urus-sculpted-door-handle';
   // Small capacitive pad and cap division, fitted to the curved pull.
   line(g,grille,[[z-.052,y-.006],[z-.052,y+.006]].map(([zz,yy])=>sidePoint(s,zz,yy,.025)),.00065);
  }
  // The compact fender extractor is tall at the door shutline and
  // curves into a point above the rear half of the front wheel arch.
  const vent=roundContour([[.880,1.096],[1.117,1.020],[1.065,.949],[.982,.974]],.011,4),innerVent=inset(vent,.80);
  mappedPolygon(g,carbon,vent,(z,y)=>sidePoint(s,z,y,.007),[innerVent],s>0,8).name='urus-fender-extractor-surround';
  mappedPolygon(g,dark,innerVent,(z,y)=>sidePoint(s,z,y,.0025),[],s>0,8).name='urus-fender-extractor-backing';
  cellularGrille(g,grille,innerVent,(z,y)=>sidePoint(s,z,y,.004),{pitch:.019,web:.0013,depth:.0018,flip:s>0,name:'urus-fender-extractor-cells'});
  for(const [j,color] of ['#246638','#e4e6dc','#a41f28'].entries()){
   const accent=new T.MeshStandardMaterial({color,roughness:.29});
   line(g,accent,[[1.015+j*.025,1.005],[1.039+j*.025,1.008]].map(([z,y])=>sidePoint(s,z,y,.008)),.0017);
  }
  const quarterDuct=roundContour([[-1.871,.879],[-2.112,.852],[-2.326,.693],[-2.254,.689],[-2.050,.814]],.011,4);
  mappedPolygon(g,black,quarterDuct,(z,y)=>sidePoint(s,z,y,.0035),[],s>0,9).name='urus-rear-quarter-air-curtain';
  for(let j=0;j<4;j++){
   const z=-2.103-j*.048,y=.829-j*.034;
   line(g,grille,[[z+.027,y-.015],[z-.024,y-.013]].map(([zz,yy])=>sidePoint(s,zz,yy,.0055)),.0011);
  }
 }
 // A continuous painted greenhouse surround, with inset flush glass. The
 // previous independent rail tubes left gaps and looked like a roll cage.
 const {roofFrontZ,roofRearZ}=URUS_BODY_LANDMARKS;
 const roof=[[-2.20,1.252,.875],[-1.94,1.349,.824],[-1.63,1.476,.776],[roofRearZ,1.566,.745],
  [-.67,1.585,.744],[-.20,1.591,.746],[roofFrontZ,1.566,.742],[.51,1.457,.784],[URUS_COWL,1.149,.854]];
 // The front roof bow is further forward, with a shorter rear quarter
 // opening and more solid D-pillar over the swollen rear shoulder.
 const frontDoorGlass=[[.776,1.154],[.279,1.521],[-.187,1.544],[-.254,1.195]];
 const rearDoorGlass=[[-.330,1.205],[-.258,1.543],[-.874,1.522],[-1.092,1.277]];
 const quarterGlass=[[-1.134,1.279],[-.924,1.511],[-1.259,1.469],[-1.431,1.406],
  [-1.516,1.360],[-1.472,1.322],[-1.351,1.294]];
 const sideGlass=[frontDoorGlass,rearDoorGlass,quarterGlass].map((points,i)=>roundContour(points,i===2?.042:.026));
 const canopyPoint=(s,z,y,offset=0)=>{
  const h=station(roof,z,1),t=(y-belt(z))/(h-belt(z));
  const base=sidePoint(s,z,belt(z));
  return[s*(lerp(Math.abs(base[0]),station(roof,z,2),t)+.017*Math.sin(Math.PI*t)+offset),y,lerp(base[2],z,t)];
 };
 for(const s of [-1,1]){
  const silhouette=[...Array.from({length:100},(_,i)=>{const z=lerp(URUS_COWL,-2.20,i/99);return[z,station(roof,z,1)];}),...Array.from({length:100},(_,i)=>{const z=lerp(-2.20,URUS_COWL,i/99);return[z,belt(z)];})];
  mappedPolygon(g,m.paint,silhouette,(z,y)=>canopyPoint(s,z,y),sideGlass,s>0,16).name='urus-painted-greenhouse-side';
  // The inside of a pillar is trimmed, not the exterior body color. Keep
  // genuine window apertures and place the liner behind the exterior shell.
  mappedPolygon(g,m.interior,silhouette,(z,y)=>canopyPoint(s,z,y,-.014),sideGlass,s<0,16);
  for(const [i,contour]of sideGlass.entries()){
   const glass=inset(contour,.945),map=([z,y],off=0)=>canopyPoint(s,z,y,off);
   mappedPolygon(g,black,contour,(z,y)=>map([z,y],.002),[glass],s>0,12).name='urus-side-glass-seal-'+i;
   mappedPolygon(g,frit,glass,(z,y)=>map([z,y],-.0018),[inset(glass,.978)],s>0,12);
   // Fan patches curve into the center without stretching a single giant quad.
   const center=glass.reduce((c,p)=>c.map((v,k)=>v+p[k]/glass.length),[0,0]);
   for(let j=0;j<glass.length;j++)surface(g,i?m.privacyGlass:m.glass,16,16,(u,v)=>{
    const a=glass[j],b=glass[(j+1)%glass.length],p=center.map((n,k)=>lerp(n,lerp(a[k],b[k],u),v));return map(p,-.003+.006*(1-v*v));
   },s<0);
  }
  // Black B pillar and waist reveal. No tubes along the painted roof.
  mappedPolygon(g,black,[frontDoorGlass[2],rearDoorGlass[1],rearDoorGlass[0],frontDoorGlass[3]],(z,y)=>canopyPoint(s,z,y,.002),[],s>0);
  mappedPolygon(g,black,[rearDoorGlass[2],quarterGlass[1],quarterGlass[0],rearDoorGlass[3]],(z,y)=>canopyPoint(s,z,y,.002),[],s>0);
  curve(g,black,[[.776,1.148],[-.254,1.190],[-1.092,1.269],[-1.472,1.315]].map(([z,y])=>canopyPoint(s,z,y,.003)),.0027);
  const stemA=canopyPoint(s,.603,1.165),stemB=[s*.965,1.207,.603];line(g,black,[stemA,stemB],.014);
  // Aerodynamic angular mirror cap and recessed reflecting face.
  const mirrorShape=[[-.085,-.035],[-.092,.008],[-.065,.043],[.051,.044],[.094,.022],[.099,-.026],[.051,-.043],[-.060,-.044]];
  const mirrorLoop=new T.CatmullRomCurve3(mirrorShape.map(([x,y])=>new T.Vector3(x,y,0)),true,'centripetal');
  surface(g,carbon,96,28,(u,v)=>{const p=mirrorLoop.getPoint(u),r=Math.cos(v*Math.PI/2);return[s*(.991+p.x*r),1.210+p.y*r,.507+.177*Math.sin(v*Math.PI/2)];},s<0);
  mappedPolygon(g,black,mirrorShape,(x,y)=>[s*(.991+x),1.210+y,.506],[],s<0,14);
  mappedPolygon(g,m.chrome,mirrorShape.map(p=>p.map(n=>n*.85)),(x,y)=>[s*(.991+x),1.210+y,.504-.002*(1-(x/.09)**2)],[],s<0,14);
 }
 const canopy=(u,z,off=0)=>{
  const t=u*2-1,crown=.011+.017*smooth(z,-1.40,-1.06)*(1-smooth(z,-.30,.26));
  const bow=.023*smooth(z,-.04,.50)-.014*(1-smooth(z,-2.10,-1.30));
  return[t*station(roof,z,2),station(roof,z,1)+crown*(1-t*t)+off,z+bow*(1-t*t)];
 };
 surface(g,carbon,72,76,(u,v)=>canopy(u,lerp(roofRearZ,roofFrontZ,v)),true);
 surface(g,m.headliner,64,64,(u,v)=>{const p=canopy(lerp(.025,.975,u),lerp(roofRearZ,roofFrontZ,v));p[1]-=.016;return p;});
 // Open ceramic perimeter: no opaque backing sheet behind the windscreen.
 const glassTop=roofFrontZ+.021,glassBottom=URUS_COWL-.023;
 const frontFrame=[[0,roofFrontZ],[1,roofFrontZ],[1,URUS_COWL],[0,URUS_COWL]],
  frontAperture=[[.031,glassTop],[.969,glassTop],[.976,glassBottom],[.024,glassBottom]];
 mappedPolygon(g,black,frontFrame,(u,z)=>canopy(u,z),[frontAperture],true,14);
 mappedPolygon(g,m.headliner,frontFrame,(u,z)=>canopy(u,z,-.014),[frontAperture],false,14);
 surface(g,m.windscreen,72,48,(u,v)=>canopy(lerp(.031-.007*v,.969+.007*v,u),lerp(glassTop,glassBottom,v),.0025),true);
 mappedPolygon(g,frit,frontAperture,(u,z)=>canopy(u,z,.0035),[[[.044,glassTop+.014],[.956,glassTop+.014],[.963,glassBottom-.016],[.037,glassBottom-.016]]],true,14);
 for(const s of [-1,1])curve(g,rubber,[[s*.10,1.176,.813],[s*.31,1.185,.799],[s*.61,1.177,.790]],.005);
 // Rear hatch glass is bounded by a substantial painted D-pillar and spoiler.
 const rearFrame=[[0,-2.20],[1,-2.20],[1,roofRearZ],[0,roofRearZ]];
 const rearOuter=roundContour([[.109,-2.148],[.891,-2.148],[.888,-1.406],[.853,-1.317],[.147,-1.317],[.112,-1.406]],.051,6);
 const rearAperture=inset(rearOuter,.966),rearSightline=inset(rearAperture,.967);
 mappedPolygon(g,m.paint,rearFrame,(u,z)=>canopy(u,z),[rearOuter],true,16);
 mappedPolygon(g,m.headliner,rearFrame,(u,z)=>canopy(u,z,-.016),[rearOuter],false,16);
 mappedPolygon(g,black,rearOuter,(u,z)=>canopy(u,z,.003),[rearAperture],true,14);
 mappedPolygon(g,m.privacyGlass,rearAperture,(u,z)=>canopy(u,z,.004),[],true,12).name='urus-formed-rear-glass';
 mappedPolygon(g,frit,rearAperture,(u,z)=>canopy(u,z,.005),[rearSightline],true,10);
 for(let j=0;j<8;j++)curve(g,rubber,Array.from({length:24},(_,k)=>canopy(lerp(.145+j*.003,.855-j*.003,k/23),-2.04+j*.105,.002)),.0005);
 curve(g,black,[canopy(.49,-2.05,.011),canopy(.37,-2.01,.013),canopy(.24,-1.95,.013)],.005);
 // The exposed carbon runs out of the windscreen into a broad, round-ended
 // field. Its diverging press lines are part of the same surface as the paint.
 const ventOutline=roundContour([[.710,1.00],[.784,1.085],[.746,1.54],[.674,1.905],[.627,1.827],[.646,1.465],[.672,1.116]],.023,3);
 // The cooling ducts are holes in the bonnet. A black patch above an intact
 // hood cannot provide the shadowed return or the visible depth of the vents.
 const bonnetVents=[-1,1].map(s=>ventOutline.map(([x,z])=>[s*x,z]));
 const carbonBoundary=[...Array.from({length:carbonNv+1},(_,i)=>carbonPanel(0,i/carbonNv)),
  ...Array.from({length:carbonNu-1},(_,i)=>carbonPanel((i+1)/carbonNu,1)),
  ...Array.from({length:carbonNv+1},(_,i)=>carbonPanel(1,1-i/carbonNv))];
 const bonnetSides=Array.from({length:61},(_,i)=>{const z=lerp(URUS_COWL,2.48,i/60);return[station(hoodRows,z,2),z];});
 const bonnetNose=Array.from({length:37},(_,i)=>[lerp(-.64,.64,i/36),2.48]);
 const bonnetOutline=[...bonnetSides.map(([x,z])=>[-x,z]),...bonnetNose.slice(1,-1),...bonnetSides.slice().reverse()];
 // Shared sampled boundaries divide the body-color and exposed-carbon finish.
 // The carbon and both cooling outlets are cut directly out of the paint sheet.
 carbonBonnet(g,carbon).name='urus-partitioned-carbon-bonnet';
 mappedPolygon(g,m.paint,bonnetOutline,hood,[carbonBoundary,...bonnetVents],true,12).name='urus-open-vent-bonnet';
 for(const s of [-1,1]){
  surface(g,m.paint,110,12,(u,v)=>{const z=lerp(URUS_COWL,2.48,u),a=hood(s*station(hoodRows,z,2),z),b=sidePoint(s,z,belt(z));return a.map((n,k)=>lerp(n,b[k],v));},s<0).name='urus-bonnet-shoulder-sheet-'+s;
  curve(g,dark,Array.from({length:65},(_,i)=>{const z=lerp(URUS_COWL+.019,2.34,i/64);return hood(s*(station(hoodRows,z,2)-.014),z,.002);}),.0014);
  const outline=ventOutline,inner=inset(outline,.966),vent=outline.map(([x,z])=>hood(s*x,z,.0005));
  mappedPolygon(g,carbon,outline,(x,z)=>hood(s*x,z,.001),[inner],s>0,7).name='urus-bonnet-vent-lip';
  mappedPolygon(g,dark,inner,(x,z)=>hood(s*x,z,-.039),[],s>0,8).name='urus-bonnet-vent-floor';
  for(let j=0;j<inner.length;j++)surface(g,carbon,7,3,(u,v)=>{const a=outline[j],b=outline[(j+1)%outline.length],c=inner[j],d=inner[(j+1)%inner.length];return hood(s*lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v),lerp(.0005,-.039,v));},s<0).name='urus-bonnet-vent-nested-return';
  line(g,black,[...vent,vent[0]],.0013);
  // Section each louver against the actual aperture instead of fixed spans
  // that could protrude through its rim. All blade vertices sit below skin.
  const span=z=>{const xs=[];for(let k=0;k<inner.length;k++){const a=inner[k],b=inner[(k+1)%inner.length];if((a[1]<=z&&b[1]>z)||(b[1]<=z&&a[1]>z))xs.push(lerp(a[0],b[0],(z-a[1])/(b[1]-a[1])));}return[Math.min(...xs)+.003,Math.max(...xs)-.003];};
  for(let j=0;j<7;j++){const z=1.10+j*.109,[a,b]=span(z),[c,d]=span(z+.037);quad(grille,hood(s*a,z,-.032),hood(s*b,z,-.032),hood(s*d,z+.037,-.008),hood(s*c,z+.037,-.008),8,3,s>0).name='urus-bonnet-vent-recessed-louver';}
 }
 // The original Performante has one continuous black intake field below the
 // painted brow, with an exposed splitter and upswept body-color corner blades.
 const face=(x,y,d=0)=>[x,y,frontSurface(x,y)+d];
 // The nose closes on the same shoulder boundary as sidePoint(). Raising
 // only the fascia to accommodate an oversized lamp contour left proud ears
 // and a gap at the bonnet corners in the native overhead close-up.
 const crestStations=[[0,1.009],[.139,.994],[.453,1.026],[.843,1.025]];
 const fasciaCrest=x=>{const a=Math.abs(x);for(let i=1;i<crestStations.length;i++)if(a<=crestStations[i][0]){const p=crestStations[i-1],q=crestStations[i];return lerp(p[1],q[1],clamp((a-p[0])/(q[0]-p[0]),0,1));}return crestStations.at(-1)[1];};
 const across=(half)=>[...half.slice(1).reverse().map(([x,y])=>[-x,y]),...half];
 const browLower=across([[0,.856],[.368,.869],[.397,.866],[.458,.816],[.482,.811],[.710,.827],[.907,.854],[.955,.883]]);
 const browOutline=[...across(crestStations),...frontLampEdge,...browLower.slice().reverse(),
  ...frontLampEdge.slice().reverse().map(([x,y])=>[-x,y])];
 const lowerOutline=[...browLower,[.977,.44],[.89,.261],[.53,.258],[0,.251],[-.53,.258],[-.89,.261],[-.977,.44]];
 const ductTop=across([[0,.848],[.368,.861],[.397,.856],[.458,.807],[.482,.803],[.710,.819],[.904,.846],[.929,.840]]);
 const ductBottom=across([[0,.275],[.452,.283],[.593,.319],[.747,.310],[.902,.337],[.945,.415],[.956,.483],[.945,.685]]);
 const intake=roundContour([...ductTop,...ductBottom.slice().reverse()],.008,2);
 const lampHoles=[-1,1].map(s=>frontLampEdge.map(([x,y])=>[s*x,y]));
 mappedPolygon(g,m.paint,browOutline,face,[],false,12).name='urus-perforated-front-fascia';
 mappedPolygon(g,carbon,lowerOutline,face,[intake],false,10).name='urus-lower-composite-intake-frame';
 opening(intake,face,.118,.0014,'main-intake');
 // The crossbars sit above an open molded mesh with a dark cooling pack
 // behind it. Keep the packed mesh out of the foreground splitter channels.
 const radiator=[[-.506,.544],[.506,.544],[.485,.742],[-.485,.742]];
 const lowerMesh=cellularGrille(g,grille,radiator,(x,y)=>face(x,y,-.075),{
  pitch:.040,web:.0024,depth:.007,name:'urus-recessed-radiator-mesh'
 });
 view.root.userData.urusIntakeCells=lowerMesh.userData.openCells;
 for(const contour of lampHoles)opening(contour,face,.042,.002,'headlamp',true);
 // The three swept grille blades sit in front of distinct cooling packs.
 for(const y0 of [.777,.695,.608])surface(g,black,72,7,(u,v)=>{
  const x=(u*2-1)*.918,y=y0+.058*smooth(Math.abs(x),.50,.94);
  return face(x,y+lerp(-.009,.010,v),-.041+.016*Math.sin(Math.PI*v));
 }).name='urus-swept-grille-blade';
 for(const s of [-1,1]){
  for(let j=0;j<20;j++){
   const x=.556+j*.017,y=.449+.044*smooth(x,.56,.89);
   quad(grille,face(s*x,y,-.112),face(s*(x+.003),y,-.111),face(s*(x+.003),.787,-.111),face(s*x,.787,-.112),1,8,s<0).name='urus-side-radiator-fin';
  }
  const curtain=roundContour([[.904,.830],[.939,.843],[.951,.694],[.972,.491],[.941,.437],[.925,.482],[.918,.658]],.010,3);
  mappedPolygon(g,black,curtain,(x,y)=>face(s*x,y,.008+.019*gauss(x,.938,.020)),[],s<0,8).name='urus-air-curtain-upright';
  const corner=roundContour([[.974,.489],[.941,.409],[.799,.392],[.565,.592],[.530,.572],[.513,.545],[.744,.329],[.784,.319],[.953,.354],[.984,.419]],.013,3);
  const blade=(x,y)=>face(s*x,y,.004+.015*gauss(y,.388,.061)+.008*smooth(x,.80,.95));
  mappedPolygon(g,m.paint,corner,blade,[],s<0,10).name='urus-painted-chin-hook';
  for(let j=0;j<corner.length;j++)surface(g,m.paint,6,3,(u,v)=>{
   const a=corner[j],b=corner[(j+1)%corner.length],p=blade(lerp(a[0],b[0],u),lerp(a[1],b[1],u));p[2]-=.034*v;return p;
  },s<0);
  const wing=[[.506,.443],[.548,.450],[.743,.287],[.863,.296],[.943,.351],[.946,.315],[.881,.270],[.731,.263]];
  mappedPolygon(g,carbon,wing,(x,y)=>face(s*x,y,.017+.009*smooth(x,.51,.88)),[],s<0,9).name='urus-splitter-corner-wing';
 }
 const radar=[[-.090,.796],[-.056,.835],[.056,.835],[.090,.796],[.059,.753],[-.059,.753]];
 mappedPolygon(g,black,radar,(x,y)=>face(x,y,-.015),[],false,8).name='urus-grille-camera-housing';
 line(g,grille,[...radar,radar[0]].map(([x,y])=>face(x,y,-.010)),.0016);
 const beam=roundContour([[-.566,.478],[-.499,.538],[.499,.538],[.566,.478],[.485,.417],[-.485,.417]],.016,3);
 mappedPolygon(g,carbon,beam,(x,y)=>face(x,y,.008-.017*(x/.57)**2),[],false,11).name='urus-front-crash-beam-cover';
 const frontPlate=new T.MeshStandardMaterial({color:'#d6d7d1',roughness:.43});
 const frontPlateInk=new T.MeshStandardMaterial({color:'#181b1e',roughness:.59});
 const frontPlatePoint=face(0,.476,.018);
 box(g,frontPlate,frontPlatePoint,[.378,.075,.006],.004);
 const frontPlateText=geometryText(g,'TD 2024',.267,.032,frontPlateInk);
 frontPlateText.position.set(0,.460,frontPlatePoint[2]+.004);
 for(const x of [-.165,.165]){
  for(const side of [-1,1])surface(g,carbon,14,8,(u,v)=>{
   const y=lerp(.254,.428,u);return face(x+side*.007,y,lerp(.011,-.112,v)-.034*u);
  },side>0).name='urus-splitter-strake-side';
  surface(g,carbon,4,14,(u,v)=>face(lerp(x-.007,x+.007,u),lerp(.254,.428,v),.011-.034*v),false).name='urus-splitter-vertical-strake';
 }
 const splitter=(u,v)=>{const t=u*2-1,x=t*.974,y=.246+.029*Math.abs(t)**2;return face(x,y+.012*v,lerp(.026,-.176,v));};
 surface(g,carbon,88,12,splitter).name='urus-splitter-cambered-deck';
 surface(g,carbon,88,4,(u,v)=>{const p=splitter(u,0);p[1]-=.015*v;p[2]-=.004*v;return p;},true).name='urus-splitter-closed-leading-edge';
 // Keep the endpoint fixed while interpolating. Varying it with v made the
 // strip's outer edge bow away from the straight shoulder edge between two
 // matching corners, leaving a visible gap despite correct endpoints.
 // Include every fascia station in this boundary's sampling grid. Smooth
 // station interpolation or a grid that omits a corner cannot close against
 // the actual polygon boundary of the adjoining fascia sheet.
 const crownX=u=>{const t=u*2-1,a=Math.abs(t)*3,i=Math.min(2,Math.floor(a));return Math.sign(t)*lerp(crestStations[i][0],crestStations[i+1][0],a-i);};
 const crown=(u,v)=>{
  const x=crownX(u),a=hood((u*2-1)*.64,2.48),b=face(x,fasciaCrest(x));
  return a.map((n,k)=>lerp(n,b[k],v)+(k===1?.008*Math.sin(Math.PI*v):0));
 };
 surface(g,m.paint,72,14,crown,true).name='urus-bonnet-to-fascia-crown';
 line(g,dark,Array.from({length:101},(_,i)=>{
  const u=i/100,p=crown(u,.62-.13*gauss(u,.50,.072));p[1]+=.00125;return p;
 }),.00085).name='urus-leading-bonnet-shutline';
 for(const s of [-1,1]){
  const outline=frontLampEdge;
  mappedPolygon(g,black,outline,(x,y)=>face(s*x,y,-.034),[],s<0,8).name='urus-recessed-headlamp-bucket';
  const light=([x,y])=>face(s*x,y,-.004);
  // The white guide tapers at both ends. Its fork bends up the outboard
  // edge inside the moulded lens instead of lying on the bodywork.
  const guideA=[[.532,.949],[.621,.945],[.795,.949],[.830,.952],[.852,.980],[.852,.997]];
  const guideB=[[.805,.951],[.829,.951],[.855,.945],[.873,.954]];
  curve(g,drl,guideA.map(light),.0032).name='urus-headlamp-lower-light-guide';
  curve(g,drl,guideB.map(light),.0021).name='urus-headlamp-outboard-light-guide';
  for(let j=0;j<3;j++){
   const cx=s*(.635+j*.068),cy=.972+.006*j,p=face(cx,cy,-.022);
   box(g,black,p,[.050,.026,.012],.004);
   // A recessed optical bowl, raised rim and convex projector replace the
   // flat bright rectangle. Everything stays behind the outer lamp cover.
   surface(g,m.headlampReflector,32,10,(u,v)=>{const a=u*Math.PI*2,r=.24+.76*v;return face(cx+.020*Math.cos(a)*r,cy+.0098*Math.sin(a)*r,-.024+.012*r*r);},true).name='urus-recessed-projector-reflector';
   surface(g,m.headlampCore,24,8,(u,v)=>{const a=u*Math.PI*2,r=v;return face(cx+.009*Math.cos(a)*r,cy+.0058*Math.sin(a)*r,-.018+.0035*(1-r*r));},true);
   surface(g,m.lens,32,10,(u,v)=>{const a=u*Math.PI*2,r=v;return face(cx+.0178*Math.cos(a)*r,cy+.0085*Math.sin(a)*r,-.009+.0035*(1-r*r));},true).name='urus-convex-projector-lens';
  }
  mappedPolygon(g,m.lens,outline,(x,y)=>{
   const crown=.003+.004*(1-((x-.70)/.26)**2)+.002*(1-((y-.967)/.053)**2);
   return face(s*x,y,crown*smooth(noseEdgeX(y)-x,0,.036));
  },[],s<0,12).name='urus-formed-clear-headlamp-cover';
 }
 const radarLens=mesh(g,new T.CircleGeometry(.028,32),m.lens,face(0,.796,-.008));radarLens.name='urus-grille-camera-lens';
 polygon(g,m.badge,[face(-.024,.944,.008),face(.024,.944,.008),face(.020,.908,.008),face(0,.891,.008),face(-.020,.908,.008)]);
 // The hatch and diffuser meet on the same boundary. Optical and exhaust
 // chambers are cutouts in their respective sheets, with molded returns.
 const tail=(x,y,d=0)=>[x,y,urusRearSurface(x,y)+d];
 const plateOutline=roundContour([[-.314,.844],[.314,.844],[.350,.824],[.285,.692],[-.285,.692],[-.350,.824]],.019,4);
 const lampBand=[[-.913,1.083],[-.874,1.131],[-.615,1.145],[-.313,1.129],[.313,1.129],[.615,1.145],[.874,1.131],[.913,1.083],[.872,1.029],[.332,1.046],[-.332,1.046],[-.872,1.029]];
 const rearBoundary=(bottom,top,count)=>[-1,1].flatMap(s=>Array.from({length:count+1},(_,i)=>{
  const y=lerp(bottom,top,s<0?i/count:1-i/count);return[s*tailEdge(y),y];
 }));
 const rearReturn=(mat,outer,inner,map,depth,name)=>{
  const flip=outer.reduce((area,p,i)=>{const q=outer[(i+1)%outer.length];return area+p[0]*q[1]-q[0]*p[1];},0)>0;
  for(let j=0;j<outer.length;j++)surface(g,mat,16,5,(u,v)=>{
   const a=outer[j],b=outer[(j+1)%outer.length],c=inner[j],d=inner[(j+1)%inner.length];
   const p=a.map((n,k)=>lerp(lerp(n,b[k],u),lerp(c[k],d[k],u),v));return map(...p,depth*v);
  },flip).name=name;
 };
 // Long triangles run alongside the physical plate cutout. Tighten their
 // subdivision so imported vertex normals follow the pressed reflection.
 mappedPolygon(g,m.paint,rearBoundary(.53,1.155,36),tail,[plateOutline,lampBand],true,24).name='urus-sculpted-hatch-sheet';
 // The lower edge of the painted bumper rises over the exhausts and wraps
 // into the quarter. Its dark break follows the formed surface into the side.
 for(const side of [-1,1])line(g,dark,Array.from({length:42},(_,i)=>{
  const x=i/41*.938,y=bumperJoinY(x)-.004;
  return tail(side*x,y,-.0012);
 }),.0011).name='urus-rear-bumper-joint';
 const deck=(u,v)=>{
  const x=(2*u-1)*tailEdge(1.155),a=tail(x,1.155),b=canopy(u,-2.20);
  return a.map((n,k)=>lerp(n,b[k],v)+(k===1?.014*Math.sin(Math.PI*v)*(1-(2*u-1)**2):0));
 };
 surface(g,m.paint,90,20,deck,true).name='urus-formed-deck-under-glass';
 const diffuser=(x,y,d=0)=>tail(x,y,.116*(1-smooth(y,.255,.53))+.018*gauss(y,.42,.091)*gauss(x,0,.43)+d);
 const rearValance=roundContour([[-.458,.437],[.458,.437],[.524,.362],[.439,.310],[-.439,.310],[-.524,.362]],.018,4);
 mappedPolygon(g,black,rearValance,(x,y)=>diffuser(x,y,-.0025),[],true,8).name='urus-rear-valance-inset';
 const outlet=[[.555,.442],[.568,.495],[.868,.501],[.901,.449],[.882,.345],[.574,.340]];
 const exhaustHoles=[-1,1].map(s=>outlet.map(([x,y])=>[s*x,y]));
 mappedPolygon(g,carbon,rearBoundary(.254,.53,18),diffuser,exhaustHoles,true,11).name='urus-open-outlet-diffuser';
 const lampInner=lampBand.map(([x,y])=>[x*.987,lerp(1.083,y,.863)]);
 rearReturn(carbon,lampBand,lampInner,tail,.015,'urus-tail-lamp-return');
 mappedPolygon(g,black,lampInner,(x,y)=>tail(x,y,.016),[],true,9).name='urus-recessed-full-width-lamp-housing';
 const ducktail=(u,v)=>{
  const t=2*u-1,p=deck(lerp(.018,.982,u),lerp(.085,.278,v)),width=.25+.75*(1-t*t);
  p[1]+=(.018*(1-v)+.007*Math.sin(Math.PI*v))*width;p[2]-=.028*(1-v)*width;return p;
 };
 surface(g,carbon,76,9,ducktail,true).name='urus-carbon-ducktail';
 surface(g,carbon,76,4,(u,v)=>{const a=ducktail(u,0),b=deck(lerp(.018,.982,u),.085);return a.map((n,k)=>lerp(n,b[k],v));});
 const plateInner=inset(plateOutline,.91);
 rearReturn(m.paint,plateOutline,plateInner,tail,.026,'urus-recessed-plate-return');
 mappedPolygon(g,m.paint,plateInner,(x,y)=>tail(x,y,.028),[],true,12);
 const plate=finish(new T.MeshStandardMaterial({color:'#bfc5c7',roughness:.34}),'metal');
 box(g,black,tail(0,.766,.020),[.454,.106,.008],.005);
 box(g,plate,tail(0,.766,.014),[.424,.090,.005],.004);
 const text=geometryText(g,'TD 2024',.31,.040,black);text.position.set(0,.747,tail(0,.766,.009)[2]);text.rotation.y=Math.PI;
 const gateOutline=[[-.817,1.043],[-.825,.823],[-.778,.622],[.778,.622],[.825,.823],[.817,1.043]];
 const gate=panelJoint(gateOutline,.025);
 line(g,dark,Array.from({length:119},(_,i)=>{const p=gate.getPoint(i/118);return tail(p.x,p.y,-.0013);}),.0012);
 box(g,black,tail(0,.895,-.004),[.117,.020,.015],.004);
 for(const x of [-.126,.126])box(g,drl,tail(x,.855,.027),[.042,.005,.019],.001);
 for(const s of [-1,1]){
  const outline=[[.342,1.086],[.420,1.115],[.856,1.121],[.894,1.083],[.865,1.044],[.387,1.058]];
  const light=([x,y])=>tail(s*x,y,.005);
  line(g,m.red,[[.394,1.078],[.606,1.081],[.774,1.080],[.874,1.106]].map(light),.005);
  line(g,m.red,[[.774,1.080],[.875,1.057]].map(light),.0046);
  box(g,m.reverse,tail(s*.814,1.056,.005),[.088,.009,.008],.002);
  mappedPolygon(g,m.lens,outline,(x,y)=>tail(s*x,y,-.003-.002*(1-((x-.68)/.28)**2)),[],s>0,8).name='urus-moulded-tail-lamp-cover';
  // Reflectors and parking sensors belong to the bumper, not the tail lamps.
  const reflector=roundContour([[.735,.587],[.842,.609],[.886,.631],[.896,.612],[.849,.587],[.733,.568]],.010,4);
  mappedPolygon(g,m.black,reflector,(x,y)=>tail(s*x,y,-.003),[],s>0,8);
  mappedPolygon(g,passiveReflector,inset(reflector,.84),(x,y)=>tail(s*x,y,-.0055),[],s>0,8).name='urus-bumper-reflector';
  for(const x of [.45,.87]){const sensor=mesh(g,new T.CircleGeometry(.007,20),black,tail(s*x,.648,-.006));sensor.rotation.y=Math.PI;}
  const opening=exhaustHoles[s<0?0:1],throat=inset(opening,.92);
  rearReturn(carbon,opening,throat,diffuser,.074,'urus-diffuser-outlet-return');
  mappedPolygon(g,dark,throat,(x,y)=>diffuser(x,y,.079),[],true,8);
  for(const x of [.647,.799]){
   const [cx,cy,cz]=diffuser(s*x,.421,.016);
   const section=(u,r,d)=>{const a=2*Math.PI*u,dx=.066*r*Math.cos(a);return[cx+s*dx,cy+.046*r*Math.sin(a),cz+d+.25*dx];};
   surface(g,m.satinMetal,48,5,(u,v)=>section(u,lerp(.97,.84,v),v*.002),s>0).name='urus-oval-titanium-tip-rim';
   surface(g,m.satinMetal,48,7,(u,v)=>section(u,lerp(.97,1,v),lerp(0,.048,v)),s<0).name='urus-oval-titanium-tip-shell';
   surface(g,grille,48,9,(u,v)=>section(u,lerp(.84,.70,v),lerp(.002,.075,v)),s>0).name='urus-oval-titanium-tip-inner-wall';
  }
 }
 // Longitudinal diffuser fins blend up into the undertray, with taper at
 // each end and a narrow face thickness instead of exposed cubes.
 for(const x of [-.432,-.264,-.094,.094,.264,.432]){
  const keel=(u,v)=>{const y=.306+u*.104,z=diffuser(x,y)[2]+.017-.061*Math.sin(u*Math.PI)**.85;return[x+v*.011,y-.052*(1-u),z];};
  surface(g,carbon,13,3,(u,v)=>{const p=keel(u,0);p[2]+=v*.21*Math.sin(u*Math.PI);return p;},true);
  surface(g,carbon,13,3,(u,v)=>{const p=keel(u,1);p[2]+=v*.21*Math.sin(u*Math.PI);return p;});
  surface(g,carbon,13,3,keel).name='urus-tapered-diffuser-fin';
 }
 const marque=geometryText(g,'LAMBORGHINI',.447,.022,m.chrome);
 marque.position.set(0,1.080,tail(0,1.080,.009)[2]);marque.rotation.y=Math.PI;
 for(const stroke of marque.children){const x=stroke.position.x,y=stroke.position.y+marque.position.y;stroke.position.z=marque.position.z-tail(-x,y,.009)[2];}
 // The wing sweeps forward at each tip. Its leading edge seats between the
 // roof rails, while its raised trailing lip clears the sloping rear window.
 const spoiler=(u,v,underside=false)=>{
  const span=2*u-1,side=Math.abs(span),camber=Math.sin(Math.PI*v);
  const halfWidth=lerp(.737,.824,v)+.013*camber;
  const leading=-1.185-.078*side**2,trailing=-1.714+.114*side**2;
  const height=lerp(1.584,1.595,v)+.023*camber-.027*side**2;
  const thickness=lerp(.013,.008,v)+.013*camber;
  return [span*halfWidth,height-(underside?thickness:0),lerp(leading,trailing,v)];
 };
 surface(g,carbon,72,24,(u,v)=>spoiler(u,v)).name='urus-cambered-spoiler-upper';
 surface(g,carbon,72,24,(u,v)=>spoiler(u,v,true),true);
 for(const v of [0,1])surface(g,carbon,72,4,(u,w)=>{const a=spoiler(u,v),b=spoiler(u,v,true);return a.map((n,k)=>lerp(n,b[k],w));},v===0);
 for(const s of [-1,1]){
  surface(g,carbon,24,4,(v,w)=>{const a=spoiler((s+1)/2,v),b=spoiler((s+1)/2,v,true);return a.map((n,k)=>lerp(n,b[k],w));},s>0);
  // Build both faces and the sole from the same edge curves. The inner
  // root intersects the roof rail and the top edge joins the wing underside.
  const fin=(v,h,inside=false)=>{
   const top=spoiler((s+1)/2,v,true),depth=station([[0,.006],[.22,.040],[.56,.083],[.82,.066],[1,.016]],v,1);
   return [top[0]+s*(.024*h-(inside?.013:0)),top[1]-depth*h,top[2]+.047*h*Math.sin(Math.PI*v)];
  };
  surface(g,carbon,32,5,(v,h)=>fin(v,h),s>0).name='urus-spoiler-side-fin';
  surface(g,carbon,32,5,(v,h)=>fin(v,h,true),s<0);
  for(const h of [0,1])surface(g,carbon,32,2,(v,t)=>{
   const outer=fin(v,h),inner=fin(v,h,true);return outer.map((a,k)=>lerp(a,inner[k],t));
  },(s>0)===(h===1));
  for(const v of [0,1])surface(g,carbon,5,2,(h,t)=>{
   const outer=fin(v,h),inner=fin(v,h,true);return outer.map((a,k)=>lerp(a,inner[k],t));
  },(s>0)===(v===0));
 }
 // Recess the stop lamp into the actual trailing edge so that it follows
 // the plan-view sweep and remains attached across its full span.
 surface(g,m.red,40,2,(u,v)=>{
  const p=spoiler(lerp(.356,.644,u),1);p[1]-=.001+v*.006;p[2]-=.0008;return p;
 }).name='urus-spoiler-stop-lamp';
 box(g,rubber,[0,.227,-.10],[1.46,.035,2.73]);
 urusCabin(g,m,carbon,{sidePoint,belt});
 view.root.userData.visualModel={type:'Reference-built continuous coachwork and cabin',version:15,artPilot:5,perforatedFenderReturns:true,wrappedHeadlamps:true,referenceGreenhouseStations:true,sculptedBonnetRidges:true,sweptBonnetLeadingEdge:true,foldedRearHatch:true,sharedEndReturns:true,physicalHeightDoorGrid:true,continuousDoorSections:true,shallowHandleRecesses:true,ceramicGlazingBorders:true,recessedProjectorOptics:true,openGlazing:true,openBonnetVents:true,partitionedBonnet:true,connectedFrontIntake:true,formedPaintedChinHooks:true,recessedHatchPlate:true,airfoilSpoiler:true,camberedClosedSpoiler:true,crownedGreenhouse:true,sculptedDoorCups:true,sweptDoorPressings:true,formedCarbonFlares:true,recessedRadiatorMesh:true,sculptedRearBumper:true,openRearOpticalChamber:true,openDiffuserOutlets:true,importedManufacturerCAD:false,landmarks:URUS_BODY_LANDMARKS};return view;
}
