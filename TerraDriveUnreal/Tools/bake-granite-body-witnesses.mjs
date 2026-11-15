import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const root=path.resolve(import.meta.dirname,'..');
const sources=path.join(root,'SourceAssets');
const target=path.resolve(process.argv[2]??path.join(root,'Saved','granite-body-witnesses.json'));
const manifest=JSON.parse(fs.readFileSync(path.join(sources,'import.json'),'utf8'));
const meshes=new Map(manifest.assets.map(asset=>[asset.name,asset.sha256]));
const bodies=new Set(manifest.vehicles.flatMap(vehicle=>[
  vehicle.asset+'_body',...vehicle.tireFits.map(fit=>fit.bodyAsset)
]));
const spacingCM=4;

// The package's welded coachwork reports the same hash. Keep the helper data
// outside the game cook so the headless test also works against a reference build.
const profiles={};
for(const body of bodies){
  const hash=createHash('sha256');
  const stream=fs.createReadStream(path.join(sources,body+'.obj'));
  stream.on('data',bytes=>hash.update(bytes));
  const vertices=[],points=[],occupied=new Set();
  const add=(x,y,z)=>{
    if(z>110)return;
    const cell=[x,y,z].map(value=>Math.round(value/spacingCM)).join('/');
    if(occupied.has(cell))return;
    occupied.add(cell);
    points.push([x,y,z].map(value=>Math.round(value*10)/10));
  };
  for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
    if(line.startsWith('v ')){
      const [x,y,z]=line.slice(2).split(/\s+/).map(Number);
      // OBJ Y is reflected by Interchange. Keep the final mesh-local basis.
      assert.ok([x,y,z].every(Number.isFinite),body+' has finite mesh positions');
      vertices.push([x,-y,z]);
    }else if(line.startsWith('f ')){
      const [a,b,c]=line.slice(2).split(/\s+/).map(value=>vertices[parseInt(value,10)-1]);
      assert.ok(a&&b&&c,body+' has triangulated authored geometry');
      if(Math.min(a[2],b[2],c[2])>110)continue;
      const delta=(p,q)=>p.map((v,i)=>v-q[i]);
      const ab=delta(b,a),ac=delta(c,a),bc=delta(c,b);
      const divisions=Math.min(80,Math.max(1,Math.ceil(
        Math.max(Math.hypot(...ab),Math.hypot(...ac),Math.hypot(...bc))/spacingCM)));
      for(let u=0;u<=divisions;++u)for(let v=0;v<=divisions-u;++v){
        add(a[0]+(ab[0]*u+ac[0]*v)/divisions,a[1]+(ab[1]*u+ac[1]*v)/divisions,
          a[2]+(ab[2]*u+ac[2]*v)/divisions);
      }
    }
  }
  const sha256=hash.digest('hex');
  assert.equal(sha256,meshes.get(body),body+' matches the exported asset hash');
  assert.ok(points.length>100&&points.length<100000,body+' has bounded clearance coverage');
  profiles[body]={sha256,points};
}
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify({version:1,spacingCM,profiles}));
console.log(JSON.stringify({generated:target,bodies:bodies.size,points:Object.values(profiles).reduce((n,p)=>n+p.points.length,0)}));
