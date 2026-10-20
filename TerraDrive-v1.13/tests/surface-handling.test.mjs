import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSimulation, contactFixtures, compactedFixture, measureContact,
  directionCycle, slopeHold, mixedContact } from './surface-metrics.mjs';

const api = await loadSimulation();
const fixtures = Object.fromEntries(contactFixtures(api).map(fixture => [fixture.id, fixture]));
const jeep = api.VEHICLES.find(spec => spec.id === 'wrangler-rubicon');
const civic = api.VEHICLES.find(spec => spec.id === 'civic-sport');

function healthy(row) {
  assert(row.finite, `${row.id}: non-finite chassis state`);
  assert.equal(row.condition, 1, `${row.id}: this controlled maneuver must not cause damage`);
  assert(row.peakFrictionUtilization <= 1 + 1e-9, `${row.id}: tire forces exceeded the actual friction budget`);
}

test('all eight mapped contact materials have distinct measured brake/coast signatures at identical initial speed', () => {
  const results = [];
  for (const detail of ['asphalt', 'hardpack', 'gravel', 'grass', 'rock', 'mud', 'wetland', 'sand']) {
    const fixture = fixtures[detail + '-dry'];
    const brake = measureContact(api, jeep, fixture, 'brake');
    const coast = measureContact(api, jeep, fixture, 'coast');
    healthy(brake); healthy(coast);
    assert(brake.stoppedAtS !== null && brake.finalSpeedMps < .1, `${detail}: service braking must stop the rolling vehicle`);
    assert(brake.distanceM > 8 && brake.distanceM < 70, `${detail}: implausible 54 km/h braking fixture`);
    assert(coast.finalSpeedMps > 5 && coast.finalSpeedMps < 15, `${detail}: an unpowered tire must dissipate, not create, energy`);
    assert(Math.abs(brake.lateralM) < .01 && Math.abs(coast.lateralM) < .01, `${detail}: symmetric straight contacts created lateral drift`);
    assert.deepEqual(brake.surfaceDetails, [detail], `${detail}: physical contacts disagree with the map's material cover`);
    results.push({ detail, brake, coast });
  }
  // Distinguish the response through two physically different observations.
  // These broad margins intentionally do not freeze individual coefficients.
  for (let a = 0; a < results.length; a++) for (let b = a + 1; b < results.length; b++) {
    const left = results[a], right = results[b];
    const brakingDifference = Math.abs(left.brake.distanceM / right.brake.distanceM - 1);
    const dragDifference = Math.abs((15 - left.coast.finalSpeedMps) / (15 - right.coast.finalSpeedMps) - 1);
    assert(brakingDifference > .03 || dragDifference > .12,
      `${left.detail}/${right.detail}: both stopping and coastdown are effectively identical`);
  }
  const byDetail = Object.fromEntries(results.map(row => [row.detail, row]));
  assert(byDetail.hardpack.brake.distanceM < byDetail.grass.brake.distanceM * .85,
    'A firm trail must brake appreciably better than grass');
  assert(byDetail.hardpack.coast.finalSpeedMps > byDetail.grass.coast.finalSpeedMps + .2,
    'Grass stubble must create a different rolling response from the compacted trail');
  assert(byDetail.asphalt.coast.finalSpeedMps > byDetail.sand.coast.finalSpeedMps + 1,
    'Loose sand must consume appreciably more rolling work than pavement');
});

test('weather changes braking according to material instead of applying one universal grip reduction', () => {
  const results = {}, addedStoppingDistance = {};
  for (const detail of ['asphalt', 'hardpack', 'gravel', 'grass', 'rock', 'sand']) {
    const dry = measureContact(api, jeep, fixtures[detail + '-dry'], 'brake');
    const wet = measureContact(api, jeep, fixtures[detail + '-wet'], 'brake');
    healthy(dry); healthy(wet);
    assert(dry.stoppedAtS !== null && wet.stoppedAtS !== null);
    results[detail] = wet.distanceM / dry.distanceM;
    addedStoppingDistance[detail] = wet.distanceM - dry.distanceM;
  }
  for (const detail of ['asphalt', 'hardpack', 'grass', 'rock']) {
    assert(results[detail] > 1.1, `${detail}: a wet contact must have a measurably longer stop`);
  }
  // Wet soil also provides passive chassis drag, so its tire-grip loss cannot
  // be inferred from a fixed proportional stopping-distance multiplier.
  assert(addedStoppingDistance.grass > addedStoppingDistance.asphalt * 1.5,
    'Wetting grass must add appreciably more stopping distance than wetting pavement');
  assert(results.gravel < results.hardpack, 'Draining gravel must respond differently from wetted fine hardpack');
  assert(results.sand < 1, 'This moderately wetted sand calibration must retain its distinct compaction benefit');
});

test('air pressure and tread choice change actual stopping distances with surface-specific tradeoffs', () => {
  const standard = measureContact(api, jeep, fixtures['asphalt-dry'], 'brake', { pressure: 37 });
  const airedDown = measureContact(api, jeep, fixtures['asphalt-dry'], 'brake', { pressure: 18 });
  healthy(standard); healthy(airedDown);
  assert(airedDown.meanContactAreaM2 > standard.meanContactAreaM2 * 1.2,
    'Pressure must change the loaded footprint, not only a displayed setting');
  assert(airedDown.distanceM > standard.distanceM * 1.025,
    'Airing down must not provide a universal pavement braking bonus');
  const roadTires = api.deriveVehicle(jeep, { tires: 'road' });
  const mudTires = api.deriveVehicle(jeep, { tires: 'mud' });
  const roadOnRoad = measureContact(api, roadTires, fixtures['asphalt-dry'], 'brake');
  const mudOnRoad = measureContact(api, mudTires, fixtures['asphalt-dry'], 'brake');
  const roadOnMud = measureContact(api, roadTires, fixtures['mud-dry'], 'brake');
  const mudOnMud = measureContact(api, mudTires, fixtures['mud-dry'], 'brake');
  for (const row of [roadOnRoad, mudOnRoad, roadOnMud, mudOnMud]) healthy(row);
  assert(roadOnRoad.distanceM < mudOnRoad.distanceM * .93, 'Road tread must retain its paved braking advantage');
  assert(mudOnMud.distanceM < roadOnMud.distanceM * .85, 'Mud tread must deliver a real stopping-force advantage on deformable mud');
});

test('rolling compaction changes later ground response while deep mud ruts still cost rolling work', () => {
  for (const detail of ['hardpack', 'gravel', 'grass']) {
    const fresh = fixtures[detail + '-dry'];
    const compacted = compactedFixture(api, fresh);
    assert(compacted.sample.compaction > fresh.sample.compaction + .1, `${detail}: preparation did not produce compaction`);
    const a = measureContact(api, jeep, fresh, 'coast');
    const b = measureContact(api, jeep, compacted, 'coast');
    healthy(a); healthy(b);
    assert(b.finalSpeedMps > a.finalSpeedMps + .03, `${detail}: packed wheel tracks did not change subsequent rolling work`);
    assert(compacted.sample.sink > 0 && compacted.sample.sink < .02, `${detail}: firm ground should retain only shallow marks`);
  }
  const mud = fixtures['mud-dry'], ruttedMud = compactedFixture(api, mud);
  const freshCoast = measureContact(api, jeep, mud, 'coast');
  const rutCoast = measureContact(api, jeep, ruttedMud, 'coast');
  healthy(freshCoast); healthy(rutCoast);
  assert(ruttedMud.sample.sink > .02, 'Preparation must make an actual deep rut');
  assert(rutCoast.finalSpeedMps < freshCoast.finalSpeedMps - .2,
    'Compaction must not erase the rolling cost of a deep soft rut');
});

test('mixed-surface braking mirrors physical yaw and preserves every tire force budget', () => {
  const rows = [-1, 1].map(sign => mixedContact(api, jeep, fixtures['asphalt-dry'], fixtures['mud-dry'], 'split-brake', sign));
  for (const row of rows) {
    healthy(row);
    assert(row.finalSpeedMps < .1);
    assert(row.peakYawRadS > .05 && Math.abs(row.lateralM) > .1, 'Unequal braking grip must create physical yaw and displacement');
    assert(row.surfaceDetails.includes('asphalt') && row.surfaceDetails.includes('mud'), 'Both lane materials must reach the physical contacts');
  }
  assert(Math.abs(rows[0].lateralM + rows[1].lateralM) < 1e-6, 'Mirroring the lane must mirror lateral displacement');
  assert(Math.abs(rows[0].distanceM - rows[1].distanceM) < 1e-6, 'Mirroring must preserve braking work and stopping distance');
});

test('stop-then-reverse and parked slope support remain physical on the real contact profiles', () => {
  for (const spec of [jeep, civic]) for (const detail of ['hardpack', 'grass', 'mud']) {
    const row = directionCycle(api, spec, fixtures[detail + '-dry']);
    healthy(row);
    assert.deepEqual(row.changes.map(change => [change.from, change.to]), [['D', 'R'], ['R', 'D']], row.id);
    assert(row.changes.every(change => change.speedMps < .12), `${row.id}: direction changed before the chassis stopped`);
    assert.equal(row.finalSelector, 'D');
    assert(row.finalSpeedMps > .2, `${row.id}: direction recovery did not restore propulsion`);
  }
  for (const id of ['hardpack-dry', 'grass-wet', 'mud-dry']) {
    const parked = slopeHold(api, jeep, fixtures[id]); healthy(parked);
    assert(parked.distanceM < .1 && parked.finalSpeedMps < .02, `${id}: a supported parked vehicle creeps excessively on a 15% slope`);
  }
  const rolling = slopeHold(api, jeep, fixtures['asphalt-dry'], { selector: 'N' });
  assert(rolling.forwardM < -10 && rolling.finalSpeedMps > 3, 'Static support must not cancel gravity in Neutral');
});
