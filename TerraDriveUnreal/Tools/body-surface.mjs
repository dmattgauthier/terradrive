// Native-only compound body surfaces. Metres, Y up, nose +Z.
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {nativeGeometry} from './vehicle-geometry.mjs';
export {T};
export const clamp=T.MathUtils.clamp, smooth=T.MathUtils.smoothstep, lerp=T.MathUtils.lerp;
export function mesh(g,geo,m,p=[0,0,0]){const o=new T.Mesh(geo,m);o.position.set(...p);g.add(o);return o;}
export function box(g,m,p,s,r=0){
 if(!r)return mesh(g,new T.BoxGeometry(...s),m,p);
 return nativeGeometry.roundedBox(g,m,...p,...s,r);
}
export function surface(g,m,nu,nv,sample,flip=false,cutout=null){
 if(!cutout)return nativeGeometry.surface(g,m,nu,nv,sample,flip);
 const p=[],uv=[],ix=[];
 for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){p.push(...sample(i/nu,j/nv));uv.push(i/nu,j/nv);}
 for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){if(cutout?.((i+.5)/nu,(j+.5)/nv))continue;const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;ix.push(...(flip?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();return mesh(g,geo,m);
}
// Concave sheet boundaries and real openings require contour triangulation.
export function polygon(g,m,pts,axis=2,holes=[]){
 const dims=[0,1,2].filter(d=>d!==axis),project=p=>new T.Vector2(p[dims[0]],p[dims[1]]);
 const ix=T.ShapeUtils.triangulateShape(pts.map(project),holes.map(h=>h.map(project))).flat(),geo=new T.BufferGeometry();
 const vertices=[pts,...holes].flat(1);geo.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));
 geo.setAttribute('uv',new T.Float32BufferAttribute(vertices.flatMap(p=>[p[dims[0]],p[dims[1]]]),2));geo.setIndex(ix);geo.computeVertexNormals();return mesh(g,geo,m);
}
// Triangulate in parameter space, then subdivide and project each triangle.
// A single polygon chord cuts through a curved panel between its corners.
export function mappedPolygon(g,m,contour,map,holes=[],flip=false,steps=10){
 const points=[contour,...holes].flat(1),v2=p=>new T.Vector2(...p);
 let triangles=T.ShapeUtils.triangulateShape(contour.map(v2),holes.map(h=>h.map(v2)));
 const nodes=[],midpoints=new Map(),derivativeStep=.00002;
 const vertex=q=>{
  const p=new T.Vector3(...map(...q));
  const du=new T.Vector3(...map(q[0]+derivativeStep,q[1])).sub(new T.Vector3(...map(q[0]-derivativeStep,q[1])));
  const dv=new T.Vector3(...map(q[0],q[1]+derivativeStep)).sub(new T.Vector3(...map(q[0],q[1]-derivativeStep)));
  return {q,p,n:du.cross(dv).normalize().multiplyScalar(flip?-1:1)};
 };
 for(const q of points)nodes.push(vertex(q));
 const middle=(a,b)=>{
  const key=a<b?a+':'+b:b+':'+a;
  if(!midpoints.has(key)){midpoints.set(key,nodes.length);nodes.push(vertex(nodes[a].q.map((v,k)=>(v+nodes[b].q[k])*.5)));}
  return midpoints.get(key);
 };
 // Conforming edge splits share the exact midpoint. Independent per-face
 // subdivision leaves T-junctions, while a fixed steps*steps grid over-refines
 // flat sheets and still aliases narrow pressed creases. The finite error
 // bounds preserve panel shapes, real holes and analytic surface normals.
 const maxSag=.00055,maxNormalAngle=.75*Math.PI/180;
 const triangleBudget=Math.min(180000,triangles.length*steps*steps*.80);
 const normalError=(actual,estimate)=>actual.lengthSq()>.25&&estimate.lengthSq()>.25?Math.acos(clamp(actual.dot(estimate.normalize()),-1,1)):0;
 const splitEdge=(a,b,c)=>{
  const p=nodes[a],q=nodes[b],mid=nodes[c],chord=p.p.clone().add(q.p).multiplyScalar(.5);
  return mid.p.distanceToSquared(chord)>maxSag*maxSag||normalError(mid.n,p.n.clone().add(q.n))>maxNormalAngle;
 };
 let refinements=0;
 for(;refinements<6;refinements++){
  const split=new Set();
  for(const [a,b,c]of triangles){
   for(const [i,j]of [[a,b],[b,c],[c,a]]){const at=middle(i,j);if(splitEdge(i,j,at))split.add(at);}
   const bary=vertex(nodes[a].q.map((v,k)=>(v+nodes[b].q[k]+nodes[c].q[k])/3));
   const chord=nodes[a].p.clone().add(nodes[b].p).add(nodes[c].p).multiplyScalar(1/3);
   if(bary.p.distanceToSquared(chord)>maxSag*maxSag||normalError(bary.n,nodes[a].n.clone().add(nodes[b].n).add(nodes[c].n))>maxNormalAngle){split.add(middle(a,b));split.add(middle(b,c));split.add(middle(c,a));}
  }
  if(!split.size)break;
  const next=[];
  for(const [a,b,c]of triangles){
   const ab=middle(a,b),bc=middle(b,c),ca=middle(c,a),mask=(split.has(ab)?1:0)|(split.has(bc)?2:0)|(split.has(ca)?4:0);
   if(mask===0)next.push([a,b,c]);
   else if(mask===1)next.push([a,ab,c],[ab,b,c]);
   else if(mask===2)next.push([b,bc,a],[bc,c,a]);
   else if(mask===4)next.push([c,ca,b],[ca,a,b]);
   else if(mask===3)next.push([b,bc,ab],[a,ab,c],[ab,bc,c]);
   else if(mask===6)next.push([c,ca,bc],[b,bc,a],[bc,ca,a]);
   else if(mask===5)next.push([a,ab,ca],[c,ca,b],[ca,ab,b]);
   else next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
  }
  triangles=next;
  if(triangles.length>triangleBudget)return fixedMappedPolygon(g,m,contour,map,holes,flip,steps);
 }
 if(refinements===6)return fixedMappedPolygon(g,m,contour,map,holes,flip,steps);
 const p=[],norm=[],uv=[],ix=[],used=new Map();
 for(const triangle of triangles){
  const ids=triangle.map(id=>{if(!used.has(id)){const node=nodes[id];used.set(id,p.length/3);p.push(...node.p.toArray());norm.push(...node.n.toArray());uv.push(...node.q);}return used.get(id);});
  ix.push(...(flip?[ids[0],ids[2],ids[1]]:ids));
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);
 const result=mesh(g,geo,m);result.userData.surfaceTessellation={revision:1,conforming:true,maxSagM:maxSag,maxNormalDegrees:.75,refinements,triangles:triangles.length,sharedVertices:used.size};return result;
}
function fixedMappedPolygon(g,m,contour,map,holes=[],flip=false,steps=10){
 const points=[contour,...holes].flat(1),v2=p=>new T.Vector2(...p);
 const triangles=T.ShapeUtils.triangulateShape(contour.map(v2),holes.map(h=>h.map(v2)));
 const p=[],norm=[],uv=[],ix=[];
 for(const triangle of triangles){
  const [a,b,c]=triangle.map(i=>points[i]),ids=[];
  for(let i=0;i<=steps;i++){ids[i]=[];for(let j=0;j<=steps-i;j++){
   const q=a.map((v,k)=>v+(b[k]-v)*i/steps+(c[k]-v)*j/steps),v=map(...q);
   const h=.0001,du=new T.Vector3(...map(q[0]+h,q[1])).sub(new T.Vector3(...map(q[0]-h,q[1]))),dv=new T.Vector3(...map(q[0],q[1]+h)).sub(new T.Vector3(...map(q[0],q[1]-h)));
   const n=du.cross(dv).normalize().multiplyScalar(flip?-1:1);ids[i][j]=p.length/3;p.push(...v);norm.push(...n.toArray());uv.push(...q);
  }}
  const emit=(a,b,c)=>ix.push(...(flip?[a,c,b]:[a,b,c]));
  for(let i=0;i<steps;i++)for(let j=0;j<steps-i;j++){
   emit(ids[i][j],ids[i+1][j],ids[i][j+1]);
   if(j<steps-i-1)emit(ids[i+1][j],ids[i+1][j+1],ids[i][j+1]);
  }
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);return mesh(g,geo,m);
}
export function line(g,m,pts,r=.003){return nativeGeometry.polylineTube(g,m,pts,r);}
export function curve(g,m,pts,r=.003){return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p)),false,'centripetal'),Math.max(48,pts.length*12),r,8,false),m);}
export function station(rows,z,k){
 const slope=(a,b)=>(b[k]-a[k])/(b[0]-a[0]),tan=i=>{if(!i)return slope(rows[0],rows[1]);if(i===rows.length-1)return slope(rows[i-1],rows[i]);const a=slope(rows[i-1],rows[i]),b=slope(rows[i],rows[i+1]);return a*b<=0?0:2*a*b/(a+b);};z=clamp(z,rows[0][0],rows.at(-1)[0]);
 for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){const a=rows[i-1],b=rows[i],h=b[0]-a[0],t=(z-a[0])/h;return(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*tan(i-1)+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*tan(i);}return rows.at(-1)[k];
}
