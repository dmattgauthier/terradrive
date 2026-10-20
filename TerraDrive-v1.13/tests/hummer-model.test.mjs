import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { VehicleView } from '../dist/src/vehicle-view.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { createShowroomPose } from '../dist/src/garage.js';
import { deriveVehicle, normalizeBuild, upgradeOptions } from '../dist/src/upgrades.js';
import { workshopHTML } from '../dist/src/workshop-view.js';

const hummer = VEHICLES.find(spec => spec.id === 'hummer-ev-suv-3x');
const flat = { sample: () => ({height:0,normal:{x:0,y:1,z:0},surface:'asphalt',mu:.94,rollingResistance:.014,softness:0,maxSink:0,waterDepth:0}) };
const step = (sim, seconds, input={handbrake:true}) => {for(let i=0;i<seconds*120;i++)sim.step(1/120,input);};

test('Hummer records factory wheel torque separately from estimated shaft torque and unequal reductions', () => {
  assert.equal(hummer.year,2024);assert.equal(hummer.powerHP,830);
  assert.equal(hummer.wheelTorqueLbFt,11500);
  assert.ok(hummer.torqueNm < hummer.wheelTorqueNm/8,'Advertised wheel torque cannot be used as shaft torque');
  assert.ok(Math.abs(hummer.electric.motorPeakTorqueNm*(hummer.electric.frontReduction+2*hummer.electric.rearReduction)-hummer.wheelTorqueNm)<1e-6);
  assert.deepEqual(hummer.driveModes,['e4WD']);assert.deepEqual(hummer.gears,[1]);assert.equal(hummer.lowRatio,1);
  assert.equal(hummer.tireSize,'LT305/70R18');assert.equal(hummer.tireType,'mud-terrain');
  assert.ok(hummer.electric.torqueStatus.includes('estimate'));assert.ok(hummer.electric.batteryStatus.includes('estimate'));
  assert.ok(hummer.features.crabWalk&&hummer.features.airSuspension&&hummer.features.onePedal);
  assert.equal(hummer.features.swayDisconnect,false);
});

test('Hummer builds retain the electric system, reject invented power/conversion packages and account for the spare', () => {
  const original=JSON.stringify(hummer);
  for(const engine of ['tune','power'])assert.equal(normalizeBuild(hummer,{engine}).engine,'stock');
  for(const drivetrain of ['conversion','crawl'])assert.equal(normalizeBuild(hummer,{drivetrain}).drivetrain,'stock');
  const groups=upgradeOptions(hummer);
  assert.deepEqual(groups.find(group=>group.id==='engine').options.map(option=>option.id),['stock']);
  assert.deepEqual(groups.find(group=>group.id==='drivetrain').options.map(option=>option.id),['stock']);
  const stock=deriveVehicle(hummer),mud=deriveVehicle(hummer,{tires:'mud'}),large=deriveVehicle(hummer,{size:'large',suspension:'trail'});
  assert.equal(mud.mass-stock.mass,5*(mud.wheelMassKG-stock.wheelMassKG),'All five matching tires contribute installed mass');
  assert.ok(large.tireRadius>stock.tireRadius&&large.suspension.restLength>stock.suspension.restLength);
  assert.equal(large.electric.motorPeakTorqueNm,hummer.electric.motorPeakTorqueNm);
  assert.equal(large.wheelTorqueLbFt,hummer.wheelTorqueLbFt);assert.equal(large.powerHP,hummer.powerHP);
  assert.equal(JSON.stringify(hummer),original);
});

test('Hummer workshop shows wheel torque, per-motor estimates and axle reductions with EV-specific labels', () => {
  const html=workshopHTML(hummer,{engine:'power',drivetrain:'conversion',tires:'allTerrain'});
  assert.ok(!/NaN|undefined|Infinity/.test(html));
  for(const label of ['Advertised wheel torque','Peak per motor · estimated','Front reduction','Rear reduction','Electric drive','Motor RPM','Watts to Freedom','11,500 lb-ft'])assert.ok(html.includes(label),label);
  assert.ok(!html.includes('Engine RPM')&&!html.includes('Lowest overall ratio')&&!html.includes('data-upgrade="conversion"'));
  assert.ok(html.includes('Factory electric power and drive units are retained'));
});

test('Hummer geometry has its measured SUV envelope, open glazing, recessed bumper and EV underbody', () => {
  const scene=new THREE.Scene(),view=new VehicleView(scene,hummer),pose=createShowroomPose(hummer);view.update(pose);scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(view.body),size=bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x-hummer.widthWithMirrors)<.002,'Factory standard-mirror span');
  assert.ok(Math.abs(size.z-hummer.length)<.04,'Body, bumper and spare remain within 4cm of the published total length');
  assert.ok(Math.abs(bounds.max.y-hummer.height)<.012,'Normal-height roof markers fit the published vehicle height');
  let triangles=0;
  scene.traverse(object=>{
    if(!object.geometry)return;
    const geometry=object.geometry;triangles+=(geometry.index?.count||geometry.attributes.position.count)/3;
    for(const attribute of Object.values(geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value));
  });
  assert.ok(triangles<350000,`Retain a bounded vehicle geometry budget (${triangles} triangles)`);
  const roofRay=new THREE.Raycaster(new THREE.Vector3(.4,4,-1),new THREE.Vector3(0,-1,0));
  const roofHit=roofRay.intersectObject(view.body,true)[0];assert.equal(roofHit.object.material,view.materials.hardtop);
  const glassRay=new THREE.Raycaster(new THREE.Vector3(3,1.65,.14),new THREE.Vector3(-1,0,0));
  assert.ok(glassRay.intersectObject(view.body,true)[0].object.material.userData.vehicleGlass,'Actual separate glazing closes the cabin');
  const frontRay=new THREE.Raycaster(new THREE.Vector3(.30,.95,4),new THREE.Vector3(0,0,-1));
  assert.notEqual(frontRay.intersectObject(view.body,true)[0].object.material,view.materials.paint,'A painted cap must not hide the lower bumper again');
  assert.equal(view.driveLinks.length,4);assert.ok(view.driveLinks.every(link=>Number.isInteger(link.target.wheel)));
  assert.equal(view.axles.length,0);assert.equal(view.links.filter(link=>link.type===1).length,4);
  assert.equal(view.materials.exhaust,undefined);
  const spares=[];view.body.traverse(object=>{if(object.userData.tire)spares.push(object.userData.tire);});
  assert.equal(spares.length,1);assert.equal(spares[0].radius,hummer.tireRadius);assert.equal(spares[0].rimRadius,.2286);
  view.dispose();assert.equal(scene.children.length,0);
});

test('physical air ride raises the Hummer body once and all four steering/hub connections follow the state', () => {
  const sim=new VehiclePhysics(flat,hummer);sim.reset({x:0,z:0,heading:0});sim.setControl('selector','P');step(sim,3);
  const scene=new THREE.Scene(),view=new VehicleView(scene,hummer);view.update(sim.state);scene.updateMatrixWorld(true);
  const roofPoint=new THREE.Vector3(.4,1.94,-1),initial=view.body.localToWorld(roofPoint.clone()).y,initialBody=sim.state.position.y;
  assert.ok(sim.setControl('terrainProgram','Terrain').ok);assert.ok(sim.setControl('rideHeight','extract').ok);step(sim,10);
  view.update(sim.state);scene.updateMatrixWorld(true);
  const raised=view.body.localToWorld(roofPoint.clone()).y,physicalRise=sim.state.position.y-initialBody;
  assert.ok(Math.abs(sim.state.airSuspensionLift-.149)<1e-8);
  assert.ok(physicalRise>.125&&physicalRise<.175);
  assert.ok(Math.abs((raised-initial)-physicalRise)<.003,'The view must not apply air lift a second time');
  for(const link of view.driveLinks){const position=sim.state.wheels[link.target.wheel].position;assert.ok(link.b.position.distanceTo(new THREE.Vector3(position.x,position.y,position.z))<1e-8);}
  const pose=structuredClone(sim.state);for(let i=0;i<4;i++)pose.wheels[i].steer=i<2?.21:-.14;
  view.update(pose);
  for(let i=0;i<4;i++){
    const expected=view.root.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.wheels[i].steer));
    assert.ok(view.wheels[i].root.quaternion.angleTo(expected)<1e-7,'Rear hubs must consume rear-steer angles independently');
  }
  view.dispose();
});

test('Hummer body damage remains localized through repaint and repair restores the exact pristine skin', () => {
  const scene=new THREE.Scene(),view=new VehicleView(scene,hummer),pose=createShowroomPose(hummer);
  const point={x:1.02,y:.96+view.body.position.y,z:.28+view.body.position.z};
  pose.damage={revision:1,suspension:[0,0,0,0],tires:[0,0,0,0],dents:[{id:'side',point,normal:{x:1,y:0,z:0},radius:.45,depth:.10,severity:.70}]};
  view.update(pose);assert.ok(view.damageView.metrics.changedVertices>100);
  const originalRoof=view.materials.hardtop.color.getHexString(),damaged=view.damageView.entries.filter(entry=>entry.mesh.material===view.materials.paint).map(entry=>entry.mesh.geometry.attributes.position.array.slice());
  view.update(pose,{paint:'#245c83'});assert.equal(view.materials.hardtop.color.getHexString(),originalRoof);
  view.damageView.entries.filter(entry=>entry.mesh.material===view.materials.paint).forEach((entry,index)=>assert.deepEqual(entry.mesh.geometry.attributes.position.array,damaged[index]));
  pose.damage={revision:2,suspension:[0,0,0,0],tires:[0,0,0,0],dents:[]};view.update(pose);
  for(const entry of view.damageView.entries)assert.deepEqual(entry.mesh.geometry.attributes.position.array,entry.position);
  assert.equal(view.materials.paint.color.getHexString(),'245c83');view.dispose();
});
