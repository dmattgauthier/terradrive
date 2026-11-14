// Cut the swept tire openings out of the actual coachwork mesh. Input OBJ uses
// (source Z, source X, source Y) in centimetres; the envelopes use source metres.
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';
import assert from 'node:assert/strict';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const epsilon=1e-8;

function split(poly,plane){
 const inside=[],outside=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  const da=dot(a,plane.normal)-plane.distance,db=dot(b,plane.normal)-plane.distance;
  (da<=epsilon?inside:outside).push(a);
  if((da< -epsilon&&db>epsilon)||(da>epsilon&&db< -epsilon)){
   const t=da/(da-db),p=a.map((v,k)=>v+(b[k]-v)*t);
   inside.push(p);outside.push(p);
  }else if(Math.abs(da)<=epsilon){
   outside.push(a);
  }
 }
 return {inside,outside};
}

function subtract(poly,{planes,bounds}){
 for(let axis=0;axis<3;axis++){
  if(poly.every(p=>p[axis]<bounds.min[axis])||poly.every(p=>p[axis]>bounds.max[axis]))return [poly];
 }
 let entirelyInside=true;
 for(const plane of planes){
  let outside=0;
  for(const p of poly)if(dot(p,plane.normal)>plane.distance+epsilon)outside++;
  if(outside===poly.length)return [poly];
  if(outside)entirelyInside=false;
 }
 if(entirelyInside)return [];
 const pieces=[];
 for(const plane of planes){
  const cut=split(poly,plane);
  if(cut.outside.length>=3)pieces.push(cut.outside);
  poly=cut.inside;
  if(poly.length<3)break;
 }
 return pieces;
}

function measure(a,b,c){
 const u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);
 return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
}

function closedBacking(volume){
 // A recessed, opaque liner closes the inner side of the opening. Its
 // upper edge sits clear of the tire even with full steering and bump travel.
 const {side,bounds,axleZ}=volume;
 const x=(side>0?bounds.min[0]:bounds.max[0])-side*.032;
 const arc=volume.planes.filter(p=>Math.abs(p.normal[0])<1e-8&&p.normal[1]>.04);
 const yFloor=volume.centerY-.50;
 const steps=20,mesh=[];
 const at=i=>{
  const z=bounds.min[2]+.004+(bounds.max[2]-bounds.min[2]-.008)*i/steps;
  const y=Math.min(...arc.map(p=>(p.distance-z*p.normal[2])/p.normal[1]))+.002;
  return [x,y,z,side,0,0,(z-axleZ)*2,y*2];
 };
 for(let i=0;i<steps;i++){
  const a=at(i),b=at(i+1),c=[...a],d=[...b];c[1]=yFloor;d[1]=yFloor;
  if(side>0)mesh.push([a,b,c],[b,d,c]);else mesh.push([a,c,b],[b,c,d]);
 }
 return mesh;
}

export async function makeWheelhouseBody(source,target,spec,volumes,liner){
 const digest=crypto.createHash('sha256'),fd=fs.openSync(target,'w');
 let output='',offset=1,positions=[],normals=[],uvs=[],groups=[],base=1,phase='v';
 let sourceFaces=0,cutFaces=0,outputFaces=0,sourceVertices=0;
 const slots=new Set();
 const write=(line)=>{
  output+=line;
  if(output.length>=1024*1024){fs.writeFileSync(fd,output);digest.update(output);output='';}
 };
 const point=(index)=>{
  const i=index-base,p=positions[i],n=normals[i],uv=uvs[i];
  assert.ok(p&&n&&uv,'wheelhouse source contains aligned triangle attributes');
  return [p[1]/100,p[2]/100+spec.cgHeight,p[0]/100,n[1],n[2],n[0],...uv];
 };
 function emit(material,triangles){
  if(!triangles.length)return;
  const ids=new Map(),points=[],faces=[];
  for(const tri of triangles){
   if(measure(...tri)<1e-10)continue;
   faces.push(tri.map(p=>{
    if(!ids.has(p)){ids.set(p,offset+points.length);points.push(p);}
    const i=ids.get(p);return i+'/'+i+'/'+i;
   }).join(' '));
  }
  if(!faces.length)return;
  slots.add(material);
  for(const [x,y,z]of points)write('v '+(z*100).toFixed(6)+' '+(x*100).toFixed(6)+' '+((y-spec.cgHeight)*100).toFixed(6)+'\n');
  for(const [,,,nx,ny,nz]of points){
   const length=Math.hypot(nx,ny,nz)||1;
   write('vn '+(nz/length).toFixed(8)+' '+(nx/length).toFixed(8)+' '+(ny/length).toFixed(8)+'\n');
  }
  for(const [,,,,,,u,v]of points)write('vt '+u.toFixed(7)+' '+v.toFixed(7)+'\n');
  write('usemtl '+material+'\n');
  for(const face of faces)write('f '+face+'\n');
  offset+=points.length;outputFaces+=faces.length;
 }
 function flush(){
  if(!positions.length)return;
  sourceVertices+=positions.length;
  const vertices=new Map();
  for(const group of groups){
   const triangles=[];
   for(const ids of group.faces){
    sourceFaces++;
    const original=ids.map(id=>{
     if(!vertices.has(id))vertices.set(id,point(id));
     return vertices.get(id);
    });
    let pieces=[original];
    for(const volume of volumes){
     pieces=pieces.flatMap(p=>subtract(p,volume));
     if(!pieces.length)break;
    }
    if(pieces.length!==1||pieces[0]!==original)cutFaces++;
    for(const piece of pieces)for(let i=2;i<piece.length;i++)triangles.push([piece[0],piece[i-1],piece[i]]);
   }
   emit(group.material,triangles);
  }
  base+=positions.length;positions=[];normals=[];uvs=[];groups=[];
 }
 try{
  write('# Terra Drive coachwork with oversized-tire wheelhouses. Unreal centimetres.\n');
  const rows=readline.createInterface({input:fs.createReadStream(source),crlfDelay:Infinity});
  for await(const line of rows){
   if(line.startsWith('v ')){
    if(phase!=='v')flush();
    phase='v';positions.push(line.slice(2).split(' ').map(Number));
   }else if(line.startsWith('vn ')){
    phase='vn';normals.push(line.slice(3).split(' ').map(Number));
   }else if(line.startsWith('vt ')){
    phase='vt';uvs.push(line.slice(3).split(' ').map(Number));
   }else if(line.startsWith('usemtl ')){
    groups.push({material:line.slice(7).trim(),faces:[]});
   }else if(line.startsWith('f ')){
    const ids=line.slice(2).split(' ').map(v=>parseInt(v,10));
    assert.equal(ids.length,3,'wheelhouse source uses triangles');
    groups.at(-1).faces.push(ids);
   }
  }
  flush();
  for(const volume of volumes)emit(liner,closedBacking(volume));
  if(output){fs.writeFileSync(fd,output);digest.update(output);}
 }finally{fs.closeSync(fd);}
 assert.ok(cutFaces>0&&outputFaces>sourceFaces*.70,'wheelhouse cuts preserve the complete body');
 return {slots:[...slots],sha256:digest.digest('hex'),sourceFaces,sourceVertices,cutFaces,outputFaces};
}
