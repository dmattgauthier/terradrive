// Native cabin fork: continuous upholstery normals and rounded fittings.
import {nativeGeometry as geo} from './vehicle-geometry.mjs';
const {THREE,finish,box,roundedBox,surface,curvedLine,cylinder,line}=geo;
// Tangent derivatives on the unit sphere avoid triangle pinching at shoulders.
function surfaceNormals(geometry,map){
 const normal=geometry.attributes.normal,source=new THREE.SphereGeometry(1,geometry.parameters.widthSegments,geometry.parameters.heightSegments).attributes.position;
 const e=.00002,centre=new THREE.Vector3(...map(0,0,0));
 for(let i=0;i<source.count;i++){
  const q=new THREE.Vector3().fromBufferAttribute(source,i).normalize(),axis=Math.abs(q.y)<.85?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
  const a=axis.cross(q).normalize(),b=q.clone().cross(a).normalize();
  const evalAt=(t,sign)=>new THREE.Vector3(...map(...q.clone().addScaledVector(t,sign*e).normalize().toArray()));
  const n=evalAt(a,1).sub(evalAt(a,-1)).cross(evalAt(b,1).sub(evalAt(b,-1))).normalize();
  if(n.dot(new THREE.Vector3(...map(...q.toArray())).sub(centre))<0)n.negate();normal.setXYZ(i,n.x,n.y,n.z);
 }
}
export function nativeInterior({ frontZ, rearZ, floor, dashY, dashZ, width, seatY, roofY, rearSeatY=seatY, rearBackHeight=.48, rearHeadrest={}, doorCards=true, dashboard=true, centerConsole=true }) {
    const g=this.body,m=this.materials,style=this.spec.bodyStyle,van=style==='van',sedan=style==='sedan';
    const cloth=m.upholstery||m.interior;
    const sharedFabric=['g580','g63'].includes(style),insert=sharedFabric?cloth:cloth.clone();
    if(!sharedFabric)insert.color.multiplyScalar(.83);insert.userData.automotive='alcantara';insert.userData.automotiveOwner=style;m.nativeSeatInsert=insert;
    const stitch=sharedFabric?m.headliner:new THREE.MeshStandardMaterial({color:{jeep:'#943c39',bronco:'#a27d4c',sedan:'#535961',van:'#56616b',hummer:'#8a8070'}[style]||'#677077',roughness:.88});
    stitch.userData.automotive='alcantara';stitch.userData.automotiveOwner=style;m.nativeSeatStitch=stitch;
    const signedPower=(v,p)=>Math.sign(v)*Math.abs(v)**p;
    const seatShell=(x,z,seatWidth,low,height,bench=false)=>{
      const shapeY=.64,shapeX=.57,shapeZ=.67;
      const point=(qx,qy,qz)=>{
        const v=(signedPower(qy,shapeY)+1)/2,hx=seatWidth*.5*(1-(bench?.035:.14)*v+.020*Math.sin(v*Math.PI));
        const xx=signedPower(qx,shapeX)*hx,bolster=qz>0&&!bench?.026*Math.exp(-Math.pow((Math.abs(xx/hx)-.74)/.20,2))*Math.sin(v*Math.PI):0;
        return [x+xx,low+v*height,z-.280-.110*v+signedPower(qz,shapeZ)*.064+bolster];
      };
      // A continuous upholstered form wraps the shoulder, side bolsters and
      // rear shell. This removes the previous vertical slab ends and flat cap.
      const geometry=new THREE.SphereGeometry(1,40,28),p=geometry.attributes.position;
      for(let i=0;i<p.count;i++)p.setXYZ(i,...point(p.getX(i),p.getY(i),p.getZ(i)));
      surfaceNormals(geometry,point);finish(new THREE.Mesh(geometry,cloth),g);
      // The separate inset grid needs a small fabric thickness above the
      // shell's own facets; one millimetre let their interpolated faces cross.
      const front=(u,v,offset=.003)=>{
        const qy=signedPower(v*2-1,1/shapeY),span=Math.sqrt(Math.max(0,1-qy*qy));
        const p=point(u*span,qy,Math.sqrt(Math.max(0,1-u*u))*span);p[2]+=offset;return p;
      };
      if(!bench){
        surface(g,insert,22,22,(u,v)=>front((u*2-1)*.50,THREE.MathUtils.lerp(.105,.87,v)));
        for(const side of [-1,1])curvedLine(g,stitch,Array.from({length:25},(_,i)=>front(side*.58,.105+i/24*.770,.004)),.00075);
        // Narrow stitched channels sit on the actual crowned upholstery,
        // rather than a dark plastic rectangle over the backrest.
        for(const x of [-.30,0,.30])curvedLine(g,cloth,Array.from({length:25},(_,i)=>front(x,.20+i/24*.57,.004)),.0009);
        for(const y of [.36,.64])curvedLine(g,stitch,Array.from({length:19},(_,i)=>front((i/9-1)*.49,y,.004)),.00060);
      }else{
        for(const side of [-1,1])curvedLine(g,m.interior,Array.from({length:25},(_,i)=>front(side*.38,.09+i/24*.81,.002)),.0017);
        curvedLine(g,m.interior,Array.from({length:41},(_,i)=>front((i/20-1)*.89,.42,.002)),.0013);
      }
    };
    const seatBack=(x,z,seatWidth,rear=false,center=false)=>{
      const height=rear?rearBackHeight:.53,low=(rear?rearSeatY:seatY)-.035;
      if(!(rear&&sedan))seatShell(x,z,seatWidth,low,height);
      const headY=low+height+(rear?(rearHeadrest.lift??.100):.100),headZ=z-.362;
      const headWidth=rear?(center?(rearHeadrest.centerWidth??rearHeadrest.width??.235):(rearHeadrest.width??.235)):van?.244:style==='bronco'?.251:sedan?.246:.232;
      const headHeight=rear?(center?(rearHeadrest.centerHeight??rearHeadrest.height??.169):(rearHeadrest.height??.169)):van?.209:style==='bronco'?.213:sedan?.193:.207;
      const headDepth=rear?.129:van?.151:style==='bronco'?.162:sedan?.140:.154;
      // A formed cushion has rounded shoulders, a narrower crown and a
      // convex front face. The posts emerge from its underside, not its face.
      const headPoint=(qx,qy,qz)=>{
        const t=signedPower(qy,.65);
        return [signedPower(qx,.57)*headWidth*.5*(1-.08*(t+1)/2),t*headHeight*.5,signedPower(qz,.68)*headDepth*.5-.015*t];
      };
      const headGeo=new THREE.SphereGeometry(1,36,24),hp=headGeo.attributes.position;
      for(let i=0;i<hp.count;i++){
        hp.setXYZ(i,...headPoint(hp.getX(i),hp.getY(i),hp.getZ(i)));
      }
      surfaceNormals(headGeo,headPoint);finish(new THREE.Mesh(headGeo,cloth),g,x,headY,headZ);
      for(const dx of [-headWidth*.265,headWidth*.265]){
        cylinder(g,m.chrome,x+dx,headY-headHeight*.46-.038,headZ+.003,.005,.100,'y',10);
        cylinder(g,m.black,x+dx,low+height+.005,headZ+.003,.013,.009,'y',12);
      }
      const headSeam=Array.from({length:65},(_,i)=>{
        const a=i*Math.PI/32,r=.77,p=headPoint(Math.cos(a)*r,Math.sin(a)*r,Math.sqrt(1-r*r));
        return [x+p[0],headY+p[1],headZ+p[2]+.001];
      });
      curvedLine(g,m.interior,headSeam,.0013);
    };
    const cushion=(x,z,seatWidth)=>{
      roundedBox(g,m.interior,x,seatY-.158,z+.014,seatWidth,.114,.477,.04);
      surface(g,cloth,22,24,(u,v)=>{
        const t=u*2-1,zz=(v-.5)*.48;
        const bolster=.035*Math.exp(-Math.pow((Math.abs(t)-.83)/.20,2));
        return [x+t*(seatWidth*.5-.01),seatY-.100+bolster+.016*Math.sin(v*Math.PI)-.013*Math.cos(v*Math.PI),z+zz];
      },true);
      for(const side of [-1,1])line(g,m.interior,[x+side*seatWidth*.29,seatY-.078,z-.18],[x+side*seatWidth*.29,seatY-.085,z+.18],.0016);
    };
    for(const side of [-1,1]){
      const x=side*width*.27;
      cushion(x,frontZ,.458);seatBack(x,frontZ,.465);
      roundedBox(g,m.black,x,floor+.13,frontZ-.04,.36,.22,.37,.016);
      for(const dx of [-.15,.15])roundedBox(g,m.dark,x+dx,floor+.032,frontZ-.025,.032,.026,.62,.003);
      const buckle=roundedBox(g,m.black,x-side*.238,seatY-.047,frontZ-.03,.030,.080,.049,.006);buckle.rotation.z=side*.15;
      roundedBox(g,m.redPaint,x-side*.238,seatY-.003,frontZ-.03,.022,.008,.031,.002);
    }
    // The Sport sedan has a continuous rear backrest and three head restraints.
    roundedBox(g,cloth,0,rearSeatY-.13,rearZ,width*.92,.17,.47,.045);
    if(sedan)seatShell(0,rearZ,width*.94,rearSeatY-.035,rearBackHeight,true);
    for(const side of [-1,0,1])seatBack(side*width*.295,rearZ,width*.30,true,side===0);
    if(!van&&centerConsole) roundedBox(g,m.black,0,floor+.22,frontZ-.14,.235,.24,.66,.028);
    box(g,m.interior,0,floor,(frontZ+rearZ)/2,width*.98,.035,Math.abs(frontZ-rearZ)+.73);
    const cabinLength=dashZ-rearZ+.40;
    for(const side of [-1,1]){
      if(doorCards){
        roundedBox(g,m.black,side*width*.513,(dashY+floor)/2,(dashZ+rearZ-.4)/2,.028,dashY-floor-.025,cabinLength,.010);
        roundedBox(g,m.interior,side*width*.493,seatY+.038,frontZ,.095,.050,.47,.015);
        line(g,m.chrome,[side*width*.485,seatY+.108,frontZ+.06],[side*width*.485,seatY+.108,frontZ+.205],.006);
      }
      const beltA=new THREE.Vector3(side*width*.495,seatY+.39,frontZ-.28),beltB=new THREE.Vector3(side*width*.481,seatY-.07,frontZ-.04);
      const beltAxis=beltB.clone().sub(beltA),across=new THREE.Vector3(0,beltAxis.z,-beltAxis.y).normalize();
      surface(g,m.interior,2,24,(u,v)=>{
        const p=beltA.clone().lerp(beltB,v).addScaledVector(across,(u-.5)*.046);p.x-=side*.004*Math.sin(v*Math.PI);return p.toArray();
      },side>0).name='formed-flat-seatbelt-'+side;
      roundedBox(g,m.black,beltA.x,beltA.y+.025,beltA.z,.023,.060,.063,.008);
    }
    if(dashboard){
    roundedBox(g,m.black,0,dashY,dashZ,width,.169,.29,.039);
    roundedBox(g,m.interior,0,dashY-.070,dashZ-.124,width*.96,.125,.076,.022);
    const screenMaterial=m.screen||m.dark;
    if(sedan){
      roundedBox(g,m.black,0,dashY+.120,dashZ-.095,.205,.131,.030,.009);
      roundedBox(g,screenMaterial,0,dashY+.130,dashZ-.114,.153,.092,.006,.003);
      for(const x of [-.081,.081])cylinder(g,m.grille,x,dashY+.072,dashZ-.121,.010,.010,'z',16);
      roundedBox(g,m.grille,0,dashY-.015,dashZ-.174,width*.86,.053,.012,.006);
      for(let i=-26;i<=26;i++)line(g,m.black,[i*width*.016,-.012+dashY,dashZ-.183],[i*width*.016+.014,.010+dashY,dashZ-.183],.0016);
    } else {
      const screenWidth=van?.238:style==='bronco'?.430:.405,screenHeight=van?.146:style==='bronco'?.255:.183;
      roundedBox(g,m.black,0,dashY+.038,dashZ-.164,screenWidth+.032,screenHeight+.029,.035,.008);
      roundedBox(g,screenMaterial,0,dashY+.041,dashZ-.184,screenWidth,screenHeight,.007,.004);
      for(const x of [-width*.41,-width*.23,width*.23,width*.41]){
        cylinder(g,m.grille,x,dashY+.024,dashZ-.166,.042,.016,'z',20);
        cylinder(g,m.black,x,dashY+.024,dashZ-.178,.031,.008,'z',20);
        for(const y of [-.018,0,.018])line(g,m.interior,[x-.025,dashY+.024+y,dashZ-.187],[x+.025,dashY+.024+y,dashZ-.187],.0024);
      }
    }
    for(const x of [-.105,0,.105]){
      cylinder(g,m.grille,x,dashY-.151,dashZ-.178,.026,.019,'z',16);
      cylinder(g,m.black,x,dashY-.151,dashZ-.191,.020,.012,'z',16);
    }
    const steering=new THREE.Group();steering.position.set(width*.27,dashY+.012,dashZ-.35);steering.rotation.x=-.22;g.add(steering);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.147,.016,10,48),m.black);steering.add(ring);
    roundedBox(steering,m.interior,0,0,.004,.111,.093,.036,.019);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3+Math.PI/2;line(steering,m.black,[0,0,0],[Math.sin(a)*.135,Math.cos(a)*.135,0],.020);}
    for(const side of [-1,1]) roundedBox(steering,m.dark,side*.085,.004,.012,.041,.030,.012,.004);
    const binnacle=roundedBox(g,m.black,width*.27,dashY+.073,dashZ-.142,.275,.119,.107,.026);
    for(const dx of [-.068,.068]){
      cylinder(g,m.dark,width*.27+dx,dashY+.064,dashZ-.205,.047,.008,'z',26);
      for(let i=0;i<9;i++){const a=(i/8*1.4-.70)*Math.PI;line(g,m.headliner,[width*.27+dx+Math.sin(a)*.037,dashY+.064+Math.cos(a)*.037,dashZ-.211],[width*.27+dx+Math.sin(a)*.032,dashY+.064+Math.cos(a)*.032,dashZ-.211],.0011);}
      line(g,m.redPaint,[width*.27+dx,dashY+.064,dashZ-.213],[width*.27+dx-.020,dashY+.086,dashZ-.213],.0018);
    }
    }
    if(Number.isFinite(roofY)){
      roundedBox(g,m.headliner,0,roofY,(frontZ+rearZ)/2,width*.76,.022,Math.abs(frontZ-rearZ)+.38,.017);
      roundedBox(g,m.black,0,roofY-.08,dashZ-.16,.21,.074,.026,.013);
    }
  }

