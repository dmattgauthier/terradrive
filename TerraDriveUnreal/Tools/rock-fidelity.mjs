// Closed, textured boulders derived from the project's existing CC0 scans.
// Original scans, acquired Epic assets and browser files remain untouched.
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
const hash=(i,s)=>{const n=Math.sin(i*127.1+s*311.7)*43758.5453;return n-Math.floor(n);};
export function buildBoulderLibrary(scans){
 const originals=scans.assets.filter(a=>/^scan_rock_moss_set_02_/.test(a.name));
 originals.push(scans.assets.find(a=>a.name==='scan_boulder_01_0'));
 const dry=[],snow=[];
 for(let k=0;k<24;k++){
  const snowy=k>=18,base=originals[(k%18)%8],group=base.group.clone(true);
  group.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(group),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  const scale=2/Math.max(size.x,size.z); // Two-metre footprint, before instance variation.
  const meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const result=new T.Group();
  for(const original of meshes){
   const geo=original.geometry.clone();geo.applyMatrix4(original.matrixWorld);
   const p=geo.attributes.position,normals=geo.attributes.normal;
   if(!normals||normals.count!==p.count)throw Error('Scan normal stream is incomplete');
   const normal=new T.Vector3(),jacobian=new T.Matrix3();
   for(let i=0;i<p.count;i++){
    let x=(p.getX(i)-center.x)*scale,y=(p.getY(i)-box.min.y)*scale,z=(p.getZ(i)-center.z)*scale;
    // Broad, small deformation retains scan relief and its photographic UVs.
    const wave=.045*Math.sin(x*1.9+k*.83)*Math.sin(z*2.2-y*.7+k);
    const a=x*1.9+k*.83,b=z*2.2-y*.7+k;
    const wx=.045*1.9*Math.cos(a)*Math.sin(b),wy=-.045*.7*Math.sin(a)*Math.cos(b),wz=.045*2.2*Math.sin(a)*Math.cos(b);
    const xx=1+wave+x*wx,xy=x*wy,xz=x*wz,zx=-.65*z*wx,zy=-.65*z*wy,zz=1-.65*wave-.65*z*wz;
    const px=x*(1+wave),pz=z*(1-wave*.65),phase=px+pz+k*.71,f=1+.035*Math.sin(phase),c=.035*y*Math.cos(phase);
    jacobian.set(xx,xy,xz,c*(xx+zx),f+c*(xy+zy),c*(xz+zz),zx,zy,zz);
    if(jacobian.determinant()<.15)throw Error('Rock deformation folds its surface');
    // Atlas seams duplicate vertices. Rebuilding normals from those split
    // faces destroys the measured scan shading. Transform the original
    // smooth normals through the actual deformation's inverse transpose.
    normal.fromBufferAttribute(normals,i);
    if(normal.lengthSq()<.25){normal.set(x,y-.5,z);if(normal.lengthSq()<.01)normal.set(0,1,0);}
    normal.applyMatrix3(jacobian.invert().transpose()).normalize();
    normals.setXYZ(i,normal.x,normal.y,normal.z);
    p.setXYZ(i,px,y*f,pz);
   }
   const mat=original.material.clone();mat.color.multiplyScalar(.91+hash(k,2)*.09);
   mat.userData={...original.material.userData,nativeRole:snowy?'snowrock':'scan'};
   if(snowy){
    const n=geo.attributes.normal;
    for(let i=0;i<p.count;i++){
     const cap=T.MathUtils.smoothstep(n.getY(i),.35,.85);
     p.setY(i,p.getY(i)+cap*(.025+.02*Math.sin(p.getX(i)*8+p.getZ(i)*5+k)**2));
    }
   }
   result.add(new T.Mesh(geo,mat));
  }
  const name='scan_native_'+(snowy?'snowrock_':'boulder_')+String(k%18).padStart(2,'0');
  const placement={asset:name,solid:true,surface:4,snapBoulder:true,instances:[]};
  scans.assets.push({name,group:result});scans.placements.push(placement);(snowy?snow:dry).push(placement);
 }
 return {dry,snow};
}
export function refineRockPlacements(terrain,scans,environment,fab){
 const library=buildBoulderLibrary(scans),seen=[];let serial=0,removedCliffs=0,replaced=0;
 const place=(old,diameter,snowy=false)=>{
  const options=snowy?library.snow:library.dry,id=serial++;
  const x=old.p[0],y=old.p[1];
  let index=Math.floor(hash(id,21)*options.length);
  // Avoid repeating a recognizable silhouette among neighbouring boulders.
  for(let n=0;n<options.length;n++){
   const candidate=(index+n)%options.length;
   if(!seen.some(p=>p.snowy===snowy&&p.index===candidate&&Math.hypot(p.x-x,p.y-y)<1600)){index=candidate;break;}
  }
  const s=diameter*.5,yaw=hash(id,22)*Math.PI*2;
  options[index].instances.push({p:[x,y,terrain.heightAt(-y/100,x/100)*100],q:[0,0,Math.sin(yaw/2),Math.cos(yaw/2)],
   s:[s*(.85+hash(id,23)*.3),s*(.86+hash(id,24)*.28),s*(.86+hash(id,25)*.28)],color:[.96+hash(id,26)*.04,.96+hash(id,27)*.04,.96+hash(id,28)*.04]});
  seen.push({x,y,index,snowy});replaced++;
 };
 for(const g of [...environment.placements,...scans.placements]){
  if(g.snapBoulder)continue;
  const legacy=/^native_boulder_/.test(g.asset),rock=/^scan_(?:rock_moss_set_02|boulder_01)_/.test(g.asset),cliff=g.asset==='scan_mountainside_0';
  if(!legacy&&!rock&&!cliff)continue;
  for(const p of g.instances){
   if(cliff){
    removedCliffs++;
    for(let j=0;j<4;j++)place({...p,p:[p.p[0]+(hash(serial+j,31)-.5)*650,p.p[1]+(hash(serial+j,32)-.5)*650,p.p[2]]},1.8+hash(serial,33)*2.4);
   }else place(p,legacy?Math.max(.55,Math.max(...p.s)*2.0):g.asset.includes('boulder_01')?Math.max(.35,Math.max(...p.s)*3.1):Math.max(.45,Math.max(...p.s)*1.55));
  }
  g.instances=[];
 }
 for(const g of fab.groups){
  const snowy=g.asset.includes('Ice');
  if(!(snowy||g.asset.startsWith('Winter_')||['outcrop','ledge'].includes(g.kind)))continue;
  for(const p of g.instances){
   removedCliffs++;
   for(let j=0;j<(snowy?3:2);j++)place({...p,p:[p.p[0]+(hash(serial+j,42)-.5)*500,p.p[1]+(hash(serial+j,43)-.5)*500,p.p[2]]},(snowy?2.4:1.5)+hash(serial,44)*(snowy?2.2:1.8),snowy);
  }
  g.instances=[];
 }
 // Snow boulders are actual rock scans with snow on upward-facing surfaces.
 for(let i=0;i<54;i++){
  const x=204+hash(i,51)*100,y=160+hash(i,52)*115;
  if(terrain.sample(-y,x).surface!=='snow'||Math.hypot(x-230,y-218)<22)continue;
  place({p:[x*100,y*100,0]},.9+hash(i,53)*2.5,true);
 }
 return {version:21,dryVariants:library.dry.length,snowVariants:library.snow.length,replacedBoulders:replaced,removedCliffPlacements:removedCliffs,
  placementSeed:21,originalScansPreserved:true,closedLodsRequired:true};
}
