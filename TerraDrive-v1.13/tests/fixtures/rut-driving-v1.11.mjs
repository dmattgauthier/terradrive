/**
 * Ordinary production driving inputs and immutable inspection cameras.
 * Camera heights were measured on published v1.10 commit
 * 2610ff9c1f89cf11ec2288f1b438b515372fbb88 before driving. They must not be
 * re-derived from each deformed/new source, which would move the comparison.
 * The actual chase camera is separately marked as vehicle-tracking.
 */
export const RUT_DRIVING_STUDY = Object.freeze({
  version: 1,
  referenceCommit: '2610ff9c1f89cf11ec2288f1b438b515372fbb88',
  vehicle: 'wrangler-rubicon',
  frameDT: 1 / 60,
  seconds: 10,
  settleSeconds: 1.5,
  throttle: .38,
  pressurePSI: 37,
  driveMode: '4H',
  routes: [
    { id: 'mud', spawn: { x: 48, z: -163, heading: 0 },
      eye: [51.3, 6.91502845287323, -161.8], target: [48, 3.38502845287323, -156.7] },
    { id: 'sand', spawn: { x: 195, z: -178, heading: 0 },
      eye: [198.3, 12.237568616867065, -176.8], target: [195, 8.707568616867066, -171.7] },
    { id: 'trail', spawn: { x: -3, z: -44, heading: 0 },
      eye: [.3, 6.734955787658691, -42.8], target: [-3, 3.2049557876586916, -37.7] },
  ],
});
