// Native molded flares: flatter shelves and continuous surface normals.
import {nativeGeometry as geo} from './vehicle-geometry.mjs';
const {THREE,v3,surface,polygon,curvedLine,roundedOutline,recessedOpening,windowPanel,line}=geo;
export function nativeFender(side, axle, half, bronco) {
    const m = this.materials, g = this.body, front = axle > 0;
    const outline = bronco
      ? [[-.577,.48],[-.551,.704],[-.423,.949],[-.271,1.034],[.265,1.034],[.426,.950],[.555,.709],[.578,.48]]
      : front
        ? [[-.591,.47],[-.548,.687],[-.403,.942],[-.244,1.042],[.285,1.047],[.464,1.025],[.615,.965]]
        : [[-.577,.47],[-.545,.70],[-.409,.948],[-.270,1.031],[.264,1.032],[.418,.941],[.554,.682],[.582,.47]];
    const curve = new THREE.CatmullRomCurve3(outline.map(([z,y]) => v3(0,y,axle+z)), false, 'centripetal');
    const reach = bronco ? .091 : .130, inner = half - (bronco ? .046 : .073);
    const molding=(u,v,face=false)=>{
      const p=curve.getPoint(u),t=curve.getTangent(u),width=bronco?.063:.052;
      const ny=t.z,nz=-t.y,outer=half+reach-.008*Math.sin(u*Math.PI);
      if(face)return [side*(outer+.003*Math.sin(v*Math.PI)),p.y-ny*v*width,p.z-nz*v*width];
      return [side*THREE.MathUtils.lerp(inner,outer,v),p.y+.014*(1-v*v),p.z];
    };
    surface(g, m.black, 128, 10, (u,v) => {
      return molding(u,v);
    }, side < 0);
    // The lip follows the normal of the arch all the way down its legs; a
    // simple vertical drop used to turn the ends into thin hanging strips.
    surface(g, m.black, 128, 7, (u,v) => {
      return molding(u,v,true);
    }, side < 0);
    surface(g,m.dark,128,4,(u,v)=>{
      const p=molding(u,1,true);return [THREE.MathUtils.lerp(p[0],side*inner,v),p[1]+.007*v,p[2]];
    },side>0);
    for(const u of [0,1])polygon(g,m.black,[molding(u,0),molding(u,1),molding(u,1,true),[side*inner,molding(u,1,true)[1]+.007,molding(u,1,true)[2]]]);
    const edge = Array.from({length:129},(_,i) => {const p=molding(i/128,.84,true);p[0]+=side*.0008;return p;});
    curvedLine(g,m.dark,edge,.0024);
    if (!bronco && front) {
      const lampX=half+.011,lampY=.956,lampZ=axle+.625;
      const outline=roundedOutline([[-.115,.030,0],[.110,.007,0],[.112,-.023,0],[.084,-.036,0],[-.115,-.026,0]],.009).map(([x,y])=>[side*(lampX+x),lampY+y]);
      const lampFace=(x,y)=>[x,y,lampZ-.019*((Math.abs(x)-lampX)/.115)**2];
      recessedOpening(g,m.black,m.dark,outline,lampFace,.018,.13);
      for(const y of [-.011,.008]){
        const pts=Array.from({length:25},(_,i)=>{const x=side*(lampX-.099+i/24*.178),p=lampFace(x,lampY+y-.020*i/24);p[2]-=.005;return p;});
        curvedLine(g,m.white,pts,.0042);
      }
      windowPanel(g,{black:m.black,glass:m.lens},outline.map(([x,y])=>lampFace(x,y)),.005,.002,{bow:.003});
      const sideMarker=roundedOutline([[.535,.937,0],[.608,.936,0],[.608,.965,0],[.541,.975,0]],.008).map(([z,y])=>[side*(half+.130),y,axle+z]);
      windowPanel(g,{black:m.black,glass:m.amber},sideMarker,.11,.003,{bow:.002});
      // Shaped dark extractor recess behind the front arch, following the
      // actual angled wing panel rather than a free-standing row of rods.
      const ventX=side*(half-.006),vent=roundedOutline([[axle-.452,1.069,0],[axle-.395,1.048,0],[axle-.476,.888,0],[axle-.544,.913,0]],.016);
      polygon(g,m.black,vent.map(([z,y])=>[ventX,y,z]));
      curvedLine(g,m.dark,[...vent,vent[0]].map(([z,y])=>[ventX+side*.003,y,z]),.0033);
      for(let i=0;i<6;i++)line(g,m.grille,[ventX+side*.002,1.046-i*.023,axle-.447-i*.012],[ventX+side*.002,1.035-i*.023,axle-.413-i*.012],.0025);
    }
    surface(g, m.black, 40, 4, (u,v) => {
      const a = Math.PI*u;
      return [side*(half-.24+v*.255),.437+Math.sin(a)*.488,axle+Math.cos(a)*.488];
    });
    const innerWall=[[side*(half-.243),.435,axle-.489]];
    for(let i=0;i<=40;i++){const a=Math.PI-i*Math.PI/40;innerWall.push([side*(half-.243),.437+Math.sin(a)*.488,axle+Math.cos(a)*.488]);}
    innerWall.push([side*(half-.243),.435,axle+.489]);polygon(g,m.dark,innerWall);
  }

