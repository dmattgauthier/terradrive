// Native additions only. Every mesh is generated from inspectable geometry.
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {inQuarry} from './offroad-courses.mjs';
const hash=(i,s=0)=>{const v=Math.sin(i*127.1+s*311.7)*43758.5453;return v-Math.floor(v);};
const steel=new THREE.MeshStandardMaterial({color:'#343d40',metalness:.72,roughness:.48});
const rubber=new THREE.MeshStandardMaterial({color:'#22282a',roughness:.91});
const chrome=new THREE.MeshStandardMaterial({color:'#a4b4b9',metalness:.88,roughness:.25});
const amber=new THREE.MeshStandardMaterial({color:'#edb45f',roughness:.30});
function add(g,geo,mat,p=[0,0,0]){const m=new THREE.Mesh(geo,mat);m.position.set(...p);g.add(m);return m;}
function box(g,mat,p,s){return add(g,new THREE.BoxGeometry(...s),mat,p);}
function rod(g,mat,a,b,r=.025,segments=12){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b);const m=add(g,new THREE.CylinderGeometry(r,r,va.distanceTo(vb),segments),mat);m.position.copy(va).add(vb).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return m;}

export function vehicleAdditions(spec){
  const armor=new THREE.Group(),equipment=new THREE.Group(),half=spec.width*.50;
  const datum=spec.cgHeight,offset=(.5-spec.frontWeightFraction)*spec.wheelbase;
  const front=(spec.bodyStyle==='van'?3.03:spec.bodyStyle==='hummer'?spec.length*.47:2.43)+offset;
  const low=(spec.bodyStyle==='sedan'?.20:.33)-datum;
  // Folded belly plate, fasteners, tubular rock sliders and three outriggers.
  box(armor,steel,[0,low,-.15+offset],[half*1.48,.045,spec.wheelbase*.72]);
  for(const side of [-1,1]){
    const x=side*(half+.035),a=-spec.wheelbase*.34+offset,b=spec.wheelbase*.33+offset;
    rod(armor,steel,[x,low+.12,a],[x,low+.12,b],spec.bodyStyle==='sedan'?.028:.043);
    for(const z of [a+.15,(a+b)/2,b-.15])rod(armor,steel,[side*half*.62,low,z],[x,low+.12,z],.024);
    for(const z of [a,b])add(armor,new THREE.CylinderGeometry(.018,.018,.014,6),chrome,[side*half*.55,low-.03,z]);
  }
  const bash=box(armor,chrome,[0,low+.17,front-.29],[half*1.22,.045,.38]);bash.rotation.x=-.35;
  if(spec.bodyStyle!=='sedan'&&spec.bodyStyle!=='urus'){
    // A real fairlead, drum, end plates and recovery shackles replace a blank bumper.
    const y=.66-datum,z=front+.06;
    box(equipment,steel,[0,y-.06,z-.12],[.62,.055,.30]);
    rod(equipment,rubber,[-.20,y+.02,z-.12],[.20,y+.02,z-.12],.105,24);
    for(const side of [-1,1]){
      box(equipment,steel,[side*.23,y+.02,z-.12],[.035,.24,.24]);
      const shackle=add(equipment,new THREE.TorusGeometry(.060,.012,8,20),amber,[side*.43,y-.04,z+.01]);
      shackle.rotation.x=.10;
    }
    box(equipment,chrome,[0,y-.02,z+.055],[.32,.078,.028]);
    box(equipment,rubber,[0,y-.02,z+.072],[.25,.035,.013]);
    // Use the actual model roof, including the body-to-CG offset. Catalogue
    // height and a shared forward position put the SUV bar ahead of its roof.
    const roof={jeep:[1.86,.16],bronco:[1.873,.24],van:[2.407,1.10],hummer:[1.948,.42]}[spec.bodyStyle];
    const roofY=roof[0]-datum,lightY=roofY+.09,lightZ=roof[1]+offset;
    for(const side of [-1,1]){
      const x=side*half*.55;
      box(equipment,steel,[x,roofY+.006,lightZ],[.105,.035,.14]);
      box(equipment,steel,[x,roofY+.047,lightZ],[.035,.105,.075]);
      box(equipment,chrome,[x,roofY+.025,lightZ+.045],[.018,.012,.018]);
    }
    box(equipment,steel,[0,lightY,lightZ],[half*1.3,.095,.11]);
    for(let i=0;i<12;i++)box(equipment,amber,[(i-5.5)*half*.10,lightY,lightZ+.058],[half*.075,.065,.018]);
  }else{
    // Sport sedan keeps road hardware: a shaped lower splitter and rear diffuser.
    if(spec.bodyStyle==='sedan'){
      // Civic's lower bumper is at Y=.277 and nose Z=2.29. The old
      // generic bar was below and ahead of it, visibly detached in the garage.
      box(equipment,rubber,[0,.285-datum,2.272+offset],[half*1.86,.020,.070]);
    }else for(let i=0;i<24;i++){
      const x0=(i/24*2-1)*.93,x1=((i+1)/24*2-1)*.93;
      const p=x=>[x,.282-datum,2.5685-.18*(Math.abs(x)/.99)**2+offset];
      rod(equipment,rubber,p(x0),p(x1),.008,8);
    }
    for(let i=-2;i<=2;i++)box(equipment,steel,[i*.19,.18-datum,-spec.length*.47],[.025,.10,.28]);
  }
  return {armor,equipment};
}

export function suspensionModels(){
  class Helix extends THREE.Curve {getPoint(t,target=new THREE.Vector3()){const a=t*Math.PI*16;return target.set(Math.cos(a)*.067,t-.5,Math.sin(a)*.067);}}
  const coil=new THREE.Group();add(coil,new THREE.TubeGeometry(new Helix(),160,.0085,8,false),steel);
  const air=new THREE.Group();
  const profile=[[.031,-.50],[.043,-.46],[.060,-.43]];
  for(let i=0;i<6;i++){const y=-.42+i*.09;profile.push([.071,y],[.077,y+.025],[.066,y+.058],[.064,y+.083]);}
  profile.push([.052,.15],[.033,.19],[.033,.22]);
  add(air,new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),32),rubber);
  rod(air,chrome,[0,.16,0],[0,.48,0],.018);
  for(const y of [-.48,.48])add(air,new THREE.CylinderGeometry(.038,.038,.04,24),steel,[0,y,0]);
  return {coil,air};
}

export function environmentModels(terrain,routes,zones){
  const assets=[],placements=[];
  const rock=new THREE.MeshStandardMaterial({color:'#777b70',roughness:.96});
  const bark=new THREE.MeshStandardMaterial({color:'#514b3d',roughness:.98});
  const wood=new THREE.MeshStandardMaterial({color:'#a49168',roughness:.95});
  const leaves=['#4c6641','#697c48','#7f8752'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.92,side:THREE.DoubleSide}));
  function asset(name,group,solid=false,surface=0){assets.push({name,group,solid,surface});placements.push({asset:name,solid,surface,instances:[]});return placements.at(-1);}
  for(let k=0;k<4;k++){
    const g=new THREE.Group(),geo=new THREE.IcosahedronGeometry(1,2),p=geo.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const r=1+.13*Math.sin(x*8+k)*Math.cos(y*7-z*3)+.08*Math.sin(z*11+x*3);
      p.setXYZ(i,x*r*(.80+k*.13),Math.max(-.20,y*r*.68)+.21,z*r*(.75+k*.07));
    }geo.computeVertexNormals();add(g,geo,rock);asset('native_boulder_'+k,g,true,4);
  }
  const log=new THREE.Group();rod(log,bark,[0,.27,-1.8],[0,.27,1.8],.27,18);
  for(let i=0;i<14;i++){
    const a=i*Math.PI*2/14,x=Math.cos(a)*.255,y=.27+Math.sin(a)*.255;
    rod(log,i%3?bark:wood,[x,y,-1.79],[x,y,1.79],.015,5);
  }
  for(const side of [-1,1]){
    rod(log,wood,[0,.27,side*1.79],[0,.27,side*1.81],.244,24);
    for(const r of [.06,.12,.18,.225])add(log,new THREE.TorusGeometry(r,.004,4,32),bark,[0,.27,side*1.815]);
  }
  rod(log,bark,[0,.38,-.35],[.58,.70,-.16],.075,9);asset('native_deadwood',log,true,4);
  const shrub=new THREE.Group();
  const leafGeometry=new THREE.BufferGeometry();
  leafGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0, -.030,.008,.040, .030,.008,.040,
    -.025,.015,.100, .025,.015,.100, 0,.008,.165],3));
  leafGeometry.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]);leafGeometry.computeVertexNormals();
  for(let i=0;i<18;i++){
    const a=i*2.399,h=.25+hash(i,5)*.75,r=.15+hash(i,9)*.55;
    const end=[Math.cos(a)*r,h,Math.sin(a)*r];rod(shrub,bark,[0,.01,0],end,.009,5);
    for(let j=0;j<4;j++){
      const t=.60+j*.12;
      const leaf=add(shrub,leafGeometry,leaves[(i+j)%3],end.map(v=>v*t));
      leaf.rotation.set((hash(i,j+10)-.5)*.35,Math.PI/2-a+(j%2?-.65:.65),0);
    }
  }asset('native_shrub',shrub);
  const reeds=new THREE.Group();
  for(let i=0;i<13;i++){
    const a=i*2.399,x=Math.cos(a)*.32,z=Math.sin(a)*.32,h=.8+hash(i,29)*.7;
    rod(reeds,leaves[1],[x,0,z],[x+.10,h,z],.007,5);
    rod(reeds,bark,[x+.10,h-.12,z],[x+.10,h+.04,z],.026,8);
    const leaf=add(reeds,new THREE.PlaneGeometry(.065,h*.75,1,4),leaves[i%3],[x+.13,h*.39,z]);leaf.rotation.set(.12,a,-.25);
  }asset('native_reeds',reeds);
  const safe=(x,y,r)=>!inQuarry(x,y,6)&&!(x>-180&&x<170&&y>145&&y<245)&&!zones.some(z=>Math.hypot(x-z.spawn.z,y+z.spawn.x)<r+10)&&
    !routes.some(route=>[route.spawn,...route.gates].some(p=>Math.hypot(x-p[0]/100,y-p[1]/100)<r+9));
  function place(group,x,y,scale,seed){
    const sample=terrain.sample(-y,x);if(!safe(x,y,group.solid?6:1))return;
    const angle=hash(seed,52)*Math.PI*2;
    group.instances.push({index:group.instances.length,p:[x*100,y*100,sample.height*100-2],
      q:[0,0,Math.sin(angle/2),Math.cos(angle/2)],s:[scale,scale*(.8+hash(seed,54)*.4),scale],
      color:[.75+hash(seed,61)*.25,.78+hash(seed,62)*.20,.72+hash(seed,63)*.22]});
  }
  // Deterministic clusters preserve clear tarmac and all marked course starts.
  for(let i=0;i<5200;i++){
    const x=-345+hash(i,100)*690,y=-345+hash(i,101)*690,s=terrain.sample(-y,x);
    if(s.surface==='asphalt'||s.surface==='snow')continue;
    if(i<700&&(s.surface==='rock'||s.surface==='dirt')&&s.waterDepth<.04)
      place(placements[i%4],x,y,.30+hash(i,105)*.60,i);
    else if(i<900&&s.surface==='dirt'&&s.waterDepth<.02)
      place(placements[4],x,y,.65+hash(i,109)*.35,i);
    else if(s.surface==='wetland'||s.waterDepth>.02)
      place(placements[6],x,y,.7+hash(i,111)*.7,i);
    else if(s.surface==='dirt'&&hash(i,113)>.35)
      place(placements[5],x,y,.55+hash(i,115)*.8,i);
  }
  // A legible boulder/log exercise beside Pine Ridge, off the main spawn line.
  const start=zones[0].spawn;
  for(let i=0;i<10;i++)place(placements[i%4],start.z+18+i*2.1,-start.x+11+(i%2)*.55,.35+hash(i,117)*.25,7000+i);
  place(placements[4],start.z+43,-start.x+13,.75,7011);
  return {assets,placements};
}
