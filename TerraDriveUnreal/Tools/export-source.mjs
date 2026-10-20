// One-way conversion from the supplied, untouched browser source. Node is a
// development tool only; the packaged game contains native assets and C++.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {Terrain} from '../../TerraDrive-v1.13/dist/src/terrain.js';
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {VEHICLES} from '../../TerraDrive-v1.13/dist/src/vehicles.js';
import {OffroadWorld} from '../../TerraDrive-v1.13/dist/src/world.js';
import {createTrackModule} from '../../TerraDrive-v1.13/dist/src/track-view.js';
import {SURFACE_RESPONSE_PROFILES} from '../../TerraDrive-v1.13/dist/src/surface-response.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'SourceAssets'),data=path.join(root,'Content','NativeData');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(data,{recursive:true});
globalThis.document={createElement(){return {width:0,height:0,getContext:()=>({fillRect(){},fillText(){},putImageData(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})})}}};
const mats=[],matIds=new Map(),assets=[];
function matId(m){if(matIds.has(m.uuid))return matIds.get(m.uuid);const id='M_'+String(mats.length).padStart(3,'0');matIds.set(m.uuid,id);mats.push({id,color:m.color?.toArray()||[1,1,1],roughness:m.roughness??.85,metallic:m.metalness??0,opacity:m.transparent?m.opacity:1,vertexColors:!!m.vertexColors});return id;}
function exportObj(name,group){
 group.updateMatrixWorld(true);let lines=['# Converted directly from Terra Drive 1.15 source. Metres baked to Unreal centimetres.'],offset=1,slots=[];
 group.traverse(obj=>{if(!obj.isMesh||!obj.visible)return;const n=obj.isInstancedMesh?obj.count:1;
 for(let instance=0;instance<n;instance++){
 const matrix=obj.matrixWorld.clone();if(obj.isInstancedMesh){const im=new THREE.Matrix4();obj.getMatrixAt(instance,im);matrix.multiply(im);}
 const geo=obj.geometry,pa=geo.attributes.position,na=geo.attributes.normal,uv=geo.attributes.uv,normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
 const v=new THREE.Vector3();for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(matrix);lines.push(`v ${v.z*100} ${-v.x*100} ${v.y*100}`);}
 for(let i=0;i<pa.count;i++){v.set(0,1,0);if(na)v.fromBufferAttribute(na,i);v.applyMatrix3(normalMatrix).normalize();lines.push(`vn ${v.z} ${-v.x} ${v.y}`);}
 for(let i=0;i<pa.count;i++)lines.push(`vt ${uv?uv.getX(i):0} ${uv?uv.getY(i):0}`);
 const materials=Array.isArray(obj.material)?obj.material:[obj.material],idx=geo.index;
 const groups=Array.isArray(obj.material)&&geo.groups.length?geo.groups:[{start:0,count:idx?idx.count:pa.count,materialIndex:0}];
 for(const g of groups){const mid=matId(materials[g.materialIndex]||materials[0]);if(!slots.includes(mid))slots.push(mid);lines.push('usemtl '+mid);for(let k=g.start;k<g.start+g.count;k+=3){const ids=[0,2,1].map(t=>offset+(idx?idx.getX(k+t):k+t));lines.push('f '+ids.map(i=>`${i}/${i}/${i}`).join(' '));}}
 offset+=pa.count;
 }});
 fs.writeFileSync(path.join(out,name+'.obj'),lines.join('\n'));assets.push({name,slots});return name;
}
const terrain=new Terrain(),surfaces=['dirt','asphalt','mud','wetland','rock','sand','snow'];
const n=1601,step=.5,bytes=Buffer.alloc(16+n*n*9);bytes.writeUInt32LE(0x54445256,0);bytes.writeUInt32LE(n,4);bytes.writeFloatLE(step,8);bytes.writeFloatLE(-400,12);
if(!fs.existsSync(path.join(data,'terrain.bin'))){let offset=16;for(let row=0;row<n;row++){for(let col=0;col<n;col++){const z=-400+row*step,x=400-col*step,s=terrain.sample(x,z);bytes.writeFloatLE(s.height,offset);bytes.writeFloatLE(s.waterDepth,offset+4);bytes[offset+8]=surfaces.indexOf(s.surface);offset+=9;}if(row%400===0)console.log('Terrain row',row,'/',n);}fs.writeFileSync(path.join(data,'terrain.bin'),bytes);}
const vehicles=[];for(const spec of VEHICLES){const view=new VehicleView(new THREE.Scene(),spec);const prefix=spec.id.replaceAll('-','_');exportObj(prefix+'_body',view.root);exportObj(prefix+'_wheel',view.wheels[0].root);const track=createTrackModule({...spec,tracks:{length:1.35,width:.48}},view.materials);track.track.update({rotation:0});exportObj(prefix+'_track',track.root);vehicles.push({...spec,asset:prefix});view.dispose();console.log('Vehicle exported',spec.name);}
// Export the actual shared scenery geometry and original placements.
const world=Object.create(OffroadWorld.prototype);Object.assign(world,{terrain,scene:new THREE.Scene(),groundMeshes:new Map(),spec:VEHICLES[0],clock:0,_textureLoader:{load(url){return new THREE.Texture();}}});
terrain.obstacles=[];world._createVegetation();world._createLandmarks();world.scene.updateMatrixWorld(true);
const placements=[],meshMap=new Map();let counter=0;
world.scene.traverse(obj=>{if(!obj.isMesh||!obj.visible)return;if(obj.name==='broken-tree-stumps')return;
 const key=obj.geometry.uuid+':'+(Array.isArray(obj.material)?obj.material.map(m=>m.uuid).join(','):obj.material.uuid);let asset=meshMap.get(key);
 if(!asset){asset='scenery_'+String(counter++).padStart(3,'0');meshMap.set(key,asset);const mesh=new THREE.Mesh(obj.geometry,obj.material);exportObj(asset,mesh);}
 const count=obj.isInstancedMesh?obj.count:1,instances=[];for(let i=0;i<count;i++){const m=obj.matrixWorld.clone();if(obj.isInstancedMesh){const im=new THREE.Matrix4();obj.getMatrixAt(i,im);m.multiply(im);}const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();m.decompose(p,q,s);if(Math.max(s.x,s.y,s.z)<.0001)continue;
 // Conjugation by (old Z,-old X,old Y), including the handedness reversal.
 instances.push({index:i,p:[p.z*100,-p.x*100,p.y*100],q:[-q.z,q.x,-q.y,q.w],s:[s.z,s.x,s.y]});}
 const id=placements.length;obj.userData.nativeGroup=id;placements.push({asset,instances});
});
const trees=(world.treeRecords||[]).map(t=>({id:t.id,p:[t.z*100,-t.x*100,terrain.heightAt(t.x,t.z)*100],radius:t.obstacle.radius*100,height:t.height*100,parts:Object.values(t.meshes).filter(m=>m?.isMesh).map(m=>({group:m.userData.nativeGroup,index:t.meshes.index}))}));
const manifest={version:'1.15.0',coordinates:'Unreal cm: X=source Z, Y=-source X, Z=source Y',assets,materials:mats,vehicles,surfaces,profiles:SURFACE_RESPONSE_PROFILES,zones:terrain.zones,placements,trees,obstacles:terrain.obstacles};
fs.writeFileSync(path.join(out,'import.json'),JSON.stringify(manifest));
fs.writeFileSync(path.join(data,'world.json'),JSON.stringify({...manifest,assets:undefined,materials:undefined}));
fs.copyFileSync(path.join(root,'..','TerraDrive-v1.13','dist','assets','terrain','manifest.json'),path.join(data,'texture-credits.json'));
console.log('Export complete:',assets.length,'meshes,',placements.length,'instance groups,',trees.length,'trees');
