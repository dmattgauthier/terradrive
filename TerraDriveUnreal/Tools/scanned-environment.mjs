// Minimal deterministic glTF 2 reader for the vendored static CC0 scans.
// No network requests or image decoder is needed by the source exporter.
import fs from 'node:fs';
import path from 'node:path';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
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
 for(let i=0;i<3600;i++){
  const x=(hash(i,1)*2-1)*365,z=(hash(i,2)*2-1)*365,s=terrain.sample(x,z);
  if(!['dirt','wetland','rock','mud'].includes(s.surface)||s.waterDepth>.1||inQuarry(z,-x))continue;
  if(z> -180&&z<170&&-x>145&&-x<245)continue; // Entire constructed park stays clear.
  if(terrain.zones.some(q=>Math.hypot(x-q.spawn.x,z-q.spawn.z)<16))continue;
  const nearSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
  if(routes.some(r=>{const ps=[r.spawn,...r.gates].map(p=>[p[0]/100,p[1]/100]);return ps.some((p,i)=>i&&nearSegment([z,-x],ps[i-1],p)<16);} ))continue;
  const forest=hash(Math.floor(x/18)+Math.floor(z/18)*79,11),rock=s.surface==='rock'||hash(i,3)>.86;
  if(!rock&&forest<.45)continue;
  const options=placements.filter(p=>rock?p.asset.startsWith('scan_rock_moss_set_02'):p.asset.startsWith('scan_shrub_sorrel_01')),p=options[Math.floor(hash(i,4)*options.length)];
  const count=rock?1:5;
  for(let j=0;j<count;j++){
   const scale=rock?.45+hash(i,5)*1.8:2.4+hash(i+j*19,5)*2.2,a=hash(i+j*7,6)*Math.PI*2;
   const dx=rock?0:Math.cos(a)*hash(i+j,10)*.45,dz=rock?0:Math.sin(a)*hash(i+j,12)*.45;
   p.instances.push({p:[(z+dz)*100,(-x-dx)*100,terrain.heightAt(x+dx,z+dz)*100-1],q:[0,0,Math.sin(a*.5),Math.cos(a*.5)],s:[scale,scale,scale],color:[1,1,1]});
  }
 }
 return {assets,placements};
}
