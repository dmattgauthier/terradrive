// Minimal deterministic glTF 2 reader for the vendored static CC0 scans.
// No network requests or image decoder is needed by the source exporter.
import fs from 'node:fs';
import path from 'node:path';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {makePerimeterTrail} from './perimeter-trail.mjs';
import {inQuarry} from './offroad-courses.mjs';
export function scannedEnvironment(root,terrain,routes){
 const assets=[],placements=[];
 for(const id of ['rock_moss_set_02','shrub_sorrel_01','mountainside','boulder_01','grass_medium_01']){
  const folder=path.join(root,'Vendor/Environment',id),d=JSON.parse(fs.readFileSync(path.join(folder,id+'_1k.gltf')));
  const buffers=d.buffers.map(b=>fs.readFileSync(path.join(folder,b.uri)));
  const ct={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array};
  function accessor(i){const a=d.accessors[i],b=d.bufferViews[a.bufferView],arity={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],Type=ct[a.componentType];if(b.byteStride)throw Error('Interleaved scan unsupported');const raw=buffers[b.buffer].subarray((b.byteOffset||0)+(a.byteOffset||0),(b.byteOffset||0)+(a.byteOffset||0)+a.count*arity*Type.BYTES_PER_ELEMENT);return {array:new Type(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),arity};}
  function texture(index){if(index===undefined)return null;const uri=d.images[d.textures[index].source].uri,t=new T.Texture();t.userData.source='native/'+id+'/'+uri;return t;}
  const materials=d.materials.map(s=>{const p=s.pbrMetallicRoughness||{},m=new T.MeshStandardMaterial({color:new T.Color(...(p.baseColorFactor||[1,1,1]).slice(0,3)),roughness:p.roughnessFactor??1,metalness:p.metallicFactor??0,map:texture(p.baseColorTexture?.index),alphaTest:s.alphaMode==='MASK'?s.alphaCutoff||.5:0,side:T.DoubleSide});m.normalMap=texture(s.normalTexture?.index);m.roughnessMap=texture(p.metallicRoughnessTexture?.index);if(id==='grass_medium_01'){m.alphaMap=new T.Texture();m.alphaMap.userData.source='native/grass_medium_01/textures/grass_medium_01_alpha_1k.png';m.alphaTest=.5;}m.userData.nativeRole='scan';return m;});
  // glTF UVs start at the upper left. Precompensate scan V for OBJ import's
  // lower-left convention; UE reverses it again, preserving the original atlas.
  const nodes=d.nodes.map(n=>{const g=new T.Group();g.name=n.name||'';if(n.matrix)g.applyMatrix4(new T.Matrix4().fromArray(n.matrix));else{if(n.translation)g.position.fromArray(n.translation);if(n.rotation)g.quaternion.fromArray(n.rotation);if(n.scale)g.scale.fromArray(n.scale);}if(n.mesh!==undefined)for(const p of d.meshes[n.mesh].primitives){const geo=new T.BufferGeometry();for(const [key,attr]of Object.entries(p.attributes)){const name={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv'}[key];if(name){const a=accessor(attr);if(name==='uv')for(let j=1;j<a.array.length;j+=a.arity)a.array[j]=1-a.array[j];geo.setAttribute(name,new T.BufferAttribute(a.array,a.arity));}}if(p.indices!==undefined)geo.setIndex(new T.BufferAttribute(accessor(p.indices).array,1));if(!geo.attributes.normal)geo.computeVertexNormals();g.add(new T.Mesh(geo,materials[p.material]));}return g;});
  d.nodes.forEach((n,i)=>n.children?.forEach(j=>nodes[i].add(nodes[j])));
  for(const i of d.scenes[d.scene||0].nodes){const group=nodes[i],name='scan_'+id+'_'+i;group.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(group);group.position.y-=bounds.min.y;group.position.x-=(bounds.min.x+bounds.max.x)*.5;group.position.z-=(bounds.min.z+bounds.max.z)*.5;assets.push({name,group});placements.push({asset:name,solid:id.startsWith('rock')||id==='mountainside'||id==='boulder_01',surface:4,instances:[]});}
 }
 const hash=(i,s)=>{const v=Math.sin(i*127.1+s*311.7)*43758.5453;return v-Math.floor(v);};
 const rocks=placements.filter(p=>p.asset.startsWith('scan_rock_moss_set_02'));
 const sorrel=placements.filter(p=>p.asset.startsWith('scan_shrub_sorrel_01'));
 const up=new T.Vector3(0,0,1);
 const edges=routes.flatMap(route=>{
  const points=[route.spawn,...route.gates].map(([x,y])=>[x/100,y/100]);
  return points.slice(1).map(([x,y],i)=>{
   const [ax,ay]=points[i],dx=x-ax,dy=y-ay;
   return {ax,ay,dx,dy,l2:dx*dx+dy*dy||1};
  });
 });
 const perimeter=makePerimeterTrail((x,y)=>terrain.heightAt(-y,x));
 function clear(x,y,radius){
  if(inQuarry(x,y)||(x>-180&&x<170&&y>145&&y<245))return false;
  if(terrain.zones.some(zone=>Math.hypot(x-zone.spawn.z,y+zone.spawn.x)<16))return false;
  return !edges.some(({ax,ay,dx,dy,l2})=>{
   const t=T.MathUtils.clamp(((x-ax)*dx+(y-ay)*dy)/l2,0,1);
   return Math.hypot(x-ax-t*dx,y-ay-t*dy)<radius;
  });
 }
 function plantPatch(x,y,seed,amount){
  const heading=hash(seed,29)*Math.PI*2;
  for(let j=0;j<amount;j++){
   const id=seed*11+j,theta=hash(id,7)*Math.PI*2;
   const along=Math.cos(theta)*hash(id,8)*1.35,across=Math.sin(theta)*hash(id,9)*.65;
   const px=x+along*Math.cos(heading)-across*Math.sin(heading);
   const py=y+along*Math.sin(heading)+across*Math.cos(heading);
   const ground=terrain.sample(-py,px);
   if(!['dirt','wetland','mud'].includes(ground.surface)||ground.waterDepth>.015||ground.normal.y<.70)continue;
   if(!clear(px,py,4.5)||(perimeter.locate(px,py)?.distance??Infinity)<4.15)continue;
   const moist=ground.surface==='wetland'||ground.surface==='mud';
   const height=(moist?3.4:2.4)+hash(id,15)*1.3;
   const yaw=hash(id,16)*Math.PI*2;
   // Leaves grow mostly upright with a mild slope bias at their rooted end.
   const normal=new T.Vector3(ground.normal.z*.4,-ground.normal.x*.4,ground.normal.y).normalize();
   const q=new T.Quaternion().setFromUnitVectors(up,normal).multiply(new T.Quaternion().setFromAxisAngle(up,yaw));
   const s=[height*(.78+.32*hash(id,17)),height*(.80+.25*hash(id,18)),height];
   const variation=hash(seed,19)*.12+hash(id,20)*.07;
   const color=moist?[.74+variation,.88+variation*.56,.70+variation]:[.91+variation*.45,.86+variation*.45,.64+variation];
   const plant=sorrel[Math.floor(hash(id,4)*sorrel.length)];
   plant.instances.push({p:[px*100,py*100,ground.height*100-1],q:q.toArray(),s,color});
  }
 }
 for(let i=0;i<3600;i++){
  const x=(hash(i,1)*2-1)*365,z=(hash(i,2)*2-1)*365,s=terrain.sample(x,z);
  if(!['dirt','wetland','rock','mud'].includes(s.surface)||s.waterDepth>.1)continue;
  if(s.surface==='rock'||hash(i,3)>.86){
   // Preserve each pre-existing solid instance and the seed order used by the boulder library.
   if(!clear(z,-x,16))continue;
   const scale=.45+hash(i,5)*1.8,a=hash(i,6)*Math.PI*2;
   rocks[Math.floor(hash(i,4)*rocks.length)].instances.push({p:[z*100,-x*100,terrain.heightAt(x,z)*100-1],
    q:[0,0,Math.sin(a*.5),Math.cos(a*.5)],s:[scale,scale,scale],color:[1,1,1]});
  }else if(hash(Math.floor(x/18)+Math.floor(z/18)*79,11)>.45){
   plantPatch(z,-x,i,2+Math.floor(hash(i,24)*3));
  }
 }
 // Move some of the old five-clone clump budget into the driver's foreground.
 // Separate patches and change sides; don't plant parallel rows along the road.
 for(let i=0;i<perimeter.samples.length-1;i+=4){
  if(hash(Math.floor(i/17),33)<.38)continue;
  const p=perimeter.samples[i],side=hash(i,34)<.5?-1:1;
  const offset=4.8+hash(i,35)*4.2;
  plantPatch(p.x-p.ty*side*offset,p.y+p.tx*side*offset,3600+i,3+Math.floor(hash(i,36)*3));
 }
 return {assets,placements};
}
