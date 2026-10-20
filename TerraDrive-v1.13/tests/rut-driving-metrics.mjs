/** Actual driven tire paths on the authored, deformable map.
 * This deliberately never calls Terrain.deform directly or removes its
 * supportPlane: footprint loading, wheel slip and soil response come from
 * VehiclePhysics.step, as they do in the driving view.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadSimulation, runtimeHashes, DEFAULT_ROOT, FIXED_DT } from './surface-metrics.mjs';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = fraction => sorted.length ? sorted[Math.floor((sorted.length - 1) * fraction)] : null;
  return { count: values.length, min: sorted[0] ?? null, p10: q(.1), median: q(.5), p90: q(.9), max: sorted.at(-1) ?? null, mean: average(values) };
}

/** Unit-labelled, bounded route with a normal accelerator/brake/steering
 * controller. No reset, prescribed velocity or chassis repositioning occurs
 * after the one-second stationary settle. A stock vehicle that gets stuck
 * keeps its actual shorter route; it is never teleported to meet the target.
 */
export function measureRutRoute(api, spec, { surface = 'mud', pressure, driveMode,
  targetDistanceM = 20, targetSpeedMps = 3, maxSeconds = 35, maxDetailTiles, keepTrackSamples = false } = {}) {
  const terrain = new api.Terrain();
  if (maxDetailTiles !== undefined) {
    if (!Number.isInteger(maxDetailTiles) || maxDetailTiles < 1) throw Error('Invalid controlled soil tile budget');
    terrain.maxDetailTiles = maxDetailTiles;
  }
  const spawn = surface === 'hardpack'
    ? { x: terrain.trailX(-82), z: -82, heading: Math.atan2(terrain.trailX(-81) - terrain.trailX(-83), 2) }
    : surface === 'grass' ? { x: -51, z: 282, heading: 0 }
      : { ...terrain.zones.find(zone => zone.id === surface)?.spawn };
  if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.z)) throw Error('Unknown driving fixture: ' + surface);
  const sim = new api.VehiclePhysics(terrain, spec); sim.reset(spawn);
  if (pressure !== undefined) {
    const result = sim.setPressure(pressure, pressure);
    if (!result.ok) throw Error(result.message);
  }
  if (driveMode) {
    sim.setControl('selector', 'N');
    const result = sim.setControl('driveMode', driveMode);
    if (!result.ok) throw Error(result.message);
    sim.setControl('selector', 'D');
  }

  let driving = false, distanceM = 0, frame = 0, calls = 0, bearingCalls = 0, growingCalls = 0;
  const loads = [], contactAreas = [], contactWidths = [], contactLengths = [], bearing = [], deflections = [], speeds = [];
  const deform = terrain.deform.bind(terrain);
  terrain.deform = (x, z, args) => {
    const before = terrain.soilVolumes.depressed;
    const result = deform(x, z, args);
    if (driving) {
      calls++; if (args.supportPlane) bearingCalls++;
      if (terrain.soilVolumes.depressed > before + 1e-15) growingCalls++;
      if (frame % 12 === 0) {
        loads.push(args.load); speeds.push(args.speed); contactWidths.push(args.contactWidth); contactLengths.push(args.contactLength);
        contactAreas.push(Math.PI * args.contactWidth * args.contactLength / 4);
        if (args.supportPlane) { bearing.push(args.supportPlane.meanBearing); deflections.push(args.supportPlane.deflection); }
      }
    }
    return result;
  };
  for (let i = 0; i < 120; i++) sim.step(FIXED_DT, { brake: 1, handbrake: true });
  const settled = { position: { ...sim.state.position }, soilVolumesM3: { ...terrain.soilVolumes }, tiles: terrain.detailTiles.size };
  const controls = { ...sim.controls }, lastWheel = Array(4).fill(null), tracks = [], meters = [], surfaceCounts = {};
  let lastPosition = { ...sim.state.position }, integral = 0;
  driving = true;
  for (; frame < Math.ceil(maxSeconds / FIXED_DT) && distanceM < targetDistanceM; frame++) {
    const current = sim.state, error = targetSpeedMps - current.speedKmh / 3.6;
    integral = clamp(integral + error * FIXED_DT * .05, -.1, .4);
    const throttle = clamp(.12 + error * .22 + integral, 0, .65), brake = clamp((-error - .6) * .15, 0, .35);
    const targetX = surface === 'hardpack' ? terrain.trailX(current.position.z + 7) : spawn.x;
    const heading = Math.atan2(targetX - current.position.x, 7);
    const steer = clamp(-wrap(heading - current.heading) * 1.45, -.35, .35);
    const previousDistance = distanceM;
    const state = sim.step(FIXED_DT, { throttle, brake, steer, steerSource: 'analog' });
    distanceM += Math.hypot(state.position.x - lastPosition.x, state.position.z - lastPosition.z);
    lastPosition = { ...state.position };
    if (!Number.isFinite(distanceM)) throw Error('Non-finite driving route: ' + spec.id + '/' + surface);
    for (const wheel of state.wheels) {
      if (!wheel.contact) continue;
      surfaceCounts[wheel.surfaceDetail] = (surfaceCounts[wheel.surfaceDetail] || 0) + 1;
      const previous = lastWheel[wheel.index];
      if (distanceM > 2 && (!previous || Math.hypot(wheel.ground.x - previous.x, wheel.ground.z - previous.z) >= .1)) {
        const point = { wheel: wheel.index, x: wheel.ground.x, z: wheel.ground.z, distanceM,
          widthM: wheel.contactWidth, heading: Math.atan2(wheel.forward.x, wheel.forward.z), surface: wheel.surface };
        tracks.push(point); lastWheel[wheel.index] = point;
      }
    }
    if (Math.floor(distanceM) > Math.floor(previousDistance)) meters.push({ distanceM, seconds: (frame + 1) * FIXED_DT,
      depressedM3: terrain.soilVolumes.depressed - settled.soilVolumesM3.depressed, tiles: terrain.detailTiles.size, speedKmh: state.speedKmh });
    if (state.damage.disabled) break;
  }
  // Inspect persistent soil after the tire has left it. Excluding the first
  // and final two metres avoids counting the spawn dent or final contact.
  // A whole tire-width section catches a real displaced track even when a
  // centre ray falls on its narrow edge berm during steering/normal changes.
  const trailing = tracks.filter(point => point.distanceM < distanceM - 2).map(point => {
    const samples = Array.from({ length: 9 }, (_, i) => {
      const across = (i / 8 - .5) * point.widthM;
      return terrain.sample(point.x + across * Math.cos(point.heading), point.z - across * Math.sin(point.heading));
    });
    return { ...point, centerDepthM: samples[4].sink, corridorDepthM: Math.max(...samples.map(sample => sample.sink)),
      compaction: samples[4].compaction, tread: samples[4].tread };
  });
  let longestGapM = 0;
  for (let wheel = 0; wheel < 4; wheel++) {
    let previous, gap = 0;
    for (const point of trailing.filter(p => p.wheel === wheel)) {
      const step = previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : .1;
      gap = point.corridorDepthM < .0001 ? gap + step : 0;
      longestGapM = Math.max(longestGapM, gap); previous = point;
    }
  }
  let deepestRutM = 0, blankTiles = 0, maxCompaction = 0, maxTread = 0;
  for (const tile of terrain.detailTiles.values()) {
    let changed = false;
    for (let i = 0; i < tile.delta.length; i++) {
      deepestRutM = Math.max(deepestRutM, -tile.delta[i]);
      maxCompaction = Math.max(maxCompaction, tile.compaction[i]); maxTread = Math.max(maxTread, tile.tread[i]);
      if (Math.abs(tile.delta[i]) > 1e-9 || tile.compaction[i] > 1e-9 || tile.tread[i] > 1e-9 || tile.churn[i] > 1e-9) changed = true;
    }
    if (!changed) blankTiles++;
  }
  const rollingSoilVolumesM3 = Object.fromEntries(Object.keys(terrain.soilVolumes).map(key => [key, terrain.soilVolumes[key] - settled.soilVolumesM3[key]]));
  return { id: `${spec.id}/${surface}/${controls.frontPSI}-${controls.rearPSI}psi/${controls.driveMode}`,
    vehicle: spec.id, surface, spawn, controls, method: { targetDistanceM, targetSpeedMps, maxSeconds, settleSeconds: 1, fixedStepS: FIXED_DT, detailTileBudget: terrain.maxDetailTiles },
    seconds: Math.min(frame, Math.ceil(maxSeconds / FIXED_DT)) * FIXED_DT, distanceM, forwardM: sim.state.position.z - settled.position.z,
    finalPosition: sim.state.position, finalSpeedKmh: sim.state.speedKmh, condition: sim.state.damage.condition,
    disabled: sim.state.damage.disabled, highCentered: sim.state.highCentered, settled, surfaceCounts,
    contact: { calls, bearingCalls, growingCalls, loadN: distribution(loads), speedMps: distribution(speeds),
      deflectionM: distribution(deflections), footprintAreaM2: distribution(contactAreas), footprintWidthM: distribution(contactWidths),
      footprintLengthM: distribution(contactLengths), meanBearingFraction: distribution(bearing) },
    soil: { deepestRutM, maxCompaction, maxTread, tiles: terrain.detailTiles.size, blankTiles, full: !!terrain.detailBudgetFull,
      soilVolumesM3: { ...terrain.soilVolumes }, rollingSoilVolumesM3,
      rollingExcavatedM3PerMeter: rollingSoilVolumesM3.depressed / Math.max(.001, distanceM) },
    trailing: { count: trailing.length, centerDepthM: distribution(trailing.map(p => p.centerDepthM)), corridorDepthM: distribution(trailing.map(p => p.corridorDepthM)),
      centerCoverageAbove01mm: trailing.filter(p => p.centerDepthM >= .0001).length / Math.max(1, trailing.length),
      corridorCoverageAbove01mm: trailing.filter(p => p.corridorDepthM >= .0001).length / Math.max(1, trailing.length),
      longestCorridorGapBelow01mmM: longestGapM, compaction: distribution(trailing.map(p => p.compaction)), tread: distribution(trailing.map(p => p.tread)) },
    meters, ...(keepTrackSamples ? { trackSamples: trailing } : {}) };
}

export async function measureRutSuite(sourceRoot, { surfaces = ['mud', 'sand'], controls = true } = {}) {
  const api = await loadSimulation(sourceRoot), cases = [];
  for (const surface of surfaces) for (const spec of api.VEHICLES) cases.push(measureRutRoute(api, spec, { surface }));
  const wrangler = api.VEHICLES.find(spec => spec.id === 'wrangler-rubicon');
  if (controls) {
    for (const surface of ['hardpack', 'grass', 'asphalt'].filter(value => !surfaces.includes(value))) cases.push(measureRutRoute(api, wrangler, { surface }));
    for (const surface of ['mud', 'sand']) cases.push(measureRutRoute(api, wrangler, { surface, pressure: 18 }));
  }
  if (JSON.stringify(runtimeHashes(api.root)) !== JSON.stringify(api.sourceHashes)) throw Error('Source changed during rut suite: ' + api.root);
  return { root: api.root, version: JSON.parse(fs.readFileSync(path.join(api.root, 'package.json'))).version, sourceHashes: api.sourceHashes, cases };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2); let current = DEFAULT_ROOT, baseline, output, surfaces = ['mud', 'sand'];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--current') current = path.resolve(args[++i]);
    else if (args[i] === '--baseline') baseline = path.resolve(args[++i]);
    else if (args[i] === '--out') output = path.resolve(args[++i]);
    else if (args[i] === '--surfaces') surfaces = args[++i].split(',');
    else throw Error('Usage: node tests/rut-driving-metrics.mjs [--baseline source] [--current source] [--surfaces mud,sand] --out report.json');
  }
  if (!output) throw Error('--out is required');
  const report = { measuredAtUTC: new Date().toISOString(), harnessSHA256: sha256(fileURLToPath(import.meta.url)),
    method: 'Actual 120 Hz VehiclePhysics on authored Terrain and live deformation; stock factory catalog setups unless a pressure/drive control is specified. One-second brake-held settle, then ordinary pedals/analog steering toward 3 m/s over 20 m. Persistent wheel-path sections sampled after passage, omitting first/last 2 m. No direct stamping, prescribed velocity, geometry flattening, support-plane removal or driving teleport.',
    limits: 'Software regressions using estimated tire and soil parameters; not measured real-world validation. A stuck vehicle retains its actual shorter route and 35-second time limit. The maximum rut includes starting-wheel sink; trailing distributions exclude it. Tire-width corridor depth is distinct from its center sample. Existing fronts/rears can share tracks. All length, area, volume and force fields are SI except explicitly labelled PSI or Kmh.',
    baseline: baseline ? await measureRutSuite(baseline, { surfaces }) : null,
    current: await measureRutSuite(current, { surfaces }) };
  if (report.baseline) report.comparison = report.current.cases.map(row => {
    const old = report.baseline.cases.find(previous => previous.id === row.id);
    return { id: row.id, previousPresent: !!old, ...(old ? {
      distanceChangeM: row.distanceM - old.distanceM,
      medianTrailingDepthChangeM: row.trailing.centerDepthM.median - old.trailing.centerDepthM.median,
      corridorCoverageChange: row.trailing.corridorCoverageAbove01mm - old.trailing.corridorCoverageAbove01mm,
      excavatedVolumePerMeterChange: row.soil.rollingExcavatedM3PerMeter - old.soil.rollingExcavatedM3PerMeter,
      allocatedTilesChange: row.soil.tiles - old.soil.tiles } : {}) };
  });
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, cases: report.current.cases.length,
    routesBelow15m: report.current.cases.filter(row => row.distanceM < 15).map(row => ({ id: row.id, distanceM: row.distanceM })),
    stockSoftMedianTrailingDepthMM: report.current.cases.filter(row => ['mud', 'sand'].includes(row.surface) && row.controls.frontPSI !== 18)
      .map(row => ({ id: row.id, medianMM: row.trailing.centerDepthM.median * 1000, corridorCoverage: row.trailing.corridorCoverageAbove01mm })) }));
}
