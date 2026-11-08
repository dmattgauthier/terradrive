// Original 1998 JDM 22B STI. Published anchors: STI heritage spec; photo-fitted panels.
import {T,mesh,box,surface,mappedPolygon,line,lerp,station,roundedContour,panelReturn,G,newReferenceView,finishMaterial,rod,cylinder,ring,label,pane,rimBarrel,refineReferenceWheel} from './reference-vehicle-kit.mjs';
export const SUBARU_22B_SPEC={id:'subaru-22b-sti',name:'Subaru Impreza 22B STI',brand:'Subaru',year:1998,trim:'2.2 turbo boxer / 5-speed / DCCD AWD',bodyStyle:'subaru22b',color:'#075da8',powertrain:'combustion',fuelCapacityGallons:60/3.785411784,powerHP:206000/745.699872,torqueNm:363,torqueLbFt:363/1.3558179483,mass:1270,curbMass:1270,length:4.365,width:1.770,height:1.390,wheelbase:2.520,track:1.49,trackFront:1.48,trackRear:1.50,frontWeightFraction:.58,cgHeight:.50,clearance:.14,tireSize:'235/40R17',tireRadius:.3099,tireWidth:.235,rearTireWidth:.235,tireType:'road-performance',rimDiameterInches:17,stockPSI:32,stockPSIFront:32,stockPSIRear:30,transmissionType:'manual',transmissionName:'5-speed close-ratio manual (automatic shifting in simulator)',gears:[3.083,2.062,1.545,1.151,.825],reverseRatio:3.416,finalDrive:4.444,lowRatio:1,defaultMode:'AWD',driveModes:['AWD'],frontTorqueFraction:.35,dragCoefficient:.36,features:{frontLocker:false,rearLocker:false,centerLocker:true,swayDisconnect:false,tractionControl:false,abs:false,hillDescent:false},engine:{idleRPM:850,redlineRPM:7900,peakTorqueRPM:3200,peakPowerRPM:6000,curve:[[850,90],[1800,190],[2800,350],[3200,363],[5200,350],[6000,327.86],[7200,252],[7900,205]],curveStatus:'Estimated interpolation through manufacturer output peaks'},suspension:{travel:.18,restLength:.30,springRate:29000,damping:3200,antiRoll:16000,frontType:'independent inverted MacPherson struts',rearType:'independent MacPherson struts',parameterStatus:'Simulation rates, damping, rest and travel; not measured Bilstein/Eibach data'},notes:['Original two-door 1998 JDM 22B, distinct from later WRX STI sedans. Driver-adjustable centre coupling is simplified as a centre-lock control.','Factory dimensions, 17-inch BBS wheel/tire designation, rated output and curb mass. Panel coordinates, CG, pressure, torque interpolation and suspension coefficients are photo/simulation estimates.'],sources:['https://www.subaru.co.jp/news/archives/98_1_3/3_16_1.html','https://www.sti.jp/brand/heritage/1998/impreza-22b/','https://collectingcars.com/for-sale/1998-subaru-impreza-sti-22b-5']};
const frontZ=2.1825;
const rearZ=-frontZ;
const frontAxle=1.26;
const rearAxle=-frontAxle;
const archRadius=.355;
const frontArchRadius=.390;
const innerWheelhouse=.390;
const shoulderRadius=.053;
const frontGlass={baseZ:.895,baseY:.895,roofZ:.17};
const rearGlass={baseZ:-1.462,baseY:.952,roofZ:-.745};
const bonnetStart=.957;
const deckEnd=-1.510;

export const SUBARU_22B_LANDMARKS={
  length:4.365,width:1.77,height:1.39,wheelbase:2.52,
  axles:[rearAxle,frontAxle],archRadius,roofFrontZ:frontGlass.roofZ,
  roofRearZ:rearGlass.roofZ,cowlZ:frontGlass.baseZ,frontZ,rearZ
};

const gauss=(x,center,width)=>Math.exp(-(((x-center)/width)**2));
const blend=(a,b,t)=>a.map((value,axis)=>lerp(value,b[axis],t));
const oval=(cx,cy,rx,ry,steps=40)=>Array.from({length:steps},(_,i)=>{
  const a=i*Math.PI*2/steps;
  return [cx+rx*Math.cos(a),cy+ry*Math.sin(a)];
});
const inset=(outline,scale)=>{
  const center=outline.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/outline.length),[0,0]);
  return outline.map(p=>blend(center,p,scale));
};

// Side elevation from the stock gallery, scaled to Subaru's 2520 mm wheelbase.
// The hood falls to the grille, and the deck remains above the front fenders.
const beltStations=[
  [rearZ,.893],[-1.94,.938],[-1.47,.965],[-.90,.943],[-.30,.920],
  [.45,.903],[.89,.898],[1.30,.842],[1.72,.760],[2.01,.704],[frontZ,.674]
];
const sillStations=[[rearZ,.215],[-1.91,.199],[-1.30,.187],[.84,.179],[1.73,.174],[frontZ,.178]];
const frontReturns=[
  [.17,.080],[.212,.014],[.240,.029],[.328,.044],[.430,.029],
  [.499,0],[.532,.006],[.550,.026],[.562,.016],[.650,.030],[.710,.063]
];
const rearReturns=[
  [.21,.105],[.27,.044],[.36,.008],[.49,0],[.55,.014],
  [.583,.029],[.609,.012],[.69,.021],[.81,.036],[.93,.073]
];
const belt=z=>station(beltStations,z,1);
const sill=z=>station(sillStations,z,1);
const sideTop=z=>belt(z)-shoulderRadius;

function endSetback(x,y,front) {
  const corner=Math.abs(x)/.885;
  const sweep=(front?.174:.146)*corner**3.4+.021*corner**8;
  return sweep+station(front?frontReturns:rearReturns,y,1);
}

function contourEnd([x,y,z]) {
  const strength=T.MathUtils.smoothstep(Math.abs(z),1.69,frontZ);
  return [x,y,z-Math.sign(z)*endSetback(x,y,z>0)*strength];
}

function halfWidth(z,y) {
  const frontFlare=gauss(z,1.27,.44);
  const rearFlare=gauss(z,-1.29,.49);
  const fullness=.75+.25*gauss(y,.568,.24);
  const section=T.MathUtils.clamp((y-sill(z))/(sideTop(z)-sill(z)),0,1);
  const door=T.MathUtils.smoothstep(z,-1.05,-.71)*(1-T.MathUtils.smoothstep(z,.77,1.07));
  const pressing=.010*Math.sin(Math.PI*section)-.025*(1-section)**2;
  const crease=-door*.007*gauss(y,.535,.017);
  return Math.min(.8848,.807+.062*frontFlare*fullness+.068*rearFlare*fullness+
    .020*gauss(Math.abs(z),2.05,.34)+pressing+crease);
}

const sidePoint=(side,z,y,lift=0)=>contourEnd([side*(halfWidth(z,y)+lift),y,z]);

function shoulderPoint(side,z,t=0) {
  const angle=t*Math.PI/2;
  return contourEnd([
    side*(halfWidth(z,sideTop(z))-shoulderRadius+shoulderRadius*Math.sin(angle)),
    sideTop(z)+shoulderRadius*Math.cos(angle),
    z
  ]);
}

function bonnetHeight(x,z) {
  const t=(z-bonnetStart)/(frontZ-bonnetStart);
  const width=halfWidth(z,sideTop(z))-shoulderRadius;
  return belt(z)+.011+.025*(1-(x/width)**2)+.009*gauss(Math.abs(x),.44,.13)*Math.sin(t*Math.PI);
}

function deckHeight(x,z) {
  const width=halfWidth(z,sideTop(z))-shoulderRadius;
  return belt(z)+.011+.022*(1-(x/width)**2);
}

const bonnet=(u,t)=>{
  const z=lerp(bonnetStart,frontZ,t);
  const x=(2*u-1)*(halfWidth(z,sideTop(z))-shoulderRadius);
  return contourEnd([x,bonnetHeight(x,z),z]);
};
const deck=(u,t)=>{
  const z=lerp(rearZ,deckEnd,t);
  const x=(2*u-1)*(halfWidth(z,sideTop(z))-shoulderRadius);
  return contourEnd([x,deckHeight(x,z),z]);
};

function roofPoint(u,t) {
  const edge=2*u-1;
  const crown=1-edge**2;
  const z=lerp(rearGlass.roofZ,frontGlass.roofZ,t);
  const width=.568+.020*Math.sin(t*Math.PI)+.006*(1-t);
  return [
    edge*width,
    1.354+.036*crown-.019*(2*t-1)**4,
    z+crown*lerp(-.024,.027,t)
  ];
}

const cabinBase=z=>lerp(rearGlass.baseY,frontGlass.baseY,
  T.MathUtils.clamp((z-rearGlass.baseZ)/(frontGlass.baseZ-rearGlass.baseZ),0,1));
const baseGlassWidth=z=>lerp(.745,.731,(z-rearGlass.baseZ)/(frontGlass.baseZ-rearGlass.baseZ));

function sideCabin(side,z,y) {
  const t=T.MathUtils.clamp((z-rearGlass.roofZ)/(frontGlass.roofZ-rearGlass.roofZ),0,1);
  const [topWidth,topY,topZ]=roofPoint(1,t);
  const slope=(baseGlassWidth(topZ)-topWidth)/(topY-cabinBase(topZ));
  return [side*(baseGlassWidth(z)-(y-cabinBase(z))*slope),y,z];
}

function screenPoint(front,u,t) {
  const section=front?frontGlass:rearGlass;
  const edgeRoof=roofPoint(1,front?1:0);
  const top=roofPoint((u+1)/2,front?1:0);
  const camber=1-u*u;
  const y=lerp(section.baseY,edgeRoof[1],t)+(front?.009:.005)*Math.sin(t*Math.PI);
  const z=lerp(section.baseZ,edgeRoof[2],t);
  const x=sideCabin(1,z,y)[0];
  return [
    x*u,
    y+(top[1]-edgeRoof[1])*t+.013*camber*(1-t),
    z+(top[2]-edgeRoof[2])*t+(front?.039:-.030)*camber*(1-t)
  ];
}

function alloy(spec,m) {
  const group=new T.Group();
  const radius=17*.0254/2;
  const gold=finishMaterial('#bfa061','wheel',.30,.76);
  rimBarrel(group,gold,radius,spec.tireWidth);
  for(const side of [-1,1]) {
    const lip=side*spec.tireWidth*.425;
    const dish=lip-side*.032;
    ring(group,gold,[lip,0,0],radius*.958,.0055);
    // Ten forked forged spokes. Their roots are broad and dished inward,
    // with a rounded rectangular section across the two outer branches.
    for(let spoke=0;spoke<10;spoke++) {
      const angle=spoke*Math.PI/5;
      for(const branch of [-1,1]) {
        surface(group,gold,15,12,(u,t)=>{
          const rho=lerp(.255,.957,u);
          const a=angle+branch*(.026+.133*u**1.3);
          const around=t*Math.PI*2;
          const width=lerp(.0105,.0059,u);
          const sidewall=Math.cos(around)*width;
          const x=lerp(dish,lip-.004*side,u**.82)+side*.0064*Math.sin(around);
          return [x,Math.cos(a)*radius*rho-Math.sin(a)*sidewall,
            Math.sin(a)*radius*rho+Math.cos(a)*sidewall];
        },side<0);
      }
    }
    cylinder(group,gold,[dish,0,0],radius*.272,.025,'x',48);
    cylinder(group,m.glossBlack,[dish+side*.014,0,0],radius*.135,.006,'x',40);
    for(let lug=0;lug<5;lug++) {
      const a=lug*Math.PI*2/5;
      const p=[dish+side*.012,Math.cos(a)*radius*.204,Math.sin(a)*radius*.204];
      cylinder(group,m.dark,p,.010,.008,'x',16);
      p[0]+=side*.006;
      cylinder(group,m.satinMetal,p,.0064,.014,'x',6);
    }
    label(group,m.satinMetal,'BBS',.040,.013,[dish+side*.020,-.006,0],side*Math.PI/2);
  }
  group.name='22b-gold-ten-paired-spoke-17in-wheel';
  return group;
}

function addSidePanels(g,m,spec,side) {
  const bump=Math.max(.055,spec.suspension.travel*.58);
  const archRun=axle=>axle===frontAxle?frontArchRadius:archRadius;
  const arch=(axle,u,lip=0)=>{
    const angle=u*Math.PI;
    const end=Math.cos(angle);
    // Clearance over the compressed tread, with the arch ends rolled down
    // past its reach. The front opening also clears the steered shoulders.
    const rise=axle===frontAxle?.339:.335;
    return [axle-(archRun(axle)+lip)*end,
      spec.tireRadius+bump*(1-end**8)+(rise+lip)*Math.sin(angle)];
  };
  const flat=(a,b,u)=>{
    const z=lerp(a,b,u);
    return [z,sill(z)];
  };
  const spans=[
    [rearZ,rearAxle-archRadius,null,40],
    [0,0,rearAxle,60],
    [rearAxle+archRadius,frontAxle-frontArchRadius,null,86],
    [0,0,frontAxle,60],
    [frontAxle+frontArchRadius,frontZ,null,40]
  ];
  for(const [a,b,axle,segments] of spans) {
    surface(g,m.paint,segments,20,(u,t)=>{
      const [z,low]=axle===null?flat(a,b,u):arch(axle,u);
      return sidePoint(side,z,lerp(low,sideTop(z),t));
    },side>0).name='22b-continuous-widebody-quarter';
  }
  surface(g,m.paint,210,10,(u,t)=>shoulderPoint(side,lerp(rearZ,frontZ,u),t),side<0)
    .name='22b-rounded-quarter-shoulder-'+side;
  for(const axle of [rearAxle,frontAxle]) {
    surface(g,m.paint,72,5,(u,t)=>{
      const [z,y]=arch(axle,lerp(1+.09/Math.PI,-.09/Math.PI,u),lerp(0,.015,t));
      return sidePoint(side,z,y,.0038*Math.sin(t*Math.PI)+.0007);
    },side<0).name='22b-rolled-open-arch';
    const innerWheelhouseX=side*innerWheelhouse;
    surface(g,m.dark,64,8,(u,t)=>{
      const [z,y]=arch(axle,u);
      return blend(sidePoint(side,z,y,-.003),[innerWheelhouseX,y-.004,z],t);
    },side<0).name='22b-wheelhouse-return';
    surface(g,m.dark,64,8,(u,t)=>{
      const [z,y]=arch(axle,u);
      return [innerWheelhouseX,lerp(sill(z),y-.004,t),z];
    },side>0).name='22b-wheelhouse-inner-wall';
  }
  surface(g,m.paint,60,12,(u,t)=>{
    const z=lerp(-.903,.903,u);
    const y=sill(z)+.072*t-.013*Math.sin(t*Math.PI);
    return sidePoint(side,z,y,.024*Math.sin(t*Math.PI)*Math.sin(u*Math.PI)**.30);
  },side>0).name='22b-molded-side-skirt';

  const door=roundedContour([
    [-.489,.886],[-.515,.752],[-.510,.301],[-.463,.243],
    [.687,.241],[.775,.294],[.785,.736],[.747,.873]
  ],.034,6);
  line(g,m.black,[...door,door[0]].map(([z,y])=>sidePoint(side,z,y,.0008)),.00145)
    .name='22b-long-door-reveal';
  const moldingRear=rearAxle+archRadius+.012,moldingFront=frontAxle-frontArchRadius-.012;
  const rubbing=roundedContour([[moldingRear,.525],[moldingFront,.525],[moldingFront,.540],[moldingRear,.540]],.010);
  mappedPolygon(g,m.paint,rubbing,(z,y)=>sidePoint(side,z,y,.005),[],side>0,5);
  const handle=roundedContour([[-.425,.726],[-.238,.724],[-.228,.768],[-.407,.773]],.017);
  mappedPolygon(g,m.glossBlack,handle,(z,y)=>sidePoint(side,z,y,.005),[],side>0,5);
  const pull=roundedContour([[-.407,.755],[-.244,.754],[-.241,.770],[-.404,.772]],.011);
  mappedPolygon(g,m.paint,pull,(z,y)=>sidePoint(side,z,y,.011),[],side>0,4);
  const marker=roundedContour([[.878,.693],[.993,.694],[1.006,.713],[.983,.728],[.890,.727]],.012);
  mappedPolygon(g,m.glossBlack,inset(marker,1.06),(z,y)=>sidePoint(side,z,y,.0032),[],side>0,4);
  mappedPolygon(g,m.amber,marker,(z,y)=>sidePoint(side,z,y,.0068),[],side>0,4);
}

function addCoupeCabin(g,m,side) {
  const rearTop=roofPoint(1,0),frontTop=roofPoint(1,1);
  const top=z=>{
    if(z<rearTop[2]||z>frontTop[2]){
      const front=z>frontTop[2];
      const section=front?frontGlass:rearGlass;
      const roof=front?frontTop:rearTop;
      return screenPoint(front,1,(z-section.baseZ)/(roof[2]-section.baseZ))[1];
    }
    return roofPoint(1,(z-rearTop[2])/(frontTop[2]-rearTop[2]))[1];
  };
  const windows=[
    [[-1.221,1.008],[-1.170,1.095],[-1.05,1.182],[-.823,1.301],
      [-.708,1.326],[-.521,1.332]],
    [[-.474,1.332],[-.192,1.337],[.133,1.306],[.424,1.157],[.639,.996],[.744,.927]]
  ];
  const pieces=new T.Group();
  const strip=(a,b,rows,bottom,upper)=>{
    const edges=[a,...[rearTop[2],frontTop[2]].filter(z=>z>a&&z<b),b];
    for(let i=1;i<edges.length;i++){
      const start=edges[i-1],end=edges[i];
      const steps=Math.max(2,Math.ceil(rows*(end-start)/(b-a)));
      surface(pieces,m.paint,steps,5,(u,t)=>{
        const z=lerp(start,end,u);
        return sideCabin(side,z,lerp(bottom(z),upper(z),t));
      },side>0);
    }
  };
  let previous=rearGlass.baseZ;
  for(const stations of windows) {
    const a=stations[0][0],b=stations.at(-1)[0];
    const low=z=>cabinBase(z)+.014;
    const high=z=>Math.min(top(z)-.016,Math.max(low(z)+.006,station(stations,z,1)));
    strip(previous,a,34,cabinBase,top);
    strip(a,b,90,cabinBase,low);
    strip(a,b,90,high,top);
    const boundary=[[0,0],[1,0],[1,1],[0,1]];
    const opening=roundedContour(boundary,.036,7);
    const map=(u,t)=>{
      const z=lerp(a,b,u);
      return sideCabin(side,z,lerp(low(z),high(z),t));
    };
    mappedPolygon(g,m.glossBlack,boundary,map,[opening],side>0,6);
    pane(g,{...m,glass:a<-.8?m.privacyGlass:m.glass},opening,map,side>0);
    previous=b;
  }
  strip(previous,frontGlass.baseZ,34,cabinBase,top);
  // Weld the paint strips into one section. The two lower corner ends
  // collapse onto the belt rail, so omit their zero-area triangles.
  const vertices=[],normals=[],uvs=[],indices=[];
  const p0=new T.Vector3(),p1=new T.Vector3(),p2=new T.Vector3();
  for(const piece of pieces.children) {
    const geometry=piece.geometry;
    const {position,normal,uv}=geometry.attributes;
    const offset=vertices.length/3;
    for(let i=0;i<position.count;i++){
      vertices.push(position.getX(i),position.getY(i),position.getZ(i));
      normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));
      uvs.push(uv.getX(i),uv.getY(i));
    }
    for(let i=0;i<geometry.index.count;i+=3) {
      const a=geometry.index.getX(i),b=geometry.index.getX(i+1),c=geometry.index.getX(i+2);
      p0.fromBufferAttribute(position,a);
      p1.fromBufferAttribute(position,b).sub(p0);
      p2.fromBufferAttribute(position,c).sub(p0);
      if(p1.cross(p2).lengthSq()>1e-18)indices.push(a+offset,b+offset,c+offset);
    }
    geometry.dispose();
  }
  const frame=new T.BufferGeometry();
  frame.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  frame.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  frame.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  frame.setIndex(indices);
  mesh(g,frame,m.paint).name='22b-stamped-side-window-frame-'+side;
  surface(g,m.paint,104,7,(u,t)=>{
    const z=lerp(rearGlass.baseZ,frontGlass.baseZ,u);
    return blend(shoulderPoint(side,z),sideCabin(side,z,cabinBase(z)),t);
  },side>0).name='22b-greenhouse-belt-return-'+side;

  const mirrorX=side*.871;
  const mirrorY=.956;
  const mirrorZ=.738;
  rod(g,m.glossBlack,[side*.729,.928,.772],[side*.832,.941,.755],.023,16);
  const mirrorOutline=roundedContour([
    [-.084,-.031],[.057,-.041],[.087,-.019],[.087,.018],
    [.059,.042],[-.062,.037],[-.090,.014]
  ],.023,7);
  const mirrorBack=(u,v,depth=0)=>[mirrorX+side*u,mirrorY+v,mirrorZ-.065+.20*u+depth];
  const surround=inset(mirrorOutline,1.08);
  const lens=inset(mirrorOutline,.87);
  const mirrorNose=inset(mirrorOutline,.57);
  // Both sheets need the same short chords along the curved nose rim.
  const edgeSteps=mirrorNose.map(([u,v],i)=>{
    const [nextU,nextV]=mirrorNose[(i+1)%mirrorNose.length];
    return Math.ceil(Math.hypot(nextU-u,nextV-v)/.008);
  });
  const sampleRim=outline=>outline.flatMap((p,i)=>Array.from({length:edgeSteps[i]},(_,j)=>
    blend(p,outline[(i+1)%outline.length],j/edgeSteps[i])));
  const rim=sampleRim(mirrorNose);
  const mirrorDepth=.119;
  const crown=(u,v,depth)=>mirrorBack(u,v,depth+.012*(depth/mirrorDepth)**2*(1-(u/.09)**2));
  panelReturn(g,m.paint,sampleRim(surround),rim,crown,mirrorDepth,side>0).name='22b-rounded-mirror-shell-'+side;
  mappedPolygon(g,m.paint,rim,(u,v)=>crown(u,v,mirrorDepth),[],side<0,6).name='22b-crowned-mirror-cap-'+side;
  mappedPolygon(g,m.glossBlack,surround,mirrorBack,[lens],side>0,5);
  mappedPolygon(g,m.satinMetal,lens,(u,v)=>mirrorBack(u,v,.004),[],side>0,5);
}

function addUpperPanels(g,m) {
  surface(g,m.paint,80,68,bonnet,true).name='22b-crowned-bonnet';
  surface(g,m.paint,64,36,deck,true).name='22b-rounded-trunk-deck';
  surface(g,m.paint,60,54,roofPoint,true).name='22b-crowned-short-coupe-roof';
  for(const front of [true,false]) {
    const outline=[[-1,0],[1,0],[1,1],[-1,1]];
    const window=roundedContour([[-.955,.033],[.955,.033],[.964,.95],[-.964,.95]],.054,8);
    const map=(u,t)=>screenPoint(front,u,t);
    mappedPolygon(g,m.paint,outline,map,[window],!front,8)
      .name=front?'22b-formed-front-window-surround':'22b-formed-rear-window-surround';
    const glass=pane(g,{...m,glass:front?m.windscreen:m.privacyGlass},window,map,!front);
    glass.userData.screenSide=front?'front':'rear';

    const panel=front?bonnet:deck;
    const end=front?0:1;
    surface(g,m.paint,84,8,(u,t)=>blend(screenPoint(front,2*u-1,0),panel(u,end),t),true)
      .name=front?'22b-closed-cowl':'22b-closed-rear-window-sill';
    for(const side of [-1,1]) {
      surface(g,m.paint,14,6,(u,t)=>{
        const a=screenPoint(front,side,0);
        const b=panel((side+1)/2,end);
        const z=lerp(a[2],b[2],u);
        return blend(shoulderPoint(side,z),blend(a,b,u),t);
      },side>0).name=(front?'22b-cowl-corner-return-':'22b-rear-sill-corner-return-')+side;
    }
  }
  for(const side of [-1,1]) {
    for(const [name,panel,low,high] of [
      ['22b-bonnet-edge-return-',bonnet,bonnetStart,frontZ],
      ['22b-boot-edge-return-',deck,rearZ,deckEnd]
    ]) {
      surface(g,m.paint,125,5,(u,t)=>blend(
        shoulderPoint(side,lerp(low,high,u)),panel((side+1)/2,u),t
      ),side>0).name=name+side;
      const seam=Array.from({length:81},(_,i)=>{
        const p=panel((side+1)/2,i/80);
        p[1]+=.00045;
        return p;
      });
      line(g,m.glossBlack,seam,.0012);
    }
  }
  for(const [front,a,b] of [[true,-.81,-.12],[true,-.09,.63],[false,-.58,.13]]) {
    const blade=Array.from({length:16},(_,i)=>{
      const t=i/15;
      const p=screenPoint(front,lerp(a,b,t),.070+.035*t);
      p[1]+=.006;
      p[2]+=front?.006:-.006;
      return p;
    });
    line(g,m.black,blade,.0034);
    const pivot=screenPoint(front,a+.09,.022);
    const tip=blade[8];
    rod(g,m.glossBlack,pivot,tip,.0044,8);
  }
}

function addBonnetDetails(g,m) {
  const scoop=(u,t)=>{
    const s=2*u-1;
    const x=s*lerp(.252,.293,t);
    const z=lerp(.974,1.410,t)-.018*s*s*t;
    const rise=.068*t**1.36*(.10+.90*Math.max(0,1-s*s)**.46);
    return [x,bonnetHeight(x,z)+rise+.002,z];
  };
  surface(g,m.paint,48,28,scoop,true).name='22b-open-scoop-roof';
  for(const side of [-1,1]) {
    surface(g,m.paint,28,6,(u,t)=>{
      const p=scoop((side+1)/2,u);
      p[1]=lerp(bonnetHeight(p[0],p[2])+.0007,p[1],t);
      return p;
    },side>0);
  }
  surface(g,m.glossBlack,48,9,(u,t)=>{
    const p=scoop(u,1);
    p[2]-=.023;
    p[1]=lerp(bonnetHeight(p[0],p[2])+.002,p[1]-.005,t);
    return p;
  }).name='22b-recessed-intercooler-mouth';
  surface(g,m.paint,48,5,(u,t)=>{
    const p=scoop(u,1);
    p[2]-=.019*t;
    p[1]-=.005*t;
    return p;
  },true);
  for(const x of [-.205,-.102,0,.102,.205]) {
    const top=scoop((x/.293+1)/2,1);
    rod(g,m.dark,[x,bonnetHeight(x,1.39)+.003,1.389],[x,top[1]-.004,1.389],.0028,8);
  }
  for(const side of [-1,1]) {
    const outline=roundedContour([[.437,1.179],[.642,1.194],[.630,1.413],[.460,1.428]],.027,7);
    const aperture=inset(outline,.84);
    const map=(x,z)=>[side*x,bonnetHeight(x,z)+.005,z];
    mappedPolygon(g,m.paint,outline,map,[aperture],side>0,6);
    mappedPolygon(g,m.grille,aperture,(x,z)=>[side*x,bonnetHeight(x,z)+.0018,z],[],side>0,6);
    for(let rib=0;rib<4;rib++) {
      const z=1.222+rib*.043;
      surface(g,m.paint,12,4,(u,t)=>{
        const x=lerp(.463,.612,u);
        const z1=z+lerp(-.006,.007,t)+.009*u;
        return [side*x,bonnetHeight(x,z1)+.006+.008*Math.sin(t*Math.PI),z1];
      },side>0);
    }
  }
}

function fasciaOutline(z,height) {
  const side=Array.from({length:21},(_,i)=>sidePoint(1,z,lerp(sill(z),sideTop(z),i/20)).slice(0,2));
  const radius=Array.from({length:10},(_,i)=>shoulderPoint(1,z,1-i/9).slice(0,2)).slice(1);
  const width=shoulderPoint(1,z)[0];
  const top=Array.from({length:65},(_,i)=>{
    const x=lerp(width,-width,i/64);
    return [x,height(x,z)];
  });
  const shoulder=[...side,...radius];
  return {
    contour:[...shoulder,...top,...shoulder.slice().reverse().map(([x,y])=>[-x,y])],
    side:[-1,1].flatMap(sign=>side.map(([x,y])=>[sign*x,y])),
    upper:top
  };
}

const nose=(x,y,depth=0)=>[x,y,frontZ-endSetback(x,y,true)-depth];
const tail=(x,y,depth=0)=>[x,y,rearZ+endSetback(x,y,false)+depth];

function recessed(g,m,hole,map,depth,flip=false) {
  const inside=inset(hole,.94);
  panelReturn(g,m.paint,hole,inside,map,depth*.39,flip);
  mappedPolygon(g,m.grille,inside,(x,y)=>map(x,y,depth),[],flip,6);
  panelReturn(g,m.black,inside,inset(hole,.91),(x,y,d)=>map(x,y,depth*.39+d),depth*.61,flip);
}

// The fog cover graphic is laid onto the cap surface with a small paint offset.
const fogCoverSti=[
  [[.284,.97],[.048,.97],[.014,.85],[.014,.54],[.048,.42],[.191,.42],
    [.191,.21],[.013,.21],[.013,.04],[.250,.04],[.290,.16],[.290,.48],
    [.250,.60],[.105,.60],[.105,.80],[.284,.80]],
  [[.345,.97],[.683,.97],[.683,.80],[.562,.80],[.562,.04],[.465,.04],
    [.465,.80],[.345,.80]],
  [[.759,.67],[.857,.67],[.857,.04],[.759,.04]],
  [[.759,.91],[.857,.91],[.857,.77],[.759,.77]]
];

function addFront(g,m) {
  const outline=fasciaOutline(frontZ,bonnetHeight);
  const grille=roundedContour([[-.347,.655],[.347,.655],[.303,.568],[-.303,.568]],.025,8);
  const lower=roundedContour([[-.444,.469],[.444,.469],[.378,.254],[-.378,.254]],.043,8);
  const lenses=[-1,1].map(side=>roundedContour([
    [side*.365,.565],[side*.802,.565],[side*.822,.634],
    [side*.786,.663],[side*.420,.669],[side*.387,.644]
  ],.022,7));
  const corners=[-1,1].map(side=>roundedContour([
    [side*.645,.455],[side*.817,.455],[side*.815,.411],
    [side*.773,.304],[side*.687,.298],[side*.655,.342]
  ],.025,7));
  const openings=[grille,lower,...lenses,...corners];
  const fascia=mappedPolygon(g,m.paint,outline.contour,nose,openings,false,6);
  fascia.name='22b-perforated-curved-front-bumper';
  fascia.userData.contours={outline:outline.contour,openings};
  recessed(g,m,grille,nose,.042);
  recessed(g,m,lower,nose,.067);
  for(const hole of corners)recessed(g,m,hole,nose,.051);
  for(let i=0;i<23;i++) {
    const x=lerp(-.343,.343,i/22);
    const y=lerp(.278,.444,Math.abs(x)/.343*.21);
    rod(g,m.dark,nose(x,y,.053),nose(x,.448,.053),.0022,6);
  }
  for(const y of [.306,.349,.395,.432])rod(g,m.grille,nose(-.364,y,.051),nose(.364,y,.051),.0028,6);
  for(let i=0;i<13;i++) {
    const x=lerp(-.272,.272,i/12);
    for(const dir of [-1,1])rod(g,m.grille,nose(x-.020*dir,.583,.028),nose(x+.020*dir,.644,.028),.002,6);
  }

  for(const [i,side] of [-1,1].entries()) {
    const rim=lenses[i];
    const face=inset(rim,.974);
    panelReturn(g,m.glossBlack,rim,face,nose,.007);
    // Distinct main reflector, sidelight and fluted cover.
    mappedPolygon(g,m.satinMetal,face,(x,y)=>nose(x,y,.027+.010*gauss(x,side*.55,.11)),[],false,8);
    for(const [x,rx] of [[.522,.103],[.674,.047],[.781,.029]]) {
      const p=oval(side*x,.620,rx,.036);
      mappedPolygon(g,m.chrome,p,(a,b)=>{
        const v=((a-side*x)/rx)**2+((b-.620)/.036)**2;
        return nose(a,b,.011+.023*Math.max(0,1-v));
      },[],false,5);
      cylinder(g,m.white,nose(side*x,.619,.020),.012,.013,'z',16);
    }
    for(let rib=0;rib<17;rib++) {
      const x=side*lerp(.407,.782,rib/16);
      rod(g,m.satinMetal,nose(x,.574,.006),nose(x,.646+.010*(rib/16),.006),.0009,5);
    }
    rod(g,m.glossBlack,nose(side*.748,.567,.002),nose(side*.748,.658,.002),.0025,8);
    mappedPolygon(g,m.lens,face,(x,y)=>nose(x,y,-.0018),[],false,5).name='22b-clear-fluted-headlamp-cover';

    const amber=roundedContour([[side*.652,.397],[side*.806,.398],[side*.813,.442],[side*.651,.442]],.009);
    mappedPolygon(g,m.amber,amber,(x,y)=>nose(x,y,.011),[],false,6);
    for(let rib=0;rib<13;rib++) {
      const x=side*lerp(.664,.798,rib/12);
      rod(g,m.satinMetal,nose(x,.403,.011),nose(x,.438,.011),.0008,6);
    }

    const centerX=side*.533;
    const centerY=.348;
    const cap=oval(centerX,centerY,.106,.105,48).map(([x,y],j)=>{
      const factor=1+.027*Math.cos(j*Math.PI/4);
      return [lerp(centerX,x,factor),lerp(centerY,y,factor)];
    });
    mappedPolygon(g,m.glossBlack,inset(cap,1.045),(x,y)=>nose(x,y,-.002),[],false,4);
    const capFace=(x,y,paintOffset=0)=>nose(x,y,-.006-.013*(1-((x-centerX)/.11)**2)-paintOffset);
    mappedPolygon(g,m.paint,cap,capFace,[],false,6).name='22b-contoured-sti-fog-cover';
    for(const letter of fogCoverSti) {
      const mark=letter.map(([u,v])=>[centerX+(u-.46)*.132+.009*v,centerY+(v-.54)*.043]);
      mappedPolygon(g,m.white,mark,(x,y)=>capFace(x,y,.0011),[],false,5).name='22b-fog-cover-sti-inlay';
    }
    cylinder(g,m.satinMetal,nose(centerX,centerY+.084,-.016),.0038,.0025,'z',10);
  }

  const pink=finishMaterial('#a53762','paint',.36);
  mappedPolygon(g,m.chrome,oval(0,.612,.044,.028),(x,y)=>nose(x,y,-.004),[],false,5);
  mappedPolygon(g,pink,oval(0,.612,.039,.024),(x,y)=>nose(x,y,-.006),[],false,5);
  for(const [x,y,size] of [[-.012,.613,.012],[.009,.620,.006],[.020,.612,.006],[.004,.607,.005],[.019,.602,.004],[.010,.600,.003]]) {
    mappedPolygon(g,m.satinMetal,[[x-size,y],[x,y+size*.36],[x+size,y],[x,y-size*.36]],
      (u,v)=>nose(u,v,-.0078),[],false,2);
  }
  return {front:true,side:outline.side.map(([x,y])=>nose(x,y)),upper:outline.upper.map(([x,y])=>nose(x,y))};
}

function addWing(g,m) {
  const support=roundedContour([
    [-1.621,.939],[-2.003,.927],[-2.079,1.271],
    [-1.854,1.281],[-1.721,1.141]
  ],.046,8);
  const upright=(side,z,y,d=0)=>{
    const t=T.MathUtils.smoothstep(y,.931,1.27);
    return [side*(lerp(.695,.615,t)+d),y,z];
  };
  for(const side of [-1,1]) {
    const outside=(z,y,d=0)=>upright(side,z,y,.021-d);
    const inside=inset(support,.94);
    mappedPolygon(g,m.paint,support,outside,[],side>0,8).name='22b-wing-endplate';
    mappedPolygon(g,m.paint,inside,(z,y)=>upright(side,z,y,-.017),[],side<0,8);
    panelReturn(g,m.paint,support,inside,outside,.038,side>0);
  }
  const foil=(u,t,under=false)=>{
    const x=(2*u-1)*.634;
    const z=lerp(-1.842,-2.064,t)+.023*(1-(2*u-1)**2);
    return [x,1.259+.023*Math.sin(t*Math.PI)-.006*(2*u-1)**2-(under?.024:0),z];
  };
  surface(g,m.paint,66,22,foil).name='22b-adjustable-rear-wing';
  surface(g,m.paint,66,22,(u,t)=>foil(u,t,true),true);
  for(const t of [0,1])surface(g,m.paint,66,4,(u,d)=>blend(foil(u,t),foil(u,t,true),d),t===1);
  surface(g,m.paint,56,12,(u,t)=>{
    const x=(2*u-1)*.689;
    return [x,.965+.014*Math.sin(t*Math.PI)-.012*(2*u-1)**2,lerp(-1.885,-2.035,t)];
  }).name='22b-wing-lower-bridge';
  box(g,m.glossBlack,[0,.966,-2.040],[.324,.028,.017],.009);
  box(g,m.red,[0,.967,-2.050],[.288,.010,.008],.004);
}

function addRear(g,m) {
  const outline=fasciaOutline(rearZ,deckHeight);
  const plate=roundedContour([[-.292,.489],[.292,.489],[.268,.287],[-.268,.287]],.027,7);
  const lampShape=side=>roundedContour([
    [side*.386,.611],[side*.816,.610],[side*.819,.680],
    [side*.791,.748],[side*.728,.773],[side*.441,.771],[side*.395,.746]
  ],.024,8);
  const lamps=[-1,1].map(lampShape);
  mappedPolygon(g,m.paint,outline.contour,tail,[plate,...lamps],true,6)
    .name='22b-formed-rear-closure';
  recessed(g,m,plate,tail,.065,true);
  const plateInset=roundedContour([[-.213,.433],[.213,.433],[.213,.315],[-.213,.315]],.011);
  mappedPolygon(g,m.white,plateInset,(x,y)=>tail(x,y,.051),[],true,5);
  label(g,m.black,'22B STI',.285,.045,tail(0,.339,.046),Math.PI);
  for(const x of [-.18,.18])cylinder(g,m.satinMetal,tail(x,.415,.046),.004,.004,'z',12);

  const unlitRed=finishMaterial('#72101c','paint',.38);
  const tailCover=m.lens.clone();
  tailCover.color.set('#9f2227');
  tailCover.opacity=.40;
  for(const [i,side] of [-1,1].entries()) {
    const rim=lamps[i],lens=inset(rim,.965);
    panelReturn(g,m.glossBlack,rim,lens,tail,.008,true);
    mappedPolygon(g,unlitRed,lens,(x,y)=>tail(x,y,.012),[],true,7);
    const clear=roundedContour([
      [side*.402,.618],[side*.804,.616],[side*.803,.658],[side*.404,.661]
    ],.008,5);
    mappedPolygon(g,m.satinMetal,clear,(x,y)=>tail(x,y,.004),[],true,6);
    mappedPolygon(g,m.reverse,roundedContour([
      [side*.408,.624],[side*.506,.623],[side*.506,.655],[side*.409,.655]
    ],.006),(x,y)=>tail(x,y,.002),[],true,5);
    const lit=roundedContour([[side*.439,.688],[side*.766,.685],[side*.755,.722],[side*.444,.728]],.014);
    mappedPolygon(g,m.red,lit,(x,y)=>tail(x,y,.007),[],true,6);
    mappedPolygon(g,tailCover,lens,(x,y)=>tail(x,y,-.0015),[],true,6);
    const reveal=Array.from({length:24},(_,j)=>{
      const t=j/23;
      return tail(side*lerp(.384,.590,t*t),lerp(.583,.904,t),-.0006);
    });
    line(g,m.glossBlack,reveal,.00125);
  }
  const trim=roundedContour([[-.487,.225],[.489,.225],[.463,.277],[-.462,.277]],.023,7);
  mappedPolygon(g,m.dark,trim,(x,y)=>tail(x,y,-.003),[],true,5);
  box(g,m.glossBlack,tail(.313,.670,-.002),[.111,.037,.006],.005);
  label(g,m.badge,'22B',.076,.022,tail(.313,.661,-.008),Math.PI);
  cylinder(g,m.satinMetal,tail(-.277,.667,-.004),.008,.004,'z',18);

  const exit=tail(.390,.244,-.043);
  const pipe=cylinder(g,m.satinMetal,[exit[0],exit[1],exit[2]+.108],.046,.217,'z',40);
  pipe.name='22b-left-side-tailpipe';
  ring(g,m.satinMetal,exit,.044,.004,'z');
  cylinder(g,m.glossBlack,[exit[0],exit[1],exit[2]+.008],.039,.004,'z',32);
  addWing(g,m);
  return {front:false,side:outline.side.map(([x,y])=>tail(x,y)),upper:outline.upper.map(([x,y])=>tail(x,y))};
}

function floorPanel(g,material,y,thickness,side) {
  const outline=roundedContour([...side,...side.slice().reverse().map(([x,z])=>[-x,z])],.020);
  const map=(x,z,depth=0)=>[x,y+depth,z];
  mappedPolygon(g,material,outline,map,[],false,1);
  mappedPolygon(g,material,outline,(x,z)=>map(x,z,thickness),[],true,1);
  panelReturn(g,material,outline,outline,map,thickness,true);
}

function addInterior(g,m) {
  floorPanel(g,m.interior,.2595,.061,[
    [innerWheelhouse,-1.250],[innerWheelhouse,rearAxle+archRadius],[.695,rearAxle+archRadius],[.695,.650]
  ]);
  box(g,m.interior,[0,.824,.635],[1.42,.135,.415],.060).name='22b-curved-dash';
  box(g,m.interior,[0,.787,-1.283],[1.45,.039,.398],.014).name='22b-rear-parcel-shelf';
  box(g,m.upholstery,[0,.435,-.91],[1.23,.144,.429],.053);
  box(g,m.upholstery,[0,.655,-1.092],[1.23,.355,.139],.065);
  for(const x of [-.354,.354]) {
    box(g,m.interior,[x,.490,-.181],[.490,.138,.529],.062);
    box(g,m.upholstery,[x,.531,-.162],[.321,.101,.435],.052);
    const shell=box(g,m.interior,[x,.735,-.359],[.488,.588,.161],.073);
    shell.rotation.x=-.19;
    const pad=box(g,m.upholstery,[x,.742,-.279],[.313,.484,.089],.053);
    pad.rotation.x=-.19;
    for(const side of [-1,1]) {
      const bolster=box(g,m.interior,[x+side*.199,.750,-.279],[.104,.470,.145],.045);
      bolster.rotation.x=-.19;
    }
    box(g,m.interior,[x,1.087,-.403],[.253,.235,.137],.062);
    box(g,m.upholstery,[x,1.068,-.329],[.164,.111,.021],.025);
  }
  const driver=-.342;
  box(g,m.black,[driver,.893,.566],[.312,.145,.189],.054);
  for(const x of [driver-.070,driver+.069])cylinder(g,m.white,[x,.901,.473],.043,.008,'z',32);
  const center=[driver,.894,.348];
  ring(g,m.glossBlack,center,.155,.015,'z').rotation.x=-.26;
  cylinder(g,m.black,center,.068,.032,'z',32);
  for(const angle of [.32,Math.PI-.32,-Math.PI/2])rod(g,m.satinMetal,center,
    [driver+.146*Math.cos(angle),.894+.146*Math.sin(angle),.348],.012,8);
  box(g,m.interior,[0,.580,.058],[.204,.224,.558],.041);
  rod(g,m.satinMetal,[0,.677,.211],[0,.814,.197],.010,10);
  cylinder(g,m.glossBlack,[0,.828,.197],.028,.036,'y',24);
  box(g,m.dark,[0,1.234,.298],[.172,.047,.026],.015);
  box(g,m.satinMetal,[0,1.234,.282],[.148,.031,.006],.009);
}

export function subaru22bView(spec=SUBARU_22B_SPEC) {
  const view=newReferenceView(spec);
  const g=view.body,m=view.materials;
  m.paint.color.set('#124878');
  m.paint.metalness=.34;
  m.glass.color.set('#263844');
  m.glass.opacity=.45;
  m.windscreen.color.set('#33434e');
  m.windscreen.opacity=.39;
  m.privacyGlass.color.set('#24303c');
  m.privacyGlass.opacity=.61;
  m.lens.userData.nativeRole='lens';
  m.amber.emissiveIntensity=.022;
  for(const side of [-1,1]) {
    addSidePanels(g,m,spec,side);
    addCoupeCabin(g,m,side);
  }
  addUpperPanels(g,m);
  addBonnetDetails(g,m);
  const front=addFront(g,m),rear=addRear(g,m);
  addInterior(g,m);
  floorPanel(g,m.dark,.1505,.037,[
    [innerWheelhouse,-1.775],[innerWheelhouse,rearAxle+archRadius],[.690,rearAxle+archRadius],
    [.690,frontAxle-frontArchRadius],[innerWheelhouse,frontAxle-frontArchRadius],[innerWheelhouse,1.775]
  ]);
  Object.assign(view.root.userData,{
    nativeConstruction:{
      version:4,endClosureRevision:3,greenhouseClosureRevision:3,bodySurfaceRevision:2,
      automotiveFinishes:true,originalReferenceGeometry:true,realWindowApertures:true,geometryLettering:true
    },
    bodyRefinement:{
      version:3,style:'subaru22b',
      method:'Stock photo-matched coupe profile, rounded bumper returns, split lens optics and molded wing',
      preservedHardpoints:true
    },
    visualModel:{version:2,landmarks:SUBARU_22B_LANDMARKS},
    nativeFidelity:{version:4,factorySpokeProfile:'22b-17in-gold-BBS',bodyClearcoat:true,geometryLettering:true},
    endClosureSamples:[front,rear]
  });
  return view;
}

export const refineSubaru22b=(view,spec=view.spec)=>refineReferenceWheel(view,spec,alloy);
