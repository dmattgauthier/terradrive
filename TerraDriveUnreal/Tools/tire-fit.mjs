// Oversized tires use local wheelhouse clearance, bump stops and steering stops.
// All lengths here are source metres: X lateral, Y above stock ground, Z forward.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {resizeTireObj,tireDiameterInches} from './tire-size-geometry.mjs';
import {makeWheelhouseBody} from './tire-wheelhouse.mjs';
import {beginSourceExport,publishSourceExport,verifySourceExport} from './source-export-state.mjs';
import {readCachedJson} from './read-cached-json.mjs';

const rootDefault=path.resolve(import.meta.dirname,'..');
// Capture the generator version when its modules load, before a long export starts.
const generator=crypto.createHash('sha256');
for(const file of [import.meta.filename,path.join(import.meta.dirname,'tire-wheelhouse.mjs'),path.join(import.meta.dirname,'tire-size-geometry.mjs')]){
 generator.update(fs.readFileSync(file));
}
const version=generator.digest('hex');
const deg=Math.PI/180,margin=.024;
const sizes=[27,29,31,33,35,37,39,40,42,44,46,48,50];
// Road unibodies retain the bumper/strut mounting area. The 6x6 has a
// separate ceiling because tandem tires need room without moving the bed.
const diameterLimit={
 'civic-sport':33,'subaru-22b-sti':33,'sprinter-2500':42,'urus-performante':40,
 'mercedes-g580-ev':48,'mercedes-amg-g63-6x6':46,
};

export function fitAxles(spec,radius){
 const a=spec.axleOffsetsM?[...spec.axleOffsetsM]:[spec.wheelbase*(1-spec.frontWeightFraction),-spec.wheelbase*spec.frontWeightFraction];
 if(a.length===3)a[2]-=Math.max(0,2*radius+.08-(a[1]-a[2]));
 return a;
}

export function deriveTireFits(spec){
 const stock=spec.tireRadius*2/.0254;
 if(stock>=50)return [];
 const limit=diameterLimit[spec.id]??50;
 const legacy=[1,2].map(stage=>tireDiameterInches(spec.tireRadius,stage));
 // Preserve previous selectable inch values when the new wheelhouse can fit
 // them. A close neighbor is represented by its legacy value instead.
 const picks=new Set(sizes.filter(n=>n>=stock+1.2&&n<=limit));
 for(const diameter of legacy.filter(n=>n>=stock+1.2&&n<=limit)){
  for(const near of picks)if(Math.abs(near-diameter)===1&&near!==40&&near!==limit)picks.delete(near);
  picks.add(diameter);
 }
 const hasSeparateExtreme=limit-stock>10;
 return [...picks].sort((a,b)=>a-b).map((diameterInches,i)=>{
  const radius=diameterInches*.0127,growth=radius-spec.tireRadius;
  const minimumSuspensionStage=growth<=.070?1:growth<=.145?2:3;
  const travel=diameterInches>=44?.110:diameterInches>=38?.125:.145;
  const maximumSteeringDegrees=diameterInches>=44?27:diameterInches>=38?30:32;
  const trackExtraM=Math.ceil((.020+growth*.70)*1000)/1000;
  const bodyAsset=spec.asset+(hasSeparateExtreme&&growth<=.086?'_trail':'')+'_clearance_body';
  return {stage:i+1,diameterInches,minimumSuspensionStage,bodyAsset,liftM:0,
   trackExtraM,maximumBumpFrontM:travel,maximumBumpRearM:travel,maximumSteeringDegrees,
   axleOffsetsM:fitAxles(spec,radius),marginM:margin};
 });
}

export function bumpTravel(spec,fit,axle,stage){
 const travel=spec.suspension[axle?'travelRear':'travelFront']??spec.suspension.travel;
 return Math.min(axle?fit.maximumBumpRearM:fit.maximumBumpFrontM,Math.max(.055,travel*.58+stage*.07*.45));
}

export function outerHalfWidth(spec,fit,axle){
 const factory=axle?(spec.rearTireWidth??spec.tireWidth):spec.tireWidth;
 // The tread/sidewall mesh extends 4 percent past the catalogue section.
 return factory*.5*1.04*1.21*Math.sqrt(fit.diameterInches*.0127/spec.tireRadius);
}

function chassisPoses(spec,fit,axle,side){
 const span=fit.axleOffsetsM.length===3?fit.axleOffsetsM[0]-(fit.axleOffsetsM[1]+fit.axleOffsetsM[2])*.5:spec.wheelbase;
 const front=(fit.maximumSteeringDegrees+2)*deg;
 const rear=front*(spec.bodyStyle==='hummer'?-.25:spec.bodyStyle==='urus'?-.12:0);
 const axleSteer=axle?rear:front,otherSteer=axle?front:rear;
 const curvature=(Math.tan(axleSteer)-Math.tan(otherSteer))/(axle?-span:span);
 const centerY=Math.max(...Array.from({length:4-fit.minimumSuspensionStage},(_,i)=>{
  const stage=i+fit.minimumSuspensionStage;return spec.tireRadius+bumpTravel(spec,fit,axle,stage)-stage*.035;
 }));
 const poses=[];
 for(let wheels=0;wheels<=3;wheels++){
  const track=spec.track+fit.trackExtraM+wheels*.035;
  const maxAngle=Math.atan(Math.abs(Math.tan(axleSteer))/Math.max(.35,1-track*.5*Math.abs(curvature)));
  const angleCount=Math.max(1,Math.ceil(maxAngle/(2*deg)));
  for(let step=-angleCount;step<=angleCount;step++){
   const a=maxAngle*step/angleCount;
   poses.push({x:side*track*.5,y:centerY,z:fit.axleOffsetsM[axle],sin:Math.sin(a),cos:Math.cos(a),
    radius:fit.diameterInches*.0127,halfWidth:outerHalfWidth(spec,fit,axle)});
  }
 }
 return poses;
}

export function envelopeSupport(p,n){
 const forward=n[0]*p.sin+n[2]*p.cos,axial=n[0]*p.cos-n[2]*p.sin;
 return n[0]*p.x+n[1]*p.y+n[2]*p.z+p.radius*Math.hypot(forward,n[1])+p.halfWidth*Math.abs(axial);
}

function directions(){
 const normals=[];
 // Upper hemispherical halfspaces define a wheel arch open to the ground.
 // No downward-facing plane limits the clearance as the suspension droops.
 for(const elevation of [0,15,30,45,60,75,90]){
  if(elevation===90){normals.push([0,1,0]);continue;}
  const h=Math.cos(elevation*deg),y=Math.sin(elevation*deg);
  for(let az=0;az<360;az+=30)normals.push([Math.cos(az*deg)*h,y,Math.sin(az*deg)*h]);
 }
 return normals;
}

export function fitVolumes(spec,fits){
 const normals=directions(),axleCount=fits[0].axleOffsetsM.length;
 return Array.from({length:axleCount},(_,axle)=>[-1,1].map(side=>{
  const poses=fits.flatMap(fit=>chassisPoses(spec,fit,axle,side));
  // 24 mm includes steering envelope sampling displacement, visible tire
  // shoulder geometry and the clearance to the new cut edge.
  const planes=normals.map(normal=>({normal,distance:Math.max(...poses.map(p=>envelopeSupport(p,normal)))+margin}));
  const bounds={min:[0,-Infinity,0],max:[0,0,0]};
  for(const [axis,n]of [[0,[1,0,0]],[1,[0,1,0]],[2,[0,0,1]]]){
   bounds.max[axis]=Math.max(...poses.map(p=>envelopeSupport(p,n)))+margin;
   if(axis!==1)bounds.min[axis]=-(Math.max(...poses.map(p=>envelopeSupport(p,n.map(q=>-q))))+margin);
  }
  return {side,axleZ:fits[0].axleOffsetsM[axle],centerY:Math.max(...poses.map(p=>p.y)),bounds,planes};
 })).flat();
}

function makeAsset(out,name,source,slots){
 fs.writeFileSync(path.join(out,name+'.obj'),source);
 return {name,slots,sha256:crypto.createHash('sha256').update(source).digest('hex')};
}

export async function bakeTireFits(root,manifest){
 const out=path.join(root,'SourceAssets'),evidence=path.join(root,'Saved','TireClearance');
 fs.mkdirSync(evidence,{recursive:true});
 const reportPath=path.join(evidence,'fit-report.json'),results=[];
 const previous=readCachedJson(reportPath),assetMap=new Map(manifest.assets.map(asset=>[asset.name,asset]));
 const oldSizes=/_(?:tire_size[0-9]+_0|tire_[1-3]|(?:trail_)?clearance_body)$/;
 const retained=manifest.assets.filter(asset=>!oldSizes.test(asset.name));
 manifest.assets.splice(0,manifest.assets.length,...retained);
 let liner=manifest.materials.find(material=>material.role==='wheelLiner'&&material.automotiveOwner==='tire-fit');
 if(!liner){
  const number=Math.max(...manifest.materials.map(m=>Number(m.id.slice(2))))+1;
  liner={id:'M_'+String(number).padStart(3,'0'),color:[.038,.035,.032],roughness:.92,metallic:0,opacity:1,vertexColors:false,
   diffuse:null,alpha:null,alphaTest:0,clearcoat:0,coatRoughness:.2,emissive:[0,0,0],role:'wheelLiner',
   automotive:'',automotiveOwner:'tire-fit',normal:null,roughMap:null};
  manifest.materials.push(liner);
 }
 for(const spec of manifest.vehicles){
  const fits=deriveTireFits(spec),base=assetMap.get(spec.asset+'_tire');
  spec.tireFits=fits;
  if(!fits.length)continue;
  const body=assetMap.get(spec.asset+'_body');
  const bead=Number(spec.tireSize.match(/R(\d+)/)[1])*.0254*.5*.97*100;
  const geometryInputs=[spec.cgHeight,spec.wheelbase,spec.track,spec.bodyStyle,spec.tireRadius,spec.tireWidth,
   spec.rearTireWidth??spec.tireWidth,spec.suspension.travelFront??spec.suspension.travel,
   spec.suspension.travelRear??spec.suspension.travel,bead];
  const prior=previous?.version===version?previous.vehicles.find(v=>v.id===spec.id&&v.bodySha256===body.sha256&&
   v.stockTireSha256===base.sha256&&v.liner===liner.id&&JSON.stringify(v.tireFits)===JSON.stringify(fits)&&
   JSON.stringify(v.geometryInputs)===JSON.stringify(geometryInputs)):null;
  const cacheValid=asset=>{
   if(!asset)return false;
   const file=path.join(out,asset.name+'.obj');
   if(!fs.existsSync(file)||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==asset.sha256)return false;
   return true;
  };
  const variants=[];
  const geometry=[];
  for(const name of new Set(fits.map(fit=>fit.bodyAsset))){
   const previousBody=prior?.geometry.find(body=>body.name===name);
   const cached=prior?.variants.find(asset=>asset.name===name);
   if(previousBody&&cacheValid(cached)){
    geometry.push(previousBody);variants.push(cached);continue;
   }
   const result=await makeWheelhouseBody(path.join(out,body.name+'.obj'),path.join(out,name+'.obj'),spec,
    fitVolumes(spec,fits.filter(fit=>fit.bodyAsset===name)),liner.id);
   geometry.push({name,...result});
   variants.push({name,slots:result.slots,sha256:result.sha256});
  }
  let tire=null;
  for(const fit of fits){
   const name=spec.asset+'_tire_size'+fit.stage+'_0';
   const cached=prior?.variants.find(v=>v.name===name);
   if(cacheValid(cached))variants.push(cached);
   else{
    tire??=fs.readFileSync(path.join(out,base.name+'.obj'),'utf8');
    const obj=resizeTireObj(tire,spec.tireRadius*100,fit.diameterInches*1.27,bead);
    variants.push(makeAsset(out,name,obj,base.slots));
   }
  }
  manifest.assets.push(...variants);
  results.push({id:spec.id,bodySha256:body.sha256,stockTireSha256:base.sha256,liner:liner.id,geometryInputs,geometry,tireFits:fits,variants});
  console.log(JSON.stringify({tireFit:spec.id,sizes:fits.map(f=>[f.diameterInches,f.minimumSuspensionStage]),cutFaces:geometry.map(body=>body.cutFaces)}));
 }
 const report={version,method:'Full bump, steering and tread-width envelopes cut into opaque coachwork; stock and trimmed meshes remain distinct',vehicles:results};
 assert.equal(new Set(manifest.assets.map(a=>a.name)).size,manifest.assets.length,'export asset names are unique');
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 verifySourceExport(rootDefault);
 const manifest=JSON.parse(fs.readFileSync(path.join(rootDefault,'SourceAssets','import.json'),'utf8'));
 const terrain=fs.readFileSync(path.join(rootDefault,'Content','NativeData','terrain.bin'));
 beginSourceExport(rootDefault);
 await bakeTireFits(rootDefault,manifest);
 publishSourceExport(rootDefault,manifest,terrain);
}
