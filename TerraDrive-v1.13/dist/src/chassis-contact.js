import * as CANNON from '../vendor/cannon-es.js';

// Conservative bumper underside heights, in the model's nominal ground datum.
// Measured against the shipped exterior meshes, rounded slightly downward.
// These are simplified collision envelopes, not manufacturer crash geometry.
// The central underbody uses the vehicle/build's existing clearance instead.
// Evidence: docs/collision-terrain-v1.13/baseline-chassis-geometry.json.
const BUMPERS = Object.freeze({
  'wrangler-rubicon': { front: .45, rear: .38 },
  'bronco-badlands': { front: .46, rear: .40 },
  'civic-sport': { front: .275, rear: .195 },
  'sprinter-2500': { front: .39, rear: .375 },
  'hummer-ev-suv-3x': { front: .475, rear: .52 },
});
const V = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);

/** A raised overhang lets a tire reach a log below the visible bumper. The
 * prior single box extended to an imaginary low floor ahead of the wheels.
 * Three simple boxes retain robust convex collision and a low underbody, while
 * leaving the approach/departure volume below each bumper genuinely open.
 * The old inertial tensor is deliberately retained: this geometry repair must
 * not silently change the separately estimated handling/rollover calibration.
 */
export function installChassisShapes(body, spec, bodyDatum) {
  const base = spec.visualBase || spec;
  const width = spec.width || spec.track + .25, length = spec.length || spec.wheelbase + 1.1;
  const height = Math.min(base.height * .67, 1.65), halfWidth = width * .46;
  const midpoint = spec.wheelbase * (.5 - (spec.frontWeightFraction ?? .5));
  const halfLength = length * .44, axleHalf = spec.wheelbase * .5;
  const clearance = (base.clearance ?? spec.clearance) + bodyDatum;
  const bumpers = BUMPERS[base.id] || { front: base.clearance + .12, rear: base.clearance + .10 };
  const top = height * .5 + (spec.visualBase ? spec.tireRadius - base.tireRadius + (spec.suspension.lift || 0) : 0);
  const definitions = [
    { id: 'underbody', from: -axleHalf + midpoint, to: axleHalf + midpoint, bottom: clearance },
    { id: 'front-overhang', from: axleHalf + midpoint, to: halfLength + midpoint, bottom: bumpers.front + bodyDatum },
    { id: 'rear-overhang', from: -halfLength + midpoint, to: -axleHalf + midpoint, bottom: bumpers.rear + bodyDatum },
  ];
  for (const part of definitions) {
    const halfHeight = Math.max(.05, (top - part.bottom) * .5), halfZ = Math.max(.025, (part.to - part.from) * .5);
    const shape = new CANNON.Box(V(halfWidth, halfHeight, halfZ)); shape.terraChassisPart = part.id;
    body.addShape(shape, V(0, part.bottom + halfHeight, (part.from + part.to) * .5));
  }
  const reference = new CANNON.Box(V(halfWidth, height * .5, halfLength));
  reference.calculateLocalInertia(spec.mass, body.inertia);
  body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
  body.updateInertiaWorld(true);
  body.terraChassisEnvelope = definitions.map(part => ({ ...part, top, halfWidth }));
  return body.terraChassisEnvelope;
}
