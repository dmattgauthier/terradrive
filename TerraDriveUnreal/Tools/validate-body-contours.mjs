// Independent physical contour probes complement the cooked camera review.
// These checks establish real relief and pillar straightness, not photographic
// likeness or manufacturer-CAD precision. Reports use inches for presentation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {VehicleView} from '../../TerraDrive-v1.13/dist/src/vehicle-view.js';
import {nativeGeometry as geo} from './vehicle-geometry.mjs';
import {nativeVehicle,vehicleFinishes} from './vehicle-realism.mjs';
import {VEHICLES} from './native-vehicles.mjs';
import {bodyRefinement} from './body-refinement.mjs';
import {refineVehicle} from './vehicle-fidelity.mjs';
import {buildCivic} from './civic-body.mjs';
import {nativeInterior} from './vehicle-cabin.mjs';
const T=geo.THREE,inch=.0254,checks=[];
const add=(name,pass,valueIn)=>{assert.ok(pass,name+' / measured '+valueIn+' in');checks.push({name,pass,valueIn});};

// Keep the two painted strips separate for this check, then apply the same
// body refinement used by export. Rounded window corners remain separate
// from the principal straight A-pillar boundaries.
const raw=new VehicleView(new T.Scene(),VEHICLES[2]);raw.body.clear();raw._interior=nativeInterior;
buildCivic(raw,geo);bodyRefinement(raw,VEHICLES[2]);raw.body.updateWorldMatrix(true,true);let pillars=0;
const seals=new Map();raw.body.traverse(o=>{if(o.name.startsWith('civic-front-side-seal-'))seals.set(o.name,o);});
raw.body.traverse(o=>{
 if(!o.name.startsWith('civic-straight-a-pillar-'))return;
 const p=o.geometry.attributes.position;assert.equal(p.count,13*65);let worst=0;
 for(const col of [0,12]){
  const a=new T.Vector2(p.getY(col),p.getZ(col)),last=64*13+col,b=new T.Vector2(p.getY(last),p.getZ(last));
  const chord=b.clone().sub(a),length=chord.length();assert.ok(length>.7);
  for(let row=0;row<=64;row++){
   const q=new T.Vector2(p.getY(row*13+col),p.getZ(row*13+col)).sub(a);
   worst=Math.max(worst,Math.abs(chord.x*q.y-chord.y*q.x)/length);
  }
 }
 add(o.name+' projected edges stay within one twentieth inch of their chord',worst<inch*.05,worst/inch);
 // Measure the actual seal triangles beside the principal painted edge.
 // Straight rails alone can pass while leaving a long opening to the glass.
 const seal=seals.get(o.name.replace('civic-straight-a-pillar-','civic-front-side-seal-'));assert.ok(seal);
 const invBody=raw.body.matrixWorld.clone().invert(),sealMatrix=invBody.clone().multiply(seal.matrixWorld),pillarMatrix=invBody.clone().multiply(o.matrixWorld);
 const sp=seal.geometry.attributes.position,ids=seal.geometry.index.array,triangles=[];
 for(let i=0;i<ids.length;i+=3)triangles.push(new T.Triangle(...[ids[i],ids[i+1],ids[i+2]].map(j=>new T.Vector3().fromBufferAttribute(sp,j).applyMatrix4(sealMatrix))));
 let worstJoin=0;
 for(let row=12;row<=52;row++){
  const point=new T.Vector3().fromBufferAttribute(p,row*13).applyMatrix4(pillarMatrix);let gap=Infinity;
  for(const triangle of triangles)gap=Math.min(gap,triangle.closestPointToPoint(point,new T.Vector3()).distanceTo(point));
  worstJoin=Math.max(worstJoin,gap);
 }
 add(o.name+' joins the side-window seal within a quarter inch',worstJoin<inch*.25,worstJoin/inch);pillars++;
});assert.equal(pillars,2);raw.dispose();

const measured=[];
for(const index of [2,5]){
 const spec=VEHICLES[index],view=nativeVehicle(spec);
 bodyRefinement(view,spec);vehicleFinishes(view,spec);refineVehicle(view,spec);view.root.updateMatrixWorld(true);
 const ray=(p,d)=>{
  const origin=view.body.localToWorld(new T.Vector3(...p)),direction=new T.Vector3(...d).transformDirection(view.body.matrixWorld);
  const hit=new T.Raycaster(origin,direction,0,6).intersectObject(view.body,true).find(h=>!h.object.material.transparent);
  assert.ok(hit,spec.name+' physical contour probe reaches a solid surface');
  const point=view.body.worldToLocal(hit.point.clone());assert.ok(point.toArray().every(Number.isFinite));return point;
 };
 const faceY=index===2?.63:.90;
 const middle=ray([0,faceY,3],[0,0,-1]),corner=ray([.75,faceY,3],[0,0,-1]);
 const noseSweep=middle.z-corner.z;
 add(spec.name+' nose wraps back around the corners',noseSweep>inch*5&&noseSweep<inch*11,noseSweep/inch);
 const rearY=index===2?.88:1.0;
 const rearMiddle=ray([0,rearY,-3],[0,0,1]),rearCorner=ray([.75,rearY,-3],[0,0,1]);
 const rearSweep=rearCorner.z-rearMiddle.z;
 add(spec.name+' rear corners taper around the central closure',rearSweep>inch*3&&rearSweep<inch*10,rearSweep/inch);
 if(index===2){
  const crest=ray([.60,2,1.55],[0,-1,0]),trough=ray([.50,2,1.55],[0,-1,0]);
  add('Civic bonnet stamping has physical ridge-to-trough relief',crest.y-trough.y>inch*.45,(crest.y-trough.y)/inch);
  const deckMiddle=ray([0,2,-1.95],[0,-1,0]),deckFlank=ray([.55,2,-1.95],[0,-1,0]);
  add('Civic trunk deck has a transverse crown',deckMiddle.y-deckFlank.y>inch*.35,(deckMiddle.y-deckFlank.y)/inch);
  assert.equal(view.root.userData.coachworkDetail.straightAPillarEdges,true);
 }else{
  const crest=ray([.70,2,1.30],[0,-1,0]),trough=ray([.55,2,1.30],[0,-1,0]);
  add('Urus bonnet ridge rises above its adjacent drawn channel',crest.y-trough.y>inch*1.2,(crest.y-trough.y)/inch);
  const recess=ray([.55,.85,-3],[0,0,1]),shoulder=ray([.55,1.0,-3],[0,0,1]);
  add('Urus hatch has a formed recess below the lamp shoulder',recess.z-shoulder.z>inch*1.5,(recess.z-shoulder.z)/inch);
  assert.equal(view.root.userData.visualModel.foldedRearHatch,true);
 }
 measured.push({vehicle:spec.name,noseCornerSweepIn:noseSweep/inch,rearCornerSweepIn:rearSweep/inch});view.dispose();
}
const report={kind:'source-geometry',revision:11,nativeAcceptance:false,displayUnits:'imperial',checks,measured,pass:true};
fs.writeFileSync(new URL('../docs/body-contour-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
