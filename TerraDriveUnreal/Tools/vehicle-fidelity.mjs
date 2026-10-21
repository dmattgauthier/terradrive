// Native-only factory detail pass. The supplied browser rig remains untouched.
// References, trim exclusions and measured envelopes: docs/vehicle-model-research.md.
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';

const alloy=new THREE.MeshPhysicalMaterial({color:'#9ba2a5',metalness:.86,roughness:.29,clearcoat:.35,clearcoatRoughness:.18});
const graphite=new THREE.MeshPhysicalMaterial({color:'#252c30',metalness:.70,roughness:.31,clearcoat:.45,clearcoatRoughness:.16});
const black=new THREE.MeshStandardMaterial({color:'#171c20',metalness:.08,roughness:.76});
const rotorMetal=new THREE.MeshStandardMaterial({color:'#727a7e',metalness:.83,roughness:.40});
const decal=new THREE.MeshStandardMaterial({color:'#242523',roughness:.62});
const castMetal=new THREE.MeshStandardMaterial({color:'#444d50',metalness:.64,roughness:.52});
function mesh(g,geo,mat,p=[0,0,0]){const m=new THREE.Mesh(geo,mat);m.position.set(...p);g.add(m);return m;}
function rod(g,mat,a,b,r=.006){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const m=mesh(g,new THREE.CylinderGeometry(r,r,d.length(),12),mat,av.clone().add(bv).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
function disc(g,mat,x,r,depth){const m=mesh(g,new THREE.CylinderGeometry(r,r,depth,64),mat,[x,0,0]);m.rotation.z=Math.PI/2;return m;}
function ring(g,mat,x,r,tube){const m=mesh(g,new THREE.TorusGeometry(r,tube,8,80),mat,[x,0,0]);m.rotation.y=Math.PI/2;return m;}
// A curved, closed spoke, with an independently machined upper face. Cross
// sections carry a dish and tapered edges instead of flat extruded rectangles.
function spoke(g,material,side,face,r,angle,branch,kind,polished=false){
  const vertices=[],indices=[],steps=16,wide=kind==='hummer'?.135:kind==='jeep'?.085:kind==='bronco'?.060:.040;
  for(let row=0;row<=steps;row++){
    const t=row/steps,rad=r*(.27+t*.685),spread=branch*r*(kind==='hummer'?.095:.22)*Math.pow(t,1.35);
    const w=r*wide*(.72+.38*Math.sin(t*Math.PI))*(polished?.45:1);
    const dish=side*(.016+.023*Math.sin(t*Math.PI*.85));
    for(const [across,thickness] of [[-1,0],[1,0],[1,-1],[-1,-1]]){
      const tangent=spread+across*w,depth=polished?.024:thickness*.033;
      vertices.push(face+dish+side*depth,Math.cos(angle)*rad-Math.sin(angle)*tangent,Math.sin(angle)*rad+Math.cos(angle)*tangent);
    }
  }
  for(let row=0;row<steps;row++)for(let edge=0;edge<4;edge++){
    const a=row*4+edge,b=row*4+(edge+1)%4,c=a+4,d=b+4;indices.push(a,c,b,b,c,d);
  }
  indices.push(0,1,2,0,2,3,steps*4,steps*4+2,steps*4+1,steps*4,steps*4+3,steps*4+2);
  if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(g,geo,material);
}
const letters={
 A:[[0,0],[.5,1],[1,0],null,[.23,.43],[.77,.43]],B:[[0,0],[0,1],[.65,1],[.9,.8],[.65,.53],[0,.53],null,[.65,.53],[1,.28],[.7,0],[0,0]],
 C:[[1,.87],[.75,1],[.18,1],[0,.78],[0,.22],[.18,0],[.75,0],[1,.13]],D:[[0,0],[0,1],[.6,1],[1,.7],[1,.3],[.6,0],[0,0]],
 E:[[1,1],[0,1],[0,0],[1,0],null,[0,.52],[.78,.52]],F:[[0,0],[0,1],[1,1],null,[0,.52],[.8,.52]],
 G:[[1,.82],[.8,1],[.2,1],[0,.75],[0,.25],[.2,0],[1,0],[1,.48],[.57,.48]],H:[[0,0],[0,1],null,[1,0],[1,1],null,[0,.5],[1,.5]],
 I:[[.5,0],[.5,1]],J:[[0,.25],[.2,0],[.75,0],[1,.25],[1,1]],K:[[0,0],[0,1],null,[1,1],[0,.45],[1,0]],
 L:[[0,1],[0,0],[1,0]],M:[[0,0],[0,1],[.5,.48],[1,1],[1,0]],N:[[0,0],[0,1],[1,0],[1,1]],
 O:[[.2,0],[0,.2],[0,.8],[.2,1],[.8,1],[1,.8],[1,.2],[.8,0],[.2,0]],P:[[0,0],[0,1],[.75,1],[1,.78],[.75,.55],[0,.55]],
 R:[[0,0],[0,1],[.75,1],[1,.78],[.75,.55],[0,.55],null,[.50,.55],[1,0]],S:[[1,.86],[.8,1],[.2,1],[0,.8],[.18,.55],[.8,.45],[1,.2],[.8,0],[.2,0],[0,.14]],
 T:[[0,1],[1,1],null,[.5,1],[.5,0]],U:[[0,1],[0,.2],[.2,0],[.8,0],[1,.2],[1,1]],V:[[0,1],[.5,0],[1,1]],
 W:[[0,1],[.2,0],[.5,.5],[.8,0],[1,1]],X:[[0,0],[1,1],null,[0,1],[1,0]],Y:[[0,1],[.5,.5],[1,1],null,[.5,.5],[.5,0]],Z:[[0,1],[1,1],[0,0],[1,0]],
 '0':[[.2,0],[0,.2],[0,.8],[.2,1],[.8,1],[1,.8],[1,.2],[.8,0],[.2,0]],'1':[[.2,.8],[.6,1],[.6,0]],'2':[[0,.8],[.2,1],[.8,1],[1,.8],[0,0],[1,0]],'3':[[0,1],[1,1],[.5,.5],[1,.3],[.8,0],[0,0]],
 '4':[[.8,0],[.8,1],[0,.35],[1,.35]],'5':[[1,1],[0,1],[0,.55],[.8,.55],[1,.3],[.8,0],[0,0]],'6':[[1,1],[.2,1],[0,.6],[0,.2],[.2,0],[.8,0],[1,.2],[1,.5],[.8,.6],[0,.6]],
 '7':[[0,1],[1,1],[.3,0]],'8':[[.2,.5],[0,.7],[.2,1],[.8,1],[1,.7],[.8,.5],[.2,.5],[0,.2],[.2,0],[.8,0],[1,.2],[.8,.5]],'9':[[1,.4],[.2,.4],[0,.6],[0,.8],[.2,1],[.8,1],[1,.8],[1,.2],[.8,0],[0,0]],'/':[[0,0],[1,1]],'-':[[.1,.5],[.9,.5]]
};
function text(g,value,width,height,material){
  const group=new THREE.Group();g.add(group);const step=width/Math.max(1,value.length),stroke=height*.052;
  for(const [i,ch]of [...value].entries()){
    let last=null;
    for(const p of letters[ch]||[]){
      if(p&&last)rod(group,material,[-width*.5+i*step+last[0]*step*.76,last[1]*height,0],[-width*.5+i*step+p[0]*step*.76,p[1]*height,0],stroke);
      last=p;
    }
  }return group;
}

function factoryRim(spec){
  const g=new THREE.Group(),style=spec.bodyStyle,rimInches=Number(spec.tireSize.match(/R(\d+)/)[1]),r=rimInches*.0254*.5,w=spec.tireWidth;
  const rimMaterial=style==='sedan'?new THREE.MeshPhysicalMaterial({color:'#171c21',metalness:.48,roughness:.20,clearcoat:1,clearcoatRoughness:.10}):style==='van'?alloy:graphite;
  const barrel=mesh(g,new THREE.LatheGeometry([[r*.85,-w*.43],[r*.97,-w*.44],[r,-w*.38],[r*.93,-w*.32],[r*.93,w*.32],[r,w*.38],[r*.97,w*.44],[r*.85,w*.43]].map(p=>new THREE.Vector2(...p)),96),rimMaterial);barrel.rotation.z=Math.PI/2;
  for(const side of [-1,1]){
    const face=side*w*.43;
    disc(g,rotorMetal,face*.62,r*.735,.020);disc(g,castMetal,face*.76,r*.31,.035);
    for(let i=0;i<40;i++){
      const a=i*Math.PI/20;rod(g,black,[face*.62-side*.011,Math.cos(a)*r*.60,Math.sin(a)*r*.60],[face*.62+side*.011,Math.cos(a)*r*.60,Math.sin(a)*r*.60],.003);
    }
    if(style==='van'){
      const shape=new THREE.Shape();shape.absarc(0,0,r*.94,0,Math.PI*2,false);
      for(let i=0;i<12;i++){const a=i*Math.PI/6,h=new THREE.Path();h.absarc(Math.cos(a)*r*.74,Math.sin(a)*r*.74,r*.091,0,Math.PI*2,true);shape.holes.push(h);}
      const geo=new THREE.ExtrudeGeometry(shape,{depth:.008,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,curveSegments:64});
      const p=geo.attributes.position;for(let i=0;i<p.count;i++){const yy=p.getX(i),zz=p.getY(i),rr=Math.hypot(yy,zz)/r;p.setXYZ(i,face+side*(.016+.041*rr*rr+p.getZ(i)),yy,zz);}geo.computeVertexNormals();mesh(g,geo,alloy);
    }else{
      const count=style==='hummer'?8:style==='bronco'?6:5;
      for(let i=0;i<count;i++)for(const branch of [-1,1]){
        spoke(g,rimMaterial,side,face,r,i*Math.PI*2/count,branch,style);
        if(style==='jeep'||style==='hummer'||style==='bronco')spoke(g,alloy,side,face,r,i*Math.PI*2/count,branch,style,true);
      }
    }
    ring(g,rimMaterial,face,r*.976,.007);ring(g,black,face-side*.01,r*.84,.003);
    disc(g,rimMaterial,face+side*.025,r*(style==='hummer'?.42:.30),.025);
    const lugCount=style==='hummer'?8:style==='van'||style==='bronco'?6:5;
    for(let i=0;i<lugCount;i++){
      const a=i*Math.PI*2/lugCount,y=Math.cos(a)*r*(style==='hummer'?.33:.228),z=Math.sin(a)*r*(style==='hummer'?.33:.228);
      const bolt=mesh(g,new THREE.CylinderGeometry(.008,.009,.017,6),alloy,[face+side*.045,y,z]);bolt.rotation.z=Math.PI/2;
    }
    disc(g,black,face+side*.044,r*.15,.010);
    if(style==='van'){
      ring(g,alloy,face+side*.052,r*.115,.0018);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod(g,alloy,[face+side*.054,0,0],[face+side*.054,Math.cos(a)*r*.115,Math.sin(a)*r*.115],.002);}
    }else if(style!=='bronco'){
      const cap=text(g,style==='hummer'?'GMC':style==='sedan'?'H':'JEEP',r*.25,r*.095,alloy);
      cap.position.set(face+side*.052,-r*.047,0);cap.rotation.y=side*Math.PI/2;
    }
    const valve=mesh(g,new THREE.CylinderGeometry(.004,.004,.024,10),black,[face+side*.016,r*.80,r*.23]);valve.rotation.z=Math.PI/2;
  }return g;
}

export function refineVehicle(view,spec){
  for(const [key,m]of Object.entries(view.materials)){
    if(!m?.isMaterial)continue;
    m.userData.nativeRole=key==='paint'||key==='glossBlack'?'paint':m.userData.vehicleGlass?'glass':m.userData.vehicleLampLens?'lens':key==='rubber'||key==='tread'?'rubber':'';
  }
  // Replace lost canvas text with real geometry, and keep native body identity
  // independent of any font/HTML renderer in the shipped game.
  if(spec.bodyStyle==='jeep')for(const side of [-1,1]){
    const label=text(view.body,'RUBICON',.63,.057,decal);label.position.set(side*.626,1.211,1.385);label.rotation.y=side*Math.PI/2;
  }
  if(spec.bodyStyle==='van'){
    const label=text(view.body,'SPRINTER',.31,.045,alloy);label.position.set(-.57,.947,-3.027);label.rotation.y=Math.PI;
    const badge=text(view.body,'2500',.15,.033,alloy);badge.position.set(.66,.949,-3.027);badge.rotation.y=Math.PI;
  }
  if(spec.bodyStyle==='sedan'){
    const label=text(view.body,'CIVIC',.19,.033,alloy);label.position.set(-.49,.927,-2.368);label.rotation.y=Math.PI;
    const sport=text(view.body,'SPORT',.13,.025,alloy);sport.position.set(.52,.925,-2.369);sport.rotation.y=Math.PI;
  }
  // Fine heater lines occupy the rear glass, avoiding the absent canvas maps.
  const rear={jeep:[-2.079,1.32,1.74,.70],bronco:[-2.083,1.34,1.73,.73],van:[-3.029,1.12,1.98,.78],sedan:[-1.44,1.02,1.32,.59],hummer:[-2.52,1.50,1.86,.84]}[spec.bodyStyle];
  const heater=new THREE.MeshStandardMaterial({color:'#635b45',roughness:.72});
  view.root.updateMatrixWorld(true);
  const glassPoint=(x,y)=>{
    const origin=view.body.localToWorld(new THREE.Vector3(x,y,-spec.length));
    const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,0,1),0,spec.length*1.25).intersectObject(view.body,true);
    for(const hit of hits){
      const materials=Array.isArray(hit.object.material)?hit.object.material:[hit.object.material];
      const m=materials[hit.face?.materialIndex||0];const p=view.body.worldToLocal(hit.point.clone());
      if(m?.userData.vehicleGlass&&p.z< -spec.wheelbase*.25){p.z-=.001;return p.toArray();}
    }return null;
  };
  if(spec.bodyStyle!=='sedan')for(let i=0;i<8;i++){
    const y=THREE.MathUtils.lerp(rear[1],rear[2],i/7),a=glassPoint(-rear[3],y),b=glassPoint(rear[3],y);
    if(a&&b&&Math.abs(a[2]-b[2])<.05)rod(view.body,heater,a,b,.0007);
  }
  const wheel=view.wheels[0];
  for(const child of [...wheel.rimSpin.children])wheel.rimSpin.remove(child);
  wheel.rimSpin.add(factoryRim(spec));
  // Molded sidewall size marks, with raised lettering rather than a flat decal.
  const rr=spec.tireRadius;
  for(const side of [-1,1]){
    const label=text(wheel.tireSpin,spec.tireSize,.28,.015,black);label.position.set(side*spec.tireWidth*.517,rr*.76,0);label.rotation.set(0,side*Math.PI/2,0);
  }
  view.root.userData.nativeFidelity={version:2,splitTireAndRim:true,factorySpokeProfile:spec.bodyStyle,bodyClearcoat:true,geometryLettering:true};
  return {tire:wheel.tireShape,rim:wheel.rimSpin};
}

export function brakeCaliperModel(){
  const g=new THREE.Group();
  // Local hub coordinates: +X is forward and Y points outward after import.
  const shell=mesh(g,new THREE.BoxGeometry(.060,.110,.140,2,3,3),castMetal);
  for(const side of [-1,1]){
    const cap=mesh(g,new THREE.CylinderGeometry(.029,.029,.008,24),alloy,[side*.033,0,.025]);cap.rotation.z=Math.PI/2;
    for(const y of [-.036,.036])rod(g,alloy,[-.04,y,-.036],[.04,y,-.036],.006);
  }
  return g;
}
