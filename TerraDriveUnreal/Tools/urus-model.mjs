// Authored native-only exterior from manufacturer photographs and dimensions.
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
const V=p=>new T.Vector3(...p);
export function urusView(spec){
 const view=new VehicleView(new T.Scene(),{...spec,bodyStyle:'sedan'}),g=view.body,m=view.materials;
 g.clear();g.position.set(0,-spec.cgHeight,(.5-spec.frontWeightFraction)*spec.wheelbase);
 const carbon=new T.MeshPhysicalMaterial({color:'#151b1d',roughness:.31,metalness:.18,clearcoat:.8});
 const gap=new T.MeshStandardMaterial({color:'#080c0d',roughness:.7});
 const emit=new T.MeshStandardMaterial({color:'#e1edf2',emissive:'#c4e4ff',emissiveIntensity:1.2,roughness:.16});
 function mesh(geo,mat,p=[0,0,0]){const o=new T.Mesh(geo,mat);o.position.set(...p);g.add(o);return o;}
 function box(mat,p,s){return mesh(new T.BoxGeometry(...s),mat,p);}
 function poly(mat,points){const geo=new T.BufferGeometry(),vs=[];for(const p of points)vs.push(...p);const normal=V(points[1]).sub(V(points[0])).cross(V(points[2]).sub(V(points[0]))),axis=normal.toArray().map(Math.abs).indexOf(Math.max(...normal.toArray().map(Math.abs)));const contour=points.map(p=>new T.Vector2(p[(axis+1)%3],p[(axis+2)%3]));const ix=T.ShapeUtils.triangulateShape(contour,[]).flat();geo.setAttribute('position',new T.Float32BufferAttribute(vs,3));geo.setIndex(ix);geo.computeVertexNormals();return mesh(geo,mat);}
 function line(mat,pts,r=.006){const c=new T.CurvePath();for(let i=1;i<pts.length;i++)c.add(new T.LineCurve3(V(pts[i-1]),V(pts[i])));return mesh(new T.TubeGeometry(c,Math.max(4,pts.length*6),r,6,false),mat);}
 // Body skin at each longitudinal station: upper shoulder, door face and sill.
 // Side skins cut around both wheel openings instead of covering the tire.
 const front=spec.wheelbase*.5,rear=-spec.wheelbase*.5,rad=.432,cy=.3934;
 for(const side of [-1,1]){
  const outline=[[-2.52,.45],[-2.52,.91],[-2.14,1.00],[-1.53,1.10],[-.66,1.11],[.55,1.08],[1.7,1.05],[2.49,.90],[2.54,.39]];
  for(const z of [front,rear]){
   outline.push([z+rad,.33]);
   for(let j=0;j<=24;j++){const a=j*Math.PI/24;outline.push([z+rad*Math.cos(a),cy+rad*Math.sin(a)]);}
   outline.push([z-rad,.33]);
  }
  outline.push([-2.52,.33]);
  const shape=new T.Shape(outline.map(([z,y])=>new T.Vector2(z,y)));
  const geo=new T.ExtrudeGeometry(shape,{depth:.026,bevelEnabled:true,bevelSize:.009,bevelThickness:.012,bevelSegments:2,steps:1});
  const p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const z=p.getX(i),y=p.getY(i),xx=p.getZ(i);const bulge=.045*Math.exp(-Math.pow((Math.abs(z)-1.5)/.5,2)),shoulder=.028*Math.exp(-Math.pow((y-1.02)/.13,2)),sculpt=-.024*Math.exp(-Math.pow((y-.73)/.17,2));p.setXYZ(i,side*(.926+bulge+xx+shoulder+sculpt-.025*Math.max(0,.7-y)),y,z);}
  geo.computeVertexNormals();mesh(geo,m.paint);
  // Carbon arch lips and inner wheel houses, body-colored upper shoulder facets.
  for(const z of [front,rear]){
   const pts=[];for(let j=0;j<=36;j++){const a=-.12+j*(Math.PI+.24)/36;pts.push([side*1.006,cy+Math.sin(a)*rad,z+Math.cos(a)*rad]);}
   line(carbon,pts,.022);
   const house=mesh(new T.CylinderGeometry(.422,.422,.14,48,1,true,0,Math.PI),gap,[side*.91,cy,z]);house.rotation.z=Math.PI/2;
  }
  poly(m.paint,[[side*.78,1.10,-2.19],[side*.98,.99,-2.12],[side*.98,1.12,-1.58],[side*.76,1.35,-1.48]]);
  poly(m.paint,[[side*.76,1.03,2.36],[side*.99,.94,2.27],[side*.99,1.10,1.57],[side*.73,1.18,.58]]);
  // Sharp coupe greenhouse, black window surrounds and fixed rear quarter glass.
  const window=[[side*.91,1.12,.62],[side*.73,1.565,-.03],[side*.71,1.57,-.91],[side*.83,1.28,-1.79],[side*.92,1.13,-1.89]];
  poly(gap,window);poly(m.glass,window.map(([x,y,z])=>[x+side*.004,y+.012,z]));
  line(m.paint,[[side*.93,1.11,.64],[side*.75,1.59,-.02],[side*.73,1.61,-.94],[side*.86,1.29,-1.83]],.018);
  line(carbon,[[side*.936,1.13,-.76],[side*.750,1.59,-.70]],.035);
  line(carbon,[[side*.932,1.13,-1.64],[side*.792,1.43,-1.43]],.025);
  for(const z of [-.72,-1.61])box(carbon,[side*.965,1.045,z],[.025,.027,.16]);
  // Door shut lines, sculpted lower crease, angular rear haunch and mirrors.
  line(gap,[[side*.975,1.10,-.75],[side*.950,.57,-.74],[side*.947,.39,-.45]],.004);
  line(gap,[[side*.972,1.09,.52],[side*.950,.60,.58],[side*.948,.39,.38]],.004);
  line(carbon,[[side*.976,.34,-1.03],[side*.971,.29,1.01]],.027);
  poly(m.paint,[[side*.95,.43,-.99],[side*.958,.55,-.71],[side*.957,.68,.62],[side*.95,.43,1.04]]);
  line(carbon,[[side*.89,1.18,.45],[side*1.00,1.20,.47]],.019);
  const mirror=mesh(new T.SphereGeometry(1,24,12),carbon,[side*1.01,1.21,.44]);mirror.scale.set(.08,.063,.11);
  // Headlamp housing and the distinctive Y light guide.
  poly(gap,[[side*.48,1.00,2.48],[side*.91,1.02,2.39],[side*.96,.89,2.41],[side*.50,.89,2.51]]);
  line(emit,[[side*.91,.925,2.432],[side*.60,.925,2.509],[side*.51,.985,2.51]],.008);
  line(emit,[[side*.60,.925,2.509],[side*.54,.903,2.517]],.006);
  // Rear red Y guides with separate clear reverse emitters and smoked lenses.
  poly(gap,[[side*.30,1.04,-2.515],[side*.90,1.04,-2.45],[side*.93,.91,-2.48],[side*.31,.94,-2.54]]);
  line(m.red,[[side*.89,1.004,-2.478],[side*.60,.996,-2.522],[side*.46,1.025,-2.546]],.009);
  line(m.red,[[side*.60,.996,-2.522],[side*.46,.964,-2.546]],.007);
  box(m.reverse,[side*.75,.91,-2.515],[.16,.026,.014]);
  for(const x of [.65,.82]){const tip=mesh(new T.CylinderGeometry(.052,.052,.17,28,1,true),m.chrome,[side*x,.37,-2.51]);tip.rotation.x=Math.PI/2;const inner=mesh(new T.CircleGeometry(.043,28),gap,[side*x,.37,-2.605]);inner.rotation.y=Math.PI;}
 }
 // Bonnet, roof, windscreen and sloping hatch have explicit compound sections.
 function skin(mat,rows){const vs=[],ix=[];for(const [z,y,w,bow]of rows)for(let i=0;i<=20;i++){const t=i/10-1;vs.push(w*t,y+bow*(1-t*t),z);}for(let r=0;r<rows.length-1;r++)for(let i=0;i<20;i++){const a=r*21+i;ix.push(a,a+1,a+21,a+1,a+22,a+21);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vs,3));geo.setIndex(ix);geo.computeVertexNormals();mesh(geo,mat);}
 skin(m.paint,[[2.48,.99,.48,.025],[2.25,1.04,.72,.033],[1.55,1.10,.79,.04],[.62,1.16,.75,.025]]);
 skin(carbon,[[2.12,1.086,.45,.025],[1.50,1.146,.56,.028],[.67,1.186,.58,.015]]);
 skin(m.windscreen,[[.62,1.18,.73,.035],[-.04,1.575,.70,.018]]);
 skin(carbon,[[-.04,1.598,.72,.016],[-.45,1.615,.725,.014],[-.96,1.59,.71,.016]]);
 skin(m.glass,[[-.98,1.575,.69,.018],[-1.81,1.24,.81,.016]]);
 skin(m.paint,[[-1.83,1.24,.83,.017],[-2.25,1.11,.90,.022],[-2.53,1.04,.87,.008]]);
 for(const s of [-1,1]){line(gap,[[s*.58,1.19,.67],[s*.59,1.155,1.45],[s*.47,1.10,2.12]],.006);poly(gap,[[s*.63,1.148,1.36],[s*.76,1.13,1.48],[s*.66,1.096,2.03],[s*.59,1.108,1.96]]);}
 // Deep hexagonal intakes and an angular carbon splitter.
 poly(m.paint,[[-.99,.90,2.42],[-.48,.90,2.51],[0,.86,2.565],[.48,.90,2.51],[.99,.90,2.42],[.96,.68,2.49],[-.96,.68,2.49]]);
 poly(m.paint,[[-.48,.99,2.48],[.48,.99,2.48],[.48,.89,2.53],[0,.86,2.565],[-.48,.89,2.53]]);
 box(gap,[0,.545,2.493],[1.86,.39,.008]);
 box(carbon,[0,.83,1.78],[1.72,.24,.94]);
 poly(gap,[[-.92,.72,2.51],[-.63,.76,2.54],[-.47,.63,2.55],[.47,.63,2.55],[.63,.76,2.54],[.92,.72,2.51],[.95,.43,2.49],[.64,.38,2.55],[.45,.48,2.58],[-.45,.48,2.58],[-.64,.38,2.55],[-.95,.43,2.49]]);
 for(let row=0;row<4;row++)for(let col=0;col<22;col++){const x=(col-10.5)*.074+(row%2)*.037,y=.43+row*.072;if(Math.abs(x)<.42&&y>.60)continue;const pts=[];for(let i=0;i<=6;i++){const a=i*Math.PI/3;pts.push([x+Math.cos(a)*.040,y+Math.sin(a)*.040,2.514]);}line(carbon,pts,.004);}
 line(carbon,[[-.97,.34,2.42],[-.65,.30,2.55],[0,.34,2.58],[.65,.30,2.55],[.97,.34,2.42]],.027);
 box(carbon,[0,.48,-2.50],[1.75,.20,.09]);box(m.paint,[0,.76,-2.50],[1.79,.25,.10]);
 for(let i=0;i<12;i++){
  const a=-.94+i*1.88/12,b=a+1.88/12,z=x=>-2.515+.09*Math.pow(Math.abs(x)/.94,1.4);
  poly(m.paint,[[a,.88,z(a)],[b,.88,z(b)],[b,1.045,z(b)],[a,1.045,z(a)]]);
 }
 for(const s of [-1,1])line(carbon,[[s*.78,1.60,-1.12],[s*.88,1.53,-1.54]],.026);
 skin(carbon,[[-1.04,1.62,.80,.007],[-1.31,1.62,.88,.008],[-1.44,1.57,.87,.004]]);
 box(m.red,[0,1.55,-1.457],[.42,.014,.012]);
 for(let i=-3;i<=3;i++)box(carbon,[i*.20,.30,-2.48],[.018,.12,.25]);
 // Rear fascia, plate recess, grille camera and geometric shield.
 box(gap,[0,.78,-2.558],[.49,.13,.014]);box(m.badge,[0,.78,-2.57],[.36,.09,.006]);
 poly(m.badge,[[-.025,.86,2.576],[.025,.86,2.576],[.018,.82,2.579],[0,.805,2.58],[-.018,.82,2.579]]);
 box(carbon,[0,.195,-.15],[1.43,.055,2.75]);
 box(carbon,[0,1.04,.36],[1.52,.16,.32]);
 for(const side of [-1,1])for(const z of [-.40,-1.24]){
  box(carbon,[side*.43,.70,z],[.45,.14,.45]);
  const back=box(carbon,[side*.43,.97,z-.19],[.43,.48,.09]);back.rotation.x=-.12;
  box(carbon,[side*.43,1.29,z-.22],[.24,.17,.09]);
 }
 view.root.userData.visualModel={type:'Authored manufacturer-reference exterior',version:1,importedManufacturerCAD:false};
 return view;
}
