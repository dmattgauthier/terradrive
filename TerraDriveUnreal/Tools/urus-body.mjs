// Original V8 Urus Performante. Hand-authored reference reconstruction, not OEM CAD.
// Datum: tyre contact Y=0; axle midpoint Z=0; nose +Z. Units are metres.
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {T,mesh,box,surface,polygon,mappedPolygon,line,curve,station,lerp,clamp,smooth} from './body-surface.mjs';
import {urusCabin} from './urus-cabin.mjs';
import {geometryText} from './vehicle-fidelity.mjs';
import {panelJoint} from './coachwork-craft.mjs';
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
 const frit=new T.MeshStandardMaterial({color:'#080d10',roughness:.44,side:T.DoubleSide});frit.userData.nativeRole='glazingFrit';
 const drl=new T.MeshStandardMaterial({color:'#e2efff',emissive:'#d5e6ff',emissiveIntensity:.85,roughness:.2});
 finish(m.paint,'paint');finish(m.chrome,'metal');finish(m.interior,'plastic');finish(m.upholstery,'alcantara');
 m.paint.color.set('#f0c800');m.paint.metalness=0;m.paint.roughness=.22;m.paint.clearcoat=1;
 for(const mat of [m.glass,m.windscreen,m.privacyGlass]){mat.color.set('#172329');mat.opacity=mat===m.privacyGlass?.91:.64;mat.roughness=.10;}
 m.interior.color.set('#141618');m.upholstery.color.set('#17191c');m.headliner.color.set('#16191c');
 const front=2.5685,rear=-2.5685,wy=spec.tireRadius,arch=.448,axles=[-1.503,1.503];
 const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
 // The two end closures and their side returns share their longitudinal
 // contour. This keeps a more deeply formed fascia/hatch closed at oblique
 // angles, including seals, lamps, plate returns and the bumper corners.
 const frontSurface=(x,y)=>front-.271*(Math.abs(x)/.99)**2-.087*gauss(y,.66,.16)-.028*smooth(y,.925,1.035)*(1-smooth(Math.abs(x),.34,.84));
 const rearSurface=(x,y)=>{
  const a=Math.abs(x),centre=1-smooth(a,.58,.89),foldY=.956-.135*clamp(a/.85,0,1);
  const crease=.058*gauss(y,foldY-.025,.085),plateDraw=.033*gauss(y,.735,.155)*gauss(x,0,.60);
  return rear+.245*(a/.99)**2+centre*(crease+plateDraw+.010*gauss(y,.57,.055));
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
 const rows=[[-2.48,.873,1.155],[-2.20,.951,1.239],[-1.80,.993,1.265],[-1.50,.998,1.256],[-1.12,.969,1.229],[-.55,.939,1.186],[.05,.931,1.144],[.72,.951,1.102],[1.22,.982,1.093],[1.54,.994,1.092],[1.92,.975,1.072],[2.26,.934,1.032],[2.48,.868,1.016]];
 const doorWidths=[[-2.48,.873],[-2.20,.951],[-1.80,.993],[-1.50,.998],[-1.12,.977],[-.55,.958],[.05,.956],[.72,.966],[1.22,.982],[1.54,.994],[1.92,.975],[2.26,.934],[2.48,.868]];
 const width=z=>station(rows,z,1),belt=z=>station(rows,z,2);
 const low=z=>Math.max(.27+.26*(1-smooth(z,-2.48,-2.05)),...axles.map(a=>Math.abs(z-a)<arch?wy+Math.sqrt(arch*arch-(z-a)**2):.27));
 const skinX=(y,z)=>{
  const h=belt(z),shoulder=h-.115,doors=smooth(z,-1.14,-.80)*(1-smooth(z,.70,1.01));
  const section=[[.24,.887],[.34,.932],[.45,.954],[.58,.949],[.73,.970],[shoulder-.055,.995],[shoulder,1],[h,.951]];
  const sorted=section.filter((p,i)=>i<5||p[0]>.74);
  const formed=[[.24,.887],[.34,.932],[.48,.954],[.65,.965],[.79,.978],[shoulder-.045,.997],[shoulder,1],[h,.955]];
  const character=.548+.065*z;
  const original=width(z)*station(sorted,y,1)-.018*doors*gauss(y,character+.085,.118)+.004*doors*gauss(y,character-.030,.042);
  // A broad drawn sheet carries the upper shoulder into both wheel haunches.
  // Keep the lower body envelope while removing the old double waist hollow.
  const drawn=station(doorWidths,z,1)*station(formed,y,1)-.010*doors*gauss(y,character+.055,.15)+.003*doors*gauss(y,character-.030,.055);
  let x=lerp(original,drawn,smooth(y,.48,.68))+.012*gauss(z,-1.55,.55)*gauss(y,.91,.20);
  // Handle cups are pressed into the continuous door sheet. They cannot be
  // represented by a black rectangle sitting proud of an unchanged panel.
  for(const centre of [-.37,-1.22]){const dy=y-(belt(centre)-.077),dz=z-centre,q=Math.hypot(dy/.043,dz/.125);x-=.0045*(1-smooth(q,.20,1));}
  return x;
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
  const noseZ=frontSurface(x,y),tailZ=rearSurface(x,y);
  return[s*(x+offset),y,z+f*(noseZ-2.48)+r*(tailZ+2.48)];
 };
 const seam=(s,points)=>{const path=panelJoint(points,.025);line(g,dark,Array.from({length:241},(_,i)=>{const p=path.getPoint(i/240);return sidePoint(s,p.x,p.y,.002);}),.0013);};
 const quad=(mat,a,b,c,d,nu=20,nv=12,flip=false)=>surface(g,mat,nu,nv,(u,v)=>a.map((n,k)=>lerp(lerp(n,b[k],u),lerp(d[k],c[k],u),v)),flip);
 function inset(points,scale){const center=points.reduce((a,p)=>a.map((v,k)=>v+p[k]/points.length),[0,0]);return points.map(p=>p.map((v,k)=>lerp(center[k],v,scale)));}
 function opening(contour,map,depth,lip=.005,kind='intake'){
  const inner=inset(contour,.935);
  const reverseReturn=contour.reduce((area,p,i)=>{const q=contour[(i+1)%contour.length];return area+p[0]*q[1]-q[0]*p[1];},0)<0;
  const apertureCentre=contour.reduce((a,p)=>a.map((n,k)=>n+p[k]/contour.length),[0,0]);
  mappedPolygon(g,dark,inner,(x,y)=>{const p=map(x,y);p[2]-=depth;return p;},[],false,12);
  const lipPoints=[];
  for(let j=0;j<contour.length;j++){
   const a=contour[j],b=contour[(j+1)%contour.length],c=inner[j],d=inner[(j+1)%inner.length];
   const wall=surface(g,carbon,12,5,(u,v)=>{const p=map(lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v));p[2]-=depth*(v*.32+v*v*.68);return p;},reverseReturn);
   wall.name='urus-'+kind+'-return';wall.userData.apertureCentre=apertureCentre;
   for(let k=0;k<24;k++)lipPoints.push(map(lerp(a[0],b[0],k/24),lerp(a[1],b[1],k/24)));
  }
  line(g,black,[...lipPoints,lipPoints[0]],lip);
 }
 // A physical-height grid keeps shoulder and handle detail on coherent rows.
 // The former wheel-arch-following parameter rows cut those thin features
 // diagonally, making highlights pinch even with analytic source normals.
 const samples=(a,b,step,extra=[])=>{
  const count=Math.ceil((b-a)/step),values=[...Array.from({length:count+1},(_,i)=>lerp(a,b,i/count)),...extra];
  return values.filter(x=>x>=a&&x<=b).sort((x,y)=>x-y).filter((x,i,all)=>!i||x-all[i-1]>.00001);
 };
 const sideZ=samples(-2.48,2.48,.022,[-.37,-1.22].flatMap(z=>samples(z-.145,z+.145,.008)));
 const sideY=samples(.24,1.28,.018,samples(.84,1.27,.006));
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
   const y=belt(z)-.077;
   surface(g,black,48,12,(u,v)=>{
    const a=u*Math.PI*2,t=v*2-1,zz=z+t*.084,end=clamp((Math.abs(t)-.77)/.23,0,1),r=Math.sqrt(Math.max(0,1-end*end)),yy=y+Math.sin(a)*.012*r,p=sidePoint(s,zz,yy,0);
    p[0]+=s*(.008+.020*Math.sin(v*Math.PI)+Math.cos(a)*.010*r);return p;
   },s<0).name='urus-sculpted-door-handle';
   // Small capacitive pad and cap division, fitted to the curved pull.
   line(g,grille,[[z-.052,y-.006],[z-.052,y+.006]].map(([zz,yy])=>sidePoint(s,zz,yy,.025)),.00065);
  }
  // Low front-fender outlet is recessed and finishes at the front door seam.
  const vent=[[.99,1.030],[.75,1.085],[.76,.965]];
  mappedPolygon(g,carbon,vent,(z,y)=>sidePoint(s,z,y,.008),[],s>0);
  for(let j=0;j<3;j++)line(g,grille,[[.77,.983+j*.019],[.87,1.007+j*.017]].map(([z,y])=>sidePoint(s,z,y,.013)),.002);
 }
 // A continuous painted greenhouse surround, with inset flush glass. The
 // previous independent rail tubes left gaps and looked like a roll cage.
 const roof=[[-2.20,1.252,.875],[-1.94,1.386,.835],[-1.53,1.547,.783],[-1.13,1.586,.748],[-.62,1.590,.734],[-.06,1.567,.735],[.24,1.438,.785],[.72,1.136,.855]];
 const sideGlass=[[[.636,1.143],[.006,1.534],[-.536,1.547],[-.586,1.217]],
  [[-.655,1.224],[-.607,1.548],[-1.170,1.521],[-1.360,1.284]],
  [[-1.413,1.287],[-1.255,1.494],[-1.470,1.431],[-1.700,1.348],[-1.840,1.316],[-1.860,1.298],[-1.730,1.285]]].map((points,i)=>roundContour(points,i===2?.041:.025));
 const canopyPoint=(s,z,y,offset=0)=>{
  const h=station(roof,z,1),t=(y-belt(z))/(h-belt(z));
  const base=sidePoint(s,z,belt(z));
  return[s*(lerp(Math.abs(base[0]),station(roof,z,2),t)+.017*Math.sin(Math.PI*t)+offset),y,lerp(base[2],z,t)];
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
   mappedPolygon(g,frit,glass,(z,y)=>map([z,y],-.0018),[inset(glass,.978)],s>0,12);
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
  const mirrorShape=[[-.085,-.035],[-.092,.008],[-.065,.043],[.051,.044],[.094,.022],[.099,-.026],[.051,-.043],[-.060,-.044]];
  const mirrorLoop=new T.CatmullRomCurve3(mirrorShape.map(([x,y])=>new T.Vector3(x,y,0)),true,'centripetal');
  surface(g,carbon,96,28,(u,v)=>{const p=mirrorLoop.getPoint(u),r=Math.cos(v*Math.PI/2);return[s*(.991+p.x*r),1.210+p.y*r,.394+.177*Math.sin(v*Math.PI/2)];},s<0);
  mappedPolygon(g,black,mirrorShape,(x,y)=>[s*(.991+x),1.210+y,.393],[],s<0,14);
  mappedPolygon(g,m.chrome,mirrorShape.map(p=>p.map(n=>n*.85)),(x,y)=>[s*(.991+x),1.210+y,.391-.002*(1-(x/.09)**2)],[],s<0,14);
 }
 const canopy=(u,z,off=0)=>{
  const t=u*2-1,crown=.011+.017*smooth(z,-1.40,-1.06)*(1-smooth(z,-.30,.26));
  const bow=.023*smooth(z,-.04,.50)-.014*(1-smooth(z,-2.10,-1.30));
  return[t*station(roof,z,2),station(roof,z,1)+crown*(1-t*t)+off,z+bow*(1-t*t)];
 };
 surface(g,carbon,72,76,(u,v)=>canopy(u,lerp(-1.13,-.06,v)),true);
 surface(g,m.headliner,64,64,(u,v)=>{const p=canopy(lerp(.025,.975,u),lerp(-1.13,-.06,v));p[1]-=.016;return p;});
 // Open ceramic perimeter: no opaque backing sheet behind the windscreen.
 const frontFrame=[[0,-.06],[1,-.06],[1,.72],[0,.72]],frontAperture=[[.025,-.035],[.975,-.035],[.975,.695],[.025,.695]];
 mappedPolygon(g,black,frontFrame,(u,z)=>canopy(u,z),[frontAperture],true,14);
 mappedPolygon(g,m.headliner,frontFrame,(u,z)=>canopy(u,z,-.014),[frontAperture],false,14);
 surface(g,m.windscreen,72,48,(u,v)=>canopy(lerp(.025,.975,u),lerp(-.035,.695,v),.0025),true);
 mappedPolygon(g,frit,frontAperture,(u,z)=>canopy(u,z,.0035),[[[.038,-.021],[.962,-.021],[.962,.677],[.038,.677]]],true,14);
 for(const s of [-1,1])curve(g,rubber,[[s*.10,1.175,.68],[s*.31,1.189,.653],[s*.61,1.191,.647]],.005);
 // Rear hatch glass is bounded by a substantial painted D-pillar and spoiler.
 const rearFrame=[[0,-2.20],[1,-2.20],[1,-1.13],[0,-1.13]],rearOuter=[[.095,-2.12],[.905,-2.12],[.905,-1.22],[.095,-1.22]],rearAperture=[[.112,-2.093],[.888,-2.093],[.888,-1.235],[.112,-1.235]];
 mappedPolygon(g,m.paint,rearFrame,(u,z)=>canopy(u,z),[rearOuter],true,16);
 mappedPolygon(g,m.headliner,rearFrame,(u,z)=>canopy(u,z,-.016),[rearOuter],false,16);
 mappedPolygon(g,black,rearOuter,(u,z)=>canopy(u,z,.003),[rearAperture],true,14);
 surface(g,m.privacyGlass,64,44,(u,v)=>canopy(lerp(.112,.888,u),lerp(-2.093,-1.235,v),.006),true);
 mappedPolygon(g,frit,rearAperture,(u,z)=>canopy(u,z,.007),[[[.125,-2.077],[.875,-2.077],[.875,-1.251],[.125,-1.251]]],true,14);
 for(let j=0;j<8;j++)curve(g,rubber,Array.from({length:24},(_,k)=>canopy(lerp(.13,.87,k/23),-2.04+j*.105,.008)),.0006);
 curve(g,black,[canopy(.49,-2.05,.011),canopy(.37,-2.01,.013),canopy(.24,-1.95,.013)],.005);
 // Bonnet: deep outer cooling apertures, raised fender ridges and a pointed
 // central carbon panel; the perimeter is crowned rather than a flat plane.
 const hoodRows=[[.72,1.156,.81],[1.08,1.125,.849],[1.50,1.091,.870],[1.93,1.055,.844],[2.27,1.017,.762],[2.48,.976,.64]];
 const hood=(x,z,off=0)=>{
  const t=x/station(hoodRows,z,2),fade=smooth(z,.72,.94)*(1-smooth(z,2.25,2.48));
  const blade=.045*gauss(Math.abs(t),.81,.095)-.017*gauss(Math.abs(t),.60,.14);
  const shoulder=.010*gauss(Math.abs(t),.98,.13)*fade;
  // Sweep the leading corners back around the central nose. Carbon and
  // painted domains, cooling-duct returns and seams all use this same map.
  const sweep=.098*smooth(z,1.84,2.48)*Math.abs(t)**1.85;
  return[x,station(hoodRows,z,1)+.039*(1-t*t)+fade*blade+shoulder+off,z-sweep];
 };
 const ventOutline=[[.613,1.27],[.752,1.34],[.691,1.83],[.575,1.96],[.552,1.87]];
 // The cooling ducts are holes in the bonnet. A black patch above an intact
 // hood cannot provide the shadowed return or the visible depth of the vents.
 const bonnetVents=[-1,1].map(s=>ventOutline.map(([x,z])=>[s*x,z]));
 const carbonWidth=z=>station([[.75,.598],[1.22,.584],[1.82,.523],[2.14,.426],[2.25,.324],[2.30,.05]],z,1);
 const panelZ=[...Array.from({length:65},(_,i)=>lerp(.75,2.30,i/64)),1.22,1.82,2.14,2.25].sort((a,b)=>a-b);
 const carbonBoundary=[...panelZ.map(z=>[-carbonWidth(z),z]),...panelZ.slice().reverse().map(z=>[carbonWidth(z),z])];
 // Disjoint parameter domains replace the intact painted bonnet plus a
 // near-coplanar carbon overlay. Every shared edge uses the same hood map.
 // Strong bonnet sculpture can then never push yellow triangles through a
 // differently tessellated carbon sheet, including beside cooling apertures.
 mappedPolygon(g,carbon,carbonBoundary,(x,z)=>hood(x,z),[],true,8).name='urus-partitioned-carbon-bonnet';
 for(const s of [-1,1]){
  const band=[...panelZ.map(z=>[s*station(hoodRows,z,2),z]),...panelZ.slice().reverse().map(z=>[s*carbonWidth(z),z])];
  const vent=bonnetVents[s<0?0:1];
  mappedPolygon(g,m.paint,band,(x,z)=>hood(x,z),[vent],true,8).name='urus-open-vent-bonnet';
 }
 for(const [z0,z1,cw]of [[.72,.75,carbonWidth(.75)],[2.30,2.48,carbonWidth(2.30)]])for(let region=0;region<3;region++){
  surface(g,m.paint,8,12,(u,v)=>{
   const z=lerp(z0,z1,v),w=station(hoodRows,z,2),edges=[-w,-cw,cw,w];return hood(lerp(edges[region],edges[region+1],u),z);
  },true).name='urus-bonnet-painted-end';
 }
 for(const s of [-1,1]){
  surface(g,m.paint,110,12,(u,v)=>{const z=lerp(.72,2.48,u),a=hood(s*station(hoodRows,z,2),z),b=sidePoint(s,z,belt(z));return a.map((n,k)=>lerp(n,b[k],v));},s<0).name='urus-bonnet-shoulder-sheet-'+s;
  curve(g,dark,Array.from({length:65},(_,i)=>{const z=lerp(.74,2.34,i/64);return hood(s*(station(hoodRows,z,2)-.014),z,.002);}),.0014);
  const outline=ventOutline,inner=inset(outline,.88),vent=outline.map(([x,z])=>hood(s*x,z,.0015));
  mappedPolygon(g,carbon,outline,(x,z)=>hood(s*x,z,.001),[inner],s>0,12).name='urus-bonnet-vent-lip';
  mappedPolygon(g,dark,inner,(x,z)=>hood(s*x,z,-.035),[],s>0,12);
  for(let j=0;j<inner.length;j++)surface(g,carbon,16,4,(u,v)=>{const a=outline[j],b=outline[(j+1)%outline.length],c=inner[j],d=inner[(j+1)%inner.length];return hood(s*lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v),lerp(.001,-.035,v));},s<0);
  line(g,black,[...vent,vent[0]],.0025);
  for(let j=0;j<9;j++){const z=1.37+j*.052;quad(grille,hood(s*(.612-.075*(z-1.37)),z,-.018),hood(s*(.735-.130*(z-1.37)),z+.015,-.018),hood(s*(.731-.130*(z-1.37)),z+.024,-.010),hood(s*(.611-.075*(z-1.37)),z+.009,-.010),8,2,s>0);}
 }
 // Wrapped front fascia. Real apertures, a broad splitter and boxed air
 // curtains replace the old flat hexagons and tubular bumper guard.
 const face=(x,y,d=0)=>[x,y,frontSurface(x,y)+d];
 // The nose closes on the same shoulder boundary as sidePoint(). Raising
 // only the fascia to accommodate an oversized lamp contour left proud ears
 // and a gap at the bonnet corners in the native overhead close-up.
 const crestStations=[[0,.977],[.46,1.026],[.843,1.016]];
 const fasciaCrest=x=>{const a=Math.abs(x);for(let i=1;i<crestStations.length;i++)if(a<=crestStations[i][0]){const p=crestStations[i-1],q=crestStations[i];return lerp(p[1],q[1],clamp((a-p[0])/(q[0]-p[0]),0,1));}return crestStations.at(-1)[1];};
 const outline=[[-.977,.44],[-.955,.883],...crestStations.slice(1).reverse().map(([x,y])=>[-x,y]),crestStations[0],...crestStations.slice(1),[.955,.883],[.977,.44],[.89,.261],[.53,.258],[.42,.309],[-.42,.309],[-.53,.258],[-.89,.261]];
 const openings=[[[-.443,.850],[-.354,.883],[.354,.883],[.443,.850],[.402,.736],[-.402,.736]],
  [[-.438,.616],[-.337,.694],[.337,.694],[.438,.616],[.614,.347],[-.614,.347]],
  [[-.918,.798],[-.562,.812],[-.479,.669],[-.739,.378],[-.896,.346],[-.951,.486]],
  [[.918,.798],[.562,.812],[.479,.669],[.739,.378],[.896,.346],[.951,.486]]];
 const lampContour=[[.434,.959],[.488,1.005],[.835,1.005],[.894,.943],[.856,.918],[.511,.922]];
 const lampHoles=[-1,1].map(s=>lampContour.map(([x,y])=>[s*x,y]));
 mappedPolygon(g,m.paint,outline,face,[...openings,...lampHoles],false,12).name='urus-perforated-front-fascia';
 for(const contour of openings)opening(contour,face,.105,.004);
 for(const contour of lampHoles)opening(contour,face,.042,.002,'headlamp');
 // Thin real horizontal bars over a recessed cellular radiator.
 for(let j=0;j<4;j++)quad(grille,face(-.36,.407+j*.065,-.060),face(.36,.407+j*.065,-.060),face(.36,.416+j*.065,-.062),face(-.36,.416+j*.065,-.062),30,2);
 for(const s of [-1,1])for(let j=0;j<4;j++)quad(black,face(s*.60,.465+j*.074,-.045),face(s*.883,.485+j*.070,-.045),face(s*.883,.498+j*.070,-.046),face(s*.60,.478+j*.074,-.046),20,2);
 for(let y=.40;y<.63;y+=.035)for(let x=-.31;x<.32;x+=.040){const cell=Array.from({length:7},(_,i)=>face(x+.018*Math.cos(i*Math.PI/3),y+.017*Math.sin(i*Math.PI/3),-.09));line(g,grille,cell,.0011);}
 // Performante's broad airfoil connects the three lower intakes, and the
 // angular radar housing interrupts the center instead of a featureless slot.
 surface(g,black,112,5,(u,v)=>{const x=(u*2-1)*.895,y=.695+.025*(1-(x/.895)**2);return face(x,y+v*.013,-.020-.029*Math.sin(v*Math.PI));},true).name='urus-intake-crossblade';
 const radar=[[-.086,.750],[-.047,.787],[.047,.787],[.086,.750],[.049,.705],[-.049,.705]];
 mappedPolygon(g,black,radar,(x,y)=>face(x,y,-.010),[],false,8);
 line(g,grille,[...radar,radar[0]].map(([x,y])=>face(x,y,-.006)),.0023);
 const radarLens=mesh(g,new T.CircleGeometry(.029,32),black,face(0,.746,.001));radarLens.name='urus-radar-aperture';
 surface(g,carbon,90,8,(u,v)=>{const x=(u*2-1)*.965,y=.246+.025*Math.abs(x)/.965;const a=face(x,y,.028),b=face(x,y+.012,-.18);return a.map((n,k)=>lerp(n,b[k],v));},true);
 // Keep the endpoint fixed while interpolating. Varying it with v made the
 // strip's outer edge bow away from the straight shoulder edge between two
 // matching corners, leaving a visible gap despite correct endpoints.
 // Include every fascia station in this boundary's sampling grid. Smooth
 // station interpolation or a grid that omits a corner cannot close against
 // the actual polygon boundary of the adjoining fascia sheet.
 const crownX=u=>{const t=(u*2-1),a=Math.abs(t);return Math.sign(t)*(a<=.5?lerp(0,.46,a*2):lerp(.46,.843,(a-.5)*2));};
 surface(g,m.paint,72,10,(u,v)=>{const x=crownX(u),a=hood((u*2-1)*.64,2.48),b=face(x,fasciaCrest(x));return a.map((n,k)=>lerp(n,b[k],v));},true).name='urus-bonnet-to-fascia-crown';
 for(const s of [-1,1]){
  const outline=lampContour;
  mappedPolygon(g,black,outline,(x,y)=>face(s*x,y,-.034),[],s<0,8).name='urus-recessed-headlamp-bucket';
  const light=([x,y])=>face(s*x,y,-.003);
  // Lamborghini Y light guide, individual projector lenses and dark surround.
  line(g,drl,[[.515,.943],[.806,.945],[.868,.967]].map(light),.0045);
  line(g,drl,[[.806,.945],[.862,.932]].map(light),.0045);
  for(let j=0;j<3;j++){
   const cx=s*(.644+j*.076),cy=.981,p=face(cx,cy,-.022);
   box(g,black,p,[.050,.026,.012],.004);
   // A recessed optical bowl, raised rim and convex projector replace the
   // flat bright rectangle. Everything stays behind the outer lamp cover.
   surface(g,m.headlampReflector,32,10,(u,v)=>{const a=u*Math.PI*2,r=.24+.76*v;return face(cx+.020*Math.cos(a)*r,cy+.0098*Math.sin(a)*r,-.024+.012*r*r);},true).name='urus-recessed-projector-reflector';
   surface(g,m.headlampCore,24,8,(u,v)=>{const a=u*Math.PI*2,r=v;return face(cx+.009*Math.cos(a)*r,cy+.0058*Math.sin(a)*r,-.018+.0035*(1-r*r));},true);
   surface(g,m.lens,32,10,(u,v)=>{const a=u*Math.PI*2,r=v;return face(cx+.0178*Math.cos(a)*r,cy+.0085*Math.sin(a)*r,-.009+.0035*(1-r*r));},true).name='urus-convex-projector-lens';
  }
  mappedPolygon(g,m.lens,inset(outline,.98),(x,y)=>face(s*x,y,.004+.003*(1-((x-.70)/.27)**2)),[],s<0,12).name='urus-formed-clear-headlamp-cover';
  // Long air curtain wraps around the outside of each side intake.
  mappedPolygon(g,carbon,[[.941,.818],[.987,.764],[.994,.441],[.921,.315],[.902,.374],[.953,.504]],(x,y)=>face(s*x,y,.006),[],s<0,12);
 }
 polygon(g,m.badge,[face(-.024,.944,.008),face(.024,.944,.008),face(.020,.908,.008),face(0,.891,.008),face(-.020,.908,.008)]);
 box(g,black,face(0,.800,.007),[.073,.027,.012],.003);
 // Full hatch, broad rear shoulders and recessed plate pocket. The rear
 // corners taper in plan view; exhaust outlets sit inside the diffuser.
 const tail=(x,y,d=0)=>[x,y,rearSurface(x,y)+d];
 const plateOutline=[[-.31,.858],[.31,.858],[.365,.754],[.291,.643],[-.291,.643],[-.365,.754]];
 const tailEdge=y=>station([[.53,.938],[.76,.971],[1.04,.947],[1.155,.881]],y,1);
 const hatchOutline=[...Array.from({length:41},(_,i)=>{const y=lerp(.53,1.155,i/40);return[-tailEdge(y),y];}),...Array.from({length:41},(_,i)=>{const y=lerp(1.155,.53,i/40);return[tailEdge(y),y];})];
 mappedPolygon(g,m.paint,hatchOutline,(x,y)=>tail(x,y),[plateOutline],true,12).name='urus-sculpted-hatch-sheet';
 surface(g,m.paint,90,28,(u,v)=>{const x=(2*u-1)*lerp(.881,.875,v),a=tail(x,1.155),b=canopy(u,-2.20);return a.map((n,k)=>lerp(n,b[k],v));},true);
 surface(g,carbon,90,28,(u,v)=>{const y=lerp(.252,.58,v),x=(2*u-1)*lerp(.88,.938,v);return tail(x,y,.06*(1-v));});
 mappedPolygon(g,black,[[-.37,1.145],[.37,1.145],[.37,1.044],[-.37,1.044]],(x,y)=>tail(x,y,-.008),[],true,12);
 const plateInner=inset(plateOutline,.91);
 for(let j=0;j<plateOutline.length;j++)surface(g,m.paint,24,6,(u,v)=>{const a=plateOutline[j],b=plateOutline[(j+1)%plateOutline.length],c=plateInner[j],d=plateInner[(j+1)%plateInner.length];return tail(lerp(lerp(a[0],b[0],u),lerp(c[0],d[0],u),v),lerp(lerp(a[1],b[1],u),lerp(c[1],d[1],u),v),v*.057);},true).name='urus-recessed-plate-return';
 mappedPolygon(g,black,plateInner,(x,y)=>tail(x,y,.058),[],true,12);
 const plate=finish(new T.MeshStandardMaterial({color:'#bfc5c7',roughness:.34}),'metal');
 box(g,plate,tail(0,.747,.049),[.428,.101,.008],.004);
 const text=geometryText(g,'TD 2024',.31,.041,black);text.position.set(0,.727,tail(0,.747,.043)[2]);text.rotation.y=Math.PI;
 const gateOutline=[[-.86,1.188],[-.925,1.024],[-.898,.721],[-.760,.596],[.760,.596],[.898,.721],[.925,1.024],[.86,1.188]];
 line(g,dark,gateOutline.map(([x,y])=>tail(x,y,-.0018)),.0018);
 box(g,black,tail(0,.895,-.004),[.117,.020,.015],.004);
 for(const x of [-.126,.126])box(g,drl,tail(x,.855,.027),[.042,.005,.019],.001);
 for(const s of [-1,1]){
  const outline=[[.245,1.095],[.345,1.150],[.870,1.142],[.948,1.083],[.870,1.028],[.335,1.039]];
  mappedPolygon(g,black,outline,(x,y)=>tail(s*x,y,-.010),[],s>0,12);
  const light=([x,y])=>tail(s*x,y,-.020);
  line(g,m.red,[[.420,1.082],[.780,1.080],[.908,1.113]].map(light),.006);
  line(g,m.red,[[.780,1.080],[.908,1.050]].map(light),.005);
  box(g,m.reverse,tail(s*.814,1.045,-.021),[.107,.012,.009],.002);
  mappedPolygon(g,m.lens,outline,(x,y)=>tail(s*x,y,-.027-.003*(1-((x-.70)/.27)**2)),[],s>0,8).name='urus-moulded-tail-lamp-cover';
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
 // A closed cambered airfoil follows the transverse crown and rounded tips.
 // The earlier paired rectangular sheets still made a slab-shaped wing.
 const spoiler=(u,v,underside=false)=>{
  const t=u*2-1,x=t*lerp(.763,.855,v),tip=smooth(Math.abs(t),.88,1),chord=lerp(-1.20,-1.58,v)+.021*t*t;
  const camber=.010*Math.sin(v*Math.PI),thickness=.009+.012*Math.sin(v*Math.PI)**.62;
  return[x,1.608-.025*v-.018*t*t+camber-(underside?thickness:0)-.004*tip*Math.sin(v*Math.PI),chord];
 };
 surface(g,carbon,72,24,(u,v)=>spoiler(u,v)).name='urus-cambered-spoiler-upper';
 surface(g,carbon,72,24,(u,v)=>spoiler(u,v,true),true);
 for(const v of [0,1])surface(g,carbon,72,4,(u,w)=>{const a=spoiler(u,v),b=spoiler(u,v,true);return a.map((n,k)=>lerp(n,b[k],w));},v===0);
 for(const s of [-1,1]){
  surface(g,carbon,24,4,(v,w)=>{const a=spoiler((s+1)/2,v),b=spoiler((s+1)/2,v,true);return a.map((n,k)=>lerp(n,b[k],w));},s>0);
  mappedPolygon(g,carbon,[[-1.37,1.559],[-1.559,1.568],[-1.629,1.503],[-1.43,1.517]],(z,y)=>[s*(.817+.047*clamp((-z-1.37)/.26,0,1)),y,z],[],s>0,8);
 }
 box(g,m.red,[0,1.568,-1.582],[.466,.010,.009],.002);
 box(g,rubber,[0,.227,-.10],[1.46,.035,2.73]);
 urusCabin(g,m,carbon,{sidePoint,belt});
 view.root.userData.visualModel={type:'Reference-built continuous coachwork and cabin',version:12,sculptedBonnetRidges:true,sweptBonnetLeadingEdge:true,foldedRearHatch:true,sharedEndReturns:true,physicalHeightDoorGrid:true,continuousDoorSections:true,shallowHandleRecesses:true,ceramicGlazingBorders:true,recessedProjectorOptics:true,openGlazing:true,openBonnetVents:true,partitionedBonnet:true,recessedHatchPlate:true,airfoilSpoiler:true,camberedClosedSpoiler:true,crownedGreenhouse:true,sculptedDoorCups:true,importedManufacturerCAD:false,landmarks:URUS_BODY_LANDMARKS};return view;
}
