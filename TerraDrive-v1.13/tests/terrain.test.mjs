import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain, SURFACES, surfaceResponse } from '../dist/src/terrain.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';

function drive(terrain, { x = 48, z = -130, length = 8, speed = 3, pressure = 35, load = 4500, slip = .25, lateralSlip = 0, passes = 1, wheelId = 'test', contactWidth, contactLength } = {}) {
  const dt = 1 / 120, steps = Math.ceil(length / speed / dt);
  for (let pass = 0; pass < passes; pass++) for (let i = 0; i <= steps; i++) terrain.deform(x, z + i / steps * length, { pressure, load, slip, lateralSlip, width: .30, contactWidth, contactLength, speed, dt, heading: 0, wheelId });
  return terrain.sample(x, z + length * .5);
}

test('pristine response reuse is immutable while continuous moisture and ground history stay live', () => {
  for (const moisture of [0, 1]) for (const [surface, cover] of [
    ['asphalt', {}], ['dirt', {}], ['dirt', { gravelFraction: 1 }], ['dirt', { grassFraction: 1 }],
    ['rock', {}], ['mud', {}], ['wetland', {}], ['sand', {}],
  ]) {
    const options = { moisture, ...cover }, sample = surfaceResponse(surface, options);
    assert.equal(sample, surfaceResponse(surface, options), 'Exact pristine endpoints may share a response');
    assert.ok(Object.isFrozen(sample) && Object.isFrozen(sample.tireResponse) && Object.isFrozen(sample.soil));
    assert.throws(() => { sample.tireResponse.lateral = -1; }, TypeError);
    assert.throws(() => { sample.soil.cohesionPa = -1; }, TypeError);
  }
  const moisture = .371234, a = surfaceResponse('asphalt', { moisture }), b = surfaceResponse('asphalt', { moisture });
  assert.notEqual(a, b); assert.deepEqual(a, b);
  assert.equal(a.mu, .98 + (.74 - .98) * moisture, 'Intermediate weather is never quantized');
  const pristine = surfaceResponse('mud'), packed = surfaceResponse('mud', { compaction: .000001 }), churned = surfaceResponse('mud', { churn: .000001 });
  assert.notEqual(packed.mu, pristine.mu); assert.notEqual(churned.mu, pristine.mu);
  const terrain = new Terrain(), contact = terrain.sample(48, -126);
  contact.mu = -10; contact.normal.x = 50;
  const fixture = { ...contact, tireResponse: { ...contact.tireResponse }, soil: { ...contact.soil } };
  fixture.tireResponse.lateral = 1; fixture.soil.cohesionPa = 1;
  assert.equal(terrain.sample(48, -126).mu, pristine.mu);
  assert.notEqual(terrain.sample(48, -126).normal.x, 50);
  terrain.setMoisture(1); assert.equal(terrain.sample(48, -126).mu, surfaceResponse('mud', { moisture: 1 }).mu);
  terrain.setMoisture(0); const disturbed = drive(terrain, { slip: 1.2 });
  assert.ok(disturbed.churn > 0); assert.notEqual(disturbed.mu, pristine.mu);
  terrain.resetDeformation(); assert.equal(terrain.sample(48, -126).tireResponse, pristine.tireResponse);
});

test('pressure, load and passes change actual connected rut geometry', () => {
  const terrain = new Terrain(), results = [];
  for (const pressure of [14, 42]) { terrain.resetDeformation(); const sample = drive(terrain, { pressure }); results.push({ sink: sample.sink, compact: sample.compaction }); }
  assert.ok(results[0].sink > .005 && results[1].sink > results[0].sink * 1.2, 'Higher pressure must sink deeper at identical load/travel');
  const loadResults = [];
  for (const load of [2300, 6500]) { terrain.resetDeformation(); loadResults.push(drive(terrain, { load, contactWidth: .30, contactLength: .28 }).sink); }
  assert.ok(loadResults[1] > loadResults[0] * 1.3, 'Higher load must deform more for the same measured footprint');
  terrain.resetDeformation(); const one = drive(terrain); const three = drive(terrain, { passes: 2 });
  assert.ok(three.sink > one.sink && three.compaction > one.compaction, 'Repeated passes deepen and compact the same track');
});

test('rolling tread survives while wheelspin digs and smears it', () => {
  const terrain = new Terrain(), rolling = drive(terrain, { slip: .05 });
  const rollingTread = Math.max(...[...terrain.detailTiles.values()].flatMap(p => [...p.tread]));
  terrain.resetDeformation(); const spinning = drive(terrain, { slip: 1.5 });
  const spinningTread = Math.max(...[...terrain.detailTiles.values()].flatMap(p => [...p.tread]));
  assert.ok(spinning.sink > rolling.sink * 1.4);
  assert.ok(rollingTread > .15 && spinningTread < rollingTread * .1);
});

test('swept footprints have no gaps at fast travel and avoid teleport scars', () => {
  const terrain = new Terrain(); drive(terrain, { speed: 20, length: 15 });
  for (let z = -129.5; z < -115.5; z += .07) assert.ok(terrain.sample(48, z).sink > .002, `Continuous footprint at z=${z}`);
  const before = terrain.heightAt(48, -103);
  terrain.deform(48, -90, { speed: 1, load: 4500, pressure: 35, wheelId: 'test', dt: 1 / 120 });
  assert.equal(terrain.heightAt(48, -103), before, 'Teleport recovery cannot excavate between endpoints');
});

test('sand and mud displace real soil into bounded berms', () => {
  for (const [surface, x, z] of [['mud', 48, -130], ['sand', 204, -110]]) {
    const terrain = new Terrain(); drive(terrain, { x, z, slip: .65, passes: 2 });
    let raised = 0, deepest = 0;
    for (const tile of terrain.detailTiles.values()) for (const value of tile.delta) { raised = Math.max(raised, value); deepest = Math.min(deepest, value); }
    assert.ok(raised > .008 && deepest < -.02, `${surface} needs visible raised and depressed geometry`);
    assert.ok(raised <= .160001 && -deepest <= terrain.sample(x, z).maxSink + 1e-6);
    const volumes = terrain.soilVolumes;
    assert.ok(volumes.displaced > 0 && volumes.displaced < volumes.depressed);
    assert.ok(Math.abs(volumes.displaced + volumes.compacted - volumes.depressed) < 1e-9, 'Every removed volume increment is assigned to displacement or compaction');
  }
});

test('10 cm detail is stitched and contact uses exactly its indexed triangles', () => {
  const terrain = new Terrain(); drive(terrain, { x: 48, z: -132, length: 10, pressure: 42 });
  for (const p of terrain.detailTiles.values()) {
    assert.equal(p.step, .1);
    const neighbor = terrain.detailTiles.get((p.tx + 1) + ',' + p.tz);
    if (neighbor) for (let z = 0; z <= p.nz; z++) { const i = z * (p.nx + 1) + p.nx, j = z * (p.nx + 1); assert.equal(p.delta[i], neighbor.delta[j]); assert.ok(Math.abs(p.base[i] - neighbor.base[j]) < 1e-6); }
    for (const [u, v] of [[.31, .22], [.72, .61]]) {
      const ix = 18, iz = 17, stride = p.nx + 1, a = iz * stride + ix, b = a + 1, c = a + stride, d = c + 1;
      const h = i => p.base[i] + p.delta[i], expected = u + v <= 1 ? h(a) + u * (h(b) - h(a)) + v * (h(c) - h(a)) : h(d) + (1 - u) * (h(c) - h(d)) + (1 - v) * (h(b) - h(d));
      const sample = terrain.sample(p.minX + (ix + u) * p.step, p.minZ + (iz + v) * p.step);
      assert.ok(Math.abs(sample.height - expected) < 1e-7); assert.ok(Math.abs(Math.hypot(sample.normal.x, sample.normal.y, sample.normal.z) - 1) < 1e-7);
    }
  }
  assert.ok(Math.abs(terrain.heightAt(48 - 1e-7, -128) - terrain.heightAt(48 + 1e-7, -128)) < 1e-5, 'Tile boundary has no contact step');
});

test('budget retains all earlier ruts and explicit reset frees storage', () => {
  for (const [x, z] of [[48, -130], [-51, 282]]) {
    const terrain = new Terrain(); terrain.maxDetailTiles = 4;
    const pristine = terrain.heightAt(x, z + 1); drive(terrain, { x, z, length: 2 });
    const old = terrain.heightAt(x, z + 1), tiles = terrain.detailTiles.size;
    drive(terrain, { x: 65, z: -120, length: 14 });
    assert.ok(terrain.detailBudgetFull); assert.ok(terrain.detailTiles.size <= 4 && terrain.detailTiles.size >= tiles); assert.equal(terrain.heightAt(x, z + 1), old);
    const epoch = terrain.detailEpoch; terrain.resetDeformation();
    assert.equal(terrain.detailTiles.size, 0); assert.equal(terrain.wheelTrails.size, 0); assert.equal(terrain.detailBudgetFull, false); assert.equal(terrain.detailEpoch, epoch + 1);
    assert.equal(terrain.sample(x, z + 1).sink, 0); assert.equal(terrain.heightAt(x, z + 1), pristine);
    assert.deepEqual(terrain.soilVolumes, { depressed: 0, displaced: 0, compacted: 0 });
  }
});

test('pavement and rock stay rigid; trail and biome colors are distinct', () => {
  const terrain = new Terrain();
  for (const [x, z] of [[-108, -115], [121, 121]]) { const before = terrain.heightAt(x, z); terrain.deform(x, z, { load: 10000, slip: 3, pressure: 60, dt: .5 }); assert.equal(terrain.heightAt(x, z), before); }
  assert.equal(terrain.detailTiles.size, 0);
  const grass = terrain.colorAt(-42, -42), trail = terrain.colorAt(terrain.trailX(-42), -42), sand = terrain.colorAt(204, -83), mud = terrain.colorAt(48, -115), rock = terrain.colorAt(121, 121);
  assert.ok(grass.g > grass.r * 1.3 && trail.r > trail.g * 1.2);
  assert.ok(sand.r > mud.r * 2.3 && sand.g > mud.g * 2.3);
  assert.ok(Math.abs(rock.r - rock.b) < .12 && rock.b > mud.b * 3);
});

test('visible hardpack, gravel and grass have conserved contact cover at every ribbon and shoulder', () => {
  const terrain = new Terrain(), z = -82, trailX = terrain.trailX(z);
  const locations = [
    { label: 'open grass', x: -51, z: 282, weights: [0, 0, 1] },
    { label: 'trail', x: trailX, z, weights: [1, 0, 0] },
    { label: 'connector', x: -62, z: -32, weights: [1, 0, 0] },
    { label: 'rock access', x: 32, z: 40, weights: [1, 0, 0] },
    { label: 'road gravel', x: -98, z: -110, weights: [0, 1, 0] },
    { label: 'trail gravel', x: trailX + 4.25, z, weights: [0, 1, 0] },
    { label: 'inner trail shoulder', x: trailX + 3.3, z, weights: [.5, .5, 0] },
    { label: 'trail grass edge', x: trailX + 5.2, z, weights: [0, .5, .5] },
    { label: 'connector grass edge', x: -62, z: -32 + 4.1, weights: [0, .5, .5] },
    { label: 'access grass edge', x: 32, z: 40 + 3.2, weights: [0, .5, .5] },
    { label: 'verge grass edge', x: -96, z: -110, weights: [0, .5, .5] },
    { label: 'trail end', x: terrain.trailX(257), z: 257, weights: [.5, 0, .5] },
    { label: 'access joins the new main trail', x: 0, z: 40, weights: [1, 0, 0] },
    { label: 'verge end', x: -98, z: -241, weights: [0, .5, .5] },
  ];
  // Recover all three painted cover weights from the rendered vertex color.
  // A common noise shade cancels when the three recovered weights normalize.
  const det = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
  const palette = [[.66, .47, .285], [.55, .52, .44], [.25, .39, .17]];
  const denominator = det(...palette);
  for (const moisture of [0, .25, 1]) {
    terrain.setMoisture(moisture);
    const material = [terrain.sample(trailX, z), terrain.sample(trailX + 4.25, z), terrain.sample(-51, 282)];
    for (const { label, x, z, weights } of locations) {
      const contact = terrain.sample(x, z), color = terrain.colorAt(x, z);
      assert.equal(contact.surface, 'dirt', label);
      const contactWeights = [contact.hardpackFraction, contact.gravelFraction, contact.grassFraction];
      const rgb = [color.r, color.g, color.b];
      const scaled = [det(rgb, palette[1], palette[2]), det(palette[0], rgb, palette[2]), det(palette[0], palette[1], rgb)].map(value => value / denominator);
      const total = scaled.reduce((a, b) => a + b, 0), visible = scaled.map(value => value / total);
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(contactWeights[i] - weights[i]) < 1e-12, `${label}: expected ground cover`);
        assert.ok(Math.abs(visible[i] - contactWeights[i]) < 1e-12, `${label}: visible/contact cover mismatch`);
      }
      for (const key of ['mu', 'rollingResistance', 'bodyFriction']) assert.ok(Math.abs(contact[key] - weights.reduce((sum, weight, i) => sum + weight * material[i][key], 0)) < 1e-12, `${label}: ${key} follows the physical cover`);
      for (const key of ['lateral', 'longitudinal', 'slideRetention', 'relaxation']) assert.ok(Math.abs(contact.tireResponse[key] - weights.reduce((sum, weight, i) => sum + weight * material[i].tireResponse[key], 0)) < 1e-12, `${label}: ${key} follows the physical cover`);
      assert.ok(Math.abs(contact.soil.rollingResistance - weights.reduce((sum, weight, i) => sum + weight * material[i].soil.rollingResistance, 0)) < 1e-12, `${label}: soil resistance is partitioned before cover averaging`);
      assert.equal(contact.surfaceDetail, weights[0] === 1 ? 'hardpack' : weights[1] === 1 ? 'gravel' : weights[2] === 1 ? 'grass' : 'mixed');
    }
    const grass = terrain.sample(-51, 282), hardpack = terrain.sample(trailX, z);
    assert.ok(grass.mu < hardpack.mu * .7, 'Grass keeps a materially lower peak grip than firm hardpack');
    assert.ok(grass.rollingResistance > hardpack.rollingResistance * 1.4, 'Stems/organic cover resist rolling more than the compacted lane');
    for (const key of ['softness', 'maxSink', 'waterDepth']) assert.equal(grass[key], hardpack[key], `${key} retains the firm support geometry`);
  }
  terrain.setWeather('dry');
  let previous = Infinity;
  for (let dx = 2.7; dx <= 5.80001; dx += .025) {
    const contact = terrain.sample(trailX + dx, z);
    assert.ok(contact.mu <= previous + 1e-12, 'Grip decreases smoothly through aggregate toward grass'); previous = contact.mu;
  }
  for (const edge of [3.3, 5.2]) assert.ok(Math.abs(terrain.sample(trailX + edge + .0001, z).mu - terrain.sample(trailX + edge - .0001, z).mu) < .0001, 'The cover boundary does not introduce a contact jump');
  const grassDry = terrain.sample(-51, 282).mu, dirtDry = terrain.sample(trailX, z).mu;
  terrain.setWeather('rain');
  assert.ok(terrain.sample(-51, 282).mu / grassDry < terrain.sample(trailX, z).mu / dirtDry, 'Wetting grass causes the stronger proportional loss');
});

test('all nine material profiles have distinct bounded grip, drag and wet-weather responses', () => {
  const terrain = new Terrain();
  const locations = [
    ['snow', -265, 280, .20, .40],
    ['asphalt', -108, -186, .85, 1.10],
    ['hardpack', terrain.trailX(-82), -82, .68, .82],
    ['gravel', terrain.trailX(-82) + 4.25, -82, .50, .70],
    ['grass', -51, 282, .38, .53],
    ['rock', 121, 121, .80, 1.05],
    ['mud', 48, -115, .32, .46],
    ['wetland', -24, 148, .25, .40],
    ['sand', 204, -83, .48, .68],
  ];
  const dry = {}, wet = {};
  for (const [id, x, z, low, high] of locations) {
    terrain.setWeather('dry'); dry[id] = terrain.sample(x, z);
    terrain.setWeather('rain'); wet[id] = terrain.sample(x, z);
    assert.equal(dry[id].surfaceDetail, id);
    assert.ok(dry[id].mu >= low && dry[id].mu <= high, `${id}: representative peak remains in its documented range`);
    assert.ok(wet[id].mu > .20 && wet[id].mu < .85, `${id}: rain profile is bounded`);
    for (const sample of [dry[id], wet[id]]) {
      assert.ok(sample.tireResponse.slideRetention > .60 && sample.tireResponse.slideRetention <= 1);
      assert.ok(sample.tireResponse.lateral > 0 && sample.tireResponse.longitudinal > 0);
      assert.ok(sample.tireResponse.relaxation > 0 && sample.tireResponse.tractionSlip > .1);
      for (const value of Object.values(sample.soil)) assert.ok(Number.isFinite(value) && value >= 0);
      assert.ok(sample.soil.rollingResistance <= sample.rollingResistance, `${id}: soil drag is part of the existing total loss`);
      assert.equal(sample.soil.rollingResistance === 0, id === 'asphalt' || id === 'rock', `${id}: only deformable covers have translational soil loss`);
    }
  }
  assert.equal(new Set(locations.map(([id]) => dry[id].mu + '/' + dry[id].rollingResistance + '/' + dry[id].tireResponse.lateral)).size, 9);
  for (const id of ['asphalt', 'hardpack', 'gravel', 'grass', 'rock', 'mud', 'wetland']) assert.ok(wet[id].mu < dry[id].mu, `${id}: wetting cannot raise available adhesion`);
  assert.ok(wet.sand.mu > dry.sand.mu && wet.sand.maxSink < dry.sand.maxSink, 'Moist unsaturated sand gains modest cohesion/support');
  assert.ok(wet.mud.maxSink > dry.mud.maxSink && wet.wetland.maxSink > dry.wetland.maxSink, 'Saturated fines soften with rain');
  assert.ok(dry.asphalt.mu > dry.rock.mu && dry.rock.mu > dry.hardpack.mu && dry.hardpack.mu > dry.gravel.mu && dry.gravel.mu > dry.grass.mu);
  assert.ok(dry.asphalt.rollingResistance < dry.hardpack.rollingResistance && dry.hardpack.rollingResistance < dry.gravel.rollingResistance && dry.gravel.rollingResistance < dry.sand.rollingResistance && dry.sand.rollingResistance < dry.mud.rollingResistance && dry.mud.rollingResistance < dry.wetland.rollingResistance);
  assert.ok(dry.hardpack.tireResponse.lateral > dry.gravel.tireResponse.lateral, 'Firm lane responds before the loose aggregate shoulder');
  assert.ok(dry.grass.mu * dry.grass.tireResponse.slideRetention < .42 && wet.grass.mu * wet.grass.tireResponse.slideRetention < .27, 'Grass retains the lower measured order of sliding friction');
  for (const surface of ['asphalt', 'rock']) assert.equal(dry[surface].soil.lateralScale, 0, 'Rigid material cannot generate a soil rut-wall force');
  for (const surface of Object.keys(SURFACES)) assert.deepEqual(SURFACES[surface].tireResponse, dry[surface === 'dirt' ? 'hardpack' : surface].tireResponse, 'Flat reference fixtures consume the same tire response');
});

test('compaction and wheelspin persist as distinct states with material-dependent mechanical effects', () => {
  for (const [surface, x, z] of [['sand', 204, -110], ['mud', 48, -130], ['wetland', -24, 150]]) {
    const terrain = new Terrain(); terrain.setWeather(surface === 'sand' ? 'dry' : 'rain');
    const fresh = terrain.sample(x, z + 4);
    const rolling = drive(terrain, { x, z, slip: .05, passes: 2 });
    assert.ok(rolling.compaction > .1 && rolling.churn === 0, 'Freely rolling pressure compacts without artificially shearing the substrate');
    if (surface === 'sand') {
      assert.ok(rolling.mu > fresh.mu && rolling.rollingResistance < fresh.rollingResistance, 'Compacted sand rolls more easily and supports more traction');
    }
    terrain.resetDeformation();
    const spinning = drive(terrain, { x, z, slip: 1.5, passes: 2 });
    assert.ok(spinning.churn > .1 && spinning.sink > rolling.sink, `${surface}: wheelspin leaves actual churn and a deeper rut`);
    assert.ok(spinning.mu < rolling.mu && spinning.rollingResistance > rolling.rollingResistance, `${surface}: churn changes traction and drag, not only its color`);
    if (surface !== 'sand') assert.ok(spinning.soil.cohesionPa < rolling.soil.cohesionPa, 'Remoulded wet fines lose some undrained structure');
    terrain.resetDeformation();
    const reset = terrain.sample(x, z + 4);
    assert.equal(reset.churn, 0); assert.equal(reset.compaction, 0); assert.equal(reset.mu, fresh.mu); assert.equal(reset.rollingResistance, fresh.rollingResistance);
  }
  const terrain = new Terrain(), rolling = drive(terrain, { slip: 0, passes: 2 });
  terrain.resetDeformation(); const sliding = drive(terrain, { slip: 0, lateralSlip: .65, passes: 2 });
  assert.equal(rolling.churn, 0);
  assert.ok(sliding.churn > .1 && sliding.sink > rolling.sink, 'Sideways sliding shears and displaces soil without requiring longitudinal wheelspin');
});

test('reported Pine Ridge location creates shallow ground tracks through actual loaded tires', () => {
  const terrain = new Terrain(), physics = new VehiclePhysics(terrain, VEHICLES[0]);
  physics.reset({ x: -51, z: 282, heading: 0 }); physics.setPressure(37);
  // This hillside is grass, so use all four driven tires to cover fresh ground
  // without depending on the old, overly high hardpack grip in rear drive.
  assert.ok(physics.setControl('driveMode', '4H').ok);
  const deform = terrain.deform.bind(terrain); let loadedCalls = 0, imprints = 0;
  terrain.deform = (x, z, args) => { if (args.load > 40) loadedCalls++; const depth = deform(x, z, args); if (depth > 0) imprints++; return depth; };
  for (let i = 0; i < 600; i++) physics.step(1 / 120, { throttle: i >= 120 ? .45 : 0 });
  assert.ok(loadedCalls >= 2300 && imprints >= loadedCalls * .99, 'Loaded firm-ground contacts must reach the deformation system');
  assert.ok(physics.state.position.z > 286, 'This fixture drives over new ground after settling');
  assert.ok(terrain.detailTiles.size > 0 && terrain.detailTiles.size < 20);
  assert.ok([...terrain.detailTiles.values()].every(p => p.parentId === 'base'));
  const contacts = physics.state.wheels.filter(w => w.contact).map(w => terrain.sample(w.ground.x, w.ground.z));
  assert.equal(contacts.length, 4);
  assert.ok(contacts.every(s => s.surface === 'dirt' && s.sink > .0001 && s.sink <= .012001));
  assert.ok(contacts.every(s => s.surfaceDetail === 'grass' && s.grassFraction === 1 && s.mu > .38 && s.mu < .50), 'Loaded tires consume the bounded, state-dependent grip of visibly grassy ground');
  assert.ok(contacts.some(s => s.compaction > .1 && s.tread > .01), 'Rendered soil attributes must show the physical tire marks');
  assert.equal(physics.state.damage.condition, 1, 'Ordinary travel over shallow tracks must not damage the vehicle');
});

test('firm dirt and grass record compaction and tread with bounded millimetre-scale displacement', () => {
  for (const [x, z] of [[-51, 282], [0, 0], [8.3, -160], [53, 40]]) {
    const terrain = new Terrain(); assert.equal(terrain.surfaceAt(x, z), 'dirt');
    drive(terrain, { x, z, length: 2, slip: .05, passes: 2, pressure: 37 });
    let printed = 0, compacted = 0;
    for (const tile of terrain.detailTiles.values()) for (let i = 0; i < tile.delta.length; i++) { printed = Math.max(printed, tile.tread[i]); compacted = Math.max(compacted, tile.compaction[i]); }
    assert.ok(printed > .25 && compacted > .4, 'Firm ground needs visible tread and compaction feedback');
    for (const weather of ['dry', 'rain']) {
      terrain.setWeather(weather);
      for (let i = 0; i < 30; i++) terrain.deform(x + .1 * (i % 3), z, { load: 150000, pressure: 85, contactWidth: .3, contactLength: .3, slip: i % 2 ? .6 : 2.5, dt: .5 });
      assert.equal(terrain.sample(x, z).maxSink, .012, 'Firm-ground cap includes weather and tread');
      for (const tile of terrain.detailTiles.values()) for (const delta of tile.delta) assert.ok(delta >= -.012001 && delta <= .003001, 'Firm soil has at most 12 mm of rut and 3 mm of edge crumbling');
    }
    assert.ok(terrain.soilVolumes.displaced <= terrain.soilVolumes.depressed * .201, 'Firm ground mainly compacts');
  }
});

test('swept tracks cross base and biome parents continuously in either direction without deepening the firm side', () => {
  for (const direction of [-1, 1]) {
    const terrain = new Terrain(), startX = direction > 0 ? 6.5 : 9.5, z = -115;
    for (let i = 0; i <= 18; i++) terrain.deform(startX + direction * i / 6, z, { load: 9000, pressure: 42, slip: .6, contactWidth: .34, contactLength: .28, speed: 20, heading: direction * Math.PI / 2, dt: 1 / 120, wheelId: 'crossing' });
    const left = terrain.detailTiles.get('1,-29'), right = terrain.detailTiles.get('2,-29');
    assert.equal(left.parentId, 'base'); assert.equal(right.parentId, 'mud');
    for (let iz = 0; iz <= left.nz; iz++) {
      const a = iz * (left.nx + 1) + left.nx, b = iz * (right.nx + 1);
      assert.equal(left.base[a], right.base[b]); assert.equal(left.delta[a], right.delta[b]);
      assert.equal(left.compaction[a], right.compaction[b]); assert.equal(left.tread[a], right.tread[b]); assert.equal(left.churn[a], right.churn[b]);
    }
    for (let x = 6.7; x <= 9.3; x += .037) {
      const sample = terrain.sample(x, z);
      assert.ok(sample.sink > .0001, `Swept ${direction > 0 ? 'entry' : 'exit'} is continuous at x=${x}`);
      if (sample.surface === 'dirt') assert.ok(sample.sink <= .012001);
    }
    assert.ok(Math.abs(terrain.heightAt(8 - 1e-7, z) - terrain.heightAt(8 + 1e-7, z)) < 1e-5, 'Cross-parent contact height is stitched');
    for (const tile of terrain.detailTiles.values()) assert.equal(tile.parentId, (terrain.getPatch((tile.minX + tile.maxX) / 2, (tile.minZ + tile.maxZ) / 2) || terrain.baseGrid).id);
  }
  // The visible biome boundary also crosses the interior of a tile. A single
  // footprint must load both materials without interpolating a deep mud rut
  // into a dirt sample between grid vertices.
  const terrain = new Terrain(), z = -150.03;
  let low = 0, high = 48;
  for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (terrain.biomeAt(mid, z) === 'mud') high = mid; else low = mid; }
  const x = (low + high) / 2; // Locate the actual irregular boundary, rather than the retired ellipse.
  assert.equal(terrain.surfaceAt(x - .06, z), 'dirt');
  for (let i = 0; i < 80; i++) terrain.deform(x - .06, z, { load: 18000, pressure: 60, slip: 1.5, contactWidth: .6, contactLength: .7, dt: .05 });
  let firmSink = 0, softSink = 0;
  for (let iz = -10; iz <= 10; iz++) for (let ix = -10; ix <= 10; ix++) {
    const sample = terrain.sample(x + ix * .029, z + iz * .029);
    if (sample.surface === 'dirt') { firmSink = Math.max(firmSink, sample.sink); assert.ok(sample.sink <= .012001 && sample.berm <= .003001); }
    else if (sample.surface === 'mud') softSink = Math.max(softSink, sample.sink);
  }
  assert.ok(firmSink > .001 && softSink > .03, 'The same mixed footprint produces the distinct firm and soft responses');
});

test('triangle interpolation preserves rigid surfaces beside and within a deforming tire footprint', () => {
  const rockZ = 123.03, boundaryTerrain = new Terrain();
  let rockLow = 30, rockHigh = 121;
  for (let i = 0; i < 40; i++) { const mid = (rockLow + rockHigh) / 2; if (boundaryTerrain.biomeAt(mid, rockZ) === 'rock') rockHigh = mid; else rockLow = mid; }
  const rockX = (rockLow + rockHigh) / 2;
  for (const [edgeX, edgeZ, trackX, trackZ, rigid] of [
    [-100, -115.03, -99.84, -115.03, 'asphalt'],
    [-116, 17.03, -116.16, 17.03, 'asphalt'],
    [-100, 240, -99.88, 240.12, 'asphalt'],
    [rockX, rockZ, rockX - .16, rockZ, 'rock'],
  ]) {
    const terrain = new Terrain(), samples = [];
    for (let iz = -8; iz <= 8; iz++) for (let ix = -8; ix <= 8; ix++) {
      const x = edgeX + ix * .037, z = edgeZ + iz * .037;
      if (terrain.surfaceAt(x, z) === rigid) samples.push({ x, z, height: terrain.heightAt(x, z) });
    }
    for (let i = 0; i < 40; i++) terrain.deform(trackX, trackZ, { load: 20000, pressure: 60, slip: 2.5, contactWidth: .60, contactLength: .70, dt: .05 });
    assert.ok(terrain.detailTiles.size > 0 && terrain.soilVolumes.depressed > 0, 'Adjacent yielding ground must actually deform');
    assert.ok(samples.length > 20);
    for (const point of samples) {
      const sample = terrain.sample(point.x, point.z);
      assert.equal(sample.sink, 0); assert.equal(sample.berm, 0); assert.equal(sample.compaction, 0); assert.equal(sample.tread, 0); assert.equal(sample.churn, 0);
      assert.ok(Math.abs(sample.height - point.height) < 1e-6, `${rigid} height remains unchanged within Float32 mesh precision`);
    }
  }
});
