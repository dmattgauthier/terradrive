// Reproducible offline evidence: actual simulator data, without a browser/GPU.
// node tests/render-terrain-evidence.mjs /tmp/terra-terrain-evidence.json
import { writeFileSync } from 'node:fs';
import { Terrain } from '../dist/src/terrain.js';
import { VehiclePhysics } from '../dist/src/physics.js';
import { VEHICLES } from '../dist/src/vehicles.js';

const evidence = { runs: [], controlled: [] }, spec = VEHICLES.find(v => v.id === 'wrangler-rubicon');
for (const surface of ['mud', 'sand']) for (const pressure of [14, 42]) {
  const terrain = new Terrain(), physics = new VehiclePhysics(terrain, spec), x = surface === 'mud' ? 48 : 204, z = surface === 'mud' ? -140 : -125;
  physics.reset({ x, z, heading: 0 }); physics.setPressure(pressure); physics.setControl('selector', 'N'); physics.setControl('driveMode', '4L'); physics.setControl('rearLocked', true); physics.setControl('frontLocked', true); physics.setControl('selector', 'D');
  for (let i = 0; i < 780; i++) physics.step(1 / 120, { throttle: .34 });
  const nx = 101, nz = 221, minX = x - 2.5, minZ = z + .5, step = .05, height = [], displacement = [], compaction = [], tread = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const sample = terrain.sample(minX + i * step, minZ + j * step); height.push(sample.height); displacement.push(sample.berm - sample.sink); compaction.push(sample.compaction); tread.push(sample.tread); }
  let deepest = 0, berm = 0; for (const tile of terrain.detailTiles.values()) for (const v of tile.delta) { deepest = Math.max(deepest, -v); berm = Math.max(berm, v); }
  evidence.runs.push({ surface, pressure, x, z, nx, nz, minX, minZ, step, height, displacement, compaction, tread, distance: physics.state.position.z - z, speedKmh: physics.state.speedKmh, deepest, berm, tiles: terrain.detailTiles.size, volumes: terrain.soilVolumes });
}
for (const pressure of [14, 42]) {
  const terrain = new Terrain();
  for (let i = 0; i <= 480; i++) terrain.deform(48, -130 + i * .025, { wheelId: 'controlled', width: .30, load: 4500, pressure, slip: .25, speed: 3, dt: 1 / 120 });
  const profile = []; for (let i = 0; i <= 140; i++) { const across = -.7 + i * .01, sample = terrain.sample(48 + across, -125); profile.push([across, sample.berm - sample.sink]); }
  evidence.controlled.push({ pressure, profile, sink: terrain.sample(48, -125).sink });
}
const terrain = new Terrain(), nx = 401, nz = 401, minX = -270, minZ = -260, step = 1.35, height = [], color = [];
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = minX + i * step, z = minZ + j * step, c = terrain.colorAt(x, z); height.push(terrain.heightAt(x, z)); color.push(c.r, c.g, c.b); }
evidence.map = { nx, nz, minX, minZ, step, height, color, zones: terrain.zones };
writeFileSync(process.argv[2] || '/tmp/terra-terrain-evidence.json', JSON.stringify(evidence));
console.log(JSON.stringify({ runs: evidence.runs.map(({ surface, pressure, distance, deepest, berm, tiles, volumes }) => ({ surface, pressure, distance, deepest, berm, tiles, volumes })), controlled: evidence.controlled.map(({ pressure, sink }) => ({ pressure, sink })) }, null, 2));
