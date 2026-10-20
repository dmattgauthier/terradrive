import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { Terrain, surfaceResponse, SURFACE_REGIONS } from '../dist/src/terrain.js';
import { SNOW_REGION, landscapeNoise, naturalTerrainOffset, regionDistance, woodlandCover } from '../dist/src/terrain-diversity.js';
import { deriveVehicle, normalizeBuild, validateBuild, upgradeOptions } from '../dist/src/upgrades.js';
import { VEHICLES } from '../dist/src/vehicles.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { TireSpray } from '../dist/src/tire-spray.js';
import { createTrackModule } from '../dist/src/track-view.js';
import { createTerrainMaterial } from '../dist/src/terrain-shading.js';
import { workshopHTML } from '../dist/src/workshop-view.js';
import { VehicleView } from '../dist/src/vehicle-view.js';

test('landforms and vegetation form deterministic irregular patches without a short repeated strip', () => {
  const heights = [], cover = [];
  for (let x = -160; x < 160; x += 2) {
    const value = naturalTerrainOffset(x, -62);
    assert.equal(value, naturalTerrainOffset(x, -62));
    assert(Number.isFinite(value)); heights.push(value); cover.push(woodlandCover(x, -62));
  }
  assert(Math.max(...heights) - Math.min(...heights) > 2.5);
  assert(Math.max(...cover) - Math.min(...cover) > .5, 'The forest must contain both glades and stands');
  for (const period of [4, 8, 16, 32]) {
    const difference = heights.slice(period).reduce((sum, height, i) => sum + Math.abs(height - heights[i]), 0) / (heights.length - period);
    assert(difference > .10, `A ${period * 2} m offset must not reproduce the same terrain strip`);
  }
  const edges = Array.from({ length: 24 }, (_, i) => {
    const angle = i / 24 * Math.PI * 2;
    return regionDistance(48 + 40 * Math.cos(angle), -115 + 62 * Math.sin(angle), 48, -115, 40, 62);
  });
  assert(Math.max(...edges) - Math.min(...edges) > .035, 'Biome edges must break the original perfect ellipse');
  assert(landscapeNoise(0, 0) >= 0 && landscapeNoise(-2.1, 7.3) <= 1);
});

test('snow is a real nonoverlapping deformable region with variable depth and a selectable spawn', () => {
  const terrain = new Terrain(), zone = terrain.zones.find(zone => zone.id === 'snow');
  assert(zone);
  assert.equal(terrain.sample(zone.spawn.x, zone.spawn.z).surface, 'snow');
  const mapColor = terrain.colorAt(zone.spawn.x, zone.spawn.z);
  assert(mapColor.r > .65 && mapColor.b > mapColor.r, 'The map shows the actual cold-white snow region');
  const depths = [];
  for (let z = 240; z <= 330; z += 10) for (let x = -290; x <= -190; x += 10) {
    const sample = terrain.sample(x, z);
    if (sample.surface === 'snow') depths.push(sample.snowDepth);
    assert(Number.isFinite(sample.height) && sample.normal.y > 0);
  }
  assert(Math.max(...depths) - Math.min(...depths) > .25);
  assert(terrain.patches.find(p => p.id === 'snow').deformable);
  const winter = terrain.patches.find(p => p.id === 'snow');
  for (let i = 0; i < 25; i++) {
    const x = winter.minX + .37 + i * (winter.maxX - winter.minX - 1) / 25;
    const z = winter.minZ + .37 + i * (winter.maxZ - winter.minZ - 1) / 25;
    for (const edge of [winter.minX, winter.maxX]) assert(Math.abs(terrain.heightAt(edge - 1e-7, z) - terrain.heightAt(edge + 1e-7, z)) < 5e-6);
    for (const edge of [winter.minZ, winter.maxZ]) assert(Math.abs(terrain.heightAt(x, edge - 1e-7) - terrain.heightAt(x, edge + 1e-7)) < 5e-6);
  }
  for (let i = 0; i < terrain.patches.length; i++) for (const b of terrain.patches.slice(i + 1)) {
    const a = terrain.patches[i];
    assert(Math.min(a.maxX, b.maxX) <= Math.max(a.minX, b.minX) || Math.min(a.maxZ, b.maxZ) <= Math.max(a.minZ, b.minZ));
  }
  assert(surfaceResponse('snow').softness > .8);
  assert(surfaceResponse('snow', { compaction: 1 }).rollingResistance < surfaceResponse('snow').rollingResistance);
  assert.equal(terrain.biomeAt(SNOW_REGION.cx, SNOW_REGION.cz), 'snow');
  for (const region of SURFACE_REGIONS) {
    for (let z = region.cz - region.rz - 5; z <= region.cz + region.rz + 5; z += 4) {
      for (let x = region.cx - region.rx - 5; x <= region.cx + region.rx + 5; x += 4) {
        if (terrain.biomeAt(x, z) === region.surface) assert.equal(terrain.getPatch(x, z)?.id, region.surface,
          'Irregular contact boundaries must stay inside the matching rendered patch');
      }
    }
  }
});

test('track choices persist reversibly and require a supported driveline', () => {
  for (const base of VEHICLES) {
    const allowed = base.bodyStyle !== 'sedan';
    assert.equal(upgradeOptions(base).find(group => group.id === 'runningGear').options.some(option => option.id === 'tracks'), allowed);
    if (!allowed) { assert.equal(normalizeBuild(base, { runningGear: 'tracks' }).runningGear, 'stock'); continue; }
    const build = { runningGear: 'tracks', ...(base.bodyStyle === 'van' ? { drivetrain: 'conversion' } : {}) };
    assert(validateBuild(base, build).ok);
    const spec = deriveVehicle(base, build), restored = deriveVehicle(base);
    assert(spec.tracks && spec.mass > base.mass && spec.tireWidth === spec.tracks.width);
    assert.equal(restored.tracks, undefined);
    assert.equal(restored.mass, base.mass);
    assert.deepEqual(deriveVehicle(base, JSON.parse(JSON.stringify(spec.upgrade.build))), spec);
    assert(workshopHTML(base, build).includes('Snow flotation tracks'));
  }
  assert(!validateBuild(VEHICLES.find(base => base.bodyStyle === 'van'), { runningGear: 'tracks' }).ok);
});

function snowDrive(runningGear) {
  const terrain = new Terrain(), spec = deriveVehicle(VEHICLES[0], { runningGear });
  const sim = new VehiclePhysics(terrain, spec), spray = new TireSpray();
  sim.reset({ x: -265, z: 280, heading: 0 });
  assert(sim.setControl('driveMode', '4H').ok);
  let pressure = 0, sink = 0, count = 0, area = 0, peakUse = 0;
  for (let frame = 0; frame < 420; frame++) {
    sim.step(1 / 120, frame < 180 ? { brake: 1, handbrake: true } : { throttle: .55 });
    if (frame < 180) continue;
    spray.update(1 / 120, sim.state, terrain);
    for (const wheel of sim.state.wheels) if (wheel.contact) {
      assert.equal(wheel.surface, 'snow');
      pressure += wheel.load / Math.max(.001, wheel.contactArea); sink += wheel.sink; area += wheel.contactArea; count++;
      peakUse = Math.max(peakUse, wheel.frictionUtilization);
      if (spec.tracks) { assert.equal(wheel.contactLength, spec.tracks.length); assert.equal(wheel.contactWidth, spec.tracks.width); }
    }
  }
  assert(count > 750, 'The normal reset/input route must retain sustained real support');
  assert(peakUse <= 1 + 1e-9);
  assert(sim.state.damage.condition > .99);
  assert(Number.isFinite(sim.state.position.y));
  assert(spray.emitted.snow > 0 && spray.emitted.mud === 0 && spray.emitted.water === 0);
  return { pressurePa: pressure / count, sinkM: sink / count, areaM2: area / count,
    snowParcels: spray.emitted.snow, speedMps: sim.state.speed, soilTiles: terrain.detailTiles.size };
}

test('normal tracked driving lowers actual ground pressure and snow sinkage, with snow-only ejecta', t => {
  const tires = snowDrive('stock'), tracks = snowDrive('tracks');
  t.diagnostic(JSON.stringify({ tires, tracks }));
  assert(tracks.pressurePa < tires.pressurePa * .35);
  assert(tracks.areaM2 > tires.areaM2 * 4);
  assert(tracks.sinkM < tires.sinkM * .75);
});

test('visible belts fit the contact datum and circulate with drive motion without rotating the module', () => {
  const materials = Object.fromEntries(['rubber', 'dark', 'rim', 'tread'].map(name => [name, new THREE.MeshStandardMaterial()]));
  const spec = deriveVehicle(VEHICLES[0], { runningGear: 'tracks' }), view = createTrackModule(spec, materials);
  const bounds = new THREE.Box3().setFromObject(view.root), before = view.track.lugs.instanceMatrix.array.slice();
  assert(Math.abs(bounds.min.y + spec.tireRadius) < .035);
  assert(bounds.max.z - bounds.min.z > spec.tracks.length);
  const quaternion = view.root.quaternion.clone(); view.track.update({ rotation: .43 });
  assert(!before.every((value, i) => value === view.track.lugs.instanceMatrix.array[i]));
  assert(view.root.quaternion.equals(quaternion));
  view.root.traverse(mesh => { if (mesh.geometry) { assert(mesh.geometry.attributes.position.array.every(Number.isFinite)); mesh.geometry.dispose(); } });
  for (const material of Object.values(materials)) material.dispose();
});

test('track ground shoes have finite rigid front and side contacts over the visible belt length', () => {
  const spec = deriveVehicle(VEHICLES[0], { runningGear: 'tracks' });
  const terrain = { sample: () => ({ ...surfaceResponse('snow'), surface: 'snow', snowDepth: .4,
    height: 0, waterDepth: 0, normal: { x: 0, y: 1, z: 0 } }) };
  const sim = new VehiclePhysics(terrain, spec);
  sim.step(1 / 120, { brake: 1, handbrake: true });
  const shoes = sim.body.shapes.filter(shape => shape.terraSidewallWheel);
  assert.equal(shoes.length, 4);
  for (const shape of shoes) {
    assert.equal(shape.halfExtents.z * 2, spec.tracks.length);
    assert.equal(shape.halfExtents.x * 2, spec.tracks.width);
    const offset = sim.body.shapeOffsets[sim.body.shapes.indexOf(shape)], wheel = shape.terraSidewallWheel;
    assert(Math.abs(offset.y - shape.halfExtents.y - (wheel.mount.y - wheel.length - spec.tireRadius)) < 1e-10);
  }
});

test('the actual vehicle model installs four batched tracks and follows published contact poses', () => {
  const spec = deriveVehicle(VEHICLES[0], { runningGear: 'tracks' }), scene = new THREE.Scene();
  const view = new VehicleView(scene, spec);
  const terrain = { sample: () => ({ ...surfaceResponse('snow'), surface: 'snow', snowDepth: .4,
    height: 0, waterDepth: 0, normal: { x: 0, y: 1, z: 0 } }) };
  const sim = new VehiclePhysics(terrain, spec); sim.step(1 / 120, { brake: 1, handbrake: true });
  view.update(sim.state);
  assert.equal(view.wheels.length, 4);
  for (let i = 0; i < 4; i++) {
    const module = view.wheels[i], contact = sim.state.wheels[i];
    assert(module.track);
    assert(module.root.position.distanceTo(new THREE.Vector3(contact.position.x, contact.position.y, contact.position.z)) < 1e-10);
    let draws = 0; module.root.traverse(object => { if (object.isMesh) draws++; });
    assert(draws <= 4, 'Fixed rollers and frame pieces must be batched rather than adding dozens of draws');
  }
  view.dispose(); assert.equal(scene.children.length, 0);
});

test('production terrain shaders retain matched rotated PBR channels and a separate snow material', () => {
  const world = { terrain: { moisture: 0, waterLevel: 3.18 }, quality: 'high',
    _surfaceTextures: () => ({ map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() }) };
  const material = createTerrainMaterial(world, 'snow', 'mossy_rock', [-240, 288, 91, 78], 3);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.tdSnow.value, 1);
  assert(shader.fragmentShader.includes('tdScanNormal(normalMap,tdPrimaryTile)'));
  assert(shader.fragmentShader.includes('vec2(tile.r0.x,-tile.r0.y)'));
  assert(shader.fragmentShader.includes('tdSnowColor'));
  assert(shader.fragmentShader.includes('tdRegionDistance(p,tdEllipse)'));
  material.dispose();
});
