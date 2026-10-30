// Original, compact coachwork tooling. Reference photographs are not textures.
import {T,mesh,surface,box} from './body-surface.mjs';

/** Filleted press-tool corners with genuinely straight runs between them. */
export function panelJoint(points,radius=.018,closed=false){
 const p=points.map(v=>new T.Vector3(...(v.length===2?[...v,0]:v))),path=new T.CurvePath();
 if(closed)p.push(p[0].clone());
 let from=p[0];
 for(let i=1;i<p.length-1;i++){
  const here=p[i],r=Math.min(radius,here.distanceTo(p[i-1])*.28,here.distanceTo(p[i+1])*.28);
  const a=here.clone().add(p[i-1].clone().sub(here).normalize().multiplyScalar(r));
  const b=here.clone().add(p[i+1].clone().sub(here).normalize().multiplyScalar(r));
  if(from.distanceTo(a)>1e-8)path.add(new T.LineCurve3(from,a));
  path.add(new T.QuadraticBezierCurve3(a,here,b));from=b;
 }
 if(from.distanceTo(p.at(-1))>1e-8)path.add(new T.LineCurve3(from,p.at(-1)));
 return path;
}

/** Open hexagonal radiator mesh, including inward-facing cell walls. */
export function cellularGrille(g,material,contour,map,{pitch=.035,web=.0020,depth=.008,flip=false,name='formed-open-cell-grille'}={}){
 const inside=(x,y)=>{let yes=false;for(let i=0,j=contour.length-1;i<contour.length;j=i++){
  const a=contour[i],b=contour[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }return yes;};
 const lo=[Math.min(...contour.map(p=>p[0])),Math.min(...contour.map(p=>p[1]))],hi=[Math.max(...contour.map(p=>p[0])),Math.max(...contour.map(p=>p[1]))];
 const r=pitch/Math.sqrt(3),inner=r-web,p=[],uv=[],ix=[];let cells=0;
 const add=(vertices,reverse=false)=>{const k=p.length/3;p.push(...vertices.flat());uv.push(0,0,1,0,1,1,0,1);ix.push(...((flip!==reverse)?[k,k+2,k+1,k,k+3,k+2]:[k,k+1,k+2,k,k+2,k+3]));};
 for(let col=0,x=lo[0]+r;x<hi[0]-r;col++,x+=r*1.5)for(let y=lo[1]+pitch*.5+(col%2)*pitch*.5;y<hi[1]-pitch*.5;y+=pitch){
  const outer=Array.from({length:6},(_,i)=>[x+r*Math.cos(i*Math.PI/3),y+r*Math.sin(i*Math.PI/3)]);
  if(!outer.every(v=>inside(...v)))continue;cells++;
  const hole=outer.map(([a,b])=>[x+(a-x)*inner/r,y+(b-y)*inner/r]);
  for(let i=0;i<6;i++){
   const j=(i+1)%6,o=map(...outer[i]),oo=map(...outer[j]),a=map(...hole[i]),b=map(...hole[j]);
   add([o,oo,b,a]);
   const aa=[a[0],a[1],a[2]-depth],bb=[b[0],b[1],b[2]-depth];add([a,b,bb,aa]);
  }
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();
 const result=mesh(g,geo,material);result.name=name;result.userData.openCells=cells;result.userData.cellDepth=depth;return result;
}

/** Two different factory round-lamp families, with physical bowls and covers. */
export function roundSUVLamp(g,m,x,y,z,r,bronco=false){
 const group=new T.Group();group.position.set(x,y,z);group.name=(bronco?'bronco':'wrangler')+'-layered-led-headlamp';g.add(group);
 const disc=(mat,rad,zz)=>mesh(group,new T.CircleGeometry(rad,64),mat,[0,0,zz]);
 const ring=(mat,rad,tube,zz)=>mesh(group,new T.TorusGeometry(rad,tube,8,64),mat,[0,0,zz]);
 disc(m.black,r*1.035,.010);ring(m.grille,r*1.012,r*.020,.028);
 surface(group,m.headlampReflector,64,12,(u,v)=>{const a=u*Math.PI*2,rr=r*(.15+.77*v);return[Math.cos(a)*rr,Math.sin(a)*rr,.010+.030*(rr/r)**2];},true);
 disc(m.dark,r*.78,.030);
 ring(m.white,r*.895,r*(bronco?.035:.027),.046);
 // The clear central optic is rectangular on the JL LED lamp, while the
 // Bronco has the broad horizontal guide crossing its round optical unit.
 const coreW=r*(bronco?.83:.80),coreH=r*(bronco?.32:.36);
 box(group,m.grille,[0,0,.035],[coreW*1.32,coreH*1.47,.014],r*.10);
 box(group,m.headlampCore,[0,0,.044],[coreW,coreH,.009],r*.07);
 for(const side of [-1,1]){
  box(group,m.satinMetal||m.chrome,[side*r*.58,-r*.10,.036],[r*.14,r*.38,.009],r*.025);
  for(let i=0;i<3;i++)box(group,m.dark,[side*r*.58,-r*.23+i*r*.11,.042],[r*.12,r*.012,.002],.0005);
 }
 if(bronco)box(group,m.white,[Math.sign(x)*-r*.34,0,.050],[r*1.83,r*.115,.009],r*.035);
 else{
  box(group,m.satinMetal||m.chrome,[0,-r*.46,.036],[r*1.14,r*.09,.010],r*.02);
  box(group,m.black,[0,-r*.49,.043],[r*.36,r*.047,.002],r*.01);
 }
 surface(group,m.lens,64,14,(u,v)=>{const a=u*Math.PI*2,rr=r*.958*v;return[Math.cos(a)*rr,Math.sin(a)*rr,.058+.010*(1-v*v)];},true);
 return group;
}
