// Verify the retired destination cannot be regenerated or packaged by source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),checks=[];
const check=(name,pass)=>{checks.push({name,pass});assert.ok(pass,name);};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const p of ['Content/Maps/WinterExpedition.umap','Content/AutomotiveWinterScene/Maps','Content/WinterGameplay','Content/NativeData/winter-level.json','Source/TerraDrive/TerraWinter.cpp','Source/TerraDrive/TerraWinter.h','Source/TerraDrive/TerraWinterValidation.cpp','Source/TerraDrive/TerraWinterValidation.h','Tools/winter-level.py','Tools/winter-survey.py'])check('removed '+p,!fs.existsSync(path.join(root,p)));
const game=read('Config/DefaultGame.ini');
check('one proving-ground map is explicitly cooked',(game.match(/^\+MapsToCook=/gm)||[]).length===1&&game.includes('/Game/Maps/ProvingGround'));
check('retired destination absent from packaging settings',!/WinterExpedition|WinterGameplay|IceRoad/.test(game));
for(const p of ['Source/TerraDrive/TerraWorld.cpp','Source/TerraDrive/TerraVehicle.cpp','Source/TerraDrive/TerraGarage.cpp','Source/TerraDrive/TerraGameMode.cpp'])check('no retired runtime/travel hooks in '+p,!/TerraWinter|WINTER EXPEDITION|Winter \/ proving ground/.test(read(p)));
check('asset importer cannot recreate the destination',!read('Tools/import-assets.py').includes('winter-level.py'));
check('standalone verifier cannot invoke retired map mode',!read('Tools/verify-winter.ps1').includes('TerraWinterOnly'));
for(const p of ['Content/AutomotiveWinterScene/Megascans/Surfaces','Content/AutomotiveWinterScene/Megascans/3D_Assets'])check('shared acquired winter detail remains '+p,fs.existsSync(path.join(root,p)));
const report={revision:16,checks:checks.length,pass:true,tests:checks,scope:'Source and installed Content; cooked package absence must be checked after a fresh cook.'};
fs.writeFileSync(path.join(root,'docs/proving-ground-only-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,checks:checks.length}));
