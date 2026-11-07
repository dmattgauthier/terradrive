import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {QUARRY_TRAIL_POINTS} from './quarry-trail.mjs';
import {deepMudWeight} from './deep-mud.mjs';
import {inQuarry} from './offroad-courses.mjs';

// Native X/Y metres. Each control point belongs to the next signed sector.
const sectors = [
  ['West Rim', 'Follow the paired stakes across the rolling rim. Slow down for blind crests.',
    [[-328,-190],[-349,-269],[-300,-331],[-241,-305],[-202,-264]]],
  ['Copper Dunes', 'Keep steady momentum across the sand rollers and leave room to descend.',
    [[-169,-231],[-122,-194],[-75,-217],[-46,-280],[-3,-330],[50,-338]]],
  ['Slate Rim', 'Crawl through the quarry stones. Granite Trials branches off to the west.',
    QUARRY_TRAIL_POINTS],
  ['East Escarpment', 'Use a low gear on the rolling climb and stay inside the banked bends.',
    [[310,-147],[338,-94],[326,-29],[352,32],[328,92],[296,104],[268,132],[263,159],[277,190]]],
  ['Boreal Snow Basin', 'Stay between the stakes through the snow banks and packed lane.',
    [[301,226],[323,269],[302,294],[265,280],[241,252],[232,221],[207,196],[185,186]]],
  ['Summit Park', 'Crawl the balance lane. The full loop, jumps, staircase and hairpin branch off the park.',
    [[174,172],[148,151],[106,155],[62,157],[15,157],[-47,157],[-110,157],[-151,152],[-207,146]]],
  ['Northwest Rim and Tarmac Crossing', 'Follow the high meadow to the northwest rim, then descend to the tarmac.',
    [[-249,190],[-273,248],[-308,310],[-343,282],[-349,215],[-351,128],[-338,70],[-288,56],[-235,91],[-185,108],[-133,85]]],
  ['Pine Ridge', 'Ease over the offset earthen humps, then follow the wooded turn into the marsh.',
    [[-96,47],[-47,8],[-7,4],[35,16]]],
  ['Willow Marsh', 'Cross the shallow ford steadily. The soft outer banks can pull at the tires.',
    [[71,33],[112,31],[148,7],[154,-41]]],
  ['Granite Steps', 'Pick the broad bedrock line. Offset ledges work the suspension.',
    [[132,-80],[100,-109],[69,-128],[45,-118],[22,-105],[2,-107]]],
  ['Blackwater and Rutted Hollow', 'Air down for the bog and muddy exits. Keep the wheels turning without digging in.',
    [[-29,-82],[-57,-62],[-77,-51],[-104,-51],[-133,-51],[-162,-54],[-201,-78],[-253,-112],[-300,-148]]]
];

const {lerp, smoothstep, clamp} = T.MathUtils;
const cellSize = 16;
const reach = 10;
const asPoint = ([x,y]) => new T.Vector3(x,y,0);
const pack = p => [Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100)];

// Search only nearby segments, both for the 0.5 m terrain bake and the mask.
export function trailLookup(samples) {
  const buckets = new Map();
  const cell = value => Math.floor(value / cellSize);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const segment = {a,b,dx,dy,length};
    for (let x = cell(Math.min(a.x,b.x)-reach); x <= cell(Math.max(a.x,b.x)+reach); x++) {
      for (let y = cell(Math.min(a.y,b.y)-reach); y <= cell(Math.max(a.y,b.y)+reach); y++) {
        const key = x * 2048 + y;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(segment);
      }
    }
  }
  return (x,y) => {
    const candidates = buckets.get(cell(x) * 2048 + cell(y));
    if (!candidates) return null;
    let best = reach ** 2, result = null;
    for (const {a,b,dx,dy,length} of candidates) {
      const t = clamp(((x-a.x)*dx+(y-a.y)*dy)/(length*length), 0, 1);
      const ex = x-a.x-t*dx, ey = y-a.y-t*dy, square = ex*ex+ey*ey;
      if (square >= best) continue;
      best = square;
      result = {distance:Math.sqrt(square), side:(dx*ey-dy*ex)/length, d:lerp(a.d,b.d,t),
        grade:lerp(a.grade??a.z,b.grade??b.z,t), sector:t<.5?a.sector:b.sector};
    }
    return result;
  };
}

export function makePerimeterTrail(heightAt) {
  const controls = sectors.flatMap(([, ,points], sector) => points.map(p => ({point:asPoint(p),sector})));
  const curve = new T.CatmullRomCurve3(controls.map(c => c.point),true,'centripetal');
  const lengthM = curve.getLength();
  const count = Math.ceil(lengthM / 2);
  const samples = Array.from({length:count}, (_,i) => {
    const u=i/count, t=curve.getUtoTmapping(u), p=curve.getPoint(t), v=curve.getTangent(t).normalize();
    const sector=controls[Math.min(controls.length-1,Math.floor(t*controls.length))].sector;
    return {x:p.x,y:p.y,z:heightAt(p.x,p.y),tx:v.x,ty:v.y,d:u*lengthM,sector};
  });
  // Smooth the grade over roughly 44 ft, then blend with the original relief.
  const weights = [1,2,3,4,5,6,7,6,5,4,3,2,1];
  for (let i=0;i<count;i++) {
    samples[i].grade = weights.reduce((sum,w,j) => sum+w*samples[(i+j-6+count)%count].z,0)/49;
  }
  samples.push({...samples[0],d:lengthM});
  const locate=trailLookup(samples);
  function grade(x,y,original,surface,water) {
    const p=locate(x,y);
    if (!p || surface===1 || inQuarry(x,y,0) || (x>-204&&x<172&&y>141&&y<256) ||
        deepMudWeight(x,y)>.01 || water>.06) return original;
    const side=p.side, s=p.d, mask=1-smoothstep(p.distance,2.8,reach);
    const ripple=Math.sin(s*.23+Math.sin(s*.044));
    let shape=-.022*Math.abs(side)+.06*ripple;
    if (p.sector===1) shape+=.26*Math.sin(s*.30+side*.23)+.12*Math.sin(s*.53-side*.3);
    if (p.sector===0||p.sector===3) shape+=.34*Math.sin(s*.13)*Math.sin(s*.045)+side*.07*Math.sin(s*.19);
    if (p.sector===4) shape+=.33*smoothstep(Math.abs(side),2.6,5.4)*(.7+.3*Math.sin(s*.19));
    if (p.sector===7||p.sector===9) shape+=.31*Math.sin(s*.57)*Math.sin(side*.76)*(.65+.35*Math.cos(s*.19));
    const edge = .17*Math.exp(-((p.distance-4.6)**2)/2.6)*(.65+.35*Math.sin(s*.39));
    return original+mask*clamp(p.grade+shape+edge-original,-1.4,1.4);
  }
  return {samples,lengthM,locate,grade};
}

// Uses the existing terrain field. Keep its surface IDs and wet crossings;
// the new relief feeds the same triangles used for rendering and tire support.
export function addPerimeterTrail(world, field, baseHeight) {
  if (world.perimeterTrail) throw Error('Perimeter trail already baked. Start from a fresh base export.');
  const n=field.readUInt32LE(4), step=field.readFloatLE(8), origin=field.readFloatLE(12);
  const offset=(i,j)=>16+(i*n+j)*9;
  const index=v=>clamp(Math.round((v-origin)/step),0,n-1);
  const height=(x,y)=>field.readFloatLE(offset(index(x),index(y)));
  const route=makePerimeterTrail(baseHeight);
  const cut=new Float32Array(n*n);
  let changed=0;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const x=origin+i*step,y=origin+j*step;
    if(!route.locate(x,y))continue;
    const at=offset(i,j), h=baseHeight(x,y);
    const z=route.grade(x,y,h,field[at+8],field.readFloatLE(at+4));
    field.writeFloatLE(z,at);
    if(Math.abs(h-z)>.0001){cut[i*n+j]=z-h;changed++;}
  }

  const within=(p,r)=> (route.locate(p[0]/100,p[1]/100)?.distance??Infinity)<r;
  const shift=p=>{p[2]+=100*cut[index(p[0]/100)*n+index(p[1]/100)];return p;};
  function shiftQuarryMarker(p) {
    // Keep the authored embedment by sampling the cut on Slate Rim's
    // one-metre collision triangles, including between heightfield nodes.
    const x=p[0]/100, y=p[1]/100, ix=Math.floor(x), iy=Math.floor(y);
    const u=x-ix, v=y-iy;
    const delta=(x,y)=>cut[index(x)*n+index(y)];
    const a=delta(ix,iy), b=delta(ix+1,iy), c=delta(ix,iy+1), d=delta(ix+1,iy+1);
    const change=u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
    p[2]+=100*change;
  }
  const removedParts=new Map(), treeIds=new Set();
  world.trees=world.trees.filter(t=>{
    if(!within(t.p,4.25+t.radius/100)){shift(t.p);return true;}
    treeIds.add(t.id);
    for(const part of t.parts){
      if(!removedParts.has(part.group))removedParts.set(part.group,new Set());
      removedParts.get(part.group).add(part.index);
    }
    return false;
  });
  world.obstacles=world.obstacles.filter(o=>!treeIds.has(o.id));
  world.placements.forEach((g,i)=>{
    g.instances=g.instances.filter(p=>!removedParts.get(i)?.has(p.index)&&!(g.crushable&&within(p.p,2.9)));
    for(const p of g.instances)shift(p.p);
  });
  for(const g of [...world.nativeDetails,...world.fabScenery.groups]){
    if(g.asset==='native_deep_mud_water')continue;
    if(g.asset==='quarry_trail_stake'||g.asset==='quarry_trail_sign'){
      for(const p of g.instances)shiftQuarryMarker(p.p);
      continue;
    }
    g.instances=g.instances.filter(p=>{
      const scale=Math.max(...p.s);
      // Keep Slate Rim's deliberate low articulation stones.
      if(g.solid&&scale<=.30&&route.locate(p.p[0]/100,p.p[1]/100)?.sector===2)return true;
      return !within(p.p,g.solid?4.2+scale*1.5:2.85);
    });
    for(const p of g.instances)shift(p.p);
  }

  const samples=route.samples.map(p=>({...p,z:height(p.x,p.y)}));
  const gates=[], headings=[], gateNotes=[], stakes=[];
  const stride=10;
  for(let i=stride;i<samples.length+stride-1;i+=stride){
    const p=samples[Math.min(i,samples.length-1)], yaw=Math.atan2(p.ty,p.tx);
    gates.push(pack(p));
    headings.push(yaw*180/Math.PI);
    const [name,hint]=sectors[p.sector];
    gateNotes.push(name+' - '+hint);
    // Existing stakes are decorative here and stand beyond the gate line.
    for(const side of [-1,1]){
      const x=p.x-side*p.ty*3.75, y=p.y+side*p.tx*3.75;
      stakes.push({p:[x*100,y*100,height(x,y)*100],q:[0,0,Math.sin(yaw/2),Math.cos(yaw/2)],s:[1.25,1.25,1.35],color:[1,1,1]});
    }
  }
  const start=samples[0];
  world.nativeDetails.push({asset:'quarry_trail_stake',solid:false,crushable:false,surface:0,instances:stakes});
  world.routes.push({name:'Perimeter Expedition',hint:'Follow the paired stakes. Slow down for the signed terrain sectors.',zone:0,
    yaw:Math.atan2(start.ty,start.tx)*180/Math.PI,spawn:pack(start),gateWidth:7,gates,gateHeadings:headings,gateNotes});
  world.perimeterTrail={routeIndex:world.routes.length-1,lengthM:route.lengthM,widthM:6.4,changedHeightCells:changed,
    sectors:sectors.map(([name,hint])=>({name,hint})),samples:samples.map(({grade,...p})=>p)};
  return world.perimeterTrail;
}

export function perimeterMask(locate,x,y) {
  const p=locate(x,y);
  if(!p)return 0;
  const edge=.27*Math.sin(x*1.3+y*.51)+.17*Math.sin(x*.43-y*1.8);
  const lane=1-smoothstep(p.distance+edge,2.35,3.75);
  const tracks=.35+.65*Math.exp(-((Math.abs(p.side)-.95)**2)/.38);
  return Math.round(255*lane*tracks);
}
