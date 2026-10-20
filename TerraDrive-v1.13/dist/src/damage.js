/**
 * An energy-driven, deliberately estimated damage model. This is a game-scale
 * approximation of crumpling and component failure, not a crash/occupant model.
 * All persistent fractions use 0 = intact, 1 = destroyed, except condition.
 */
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const accumulate = (old, dose) => clamp(1 - (1 - old) * Math.exp(-Math.max(0, dose)));
const copyVector = v => ({ x: v.x, y: v.y, z: v.z });

function retainDent(dents, dent) {
  const candidates = dents.map(old => ({
    old, distance: Math.hypot(old.point.x - dent.point.x, old.point.y - dent.point.y, old.point.z - dent.point.z),
    alignment: old.normal.x * dent.normal.x + old.normal.y * dent.normal.y + old.normal.z * dent.normal.z,
  }));
  let cluster = candidates.filter(c => c.alignment > 0.65 && c.distance < Math.min(c.old.radius, dent.radius) * 0.65)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!cluster && dents.length < 28) { dents.push(dent); return; }
  if (!cluster) {
    const facing = candidates.filter(c => c.alignment > 0.25);
    cluster = (facing.length ? facing : candidates).sort((a, b) => (a.distance + (1 - a.alignment) * 3) - (b.distance + (1 - b.alignment) * 3))[0];
  }
  const old = cluster.old;
  // Retain the old center/normal and never reduce its radius or depth. This
  // bounded footprint consolidation cannot make earlier damage disappear.
  old.radius = Math.max(old.radius, cluster.distance + dent.radius);
  old.depth = 0.36 * (1 - (1 - old.depth / 0.36) * (1 - dent.depth / 0.36));
  old.severity = 1 - (1 - old.severity) * (1 - dent.severity);
}

export function createDamage(revision = 0) {
  return { revision, condition: 1, body: 0, engine: 0, suspension: [0, 0, 0, 0], tires: [0, 0, 0, 0], disabled: false, dents: [] };
}

export function damageSnapshot(damage) {
  return {
    ...damage, suspension: [...damage.suspension], tires: [...damage.tires],
    dents: damage.dents.map(d => ({ ...d, point: copyVector(d.point), normal: copyVector(d.normal) })),
  };
}

export function applyImpactDamage(damage, impact, spec, wheelPoints) {
  const landing = impact.obstacleType === 'landing';
  const scrape = impact.obstacleType === 'terrain';
  // Persistent contact loads, gravity and normal suspension travel carry no
  // damage dose. Only energy above a normal closing-speed threshold counts.
  const threshold = landing ? 4.6 : scrape ? 3.2 : 1.6;
  if (impact.speed <= threshold || !Number.isFinite(impact.energy) || impact.energy <= 0) return false;
  const normalMass = 2 * impact.energy / (impact.speed * impact.speed);
  const excessEnergy = 0.5 * normalMass * (impact.speed * impact.speed - threshold * threshold);
  const specific = excessEnergy / spec.mass; // J/kg, explicit mass-normalized calibration
  if (specific < 0.06) return false;
  const point = impact.localPoint;
  const outward = impact.localNormal; // vehicle outward, opposite obstacle support normal
  const front = clamp((point.z + spec.wheelbase * 0.15) / (spec.length * 0.52));
  const underbody = clamp((-point.y + 0.12) / Math.max(0.25, spec.cgHeight));
  const bodyDose = specific / (landing ? 170 : scrape ? 135 : 90);
  damage.body = accumulate(damage.body, bodyDose);
  damage.engine = accumulate(damage.engine, specific * (landing ? 0.14 : 0.09 + 0.91 * front) / 82);
  let nearestDistance = Infinity;
  wheelPoints.forEach(wheel => {
    const distance = Math.hypot(point.x - wheel.x, point.y - wheel.y, point.z - wheel.z);
    if (distance < nearestDistance) nearestDistance = distance;
  });
  for (let i = 0; i < 4; i++) {
    const wheel = wheelPoints[i];
    const distance = Math.hypot(point.x - wheel.x, point.y - wheel.y, point.z - wheel.z);
    const proximity = Math.exp(-distance * distance / 1.35);
    const localLanding = landing && i === impact.wheelIndex;
    const suspensionDose = localLanding ? specific / 9 : specific * (0.07 + proximity * (0.95 + 0.55 * underbody)) / 62;
    const tireDose = localLanding ? specific / 24 : specific * proximity * (distance < nearestDistance + 0.15 ? 1.3 : 0.65) / 48;
    damage.suspension[i] = accumulate(damage.suspension[i], suspensionDose);
    damage.tires[i] = accumulate(damage.tires[i], tireDose);
  }
  const severity = clamp(1 - Math.exp(-specific / (landing ? 28 : 48)));
  // Landings mainly hurt springs/rims. Underbody strikes still leave a dent.
  if (!landing && severity > 0.007) {
    retainDent(damage.dents, {
      id: impact.id, point: copyVector(point), normal: copyVector(outward),
      radius: clamp(0.26 + Math.sqrt(severity) * 0.85, 0.28, 1.15),
      depth: clamp(0.012 + severity * 0.34, 0.015, 0.36), severity,
    });
  }
  const suspensionMean = damage.suspension.reduce((a, b) => a + b, 0) / 4;
  const tireMean = damage.tires.reduce((a, b) => a + b, 0) / 4;
  damage.condition = clamp(1 - damage.body * 0.28 - damage.engine * 0.40 - suspensionMean * 0.22 - tireMean * 0.10);
  damage.disabled = damage.disabled || damage.engine >= 0.84 || damage.body >= 0.94
    || damage.suspension.some(d => d >= 0.97) || damage.suspension.filter(d => d >= 0.88).length >= 2;
  damage.revision++;
  return true;
}

export function tirePressureFactor(damage) {
  const leak = clamp((damage - 0.18) / 0.72);
  return 1 - 0.94 * leak * leak * (3 - 2 * leak);
}
