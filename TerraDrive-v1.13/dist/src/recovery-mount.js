/** Optional simulation aftermarket kit. Coordinates follow the actual model fascia,
 * rather than half the catalogue length (which includes SUV rear spare tires).
 * +Z forward, +Y up, +X driver-left; distances are metres.
 */
const BODY_FAIRLEADS = Object.freeze({
  jeep: Object.freeze({ x: 0, y: .62, z: 2.43 }),
  bronco: Object.freeze({ x: 0, y: .62, z: 2.46 }),
  sedan: Object.freeze({ x: 0, y: .37, z: 2.43 }),
  van: Object.freeze({ x: 0, y: .58, z: 3.03 }),
});

export function winchBodyMount(spec) {
  const point = BODY_FAIRLEADS[spec.bodyStyle] || { x: 0, y: .62, z: spec.length / 2 + .06 };
  return { ...point };
}

/** Physical body rise from the installed tire radius and suspension kit. */
export function vehicleBodyRise(spec) {
  const factoryRadius = spec.visualBase?.tireRadius ?? spec.tireRadius;
  return (spec.tireRadius - factoryRadius) + (spec.suspension?.lift || 0);
}

/** Body-origin to effective centre-of-mass offset, including added-mass shifts. */
export function vehicleBodyDatum(spec) {
  return (spec.cgHeight ?? .76) - vehicleBodyRise(spec);
}

/** Plain chassis-local point shared by the cable renderer and force solver. */
export function winchMountLocal(spec) {
  const point = winchBodyMount(spec);
  return {
    x: point.x,
    y: point.y - vehicleBodyDatum(spec),
    z: point.z + (.5 - (spec.frontWeightFraction ?? .5)) * spec.wheelbase,
  };
}
