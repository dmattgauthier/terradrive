import {T,box,mesh} from './body-surface.mjs';

// Cockpit marks are real, low-count geometry so the native OBJ exporter
// retains them. Their visible side faces the seats (negative local Z).
function dialMarks(x,y,r,start,end,count){
  return Array.from({length:count},(_,i)=>{
    const a=start+(end-start)*i/(count-1),outer=r*.91,inner=r*(i%4===0?.70:.80);
    return [x+Math.sin(a)*inner,y+Math.cos(a)*inner,x+Math.sin(a)*outer,y+Math.cos(a)*outer,r*.048];
  });
}

function strokes(g,m,name,segments){
  const positions=[],uvs=[];
  for(const [x1,y1,x2,y2,width] of segments){
    const dx=x2-x1,dy=y2-y1,scale=width*.5/Math.hypot(dx,dy);
    const x=-dy*scale,y=dx*scale;
    positions.push(x1+x,y1+y,0,x2+x,y2+y,0,x2-x,y2-y,0,
                   x1+x,y1+y,0,x2-x,y2-y,0,x1-x,y1-y,0);
    uvs.push(0,0,1,0,1,1,0,0,1,1,0,1);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.computeVertexNormals();
  const object=mesh(g,geometry,m);object.name=name;
  return object;
}

export function instrumentDial(g,{face,bezel,marks,needle=marks,center,radius,angle=-.80}){
  const group=new T.Group();group.name='cockpit-analogue-dial';
  group.position.set(...center);g.add(group);
  const disk=mesh(group,new T.CircleGeometry(radius,28),face,[0,0,.001]);
  disk.rotation.y=Math.PI;
  mesh(group,new T.TorusGeometry(radius,radius*.062,6,32),bezel,[0,0,.001]);
  strokes(group,marks,'cockpit-dial-index',dialMarks(0,0,radius,-2.12,2.12,13));
  const pointer=mesh(group,new T.CircleGeometry(radius*.095,12),needle,[0,0,-.001]);
  pointer.rotation.y=Math.PI;
  const hand=new T.Group();hand.position.z=-.0015;group.add(hand);
  strokes(hand,needle,'cockpit-dial-pointer',[[0,0,Math.sin(angle)*radius*.76,Math.cos(angle)*radius*.76,radius*.055]]);
}

export function instrumentDisplay(g,m,screen,[width,height],layout,tilt=0){
  const group=new T.Group();group.name='cockpit-display-'+layout;
  group.position.set(...screen);group.rotation.x=tilt;g.add(group);
  const s=(x1,y1,x2,y2,w=1)=>[width*x1,height*y1,width*x2,height*y2,height*.023*w];
  const marks=[];
  if(layout==='dials'||layout==='sport'){
    const centers=layout==='sport'?[-.255,.255]:[-.27,.27];
    for(const x of centers)marks.push(...dialMarks(x*width,.02*height,height*.36,-2.15,2.15,9));
    marks.push(s(-.095,.12,.095,.12,1.30),s(-.060,.015,.060,.015),s(-.075,-.20,.075,-.20));
  }else if(layout==='energy'){
    for(let i=0;i<7;i++)marks.push(s(-.34+i*.071,-.17,-.34+i*.071,.085+i*.025,2));
    marks.push(s(-.39,-.26,.12,-.26),s(.21,.19,.37,.19,1.45),s(.21,.052,.33,.052),s(.21,-.090,.38,-.090));
  }else if(layout==='status'){
    marks.push(s(-.38,.25,-.12,.25,1.45),s(-.38,.07,-.22,.07),s(.05,.25,.35,.25,1.45),s(.05,.07,.28,.07));
    marks.push(s(-.38,-.21,.36,-.21),s(-.16,-.30,-.16,-.13),s(.14,-.30,.14,-.13));
  }else{
    marks.push(s(-.38,.28,-.38,-.27),s(-.40,-.27,-.13,-.27),s(-.40,.10,-.23,.10),s(-.39,.28,-.20,.28,1.4));
    marks.push(s(-.12,-.14,.04,-.07),s(.04,-.07,.12,.16),s(.12,.16,.32,.25),s(.12,.16,.31,-.05),s(.31,-.05,.40,-.05));
  }
  strokes(group,m,group.name+'-marks',marks);
}

export function gClassSteering(g,m,center,mount,classic=false){
  const wheel=new T.Group();wheel.name=classic?'g63-six-four-spoke-steering-wheel':'gclass-modern-three-spoke-steering-wheel';
  wheel.position.set(...center);wheel.rotation.x=-.23;g.add(wheel);
  mesh(wheel,new T.TorusGeometry(.170,.017,10,48),m.black);
  box(wheel,m.interior,[0,0,-.002],[.133,.111,.054],.024);
  const rimSpoke=classic?[[.101,.049],[.083,-.089]]:[[.111,.020]];
  for(const side of [-1,1]){
    for(const [x,y] of rimSpoke){
      const spoke=box(wheel,m.interior,[side*x,y,0],[.129,.038,.024],.007);
      spoke.rotation.z=side*(y<0?-.91:.28);
    }
    box(wheel,m.gTrim,[side*.102,.020,-.017],[.043,.029,.009],.004);
    strokes(wheel,m.gSatin,'gclass-steering-control-index',[
      [side*.088,.025,side*.111,.025,.0018],
      [side*.088,.014,side*.108,.014,.0018]
    ]).position.z=-.023;
  }
  if(!classic)box(wheel,m.gSatin,[0,-.104,.002],[.034,.112,.023],.008);
  mesh(wheel,new T.TorusGeometry(.021,.0014,6,24),m.gSatin,[0,0,-.030]);
  const emblem=new T.Group();emblem.position.z=-.0305;wheel.add(emblem);
  strokes(emblem,m.gSatin,'gclass-steering-star',Array.from({length:3},(_,i)=>{
    const a=i*Math.PI*2/3;
    return [0,0,Math.sin(a)*.020,Math.cos(a)*.020,.002];
  }));
  const from=new T.Vector3(...center),to=new T.Vector3(...mount),axis=to.clone().sub(from);
  const column=mesh(g,new T.CylinderGeometry(.033,.039,axis.length(),16),m.gTrim,from.addScaledVector(axis,.5).toArray());
  column.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis.normalize());
  column.name='gclass-mounted-steering-column';
}
