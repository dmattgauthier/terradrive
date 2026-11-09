// Original contemporary Grave Digger interpretation from Monster Jam photographs.
// Official class dimensions and tires anchor scale; chassis/body stations are estimates.
import {T,mesh,box,surface,mappedPolygon,line,curve,lerp,station,roundedContour,panelReturn,newReferenceView,finishMaterial,rod,cylinder,ring,label,pane,rimBarrel,refineReferenceWheel} from './reference-vehicle-kit.mjs';
export const GRAVE_DIGGER_SPEC={id:'grave-digger',name:'Grave Digger',brand:'Monster Jam',year:2024,trim:'Supercharged methanol V8 / tube chassis / 66-inch tires',bodyStyle:'monster',monsterTruck:1,droopTravel:.42,wheelInertia:48,color:'#111518',powertrain:'combustion',fuelCapacityGallons:30,bodyWidthM:2.0,powerHP:1500,torqueNm:2000,torqueLbFt:2000/1.3558179483,mass:12000*.45359237,curbMass:12000*.45359237,length:17*.3048,width:12.5*.3048,height:10.5*.3048,wheelbase:3.50,track:2.72,trackFront:2.72,trackRear:2.72,frontWeightFraction:.5,cgHeight:1.45,clearance:.65,tireSize:'66X43R25',tireRadius:66*.0254/2,tireWidth:43*.0254,rearTireWidth:43*.0254,tireType:'mud-terrain',rimDiameterInches:25,stockPSI:23,stockPSIFront:23,stockPSIRear:23,transmissionType:'automatic',transmissionName:'Two-speed racing automatic',gears:[1.8,1],reverseRatio:1.8,finalDrive:12,lowRatio:1,defaultMode:'4H',driveModes:['4H'],frontTorqueFraction:.5,dragCoefficient:.70,topSpeedMPH:75,features:{frontLocker:true,rearLocker:true,swayDisconnect:false,tractionControl:false,abs:false,hillDescent:false},engine:{idleRPM:1200,redlineRPM:8500,peakTorqueRPM:5000,peakPowerRPM:7500,curve:[[1200,550],[2500,1250],[4000,1800],[5000,2000],[6500,1820],[7500,1424.2],[8500,1050]],curveStatus:'Simulator curve through representative 1500 hp class output, not a measured Grave Digger dyno'},suspension:{travel:.762,droopTravel:.42,restLength:.94,springRate:105000,damping:12000,antiRoll:14000,frontType:'four-link solid axle with nitrogen shocks',rearType:'four-link solid axle with nitrogen shocks',parameterStatus:'Official class 30-inch travel; estimated spring/damper calibration'},notes:['Reference reconstruction of the modern black/green 1951 Chevy-panel-wagon-inspired body with exposed green tube cage, rear engine and red headlights.','Official class approximate envelope, 12000-pound mass, 1500 hp, 66x43-inch tires and 30-inch travel. Exact chassis number, wheelbase, track, CG, torque, fuel capacity and gearing are estimates.','Stock 66-inch monster tires are retained; the passenger/off-road 50-inch conversion limit does not shrink this truck. Independent rear-steer control is simplified to speed-sensitive coordinated rear steering.'],sources:['https://www.monsterjam.com/en-us/truck/grave-digger/','https://www.monsterjam.com/en-gb/monster-jam-101/']};
const tailZ=-2.24;
const roofFront=.16;
const cowlZ=.68;
const noseZ=2.39;
const gauss=(x,center,width)=>Math.exp(-(((x-center)/width)**2));
const mix=(a,b,t)=>a.map((value,axis)=>lerp(value,b[axis],t));

export const GRAVE_DIGGER_LANDMARKS={
  overallLength:5.1816,overallWidth:3.81,height:3.2004,wheelbase:3.50,
  tireDiameter:1.6764,tireWidth:1.0922,bodyFrontZ:noseZ,bodyRearZ:tailZ,
  bodyWidth:1.98,estimated:true
};

// Black-and-green 2024 fiberglass shell. The lower rear edge follows the
// tire cutout, while the roof rounds down and in toward the open tail.
const roofStations=[
  [tailZ,.823,3.033],[-2.10,.903,3.117],[-1.70,.944,3.169],
  [-.85,.941,3.190],[-.36,.915,3.195],[.03,.858,3.161],[roofFront,.825,3.104]
];
const rockerStations=[
  [tailZ,2.235],[-2.01,2.186],[-1.67,2.348],[-1.39,2.209],
  [-1.13,1.985],[-.68,1.907],[.11,1.910],[.45,1.973],[cowlZ,2.091]
];
const sideWindow=roundedContour([[-.523,2.515],[.527,2.505],[.121,2.904],[-.493,2.990]],.049,9);
const low=z=>station(rockerStations,z,1);
const top=z=>z<=roofFront?station(roofStations,z,2)-.157:
  lerp(roofStations.at(-1)[2]-.157,2.467,(z-roofFront)/(cowlZ-roofFront));
const sideWidthStations=[...roofStations,[cowlZ,.765,2.624]];
const width=z=>station(sideWidthStations,z,1);

function roofPoint(u,z) {
  const a=(2*u-1)*Math.PI/2;
  return [Math.sin(a)*width(z),station(roofStations,z,2)-.157*(1-Math.cos(a)),z];
}

export function graveSidePaintBase(side,z,y) {
  const t=(y-low(z))/(top(z)-low(z));
  const bulge=.029*Math.sin(Math.PI*t)-.042*(1-t)**2;
  return [side*(width(z)+bulge),y,z];
}

const hoodStations=[
  [cowlZ,.765,2.473,.118],[.94,.725,2.456,.158],
  [1.45,.662,2.417,.182],[1.98,.593,2.346,.175],
  [2.26,.532,2.266,.147],[noseZ,.492,2.142,.078]
];

export function graveHoodPaintBase(x,z) {
  const width=station(hoodStations,z,1);
  const u=x/width;
  const crown=station(hoodStations,z,3)*(1-u*u);
  const corner=.066*u*u*T.MathUtils.smoothstep(z,1.70,noseZ);
  return [x,station(hoodStations,z,2)+crown,z-corner];
}

function hoodPoint(u,z) {
  return graveHoodPaintBase((2*u-1)*station(hoodStations,z,1),z);
}

const fenderStations=[
  [.58,.712,.871,2.422,2.154],[.92,.675,.959,2.417,2.201],
  [1.31,.642,.987,2.425,2.244],[1.73,.595,1.000,2.411,2.226],
  [2.12,.543,.987,2.351,2.181],[2.384,.500,.909,2.232,2.079]
];
function fenderPoint(side,u,t) {
  const z=lerp(fenderStations[0][0],fenderStations.at(-1)[0],u);
  const a=t*Math.PI/2;
  const inner=station(fenderStations,z,1),outer=station(fenderStations,z,2);
  return [
    side*lerp(inner,outer,Math.sin(a)),
    lerp(station(fenderStations,z,4),station(fenderStations,z,3),Math.cos(a)),
    z-.058*t*t*T.MathUtils.smoothstep(z,1.79,noseZ)
  ];
}


function cleanContour(points){const p=points.filter((q,i)=>!i||Math.hypot(q[0]-points[i-1][0],q[1]-points[i-1][1])>1e-8);if(p.length>2&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<1e-8)p.pop();return p;}
function paintNormal(base,u,v,flip){const e=.00001,du=new T.Vector3(...base(u+e,v)).sub(new T.Vector3(...base(u-e,v))),dv=new T.Vector3(...base(u,v+e)).sub(new T.Vector3(...base(u,v-e)));return du.cross(dv).normalize().multiplyScalar(flip?-1:1);}
function paintPatch(g,material,outline,base,flip,name,layer=0){
 // Paint follows the very same panel surface and normal. A 0.8 mm base
 // offset (0.2 mm between ink layers) replaces centimetre-thick tubes.
 const offset=.0008+layer*.0002,map=(u,v)=>new T.Vector3(...base(u,v)).addScaledVector(paintNormal(base,u,v,flip),offset).toArray();
 const o=mappedPolygon(g,material,cleanContour(outline),map,[],flip,12);o.name='grave-painted-'+name;o.castShadow=false;
 o.userData.gravePaint={base,offset,flip};return o;
}
function smoothPath(points,steps=32,closed=false){const c=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p[0],p[1],0)),closed,'centripetal');return Array.from({length:steps+(closed?0:1)},(_,i)=>{const p=c.getPoint(i/steps);return[p.x,p.y];});}
const triangleArea=([a,b,c])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

function clipPaintOpening(artwork,opening) {
  const geometry=artwork.geometry;
  const {index,attributes:{uv}}=geometry;
  const points=Array.from({length:uv.count},(_,i)=>[uv.getX(i),uv.getY(i)]);
  const winding=Math.sign(T.ShapeUtils.area(opening.map(p=>new T.Vector2(...p))));
  const edges=opening.map(([x,y],i)=>{
    const [nextX,nextY]=opening[(i+1)%opening.length];
    const length=Math.hypot(nextX-x,nextY-y);
    // Leave a 2 mm margin for the paint's outward normal offset.
    return ([px,py])=>winding*((nextX-x)*(py-y)-(nextY-y)*(px-x))/length+.002;
  });
  const keptPoints=[],keptIndices=[],pointIds=new Map();
  let trimmed=false;
  const emit=triangle=>{
    if(Math.abs(triangleArea(triangle))<1e-12)return;
    for(const point of triangle){
      if(!pointIds.has(point)){
        pointIds.set(point,keptPoints.length);
        keptPoints.push(point);
      }
      keptIndices.push(pointIds.get(point));
    }
  };
  for(let i=0;i<index.count;i+=3) {
    let inside=[points[index.getX(i)],points[index.getX(i+1)],points[index.getX(i+2)]];
    if(edges.some(distance=>inside.every(point=>distance(point)<=0))){
      emit(inside);
      continue;
    }
    trimmed=true;
    // The aperture is convex. Keep the part outside each edge and pass
    // only the remainder to the next edge. The final remainder is the hole.
    for(const distance of edges) {
      if(inside.length<3)break;
      const next=[],outside=[];
      let previous=inside.at(-1),previousDistance=distance(previous);
      for(const point of inside) {
        const currentDistance=distance(point);
        if((previousDistance<0)!==(currentDistance<0)){
          const crossing=mix(previous,point,previousDistance/(previousDistance-currentDistance));
          next.push(crossing);
          outside.push(crossing);
        }
        (currentDistance<0?outside:next).push(point);
        previous=point;
        previousDistance=currentDistance;
      }
      for(let j=1;j+1<outside.length;j++)emit([outside[0],outside[j],outside[j+1]]);
      inside=next;
    }
  }
  if(!trimmed)return;
  const {base,offset,flip}=artwork.userData.gravePaint;
  const positions=[],normals=[];
  for(const point of keptPoints) {
    const normal=paintNormal(base,...point,flip);
    positions.push(...new T.Vector3(...base(...point)).addScaledVector(normal,offset).toArray());
    normals.push(...normal.toArray());
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(keptPoints.flat(),2));
  geometry.setIndex(keptIndices);
}

function paintStroke(g,m,points,width,base,flip,name,layer=0){
 // A conforming ribbon grid avoids the long, near-collinear ear triangles
 // produced by triangulating a thin curved outline as one large polygon.
 const rows=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.014));for(let j=0;j<steps;j++)rows.push({q:a.map((v,k)=>lerp(v,b[k],j/steps)),t:(i+j/steps)/(points.length-1)});}rows.push({q:points.at(-1),t:1});
 const widest=Math.max(...rows.map(row=>typeof width==='function'?width(row.t):width)),columns=Math.max(1,Math.ceil(widest/.018)),stride=columns+1;
 const offset=.0008+layer*.0002,p=[],n=[],uv=[],ix=[];
 for(let i=0;i<rows.length;i++){const a=rows[Math.max(0,i-1)].q,b=rows[Math.min(rows.length-1,i+1)].q,d=Math.hypot(b[0]-a[0],b[1]-a[1]),r=(typeof width==='function'?width(rows[i].t):width)*.5;
  for(let column=0;column<=columns;column++){const side=lerp(-1,1,column/columns),q=[rows[i].q[0]-side*(b[1]-a[1])/d*r,rows[i].q[1]+side*(b[0]-a[0])/d*r],normal=paintNormal(base,...q,flip),v=new T.Vector3(...base(...q)).addScaledVector(normal,offset);p.push(...v.toArray());n.push(...normal.toArray());uv.push(...q);}
 }
 for(let i=0;i<rows.length-1;i++)for(let column=0;column<columns;column++)for(const ids of [[i*stride+column,i*stride+column+1,(i+1)*stride+column],[i*stride+column+1,(i+1)*stride+column+1,(i+1)*stride+column]]){const det=triangleArea(ids.map(j=>uv.slice(j*2,j*2+2)));if(Math.abs(det)<1e-12)continue;if((det>0)===flip)[ids[1],ids[2]]=[ids[2],ids[1]];ix.push(...ids);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(n,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);
 const o=mesh(g,geo,m);o.name='grave-painted-'+name;o.castShadow=false;o.userData.gravePaint={base,offset,flip};return o;
}
const titleGlyphs={
 A:[[[0,0],[.5,1],[1,0]],[[.23,.43],[.77,.43]]],D:[[[0,0],[0,1],[.62,1],[1,.75],[1,.25],[.62,0],[0,0]]],
 E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.52],[.78,.52]]],G:[[[1,.82],[.8,1],[.2,1],[0,.75],[0,.25],[.2,0],[1,0],[1,.48],[.57,.48]]],
 I:[[[.5,0],[.5,1]]],R:[[[0,0],[0,1],[.75,1],[1,.78],[.75,.55],[0,.55]],[[.50,.55],[1,0]]],V:[[[0,1],[.5,0],[1,1]]]
};

// Curved strips and disks have a regular parameter domain. Sampling that
// domain keeps vertices on the shell without subdividing long polygon ears.
function paintGrid(g,material,base,flip,name,layer,columns,rows,domain) {
  const offset=.0008+layer*.0002;
  const coordinates=[],positions=[],normals=[],indices=[];
  for(let row=0;row<=rows;row++) {
    for(let column=0;column<=columns;column++) {
      const point=domain(column/columns,row/rows);
      const normal=paintNormal(base,...point,flip);
      const position=new T.Vector3(...base(...point)).addScaledVector(normal,offset);
      coordinates.push(point);
      positions.push(...position.toArray());
      normals.push(...normal.toArray());
    }
  }
  const triangle=(a,b,c)=>{
    const p=coordinates[a],q=coordinates[b],r=coordinates[c];
    const area=(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    if(Math.abs(area)<1e-12)return;
    indices.push(a,...((area>0)!==flip?[b,c]:[c,b]));
  };
  const stride=columns+1;
  for(let row=0;row<rows;row++) {
    for(let column=0;column<columns;column++) {
      const a=row*stride+column,b=a+1,c=a+stride,d=c+1;
      triangle(a,b,c);
      triangle(b,d,c);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(coordinates.flat(),2));
  geometry.setIndex(indices);
  const artwork=mesh(g,geometry,material);
  artwork.name='grave-painted-'+name;
  artwork.castShadow=false;
  artwork.userData.gravePaint={base,offset,flip};
  return artwork;
}
function paintWords(g,inks,text,project,base,flip) {
  for(const [material,width,layer] of inks) {
    for(const [i,letter] of [...text].entries()) {
      for(const path of titleGlyphs[letter]||[]) {
        const points=path.map(([x,y])=>project(i,x,y));
        for(let segment=1;segment<points.length;segment++) {
          const a=points[segment-1],b=points[segment];
          const extension=Math.min(.37,width*.37/Math.hypot(b[0]-a[0],b[1]-a[1]));
          const start=mix(a,b,segment>1?-extension:0);
          const end=mix(a,b,segment<points.length-1?1+extension:1);
          paintStroke(g,material,[start,end],width,base,flip,'wordmark',layer);
        }
      }
    }
  }
}

function paintSkull(g,inks,base,flip,place) {
  const patch=(material,points,name,layer)=>paintPatch(g,material,
    smoothPath(points,Math.max(24,points.length*5),true).map(p=>place(...p)),base,flip,name,layer);
  const face=[
    [-.88,.30],[-.86,.65],[-.62,.91],[-.14,1],[.43,.91],[.77,.67],[.86,.35],
    [.68,.03],[.48,-.18],[.38,-.68],[.12,-.86],[-.15,-.87],[-.38,-.74],
    [-.53,-.31],[-.72,-.12]
  ];
  for(const [ink,sx,sy,name,layer] of [
    [inks.violet,1.12,1.05,'spectre-halo',1],
    [inks.bone,1,1,'spectre',2]
  ]) {
    const outline=smoothPath(face,72,true);
    paintGrid(g,ink,base,flip,name,layer,outline.length,25,(u,t)=>{
      const [x,y]=outline[Math.round(u*outline.length)%outline.length];
      return place(x*sx*t,lerp(.17,y*sy,t));
    });
  }
  for(const side of [-1,1]) {
    patch(inks.black,[[side*.16,.31],[side*.28,.48],[side*.62,.48],
      [side*.70,.32],[side*.61,.12],[side*.40,.07],[side*.23,.17]],'spectre-eye',4);
    paintStroke(g,inks.shade,smoothPath([[side*.68,.58],[side*.70,.32],[side*.59,.04],
      [side*.44,-.19],[side*.31,-.45],[side*.23,-.73]].map(p=>place(...p)),36),
      t=>.018+.016*Math.sin(Math.PI*t),base,flip,'spectre-cheek-shadow',3);
  }
  patch(inks.black,[[-.12,-.17],[.005,.092],[.128,-.18],[.051,-.29],[-.054,-.27]],'spectre-nose',4);
  paintStroke(g,inks.black,[place(-.36,-.50),place(-.19,-.43),place(.17,-.42),place(.39,-.48)],
    .013,base,flip,'jaw',4);
  for(let tooth=0;tooth<6;tooth++) {
    const x=lerp(-.30,.31,tooth/5);
    paintStroke(g,inks.black,[place(x,-.70),place(x*.94,-.46)],.006,base,flip,'teeth',4);
  }
}
function paintMoon(g,inks,base,flip) {
  const z=.343,y=2.286;
  for(const [ink,xRadius,yRadius,name,layer] of [
    [inks.violet,.240,.227,'moon-halo',1],
    [inks.bone,.214,.206,'moon',2]
  ])paintGrid(g,ink,base,flip,name,layer,64,24,(u,t)=>{
    const angle=u*Math.PI*2;
    return [z+xRadius*t*Math.cos(angle),y+yRadius*t*Math.sin(angle)];
  });
  const house=[
    [.291,2.127],[.298,2.252],[.264,2.264],[.339,2.357],
    [.373,2.337],[.376,2.408],[.411,2.408],[.412,2.335],
    [.487,2.275],[.460,2.265],[.460,2.149]
  ];
  paintPatch(g,inks.black,house,base,flip,'haunted-house',3);
  for(const [x,h] of [[.345,2.238],[.411,2.242],[.393,2.289]]) {
    paintPatch(g,inks.yellow,[[x-.010,h-.016],[x+.010,h-.016],[x+.010,h+.016],[x-.010,h+.016]],
      base,flip,'house-window',4);
  }
  for(const path of [
    [[.194,2.144],[.197,2.268],[.179,2.366],[.210,2.431]],
    [[.196,2.264],[.151,2.315],[.145,2.373]],
    [[.188,2.307],[.233,2.348],[.240,2.396]],
    [[.183,2.358],[.163,2.405]]
  ])paintStroke(g,inks.black,smoothPath(path,14),.009,base,flip,'moon-branches',3);
}

function paintSide(g,inks,side) {
  const firstPaint=g.children.length;
  const base=(z,y)=>graveSidePaintBase(side,z,y);
  const flip=side>0;
  const fogZ=Array.from({length:61},(_,i)=>lerp(-2.175,.531,i/60));
  paintGrid(g,inks.fog,base,flip,'graveyard-mist',0,152,14,(u,t)=>{
    const z=lerp(fogZ[0],fogZ.at(-1),u);
    return [z,low(z)+lerp(.021,.173+.040*Math.sin(34.8*(1-u)),t)];
  });
  for(let band=0;band<3;band++) {
    const z=band===0?fogZ.slice(0,35):band===1?fogZ.slice(15,54):fogZ.slice(37);
    paintStroke(g,band===1?inks.lichen:inks.mist,z.map((v,i)=>[
      v,low(v)+.061+band*.038+.024*Math.sin(i*.66+band)
    ]),t=>(.018+.014*Math.sin(Math.PI*t))*(.60+.40*Math.sin(Math.PI*t)),base,flip,'mist-wisp',1);
  }
  for(let i=0;i<11;i++) {
    const z=-2.115+i*.207,y=low(z)+.045+(i%2)*.043,h=.10+(i%4)*.022;
    paintGrid(g,i%3?inks.grass:inks.lichen,base,flip,'gravestone',2,12,10,(u,t)=>{
      const arch=Math.sqrt(Math.max(0,1-(2*u-1)**2));
      return [z+lerp(-.048,.048,u),y+(h-.034+.034*arch)*t];
    });
    paintStroke(g,inks.black,[[z-.023,y+h*.60],[z+.024,y+h*.61]],.007,base,flip,'stone-cross',3);
    paintStroke(g,inks.black,[[z,y+.017],[z+.004,y+h-.017]],.006,base,flip,'stone-cross',3);
  }
  for(let j=0;j<6;j++) {
    const path=smoothPath([
      [-2.17,2.402+j*.071],[-1.91,2.424+j*.063],[-1.61,2.476+j*.050],
      [-1.29,2.379+j*.057],[-1.01,2.431+j*.043],[-.71,2.381+j*.045],
      [-.43,2.384+j*.031],[-.19,2.344+j*.027],[.086,2.338+j*.023]
    ],56);
    paintStroke(g,j%2?inks.purple:inks.violet,path,t=>(.015+.018*Math.sin(Math.PI*t))*(1-.62*t**5),
      base,flip,'spectral-trail',1);
  }
  paintMoon(g,inks,base,flip);
  paintSkull(g,inks,base,flip,(x,y)=>[-.748+x*.222,2.744+y*.250]);
  const title='GRAVE DIGGER';
  const start=-2.119,span=1.074;
  paintWords(g,[[inks.black,.047,1],[inks.red,.037,2],[inks.bone,.023,3]],title,(i,x,y)=>{
    const t=(i+.76*x+.12*y)/title.length;
    const z=start+span*(side>0?1-t:t);
    return [z,top(z)-.253+.142*y];
  },base,flip);
  for(const artwork of g.children.slice(firstPaint))clipPaintOpening(artwork,sideWindow);
}

function paintFlames(g,inks) {
  for(const [ink,name,edge,layer] of [
    [inks.yellow,'nose-flame-rim',0,0],
    [inks.flame,'nose-flame-fill',.012,1]
  ])paintGrid(g,ink,graveHoodPaintBase,true,name,layer,128,30,(u,t)=>{
    const side=2*u-1;
    const rear=2.10+.036*Math.cos(10*u*Math.PI)+.058*side*side+edge;
    const front=2.384-.021*side*side-edge*.32;
    const z=lerp(rear,front,t);
    return [side*(.968-edge)*station(hoodStations,z,1),z];
  });
  for(const side of [-1,1]) {
    const tips=[
      [[.068,2.243],[.085,1.995],[.044,1.823],[.092,1.655],[.057,1.413]],
      [[.219,2.231],[.211,2.035],[.254,1.882],[.192,1.694],[.203,1.457],[.177,1.222]],
      [[.393,2.249],[.353,2.057],[.397,1.928],[.350,1.758],[.364,1.563],[.310,1.360]]
    ];
    for(const tip of tips) {
      const path=smoothPath(tip.map(([x,z])=>[side*x,z]),54);
      for(const [ink,base,layer] of [[inks.yellow,.108,2],[inks.flame,.091,3]]) {
        paintStroke(g,ink,path,t=>base*(1-t)**.64,graveHoodPaintBase,true,'bonnet-flame',layer);
      }
    }
    const fender=(u,t)=>fenderPoint(side,u,t);
    for(const points of [
      [[.930,.74],[.820,.64],[.676,.48],[.544,.68],[.379,.56],[.188,.39]],
      [[.922,.42],[.778,.29],[.634,.27],[.535,.17],[.388,.23]]
    ]) {
      const path=smoothPath(points,38);
      for(const [ink,width,layer] of [[inks.yellow,.142,0],[inks.flame,.106,1]]) {
        paintStroke(g,ink,path,t=>width*(1-t)**.66,fender,side<0,'fender-flame',layer);
      }
    }
  }
  // The tapered center stripe and short trailing bands follow the hood crown.
  for(const [ink,scale,layer] of [[inks.red,1,4],[inks.stripe,.88,5]]) {
    paintGrid(g,ink,graveHoodPaintBase,true,'bonnet-center-stripe',layer,12,96,(u,t)=>{
      const z=lerp(1.117,2.342,t);
      return [(2*u-1)*lerp(.109,.057,t)*scale,z];
    });
    for(const z of [.840,.928,1.017]) {
      paintGrid(g,ink,graveHoodPaintBase,true,'bonnet-stripe-band',layer,12,4,(u,t)=>{
        const x=(2*u-1)*.109*scale;
        return [x,z+lerp(-.021,.021,t)*scale+.036*(1-(x/.109)**2)];
      });
    }
  }
}

function paintRoof(g,inks) {
  const map=(u,z)=>roofPoint((u+1)/2,z);
  // The roof reads from the rear of the truck with the hood ahead.
  for(const [line,z] of [['GRAVE',-.666],['DIGGER',-1.026]]) {
    paintWords(g,[[inks.red,.058,1],[inks.bone,.036,2]],line,(i,x,y)=>[
      .70-(i+.77*x+.13*y)*1.40/line.length,z+.251*y
    ],map,true);
  }
  for(const side of [-1,1]) {
    const bone=smoothPath([[side*.42,-1.958],[side*.218,-1.861],
      [-side*.238,-1.676],[-side*.41,-1.560]],35);
    paintStroke(g,inks.violet,bone,t=>.117+.029*Math.cos(2*t*Math.PI),map,true,'roof-crossbone');
    paintStroke(g,inks.bone,bone,t=>.081+.026*Math.cos(2*t*Math.PI),map,true,'roof-crossbone',1);
  }
  paintSkull(g,inks,map,true,(x,y)=>[-x*.405,-1.530+y*.295]);
  for(const [ink,layer,inset] of [[inks.yellow,0,0],[inks.flame,1,.012]]) {
    paintGrid(g,ink,map,true,'roof-leading-flame',layer,80,22,(u,t)=>{
      const edge=2*u-1;
      const rear=-.088+.024*Math.cos(u*14*Math.PI)+.049*edge*edge+inset;
      return [edge*(.746-inset),lerp(rear,.147-inset*.23,t)];
    });
    for(const [index,x] of [-.64,-.445,-.235,0,.235,.445,.64].entries()) {
      const depth=.305+.048*(index%3);
      const tip=smoothPath([[x,.030],[x-.024,-.092],[x+.024,-.178],[x-.016,-depth]],36);
      paintStroke(g,ink,tip,t=>(.110-1.7*inset)*(1-t)**.63,map,true,'roof-flame-tip',layer+2);
    }
  }
}

function tire(spec,m) {
  const group=new T.Group(),r=spec.tireRadius,w=spec.tireWidth,bead=25*.0254/2;
  const profile=[
    [bead*.975,-w*.414],[bead*1.08,-w*.461],[r*.60,-w*.497],[r*.73,-w*.517],
    [r*.85,-w*.511],[r*.925,-w*.474],[r*.950,-w*.383],[r*.951,-w*.273],
    [r*.951,0],[r*.951,w*.273],[r*.950,w*.383],[r*.925,w*.474],
    [r*.85,w*.511],[r*.73,w*.517],[r*.60,w*.497],[bead*1.08,w*.461],[bead*.975,w*.414]
  ];
  const carcass=mesh(group,new T.LatheGeometry(profile.map(p=>new T.Vector2(...p)),112),m.rubber);
  carcass.rotation.z=Math.PI/2;
  carcass.name='monster-bulged-66in-carcass';
  const moldings=[.61,.83].map(factor=>{
    const radius=r*factor;
    const end=profile.findIndex(([outer])=>outer>=radius);
    const [a,b]=[profile[end-1],profile[end]];
    const axial=Math.abs(lerp(a[1],b[1],(radius-a[0])/(b[0]-a[0])));
    // Seat each molding slightly into the same straight profile used by the lathe.
    return [radius,axial-.0007];
  });
  for(let i=0;i<24;i++) {
    for(const side of [-1,1]) {
      const pitch=i*Math.PI/12+(side>0?.022:0);
      const lug=(u,t,drop=0)=>{
        const x=side*lerp(.019,w*.466,u);
        const sweep=.133*u+.207*u*u-.016*Math.sin(Math.PI*u);
        const halfWidth=lerp(.030,.044,Math.sin(u*Math.PI*.81));
        const angle=pitch+sweep+(2*t-1)*halfWidth;
        const edge=.006*Math.abs(2*t-1)**6;
        const radius=r-.034*u**3-edge-drop;
        return [x,Math.cos(angle)*radius,Math.sin(angle)*radius];
      };
      surface(group,m.tread,12,7,(u,t)=>lug(u,t),side>0).name='monster-directional-chevron-lug';
      for(const edge of [0,1]) {
        surface(group,m.tread,12,4,(u,t)=>lug(u,edge,t*.056),(side>0)!==!!edge);
      }
      for(const end of [0,1])surface(group,m.tread,7,4,(u,t)=>lug(end,u,t*.056),(side<0)!==!!end);
    }
  }
  for(const side of [-1,1]) {
    ring(group,m.rubber,[side*w*.466,0,0],bead*1.09,.008);
    for(const [radius,axial] of moldings)ring(group,m.rubber,[side*axial,0,0],radius,.0035)
      .name='monster-sidewall-molding';
    for(let i=0;i<28;i++) {
      const a=i*Math.PI/14;
      rod(group,m.tread,[side*w*.505,Math.cos(a)*r*.848,Math.sin(a)*r*.848],
        [side*w*.483,Math.cos(a+.035)*r*.914,Math.sin(a+.035)*r*.914],.007,8);
    }
    for(const angle of [-.30,Math.PI-.30]) {
      const p=[side*w*.523,Math.cos(angle)*r*.728,Math.sin(angle)*r*.728];
      const stencil=label(group,m.white,'BKT',.234,.091,p,side*Math.PI/2);
      stencil.rotateZ(side*(angle+(angle>1?Math.PI:0)));
    }
    label(group,m.satinMetal,'66 X 43 - 25',.280,.029,[side*w*.524,r*.593,0],side*Math.PI/2);
  }
  return group;
}

function wheel(spec,m) {
  const group=new T.Group(),r=25*.0254/2,w=spec.tireWidth;
  const green=finishMaterial('#41cc17','wheel',.36);
  rimBarrel(group,m.dark,r,w);
  for(const side of [-1,1]) {
    const lip=side*w*.426;
    const bowl=[[.93,0],[.89,.019],[.855,.052],[.81,.086],[.747,.117],[.55,.138],[.34,.145]];
    const barrel=mesh(group,new T.LatheGeometry(bowl.map(([radius,depth])=>
      new T.Vector2(radius*r,-lip+side*depth)),72),m.satinMetal);
    barrel.rotation.z=Math.PI/2;
    ring(group,m.dark,[lip+side*.005,0,0],r*.958,.012);
    const lock=[[.959,-.005],[.970,0],[.969,.010],[.942,.017],[.874,.016],[.853,.006],[.868,-.003],[.959,-.005]];
    const flange=mesh(group,new T.LatheGeometry(lock.map(([radius,depth])=>
      new T.Vector2(radius*r,-lip-side*depth)),72),green);
    flange.rotation.z=Math.PI/2;
    cylinder(group,m.dark,[lip-side*.145,0,0],r*.34,.025,'x',32);
    cylinder(group,m.satinMetal,[lip-side*.133,0,0],r*.197,.037,'x',32);
    for(let i=0;i<32;i++) {
      const angle=i*Math.PI/16;
      cylinder(group,m.satinMetal,[lip+side*.017,Math.cos(angle)*r*.916,Math.sin(angle)*r*.916],
        .0062,.0062,'x',6);
    }
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4;
      cylinder(group,m.chrome,[lip-side*.126,Math.cos(angle)*r*.273,Math.sin(angle)*r*.273],
        .0105,.017,'x',6);
    }
  }
  group.name='monster-deep-25in-beadlock-wheel';
  return group;
}

function addChassis(g,m,green) {
  const bays=[
    [-2.16,.523,.985,.638,1.525],[-1.56,.628,.896,.736,1.857],
    [-.89,.675,.775,.719,1.718],[-.12,.689,.775,.707,1.751],
    [.67,.674,.835,.702,1.842],[1.44,.575,.959,.663,1.949],[2.073,.503,1.143,.555,1.899]
  ];
  const rearMetal=m.satinMetal.clone(),rearCollar=m.dark.clone(),rearHose=m.black.clone();
  rearMetal.userData.nativeRole=rearCollar.userData.nativeRole=rearHose.userData.nativeRole='rearReservoir';
  const point=(bay,side,upper)=>[side*bay[upper?3:1],bay[upper?4:2],bay[0]];
  for(const side of [-1,1]) {
    for(let i=0;i<bays.length;i++) {
      const bay=bays[i];
      rod(g,green,point(bay,side,false),point(bay,side,true),.033);
      if(i===0)continue;
      const prior=bays[i-1];
      for(const upper of [false,true])rod(g,green,point(prior,side,upper),point(bay,side,upper),.036);
      rod(g,green,point(prior,side,i%2===0),point(bay,side,i%2!==0),.031);
      if(i!==3)rod(g,green,point(prior,side,i%2!==0),point(bay,side,i%2===0),.028);
    }
    const rearFoot=[side*.667,1.733,-1.65],rearHoop=[side*.778,2.996,-.69];
    const frontHoop=[side*.730,2.979,.139],frontFoot=[side*.642,1.825,.786];
    for(const [a,b,r] of [
      [rearFoot,rearHoop,.037],[rearHoop,frontHoop,.036],[frontHoop,frontFoot,.036],
      [[side*.676,1.702,-.31],rearHoop,.035],[[side*.678,2.449,-.487],frontHoop,.029],
      [[side*.692,2.451,.479],rearHoop,.028],[[side*.741,2.458,-.561],[side*.708,2.456,.477],.029],
      [[side*.668,1.772,1.39],[side*.725,2.409,.532],.032],
      [[side*.641,1.509,-2.13],[side*.755,2.413,-1.155],.031]
    ])rod(g,green,a,b,r);
    // Mount the rear reservoirs and their lines inboard of the steered tires.
    const x=side*.300,y=1.728,z=-1.475;
    cylinder(g,rearMetal,[x,y,z],.047,.256,'y',18).name='monster-rear-reservoir';
    for(const offset of [-.082,.079])cylinder(g,rearCollar,[x,y+offset,z],.049,.033,'y',18)
      .name='monster-rear-reservoir-collar';
    rod(g,rearCollar,[x,y+.079,z-.040],[x,1.857,-1.560],.017,12).name='monster-rear-reservoir-mount';
    curve(g,rearHose,[[x,y+.126,z],[x,1.924,-1.493],
      [side*.207,1.918,-1.542],[side*.180,1.857,-1.560]],.011).name='monster-rear-reservoir-hose';

    const frontZ=1.381;
    cylinder(g,m.satinMetal,[side*.650,1.564,frontZ],.047,.256,'y',18);
    for(const y of [1.482,1.643])cylinder(g,m.dark,[side*.650,y,frontZ],.049,.033,'y',18);
    curve(g,m.black,[[side*.650,1.693,frontZ],[side*.625,1.758,frontZ+.10],
      [side*.682,1.629,frontZ+.21],[side*.712,1.508,frontZ+.19]],.011);
  }
  for(const bay of bays) {
    for(const upper of [false,true])rod(g,green,point(bay,-1,upper),point(bay,1,upper),.034);
  }
  for(const [z,y,w] of [[-.69,2.996,.778],[.139,2.979,.730],[-.51,2.44,.729],[.47,2.438,.70]]) {
    rod(g,green,[-w,y,z],[w,y,z],.033);
  }
  rod(g,green,[-.513,1.162,2.069],[.545,1.900,2.069],.030);
  rod(g,green,[.513,.997,-2.16],[-.624,1.523,-2.16],.031);
  box(g,m.dark,[0,1.104,-2.131],[.98,.079,.146],.027).name='grave-rear-tube-bumper-plate';
  box(g,m.dark,[0,1.287,2.081],[.73,.055,.093],.016);
}

function addPowertrain(g,m) {
  box(g,m.dark,[0,1.193,-.652],[.596,.591,.864],.066).name='grave-rear-mounted-v8';
  box(g,m.satinMetal,[0,.950,-.586],[.466,.158,.656],.044);
  const header=m.chrome.clone(),outlet=m.glossBlack.clone();
  header.userData.nativeRole=outlet.userData.nativeRole='exhaust';
  for(const side of [-1,1]) {
    const cover=box(g,m.chrome,[side*.283,1.506,-.667],[.269,.177,.813],.044);
    cover.rotation.z=side*.393;
    for(let rib=0;rib<6;rib++) {
      const z=-.997+rib*.132;
      rod(g,m.satinMetal,[side*.186,1.589,z],[side*.364,1.526,z],.009,8);
    }
    for(let port=0;port<4;port++) {
      const z=-.988+port*.171;
      // Sweep the outlets forward of the rear tire at full bump and steer.
      // The second pipe from the rear passes over the diagonal cage brace.
      const rise=port===1?.100:0;
      const points=[[side*.351,1.454,z],[side*.500,1.384,z+.056],
        [side*.648,1.167+rise,z+.151],[side*.835,1.098+rise,z+.244]];
      curve(g,header,points,.031).name='grave-exhaust-header';
      const tip=new T.Vector3(...points.at(-1));
      const direction=tip.clone().sub(new T.Vector3(...points.at(-2))).normalize();
      const inner=tip.clone().addScaledVector(direction,-.007);
      const face=tip.clone().addScaledVector(direction,-.002);
      rod(g,outlet,inner.toArray(),face.toArray(),.024,18).name='grave-exhaust-outlet';
    }
  }
  box(g,m.chrome,[0,1.719,-.640],[.382,.234,.657],.039);
  for(let fin=0;fin<10;fin++)box(g,m.satinMetal,[0,1.740,-.911+fin*.061],[.397,.237,.013],.006);
  box(g,m.black,[0,1.889,-.667],[.354,.118,.477],.037);
  for(const x of [-.103,0,.103])cylinder(g,m.satinMetal,[x,1.920,-.919],.040,.014,'z',24);
  for(const [y,radius] of [[1.633,.069],[1.264,.089]]) {
    cylinder(g,m.dark,[0,y,-1.106],radius,.033,'z',32);
    ring(g,m.satinMetal,[0,y,-1.125],radius*.85,.004,'z');
  }
  for(const x of [-.069,.069])rod(g,m.rubber,[x,1.263,-1.126],[x,1.633,-1.126],.013,9);
  const cooler=box(g,m.satinMetal,[0,1.342,-1.808],[.705,.403,.114],.040);
  cooler.rotation.x=.102;
  for(let fin=0;fin<14;fin++) {
    const x=lerp(-.299,.299,fin/13);
    rod(g,m.dark,[x,1.181,-1.875],[x,1.498,-1.842],.008,8);
  }
  for(const side of [-1,1]) {
    curve(g,m.dark,[[side*.284,1.456,-1.826],[side*.406,1.442,-1.600],
      [side*.369,1.362,-1.298],[side*.261,1.405,-1.028]],.027);
    cylinder(g,m.satinMetal,[side*.513,1.581,-2.154],.054,.048,'z',24);
    cylinder(g,m.red,[side*.513,1.581,-2.184],.043,.014,'z',28);
    cylinder(g,m.reverse,[side*.358,1.587,-2.173],.027,.016,'z',22);
  }
}

function addShell(g,m) {
  surface(g,m.paint,64,100,(u,t)=>roofPoint(u,lerp(tailZ,roofFront,t)),true)
    .name='grave-digger-domed-wagon-roof';
  const range=Array.from({length:77},(_,i)=>lerp(tailZ,cowlZ,i/76));
  const outline=[...range.map(z=>[z,low(z)]),...range.slice().reverse().map(z=>[z,top(z)])];
  for(const side of [-1,1]) {
    const map=(z,y,depth=0)=>{
      const p=graveSidePaintBase(side,z,y);
      p[0]-=side*depth;
      return p;
    };
    const panel=mappedPolygon(g,m.paint,outline,map,[sideWindow],side>0,9);
    panel.name='grave-digger-panel-wagon-side';
    panel.userData.windowContour=sideWindow;
    panelReturn(g,m.black,sideWindow,sideWindow,map,.021,side>0).name='grave-open-side-window-edge';
    line(g,m.glossBlack,[...sideWindow,sideWindow[0]].map(([z,y])=>map(z,y,-.002)),.005);
    surface(g,m.dark,104,5,(u,t)=>{
      const z=lerp(tailZ,cowlZ,u);
      return map(z,low(z),t*.028);
    },side<0).name='grave-wagon-lower-return';
  }

  // Only the edge of the composite tail closes. The open rear still exposes
  // the sloped roof liner, cage, cooler and bracing.
  const rearTop=Array.from({length:65},(_,i)=>roofPoint(i/64,tailZ).slice(0,2));
  const lipBottom=low(tailZ);
  const rearOutline=[
    ...rearTop,
    [graveSidePaintBase(1,tailZ,lipBottom)[0],lipBottom],
    [graveSidePaintBase(-1,tailZ,lipBottom)[0],lipBottom]
  ];
  const inner=rearOutline.map(([x,y])=>[x*.935,lerp(2.585,y,.91)]);
  const tail=(x,y,d=0)=>[x,y,tailZ+.041*(x/.83)**2+.027*(y-2.59)**2+d];
  const rim=(x,y,d=0)=>tail(x,y,d-.034*(x/.83)**2-.02*(y-2.59)**2);
  panelReturn(g,m.paint,rearOutline,inner,rim,.038,true).name='grave-digger-open-tail-surround';
  panelReturn(g,m.dark,inner,inner,(x,y,d)=>rim(x,y,.038+d),.107,true).name='grave-tail-inner-return';

  const screen=(x,y)=>[x,y,lerp(cowlZ,roofFront,(y-2.467)/(top(roofFront)-2.467))+.060*(1-(x/.82)**2)];
  const glassOutline=roundedContour([
    [-.761,2.464],[.761,2.464],[.822,top(roofFront)],[-.822,top(roofFront)]
  ],.060,10);
  pane(g,{...m,glass:m.windscreen},glassOutline,screen).name='reference-open-window';
  const glassBorder=glassOutline.map(([x,y])=>[x*1.025,lerp(2.69,y,1.030)]);
  mappedPolygon(g,m.paint,glassBorder,screen,[glassOutline],false,8).name='grave-rolled-windshield-frame';
  // Join the horizontal panel crown to the windshield instead of leaving
  // a slit between the glass and the leading roof edge.
  surface(g,m.paint,64,8,(u,t)=>{
    const roof=roofPoint(u,roofFront);
    const x=(2*u-1)*.817;
    return mix(roof,screen(x,top(roofFront)-.019),t);
  },true).name='grave-roof-header';
  surface(g,m.paint,64,10,(u,t)=>{
    const x=(2*u-1)*.748;
    return mix(screen(x,2.466),hoodPoint(u,cowlZ),t);
  },true).name='grave-closed-cowl';
  surface(g,m.paint,64,96,(u,t)=>hoodPoint(u,lerp(cowlZ,noseZ,t)),true)
    .name='grave-digger-domed-narrow-bonnet';

  for(const side of [-1,1]) {
    surface(g,m.paint,92,32,(u,t)=>fenderPoint(side,u,t),side<0)
      .name='grave-digger-separate-rounded-front-fender';
    surface(g,m.paint,94,8,(u,t)=>{
      const z=lerp(cowlZ,noseZ,u),fender=(z-.58)/(2.384-.58);
      return mix(hoodPoint((side+1)/2,z),fenderPoint(side,T.MathUtils.clamp(fender,0,1),.033),t);
    },side<0).name='grave-formed-fender-inner-seam';
    surface(g,m.paint,76,7,(u,t)=>{
      const p=fenderPoint(side,u,1);
      p[0]-=side*.024*t;
      p[1]-=.031*Math.sin(t*Math.PI*.53);
      return p;
    },side<0).name='grave-fender-rolled-edge';
    surface(g,m.paint,30,7,(u,t)=>{
      const p=fenderPoint(side,1,u);
      p[1]-=.064*t;
      p[2]-=.028*t;
      return p;
    },side>0).name='grave-front-fender-lamp-apron';
    // Radiused edge of the fiberglass at the rear. The corners end at the
    // same lower body cut as the rear suspension's opening.
    surface(g,m.paint,24,8,(u,t)=>{
      const p=graveSidePaintBase(side,tailZ,lerp(low(tailZ),top(tailZ),u));
      p[0]-=side*.029*t;
      p[2]+=.046*t;
      return p;
    },side>0).name='grave-tail-quarter-return';
  }
}

function addHeadlights(g,m) {
  const lens=new T.MeshStandardMaterial({
    color:'#761021',emissive:'#fb0515',emissiveIntensity:.93,roughness:.17,metalness:.05
  });
  lens.userData.nativeRole='';
  for(const side of [-1,1]) {
    const x=side*.849,y=2.201,z=2.345;
    cylinder(g,m.dark,[x,y,z-.015],.112,.067,'z',42);
    ring(g,m.satinMetal,[x,y,z+.022],.089,.012,'z');
    ring(g,m.glossBlack,[x,y,z+.022],.079,.004,'z');
    surface(g,lens,44,12,(u,t)=>{
      const angle=u*Math.PI*2,r=lerp(.001,.078,t);
      return [x+Math.cos(angle)*r,y+Math.sin(angle)*r,z+.024+.022*(1-t*t)];
    },true).name='monster-constant-red-headlight';
    for(let i=0;i<11;i++) {
      const pos=lerp(-.063,.063,i/10);
      const height=Math.sqrt(.073**2-pos**2)*.83;
      rod(g,lens,[x+pos,y-height,z+.037],[x+pos,y+height,z+.037],.001,5);
    }
  }
}

function addCab(g,m) {
  box(g,m.dark,[0,2.031,.071],[1.277,.082,.936],.031);
  box(g,m.interior,[0,2.122,.046],[.545,.151,.551],.056);
  const seat=box(g,m.interior,[0,2.414,-.180],[.518,.637,.148],.065);
  seat.rotation.x=-.14;
  box(g,m.upholstery,[0,2.383,-.107],[.337,.451,.076],.048);
  for(const side of [-1,1]) {
    box(g,m.interior,[side*.232,2.433,-.132],[.101,.472,.157],.041);
    rod(g,m.upholstery,[side*.120,2.656,-.100],[side*.147,2.167,.112],.022,8);
  }
  box(g,m.black,[0,2.730,-.206],[.329,.205,.146],.052);
  box(g,m.satinMetal,[0,2.426,.514],[.471,.119,.125],.026);
  for(const x of [-.136,-.054,.051,.137])cylinder(g,m.black,[x,2.441,.449],.029,.016,'z',26);
  ring(g,m.black,[0,2.466,.365],.183,.016,'z').rotation.x=-.24;
  rod(g,m.satinMetal,[0,2.325,.618],[0,2.463,.372],.032,12);
  cylinder(g,m.dark,[0,2.467,.365],.061,.030,'z',24);
  for(const angle of [.24,2.90,-Math.PI/2])rod(g,m.satinMetal,[0,2.467,.365],
    [.171*Math.cos(angle),2.467+.171*Math.sin(angle),.365],.013,8);
}

export function graveDiggerView(spec=GRAVE_DIGGER_SPEC) {
  const view=newReferenceView(spec),g=view.body,m=view.materials;
  const green=finishMaterial('#39c413','paint',.35);
  const inks={
    black:m.black,flame:finishMaterial('#229a30','paint',.34),yellow:finishMaterial('#e0d334','paint',.36),
    red:finishMaterial('#c72920','paint',.41),bone:finishMaterial('#e2ddd4','paint',.43),
    shade:finishMaterial('#776381','paint',.48),purple:finishMaterial('#521b7c','paint',.36),
    violet:finishMaterial('#8549a3','paint',.39),fog:finishMaterial('#226b49','paint',.36),
    mist:finishMaterial('#a6d9ad','paint',.43),lichen:finishMaterial('#66a759','paint',.43),
    grass:finishMaterial('#429141','paint',.37),stripe:m.satinMetal
  };
  m.paint.color.set('#080c10');
  m.windscreen.color.set('#28363b');
  m.windscreen.opacity=.32;
  addChassis(g,m,green);
  addPowertrain(g,m);
  addShell(g,m);
  addCab(g,m);
  addHeadlights(g,m);
  for(const side of [-1,1])paintSide(g,inks,side);
  paintFlames(g,inks);
  paintRoof(g,inks);
  Object.assign(view.root.userData,{
    nativeConstruction:{
      version:4,bodySurfaceRevision:3,paintedLivery:true,originalReferenceGeometry:true,
      realWindowApertures:true,exposedTubeChassis:true,geometryLettering:true
    },
    bodyRefinement:{
      version:3,style:'monster',
      method:'2024 photo-matched fiberglass shell, open tail and cab, tapered spaceframe and original painted details',
      preservedHardpoints:true
    },
    visualModel:{version:2,landmarks:GRAVE_DIGGER_LANDMARKS},
    nativeFidelity:{
      version:4,bodyClearcoat:true,geometryLettering:true,factorySpokeProfile:'monster-deep-beadlock',
      monsterChevronTread:true,flatPaintedLivery:true
    }
  });
  return view;
}

export const refineGraveDigger=(view,spec=view.spec)=>refineReferenceWheel(view,spec,wheel,tire);
