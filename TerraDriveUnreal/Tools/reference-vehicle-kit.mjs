// Shared construction for new native-only photo-reference models. Metres, Y up.
import {T,mesh,box,surface,mappedPolygon,line,curve,lerp,station} from './body-surface.mjs';
import {nativeGeometry as G} from './vehicle-geometry.mjs';
import {geometryText,refineFactoryWheel} from './vehicle-fidelity.mjs';
export {T,mesh,box,surface,mappedPolygon,line,curve,lerp,station,G,geometryText};
export function finishMaterial(color,role,roughness=.35,metalness=0){const m=new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:role==='paint'?.85:0,clearcoatRoughness:.13,side:T.DoubleSide});m.userData.automotive=role;return m;}
export function newReferenceView(spec){
 const scene=new T.Scene(),root=new T.Group(),body=new T.Group();scene.add(root);root.add(body);body.position.set(0,-spec.cgHeight,(.5-spec.frontWeightFraction)*spec.wheelbase);
 const m={paint:finishMaterial(spec.color,'paint',.22),black:finishMaterial('#111719','plastic',.65),dark:finishMaterial('#181e21','plastic',.69),glossBlack:finishMaterial('#0a1014','black',.24),chrome:finishMaterial('#abb4b7','metal',.25,.88),satinMetal:finishMaterial('#829095','satinMetal',.42,.76),badge:finishMaterial('#c3c9cc','metal',.27,.75),grille:finishMaterial('#151b20','plastic',.83),rubber:finishMaterial('#121719','rubber',.91),tread:finishMaterial('#171d1f','rubber',.96),rim:finishMaterial('#b6984d','wheel',.29,.72),brakeDisc:finishMaterial('#687175','metal',.45,.8),interior:finishMaterial('#161d24','plastic',.79),upholstery:finishMaterial('#263e65','alcantara',.94),headliner:finishMaterial('#666d74','alcantara',.94),hardtop:finishMaterial('#13191b','plastic',.8)};
 for(const key of ['glass','windscreen','privacyGlass']){m[key]=new T.MeshPhysicalMaterial({color:'#3c515c',roughness:.035,transparent:true,opacity:key==='privacyGlass'?.58:.32,depthWrite:false,side:T.DoubleSide,clearcoat:.5});m[key].userData.vehicleGlass=true;m[key].userData.nativeRole='glass';}
 m.lens=new T.MeshPhysicalMaterial({color:'#b8d2dc',roughness:.06,transparent:true,opacity:.18,depthWrite:false,side:T.DoubleSide});m.lens.userData.vehicleLampLens=true;
 for(const [key,color,role] of [['red','#c42a27','brake'],['reverse','#e3e8de','reverse'],['white','#e8eddf',''],['amber','#db9025','']]){m[key]=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:key==='reverse'?0:.13,roughness:.25,side:T.DoubleSide});m[key].userData.nativeRole=role;}
 for(const [key,mat]of Object.entries(m)){mat.userData.automotiveOwner=spec.bodyStyle;if(['interior','upholstery','headliner'].includes(key))mat.userData.vehicleInterior=true;}
 const wheels=Array.from({length:4},()=>{const root=new T.Group(),tireShape=new T.Group(),tireSpin=new T.Group(),rimSpin=new T.Group();root.add(tireShape,rimSpin);tireShape.add(tireSpin);return{root,tireShape,tireSpin,rimSpin};});
 const view={spec,scene,root,body,materials:m,wheels,links:[],driveLinks:[],lamps:[]};
 view.dispose=()=>{const gs=new Set(),ms=new Set();for(const g of [root,...wheels.map(w=>w.root)])g.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[])ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());scene.clear();};
 return view;
}
export function rod(g,m,a,b,r=.01,n=12){const A=new T.Vector3(...a),B=new T.Vector3(...b),d=B.clone().sub(A),o=mesh(g,new T.CylinderGeometry(r,r,d.length(),n),m,A.clone().add(B).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
export function cylinder(g,m,p,r,d,axis='y',n=32){const o=mesh(g,new T.CylinderGeometry(r,r,d,n),m,p);if(axis==='x')o.rotation.z=Math.PI/2;if(axis==='z')o.rotation.x=Math.PI/2;return o;}
export function ring(g,m,p,r,t=.004,axis='x'){const o=mesh(g,new T.TorusGeometry(r,t,8,64),m,p);if(axis==='x')o.rotation.y=Math.PI/2;if(axis==='y')o.rotation.x=Math.PI/2;return o;}
export function label(g,m,text,w,h,p,rotation=0){const o=geometryText(g,text,w,h,m);o.position.set(...p);o.rotation.y=rotation;return o;}
export function pane(g,m,outline,map,flip=false){const center=outline.reduce((a,p)=>a.map((v,i)=>v+p[i]),[0,0]).map(v=>v/outline.length),inner=outline.map(p=>p.map((v,i)=>lerp(v,center[i],.035)));mappedPolygon(g,m.black,outline,map,[inner],flip,3);const o=mappedPolygon(g,m.glass,inner,map,[],flip,8);o.name='reference-open-window';return o;}
export function rimBarrel(g,m,r,w){const p=[[.96,-.44],[1,-.425],[1,-.38],[.94,-.35],[.87,-.12],[.87,.12],[.94,.35],[1,.38],[1,.425],[.96,.44],[.92,.39],[.85,.12],[.85,-.12],[.92,-.39],[.96,-.44]];const o=mesh(g,new T.LatheGeometry(p.map(([a,b])=>new T.Vector2(a*r,b*w)),64),m);o.rotation.z=Math.PI/2;o.name='native-reference-closed-drop-centre-barrel';o.geometry.computeVertexNormals();return o;}
export function refineReferenceWheel(view,spec,rimBuilder,tireBuilder=null){compactReferencedVertices(view.body);for(const wheel of view.wheels){if(tireBuilder){wheel.tireSpin.add(tireBuilder(spec,view.materials));}else{refineFactoryWheel(wheel,{...spec,bodyStyle:'sedan'},view.materials);}wheel.rimSpin.clear();wheel.rimSpin.add(rimBuilder(spec,view.materials));wheel.root.userData.factoryWheelRevision=3;}for(const g of [view.body,...view.wheels.map(w=>w.root)])g.traverse(o=>{for(const mat of o.material?Array.isArray(o.material)?o.material:[o.material]:[])if(!mat.userData.automotiveOwner)mat.userData.automotiveOwner=spec.bodyStyle;});Object.assign(view.root.userData.nativeFidelity,{splitTireAndRim:true,formedCarcass:true,beveledTread:true,upgradeTireBeads:true});return{tire:view.wheels[0].tireShape,rim:view.wheels[0].rimSpin};}
export function simpleCabin(g,m,{floor=.30,seatY=.52,seatZ=-.2,seatX=.37,dashY=.86,dashZ=.58,rhd=false}={}){
 box(g,m.interior,[0,floor,-.4],[1.34,.06,1.72],.02);box(g,m.interior,[0,dashY,dashZ],[1.32,.18,.30],.055);
 for(const x of [-seatX,seatX]){box(g,m.upholstery,[x,seatY,seatZ],[.46,.14,.48],.045);const back=box(g,m.upholstery,[x,seatY+.27,seatZ-.20],[.45,.52,.13],.045);back.rotation.x=-.11;box(g,m.interior,[x,seatY+.58,seatZ-.23],[.23,.18,.10],.035);for(const s of [-1,1])box(g,m.interior,[x+s*.204,seatY+.21,seatZ-.12],[.065,.42,.17],.025);}
 const sx=(rhd?1:-1)*seatX;rod(g,m.dark,[sx,dashY-.1,dashZ-.02],[sx,dashY+.07,dashZ-.26],.035);const wh=ring(g,m.black,[sx,dashY+.08,dashZ-.29],.16,.014,'z');wh.rotation.x=-.25;for(const a of [Math.PI/6,5*Math.PI/6,1.5*Math.PI])rod(g,m.chrome,[sx,dashY+.08,dashZ-.29],[sx+Math.cos(a)*.145,dashY+.08+Math.sin(a)*.145,dashZ-.29],.011);box(g,m.interior,[0,seatY+.04,seatZ+.18],[.18,.20,.48],.02);rod(g,m.dark,[0,seatY+.1,seatZ+.28],[0,seatY+.31,seatZ+.26],.012);cylinder(g,m.black,[0,seatY+.32,seatZ+.26],.028,.04);
}
// Cut-out surface grids can retain unused vertices inside an opening. Compact
// only unreferenced rows; no visible triangle, position or shading normal changes.
function compactReferencedVertices(group){group.traverse(o=>{if(!o.isMesh||!o.geometry.index)return;const g=o.geometry,old=g.index.array,used=[...new Set(old)];if(used.length===g.attributes.position.count)return;const remap=new Map(used.map((v,i)=>[v,i]));for(const [key,a]of Object.entries(g.attributes)){const values=[];for(const index of used)for(let k=0;k<a.itemSize;k++)values.push(a.array[index*a.itemSize+k]);g.setAttribute(key,new T.Float32BufferAttribute(values,a.itemSize));}g.setIndex(Array.from(old,i=>remap.get(i)));});}

// Trim each corner with a quadratic arc in the panel's two-dimensional domain.
export function roundedContour(corners, radius, steps=5) {
  return corners.flatMap((corner, index) => {
    const trim = point => {
      const distance = Math.hypot(point[0]-corner[0], point[1]-corner[1]);
      const t = Math.min(.44, radius/distance);
      return corner.map((value, axis) => lerp(value, point[axis], t));
    };
    const a = trim(corners[(index+corners.length-1)%corners.length]);
    const b = trim(corners[(index+1)%corners.length]);
    return Array.from({length:steps+1}, (_, i) => {
      const t=i/steps;
      return a.map((value, axis) => lerp(lerp(value,corner[axis],t),lerp(corner[axis],b[axis],t),t));
    });
  });
}

// Join matching outlines with a formed reveal. Depth is positive into the panel.
export function panelReturn(group, material, outer, inner, map, depth, flip=false) {
  const clockwise=T.ShapeUtils.area(outer.map(p=>new T.Vector2(...p)))<0;
  return surface(group,material,outer.length,3,(u,t)=>{
    const i=Math.round(u*outer.length)%outer.length;
    const point=outer[i].map((value,axis)=>lerp(value,inner[i][axis],t));
    return map(...point,depth*t);
  },clockwise!==flip);
}
