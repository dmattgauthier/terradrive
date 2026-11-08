// Independent validation of the fitted opaque body against swept tire volumes.
// Uses one-degree steering samples, no fit margins, and native upgrade equations.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tireDiameterInches} from './tire-size-geometry.mjs';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('SourceAssets/import.json'),world=read('Content/NativeData/world.json');
const expected=process.argv.find(v=>v.startsWith('--expect-vehicles='));
if(expected)assert.equal(manifest.vehicles.length,Number(expected.split('=')[1]),'requested roster exported');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
function minimumGap(spec,samples,fit){
 const r=fit.diameterInches*.0127,widthScale=1.21*Math.sqrt(r/spec.tireRadius),a=[...fit.axleOffsetsM];
 const front=34*Math.PI/180,rear=front*(spec.bodyStyle==='hummer'?-.25:spec.bodyStyle==='urus'?-.12:0);
 const span=a.length===3?a[0]-(a[1]+a[2])*.5:spec.wheelbase;
 let minimum=Infinity,limiting=null,poseCount=0;
 for(let axle=0;axle<a.length;axle++)for(let ws=0;ws<=3;ws++){
  const track=spec.track+fit.trackExtraM+.035*ws;
  const angle=axle?rear:front,other=axle?front:rear;
  const curvature=(Math.tan(angle)-Math.tan(other))/(axle?-span:span);
  const maxAngle=Math.atan(Math.abs(Math.tan(angle))/Math.max(.35,1-track*.5*Math.abs(curvature)));
  const angleSamples=Math.max(1,Math.ceil(maxAngle*180/Math.PI));
  const half=(axle?(spec.rearTireWidth??spec.tireWidth):spec.tireWidth)*widthScale*.5;
  const bump=Math.max(.055,(spec.suspension[axle?'travelRear':'travelFront']??spec.suspension.travel)*.58);
  const centerY=spec.tireRadius+bump-fit.liftM;
  for(const side of [-1,1])for(let j=-angleSamples;j<=angleSamples;j++){
   const theta=maxAngle*j/angleSamples,c=Math.cos(theta),s=Math.sin(theta),x=side*track*.5;poseCount++;
   for(const [px,py,pz]of samples){
    const dx=px-x,dz=pz-a[axle];if(Math.abs(dx)>r+half||Math.abs(dz)>r+half)continue;
    const axial=dx*c-dz*s,along=dx*s+dz*c;
    if(Math.abs(axial)>half||Math.abs(along)>=r)continue;
    const gap=py-centerY-Math.sqrt(r*r-along*along);
    if(gap<minimum){minimum=gap;limiting={axle,side,steerDegrees:theta*180/Math.PI,wheelStage:ws,surfaceM:[px,py,pz]};}
   }
  }
 }
 return {minimumVerticalClearanceM:minimum,poseCount,limiting};
}
const vehicles=[];
for(const spec of manifest.vehicles){
 check(JSON.stringify(spec.tireFits)===JSON.stringify(world.vehicles.find(v=>v.id===spec.id)?.tireFits),spec.id+' matching cooked/source metadata');
 if(spec.tireRadius*2/.0254>=50){check(spec.tireFits.length===0,spec.id+' preserves larger stock tires');continue;}
 check(spec.tireFits.length===3,spec.id+' allthree oversized kits');
 const cache=read('Saved/ExpandedRosterFidelity/TireFit/'+spec.asset+'_body.json');
 check(cache.version===2&&cache.bodySha256===manifest.assets.find(a=>a.name===spec.asset+'_body').sha256,spec.id+' samples match exported body');
 check(cache.coverageCells>500,spec.id+' sampled opaque body coverage');
 const fits=[];
 for(const fit of spec.tireFits){
  const r=fit.diameterInches*.0127;
  check(fit.diameterInches===tireDiameterInches(spec.tireRadius,fit.stage),spec.id+' exact imperial stage');
  check(fit.liftM>0&&fit.liftM<1.25&&Number.isFinite(fit.liftM),spec.id+' bounded finite lift');
  check(fit.trackExtraM>=Math.max(0,r-spec.tireRadius)*.55-1e-9&&fit.trackExtraM<=.45, spec.id+' runtime track fallback cannot exceed chosen fit');
  for(let ss=0;ss<=3;ss++){
   const travel=spec.suspension.travel+.07*ss;
   check(.035*ss+Math.max(.055,spec.suspension.travel*.58)>=Math.max(.055,spec.suspension.travel*.58+.45*(travel-spec.suspension.travel))-1e-9,spec.id+' suspension lift covers added bump');
  }
  if(fit.axleOffsetsM.length===3){
   check(Math.abs(fit.axleOffsetsM[0]-spec.axleOffsetsM[0])<1e-9&&Math.abs(fit.axleOffsetsM[1]-spec.axleOffsetsM[1])<1e-9,spec.id+' front/middle axles stay in authored openings');
   check(fit.axleOffsetsM[1]-fit.axleOffsetsM[2]>=2*r+.08-1e-9,spec.id+' tandem tires keep80mm gap');
  }
  const clearance=minimumGap(spec,cache.samples,fit);
  check(clearance.minimumVerticalClearanceM>=.005,spec.id+' no opaque body overlap at full bump/steer stage'+fit.stage);
  fits.push({...fit,...clearance});
 }
 const small=spec.tireFits[0],oldRadius=small.diameterInches*.0127;
 const old=minimumGap(spec,cache.samples,{...small,liftM:oldRadius-spec.tireRadius+.025,trackExtraM:(oldRadius-spec.tireRadius)*.55});
 // Detect that the test exercises the previously unprotected body shell.
 check(old.minimumVerticalClearanceM<0,spec.id+' previous fitting formula has a reproducible overlap');
 vehicles.push({id:spec.id,bodySha256:cache.bodySha256,coverageCells:cache.coverageCells,previousFormulaOverlapM:-old.minimumVerticalClearanceM,fits});
}
const report={kind:'source-geometry',nativeAcceptance:false,passed:checks,roster:manifest.vehicles.length,fittedVehicles:vehicles.length,
 method:'One-degree swept solid tire envelopes against actual exported opaque body samples; allwheel tracks, full stock bump, suspension stages0–3, worst compound width, rear-steer and trailing-tandem clearance',vehicles};
fs.writeFileSync(path.join(root,'docs','tire-fit-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:checks,roster:report.roster,fittedVehicles:vehicles.length,minClearanceM:Math.min(...vehicles.flatMap(v=>v.fits.map(f=>f.minimumVerticalClearanceM)))}));
