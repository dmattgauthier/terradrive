// Native coordinates in metres. All three corridors use the normal terrain
// mesh, height queries, and surface response rather than separate colliders.
export const terrainChallenges = [
  {
    name:'Pine Ridge cross-axle crawl', zone:0, x:116, y:94, length:56, surface:0,
    hint:'Crawl the offset earth mounds. Keep a tire on each side of the marked line.',
    stations:[10,19,28,38,49,56],
    notes:[
      'Ease onto the first offset mound.',
      'Hold a straight line as the opposite wheel rises.',
      'Keep steady throttle through the crossover.',
      'Let the suspension settle before the next mound.',
      'Straighten out before the final rise.',
      'Follow the last posts onto level ground.'
    ],
    relief:(s,t)=>[14,22,30,38,46].reduce((z,at,i)=>
      z+.40*bump((s-at)/3.3)*bump((t-(i%2?1.05:-1.05))/2.75),0)
  },
  {
    name:'Copper Dunes crest run', zone:5, x:-133, y:-266, length:56, surface:5,
    hint:'Build steady momentum on the sand. Ease off at each crest and descend square.',
    stations:[9,18,28,38,48,56],
    notes:[
      'Build speed on the lower approach.',
      'Keep the steering straight up the first dune.',
      'Ease off before rolling over the crest.',
      'Carry momentum through the hollow.',
      'Crest the second roller with the wheels straight.',
      'Use light braking on the exit.'
    ],
    relief:(s,t)=>bump(t/6.7)*(1.00*bump((s-19)/9)+.78*bump((s-44)/9))
  },
  {
    name:'Boreal drift traverse', zone:7, x:266, y:307, length:48, surface:6,
    hint:'Traverse the wind-packed bank at low speed. Steer gently when the drift loads the downhill tires.',
    stations:[8,16,24,32,40,48],
    notes:[
      'Enter with the wheels pointed between the posts.',
      'Keep a gentle throttle as the bank rises.',
      'Follow the posts across the off-camber section.',
      'Avoid abrupt steering at the drift shoulder.',
      'Keep the truck square through the last drift.',
      'Let the truck settle past the final posts.'
    ],
    relief:(s,t)=>bump(t/7)*(.59*bump((s-15-t*.55)/7)+
      .67*bump((s-32+t*.65)/8)+.10*t*bump((s-25)/19))
  }
];

function bump(value) {
  if(Math.abs(value)>=1)return 0;
  return .5+.5*Math.cos(Math.PI*value);
}

export function terrainChallengeRelief(x,y) {
  for(const course of terrainChallenges){
    const s=x-course.x,t=y-course.y;
    if(s<-5||s>course.length+5||Math.abs(t)>7)continue;
    const relief=course.relief(s,t);
    return Math.abs(relief)>.001?relief:0;
  }
  return 0;
}

export function addTerrainChallenges(world,field) {
  const n=field.readUInt32LE(4),step=field.readFloatLE(8),origin=field.readFloatLE(12);
  const index=v=>Math.round((v-origin)/step);
  const offset=(x,y)=>16+(index(x)*n+index(y))*9;
  const read=(x,y)=>field.readFloatLE(offset(x,y));
  const stakes=new Map([[-1,[]],[1,[]]]);
  const newRoutes=[];
  for(const course of terrainChallenges){
    const {x,y,length}=course;
    let changedCells=0;
    // The export restores the original height before applying this relief.
    for(let a=x-5;a<=x+length+5;a+=step)for(let b=y-7;b<=y+7;b+=step){
      const relief=course.relief(a-x,b-y);
      if(Math.abs(relief)<=.001)continue;
      field.writeFloatLE(read(a,b)+relief,offset(a,b));
      changedCells++;
    }
    const point=(a,b)=>[a*100,b*100,Math.round(100*read(a,b))];
    const gates=course.stations.map(s=>point(x+s,y));
    for(const s of [0,...course.stations])for(const side of [-1,1]){
      const position=point(x+s,y+side*4);
      stakes.get(side).push({p:position,q:[0,0,0,1],s:[1,1,1],color:[1,1,1]});
    }
    newRoutes.push({routeIndex:world.routes.length,surface:course.surface,changedCells,
      minX:x-5,maxX:x+length+5,minY:y-7,maxY:y+7});
    world.routes.push({name:course.name,hint:course.hint,zone:course.zone,yaw:0,spawn:point(x,y),gateWidth:7,terrainStart:true,
      gates,gateHeadings:gates.map(()=>0),gateNotes:course.notes});
  }
  for(const [side,instances] of stakes)
    world.nativeDetails.push({asset:side<0?'trail_challenge_amber':'trail_challenge_blue',solid:false,
      crushable:false,snapToGround:true,surface:0,instances});
  world.terrainChallenges=newRoutes;
}
