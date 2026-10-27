// One-way conversion from the supplied, untouched browser source. Node is a
// development tool only; the packaged game contains native assets and C++.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {Terrain} from './native-terrain.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {nativeVehicle,vehicleFinishes} from './vehicle-realism.mjs';
import {bodyRefinement} from './body-refinement.mjs';
import {fabScenery} from './fab-scenery.mjs';
import {scannedEnvironment} from './scanned-environment.mjs';
import {quarryTrail} from './quarry-trail.mjs';
import {OffroadWorld} from '../../TerraDrive-v1.13/dist/src/world.js';
import {createTrackModule} from '../../TerraDrive-v1.13/dist/src/track-view.js';
import {SURFACE_RESPONSE_PROFILES} from '../../TerraDrive-v1.13/dist/src/surface-response.js';
import {createChallengeCourse,challengeLoopFrame} from './native-challenge-course.mjs';
import {createChallengeView} from '../../TerraDrive-v1.13/dist/src/challenge-view.js';
import {buildRockCourses,challengeCollisionMesh,inQuarry} from './offroad-courses.mjs';
import {vehicleAdditions,suspensionModels,environmentModels} from './native-models.mjs';
import {refineVehicle,brakeCaliperModel} from './vehicle-fidelity.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'SourceAssets'),data=path.join(root,'Content','NativeData');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(data,{recursive:true});
globalThis.document={createElement(){return {width:0,height:0,getContext:()=>({fillRect(){},fillText(){},putImageData(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})})}}};
const mats=[],matIds=new Map(),assets=[],tints=new Map();
function matId(m){if(matIds.has(m.uuid))return matIds.get(m.uuid);const id='M_'+String(mats.length).padStart(3,'0');matIds.set(m.uuid,id);mats.push({id,color:m.color?.toArray()||[1,1,1],roughness:m.roughness??.85,metallic:m.metalness??0,opacity:m.transparent?m.opacity:1,vertexColors:!!m.vertexColors,diffuse:m.map?.userData?.source||null,alpha:m.alphaMap?.userData?.source||null,alphaTest:m.alphaTest||0,clearcoat:m.clearcoat||0,coatRoughness:m.clearcoatRoughness??.15,emissive:m.emissive?.toArray().map(v=>v*(m.emissiveIntensity??1))||[0,0,0],role:m.userData.nativeRole||'',automotive:m.userData.automotive||'',automotiveOwner:m.userData.automotiveOwner||'',normal:m.normalMap?.userData?.source||null,roughMap:m.roughnessMap?.userData?.source||null});return id;}
function exportObj(name,group,excludeCanvas=false){
 group.updateMatrixWorld(true);let lines=['# Converted directly from Terra Drive 1.15 source. Metres baked to Unreal centimetres.'],offset=1,slots=[];
 group.traverse(obj=>{if(!obj.isMesh||!obj.visible)return;const n=obj.isInstancedMesh?obj.count:1;
 for(let instance=0;instance<n;instance++){
 const matrix=obj.matrixWorld.clone();if(obj.isInstancedMesh){const im=new THREE.Matrix4();obj.getMatrixAt(instance,im);matrix.multiply(im);}
 const geo=obj.geometry,pa=geo.attributes.position,na=geo.attributes.normal,uv=geo.attributes.uv,normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
 // UE 5.8's Interchange OBJ translator flips OBJ Y itself. Emit a
 // right-handed (Z,X,Y) basis so the imported mesh becomes (Z,-X,Y).
 const v=new THREE.Vector3();for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(matrix);lines.push(`v ${v.z*100} ${v.x*100} ${v.y*100}`);}
 for(let i=0;i<pa.count;i++){v.set(0,1,0);if(na)v.fromBufferAttribute(na,i);v.applyMatrix3(normalMatrix).normalize();lines.push(`vn ${v.z} ${v.x} ${v.y}`);}
 for(let i=0;i<pa.count;i++)lines.push(`vt ${uv?uv.getX(i):0} ${uv?uv.getY(i):0}`);
 const materials=Array.isArray(obj.material)?obj.material:[obj.material],idx=geo.index;
 const groups=Array.isArray(obj.material)&&geo.groups.length?geo.groups:[{start:0,count:idx?idx.count:pa.count,materialIndex:0}];
 for(const g of groups){const mat=materials[g.materialIndex]||materials[0];
 // Browser-generated canvas lettering has no pixels in this one-way exporter.
 // Exclude unavailable raster planes; native lettering is real geometry.
 if(excludeCanvas&&mat.map?.isCanvasTexture&&!mat.map?.userData?.source)continue;
 const mid=matId(mat);if(!slots.includes(mid))slots.push(mid);lines.push('usemtl '+mid);for(let k=g.start;k<g.start+g.count;k+=3){const ids=[0,1,2].map(t=>offset+(idx?idx.getX(k+t):k+t));lines.push('f '+ids.map(i=>`${i}/${i}/${i}`).join(' '));
 // OBJ has no vertex-color stream in this importer. Preserve the source's
 // mean tint per material instead of turning white-base foliage white.
 if(mat.vertexColors&&geo.attributes.color){const c=geo.attributes.color,s=tints.get(mid)||[0,0,0,0];for(const id of ids){const j=id-offset;s[0]+=c.getX(j);s[1]+=c.getY(j);s[2]+=c.getZ(j);s[3]++;}tints.set(mid,s);}
 }}
 offset+=pa.count;
 }});
 const obj=lines.join('\n');fs.writeFileSync(path.join(out,name+'.obj'),obj);assets.push({name,slots,sha256:crypto.createHash('sha256').update(obj).digest('hex')});return name;
}
// Compensate the component's radial scale at the bead. The outer tread still
// reaches the upgraded physical radius; only sidewall height grows, not the
// wheel's seating diameter. Transform normals with the radial Jacobian too.
function exportTireStages(prefix,spec){
 const base=assets.find(a=>a.name===prefix+'_tire'),lines=fs.readFileSync(path.join(out,base.name+'.obj'),'utf8').split('\n');
 const positions=lines.filter(l=>l.startsWith('v ')).map(l=>l.slice(2).split(' ').map(Number));
 const bead=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254*.5*.97*100,outer=spec.tireRadius*100;
 for(let stage=1;stage<=3;stage++){
  const scale=1+.04*stage,k=(outer*scale-bead)/(outer-bead);let vi=0,ni=0;
  const obj=lines.map(line=>{
   if(line.startsWith('v ')){
    const [x,y,z]=positions[vi++],r=Math.hypot(x,z),radial=(r<bead?r:bead+(r-bead)*k)/scale;
    return `v ${x*radial/r} ${y} ${z*radial/r}`;
   }
   if(line.startsWith('vn ')){
    const [x,,z]=positions[ni++],r=Math.hypot(x,z),erx=x/r,erz=z/r;
    const radial=(r<bead?r:bead+(r-bead)*k)/scale,a=(r<bead?1:k)/scale,b=radial/r;
    const n=line.slice(3).split(' ').map(Number),dot=n[0]*erx+n[2]*erz;
    const nx=(n[0]-dot*erx)/b+dot*erx/a,nz=(n[2]-dot*erz)/b+dot*erz/a,len=Math.hypot(nx,n[1],nz);
    return `vn ${nx/len} ${n[1]/len} ${nz/len}`;
   }return line;
  }).join('\n');
  const name=prefix+'_tire_'+stage;fs.writeFileSync(path.join(out,name+'.obj'),obj);
  assets.push({name,slots:[...base.slots],sha256:crypto.createHash('sha256').update(obj).digest('hex')});
 }
}
const terrain=new Terrain(),surfaces=['dirt','asphalt','mud','wetland','rock','sand','snow'];
const n=1601,step=.5,bytes=Buffer.alloc(16+n*n*9);bytes.writeUInt32LE(0x54445256,0);bytes.writeUInt32LE(n,4);bytes.writeFloatLE(step,8);bytes.writeFloatLE(-400,12);
if(!fs.existsSync(path.join(data,'terrain.bin'))){let offset=16;for(let row=0;row<n;row++){for(let col=0;col<n;col++){const z=-400+row*step,x=400-col*step,s=terrain.sample(x,z);bytes.writeFloatLE(s.height,offset);bytes.writeFloatLE(s.waterDepth,offset+4);bytes[offset+8]=surfaces.indexOf(s.surface);offset+=9;}if(row%400===0)console.log('Terrain row',row,'/',n);}fs.writeFileSync(path.join(data,'terrain.bin'),bytes);}
// Rewrite only the native trail's height band, including its feathered edges.
// Existing surfaces/water and all samples outside this band remain unchanged.
const field=fs.readFileSync(path.join(data,'terrain.bin'));
for(let row=940;row<=1400;row++)for(let col=50;col<=520;col++){
 const ux=-400+row*.5,uy=-400+col*.5;
 field.writeFloatLE(terrain.heightAt(-uy,ux),16+(row*n+col)*9);
}
fs.writeFileSync(path.join(data,'terrain.bin'),field);
const vehicles=[];for(const spec of VEHICLES){const view=nativeVehicle(spec);bodyRefinement(view,spec);vehicleFinishes(view,spec);const parts=refineVehicle(view,spec);const prefix=spec.id.replaceAll('-','_');exportObj(prefix+'_body',view.root,true);exportObj(prefix+'_wheel',view.wheels[0].root,true);exportObj(prefix+'_tire',parts.tire,true);exportTireStages(prefix,spec);exportObj(prefix+'_rim',parts.rim,true);const track=createTrackModule({...spec,tracks:{length:1.35,width:.48}},view.materials);track.track.update({rotation:0});exportObj(prefix+'_track',track.root);vehicles.push({...spec,asset:prefix,lamps:assets.find(a=>a.name===prefix+'_body').slots.filter(id=>['brake','reverse'].includes(mats.find(m=>m.id===id).role)).map(id=>({material:id,role:mats.find(m=>m.id===id).role})),nativeModel:{...view.root.userData.nativeFidelity,construction:view.root.userData.nativeConstruction,upgradeTireBeads:true,bodyShape:spec.bodyStyle==='urus'?{...view.root.userData.visualModel,refinement:view.root.userData.bodyRefinement}:view.root.userData.bodyRefinement}});view.dispose();console.log('Vehicle exported',spec.name);}
// Export the actual shared scenery geometry and original placements.
const world=Object.create(OffroadWorld.prototype);Object.assign(world,{terrain,scene:new THREE.Scene(),groundMeshes:new Map(),spec:VEHICLES[0],clock:0,_textureLoader:{load(url){return new THREE.Texture();}}});
terrain.obstacles=[];world._createVegetation();world._createLandmarks();world.scene.updateMatrixWorld(true);
const placements=[],meshMap=new Map();let counter=0;
world.scene.traverse(obj=>{if(!obj.isMesh||!obj.visible)return;if(obj.name==='broken-tree-stumps')return;
 const key=obj.geometry.uuid+':'+(Array.isArray(obj.material)?obj.material.map(m=>m.uuid).join(','):obj.material.uuid);let asset=meshMap.get(key);
 if(!asset){asset='scenery_'+String(counter++).padStart(3,'0');meshMap.set(key,asset);const mesh=new THREE.Mesh(obj.geometry,obj.material);exportObj(asset,mesh);}
 const count=obj.isInstancedMesh?obj.count:1,instances=[];for(let i=0;i<count;i++){const m=obj.matrixWorld.clone();if(obj.isInstancedMesh){const im=new THREE.Matrix4();obj.getMatrixAt(i,im);m.multiply(im);}const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();m.decompose(p,q,s);if(Math.max(s.x,s.y,s.z)<.0001)continue;
 // Conjugation by (old Z,-old X,old Y), including the handedness reversal.
 const color=new THREE.Color(1,1,1);if(obj.isInstancedMesh&&obj.instanceColor)obj.getColorAt(i,color);
 instances.push({index:i,p:[p.z*100,-p.x*100,p.y*100],q:[-q.z,q.x,-q.y,q.w],s:[s.z,s.x,s.y],color:color.toArray()});}
 const id=placements.length;obj.userData.nativeGroup=id;placements.push({asset,crushable:/grass|sedges|tussock|cattail/.test(obj.name),instances:instances.filter(i=>!inQuarry(i.p[0]/100,i.p[1]/100))});
});
const trees=(world.treeRecords||[]).filter(t=>!inQuarry(t.z,-t.x)).map(t=>({id:t.id,p:[t.z*100,-t.x*100,terrain.heightAt(t.x,t.z)*100],radius:t.obstacle.radius*100,height:t.height*100,parts:Object.values(t.meshes).filter(m=>m?.isMesh).map(m=>({group:m.userData.nativeGroup,index:t.meshes.index}))}));
const course=createChallengeCourse(),view=createChallengeView(course),quarry=buildRockCourses(terrain);
const constructed=[
 {asset:exportObj('summit_park',view.group),collision:exportObj('summit_park_collision',challengeCollisionMesh(course)),surface:1},
 {asset:exportObj('granite_trials',quarry.group),surface:4}
];
const routes=[
 {name:'Summit full loop',hint:'Long run-up: build speed and hold a smooth line. Grip requires real tire contact even upside down.',zone:6,yaw:0,spawn:[-16900,23600,472],gateWidth:8.8,gateDirections:[1,1,-1,1],gates:[[-14000,23600,472],[0,23600,472],[5800,22900,4472],[14300,22200,472]]},
 {name:'Tabletop jump',hint:'Progressive take-off and landing. Lift before the lip to control pitch.',zone:6,yaw:0,spawn:[-14400,18300,460],gateWidth:9,gates:[[-12500,18300,483],[-10000,18300,715],[-6800,18300,460]]},
 {name:'Gap jump',hint:'33-foot gap with no hidden support. Approach square and land with the wheels aligned.',zone:6,yaw:0,spawn:[-6000,18300,460],gateWidth:9,gates:[[-2000,18300,481],[-100,18300,781],[3300,18300,481]]},
 {name:'Balance and articulation',hint:'Narrow ramp, then seven alternating bumps. Try open axles against locked axles.',zone:6,yaw:0,spawn:[-13500,15700,460],gateWidth:3.5,gates:[[-10000,15700,615],[-5400,15700,460],[4500,15700,460]]},
 ...quarry.routes
];
for(const spec of VEHICLES){const prefix=spec.id.replaceAll('-','_'),parts=vehicleAdditions(spec);exportObj(prefix+'_armor',parts.armor);exportObj(prefix+'_equipment',parts.equipment);}
const suspension=suspensionModels();exportObj('detail_coil',suspension.coil);exportObj('detail_airstrut',suspension.air);
exportObj('detail_brake_caliper',brakeCaliperModel());
const environment=environmentModels(terrain,routes,terrain.zones),scans=scannedEnvironment(root,terrain,routes),trail=quarryTrail(terrain,scans,quarry.base);routes.push(trail.route);environment.assets.push(...scans.assets);environment.placements.push(...scans.placements);for(const a of environment.assets)exportObj(a.name,a.group);
const trailDistance=p=>Math.min(...trail.samples.map(s=>Math.hypot(s.x*100-p[0],s.y*100-p[1])));
for(let i=trees.length-1;i>=0;--i)if(trailDistance(trees[i].p)<340+trees[i].radius){
 for(const part of trees[i].parts)placements[part.group].instances=placements[part.group].instances.filter(p=>p.index!==part.index);
 trees.splice(i,1);
}
for(const group of placements)if(group.crushable)group.instances=group.instances.filter(p=>trailDistance(p.p)>300);
for(const group of environment.placements)if(!/^scan_(?:mountainside|boulder_01|grass_medium_01)_/.test(group.asset))group.instances=group.instances.filter(p=>trailDistance(p.p)>(group.solid?500:300));
const tinted=new Set();
for(const g of [...placements,...environment.placements])if(g.instances.some(i=>i.color.some(c=>Math.abs(c-1)>.00001)))
 for(const slot of assets.find(a=>a.name===g.asset).slots)tinted.add(slot);
for(const m of mats){const t=tints.get(m.id);if(t?.[3])m.vertexTint=t.slice(0,3).map(v=>v/t[3]);m.instanceTint=tinted.has(m.id);}
const manifest={version:'1.15.0',nativeRevision:'body-circle-fab-2',displayUnits:'imperial',meshSchema:2,coordinates:'Unreal cm: X=source Z, Y=-source X, Z=source Y; terrain rows are Unreal X',assets,materials:mats,vehicles,surfaces,profiles:SURFACE_RESPONSE_PROFILES,zones:[...terrain.zones,quarry.zone],placements,nativeDetails:environment.placements,trees,obstacles:terrain.obstacles,constructed,routes,challengeFeatures:course.features.map(f=>({id:f.id,triangles:f.triangles.length})),quarryBaseM:quarry.base,fabScenery:fabScenery(root,terrain,routes,quarry.base),loopFrames:Array.from({length:25},(_,i)=>{const f=challengeLoopFrame(i*Math.PI*2/24),p=f.point,n=f.normal,t=f.tangent;return {p:[p.z*100,-p.x*100,p.y*100],n:[n.z,-n.x,n.y],t:[t.z,-t.x,t.y]};})};
manifest.nativeRevision='rollover-coachwork-12';
manifest.terrainGrade=terrain.gradeVersion;
manifest.quarryTrail={samples:trail.samples,lengthM:trail.lengthM,widthM:trail.widthM,assetCounts:trail.assetCounts,routeIndex:8};
fs.writeFileSync(path.join(out,'import.json'),JSON.stringify(manifest));
fs.writeFileSync(path.join(data,'world.json'),JSON.stringify({...manifest,assets:undefined,materials:undefined}));
fs.copyFileSync(path.join(root,'..','TerraDrive-v1.13','dist','assets','terrain','manifest.json'),path.join(data,'texture-credits.json'));
console.log('Export complete:',assets.length,'meshes,',placements.length,'instance groups,',trees.length,'trees');

