import * as CANNON from '../vendor/cannon-es.js';
import { applyImpactDamage, createDamage, damageSnapshot, tirePressureFactor } from './damage.js?v=1.15.0';
import { surfaceResponse } from './surface-response.js?v=1.15.0';
import { electricMotorOutput, electricRearSteer } from './electric-drive.js?v=1.15.0';
import { installChallengeCollisionFilter } from './challenge-collision.js?v=1.15.0';
import { ObstacleContactIndex, projectObstacleFootprint, obstaclePointVelocity } from './obstacle-contact.js?v=1.15.0';
import { stepTreeFall, syncTreeObstacle, applyTreeAngularImpulse, treeContactInverseMass } from './tree-dynamics.js?v=1.15.0';
import { installTreeCollision } from './tree-collision.js?v=1.15.0';
import { installChassisShapes } from './chassis-contact.js?v=1.15.0';
import { createTireObstacleShapes, installTireObstacleCollision } from './tire-obstacle-collision.js?v=1.15.0';

/**
 * A six-degree-of-freedom chassis with four load-bearing suspension contacts.
 * Factory engine peaks and ratios come from vehicles.js. Tire, suspension,
 * differential-controller and soil coefficients are explicit approximations,
 * not measured vehicle/tire calibration or a substitute for factory software.
 *
 * Coordinates: Y up, vehicle +Z forward, +X driver's left / −X right.
 * Wheels: FL, FR, RL, RR. Input steer −1 left / +1 right; wheel steer is
 * physical +Y yaw, so a right turn has a negative steering angle.
 * The wheel rotation solve is implicit: it remains stable at standstill, while
 * open axles deliver equal torque and mechanical locks constrain wheel speeds.
 */
const G = 9.81;
const TAU = Math.PI * 2;
const FIXED_DT = 1 / 120;
const DIRECTION_STOP_SPEED = 0.10; // m/s, below displayed walking speed
const DIRECTION_STOP_HOLD = 0.30; // seconds continuously stopped before shift
const PEDAL_DEADZONE = 0.04;
// GMC documents centered launch staging and significant-turn boost release,
// but publishes no angle calibration. These are estimated road-wheel angles.
const EV_LAUNCH_CENTER_ANGLE = .035;
const EV_LAUNCH_TURN_ANGLE = .16 * .59;
const PSI_TO_PA = 6894.757293;
const EMPTY_OBSTACLES = [];
// Estimated small-slip stiffness per unit static load (N/rad/N and N/slip/N),
// separate from peak friction. Wet pavement can saturate earlier without its
// carcass becoming proportionally softer. These are category calibrations, not
// coefficients measured from the four catalogue tires. See handling-v1.4.md.
const TIRE_RESPONSE = {
  asphalt: { lateral: 13.63, longitudinal: 11.28, loadSensitivity: 0.10, stiffnessExponent: 0.82, relaxation: 1.00 },
  dirt: { lateral: 7.59, longitudinal: 6.21, loadSensitivity: 0.08, stiffnessExponent: 0.86, relaxation: 1.08 },
  rock: { lateral: 10.79, longitudinal: 8.72, loadSensitivity: 0.10, stiffnessExponent: 0.83, relaxation: 1.00 },
  mud: { lateral: 2.38, longitudinal: 1.72, loadSensitivity: 0.04, stiffnessExponent: 0.94, relaxation: 1.22 },
  wetland: { lateral: 2.78, longitudinal: 2.04, loadSensitivity: 0.04, stiffnessExponent: 0.93, relaxation: 1.20 },
  sand: { lateral: 4.70, longitudinal: 3.64, loadSensitivity: 0.06, stiffnessExponent: 0.90, relaxation: 1.16 },
};
// These transparent, estimated response maps are NOT factory controller code.
// Undamaged full pedal retains the catalogue engine's full rated power curve.
const PROGRAMS = {
  Normal: { pedal: 1, cvt: 0.58, shift: 0, slip: 0.18 },
  Eco: { pedal: 1.45, cvt: 0.82, shift: -550, slip: 0.16, mode: '2H' },
  ECON: { pedal: 1.45, cvt: 0.82, shift: -550, slip: 0.16 },
  Sport: { pedal: 0.80, cvt: 0.40, shift: 650, slip: 0.22 },
  Slippery: { pedal: 1.45, cvt: 0.70, shift: -350, slip: 0.10, mode: '4A' },
  'Mud/Ruts': { pedal: 0.92, cvt: 0.55, shift: 350, slip: 0.40, mode: '4H' },
  Sand: { pedal: 0.88, cvt: 0.52, shift: 650, slip: 0.50, mode: '4H' },
  'Rock Crawl': { pedal: 1.65, cvt: 0.65, shift: -350, slip: 0.26, mode: '4L' },
  Baja: { pedal: 0.78, cvt: 0.44, shift: 750, slip: 0.55, mode: '4H' },
  'Off-Road': { pedal: 1.18, cvt: 1, shift: 0, slip: .28 },
  Terrain: { pedal: 1.65, cvt: 1, shift: 0, slip: .28 },
  'Tow/Haul': { pedal: 1.30, cvt: 1, shift: 0, slip: .16 },
  'My Mode': { pedal: 1, cvt: 1, shift: 0, slip: .18 },
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const v3 = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const plain = v => ({ x: v.x, y: v.y, z: v.z });
const approach = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const tireScale = (spec, key, surface) => {
  const value = spec.tire?.[key];
  return clamp(finite(typeof value === 'number' ? value : value?.[surface], 1), 0.15, 3);
};

const CONTACT_FIELDS = ['mu', 'rollingResistance', 'softness', 'maxSink', 'waterDepth', 'snowDepth',
  'moisture', 'hardpackFraction', 'grassFraction', 'gravelFraction', 'compaction', 'churn', 'bodyFriction'];
const RESPONSE_DEFAULTS = { slideRetention: 1, slideStart: 2.5, slideEnd: 7, tractionSlip: 0.16 };
const SOIL_DEFAULTS = { cohesionPa: 0, densityKgM3: 0, frictionAngleRad: 0, lateralScale: 0, rollingResistance: 0 };
const uniformResponseCache = new WeakMap();
const uniformSoilCache = new WeakMap();

function uniformContactCoefficients(source, surface, cache, defaults) {
  let entries = cache.get(source);
  if (!entries) { entries = new Map(); cache.set(source, entries); }
  if (entries.has(surface)) return entries.get(surface);
  const result = {};
  // Preserve the original nine-point summation order bit for bit. Only
  // immutable, identical input objects qualify for reuse; mutable fixtures
  // and mixed boundaries still take the full integration path below.
  for (const [key, value] of Object.entries({ ...defaults, ...source })) if (Number.isFinite(value)) {
    let sum = 0;
    for (const weight of [1, 1, 1, 1, 4, 1, 1, 1, 1]) sum += value * (weight / 12);
    result[key] = sum;
  }
  Object.freeze(result); entries.set(surface, result);
  return result;
}

/** Integrate material properties over the load-bearing footprint. A coplanar
 * boundary shares both materials; terrain below the carcass's available
 * deflection supplies neither traction nor buried-sidewall resistance. */
function footprintMaterial(center, samples) {
  const result = { ...center }, total = samples.reduce((sum, item) => sum + item.weight, 0);
  result.sink = samples.reduce((sum, item) => sum + Math.max(0, finite(item.sample.sink, finite(item.sample.rutDepth))) * item.weight, 0) / total;
  for (const key of CONTACT_FIELDS) {
    let value = 0, weight = 0;
    for (const item of samples) if (Number.isFinite(item.sample[key])) {
      value += item.sample[key] * item.weight; weight += item.weight;
    }
    if (weight) result[key] = value / weight;
  }
  const first = samples[0].sample, surfaceKey = first.surface || 'dirt';
  const uniformMaterial = samples.every(item => (item.sample.surface || 'dirt') === surfaceKey);
  const uniformResponse = uniformMaterial && first.tireResponse && Object.isFrozen(first.tireResponse)
    && samples.every(item => item.sample.tireResponse === first.tireResponse);
  const uniformSoil = uniformMaterial && first.soil && Object.isFrozen(first.soil)
    && samples.every(item => item.sample.soil === first.soil);
  result.tireResponse = uniformResponse ? uniformContactCoefficients(first.tireResponse, surfaceKey, uniformResponseCache,
    { ...RESPONSE_DEFAULTS, ...(TIRE_RESPONSE[surfaceKey] || TIRE_RESPONSE.dirt) }) : {};
  result.soil = uniformSoil ? uniformContactCoefficients(first.soil, surfaceKey, uniformSoilCache, SOIL_DEFAULTS) : {};
  result.surfaceMix = {};
  result.materialMix = {};
  for (const { sample, weight } of samples) {
    const fraction = weight / total, surface = sample.surface || 'dirt';
    const detail = sample.surfaceDetail || (surface === 'dirt' ? 'hardpack' : surface);
    if (surface === 'dirt' && (Number.isFinite(sample.grassFraction) || Number.isFinite(sample.gravelFraction))) {
      const grass = clamp(finite(sample.grassFraction), 0, 1), gravel = clamp(finite(sample.gravelFraction), 0, 1 - grass);
      for (const [key, cover] of [['grass', grass], ['gravel', gravel], ['hardpack', 1 - grass - gravel]]) {
        if (cover > 0) result.surfaceMix[key] = (result.surfaceMix[key] || 0) + cover * fraction;
      }
    } else result.surfaceMix[detail] = (result.surfaceMix[detail] || 0) + fraction;
    result.materialMix[surface] = (result.materialMix[surface] || 0) + fraction;
    if (!uniformResponse) {
      const response = { ...RESPONSE_DEFAULTS, ...(TIRE_RESPONSE[surface] || TIRE_RESPONSE.dirt), ...sample.tireResponse };
      for (const [key, value] of Object.entries(response)) if (Number.isFinite(value)) {
        result.tireResponse[key] = (result.tireResponse[key] || 0) + value * fraction;
      }
    }
    if (!uniformSoil) {
      for (const [key, value] of Object.entries({ ...SOIL_DEFAULTS, ...sample.soil })) if (Number.isFinite(value)) {
        result.soil[key] = (result.soil[key] || 0) + value * fraction;
      }
    }
  }
  const dominant = Object.entries(result.surfaceMix).sort((a, b) => b[1] - a[1])[0];
  result.surfaceDetail = dominant && dominant[1] >= 0.60 ? dominant[0] : 'mixed';
  const material = Object.entries(result.materialMix).sort((a, b) => b[1] - a[1])[0];
  if (material && (result.materialMix[center.surface] || 0) < material[1] - 1e-10) result.surface = material[0];
  return result;
}

// Tread construction affects each contact category, not merely whether a
// surface happens to pass a single softness threshold. These are representative
// construction estimates; no named manufacturer's tire data is implied.
const STOCK_TREAD_RESPONSE = {
  'all-terrain': { asphalt: 0.95, dirt: 1.02, rock: 1.05, mud: 1.13, wetland: 1.08, sand: 1.10 },
  'mud-terrain': { asphalt: 0.88, dirt: 1.02, rock: 1.06, mud: 1.27, wetland: 1.21, sand: 1.04 },
  'highway-commercial': { asphalt: 0.92, dirt: 0.91, rock: 0.89, mud: 0.77, wetland: 0.75, sand: 0.82 },
  'all-season': { asphalt: 1.02, dirt: 0.90, rock: 0.87, mud: 0.76, wetland: 0.73, sand: 0.79 },
};

function contactTreadFactor(spec, data, surface) {
  const mix = data.materialMix || { [surface]: 1 };
  let result = 0;
  for (const [key, weight] of Object.entries(mix)) {
    result += weight * (spec.tire?.frictionScale !== undefined
      ? tireScale(spec, 'frictionScale', key) : STOCK_TREAD_RESPONSE[spec.tireType]?.[key] ?? 1);
  }
  return result;
}

function contactTireScale(spec, key, data, surface) {
  if (typeof spec.tire?.[key] !== 'object') return tireScale(spec, key, surface);
  let result = 0;
  for (const [category, weight] of Object.entries(data?.materialMix || { [surface]: 1 })) {
    result += weight * tireScale(spec, key, category);
  }
  return result;
}

export function engineTorqueAtRPM(spec, rpm) {
  const curve = spec.engine.curve;
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const [r0, t0] = curve[i - 1];
      const [r1, t1] = curve[i];
      return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Small dense solve used for wheel speeds and mechanical constraint torques. */
function linearSolve(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(a[r][k]) > Math.abs(a[pivot][k])) pivot = r;
    if (Math.abs(a[pivot][k]) < 1e-10) return Array(n).fill(0);
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const divisor = a[k][k];
    for (let c = k; c <= n; c++) a[k][c] /= divisor;
    for (let r = 0; r < n; r++) if (r !== k) {
      const f = a[r][k];
      for (let c = k; c <= n; c++) a[r][c] -= f * a[k][c];
    }
  }
  return a.map(row => row[n]);
}

function nullspaceBasis(constraints) {
  if (!constraints.length) return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const a = constraints.map(row => [...row]);
  const pivots = [];
  let row = 0;
  for (let column = 0; column < 4 && row < a.length; column++) {
    const found = a.findIndex((r, i) => i >= row && Math.abs(r[column]) > 1e-9);
    if (found < 0) continue;
    [a[row], a[found]] = [a[found], a[row]];
    const factor = a[row][column];
    for (let j = 0; j < 4; j++) a[row][j] /= factor;
    for (let i = 0; i < a.length; i++) if (i !== row) {
      const f = a[i][column];
      for (let j = 0; j < 4; j++) a[i][j] -= f * a[row][j];
    }
    pivots.push(column);
    row++;
  }
  const free = [0, 1, 2, 3].filter(i => !pivots.includes(i));
  const basis = Array.from({ length: 4 }, () => Array(free.length).fill(0));
  for (let k = 0; k < free.length; k++) {
    basis[free[k]][k] = 1;
    for (let i = 0; i < pivots.length; i++) basis[pivots[i]][k] = -a[i][free[k]];
  }
  return basis;
}

const logCosh = value => {
  const absolute = Math.abs(value);
  return absolute + Math.log1p(Math.exp(-2 * absolute)) - Math.LN2;
};

// A radial slip potential couples braking/drive slip with cornering slip.
// Its longitudinal derivative is monotone, preserving the implicit wheel
// solve, while a locked tire spends its friction opposing the actual slide.
function combinedSlip(longitudinal, lateral) {
  const magnitude = Math.hypot(longitudinal, lateral);
  if (magnitude < 1e-7) return { longitudinal, lateral, derivative: 1, potential: 0 };
  const force = Math.tanh(magnitude), along = longitudinal / magnitude;
  return {
    longitudinal: force * along,
    lateral: force * lateral / magnitude,
    derivative: (1 - force * force) * along * along + force / magnitude * (1 - along * along),
    potential: logCosh(magnitude),
  };
}

export class VehiclePhysics {
  constructor(terrain, spec) {
    this.terrain = terrain;
    this.world = new CANNON.World({ gravity: v3(0, -G, 0) });
    this.world.allowSleep = false;
    this.world.solver.iterations = 10;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.48;
    this.world.defaultContactMaterial.restitution = 0.04;
    this._obstacleBodies = [];
    this._obstacleBodyMap = new Map();
    this._obstacleContacts = new ObstacleContactIndex();
    this._tireObstacleCollision = installTireObstacleCollision(this.world);
    this._treeCollision = installTreeCollision(this.world);
    this._courseBodies = [];
    this._courseSource = null;
    this._obstacleSource = null;
    this._obstacleCount = -1;
    this._obstacleRevision = -1;
    this._damageByVehicle = new Map();
    this._damageFrameByVehicle = new Map();
    this._impacts = [];
    this._nextImpactId = 1;
    this._pendingImpacts = new Map();
    this._impactCooldowns = new Map();
    this._accumulator = 0;
    this._time = 0;
    this._notice = '';
    this._input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this._driverInput = { ...this._input };
    this.setVehicle(spec);
    this._syncCourse();
  }

  setVehicle(spec, spawn = { x: 0, z: -45, heading: 0 }) {
    if (!spec?.engine?.curve || !Array.isArray(spec.gears)) throw new Error('Vehicle specifications are incomplete.');
    if (this.body) this.world.removeBody(this.body);
    this.spec = spec;
    this._electric = spec.transmissionType === 'electric';
    if (!this._damageByVehicle.has(spec.id)) this._damageByVehicle.set(spec.id, createDamage());
    this.damage = this._damageByVehicle.get(spec.id);
    const rimInches = Number((spec.tireSize || '').match(/R(\d+)/)?.[1]);
    this._rimRadius = clamp(spec.rimDiameter ? spec.rimDiameter / 2 : rimInches ? rimInches * 0.0254 / 2 : spec.tireRadius * 0.57,
      spec.tireRadius * 0.25, spec.tireRadius * 0.95);
    const base = spec.visualBase;
    this._bodyRise = base ? spec.tireRadius - base.tireRadius + (spec.suspension.lift || 0) : 0;
    const bodyDatum = this._bodyRise - spec.cgHeight;
    const damageFrame = { y: bodyDatum, z: (0.5 - (spec.frontWeightFraction ?? 0.5)) * spec.wheelbase };
    const oldDamageFrame = this._damageFrameByVehicle.get(spec.id);
    // Dents are published in chassis coordinates, but belong to body panels.
    // A build moves the CG and body datum. Translate the retained profile with
    // that datum, including vehicles whose parts changed while not selected.
    // No severity, depth or condition is altered by installing parts.
    if (oldDamageFrame && this.damage.dents.length
      && (Math.abs(damageFrame.y - oldDamageFrame.y) > 1e-12 || Math.abs(damageFrame.z - oldDamageFrame.z) > 1e-12)) {
      for (const dent of this.damage.dents) {
        dent.point.y += damageFrame.y - oldDamageFrame.y;
        dent.point.z += damageFrame.z - oldDamageFrame.z;
      }
      this.damage.revision++;
    }
    this._damageFrameByVehicle.set(spec.id, damageFrame);
    const length = spec.length || spec.wheelbase + 1.1;
    const width = spec.width || spec.track + 0.25;
    this.body = new CANNON.Body({
      mass: spec.mass,
      linearDamping: 0,
      angularDamping: 0.08,
      allowSleep: false,
      collisionFilterGroup: 1,
      collisionFilterMask: 2,
    });
    installChassisShapes(this.body, spec, bodyDatum);
    this.body.addEventListener('collide', event => this._queueObstacleImpact(event));
    this.world.addBody(this.body);
    this.controls = {
      driveMode: spec.defaultMode || spec.driveModes[0], selector: 'D',
      frontLocked: false, rearLocked: false, swayDisconnected: false,
      tractionControl: !!spec.features.tractionControl, abs: !!spec.features.abs,
      hillDescent: false, engineOn: !this.damage.disabled, offRoadPlus: false,
      trailControl: false, trailTurnAssist: false, trailOnePedal: false,
      terrainProgram: 'Normal',
      rearSteer: 'auto', rideHeight: 'normal', onePedal: false, regenOnDemand: false, wattsToFreedom: false,
      trailSpeedKmh: 7,
      frontPSI: spec.stockPSIFront || spec.stockPSI,
      rearPSI: spec.stockPSIRear || spec.stockPSI,
    };
    this._requests = { frontLocked: false, rearLocked: false, swayDisconnected: false };
    this._manualReverse = false;
    this._gear = 0;
    this._ratio = spec.transmissionType === 'cvt' ? spec.cvtRatios.max : spec.gears[0];
    this._shiftCooldown = 0;
    this._shiftTimer = 0;
    this._rpm = spec.engine.idleRPM;
    this._steer = 0;
    this._engineTorque = 0;
    this._requestedEngineTorque = 0;
    this._tcTorqueScale = 1;
    this._tcMeasuredSlip = 0;
    this._tcSlipTarget = PROGRAMS.Normal.slip;
    this._odometer = 0;
    this._stuckTime = 0;
    this._airSuspensionLift = 0; this._rearSteer = 0; this._crabOverSpeed = 0;
    this._launchPhase = 'off'; this._launchTime = 0; this._electricThrottle = 0; this._evOutput = null;
    this._groundedWheels = 0;
    const f = spec.frontWeightFraction || 0.5;
    this._wheels = Array.from({ length: 4 }, (_, i) => {
      const front = i < 2;
      const staticLoad = spec.mass * G * (front ? f : 1 - f) / 2;
      const psi = front ? this.controls.frontPSI : this.controls.rearPSI;
      const radius = this._loadedRadius(staticLoad, psi);
      const rest = (front ? spec.suspension.restLengthFront : spec.suspension.restLengthRear) ?? spec.suspension.restLength;
      const spring = spec.suspension.springRate;
      const track = (front ? spec.trackFront : spec.trackRear) || spec.track;
      const staticCompression = staticLoad / spring;
      let mountHeight = radius + rest - staticCompression - spec.cgHeight;
      if (base) {
        const baseLoad = base.mass * G * (front ? base.frontWeightFraction : 1 - base.frontWeightFraction) / 2;
        const basePSI = front ? base.stockPSIFront : base.stockPSIRear;
        const baseRim = base.rimDiameter ? base.rimDiameter / 2 : base.tireRadius * 0.57;
        const baseDeflection = clamp(baseLoad / (22000 + 2.5 * basePSI * PSI_TO_PA * base.tireWidth),
          0, (base.tireRadius - baseRim) * 0.65);
        // Mounts are fixed to the original body. New rest length creates the
        // lift, while new spring rate / mass produces its own equilibrium sag.
        mountHeight = base.tireRadius - baseDeflection + base.suspensionRestLength
          - baseLoad / base.springRate + bodyDatum;
      }
      const wheelMass = spec.wheelMassKG ?? spec.tire?.wheelMassKG ?? (spec.mass > 2000 ? 27 : 18);
      return {
        index: i, front, left: i % 2 === 0,
        mount: v3((i % 2 === 0 ? 1 : -1) * track / 2,
          mountHeight,
          front ? spec.wheelbase * (1 - f) : -spec.wheelbase * f),
        mountWorld: v3(), down: v3(), position: v3(), ground: v3(), normal: v3(0, 1, 0),
        forward: v3(0, 0, 1), right: v3(-1, 0, 0), velocity: v3(), supportVelocity: v3(), relativeVelocity: v3(),
        radius, unloadedRadius: spec.tireRadius, deflection: spec.tireRadius - radius,
        contactLength: 0, contactWidth: spec.tireWidth, contactProfile: [], soilContact: null, airTime: 0,
        staticLoad, referenceLoad: base ? base.mass * G * (front ? base.frontWeightFraction : 1 - base.frontWeightFraction) / 2 : staticLoad,
        load: staticLoad, length: rest - staticCompression,
        rest, baseRest: rest, compression: staticCompression, compressionRatio: 0, steer: 0, complianceSteer: 0,
        omega: 0, rotation: 0, slip: 0, lateralSlip: 0, speedLong: 0, speedLat: 0,
        longDeflection: 0, latDeflection: 0, relaxedLateralSlip: 0, relaxationLength: 0.18, patchLength: 0.18,
        contact: true, surface: 'dirt', sink: 0, mu: 0.7, capacity: 0,
        lateralForce: 0, lateralPhase: 0, longitudinalForce: 0, brakeTorque: 0, driveTorque: 0,
        soilLongitudinalForce: 0, soilLateralForce: 0, soilResistance: 0, peakMu: 0.7, slidingGripRetention: 1,
        rollingTorque: 0, inertia: Math.max(0.7, wheelMass * spec.tireRadius ** 2 * 0.72),
        contactArea: staticLoad / (psi * PSI_TO_PA), effectivePSI: psi,
        tcActive: false, absActive: false, data: null,
      };
    });
    const midpoint = spec.wheelbase * (0.5 - f);
    this._updateTireObstacleShapes = createTireObstacleShapes(this.body, this._wheels, spec);
    this._bodyContactPoints = [];
    for (const x of [-width * 0.40, width * 0.40]) {
      for (const z of [-length * 0.39 + midpoint, midpoint, length * 0.39 + midpoint]) {
        // The heightfield must see the same open approach/departure volume
        // as the rigid obstacle colliders. A low imaginary floor under the
        // bumper otherwise catches a step before the tire can reach it.
        const part = this.body.terraChassisEnvelope.find(section => z >= section.from && z <= section.to);
        this._bodyContactPoints.push(v3(x, part?.bottom ?? (base?.clearance ?? spec.clearance) + bodyDatum, z));
      }
      for (const z of [-length * 0.34 + midpoint, length * 0.34 + midpoint]) {
        this._bodyContactPoints.push(v3(x, (base?.height ?? spec.height) + bodyDatum, z));
      }
    }
    this.reset(spawn);
    return this.state;
  }

  _loadedRadius(load, psi, data = null, surface = undefined) {
    if (this.spec.tracks) return this.spec.tireRadius;
    // Pressure stiffens the carcass, with a residual structural spring and a
    // rim clearance limit. These coefficients are estimates, not tire tests.
    const verticalStiffness = (22000 + 2.5 * Math.max(2, psi) * PSI_TO_PA * this.spec.tireWidth)
      * contactTireScale(this.spec, 'radialStiffnessScale', data, surface);
    const sidewall = this.spec.tireRadius - this._rimRadius;
    const deflection = clamp(load / verticalStiffness, 0, sidewall * 0.65);
    return this.spec.tireRadius - deflection;
  }

  /** Install a derived build on a stopped vehicle without erasing its history. */
  reconfigureVehicle(spec) {
    if (!spec || spec.id !== this.spec.id) return { ok: false, message: 'Install parts on the selected vehicle.' };
    if (this.body.velocity.length() >= 0.35 || this.body.angularVelocity.length() >= 0.35) {
      return { ok: false, message: 'Stop the vehicle before installing parts.' };
    }
    if (!spec.engine?.curve || !Array.isArray(spec.gears)) return { ok: false, message: 'Vehicle specifications are incomplete.' };
    const previous = { ...this.controls }, requests = { ...this._requests };
    const odometer = this._odometer, manualReverse = this._manualReverse;
    const tireChanged = spec.tireSize !== this.spec.tireSize || spec.tireType !== this.spec.tireType;
    const forward = this.body.quaternion.vmult(v3(0, 0, 1));
    const spawn = { x: this.body.position.x, z: this.body.position.z, heading: Math.atan2(forward.x, forward.z) };
    this._suspendPublish = true;
    try {
      this.setVehicle(spec, spawn);
      this.controls.selector = 'N';
      if (previous.terrainProgram === 'Normal' || spec.factoryPrograms?.includes(previous.terrainProgram)) {
        this.setControl('terrainProgram', previous.terrainProgram);
      }
      if (spec.driveModes.includes(previous.driveMode)) this.setControl('driveMode', previous.driveMode);
      for (const name of ['tractionControl', 'abs', 'offRoadPlus', 'hillDescent', 'trailControl', 'trailTurnAssist', 'trailOnePedal']) {
        this.setControl(name, previous[name]);
      }
      if (this._electric) {
        for (const name of ['onePedal', 'regenOnDemand', 'rideHeight', 'rearSteer']) this.setControl(name, previous[name]);
      }
      this.setControl('trailSpeedKmh', previous.trailSpeedKmh);
      if (requests.rearLocked) this.setControl('rearLocked', true);
      if (requests.frontLocked) this.setControl('frontLocked', true);
      if (requests.swayDisconnected) this.setControl('swayDisconnected', true);
      if (!tireChanged) this.setPressure(previous.frontPSI, previous.rearPSI);
      this.setControl('selector', previous.selector);
      this._manualReverse = this.controls.selector === 'R' && manualReverse;
      this.controls.engineOn = previous.engineOn && !this.damage.disabled;
      this._rpm = this.controls.engineOn ? spec.engine.idleRPM : 0;
      this._odometer = odometer;
      this._notice = tireChanged ? 'Build installed · tire pressure reset for the fitted tires.' : 'Build installed · vehicle condition and tire setup retained.';
    } finally {
      this._suspendPublish = false;
      this._publishState();
    }
    return { ok: true, message: this._notice };
  }

  getDamage(vehicleId = this.spec.id) {
    return damageSnapshot(this._damageByVehicle.get(vehicleId) || createDamage());
  }

  repair() {
    if (this.body.velocity.length() >= 0.50 || this.body.angularVelocity.length() > 0.35) {
      return { ok: false, message: 'Stop the vehicle before repairing it.' };
    }
    this._clearDamage();
    this.controls.engineOn = true;
    this._syncObstacles();
    this._syncCourse();
    this._collectContacts(FIXED_DT);
    this._notice = 'Vehicle repaired · body, engine, suspension and tires restored.';
    this._publishState();
    return { ok: true, message: this._notice };
  }

  restart(spawn = this._spawn) {
    this._clearDamage();
    this._impacts.length = 0;
    this.setVehicle(this.spec, spawn);
    this._notice = 'Run restarted · selected vehicle repaired.';
    this._publishState();
    return this.state;
  }

  _clearDamage() {
    this.damage = createDamage(this.damage.revision + 1);
    this._damageByVehicle.set(this.spec.id, this.damage);
    this._pendingImpacts.clear();
    this._impactCooldowns.clear();
    this._damageGraceUntil = this._time + 0.35;
  }

  reset(spawn = this._spawn || { x: 0, z: -45, heading: 0 }) {
    this._spawn = { x: finite(spawn.x), z: finite(spawn.z), heading: finite(spawn.heading) };
    const { x, z, heading } = this._spawn;
    const ground = this.terrain.sample(x, z);
    this.body.position.set(x, ground.height + this.spec.cgHeight + (this._airSuspensionLift || 0) + 0.025, z);
    this.body.quaternion.setFromAxisAngle(v3(0, 1, 0), heading);
    // Conform initial chassis to broad terrain slope to avoid a suspension drop.
    const normal = v3(ground.normal?.x || 0, ground.normal?.y ?? 1, ground.normal?.z || 0);
    normal.normalize();
    if (normal.y > 0.55) {
      const tilt = new CANNON.Quaternion();
      tilt.setFromVectors(v3(0, 1, 0), normal);
      tilt.mult(this.body.quaternion, this.body.quaternion);
    }
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.force.setZero();
    this.body.torque.setZero();
    this.body.aabbNeedsUpdate = true;
    this.body.wakeUp();
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.previousQuaternion.copy(this.body.quaternion);
    this.body.interpolatedQuaternion.copy(this.body.quaternion);
    for (const wheel of this._wheels) {
      wheel.omega = wheel.rotation = wheel.slip = wheel.lateralSlip = wheel.complianceSteer = 0;
      wheel.longDeflection = wheel.latDeflection = wheel.relaxedLateralSlip = 0;
      wheel.lateralForce = wheel.longitudinalForce = wheel.driveTorque = wheel.brakeTorque = 0;
      wheel.soilLongitudinalForce = wheel.soilLateralForce = wheel.soilResistance = 0; wheel.slidingGripRetention = 1;
      wheel.load = wheel.staticLoad;
      wheel.compression = wheel.staticLoad / this.spec.suspension.springRate;
      wheel.length = wheel.rest - wheel.compression;
      wheel.contact = true;
      wheel.airTime = 0;
    }
    this._accumulator = 0;
    this._stuckTime = 0;
    this._steer = 0;
    this._steeringLimit = 0.59;
    this._steeringLimited = false;
    this._steeringMode = 'direct-analog';
    this._steeringRate = 5.5;
    this._steeringSlew = null;
    this._gear = 0;
    this._shiftTimer = this._shiftCooldown = 0;
    this._rpm = this.controls.engineOn ? this.spec.engine.idleRPM : 0;
    this._tcTorqueScale = 1;
    this._tcMeasuredSlip = 0;
    this._tcSlipTarget = PROGRAMS.Normal.slip;
    this._notice = '';
    this._directionTarget = null;
    this._directionStopTime = 0;
    if (this._electric) { this.controls.wattsToFreedom = false; this.controls.regenOnDemand = false; this._launchPhase = 'off'; this._electricThrottle = 0; }
    this._driverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this._parkingBrake = { active: false, mode: 'released', label: 'Parking brake released', wheels: [false, false, false, false] };
    this._pendingImpacts.clear();
    this._damageGraceUntil = this._time + 0.65;
    if (this.damage.disabled) this.controls.engineOn = false;
    this._lastPosition = this.body.position.clone();
    // Scenery restoration can remove fallen timber before a public reset or
    // vehicle change. Publish only contacts from the current obstacle set.
    this._syncObstacles();
    this._syncCourse();
    this._collectContacts(FIXED_DT);
    this._publishState();
    return this.state;
  }

  setPressure(front, rear = front) {
    if (typeof front === 'object') {
      rear = front.rear ?? front.rearPSI ?? front[2] ?? front.front ?? front.frontPSI ?? front[0];
      front = front.front ?? front.frontPSI ?? front[0];
    }
    if (!Number.isFinite(Number(front)) || !Number.isFinite(Number(rear))) return { ok: false, message: 'Enter front and rear pressure in PSI.' };
    this.controls.frontPSI = clamp(Number(front), 8, 80);
    this.controls.rearPSI = clamp(Number(rear), 8, 80);
    this._publishState();
    return { ok: true, message: `Tire setup: ${this.controls.frontPSI.toFixed(0)} PSI front / ${this.controls.rearPSI.toFixed(0)} PSI rear.` };
  }

  setControl(name, value) {
    const c = this.controls;
    const spec = this.spec;
    const rules = spec.interlocks || {};
    const speed = this.body.velocity.length();
    const fail = message => ({ ok: false, message });
    const success = message => { this._notice = message; this._publishState(); return { ok: true, message }; };
    if (this._electric) {
      const result = this._setElectricControl(name, value, speed);
      if (result) return result.ok ? success(result.message) : result;
    }
    if (name === 'frontPSI') return this.setPressure(Number(value), c.rearPSI);
    if (name === 'rearPSI') return this.setPressure(c.frontPSI, Number(value));
    if (name === 'selector') {
      if (!['P', 'R', 'N', 'D'].includes(value)) return fail('Use Park, Reverse, Neutral or Drive.');
      if (value === 'P' && speed > 0.8) return fail('Stop the vehicle before selecting Park.');
      const forwardSpeed = this.body.velocity.dot(this.body.quaternion.vmult(v3(0, 0, 1)));
      if ((value === 'R' && forwardSpeed > DIRECTION_STOP_SPEED) || (value === 'D' && forwardSpeed < -DIRECTION_STOP_SPEED)) return fail('Stop before changing driving direction.');
      c.selector = value;
      if (this._electric && value !== 'D') { c.wattsToFreedom = false; this._launchPhase = 'off'; this._launchTime = 0; }
      if (['P', 'N'].includes(value)) { this._tcTorqueScale = 1; this._tcMeasuredSlip = 0; }
      // Explicit R keeps the familiar accelerator-in-Reverse controls. F / D
      // returns to the default hold-brake-to-reverse control scheme.
      this._manualReverse = value === 'R';
      this._directionTarget = null;
      this._directionStopTime = 0;
      this._gear = 0;
      return success({ P: 'Park selected.', R: 'Manual Reverse selected · accelerator backs up, brake stops. Select Drive for automatic pedal direction.', N: 'Neutral selected. Transfer range can now be shifted below walking speed.', D: 'Drive selected · hold brake after stopping to reverse.' }[value]);
    }
    if (name === 'terrainProgram') {
      if (value !== 'Normal' && !(spec.factoryPrograms || []).includes(value)) return fail(`This vehicle configuration does not have the ${value} program.`);
      if (value === 'Off Road+') {
        const outcome = this.setControl('offRoadPlus', true);
        if (!outcome.ok) return outcome;
        c.terrainProgram = value;
        return success('Off Road+ response map selected. Factory software is approximated.');
      }
      const program = PROGRAMS[value];
      if (!program) return fail('That driving program has not been modeled.');
      const mode = spec.brand === 'Ford' && value === 'Normal' ? '2H' : program.mode;
      if (mode && spec.driveModes.includes(mode) && mode !== c.driveMode) {
        const outcome = this.setControl('driveMode', mode);
        if (!outcome.ok) return fail(`${value}: ${outcome.message}`);
      }
      c.terrainProgram = value;
      if (this._electric) {
        c.wattsToFreedom = false; this._launchPhase = 'off';
        if (value !== 'Terrain') { c.frontLocked = this._requests.frontLocked = false; c.abs = !!spec.features.abs; if (c.rideHeight === 'extract') c.rideHeight = 'increased'; }
        if (value === 'Terrain' || value === 'Off-Road') c.rideHeight = 'increased';
      }
      return success(`${value} response map selected${mode ? ` · ${c.driveMode}` : ''}.${this._electric ? ' Electric drive and chassis settings updated.' : ' Full engine power remains available at full pedal.'}${c.selector === 'N' ? ' Select Drive to move.' : ''}`);
    }
    if (name === 'driveMode') {
      if (!spec.driveModes.includes(value)) return fail(`${spec.name} does not have ${value}.`);
      const crossingLowRange = (value === '4L') !== (c.driveMode === '4L');
      if (crossingLowRange && speed > (rules.lowRangeMaxSpeed ?? 1.34)) return fail('Slow below 3 mph (5 km/h) to shift transfer range.');
      if (crossingLowRange && rules.lowRangeRequiresNeutral && c.selector !== 'N') return fail('Select Neutral before shifting into or out of 4 Low.');
      c.driveMode = value;
      this._gear = 0;
      for (const side of ['front', 'rear']) {
        if (!(rules[`${side}LockerModes`] || []).includes(value)) c[`${side}Locked`] = this._requests[`${side}Locked`] = false;
      }
      if (!(rules.swayModes || []).includes(value)) c.swayDisconnected = this._requests.swayDisconnected = false;
      if (!['4H', '4L'].includes(value)) c.offRoadPlus = c.trailTurnAssist = c.trailOnePedal = false;
      if (value !== '4L' && spec.brand === 'Jeep') c.hillDescent = false;
      return success(`${value} selected${value === '4L' ? ` · ${spec.lowRatio.toFixed(2)}:1 transfer reduction` : ''}.`);
    }
    if (name === 'frontLocked' || name === 'rearLocked') {
      const front = name === 'frontLocked';
      const feature = front ? 'frontLocker' : 'rearLocker';
      if (!spec.features[feature]) return fail(`This configuration has an open ${front ? 'front' : 'rear'} differential.`);
      value = !!value;
      if (value && front && rules.frontLockerPrograms && !rules.frontLockerPrograms.includes(c.terrainProgram)) return fail('Select Terrain mode before locking the front axle.');
      if (value && !(rules[front ? 'frontLockerModes' : 'rearLockerModes'] || []).includes(c.driveMode)) return fail(`The ${front ? 'front' : 'rear'} locker requires ${(rules[front ? 'frontLockerModes' : 'rearLockerModes'] || ['4L']).join(' or ')}.`);
      const unlimitedRear = !front && ((rules.rearLockerUnlimitedModes || []).includes(c.driveMode) || (rules.rearLockerUnlimitedPrograms || []).includes(c.terrainProgram));
      const lockerLimit = front ? rules.frontLockerMaxSpeed ?? rules.lockerMaxSpeed ?? 4.47 : rules.rearLockerProgramMaxSpeed?.[c.terrainProgram] ?? rules.lockerMaxSpeed ?? 4.47;
      if (value && !unlimitedRear && speed > lockerLimit) return fail('Slow down before engaging the differential lock.');
      if (value && front && rules.frontLockerRequiresRear && !c.rearLocked) {
        if (this._electric) c.rearLocked = this._requests.rearLocked = true;
        else return fail('Lock the rear differential before engaging the front locker.');
      }
      if (value && !front && c.trailTurnAssist) return fail('Turn off Trail Turn Assist before locking the rear differential.');
      c[name] = this._requests[name] = value;
      if (!value && !front && rules.frontLockerRequiresRear) c.frontLocked = this._requests.frontLocked = false;
      if (rules.frontLockerDisablesABS) c.abs = !!spec.features.abs && !c.frontLocked;
      return success(`${front ? 'Front' : 'Rear'} differential ${value ? 'locked' : 'open'}.`);
    }
    if (name === 'swayDisconnected') {
      if (!spec.features.swayDisconnect) return fail('This vehicle has no factory stabilizer disconnect.');
      value = !!value;
      if (value && !(rules.swayModes || []).includes(c.driveMode)) return fail('Select 4 High or 4 Low before disconnecting the front stabilizer.');
      if (value && speed > (rules.swayMaxSpeed ?? 8)) return fail('Slow below the stabilizer disconnect speed limit.');
      c[name] = this._requests[name] = value;
      return success(`Front stabilizer ${value ? 'disconnected for articulation' : 'connected'}.`);
    }
    if (name === 'engineOn') {
      if (value && this.damage.disabled) return fail('Vehicle disabled by damage · repair it or restart the run.');
      c.engineOn = !!value;
      if (!c.engineOn) { this._tcTorqueScale = 1; this._tcMeasuredSlip = 0; }
      if (!c.engineOn && this._electric) { c.wattsToFreedom = false; this._launchPhase = 'off'; c.regenOnDemand = false; }
      return success(`${this._electric ? 'Electric drive' : 'Engine'} ${c.engineOn ? 'ready' : 'stopped'}.`);
    }
    if (name === 'trailSpeedKmh') {
      c.trailSpeedKmh = clamp(finite(Number(value), 7), 2, 20);
      return success(`Trail speed set to ${c.trailSpeedKmh.toFixed(0)} km/h.`);
    }
    const features = {
      tractionControl: 'tractionControl', abs: 'abs', hillDescent: 'hillDescent',
      offRoadPlus: 'offRoadPlus', trailControl: 'trailControl',
      trailTurnAssist: 'trailTurnAssist', trailOnePedal: 'trailOnePedal',
    };
    if (name in features) {
      if (!spec.features[features[name]]) return fail('This vehicle configuration does not have that feature.');
      value = !!value;
      if (value && name === 'hillDescent' && spec.brand === 'Jeep' && c.driveMode !== '4L') return fail('Wrangler Hill Descent Control requires 4 Low.');
      if (value && ['offRoadPlus', 'trailTurnAssist', 'trailOnePedal'].includes(name) && !['4H', '4L'].includes(c.driveMode)) return fail('Select 4 High or 4 Low before activating this off-road feature.');
      if (value && name === 'trailTurnAssist' && c.rearLocked) return fail('Unlock the rear differential before enabling Trail Turn Assist.');
      if (value && ['hillDescent', 'trailControl', 'trailOnePedal'].includes(name) && speed > 12) return fail('Slow down before enabling low-speed driving assistance.');
      // Cruise owns the throttle; lift-off braking belongs to one-pedal drive.
      // Their control laws must never command acceleration and braking together.
      if (value && name === 'trailControl') c.trailOnePedal = false;
      if (value && name === 'trailOnePedal') c.trailControl = false;
      c[name] = value;
      if (name === 'tractionControl' && !value) { this._tcTorqueScale = 1; this._tcMeasuredSlip = 0; }
      return success(`${name.replace(/([A-Z])/g, ' $1')} ${value ? 'on' : 'off'}.`);
    }
    return fail(`Unknown vehicle control: ${name}.`);
  }

  _setElectricControl(name, value, speed) {
    const c = this.controls, spec = this.spec, rules = spec.interlocks;
    const fail = message => ({ ok: false, message }), ok = message => ({ ok: true, message });
    if (name === 'rearSteer') {
      if (!spec.features.fourWheelSteer || !['auto', 'off', 'crab'].includes(value)) return fail('Choose Auto, Off or CrabWalk rear steering.');
      if (value !== 'auto' && speed > rules.rearSteerChangeMaxSpeed) return fail('Stop before changing rear steering.');
      if (value !== 'auto' && Math.abs(this._steer) > .025) return fail('Center the steering before changing rear-steer mode.');
      if (value === 'off' && rules.rearSteerOffRequiresNeutral && !['P', 'N'].includes(c.selector)) return fail('Select Park or Neutral before switching rear steering off.');
      if (value === 'crab' && c.wattsToFreedom) return fail('Exit Watts to Freedom before selecting CrabWalk.');
      c.rearSteer = value; this._crabOverSpeed = 0;
      return ok(value === 'crab' ? 'CrabWalk selected · four parallel wheel angles below 20 mph.' : `Rear steering ${value === 'auto' ? 'automatic · opposite phase at low speed' : 'off'}.`);
    }
    if (name === 'rideHeight') {
      if (!Object.hasOwn(spec.airSuspension.heights, value)) return fail('Choose Normal, Increased or Extract ride height.');
      if (c.wattsToFreedom) return fail('Exit Watts to Freedom before changing ride height.');
      if (value === 'extract' && !rules.extractPrograms.includes(c.terrainProgram)) return fail('Extract Mode requires Terrain mode.');
      if (value === 'extract' && (speed > rules.extractMaxSpeed || Math.abs(this._steer) > .035)) return fail('Slow below 12 mph and center the wheels for Extract Mode.');
      c.rideHeight = value;
      return ok(`Air suspension: ${value} · height changes progressively${value === 'extract' ? ' · 12 mph limit' : ''}.`);
    }
    if (name === 'onePedal' || name === 'regenOnDemand') {
      if (!spec.features[name]) return fail('This vehicle does not have that feature.');
      c[name] = !!value;
      return ok(`${name === 'onePedal' ? 'One-Pedal Driving' : 'Regen on Demand'} ${value ? 'active' : 'off'}.`);
    }
    if (name === 'wattsToFreedom') {
      if (value && (!c.engineOn || speed > .15 || this._groundedWheels < 4)) return fail('Stop with all four wheels on the ground and the drive powered on.');
      if (value && (c.rearSteer === 'crab' || c.frontLocked || c.rearLocked || c.selector !== 'D')) return fail('Select Drive, unlock both axles and exit CrabWalk before preparing a launch.');
      c.wattsToFreedom = !!value; this._launchPhase = value ? 'lowering' : 'off'; this._launchTime = 0;
      if (value) { c.terrainProgram = 'Normal'; c.rideHeight = 'normal'; }
      return ok(value ? 'Watts to Freedom preparing · suspension lowering. Then hold brake and accelerator; release brake to launch.' : 'Watts to Freedom off · normal suspension height returning.');
    }
    return null;
  }

  _updateElectricSystems(dt, speed) {
    if (!this._electric) return;
    const c = this.controls, spec = this.spec, rules = spec.interlocks;
    if (c.rearSteer === 'crab') {
      this._crabOverSpeed = speed > rules.crabWalkAutoExitSpeed ? this._crabOverSpeed + dt : 0;
      if (this._crabOverSpeed >= rules.crabWalkAutoExitSeconds) { c.rearSteer = 'auto'; this._notice = 'CrabWalk exited above its speed limit · automatic rear steering restored.'; }
    }
    for (const axle of ['front', 'rear']) {
      const name = axle + 'Locked';
      const permitted = axle === 'front' ? rules.frontLockerPrograms.includes(c.terrainProgram) : true;
      const limit = axle === 'front' ? rules.frontLockerMaxSpeed : rules.rearLockerProgramMaxSpeed[c.terrainProgram] ?? rules.lockerAutoUnlockSpeed;
      if (!permitted || speed > limit) c[name] = false;
      else if (this._requests[name] && speed < limit * .85 && (axle !== 'front' || c.rearLocked)) c[name] = true;
    }
    c.abs = !!spec.features.abs && !(rules.frontLockerDisablesABS && c.frontLocked);
    const target = c.wattsToFreedom ? -.0508 : spec.airSuspension.heights[c.rideHeight] || 0;
    const rate = spec.airSuspension.responseRate || .025;
    this._airSuspensionLift += clamp(target - this._airSuspensionLift, -rate * dt, rate * dt);
    for (const wheel of this._wheels) wheel.rest = wheel.baseRest + this._airSuspensionLift;
    if (c.wattsToFreedom && this._launchPhase === 'lowering' && Math.abs(target - this._airSuspensionLift) < .003) this._launchPhase = 'brake';
  }

  _electricLaunchInput(input, speed, dt) {
    if (!this.controls.wattsToFreedom) return false;
    if (this.controls.selector !== 'D' || !this.controls.engineOn || this.controls.frontLocked || this.controls.rearLocked || this.controls.rearSteer === 'crab') {
      this.controls.wattsToFreedom = false; this._launchPhase = 'off'; this._launchTime = 0; return false;
    }
    const raw = this._input;
    const canStage = speed < .25 && this._groundedWheels === 4
      && Math.abs(this._steer) <= EV_LAUNCH_CENTER_ANGLE && !raw.handbrake;
    if (['brake', 'standby'].includes(this._launchPhase) && raw.brake > .7 && canStage) this._launchPhase = 'throttle';
    if (this._launchPhase === 'throttle') {
      if (!canStage || raw.brake <= .7) this._launchPhase = 'standby';
      else if (raw.throttle > .95) this._launchPhase = 'release';
    }
    if (this._launchPhase === 'release') {
      if (!canStage || raw.throttle < .7) this._launchPhase = 'standby';
      else if (raw.brake < .05) { this._launchPhase = 'launch'; this._launchTime = 0; }
    }
    if (this._launchPhase === 'launch') {
      this._launchTime += dt;
      // Keyboard/touch steering starts as +/-1 before rack smoothing. A key
      // tap is not a full steering angle. Significant actual steering ends
      // the temporary peak envelope; standby retains ordinary pedal control.
      if (this._launchTime > 9 || Math.abs(this._steer) > EV_LAUNCH_TURN_ANGLE
        || raw.brake > .12 || raw.handbrake || raw.throttle < .05 || this._groundedWheels < 3) this._launchPhase = 'standby';
    }
    if (this._launchPhase !== 'launch' && this._launchPhase !== 'standby') {
      input.throttle = 0; input.brake = Math.max(input.brake, raw.brake, speed < .4 ? .15 : 0);
    } else if (this._launchPhase === 'standby' && raw.brake > PEDAL_DEADZONE && raw.throttle > PEDAL_DEADZONE) {
      // The simultaneous pedals used for staging must regain ordinary brake
      // priority if that sequence aborts or the vehicle is still moving.
      input.throttle = 0;
    }
    return this._launchPhase === 'launch';
  }

  step(dt, input = {}) {
    this._input = {
      throttle: clamp(finite(input.throttle), 0, 1),
      brake: clamp(finite(input.brake), 0, 1),
      steer: clamp(finite(input.steer), -1, 1),
      steerSource: input.steerSource === 'digital' ? 'digital' : 'analog',
      handbrake: !!input.handbrake,
      autoDirection: !!input.autoDirection,
    };
    // Never consume a tab's entire pause as one dangerous catch-up step.
    this._accumulator += clamp(finite(dt), 0, 0.1);
    let steps = 0;
    while (this._accumulator >= FIXED_DT && steps < 12) {
      this._substep(FIXED_DT);
      this._accumulator -= FIXED_DT;
      steps++;
    }
    this._publishState();
    return this.state;
  }

  /** External systems apply forces at their live attachment points each tick. */
  setExternalForceProvider(provider) {
    if (provider !== null && typeof provider !== 'function') throw new TypeError('External force provider must be a function or null.');
    this._externalForceProvider = provider;
  }

  /**
   * Browser driving controls: brake first, then reverse after a settled stop.
   * This runs on physics time, not render frames. It never changes P / N or
   * overrides an explicit manual R selection, and does not infer direction
   * from a momentary zero crossing while rolling, sliding or airborne.
   */
  _resolveDriverInput(dt) {
    const raw = this._input, c = this.controls;
    const output = { throttle: raw.throttle, brake: raw.brake, steer: raw.steer, steerSource: raw.steerSource, handbrake: raw.handbrake };
    const cancel = () => { this._directionTarget = null; this._directionStopTime = 0; };
    if (!raw.autoDirection || !['D', 'R'].includes(c.selector) || this._manualReverse || !c.engineOn || c.wattsToFreedom) {
      cancel();
      return (this._driverInput = output);
    }
    const forwardPedal = raw.throttle > PEDAL_DEADZONE ? raw.throttle : 0;
    const backwardPedal = raw.brake > PEDAL_DEADZONE ? raw.brake : 0;
    if (forwardPedal && backwardPedal) {
      // Both directional pedals mean brake, with no pending gear change.
      cancel(); output.throttle = 0; output.brake = backwardPedal;
      return (this._driverInput = output);
    }
    if (raw.handbrake) {
      // A parking-brake hold prevents automatic shifts, while still allowing
      // accelerator use in the already-selected direction.
      cancel();
      output.throttle = c.selector === 'R' ? backwardPedal : forwardPedal;
      output.brake = c.selector === 'R' ? forwardPedal : backwardPedal;
      return (this._driverInput = output);
    }
    if (!forwardPedal && !backwardPedal) {
      cancel(); output.throttle = output.brake = 0;
      return (this._driverInput = output);
    }
    const target = backwardPedal ? 'R' : 'D';
    const pedal = backwardPedal || forwardPedal;
    const direction = target === 'R' ? -1 : 1;
    const forward = this.body.quaternion.vmult(v3(0, 0, 1));
    const signedSpeed = this.body.velocity.dot(forward);
    const movingAgainstRequest = signedSpeed * direction < -DIRECTION_STOP_SPEED;
    if (this._directionTarget && this._directionTarget !== target) cancel();
    if (c.selector !== target || movingAgainstRequest || this._directionTarget) {
      if (this._directionTarget !== target) {
        this._directionTarget = target;
        this._directionStopTime = 0;
      }
      output.throttle = 0;
      output.brake = pedal;
      const speed = this.body.velocity.length();
      const upright = this.body.quaternion.vmult(v3(0, 1, 0)).y > 0.55;
      const wheelsStopped = this._wheels.every(w => Math.abs(w.omega * w.radius) < 0.35);
      const stopped = speed < DIRECTION_STOP_SPEED && upright && this._groundedWheels >= 2 && wheelsStopped;
      this._directionStopTime = stopped ? this._directionStopTime + dt : 0;
      if (this._directionStopTime + 1e-9 >= DIRECTION_STOP_HOLD) {
        const changed = c.selector !== target;
        c.selector = target;
        this._gear = 0;
        this._ratio = this.spec.transmissionType === 'cvt' ? this.spec.cvtRatios.max : this.spec.gears[0];
        this._shiftTimer = this._electric ? 0 : 0.10;
        this._shiftCooldown = 0.40;
        cancel();
        if (changed) this._notice = target === 'R'
          ? 'Reverse engaged · keep holding brake to back up; accelerator stops, then drives forward.'
          : 'Drive engaged · keep accelerating to move forward.';
        // Keep braking through the shift substep; the next step applies power.
      }
    } else {
      cancel(); output.throttle = pedal; output.brake = 0;
    }
    return (this._driverInput = output);
  }

  _collectContacts(dt) {
    const spec = this.spec, body = this.body;
    this._groundedWheels = 0;
    for (const w of this._wheels) {
      const tireDamage = this.damage.tires[w.index], suspensionDamage = this.damage.suspension[w.index];
      const psi = (w.front ? this.controls.frontPSI : this.controls.rearPSI) * tirePressureFactor(tireDamage);
      w.effectivePSI = Math.max(2, psi);
      w.radius = approach(w.radius, this._loadedRadius(Math.max(w.load, w.staticLoad * 0.20), w.effectivePSI, w.data, w.surface), 22, dt);
      w.deflection = spec.tracks ? spec.tracks.compliance : spec.tireRadius - w.radius;
      const sidewall = spec.tireRadius - this._rimRadius;
      w.contactLength = 2 * Math.sqrt(Math.max(0, spec.tireRadius ** 2 - w.radius ** 2));
      w.contactWidth = spec.tireWidth * (0.84 + 0.12 * clamp(w.deflection / sidewall, 0, 1));
      if (spec.tracks) { w.contactLength = spec.tracks.length; w.contactWidth = spec.tracks.width; }
      body.pointToWorldFrame(w.mount, w.mountWorld);
      body.quaternion.vmult(v3(0, -1, 0), w.down);
      const course = this.terrain.course;
      let courseHit = course?.castSuspension(w.mountWorld, w.down, w.radius, -.40, w.rest + .001);
      let length = courseHit?.distance ?? w.rest;
      let sample = courseHit ? this._courseMaterial(courseHit) : this.terrain.sample(w.mountWorld.x, w.mountWorld.z);
      const center = courseHit ? v3(courseHit.point.x, courseHit.point.y, courseHit.point.z) : v3(w.mountWorld.x, sample.height, w.mountWorld.z);
      const normal = courseHit ? v3(courseHit.normal.x, courseHit.normal.y, courseHit.normal.z) : v3(0, 1, 0);
      // Solve distance along suspension travel against the local tangent plane,
      // including a radius offset normal to a banked road, not always vertical.
      for (let iteration = 0; !courseHit && iteration < 3; iteration++) {
        normal.set(sample.normal?.x || 0, sample.normal?.y ?? 1, sample.normal?.z || 0);
        normal.normalize();
        const denominator = w.down.dot(normal);
        if (denominator >= -0.20) break;
        length = (w.radius + center.vsub(w.mountWorld).dot(normal)) / denominator;
        const probeLength = clamp(length, -0.45, w.rest + 0.4);
        center.set(w.mountWorld.x + w.down.x * probeLength - normal.x * w.radius, 0,
          w.mountWorld.z + w.down.z * probeLength - normal.z * w.radius);
        sample = this.terrain.sample(center.x, center.z);
        center.y = sample.height;
      }
      const axle = body.quaternion.vmult(v3(Math.cos(w.steer), 0, -Math.sin(w.steer)));
      let obstacleHit = this._obstacleContacts.castSuspension(w.mountWorld, w.down, w.radius, -.40, w.rest + .001,
        { axle, halfWidth: spec.tireWidth * .5 + w.deflection * .30 });
      if (obstacleHit) {
        const currentHub = w.mountWorld.addScaledVector(w.length, w.down);
        // A suspension ray must not pull a wheel onto a ledge above its hub.
        // Such a face is a tire obstruction until the actual wheel climbs high
        // enough. In particular a sideways strike cannot launch the near axle
        // vertically just because a ray cast from above sees the curb top.
        if (currentHub.vsub(obstacleHit.point).dot(w.down) > .003) obstacleHit = null;
      }
      if (obstacleHit && obstacleHit.distance < length - 1e-5) {
        courseHit = null; length = obstacleHit.distance; sample = this._obstacleMaterial(obstacleHit);
        center.copy(obstacleHit.point); normal.copy(obstacleHit.normal);
      } else obstacleHit = null;
      const rigidHit = courseHit || obstacleHit;
      w.constructed = !!rigidHit; w.featureId = rigidHit?.featureId || null;
      w.obstacleHit = obstacleHit;
      const patchForward = body.quaternion.vmult(v3(Math.sin(w.steer), 0, Math.cos(w.steer)));
      const intoNormal = patchForward.dot(normal);
      patchForward.x -= normal.x * intoNormal;
      patchForward.y -= normal.y * intoNormal;
      patchForward.z -= normal.z * intoNormal;
      patchForward.normalize();
      const patchRight = patchForward.cross(normal);
      patchRight.normalize();
      let envelope = 0;
      const meanNormal = v3();
      const footprintSamples = [], materialSamples = [];
      w.contactProfile = [];
      // Nine terrain points cover the actual footprint: rear/center/front rows,
      // each driver-left/center/driver-right. An envelope lets a narrow ridge
      // support a tire whose center ray alone would miss it. Low-pressure
      // carcass travel absorbs some edge relief before moving the hub.
      for (const along of [-0.5, 0, 0.5]) for (const across of [-0.5, 0, 0.5]) {
        const x = center.x + patchForward.x * along * w.contactLength + patchRight.x * across * w.contactWidth;
        const y = center.y + patchForward.y * along * w.contactLength + patchRight.y * across * w.contactWidth;
        const z = center.z + patchForward.z * along * w.contactLength + patchRight.z * across * w.contactWidth;
        const deck = courseHit ? course.projectFootprint({ x, y, z }, normal, courseHit.featureId, .45)
          : obstacleHit ? projectObstacleFootprint(obstacleHit.body, v3(x, y, z), normal, .45) : null;
        // A tire may overhang an edge; a real gap supplies no deck support.
        if (rigidHit && !deck) continue;
        const support = deck ? (obstacleHit ? this._obstacleMaterial(deck) : this._courseMaterial(deck)) : this.terrain.sample(x, z);
        const point = deck ? v3(deck.point.x, deck.point.y, deck.point.z) : v3(x, support.height, z);
        const relief = point.vsub(center).dot(normal);
        const edgeCompliance = w.deflection * 0.35 * (4 * along * along + 2 * across * across);
        envelope = Math.max(envelope, relief - edgeCompliance);
        const weight = along === 0 && across === 0 ? 4 : 1;
        footprintSamples.push({ sample: support, weight, relief });
        w.contactProfile.push(plain(point));
      }
      // Unilateral elastic support: the raised envelope cannot load a hollow
      // farther below it than the tire's pressure/load-dependent carcass travel.
      // A linear local compression estimate redistributes the nominal 3x3
      // quadrature weights. Flat ground retains its exact original weights;
      // low pressure can engage more of a shallow hollow, not create a blanket
      // grip bonus. Engineered decks retain their existing curved-road solve.
      const compliance = Math.max(.001, w.deflection);
      for (const item of footprintSamples) {
        const bearing = courseHit ? 1 : clamp(1 - Math.max(0, envelope - item.relief) / compliance, 0, 1);
        const weight = item.weight * bearing;
        if (weight <= 0) continue;
        materialSamples.push({ sample: item.sample, weight });
        meanNormal.x += (item.sample.normal?.x || 0) * weight;
        meanNormal.y += (item.sample.normal?.y ?? 1) * weight;
        meanNormal.z += (item.sample.normal?.z || 0) * weight;
      }
      meanNormal.normalize();
      center.x += normal.x * envelope; center.y += normal.y * envelope; center.z += normal.z * envelope;
      w.soilContact = rigidHit ? null : { origin: plain(center), normal: plain(normal), deflection: compliance,
        meanBearing: materialSamples.reduce((sum, item) => sum + item.weight, 0)
          / Math.max(1, footprintSamples.reduce((sum, item) => sum + item.weight, 0)) };
      // At a convex log/curb edge the swept tire normal belongs to the cone
      // between both faces. Averaging projected top-face normals into UP would
      // remove the horizontal reaction and turn a sideways strike into a lift.
      w.normal.copy(obstacleHit ? normal : courseHit || meanNormal.y > 0.20 ? meanNormal : normal);
      const denominator = w.down.dot(w.normal);
      if (denominator < -0.20) length = (w.radius + center.vsub(w.mountWorld).dot(w.normal)) / denominator;
      const wasAirTime = w.airTime;
      w.contact = denominator < -0.20 && length <= w.rest && materialSamples.length > 0;
      const travel = ((w.front ? spec.suspension.travelFront : spec.suspension.travelRear) || spec.suspension.travel) * (1 - suspensionDamage * 0.32);
      const minimumLength = Math.max(0.035, w.rest - travel);
      w.length = w.contact ? clamp(length, minimumLength - 0.10, w.rest) : w.rest;
      w.compression = w.contact ? Math.max(0, w.rest - length) : 0;
      w.compressionRatio = clamp(w.compression / travel, 0, 1.5);
      w.down.scale(w.length, w.position);
      w.position.vadd(w.mountWorld, w.position);
      w.ground.set(w.position.x - w.normal.x * w.radius, w.position.y - w.normal.y * w.radius, w.position.z - w.normal.z * w.radius);
      body.getVelocityAtWorldPoint(w.ground, w.velocity);
      w.supportVelocity.copy(obstacleHit ? obstaclePointVelocity(obstacleHit, w.ground) : v3());
      w.velocity.vsub(w.supportVelocity, w.relativeVelocity);
      w.data = footprintMaterial(sample, materialSamples.length ? materialSamples : [{ sample, weight: 1 }]);
      w.surface = w.data.surface || 'dirt';
      w.sink = w.data.sink;
      if (w.contact) {
        const springRate = spec.suspension.springRate * (1 - suspensionDamage * 0.43);
        const springForce = springRate * w.compression;
        const normalVelocity = w.relativeVelocity.dot(w.normal);
        const damperForce = -spec.suspension.damping * (1 - suspensionDamage * 0.68) * normalVelocity;
        const bump = Math.max(0, minimumLength - length);
        const bumpForce = spec.suspension.springRate * (bump * 5 + bump * bump * 90);
        w.load = clamp(springForce + damperForce + bumpForce, 0, w.staticLoad * 8);
        this._groundedWheels++;
        if (wasAirTime > 0.10 && normalVelocity < -4.6) {
          this._queueImpact({ obstacleId: `landing-${w.index}`, obstacleType: 'landing', point: w.ground,
            normal: w.normal, speed: -normalVelocity, effectiveMass: spec.mass * 0.25, wheelIndex: w.index });
        }
        w.airTime = 0;
        w.contactArea = w.contactLength * w.contactWidth * (spec.tracks ? Math.max(.08, w.soilContact?.meanBearing ?? 1) : Math.PI / 4);
        if (spec.tracks) w.effectivePSI = w.load / Math.max(.01, w.contactArea) / PSI_TO_PA;
      } else {
        w.load = 0;
        w.airTime += dt;
        w.longDeflection = w.latDeflection = w.relaxedLateralSlip = 0;
        w.soilLongitudinalForce = w.soilLateralForce = w.soilResistance = 0; w.slidingGripRetention = 1;
        w.radius = w.unloadedRadius;
        w.deflection = w.contactLength = w.contactWidth = w.contactArea = 0;
        w.contactProfile = [];
        w.soilContact = null;
        w.trackSoilTime = 0;
      }
    }
    // Front disconnect genuinely removes the cross-wheel anti-roll force.
    for (const first of [0, 2]) {
      const left = this._wheels[first], right = this._wheels[first + 1];
      const damaged = Math.max(this.damage.suspension[first], this.damage.suspension[first + 1]);
      const antiRoll = spec.suspension.antiRoll * (1 - damaged * 0.45) * (first === 0 ? (this.controls.swayDisconnected ? 0 : 1) : 0.55);
      const transfer = clamp((left.compression - right.compression) * antiRoll, -left.staticLoad * 1.5, right.staticLoad * 1.5);
      if (left.contact) left.load = Math.max(0, left.load + transfer);
      if (right.contact) right.load = Math.max(0, right.load - transfer);
    }
  }

  _substep(dt) {
    const spec = this.spec, c = this.controls, body = this.body;
    this._time += dt;
    this._pendingImpacts.clear();
    this._advanceObstacles(dt);
    this._syncObstacles();
    this._syncCourse();
    if (this.damage.disabled) c.engineOn = false;
    const velocity = body.velocity;
    const speed = velocity.length();
    const rules = spec.interlocks || {};
    const program = PROGRAMS[c.terrainProgram] || PROGRAMS.Normal;
    this._updateElectricSystems(dt, speed);
    if (this._requests.swayDisconnected) {
      const threshold = rules.swayReconnectSpeed || 8;
      if (speed > threshold) c.swayDisconnected = false;
      else if (speed < (rules.swayRedisconnectSpeed || threshold * 0.78)) c.swayDisconnected = (rules.swayModes || []).includes(c.driveMode);
    }
    const lockOffSpeed = rules.lockerAutoUnlockSpeed || (spec.brand === 'Jeep' ? 13.4112 : 11.176);
    for (const name of ['frontLocked', 'rearLocked']) {
      if (!this._electric && this._requests[name]) {
        const unlimitedRear = name === 'rearLocked' && ((rules.rearLockerUnlimitedModes || []).includes(c.driveMode) || (rules.rearLockerUnlimitedPrograms || []).includes(c.terrainProgram));
        if (speed > lockOffSpeed && !unlimitedRear) c[name] = false;
        else if (speed <= (rules.lockerAutoRelockSpeed || rules.lockerMaxSpeed || 4.47)) c[name] = true;
      }
    }
    this._collectContacts(dt);
    this._updateTireObstacleShapes();
    const input = this._resolveDriverInput(dt);
    // Binary keys do not express a road-wheel angle. Give them a finite slew
    // and a speed-sensitive range, still large enough to saturate the tires.
    // Direct analog commands retain full travel. Neither path changes velocity
    // or yaw: all handling continues to come from contact forces and moments.
    const digitalSteering = input.steerSource === 'digital';
    this._steeringLimit = digitalSteering
      ? Math.min(0.59, Math.atan(spec.wheelbase * 9.5 / (speed * speed + 16)) + 0.025) : 0.59;
    if (this._electric && c.rearSteer === 'crab') this._steeringLimit = Math.min(this._steeringLimit, spec.steering.rearMaxAngle);
    const requestedSteer = -input.steer * this._steeringLimit;
    this._steeringLimited = digitalSteering && this._steeringLimit < 0.589;
    this._steeringMode = digitalSteering ? 'digital-progressive' : 'direct-analog';
    this._steeringRate = 5.5 - 2.2 * clamp((speed - 5) / 22, 0, 1);
    if (digitalSteering) {
      const returning = !input.steer || Math.sign(requestedSteer) !== Math.sign(this._steer);
      const slew = (returning ? 1.75 : 1.05) / (1 + (speed / 10) ** 1.6);
      this._steeringSlew = slew;
      this._steeringRate = returning ? 9 : 6;
      const eased = approach(this._steer, requestedSteer, this._steeringRate, dt);
      this._steer += clamp(eased - this._steer, -slew * dt, slew * dt);
    } else {
      this._steeringSlew = null;
      this._steer = approach(this._steer, requestedSteer, this._steeringRate, dt);
    }
    const electricLaunch = this._electric && this._electricLaunchInput(input, speed, dt);
    let throttle = Math.pow(input.throttle, program.pedal);
    let brake = input.brake;
    if (spec.tracks) throttle *= clamp((spec.tracks.speedLimitMps - speed) / 1.5, 0, 1);
    if (this._electric) {
      const speedLimit = this._airSuspensionLift > .053 || c.rideHeight === 'extract' ? rules.extractMaxSpeed : c.terrainProgram === 'Terrain' ? rules.terrainMaxSpeed : Infinity;
      throttle *= clamp((speedLimit - speed) / .6, 0, 1);
      if (speed > speedLimit) brake = Math.max(brake, clamp((speed - speedLimit) * .24, 0, .7));
      this._electricThrottle = approach(this._electricThrottle, throttle, electricLaunch ? 24 : 9, dt);
      throttle = this._electricThrottle;
    }
    const electronicParking = spec.parkingBrake?.type === 'electronic';
    const dynamicParking = input.handbrake && electronicParking && speed > 0.15;
    const emergencyABS = dynamicParking && !(this._electric && c.frontLocked);
    const parkingMode = !input.handbrake ? 'released' : dynamicParking ? emergencyABS ? 'all-wheel-abs' : 'all-wheel' : electronicParking ? 'rear-hold' : 'rear-mechanical';
    this._parkingBrake = {
      active: input.handbrake, mode: parkingMode,
      label: !input.handbrake ? 'Parking brake released' : dynamicParking ? 'Electronic emergency brake · all wheels' : electronicParking ? 'Electronic parking brake · rear' : 'Mechanical parking brake · rear',
      wheels: [dynamicParking, dynamicParking, input.handbrake, input.handbrake],
    };
    if (dynamicParking) brake = Math.max(brake, 1);
    const forward = body.quaternion.vmult(v3(0, 0, 1));
    const signedSpeed = velocity.dot(forward);
    if (c.trailControl && c.engineOn && ['D', 'R'].includes(c.selector) && input.brake < 0.01) {
      const target = c.trailSpeedKmh / 3.6;
      throttle = Math.max(throttle, clamp((target - speed) * 0.33, 0, 0.7));
      if (speed > target + 0.15 && input.throttle < 0.1) brake = Math.max(brake, clamp((speed - target) * 0.25, 0, 0.7));
    }
    const travelDirection = Math.abs(signedSpeed) > 0.2 ? Math.sign(signedSpeed) : c.selector === 'R' ? -1 : 1;
    if (c.hillDescent && input.throttle < 0.05 && forward.y * travelDirection < -0.025) {
      const target = c.driveMode === '4L' ? 1.7 : 3.0;
      brake = Math.max(brake, clamp((Math.abs(signedSpeed) - target) * 0.55, 0, 0.85));
    }
    if (c.trailOnePedal && input.throttle < 0.08) brake = Math.max(brake, clamp((0.08 - input.throttle) * 6, 0, 0.48));
    let regenDeceleration = 0;
    if (this._electric && ['D', 'R'].includes(c.selector) && c.engineOn) {
      const lift = clamp(1 - input.throttle / .16, 0, 1);
      regenDeceleration = Math.max(brake * 3.0, c.regenOnDemand ? 2.7 : 0, lift * (c.onePedal || c.terrainProgram === 'Terrain' ? 2.0 : .16));
      if ((c.onePedal || c.terrainProgram === 'Terrain' || c.regenOnDemand) && lift > .95 && speed < .4) brake = Math.max(brake, .22);
      if (c.regenOnDemand) throttle = 0;
    }
    if (c.selector === 'P') brake = 1;
    const direction = c.selector === 'R' ? -1 : 1;
    const driven = c.driveMode === 'FWD' ? [0, 1] : ['RWD', '2H'].includes(c.driveMode) ? [2, 3] : [0, 1, 2, 3];
    const meanDrivenOmega = driven.reduce((sum, i) => sum + this._wheels[i].omega, 0) / driven.length;
    const rangeRatio = c.driveMode === '4L' ? spec.lowRatio : 1;
    this._shiftCooldown = Math.max(0, this._shiftCooldown - dt);
    this._shiftTimer = Math.max(0, this._shiftTimer - dt);
    if (spec.transmissionType === 'cvt' && c.selector !== 'R') {
      const rpmTarget = spec.engine.idleRPM + Math.pow(throttle, program.cvt) * (spec.engine.peakPowerRPM - spec.engine.idleRPM);
      const denominator = Math.max(1, Math.abs(meanDrivenOmega) * spec.finalDrive * 60 / TAU);
      this._ratio = approach(this._ratio, clamp(rpmTarget / denominator, spec.cvtRatios.min, spec.cvtRatios.max), 3.5, dt);
    } else {
      this._ratio = spec.gears[this._gear];
      const coupled = Math.abs(meanDrivenOmega) * this._ratio * spec.finalDrive * rangeRatio * 60 / TAU;
      const upAt = Math.min(spec.engine.redlineRPM - 220, 2000 + throttle * (spec.engine.peakPowerRPM - 1550) + program.shift * (1 - throttle));
      const downAt = throttle > 0.7 ? Math.min(spec.engine.peakTorqueRPM * 0.8, spec.engine.peakPowerRPM * 0.56) : spec.engine.idleRPM + 470;
      if (c.selector === 'D' && this._shiftCooldown === 0 && coupled > upAt && this._gear < spec.gears.length - 1 && speed > 1.8) {
        this._gear++; this._shiftTimer = 0.22; this._shiftCooldown = 0.9;
      } else if (c.selector === 'D' && this._shiftCooldown === 0 && coupled < downAt && this._gear > 0) {
        const lowerRPM = coupled * spec.gears[this._gear - 1] / spec.gears[this._gear];
        if (lowerRPM < spec.engine.redlineRPM * 0.85) { this._gear--; this._shiftTimer = 0.16; this._shiftCooldown = 0.8; }
      }
      this._ratio = spec.gears[this._gear];
    }
    const gearRatio = c.selector === 'R' ? spec.reverseRatio : this._ratio;
    const totalRatio = gearRatio * spec.finalDrive * rangeRatio;
    const coupledRPM = Math.abs(meanDrivenOmega) * totalRatio * 60 / TAU;
    const stallRPM = Math.min(spec.engine.peakTorqueRPM, spec.engine.peakPowerRPM * 0.50, 2800);
    const freeRPM = spec.engine.idleRPM + throttle * (stallRPM - spec.engine.idleRPM);
    let targetRPM = Math.max(freeRPM, coupledRPM);
    if (['P', 'N'].includes(c.selector)) targetRPM = this._electric ? 0 : spec.engine.idleRPM + throttle * (spec.engine.redlineRPM - 250 - spec.engine.idleRPM);
    if (!c.engineOn) targetRPM = 0;
    this._rpm = approach(this._rpm, clamp(targetRPM, 0, spec.engine.redlineRPM + 200), 15, dt);
    let engineTorque = c.engineOn ? engineTorqueAtRPM(spec, this._rpm) * throttle * (1 - this.damage.engine * 0.82) : 0;
    const electricRequest = this._electric ? electricMotorOutput(spec, this._wheels, { throttle, enabled: c.engineOn && ['D', 'R'].includes(c.selector), direction, damage: this.damage.engine, launch: electricLaunch }) : null;
    if (electricRequest) { engineTorque = electricRequest.requestedTorque; this._rpm = electricRequest.rpm; }
    if (coupledRPM > spec.engine.redlineRPM && !['P', 'N'].includes(c.selector)) engineTorque *= clamp(1 - (coupledRPM - spec.engine.redlineRPM) / 140, 0, 1);
    if (!this._electric && this._shiftTimer > 0) engineTorque *= 0.20;
    this._requestedEngineTorque = engineTorque;
    // Brake-based differential assistance can recover an isolated spinning
    // wheel, but cannot regulate sustained wheelspin at both driven wheels.
    // Feed back the common slip of each driven axle to a bounded engine-torque
    // controller. This acts on delivered torque, never on velocity or yaw.
    // The minimum slip on an open axle preserves brake-based torque transfer
    // when only one tire crosses a low-grip patch. Controller gains and slip
    // targets are explicit estimates, not reconstructed factory software.
    const axleFeedback = [];
    for (const first of [0, 2]) {
      if (!driven.includes(first)) continue;
      const pair = this._wheels.slice(first, first + 2);
      const share = driven.length === 2 ? 1 : c.driveMode === '4A'
        ? (first === 0 ? this._frontShare ?? 0.25 : 1 - (this._frontShare ?? 0.25)) : 0.5;
      const targetBase = pair.reduce((sum, w) => sum + finite(w.data?.tireResponse?.tractionSlip, 0.16), 0) * 0.5;
      const cornerDemand = pair.reduce((sum, w) => sum + clamp(Math.abs(w.lateralPhase || 0) / 2.5, 0, 1), 0) * 0.5;
      const looseProgram = c.offRoadPlus || program.slip >= 0.26;
      const target = looseProgram ? (c.offRoadPlus ? 0.40 : program.slip)
        : clamp(targetBase + program.slip - PROGRAMS.Normal.slip, 0.08, 0.24) * (1 - cornerDemand * 0.40);
      const slips = pair.map(w => Math.max(0, w.slip * direction));
      // At road speeds, also account for a disproportionately spinning inside
      // tire before selective braking alone develops a large axle yaw moment.
      // At crawling speed the open differential retains its full brake-assist
      // opportunity when the other wheel still has useful ground support.
      const commonSlip = Math.min(...slips), differentialSlip = Math.max(...slips) - commonSlip;
      const turningShare = clamp((speed - 1.5) / 7, 0, 1) * 0.45;
      axleFeedback.push({ share, target,
        slip: commonSlip + differentialSlip * turningShare,
        supported: pair.some(w => w.contact && w.load > w.staticLoad * 0.05) });
    }
    const shareTotal = axleFeedback.reduce((sum, axle) => sum + axle.share, 0) || 1;
    const observedSlip = axleFeedback.reduce((sum, axle) => sum + axle.slip * axle.share, 0) / shareTotal;
    this._tcSlipTarget = axleFeedback.reduce((sum, axle) => sum + axle.target * axle.share, 0) / shareTotal;
    this._tcMeasuredSlip = approach(this._tcMeasuredSlip, observedSlip, 28, dt);
    const regulateTraction = c.tractionControl && c.engineOn && throttle > 0.04 && brake < 0.05
      && !input.handbrake && !['P', 'N'].includes(c.selector) && axleFeedback.some(axle => axle.supported);
    if (regulateTraction) {
      const error = this._tcMeasuredSlip - this._tcSlipTarget;
      // Fast cut, slower recovery. Integral limiting avoids a stored cut after
      // a launch stall, stopping, a shift or turning traction control off.
      this._tcTorqueScale = clamp(this._tcTorqueScale + clamp(-error * 7.5, -5.5, 0.75) * dt, 0.06, 1);
    } else {
      this._tcTorqueScale = !c.tractionControl || !c.engineOn || ['P', 'N'].includes(c.selector)
        ? 1 : approach(this._tcTorqueScale, 1, 14, dt);
      if (throttle <= 0.04 || ['P', 'N'].includes(c.selector)) this._tcMeasuredSlip = 0;
    }
    engineTorque *= this._tcTorqueScale;
    const engineDrag = (!this._electric && !['P', 'N'].includes(c.selector) && Math.abs(meanDrivenOmega) > 1.0)
      ? spec.torqueNm * (0.04 + 0.065 * Math.min(1, coupledRPM / spec.engine.redlineRPM)) * (1 - throttle) : 0;
    this._engineTorque = engineTorque;
    const converterRatio = this._electric ? 1 : 1 + 0.48 * clamp(1 - coupledRPM / Math.max(freeRPM, spec.engine.idleRPM), 0, 1);
    const driveEfficiency = clamp(finite(spec.drivetrain?.efficiency, 0.87), 0.5, 1);
    let axleTorque = (engineTorque * converterRatio * direction - engineDrag * Math.sign(meanDrivenOmega)) * totalRatio * driveEfficiency;
    if (['P', 'N'].includes(c.selector)) axleTorque = 0;
    if (!c.engineOn) axleTorque = -engineDrag * Math.sign(meanDrivenOmega) * totalRatio * driveEfficiency;
    let frontShare = c.driveMode === 'FWD' ? 1 : ['RWD', '2H'].includes(c.driveMode) ? 0 : 0.5;
    if (this._electric) {
      this._evOutput = electricMotorOutput(spec, this._wheels, { throttle, torqueScale: this._tcTorqueScale, direction,
        enabled: c.engineOn && ['D', 'R'].includes(c.selector), regenDeceleration, damage: this.damage.engine, launch: electricLaunch });
      this._engineTorque = this._evOutput.motorTorque;
      frontShare = this._evOutput.frontShare;
      // Blended service braking replaces the force already supplied by regen.
      if (input.brake > 0) brake = Math.max(0, brake - this._evOutput.regenForce / (spec.mass * G * 1.12));
    }
    if (c.driveMode === '4A') {
      const frontBase = spec.drivetrain?.baseAxle === 'front';
      const axle = frontBase ? 0 : 2;
      const primarySlip = (Math.abs(this._wheels[axle].slip) + Math.abs(this._wheels[axle + 1].slip)) * 0.5;
      const maximum = frontBase ? finite(spec.drivetrain?.rearTorqueFraction, 0.45) : 0.55;
      const secondaryShare = clamp(0.08 + throttle * 0.13 + primarySlip * 0.6, 0.08, maximum);
      frontShare = frontBase ? 1 - secondaryShare : secondaryShare;
    }
    this._frontShare = frontShare;
    if (this._electric) {
      const mode = c.rearSteer === 'crab' && speed > rules.crabWalkMaxSpeed ? 'auto' : c.rearSteer;
      this._rearSteer = approach(this._rearSteer, electricRearSteer(spec, this._steer, speed, mode), 7, dt);
    }
    const turnRadius = Math.abs(this._steer) > 0.005 ? spec.wheelbase / Math.tan(Math.abs(this._steer)) : 1e6;
    for (const w of this._wheels) {
      if (this._electric) {
        const frontTangent = Math.tan(this._steer), rearTangent = Math.tan(this._rearSteer);
        const curvature = (frontTangent - rearTangent) / spec.wheelbase;
        const sideVelocity = rearTangent + curvature * spec.wheelbase * spec.frontWeightFraction;
        w.steer = Math.atan2(sideVelocity + curvature * w.mount.z, Math.max(.25, 1 - curvature * w.mount.x));
      } else if (w.front) {
        const inside = this._steer > 0 ? w.left : !w.left;
        const radius = Math.max(1.3, turnRadius + (inside ? -1 : 1) * spec.track * 0.5);
        w.steer = Math.sign(this._steer) * Math.atan(spec.wheelbase / radius);
      } else w.steer = 0;
      // Lateral loading deflects the front steering/suspension assembly. Its
      // small compliance response produces understeer through the actual
      // tire direction. The 0.006 rad/kN coefficient is an estimated chassis
      // calibration informed by NHTSA compliance studies, not OEM measurement.
      const compliance = w.front ? finite(spec.suspension.frontSteerCompliance, 0.006) / 1000 : 0;
      w.complianceSteer = approach(w.complianceSteer, clamp(w.lateralForce * compliance, -0.065, 0.065), 35, dt);
      w.steer += w.complianceSteer;
      // A bent corner creates toe error and uneven steering response. Grip
      // reductions still come from the damaged tire's own load/pressure.
      w.steer += (w.left ? 1 : -1) * this.damage.suspension[w.index] ** 2 * 0.085;
      body.quaternion.vmult(v3(Math.sin(w.steer), 0, Math.cos(w.steer)), w.forward);
      const intoNormal = w.forward.dot(w.normal);
      w.forward.x -= w.normal.x * intoNormal;
      w.forward.y -= w.normal.y * intoNormal;
      w.forward.z -= w.normal.z * intoNormal;
      w.forward.normalize();
      w.forward.cross(w.normal, w.right);
      w.right.normalize();
      w.speedLong = w.relativeVelocity.dot(w.forward);
      w.speedLat = w.relativeVelocity.dot(w.right);
      w.lateralSlip = Math.atan2(w.speedLat, Math.max(1.5, Math.abs(w.speedLong)));
      const stockPSI = w.front ? (spec.stockPSIFront || spec.stockPSI) : (spec.stockPSIRear || spec.stockPSI);
      const pr = spec.tracks ? 1 : w.effectivePSI / stockPSI;
      const softness = clamp(w.data.softness || 0, 0, 1);
      const hardPressureGrip = clamp(1 - Math.log(Math.max(0.2, pr)) ** 2 * 0.16, 0.58, 1);
      const softPressureGrip = clamp(1 + 0.70 * (1 - pr), 0.62, 1.48);
      const extremeDeflation = !spec.tracks && w.effectivePSI < 12 ? 0.90 + w.effectivePSI / 120 : 1;
      const tread = contactTreadFactor(spec, w.data, w.surface);
      const response = w.data.tireResponse || TIRE_RESPONSE[w.surface] || TIRE_RESPONSE.dirt;
      const loadRatio = clamp(w.load / w.referenceLoad, 0.25, 5);
      const loadGrip = clamp(loadRatio ** -response.loadSensitivity, 0.78, 1.10);
      const tireHealth = 1 - this.damage.tires[w.index] * 0.48;
      w.peakMu = (w.data.mu ?? 0.65) * (hardPressureGrip * (1 - softness) + softPressureGrip * softness) * extremeDeflation * tread * loadGrip * tireHealth;
      const loadedStiffness = w.referenceLoad * loadRatio ** response.stiffnessExponent;
      w.corneringStiffness = response.lateral * loadedStiffness
        * clamp(pr ** 0.35, 0.57, 1.16) * (w.front ? 1 : 1.10)
        * tireHealth * contactTireScale(spec, 'corneringStiffnessScale', w.data, w.surface);
      w.longitudinalStiffness = response.longitudinal * loadedStiffness
        * clamp(pr ** 0.20, 0.70, 1.10) * tireHealth * contactTireScale(spec, 'longitudinalStiffnessScale', w.data, w.surface);
      // A sliding patch can retain less force than a near-peak rolling tire.
      // Use the previous resolved longitudinal slip and current lateral slip
      // to evolve this bounded contact state. Holding its capacity fixed during
      // the implicit wheel solve preserves that solve's monotone energy and
      // mechanical-lock constraints. It recovers as the real slip decreases.
      const peakCapacity = Math.max(1, w.peakMu * w.load);
      const slipDemand = Math.hypot(w.slip * w.longitudinalStiffness / peakCapacity,
        w.lateralSlip * w.corneringStiffness / peakCapacity);
      const slideStart = finite(response.slideStart, 2.5), slideEnd = Math.max(slideStart + 0.1, finite(response.slideEnd, 7));
      const excess = clamp((slipDemand - slideStart) / (slideEnd - slideStart), 0, 1);
      const retained = 1 - (1 - clamp(finite(response.slideRetention, 1), 0.45, 1)) * excess * excess * (3 - 2 * excess);
      w.slidingGripRetention = w.contact ? approach(w.slidingGripRetention, retained, 22, dt) : 1;
      w.mu = w.peakMu * w.slidingGripRetention;
      w.capacity = w.contact ? Math.max(0, w.mu * w.load) : 0;
      const lateralStiffness = w.corneringStiffness / Math.max(1, w.capacity);
      // A short elastic carcass memory supplies low-speed stiction. Pure
      // velocity-only slip curves otherwise let a parked vehicle creep down
      // every slope. Rolling transports this memory out of the contact patch.
      w.patchLength = Math.max(0.12, w.contactLength * (w.front ? 0.8 : 0.72));
      const transportSpeed = Math.max(Math.abs(w.speedLong), Math.abs(w.omega * w.radius) * 0.65);
      w.patchDecay = 1 + dt * transportSpeed / w.patchLength;
      w.staticWeight = Math.exp(-Math.abs(w.speedLong) * 2.2);
      w.latDeflection = w.contact ? clamp((w.latDeflection + w.speedLat * dt) / w.patchDecay, -0.10, 0.10) : 0;
      // First-order rolling relaxation represents carcass force build-up over
      // traveled distance. The 0.3–0.9 m scale is informed by published tire-rig
      // measurements; individual category/load/pressure terms remain estimates.
      // It smooths the tire response, not the chassis velocity or heading.
      w.relaxationLength = clamp((0.22 + w.contactLength * 0.55 + Math.abs(w.speedLong) * 0.010)
        * loadRatio ** 0.20 * clamp(pr ** -0.20, 0.8, 1.4)
        * response.relaxation * contactTireScale(spec, 'relaxationLengthScale', w.data, w.surface), 0.18, 1.6);
      w.relaxedLateralSlip = w.contact
        ? approach(w.relaxedLateralSlip, w.lateralSlip, Math.max(2, transportSpeed) / w.relaxationLength, dt) : 0;
      const lateralSlip = w.relaxedLateralSlip * (1 - w.staticWeight) + w.lateralSlip * w.staticWeight;
      w.lateralPhase = lateralStiffness * (lateralSlip + w.latDeflection / w.patchLength * w.staticWeight);
      w.lateralForce = -w.capacity * 0.96 * Math.tanh(w.lateralPhase);
      w.longCapacity = w.capacity;
      w.slipStiffness = w.longitudinalStiffness / Math.max(1, w.capacity);
      w.slipReference = Math.max(1.5, Math.abs(w.speedLong));
      w.driveTorque = this._electric ? this._evOutput.wheelTorques[w.index] : axleTorque * (w.front ? frontShare : 1 - frontShare) * 0.5;
      const groundRolling = Math.max(0, finite(w.data.rollingResistance, 0.025));
      const soilRolling = clamp(finite(w.data.soil?.rollingResistance), 0, groundRolling);
      const rollingScale = contactTireScale(spec, 'rollingResistanceScale', w.data, w.surface);
      // Internal tire hysteresis follows rotation. Ground compaction and
      // penetration instead resist translation, including a locked tire being
      // pushed through soil. The material already partitions total rolling
      // resistance, so neither term is counted twice. The longitudinal soil
      // share acts in the rolling plane; sidewall bulldozing below is orthogonal.
      const internalRolling = (groundRolling - soilRolling) * rollingScale
        + 0.008 * Math.max(0, 1 / pr - 1)
        + this.damage.tires[w.index] ** 2 * 0.075
        + (w.data.waterDepth || 0) * 0.045;
      w.rollingTorque = w.contact ? internalRolling * w.load * w.radius : 0.4;
      w.soilResistance = w.contact ? (soilRolling * rollingScale
        + softness * (w.sink / Math.max(0.1, w.radius)) * 0.24) * w.load : 0;
      const brakeBias = w.front ? 0.34 : 0.22;
      w.brakeTorque = brake * spec.mass * G * w.radius * brakeBias;
      w.absActive = false;
      const absCapacity = w.capacity * Math.abs(combinedSlip(-0.18 * w.slipStiffness, w.lateralPhase).longitudinal);
      // ABS budgets all remaining wheel retardation, not only hydraulic brake
      // torque. Otherwise internal rolling loss and engine braking can push a
      // nominally modulated tire through the controller's target into lockup.
      const otherRetardation = w.rollingTorque + Math.max(0, -w.driveTorque * Math.sign(w.speedLong));
      const absBrakeAllowance = Math.max(0, absCapacity * w.radius * 0.98 - otherRetardation);
      if ((c.abs || emergencyABS) && Math.abs(w.speedLong) > 1.5 && brake > 0.01 && w.contact && w.brakeTorque > absBrakeAllowance) {
        w.brakeTorque = absBrakeAllowance;
        w.absActive = true;
      }
      // Mechanical cables bypass service ABS. Electronic switches request
      // modulated dynamic braking, then rear holding force near standstill.
      if (input.handbrake && !dynamicParking && !w.front) w.brakeTorque += spec.mass * G * w.radius * 0.38;
      if (c.selector === 'P') w.brakeTorque += spec.mass * G * w.radius;
      w.tcActive = false;
      if (c.tractionControl && throttle > 0.04 && Math.abs(w.driveTorque) > 1) {
        const slipThreshold = c.offRoadPlus ? 0.40 : program.slip >= 0.26 ? program.slip
          : clamp(finite(w.data?.tireResponse?.tractionSlip, 0.16) + program.slip - PROGRAMS.Normal.slip, 0.08, 0.24);
        const drivingSlip = w.slip * direction;
        const partner = this._wheels[w.index ^ 1];
        const differentialSlip = Math.max(0, drivingSlip - partner.slip * direction - 0.035);
        const axleLocked = w.front ? c.frontLocked : c.rearLocked;
        if (!axleLocked && drivingSlip > slipThreshold && differentialSlip > 0) {
          w.tcActive = true;
          // Engine control regulates common axle slip; brake assistance is
          // reserved for the excess spin of one differential output. Braking
          // both wheels in proportion to their unrelated slip used to create
          // a strong unwanted yaw moment during powered soft-ground turns.
          const selectiveBrake = clamp(Math.min(drivingSlip - slipThreshold, differentialSlip)
            * w.staticLoad * w.radius * 0.90, 0, Math.abs(w.driveTorque) * 1.05);
          w.brakeTorque += selectiveBrake;
        }
        if (regulateTraction && this._tcTorqueScale < 0.985) w.tcActive = true;
      }
      if (c.trailTurnAssist && !w.front && !c.rearLocked && Math.abs(input.steer) > 0.65 && speed < 5 && ((input.steer < 0) === w.left)) {
        w.brakeTorque += spec.mass * G * w.radius * 0.35;
      }
    }
    this._solveWheelRotation(dt);
    for (const w of this._wheels) {
      w.soilLongitudinalForce = w.soilLateralForce = 0;
      const soilContact = w.contact && w.load > 40 && !w.constructed && this.terrain.deform && (w.data.softness || 0) > .05;
      const wheelId = `${spec.id}-${w.index}`;
      if (!soilContact) this.terrain.releaseWheelContact?.(wheelId);
      if (w.contact && w.load > 0) {
        if (w.soilResistance > 0 && Math.abs(w.speedLong) > 1e-5) {
          const impulseLimit = Math.abs(w.speedLong) * this._effectiveImpactMass(w.ground, w.forward) / (dt * 6);
          w.soilLongitudinalForce = -Math.sign(w.speedLong) * Math.min(w.soilResistance * Math.tanh(Math.abs(w.speedLong) / 0.35),
            w.load * 0.65, impulseLimit);
        }
        const soil = w.data.soil;
        const depth = clamp(w.sink, 0, w.radius * 0.8);
        if (soil?.lateralScale > 0 && depth > 0 && Math.abs(w.speedLat) > 1e-5) {
          // Passive soil resistance acts against a buried tire's sidewall in
          // addition to tread shear. Integrate a simple cohesive/granular blade
          // pressure over its buried depth. Soil properties and scale are
          // estimates; actual persistent rut depth supplies the geometry.
          // Keep this separately reported from the tire friction budget.
          const kp = Math.tan(Math.PI / 4 + clamp(soil.frictionAngleRad, 0, 0.75) / 2) ** 2;
          const edgeLength = Math.max(w.contactLength, 2 * Math.sqrt(Math.max(0, 2 * w.radius * depth - depth * depth)));
          const passive = edgeLength * (2 * Math.max(0, soil.cohesionPa) * Math.sqrt(kp) * depth
            + 0.5 * Math.max(0, soil.densityKgM3) * G * kp * depth * depth) * soil.lateralScale;
          const impulseLimit = Math.abs(w.speedLat) * this._effectiveImpactMass(w.ground, w.right) / (dt * 6);
          w.soilLateralForce = -Math.sign(w.speedLat) * Math.min(passive * Math.tanh(Math.abs(w.speedLat) / 0.35),
            w.load * 0.65, impulseLimit);
        }
        const alongForce = w.longitudinalForce + w.soilLongitudinalForce;
        const sideForce = w.lateralForce + w.soilLateralForce;
        const force = v3(
          w.normal.x * w.load + w.forward.x * alongForce + w.right.x * sideForce,
          w.normal.y * w.load + w.forward.y * alongForce + w.right.y * sideForce,
          w.normal.z * w.load + w.forward.z * alongForce + w.right.z * sideForce,
        );
        const relative = w.ground.vsub(body.position);
        body.applyForce(force, relative);
        if (w.obstacleHit?.obstacle?.treeFall) {
          const fall = w.obstacleHit.obstacle.treeFall;
          const arm = w.ground.vsub(v3(fall.pivot.x, fall.pivot.y, fall.pivot.z));
          const moment = arm.cross(force.scale(-dt));
          applyTreeAngularImpulse(fall, moment.dot(v3(fall.axis.x, fall.axis.y, fall.axis.z)), { constrained: true });
          syncTreeObstacle(w.obstacleHit.obstacle);
          w.obstacleHit.body.velocity.copy(w.obstacleHit.obstacle.velocity);
          w.obstacleHit.body.angularVelocity.copy(w.obstacleHit.obstacle.angularVelocity);
        }
        if (soilContact) {
          // A long belt touches many more 10 cm soil nodes than a tire. Keep
          // force/contact integration at 120 Hz, but accumulate belt imprints
          // to 30 Hz and sweep their complete traveled footprint in one stamp.
          w.trackSoilTime = spec.tracks ? (w.trackSoilTime || 0) + dt : dt;
          if (!spec.tracks || w.trackSoilTime >= 1 / 30 - 1e-9) {
            this.terrain.deform(w.ground.x, w.ground.z, {
              load: w.load, slip: w.slip, lateralSlip: w.lateralSlip, pressure: w.effectivePSI,
              width: spec.tireWidth, dt: w.trackSoilTime,
              speed: Math.hypot(w.speedLong, w.speedLat),
              longitudinalSpeed: w.speedLong,
              contactLength: w.contactLength, contactWidth: w.contactWidth,
              contactShape: spec.tracks ? 'rectangle' : 'ellipse',
              supportPlane: w.soilContact,
              wheelId,
              heading: Math.atan2(w.forward.x, w.forward.z),
            });
            w.trackSoilTime = 0;
          }
        } else w.trackSoilTime = 0;
      }
      w.rotation += w.omega * dt;
      if (Math.abs(w.rotation) > 10000) w.rotation %= TAU;
    }
    this._applyChassisContacts(dt);
    const airSpeed = velocity.length();
    const area = spec.width * spec.height * 0.82;
    const dragFactor = 0.5 * 1.225 * spec.dragCoefficient * area * airSpeed;
    body.applyForce(v3(-velocity.x * dragFactor, -velocity.y * dragFactor * 0.2, -velocity.z * dragFactor));
    const centerTerrain = this.terrain.sample(body.position.x, body.position.z);
    this._waterDepth = centerTerrain.waterDepth || 0;
    const waterImmersion = Math.max(0, centerTerrain.height + this._waterDepth - (body.position.y - spec.cgHeight + spec.clearance));
    if (waterImmersion > 0) {
      const waterDrag = Math.min(12000, waterImmersion * waterImmersion * 1400 * speed);
      body.applyForce(v3(-velocity.x * waterDrag, Math.min(spec.mass * G * 0.5, waterImmersion * spec.mass * G * 0.3), -velocity.z * waterDrag));
    }
    this._externalForceProvider?.(dt, this);
    this.world.step(dt);
    this._treeCollision.finish(dt);
    this._flushImpacts();
    this._odometer += body.position.distanceTo(this._lastPosition);
    this._lastPosition.copy(body.position);
    this._stuckTime = input.throttle > 0.55 && speed < 0.65 ? this._stuckTime + dt : Math.max(0, this._stuckTime - dt * 2);
    if (![body.position.x, body.position.y, body.position.z, body.quaternion.w].every(Number.isFinite)) this.reset(this._spawn);
  }

  _courseMaterial(hit) {
    const response = surfaceResponse('asphalt', { moisture: this.terrain.moisture || 0 });
    return { ...response, height: hit.point.y, normal: hit.normal, surface: 'asphalt', surfaceDetail: 'asphalt',
      sink: 0, softness: 0, maxSink: 0, waterDepth: 0, compaction: 0, churn: 0,
      constructed: true, featureId: hit.featureId, materialKey: hit.materialKey };
  }

  _obstacleMaterial(hit) {
    const wood = ['tree', 'log', 'stump', 'sign'].includes(hit.obstacle?.type);
    const ground = this.terrain.sample(hit.point.x, hit.point.z);
    const waterDepth = ground.waterDepth > 0 ? Math.max(0, ground.height + ground.waterDepth - hit.point.y) : 0;
    // Standing water wets the actual bearing point even under clear skies.
    // Raised timber stays independent of the wet soil below; individual
    // footprint samples retain both sides of a partly submerged obstacle.
    const wet = waterDepth > 0 ? 1 : clamp(this.terrain.moisture || 0, 0, 1);
    const response = surfaceResponse('rock', { moisture: wet });
    return { ...response, height: hit.point.y, normal: hit.normal, surface: 'rock', surfaceDetail: wood ? 'wood' : 'rock',
      // Bark/timber is an explicit estimated hard-surface response, not the
      // soil hidden beneath it and not a claim of measured wet-wood tire data.
      mu: wood ? .66 - .30 * wet : response.mu, rollingResistance: wood ? .028 : response.rollingResistance,
      sink: 0, softness: 0, maxSink: 0, waterDepth, compaction: 0, churn: 0,
      constructed: true, featureId: hit.obstacleId, obstacleId: hit.obstacleId };
  }

  _syncCourse() {
    const course = this.terrain.course;
    if (course === this._courseSource) return;
    for (const body of this._courseBodies) this.world.removeBody(body);
    this._courseBodies.length = 0; this._courseSource = course;
    for (const group of course?.colliderGroups || []) {
      const body = new CANNON.Body({ mass: 0, position: v3(group.center.x, group.center.y, group.center.z),
        collisionFilterGroup: 2, collisionFilterMask: 1 });
      for (const definition of group.shapes) {
        const shape = definition.kind === 'box'
          ? new CANNON.Box(v3(definition.halfExtents.x, definition.halfExtents.y, definition.halfExtents.z))
          : new CANNON.ConvexPolyhedron({ vertices: definition.vertices.map(p => v3(p.x, p.y, p.z)), faces: definition.faces });
        const q = definition.quaternion;
        if (definition.kind === 'convex') shape.terraCourse = { triangleIndex: definition.triangleIndex,
          exposedFaces: definition.exposedFaces, featureId: group.featureId };
        body.addShape(shape, v3(definition.offset.x, definition.offset.y, definition.offset.z), q ? new CANNON.Quaternion(q.x, q.y, q.z, q.w) : undefined);
      }
      body.terraObstacle = { id: group.id, type: 'challenge', hardness: group.hardness };
      this.world.addBody(body); this._courseBodies.push(body);
    }
    if (course) installChallengeCollisionFilter(this.world, course);
  }

  _advanceObstacles(dt) {
    // Tree motion belongs to the fixed physics clock, even when rendering is
    // paused, slow, or executing several substeps in one browser frame.
    for (const obstacle of this.terrain.obstacles || EMPTY_OBSTACLES) if (obstacle.treeFall && !obstacle.disabled) {
      stepTreeFall(obstacle.treeFall, dt, (x, z) => this.terrain.heightAt ? this.terrain.heightAt(x, z) : this.terrain.sample(x, z).height);
      syncTreeObstacle(obstacle);
    }
  }

  _poseObstacle(body, obstacle) {
    const center = obstacle.center, rotation = obstacle.quaternion;
    const x = finite(obstacle.x, center?.x), z = finite(obstacle.z, center?.z);
    if (center && [center.x, center.y, center.z].every(Number.isFinite)) body.position.copy(center);
    else body.position.set(x, this.terrain.sample(x, z).height + (obstacle.height || 8) / 2, z);
    if (rotation && [rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)
      && Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) > .001) {
      body.quaternion.copy(rotation); body.quaternion.normalize();
    } else body.quaternion.set(0, 0, 0, 1);
    body.velocity.copy(obstacle.velocity || v3()); body.angularVelocity.copy(obstacle.angularVelocity || v3());
    body.aabbNeedsUpdate = true; this.world.broadphase.dirty = true;
  }

  _syncObstacles() {
    const obstacles = this.terrain.obstacles || EMPTY_OBSTACLES;
    const revision = this.terrain.obstacleRevision || 0;
    const structural = this._obstacleSource !== obstacles || this._obstacleCount !== obstacles.length || this._obstacleRevision !== revision;
    if (structural) {
      const retained = new Set(), nextBodies = [];
      for (let index = 0; index < obstacles.length; index++) {
        const obstacle = obstacles[index];
        const x = Number.isFinite(obstacle.x) ? obstacle.x : obstacle.center?.x;
        const z = Number.isFinite(obstacle.z) ? obstacle.z : obstacle.center?.z;
        if (obstacle.disabled || ![x, z].every(Number.isFinite)) continue;
        const id = String(obstacle.id ?? `obstacle-${index}`);
        const radius = obstacle.radius || .25, height = obstacle.height || 8, extents = obstacle.halfExtents;
        const box = obstacle.shape === 'box' && extents && [extents.x, extents.y, extents.z].every(v => Number.isFinite(v) && v > 0);
        const signature = box ? `box:${extents.x}:${extents.y}:${extents.z}:${!!obstacle.treeFall}`
          : `cylinder:${radius}:${height}:${!!obstacle.treeFall}`;
        let body = this._obstacleBodyMap.get(id);
        if (body && body.terraShapeSignature !== signature) {
          this.world.removeBody(body); this._obstacleBodyMap.delete(id); body = null;
        }
        if (!body) {
          body = new CANNON.Body({ mass: 0, type: obstacle.treeFall ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
            shape: box ? new CANNON.Box(v3(extents.x, extents.y, extents.z)) : new CANNON.Cylinder(radius, radius, height, 12),
            collisionFilterGroup: 2, collisionFilterMask: 1 });
          body.terraShapeSignature = signature;
          if (obstacle.treeFall) body.integrate = () => {}; // shared hinge state owns the pose
          this.world.addBody(body); this._obstacleBodyMap.set(id, body);
        }
        // Preserve descriptor identity: moving pose, winch, wheel support and
        // visible damage all read the same tree, rather than stale object copies.
        if (obstacle.id == null) obstacle.id = id;
        body.terraObstacle = obstacle; retained.add(id); nextBodies.push(body);
        this._poseObstacle(body, obstacle);
      }
      for (const [id, body] of this._obstacleBodyMap) if (!retained.has(id)) {
        this.world.removeBody(body); this._obstacleBodyMap.delete(id);
      }
      this._obstacleBodies = nextBodies;
      this._obstacleSource = obstacles; this._obstacleCount = obstacles.length; this._obstacleRevision = revision;
      this._obstacleContacts.setBodies(this._obstacleBodies);
    } else {
      for (const body of this._obstacleContacts.moving) this._poseObstacle(body, body.terraObstacle);
    }
  }

  _effectiveImpactMass(point, normal) {
    const arm = point.vsub(this.body.position);
    const cross = arm.cross(normal);
    const response = this.body.invInertiaWorld.vmult(cross);
    return 1 / Math.max(this.body.invMass, this.body.invMass + cross.dot(response));
  }

  _queueObstacleImpact(event) {
    const obstacle = event.body?.terraObstacle, contact = event.contact;
    if (!obstacle || !contact) return;
    const vehicleIsA = contact.bi === this.body;
    const point = this.body.position.vadd(vehicleIsA ? contact.ri : contact.rj);
    const normal = contact.ni.scale(vehicleIsA ? -1 : 1);
    const speed = Math.max(0, contact.getImpactVelocityAlongNormal());
    this._queueImpact({ obstacleId: obstacle.id, obstacleType: obstacle.type || 'obstacle', point, normal, speed,
      wheelIndex: (vehicleIsA ? contact.si : contact.sj)?.terraSidewallWheel?.index,
      effectiveMass: 1 / (1 / this._effectiveImpactMass(point, normal)
        + treeContactInverseMass(obstacle.treeFall, point, normal)),
      hardness: obstacle.hardness ?? (obstacle.type === 'sign' ? 0.22 : obstacle.type === 'tree' ? 0.85 : 1),
    });
  }

  _queueImpact({ obstacleId, obstacleType, point, normal, speed, effectiveMass, wheelIndex, hardness = 1 }) {
    if (this._time < this._damageGraceUntil || speed <= 0.25 || !Number.isFinite(speed)) return;
    const cooldownKey = `${this.spec.id}:${obstacleId}`;
    if (this._time - (this._impactCooldowns.get(cooldownKey) ?? -Infinity) < 0.55) return;
    const energy = 0.5 * Math.max(0, effectiveMass) * speed * speed * clamp(hardness, 0.08, 1);
    const existing = this._pendingImpacts.get(cooldownKey);
    if (existing && existing.energy >= energy) return;
    const localPoint = this.body.pointToLocalFrame(point);
    const localNormal = this.body.vectorToLocalFrame(normal.scale(-1));
    this._pendingImpacts.set(cooldownKey, {
      time: this._time, vehicleId: this.spec.id, obstacleId: String(obstacleId), obstacleType,
      point: plain(point), normal: plain(normal), localPoint: plain(localPoint), localNormal: plain(localNormal),
      speed, energy, wheelIndex,
      strength: clamp(1 - Math.exp(-energy / Math.max(1, this.spec.mass * 48)), 0, 1),
    });
  }

  _flushImpacts() {
    const wheelPoints = this._wheels.map(w => ({ x: w.mount.x, y: w.radius - this.spec.cgHeight, z: w.mount.z }));
    for (const [key, candidate] of this._pendingImpacts) {
      const impact = { id: this._nextImpactId++, ...candidate };
      const damaged = applyImpactDamage(this.damage, impact, this.spec, wheelPoints);
      this._impactCooldowns.set(key, this._time);
      this._impacts.push(impact);
      if (this._impacts.length > 32) this._impacts.splice(0, this._impacts.length - 32);
      if (damaged) this._notice = this.damage.disabled
          ? 'Vehicle disabled by damage · stop and repair, or restart the run.'
          : impact.obstacleType === 'landing' ? 'Hard landing · inspect suspension and tires.' : 'Impact damage · inspect vehicle condition.';
    }
    if (this.damage.disabled) this.controls.engineOn = false;
    // Do not keep thousands of past collider keys after a long run.
    if (this._impactCooldowns.size > 96) {
      for (const [key, time] of this._impactCooldowns) if (this._time - time > 4) this._impactCooldowns.delete(key);
    }
  }

  _solveWheelRotation(dt) {
    const wheels = this._wheels, c = this.controls;
    const constraints = [];
    if (c.frontLocked) constraints.push([1, -1, 0, 0]);
    if (c.rearLocked) constraints.push([0, 0, 1, -1]);
    // A part-time transfer case couples mean axle speeds. 4A permits slip.
    if (['4H', '4L'].includes(c.driveMode)) constraints.push([0.5, 0.5, -0.5, -0.5]);
    const basisKey = `${c.frontLocked}/${c.rearLocked}/${['4H', '4L'].includes(c.driveMode)}`;
    if (this._basisKey !== basisKey) { this._basisKey = basisKey; this._basis = nullspaceBasis(constraints); }
    const basis = this._basis, dimensions = basis[0].length;
    const oldOmega = wheels.map(w => w.omega);
    const gram = Array.from({ length: dimensions }, (_, j) => Array.from({ length: dimensions }, (_, k) => basis.reduce((sum, row) => sum + row[j] * row[k], 0)));
    let reduced = linearSolve(gram, Array.from({ length: dimensions }, (_, k) => basis.reduce((sum, row, i) => sum + row[k] * oldOmega[i], 0)));
    const coefficients = wheels.map(w => ({
      a: w.slipStiffness * w.radius * (1 / w.slipReference + dt / w.patchDecay / w.patchLength * w.staticWeight),
      b: w.slipStiffness * (-w.speedLong / w.slipReference + (w.longDeflection - dt * w.speedLong) / w.patchDecay / w.patchLength * w.staticWeight),
    }));
    const evaluate = values => {
      const omega = basis.map(row => row.reduce((sum, coefficient, k) => sum + coefficient * values[k], 0));
      const gradient = [], curvature = [];
      let energy = 0;
      for (let i = 0; i < 4; i++) {
        const w = wheels[i], speed = omega[i], { a, b } = coefficients[i];
        const phase = a * speed + b;
        const tire = combinedSlip(phase, w.lateralPhase), brake = Math.tanh(speed / 0.025), rolling = Math.tanh(speed / 0.8);
        gradient[i] = w.inertia * (speed - oldOmega[i]) / dt
          + w.longCapacity * w.radius * tire.longitudinal + w.brakeTorque * brake + w.rollingTorque * rolling - w.driveTorque;
        curvature[i] = w.inertia / dt + w.longCapacity * w.radius * a * tire.derivative
          + w.brakeTorque / 0.025 * (1 - brake ** 2) + w.rollingTorque / 0.8 * (1 - rolling ** 2);
        energy += w.inertia * (speed - oldOmega[i]) ** 2 / (2 * dt)
          + w.longCapacity * w.radius / a * tire.potential
          + w.brakeTorque * 0.025 * logCosh(speed / 0.025)
          + w.rollingTorque * 0.8 * logCosh(speed / 0.8) - w.driveTorque * speed;
      }
      return { omega, gradient, curvature, energy };
    };
    // Minimizing the convex implicit wheel energy in the constraint nullspace
    // prevents brake sign oscillation and satisfies every mechanical lock to
    // machine precision. The line search prevents a Newton step adding energy.
    for (let iteration = 0; iteration < 24; iteration++) {
      const current = evaluate(reduced);
      const gradient = Array.from({ length: dimensions }, (_, k) => basis.reduce((sum, row, i) => sum + row[k] * current.gradient[i], 0));
      if (Math.max(...gradient.map(Math.abs)) < 1e-5) break;
      const hessian = Array.from({ length: dimensions }, (_, j) => Array.from({ length: dimensions }, (_, k) => basis.reduce((sum, row, i) => sum + row[j] * current.curvature[i] * row[k], 0)));
      const delta = linearSolve(hessian, gradient.map(value => -value));
      if (Math.max(...delta.map(Math.abs)) < 1e-8) break;
      const descent = gradient.reduce((sum, value, i) => sum + value * delta[i], 0);
      let step = 1, accepted = false;
      for (let line = 0; line < 15; line++) {
        const candidate = reduced.map((value, i) => value + delta[i] * step);
        if (evaluate(candidate).energy <= current.energy + 1e-4 * step * descent + 1e-8) {
          reduced = candidate; accepted = true; break;
        }
        step *= 0.5;
      }
      if (!accepted) break;
    }
    const solution = evaluate(reduced).omega;
    for (let i = 0; i < 4; i++) {
      const w = wheels[i];
      w.omega = clamp(finite(solution[i]), -500, 500);
      w.slip = (w.omega * w.radius - w.speedLong) / w.slipReference;
      w.longDeflection = w.contact ? clamp((w.longDeflection + dt * (w.omega * w.radius - w.speedLong)) / w.patchDecay, -0.10, 0.10) : 0;
      const tire = combinedSlip((w.slip + w.longDeflection / w.patchLength * w.staticWeight) * w.slipStiffness, w.lateralPhase);
      w.longitudinalForce = w.longCapacity * tire.longitudinal;
      w.lateralForce = -w.capacity * 0.96 * tire.lateral;
    }
  }

  _applyChassisContacts(dt) {
    const body = this.body, spec = this.spec;
    this._chassisContact = false;
    const worldPoint = v3(), pointVelocity = v3();
    for (const local of this._bodyContactPoints) {
      body.pointToWorldFrame(local, worldPoint);
      const sample = this.terrain.sample(worldPoint.x, worldPoint.z);
      const penetration = sample.height - worldPoint.y;
      if (penetration <= 0) continue;
      this._chassisContact = true;
      const normal = v3(sample.normal?.x || 0, sample.normal?.y ?? 1, sample.normal?.z || 0);
      normal.normalize();
      body.getVelocityAtWorldPoint(worldPoint, pointVelocity);
      const normalVelocity = pointVelocity.dot(normal);
      if (normalVelocity < -3.2) this._queueImpact({
        obstacleId: 'terrain-body', obstacleType: 'terrain', point: worldPoint, normal, speed: -normalVelocity,
        effectiveMass: this._effectiveImpactMass(worldPoint, normal),
      });
      const normalLoad = clamp(penetration * spec.mass * 95 - normalVelocity * spec.mass * 2.8, 0, spec.mass * G * 2.5);
      const tangent = pointVelocity.vsub(normal.scale(normalVelocity));
      const tangentSpeed = tangent.length();
      const bodyFriction = clamp(finite(sample.bodyFriction, 0.48), 0.06, 1.1);
      const drag = tangentSpeed > 0.001 ? Math.min(normalLoad * bodyFriction, tangentSpeed * spec.mass / (dt * 14)) / tangentSpeed : 0;
      const force = normal.scale(normalLoad);
      force.x -= tangent.x * drag; force.y -= tangent.y * drag; force.z -= tangent.z * drag;
      body.applyForce(force, worldPoint.vsub(body.position));
    }
  }

  _publishState() {
    if (this._suspendPublish) return;
    const body = this.body, spec = this.spec;
    const forward = body.quaternion.vmult(v3(0, 0, 1));
    const right = body.quaternion.vmult(v3(-1, 0, 0));
    const up = body.quaternion.vmult(v3(0, 1, 0));
    const planarSpeed = body.velocity.length();
    const signed = body.velocity.dot(forward);
    const surfaceCounts = {};
    const surfaceMix = {};
    let contactWeight = 0, moistureTotal = 0;
    const wheelStates = this._wheels.map(w => {
      body.pointToWorldFrame(w.mount, w.mountWorld);
      body.quaternion.vmult(v3(0, -w.length, 0), w.position);
      w.position.vadd(w.mountWorld, w.position);
      surfaceCounts[w.surface] = (surfaceCounts[w.surface] || 0) + 1;
      const weight = w.contact ? Math.max(0, w.load) : 0;
      contactWeight += weight;
      moistureTotal += weight * finite(w.data?.moisture);
      for (const [detail, fraction] of Object.entries(w.data?.surfaceMix || {})) {
        surfaceMix[detail] = (surfaceMix[detail] || 0) + weight * fraction;
      }
      return {
        index: w.index, position: plain(w.position), ground: plain(w.ground),
        compression: w.compression, compressionRatio: w.compressionRatio,
        suspensionLength: w.length, steer: w.steer, rotation: w.rotation,
        complianceSteer: w.complianceSteer,
        omega: w.omega, load: w.load, slip: w.slip, lateralSlip: w.lateralSlip,
        speedLong: w.speedLong, speedLat: w.speedLat, velocity: plain(w.velocity), forward: plain(w.forward), right: plain(w.right),
        constructed: !!w.constructed, featureId: w.featureId || null,
        obstacleId: w.obstacleHit?.obstacleId || null, supportVelocity: plain(w.supportVelocity), waterDepth: finite(w.data?.waterDepth),
        snowDepth: finite(w.data?.snowDepth), tracked: !!spec.tracks,
        surface: w.surface, contact: w.contact, sink: w.sink, radius: w.radius,
        surfaceDetail: w.data?.surfaceDetail || w.surface,
        surfaceMix: { ...w.data?.surfaceMix }, moisture: finite(w.data?.moisture),
        grassFraction: finite(w.data?.grassFraction), gravelFraction: finite(w.data?.gravelFraction),
        unloadedRadius: w.unloadedRadius, normal: plain(w.normal), deflection: w.deflection,
        contactLength: w.contactLength, contactWidth: w.contactWidth,
        contactProfile: w.contactProfile.map(p => ({ ...p })),
        contactArea: w.contactArea, pressure: w.effectivePSI,
        damageTire: this.damage.tires[w.index], damageSuspension: this.damage.suspension[w.index],
        longitudinalForce: w.longitudinalForce, lateralForce: w.lateralForce,
        soilLongitudinalForce: w.soilLongitudinalForce, soilLateralForce: w.soilLateralForce,
        soilDragForce: Math.hypot(w.soilLongitudinalForce, w.soilLateralForce),
        frictionCoefficient: w.mu, driveTorque: w.driveTorque,
        peakFrictionCoefficient: w.peakMu, slidingGripRetention: w.slidingGripRetention,
        corneringStiffness: w.corneringStiffness || 0,
        longitudinalStiffness: w.longitudinalStiffness || 0,
        relaxationLength: w.relaxationLength,
        frictionUtilization: w.capacity > 0 ? Math.hypot(w.longitudinalForce, w.lateralForce) / w.capacity : 0,
        tractionActive: w.tcActive, absActive: w.absActive,
      };
    });
    const terrain = Object.entries(surfaceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || this.terrain.sample(body.position.x, body.position.z).surface;
    for (const key of Object.keys(surfaceMix)) surfaceMix[key] /= Math.max(1, contactWeight);
    const dominantDetail = Object.entries(surfaceMix).sort((a, b) => b[1] - a[1])[0];
    this.state = {
      position: plain(body.position), quaternion: { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w },
      velocity: plain(body.velocity), angularVelocity: plain(body.angularVelocity),
      heading: Math.atan2(forward.x, forward.z),
      speed: planarSpeed * (signed < -0.05 ? -1 : 1), speedKmh: planarSpeed * 3.6, speedMph: planarSpeed * 2.236936,
      rpm: this._rpm, gear: this.controls.selector === 'R' ? 'R' : ['N', 'P'].includes(this.controls.selector) ? this.controls.selector : spec.transmissionType === 'electric' ? 'D' : spec.transmissionType === 'cvt' ? 'CVT' : this._gear + 1,
      gearRatio: this.controls.selector === 'R' ? spec.reverseRatio : this._ratio,
      ...this.controls,
      requestedControls: { ...this._requests },
      range: this.controls.driveMode === '4L' ? 'low' : 'high',
      shiftInProgress: this._shiftTimer > 0,
      electricDrive: this._electric, airSuspensionLift: this._airSuspensionLift || 0, rearSteerAngle: this._rearSteer || 0,
      launchPhase: this._launchPhase || 'off', regenerativePowerKW: (this._evOutput?.regenPowerW || 0) / 1000,
      motorRPM: this._evOutput?.motorRPM ? [...this._evOutput.motorRPM] : null,
      engineTorque: this._engineTorque, torqueNm: this._engineTorque,
      requestedEngineTorque: this._requestedEngineTorque || 0,
      tractionIntervention: { active: this.controls.tractionControl && this.controls.engineOn
        && this._driverInput.throttle > 0.04 && !['P', 'N'].includes(this.controls.selector)
        && this._tcTorqueScale < 0.985, torqueScale: this._tcTorqueScale,
        slipTarget: this._tcSlipTarget, measuredSlip: this._tcMeasuredSlip },
      powerKW: this._electric ? (this._evOutput?.positivePowerW || 0) / 1000 : this._engineTorque * this._rpm * TAU / 60 / 1000,
      engineLoad: this._driverInput.throttle,
      driverInput: { ...this._driverInput },
      directionChangePending: this._directionTarget,
      directionChangeHold: clamp(this._directionStopTime / DIRECTION_STOP_HOLD, 0, 1),
      manualReverse: this._manualReverse,
      parkingBrake: { ...this._parkingBrake, wheels: [...this._parkingBrake.wheels] },
      steeringAssist: { limited: !!this._steeringLimited, limit: this._steeringLimit ?? 0.59, angle: this._steer,
        mode: this._steeringMode || 'direct-analog', responseRate: this._steeringRate ?? 5.5, slewRate: this._steeringSlew },
      damage: this.getDamage(),
      impacts: this._impacts.map(impact => ({ ...impact, point: { ...impact.point }, normal: { ...impact.normal }, localPoint: { ...impact.localPoint }, localNormal: { ...impact.localNormal } })),
      frontTorqueFraction: this._frontShare ?? (this.controls.driveMode === 'FWD' ? 1 : 0),
      wheels: wheelStates,
      roll: Math.atan2(right.y, up.y), pitch: Math.atan2(forward.y, Math.hypot(forward.x, forward.z)),
      terrain, terrainDetail: dominantDetail ? dominantDetail[1] >= 0.60 ? dominantDetail[0] : 'mixed' : null,
      terrainMoisture: contactWeight > 0 ? moistureTotal / contactWeight : 0, surfaceMix,
      waterDepth: this._waterDepth || 0, odometer: this._odometer,
      groundedWheels: this._groundedWheels,
      stuck: this._stuckTime > 3, highCentered: !!this._chassisContact,
      tractionActive: this._wheels.some(w => w.tcActive), absActive: this._wheels.some(w => w.absActive),
      notice: this._notice, simTime: this._time,
    };
  }
}

export default VehiclePhysics;
