import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
export const DEEP_MUD=Object.freeze({center:[-107,-51],radii:[34,20],waterLevel:3.265,maxSinkM:.60});
export function deepMudWeight(x,y){
 const dx=(x-DEEP_MUD.center[0])/DEEP_MUD.radii[0],dy=(y-DEEP_MUD.center[1])/DEEP_MUD.radii[1];
 const radius=Math.hypot(dx,dy)+.045*Math.sin(x*.37+y*.21)*Math.sin(y*.43-x*.16);
 return 1-T.MathUtils.smoothstep(radius,.62,1.12);
}
export function deepMudHeight(x,y,height){
 const w=deepMudWeight(x,y);
 // A shallow basin over a finite firm substrate, with an irregular soft shore.
 return T.MathUtils.lerp(height,DEEP_MUD.waterLevel-.10-.14*(.5+.5*Math.sin(x*.19+y*.13)),w);
}
export function deepMudWaterAsset(terrain){
 const group=new T.Group(),positions=[],indices=[],normals=[],uv=[],step=.5;
 const point=(x,y)=>{const depth=DEEP_MUD.waterLevel-terrain.heightAt(-y,x);return {x,y,depth,side:Math.min((deepMudWeight(x,y)-.03)*.2,depth-.002)};};
 const edge=(a,b)=>{const t=a.side/(a.side-b.side);return {x:T.MathUtils.lerp(a.x,b.x,t),y:T.MathUtils.lerp(a.y,b.y,t),depth:T.MathUtils.lerp(a.depth,b.depth,t),side:0};};
 for(let x=-149;x< -65;x+=step)for(let y=-77;y< -25;y+=step){
  const points=[point(x,y),point(x+step,y),point(x,y+step),point(x+step,y+step)];
  for(const triangle of [[0,2,1],[1,2,3]]){
   const polygon=[];for(let i=0;i<3;i++){
    const a=points[triangle[i]],b=points[triangle[(i+1)%3]],inside=a.side>=0;
    if(inside)polygon.push(a);if(inside!==(b.side>=0))polygon.push(edge(a,b));
   }
   for(let j=1;j<polygon.length-1;j++)for(const p of [polygon[0],polygon[j],polygon[j+1]]){
    const phase=p.x*1.7+p.y*.9,n=new T.Vector3(.0036*Math.cos(phase),1,-.0068*Math.cos(phase)).normalize();
    indices.push(indices.length);positions.push(-p.y,DEEP_MUD.waterLevel+.004*Math.sin(phase),p.x);normals.push(n.x,n.y,n.z);
    // The water's opacity fades with shallow depth along the clipped shore.
    uv.push(T.MathUtils.clamp(p.depth/.045,0,1),0);
   }
  }
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
 const material=new T.MeshStandardMaterial({color:'#493b2b',roughness:.17,metalness:.02,transparent:true,opacity:.62,side:T.DoubleSide});
 material.userData.nativeRole='mudwater';
 group.add(new T.Mesh(geometry,material));
 return {name:'native_deep_mud_water',group,placement:{asset:'native_deep_mud_water',solid:false,crushable:false,surface:2,instances:[{p:[0,0,0],q:[0,0,0,1],s:[1,1,1],color:[1,1,1]}]}};
}
export function adventureRoutes(terrain){
 const gate=(x,y,z)=>[x*100,y*100,(z??terrain.heightAt(-y,x))*100];
 return [
  {name:'Blackwater bog crossing',hint:'Deep wet mud: use momentum without excessive wheelspin. Air down, fit mud tires and use low range. The firmer outside line offers a bypass.',zone:3,yaw:0,spawn:gate(-150,-51),gateWidth:10,gates:[gate(-137,-51),gate(-118,-51),gate(-97,-51),gate(-72,-51)]},
  {name:'Summit rhythm jumps',hint:'Three progressive take-offs and real gaps. Approach straight; manage speed between the landings.',zone:6,yaw:0,spawn:gate(-163,202,4.6),gateWidth:7,gates:[gate(-118,202,6.2),gate(-91,202,4.6),gate(-58,202,6.7),gate(-26,202,4.6),gate(5,202,7.1),gate(45,202,4.6)]},
  {name:'Summit cross-axle staircase',hint:'Offset steps load opposite wheels. Crawl in low range, try rear lock, then add front lock if a tire lifts.',zone:6,yaw:0,spawn:gate(-44,170,4.6),gateWidth:5,gates:[gate(-25,170,4.9),gate(-4,170,5.05),gate(18,170,5.15),gate(43,170,4.6)]},
  {name:'Summit banked hairpin',hint:'Follow the raised bank through the turn. Look ahead, use a smooth steering arc and avoid the outside edge.',zone:6,yaw:0,spawn:gate(112,202,4.6),gateWidth:7,gates:[gate(135,202,4.72),gate(156,195,4.72),gate(161,184,4.72),gate(151,171,4.72),gate(131,166,4.6)]}
 ];
}
