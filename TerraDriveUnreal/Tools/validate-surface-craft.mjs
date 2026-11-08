// Independent source checks for solid, continuous reveals and panel fairness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {T,mappedPolygon} from './body-surface.mjs';
import {nativeGeometry as geo} from './vehicle-geometry.mjs';
const material=new T.MeshStandardMaterial(),group=new T.Group();
const points=[[0,0,0],[.1,0,0],[.2,.04,0],[.3,.09,0],[.4,.09,0]];
const reveal=geo.polylineTube(group,material,points,.003),p=reveal.geometry.attributes.position,n=reveal.geometry.attributes.normal,ix=reveal.geometry.index;
for(let station=0;station<points.length;station++)for(let j=0;j<=8;j++){
 const i=station*9+j,at=new T.Vector3().fromBufferAttribute(p,i),normal=new T.Vector3().fromBufferAttribute(n,i);
 assert.ok(Math.abs(at.distanceTo(new T.Vector3(...points[station]))-.003)<1e-7,'reveal keeps its authored centerline and section radius');
 assert.ok(Math.abs(normal.length()-1)<1e-6,'reveal normals stay unit length');
}
const triangleNormal=(positions,a,b,c)=>new T.Vector3().fromBufferAttribute(positions,b).sub(new T.Vector3().fromBufferAttribute(positions,a)).cross(new T.Vector3().fromBufferAttribute(positions,c).sub(new T.Vector3().fromBufferAttribute(positions,a)));
for(let k=0;k<ix.count;k+=3)assert.ok(triangleNormal(p,ix.getX(k),ix.getX(k+1),ix.getX(k+2)).lengthSq()>1e-18,'every reveal face has area');
const closed=geo.polylineTube(group,material,[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,0]],.003),closedP=closed.geometry.attributes.position;
for(let i=0;i<=8;i++)assert.ok(new T.Vector3().fromBufferAttribute(closedP,i).distanceTo(new T.Vector3().fromBufferAttribute(closedP,36+i))<1e-8,'closed reveal rings meet exactly');
const outline=[[-1,-1],[1,-1],[1,1],[-1,1]],hole=[[-.20,-.20],[-.20,.20],[.20,.20],[.20,-.20]];
const plane=mappedPolygon(group,material,outline,(x,y)=>[x,y,0],[hole]);
assert.equal(plane.geometry.index.count/3,8,'a truly flat aperture sheet keeps only its needed triangles');
const hit=new T.Raycaster(new T.Vector3(0,0,1),new T.Vector3(0,0,-1)).intersectObject(plane);assert.equal(hit.length,0,'real panel aperture stays open');
const bow=(x,y)=>[x,y,.015*x*x+.008*y*y+.003*x*y],panel=mappedPolygon(group,material,outline,bow,[],false,16);
assert.ok(panel.userData.surfaceTessellation,'controlled curved sheet converges within the adaptive budget');
const pp=panel.geometry.attributes.position,nn=panel.geometry.attributes.normal,idx=panel.geometry.index;let maxSag=0,maxNormal=0;
for(let k=0;k<idx.count;k+=3){
 const q=new T.Vector3(),normal=new T.Vector3();for(let j=0;j<3;j++){const id=idx.getX(k+j);q.add(new T.Vector3().fromBufferAttribute(pp,id));normal.add(new T.Vector3().fromBufferAttribute(nn,id));}q.multiplyScalar(1/3);
 const exact=new T.Vector3(-(.030*q.x+.003*q.y),-(.016*q.y+.003*q.x),1).normalize();maxSag=Math.max(maxSag,Math.abs(q.z-bow(q.x,q.y)[2]));maxNormal=Math.max(maxNormal,Math.acos(T.MathUtils.clamp(exact.dot(normal.normalize()),-1,1))*180/Math.PI);
}
assert.ok(maxSag<.00055&&maxNormal<.75,'curved sheet satisfies physical and shading bounds independently');
const report={kind:'source-geometry',nativeAcceptance:false,continuousReveal:{stations:points.length,vertices:p.count,oldSegmentedCylinderVertices:(points.length-1)*46,triangles:ix.count/3,closedSeam:true},flatApertureTriangles:plane.geometry.index.count/3,curvedPanel:{triangles:idx.count/3,originalFixedTriangles:2*16*16,maxSagM:maxSag,maxNormalDegrees:maxNormal},pass:true};
fs.writeFileSync(new URL('../docs/surface-craft-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
