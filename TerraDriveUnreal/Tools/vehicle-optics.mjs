// Native-only lamp inserts. Stationed facets give molded optics a highlight
// and real depth without adding a texture or another slot to an emitter.
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';

/** Map a square to the face of a shallow rounded lens, in body coordinates. */
export function opticFace([x,y,z],width,height,corner,crown,facing=-1) {
  const halfHeight=height/2,halfWidth=width/2;
  return (u,v,depth)=>{
    const vertical=(v*2-1)*halfHeight;
    const arc=Math.max(0,Math.abs(vertical)-(halfHeight-corner));
    const horizontal=(u*2-1)*(halfWidth-corner+Math.sqrt(Math.max(0,corner*corner-arc*arc)));
    const bow=crown*(1-(horizontal/halfWidth)**2)*(1-(vertical/halfHeight)**2);
    return [x+horizontal,y+vertical,z+facing*(bow+depth)];
  };
}

/** A sampled lens face with distinct prismatic sides and continuous UVs. */
export function moldedOptic(parent,material,name,sample,{
  cells=12, rows=8, relief=.0008, facing=-1, horizontal=false
}={}) {
  const position=[],index=[],uv=[];
  for(let facet=0;facet<cells*2;facet++){
    const a=facet/(cells*2), b=(facet+1)/(cells*2);
    const start=position.length/3;
    for(let j=0;j<=rows;j++){
      const along=j/rows;
      for(const [p,height] of [[a,facet%2],[b,1-facet%2]]){
        const u=horizontal?along:p, v=horizontal?p:along;
        // Fade the molded flutes to the case seat: the corner outline is
        // continuous even across the shared boundary of adjacent prisms.
        const edge=Math.min(1,along*12,(1-along)*12);
        position.push(...sample(u,v,height*relief*edge));
        uv.push(u,v);
      }
    }
    for(let j=0;j<rows;j++){
      const i=start+j*2;
      for(const [l,m,r] of [[i,i+1,i+2],[i+1,i+3,i+2]]){
        const ax=position[m*3]-position[l*3],ay=position[m*3+1]-position[l*3+1];
        const bx=position[r*3]-position[l*3],by=position[r*3+1]-position[l*3+1];
        if((ax*by-ay*bx)*facing>0)index.push(l,m,r);
        else index.push(l,r,m);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;
  parent.add(mesh);
  return mesh;
}

/** Reflector plastic has its own finish and never receives brake commands. */
export function passiveRuby(source) {
  const ruby=source.clone();
  ruby.color.set('#72131b');
  ruby.roughness=.28;
  ruby.emissiveIntensity=0;
  ruby.userData.nativeRole='';
  return ruby;
}
