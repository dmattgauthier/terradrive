// Original source geometry checks only. Never exports, imports or starts UE.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as T from '../../TerraDrive-v1.13/dist/vendor/three.module.js';
import {VEHICLES} from './native-vehicles.mjs';
import {prepareNativeVehicle} from './vehicle-realism.mjs';
import {GCLASS_LANDMARKS as G} from './mercedes-gclass.mjs';
import {EARTHCRUISER_EXP_LANDMARKS as E} from './earthcruiser-exp.mjs';

export const expeditionStyle=spec=>['earthcruiser','g580','g63'].includes(spec.bodyStyle);
const materialAt=hit=>Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;
function ray(view,origin,direction){
  const start=view.body.localToWorld(new T.Vector3(...origin)),dir=new T.Vector3(...direction).transformDirection(view.body.matrixWorld);
  return new T.Raycaster(start,dir,0,12).intersectObject(view.body,true);
}
function solid(view,origin,direction){const hit=ray(view,origin,direction).find(h=>!materialAt(h).transparent);assert.ok(hit,'physical opaque source probe hit');return{point:view.body.worldToLocal(hit.point.clone()),material:materialAt(hit)};}
function geometrySummary(view){
  const localFromWorld=view.body.matrixWorld.clone().invert(),bounds=new T.Box3();let vertices=0,triangles=0,nonfinite=0,nonunit=0;const materials=new Set();
  view.body.traverse(o=>{
    if(!o.isMesh)return;const transform=localFromWorld.clone().multiply(o.matrixWorld),p=o.geometry.attributes.position,n=o.geometry.attributes.normal;
    assert.ok(p&&n&&p.count===n.count,'complete body position/normal streams');vertices+=p.count;triangles+=(o.geometry.index?.count??p.count)/3;
    for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
    const q=new T.Vector3();
    for(let i=0;i<p.count;i++){
      q.fromBufferAttribute(p,i);nonfinite+=![q.x,q.y,q.z,n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite);
      nonunit+=Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)>.001;
      bounds.expandByPoint(q.applyMatrix4(transform));
    }
  });return{vertices,triangles,nonfinite,nonunit,materials:materials.size,bounds,size:bounds.getSize(new T.Vector3())};
}

/** Called by validate-models too; caller owns preparation and disposal. */
export function inspectExpeditionVehicle(view,spec,parts){
  assert.ok(expeditionStyle(spec),'new expedition style');view.root.updateMatrixWorld(true);
  const tests=[],check=(name,pass,observed)=>{tests.push({case:name,pass,...observed});assert.ok(pass,spec.id+': '+name);};
  const earth=spec.bodyStyle==='earthcruiser',ev=spec.bodyStyle==='g580',summary=geometrySummary(view),reference=earth?E:G;
  check('finite original body vertices and normal streams',summary.nonfinite===0,{nonfinite:summary.nonfinite});
  check('unit source shading normals',summary.nonunit/summary.vertices<.001,{normalizedFraction:1-summary.nonunit/summary.vertices});
  check('bounded original body geometry and material budget',summary.triangles<=(earth?800000:450000)&&summary.materials<=48,{triangles:summary.triangles,vertices:summary.vertices,materialObjects:summary.materials});
  check('body datum agrees with the mechanical CG and axle midpoint',Math.abs(view.body.position.y+spec.cgHeight)<1e-7&&Math.abs(view.body.position.z-(.5-spec.frontWeightFraction)*spec.wheelbase)<1e-7,{bodyOffset:view.body.position.toArray()});
  check('four detached split wheel rigs retain their export hub pivots',view.wheels.length===4&&view.wheels.every(w=>w.root&&w.tireShape&&w.tireSpin&&w.rimSpin&&w.root.position.length()<1e-8)&&!!parts.tire&&!!parts.rim,{wheelHubSourcePositions:view.wheels.map(w=>w.root.position.toArray())});
  const tireBounds=new T.Box3().setFromObject(parts.tire),tireSize=tireBounds.getSize(new T.Vector3()),rimBounds=new T.Box3().setFromObject(parts.rim),rimSize=rimBounds.getSize(new T.Vector3()),rimRadius=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254/2;
  check('factory tire radius agrees with the physics tire',Math.abs(Math.max(tireSize.y,tireSize.z)/2-spec.tireRadius)<.004,{radiusM:Math.max(tireSize.y,tireSize.z)/2,physicsRadiusM:spec.tireRadius});
  check('factory tire width includes shoulders without width inflation',tireSize.x>=spec.tireWidth*.99&&tireSize.x<spec.tireWidth*1.10,{widthM:tireSize.x,physicsWidthM:spec.tireWidth});
  check('factory wheel diameter stays at the selected bead seat',Math.max(rimSize.y,rimSize.z)/2>=rimRadius*.95&&Math.max(rimSize.y,rimSize.z)/2<=rimRadius*1.02,{renderRadiusM:Math.max(rimSize.y,rimSize.z)/2,nominalRadiusM:rimRadius});
  const roofHeight=earth?E.height:ev?G.g580Height:G.g63Height,length=earth?E.length:ev?G.g580LengthWithDesignBox:G.g63LengthWithSpare,mirrorWidth=earth?E.estimatedMirrorWidth:G.widthWithMirrors;
  check('stock roof follows the sourced closed-roof height',Math.abs(summary.bounds.max.y-roofHeight)<.025,{sourceTopYM:summary.bounds.max.y,referenceM:roofHeight,toleranceM:.025});
  check('body and selected rear hardware follow the reference length envelope',Math.abs(summary.size.z-length)<.060,{sourceLengthM:summary.size.z,referenceM:length,toleranceM:.060});
  check('mirror and external trim span stays within the selected envelope',Math.abs(summary.size.x-mirrorWidth)<.060,{sourceWidthWithMirrorsM:summary.size.x,referenceM:mirrorWidth,toleranceM:.060,referenceStatus:earth?'photo-estimated mirror span':'manufacturer mirror width'});
  check('visual axle hardpoints retain the published wheelbase',Math.abs(spec.wheelbase-reference.wheelbase)<1e-6,{wheelbaseM:spec.wheelbase,axlesInContactDatumM:[reference.frontAxleZ,reference.rearAxleZ],axlesInCGFrameM:[(1-spec.frontWeightFraction)*spec.wheelbase,-spec.frontWeightFraction*spec.wheelbase],note:'Detached wheel meshes remain at their hub pivots; native placement at these mechanical hardpoints is verified separately.'});
  const lamps={brake:0,reverse:0};view.body.traverse(o=>{if(o.isMesh&&lamps[o.material?.userData.nativeRole]!==undefined)lamps[o.material.userData.nativeRole]++;});
  check('brake and reverse use separate dynamic material roles',lamps.brake>0&&lamps.reverse>0&&view.materials.red!==view.materials.reverse,{dynamicMeshCounts:lamps});
  check('unmeasured suspension calibration is labeled and primary sources retained',/simulat|estimat|calibrat/i.test(spec.suspension?.parameterStatus||'')&&Array.isArray(spec.sources)&&spec.sources.length>0,{suspensionStatus:spec.suspension?.parameterStatus,sources:spec.sources});
  const glazing=[];
  function pane(label,start,direction){const hits=ray(view,start,direction),hit=hits[0],material=hit&&materialAt(hit);check(label+' has a genuine first-hit glass opening',!!material?.userData.vehicleGlass,{firstMaterialRole:material?.userData.nativeRole||'',firstDistanceM:hit?.distance??null});glazing.push({pane:label,firstDistanceM:hit?.distance});}
  if(!earth){
    for(const side of [-1,1])for(const [label,z]of [['front side',.15],['rear side',-.70],['rear quarter',-1.68]])pane(label+' '+side,[side*3,1.61,z],[-side,0,0]);
    pane('upright windscreen',[0,1.61,4],[0,0,-1]);pane('rear door glass',[0,1.74,-4],[0,0,1]);pane('sunroof',[0,3,-.10],[0,-1,0]);
    const bonnetCentre=solid(view,[0,2,1.35],[0,-1,0]),bonnetFlank=solid(view,[.65,2,1.35],[0,-1,0]);
    check('bonnet has restrained physical transverse crown',bonnetCentre.point.y-bonnetFlank.point.y>.010&&bonnetCentre.point.y-bonnetFlank.point.y<.060,{crownM:bonnetCentre.point.y-bonnetFlank.point.y});
    const shoulder=solid(view,[2,1.245,-.60],[-1,0,0]),waist=solid(view,[2,.85,-.60],[-1,0,0]);
    check('drawn door sheet has physical shoulder relief',shoulder.point.x-waist.point.x>.008,{reliefM:shoulder.point.x-waist.point.x});
    const roofCentre=solid(view,[0,3,-1.20],[0,-1,0]),roofSide=solid(view,[.70,3,-1.20],[0,-1,0]);
    check('metal roof has a shallow transverse crown',roofCentre.point.y-roofSide.point.y>.004&&roofCentre.point.y-roofSide.point.y<.035,{crownM:roofCentre.point.y-roofSide.point.y});
    const named=[];view.body.traverse(o=>{if(o.name)named.push(o.name);});
    check('four formed wheel extensions are distinct from the cab shell',named.filter(n=>n.startsWith('gclass-box-shouldered-fender-')).length===4,{});
    check('rear attachment and exhaust geometry identify the actual variant',ev?named.includes('g580-rear-design-box')&&!named.includes('g63-covered-factory-spare')&&!named.includes('amg-functional-side-exhaust-tip'):named.includes('g63-covered-factory-spare')&&!named.includes('g580-rear-design-box')&&named.filter(n=>n==='amg-functional-side-exhaust-tip').length===4,{variant:spec.bodyStyle});
    check('rear reflectors are static and only lamps receive brake commands',lamps.brake===3&&lamps.reverse===2&&view.materials.gReflector.userData.nativeRole!=='brake',{brakeEmitters:lamps.brake,reverseEmitters:lamps.reverse});
    check('native capability metadata distinguishes virtual and mechanical differentials',ev?spec.electricMotors===4:spec.features.frontLocker&&spec.features.rearLocker&&Math.abs(spec.lowRatio-2.93)<1e-6,{electricMotors:spec.electricMotors??0,lowRatio:spec.lowRatio});
    let spokes=0;parts.rim.traverse(o=>{if(o.name==='gclass-'+(ev?'ten':'ten-twin')+'-spoke')spokes++;});
    check('selected factory rim has open original spokes on both faces',spokes===(ev?20:40),{spokeBranches:spokes,selectedRimInches:spec.rimDiameterInches});
    if(ev){const panel=solid(view,[.360,.910,3],[0,0,-1]);check('electric grille uses the distinct recessed closed black panel',panel.material===view.materials.gBlackPanel&&panel.point.z<2.222,{panelZM:panel.point.z});}
    else{const bar=solid(view,[.408,.910,3],[0,0,-1]),between=solid(view,[.374,.910,3],[0,0,-1]);check('AMG vertical grille bars stand in front of the dark backing',bar.point.z-between.point.z>.020,{setbackM:bar.point.z-between.point.z});}
  }else{
    pane('camper right pane',[2,2.20,-2.50],[-1,0,0]);pane('camper left pane',[-2,2.20,-2.50],[1,0,0]);
    pane('cab windscreen',[0,1.85,2.50],[0,0,-1]);
    const cabin=ray(view,[0,1.85,2.50],[0,0,-1]),paneHit=cabin.find(h=>materialAt(h).userData.vehicleGlass),back=cabin.find(h=>!materialAt(h).transparent&&h.distance>(paneHit?.distance||0)+.005);
    const backLocal=back&&view.body.worldToLocal(back.point.clone());
    check('cab-over pass-through is not filled by an opaque cab wall',!!paneHit&&!!backLocal&&backLocal.z<-3.1,{firstOpaqueAfterWindscreenZM:backLocal?.z??null});
    for(let i=0;i<5;i++){const hit=solid(view,[.103,3.1,-2.83+i*.778+.07],[0,-1,0]);check('closed pop-top retains solar panel '+i,hit.material===view.materials.solar&&hit.point.y>2.74&&hit.point.y<2.79,{sourceTopYM:hit.point.y});}
    const cabTop=solid(view,[.92,2.30,3.2],[0,0,-1]),cabLow=solid(view,[.92,1.48,3.2],[0,0,-1]);
    check('cab-over front has formed depth rather than a single box face',cabTop.material===view.materials.paint&&cabLow.material===view.materials.paint&&Math.abs(cabTop.point.z-cabLow.point.z)>.025,{cabUpperZM:cabTop.point.z,cabLowerZM:cabLow.point.z});
  }
  const expected=earth?24:32;assert.equal(tests.length,expected,spec.id+' explicit source check count');
  return{vehicle:spec.name,id:spec.id,style:spec.bodyStyle,checks:tests.length,pass:true,sourceOnly:true,geometry:{vertices:summary.vertices,triangles:summary.triangles,materialObjects:summary.materials,bounds:[summary.bounds.min.toArray(),summary.bounds.max.toArray()]},glazing,tests,limitations:['Offline source geometry; no native rendered acceptance.','Overall dimensions are sourced; panel stations, CG, suspension calibration and selected mirror/overhang fits include estimates.']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const rows=[];
  for(const spec of VEHICLES.filter(expeditionStyle)){
    const {view,parts}=prepareNativeVehicle(spec);try{rows.push(inspectExpeditionVehicle(view,spec,parts));}finally{view.dispose();}
  }
  assert.equal(rows.length,3,'three new expedition vehicles');const checks=rows.reduce((n,r)=>n+r.checks,0);assert.equal(checks,88);
  const report={revision:'expedition-gclass-15',pass:true,checks,vehicles:rows,acceptance:'Source-only original geometry. Native import, render, suspension and gameplay verification remain separate.'};
  fs.writeFileSync(new URL('../docs/expedition-vehicle-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:true,checks,vehicles:rows.map(({id,checks,geometry})=>({id,checks,...geometry}))}));
}
