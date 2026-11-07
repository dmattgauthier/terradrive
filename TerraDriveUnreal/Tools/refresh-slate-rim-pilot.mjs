// Apply the pilot to a native export that still has its original scatter.
// Use the full exporter to regenerate an already-applied pilot.
import fs from 'node:fs';
import path from 'node:path';
import {applySlateRimPilot} from './slate-rim-pilot.mjs';

const project=path.resolve(import.meta.dirname,'..');
const file=path.join(project,'SourceAssets/import.json');
const data=path.join(project,'Content/NativeData');
const world=path.join(data,'world.json');
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const {assets,materials,...scene}=manifest;
if(!assets||!materials||JSON.stringify(scene)!==JSON.stringify(JSON.parse(fs.readFileSync(world,'utf8'))))
  throw Error('The import and native world manifests must describe the same base scene');
const field=fs.readFileSync(path.join(data,'terrain.bin'));
const report=applySlateRimPilot(manifest,field);
fs.writeFileSync(file,JSON.stringify(manifest));
fs.writeFileSync(world,JSON.stringify({...manifest,assets:undefined,materials:undefined}));
console.log(JSON.stringify(report));
