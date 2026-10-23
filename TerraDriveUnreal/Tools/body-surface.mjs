// Native-only compound body surfaces. Metres, Y up, nose +Z.
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
export {T};
export const clamp=T.MathUtils.clamp, smooth=T.MathUtils.smoothstep, lerp=T.MathUtils.lerp;
export function mesh(g,geo,m,p=[0,0,0]){const o=new T.Mesh(geo,m);o.position.set(...p);g.add(o);return o;}
export function box(g,m,p,s,r=0){
 r=Math.min(r,...s.map(v=>v*.24));
 if(!r)return mesh(g,new T.BoxGeometry(...s),m,p);
 const sh=new T.Shape(),x=s[0]/2-r,y=s[1]/2-r;
 sh.moveTo(-x,-y);sh.lineTo(x,-y);sh.lineTo(x,y);sh.lineTo(-x,y);sh.closePath();
 const geo=new T.ExtrudeGeometry(sh,{depth:s[2]-r*2,steps:1,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:4});geo.translate(0,0,-s[2]/2+r);return mesh(g,geo,m,p);
}
export function surface(g,m,nu,nv,sample,flip=false,cutout=null){
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
export function line(g,m,pts,r=.003){const path=new T.CurvePath();for(let i=1;i<pts.length;i++)path.add(new T.LineCurve3(new T.Vector3(...pts[i-1]),new T.Vector3(...pts[i])));return mesh(g,new T.TubeGeometry(path,Math.max(8,pts.length*3),r,8,false),m);}
export function curve(g,m,pts,r=.003){return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p)),false,'centripetal'),Math.max(48,pts.length*12),r,8,false),m);}
export function station(rows,z,k){
 const slope=(a,b)=>(b[k]-a[k])/(b[0]-a[0]),tan=i=>{if(!i)return slope(rows[0],rows[1]);if(i===rows.length-1)return slope(rows[i-1],rows[i]);const a=slope(rows[i-1],rows[i]),b=slope(rows[i],rows[i+1]);return a*b<=0?0:2*a*b/(a+b);};z=clamp(z,rows[0][0],rows.at(-1)[0]);
 for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){const a=rows[i-1],b=rows[i],h=b[0]-a[0],t=(z-a[0])/h;return(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*h*tan(i-1)+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*h*tan(i);}return rows.at(-1)[k];
}
