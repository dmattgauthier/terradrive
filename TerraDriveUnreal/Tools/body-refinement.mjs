// Body-wide continuous surface refinements, applied to seams, glass and trim
// together. This avoids disconnected patches and leaves all wheel hardpoints.
import {T,clamp,smooth} from './body-surface.mjs';
const gauss=(v,c,w)=>Math.exp(-(((v-c)/w)**2));
export function bodyRefinement(view,spec){
 if(spec.bodyStyle==='urus')return;
 const style=spec.bodyStyle, configurations={
  jeep:{belt:1.19,roof:1.86,half:.833,cabin:[-1.99,.43],door:[-1.1,.57],nose:2.13},
  bronco:{belt:1.277,roof:1.873,half:.874,cabin:[-2.00,.50],door:[-1.15,.64],nose:2.16},
  sedan:{belt:.977,roof:1.415,half:.887,cabin:[-1.57,1.03],door:[-1.05,.88],nose:2.29},
  van:{belt:1.14,roof:2.446,half:.993,cabin:[-2.89,1.40],door:[-1.46,1.05],nose:2.89},
  hummer:{belt:1.421,roof:1.948,half:1.018,cabin:[-2.33,.79],door:[-1.11,.98],nose:2.20}
 },c=configurations[style];
 const warp=p=>{
  const [x,y,z]=p,ax=Math.abs(x),sign=Math.sign(x),side=smooth(ax,c.half*.74,c.half*.95),cab=smooth(z,c.cabin[0]-.06,c.cabin[0]+.15)*(1-smooth(z,c.cabin[1]-.15,c.cabin[1]+.12));
  const door=smooth(z,c.door[0]-.15,c.door[0]+.12)*(1-smooth(z,c.door[1]-.12,c.door[1]+.15));
  const level=clamp((y-.5)/(c.belt-.5),0,1),sheet=side*door*smooth(y,.49,.59)*(1-smooth(y,c.belt-.025,c.belt+.03));
  let dx=0,dy=0,dz=0;
  if(style==='jeep'){
   // JL's separate narrow bonnet, upright cabin and softly drawn door skins.
   dx+=sign*sheet*(.014*Math.sin(level*Math.PI)-.010*gauss(y,.69,.12));
   dx-=sign*cab*side*.019*smooth(y,1.32,1.84);
   dy+=.017*gauss(x,0,.56)*gauss(z,1.36,.62)*smooth(y,1.20,1.27);
   dy+=.010*cab*gauss(x,0,.65)*smooth(y,1.78,1.86);
  }else if(style==='bronco'){
   // Wide flatter bonnet, more tucked upper cabin, gentle door crown.
   dx+=sign*sheet*(.020*Math.sin(level*Math.PI)-.012*gauss(y,.72,.09));
   dx-=sign*cab*side*.028*smooth(y,1.31,1.85);
   dy+=.012*gauss(x,0,.72)*gauss(z,1.45,.64)*smooth(y,1.24,1.28);
   dy+=.014*cab*gauss(x,0,.71)*smooth(y,1.80,1.87);
  }else if(style==='sedan'){
   // Civic's low cowl, gently arched roof and integrated rear haunch.
   dx+=sign*sheet*(.016*Math.sin(level*Math.PI)-.014*gauss(y,.51-z*.025,.09));
   dx-=sign*cab*side*.023*smooth(y,1.02,1.40);
   dy+=.018*cab*gauss(x,0,.66)*gauss(z,-.21,.95)*smooth(y,1.32,1.415);
   dx+=sign*.017*side*gauss(z,-1.55,.34)*gauss(y,.88,.18);
   dy+=.009*gauss(x,0,.65)*gauss(z,1.64,.52)*smooth(y,.87,.95);
  }else if(style==='van'){
   // W906 body tapers into the roof and has a broad softly drawn cargo side.
   dx-=sign*cab*side*.042*smooth(y,1.50,2.42);
   dx+=sign*.018*side*gauss(y,1.38,.49)*gauss(z,-.75,1.72);
   dy+=.019*cab*gauss(x,0,.76)*smooth(y,2.32,2.44);
   dz-=.022*gauss(x,0,.65)*gauss(z,2.85,.16)*smooth(y,1.20,1.65);
  }else{
   // HUMMER's bluff hood, full rear haunch and tapered upper greenhouse.
   dx-=sign*cab*side*.037*smooth(y,1.45,1.93);
   dx+=sign*sheet*(.004*Math.sin(level*Math.PI)-.003*gauss(y,.83,.12));
   dx+=sign*.018*side*gauss(z,-1.19,.24)*gauss(y,1.20,.20);
   dy+=.013*gauss(x,0,.80)*gauss(z,1.49,.55)*smooth(y,1.32,1.46);
   dy+=.011*cab*gauss(x,0,.76)*smooth(y,1.88,1.95);
  }
  return new T.Vector3(x+dx,y+dy,z+dz);
 };
 view.body.updateWorldMatrix(true,true);let count=0,maxMove=0;
 const invBody=view.body.matrixWorld.clone().invert();
 view.body.traverse(o=>{
  if(!o.isMesh||o.isInstancedMesh)return;
  // Clone before mutation: source geometries and mirrored references must stay
  // immutable, including any geometry shared with the separate wheel rig.
  o.geometry=o.geometry.clone();const geo=o.geometry,p=geo.attributes.position,n=geo.attributes.normal;
  const toBody=invBody.clone().multiply(o.matrixWorld),toLocal=toBody.clone().invert(),normalToBody=new T.Matrix3().getNormalMatrix(toBody),normalToLocal=new T.Matrix3().getNormalMatrix(toLocal);
  const eps=.0001;
  for(let i=0;i<p.count;i++){
   const original=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(toBody),a=original.toArray(),q=warp(a);
   maxMove=Math.max(maxMove,original.distanceTo(q));
   if(n){const columns=[];for(let k=0;k<3;k++){const left=[...a],right=[...a];left[k]-=eps;right[k]+=eps;columns.push(warp(right).sub(warp(left)).multiplyScalar(.5/eps));}
    const jac=new T.Matrix3().set(columns[0].x,columns[1].x,columns[2].x,columns[0].y,columns[1].y,columns[2].y,columns[0].z,columns[1].z,columns[2].z).invert().transpose();
    const nn=new T.Vector3().fromBufferAttribute(n,i).applyMatrix3(normalToBody).applyMatrix3(jac).applyMatrix3(normalToLocal).normalize();n.setXYZ(i,nn.x,nn.y,nn.z);
   }
   q.applyMatrix4(toLocal);p.setXYZ(i,q.x,q.y,q.z);count++;
  }
  geo.computeBoundingBox();geo.computeBoundingSphere();
 });
 view.root.userData.bodyRefinement={version:1,style,vertices:count,maximumSurfaceChangeM:maxMove,hardpointsPreserved:true};
}
