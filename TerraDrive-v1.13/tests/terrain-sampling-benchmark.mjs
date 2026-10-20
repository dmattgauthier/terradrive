/** Bounded CPU/retained-heap sampling diagnostic; not a browser FPS test. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).reduce((out, value, i, input) => {
  if (value.startsWith('--')) out.push([value.slice(2), input[i + 1]]); return out;
}, []));
const baselineRoot = resolve(args.baseline || '/tmp/terra-v17-baseline-1p6');
const candidateRoot = resolve(args.candidate || fileURLToPath(new URL('..', import.meta.url)));
const runs = Number(args.runs || 7), count = Number(args.count || 16000), retainedCount = Number(args.retained || 8000);
if (!global.gc) throw new Error('Run this bounded memory diagnostic with node --expose-gc.');
const sha = data => createHash('sha256').update(data).digest('hex');
async function sourceHashes(root) {
  const result = {};
  for (const path of ['dist/src/terrain.js', 'dist/src/surface-response.js']) {
    try { result[path] = sha(await readFile(resolve(root, path))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result;
}
const before = { baseline: await sourceHashes(baselineRoot), candidate: await sourceHashes(candidateRoot) };
const [{ Terrain: Baseline }, { Terrain: Candidate }] = await Promise.all([
  import(pathToFileURL(resolve(baselineRoot, 'dist/src/terrain.js')).href),
  import(pathToFileURL(resolve(candidateRoot, 'dist/src/terrain.js')).href),
]);
const terrain = { baseline: new Baseline(), candidate: new Candidate() };
const trailX = terrain.candidate.trailX(-82);
const cases = [
  { id: 'dry-pavement', x: -108, z: -186, moisture: 0 },
  { id: 'dry-hardpack', x: trailX, z: -82, moisture: 0 },
  { id: 'dry-gravel', x: trailX + 4.25, z: -82, moisture: 0 },
  { id: 'dry-grass', x: -51, z: 282, moisture: 0 },
  { id: 'mixed-hardpack-gravel', x: trailX + 3.3, z: -82, moisture: 0 },
  { id: 'dry-rock', x: 121, z: 121, moisture: 0 },
  { id: 'wet-pavement', x: -108, z: -186, moisture: 1 },
  { id: 'disturbed-wet-mud', x: 48, z: -126, moisture: 1 },
];
// Repeat the same two loaded passes for both versions before timing. Different
// response coefficients are expected; the actual geometric sampling workload
// remains representative and no deformation occurs inside a timed loop.
for (const t of Object.values(terrain)) {
  t.setMoisture(1);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i <= 320; i++) t.deform(48, -130 + i / 40, {
    load: 4500, pressure: 35, contactWidth: .30, contactLength: .27,
    slip: 1.2, speed: 3, dt: 1 / 120, heading: 0, wheelId: 'sampling-review',
  });
}
const offsets = Array.from({ length: 128 }, (_, i) => ({ x: ((i * 17) % 127 - 63) * .0007, z: ((i * 43) % 127 - 63) * .0007 }));
let sink = 0;
function batch(version, item, size) {
  const t = terrain[version]; t.setMoisture(item.moisture);
  const start = process.hrtime.bigint(); let checksum = 0;
  for (let i = 0; i < size; i++) {
    const offset = offsets[i % offsets.length], sample = t.sample(item.x + offset.x, item.z + offset.z);
    checksum += sample.height + sample.mu + sample.rollingResistance + sample.sink + (sample.tireResponse?.lateral || 0);
  }
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  sink += checksum;
  return elapsed;
}
// Warm every version/material shape before alternating measured pairs.
for (let round = 0; round < 3; round++) for (const item of cases) for (const version of ['baseline', 'candidate']) batch(version, item, 5000);
const measurements = Object.fromEntries(cases.map(item => [item.id, { baseline: [], candidate: [] }]));
for (let round = 0; round < runs; round++) {
  const order = round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
  for (let j = 0; j < cases.length; j++) {
    const item = cases[(j + round) % cases.length];
    for (const version of order) measurements[item.id][version].push(batch(version, item, count));
  }
}
const median = values => { const a = [...values].sort((a, b) => a - b); return a[Math.floor(a.length / 2)]; };
const timing = cases.map(item => {
  const values = measurements[item.id], summary = {};
  for (const version of ['baseline', 'candidate']) summary[version] = {
    elapsedMs: values[version], medianMicrosecondsPerSample: median(values[version]) * 1000 / count,
    minimumMicrosecondsPerSample: Math.min(...values[version]) * 1000 / count,
    maximumMicrosecondsPerSample: Math.max(...values[version]) * 1000 / count,
  };
  return { ...item, ...summary, ratio: summary.candidate.medianMicrosecondsPerSample / summary.baseline.medianMicrosecondsPerSample };
});
// Retained heap answers how much simultaneous sample data occupies. It is not
// an allocation-rate or GC-pause measurement; common frozen profiles may share
// storage. Runtime, terrain arrays and timing data exist before each baseline.
let keep = null;
function memory(version, item) {
  const t = terrain[version]; t.setMoisture(item.moisture); keep = null; global.gc();
  const before = process.memoryUsage().heapUsed;
  keep = new Array(retainedCount);
  for (let i = 0; i < retainedCount; i++) {
    const offset = offsets[i % offsets.length]; keep[i] = t.sample(item.x + offset.x, item.z + offset.z);
  }
  global.gc(); const retainedBytes = process.memoryUsage().heapUsed - before;
  sink += keep[retainedCount - 1].height; keep = null; global.gc();
  return retainedBytes;
}
const retained = cases.map(item => {
  const values = { baseline: [], candidate: [] };
  for (let round = 0; round < 3; round++) for (const version of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) values[version].push(memory(version, item));
  return { id: item.id, retainedCount, ...Object.fromEntries(Object.entries(values).map(([version, bytes]) => [version, { trialsBytes: bytes, medianBytesPerRetainedSample: median(bytes) / retainedCount }])) };
});
const after = { baseline: await sourceHashes(baselineRoot), candidate: await sourceHashes(candidateRoot) };
const stable = JSON.stringify(before) === JSON.stringify(after);
const report = {
  createdUTC: new Date().toISOString(), command: process.argv,
  method: 'Interleaved warmed Terrain.sample CPU loops over 128 nearby actual-map coordinates; alternate version order and rotate material order. Explicit-GC retained heap measured separately.',
  limits: 'Node CPU and retained-sample heap only; not browser frame rate, GC allocation rate, or end-to-end frame time. Other concurrent work can affect timings. Coefficients differ intentionally from v1.6.',
  runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
  baselineRoot, candidateRoot, runs, samplesPerRun: count, warmupSamplesPerCaseAndVersion: 15000,
  sourceHashes: before, sourceStable: stable,
  benchmarkSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  timing, retained, checksum: sink,
};
if (args.output) await writeFile(resolve(args.output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ sourceStable: stable, timing: timing.map(item => ({ id: item.id, baselineUS: +item.baseline.medianMicrosecondsPerSample.toFixed(3), candidateUS: +item.candidate.medianMicrosecondsPerSample.toFixed(3), ratio: +item.ratio.toFixed(2) })), retained: retained.map(item => ({ id: item.id, baselineBytes: +item.baseline.medianBytesPerRetainedSample.toFixed(1), candidateBytes: +item.candidate.medianBytesPerRetainedSample.toFixed(1) })), output: args.output }, null, 2));
if (!stable) process.exitCode = 1;
