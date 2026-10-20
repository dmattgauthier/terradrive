import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLES } from '../dist/src/vehicles.js';
import { VehiclePhysics, engineTorqueAtRPM } from '../dist/src/physics.js';
import { SURFACES } from '../dist/src/terrain.js';
import { DEFAULT_BUILD, deriveVehicle, normalizeBuild, validateBuild, upgradeOptions, buildMetrics } from '../dist/src/upgrades.js';
import { workshopHTML } from '../dist/src/workshop-view.js';
import { getGuideHTML } from '../dist/src/guide.js';

const [jeep, bronco, civic, van] = VEHICLES;
const flat = surface => ({ sample: () => ({ ...SURFACES[surface], surface, height: 0, normal: { x: 0, y: 1, z: 0 }, waterDepth: 0 }) });
const run = (sim, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) sim.step(1 / 120, input);
  return sim.state;
};
const create = (base, build = {}, surface = 'asphalt') => {
  const sim = new VehiclePhysics(flat(surface), deriveVehicle(base, build));
  sim.reset({ x: 0, z: 0, heading: 0 }); run(sim, 1);
  return sim;
};
const fullBuild = base => ({ tires: base.bodyStyle === 'sedan' ? 'allTerrain' : 'mud', size: 'large', engine: 'tune', suspension: 'trail', drivetrain: base.driveModes.includes('4L') ? 'crawl' : 'conversion' });

test('build derivation is reversible, immutable and never compounds modifications', () => {
  for (const base of VEHICLES) {
    const original = JSON.stringify(base), modified = deriveVehicle(base, fullBuild(base));
    const again = deriveVehicle(base, JSON.parse(JSON.stringify(modified.upgrade.build))), restored = deriveVehicle(base, DEFAULT_BUILD);
    assert.equal(JSON.stringify(base), original);
    assert.deepEqual(modified, again);
    assert.ok(Object.isFrozen(modified) && Object.isFrozen(modified.engine.curve) && Object.isFrozen(modified.suspension));
    for (const field of ['powerHP', 'torqueNm', 'mass', 'tireRadius', 'tireWidth', 'clearance', 'height', 'finalDrive', 'lowRatio']) assert.equal(restored[field], base[field]);
    assert.ok(Math.abs(restored.cgHeight - base.cgHeight) < 1e-12);
    assert.deepEqual(restored.driveModes, base.driveModes); assert.deepEqual(restored.engine.curve, base.engine.curve);
    assert.equal(restored.upgrade.count, 0); assert.ok(modified.upgrade.count > 0);
  }
});

test('stored choices are sanitized and incompatible sizes cannot be installed', () => {
  assert.deepEqual(normalizeBuild(jeep, { tires: '<script>', suspension: 'infinite', size: 'unbounded', engine: null, drivetrain: 'FWD' }), DEFAULT_BUILD);
  assert.equal(validateBuild(jeep, { size: 'large' }).ok, false);
  assert.equal(validateBuild(jeep, { size: 'large', suspension: 'trail' }).ok, true);
  assert.equal(validateBuild(civic, { tires: 'allTerrain', suspension: 'trail' }).ok, false);
  assert.equal(validateBuild(civic, { tires: 'allTerrain', size: 'large', suspension: 'trail' }).ok, true);
  assert.equal(normalizeBuild(civic, { tires: 'mud' }).tires, 'stock');
  assert.equal(validateBuild(van, { drivetrain: 'conversion', suspension: 'road' }).ok, false);
  assert.equal(validateBuild(van, { drivetrain: 'conversion', size: 'large' }).ok, true);
});

test('engine upgrades change the actual interpolated curve consistently with displayed peak ratings', () => {
  for (const base of VEHICLES.filter(spec => spec.powertrain !== 'electric')) for (const engine of ['tune', 'power']) {
    const spec = deriveVehicle(base, { engine });
    let power = 0, torque = 0;
    for (let rpm = spec.engine.idleRPM; rpm <= spec.engine.redlineRPM; rpm += 2) {
      const nm = engineTorqueAtRPM(spec, rpm);
      torque = Math.max(torque, nm); power = Math.max(power, nm * rpm * Math.PI / 30 / 745.6998715822702);
    }
    assert.ok(Math.abs(power / spec.powerHP - 1) < .001, `${base.id} ${engine}: ${power} vs ${spec.powerHP} hp`);
    assert.ok(Math.abs(torque / spec.torqueNm - 1) < .001);
    assert.ok(spec.powerHP > base.powerHP && spec.torqueNm > base.torqueNm);
    assert.ok(spec.engine.curve.every(([rpm, nm], i, arr) => Number.isFinite(nm) && nm > 0 && (!i || rpm > arr[i - 1][0])));
  }
  const ford = deriveVehicle(bronco, { engine: 'tune' });
  assert.equal(ford.powerHP, 355); assert.equal(ford.engine.peakPowerRPM, 5500);
  assert.equal(ford.torqueLbFt, 433); assert.equal(ford.engine.peakTorqueRPM, 3500);
});

test('additional engine output changes actual acceleration in power-limited driving', () => {
  for (const base of [bronco, civic]) {
    const stock = create(base), upgraded = create(base, { engine: 'power' });
    const a = run(stock, 10, { throttle: 1 }), b = run(upgraded, 10, { throttle: 1 });
    assert.ok(b.speed > a.speed * 1.025, `${base.id}: stock ${a.speed.toFixed(2)}, upgraded ${b.speed.toFixed(2)} m/s`);
    assert.ok(b.odometer > a.odometer, `${base.id}: engine change must reach the moving chassis`);
  }
});

test('tire packages trade pavement response for mud traction through real contact parameters', () => {
  const roadDry = create(jeep, { tires: 'road' }), mudDry = create(jeep, { tires: 'mud' });
  const roadSoil = create(jeep, { tires: 'road' }, 'mud'), mudSoil = create(jeep, { tires: 'mud' }, 'mud');
  const average = (sim, key) => sim.state.wheels.reduce((sum, wheel) => sum + wheel[key], 0) / 4;
  assert.ok(average(roadDry, 'frictionCoefficient') > average(mudDry, 'frictionCoefficient') * 1.12);
  assert.ok(average(mudSoil, 'frictionCoefficient') > average(roadSoil, 'frictionCoefficient') * 1.30);
  assert.ok(average(roadDry, 'corneringStiffness') > average(mudDry, 'corneringStiffness'));
  assert.ok(average(mudDry, 'relaxationLength') > average(roadDry, 'relaxationLength'));
  for (const sim of [roadDry, mudDry, roadSoil, mudSoil]) for (const wheel of sim.state.wheels) {
    assert.ok(Math.hypot(wheel.longitudinalForce, wheel.lateralForce) <= wheel.frictionCoefficient * wheel.load + 1e-6);
  }
});

test('larger tires change physical radius, rotating inertia and effective ground gearing', () => {
  const standard = create(jeep, { tires: 'allTerrain', suspension: 'trail' });
  const large = create(jeep, { tires: 'allTerrain', suspension: 'trail', size: 'large' });
  for (let i = 0; i < 4; i++) {
    assert.ok(large.state.wheels[i].radius > standard.state.wheels[i].radius);
    assert.ok(large._wheels[i].inertia > standard._wheels[i].inertia);
    assert.ok(large.state.wheels[i].contact && Math.abs(large.state.wheels[i].position.y - large.state.wheels[i].radius) < .03);
  }
  assert.ok(buildMetrics(large.spec).wheelForcePerNm < buildMetrics(standard.spec).wheelForcePerNm);
  const crawl = deriveVehicle(jeep, { tires: 'allTerrain', suspension: 'trail', size: 'large', drivetrain: 'crawl' });
  assert.ok(buildMetrics(crawl).wheelForcePerNm > buildMetrics(large.spec).wheelForcePerNm * 1.15);
});

test('spring kit free lengths produce lowered or lifted loaded stances without moving body mounts', () => {
  for (const base of VEHICLES) {
    const stock = create(base), road = create(base, { suspension: 'road' }), trail = create(base, { suspension: 'trail' });
    run(stock, 2); run(road, 2); run(trail, 2);
    const bodyDatum = sim => sim.state.position.y - sim.spec.cgHeight + (sim.spec.upgrade?.bodyRise || 0);
    const before = bodyDatum(stock), low = bodyDatum(road), high = bodyDatum(trail);
    assert.ok(low < before - .006, `${base.id}: road body ${low}, stock ${before}`);
    assert.ok(high > before + .02, `${base.id}: trail body ${high}, stock ${before}`);
    assert.ok(Math.abs((high - before) - trail.spec.suspension.lift) < .025);
    for (const sim of [stock, road, trail]) {
      assert.equal(sim.state.groundedWheels, 4);
      const total = sim.state.wheels.reduce((sum, wheel) => sum + wheel.load, 0);
      assert.ok(Math.abs(total / (sim.spec.mass * 9.81) - 1) < .025);
      assert.ok(sim.state.wheels.every(wheel => Number.isFinite(wheel.load) && wheel.load > 0));
    }
  }
});

test('AWD and 4WD conversions drive the added axle and expose only supported controls', () => {
  const front = create(civic, { drivetrain: 'conversion' });
  front.setControl('driveMode', 'FWD'); run(front, .15, { throttle: .4 });
  assert.ok(front.state.wheels.slice(0, 2).every(wheel => wheel.driveTorque > 0));
  assert.ok(front.state.wheels.slice(2).every(wheel => wheel.driveTorque === 0));
  assert.equal(front.setControl('driveMode', '4A').ok, true);
  run(front, .15, { throttle: .6 });
  assert.ok(front.state.wheels.every(wheel => wheel.driveTorque > 0));
  assert.equal(front.setControl('driveMode', '4L').ok, false);
  const rear = create(van, { drivetrain: 'conversion' });
  assert.equal(rear.setControl('selector', 'N').ok, true);
  assert.equal(rear.setControl('driveMode', '4L').ok, true);
  assert.equal(rear.setControl('rearLocked', true).ok, true);
  assert.equal(rear.setControl('frontLocked', true).ok, false);
  rear.setControl('selector', 'D'); run(rear, .15, { throttle: .4 });
  assert.ok(rear.state.wheels.every(wheel => wheel.driveTorque > 0));
  assert.ok(Math.abs(rear.state.wheels[2].omega - rear.state.wheels[3].omega) < .01);
  assert.ok(rear.spec.mass > van.mass + 200 && rear.spec.cgHeight > van.cgHeight);
});

test('live reconfiguration rejects motion and retains damage, trip distance, controls and external forces', () => {
  const sim = create(jeep); run(sim, 3, { throttle: .25 });
  const next = deriveVehicle(jeep, { engine: 'tune' }), oldBody = sim.body;
  assert.equal(sim.reconfigureVehicle(next).ok, false); assert.equal(sim.body, oldBody);
  sim.body.velocity.setZero(); sim.body.angularVelocity.setZero();
  for (const wheel of sim._wheels) wheel.omega = 0;
  sim.setPressure(24, 25); sim.setControl('engineOn', false); sim.setControl('tractionControl', false);
  sim.damage.body = .25; sim.damage.engine = .10;
  const distance = sim.state.odometer, damage = sim.getDamage(), oldX = sim.state.position.x, oldZ = sim.state.position.z;
  let calls = 0; sim.setExternalForceProvider(() => calls++);
  assert.equal(sim.reconfigureVehicle(next).ok, true);
  assert.ok(Math.abs(sim.state.odometer - distance) < 1e-10);
  assert.ok(Math.abs(sim.state.position.x - oldX) < 1e-10 && Math.abs(sim.state.position.z - oldZ) < 1e-10);
  assert.deepEqual(sim.getDamage(), damage);
  assert.equal(sim.state.engineOn, false); assert.equal(sim.state.tractionControl, false);
  assert.equal(sim.state.frontPSI, 24); assert.equal(sim.state.rearPSI, 25);
  run(sim, .1); assert.ok(calls > 0);
  sim.body.velocity.setZero(); sim.body.angularVelocity.setZero();
  assert.equal(sim.reconfigureVehicle(deriveVehicle(jeep, { tires: 'mud' })).ok, true);
  assert.equal(sim.state.frontPSI, jeep.stockPSIFront); assert.equal(sim.state.rearPSI, jeep.stockPSIRear);
  assert.equal(sim.reconfigureVehicle(deriveVehicle(civic)).ok, false);
});

test('workshop and field guide reflect the configured vehicle, compatibility and installed state', () => {
  for (const base of VEHICLES) {
    const build = fullBuild(base), spec = deriveVehicle(base, build), html = workshopHTML(base, build);
    assert.ok(!/NaN|undefined|Infinity/.test(html));
    assert.ok(html.includes(`data-garage-model="${base.id}"`));
    assert.ok(!html.includes('id="workshop-install" disabled'));
    assert.ok(workshopHTML(base, build, { canInstall: false }).includes('id="workshop-install" disabled'));
    assert.ok(workshopHTML(base, build, { installed: build }).includes('id="workshop-install" disabled'));
    for (const group of upgradeOptions(base)) assert.ok(html.includes(`data-upgrade="${group.id}"`));
    // GMC's actual product name contains Infinity; preserve the numeric-error
    // guard while allowing the exact, sourced roof-panel name.
    for (const topic of ['controls', 'technique', 'physics', 'sources', 'art']) assert.ok(!/NaN|undefined|Infinity/.test(getGuideHTML(topic, spec).replaceAll('Infinity Roof','Roof')));
    assert.ok(getGuideHTML('sources', spec).includes('Installed build value'));
  }
  assert.ok(workshopHTML(jeep, { size: 'large' }).includes('id="workshop-install" disabled'));
  assert.ok(getGuideHTML('controls', deriveVehicle(civic, { drivetrain: 'conversion' })).includes('Your converted Civic'));
  assert.ok(getGuideHTML('controls', deriveVehicle(van, { drivetrain: 'conversion' })).includes('Your converted Sprinter'));
});
