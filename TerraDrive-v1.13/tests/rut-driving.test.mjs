/** Positive ordinary-driving controls for unilateral footprint/soil contact.
 * The older direct-stamp fixtures cannot catch a wheel-contact integration
 * regression because they do not receive VehiclePhysics support planes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSimulation } from './surface-metrics.mjs';
import { measureRutRoute } from './rut-driving-metrics.mjs';

const api = await loadSimulation(process.env.TERRA_RUT_SOURCE_ROOT);
const vehicle = id => api.VEHICLES.find(spec => spec.id === id);
const routes = new Map();
function route(id, surface, options = {}) {
  const key = JSON.stringify([id, surface, options]);
  if (!routes.has(key)) routes.set(key, measureRutRoute(api, vehicle(id), { surface, ...options }));
  return routes.get(key);
}
function completed(row) {
  assert.ok(row.distanceM >= 20 && row.distanceM < 20.2, row.id + ' completes the prescribed rolling path');
  assert.ok(row.forwardM > 18, 'Progress is along new ground, not accumulated motion while stationary');
  assert.equal(row.condition, 1, 'Normal travel must not damage the vehicle');
  assert.equal(row.soil.full, false, 'A short, fresh run must not hit the terrain budget');
  assert.ok(row.trailing.count > 300, 'Sample the tire paths after excluding the first and final two metres');
}

test('stock driven contacts leave persistent mud and sand tracks after leaving the contact patch', () => {
  // RWD off-road tires, FWD road tires, and unequal-pressure commercial tires
  // exercise distinct axle loads and footprints without upgrades or lockers.
  for (const [id, surface] of [['wrangler-rubicon', 'mud'], ['civic-sport', 'sand'], ['sprinter-2500', 'sand']]) {
    const row = route(id, surface); completed(row);
    assert.equal(row.controls.driveMode, vehicle(id).defaultMode);
    assert.equal(row.controls.frontPSI, vehicle(id).stockPSIFront);
    assert.equal(row.controls.rearPSI, vehicle(id).stockPSIRear);
    assert.ok(row.contact.calls > 1000 && row.contact.bearingCalls === row.contact.calls,
      'Every ordinary soil update comes through the actual unilateral wheel-support plane');
    assert.ok(row.contact.meanBearingFraction.mean > .3 && row.contact.meanBearingFraction.mean < 1,
      'Uneven soil actually exercises the bearing gate instead of silently bypassing it');
    assert.ok(row.soil.rollingSoilVolumesM3.depressed > .02, 'New soil moves after the stationary settle');
    assert.ok(row.trailing.corridorDepthM.p10 > .005, 'At least 90% of passed tire-width sections retain more than 5 mm of rut');
    assert.ok(row.trailing.corridorCoverageAbove01mm > .985, 'Loaded wheel paths remain continuous');
    assert.ok(row.trailing.longestCorridorGapBelow01mmM < .5, 'No half-metre hole can be hidden by a deep spawn dent');
  }
});

test('lower pressure changes the actual loaded footprint and preserves rolling tracks', () => {
  const normal = route('wrangler-rubicon', 'mud'), low = route('wrangler-rubicon', 'mud', { pressure: 18 });
  completed(low);
  assert.ok(low.contact.footprintAreaM2.mean > normal.contact.footprintAreaM2.mean * 1.2,
    'Lower pressure spreads the real loaded tire footprint');
  assert.ok(low.contact.deflectionM.mean > normal.contact.deflectionM.mean * 1.35,
    'The contact support uses the more compliant tire, not only a traction scalar');
  const normalStress = normal.contact.loadN.mean / normal.contact.footprintAreaM2.mean;
  const lowStress = low.contact.loadN.mean / low.contact.footprintAreaM2.mean;
  assert.ok(lowStress < normalStress * .9, 'The nominal footprint stress decreases at comparable stock axle load');
  assert.ok(low.trailing.corridorDepthM.p10 > .005 && low.trailing.corridorCoverageAbove01mm > .985);
  // Do not require every rolling rut to be shallower: contact duration,
  // bridge support, altered wheelspin and subsequent rear-tire passage all
  // change on a real driven path. Direct equal-dwell stamps isolate stress.
});

test('ordinary hardpack travel marks firm soil while asphalt remains undeformed', () => {
  const hardpack = route('wrangler-rubicon', 'hardpack'), asphalt = route('wrangler-rubicon', 'asphalt');
  completed(hardpack); completed(asphalt);
  assert.ok(hardpack.contact.calls > 1000 && hardpack.trailing.centerDepthM.median > .0002);
  assert.ok(hardpack.soil.deepestRutM <= .012001, 'Firm-ground displacement stays below the 12 mm cap');
  assert.ok(hardpack.trailing.corridorCoverageAbove01mm > .99);
  assert.ok(hardpack.trailing.compaction.median > .05 && hardpack.trailing.tread.max > .01,
    'The passed track retains renderable compaction and tread as well as shallow displacement');
  assert.equal(asphalt.contact.calls, 0); assert.equal(asphalt.soil.tiles, 0);
  assert.equal(asphalt.soil.deepestRutM, 0); assert.equal(asphalt.trailing.corridorDepthM.max, 0);
});

test('an ordinary Hummer sand lane retains its tracks within a small soil allocation budget', () => {
  // A reduced capacity makes the long-run storage failure reproducible in a
  // short test. The old circular allocation reserved sixteen tiles here,
  // including four wholly untouched tiles, and exhausted this budget early.
  const row = route('hummer-ev-suv-3x', 'sand', { maxDetailTiles: 12 });
  completed(row);
  assert.ok(row.soil.tiles <= 12 && row.soil.blankTiles === 0);
  assert.ok(row.trailing.corridorCoverageAbove01mm > .99 && row.trailing.corridorDepthM.p10 > .005,
    'Passed sections near the end of the lane retain physical tracks');
});
