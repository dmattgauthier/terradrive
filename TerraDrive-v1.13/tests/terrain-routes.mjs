import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIXED_DT, DEFAULT_ROOT, loadSimulation, runtimeHashes, settled,
  bodySlipDegrees } from './surface-metrics.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const harnessFiles = [fileURLToPath(import.meta.url), fileURLToPath(new URL('./surface-metrics.mjs', import.meta.url))];
const harnessHashes = Object.fromEntries(harnessFiles.map(file => [path.basename(file), hash(file)]));

function watch(sim, terrain) {
  let count = 0, currentPhase = '', priorPosition = { ...sim.body.position }, distance = 0;
  const phases = new Map(), traces = [], changes = [], surfaceCounts = {}, controls = [];
  let previousSelector = sim.state.selector, peakBudget = 0, finite = true, minCondition = 1, minUp = 1;
  let soilLongitudinalWorkJ = 0, soilLateralWorkJ = 0, positiveSoilWorkJ = 0;
  function phaseRecord(phase) {
    if (!phases.has(phase)) phases.set(phase, { name: phase, samples: 0, distanceM: 0,
      speed: [], slip: [], bodySlip: [], torqueScale: [], forceUtilization: [],
      bodySlipBands: [.5, 1, 2].map(minimumSpeedMps => ({ minimumSpeedMps, values: [], peak: null })),
      startTimeS: count * FIXED_DT, endTimeS: count * FIXED_DT,
      startPosition: { ...sim.body.position }, endPosition: { ...sim.body.position },
      contactDetails: new Set(), loadedWheels: [], maxSinkM: 0 });
    return phases.get(phase);
  }
  return {
    control(name, value) { controls.push({ t: count * FIXED_DT, name, value }); },
    step(phase, input) {
      currentPhase = phase; const p = phaseRecord(phase);
      const state = sim.step(FIXED_DT, input); count++;
      const delta = Math.hypot(state.position.x - priorPosition.x, state.position.z - priorPosition.z);
      priorPosition = state.position; distance += delta; p.distanceM += delta; p.samples++;
      const speed = Math.abs(state.speed), moving = speed > .5;
      const bodySlip = bodySlipDegrees(sim);
      p.speed.push(speed); if (moving) p.bodySlip.push(bodySlip);
      p.endTimeS = count * FIXED_DT;
      for (const band of p.bodySlipBands) if (speed > band.minimumSpeedMps) {
        band.values.push(bodySlip);
        if (!band.peak || bodySlip > band.peak.angleDeg) {
          const localVelocity = sim.body.vectorToLocalFrame(sim.body.velocity);
          band.peak = { t: count * FIXED_DT, angleDeg: bodySlip, planarSpeedMps: speed,
            localVelocityMps: { ...localVelocity }, headingRad: state.heading,
            yawRadS: state.angularVelocity.y, selector: state.selector,
            rawInput: { ...input }, resolvedInput: { ...state.driverInput },
            loadedWheels: state.groundedWheels, sinkM: state.wheels.map(w => w.sink) };
        }
      }
      p.torqueScale.push(state.tractionIntervention?.torqueScale ?? 1);
      p.loadedWheels.push(state.groundedWheels); p.endPosition = { ...state.position };
      finite &&= [...Object.values(state.position), ...Object.values(state.velocity),
        ...Object.values(state.quaternion), ...Object.values(state.angularVelocity)].every(Number.isFinite);
      minCondition = Math.min(minCondition, state.damage.condition);
      minUp = Math.min(minUp, 1 - 2 * (state.quaternion.x ** 2 + state.quaternion.z ** 2));
      for (const wheel of state.wheels) {
        const raw = sim._wheels[wheel.index];
        const detail = wheel.surfaceDetail || raw.data.surfaceDetail || wheel.surface;
        p.contactDetails.add(detail); surfaceCounts[detail] = (surfaceCounts[detail] || 0) + 1;
        p.maxSinkM = Math.max(p.maxSinkM, wheel.sink);
        if (wheel.load > 1) {
          const budget = Math.hypot(wheel.longitudinalForce, wheel.tireLateralForce ?? wheel.lateralForce)
            / Math.max(1e-9, wheel.load * wheel.frictionCoefficient);
          peakBudget = Math.max(peakBudget, budget); p.forceUtilization.push(budget);
          if (Math.abs(wheel.driveTorque) > 1 && Math.max(Math.abs(raw.speedLong), Math.abs(wheel.omega * wheel.radius)) > 2) p.slip.push(Math.abs(wheel.slip));
          const longWork = (wheel.soilLongitudinalForce || 0) * raw.speedLong * FIXED_DT;
          const sideWork = (wheel.soilLateralForce || 0) * raw.speedLat * FIXED_DT;
          soilLongitudinalWorkJ += longWork; soilLateralWorkJ += sideWork;
          positiveSoilWorkJ += Math.max(0, longWork) + Math.max(0, sideWork);
        }
      }
      if (state.selector !== previousSelector) {
        changes.push({ t: count * FIXED_DT, phase, from: previousSelector, to: state.selector,
          speedMps: speed, manuallyRequested: controls.some(c => c.name === 'selector' && count * FIXED_DT - c.t < FIXED_DT * 1.5) });
        previousSelector = state.selector;
      }
      if (count % 24 === 0) traces.push({ t: count * FIXED_DT, phase,
        x: state.position.x, y: state.position.y, z: state.position.z, heading: state.heading,
        speedMps: state.speed, bodySlipDeg: moving ? bodySlip : null,
        yawRadS: state.angularVelocity.y, selector: state.selector,
        input: { ...state.driverInput }, requestedEngineTorqueNm: state.requestedEngineTorque ?? state.engineTorque,
        deliveredEngineTorqueNm: state.engineTorque, tractionIntervention: state.tractionIntervention || null,
        loadN: state.wheels.map(w => w.load), wheelSlip: state.wheels.map(w => w.slip),
        surfaceMix: state.wheels.map(w => w.surfaceMix || { [w.surface]: 1 }),
        sinkM: state.wheels.map(w => w.sink), condition: state.damage.condition });
      return state;
    },
    finish() {
      return { seconds: count * FIXED_DT, distanceM: distance, finalPhase: currentPhase,
        finalPosition: { ...sim.state.position }, finalSpeedMps: Math.abs(sim.state.speed),
        finalSelector: sim.state.selector, condition: sim.state.damage.condition,
        minimumCondition: minCondition, minimumUp: minUp, finite,
        peakTireFrictionUtilization: peakBudget, soilLongitudinalWorkJ, soilLateralWorkJ,
        positiveSoilWorkJ, surfaceCounts, changes, controls,
        detailTiles: terrain.detailTiles.size, soilVolumes: { ...terrain.soilVolumes },
        phases: [...phases.values()].map(p => ({ name: p.name, seconds: p.samples * FIXED_DT,
          startTimeS: p.startTimeS, endTimeS: p.endTimeS,
          distanceM: p.distanceM, meanSpeedMps: average(p.speed), finalSpeedMps: p.speed.at(-1),
          maximumSpeedMps: Math.max(0, ...p.speed), p95DrivenSlip: percentile(p.slip, .95),
          maximumMovingBodySlipDeg: Math.max(0, ...p.bodySlip), p95MovingBodySlipDeg: percentile(p.bodySlip, .95),
          bodySlipByMinimumSpeed: p.bodySlipBands.map(band => ({ minimumSpeedMps: band.minimumSpeedMps,
            sampleCount: band.values.length, maximumDeg: Math.max(0, ...band.values),
            p95Deg: percentile(band.values, .95), peak: band.peak })),
          meanTorqueScale: average(p.torqueScale), minTorqueScale: Math.min(1, ...p.torqueScale),
          finalTorqueScale: p.torqueScale.at(-1), peakTireFrictionUtilization: Math.max(0, ...p.forceUtilization),
          minLoadedWheels: Math.min(4, ...p.loadedWheels), maxSinkM: p.maxSinkM,
          contactDetails: [...p.contactDetails].sort(), startPosition: p.startPosition, endPosition: p.endPosition })),
        traces };
    },
  };
}

function driverToSpeed(sim, target) {
  const speed = sim.state.speed;
  return { throttle: clamp(.12 + (target - speed) * .30, 0, .55),
    brake: clamp((speed - target - .3) * .35, 0, .6) };
}

export function coverLoop(api, moisture) {
  const terrain = new api.Terrain(); terrain.setMoisture(moisture);
  const spec = api.VEHICLES.find(v => v.id === 'wrangler-rubicon');
  const spawn = { x: -3, z: -44, heading: 0 };
  const sim = settled(api, spec, terrain, { spawn, selector: 'D' });
  const record = watch(sim, terrain);
  for (let i = 0; i < 7200; i++) {
    const t = i * FIXED_DT, pedals = driverToSpeed(sim, 2.5);
    record.step(t < 3 ? 'approach' : 'constant-steer-loop',
      { ...pedals, steer: t < 3 ? 0 : .5, steerSource: 'analog' });
  }
  return { id: 'wrangler-cover-loop-' + (moisture ? 'wet' : 'dry'), vehicle: spec.id,
    scenario: 'Repeated hardpack/gravel/grass crossings', moisture, spawn,
    method: { durationS: 60, selector: 'D', driveMode: spec.defaultMode, targetSpeedMps: 2.5,
      steering: 'First 3 s straight, then constant analog +0.5 for 57 s.',
      driver: 'throttle=clamp(0.12+0.30*(2.5-signedSpeed),0,0.55); brake=clamp(0.35*(signedSpeed-2.5-0.3),0,0.6). Only normal pedal controls act on the vehicle; no pose or velocity correction.' },
    ...record.finish() };
}

export function wetMudCycles(api) {
  const terrain = new api.Terrain(); terrain.setMoisture(1);
  const spec = api.VEHICLES.find(v => v.id === 'bronco-badlands');
  const spawn = { x: 48, z: -135, heading: 0 };
  const sim = settled(api, spec, terrain, { spawn, pressure: 24, driveMode: '4H', selector: 'D' });
  const record = watch(sim, terrain);
  let recoveryHold = 0, recoveredAt = null;
  const recovery = { disabledAtS: 4, enabledAtS: 5, recoveredAtS: null, criterion: 'Filtered driven-slip feedback remains at or below 1.5 times its live target for 0.4 s, while the throttle remains held above 0.5.' };
  for (let i = 0; i < 5400; i++) {
    const t = i * FIXED_DT;
    if (i === 480) { sim.setControl('tractionControl', false); record.control('tractionControl', false); }
    if (i === 600) { sim.setControl('tractionControl', true); record.control('tractionControl', true); }
    const forward = Math.floor(t / 8) % 2 === 0;
    const target = forward ? 2 : -1.6;
    const raw = forward ? { throttle: clamp(.24 + (target - sim.state.speed) * .5, 0, .8), brake: 0 }
      : { throttle: 0, brake: clamp(.24 + (sim.state.speed - target) * .5, 0, .8) };
    if (t >= 4 && t < 7) { raw.throttle = 1; raw.brake = 0; }
    const phase = t >= 4 && t < 5 ? 'tc-disabled-wheelspin' : t >= 5 && t < 7 ? 'tc-reenabled-powered-recovery'
      : t >= 7 && t < 8 ? 'forward-pass-0-resumed'
      : (forward ? 'forward-pass-' : 'reverse-pass-') + Math.floor(t / 8);
    const state = record.step(phase, { ...raw, steer: 0, autoDirection: true });
    const tc = state.tractionIntervention;
    if (t >= 5 && t < 7 && tc && state.driverInput.throttle > .5) {
      recoveryHold = tc.measuredSlip <= tc.slipTarget * 1.5 ? recoveryHold + FIXED_DT : 0;
      if (recoveredAt === null && recoveryHold >= .4) recoveredAt = (i + 1) * FIXED_DT;
    }
  }
  recovery.recoveredAtS = recoveredAt;
  return { id: 'bronco-wet-mud-cycles', vehicle: spec.id,
    scenario: 'TC re-enable and repeated wet-rut direction changes', moisture: 1, spawn,
    method: { durationS: 45, driveMode: '4H', pressurePSI: 24, tractionControlInitially: true,
      directions: 'Alternate desired forward/reverse travel every 8 s using the existing stop-then-reverse pedal controller.',
      driver: 'Forward target 2 m/s with throttle=clamp(0.24+0.5*(target-signedSpeed),0,0.8). Reverse target -1.6 m/s with held brake=clamp(0.24+0.5*(signedSpeed-target),0,0.8). All steering input remains zero.',
      intervention: 'At 4 s disable TC and hold full throttle; at 5 s re-enable TC, holding full throttle until 7 s; then resume normal desired-speed pedals.',
      interpretation: 'Repeated rut growth can legitimately reduce progress or bog the vehicle. A power reduction while excessive wheelspin persists is not by itself a controller fault.' },
    controllerRecovery: recovery, ...record.finish() };
}

export function loadedDescent(api, moisture) {
  const terrain = new api.Terrain(); terrain.setMoisture(moisture);
  const factory = api.VEHICLES.find(v => v.id === 'sprinter-2500');
  const unloaded = api.deriveVehicle(factory, {});
  // Estimated QA ballast centered at the stock CG. Factory spring geometry and
  // tire reference loads are retained through visualBase; only dynamic mass
  // and its resulting physical sag/load sensitivity change.
  const spec = { ...unloaded, mass: factory.mass + 600 };
  const spawn = { x: -110, z: 285, heading: 2.605089248695247 };
  const sim = settled(api, spec, terrain, { spawn, selector: 'P' });
  for (let i = 0; i < 120; i++) sim.step(FIXED_DT, { brake: 1 });
  sim.setControl('selector', 'N');
  const forward = sim.body.vectorToWorldFrame({ x: 0, y: 0, z: 1 });
  sim.body.velocity.set(forward.x * 8, forward.y * 8, forward.z * 8);
  for (const wheel of sim._wheels) wheel.omega = sim.body.velocity.dot(wheel.forward) / wheel.radius;
  const startSample = terrain.sample(spawn.x, spawn.z), record = watch(sim, terrain);
  for (let i = 0; i < 60; i++) record.step('initial-neutral-roll', {});
  const brakingStartSpeed = Math.abs(sim.state.speed), brakingStart = { ...sim.body.position };
  let stopTime = null, held = 0;
  for (let i = 0; i < 2400; i++) {
    const state = record.step('downhill-service-brake', { brake: 1 });
    held = Math.abs(state.speed) < .1 ? held + FIXED_DT : 0;
    if (held >= .4) { stopTime = (i + 1) * FIXED_DT; break; }
  }
  const firstStopPosition = { ...sim.body.position };
  for (let i = 0; i < 960; i++) record.step('held-service-brake', { brake: 1 });
  sim.setControl('selector', 'D'); record.control('selector', 'D');
  for (let i = 0; i < 720; i++) record.step('redrive', { throttle: .3 });
  for (let i = 0; i < 1440; i++) record.step('second-brake-and-hold', { brake: 1 });
  return { id: 'loaded-sprinter-grass-descent-' + (moisture ? 'wet' : 'dry'), vehicle: spec.id,
    scenario: 'Loaded downhill braking, holding and re-drive', moisture, spawn,
    method: { factoryMassKG: factory.mass, ballastKG: 600, totalMassKG: spec.mass,
      ballast: 'Estimated QA ballast at the stock CG and front/rear distribution; not a selectable in-game payload feature or a real-vehicle load recommendation.',
      referenceLoad: 'Factory visualBase retains stock tire reference loads and spring/mount geometry, so the added load produces actual sag and load-sensitive tire forces.',
      pressurePSI: [spec.stockPSIFront, spec.stockPSIRear], initialSpeedMps: 8,
      driver: 'Settle 2 s parked. Initialize matched rolling speed once, then coast 0.5 s in Neutral; hold full service brake until speed remains below 0.1 m/s for 0.4 s, maximum 20 s; hold 8 s; select D and drive at 30% throttle for 6 s; brake and hold for 12 s. Automatic direction changes are disabled.',
      heightfield: 'Actual grass hillside beyond the north end of the paved road; no synthetic ramp or friction override.' },
    startSample, startGrade: Math.hypot(startSample.normal.x, startSample.normal.z) / startSample.normal.y,
    brakingStartSpeedMps: brakingStartSpeed, firstStopTimeS: stopTime,
    firstStoppingDistanceM: Math.hypot(firstStopPosition.x - brakingStart.x, firstStopPosition.z - brakingStart.z),
    ...record.finish() };
}

export async function routeReport(api) {
  const startedUtc = new Date().toISOString();
  const cases = [coverLoop(api, 0), coverLoop(api, 1), wetMudCycles(api), loadedDescent(api, 0), loadedDescent(api, 1)];
  const finalHashes = runtimeHashes(api.root);
  const finalHarnessHashes = Object.fromEntries(harnessFiles.map(file => [path.basename(file), hash(file)]));
  return { schema: 1, purpose: 'Five bounded actual-terrain runs resolving longer-duration contact/control gaps',
    startedUtc, finishedUtc: new Date().toISOString(), sourceRoot: api.root,
    sourceHashes: api.sourceHashes, finalSourceHashes: finalHashes,
    sourcesStable: JSON.stringify(api.sourceHashes) === JSON.stringify(finalHashes),
    harnessHashes, finalHarnessHashes, harnessStable: JSON.stringify(harnessHashes) === JSON.stringify(finalHarnessHashes),
    method: { fixedStepSeconds: FIXED_DT, traceHz: 5,
      terrain: 'Fresh production Terrain for every case, with actual heightfield rocks, grades, per-tire materials, water and evolving deformation. Scene-added trees/props are omitted so an unrelated collision cannot obscure controller/contact behavior.',
      interventions: 'The loop and mud drivers only operate ordinary game controls. The loaded descent initializes a matched velocity once before observation; no route subsequently corrects pose, heading or velocity.',
      bodySlip: 'Unsigned acute longitudinal-axis/velocity angle, sampled only above 0.5 m/s. Full 120 Hz summaries also require speed above 1 and 2 m/s, retaining peak timestamps, local velocity, heading and inputs. Near standstill this angle is sensitive to small contact motion; a tight no-slip turn also has a geometric CG velocity angle.',
      force: 'Tire friction budget uses tire-only longitudinal/lateral forces. Passive soil forces are integrated separately; positive signed soil work is reported to reveal energy creation.',
      limits: 'Deterministic simulation QA with explicitly estimated load/controller fixtures. These routes are not OEM validation, a browser performance test, a selectable driving aid or a new vehicle payload feature.' }, cases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), option = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const api = await loadSimulation(option('--source-root') || DEFAULT_ROOT);
  const report = await routeReport(api), output = option('--output');
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  else console.log(JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ cases: report.cases.length, seconds: report.cases.reduce((sum, row) => sum + row.seconds, 0),
    sourcesStable: report.sourcesStable, harnessStable: report.harnessStable, output: output || 'stdout' }));
  if (!report.sourcesStable || !report.harnessStable) process.exitCode = 2;
}
