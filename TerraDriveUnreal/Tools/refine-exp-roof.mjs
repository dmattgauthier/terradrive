// Offline topology preparation for the EXP's closely stacked roof/solar layers.
// Source coordinates are metres, Y up. This never changes the clean silhouette.
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';

export const EXP_ROOF_REFINEMENT=Object.freeze({version:1,maxEdgeCM:16,upperBandCM:17,maxAddedVertices:80000});
const component=['getX','getY','getZ','getW'];
const length2=(p,a,b)=>p[a].reduce((sum,v,k)=>sum+(v-p[b][k])**2,0);
function edgeKey(p,a,b){
  let x=p[a].map(v=>Math.round(v*1000)),y=p[b].map(v=>Math.round(v*1000));
  for(let k=0;k<3;k++){if(x[k]>y[k]){[x,y]=[y,x];break;}if(x[k]<y[k])break;}
  return x.join(',')+'|'+y.join(',');
}

/** Preserve separate material, hard-normal and UV vertices; share edge splits. */
export function refineExpRoof(body){
  body.updateMatrixWorld(true);const localFromWorld=body.matrixWorld.clone().invert(),sections=[];
  let roofTop=-Infinity,added=0,addedTriangles=0,closureVertices=0,maxDepth=0;
  body.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.visible)return;
    const geometry=mesh.geometry,position=geometry.attributes.position;
    if(!position||!geometry.attributes.normal||!geometry.attributes.uv)throw new Error('EXP roof requires complete position/normal/UV streams');
    if(Object.keys(geometry.morphAttributes).length)throw new Error('EXP roof does not accept morph targets');
    const common=localFromWorld.clone().multiply(mesh.matrixWorld),p=[],streams={};
    for(const [name,attribute] of Object.entries(geometry.attributes)){
      if(attribute.count!==position.count||attribute.itemSize>4)throw new Error('Unsupported EXP roof attribute '+name);
      streams[name]={size:attribute.itemSize,values:[]};
      for(let i=0;i<attribute.count;i++)for(let k=0;k<attribute.itemSize;k++)streams[name].values.push(attribute[component[k]](i));
    }
    const point=new T.Vector3();
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(common);
      // Match the proven native algorithm's cm basis, before OBJ import flips Y.
      p.push([point.z*100,point.x*100,point.y*100]);roofTop=Math.max(roofTop,point.y*100);
    }
    const ids=geometry.index?Array.from(geometry.index.array):Array.from({length:position.count},(_,i)=>i);
    const triangles=[],groups=geometry.groups.length?geometry.groups:[{start:0,count:ids.length,materialIndex:0}];
    for(const group of groups)for(let i=group.start;i<group.start+group.count;i+=3)triangles.push([ids[i],ids[i+1],ids[i+2],group.materialIndex]);
    sections.push({mesh,geometry,p,streams,triangles,originalTriangles:triangles.length,originalVertices:position.count});
  });
  if(!sections.length||!Number.isFinite(roofTop))throw new Error('EXP roof body is empty');
  const roofMin=roofTop-EXP_ROOF_REFINEMENT.upperBandCM,splits=new Set();
  function refine(section,closureOnly=false){
    const {p,streams}=section,midpoints=new Map(),result=[];
    function midpoint(a,b){
      const key=Math.min(a,b)+','+Math.max(a,b);
      if(midpoints.has(key))return midpoints.get(key);
      if(added>=EXP_ROOF_REFINEMENT.maxAddedVertices)throw new Error('EXP roof exceeded bounded added-vertex budget');
      const index=p.length;p.push(p[a].map((v,k)=>(v+p[b][k])*.5));
      for(const [name,{size,values}] of Object.entries(streams)){
        const next=Array.from({length:size},(_,k)=>(values[a*size+k]+values[b*size+k])*.5);
        if(name==='normal'||name==='tangent'){
          const norm=Math.hypot(...next.slice(0,3));if(norm>1e-12)for(let k=0;k<3;k++)next[k]/=norm;
          if(name==='tangent'&&size===4)next[3]=values[a*size+3];
        }
        values.push(...next);
      }
      midpoints.set(key,index);added++;if(closureOnly)closureVertices++;return index;
    }
    for(const [a,b,c,material] of section.triangles){
      if(!closureOnly&&Math.min(p[a][2],p[b][2],p[c][2])<roofMin){result.push([a,b,c,material]);continue;}
      const pending=[[a,b,c,0]];
      while(pending.length){
        const [a,b,c,depth]=pending.pop();maxDepth=Math.max(maxDepth,depth);let x=a,y=b,z=c;
        const ab=length2(p,a,b),bc=length2(p,b,c),ca=length2(p,c,a);
        const sab=closureOnly&&splits.has(edgeKey(p,a,b)),sbc=closureOnly&&splits.has(edgeKey(p,b,c)),sca=closureOnly&&splits.has(edgeKey(p,c,a));
        if(closureOnly?!(sab||sbc||sca):Math.max(ab,bc,ca)<=EXP_ROOF_REFINEMENT.maxEdgeCM**2){result.push([x,y,z,material]);continue;}
        if(depth>=20)throw new Error('EXP roof exceeded bounded subdivision depth');
        if(closureOnly?(!sab&&sbc):(bc>ab&&bc>=ca)){x=b;y=c;z=a;}
        else if(closureOnly?(!sab&&!sbc&&sca):(ca>ab&&ca>bc)){x=c;y=a;z=b;}
        if(!closureOnly)splits.add(edgeKey(p,x,y));
        const m=midpoint(x,y);pending.push([x,m,z,depth+1],[m,y,z,depth+1]);
      }
    }
    section.triangles=result;
  }
  for(const section of sections)refine(section);
  // Closing the entire body, including material seams and the band boundary,
  // avoids a finely split triangle meeting an unsplit neighboring edge.
  for(const section of sections)refine(section,true);
  let maxSelectedEdgeCM=0,unresolvedMarkedEdges=0;
  for(const section of sections){
    const {p,triangles,streams}=section;addedTriangles+=triangles.length-section.originalTriangles;
    for(const [a,b,c] of triangles){
      const selected=Math.min(p[a][2],p[b][2],p[c][2])>=roofMin;
      for(const [x,y] of [[a,b],[b,c],[c,a]]){
        if(splits.has(edgeKey(p,x,y)))unresolvedMarkedEdges++;
        if(selected)maxSelectedEdgeCM=Math.max(maxSelectedEdgeCM,Math.sqrt(length2(p,x,y)));
      }
    }
    for(const {size,values} of Object.values(streams))if(values.length!==p.length*size||values.some(v=>!Number.isFinite(v)))throw new Error('Invalid refined EXP roof attribute stream');
  }
  if(unresolvedMarkedEdges||maxSelectedEdgeCM>EXP_ROOF_REFINEMENT.maxEdgeCM+.001)throw new Error('EXP roof closure or edge-size check failed');
  // Commit only after every section and seam passed; failure leaves originals.
  for(const section of sections){
    const geometry=new T.BufferGeometry(),ids=[];
    for(const [name,{size,values}] of Object.entries(section.streams))geometry.setAttribute(name,new T.Float32BufferAttribute(values,size));
    let material=-1,start=0;
    for(const [a,b,c,nextMaterial] of section.triangles){
      if(nextMaterial!==material){if(ids.length>start)geometry.addGroup(start,ids.length-start,material);start=ids.length;material=nextMaterial;}
      ids.push(a,b,c);
    }
    if(ids.length>start)geometry.addGroup(start,ids.length-start,material);
    geometry.setIndex(ids);geometry.userData={...section.geometry.userData};
    geometry.computeBoundingBox();geometry.computeBoundingSphere();section.mesh.geometry=geometry;
  }
  const originals=new Set(sections.map(s=>s.geometry));for(const geometry of originals)geometry.dispose();
  return {...EXP_ROOF_REFINEMENT,offline:true,sourceVertices:sections.reduce((n,s)=>n+s.originalVertices,0),
    addedVertices:added,addedTriangles,closureVertices,maxDepth,maxSelectedEdgeCM,unresolvedMarkedEdges,meshSections:sections.length};
}
