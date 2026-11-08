// Shared visual-only quarry apron and baked lane mask. Collision/traction remain
// in terrain.bin, terrain-blend.bin and the original constructed trial meshes.
import {quarryBounds} from './offroad-courses.mjs';
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function graniteApron(x,y){
  const b=quarryBounds;
  const inside=Math.min(x-b.minX,b.maxX-x,y-b.minY,b.maxY-y);
  if(inside<=-9)return 0;
  const broken=1.5*Math.sin(x*.27+Math.sin(y*.16))+.85*Math.sin(y*.61-x*.34);
  const weather=.90+.10*Math.sin(x*.071+y*.093)*Math.sin(y*.12-x*.039);
  // The apron crosses the constructed mesh boundary, so both surfaces read
  // identical grass/stone cover there. Stone takes over farther up the bank.
  return smooth(-6,14,inside+broken)*weather;
}
export function quarryLaneMask(samples){
  // Exactly the former shader's every-sixth-point polyline. A bounded grid
  // avoids the segment search at every shaded ground pixel.
  const points=samples.filter((_,i)=>i%6===0),cells=new Map(),size=12,reach=4.5;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    if(!den)continue;
    const edge={a,dx,dy,den};
    for(let x=Math.floor((Math.min(a.x,b.x)-reach)/size);x<=Math.floor((Math.max(a.x,b.x)+reach)/size);x++)
      for(let y=Math.floor((Math.min(a.y,b.y)-reach)/size);y<=Math.floor((Math.max(a.y,b.y)+reach)/size);y++){
        const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(edge);
      }
  }
  return (x,y)=>{
    const edges=cells.get(Math.floor(x/size)+','+Math.floor(y/size));if(!edges)return 0;
    let distance2=Infinity;
    for(const {a,dx,dy,den}of edges){const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/den);
      distance2=Math.min(distance2,(x-a.x-t*dx)**2+(y-a.y-t*dy)**2);}
    return 1-smooth(2.25,3.8,Math.sqrt(distance2));
  };
}
export function graniteVisualRock(physicalDirt,slate,apron){
  return Math.round(physicalDirt*Math.max(slate?.rock??0,apron));
}
