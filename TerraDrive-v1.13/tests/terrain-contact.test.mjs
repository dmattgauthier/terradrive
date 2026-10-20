import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSimulation } from './surface-metrics.mjs';

// The same assertions can run against an immutable published source tree:
// TERRA_CONTACT_SOURCE_ROOT=/tmp/terra-v110-baseline-1p9 node --test tests/terrain-contact.test.mjs
const api = await loadSimulation(process.env.TERRA_CONTACT_SOURCE_ROOT);
const spec = api.VEHICLES.find(vehicle => vehicle.id === 'wrangler-rubicon');
const DT = 1 / 120;

function ledgeContact({ height = .12, pressure = 37, mirror = 1, floorSurface = 'mud' } = {}) {
  let ledge = false, cx = 0, cz = 0;
  const normal = { x: 0, y: 1, z: 0 };
  const rock = { ...api.surfaceResponse('rock'), surface: 'rock', surfaceDetail: 'rock', sink: 0, waterDepth: 0 };
  const floor = { ...api.surfaceResponse(floorSurface), surface: floorSurface, surfaceDetail: floorSurface,
    sink: floorSurface === 'mud' ? .09 : 0, waterDepth: floorSurface === 'mud' ? .06 : 0 };
  const terrain = { sample(x, z) {
    const onLedge = ledge && (x - cx) * mirror > .045 && Math.abs(z - cz) < .8;
    return { ...(onLedge ? rock : floor), height: onLedge ? height : 0, normal };
  } };
  const sim = new api.VehiclePhysics(terrain, spec);
  sim.reset({ x: 0, z: 0, heading: 0 }); sim.setPressure(pressure, pressure);
  for (let i = 0; i < 240; i++) sim.step(DT);
  const index = mirror > 0 ? 0 : 1, before = sim.state.wheels[index];
  cx = before.ground.x; cz = before.ground.z; ledge = true;
  sim._collectContacts(DT); sim._publishState();
  const wheel = sim.state.wheels[index], data = sim._wheels[index].data;
  return { sim, wheel, data, before, rock, floor };
}

test('a rock ledge carries the tire without borrowing traction or soil drag from unreachable mud below it', t => {
  const { wheel, data, before, rock } = ledgeContact();
  assert(wheel.contact && wheel.ground.y > before.ground.y + .08,
    'The edge of the footprint must physically raise the hub above the lower floor');
  assert(wheel.contactProfile.some(point => point.y === 0) && wheel.contactProfile.some(point => point.y > .1),
    'The fixture must span both rock and lower mud, rather than moving the whole tire onto rock');
  assert((wheel.surfaceMix.mud || 0) < 1e-9,
    `Unreachable mud was assigned ${(wheel.surfaceMix.mud || 0) * 100}% of the tire contact`);
  assert(Math.abs(data.mu - rock.mu) < 1e-10, 'Only the bearing rock may supply the contact friction');
  assert.equal(wheel.surface, 'rock', 'The HUD and tire-spray emitter must receive the bearing material');
  assert.equal(data.softness, 0, 'Unloaded mud must not excavate beneath a tire supported on rock');
  assert.equal(data.sink, 0, 'Unloaded lower ruts cannot add passive buried-sidewall resistance');
  t.diagnostic(JSON.stringify({ pressurePSI: wheel.pressure, deflectionM: wheel.deflection,
    hubRiseM: wheel.ground.y - before.ground.y, surfaceMix: wheel.surfaceMix, mu: data.mu }));
});

test('coplanar material boundaries retain a genuine mixed footprint', () => {
  const { wheel, data, floor, rock } = ledgeContact({ height: 0 });
  assert(wheel.surfaceMix.mud > .1 && wheel.surfaceMix.rock > .1);
  assert(Math.abs(Object.values(wheel.surfaceMix).reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
  assert(data.mu > floor.mu && data.mu < rock.mu);
});

test('a compliant aired-down carcass follows shallow relief that a harder tire bridges', t => {
  const hard = ledgeContact({ pressure: 42, height: .04 });
  const soft = ledgeContact({ pressure: 14, height: .04 });
  assert(soft.wheel.deflection > hard.wheel.deflection * 1.5);
  assert((soft.wheel.surfaceMix.mud || 0) > (hard.wheel.surfaceMix.mud || 0) + .15,
    'Pressure-dependent carcass travel must change which lower terrain can carry load');
  assert(soft.wheel.contactLength > hard.wheel.contactLength, 'The contact geometry must also follow the loaded tire');
  t.diagnostic(JSON.stringify({ hard: { deflectionM: hard.wheel.deflection, mix: hard.wheel.surfaceMix },
    soft: { deflectionM: soft.wheel.deflection, mix: soft.wheel.surfaceMix } }));
});

test('mirroring the supporting edge preserves load, contact height and material weighting', () => {
  const a = ledgeContact({ mirror: 1 }), b = ledgeContact({ mirror: -1 });
  assert(Math.abs(a.wheel.load - b.wheel.load) < 1e-7);
  assert(Math.abs(a.wheel.ground.y - b.wheel.ground.y) < 1e-9);
  assert(Math.abs(a.data.mu - b.data.mu) < 1e-10);
  for (const key of new Set([...Object.keys(a.wheel.surfaceMix), ...Object.keys(b.wheel.surfaceMix)])) {
    assert(Math.abs((a.wheel.surfaceMix[key] || 0) - (b.wheel.surfaceMix[key] || 0)) < 1e-10);
  }
});

test('the soil solver cannot excavate or compact terrain below the loaded carcass envelope', () => {
  const terrain = new api.Terrain(), x = 48, z = -130;
  const before = terrain.heightAt(x, z);
  let highest = -Infinity;
  for (let dx = -.5; dx <= .5; dx += .1) for (let dz = -.6; dz <= .6; dz += .1) highest = Math.max(highest, terrain.heightAt(x + dx, z + dz));
  // The tire is held above this hollow by an adjacent rigid ledge. A 3 cm
  // carcass cannot transmit any downward load across this >10 cm air gap.
  const supportPlane = { origin: { x, y: highest + .10, z }, normal: { x: 0, y: 1, z: 0 }, deflection: .03, meanBearing: .25 };
  const contact = { load: 6500, pressure: 37, slip: 1.5, contactWidth: .6, contactLength: .7, dt: .1 };
  for (let i = 0; i < 12; i++) terrain.deform(x, z, { ...contact, supportPlane });
  assert(Math.abs(terrain.heightAt(x, z) - before) < 1e-6);
  assert.deepEqual(terrain.soilVolumes, { depressed: 0, displaced: 0, compacted: 0 }, 'An unloaded hollow has no displaced earth');
  for (const tile of terrain.detailTiles.values()) {
    assert(tile.compaction.every(value => value === 0));
    assert(tile.churn.every(value => value === 0));
    assert(tile.tread.every(value => value === 0));
  }
  // Positive control: the identical soil/load/slip combination really does
  // deform when a fully bearing footprint is placed on its surface.
  for (let i = 0; i < 12; i++) terrain.deform(x, z, contact);
  assert(terrain.soilVolumes.depressed > .001);
  assert(terrain.sample(x, z).sink > .01);
});

test('a pavement-centred tire can compact its loaded soft shoulder without cutting into pavement', () => {
  const terrain = new api.Terrain(), x = -100.03, z = -115;
  assert.equal(terrain.surfaceAt(x, z), 'asphalt');
  const rigid = [-100.01, -100.08, -100.15].map(px => ({ x: px, height: terrain.heightAt(px, z) }));
  const shoulderX = -99.8, shoulderBefore = terrain.heightAt(shoulderX, z);
  assert.equal(terrain.surfaceAt(shoulderX, z), 'dirt');
  for (let i = 0; i < 40; i++) terrain.deform(x, z, {
    load: 9000, pressure: 42, slip: .5, contactWidth: .6, contactLength: .7, dt: .05,
  });
  assert(terrain.heightAt(shoulderX, z) < shoulderBefore - .0005,
    'The soft footprint edge was discarded because its centre sample was rigid');
  for (const sample of rigid) assert(Math.abs(terrain.heightAt(sample.x, z) - sample.height) < 1e-6);
  assert(terrain.sample(shoulderX, z).sink <= .012001, 'Firm shoulder marks retain the physical 12 mm deformation limit');
});

test('landing after a short airborne gap starts a new footprint instead of excavating the flight path', () => {
  const terrain = new api.Terrain(), sim = new api.VehiclePhysics(terrain, spec);
  sim.reset({ x: 48, z: -130, heading: 0 });
  for (let frame = 0; frame < 120; frame++) sim.step(DT);
  sim.setControl('selector', 'N');
  const oldVolumes = { ...terrain.soilVolumes };
  assert(terrain.wheelTrails.size > 0, 'The first tire contacts must establish a swept trail');
  sim.body.position.y += .65; sim.body.velocity.set(0, 0, 3);
  const deformations = [], stamps = [], deform = terrain.deform.bind(terrain), stamp = terrain._stampSoil.bind(terrain);
  terrain._stampSoil = (...args) => { stamps.push([args[0], args[1]]); return stamp(...args); };
  terrain.deform = (x, z, args) => {
    const first = stamps.length, result = deform(x, z, args);
    deformations.push({ wheelId: args.wheelId, stamps: stamps.slice(first) }); return result;
  };
  let airborneTicks = 0;
  for (let frame = 0; frame < 100; frame++) {
    const state = sim.step(DT);
    if (state.groundedWheels === 0) {
      airborneTicks++;
      assert.equal(terrain.wheelTrails.size, 0, 'Airborne wheels must release the old contact path');
      assert.deepEqual(terrain.soilVolumes, oldVolumes, 'Airborne motion must preserve existing ruts without adding new ones');
    }
    if (deformations.length) break;
  }
  assert(airborneTicks > 20 && deformations.length > 0, 'The fixture must actually fly and land');
  assert(deformations.every(call => call.stamps.length === 1),
    'The first landing footprint must not sweep backward across a stale pre-jump contact');
});

test('invalid support planes cannot poison persistent soil heights or history', () => {
  const good = { origin: { x: 48, y: 3.5, z: -130 }, normal: { x: 0, y: 1, z: 0 }, deflection: .03, meanBearing: .7 };
  for (const supportPlane of [
    { ...good, normal: { x: NaN, y: 1, z: 0 } }, { ...good, deflection: NaN },
    { ...good, meanBearing: undefined }, { ...good, normal: { x: 0, y: 0, z: 0 } },
    { ...good, origin: { x: 48, y: Infinity, z: -130 } },
  ]) {
    const terrain = new api.Terrain(), before = terrain.heightAt(48, -130);
    assert.equal(terrain.deform(48, -130, { load: 6500, dt: .1, supportPlane }), 0);
    assert.equal(terrain.detailTiles.size, 0, 'Reject malformed contact before allocating or writing a tile');
    assert.equal(terrain.heightAt(48, -130), before);
    assert.deepEqual(terrain.soilVolumes, { depressed: 0, displaced: 0, compacted: 0 });
  }
});

test('saved sweep support cannot change when a caller reuses its plane object', () => {
  const terrain = new api.Terrain(), supportPlane = { origin: { x: 48, y: 3.3, z: -130 }, normal: { x: 0, y: 1, z: 0 }, deflection: .06, meanBearing: 1 };
  terrain.deform(48, -130, { load: 6500, dt: DT, wheelId: 'moving-tire', supportPlane });
  supportPlane.normal.x = NaN; supportPlane.origin.y = Infinity;
  terrain.deform(48, -129.6, { load: 6500, speed: 40, dt: DT, wheelId: 'moving-tire',
    supportPlane: { origin: { x: 48, y: 3.3, z: -129.6 }, normal: { x: 0, y: 1, z: 0 }, deflection: .06, meanBearing: 1 } });
  assert(Object.values(terrain.soilVolumes).every(Number.isFinite));
  for (const tile of terrain.detailTiles.values()) assert(tile.delta.every(Number.isFinite));
  assert(Number.isFinite(terrain.heightAt(48, -129.8)), 'Interpolating between finite support snapshots must retain finite ground');
});
