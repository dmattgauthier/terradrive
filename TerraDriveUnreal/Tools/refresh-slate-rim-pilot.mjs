// Finish Slate Rim in either a pristine native export or an applied pilot.
// Use the full exporter to regenerate an already-finished trail.
import fs from 'node:fs';
import path from 'node:path';
import {applySlateRimExtension,applySlateRimPilot} from './slate-rim-pilot.mjs';
import {beginSourceExport,publishSourceExport,verifySourceExport} from './source-export-state.mjs';

const project=path.resolve(import.meta.dirname,'..');
const file=path.join(project,'SourceAssets/import.json');
const data=path.join(project,'Content/NativeData');
const world=path.join(data,'world.json');
// The supported pre-pilot export predates challenge terrain and the record.
verifySourceExport(project,{allowLegacy:true});
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const {assets,materials,...scene}=manifest;
if(!assets||!materials||JSON.stringify(scene)!==JSON.stringify(JSON.parse(fs.readFileSync(world,'utf8'))))
  throw Error('The import and native world manifests must describe the same base scene');
const field=fs.readFileSync(path.join(data,'terrain.bin'));
if(!manifest.slateRimPilot)applySlateRimPilot(manifest,field);
const report=applySlateRimExtension(manifest,field);
beginSourceExport(project);
publishSourceExport(project,manifest,field);
console.log(JSON.stringify(report));
