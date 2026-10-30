// Authored cabin surfaces using the original Performante brochure interior.
import {T,mesh,box,surface,mappedPolygon,curve,lerp,station} from './body-surface.mjs';
export function urusCabin(g,m,carbon,{sidePoint,belt}){
 const stitch=new T.MeshStandardMaterial({color:'#b7a334',roughness:.86}),metal=new T.MeshStandardMaterial({color:'#687176',metalness:.8,roughness:.3});
 const screen=new T.MeshStandardMaterial({color:'#101e27',roughness:.23,emissive:'#163544',emissiveIntensity:.10});
 box(g,m.interior,[0,.645,-.55],[1.57,.08,2.18],.018);
 // Trim the cargo sill and tailgate below the genuine rear aperture. Opening
 // the hatch glazing revealed exterior-yellow panels behind the rear seats.
 box(g,m.interior,[0,.930,-2.135],[1.65,.630,.035],.012);
 box(g,m.upholstery,[0,1.105,-1.80],[1.63,.033,.63],.012);
 // Rounded instrument panel and hexagonal vent surrounds.
 surface(g,m.interior,64,24,(u,v)=>{const x=(u*2-1)*.76;return[x,.925+.15*Math.sin(v*Math.PI/2)-.035*(x/.76)**2,lerp(.24,.62,v)];},true);
 for(const x of [-.66,-.15,.15,.66]){
  const outer=[[-.095,-.026],[-.070,-.048],[.067,-.048],[.095,-.024],[.095,.026],[.068,.048],[-.070,.048],[-.095,.024]];
  const inner=outer.map(([a,b])=>[a*.84,b*.77]),map=(a,b)=>[x+a,1.025+b,.244-b*.12];
  mappedPolygon(g,carbon,outer,map,[inner],true,3).name='urus-hexagonal-dashboard-vent-'+x;
  for(let j=0;j<inner.length;j++)surface(g,metal,3,3,(u,v)=>{
   const a=inner[j],b=inner[(j+1)%inner.length],p=map(lerp(a[0],b[0],u),lerp(a[1],b[1],u));p[2]+=.032*v;return p;
  },true);
  mappedPolygon(g,m.interior,inner,(a,b)=>[x+a,1.025+b,.280],[],true,3);
  for(let k=0;k<4;k++)box(g,metal,[x,1.006+k*.013,.260],[.142,.003,.015],.001);
  box(g,metal,[x,1.025,.247],[.014,.013,.009],.002);
 }
 box(g,m.interior,[.40,1.065,.41],[.43,.15,.26],.035);
 const cluster=box(g,screen,[.40,1.045,.264],[.35,.105,.012],.013);cluster.rotation.x=-.18;
 for(const x of [.49,.31]){const dial=mesh(g,new T.TorusGeometry(.037,.002,6,40),metal,[x,1.048,.252]);dial.rotation.x=.10;}
 // The two stacked center screens incline toward the driver.
 for(const [y,z,w,h]of [[.965,.242,.30,.128],[.808,.135,.285,.126]]){
  const display=box(g,screen,[0,y,z],[w,h,.014],.012);display.rotation.x=-.29;
  for(let k=0;k<4;k++)box(g,metal,[-w*.35+k*w*.23,y-.04,z-.012],[.027,.003,.002],.001);
 }
 const console=box(g,carbon,[0,.726,-.11],[.30,.18,.75],.024);console.rotation.x=-.07;
 const cover=box(g,m.redPaint||m.interior,[0,.820,.04],[.045,.018,.048],.005);cover.rotation.x=-.30;
 for(const s of [-1,1])for(let k=0;k<4;k++)box(g,metal,[s*.095,.803,-.02-k*.047],[.044,.009,.026],.004);
 box(g,m.upholstery,[0,.837,-.43],[.25,.08,.34],.029);
 // Flat-bottom steering rim, spokes, separate hub and column.
 const steering=new T.Group();steering.position.set(.40,1.025,.095);steering.rotation.x=-.24;g.add(steering);
 curve(steering,m.upholstery,[[0,-.133,0],[-.102,-.125,0],[-.153,-.058,0],[-.159,.050,0],[-.105,.136,0],[0,.158,0],[.105,.136,0],[.159,.050,0],[.153,-.058,0],[.102,-.125,0],[0,-.133,0]],.014);
 box(steering,m.interior,[0,0,0],[.132,.088,.057],.016);
 for(const s of [-1,1])curve(steering,metal,[[s*.045,.010,.006],[s*.105,.018,.003],[s*.15,.043,0]],.010);
 curve(steering,carbon,[[0,-.031,0],[0,-.090,0],[-.055,-.126,0]],.012);box(steering,m.badge,[0,.003,-.034],[.022,.026,.003],.004);
 for(const s of [-1,1])for(const [z,rear]of [[-.40,false],[-1.30,true]]){
  const sx=s*.43;
  // Closed rear shell and cushion sides remove the floating sheet appearance
  // when inspecting the now transparent windshield and hatch.
  const rearShell=box(g,carbon,[sx,1.016,z-.270],[.421,.520,.105],.045);rearShell.rotation.x=-.22;
  box(g,m.upholstery,[sx,.700,z],[.459,.099,.455],.032);
  // Cushions and backrests are smooth drawn surfaces with raised bolsters.
  surface(g,m.upholstery,32,28,(u,v)=>{const x=(u*2-1)*.242,q=Math.abs(u*2-1);return[sx+x,.706+.052*Math.sin(v*Math.PI)+.049*q**5,lerp(z-.23,z+.24,v)];},true);
  const back=[[-.02,.207,.032],[.18,.228,.045],[.38,.211,.040],[.52,.145,.025]];
  surface(g,m.upholstery,36,36,(u,v)=>{const h=v*.52,x=(u*2-1)*station(back,h,1),q=Math.abs(u*2-1);return[sx+x,.755+h,z-.19-h*.22+station(back,h,2)*(1-q*q)+.060*q**5];},true);
  box(g,m.upholstery,[sx,1.340,z-.30],[.245,.157,.102],.033);
  for(const dx of [-.065,.065])box(g,metal,[sx+dx,1.280,z-.30],[.009,.068,.009],.003);
  for(const side of [-1,1])curve(g,stitch,[[sx+side*.19,.80,z-.177],[sx+side*.20,1.00,z-.22],[sx+side*.165,1.21,z-.275]],.0009);
  for(let k=0;k<6;k++)curve(g,m.interior,[[sx-.10,.89+k*.044,z-.19-(.135+k*.044)*.22+.037],[sx+.10,.89+k*.044,z-.19-(.135+k*.044)*.22+.037]],.0011);
 }
 // A full rear bench includes its narrow centre position and head restraint.
 // Four isolated front-seat shapes left a conspicuous hole through the hatch.
 box(g,m.upholstery,[0,.700,-1.30],[.40,.099,.455],.032);
 surface(g,m.upholstery,28,28,(u,v)=>{
  const x=(u*2-1)*.207,h=v*.49;return[x,.755+h,-1.49-h*.22+.028*(1-(x/.207)**2)];
 },true).name='urus-rear-centre-seat';
 box(g,m.upholstery,[0,1.325,-1.60],[.203,.140,.109],.031);
 for(const s of [-1,1]){
  const a=new T.Vector3(s*.74,1.30,-.56),b=new T.Vector3(s*.63,.77,-.24),across=new T.Vector3(0,b.z-a.z,a.y-b.y).normalize();
  surface(g,m.interior,2,28,(u,v)=>a.clone().lerp(b,v).addScaledVector(across,(u-.5)*.045).toArray(),s>0).name='urus-flat-seatbelt-'+s;
 }
 // Inset door cards avoid the former solid black plate behind the glazing.
 for(const s of [-1,1]){
  surface(g,m.interior,100,32,(u,v)=>{const z=lerp(-2.19,.61,u),top=belt(z);return[s*(.843+.028*Math.sin(v*Math.PI)),lerp(.70,top-.006,v),z];},s>0);
  surface(g,m.interior,100,8,(u,v)=>{const z=lerp(-2.19,.61,u),y=belt(z)-.005,outer=sidePoint(s,z,y);return[lerp(s*.843,outer[0]-s*.009,v),y,z];},s>0);
  curve(g,carbon,[[s*.835,.92,.39],[s*.843,.96,-.50],[s*.844,1.00,-1.47]],.023);
  for(const z of [-.19,-1.1])box(g,metal,[s*.807,.99,z],[.025,.017,.126],.006);
 }
}
