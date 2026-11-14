import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {beginSourceExport, publishSourceExport} from './source-export-state.mjs';

const tools = import.meta.dirname;
const oldTerrain = Buffer.from('field before Granite');
const newTerrain = Buffer.from('field with Granite relief and paint');
const oldManifest = {assets: [], materials: [], routes: [{name: 'Boreal'}]};
const newManifest = {...oldManifest, routes: [...oldManifest.routes, {name: 'Granite'}]};

function withProject(run) {
  const scratch = fs.mkdtempDisposableSync(path.join(os.tmpdir(), 'terra-export-test-'));
  try {
    for (const dir of ['Tools', 'SourceAssets', 'Content/NativeData']) {
      fs.mkdirSync(path.join(scratch.path, dir), {recursive: true});
    }
    for (const file of ['source-export-state.mjs', 'build-native.ps1']) {
      fs.copyFileSync(path.join(tools, file), path.join(scratch.path, 'Tools', file));
    }
    run(scratch.path);
  } finally {
    scratch.remove();
  }
}

function checkReuse(root, expectedFailure) {
  const result = spawnSync(process.execPath, [path.join(root, 'Tools/source-export-state.mjs')], {encoding: 'utf8'});
  assert.ifError(result.error);
  assert.equal(result.status, expectedFailure ? 1 : 0, result.stderr);
  assert.match(expectedFailure ? result.stderr : result.stdout,
    expectedFailure ?? /Native terrain and both manifests match the completed export/);
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
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'Tools/build-native.ps1'), ...flags
    ], {encoding: 'utf8', timeout: 30000});
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /the last export did not complete/);
    assert.match(result.stderr, /Native source export verification failed/);
  }
  beginSourceExport(root);
  publishSourceExport(root, newManifest, newTerrain);
  checkReuse(root);
}));

for (const file of ['SourceAssets/import.json', 'Content/NativeData/world.json', 'Content/NativeData/terrain.bin']) {
  test(`reuse rejects a different ${path.basename(file)} even with a completion record`, () => withProject(root => {
    beginSourceExport(root);
    publishSourceExport(root, oldManifest, oldTerrain);
    fs.appendFileSync(path.join(root, file), '\n');
    checkReuse(root, /differs from the completed export/);
  }));
}
