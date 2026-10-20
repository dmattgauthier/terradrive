import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// This harness can load a complete, immutable older dist tree. No current
// physics helper is imported into the baseline simulation.
export const FIXED_DT = 1 / 120;
export const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const G = 9.81, DEG = 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
};
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const HARNESS_SHA256 = sha256(fileURLToPath(import.meta.url));
const RUNTIME_INPUTS = ['package.json', 'dist/src/physics.js', 'dist/src/terrain.js',
  'dist/src/vehicles.js', 'dist/src/upgrades.js', 'dist/src/damage.js', 'dist/vendor/cannon-es.js'];

export function runtimeHashes(root) {
  const inputs = new Set(RUNTIME_INPUTS), queue = [...inputs];
  // Include recursively imported local helpers. A new contact-profile module
  // must never escape source provenance merely because v1.6 did not have it.
  while (queue.length) {
    const relative = queue.pop(), absolute = path.join(root, relative);
    if (!relative.endsWith('.js')) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]+?\s+from\s*)?['"](\.[^'"]+)['"]/g)) {
      const dependency = path.relative(root, fileURLToPath(new URL(match[1], pathToFileURL(absolute))));
      if (dependency.startsWith('..')) throw new Error('Runtime dependency escaped the source tree: ' + dependency);
      if (!inputs.has(dependency)) { inputs.add(dependency); queue.push(dependency); }
    }
  }
  return Object.fromEntries([...inputs].sort().map(file => [file, sha256(path.join(root, file))]));
}

export async function loadSimulation(root = DEFAULT_ROOT) {
  root = path.resolve(root);
  const sourceHashes = runtimeHashes(root);
  const [physics, terrain, vehicles, upgrades] = await Promise.all([
    'physics', 'terrain', 'vehicles', 'upgrades',
  ].map(name => import(pathToFileURL(path.join(root, 'dist/src', name + '.js')).href)));
  return { ...physics, ...terrain, ...vehicles, ...upgrades, root, sourceHashes };
}

/** Preserve the actual map's complete material sample, including future
 * profile fields, but flatten geometry and remove standing water explicitly.
 * Separate map cases below retain both geometry and water/deformation. */
export function contactFixtures(api) {
  const terrain = new api.Terrain();
  const sites = [
    ['asphalt', -108, -186], ['hardpack', terrain.trailX(-82), -82],
    ['gravel', terrain.trailX(-82) + 4.25, -82],
    ['grass', -51, 282], ['rock', 121, 121], ['mud', 48, -115],
    ['wetland', -24, 148], ['sand', 204, -83],
  ];
  const fixtures = [];
  for (const moisture of [0, 1]) {
    terrain.setMoisture(moisture);
    for (const [detail, x, z] of sites) {
      const original = terrain.sample(x, z);
      fixtures.push({ id: detail + (moisture ? '-wet' : '-dry'), detail, moisture,
        sourceCoordinate: { x, z }, sourceWaterDepth: original.waterDepth || 0,
        sample: { ...original, height: 0, normal: { x: 0, y: 1, z: 0 },
          sink: 0, berm: 0, compaction: 0, tread: 0, waterDepth: 0 } });
    }
  }
  return fixtures;
}

export function compactedFixture(api, fixture, spec = api.VEHICLES[0]) {
  const terrain = new api.Terrain(), { x, z } = fixture.sourceCoordinate;
  terrain.setMoisture(fixture.moisture);
  for (let pass = 0; pass < 3; pass++) for (let step = 0; step <= 160; step++) {
    terrain.deform(x, z - 2 + step / 40, { load: spec.mass * G / 4,
      pressure: 37, slip: .08, speed: 3, width: spec.tireWidth,
      contactWidth: spec.tireWidth, contactLength: .26, dt: FIXED_DT,
      heading: 0, wheelId: 'qa-compaction' });
  }
  const sample = terrain.sample(x, z);
  return { ...fixture, id: fixture.id + '-compacted', preparation: 'Three rolling tire passes at 37 psi; same sampled coordinate',
    sample: { ...sample, height: 0, normal: { x: 0, y: 1, z: 0 }, waterDepth: 0 },
    soilVolumes: { ...terrain.soilVolumes } };
}

export function flatContact(fixture, { grade = 0, waterDepth = 0, sampleAt } = {}) {
  return { sample(x, z) {
    const sample = sampleAt ? sampleAt(x, z) : fixture.sample;
    return { ...sample, height: z * grade, normal: { x: 0, y: 1 / Math.hypot(1, grade),
      z: -grade / Math.hypot(1, grade) }, waterDepth };
  } };
}

function applySetup(sim, { pressure, tractionControl, driveMode, lockers, selector } = {}) {
  if (pressure !== undefined) sim.setPressure(pressure, pressure);
  if (tractionControl !== undefined) sim.setControl('tractionControl', tractionControl);
  if (driveMode) {
    sim.setControl('selector', 'N');
    const result = sim.setControl('driveMode', driveMode);
    if (!result.ok) throw new Error('Invalid fixture drive mode: ' + driveMode);
  }
  if (lockers) {
    sim.setControl('rearLocked', true); sim.setControl('frontLocked', true);
  }
  if (selector) sim.setControl('selector', selector);
}

export function settled(api, spec, terrain, options = {}) {
  const sim = new api.VehiclePhysics(terrain, spec);
  sim.reset(options.spawn || { x: 0, z: 0, heading: 0 });
  applySetup(sim, options);
  for (let i = 0; i < 120; i++) sim.step(FIXED_DT);
  return sim;
}

export function rollingOn(api, spec, fixture, speed = 15, options = {}) {
  const sim = settled(api, spec, flatContact(fixture, options), options);
  sim.setControl('selector', options.selector || 'N');
  sim.body.velocity.set(0, 0, speed);
  for (const wheel of sim._wheels) wheel.omega = speed / wheel.radius;
  return sim;
}

export function bodySlipDegrees(sim) {
  const velocity = sim.body.vectorToLocalFrame(sim.body.velocity);
  return Math.atan2(Math.abs(velocity.x), Math.max(.1, Math.abs(velocity.z))) * DEG;
}

function observer(sim, keepTrace = false) {
  const start = { ...sim.body.position }, startOdometer = sim.state.odometer;
  const data = { speed: [], bodySlip: [], tireSlip: [], drivenSlip: [], engineTorque: [],
    requestedEngineTorque: [], torqueScale: [], yaw: [], yawGain: [], load: [], surfaceDetails: new Set(),
    peakUtilization: 0, minUp: 1, minContacts: 4, meanContactArea: [], meanDeflection: [],
    maxSink: 0, meanSink: [], lateralContactWorkJ: 0, wheelSlipWorkJ: 0, soilContactWorkJ: 0,
    tcFrames: 0, absFrames: 0, frames: 0, maxSpeed: 0, finite: true, trace: [] };
  return {
    sample(state) {
      data.frames++;
      data.finite &&= [state.speed, state.position.x, state.position.y, state.position.z,
        ...Object.values(state.quaternion), ...Object.values(state.angularVelocity)].every(Number.isFinite);
      data.speed.push(Math.abs(state.speed)); data.maxSpeed = Math.max(data.maxSpeed, Math.abs(state.speed));
      data.bodySlip.push(bodySlipDegrees(sim)); data.yaw.push(Math.abs(state.angularVelocity.y));
      const forwardSpeed = Math.abs(sim.body.vectorToLocalFrame(sim.body.velocity).z);
      const idealYaw = forwardSpeed * Math.tan(Math.abs(state.steeringAssist.angle)) / sim.spec.wheelbase;
      if (forwardSpeed > 2 && idealYaw > .02) data.yawGain.push(Math.abs(state.angularVelocity.y) / idealYaw);
      data.engineTorque.push(state.engineTorque);
      data.requestedEngineTorque.push(state.requestedEngineTorque ?? state.engineTorque);
      data.torqueScale.push(state.tractionIntervention?.torqueScale ?? 1);
      const up = 1 - 2 * (state.quaternion.x ** 2 + state.quaternion.z ** 2);
      data.minUp = Math.min(data.minUp, up); data.minContacts = Math.min(data.minContacts, state.groundedWheels);
      data.tcFrames += Number(Boolean(state.wheels.some(w => w.tractionActive) || state.tractionIntervention?.active));
      data.absFrames += Number(state.wheels.some(w => w.absActive));
      data.meanContactArea.push(mean(state.wheels.map(w => w.contactArea)));
      data.meanDeflection.push(mean(state.wheels.map(w => w.deflection)));
      data.meanSink.push(mean(state.wheels.map(w => w.sink)));
      if (keepTrace && data.frames % 12 === 0) data.trace.push({ t: data.frames * FIXED_DT,
        speedMps: Math.abs(state.speed), bodySlipDeg: bodySlipDegrees(sim), yawRadS: state.angularVelocity.y,
        steeringRad: state.steeringAssist.angle, engineTorqueNm: state.engineTorque,
        requestedEngineTorqueNm: state.requestedEngineTorque ?? state.engineTorque,
        torqueScale: state.tractionIntervention?.torqueScale ?? 1,
        wheelSlip: state.wheels.map(wheel => wheel.slip),
        tc: state.wheels.map(wheel => wheel.tractionActive),
        longitudinalForceN: state.wheels.map(wheel => wheel.longitudinalForce),
        lateralForceN: state.wheels.map(wheel => wheel.tireLateralForce ?? wheel.lateralForce) });
      for (const wheel of state.wheels) {
        data.surfaceDetails.add(wheel.surfaceDetail || sim._wheels[wheel.index].data?.surfaceDetail || wheel.surface);
        data.maxSink = Math.max(data.maxSink, wheel.sink);
        if (wheel.load <= 1) continue;
        const tireLateralForce = wheel.tireLateralForce ?? wheel.lateralForce;
        const capacity = wheel.frictionCoefficient * wheel.load;
        data.peakUtilization = Math.max(data.peakUtilization,
          Math.hypot(wheel.longitudinalForce, tireLateralForce) / Math.max(1e-9, capacity));
        data.tireSlip.push(Math.abs(wheel.lateralSlip) * DEG);
        const contact = sim._wheels[wheel.index];
        if (Math.abs(wheel.driveTorque) > 1 && Math.max(Math.abs(contact.speedLong), Math.abs(wheel.omega * wheel.radius)) > 2) data.drivenSlip.push(Math.abs(wheel.slip));
        data.lateralContactWorkJ += tireLateralForce * contact.speedLat * FIXED_DT;
        data.wheelSlipWorkJ += wheel.longitudinalForce * (wheel.omega * wheel.radius - contact.speedLong) * FIXED_DT;
        data.soilContactWorkJ += ((wheel.soilLongitudinalForce || 0) * contact.speedLong
          + (wheel.soilLateralForce || 0) * contact.speedLat) * FIXED_DT;
        data.load.push(wheel.load);
      }
    },
    result() {
      const state = sim.state;
      return { seconds: data.frames * FIXED_DT, finalSpeedMps: Math.abs(state.speed),
        maxSpeedMps: data.maxSpeed, meanSpeedMps: mean(data.speed),
        distanceM: state.odometer - startOdometer, forwardM: state.position.z - start.z,
        lateralM: state.position.x - start.x, peakBodySlipDeg: Math.max(0, ...data.bodySlip),
        p95BodySlipDeg: percentile(data.bodySlip, .95), finalBodySlipDeg: bodySlipDegrees(sim),
        p95TireSlipDeg: percentile(data.tireSlip, .95), p95DrivenSlip: percentile(data.drivenSlip, .95),
        meanDrivenSlip: mean(data.drivenSlip), meanEngineTorqueNm: mean(data.engineTorque),
        meanRequestedEngineTorqueNm: mean(data.requestedEngineTorque), meanTorqueScale: mean(data.torqueScale),
        minTorqueScale: Math.min(1, ...data.torqueScale), peakYawRadS: Math.max(0, ...data.yaw),
        meanYawRadS: mean(data.yaw), meanYawGain: mean(data.yawGain), peakFrictionUtilization: data.peakUtilization,
        minUp: data.minUp, minContacts: data.minContacts, meanContactAreaM2: mean(data.meanContactArea),
        meanDeflectionM: mean(data.meanDeflection), meanSinkM: mean(data.meanSink), maxSinkM: data.maxSink,
        lateralContactWorkJ: data.lateralContactWorkJ, wheelSlipWorkJ: data.wheelSlipWorkJ,
        soilContactWorkJ: data.soilContactWorkJ, tcFrameFraction: data.tcFrames / Math.max(1, data.frames),
        absFrameFraction: data.absFrames / Math.max(1, data.frames), surfaceDetails: [...data.surfaceDetails].sort(),
        condition: state.damage.condition, finite: data.finite, ...(keepTrace ? { trace: data.trace } : {}) };
    },
  };
}

export function measureContact(api, spec, fixture, kind, options = {}) {
  const speed = options.speed ?? 15;
  const sim = rollingOn(api, spec, fixture, speed, options);
  const record = observer(sim);
  let stoppedAt = null, recoveredAt = null;
  if (kind === 'slide') sim.body.velocity.x = options.lateralSpeed ?? 3;
  const duration = options.duration ?? ({ brake: 15, coast: 3, pulse: 4, slide: 3 }[kind]);
  if (!duration) throw new Error('Unknown contact diagnostic ' + kind);
  for (let i = 0; i < Math.round(duration / FIXED_DT); i++) {
    const t = i * FIXED_DT;
    const input = kind === 'brake' ? { brake: 1 }
      : kind === 'pulse' ? { steer: t < .5 ? (options.sign ?? 1) : 0, steerSource: 'digital' } : {};
    const state = sim.step(FIXED_DT, input); record.sample(state);
    if (kind === 'slide' && recoveredAt === null && Math.abs(sim.body.vectorToLocalFrame(sim.body.velocity).x) < .1) recoveredAt = (i + 1) * FIXED_DT;
    if (kind === 'brake' && state.speedKmh / 3.6 < .1) { stoppedAt = (i + 1) * FIXED_DT; break; }
  }
  const result = record.result();
  return { id: [spec.id, fixture.id, kind, options.label].filter(Boolean).join('/'),
    vehicle: spec.id, fixture: fixture.id, kind, initialSpeedMps: speed, options,
    ...result, stoppedAtS: stoppedAt, recoveredAtS: recoveredAt,
    effectiveDecelerationG: kind === 'brake' && stoppedAt !== null ? speed * speed / (2 * Math.max(.01, result.distanceM) * G) : null };
}

/** Constant driver demand, not a speed clamp. Initial speed and identical
 * input are retained in each row so a controller's slower path remains visible. */
export function poweredTurn(api, spec, fixture, options = {}) {
  const speed = options.speed ?? 6, throttle = options.throttle ?? .7;
  const steer = (options.steer ?? .12) * (options.sign ?? 1);
  const sim = rollingOn(api, spec, fixture, speed, { ...options, selector: 'D' });
  const powered = observer(sim, true);
  for (let i = 0; i < 720; i++) {
    const state = sim.step(FIXED_DT, { throttle, steer: i < 120 ? 0 : steer, steerSource: 'analog' });
    powered.sample(state);
  }
  const result = powered.result(), lifted = observer(sim, true);
  for (let i = 0; i < 240; i++) lifted.sample(sim.step(FIXED_DT, {}));
  return { id: [spec.id, fixture.id, 'powered-turn', options.tractionControl === false ? 'tc-off' : 'tc-on', options.label].filter(Boolean).join('/'),
    vehicle: spec.id, fixture: fixture.id, kind: 'powered-turn', initialSpeedMps: speed,
    throttle, steeringFraction: steer, options, ...result, liftRecovery: lifted.result() };
}

export function slopeHold(api, spec, fixture, options = {}) {
  const grade = options.grade ?? .15;
  const sim = settled(api, spec, flatContact(fixture, { grade }), { selector: options.selector || 'P' });
  sim.setControl('engineOn', false);
  const record = observer(sim);
  for (let i = 0; i < 600; i++) record.sample(sim.step(FIXED_DT));
  return { id: [spec.id, fixture.id, 'slope', grade, options.selector || 'P'].join('/'),
    vehicle: spec.id, fixture: fixture.id, kind: 'slope', grade, ...record.result() };
}

export function mixedContact(api, spec, a, b, kind = 'split-brake', sign = 1) {
  const sim = rollingOn(api, spec, a, 10, { sampleAt: (x, z) =>
    (kind === 'split-brake' ? x * sign >= 0 : z < 10) ? a.sample : b.sample });
  const record = observer(sim);
  for (let i = 0; i < 960; i++) {
    const state = sim.step(FIXED_DT, { brake: kind === 'split-brake' || i > 180 ? 1 : 0 });
    record.sample(state); if (state.speedKmh < .36) break;
  }
  return { id: [spec.id, a.id, b.id, kind, sign].join('/'), vehicle: spec.id,
    fixture: a.id + '/' + b.id, kind, initialSpeedMps: 10, sign, ...record.result() };
}

export function splitPowered(api, spec, a, b, { turn = false, sign = 1, tractionControl = true } = {}) {
  const initialSpeedMps = turn ? 5 : 0;
  const sim = rollingOn(api, spec, a, initialSpeedMps, { selector: 'D', tractionControl,
    sampleAt: x => x * sign >= 0 ? a.sample : b.sample });
  const record = observer(sim, true);
  for (let i = 0; i < 600; i++) record.sample(sim.step(FIXED_DT,
    { throttle: .65, steer: turn && i >= 120 ? .1 * sign : 0, steerSource: 'analog' }));
  return { id: [spec.id, a.id, b.id, turn ? 'split-powered-turn' : 'split-launch', sign,
    tractionControl ? 'tc-on' : 'tc-off'].join('/'), vehicle: spec.id,
    fixture: a.id + '/' + b.id, kind: turn ? 'split-powered-turn' : 'split-launch',
    sign, tractionControl, initialSpeedMps, ...record.result() };
}

export function directionCycle(api, spec, fixture) {
  const sim = settled(api, spec, flatContact(fixture)), record = observer(sim);
  for (let i = 0; i < 240; i++) record.sample(sim.step(FIXED_DT, { throttle: .4, autoDirection: true }));
  const changes = [];
  for (const target of ['R', 'D']) {
    let shifted = false;
    for (let i = 0; i < 2400; i++) {
      const previous = sim.state.selector;
      const state = sim.step(FIXED_DT, target === 'R' ? { brake: .65, autoDirection: true } : { throttle: .65, autoDirection: true });
      record.sample(state);
      if (previous !== state.selector) changes.push({ from: previous, to: state.selector,
        speedMps: Math.abs(state.speed), bodySlipDeg: bodySlipDegrees(sim), step: i });
      if (state.selector === target) { shifted = true; break; }
    }
    if (!shifted) break;
    for (let i = 0; i < 120; i++) record.sample(sim.step(FIXED_DT,
      target === 'R' ? { brake: .4, autoDirection: true } : { throttle: .4, autoDirection: true }));
  }
  return { id: [spec.id, fixture.id, 'direction-cycle'].join('/'), vehicle: spec.id,
    fixture: fixture.id, kind: 'direction-cycle', ...record.result(), changes, finalSelector: sim.state.selector };
}

export function mapRun(api, spec, zoneId, options = {}) {
  const terrain = new api.Terrain(); terrain.setMoisture(options.moisture ?? 0);
  const zone = terrain.zones.find(zone => zone.id === zoneId);
  const spawn = options.spawn || zone?.spawn;
  if (!spawn) throw new Error('No map spawn for ' + zoneId);
  const sim = settled(api, spec, terrain, { ...options, spawn });
  const record = observer(sim), start = terrain.sample(spawn.x, spawn.z);
  for (let i = 0; i < (options.seconds ?? 5) / FIXED_DT; i++) {
    const state = sim.step(FIXED_DT, { throttle: options.throttle ?? .45,
      steer: options.steer ?? 0, steerSource: 'analog' });
    record.sample(state);
  }
  const result = record.result();
  return { id: [spec.id, zoneId, 'map', options.label].filter(Boolean).join('/'), vehicle: spec.id,
    zone: zoneId, kind: 'actual-map', spawn, options, startSample: start, ...result,
    detailTiles: terrain.detailTiles.size, soilVolumes: { ...terrain.soilVolumes } };
}

export async function measurementReport(api, { onProgress = () => {}, compact = false } = {}) {
  const started = new Date().toISOString(), fixtures = contactFixtures(api), byId = Object.fromEntries(fixtures.map(row => [row.id, row]));
  const [jeep] = api.VEHICLES, rows = [];
  for (const fixture of fixtures) {
    for (const kind of ['brake', 'coast', 'pulse', 'slide']) rows.push(measureContact(api, jeep, fixture, kind));
  }
  onProgress('Four contact maneuvers on ' + fixtures.length + ' sampled materials: ' + rows.length + ' cases');
  for (const spec of api.VEHICLES) for (const id of ['asphalt-dry', 'hardpack-dry', 'gravel-dry', 'grass-dry', 'mud-dry']) {
    if (spec !== jeep) for (const kind of ['brake', 'pulse']) rows.push(measureContact(api, spec, byId[id], kind));
    for (const tractionControl of [true, false]) rows.push(poweredTurn(api, spec, byId[id], { tractionControl }));
  }
  onProgress('All four chassis and paired powered TC turns: ' + rows.length + ' total cases');
  for (const id of ['asphalt-dry', 'asphalt-wet', 'hardpack-dry', 'grass-dry', 'grass-wet', 'rock-dry', 'mud-dry', 'sand-dry']) rows.push(slopeHold(api, jeep, byId[id]));
  rows.push(slopeHold(api, jeep, byId['asphalt-dry'], { selector: 'N' }));
  for (const sign of [-1, 1]) rows.push(mixedContact(api, jeep, byId['asphalt-dry'], byId['mud-dry'], 'split-brake', sign));
  rows.push(mixedContact(api, jeep, byId['asphalt-dry'], byId['hardpack-dry'], 'transition-brake'));
  for (const spec of api.VEHICLES) for (const sign of [-1, 1]) for (const turn of [false, true]) for (const tractionControl of [true, false]) rows.push(splitPowered(api, spec,
    byId['asphalt-dry'], byId['grass-wet'], { sign, turn, tractionControl }));
  for (const pressure of [18, 37]) for (const id of ['asphalt-dry', 'hardpack-dry', 'mud-dry', 'sand-dry']) {
    rows.push(measureContact(api, jeep, byId[id], 'brake', { pressure, label: pressure + 'psi' }));
    rows.push(poweredTurn(api, jeep, byId[id], { pressure, label: pressure + 'psi' }));
  }
  for (const tires of ['road', 'allTerrain', 'mud']) {
    const spec = api.deriveVehicle(jeep, { tires });
    for (const id of ['asphalt-dry', 'grass-dry', 'mud-dry']) {
      rows.push(measureContact(api, spec, byId[id], 'brake', { label: tires }));
      rows.push(poweredTurn(api, spec, byId[id], { label: tires }));
    }
  }
  for (const waterDepth of [0, .15, .45]) rows.push(measureContact(api, jeep, byId['wetland-wet'], 'coast', { waterDepth, label: waterDepth + 'm-water' }));
  for (const id of ['hardpack-dry', 'gravel-dry', 'grass-dry', 'mud-dry', 'sand-dry']) {
    const prepared = compactedFixture(api, byId[id]); fixtures.push(prepared);
    rows.push(measureContact(api, jeep, prepared, 'coast'));
    rows.push(measureContact(api, jeep, prepared, 'brake'));
  }
  for (const spec of [jeep, api.VEHICLES.find(spec => spec.id === 'civic-sport')]) for (const id of ['hardpack-dry', 'grass-dry', 'mud-dry']) rows.push(directionCycle(api, spec, byId[id]));
  onProgress('Grades, split contact, pressure, tread and water: ' + rows.length + ' total cases');
  if (!compact) {
    for (const spec of api.VEHICLES) {
      for (const zone of ['asphalt', 'trail', 'rock', 'mud', 'wetland', 'sand']) rows.push(mapRun(api, spec, zone));
      rows.push(mapRun(api, spec, 'grass', { spawn: { x: -51, z: 282, heading: 0 }, label: 'dry' }));
    }
    for (const pressure of [18, 37]) for (const zone of ['mud', 'sand']) rows.push(mapRun(api, jeep, zone,
      { pressure, driveMode: '4L', lockers: true, selector: 'D', seconds: 6, label: pressure + 'psi-locked-low' }));
    for (const zone of ['trail', 'grass', 'mud']) rows.push(mapRun(api, jeep, zone,
      { spawn: zone === 'grass' ? { x: -51, z: 282, heading: 0 } : undefined, moisture: 1, label: 'wet' }));
  }
  onProgress('Actual-map geometry/deformation complete: ' + rows.length + ' total cases');
  const finalHashes = runtimeHashes(api.root);
  const baselineManifest = fs.existsSync(path.join(api.root, 'baseline-source.json'))
    ? JSON.parse(fs.readFileSync(path.join(api.root, 'baseline-source.json'), 'utf8')) : null;
  return { schema: 1, version: JSON.parse(fs.readFileSync(path.join(api.root, 'package.json'), 'utf8')).version,
    startedUtc: started, finishedUtc: new Date().toISOString(), sourceRoot: api.root,
    baselineCommit: baselineManifest?.commit_sha || null,
    baselineIdentityValid: baselineManifest ? Object.entries(api.sourceHashes).every(([file, hash]) => baselineManifest.sha256[file] === hash) : null,
    sourceHashes: api.sourceHashes, finalSourceHashes: finalHashes,
    sourcesStable: JSON.stringify(api.sourceHashes) === JSON.stringify(finalHashes),
    harnessSha256: HARNESS_SHA256, harnessStable: HARNESS_SHA256 === sha256(fileURLToPath(import.meta.url)),
    method: { fixedStepSeconds: FIXED_DT, units: 'metres, seconds, radians unless Deg suffix; pressure in psi; force in N; work in J; wheel slip is a ratio (1 = 100%)',
      contact: 'Flat contact fixtures copy all actual Terrain.sample material fields at stated coordinates, then explicitly set flat geometry, zero initial sink/compaction/tread, and zero standing water. These fixtures do not deform.',
      moisture: 'dry/wet suffix selects global moisture 0/1. Mud-dry still denotes the existing soft mud biome; it does not mean dried, solid clay.',
      rolling: 'Settle 1 s; selector N; initialize chassis at 15 m/s with matching wheel rolling speed. Brake until speed <0.1 m/s or 15 s. Coast 3 s. Digital steering pulse 0.5 s then 3.5 s release. Slide injects 3 m/s lateral velocity and observes 3 s.',
      powered: 'Initialize at 6 m/s in Drive; identical 70% throttle for 6 s, first second straight then analog steering 0.12; release both controls for 2 s. TC-on/off pairs retain the same input but not the same speed. Recorded speed/torque/slip/work distinguish why the paths differ.',
      poweredLimits: 'Powered turns are demand tests, not factory acceleration or maximum lateral grip measurements. The six-second interval includes initial engine/driveline speed synchronization.',
      drivenSlip: 'Only loaded driven tires with either ground speed or tread circumferential speed above 2 m/s enter slip statistics; spinning while stuck is retained. Mean yaw gain is actual yaw divided by forward-speed × tan(actual rack angle)/wheelbase, sampled above 2 m/s and 0.02 rad/s requested yaw.',
      bodySlip: 'Unsigned acute angle between local chassis longitudinal axis and velocity, folded for forward/reverse travel. The longitudinal denominator is at least 0.1 m/s. Near standstill this angle is sensitive to tiny contact motion; steady tight turns can also produce a geometric CG velocity angle without tire sliding.',
      slope: '15% planar grade; park by selector P, engine off, settle 1 s and measure subsequent 5 s. A Neutral case proves gravity is still active. P is deliberately all-wheel modeled parking, not a rear-only lever test.',
      mixed: 'One side asphalt/one side mud, mirrored left/right at 10 m/s with identical braking. Separate forward transition enters hardpack from asphalt at z=10 m before braking.',
      splitPowered: 'Mirrored asphalt/wet-grass lanes, all four chassis, default driven axle and open differential, TC on/off. Launch from rest or start a partial turn at 5 m/s; 65% throttle for 5 s, turning case uses analog 0.1 after 1 s. The turn can carry the footprint across the lane boundary; contact details and 10 Hz force traces are retained.',
      compaction: 'A separate Terrain receives three swept rolling footprints at the sampled coordinate. Its complete resulting material sample, including sink and compaction, is copied into a flat contact fixture; this isolates the modified material response from rut slopes.',
      direction: 'Actual stop-then-reverse controls on hardpack, grass and mud: 2 s at 40% forward pedal, hold 65% brake until Reverse, back up 1 s at 40%, then hold 65% forward until Drive and continue 1 s. Actual shift speed and sequence are recorded.',
      map: 'Fresh actual terrain per trial. 1 s settling followed by 5 s of 45% throttle from named zone spawn; grass uses the reported Pine Ridge coordinate. Actual contacts, water, slopes and deformation remain active; zone results are not flat-material rankings.',
      work: 'Signed tire lateral force times contact lateral speed, and longitudinal tire force times circumferential-minus-ground speed, integrated at each contact. Separate passive soil work sums soilLongitudinalForce × speedLong and soilLateralForce × speedLat. These are diagnostic contact work, not total vehicle energy accounting.',
      frictionBudget: 'Uses tire-only force against current per-contact friction coefficient and load. Explicit soil plowing forces, when present, are separate and separately integrated.',
      limits: 'CPU simulation trajectories, not interactive browser tests, human steering-feel validation, OEM handling data or measured tire/soil calibration.' },
    fixtures, cases: rows };
}

export function compareReports(baseline, current) {
  const oldRows = new Map(baseline.cases.map(row => [row.id, row]));
  const newRows = new Map(current.cases.map(row => [row.id, row]));
  const missingBaseline = [...newRows.keys()].filter(key => !oldRows.has(key));
  const missingCurrent = [...oldRows.keys()].filter(key => !newRows.has(key));
  const harnessIdentical = baseline.harnessSha256 === current.harnessSha256;
  const uniqueCases = oldRows.size === baseline.cases.length && newRows.size === current.cases.length;
  const fields = ['distanceM', 'finalSpeedMps', 'peakBodySlipDeg', 'p95DrivenSlip',
    'meanYawGain', 'meanEngineTorqueNm', 'lateralContactWorkJ', 'wheelSlipWorkJ'];
  const comparison = [...newRows].filter(([id]) => oldRows.has(id)).sort(([a], [b]) => a.localeCompare(b)).map(([id, after]) => {
    const before = oldRows.get(id);
    return { id, kind: after.kind, vehicle: after.vehicle,
      changes: Object.fromEntries(fields.map(field => [field, {
        baseline: before[field], current: after[field], delta: after[field] - before[field],
        ratio: Math.abs(before[field]) > 1e-9 ? after[field] / before[field] : null,
      }])) };
  });
  return { schema: 1, purpose: 'Identical-harness published v1.6 versus v1.7 integrated surface-physics comparison',
    valid: baseline.sourcesStable && current.sourcesStable && baseline.harnessStable && current.harnessStable
      && baseline.baselineIdentityValid === true && harnessIdentical && uniqueCases
      && !missingBaseline.length && !missingCurrent.length,
    harnessIdentical, uniqueCases, matchedCases: comparison.length, missingBaseline, missingCurrent,
    baseline, current, comparison };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), option = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const api = await loadSimulation(option('--source-root') || DEFAULT_ROOT);
  const report = await measurementReport(api, { compact: args.includes('--compact'), onProgress: message => console.error(message) });
  const baselinePath = option('--baseline');
  const result = baselinePath ? compareReports(JSON.parse(fs.readFileSync(baselinePath, 'utf8')), report) : report;
  const output = option('--output');
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  else console.log(JSON.stringify(result, null, 2));
  console.error(JSON.stringify({ cases: report.cases.length, sourcesStable: report.sourcesStable,
    harnessStable: report.harnessStable, ...(baselinePath ? { comparisonValid: result.valid, matchedCases: result.matchedCases } : {}), output: output || 'stdout' }));
  if (!report.sourcesStable || !report.harnessStable || (baselinePath && !result.valid)) process.exitCode = 2;
}
