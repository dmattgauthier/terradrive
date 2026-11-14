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

function withProject(run) {
  const scratch = fs.mkdtempDisposableSync(path.join(os.tmpdir(), 'terra-export-test-'));
  try {
    for (const dir of ['Tools', 'SourceAssets', 'Content/NativeData', 'Content/Maps', 'Saved']) {
      fs.mkdirSync(path.join(scratch.path, dir), {recursive: true});
    }
    for (const file of ['source-export-state.mjs', 'verify-source-export.mjs', 'build-native.ps1']) {
      fs.copyFileSync(path.join(tools, file), path.join(scratch.path, 'Tools', file));
    }
    run(scratch.path);
  } finally {
    const resolved = fs.realpathSync(scratch.path);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(resolved), /^terra-export-test-/);
    scratch.remove();
  }
}

function checkReuse(root, expectedFailure) {
  const result = spawnSync(process.execPath, [path.join(root, 'Tools/verify-source-export.mjs')], {encoding: 'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, expectedFailure ? 1 : 0, result.stderr);
  assert.match(expectedFailure ? result.stderr : result.stdout,
    expectedFailure ?? /^[a-f0-9]{64}\r?\n$/);
  return result.stdout.trim();
}

function checkBuildRejected(root, flags, ...reasons) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'Tools/build-native.ps1'), ...flags
  ], {encoding: 'utf8', timeout: 30000});
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  for (const reason of reasons) assert.match(result.stderr, reason);
}

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

test('package-only requires the current completed import and terrain mask', () => withProject(root => {
  const flags = ['-SkipBuild', '-Package'];
  const receipt = path.join(root, 'Saved/import-complete.json');
  const mask = path.join(root, 'Content/NativeData/terrain-blend.bin');
  fs.writeFileSync(path.join(root, 'Content/Maps/ProvingGround.umap'), 'old imported map');
  for (const file of ['vehicle-ground-probes.json', 'vehicle-collision.json', 'vehicle-tire-probes.json']) {
    fs.writeFileSync(path.join(root, 'Content/NativeData', file), '{}');
  }
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
  fs.mkdirSync(path.join(root, 'Saved/Cooked/Windows'), {recursive: true});
  fs.writeFileSync(path.join(root, 'Saved/native-cook-complete.json'), JSON.stringify({assetImportSHA256: '0'.repeat(64)}));
  fs.writeFileSync(path.join(root, 'Tools/garden-geology.mjs'), '');
  checkBuildRejected(root, [...flags, '-SkipCook'], /requires a successful prior cook for this asset import/);
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
