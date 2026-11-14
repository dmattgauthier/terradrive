import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  const {assets, vehicles} = JSON.parse(read('SourceAssets/import.json'));
  const byName = new Map(assets.map(asset => [asset.name, asset]));
  const bodyAssets = vehicles.map(vehicle => byName.get(vehicle.asset + '_body'));
  const files = ['vehicle-ground-probes.json', 'vehicle-collision.json'];
  const hashes = files.map(file => {
    const bytes = read('Content/NativeData/' + file);
    const baked = JSON.parse(bytes).vehicles;
    if (!vehicles.length || baked?.length !== vehicles.length) {
      throw new Error(`${file} does not cover the exported vehicle roster`);
    }
    for (const [index, vehicle] of vehicles.entries()) {
      const row = baked[index], asset = bodyAssets[index];
      if (row?.index !== index || row.id !== vehicle.id || row.asset !== asset?.name ||
          !/^[0-9a-f]{64}$/.test(asset?.sha256) || row.objSha256 !== asset.sha256) {
        throw new Error(`${file} does not match the exported body for ${vehicle.id}`);
      }
    }
    return digest(bytes);
  });
  console.log(digest(hashes.join('\n')));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
