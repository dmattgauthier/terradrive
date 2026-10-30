// Native-only factory detail pass. The supplied browser rig remains untouched.
// References, trim exclusions and measured envelopes: docs/vehicle-model-research.md.
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {nativeGeometry} from './vehicle-geometry.mjs';

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
    const w=r*wide*(.72+.38*Math.sin(t*Math.PI))*(polished?.67:1);
    const dish=side*(.016+.023*Math.sin(t*Math.PI*.85));
    for(const [across,thickness] of [[-1,0],[1,0],[1,-1],[-1,-1]]){
      // A machined face is a thin surface on the casting, not a second spoke
      // floating almost an inch ahead of the alloy. Give it real thickness.
      const tangent=spread+across*w,depth=polished?.0018+thickness*.0015:thickness*.033;
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
  const rimMaterial=style==='urus'?new THREE.MeshPhysicalMaterial({color:'#9ba2a5',metalness:.86,roughness:.29,clearcoat:.35,clearcoatRoughness:.18}):style==='sedan'?new THREE.MeshPhysicalMaterial({color:'#171c21',metalness:.58,roughness:.20,clearcoat:1,clearcoatRoughness:.10}):style==='van'?alloy.clone():graphite.clone();
  rimMaterial.userData.automotive=['urus','sedan'].includes(style)?'wheel':'metal';rimMaterial.userData.automotiveOwner=style;
  if(style==='urus'){rimMaterial.color.set('#20252a');rimMaterial.userData.automotive='wheel';}
  // Closed, thin cast barrel: two bead seats, safety humps and a dropped
  // central well. The former solid swept disc hid the brake and wheel depth.
  const barrelProfile=[[.960,-.455],[.997,-.445],[1.004,-.417],[.976,-.389],[.955,-.381],[.949,-.344],[.929,-.326],[.925,-.142],[.861,-.098],[.857,.098],[.925,.142],[.929,.326],[.949,.344],[.955,.381],[.976,.389],[1.004,.417],[.997,.445],[.960,.455],[.944,.429],[.938,.376],[.913,.331],[.909,.151],[.841,.109],[.841,-.109],[.909,-.151],[.913,-.331],[.938,-.376],[.944,-.429],[.960,-.455]];
  const barrel=mesh(g,new THREE.LatheGeometry(barrelProfile.map(([rad,depth])=>new THREE.Vector2(rad*r,depth*w)),96),rimMaterial);barrel.geometry.computeVertexNormals();barrel.rotation.z=Math.PI/2;barrel.name='mechanical13-closed-drop-centre-barrel';
  for(const side of [-1,1]){
    const face=side*w*.43;
    // The spinning rotor is a separate hub assembly at runtime. Keeping it
    // out of the rim prevents doubled brake discs and rotating calipers.
    if(style==='urus'){
      // Optional 22-inch Helianthus Shiny Black: five rounded hexagonal
      // openings, five outer triangular reliefs and a dished web (brochure p. 8).
      const shape=new THREE.Shape();shape.absarc(0,0,r*.963,0,Math.PI*2,false);
      for(let i=0;i<5;i++){
        const hole=new THREE.Path(),a=i*Math.PI*2/5+Math.PI/5;
        const contour=[[.34,0],[.50,-.49],[.86,-.49],[.935,-.30],[.935,.30],[.86,.49],[.50,.49]];
        contour.forEach(([rad,angle],j)=>hole[j?'lineTo':'moveTo'](Math.cos(a+angle)*r*rad,Math.sin(a+angle)*r*rad));hole.closePath();shape.holes.push(hole);
        const relief=new THREE.Path(),b=i*Math.PI*2/5;
        [[.78,0],[.935,-.13],[.935,.13]].forEach(([rad,angle],j)=>relief[j?'lineTo':'moveTo'](Math.cos(b+angle)*r*rad,Math.sin(b+angle)*r*rad));relief.closePath();shape.holes.push(relief);
      }
      const geo=new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSize:.0035,bevelThickness:.003,bevelSegments:3,curveSegments:80}),p=geo.attributes.position;
      for(let i=0;i<p.count;i++){const yy=p.getX(i),zz=p.getY(i),rr=Math.hypot(yy,zz)/r;p.setXYZ(i,face+side*(.016-.033*(1-rr*rr)+p.getZ(i)),yy,zz);}geo.computeVertexNormals();mesh(g,geo,rimMaterial);
    }else if(style==='van'){
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
    ring(g,rimMaterial,face,r*.976,.004);ring(g,black,face-side*.01,r*.84,.002);
    ring(g,alloy,side*w*.451,r*.973,.0014);
    disc(g,rimMaterial,face+side*.025,r*(style==='hummer'?.42:.30),.025);
    const lugCount=style==='hummer'?8:style==='van'||style==='bronco'?6:5;
    for(let i=0;i<lugCount;i++){
      const a=i*Math.PI*2/lugCount,y=Math.cos(a)*r*(style==='hummer'?.33:.228),z=Math.sin(a)*r*(style==='hummer'?.33:.228);
      const seat=mesh(g,new THREE.CylinderGeometry(.0125,.0115,.006,24),black,[face+side*.039,y,z]);seat.rotation.z=Math.PI/2;
      const washer=mesh(g,new THREE.CylinderGeometry(.0105,.0115,.004,24),alloy,[face+side*.042,y,z]);washer.rotation.z=Math.PI/2;
      const bolt=mesh(g,new THREE.CylinderGeometry(.008,.0088,.016,6),alloy,[face+side*.049,y,z]);bolt.rotation.z=Math.PI/2;
      // A dark inset in each hex head makes the fastener legible at oblique
      // garage angles rather than looking like a six-sided silver cylinder.
      const socket=mesh(g,new THREE.CylinderGeometry(.0038,.0038,.0008,6),black,[face+side*.0575,y,z]);socket.rotation.z=Math.PI/2;
    }
    disc(g,black,face+side*.044,r*.15,.010);
    if(style==='van'){
      ring(g,alloy,face+side*.052,r*.115,.0018);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod(g,alloy,[face+side*.054,0,0],[face+side*.054,Math.cos(a)*r*.115,Math.sin(a)*r*.115],.002);}
    }else if(style!=='bronco'&&style!=='urus'){
      const cap=text(g,style==='hummer'?'GMC':style==='sedan'?'H':'JEEP',r*.25,r*.095,alloy);
      cap.position.set(face+side*.052,-r*.047,0);cap.rotation.y=side*Math.PI/2;
    }
    const valve=mesh(g,new THREE.CylinderGeometry(.0037,.0046,.025,10),black,[face+side*.016,r*.80,r*.23]);valve.rotation.z=Math.PI/2;
    const valveCap=mesh(g,new THREE.CylinderGeometry(.0046,.0046,.007,8),graphite,[face+side*.031,r*.80,r*.23]);valveCap.rotation.z=Math.PI/2;
  }g.userData.runningGearRevision=13;return g;
}

/** Native carcass and beveled tread. All dimensions use the mechanical tire. */
function factoryTire(spec,materials){
  const group=new THREE.Group(),radius=spec.tireRadius,width=spec.tireWidth;
  const rim=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254*.5,type=spec.tireType;
  const mud=type==='mud-terrain',at=type==='all-terrain',performance=type==='road-performance',commercial=type==='highway-commercial';
  const depth=mud?.018:at?.011:performance?.006:commercial?.008:.007;
  const profile=[[rim*.97,-width*.425],[rim*1.045,-width*.447],[THREE.MathUtils.lerp(rim*1.045,radius,.45),-width*.495],[radius*.880,-width*.516],[radius*.947,-width*.484],[radius*.982,-width*.413],[radius,-width*.31],[radius,-width*.15],[radius,0],[radius,width*.15],[radius,width*.31],[radius*.982,width*.413],[radius*.947,width*.484],[radius*.880,width*.516],[THREE.MathUtils.lerp(rim*1.045,radius,.45),width*.495],[rim*1.045,width*.447],[rim*.97,width*.425]];
  const carcass=mesh(group,new THREE.LatheGeometry(profile.map(([r,x])=>new THREE.Vector2(r-depth*THREE.MathUtils.smoothstep(r/radius,.82,1),x)),96),materials.rubber);carcass.rotation.z=Math.PI/2;carcass.name='native-formed-tire-carcass';
  const count=mud?34:at?48:performance?86:commercial?66:76,rows=mud?3:5;
  const blockW=width*(mud?.268:at?.162:commercial?.144:.143),blockL=radius*(mud?.096:at?.068:performance?.037:commercial?.046:.039),cut=Math.min(blockW,blockL)*.16;
  const shape=new THREE.Shape(),hw=blockW*.5,hl=blockL*.5;
  [[-hw+cut,-hl],[hw-cut,-hl],[hw,-hl+cut],[hw,hl-cut],[hw-cut,hl],[-hw+cut,hl],[-hw,hl-cut],[-hw,-hl+cut]].forEach(([x,y],i)=>shape[i?'lineTo':'moveTo'](x,y));shape.closePath();
  const bevel=mud?.0017:at?.0013:.00075;
  const treadGeo=new THREE.ExtrudeGeometry(shape,{depth:depth-bevel*2,bevelEnabled:true,bevelSegments:1,bevelSize:bevel,bevelThickness:bevel,steps:1,curveSegments:1});treadGeo.translate(0,0,-(depth-bevel*2)*.5);treadGeo.rotateX(Math.PI/2);
  const blocks=new THREE.InstancedMesh(treadGeo,materials.tread,count*rows),dummy=new THREE.Object3D();
  for(let row=0;row<rows;row++)for(let i=0;i<count;i++){
    const across=row-(rows-1)*.5,shoulder=Math.abs(across)/((rows-1)*.5),phase=row%2?.48:0,a=(i+phase)*Math.PI*2/count;
    dummy.position.set(across*width*(mud?.306:.173),Math.cos(a)*(radius*(1-shoulder*shoulder*.017)-depth*.5),Math.sin(a)*(radius*(1-shoulder*shoulder*.017)-depth*.5));
    dummy.rotation.set(a,Math.sign(across||1)*(mud?.36:at?.20:performance?.08:commercial?.04:.12),0);dummy.updateMatrix();blocks.setMatrixAt(row*count+i,dummy.matrix);
  }
  blocks.name='native-beveled-'+type+'-tread';blocks.castShadow=blocks.receiveShadow=true;group.add(blocks);
  for(const side of [-1,1]){
    ring(group,materials.rubber,side*width*.454,rim*1.055,.004);
    for(const r of [radius*.77,radius*.86])ring(group,materials.tread,side*width*.513,r,.0016);
    // Low molded shoulder bars and fine flex/sipe edges soften the former
    // square-cut floating blocks without changing contact radius or rim fit.
    if(at||mud)for(let i=0;i<(mud?34:48);i++){
      const a=i*Math.PI*2/(mud?34:48),r=radius*.917;
      rod(group,materials.tread,[side*width*.503,Math.cos(a-.008)*r,Math.sin(a-.008)*r],[side*width*.503,Math.cos(a+.008)*radius*.954,Math.sin(a+.008)*radius*.954],mud?.004:.0025);
    }
  }
  return group;
}
export function refineFactoryWheel(wheel,spec,materials){
  wheel.tireSpin.clear();wheel.tireSpin.add(factoryTire(spec,materials));
  wheel.rimSpin.clear();wheel.rimSpin.add(factoryRim(spec));
  wheel.root.userData.factoryWheelRevision=3;
}

export function refineVehicle(view,spec){
  for(const [key,m]of Object.entries(view.materials)){
    if(!m?.isMaterial)continue;
    m.userData.nativeRole=key==='red'?'brake':key==='reverse'?'reverse':key==='paint'||key==='glossBlack'?'paint':m.userData.vehicleGlass?'glass':m.userData.vehicleLampLens?'lens':key==='rubber'||key==='tread'?'rubber':'';
  }
  // Hummer roof clearance markers share the browser's red material. Only
  // actual rear emitters get a dynamic brake material in the native export.
  view.root.updateMatrixWorld(true);
  const extras=[];
  view.body.traverse(o=>{
    if(!o.isMesh||o.material!==view.materials.red)return;
    const geo=o.geometry,pa=geo.attributes.position,ix=geo.index,on=[],off=[];
    for(let i=0;i<(ix?ix.count:pa.count);i+=3){
      const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k);
      const z=ids.reduce((sum,j)=>sum+new THREE.Vector3().fromBufferAttribute(pa,j).applyMatrix4(o.matrixWorld).z,0)/3;
      (z< -spec.wheelbase*.25?on:off).push(...ids);
    }
    if(off.length){
      const other=o.clone();other.geometry=geo.clone();other.geometry.setIndex(off);
      other.material=o.material.clone();other.material.userData.nativeRole='';other.material.emissiveIntensity=.04;
      extras.push([o.parent,other]);geo.setIndex(on);
    }
  });
  for(const [parent,extra]of extras)parent.add(extra);
  // Replace lost canvas text with real geometry, and keep native body identity
  // independent of any font/HTML renderer in the shipped game.
  if(spec.bodyStyle==='jeep')for(const side of [-1,1]){
    const label=text(view.body,'RUBICON',.63,.029,decal);label.position.set(side*.781,1.215,1.385);label.rotation.y=side*Math.PI/2;
    label.name='wrangler-rubicon-bonnet-label-'+side;
    // Follow the widened, gently tapered bonnet instead of hiding the old
    // fixed-width lettering inside its side sheet. Retain extrusion depth.
    view.body.updateWorldMatrix(true,true);
    const bodyInverse=view.body.matrixWorld.clone().invert(),q=new THREE.Vector3(),n=new THREE.Vector3();
    const edge=z=>{const v=Math.max(0,Math.min(1,(z-.748)/(2.160-.748)));return .775-.013*v+.004*Math.sin(v*Math.PI)+.0055;};
    label.traverse(o=>{
      if(!o.isMesh)return;o.geometry=o.geometry.clone();
      const toBody=bodyInverse.clone().multiply(o.matrixWorld),toLocal=toBody.clone().invert(),normalToBody=new THREE.Matrix3().getNormalMatrix(toBody),normalToLocal=new THREE.Matrix3().getNormalMatrix(toLocal),p=o.geometry.attributes.position,ns=o.geometry.attributes.normal;
      for(let i=0;i<p.count;i++){
        q.fromBufferAttribute(p,i).applyMatrix4(toBody);const z=q.z,e=.0001,slope=(edge(z+e)-edge(z-e))/(2*e);
        n.fromBufferAttribute(ns,i).applyMatrix3(normalToBody);n.z-=side*slope*n.x;n.applyMatrix3(normalToLocal).normalize();
        q.x+=side*(edge(z)-.781);q.applyMatrix4(toLocal);p.setXYZ(i,q.x,q.y,q.z);ns.setXYZ(i,n.x,n.y,n.z);
      }
      o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
    });
  }
  if(spec.bodyStyle==='van'){
    const label=text(view.body,'SPRINTER',.31,.045,alloy);label.position.set(.57,.947,-3.027);label.rotation.y=Math.PI;
    const badge=text(view.body,'2500',.15,.033,alloy);badge.position.set(-.66,.949,-3.027);badge.rotation.y=Math.PI;
  }
  if(spec.bodyStyle==='sedan'){
    const label=text(view.body,'CIVIC',.19,.033,alloy);label.position.set(.49,.927,-2.368);label.rotation.y=Math.PI;
    const sport=text(view.body,'SPORT',.13,.025,alloy);sport.position.set(-.52,.925,-2.369);sport.rotation.y=Math.PI;
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
  if(rear&&spec.bodyStyle!=='sedan')for(let i=0;i<8;i++){
    const y=THREE.MathUtils.lerp(rear[1],rear[2],i/7),a=glassPoint(-rear[3],y),b=glassPoint(rear[3],y);
    if(a&&b&&Math.abs(a[2]-b[2])<.05)rod(view.body,heater,a,b,.0007);
  }
  const wheel=view.wheels[0];refineFactoryWheel(wheel,spec,view.materials);
  // Molded sidewall size marks, with raised lettering rather than a flat decal.
  const rr=spec.tireRadius;
  for(const side of [-1,1]){
    const label=text(wheel.tireSpin,spec.tireSize,.28,.015,black);label.position.set(side*spec.tireWidth*.517,rr*.76,0);label.rotation.set(0,side*Math.PI/2,0);
  }
  view.root.userData.nativeFidelity={version:3,splitTireAndRim:true,factorySpokeProfile:spec.bodyStyle,beveledTread:true,matchingFactorySpare:['jeep','bronco','hummer'].includes(spec.bodyStyle),bodyClearcoat:true,geometryLettering:true};
  return {tire:wheel.tireShape,rim:wheel.rimSpin};
}

export {text as geometryText};
export function brakeCaliperModel(){
  const g=new THREE.Group();
  // Source X is the hub axis (Unreal -Y after import); source Y is up.
  // A cast bridge straddles the thin rotor, with two separate pads/fingers
  // rather than a solid block occupying the rotor's swept friction ring.
  const pad=new THREE.MeshStandardMaterial({color:'#202324',roughness:.91});
  for(const side of [-1,1]){
    nativeGeometry.roundedBox(g,castMetal,side*.030,0,0,.028,.116,.073,.009);
    nativeGeometry.roundedBox(g,pad,side*.014,0,.010,.009,.089,.055,.003);
    for(const y of [-.032,.032]){
      const cap=mesh(g,new THREE.CylinderGeometry(.021,.023,.010,24),castMetal,[side*.046,y,0]);cap.rotation.z=Math.PI/2;
      const bolt=mesh(g,new THREE.CylinderGeometry(.005,.0055,.005,6),alloy,[side*.053,y,0]);bolt.rotation.z=Math.PI/2;
    }
  }
  for(const y of [-.047,.047])nativeGeometry.roundedBox(g,castMetal,0,y,-.023,.086,.026,.038,.007);
  // Crossover pipe, pad retaining pins and an inboard hose boss.
  for(const y of [-.028,.028])rod(g,alloy,[-.040,y,.033],[.040,y,.033],.0034);
  rod(g,castMetal,[-.046,-.040,-.025],[-.046,.040,-.025],.004);
  rod(g,castMetal,[-.046,.040,-.025],[-.040,.049,.008],.004);
  const boss=mesh(g,new THREE.CylinderGeometry(.008,.009,.012,12),alloy,[-.049,.040,.008]);boss.rotation.z=Math.PI/2;
  g.userData.runningGearRevision=13;
  return g;
}

/** Unit-radius hub-local brake: real vent gap, hat and through-drilled holes.
 * Runtime scales the complete assembly to the factory brake envelope. */
export function brakeRotorModel(ceramic=false,solid=false){
  const g=new THREE.Group(),surface=rotorMetal.clone();
  surface.color.set(ceramic?'#565b5e':'#8c9498');surface.roughness=ceramic?.59:.43;
  surface.userData.automotive=ceramic?'rotor':'brakeSteel';surface.userData.automotiveOwner=ceramic?'urus':'';
  const hat=castMetal.clone(),vent=castMetal.clone();
  function annulus(outer,inner,depth,x,holes=false){
    const shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
    const bore=new THREE.Path();bore.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(bore);
    if(holes)for(let row=0;row<3;row++)for(let i=0;i<24;i++){
      const a=(i+(row%2)*.35)*Math.PI/12,rr=.65+row*.13,h=new THREE.Path();
      // Ten straight segments per small bore keep the true holes inexpensive;
      // they must not inherit the 96-segment outer friction-ring arc.
      for(let k=0;k<10;k++){const t=-k*Math.PI/5,yy=Math.cos(a)*rr+Math.cos(t)*.0175,zz=Math.sin(a)*rr+Math.sin(t)*.0175;h[k?'lineTo':'moveTo'](yy,zz);}h.closePath();shape.holes.push(h);
    }
    let geo=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:false,curveSegments:96});
    const p=geo.attributes.position;for(let i=0;i<p.count;i++){const y=p.getX(i),z=p.getY(i);p.setXYZ(i,x+p.getZ(i)-depth*.5,y,z);}geo.computeVertexNormals();
    // Earcut can emit zero-area triangles where a polygon bore closes. Strip
    // those before import so the tangent builder never receives a zero normal.
    const keep=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);if(b.cross(c).lengthSq()>1e-18)keep.push(i,i+1,i+2);}
    geo.setIndex(keep);const clean=geo.toNonIndexed();geo.dispose();geo=clean;geo.computeVertexNormals();
    const m=mesh(g,geo,surface);m.name=holes?'mechanical13-through-drilled-friction-ring':'mechanical13-vented-friction-ring';
  }
  if(solid)annulus(1,.53,.035,0);
  else for(const side of [-1,1])annulus(1,.53,.025,side*.0355,ceramic);
  // Forty-eight individual vanes leave a visible cooling gap between faces.
  for(let i=0;i<(solid?0:48);i++){
    const a=i*Math.PI/24,b=a+.055;
    rod(g,vent,[0,Math.cos(a)*.555,Math.sin(a)*.555],[0,Math.cos(b)*.966,Math.sin(b)*.966],.010);
  }
  const profile=[[.14,-.030],[.32,-.030],[.36,-.024],[.41,.005],[.535,.012],[.555,.024],[.535,.036],[.40,.029],[.33,-.007],[.14,-.007],[.14,-.030]];
  const hub=mesh(g,new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),96),hat);hub.geometry.computeVertexNormals();hub.rotation.z=Math.PI/2;hub.name='mechanical13-hollow-hat';
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;const fastener=mesh(g,new THREE.CylinderGeometry(.022,.024,.011,6),alloy,[.029,Math.cos(a)*.46,Math.sin(a)*.46]);fastener.rotation.z=Math.PI/2;
  }
  g.userData={runningGearRevision:13,nominalRadius:1,frictionInnerRadius:.53,ventGap:solid?0:.046,throughDrilled:ceramic,solid};
  return g;
}
