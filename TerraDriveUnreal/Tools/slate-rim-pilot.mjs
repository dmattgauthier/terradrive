// Slate Rim art pilot. Distances are in metres along the existing route.
// The elevations, physical surfaces, route and driveable articulation stones
// stay intact. Closed scan meshes form the visible banks and their colliders.
const start=8, end=130;
const beds=[
  {from:9,to:34,side:-1,offset:8.4},
  {from:40,to:67,side:-1,offset:9.1},
  {from:74,to:104,side:-1,offset:8.7},
  {from:111,to:129,side:1,offset:8.8},
];
const stones=[0,1,2,4,6,8,9,10,12,14,16,17];
const mix=(a,b,t)=>a+(b-a)*t;
const saturate=x=>Math.min(1,Math.max(0,x));
const smooth=(a,b,x)=>{const t=saturate((x-a)/(b-a));return t*t*(3-2*t);};
const pulse=(a,b,x,feather)=>smooth(a,a+feather,x)*(1-smooth(b-feather,b,x));
const random=(i,s)=>{const f=Math.sin(i*127.1+s*311.7)*43758.5453;return f-Math.floor(f);};
const beddingOffset=(bed,d)=>bed.offset+.64*Math.sin(d*.32)+.36*Math.sin(d*.79+1.2);

function segments(samples){
  return samples.slice(1).map((b,i)=>{
    const a=samples[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    return {a,b,dx,dy,length};
  }).filter(s=>s.length>0);
}

function nearest(edges,x,y){
  let best=null,closest=Infinity;
  for(const {a,b,dx,dy,length} of edges){
    const t=saturate(((x-a.x)*dx+(y-a.y)*dy)/(length*length));
    const ex=x-a.x-t*dx,ey=y-a.y-t*dy,distance2=ex*ex+ey*ey;
    if(distance2>=closest)continue;
    closest=distance2;
    best={d:mix(a.d,b.d,t),side:(dx*ey-dy*ex)/length,distance:Math.sqrt(distance2)};
  }
  return best;
}

export function slateRimCoverage(samples){
  const local=samples.filter(p=>p.d>=start-4&&p.d<=end+4),edges=segments(local);
  if(!edges.length)throw Error('Slate Rim pilot requires the complete quarry trail');
  const xmin=Math.min(...local.map(p=>p.x))-18,xmax=Math.max(...local.map(p=>p.x))+18;
  const ymin=Math.min(...local.map(p=>p.y))-18,ymax=Math.max(...local.map(p=>p.y))+18;
  return (x,y)=>{
    if(x<xmin||x>xmax||y<ymin||y>ymax)return null;
    const p=nearest(edges,x,y);
    if(p.d<=start||p.d>=end||p.distance>=18)return null;
    const weight=pulse(start,end,p.d,5);
    const offset=Math.abs(p.side);
    let shelf=0,fan=0;
    for(const bed of beds){
      const band=pulse(bed.from,bed.to,p.d,3);
      if(!band||Math.sign(p.side)!==bed.side)continue;
      const lip=beddingOffset(bed,p.d);
      shelf=Math.max(shelf,band*(1-smooth(1.6,4.8,Math.abs(offset-lip-1.6))));
      const tributary=.54+.27*Math.sin(p.d*1.11+offset*.72)+.19*Math.sin(p.d*.46-offset*1.31);
      fan=Math.max(fan,band*smooth(3.8,5.2,offset)*(1-smooth(12.2,16,offset))*tributary);
    }
    // Stony wash pockets carry material downslope between the exposed ledges.
    // Their appearance never changes the physical dirt at the tire line.
    const rills=Math.pow(.5+.5*Math.sin(p.d*.49-offset*.66+1.1*Math.sin(offset*.34)),5);
    const drainage=rills*smooth(3.8,5.1,offset)*(1-smooth(13,17,offset));
    const shoulder=smooth(3.55,5.2,offset)*(1-smooth(12.8,17.4,offset));
    return {
      ...p,shelf,fan,weight,
      rock:weight*saturate(shoulder*.31+shelf*.54+fan*.33+drainage*.27),
      wornLane:1-weight*.55*(1-smooth(1.9,3.8,offset)),
    };
  };
}

function terrainHeight(field){
  const n=field.readUInt32LE(4),step=field.readFloatLE(8),origin=field.readFloatLE(12);
  const index=v=>Math.max(0,Math.min(n-1,Math.round((v-origin)/step)));
  return (x,y)=>field.readFloatLE(16+(index(x)*n+index(y))*9);
}

function anchor(samples,d,offset){
  const i=samples.findIndex(p=>p.d>=d);
  if(i<1)throw Error('Slate Rim art anchor outside its route');
  const a=samples[i-1],b=samples[i],t=(d-a.d)/(b.d-a.d);
  const dx=mix(a.tx,b.tx,t),dy=mix(a.ty,b.ty,t),scale=1/Math.hypot(dx,dy);
  return {x:mix(a.x,b.x,t)-dy*scale*offset,y:mix(a.y,b.y,t)+dx*scale*offset,yaw:Math.atan2(dy,dx)};
}

export function slateRimRouteClearance(world){
  // Preserve both spline alignments rather than treating the gates as the
  // centreline. Other courses retain their authored gate widths.
  const quarry=segments(world.quarryTrail.samples);
  const perimeter=segments(world.perimeterTrail.samples);
  const others=world.routes.filter((_,i)=>i!==world.quarryTrail.routeIndex&&i!==world.perimeterTrail.routeIndex)
    .map(r=>({edges:segments([r.spawn,...r.gates].map(([x,y],i)=>({x:x/100,y:y/100,d:i}))),margin:Math.max(4.1,r.gateWidth/2)}));
  return (x,y)=>{
    let available=Math.min(nearest(quarry,x,y).distance,nearest(perimeter,x,y).distance)-4.1;
    for(const r of others){
      const point=nearest(r.edges,x,y);
      if(point)available=Math.min(available,point.distance-r.margin);
    }
    return available;
  };
}

// Selected native scan meshes are at most 2.06 m across and 1.35 m tall.
// Include the full height in the XY clearance bound because Unreal tilts
// each instance to the ground. Asset bounds are also checked by the fixture.
export const slateRimStoneRadius=([x,y,z])=>Math.hypot(1.03*x,1.03*y,1.35*z);

export function applySlateRimPilot(world,field){
  if(world.slateRimPilot?.version===1)return world.slateRimPilot;
  if(world.slateRimPilot)throw Error('Regenerate the base export for this Slate Rim pilot version');
  const samples=world.quarryTrail.samples, coverage=slateRimCoverage(samples);
  const clear=slateRimRouteClearance(world),height=terrainHeight(field);
  const native=world.nativeDetails, dry=stones.map(i=>native.find(g=>g.asset==='scan_native_boulder_'+String(i).padStart(2,'0')));
  const grasses=native.filter(g=>/^scan_grass_medium_01_(3|4|5|11|12|13|14|15|16)$/.test(g.asset));
  if(dry.some(g=>!g?.solid||!g.snapBoulder)||grasses.length!==9)throw Error('Slate Rim scan groups are incomplete');
  const counts={shelves:0,scree:0,grass:0,retiredScatter:0};

  // Break the broad scatter distribution only inside the pilot. Keep the
  // existing rough-wheel-line stones and all other scenery components.
  for(const group of native){
    const rock=group.snapBoulder&&/^scan_native_boulder_/.test(group.asset);
    const grass=grasses.includes(group);
    if(!rock&&!grass)continue;
    group.instances=group.instances.filter(instance=>{
      const x=instance.p[0]/100,y=instance.p[1]/100,p=coverage(x,y);
      const stoneClearance=rock?Math.max(1.55,slateRimStoneRadius(instance.s)+.15):0;
      const selected=p&&Math.abs(p.side)>5.65&&
        (rock?clear(x,y)>stoneClearance&&p.rock>.21:p.shelf>.23||p.fan>.48);
      if(selected)counts.retiredScatter++;
      return !selected;
    });
  }

  let minClearance=Infinity;
  const shelves=[];
  function put(group,point,scale,kind,yaw,color){
    const room=kind==='grass'?Infinity:clear(point.x,point.y)-slateRimStoneRadius(scale);
    if(room<.15)return false;
    const z=height(point.x,point.y);
    group.instances.push({p:[point.x*100,point.y*100,z*100],
      q:[0,0,Math.sin(yaw/2),Math.cos(yaw/2)],s:scale,color,slateRimPilot:kind});
    minClearance=Math.min(minClearance,room);
    counts[kind]++;
    if(kind==='shelves')shelves.push(point);
    return true;
  }

  // Adjacent flat blocks share a strike. The rear bench steps back into the
  // bank and its breaks form the heads of the visible debris fans.
  for(const [b,bed] of beds.entries()){
    for(let d=bed.from+1,i=0;d<bed.to;d+=2.9+random(i++,b+10)*1.1){
      const n=b*31+i, offset=beddingOffset(bed,d);
      const point=anchor(samples,d,bed.side*offset);
      const scale=[1.05+random(n,1)*.55,1.72+random(n,2)*.53,.85+random(n,3)*.45];
      const stone=dry[(n*7+b)%dry.length];
      put(stone,point,scale,'shelves',point.yaw-Math.PI/2+.09*(random(n,4)-.5),[.72,.76,.81]);
      if(i%3!==1&&d+1.3<bed.to){
        const high=anchor(samples,d+1.3,bed.side*(offset+3.5));
        if(height(high.x,high.y)>height(point.x,point.y)+.45)
          put(dry[(n*7+b+4)%dry.length],high,[1.4,1.94,.86],'shelves',high.yaw-Math.PI/2,[.76,.78,.81]);
      }
    }
    for(let i=0;i<34;i++){
      const n=b*37+i, d=mix(bed.from+1,bed.to-1,random(n,10));
      const across=random(n,11), offset=beddingOffset(bed,d), point=anchor(samples,d,bed.side*mix(5.55,offset+1.4,across));
      const size=mix(.12,.52,Math.pow(across,.67))*mix(.73,1.14,random(n,12));
      const p=coverage(point.x,point.y);
      if(!p||p.fan<.22||shelves.some(s=>Math.hypot(s.x-point.x,s.y-point.y)<1.55))continue;
      put(dry[(n*5+b)%dry.length],point,[size*.74,size,size*.62],'scree',point.yaw+mix(-.8,.8,random(n,13)),[.77,.79,.81]);
    }
  }
  // Clump the vegetation in sheltered joints and pockets beyond the toe.
  for(const [b,bed] of beds.entries())for(let i=0;i<32;i++){
    const n=b*32+i,cluster=i%4,d=bed.from+(bed.to-bed.from)*(.15+.23*cluster)+mix(-1.55,1.55,random(n,20));
    const offset=bed.offset+(cluster%2?4.6:-2.7)+mix(-.9,.9,random(n,21)),point=anchor(samples,d,bed.side*offset);
    if(clear(point.x,point.y)<.65||shelves.some(s=>Math.hypot(s.x-point.x,s.y-point.y)<2.1))continue;
    const size=.47+random(n,22)*.59;
    put(grasses[n%grasses.length],point,[size,size,size*.79],'grass',random(n,23)*Math.PI*2,[.78,.79,.64]);
  }
  if(!Number.isFinite(minClearance)||counts.shelves<25||counts.scree<20)throw Error('Slate Rim pilot did not fit the authored corridor');
  world.slateRimPilot={version:1,startM:start,endM:end,counts,
    minimumClearanceM:+minClearance.toFixed(3),visualCoverage:true};
  return world.slateRimPilot;
}
