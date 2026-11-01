// Native-only dense source for the existing CC0 geology. Browser source and
// terrain.bin remain the recovery reference; render/collision use this field
// only through the bounded shaping in TerraGroundGrid.h.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Terrain} from '../../TerraDrive-v1.13/dist/src/terrain.js';
import {TerrainGeology} from '../../TerraDrive-v1.13/dist/src/terrain-geology.js';
export function buildGardenGeology(directory){
 const rows=769,columns=641,step=25,originX=3200,originY=-19200;
 const terrain=Object.create(Terrain.prototype);terrain.geology=new TerrainGeology();
 const bytes=Buffer.alloc(24+rows*columns*4);
 [0x54444733,rows,columns].forEach((value,index)=>bytes.writeUInt32LE(value,index*4));
 [step,originX,originY].forEach((value,index)=>bytes.writeFloatLE(value,12+index*4));
 for(let row=0;row<rows;++row)for(let column=0;column<columns;++column){
  const height=terrain._baseHeight(-(originY+column*step)/100,(originX+row*step)/100)*100;
  if(!Number.isFinite(height))throw Error('Nonfinite garden geology');
  bytes.writeFloatLE(height,24+(row*columns+column)*4);
 }
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'garden-geology.bin'),bytes);
 const report={version:3,source:'https://polyhaven.com/a/rock_moss_set_01',license:'CC0-1.0',rows,columns,stepCM:step,
  originCM:[originX,originY],bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  bounds:'Runtime correction feathered to six existing rock groups, +45cm fill / -10cm cut; original terrain.bin preserved'};
 fs.writeFileSync(path.join(directory,'garden-geology.json'),JSON.stringify(report,null,2)+'\n');return report;
}
export function validateGardenGeology(directory){
 const bytes=fs.readFileSync(path.join(directory,'garden-geology.bin'));
 const report=JSON.parse(fs.readFileSync(path.join(directory,'garden-geology.json'),'utf8'));
 assert.equal(bytes.length,24+769*641*4);assert.equal(bytes.readUInt32LE(0),0x54444733);
 assert.equal(bytes.readUInt32LE(4),769);assert.equal(bytes.readUInt32LE(8),641);
 assert.equal(bytes.readFloatLE(12),25);assert.equal(bytes.readFloatLE(16),3200);assert.equal(bytes.readFloatLE(20),-19200);
 assert.equal(report.version,3);assert.equal(report.source,'https://polyhaven.com/a/rock_moss_set_01');assert.equal(report.license,'CC0-1.0');
 assert.equal(report.bytes,bytes.length);assert.equal(report.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.equal(report.rows,769);assert.equal(report.columns,641);assert.equal(report.stepCM,25);assert.deepEqual(report.originCM,[3200,-19200]);
 for(let offset=24;offset<bytes.length;offset+=4)assert.ok(Number.isFinite(bytes.readFloatLE(offset)),'finite source profile');
 const terrain=Object.create(Terrain.prototype);terrain.geology=new TerrainGeology();
 for(let sample=0;sample<4096;++sample){const row=(sample*383+19)%769,column=(sample*701+31)%641;
  const expected=Math.fround(terrain._baseHeight(-(-19200+column*25)/100,(3200+row*25)/100)*100);
  assert.equal(bytes.readFloatLE(24+(row*641+column)*4),expected,'source profile is the acquired analytical geology');
 }
 return {samples:4096,vertices:769*641,sha256:report.sha256,bytes:bytes.length,pass:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=process.argv[2]||fileURLToPath(new URL('../Content/NativeData/',import.meta.url));
 console.log(JSON.stringify({source:buildGardenGeology(directory),validation:validateGardenGeology(directory)}));
}
