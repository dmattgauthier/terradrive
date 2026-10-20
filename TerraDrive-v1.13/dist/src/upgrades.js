/**
 * Reversible workshop builds. Factory records are never mutated.
 * Part dimensions change wheel contact, mass/inertia, gearing and chassis
 * geometry; tire parameters are consumed by the same contact solver as stock.
 * Generic package outputs and masses are explicit simulation estimates.
 */
const IN = 0.0254;
const HP_W = 745.6998715822702;
const LBFT_NM = 1.3558179483314;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = value => structuredClone(value);
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
};

export const UPGRADE_SOURCES = deepFreeze([
  { title: 'Mattracks: ground pressure and flotation', url: 'https://mattracks.co/about/faq/', use: 'Broad track contact distributes vehicle load over soft terrain. The game uses generic estimated modules, not a Mattracks product replica or measured snow calibration.', electric: true },
  { title: 'Ford M-9603-B27: 355 hp at 5,500 rpm; 433 lb-ft at 3,500 rpm', url: 'https://performanceparts.ford.com/part/M-9603-B27', use: 'Published Bronco calibration peaks; interpolated curve remains estimated.' },
  { title: 'BFGoodrich: tire selection, sizing and pressure', url: 'https://www.bfgoodrichtires.com/auto/learn/4x4-driving-guide/tire-selection', use: 'Tread/terrain tradeoffs and effects of sizing and inflation; no product-specific friction coefficients are claimed.' },
  { title: 'IGLHAUT: Sprinter 906/907 conversions', url: 'https://iglhaut-allrad.de/de/fahrzeuge/iglhaut-allrad-sprinter-906-907/', use: 'Real example of added driven axles and 2.5:1 reduction. The in-game part-time conversion is a generic build, not an exact IGLHAUT replica.' },
  { title: 'GMC: 2024 HUMMER EV SUV brochure', url: 'https://www.gmc.com/content/dam/gmc/na/us/english/index/about/download-brochures/2024-models/GMTH23CT000-2024-HUMMER-EV-SUV-FO-031924.pdf', use: '3X maximum 830 hp; advertised 11,500 lb-ft at the wheels, Extreme Off-Road Package tires, air suspension and four-wheel steering. Motor curves and simulated upgrades remain estimates.', electric: true },
]);

export const DEFAULT_BUILD = deepFreeze({ tires: 'stock', size: 'stock', engine: 'stock', suspension: 'stock', drivetrain: 'stock', runningGear: 'stock' });
export const UPGRADE_KEYS = Object.freeze(Object.keys(DEFAULT_BUILD));

// Scale the common terrain response, not the previous tire category multiplier.
// These are representative category estimates, not measured brand comparisons.
export const TIRE_PACKAGES = deepFreeze({
  road: {
    name: 'Road touring', type: 'road-performance',
    description: 'Firmer tread response and lower road resistance. Less bite in loose soil.',
    frictionScale: { asphalt: 1.04, dirt: .82, rock: .86, mud: .66, wetland: .72, sand: .80 },
    corneringStiffnessScale: 1.08, longitudinalStiffnessScale: 1.04, relaxationLengthScale: .92,
    radialStiffnessScale: 1.02, rollingResistanceScale: .92, massDelta: -.5,
  },
  allTerrain: {
    name: 'All-terrain', type: 'all-terrain',
    description: 'More bite on hardpack and broken rock, with a small road-efficiency penalty.',
    frictionScale: { asphalt: .97, dirt: 1.06, rock: 1.08, mud: 1.08, wetland: 1.04, sand: 1.08 },
    corneringStiffnessScale: .96, longitudinalStiffnessScale: .98, relaxationLengthScale: 1.06,
    radialStiffnessScale: 1.08, rollingResistanceScale: 1.12, massDelta: 1.5,
  },
  mud: {
    name: 'Open-lug mud terrain', type: 'mud-terrain',
    description: 'Deep, open lugs improve soft-soil traction. More rolling drag and softer road response.',
    frictionScale: { asphalt: .86, dirt: 1.10, rock: 1.12, mud: 1.27, wetland: 1.20, sand: 1.12 },
    corneringStiffnessScale: .86, longitudinalStiffnessScale: .92, relaxationLengthScale: 1.16,
    radialStiffnessScale: 1.12, rollingResistanceScale: 1.30, massDelta: 4,
  },
  sand: {
    name: 'Sand flotation', type: 'sand',
    description: 'Compliant carcass and a broad footprint suit loose sand. Less precise on firm ground.',
    frictionScale: { asphalt: .82, dirt: .92, rock: .90, mud: .94, wetland: .95, sand: 1.20 },
    corneringStiffnessScale: .82, longitudinalStiffnessScale: .90, relaxationLengthScale: 1.18,
    radialStiffnessScale: .88, rollingResistanceScale: 1.18, massDelta: 2,
  },
});

const ENGINE_PACKAGES = deepFreeze({
  'wrangler-rubicon': {
    tune: { name: 'Intake + calibration', hp: 298, torque: 272, hpRPM: 6400, torqueRPM: 4800, mass: 3, description: 'A modest estimated naturally aspirated gain, strongest above the midrange.' },
    power: { name: 'Low-boost supercharger build', hp: 375, torque: 340, hpRPM: 6400, torqueRPM: 4500, mass: 32, description: 'Estimated forced-induction package with supporting cooling and fuel hardware. Added front-end mass and more wheelspin potential.' },
  },
  'bronco-badlands': {
    tune: { name: 'Ford Performance calibration', hp: 355, torque: 433, hpRPM: 5500, torqueRPM: 3500, mass: 0, source: 0, description: 'Published premium-fuel output: 355 hp / 433 lb-ft. The full torque curve is estimated between those peaks.' },
    power: { name: 'Turbo + cooling build', hp: 390, torque: 460, hpRPM: 5500, torqueRPM: 3500, mass: 18, description: 'Estimated turbo/cooling package with stronger midrange. More torque can exceed available tire grip.' },
  },
  'civic-sport': {
    tune: { name: 'Intake + calibration', hp: 164, torque: 143, hpRPM: 6500, torqueRPM: 4200, mass: 2, description: 'Small estimated gain for the naturally aspirated 2.0. Retains the CVT and factory rev limit.' },
    power: { name: 'Cam + intake build', hp: 177, torque: 154, hpRPM: 6500, torqueRPM: 4600, mass: 5, description: 'Estimated naturally aspirated hardware package. Gains arrive higher in the rev range; CVT ratios remain unchanged.' },
  },
  'sprinter-2500': {
    tune: { name: 'Torque calibration', hp: 216, torque: 360, hpRPM: 3800, torqueRPM: 2200, mass: 0, description: 'Estimated diesel calibration with more midrange torque. Stock gearbox and axle ratios remain in use.' },
    power: { name: 'Turbo + cooling build', hp: 235, torque: 390, hpRPM: 3800, torqueRPM: 2300, mass: 22, description: 'Estimated upgraded turbo and cooling package. Added mass, stronger pull and more demand on rear-tire traction.' },
  },
});

function rimDiameter(spec) {
  return spec.rimDiameter || Number((spec.tireSize || '').match(/R(\d+)/)?.[1]) * IN || spec.tireRadius * 1.14;
}

function largerSize(base) {
  if (base.bodyStyle === 'sedan') return { label: '215/60R16 rally wheel', tireSize: '215/60R16', width: .215, rim: 16 * IN, aspect: .60, requiredLift: .02 };
  if (base.bodyStyle === 'van') return { label: 'LT265/75R16', tireSize: 'LT265/75R16', width: .265, rim: 16 * IN, aspect: .75, requiredLift: .025 };
  if (base.bodyStyle === 'hummer') return { label: 'LT315/75R18', tireSize: 'LT315/75R18', width: .315, rim: 18 * IN, aspect: .75, requiredLift: .035 };
  return { label: 'LT315/70R17', tireSize: 'LT315/70R17', width: .315, rim: 17 * IN, aspect: .70, requiredLift: .04 };
}

function suspensionPackage(base, id) {
  if (id === 'road') return { name: 'Road control', lift: base.bodyStyle === 'sedan' ? -.020 : -.015, spring: 1.18, damper: 1.22, antiRoll: 1.20, travel: .92, mass: 6 };
  if (id === 'trail') return { name: 'Trail travel', lift: base.bodyStyle === 'sedan' ? .035 : base.bodyStyle === 'van' ? .060 : .050, spring: .96, damper: 1.12, antiRoll: .88, travel: 1.22, mass: base.bodyStyle === 'van' ? 20 : 14 };
  return { name: 'Factory suspension', lift: 0, spring: 1, damper: 1, antiRoll: 1, travel: 1, mass: 0 };
}

export function upgradeOptions(base) {
  const engine = ENGINE_PACKAGES[base.id] || {};
  const large = largerSize(base), sedan = base.bodyStyle === 'sedan', electric = base.powertrain === 'electric';
  const conversion = base.driveModes.includes('4L')
    ? { id: 'crawl', name: 'Crawler axle gearing', description: `Matched ${base.bodyStyle === 'jeep' ? '4.88' : '5.13'}:1 axle gears. More wheel torque at lower road speed; higher engine rpm for the same selected gear.` }
    : { id: 'conversion', name: sedan ? 'Custom AWD conversion' : 'Dual-range 4×4 conversion', description: sedan ? 'Estimated custom rear driveline and controlled center coupling. Adds mass and driveline loss; FWD / 4A modes, no low range.' : 'Estimated front axle/transfer-case conversion with 2.5:1 low range, a rear locker and an 80 mm minimum lift. Added mass and a higher center of gravity.' };
  return [
    { id: 'runningGear', name: 'Wheels or flotation tracks', description: 'Four independent steerable modules for soft snow', options: [
      { id: 'stock', name: 'Road wheels / tires', description: 'Conventional tires. Use the tire and wheel packages below.' },
      ...(!sedan ? [{ id: 'tracks', name: 'Snow flotation tracks', description: 'Four 1.35 m by 0.48 m ground belts spread the load over powder. Added mass, slower road travel and higher hard-ground drag. The Sprinter requires its 4x4 conversion.' }] : []),
    ] },
    { id: 'tires', name: 'Tire construction', description: 'Tread, carcass response and surface traction', options: [
      { id: 'stock', name: 'Factory tire category', description: `${base.tireType.replaceAll('-', ' ')} · ${base.tireSize}` },
      ...Object.entries(TIRE_PACKAGES).filter(([id]) => !sedan || ['road', 'allTerrain'].includes(id)).map(([id, p]) => ({ id, name: p.name, description: p.description })),
    ] },
    { id: 'size', name: 'Wheels & tire size', description: 'Physical radius, width, footprint and rotational inertia', options: [
      { id: 'stock', name: base.tireSize, description: 'Factory unloaded tire geometry and wheel diameter.' },
      { id: 'large', name: large.label, description: `${sedan ? 'More sidewall on a smaller wheel' : 'Larger diameter and width'}. Requires ${Math.round(large.requiredLift * 1000)} mm or more of installed suspension lift.` },
    ] },
    { id: 'engine', name: electric ? 'Electric drive' : 'Engine', description: electric ? 'Factory three-motor power and wheel-torque envelope' : 'Changes the torque curve delivered through the gearbox', options: [
      { id: 'stock', name: 'Factory output', description: electric ? `${base.powerHP} hp · ${base.wheelTorqueLbFt.toLocaleString()} lb-ft at the wheels. Motor curve is estimated; no unsupported motor tune is offered.` : `${base.powerHP} hp · ${base.torqueLbFt} lb-ft · ${base.engine.redlineRPM.toLocaleString()} rpm limit` },
      ...Object.entries(engine).map(([id, p]) => ({ id, name: p.name, description: p.description, output: `${p.hp} hp / ${p.torque} lb-ft`, evidence: p.source === 0 ? 'Published peaks · estimated curve' : 'Estimated build output' })),
    ] },
    { id: 'suspension', name: 'Suspension', description: 'Ride height, spring rate, damping and wheel travel', options: [
      { id: 'stock', name: 'Factory suspension', description: 'The vehicle’s baseline spring, damper and travel model.' },
      { id: 'road', name: 'Road control', description: 'Lower ride height, firmer springs/dampers and anti-roll bars. Less travel and clearance on obstacles.' },
      { id: 'trail', name: 'Trail travel', description: `Approximately ${Math.round(suspensionPackage(base, 'trail').lift * 1000)} mm lift, longer travel and retuned damping. More articulation, with increased body roll and rollover leverage.` },
    ] },
    { id: 'drivetrain', name: 'Drivetrain', description: electric ? 'Independent front/rear electric drive units and axle control' : 'Driven axles, transfer case, gearing and added hardware', options: [
      { id: 'stock', name: electric ? 'Three-motor e4WD' : 'Factory driveline', description: electric ? `${base.electric.frontReduction.toFixed(2)}:1 front / ${base.electric.rearReduction.toFixed(2)}:1 rear reductions. Front eLocker and rear virtual lock; no transfer case.` : `${base.driveModes.join(' / ')} · ${base.finalDrive.toFixed(3)}:1 final drive` }, ...(electric ? [] : [conversion]),
    ] },
  ];
}

export function normalizeBuild(base, input = {}) {
  const build = {};
  for (const group of upgradeOptions(base)) build[group.id] = group.options.some(option => option.id === input?.[group.id]) ? input[group.id] : 'stock';
  if (build.runningGear === 'tracks') { build.tires = 'stock'; build.size = 'stock'; }
  return build;
}

export function validateBuild(base, input) {
  const build = normalizeBuild(base, input), issues = [];
  const conversionLift = build.drivetrain === 'conversion' && base.bodyStyle === 'van' ? .08 : 0;
  const lift = Math.max(suspensionPackage(base, build.suspension).lift, conversionLift || -Infinity);
  if (build.size === 'large' && lift + 1e-6 < largerSize(base).requiredLift) issues.push('The selected wheel size needs the Trail travel suspension or the lifted 4×4 conversion.');
  if (base.bodyStyle === 'sedan' && build.tires === 'allTerrain' && build.size !== 'large') issues.push('The Civic all-terrain build uses the 16-inch rally wheel package. Select that wheel size and Trail travel.');
  if (conversionLift && build.suspension === 'road') issues.push('The Sprinter 4×4 conversion requires its lifted suspension; Road control cannot be combined with it.');
  if (build.runningGear === 'tracks' && base.bodyStyle === 'van' && build.drivetrain !== 'conversion') issues.push('Fit the Sprinter dual-range 4x4 conversion before installing four track modules.');
  return { ok: issues.length === 0, issues, build };
}

function torqueAt(curve, rpm) {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) if (rpm <= curve[i][0]) {
    const [r0, t0] = curve[i - 1], [r1, t1] = curve[i];
    return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
  }
  return curve.at(-1)[1];
}

function upgradedEngine(base, part) {
  const tq = part.torque * LBFT_NM, hpTorque = part.hp * HP_W / (part.hpRPM * Math.PI / 30);
  const from = [base.engine.idleRPM, base.engine.peakTorqueRPM, base.engine.peakPowerRPM, base.engine.redlineRPM];
  const to = [base.engine.idleRPM, part.torqueRPM, part.hpRPM, base.engine.redlineRPM];
  const points = new Set([to[0], part.torqueRPM, part.hpRPM, to[3]]);
  for (let rpm = Math.ceil(to[0] / 100) * 100; rpm <= to[3]; rpm += 100) points.add(rpm);
  const curve = [...points].sort((a, b) => a - b).map(rpm => {
    let i = 1; while (i < 3 && rpm > to[i]) i++;
    const originalRPM = from[i - 1] + (from[i] - from[i - 1]) * (rpm - to[i - 1]) / Math.max(1, to[i] - to[i - 1]);
    const tqGain = tq / base.torqueNm, hpGain = hpTorque / torqueAt(base.engine.curve, base.engine.peakPowerRPM);
    const gain = rpm < part.torqueRPM
      ? 1 + (tqGain - 1) * (.40 + .60 * clamp((rpm - to[0]) / (part.torqueRPM - to[0]), 0, 1))
      : tqGain + (hpGain - tqGain) * clamp((rpm - part.torqueRPM) / (part.hpRPM - part.torqueRPM), 0, 1);
    let torque = torqueAt(base.engine.curve, originalRPM) * gain;
    if (rpm === part.torqueRPM) torque = tq;
    if (rpm === part.hpRPM) torque = hpTorque;
    return [rpm, Math.min(tq, torque, part.hp * HP_W * (rpm === part.hpRPM ? 1 : .9995) / (rpm * Math.PI / 30))];
  });
  const engine = { ...clone(base.engine), curve, peakTorqueRPM: part.torqueRPM, peakPowerRPM: part.hpRPM,
    curveStatus: part.source === 0 ? 'Ford-published peak ratings; full curve interpolated and estimated' : 'Estimated aftermarket hardware/calibration curve; not a measured dyno trace' };
  delete engine.peakTorqueRPMRange;
  return engine;
}

/** Derive a fresh immutable runtime record from the original factory vehicle. */
export function deriveVehicle(base, input = {}) {
  const build = normalizeBuild(base, input), spec = clone(base), changes = [];
  const stockRim = rimDiameter(base), stockWheelMass = base.wheelMassKG || (base.mass > 2000 ? 27 : 18);
  spec.visualBase = {
    cgHeight: base.cgHeight, clearance: base.clearance, height: base.height,
    tireRadius: base.tireRadius, tireWidth: base.tireWidth, rimDiameter: stockRim,
    tireType: base.tireType,
    mass: base.mass, frontWeightFraction: base.frontWeightFraction,
    stockPSIFront: base.stockPSIFront || base.stockPSI, stockPSIRear: base.stockPSIRear || base.stockPSI,
    suspensionRestLength: base.suspension.restLength, springRate: base.suspension.springRate,
  };
  spec.rimDiameter = stockRim;
  let wheelMass = stockWheelMass, engineMass = 0, conversionMass = 0;
  const tire = TIRE_PACKAGES[build.tires];
  if (tire) {
    const { type, description, massDelta, ...parameters } = tire;
    spec.tireType = type; spec.tire = clone(parameters); wheelMass += massDelta;
    changes.push(tire.name);
  }
  if (build.size === 'large') {
    const size = largerSize(base);
    spec.tireSize = size.tireSize; spec.tireRadius = size.rim / 2 + size.width * size.aspect;
    spec.tireWidth = size.width; spec.rimDiameter = size.rim;
    // Volume proxy for the carcass, with a bounded estimate of wheel/tire mass.
    const ratio = ((spec.tireRadius ** 2 - (size.rim / 2) ** 2) * size.width) / ((base.tireRadius ** 2 - (stockRim / 2) ** 2) * base.tireWidth);
    wheelMass += stockWheelMass * clamp((ratio - 1) * .65, -.12, .28);
    changes.push(size.label);
  }
  if (build.runningGear === 'tracks') {
    // Generic module estimates. Its measured footprint reaches the soil solve;
    // this is not a vehicle speed or buoyancy multiplier.
    spec.tracks = { length: 1.35, width: .48, massPerCornerKG: 95, compliance: .055, speedLimitMps: 12 };
    spec.tireWidth = spec.tracks.width; spec.tireType = 'rubber-tracks';
    spec.tireSize = 'Four flotation track modules'; wheelMass = spec.tracks.massPerCornerKG;
    spec.tire = { frictionScale: { asphalt: .73, dirt: .97, rock: .89, mud: 1.16, wetland: 1.14, sand: 1.17, snow: 1.36 },
      corneringStiffnessScale: .83, longitudinalStiffnessScale: 1.05, relaxationLengthScale: 1.22,
      radialStiffnessScale: 1, rollingResistanceScale: 1.75 };
    changes.push('Four snow flotation tracks');
  }
  spec.wheelMassKG = wheelMass;
  if (tire || build.size === 'large') spec.pressureStatus = 'Simulator comparison baseline retained from the factory setup; replacement-tire load/inflation tables are not calibrated';
  const suspension = suspensionPackage(base, build.suspension);
  let lift = spec.tracks ? Math.max(.05, suspension.lift) : suspension.lift;
  if (build.suspension !== 'stock') changes.push(suspension.name);
  if (build.drivetrain === 'crawl') {
    spec.finalDrive = base.bodyStyle === 'jeep' ? 4.88 : 5.13;
    conversionMass = 4; changes.push('Crawler axle gearing');
  } else if (build.drivetrain === 'conversion' && base.bodyStyle === 'sedan') {
    spec.driveModes = ['FWD', '4A']; spec.defaultMode = '4A';
    spec.drivetrain = { baseAxle: 'front', rearTorqueFraction: .45, efficiency: .82, addedMassKG: 135 };
    conversionMass = 135; changes.push('Custom AWD conversion');
  } else if (build.drivetrain === 'conversion' && base.bodyStyle === 'van') {
    spec.driveModes = ['2H', '4H', '4L']; spec.defaultMode = '2H'; spec.lowRatio = 2.5;
    spec.drivetrain = { baseAxle: 'rear', efficiency: .82, addedMassKG: 215 };
    spec.features.rearLocker = true;
    spec.interlocks = { ...spec.interlocks, lowRangeMaxSpeed: 1.0, lowRangeRequiresNeutral: true,
      lockerMaxSpeed: 2.8, lockerAutoUnlockSpeed: 8.3, lockerAutoRelockSpeed: 2.8,
      rearLockerModes: ['4H', '4L'], frontLockerModes: [], frontLockerRequiresRear: false };
    conversionMass = 215; lift = Math.max(lift, .08); changes.push('Dual-range 4×4 conversion');
  }
  if (spec.tracks) {
    spec.drivetrain = { ...spec.drivetrain, efficiency: (spec.drivetrain?.efficiency ?? .87) * .86 };
    spec.finalDrive *= 1.35;
    if (spec.driveModes.includes('4H')) spec.defaultMode = '4H';
  }
  spec.suspension = { ...clone(base.suspension), lift,
    springRate: base.suspension.springRate * suspension.spring,
    damping: base.suspension.damping * suspension.damper,
    antiRoll: base.suspension.antiRoll * suspension.antiRoll,
    travel: base.suspension.travel * suspension.travel,
    restLength: base.suspension.restLength + lift,
  };
  for (const field of ['travelFront', 'travelRear']) if (base.suspension[field]) spec.suspension[field] = base.suspension[field] * suspension.travel;
  const part = ENGINE_PACKAGES[base.id]?.[build.engine];
  if (part) {
    spec.engine = upgradedEngine(base, part); spec.powerHP = part.hp; spec.torqueLbFt = part.torque; spec.torqueNm = part.torque * LBFT_NM;
    engineMass = part.mass; changes.push(part.name);
  }
  const radialRise = spec.tireRadius - base.tireRadius, bodyRise = radialRise + lift;
  const wheelDelta = (wheelMass - stockWheelMass) * 4;
  const spareDelta = !spec.tracks && ['jeep', 'bronco', 'hummer'].includes(base.bodyStyle) ? wheelMass - stockWheelMass : 0;
  const extraMass = wheelDelta + spareDelta + suspension.mass + conversionMass + engineMass;
  spec.mass = base.mass + extraMass; spec.curbMass = spec.mass;
  const stockMoment = base.mass * (base.cgHeight + radialRise) + (base.mass - 4 * stockWheelMass) * lift;
  spec.cgHeight = (stockMoment + wheelDelta * spec.tireRadius + spareDelta * (1.0 + bodyRise)
    + suspension.mass * (.35 + bodyRise) + engineMass * (.66 + bodyRise) + conversionMass * (.40 + bodyRise)) / spec.mass;
  spec.frontWeightFraction = (base.mass * base.frontWeightFraction + wheelDelta * .5 + spareDelta * .1
    + suspension.mass * .5 + engineMass * .76 + conversionMass * (base.bodyStyle === 'sedan' ? .15 : .65)) / spec.mass;
  if (spec.tracks || build.suspension !== 'stock' || (build.drivetrain === 'conversion' && base.bodyStyle === 'van')) {
    // A selected spring kit includes the free-length/preload needed for its
    // advertised installed height at this build's static axle loads. The
    // physical mounting points stay attached to the original body geometry.
    for (const [field, fraction, original] of [
      ['restLengthFront', spec.frontWeightFraction, base.frontWeightFraction],
      ['restLengthRear', 1 - spec.frontWeightFraction, 1 - base.frontWeightFraction],
    ]) {
      const before = base.mass * 9.81 * original / (2 * base.suspension.springRate);
      const after = spec.mass * 9.81 * fraction / (2 * spec.suspension.springRate);
      spec.suspension[field] = base.suspension.restLength + lift + after - before;
    }
    spec.suspension.restLength = (spec.suspension.restLengthFront + spec.suspension.restLengthRear) / 2;
  }
  spec.height = base.height + bodyRise;
  spec.clearance = base.clearance + bodyRise;
  if (changes.length) {
    spec.factoryTrim = base.trim;
    if (build.drivetrain === 'conversion') spec.trim = base.trim.replace('front-wheel drive', 'custom AWD conversion').replace('RWD', 'custom 4×4 conversion');
    spec.massStatus = 'Estimated installed mass including selected build hardware';
    spec.geometryStatus = 'Nominal installed body height and clearance; actual loaded stance also responds to tire flex and spring sag';
    spec.suspension.parameterStatus = 'Estimated installed spring, damping, anti-roll and travel values';
    spec.notes = [...base.notes.map(note => `Factory reference: ${note}`), ...changes.map(name => `Workshop: ${name}.`), 'Generic build figures, fitment, added masses and tire response are simulation estimates. Factory ratings remain available under Restore factory build.'];
  }
  spec.upgrade = { build, changes, count: changes.length, label: changes.length ? `${changes.length} upgrade${changes.length === 1 ? '' : 's'} fitted` : 'Factory build',
    addedMassKG: extraMass, bodyRise, factoryPowerHP: base.powerHP, factoryTorqueLbFt: base.torqueLbFt,
    evidence: part?.source === 0 ? 'Bronco calibration peak ratings are published; remaining package behavior is estimated.' : 'Generic aftermarket package figures and fitment are simulation estimates.' };
  return deepFreeze(spec);
}

export function buildMetrics(spec) {
  return {
    powerHP: spec.powerHP, torqueNm: spec.torqueNm, massKG: spec.mass,
    wheelTorqueLbFt: spec.wheelTorqueLbFt, motorPeakTorqueNm: spec.electric?.motorPeakTorqueNm,
    frontReduction: spec.electric?.frontReduction, rearReduction: spec.electric?.rearReduction,
    tireDiameterMM: spec.tireRadius * 2000, tireWidthMM: spec.tireWidth * 1000,
    groundAreaM2: spec.tracks ? spec.tracks.length * spec.tracks.width * 4 : spec.mass * 9.81 / (spec.stockPSI * 6894.757293),
    bodyClearanceMM: spec.clearance * 1000, cgHeightMM: spec.cgHeight * 1000,
    travelMM: spec.suspension.travel * 1000, springRate: spec.suspension.springRate,
    damping: spec.suspension.damping, finalDrive: spec.finalDrive,
    crawlRatio: spec.gears[0] * spec.finalDrive * spec.lowRatio,
    wheelForcePerNm: spec.gears[0] * spec.finalDrive * spec.lowRatio * (spec.drivetrain?.efficiency ?? .87) / spec.tireRadius,
  };
}
