// Native-only additions. The supplied browser source remains read-only.
import * as THREE from '../../TerraDrive-v1.13/dist/vendor/three.module.js';

// A bounded quarry pad away from the original park, dunes and snow region.
export const quarryBounds = {minX:100,maxX:250,minY:-300,maxY:-175};
export const inQuarry = (x,y,margin=4)=>x>100-margin&&x<250+margin&&y>-300-margin&&y<-175+margin;
const nativeToSource=(x,y,z)=>[-y,z,x];
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};

export function buildRockCourses(terrain) {
  const group=new THREE.Group(), routes=[];
  const rock=new THREE.MeshStandardMaterial({color:'#8c8981',roughness:.96});
  const texture=new THREE.Texture();texture.userData.source='mossy_rock_diff_1k.jpg';rock.map=texture;
  const orange=new THREE.MeshStandardMaterial({color:'#ef942f',roughness:.7});
  const blue=new THREE.MeshStandardMaterial({color:'#438da0',roughness:.7});
  let base=0;
  for(let x=100;x<=250;x+=10)for(let y=-300;y<=-175;y+=10)base=Math.max(base,terrain.heightAt(-y,x));
  base+=.45;
  function meshGrid(name,x0,x1,y0,y1,step,height) {
    const nx=Math.ceil((x1-x0)/step),ny=Math.ceil((y1-y0)/step),p=[],uv=[],indices=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const x=lerp(x0,x1,i/nx),y=lerp(y0,y1,j/ny);
      p.push(...nativeToSource(x,y,height(x,y)));uv.push(x/3,y/3);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
      // Native-to-source is a reflection; these are upward-facing source triangles.
      indices.push(a,c,b,b,c,d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    const m=new THREE.Mesh(g,rock);m.name=name;group.add(m);return m;
  }
  // The approaches meet the original terrain continuously. No floating floor.
  meshGrid('quarry-approach',100,250,-300,-175,2,(x,y)=>{
    const edge=Math.min((x-100)/15,(250-x)/15,(y+300)/12,(-175-y)/12);
    return lerp(terrain.heightAt(-y,x),base,smooth(edge));
  });
  const profile=(stations,x)=>{
    for(let i=1;i<stations.length;i++)if(x<=stations[i][0]){
      const a=stations[i-1],b=stations[i];return lerp(a[1],b[1],Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0]))));
    }return stations.at(-1)[1];
  };
  const definitions=[
    {id:'axlebreaker',name:'Axlebreaker ledges',y:-281,stations:[[124,0],[132,0],[149,8.5],[156,8.5],[184,0],[222,0]],
      hint:'4WD + low range. Rear lock, then front lock if a wheel lifts. Crawl with Shift+W.',kind:0,gateX:[131,141,152,185]},
    {id:'staircase',name:'Granite staircase',y:-253,stations:[[124,0],[133,0],[154,13.2],[162,13.2],[187,0],[222,0]],
      hint:'Steep ledges: low range, both locks and a straight approach. Avoid wheelspin at the crest.',kind:1,gateX:[132,143,157,190]},
    {id:'offcamber',name:'Off-camber ridge',y:-225,stations:[[124,0],[135,2],[160,5],[180,5],[202,0],[222,0]],
      hint:'Pick the uphill line. Gentle throttle; unlock the front axle for a tight turn.',kind:2,gateX:[134,153,177,206]},
    {id:'descent',name:'Brake-control descent',y:-197,stations:[[124,0],[167,15],[175,15],[200,0],[222,0]],
      hint:'Start at the summit. Low range / K descent assist, straight wheels and measured braking.',kind:3,gateX:[176,184,195,215]}
  ];
  for(const d of definitions){
    const h=(x,y)=>{
      const lateral=y-d.y,shoulder=1-smooth((Math.abs(lateral)-3.1)/2.4);
      let rise=profile(d.stations,x);
      const active=smooth((x-133)/2)*(1-smooth((x-154)/2));
      if(d.kind===0)rise+=active*.90*Math.sin((x-133)*1.3)*Math.max(-1,Math.min(1,lateral/1.1));
      if(d.kind===1)rise+=active*.34*Math.sin((x-134)*2.1);
      if(d.kind===2)rise+=Math.min(1,smooth((x-134)/8)*(1-smooth((x-189)/8)))*lateral*.34;
      const chips=.055*Math.sin(x*5.1+y*2.7)*Math.sin(x*1.8-y*4.4)*smooth(rise);
      return base+.025+Math.max(0,rise+chips)*shoulder;
    };
    meshGrid(d.id,124,225,d.y-5.5,d.y+5.5,.35,h);
    const spawnX=d.kind===3?171:126;
    const gates=d.gateX.map(x=>[x*100,d.y*100,h(x,d.y)*100]);
    routes.push({name:d.name,hint:d.hint,zone:8,yaw:0,spawn:[spawnX*100,d.y*100,h(spawnX,d.y)*100],gateWidth:5.5,gates});
    for(const [i,g] of gates.entries())for(const side of [-1,1]){
      const x=g[0]/100,y=d.y+side*2.75,z=h(x,y);
      const m=new THREE.Mesh(new THREE.CylinderGeometry(.10,.16,1.5,8),side<0?orange:blue);
      m.position.set(...nativeToSource(x,y,z+.75));group.add(m);
    }
  }
  return {group,routes,base,zone:{id:'rock-trials',name:'Granite Trials Arena',spawn:{x:281,z:126}}};
}

// Use only exposed surfaces of the browser's collision prisms. Internal prism
// walls must not become invisible obstacles inside a smooth loop deck.
export function challengeCollisionMesh(course) {
  const p=[];
  for(const t of course.triangles)p.push(t.a.x,t.a.y,t.a.z,t.b.x,t.b.y,t.b.z,t.c.x,t.c.y,t.c.z);
  for(const group of course.colliderGroups)for(const shape of group.shapes){
    if(shape.kind!=='convex')continue;
    const v=shape.vertices.map(p=>({x:p.x+shape.offset.x+group.center.x,y:p.y+shape.offset.y+group.center.y,z:p.z+shape.offset.z+group.center.z}));
    for(const fi of shape.exposedFaces??[]){if(fi===0)continue;const f=shape.faces[fi];for(let j=1;j<f.length-1;j++)for(const k of [f[0],f[j],f[j+1]])p.push(v[k].x,v[k].y,v[k].z);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();
  const root=new THREE.Group();root.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#777777'})));
  for(const b of course.boxes){const m=new THREE.Mesh(new THREE.BoxGeometry(b.size.x,b.size.y,b.size.z),new THREE.MeshStandardMaterial({color:'#777777'}));m.position.set(b.center.x,b.center.y,b.center.z);m.quaternion.set(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w);root.add(m);}
  return root;
}
