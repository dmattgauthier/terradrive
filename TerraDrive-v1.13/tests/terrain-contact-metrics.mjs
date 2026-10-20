/** Source-verified measurements of contact loading and actual deformed soil. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSimulation, runtimeHashes, DEFAULT_ROOT, contactFixtures, measureContact } from './surface-metrics.mjs';

const args = process.argv.slice(2);
let baseline, current = DEFAULT_ROOT, output;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--baseline') baseline = path.resolve(args[++i]);
  else if (args[i] === '--current') current = path.resolve(args[++i]);
  else if (args[i] === '--out') output = path.resolve(args[++i]);
  else throw new Error('Usage: node tests/terrain-contact-metrics.mjs --baseline directory [--current directory] --out report.json');
}
if (!baseline || !output) throw new Error('Both --baseline and --out are required');
const DT = 1 / 120;

function ledge(api, spec, height, pressure) {
  let active = false, x0 = 0, z0 = 0;
  const terrain = { sample(x, z) {
    const raised = active && x > x0 + .045 && Math.abs(z - z0) < .8, surface = raised ? 'rock' : 'mud';
    return { ...api.surfaceResponse(surface), surface, surfaceDetail: surface,
      height: raised ? height : 0, normal: { x: 0, y: 1, z: 0 }, sink: raised ? 0 : .09, waterDepth: raised ? 0 : .06 };
  } };
  const sim = new api.VehiclePhysics(terrain, spec);
  sim.reset({ x: 0, z: 0, heading: 0 }); sim.setPressure(pressure, pressure);
  for (let frame = 0; frame < 240; frame++) sim.step(DT);
  const before = sim.state.wheels[0]; x0 = before.ground.x; z0 = before.ground.z; active = true;
  sim._collectContacts(DT); sim._publishState();
  const wheel = sim.state.wheels[0];
  return { ledgeHeightM: height, pressurePSI: pressure, deflectionM: wheel.deflection,
    hubRiseM: wheel.ground.y - before.ground.y, contactLengthM: wheel.contactLength,
    surfaceMix: wheel.surfaceMix, surface: wheel.surface,
    frictionCoefficient: sim._wheels[0].data.mu, bearingSinkM: wheel.sink,
    bearingSoftness: sim._wheels[0].data.softness };
}

function mudRoute(api, spec, pressure) {
  const terrain = new api.Terrain(), sim = new api.VehiclePhysics(terrain, spec);
  const spawn = terrain.zones.find(zone => zone.id === 'mud').spawn;
  sim.reset(spawn); sim.setPressure(pressure, pressure);
  sim.setControl('selector', 'N'); sim.setControl('driveMode', '4L');
  sim.setControl('rearLocked', true); sim.setControl('frontLocked', true); sim.setControl('selector', 'D');
  let sink = 0, footprint = 0, support = 0, peakBudget = 0;
  for (let frame = 0; frame < 600; frame++) {
    sim.step(DT, { throttle: .45 });
    for (const wheel of sim.state.wheels) {
      sink += wheel.sink; footprint += wheel.contactArea;
      support += sim._wheels[wheel.index].soilContact?.meanBearing ?? 1;
      if (wheel.load > 1) peakBudget = Math.max(peakBudget,
        Math.hypot(wheel.longitudinalForce, wheel.lateralForce) / (wheel.load * wheel.frictionCoefficient));
    }
  }
  let deepestRut = 0;
  for (const tile of terrain.detailTiles.values()) for (const delta of tile.delta) deepestRut = Math.max(deepestRut, -delta);
  return { pressurePSI: pressure, spawn, seconds: 5, input: { throttle: .45, driveMode: '4L', frontLocked: true, rearLocked: true },
    distanceM: sim.state.odometer, finalSpeedKmh: sim.state.speedKmh, finalPosition: sim.state.position,
    condition: sim.state.damage.condition, meanBearingSinkM: sink / 2400,
    meanFootprintAreaM2: footprint / 2400, meanBearingFraction: support / 2400,
    deepestPhysicalRutM: deepestRut, excavatedM3PerMeter: terrain.soilVolumes.depressed / sim.state.odometer,
    soilVolumesM3: terrain.soilVolumes, peakTireFrictionUtilization: peakBudget };
}

async function measure(root) {
  const api = await loadSimulation(root), spec = api.VEHICLES.find(vehicle => vehicle.id === 'wrangler-rubicon');
  const fixtures = contactFixtures(api).filter(fixture => fixture.moisture === 0);
  const result = { version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
    sourceHashes: api.sourceHashes,
    ledges: [[.12, 37], [.04, 42], [.04, 14], [0, 37]].map(([height, pressure]) => ledge(api, spec, height, pressure)),
    mudRoutes: [37, 18].map(pressure => mudRoute(api, spec, pressure)),
    flatSurfaceBraking: fixtures.map(fixture => {
      const row = measureContact(api, spec, fixture, 'brake');
      return { surface: fixture.detail, initialSpeedMps: 15, distanceM: row.distanceM, stopTimeS: row.stoppedAtS,
        finalSpeedMps: row.finalSpeedMps, lateralM: row.lateralM, condition: row.condition, peakTireFrictionUtilization: row.peakFrictionUtilization };
    }) };
  if (JSON.stringify(runtimeHashes(root)) !== JSON.stringify(api.sourceHashes)) throw new Error('Source changed during measurement: ' + root);
  return result;
}

const report = { measuredAtUTC: new Date().toISOString(),
  method: 'Actual fixed-step VehiclePhysics and Terrain. Analytical ledges isolate bearing contact. Mud routes retain authored relief and live deformation; identical inputs can follow different trajectories. Braking fixtures retain actual map material profiles on deliberately flat geometry.',
  limits: 'These are reproducible software regressions and estimated tire/soil behavior, not measured vehicle or tire validation. Excavated volume per metre and physical rut depth are distinct from the bearing-weighted sink below a tire.',
  harnessSHA256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  baseline: await measure(baseline), current: await measure(current) };
report.flatBrakingComparison = report.current.flatSurfaceBraking.map(row => {
  const previous = report.baseline.flatSurfaceBraking.find(item => item.surface === row.surface);
  return { surface: row.surface, stoppingDistanceChangeM: row.distanceM - previous.distanceM,
    lateralChangeM: row.lateralM - previous.lateralM, stopTimeChangeS: row.stopTimeS - previous.stopTimeS };
});
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, versions: [report.baseline.version, report.current.version],
  largestFlatBrakingDistanceChangeM: Math.max(...report.flatBrakingComparison.map(row => Math.abs(row.stoppingDistanceChangeM))),
  currentMudRoutes: report.current.mudRoutes.map(({ pressurePSI, distanceM, deepestPhysicalRutM, excavatedM3PerMeter }) => ({ pressurePSI, distanceM, deepestPhysicalRutM, excavatedM3PerMeter })) }));
