// Independently check exported wheelhouses against the widest tire compound
// at full bump and Ackermann lock. The mesh cutter isn't used by this check.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'SourceAssets');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const manifest=read('SourceAssets/import.json'),world=read('Content/NativeData/world.json');
const probes=read('Content/NativeData/vehicle-tire-probes.json');
const evidence=read('Saved/TireClearance/fit-report.json');
const assets=new Map(manifest.assets.map(asset=>[asset.name,asset]));
const expected=process.argv.find(v=>v.startsWith('--expect-vehicles='));
if(expected)assert.equal(manifest.vehicles.length,Number(expected.split('=')[1]),'requested roster exported');
let passed=0;
const check=(value,message)=>{assert.ok(value,message);passed++;};
const deg=Math.PI/180;

async function bodySamples(name,spec){
 const entry=assets.get(name),positions=[],cells=new Map(),spacing=.025;
 const hash=crypto.createHash('sha256'),stream=fs.createReadStream(path.join(source,name+'.obj'));
 stream.on('data',bytes=>hash.update(bytes));
 const maxY=spec.tireRadius+.635+.17;
 const insert=p=>{
  if(p[1]>maxY||p[1]<-.45)return;
  const key=Math.round(p[0]/spacing)+':'+Math.round(p[2]/spacing);
  const old=cells.get(key);
  if(!old||p[1]<old[1])cells.set(key,p);
 };
 for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
  if(line.startsWith('v ')){
   const [z,x,y]=line.slice(2).split(' ').map(Number);
   const point=[x*.01,y*.01+spec.cgHeight,z*.01];
   positions.push(point);insert(point);
  }else if(line.startsWith('f ')){
   const [a,b,c]=line.slice(2).split(' ').map(v=>positions[parseInt(v,10)-1]);
   if(Math.min(a[1],b[1],c[1])>maxY||Math.max(a[1],b[1],c[1])<-.45)continue;
   const span=(p,q)=>Math.hypot(p[0]-q[0],p[2]-q[2]);
   const divisions=Math.ceil(Math.max(span(a,b),span(b,c),span(c,a))/spacing);
   if(divisions<=1)continue;
   for(let i=0;i<=divisions;i++)for(let j=0;j<=divisions-i;j++){
    const u=i/divisions,v=j/divisions;
    insert(a.map((n,k)=>n+(b[k]-n)*u+(c[k]-n)*v));
   }
  }
 }
 const sha256=hash.digest('hex');
 check(sha256===entry?.sha256,name+' matches the exact exported mesh');
 check(cells.size>500,name+' has dense sampled body coverage');
 return {sha256,samples:[...cells.values()]};
}

function measureClearance(spec,fit,tire,body){
 const r=Math.max(tire.radiusM,tire.maxRadialM),axles=fit.axleOffsetsM;
 const front=fit.maximumSteeringDegrees*deg,rear=front*(spec.bodyStyle==='hummer'?-.25:spec.bodyStyle==='urus'?-.12:0);
 const span=axles.length===3?axles[0]-(axles[1]+axles[2])*.5:spec.wheelbase;
 const ratio=1.21*Math.sqrt(tire.radiusM/spec.tireRadius);
 const stage=fit.minimumSuspensionStage;
 let minimum=Infinity,witness=null,poseCount=0;
 for(const [axle,z] of axles.entries()){
  const steer=axle?rear:front,other=axle?front:rear;
  const baseTravel=spec.suspension[axle?'travelRear':'travelFront']??spec.suspension.travel;
  const stop=axle?fit.maximumBumpRearM:fit.maximumBumpFrontM;
  const compression=Math.min(stop,Math.max(.055,.58*baseTravel+.0315*stage));
  const y=spec.tireRadius+compression-.035*stage;
  const halfWidth=tire.maxAxialHalfWidthM*ratio*(axle?(spec.rearTireWidth??spec.tireWidth)/spec.tireWidth:1);
  const reach=r+halfWidth+.08;
  for(const side of [-1,1]){
   const nearby=body.samples.filter(p=>side*p[0]>0&&Math.abs(p[2]-z)<reach);
   for(let wheels=0;wheels<=3;wheels++){
    const track=spec.track+fit.trackExtraM+.035*wheels,x=side*track*.5;
    const k=Math.tan(steer),sideRate=(k-Math.tan(other))/(axle?-span:span);
    const max=Math.atan(Math.abs(k)/Math.max(.35,1-track*.5*Math.abs(sideRate)));
    const count=Math.max(1,Math.ceil(max/deg));
    for(let i=-count;i<=count;i++){
     const theta=max*i/count,c=Math.cos(theta),s=Math.sin(theta);
     poseCount++;
     for(const point of nearby){
      const [px,py,pz]=point,dx=px-x,dz=pz-z;
      if(Math.abs(dx)>reach)continue;
      const radial=Math.hypot(dx*s+dz*c,Math.max(0,py-y))-r;
      const axial=Math.abs(dx*c-dz*s)-halfWidth;
      const gap=Math.max(radial,axial);
      if(gap<minimum){minimum=gap;witness={axle,side,wheels,steerDegrees:theta/deg,point};}
     }
    }
   }
  }
 }
 return {minimumSeparatingClearanceM:minimum,poseCount,witness};
}

check(probes.version===3,'variable tire mesh probe schema');
const vehicles=[];
for(const [index,spec] of manifest.vehicles.entries()){
 const cooked=world.vehicles[index],tireStages=probes.vehicles[index],sizes=spec.tireFits;
 check(JSON.stringify(sizes)===JSON.stringify(cooked.tireFits),spec.id+' matching cooked/source metadata');
 check(tireStages.id===spec.id&&tireStages.stages.length===1+sizes.length,spec.id+' one mesh witness set per real size');
 check(tireStages.compounds.every(p=>p.sha256===tireStages.stages[0].sha256),spec.id+' compound levels preserve stock diameter');
 const stockInches=spec.tireRadius*2/.0254;
 if(stockInches>=50){check(sizes.length===0,spec.id+' retains its larger factory tires');continue;}
 check(sizes.length>=3,spec.id+' multiple tire choices');
 const bodies=new Map();
 for(const name of new Set(sizes.map(fit=>fit.bodyAsset))){
  const measured=await bodySamples(name,spec),geometry=evidence.vehicles.find(v=>v.id===spec.id)?.geometry.find(g=>g.name===name);
  check(geometry?.sha256===measured.sha256&&geometry.cutFaces>0&&geometry.outputFaces>geometry.sourceFaces*.70,name+' wheelhouse cuts preserve the body');
  bodies.set(name,measured);
 }
 const fits=[];
 let previousInches=stockInches,previousSuspension=1;
 for(const [i,fit] of sizes.entries()){
  const label=spec.id+' '+fit.diameterInches+' inches',tire=tireStages.stages[i+1];
  check(fit.stage===i+1&&fit.diameterInches>previousInches&&fit.diameterInches<=50,label+' ordered supported sizes');
  check(fit.liftM===0,label+' no extra chassis lift from fit metadata');
  check(fit.minimumSuspensionStage>=previousSuspension&&fit.minimumSuspensionStage<=3,label+' appropriate suspension requirement');
  check((fit.diameterInches-stockInches)*.0127+fit.minimumSuspensionStage*.035<=.33,label+' bounded total ride height increase');
  check(fit.trackExtraM<=.18&&fit.maximumSteeringDegrees>=27&&fit.maximumBumpFrontM>=.10&&fit.maximumBumpRearM>=.10,label+' bounded track and travel');
  check(tire.sha256===assets.get(spec.asset+'_tire_size'+fit.stage+'_0')?.sha256&&Math.abs(tire.maxRadialM-fit.diameterInches*.0127)<.005,label+' actual tread radius matches the selected size');
  if(fit.axleOffsetsM.length===3){
   check(fit.axleOffsetsM[0]===spec.axleOffsetsM[0]&&fit.axleOffsetsM[1]===spec.axleOffsetsM[1]&&spec.axleOffsetsM[2]-fit.axleOffsetsM[2]<.15,label+' bounded tandem axle shift');
   check(fit.axleOffsetsM[1]-fit.axleOffsetsM[2]>=fit.diameterInches*.0254+.08-1e-9,label+' 80 mm tandem tire gap');
  }
  const clearance=measureClearance(spec,fit,tire,bodies.get(fit.bodyAsset));
  check(clearance.minimumSeparatingClearanceM>=.005,label+' sampled 5 mm minimum clearance at full bump and steering '+JSON.stringify(clearance));
  previousInches=fit.diameterInches;previousSuspension=fit.minimumSuspensionStage;
  fits.push({...fit,...clearance});
 }
 vehicles.push({id:spec.id,bodies:[...bodies].map(([name,b])=>({name,sha256:b.sha256,samples:b.samples.length})),fits});
 console.log(JSON.stringify({id:spec.id,choices:sizes.length,minClearanceM:Math.min(...fits.map(f=>f.minimumSeparatingClearanceM))}));
}
const report={kind:'source-geometry',nativeAcceptance:false,passed,roster:manifest.vehicles.length,
 method:'25 mm surface sampling on exported body variants, actual tire mesh bounds, one-degree steering and full bump over all four wheel offset levels at the kit’s minimum suspension stage.',
 vehicles};
fs.writeFileSync(path.join(root,'docs','tire-fit-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed,roster:report.roster,fittedVehicles:vehicles.length,fitCount:vehicles.reduce((n,v)=>n+v.fits.length,0),
 minClearanceM:Math.min(...vehicles.flatMap(v=>v.fits.map(f=>f.minimumSeparatingClearanceM)))}));
