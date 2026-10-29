// Bounded original-source checks: never exports assets or starts Unreal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {G580,G63} from './native-vehicles.mjs';
import {prepareNativeVehicle} from './vehicle-realism.mjs';
import {gClassCoachworkPoint} from './mercedes-gclass.mjs';

const rows=[];
for(const spec of [G580,G63]){
  const {view,parts}=prepareNativeVehicle(spec),ev=spec.bodyStyle==='g580',tests=[];
  view.root.updateMatrixWorld(true);
  const check=(name,pass,observed)=>{tests.push({name,pass,...observed});assert.ok(pass,spec.id+': '+name+' '+JSON.stringify(observed));};
  const object=name=>{const o=view.body.getObjectByName(name);assert.ok(o,name);return o;};
  const bounds=o=>{o.geometry.computeBoundingBox();return o.geometry.boundingBox;};
  const midNormal=o=>{const n=o.geometry.attributes.normal;return new T.Vector3().fromBufferAttribute(n,Math.floor(n.count/2));};
  const glass=[];
  for(const side of [-1,1]){
    const wingNose=object('gclass-formed-front-wing-nose-return-'+side),noseNormal=midNormal(wingNose);
    const noseRay=new T.Raycaster(view.body.localToWorld(new T.Vector3(side*.84,1.018,3)),new T.Vector3(0,0,-1),0,5).intersectObject(wingNose,false)[0];
    check('front wing return closes the sheet above the fascia '+side,!!noseRay&&noseNormal.z>.3,{outwardNormal:noseNormal.toArray(),hit:!!noseRay});
    for(let door=0;door<2;door++){
      const joint=object('gclass-continuous-door-shut-line-'+side+'-'+door),p=joint.geometry.attributes.position,z=door===0?-.270:-1.150;
      const centres=[];for(let i=0;i<p.count;i+=9){const q=new T.Vector3();for(let j=0;j<8;j++)q.add(new T.Vector3().fromBufferAttribute(p,i+j));q.multiplyScalar(1/8);if(q.y>1.00&&q.y<1.85&&Math.abs(q.z-z)<.018)centres.push(q);}
      const error=Math.max(...centres.map(q=>Math.abs(q.z-z)));
      check('one straight continuous door rear joint '+side+' '+door,centres.length>=5&&error<.0001&&joint.userData.gClassReferenceSpace===true,{sampleCount:centres.length,maximumZDeviationM:error});
      const lower=centres.filter(q=>q.y>.65&&q.y<1.13),xs=lower.map(q=>q.x),waviness=Math.max(...xs)-Math.min(...xs);
      check('lower door seam lies on a straight formed flange '+side+' '+door,lower.length>=3&&waviness<.00015,{samples:lower.length,depthVariationM:waviness});
    }
    const indicator=object('gclass-seated-wing-indicator-'+side),ib=new T.Box3().setFromObject(indicator),icy=ib.min.y+spec.cgHeight;
    // Box underside follows the wing, rather than hovering above the ledge.
    const z=1.969,finalZ=gClassCoachworkPoint(0,0,z)[2],frontZ=gClassCoachworkPoint(0,0,2.145)[2],wingY=1.200+(1.045-1.200)*(finalZ-.737)/(frontZ-.737);
    check('wing indicator is seated on the fender '+side,icy>=wingY-.003&&icy<wingY+.014,{undersideY:icy,wingY,gapM:icy-wingY});
    const widths=[0,1,2].map(i=>bounds(object('gclass-side-glass-'+side+'-'+i)).getSize(new T.Vector3()).z);
    // The true front corner fillet trims the extreme lower A-pillar point;
    // retain the wider-front / narrower-rear-door hierarchy and fixed pillars.
    check('measured side-pane hierarchy '+side,widths[0]>widths[1]*1.16&&widths[2]>widths[1]*1.06&&widths[2]<widths[0]*1.02,{widthsM:widths});
    check('reference rear-door glass is about 28 inches wide '+side,Math.abs(widths[1]-.707*.965)<.012,{widthM:widths[1],referenceOpeningM:.707});
    check('B and C pillars occupy the measured side stations '+side,Math.abs(bounds(object('gclass-side-glass-'+side+'-1')).max.z+.372)<.020&&Math.abs(bounds(object('gclass-side-glass-'+side+'-1')).min.z+1.055)<.020,{rearDoorGlassBoundsZ:[bounds(object('gclass-side-glass-'+side+'-1')).min.z,bounds(object('gclass-side-glass-'+side+'-1')).max.z]});
    const shoulder=object((ev?'g580-soft-bonnet-shoulder-':'g63-pressed-wing-shoulder-')+side),n=midNormal(shoulder),extent=bounds(shoulder).getSize(new T.Vector3());
    const returnNormal=new T.Vector3().fromBufferAttribute(shoulder.geometry.attributes.normal,3*49+24),edgeNormal=new T.Vector3().fromBufferAttribute(shoulder.geometry.attributes.normal,19*49+24);
    check('front wing has a flat ledge and a distinct outward hood return '+side,n.y>.97&&Math.abs(n.x)<.10&&returnNormal.x*side>.45&&edgeNormal.x*side>.20&&extent.y>.060,{ledgeNormal:n.toArray(),returnNormal:returnNormal.toArray(),edgeNormal:edgeNormal.toArray()});
    const joint=object('gclass-low-clamshell-hood-seam-'+side).geometry.attributes.position,stations=[];
    for(let i=0;i<joint.count;i+=9){const c=new T.Vector3();for(let j=0;j<8;j++)c.add(new T.Vector3().fromBufferAttribute(joint,i+j));stations.push(c.multiplyScalar(1/8));}
    const first=stations[0],last=stations.at(-1),descent=first.y-last.y;
    const seamDeviation=Math.max(...stations.map(p=>Math.abs(p.y-(first.y+(last.y-first.y)*(p.z-first.z)/(last.z-first.z)))));
    check('final-space hood joint descends without an S-shaped wave '+side,seamDeviation<.0015&&descent>.13&&descent<.17,{maximumChordErrorM:seamDeviation,descentM:descent,spanM:last.z-first.z});
    const skin=object('gclass-cab-skin-with-three-open-windows-'+side),cornerHits=[];
    for(const [z,sz]of [[-1.067,1],[-.360,-1]])for(const [y,sy]of [[1.342,1],[1.858,-1]])for(const inset of [.020,.060]){
      const fitted=gClassCoachworkPoint(side*3,y+sy*inset,z+sz*inset),start=view.body.localToWorld(new T.Vector3(...fitted));
      const metal=new T.Raycaster(start,new T.Vector3(-side,0,0),0,5).intersectObject(skin,false).length>0;
      cornerHits.push({sourceCorner:[z,y],insetM:inset,metal,expectedMetal:inset===.020});
    }
    check('window corner radii belong to actual holes rather than painted overlays '+side,cornerHits.every(c=>c.metal===c.expectedMetal),{rays:cornerHits});
    for(const axle of [-1.445,1.445]){
      const flare=object('gclass-box-shouldered-fender-'+side+'-'+axle),fn=midNormal(flare),inner=midNormal(object('gclass-closed-inner-wheelwell-'+side+'-'+axle));
      check('painted arch faces outward and dark wheelwell faces the tire '+side+' '+axle,fn.x*side>.95&&Math.abs(fn.y)<.25&&inner.y<-.95,{faceNormal:fn.toArray(),innerNormal:inner.toArray()});
    }
    const corner=midNormal(object('gclass-formed-bumper-corner-'+side));
    check('formed bumper side has outward normals '+side,corner.x*side>.9&&corner.z>0,{middleNormal:corner.toArray()});
    if(ev){const fairing=midNormal(object('g580-aerodynamic-a-pillar-fairing-'+side));check('EV pillar fairing faces the exterior '+side,fairing.z>.4,{middleNormal:fairing.toArray()});}
    glass.push(widths);
  }
  check('stock tire and bead-seat diameter use the selected factory option',ev?spec.tireSize==='275/50R20'&&spec.rimDiameterInches===20:spec.tireSize==='295/40R22'&&spec.rimDiameterInches===22&&spec.tireType==='road-performance',{tireSize:spec.tireSize,rimInches:spec.rimDiameterInches,tread:spec.tireType});
  check('wheelbase and roof envelope were not squashed to hide a silhouette error',spec.wheelbase===2.89&&spec.height>(ev?1.98:1.97),{wheelbaseM:spec.wheelbase,heightM:spec.height});
  const bonnet=object('gclass-sculpted-clamshell-bonnet'),bn=bounds(bonnet);
  const lip=object('gclass-rolled-bonnet-nose').geometry.attributes.position,lipHeights=[];
  for(let col=0;col<=56;col++)lipHeights.push(lip.getY(col)-lip.getY(8*57+col));
  check('bonnet nose is a thin rolled return across the entire width',lipHeights.every(h=>Math.abs(h-.024)<.00001),{minimumM:Math.min(...lipHeights),maximumM:Math.max(...lipHeights)});
  check('bonnet is a compound sheet with measurable height relief',bn.max.y-bn.min.y>.045&&midNormal(bonnet).y>.9,{heightReliefM:bn.max.y-bn.min.y});
  const localOrigin=view.body.localToWorld(new T.Vector3(0,2,1.445));view.root.updateMatrixWorld(true);
  const hoodHit=new T.Raycaster(localOrigin,new T.Vector3(0,-1,0),0,2).intersectObject(bonnet,false)[0];
  const axleHoodY=hoodHit&&view.body.worldToLocal(hoodHit.point.clone()).y;
  check('hood over the front axle follows the 49-inch drawing datum',axleHoodY>(ev?1.255:1.225)&&axleHoodY<(ev?1.325:1.295),{heightM:axleHoodY,amgReferenceM:1.246,evRaisedHood:true});
  check('side glass is below the formerly high greenhouse',[0,1,2].every(i=>bounds(object('gclass-side-glass-1-'+i)).max.y<1.81&&bounds(object('gclass-side-glass-1-'+i)).min.y>1.26),{});
  const flange=new T.Box3().setFromObject(object('gclass-rolled-roof-flange')).getSize(new T.Vector3());
  check('roof flange is shallow instead of a deep vertical visor',flange.y<.041&&flange.y>.005,{heightRangeM:flange.y});
  const crown=object('gclass-rounded-roof-crown'),roofSample=z=>{
    const start=view.body.localToWorld(new T.Vector3(0,3,z)),hit=new T.Raycaster(start,new T.Vector3(0,-1,0),0,2).intersectObject(crown,false)[0];return hit&&view.body.worldToLocal(hit.point.clone()).y;
  };
  const roofA=roofSample(.330),roofB=roofSample(.465);
  check('front roof crown rolls into the header',roofA-roofB>.012&&roofA-roofB<.030,{crownYM:roofA,edgeYM:roofB,rollM:roofA-roofB});
  const indicator=view.materials.gIndicatorLens;
  check('wing indicator lenses are neutral and unlit at rest',indicator.color.b>indicator.color.r&&indicator.emissive.getHex()===0&&indicator.userData.nativeRole==='lens',{});
  const lamps=[];view.body.traverse(o=>{if(o.name==='gclass-round-multibeam-headlight')lamps.push(o);});
  const lampSizes=lamps.map(o=>new T.Box3().setFromObject(o).getSize(new T.Vector3()));
  const lampCenters=lamps.map(o=>view.body.worldToLocal(o.getWorldPosition(new T.Vector3()))),lampSpacing=Math.abs(lampCenters[0]?.x-lampCenters[1]?.x);
  // Independent scale check: brochure p84 front crop has 898 px / 1.979 m,
  // lens diameter 96–100 px, centers 576 px apart and 412–413 px above ground.
  // Keep tolerance for drawing line thickness, not the superseded 0.303 m lamp.
  check('round MULTIBEAM size and placement follow the manufacturer front drawing',lampSizes.length===2&&lampSizes.every(s=>Math.abs(s.x-s.y)<.0001&&s.x>.212&&s.x<.222)&&Math.abs(lampSpacing-1.2694)<.010&&lampCenters.every(p=>Math.abs(p.y-.9091)<.008),{diametersM:lampSizes.map(s=>[s.x,s.y]),centerHeightsM:lampCenters.map(p=>p.y),centerSpacingM:lampSpacing,reference:{source:'March 2025 G-Class brochure page 84 front drawing',scalePxPerM:898/1.979,diameterPx:[96,100],centerSpacingPx:576,centerAboveGroundPx:[412,413],measurement:'Raster-derived estimates, not published engineering lamp dimensions.'}});
  const sheet=object('gclass-front-sheet-with-round-apertures');let openRays=0,solidRays=0;const misses=[];
  const frontNormals=sheet.geometry.attributes.normal;let minFrontNormalZ=1;for(let i=0;i<frontNormals.count;i++)minFrontNormalZ=Math.min(minFrontNormalZ,frontNormals.getZ(i));
  check('fascia upper corners do not fold or face backward',minFrontNormalZ>.90,{minimumNormalZ:minFrontNormalZ});
  const positions=sheet.geometry.attributes.position,indices=sheet.geometry.index;let reversedTriangles=0,minimumTriangleNormalZ=1;
  for(let i=0;i<indices.count;i+=3){
    const a=new T.Vector3().fromBufferAttribute(positions,indices.getX(i)),b=new T.Vector3().fromBufferAttribute(positions,indices.getX(i+1)),c=new T.Vector3().fromBufferAttribute(positions,indices.getX(i+2)),normal=b.sub(a).cross(c.sub(a));
    if(normal.length()>1e-10){minimumTriangleNormalZ=Math.min(minimumTriangleNormalZ,normal.normalize().z);if(normal.z<0)reversedTriangles++;}
  }
  check('actual fascia triangles retain outward winding around the lamps',reversedTriangles===0&&minimumTriangleNormalZ>0,{reversedTriangles,minimumTriangleNormalZ,triangles:indices.count/3});
  for(const lamp of lamps){
    const centre=view.body.worldToLocal(lamp.getWorldPosition(new T.Vector3()));
    for(let i=0;i<16;i++)for(const r of [.104,.118]){
      const a=i*Math.PI/8,start=view.body.localToWorld(new T.Vector3(centre.x+r*Math.cos(a),centre.y+r*Math.sin(a),3));
      const hit=new T.Raycaster(start,new T.Vector3(0,0,-1),0,5).intersectObject(sheet,false).length>0;
      if(r===.104&&!hit)openRays++;if(r===.118&&hit)solidRays++;
      if(r===.104&&hit)misses.push({side:Math.sign(centre.x),angle:i,unexpectedSolidInside:true});
      if(r===.118&&!hit)misses.push({side:Math.sign(centre.x),angle:i});
    }
  }
  const grilleRays=[-.470,-.420,.420,.470].map(x=>{const start=view.body.localToWorld(new T.Vector3(x,.909,3)),hit=new T.Raycaster(start,new T.Vector3(0,0,-1),0,5).intersectObject(sheet,false).length>0;return{xM:x,solid:hit,expectedSolid:Math.abs(x)>.438};});
  check('formed fascia has separate circular lamps and a drawing-width grille opening',openRays===32&&solidRays===32&&grilleRays.every(r=>r.solid===r.expectedSolid),{openRays,solidRays,misses,grilleRays,referenceGrilleWidthM:397/(898/1.979)});
  const molding=[];view.body.traverse(o=>{if(o.name==='gclass-level-protective-molding'){const b=new T.Box3().setFromObject(o);molding.push({centerY:b.getCenter(new T.Vector3()).y+spec.cgHeight,thicknessY:b.max.y-b.min.y});}});
  check('all eight protective molding sections stay level across the nose',molding.length===8&&molding.every(r=>Math.abs(r.centerY-.995)<.0001&&Math.abs(r.thicknessY-.049*.65)<.0001),{sections:molding});
  if(!ev){const spare=new T.Box3().setFromObject(object('g63-covered-factory-spare')).getSize(new T.Vector3());check('round covered spare remains round after the body proportion fit',Math.abs(spare.x-spare.y)<.0001,{diametersM:[spare.x,spare.y]});}
  rows.push({vehicle:spec.id,checks:tests.length,pass:true,bonnetPeakYM:bn.max.y,sideGlassWidthsM:glass[0],tests});view.dispose();
}
assert.ok(rows[0].bonnetPeakYM-rows[1].bonnetPeakYM>.020,'EV raised bonnet is physically distinct from AMG');
let minimumVerticalSlope=Infinity;
for(let z=-2.7;z<=2.4;z+=.031)for(let y=0;y<=2.1;y+=.013){const slope=(gClassCoachworkPoint(0,y+.0001,z)[1]-gClassCoachworkPoint(0,y-.0001,z)[1])/.0002;minimumVerticalSlope=Math.min(minimumVerticalSlope,slope);}
assert.ok(minimumVerticalSlope>.1,'reference fit does not fold any body sheet');
const report={revision:16,sourceOnly:true,pass:true,checks:rows.reduce((n,r)=>n+r.checks,0)+2,minimumVerticalSlope,variants:rows,limitations:['Photo-derived panel positions; not OEM CAD.','Native rendered comparison remains required.']};
fs.writeFileSync(new URL('../docs/gclass-shape-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,checks:report.checks,vehicles:rows.map(r=>({id:r.vehicle,checks:r.checks,glass:r.sideGlassWidthsM,bonnetPeakYM:r.bonnetPeakYM}))}));
