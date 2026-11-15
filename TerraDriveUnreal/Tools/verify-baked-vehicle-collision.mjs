import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const inRange = (value, min, max) => typeof value === 'number' && value >= min && value <= max;

function verifyTireCatalog(vehicles) {
  const world = JSON.parse(read('Content/NativeData/world.json'));
  if (!Array.isArray(vehicles) || !vehicles.length || !isDeepStrictEqual(world.vehicles, vehicles)) {
    throw new Error('The runtime world and import manifest must use the same vehicle roster and tire catalog');
  }
  for (const vehicle of vehicles) {
    const {id, tireRadius, tireFits} = vehicle;
    if (!Number.isFinite(tireRadius) || tireRadius <= 0 || !Array.isArray(tireFits) || tireFits.length > 26) {
      throw new Error(`Missing compatible tire fit catalog for ${id}`);
    }
    let previousDiameter = tireRadius / .0127;
    for (const [index, fit] of tireFits.entries()) {
      if (!fit || fit.stage !== index + 1 || !Number.isInteger(fit.diameterInches) ||
          !inRange(fit.diameterInches, 25, 50) || fit.diameterInches <= previousDiameter ||
          !Number.isInteger(fit.minimumSuspensionStage) || !inRange(fit.minimumSuspensionStage, 1, 3) ||
          typeof fit.bodyAsset !== 'string' || fit.liftM !== 0 || !inRange(fit.trackExtraM, 0, .65) ||
          !inRange(fit.maximumBumpFrontM, .055, 1) || !inRange(fit.maximumBumpRearM, .055, 1) ||
          !inRange(fit.maximumSteeringDegrees, 18, 34)) {
        throw new Error(`Incompatible tire fit catalog for ${id} at stage ${index + 1}`);
      }
      previousDiameter = fit.diameterInches;
    }
  }
}

function verifyTireProbes(vehicles, byName) {
  const file = 'vehicle-tire-probes.json';
  const data = JSON.parse(read('Content/NativeData/' + file));
  if (data.version !== 3 || !Array.isArray(data.vehicles) || data.vehicles.length !== vehicles.length) {
    throw new Error(`${file} must use version 3 and cover the exported vehicle roster`);
  }
  for (const [index, vehicle] of vehicles.entries()) {
    const row = data.vehicles[index];
    const radii = [vehicle.tireRadius, ...vehicle.tireFits.map(fit => fit.diameterInches * .0127)];
    if (row?.id !== vehicle.id || !Array.isArray(row.stages) || row.stages.length !== radii.length) {
      throw new Error(`${file} does not cover the exported tire fits for ${vehicle.id}`);
    }
    for (const [stage, radius] of radii.entries()) {
      const name = vehicle.asset + (stage === 0 ? '_tire' : `_tire_size${stage}_0`);
      const asset = byName.get(name), probe = row.stages[stage];
      if (probe?.stage !== stage || probe.asset !== name || !isHash(asset?.sha256) || probe.sha256 !== asset.sha256 ||
          probe.radiusM !== radius || !Array.isArray(probe.pointsCm) || !inRange(probe.pointsCm.length, 24, 96) ||
          !probe.pointsCm.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))) {
        throw new Error(`${file} does not match the exported tire mesh ${name}`);
      }
    }
  }
}

try {
  const {assets, vehicles} = JSON.parse(read('SourceAssets/import.json'));
  verifyTireCatalog(vehicles);
  const byName = new Map(assets.map(asset => [asset.name, asset]));
  const bodyAssets = vehicles.map(vehicle => byName.get(vehicle.asset + '_body'));
  const variants = vehicles.flatMap((vehicle,index)=>
    [...new Set(vehicle.tireFits.map(fit=>fit.bodyAsset).filter(Boolean))].map(name=>({index,vehicle,name})));
  const files = ['vehicle-ground-probes.json', 'vehicle-collision.json'];
  const hashes = files.map(file => {
    const bytes = read('Content/NativeData/' + file);
    const {vehicles:baked, variants:bakedVariants=[]} = JSON.parse(bytes);
    if (!vehicles.length || baked?.length !== vehicles.length) {
      throw new Error(`${file} does not cover the exported vehicle roster`);
    }
    for (const [index, vehicle] of vehicles.entries()) {
      const row = baked[index], asset = bodyAssets[index];
      if (row?.index !== index || row.id !== vehicle.id || row.asset !== asset?.name ||
          !isHash(asset?.sha256) || row.objSha256 !== asset.sha256) {
        throw new Error(`${file} does not match the exported body for ${vehicle.id}`);
      }
    }
    if (bakedVariants.length !== variants.length) {
      throw new Error(file+' does not cover the exported tire-clearance variants');
    }
    for (const {index,vehicle,name} of variants) {
      const row = bakedVariants.find(item=>item.asset===name), asset = byName.get(name);
      if (row?.index !== index || row.id !== vehicle.id ||
          !isHash(asset?.sha256) || row.objSha256 !== asset.sha256) {
        throw new Error(file+' does not match the exported clearance body for '+name);
      }
    }
    return digest(bytes);
  });
  verifyTireProbes(vehicles, byName);
  console.log(digest(hashes.join('\n')));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
