import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const stateFile = 'SourceAssets/export-state.json';
const pendingFile = 'SourceAssets/export-in-progress';
const importFile = 'SourceAssets/import.json';
const worldFile = 'Content/NativeData/world.json';
const terrainFile = 'Content/NativeData/terrain.bin';

function digest(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export function beginSourceExport(root) {
  fs.writeFileSync(path.join(root, pendingFile), '');
}

function replaceExportFile(destination, contents, stagingDirectory = path.dirname(destination)) {
  const pending = path.join(stagingDirectory, `${path.basename(destination)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(pending, contents);
    fs.renameSync(pending, destination);
  } finally {
    fs.rmSync(pending, {force: true});
  }
}

export function publishSourceExport(root, manifest, terrain) {
  const {assets, materials, ...world} = manifest;
  const exported = {[importFile]: JSON.stringify(manifest), [worldFile]: JSON.stringify(world), [terrainFile]: terrain};
  // Replace whole files so a retry can still read the previous material IDs.
  // Keep temporary files outside NativeData so a cook cannot stage them.
  const hashes = {};
  for (const [file, contents] of Object.entries(exported)) {
    const stagingDirectory = file === importFile ? path.join(root, 'SourceAssets') : path.join(root, 'Content');
    replaceExportFile(path.join(root, file), contents, stagingDirectory);
    hashes[file] = digest(contents);
  }
  replaceExportFile(path.join(root, stateFile), JSON.stringify(hashes) + '\n');
  fs.unlinkSync(path.join(root, pendingFile));
}

export function verifySourceExport(root, {allowLegacy = false} = {}) {
  try {
    const pending = path.join(root, pendingFile);
    if (fs.existsSync(pending)) throw new Error('the last export did not complete');
    const record = path.join(root, stateFile);
    if (allowLegacy && !fs.existsSync(record)) return;
    const recordContents = fs.readFileSync(record, 'utf8');
    const files = JSON.parse(recordContents);
    for (const file of [importFile, worldFile, terrainFile]) {
      if (files[file] !== digest(fs.readFileSync(path.join(root, file)))) throw new Error(`${file} differs from the completed export`);
    }
    if (fs.existsSync(pending)) throw new Error('a new export started during verification');
    return digest(recordContents);
  } catch (error) {
    throw new Error(`Cannot reuse native source export: ${error.message}. Run node Tools/export-source.mjs to regenerate it.`);
  }
}
