/**
 * Estimated tire/ground response, in SI units. These profiles describe the
 * proving ground's chosen materials, not universal coefficients or fitted OEM
 * tire data. See docs/surfaces-v1.7.md for evidence and calibration boundaries.
 */
import { NATURAL_GLSL, trailCenterAt } from './terrain-diversity.js?v=1.15.0';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const freeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); return Object.freeze(value); };
const radians = degrees => degrees * Math.PI / 180;
const weighted = (a, b, c, wa, wb, wc) => a * wa + b * wb + c * wc;

// The JS contact sampler and terrain shader consume the same map dimensions.
// The outer footprints preserve the earlier grass/trail boundary exactly;
// loose aggregate occupies the outer part of each bare ribbon.
export const DIRT_COVER = freeze({
  feather: .6,
  trailHalfWidth: 5.2, trailCoreHalfWidth: 3.3, trailHalfLength: 257,
  connectorCenterZ: -32, connectorHalfWidth: 4.1, connectorCoreHalfWidth: 2.7,
  connectorMinX: -107, connectorMaxX: 204,
  rockAccessCenterZ: 40, rockAccessHalfWidth: 3.2, rockAccessCoreHalfWidth: 2.15,
  rockAccessMinX: 0, rockAccessMaxX: 116,
  vergeCenterX: -108, vergeHalfWidth: 12, vergeMinZ: -241, vergeMaxZ: 246,
});

export function dirtCoverAt(x, z, trailX = trailCenterAt(z)) {
  const c = DIRT_COVER;
  const band = (distance, width) => 1 - smooth(width - c.feather, width + c.feather, distance);
  const span = (value, low, high) => smooth(low - c.feather, low + c.feather, value) * (1 - smooth(high - c.feather, high + c.feather, value));
  const trailSpan = band(Math.abs(z), c.trailHalfLength);
  const connectorSpan = span(x, c.connectorMinX, c.connectorMaxX);
  const rockSpan = span(x, c.rockAccessMinX, c.rockAccessMaxX);
  const trailOffset = Math.abs(x - trailX), connectorOffset = Math.abs(z - c.connectorCenterZ), rockOffset = Math.abs(z - c.rockAccessCenterZ);
  const bare = Math.max(
    band(trailOffset, c.trailHalfWidth) * trailSpan,
    band(connectorOffset, c.connectorHalfWidth) * connectorSpan,
    band(rockOffset, c.rockAccessHalfWidth) * rockSpan,
    band(Math.abs(x - c.vergeCenterX), c.vergeHalfWidth) * span(z, c.vergeMinZ, c.vergeMaxZ),
  );
  const hardpack = Math.min(bare, Math.max(
    band(trailOffset, c.trailCoreHalfWidth) * trailSpan,
    band(connectorOffset, c.connectorCoreHalfWidth) * connectorSpan,
    band(rockOffset, c.rockAccessCoreHalfWidth) * rockSpan,
  ));
  return { hardpack, gravel: Math.max(0, bare - hardpack), grass: 1 - bare };
}

// Generated from the same dimensions as dirtCoverAt(). Components are
// hardpack / gravel / grass. The shader's world X/Z correspond to p.x/p.y.
const gl = number => Number.isInteger(number) ? number.toFixed(1) : String(number);
const c = DIRT_COVER;
export const DIRT_COVER_GLSL = `
${NATURAL_GLSL}
float terraCoverBand(float d, float w) { return 1.0-smoothstep(w-${gl(c.feather)},w+${gl(c.feather)},d); }
float terraCoverSpan(float p,float a,float b) { return smoothstep(a-${gl(c.feather)},a+${gl(c.feather)},p)*(1.0-smoothstep(b-${gl(c.feather)},b+${gl(c.feather)},p)); }
vec3 terraDirtCover(vec2 p) {
  float trailX=tdTrailCenter(p.y);
  float trailSpan=terraCoverBand(abs(p.y),${gl(c.trailHalfLength)});
  float connectorSpan=terraCoverSpan(p.x,${gl(c.connectorMinX)},${gl(c.connectorMaxX)});
  float rockSpan=terraCoverSpan(p.x,${gl(c.rockAccessMinX)},${gl(c.rockAccessMaxX)});
  float td=abs(p.x-trailX),cd=abs(p.y-(${gl(c.connectorCenterZ)})),rd=abs(p.y-${gl(c.rockAccessCenterZ)});
  float bare=max(max(terraCoverBand(td,${gl(c.trailHalfWidth)})*trailSpan,terraCoverBand(cd,${gl(c.connectorHalfWidth)})*connectorSpan),max(terraCoverBand(rd,${gl(c.rockAccessHalfWidth)})*rockSpan,terraCoverBand(abs(p.x-(${gl(c.vergeCenterX)})),${gl(c.vergeHalfWidth)})*terraCoverSpan(p.y,${gl(c.vergeMinZ)},${gl(c.vergeMaxZ)})));
  float firm=min(bare,max(terraCoverBand(td,${gl(c.trailCoreHalfWidth)})*trailSpan,max(terraCoverBand(cd,${gl(c.connectorCoreHalfWidth)})*connectorSpan,terraCoverBand(rd,${gl(c.rockAccessCoreHalfWidth)})*rockSpan)));
  return vec3(firm,max(0.0,bare-firm),1.0-bare);
}
`;

// Pairs are [dry weather, full rain]. Mud and marsh are wet substrates even
// under a clear sky; the weather pair must not be interpreted as dry clay.
// Stiffness is force per reference normal load, per radian / slip ratio.
export const SURFACE_RESPONSE_PROFILES = freeze({
  snow: {
    mu: [.30, .24], rolling: [.085, .12], softness: [.88, .94], bodyFriction: [.22, .18],
    soilRollingShare: .88,
    lateral: 3.4, longitudinal: 3.0, loadSensitivity: .035, stiffnessExponent: .94, relaxation: 1.34,
    slideRetention: [.78, .70], tractionSlip: .22, compactionGrip: .28, compactionRolling: .46, churnGrip: .13, churnRolling: .20,
    cohesion: [650, 950], density: 290, frictionAngle: [22, 18], lateralScale: .82, sinkWetScale: 1,
  },
  asphalt: {
    mu: [.98, .74], rolling: [.013, .014], softness: [0, 0], bodyFriction: [.60, .42],
    soilRollingShare: 0,
    lateral: 15.0, longitudinal: 12.3, loadSensitivity: .10, stiffnessExponent: .82, relaxation: 1.00,
    slideRetention: [.88, .84], tractionSlip: .14, compactionGrip: 0, compactionRolling: 0, churnGrip: 0, churnRolling: 0,
    cohesion: [0, 0], density: 0, frictionAngle: [0, 0], lateralScale: 0, sinkWetScale: 1,
  },
  hardpack: {
    mu: [.76, .56], rolling: [.028, .041], softness: [.06, .0684], bodyFriction: [.52, .42],
    soilRollingShare: .40,
    lateral: 10.5, longitudinal: 8.8, loadSensitivity: .08, stiffnessExponent: .86, relaxation: 1.02,
    slideRetention: [.90, .84], tractionSlip: .17, compactionGrip: .04, compactionRolling: .12, churnGrip: .05, churnRolling: .06,
    cohesion: [3500, 1800], density: 1750, frictionAngle: [28, 24], lateralScale: .65, sinkWetScale: 1,
  },
  gravel: {
    mu: [.63, .57], rolling: [.045, .049], softness: [.06, .0684], bodyFriction: [.48, .44],
    soilRollingShare: .65,
    lateral: 6.3, longitudinal: 5.7, loadSensitivity: .07, stiffnessExponent: .88, relaxation: 1.14,
    slideRetention: [.82, .80], tractionSlip: .20, compactionGrip: .10, compactionRolling: .20, churnGrip: .08, churnRolling: .10,
    cohesion: [0, 150], density: 1700, frictionAngle: [33, 32], lateralScale: .75, sinkWetScale: 1,
  },
  grass: {
    mu: [.46, .32], rolling: [.046, .060], softness: [.06, .0684], bodyFriction: [.44, .28],
    soilRollingShare: .65,
    lateral: 7.2, longitudinal: 5.4, loadSensitivity: .07, stiffnessExponent: .90, relaxation: 1.05,
    slideRetention: [.80, .72], tractionSlip: .15, compactionGrip: .02, compactionRolling: .14, churnGrip: .08, churnRolling: .08,
    cohesion: [2600, 1800], density: 1400, frictionAngle: [24, 20], lateralScale: .75, sinkWetScale: 1,
  },
  rock: {
    mu: [.90, .65], rolling: [.036, .038], softness: [0, 0], bodyFriction: [.64, .46],
    soilRollingShare: 0,
    lateral: 12.5, longitudinal: 10.8, loadSensitivity: .10, stiffnessExponent: .83, relaxation: .96,
    slideRetention: [.90, .83], tractionSlip: .16, compactionGrip: 0, compactionRolling: 0, churnGrip: 0, churnRolling: 0,
    cohesion: [0, 0], density: 0, frictionAngle: [0, 0], lateralScale: 0, sinkWetScale: 1,
  },
  mud: {
    mu: [.40, .30], rolling: [.100, .140], softness: [.83, .9462], bodyFriction: [.38, .30],
    soilRollingShare: .85,
    lateral: 3.8, longitudinal: 2.9, loadSensitivity: .04, stiffnessExponent: .94, relaxation: 1.30,
    slideRetention: [.92, .88], tractionSlip: .24, compactionGrip: .01, compactionRolling: .03, churnGrip: .23, churnRolling: .22,
    cohesion: [1200, 900], density: 1650, frictionAngle: [16, 12], lateralScale: 1, sinkWetScale: 1.12,
  },
  wetland: {
    mu: [.34, .29], rolling: [.125, .155], softness: [.76, .8664], bodyFriction: [.28, .23],
    soilRollingShare: .88,
    lateral: 2.8, longitudinal: 2.0, loadSensitivity: .04, stiffnessExponent: .93, relaxation: 1.42,
    slideRetention: [.86, .80], tractionSlip: .23, compactionGrip: 0, compactionRolling: .02, churnGrip: .20, churnRolling: .20,
    cohesion: [700, 500], density: 1200, frictionAngle: [12, 10], lateralScale: 1, sinkWetScale: 1.12,
  },
  sand: {
    mu: [.60, .64], rolling: [.085, .078], softness: [.66, .62], bodyFriction: [.48, .51],
    soilRollingShare: .84,
    lateral: 5.8, longitudinal: 4.5, loadSensitivity: .06, stiffnessExponent: .90, relaxation: 1.20,
    slideRetention: [.96, .95], tractionSlip: .23, compactionGrip: .13, compactionRolling: .22, churnGrip: .08, churnRolling: .12,
    cohesion: [100, 650], density: 1550, frictionAngle: [30, 31], lateralScale: 1, sinkWetScale: .86,
  },
});

function buildMaterialResponse(id, wet, compaction, churn) {
  const p = SURFACE_RESPONSE_PROFILES[id] || SURFACE_RESPONSE_PROFILES.hardpack;
  const pair = values => mix(values[0], values[1], wet);
  // Rolling pressure densifies loose granular material; high slip remoulds
  // wet fines or loosens grains again. They are distinct persisted states.
  const firmed = compaction * (1 - churn * .75);
  const grip = 1 + p.compactionGrip * firmed - p.churnGrip * churn;
  const stiffness = 1 + p.compactionGrip * firmed * .75 - p.churnGrip * churn * .60;
  const rollingResistance = pair(p.rolling) * (1 - p.compactionRolling * firmed + p.churnRolling * churn);
  return {
    mu: pair(p.mu) * grip,
    rollingResistance,
    softness: pair(p.softness), bodyFriction: pair(p.bodyFriction),
    moisture: id === 'mud' ? mix(.72, 1, wet) : id === 'wetland' ? mix(.90, 1, wet) : wet,
    sinkWetScale: mix(1, p.sinkWetScale, wet),
    tireResponse: {
      lateral: p.lateral * stiffness, longitudinal: p.longitudinal * stiffness,
      loadSensitivity: p.loadSensitivity, stiffnessExponent: p.stiffnessExponent,
      relaxation: p.relaxation * (1 + churn * p.churnGrip * .3),
      slideRetention: pair(p.slideRetention), slideStart: 2.5, slideEnd: 7,
      tractionSlip: p.tractionSlip,
    },
    soil: {
      cohesionPa: pair(p.cohesion) * (1 - churn * (id === 'mud' || id === 'wetland' ? .40 : .15)),
      densityKgM3: p.density * (1 + firmed * .08),
      frictionAngleRad: radians(pair(p.frictionAngle) + (id === 'sand' || id === 'gravel' ? firmed * 1.5 : 0)),
      lateralScale: p.lateralScale,
      // Partition the existing total loss before mixing material fractions.
      // This part resists translation through soil even with a locked wheel;
      // the remainder represents rotational tire loss. Shares are estimates.
      rollingResistance: rollingResistance * p.soilRollingShare,
    },
  };
}

// Reuse only exact, pristine weather endpoints. Every shared object and its
// nested coefficients are immutable; intermediate moisture, compaction and
// churn always take the continuous calculation path below. No state is rounded
// or retained from a previous contact, and this bounded cache cannot grow.
const freshResponses = freeze(Object.fromEntries(Object.keys(SURFACE_RESPONSE_PROFILES).map(id => [id,
  [buildMaterialResponse(id, 0, 0, 0), buildMaterialResponse(id, 1, 0, 0)],
])));

function materialResponse(id, wet, compaction, churn) {
  if (compaction === 0 && churn === 0 && (wet === 0 || wet === 1) && Object.hasOwn(freshResponses, id)) return freshResponses[id][wet];
  return buildMaterialResponse(id, wet, compaction, churn);
}

function blendResponses(a, b, c, wa, wb, wc) {
  const at = a.tireResponse, bt = b.tireResponse, ct = c.tireResponse;
  const as = a.soil, bs = b.soil, cs = c.soil;
  // Keep hardpack / gravel / grass arithmetic order identical to the generic
  // accumulator. Explicit fields avoid per-contact Object.entries arrays.
  return {
    mu: weighted(a.mu, b.mu, c.mu, wa, wb, wc),
    rollingResistance: weighted(a.rollingResistance, b.rollingResistance, c.rollingResistance, wa, wb, wc),
    softness: weighted(a.softness, b.softness, c.softness, wa, wb, wc),
    bodyFriction: weighted(a.bodyFriction, b.bodyFriction, c.bodyFriction, wa, wb, wc),
    moisture: weighted(a.moisture, b.moisture, c.moisture, wa, wb, wc),
    sinkWetScale: weighted(a.sinkWetScale, b.sinkWetScale, c.sinkWetScale, wa, wb, wc),
    tireResponse: {
      lateral: weighted(at.lateral, bt.lateral, ct.lateral, wa, wb, wc),
      longitudinal: weighted(at.longitudinal, bt.longitudinal, ct.longitudinal, wa, wb, wc),
      loadSensitivity: weighted(at.loadSensitivity, bt.loadSensitivity, ct.loadSensitivity, wa, wb, wc),
      stiffnessExponent: weighted(at.stiffnessExponent, bt.stiffnessExponent, ct.stiffnessExponent, wa, wb, wc),
      relaxation: weighted(at.relaxation, bt.relaxation, ct.relaxation, wa, wb, wc),
      slideRetention: weighted(at.slideRetention, bt.slideRetention, ct.slideRetention, wa, wb, wc),
      slideStart: weighted(at.slideStart, bt.slideStart, ct.slideStart, wa, wb, wc),
      slideEnd: weighted(at.slideEnd, bt.slideEnd, ct.slideEnd, wa, wb, wc),
      tractionSlip: weighted(at.tractionSlip, bt.tractionSlip, ct.tractionSlip, wa, wb, wc),
    },
    soil: {
      cohesionPa: weighted(as.cohesionPa, bs.cohesionPa, cs.cohesionPa, wa, wb, wc),
      densityKgM3: weighted(as.densityKgM3, bs.densityKgM3, cs.densityKgM3, wa, wb, wc),
      frictionAngleRad: weighted(as.frictionAngleRad, bs.frictionAngleRad, cs.frictionAngleRad, wa, wb, wc),
      lateralScale: weighted(as.lateralScale, bs.lateralScale, cs.lateralScale, wa, wb, wc),
      rollingResistance: weighted(as.rollingResistance, bs.rollingResistance, cs.rollingResistance, wa, wb, wc),
    },
  };
}

/** Resolve contact coefficients independently of height/normal geometry. */
export function surfaceResponse(surface, { moisture = 0, compaction = 0, churn = 0, hardpackFraction, gravelFraction = 0, grassFraction = 0 } = {}) {
  const wet = clamp(Number(moisture) || 0, 0, 1), packed = clamp(Number(compaction) || 0, 0, 1), disturbed = clamp(Number(churn) || 0, 0, 1);
  if (surface !== 'dirt') return materialResponse(surface, wet, packed, disturbed);
  const grass = clamp(Number(grassFraction) || 0, 0, 1), gravel = clamp(Number(gravelFraction) || 0, 0, 1 - grass);
  // hardpackFraction is accepted for diagnostic clarity; cover conservation
  // takes precedence if an external caller supplies inconsistent fractions.
  const hardpack = 1 - grass - gravel;
  if (hardpack >= 1) return materialResponse('hardpack', wet, packed, disturbed);
  if (grass >= 1) return materialResponse('grass', wet, packed, disturbed);
  if (gravel >= 1) return materialResponse('gravel', wet, packed, disturbed);
  return blendResponses(
    materialResponse('hardpack', wet, packed, disturbed),
    materialResponse('gravel', wet, packed, disturbed),
    materialResponse('grass', wet, packed, disturbed),
    hardpack, gravel, grass,
  );
}

const metadata = {
  snow: { name: 'Snow / powder', maxSink: .64, color: '#dce7ed' },
  asphalt: { name: 'Paved road', maxSink: 0, color: '#565b58' },
  dirt: { name: 'Trail / verge', maxSink: .012, color: '#91816a' },
  rock: { name: 'Rock', maxSink: 0, color: '#928f7d' },
  mud: { name: 'Deep mud', maxSink: .39, color: '#67523e' },
  wetland: { name: 'Wetland', maxSink: .32, color: '#58614b' },
  sand: { name: 'Loose sand', maxSink: .27, color: '#c3aa75' },
};
// The original six IDs remain compatible with garage upgrades and saved builds;
// snow adds a seventh. Flat reference fixtures receive exactly the fresh/dry material model.
export const SURFACES = freeze(Object.fromEntries(Object.entries(metadata).map(([id, info]) => [id, { ...info, ...surfaceResponse(id) }])));
