import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {beginSourceExport, publishSourceExport, verifySourceExport} from './source-export-state.mjs';

const tools = import.meta.dirname;
const repo = path.resolve(tools, '..', '..');
const oldTerrain = Buffer.from('field before Granite');
const newTerrain = Buffer.from('field with Granite relief and paint');
const oldManifest = {assets: [], materials: [], routes: [{name: 'Boreal'}]};
const newManifest = {...oldManifest, routes: [...oldManifest.routes, {name: 'Granite'}]};
const collisionFiles = ['vehicle-ground-probes.json', 'vehicle-collision.json'];
const collisionBakers = ['bake-vehicle-ground-probes.mjs', 'bake-coachwork-collision.mjs'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureTire = {name: 'truck_tire', sha256: digest('fixture tire geometry')};

function copyTools(root, files) {
  for (const file of files) fs.copyFileSync(path.join(tools, file), path.join(root, 'Tools', file));
}

function withProject(run) {
  const scratch = fs.mkdtempDisposableSync(path.join(os.tmpdir(), 'terra-export-test-'));
  const root = path.join(scratch.path, 'Project');
  try {
    for (const dir of ['Tools', 'SourceAssets', 'Content/NativeData', 'Content/Maps', 'Saved']) {
      fs.mkdirSync(path.join(root, dir), {recursive: true});
    }
    copyTools(root, ['source-export-state.mjs', 'verify-source-export.mjs', 'verify-baked-vehicle-collision.mjs', 'build-native.ps1']);
    run(root);
  } finally {
    const resolved = fs.realpathSync(scratch.path);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(resolved), /^terra-export-test-/);
    scratch.remove();
  }
}

function runNode(root, script) {
  const result = spawnSync(process.execPath, [path.join(root, 'Tools', script)], {encoding: 'utf8', timeout: 60000});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function checkReuse(root, expectedFailure) {
  const result = spawnSync(process.execPath, [path.join(root, 'Tools/verify-source-export.mjs')], {encoding: 'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, expectedFailure ? 1 : 0, result.stderr);
  assert.match(expectedFailure ? result.stderr : result.stdout,
    expectedFailure ?? /^[a-f0-9]{64}\r?\n$/);
  return result.stdout.trim();
}

function runBuild(root, flags) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'Tools/build-native.ps1'), ...flags
  ], {encoding: 'utf8', timeout: 30000});
  assert.ifError(result.error);
  return result;
}

function checkBuildRejected(root, flags, ...reasons) {
  const result = runBuild(root, flags);
  assert.equal(result.status, 1, result.stderr);
  for (const reason of reasons) assert.match(result.stderr, reason);
}

function publishVehicle(root, shift) {
  const vertices = [];
  for (let x = -240; x <= 240; x += 20) {
    for (let y = -90; y <= 90; y += 15) {
      for (let z = -50; z <= 110; z += 20) vertices.push(`v ${x + shift} ${y} ${z}`);
    }
  }
  const body = vertices.join('\n') + '\nusemtl M_000\n';
  const sha256 = digest(body);
  beginSourceExport(root);
  fs.writeFileSync(path.join(root, 'SourceAssets/truck_body.obj'), body);
  publishSourceExport(root, {
    meshSchema: 2,
    assets: [{name: 'truck_body', sha256}, fixtureTire],
    materials: [{id: 'M_000', opacity: 1, automotive: 'paint'}],
    vehicles: [{id: 'truck', asset: 'truck', width: 2, height: 2.2, cgHeight: 0.8, clearance: 0.2, tireRadius: 0.42, tireFits: []}],
  }, oldTerrain);
  return sha256;
}

function recordFixtureImport(root, probeVersion = 3) {
  fs.writeFileSync(path.join(root, 'Content/Maps/ProvingGround.umap'), 'imported map');
  fs.writeFileSync(path.join(root, 'Content/NativeData/terrain-blend.bin'), 'imported mask');
  const stock = {stage: 0, asset: fixtureTire.name, sha256: fixtureTire.sha256, radiusM: 0.42,
    pointsCm: Array.from({length: 24}, (_, i) => [i, 1, 2])};
  fs.writeFileSync(path.join(root, 'Content/NativeData/vehicle-tire-probes.json'),
    JSON.stringify({version: probeVersion, vehicles: [{id: 'truck', stages: [stock]}]}));
  const receipt = {
    complete: true,
    sourceExportSHA256: checkReuse(root),
    terrainBlendSHA256: digest('imported mask'),
    vehicleCollisionSHA256: digest(collisionFiles.map(file =>
      digest(fs.readFileSync(path.join(root, 'Content/NativeData', file)))).join('\n')),
  };
  const bytes = JSON.stringify(receipt);
  fs.writeFileSync(path.join(root, 'Saved/import-complete.json'), bytes);
  return digest(bytes);
}

test('tire fit reuse tracks resize code and suspension geometry', () => withProject(root => {
  copyTools(root, ['tire-fit.mjs', 'tire-wheelhouse.mjs', 'tire-size-geometry.mjs', 'read-cached-json.mjs']);
  const asset = (name, contents) => {
    fs.writeFileSync(path.join(root, 'SourceAssets', name + '.obj'), contents);
    return {name, slots: ['M_000'], sha256: digest(contents)};
  };
  // One triangle in the front wheel opening and one clear of the cutter.
  const body = ['v 150 90 -30', 'v 152 90 -30', 'v 150 92 -28',
    'v -100 -75 85', 'v 100 -75 85', 'v 0 75 90',
    ...Array(6).fill('vn 0 0 1'), ...Array(6).fill('vt 0 0'),
    'usemtl M_000', 'f 1/1/1 2/2/2 3/3/3', 'f 4/4/4 5/5/5 6/6/6'].join('\n') + '\n';
  const tire = 'v 60.96 0 0\nv 0 0 60.96\nv 0 12 -60.96\nusemtl M_000\nf 1 2 3\n';
  const vehicle = {id: 'truck', asset: 'truck', tireSize: '305/80R22', tireRadius: 0.6096,
    track: 1.8, wheelbase: 3, frontWeightFraction: 0.5, cgHeight: 0.9,
    tireWidth: 0.305, suspension: {travel: 0.2}};
  beginSourceExport(root);
  publishSourceExport(root, {
    assets: [asset('truck_body', body), asset('truck_tire', tire)],
    materials: [{id: 'M_000'}], vehicles: [vehicle],
  }, oldTerrain);

  const reportFile = path.join(root, 'Saved/TireClearance/fit-report.json');
  const bakedTire = path.join(root, 'SourceAssets/truck_tire_size1_0.obj');
  const bake = () => {
    runNode(root, 'tire-fit.mjs');
    return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  };
  const before = bake();
  const originalTire = fs.readFileSync(bakedTire, 'utf8');
  const oldTime = new Date('2000-01-01T00:00:00Z');
  fs.utimesSync(bakedTire, oldTime, oldTime);
  assert.deepEqual(bake(), before);
  assert.equal(fs.statSync(bakedTire).mtimeMs, oldTime.getTime(), 'unchanged inputs reuse the existing OBJ');

  const helper = path.join(root, 'Tools/tire-size-geometry.mjs');
  const code = fs.readFileSync(helper, 'utf8');
  const revised = code.replace('x*s} ', 'x*s*1.001} ');
  assert.notEqual(revised, code);
  fs.writeFileSync(helper, revised);

  const after = bake();
  assert.notEqual(after.version, before.version);
  assert.deepEqual(after.vehicles[0].tireFits, before.vehicles[0].tireFits);
  const updatedTire = fs.readFileSync(bakedTire, 'utf8');
  assert.notEqual(updatedTire, originalTire);
  const treadX = Number(updatedTire.split(/\s+/)[1]);
  assert.ok(Math.abs(treadX - 63.5 * 1.001) < 0.000001);
  assert.equal(after.vehicles[0].variants.find(item => item.name === 'truck_tire_size1_0').sha256, digest(updatedTire));

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SourceAssets/import.json'), 'utf8'));
  manifest.vehicles[0].suspension.travel = 0.1;
  beginSourceExport(root);
  publishSourceExport(root, manifest, oldTerrain);
  const afterTravel = bake();
  assert.equal(afterTravel.version, after.version);
  assert.deepEqual(afterTravel.vehicles[0].tireFits, after.vehicles[0].tireFits);
  assert.notEqual(afterTravel.vehicles[0].geometry[0].sha256, after.vehicles[0].geometry[0].sha256);
}));

test('fresh and retried exports allow reuse only after completion', () => withProject(root => {
  checkReuse(root, /export-state\.json/);
  beginSourceExport(root);
  publishSourceExport(root, oldManifest, oldTerrain);
  checkReuse(root);
  beginSourceExport(root);
  checkReuse(root, /the last export did not complete/);
  publishSourceExport(root, newManifest, newTerrain);
  checkReuse(root);
}));

test('publication interrupted after the two manifests is rejected by the build recipe', () => withProject(root => {
  beginSourceExport(root);
  publishSourceExport(root, oldManifest, oldTerrain);
  beginSourceExport(root);
  const terrain = path.join(root, 'Content/NativeData/terrain.bin');
  const rename = fs.renameSync;
  // Produce the same partial state as a failed terrain replacement without
  // interrupting a real export or requiring a Windows file lock.
  fs.renameSync = (from, to) => {
    if (to === terrain) throw new Error('simulated terrain replacement failure');
    return rename(from, to);
  };
  try {
    assert.throws(() => publishSourceExport(root, newManifest, newTerrain), /simulated terrain replacement failure/);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'SourceAssets/import.json'))), newManifest);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'Content/NativeData/world.json'))), {routes: newManifest.routes});
  assert.deepEqual(fs.readFileSync(terrain), oldTerrain);
  checkReuse(root, /the last export did not complete/);

  for (const flags of [['-ImportAssets', '-SkipExport', '-Package'], ['-SkipBuild', '-Package'], ['-SkipBuild', '-Package', '-SkipCook']]) {
    checkBuildRejected(root, flags, /the last export did not complete/, /Native source export verification failed/);
  }
  beginSourceExport(root);
  publishSourceExport(root, newManifest, newTerrain);
  checkReuse(root);
}));

test('the verifier and build reject an interrupted export through a Windows junction', () => withProject(root => {
  const alias = path.join(root, 'project junction');
  fs.symlinkSync(root, alias, 'junction');
  try {
    beginSourceExport(root);
    publishSourceExport(root, oldManifest, oldTerrain);
    assert.equal(checkReuse(alias), checkReuse(root));
    beginSourceExport(root);
    fs.writeFileSync(path.join(root, 'Content/NativeData/world.json'), JSON.stringify({routes: newManifest.routes}));
    checkReuse(alias, /the last export did not complete/);
    checkBuildRejected(alias, ['-ImportAssets', '-SkipExport', '-Package'], /the last export did not complete/);
  } finally {
    fs.unlinkSync(alias);
  }
}));

test('a verified export regenerates stale lower-body probes and hulls through a Windows junction', () => withProject(root => {
  copyTools(root, collisionBakers);
  const previous = publishVehicle(root, 0);
  const previousExport = checkReuse(root);
  for (const script of collisionBakers) runNode(root, script);
  const files = collisionFiles.map(file => path.join(root, 'Content/NativeData', file));
  const oldBakes = files.map(file => fs.readFileSync(file, 'utf8'));
  for (const json of oldBakes) assert.equal(JSON.parse(json).vehicles[0].objSha256, previous);

  const current = publishVehicle(root, 10);
  const alias = path.join(path.dirname(root), 'project junction');
  fs.symlinkSync(root, alias, 'junction');
  try {
    assert.notEqual(checkReuse(alias), previousExport);
    for (const script of collisionBakers) runNode(alias, script);
  } finally {
    fs.unlinkSync(alias);
  }
  for (const file of files) {
    const body = JSON.parse(fs.readFileSync(file, 'utf8')).vehicles[0];
    assert.equal(body.objSha256, current, file);
    assert.equal(body.boundsCM.min[0], -230, file);
  }
  recordFixtureImport(root);
  // Even a byte edit that retains the right OBJ identity invalidates the import.
  fs.appendFileSync(files[0], '\n');
  checkBuildRejected(root, ['-SkipBuild', '-Package'], /Vehicle collision bake differs from the completed asset import/);

  // A successful baker exit alone cannot seal an import with the old pair.
  files.forEach((file, index) => fs.writeFileSync(file, oldBakes[index]));
  for (const script of [...collisionBakers, 'bake-tire-probes.mjs']) {
    fs.writeFileSync(path.join(root, 'Tools', script), '');
  }
  checkBuildRejected(root, ['-SkipBuild', '-ImportAssets', '-SkipExport'],
    /does not match the exported body for truck/, /Vehicle collision bake verification failed/);
  assert.equal(fs.existsSync(path.join(root, 'Saved/import-complete.json')), false);
}));

test('a matching terrain report repairs a truncated physical mask and validates every output', () => withProject(root => {
  copyTools(root, [
    'bake-terrain-transitions.mjs', 'perimeter-trail.mjs', 'slate-rim-pilot.mjs', 'granite-ground.mjs',
    'offroad-courses.mjs', 'read-cached-json.mjs', 'quarry-trail.mjs', 'deep-mud.mjs',
    'vehicle-fidelity.mjs', 'vehicle-geometry.mjs',
  ]);
  const browser = 'TerraDrive-v1.13';
  for (const file of ['package.json', 'dist/vendor/three.module.js', 'dist/vendor/three.core.js', 'dist/src/vehicle-tessellation.js']) {
    const target = path.join(path.dirname(root), browser, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(repo, browser, file), target);
  }
  const n = 1601, terrain = Buffer.alloc(16 + n * n * 9);
  terrain.writeUInt32LE(0x54445256, 0);
  terrain.writeUInt32LE(n, 4);
  terrain.writeFloatLE(0.5, 8);
  terrain.writeFloatLE(-400, 12);
  for (let i = n * 800; i < n * n; i++) terrain[16 + i * 9 + 8] = 4;
  beginSourceExport(root);
  publishSourceExport(root, {...oldManifest, quarryTrail: {samples: []}}, terrain);

  const bake = () => runNode(root, 'bake-terrain-transitions.mjs');
  const cached = 'Terrain transition masks unchanged';
  assert.ok(JSON.parse(bake()).boundaryPixels > 0);
  const report = path.join(root, 'Saved/terrain-transitions.json');
  const original = fs.readFileSync(report, 'utf8');
  assert.equal(bake(), cached);
  const physical = path.join(root, 'Content/NativeData/terrain-blend.bin');
  const maskHash = digest(fs.readFileSync(physical));
  fs.truncateSync(physical, 16);
  assert.equal(fs.readFileSync(report, 'utf8'), original);
  assert.notEqual(bake(), cached);
  assert.equal(digest(fs.readFileSync(physical)), maskHash);
  assert.equal(fs.readFileSync(report, 'utf8'), original);

  const hashes = JSON.parse(original).outputSHA256;
  assert.equal(Object.keys(hashes).length, 5);
  for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.join(root, file))), hash);
  const visual = path.join(root, 'SourceAssets/TerrainBlendA.tga');
  const altered = fs.readFileSync(visual);
  altered[altered.length - 1] ^= 1;
  fs.writeFileSync(visual, altered);
  assert.notEqual(bake(), cached);
  assert.equal(digest(fs.readFileSync(visual)), hashes['SourceAssets/TerrainBlendA.tga']);
  assert.equal(bake(), cached);
}));

test('package-only requires the current completed import and terrain mask', () => withProject(root => {
  const flags = ['-SkipBuild', '-Package'];
  const receipt = path.join(root, 'Saved/import-complete.json');
  const mask = path.join(root, 'Content/NativeData/terrain-blend.bin');
  fs.writeFileSync(path.join(root, 'Content/Maps/ProvingGround.umap'), 'old imported map');
  fs.writeFileSync(mask, 'old imported mask');
  const terrainBlendSHA256 = createHash('sha256').update(fs.readFileSync(mask)).digest('hex');
  beginSourceExport(root);
  publishSourceExport(root, oldManifest, oldTerrain);
  const previous = checkReuse(root);
  beginSourceExport(root);
  publishSourceExport(root, newManifest, newTerrain);
  const current = checkReuse(root);
  assert.notEqual(previous, current);
  fs.writeFileSync(receipt, JSON.stringify({complete: true, meshes: 1}));
  checkBuildRejected(root, flags, /No completed asset import for this source export/);
  fs.writeFileSync(receipt, JSON.stringify({complete: true, sourceExportSHA256: previous, terrainBlendSHA256}));
  checkBuildRejected(root, flags, /No completed asset import for this source export/);
  fs.writeFileSync(receipt, JSON.stringify({complete: true, sourceExportSHA256: current, terrainBlendSHA256}));
  fs.writeFileSync(mask, 'another generation of the mask');
  checkBuildRejected(root, flags, /Terrain mask differs from the completed asset import/);
  fs.writeFileSync(mask, 'old imported mask');
  checkBuildRejected(root, flags, /Vehicle collision bake differs from the completed asset import/);
}));

test('skip cook reuses only the Windows tree recorded by the successful cook', () => withProject(root => {
  copyTools(root, [...collisionBakers, 'tire-carcass-materials.py']);
  publishVehicle(root, 0);
  for (const script of collisionBakers) runNode(root, script);
  const importHash = recordFixtureImport(root);
  fs.writeFileSync(path.join(root, 'Tools/garden-geology.mjs'), '');
  const engine = path.join(root, 'Test Engine');
  const batch = path.join(engine, 'Engine/Build/BatchFiles');
  const cookedPath = path.join(root, 'Saved/Cooked/Windows');
  const map = path.join(cookedPath, 'TerraDrive/Content/ProvingGround.umap');
  const verificationLog = path.join(batch, 'calls.txt');
  const receiptFile = path.join(root, 'Saved/native-cook-complete.json');
  const recipe = path.join(root, 'Tools/tire-carcass-materials.py');
  const tireCarcassRecipeSHA256 = digest(fs.readFileSync(recipe));
  for (const dir of [batch, path.dirname(map), path.join(root, 'Saved/AutomationLogs'), path.join(root, 'Build/Windows')]) {
    fs.mkdirSync(dir, {recursive: true});
  }
  fs.writeFileSync(map, 'fresh map data');
  fs.writeFileSync(path.join(root, 'Build/Windows/TerraDrive.exe'), '');
  fs.writeFileSync(path.join(batch, 'RunUAT.bat'), [
    '@echo off',
    'echo %*>>"%~dp0calls.txt"',
    'echo cook succeeded>"%uebp_LogFolder%\\Cook-test.txt"',
    'exit /b 0',
  ].join('\r\n') + '\r\n');

  const flags = ['-EngineRoot', engine, '-SkipBuild', '-Package'];
  const reuse = [...flags, '-SkipCook'];
  fs.writeFileSync(receiptFile, JSON.stringify({assetImportSHA256: importHash}));
  checkBuildRejected(root, reuse, /The tire material recipe differs from the completed cook/);
  fs.writeFileSync(receiptFile, JSON.stringify({assetImportSHA256: '0'.repeat(64), tireCarcassRecipeSHA256}));
  checkBuildRejected(root, reuse, /requires a successful prior cook for this asset import/);
  // The asset refresh was already completed for this import. Exercise recook
  // and staging without launching an editor in this receipt-only fixture.
  fs.writeFileSync(receiptFile, JSON.stringify({assetImportSHA256: importHash, tireCarcassRecipeSHA256}));
  const full = runBuild(root, flags);
  assert.equal(full.status, 0, full.stderr);
  const receipt = fs.readFileSync(receiptFile, 'utf8');
  const parsed = JSON.parse(receipt.replace(/^\uFEFF/, ''));
  assert.equal(parsed.assetImportSHA256, importHash);
  assert.equal(parsed.tireCarcassRecipeSHA256, tireCarcassRecipeSHA256);
  const matched = runBuild(root, reuse);
  assert.equal(matched.status, 0, matched.stderr);
  const calls = fs.readFileSync(verificationLog, 'utf8');
  assert.match(calls, / -cook /);
  assert.match(calls, / -skipcook /);

  fs.renameSync(cookedPath, path.join(root, 'Saved/complete-cook'));
  fs.mkdirSync(path.dirname(map), {recursive: true});
  fs.writeFileSync(map, 'stale map data'); // Same paths and sizes as the completed cook.
  assert.equal(fs.readFileSync(receiptFile, 'utf8'), receipt);
  checkBuildRejected(root, reuse, /The cooked Windows tree differs from the completed cook/);
  assert.equal(fs.readFileSync(verificationLog, 'utf8'), calls);
  assert.match(parsed.cookedTreeSHA256, /^[a-f0-9]{64}$/);
}));

test('matching import and cook receipts cannot package old tire catalogs or probe versions', () => withProject(root => {
  copyTools(root, collisionBakers);
  publishVehicle(root, 0);
  for (const script of collisionBakers) runNode(root, script);
  const relative = 'TerraDrive/Content/ProvingGround.umap';
  const cooked = path.join(root, 'Saved/Cooked/Windows', relative);
  fs.mkdirSync(path.dirname(cooked), {recursive: true});
  fs.writeFileSync(cooked, 'cooked map');
  const cookedTreeSHA256 = digest(relative + ':' + digest('cooked map'));
  const flags = ['-EngineRoot', path.join(root, 'unused engine'), '-SkipBuild', '-Package'];
  function rejectPackage(reason) {
    const assetImportSHA256 = recordFixtureImport(root, 2);
    fs.writeFileSync(path.join(root, 'Saved/native-cook-complete.json'), JSON.stringify({assetImportSHA256, cookedTreeSHA256}));
    checkBuildRejected(root, flags, reason);
    checkBuildRejected(root, [...flags, '-SkipCook'], reason);
  }
  rejectPackage(/vehicle-tire-probes\.json must use version 3/);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SourceAssets/import.json')));
  manifest.vehicles[0].tireFits = [{stage: 1, diameterInches: 39, liftM: .03}];
  beginSourceExport(root);
  publishSourceExport(root, manifest, oldTerrain);
  rejectPackage(/Incompatible tire fit catalog for truck at stage 1/);
}));

test('the full exporter recovers from a truncated legacy import manifest', {timeout: 620000}, () => withProject(root => {
  const project = path.join(root, 'TerraDriveUnreal');
  fs.mkdirSync(path.join(project, 'SourceAssets'), {recursive: true});
  const links = [
    [path.join(repo, 'TerraDrive-v1.13'), path.join(root, 'TerraDrive-v1.13')],
    [tools, path.join(project, 'Tools')],
    [path.join(repo, 'TerraDriveUnreal/Vendor'), path.join(project, 'Vendor')],
  ];
  const created = [];
  try {
    for (const [target, link] of links) {
      fs.symlinkSync(target, link, 'junction');
      created.push(link);
    }
    const manifest = path.join(project, 'SourceAssets/import.json');
    fs.writeFileSync(manifest, '{"materials":[{"id":"M_007"');
    const tireCache = path.join(project, 'Saved/ExpandedRosterFidelity/TireFit/wrangler_rubicon_body.json');
    fs.mkdirSync(path.dirname(tireCache), {recursive: true});
    fs.writeFileSync(tireCache, '{"version":2,');
    const result = spawnSync(process.execPath, ['--preserve-symlinks-main', path.join(project, 'Tools/export-source.mjs')],
      {encoding: 'utf8', timeout: 600000});
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Ignoring incomplete JSON.*import\.json/);
    assert.match(result.stderr, /Ignoring incomplete JSON.*wrangler_rubicon_body\.json/);
    assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).routes.length, 18);
    const terrain = fs.readFileSync(path.join(project, 'Content/NativeData/terrain.bin'));
    assert.equal(terrain.length, 16 + 1601 * 1601 * 9);
    assert.equal(terrain.readUInt32LE(0), 0x54445256);
    const exportHash = verifySourceExport(project);
    assert.match(exportHash, /^[a-f0-9]{64}$/);
  } finally {
    for (const link of created) fs.unlinkSync(link);
  }
}));

for (const file of ['SourceAssets/import.json', 'Content/NativeData/world.json', 'Content/NativeData/terrain.bin']) {
  test(`reuse rejects a different ${path.basename(file)} even with a completion record`, () => withProject(root => {
    beginSourceExport(root);
    publishSourceExport(root, oldManifest, oldTerrain);
    fs.appendFileSync(path.join(root, file), '\n');
    checkReuse(root, /differs from the completed export/);
  }));
}
